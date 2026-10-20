import { databases } from "../data/databases";

// Database logos are black shapes on transparency. Using them as a mask
// paints them with the current text color, so they follow the theme and look
// the same everywhere. Size and color come from className.
export default function DatabaseIcon({
  database,
  className = "h-6 w-6",
  position = "center",
  title,
}) {
  const image = databases[database]?.image;
  if (!image) return null;

  const mask = `url("${image}") ${position} / contain no-repeat`;
  return (
    <span
      role="img"
      aria-label={databases[database].name}
      title={title ?? databases[database].name}
      className={`inline-block shrink-0 bg-current text-(--semi-color-text-2) ${className}`}
      style={{ mask, WebkitMask: mask }}
    />
  );
}
