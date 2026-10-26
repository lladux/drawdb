import { tableFieldHeight, tableHeaderHeight } from "../data/constants";
import { autoRoute, nudgeRoutes } from "./orthogonalRouting";
import {
  getCommentHeight,
  getFieldOffsetY,
  getRelationshipFields,
  getTableHeight,
  getTableWidth,
  getVisibleFieldIndex,
  getVisibleFields,
} from "./utils";
import { getViewHeight, getViewWidth, resolveViewColumns } from "./views";

// The y where a relationship line meets a field's row.
export function fieldAnchorY(
  table,
  fieldId,
  width,
  relationships,
  showComments,
) {
  const index = getVisibleFieldIndex(table, fieldId, relationships);
  if (index < 0) return null;
  return (
    table.y +
    tableHeaderHeight +
    getCommentHeight(table.comment, width, showComments) +
    getFieldOffsetY(
      getVisibleFields(table, relationships),
      index,
      width,
      showComments,
    ) +
    tableFieldHeight / 2
  );
}

/**
 * Boxes of the visible tables (by id) and every box lines go around: the
 * tables plus the views, which lines never connect to.
 */
export function routeObstacles(tables, views, relationships, showComments) {
  const rects = new Map();
  for (const table of tables) {
    if (table.hidden) continue;
    rects.set(table.id, {
      x: table.x,
      y: table.y,
      width: getTableWidth(table),
      height: getTableHeight(table, showComments, relationships),
    });
  }
  const obstacles = [...rects.values()];
  for (const view of views) {
    if (view.hidden) continue;
    obstacles.push({
      x: view.x,
      y: view.y,
      width: getViewWidth(view),
      height: getViewHeight(
        view,
        resolveViewColumns(view, tables),
        showComments,
      ),
    });
  }
  return { rects, obstacles };
}

/**
 * Automatic routes for every single-column relationship between visible
 * tables, ignoring manual routes. Used to judge a layout before applying it;
 * the canvas uses `useRelationshipRoutes`, which also caches.
 *
 * @returns {Map<any, Array<{x, y}>>} polylines by relationship id
 */
export function autoRoutes(tables, views, relationships, showComments) {
  const { rects, obstacles } = routeObstacles(
    tables,
    views,
    relationships,
    showComments,
  );
  const tablesById = new Map(tables.map((t) => [t.id, t]));
  const routes = new Map();
  for (const r of relationships) {
    if (getRelationshipFields(r).length > 1) continue;
    const startRect = rects.get(r.startTableId);
    const endRect = rects.get(r.endTableId);
    if (!startRect || !endRect) continue;
    const startY = fieldAnchorY(
      tablesById.get(r.startTableId),
      r.startFieldId,
      startRect.width,
      relationships,
      showComments,
    );
    const endY = fieldAnchorY(
      tablesById.get(r.endTableId),
      r.endFieldId,
      endRect.width,
      relationships,
      showComments,
    );
    if (startY === null || endY === null) continue;
    routes.set(
      r.id,
      autoRoute(
        { rect: startRect, y: startY },
        { rect: endRect, y: endY },
        obstacles,
      ),
    );
  }
  return nudgeRoutes(routes);
}

// Colors for lines that cross, so each one can be followed past the
// crossing. They avoid the blue used for hovered and selected lines.
const crossingPalette = [
  "#e8590c",
  "#2f9e44",
  "#9c36b5",
  "#e03131",
  "#0c8599",
  "#f08c00",
  "#c2255c",
  "#5c940d",
];

/**
 * Display colors for lines that cross another line and have no color of
 * their own, chosen so that lines crossing each other differ. Lines the user
 * colored keep their color, and the others avoid it.
 *
 * @param {Map<any, Set<any>>} neighbours - from `findCrossings`
 * @returns {Map<any, string>} colors by relationship id
 */
export function crossingColors(neighbours, relationships) {
  const own = new Map(
    relationships.filter((r) => r.color).map((r) => [r.id, r.color]),
  );
  const colors = new Map();
  // Most crossed first, so the busiest lines get the clearest choice.
  const ids = [...neighbours.keys()]
    .filter((id) => !own.has(id))
    .sort((a, b) => neighbours.get(b).size - neighbours.get(a).size);
  for (const id of ids) {
    const taken = new Set();
    for (const other of neighbours.get(id)) {
      const color = own.get(other) ?? colors.get(other);
      if (color) taken.add(color.toLowerCase());
    }
    const free = crossingPalette.find((c) => !taken.has(c));
    colors.set(
      id,
      free ?? crossingPalette[colors.size % crossingPalette.length],
    );
  }
  return colors;
}
