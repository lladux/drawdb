import { Dropdown, Button } from "@douyinfe/semi-ui";
import { DateTime } from "luxon";
import { useTranslation } from "react-i18next";
import { databases } from "../../data/databases";
import DiagramPreview from "./DiagramPreview";
import DatabaseIcon from "../DatabaseIcon";

export default function DiagramCard({
  diagram,
  theme,
  workspaces,
  onOpen,
  onRename,
  onMove,
  onDelete,
}) {
  const { t, i18n } = useTranslation();
  const database = databases[diagram.database];
  const edited = DateTime.fromISO(diagram.lastModified)
    .setLocale(i18n.language)
    .toRelative();
  const moveTargets = workspaces.filter(
    (w) => w.unlocked && w.id !== diagram.workspaceId,
  );

  const menu = (
    <Dropdown.Menu>
      <Dropdown.Item onClick={() => onOpen(diagram, false)}>
        {t("open")}
      </Dropdown.Item>
      <Dropdown.Item onClick={() => onOpen(diagram, true)}>
        {t("hub_open_new_tab")}
      </Dropdown.Item>
      <Dropdown.Item onClick={() => onRename(diagram)}>
        {t("rename")}
      </Dropdown.Item>
      {moveTargets.length > 0 && (
        <>
          <Dropdown.Divider />
          <Dropdown.Title>{t("hub_move_to")}</Dropdown.Title>
          {moveTargets.map((w) => (
            <Dropdown.Item key={w.id} onClick={() => onMove(diagram, w)}>
              {w.protected && <i className="bi bi-lock me-2" />}
              {w.name}
            </Dropdown.Item>
          ))}
        </>
      )}
      <Dropdown.Divider />
      <Dropdown.Item type="danger" onClick={() => onDelete(diagram)}>
        {t("delete")}
      </Dropdown.Item>
    </Dropdown.Menu>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(diagram, false)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(diagram, false)}
      className="group rounded-lg border border-(--semi-color-border) bg-(--semi-color-bg-1) overflow-hidden cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-(--semi-color-primary)"
    >
      <div className="h-44 border-b border-(--semi-color-border)">
        <DiagramPreview
          preview={diagram.preview}
          id={diagram.diagramId}
          theme={theme}
        />
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {database?.image ? (
          <DatabaseIcon database={diagram.database} />
        ) : (
          <i className="bi bi-database text-xl text-(--semi-color-text-2)" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={diagram.name}>
            {diagram.name || t("untitled")}
          </div>
          <div className="text-xs text-(--semi-color-text-2)">
            {t("hub_edited", { time: edited })}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown trigger="click" position="bottomRight" render={menu}>
            <Button
              theme="borderless"
              type="tertiary"
              aria-label={t("hub_diagram_actions")}
              icon={<i className="bi bi-three-dots" />}
            />
          </Dropdown>
        </div>
      </div>
    </div>
  );
}
