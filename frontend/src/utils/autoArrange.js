import { graphlib, layout } from "@dagrejs/dagre";
import { tableWidth as defaultTableWidth } from "../data/constants";
import { findCrossings } from "./orthogonalRouting";
import { autoRoutes, fieldAnchorY } from "./relationshipRoutes";
import { getTableHeight, getTableWidth } from "./utils";

const nodeSep = 60;
// Wide enough between columns for several lines to run side by side.
const rankSep = 140;
const isolatedGap = 60;
// Each ranker gives a different column assignment; the best one wins.
const rankers = ["network-simplex", "tight-tree", "longest-path"];
const maxSweeps = 8;
const placementRounds = 6;
// Time for the last pass, which routes every line for each move it tries.
const refineBudgetMs = 1500;

/**
 * New positions for the unlocked tables: connected tables in columns from
 * referenced to referencing tables, the rest in rows below. Of several
 * candidate layouts, the one whose routed lines cross least is used.
 *
 * @returns {Array<{id, x: number, y: number}>}
 */
export function autoArrange(tables, relationships, settings, views = []) {
  const movable = tables.filter((table) => !table.locked);
  const movableIds = new Set(movable.map((table) => table.id));

  const links = relationships.filter(
    (r) =>
      r.startTableId !== r.endTableId &&
      movableIds.has(r.startTableId) &&
      movableIds.has(r.endTableId),
  );
  const connectedIds = new Set(
    links.flatMap((r) => [r.startTableId, r.endTableId]),
  );

  const sizeOf = (table) => ({
    width: getTableWidth(table),
    height: getTableHeight(table, settings.showComments, relationships),
  });

  const connected = movable.filter((table) => connectedIds.has(table.id));
  const isolated = movable.filter((table) => !connectedIds.has(table.id));
  const tablesById = new Map(tables.map((t) => [t.id, t]));

  // Where each line meets its tables, relative to the table's top.
  const anchorOffset = (tableId, fieldId) => {
    const table = tablesById.get(tableId);
    const y = fieldAnchorY(
      table,
      fieldId,
      getTableWidth(table),
      relationships,
      settings.showComments,
    );
    return y === null ? sizeOf(table).height / 2 : y - table.y;
  };
  const edges = links.map((r) => ({
    a: r.startTableId,
    b: r.endTableId,
    offsetA: anchorOffset(r.startTableId, r.startFieldId),
    offsetB: anchorOffset(r.endTableId, r.endFieldId),
  }));

  // Isolated tables are laid out separately and left out of the comparison.
  const isolatedIds = new Set(isolated.map((t) => t.id));
  const score = (positions) => {
    const byId = new Map(positions.map((p) => [p.id, p]));
    const arranged = tables
      .filter((t) => !isolatedIds.has(t.id))
      .map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t));
    const routes = autoRoutes(
      arranged,
      views,
      relationships,
      settings.showComments,
    );
    let length = 0;
    for (const points of routes.values()) {
      for (let k = 1; k < points.length; k++) {
        length +=
          Math.abs(points[k].x - points[k - 1].x) +
          Math.abs(points[k].y - points[k - 1].y);
      }
    }
    return { crossings: findCrossings(routes).count, length };
  };

  let best = null;
  const seen = new Set();
  // Scores a layout and keeps it if it beats the best so far.
  const consider = (columns) => {
    const positions = columnPositions(columns);
    const key = positions.map((p) => `${p.id}:${p.x},${p.y}`).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    const s = score(positions);
    if (
      best &&
      (s.crossings > best.crossings ||
        (s.crossings === best.crossings && s.length >= best.length))
    ) {
      return false;
    }
    best = { ...s, positions, columns: cloneColumns(columns) };
    return true;
  };

  if (connected.length > 0) {
    for (const ranker of rankers) {
      const columns = dagreColumns(connected, links, sizeOf, ranker);
      consider(columns);
      reorder(columns, edges);
      consider(columns);
      place(columns, edges);
      consider(columns);
    }
    refine(edges, consider, () => best);
  }

  const positions = best?.positions ?? [];
  let maxX = 0;
  let maxY = 0;
  for (const p of positions) {
    const { width, height } = sizeOf(tablesById.get(p.id));
    maxX = Math.max(maxX, p.x + width);
    maxY = Math.max(maxY, p.y + height);
  }

  if (isolated.length > 0) {
    const rowWidth = Math.max(maxX, 4 * defaultTableWidth + 3 * isolatedGap);
    let x = 0;
    let y = connected.length > 0 ? maxY + rankSep : 0;
    let rowHeight = 0;
    for (const table of isolated) {
      const { width, height } = sizeOf(table);
      if (x > 0 && x + width > rowWidth) {
        x = 0;
        y += rowHeight + isolatedGap;
        rowHeight = 0;
      }
      positions.push({ id: table.id, x, y });
      x += width + isolatedGap;
      rowHeight = Math.max(rowHeight, height);
    }
  }

  return positions;
}

