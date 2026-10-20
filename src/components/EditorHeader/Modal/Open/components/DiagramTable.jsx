import { Tag } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import SortableHeader from "./SortableHeader";
import { SOURCE, databaseName, formatSize } from "../diagram";

function TypeCell({ entry }) {
  const { t } = useTranslation();
  const isCloud = entry.source === SOURCE.cloud;
  return (
    <Tag size="small" color={isCloud ? "cyan" : "grey"}>
      {isCloud ? t("cloud") : t("local")}
    </Tag>
  );
}

function formatTimestamp(date) {
  return date
    ? `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
    : "";
}

function useColumns() {
  const { t } = useTranslation();
  return [
    {
      key: "name",
      label: t("name"),
      sortable: true,
      render: ({ entry }) => entry.name,
    },
    { key: "type", label: t("type"), render: TypeCell },
    {
      key: "database",
      label: t("database"),
      render: ({ entry }) => databaseName(entry.database, t),
    },
    {
      key: "lastModified",
      label: t("last_modified"),
      sortable: true,
      render: ({ entry }) => formatTimestamp(entry.lastModified),
    },
    {
      key: "size",
      label: t("size"),
      sortable: true,
      render: ({ entry }) => formatSize(entry.size),
    },
  ];
}

export default function DiagramTable({
  entries,
  sort,
  onSort,
  selectedDiagramId,
  onSelect,
}) {
  const columns = useColumns();

  return (
    <table className="w-full text-left border-separate border-spacing-x-0">
      <thead>
        <tr>
          {columns.map((column) =>
            column.sortable ? (
              <SortableHeader
                key={column.key}
                label={column.label}
                sortKey={column.key}
                sort={sort}
                onSort={onSort}
                className="sticky top-0 z-10 py-2 px-3 border-b border-zinc-100 dark:border-zinc-700 sidesheet-theme"
              />
            ) : (
              <th
                key={column.key}
                className="sticky top-0 z-10 py-2 px-3 border-b border-zinc-100 dark:border-zinc-700 sidesheet-theme"
              >
                {column.label}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const selected = selectedDiagramId === entry.diagramId;
          return (
            <tr
              key={`${entry.source}-${entry.diagramId}`}
              className={`cursor-pointer ${selected ? "bg-blue-300/30" : "hover-1"}`}
              onClick={() => onSelect(entry.diagramId)}
            >
              {columns.map((column) => (
                <td key={column.key} className="py-2 px-3">
                  {column.render({ entry })}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
