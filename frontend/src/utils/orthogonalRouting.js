// Orthogonal routing for relationship lines.
//
// A route is a polyline of horizontal and vertical segments from a field on
// one table to a field on another. It always leaves and enters a table
// horizontally, so it alternates H, V, H, ..., H and its interior vertices
// come in pairs. That shape is what lets a manual route stay orthogonal when
// tables move (see `manualRoute`).
//
// Automatic routes are found with A* on a sparse grid made from the edges of
// the tables near the line, so they go around tables instead of through them.
// `nudgeRoutes` then spreads apart segments of different lines that would be
// drawn on top of each other.

// Space kept free around tables; lines run inside it.
export const routeMargin = 20;
const bendPenalty = 40;
// Obstacles further than this from the line's bounding box are ignored.
const regionPadding = 240;
const nudgeSpacing = 8;

function inflate(rect, by) {
  return {
    left: rect.x - by,
    top: rect.y - by,
    right: rect.x + rect.width + by,
    bottom: rect.y + rect.height + by,
  };
}

function strictlyInside(box, x, y) {
  return x > box.left && x < box.right && y > box.top && y < box.bottom;
}

function uniqueSorted(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > 0.5);
}

// Adds a line halfway between neighbours so routes can take the middle of a
// channel instead of hugging a table.
function withMidpoints(values) {
  const result = [];
  values.forEach((v, i) => {
    if (i > 0 && v - values[i - 1] > 2 * routeMargin) {
      result.push((v + values[i - 1]) / 2);
    }
    result.push(v);
  });
  return result;
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= items[i].f) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].f < items[smallest].f) smallest = l;
        if (r < items.length && items[r].f < items[smallest].f) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

const H = 0;
const V = 1;

// Shortest orthogonal path from `from` to `to` that stays out of `boxes`,
// leaving `from` horizontally. Bends cost extra, so of two equally long paths
// the one with fewer corners wins. Returns { points, cost } or null.
function findPath(from, to, boxes, { minX, maxX, minY, maxY }) {
  const xs = withMidpoints(
    uniqueSorted([
      from.x,
      to.x,
      minX,
      maxX,
      ...boxes.flatMap((b) => [b.left, b.right]),
    ]),
  );
  const ys = withMidpoints(
    uniqueSorted([
      from.y,
      to.y,
      minY,
      maxY,
      ...boxes.flatMap((b) => [b.top, b.bottom]),
    ]),
  );
  // Merging near-duplicates may have kept a neighbour instead of an
  // endpoint's own coordinate; put the exact value back.
  const pin = (values, v) => {
    let best = 0;
    values.forEach((x, i) => {
      if (Math.abs(x - v) < Math.abs(values[best] - v)) best = i;
    });
    values[best] = v;
  };
  pin(xs, from.x);
  pin(xs, to.x);
  pin(ys, from.y);
  pin(ys, to.y);
  const cols = xs.length;
  const rows = ys.length;

  // blockedNode[i + j * cols]: the grid point is inside a table.
  // blockedH / blockedV: the segment to the next point right / down is.
  const blockedNode = new Uint8Array(cols * rows);
  const blockedH = new Uint8Array(cols * rows);
  const blockedV = new Uint8Array(cols * rows);
  for (const b of boxes) {
    const i0 = xs.findIndex((x) => x >= b.left);
    const j0 = ys.findIndex((y) => y >= b.top);
    if (i0 === -1 || j0 === -1) continue;
    for (let j = j0; j < rows && ys[j] <= b.bottom; j++) {
      for (let i = i0; i < cols && xs[i] <= b.right; i++) {
        const k = i + j * cols;
        const insideX = xs[i] > b.left && xs[i] < b.right;
        const insideY = ys[j] > b.top && ys[j] < b.bottom;
        if (insideX && insideY) blockedNode[k] = 1;
        if (insideY && i + 1 < cols && xs[i + 1] <= b.right) blockedH[k] = 1;
        if (insideX && j + 1 < rows && ys[j + 1] <= b.bottom) blockedV[k] = 1;
      }
    }
  }

  const start = xs.indexOf(from.x) + ys.indexOf(from.y) * cols;
  const goal = xs.indexOf(to.x) + ys.indexOf(to.y) * cols;
  const goalI = goal % cols;
  const goalJ = Math.floor(goal / cols);
  const heuristic = (k) =>
    Math.abs(xs[k % cols] - xs[goalI]) +
    Math.abs(ys[Math.floor(k / cols)] - ys[goalJ]);

  // States are (grid point, direction of travel).
  const cost = new Float64Array(cols * rows * 2).fill(Infinity);
  const previous = new Int32Array(cols * rows * 2).fill(-1);
  const heap = new MinHeap();
  cost[start * 2 + H] = 0;
  heap.push({ state: start * 2 + H, f: heuristic(start) });

  let reached = -1;
  while (heap.size > 0) {
    const { state, f } = heap.pop();
    const k = state >> 1;
    const dir = state & 1;
    const g = cost[state];
    if (f - heuristic(k) > g + 1e-6) continue;
    if (k === goal) {
      reached = state;
      break;
    }
    const i = k % cols;
    const j = Math.floor(k / cols);
    const neighbours = [
      [i + 1 < cols && !blockedH[k], k + 1, H],
      [i > 0 && !blockedH[k - 1], k - 1, H],
      [j + 1 < rows && !blockedV[k], k + cols, V],
      [j > 0 && !blockedV[k - cols], k - cols, V],
    ];
    for (const [open, next, nextDir] of neighbours) {
      if (!open || blockedNode[next]) continue;
      const step =
        Math.abs(xs[next % cols] - xs[i]) +
        Math.abs(ys[Math.floor(next / cols)] - ys[j]) +
        (nextDir === dir ? 0 : bendPenalty);
      const nextState = next * 2 + nextDir;
      if (g + step < cost[nextState]) {
        cost[nextState] = g + step;
        previous[nextState] = state;
        heap.push({ state: nextState, f: g + step + heuristic(next) });
      }
    }
  }

  if (reached === -1) return null;

  const points = [];
  for (let s = reached; s !== -1; s = previous[s]) {
    const k = s >> 1;
    points.push({ x: xs[k % cols], y: ys[Math.floor(k / cols)] });
  }
  points.reverse();
  // Arriving vertically means one more corner before entering the table.
  const arrivalBend = (reached & 1) === V ? bendPenalty : 0;
  return { points, cost: cost[reached] + arrivalBend };
}

