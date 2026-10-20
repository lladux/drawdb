"""Workspace passwords and the tokens a client gets after unlocking one."""

import hashlib
import hmac
import secrets
import time

from fastapi import Request

TOKEN_HEADER = "X-Workspace-Tokens"
TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

# scrypt parameters; about 16 MB of memory per hash.
_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    candidate = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=_N, r=_R, p=_P, dklen=32
    )
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
