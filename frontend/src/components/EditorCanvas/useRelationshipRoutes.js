import { useMemo, useRef } from "react";
import {
  autoRoute,
  manualRoute,
  nudgeRoutes,
  routeMargin,
} from "../../utils/orthogonalRouting";
import { fieldAnchorY, routeObstacles } from "../../utils/relationshipRoutes";
import { getRelationshipFields } from "../../utils/utils";

// Tables this far from a line's endpoints can't change its route, so moving
// them doesn't invalidate the cached route.
const cacheRegion = 300;

const rectKey = (r) => `${r.x},${r.y},${r.width},${r.height}`;

function samePoints(a, b) {
  return (
    a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
  );
}

/**
 * Polylines for every single-column relationship between visible tables:
 * the user's manual route if it has one, otherwise an automatic route around
 * the other tables. Composite keys keep their fork drawing and aren't here.
 *
 * @returns {Map<any, { points: Array<{x, y}>, manual: boolean }>}
 */
export default function useRelationshipRoutes(
  tables,
  relationships,
  views,
  showComments,
) {
  const cacheRef = useRef(new Map());
  const previousRef = useRef(new Map());

  return useMemo(() => {
    const { rects, obstacles } = routeObstacles(
      tables,
      views,
      relationships,
      showComments,
    );
    const tablesById = new Map(tables.map((t) => [t.id, t]));

    const auto = new Map();
    const manual = new Map();
    const cache = new Map();

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

      const start = { rect: startRect, y: startY };
      const end = { rect: endRect, y: endY };

      if (Array.isArray(r.waypoints)) {
        manual.set(r.id, manualRoute(start, end, r.waypoints));
        continue;
      }

      const pad = cacheRegion + 2 * routeMargin;
      const minX = Math.min(startRect.x, endRect.x) - pad;
      const maxX =
        Math.max(startRect.x + startRect.width, endRect.x + endRect.width) +
        pad;
      const minY = Math.min(startY, endY) - pad;
      const maxY = Math.max(startY, endY) + pad;
      const nearby = obstacles.filter(
        (o) =>
          o.x < maxX &&
          o.x + o.width > minX &&
          o.y < maxY &&
          o.y + o.height > minY,
      );
      const key = [
        rectKey(startRect),
        rectKey(endRect),
        startY,
        endY,
        ...nearby.map(rectKey),
      ].join("|");

      const cached = cacheRef.current.get(r.id);
      const points =
        cached?.key === key ? cached.points : autoRoute(start, end, nearby);
      cache.set(r.id, { key, points });
      auto.set(r.id, points);
    }
    cacheRef.current = cache;

    const routes = new Map();
    for (const [id, points] of nudgeRoutes(auto)) {
      routes.set(id, { points, manual: false });
    }
    for (const [id, points] of manual) {
      routes.set(id, { points, manual: true });
    }

    // Hand back the previous objects for unchanged routes so the memoized
    // relationship components don't re-render.
    const previous = previousRef.current;
    for (const [id, route] of routes) {
      const old = previous.get(id);
      if (
        old &&
        old.manual === route.manual &&
        samePoints(old.points, route.points)
      ) {
        routes.set(id, old);
      }
    }
    previousRef.current = routes;
    return routes;
  }, [tables, relationships, views, showComments]);
}