// Drops repeated points and points in the middle of straight runs.
export function simplify(points) {
  const result = [];
  for (const p of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5)
      continue;
    if (result.length >= 2) {
      const a = result[result.length - 2];
      const b = last;
      const collinear =
        (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5) ||
        (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5);
      if (collinear) {
        result[result.length - 1] = p;
        continue;
      }
    }
    result.push(p);
  }
  return result;
}

function sidePoint(rect, y, side) {
  return { x: side === "right" ? rect.x + rect.width : rect.x, y };
}

function stub(point, side) {
  return {
    x: point.x + (side === "right" ? routeMargin : -routeMargin),
    y: point.y,
  };
}

// The table sides a line should use: facing sides when the tables are apart,
// otherwise both on the same side.
function sideOptions(startRect, endRect) {
  if (startRect.x + startRect.width + 2 * routeMargin <= endRect.x) {
    return [["right", "left"]];
  }
  if (endRect.x + endRect.width + 2 * routeMargin <= startRect.x) {
    return [["left", "right"]];
  }
  return [
    ["right", "right"],
    ["left", "left"],
  ];
}

/**
 * Automatic route between two field anchors.
 *
 * @param {{ rect: {x,y,width,height}, y: number }} start - table and anchor y
 * @param {{ rect: {x,y,width,height}, y: number }} end
 * @param {Array<{x,y,width,height}>} obstacles - every visible table
 * @returns {Array<{x: number, y: number}>} the full polyline
 */
export function autoRoute(start, end, obstacles) {
  const inflated = obstacles.map((rect) => inflate(rect, routeMargin));

  // First search near the two tables; if the way around is longer than that,
  // search the whole area covered by the obstacles.
  for (const wide of [false, true]) {
    let best = null;
    for (const [startSide, endSide] of sideOptions(start.rect, end.rect)) {
      const s = sidePoint(start.rect, start.y, startSide);
      const e = sidePoint(end.rect, end.y, endSide);
      const from = stub(s, startSide);
      const to = stub(e, endSide);

      // Overlapping tables would wall the endpoints in.
      const usable = inflated.filter(
        (b) =>
          !strictlyInside(b, from.x, from.y) && !strictlyInside(b, to.x, to.y),
      );
      const bounds = {
        minX: Math.min(from.x, to.x) - regionPadding,
        maxX: Math.max(from.x, to.x) + regionPadding,
        minY: Math.min(from.y, to.y) - regionPadding,
        maxY: Math.max(from.y, to.y) + regionPadding,
      };
      if (wide) {
        for (const b of usable) {
          bounds.minX = Math.min(bounds.minX, b.left - routeMargin);
          bounds.maxX = Math.max(bounds.maxX, b.right + routeMargin);
          bounds.minY = Math.min(bounds.minY, b.top - routeMargin);
          bounds.maxY = Math.max(bounds.maxY, b.bottom + routeMargin);
        }
      }
      const boxes = usable.filter(
        (b) =>
          b.right > bounds.minX &&
          b.left < bounds.maxX &&
          b.bottom > bounds.minY &&
          b.top < bounds.maxY,
      );

      const found = findPath(from, to, boxes, bounds);
      if (found && (!best || found.cost < best.cost)) {
        best = { cost: found.cost, points: [s, ...found.points, e] };
      }
    }
    if (best) return simplify(best.points);
  }

  // No way around (for example, tables on top of each other): draw a plain
  // three-segment connector.
  const [startSide, endSide] = sideOptions(start.rect, end.rect)[0];
  const s = sidePoint(start.rect, start.y, startSide);
  const e = sidePoint(end.rect, end.y, endSide);
  const midX = (stub(s, startSide).x + stub(e, endSide).x) / 2;
  return simplify([s, { x: midX, y: s.y }, { x: midX, y: e.y }, e]);
}