// Dagre's layout as columns of tables, left to right, each top to bottom:
// [{ x: center, items: [{ id, width, height, y: top }] }].
function dagreColumns(connected, links, sizeOf, ranker) {
  const graph = new graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: "LR",
    nodesep: nodeSep,
    ranksep: rankSep,
    ranker,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const table of connected) {
    graph.setNode(String(table.id), sizeOf(table));
  }
  for (const r of links) {
    // Referenced (parent) tables go left of the tables that point to them,
    // so the diagram reads left to right.
    graph.setEdge(String(r.endTableId), String(r.startTableId), {}, r.id);
  }
  layout(graph);

  const byX = new Map();
  for (const table of connected) {
    const node = graph.node(String(table.id));
    const key = Math.round(node.x);
    if (!byX.has(key)) byX.set(key, { x: node.x, items: [] });
    byX.get(key).items.push({
      id: table.id,
      width: node.width,
      height: node.height,
      y: node.y - node.height / 2,
    });
  }
  const columns = [...byX.values()].sort((a, b) => a.x - b.x);
  for (const column of columns) column.items.sort((a, b) => a.y - b.y);
  return columns;
}

function columnPositions(columns) {
  const positions = columns.flatMap((column) =>
    column.items.map((item) => ({
      id: item.id,
      x: Math.round(column.x - item.width / 2),
      y: item.y,
    })),
  );
  // Start at the origin like dagre does, wherever placement moved things.
  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  return positions.map((p) => ({
    id: p.id,
    x: p.x - minX,
    y: Math.round(p.y - minY),
  }));
}

function locate(columns) {
  const where = new Map();
  columns.forEach((column, c) => {
    for (const item of column.items) where.set(item.id, { c, item });
  });
  return where;
}

// Crossings of the lines drawn straight from field to field. Lines only
// cross between columns, and two lines cross where their order flips, so
// comparing their heights at both ends of the stretch they share is enough.
function estimateCrossings(columns, edges) {
  const where = locate(columns);
  const spans = [];
  for (const e of edges) {
    const a = where.get(e.a);
    const b = where.get(e.b);
    if (a.c === b.c) continue;
    const ends = [
      { c: a.c, y: a.item.y + e.offsetA },
      { c: b.c, y: b.item.y + e.offsetB },
    ].sort((p, q) => p.c - q.c);
    spans.push(ends);
  }
  const heightAt = ([l, r], c) => l.y + ((r.y - l.y) * (c - l.c)) / (r.c - l.c);

  let count = 0;
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const p = spans[i];
      const q = spans[j];
      const from = Math.max(p[0].c, q[0].c);
      const to = Math.min(p[1].c, q[1].c);
      if (from >= to) continue;
      const before = heightAt(p, from) - heightAt(q, from);
      const after = heightAt(p, to) - heightAt(q, to);
      if (before * after < 0) count++;
    }
  }
  return count;
}

// Packs a column's tables top to bottom from where its first one starts.
function stack(column) {
  let y = column.items[0].y;
  for (const item of column.items) {
    item.y = y;
    y += item.height + nodeSep;
  }
}

