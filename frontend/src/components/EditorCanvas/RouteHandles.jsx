// Sizes in screen pixels, so handles stay the same size at any zoom.
const handleSize = 10;
// Segments shorter than this get no handle; they're too small to grab.
const minSegmentLength = 16;

// Handles for dragging the segments of the selected relationship line. They
// are drawn above the tables so a segment running behind one can still be
// grabbed.
export default function RouteHandles({
  id,
  points,
  zoom,
  onSegmentPointerDown,
}) {
  const size = handleSize / zoom;
  const handles = [];
  for (let index = 0; index + 1 < points.length; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < minSegmentLength / zoom) continue;
    handles.push({
      index,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      vertical: Math.abs(a.x - b.x) < 0.5,
    });
  }

  return (
    <g>
      {handles.map((h) => (
        <rect
          key={h.index}
          x={h.x - size / 2}
          y={h.y - size / 2}
          width={size}
          height={size}
          rx={2 / zoom}
          className="fill-white stroke-sky-600"
          strokeWidth={2 / zoom}
          cursor={h.vertical ? "ew-resize" : "ns-resize"}
          onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary) return;
            e.stopPropagation();
            onSegmentPointerDown(id, h.index, points, e);
          }}
        />
      ))}
    </g>
  );
}