// A manual route is stored as its interior vertices. Only the x of each
// vertical segment and the y of each inner horizontal segment matter; the
// first and last horizontal segments follow the field anchors. So
// `waypoints[2j].x` is vertical segment j and `waypoints[2j + 1].y` is the
// horizontal segment after it.
export function routeParams(waypoints = []) {
  const xs = [];
  const ys = [];
  for (let i = 0; i + 1 < waypoints.length; i += 2) {
    xs.push(waypoints[i].x);
    if (i + 2 < waypoints.length) ys.push(waypoints[i + 1].y);
  }
  return { xs, ys };
}

export function paramsToWaypoints({ xs, ys }, startY, endY) {
  const waypoints = [];
  xs.forEach((x, j) => {
    waypoints.push({ x, y: j === 0 ? startY : ys[j - 1] });
    waypoints.push({ x, y: j === xs.length - 1 ? endY : ys[j] });
  });
  return waypoints;
}

// Interior vertices of a full polyline, in the shape `routeParams` reads.
export function pointsToWaypoints(points) {
  return points.slice(1, -1).map((p) => ({ x: p.x, y: p.y }));
}

function centerX(rect) {
  return rect.x + rect.width / 2;
}

/**
 * Full polyline for a manual route. The side of each table is picked from
 * where the nearest vertical segment is, so the route keeps working after the
 * tables move.
 */
export function manualRoute(start, end, waypoints) {
  const { xs, ys } = routeParams(waypoints);
  if (xs.length === 0) {
    const [startSide, endSide] = sideOptions(start.rect, end.rect)[0];
    return [
      sidePoint(start.rect, start.y, startSide),
      sidePoint(end.rect, end.y, endSide),
    ];
  }
  const startSide = xs[0] >= centerX(start.rect) ? "right" : "left";
  const endSide = xs[xs.length - 1] >= centerX(end.rect) ? "right" : "left";
  return [
    sidePoint(start.rect, start.y, startSide),
    ...paramsToWaypoints({ xs, ys }, start.y, end.y),
    sidePoint(end.rect, end.y, endSide),
  ];
}

/**
 * Drags segment `index` of `points` (a full polyline) to `pointer` and returns
 * the new route parameters. Inner segments move sideways; dragging the first
 * or last segment, which are pinned to a field, adds a jog next to the table.
 */
export function dragSegment(points, index, pointer) {
  const { xs, ys } = routeParams(pointsToWaypoints(points));
  const last = points.length - 2;
  const start = points[0];
  const end = points[points.length - 1];
  const next = points[1];
  const previous = points[points.length - 2];
  // The new jog goes next to the table, but never past the existing bend.
  const startStub =
    start.x +
    Math.sign(next.x - start.x || 1) *
      Math.min(routeMargin, Math.abs(next.x - start.x) / 2);
  const endStub =
    end.x +
    Math.sign(previous.x - end.x || 1) *
      Math.min(routeMargin, Math.abs(previous.x - end.x) / 2);

  if (index === 0 && index === last) {
    // A straight line: move it as a whole.
    return { xs: [startStub, endStub], ys: [pointer.y] };
  }
  if (index === 0) {
    return { xs: [startStub, ...xs], ys: [pointer.y, ...ys] };
  }
  if (index === last) {
    return { xs: [...xs, endStub], ys: [...ys, pointer.y] };
  }
  if (index % 2 === 1) {
    const j = (index - 1) / 2;
    return { xs: xs.map((x, i) => (i === j ? pointer.x : x)), ys };
  }
  const j = index / 2 - 1;
  return { xs, ys: ys.map((y, i) => (i === j ? pointer.y : y)) };
}