// Dagre orders each column as if every line left from the table's middle.
// Lines leave from their fields, so move tables within their column wherever
// that removes crossings, until nothing improves.
function reorder(columns, edges) {
  columns.forEach(stack);
  let best = estimateCrossings(columns, edges);
  for (let sweep = 0; sweep < maxSweeps && best > 0; sweep++) {
    let improved = false;
    for (const column of columns) {
      const items = column.items;
      for (let from = 0; from < items.length; from++) {
        for (let to = 0; to < items.length; to++) {
          if (to === from) continue;
          const [item] = items.splice(from, 1);
          items.splice(to, 0, item);
          stack(column);
          const crossings = estimateCrossings(columns, edges);
          if (crossings < best) {
            best = crossings;
            improved = true;
            break;
          }
          items.splice(to, 1);
          items.splice(from, 0, item);
          stack(column);
        }
      }
    }
    if (!improved) break;
  }
}

// Starting from the best layout, moves tables within their column and keeps
// each move that leaves fewer crossings (or shorter lines) once the lines are
// actually routed, which `estimateCrossings` can only approximate. Stops when
// nothing improves or time runs out.
function refine(edges, consider, getBest) {
  const deadline = performance.now() + refineBudgetMs;
  let improved = true;
  while (improved && getBest().crossings > 0) {
    improved = false;
    const base = getBest().columns;
    for (let c = 0; c < base.length && !improved; c++) {
      const count = base[c].items.length;
      for (let from = 0; from < count && !improved; from++) {
        for (let to = 0; to < count && !improved; to++) {
          if (to === from) continue;
          if (performance.now() > deadline) return;
          const columns = cloneColumns(base);
          const items = columns[c].items;
          items.splice(to, 0, ...items.splice(from, 1));
          stack(columns[c]);
          place(columns, edges);
          improved = consider(columns);
        }
      }
    }
  }
}

function cloneColumns(columns) {
  return columns.map((column) => ({
    x: column.x,
    items: column.items.map((item) => ({ ...item })),
  }));
}

// Moves each table up or down towards the tables it's linked to, keeping the
// order `reorder` chose, so lines run as straight as they can.
function place(columns, edges) {
  for (let round = 0; round < placementRounds; round++) {
    const order = round % 2 === 0 ? columns : [...columns].reverse();
    for (const column of order) {
      const where = locate(columns);
      const targets = column.items.map((item) => {
        const wanted = [];
        for (const e of edges) {
          for (const [self, other, selfOffset, otherOffset] of [
            [e.a, e.b, e.offsetA, e.offsetB],
            [e.b, e.a, e.offsetB, e.offsetA],
          ]) {
            if (self !== item.id) continue;
            const o = where.get(other);
            if (o.item === item || column.items.includes(o.item)) continue;
            wanted.push(o.item.y + otherOffset - selfOffset);
          }
        }
        return wanted.length > 0
          ? wanted.reduce((sum, y) => sum + y, 0) / wanted.length
          : item.y;
      });
      placeColumn(column.items, targets);
    }
  }
}

// Puts the tables of a column as close to their target tops as possible
// (least squares) while keeping their order and at least `nodeSep` apart.
// Measured from where each table would be if the column were packed, the
// tops must not decrease, which pool adjacent violators solves exactly.
function placeColumn(items, targets) {
  const packed = [];
  let offset = 0;
  for (const item of items) {
    packed.push(offset);
    offset += item.height + nodeSep;
  }
  const blocks = [];
  items.forEach((_, i) => {
    blocks.push({ sum: targets[i] - packed[i], size: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const previous = blocks[blocks.length - 2];
      if (previous.sum / previous.size <= last.sum / last.size) break;
      previous.sum += last.sum;
      previous.size += last.size;
      blocks.pop();
    }
  });
  let i = 0;
  for (const block of blocks) {
    const z = block.sum / block.size;
    for (let k = 0; k < block.size; k++, i++) items[i].y = z + packed[i];
  }
}
