import axios from "axios";
import { backendUrl as baseUrl } from "../config";
import { authHeaders, getLastWorkspace, lockedWorkspaceId } from "./workspaces";

export async function list() {
  const res = await axios.get(`${baseUrl}/diagrams`, {
    headers: authHeaders(),
  });

  return res.data.data;
}

export async function get(diagramId) {
  try {
    const res = await axios.get(`${baseUrl}/diagrams/${diagramId}`, {
      headers: authHeaders(),
    });

    return res.data.data;
  } catch (e) {
    if (e.response?.status === 404) return null;
    throw e;
  }
}

export async function save(diagram) {
  const res = await axios.put(
    `${baseUrl}/diagrams/${diagram.diagramId}`,
    diagram,
    { headers: authHeaders() },
  );

  return res.data.data;
}

export async function update(diagramId, { name, workspaceId }) {
  const res = await axios.patch(
    `${baseUrl}/diagrams/${diagramId}`,
    { name, workspaceId },
    { headers: authHeaders() },
  );

  return res.data.data;
}

export async function del(diagramId) {
  await axios.delete(`${baseUrl}/diagrams/${diagramId}`, {
    headers: authHeaders(),
  });
}

// Workspace of the diagram open in the editor, so copies land next to it.
let openWorkspaceId = null;

function workspaceForNewDiagram() {
  const fromUrl = new URLSearchParams(window.location.search).get("workspace");
  return fromUrl || openWorkspaceId || getLastWorkspace();
}

// Sends the user to the hub to type the password of a locked workspace, then
// back to where they were.
function redirectToUnlock(workspaceId) {
  const next = window.location.pathname + window.location.search;
  const params = new URLSearchParams({ unlock: workspaceId, next });
  window.location.assign(`/?${params}`);
}

// Plugs the server into the editor's cloud storage hooks (see
// ExtensionsContext), so diagrams are saved to the backend's SQLite database
// instead of IndexedDB.
export const serverStorage = {
  cloudSave: (diagram, { isNew } = {}) =>
    save(
      isNew ? { ...diagram, workspaceId: workspaceForNewDiagram() } : diagram,
    ),
  cloudLoad: async (diagramId) => {
    try {
      const diagram = await get(diagramId);
      openWorkspaceId = diagram?.workspaceId ?? null;
      return diagram;
    } catch (e) {
      const locked = lockedWorkspaceId(e);
      if (locked) {
        redirectToUnlock(locked);
        return null;
      }
      throw e;
    }
  },
  cloudList: list,
  cloudDelete: del,
};
