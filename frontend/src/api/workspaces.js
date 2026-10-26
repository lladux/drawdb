import axios from "axios";
import { backendUrl as baseUrl } from "../config";
import { authHeaders, setToken } from "./auth";

const LAST_WORKSPACE_KEY = "drawdb.lastWorkspace";

export function getLastWorkspace() {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function setLastWorkspace(workspaceId) {
  try {
    if (workspaceId) localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
    else localStorage.removeItem(LAST_WORKSPACE_KEY);
  } catch {
    return;
  }
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
  if (getLastWorkspace() === workspaceId) setLastWorkspace(null);
}

export async function listDiagrams(workspaceId) {
  const res = await axios.get(`${baseUrl}/workspaces/${workspaceId}/diagrams`, {
    headers: authHeaders(),
  });

  return res.data.data;
}
