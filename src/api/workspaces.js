import axios from "axios";
import { backendUrl as baseUrl } from "../config";

const TOKENS_KEY = "drawdb.workspaceTokens";
const LAST_WORKSPACE_KEY = "drawdb.lastWorkspace";

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

export function getLastWorkspace() {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function setLastWorkspace(workspaceId) {
  try {
    localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
  } catch {
    return;
  }
}

// The workspace a 401 response says is locked, if that is why it failed.
export function lockedWorkspaceId(error) {
  if (error?.response?.status !== 401) return null;
  return error.response.data?.workspaceId ?? null;
}

export async function list() {
  const res = await axios.get(`${baseUrl}/workspaces`, {
    headers: authHeaders(),
  });

  return res.data.data;
}

export async function create(name, password) {
  const res = await axios.post(`${baseUrl}/workspaces`, {
    name,
    password: password || null,
  });
  if (res.data.token) setToken(res.data.data.id, res.data.token);

  return res.data.data;
}

// Pass password as undefined to keep it, "" to remove it.
export async function update(workspaceId, { name, password }) {
  const res = await axios.patch(
    `${baseUrl}/workspaces/${workspaceId}`,
    { name, password },
    { headers: authHeaders() },
  );
  if (password !== undefined) setToken(workspaceId, res.data.token);

  return res.data.data;
}

export async function del(workspaceId) {
  await axios.delete(`${baseUrl}/workspaces/${workspaceId}`, {
    headers: authHeaders(),
  });
  setToken(workspaceId, null);
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

export async function listDiagrams(workspaceId) {
  const res = await axios.get(`${baseUrl}/workspaces/${workspaceId}/diagrams`, {
    headers: authHeaders(),
  });

  return res.data.data;
}
