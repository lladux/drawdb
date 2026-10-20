import { useEffect, useMemo, useRef, useState } from "react";
import Thumbnail from "../Thumbnail";
import {
  noteWidth,
  tableFieldHeight,
  tableHeaderHeight,
  tableColorStripHeight,
} from "../../data/constants";
import { getTableWidth } from "../../utils/utils";

const PADDING = 16;
const DEFAULT_NOTE_HEIGHT = 88;

function tableHeight(table) {
  return (
    table.fields.length * tableFieldHeight +
    tableHeaderHeight +
    tableColorStripHeight
  );
}

function boundingBox(preview) {
  const boxes = [
    ...preview.tables.map((t) => ({
      x: t.x,
      y: t.y,
      w: getTableWidth(t),
      h: tableHeight(t),
    })),
    ...preview.areas.map((a) => ({
      x: a.x,
      y: a.y,
      w: a.width ?? 0,
      h: a.height ?? 0,
    })),
    ...preview.notes.map((n) => ({
      x: n.x,
      y: n.y,
      w: n.width ?? noteWidth,
      h: n.height ?? DEFAULT_NOTE_HEIGHT,
    })),
  ];
  if (boxes.length === 0) return null;

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

// Fits the whole diagram, centered, into whatever size the card gives it.
export default function DiagramPreview({ preview, id, theme }) {
  const ref = useRef(null);
  const [size, setSize] = useState(null);
  const box = useMemo(() => boundingBox(preview), [preview]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const fitted = useMemo(() => {
    if (!box || !size) return null;
    const zoom = Math.min(
      (size.width - 2 * PADDING) / Math.max(box.width, 1),
      (size.height - 2 * PADDING) / Math.max(box.height, 1),
      1,
    );
    const dx = (size.width / zoom - box.width) / 2 - box.minX;
    const dy = (size.height / zoom - box.height) / 2 - box.minY;
    const move = (item) => ({ ...item, x: item.x + dx, y: item.y + dy });

    return {
      zoom,
      diagram: {
        tables: preview.tables.map(move),
        subjectAreas: preview.areas.map(move),
        notes: preview.notes.map((n) => ({
          ...move(n),
          height: n.height ?? DEFAULT_NOTE_HEIGHT,
        })),
      },
    };
  }, [box, size, preview]);

  return (
    <div ref={ref} className="w-full h-full pointer-events-none">
      {box ? (
        fitted && (
          <Thumbnail
            diagram={fitted.diagram}
            zoom={fitted.zoom}
            i={id}
            theme={theme}
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">
          <i className="bi bi-diagram-3" />
        </div>
      )}
    </div>
  );
}
