import axios from "axios";
import { backendUrl as baseUrl } from "../config";

export async function list() {
  const res = await axios.get(`${baseUrl}/diagrams`);

  return res.data.data;
}

export async function get(diagramId) {
  try {
    const res = await axios.get(`${baseUrl}/diagrams/${diagramId}`);

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
  );

  return res.data.data;
}

export async function del(diagramId) {
  await axios.delete(`${baseUrl}/diagrams/${diagramId}`);
}

// Plugs the server into the editor's cloud storage hooks (see
// ExtensionsContext), so diagrams are saved to the backend's SQLite database
// instead of IndexedDB.
export const serverStorage = {
  cloudSave: (diagram) => save(diagram),
  cloudLoad: get,
  cloudList: list,
  cloudDelete: del,
};