// Removes bends whose segment has no length left, which is how a user
// straightens a line: by dragging a segment in line with its neighbour.
export function removeEmptySegments({ xs, ys }, startY, endY) {
  xs = [...xs];
  ys = [...ys];
  let changed = true;
  while (changed) {
    changed = false;
    for (let j = 0; j < xs.length; j++) {
      const before = j === 0 ? startY : ys[j - 1];
      const after = j === xs.length - 1 ? endY : ys[j];
      if (Math.abs(before - after) < 0.5) {
        xs.splice(j, 1);
        if (j < ys.length) ys.splice(j, 1);
        else if (j > 0) ys.splice(j - 1, 1);
        changed = true;
        break;
      }
      if (j + 1 < xs.length && Math.abs(xs[j] - xs[j + 1]) < 0.5) {
        xs.splice(j + 1, 1);
        ys.splice(j, 1);
        changed = true;
        break;
      }
    }
  }
  return { xs, ys };
}

/**
 * Spreads apart segments of different routes that lie on the same line and
 * overlap, so each relationship stays visible. The first and last segments
 * are pinned to their fields and never move.
 *
 * @param {Map<any, Array<{x, y}>>} routes - polylines by relationship id
 * @returns {Map<any, Array<{x, y}>>} new polylines (unchanged ones reused)
 */
export function nudgeRoutes(routes) {
  const segments = { [H]: new Map(), [V]: new Map() };
  for (const [id, points] of routes) {
    for (let k = 1; k < points.length - 2; k++) {
      const a = points[k];
      const b = points[k + 1];
      const vertical = Math.abs(a.x - b.x) < 0.5;
      const dir = vertical ? V : H;
      const coord = Math.round(vertical ? a.x : a.y);
      const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
      const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
      if (!segments[dir].has(coord)) segments[dir].set(coord, []);
      segments[dir].get(coord).push({ id, k, lo, hi });
    }
  }

  const offsets = new Map();
  for (const dir of [H, V]) {
    for (const list of segments[dir].values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.lo - b.lo);
      // Clusters of overlapping segments, each given evenly spaced tracks.
      let cluster = [];
      let clusterEnd = -Infinity;
      const flush = () => {
        const ids = new Set(cluster.map((s) => s.id));
        if (ids.size > 1) {
          const trackEnds = [];
          for (const s of cluster) {
            let track = trackEnds.findIndex((end) => end < s.lo);
            if (track === -1) track = trackEnds.length;
            trackEnds[track] = s.hi;
            s.track = track;
          }
          const spacing = Math.min(
            nudgeSpacing,
            (2 * routeMargin * 0.8) / trackEnds.length,
          );
          for (const s of cluster) {
            const offset = (s.track - (trackEnds.length - 1) / 2) * spacing;
            if (offset !== 0) offsets.set(`${s.id}|${s.k}`, { dir, offset });
          }
        }
        cluster = [];
      };
      for (const s of list) {
        if (s.lo > clusterEnd) {
          flush();
          clusterEnd = -Infinity;
        }
        cluster.push(s);
        clusterEnd = Math.max(clusterEnd, s.hi);
      }
      flush();
    }
  }

  if (offsets.size === 0) return routes;
  const result = new Map();
  for (const [id, points] of routes) {
    let moved = null;
    for (let k = 1; k < points.length - 2; k++) {
      const o = offsets.get(`${id}|${k}`);
      if (!o) continue;
      moved ??= points.map((p) => ({ ...p }));
      const axis = o.dir === V ? "x" : "y";
      moved[k][axis] = points[k][axis] + o.offset;
      moved[k + 1][axis] = points[k + 1][axis] + o.offset;
    }
    result.set(id, moved ?? points);
  }
  return result;
}

// SVG path through `points` with rounded corners.
export function roundedPath(points, radius = 10) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const p = points[i];
    const next = points[i + 1];
    const lenIn = Math.hypot(p.x - prev.x, p.y - prev.y);
    const lenOut = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    if (r < 0.5) {
      d += ` L ${p.x} ${p.y}`;
      continue;
    }
    const inX = p.x - ((p.x - prev.x) / lenIn) * r;
    const inY = p.y - ((p.y - prev.y) / lenIn) * r;
    const outX = p.x + ((next.x - p.x) / lenOut) * r;
    const outY = p.y + ((next.y - p.y) / lenOut) * r;
    d += ` L ${inX} ${inY} Q ${p.x} ${p.y} ${outX} ${outY}`;
  }
  const last = points[points.length - 1];
  // A tiny offset keeps a perfectly straight path from having an empty
  // bounding box, which breaks hover hit testing in some browsers.
  const straight = points.length === 2 && Math.abs(points[0].y - last.y) < 0.01;
  return `${d} L ${last.x} ${straight ? last.y + 0.1 : last.y}`;
}
