import axios from "axios";
import { backendUrl as baseUrl } from "../config";

// Optional workspace passwords. The server can turn them off
// (AUTH_ENABLED=false); then no workspace is ever locked and the UI hides the
// password options.

const TOKENS_KEY = "drawdb.workspaceTokens";

// Tokens for unlocked workspaces, keyed by workspace id. The server accepts a
// list of them in one header and checks the one for the workspace involved.
function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeTokens(tokens) {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    return;
  }
}

export function setToken(workspaceId, token) {
  const tokens = readTokens();
  if (token) tokens[workspaceId] = token;
  else delete tokens[workspaceId];
  writeTokens(tokens);
}

export function authHeaders() {
  const tokens = Object.values(readTokens());
  return tokens.length ? { "X-Workspace-Tokens": tokens.join(",") } : {};
}

// The workspace a 401 response says is locked, if that is why it failed.
export function lockedWorkspaceId(error) {
  if (error?.response?.status !== 401) return null;
  return error.response.data?.workspaceId ?? null;
}

let authEnabledRequest = null;

// Whether the server has workspace passwords turned on. Servers that predate
// GET /config always have them.
export function isAuthEnabled() {
  authEnabledRequest ??= axios
    .get(`${baseUrl}/config`)
    .then((res) => res.data.data?.auth !== false)
    .catch((e) => {
      authEnabledRequest = null;
      if (e.response?.status === 404) return true;
      throw e;
    });
  return authEnabledRequest;
}

// Resolves to false on a wrong password.
export async function unlock(workspaceId, password) {
  try {
    const res = await axios.post(
      `${baseUrl}/workspaces/${workspaceId}/unlock`,
      { password },
    );
    setToken(workspaceId, res.data.token);
    return true;
  } catch (e) {
    if (e.response?.status === 401) return false;
    throw e;
  }
}

export function lock(workspaceId) {
  setToken(workspaceId, null);
}
