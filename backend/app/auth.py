"""Optional workspace passwords.

Everything about passwords lives here: hashing, the tokens a client gets after
unlocking a workspace, and the `/unlock` route. The rest of the app only asks
the access policy (`PasswordAuth` or `NoAuth`) whether a request may open a
workspace, so turning auth off with `AUTH_ENABLED=false` is a matter of
picking `NoAuth`."""

import hashlib
import hmac
import secrets
import time
from typing import Protocol

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

TOKEN_HEADER = "X-Workspace-Tokens"
TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

# scrypt parameters; about 16 MB of memory per hash.
_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
        salt_bytes = bytes.fromhex(salt)
    except ValueError:
        return False
    candidate = hashlib.scrypt(password.encode(), salt=salt_bytes, n=_N, r=_R, p=_P, dklen=32)
    return hmac.compare_digest(candidate.hex(), digest)


class TokenSigner:
    """Issues `<workspace id>.<expiry>.<signature>` tokens. The signature
    covers the workspace's password hash, so changing or removing the password
    invalidates every token issued before."""

    def __init__(self, secret: bytes, ttl: int = TOKEN_TTL_SECONDS):
        self.secret = secret
        self.ttl = ttl

    def _sign(self, workspace_id: str, expires: int, password_hash: str) -> str:
        message = f"{workspace_id}.{expires}.{password_hash}".encode()
        return hmac.new(self.secret, message, hashlib.sha256).hexdigest()

    def issue(self, workspace_id: str, password_hash: str) -> str:
        expires = int(time.time()) + self.ttl
        return f"{workspace_id}.{expires}.{self._sign(workspace_id, expires, password_hash)}"

    def is_valid(self, token: str, workspace_id: str, password_hash: str) -> bool:
        try:
            token_workspace, expires, signature = token.split(".")
            expires_at = int(expires)
        except ValueError:
            return False
        if token_workspace != workspace_id or expires_at < time.time():
            return False
        expected = self._sign(workspace_id, expires_at, password_hash)
        return hmac.compare_digest(signature, expected)


def request_tokens(request: Request) -> list[str]:
    header = request.headers.get(TOKEN_HEADER, "")
    return [t.strip() for t in header.split(",") if t.strip()]


class PasswordsDisabled(Exception):
    """A request tried to set or remove a password while auth is off."""


class WrongPassword(Exception):
    pass


class AccessPolicy(Protocol):
    enabled: bool

    def is_protected(self, password_hash: str | None) -> bool: ...

    def can_access(
        self, workspace_id: str, password_hash: str | None, tokens: list[str]
    ) -> bool: ...

    def hash(self, password: str) -> str: ...

    def check_password(self, password: str, password_hash: str) -> bool: ...

    def issue(self, workspace_id: str, password_hash: str) -> str: ...


class PasswordAuth:
    """Workspaces with a password need a token signed for that password."""

    enabled = True

    def __init__(self, signer: TokenSigner):
        self.signer = signer

    def is_protected(self, password_hash: str | None) -> bool:
        return password_hash is not None

    def can_access(self, workspace_id: str, password_hash: str | None, tokens: list[str]) -> bool:
        if password_hash is None:
            return True
        return any(self.signer.is_valid(t, workspace_id, password_hash) for t in tokens)

    def hash(self, password: str) -> str:
        return hash_password(password)

    def check_password(self, password: str, password_hash: str) -> bool:
        return verify_password(password, password_hash)

    def issue(self, workspace_id: str, password_hash: str) -> str:
        return self.signer.issue(workspace_id, password_hash)


class NoAuth:
    """Every workspace is open. Password hashes already stored are left alone,
    so turning auth back on restores them."""

    enabled = False

    def is_protected(self, password_hash: str | None) -> bool:
        return False

    def can_access(self, workspace_id: str, password_hash: str | None, tokens: list[str]) -> bool:
        return True

    def hash(self, password: str) -> str:
        raise PasswordsDisabled()

    def check_password(self, password: str, password_hash: str) -> bool:
        raise PasswordsDisabled()

    def issue(self, workspace_id: str, password_hash: str) -> str:
        raise PasswordsDisabled()


# Only included in the app when auth is enabled.
router = APIRouter(prefix="/workspaces")


class UnlockBody(BaseModel):
    password: str


@router.post("/{workspace_id}/unlock")
def unlock_workspace(request: Request, workspace_id: str, body: UnlockBody):
    try:
        token = request.app.state.workspaces.unlock(workspace_id, body.password)
    except WrongPassword:
        return JSONResponse(
            status_code=401, content={"success": False, "message": "Wrong password"}
        )
    return {"success": True, "token": token}
