import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Modal, Steps, TabPane, Tabs } from "@douyinfe/semi-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import { useSettings, useThemedPage } from "../hooks";
import DiagramPreview from "../components/Hub/DiagramPreview";
import template_screenshot from "../assets/template_screenshot.png";
import DatabaseIcon from "../components/DatabaseIcon";

function previewOf(template) {
  return {
    tables: template.tables ?? [],
    areas: template.subjectAreas ?? [],
    notes: template.notes ?? [],
  };
}

function TemplateCard({ template, theme, onUse, onDelete }) {
  const { t } = useTranslation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onUse}
      onKeyDown={(e) => e.key === "Enter" && onUse()}
      className="group rounded-lg border border-(--semi-color-border) bg-(--semi-color-bg-1) overflow-hidden cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-(--semi-color-primary)"
    >
      <div className="h-48 border-b border-(--semi-color-border)">
        <DiagramPreview
          preview={previewOf(template)}
          id={`template-${template.templateId}`}
          theme={theme}
        />
      </div>
      <div className="flex items-start gap-3 px-4 py-3">
        <DatabaseIcon database={template.database} className="h-6 w-6 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate" title={template.title}>
            {template.title}
          </div>
          {template.description && (
            <div className="text-sm text-(--semi-color-text-2) line-clamp-2">
              {template.description}
            </div>
          )}
        </div>
        {onDelete && (
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              theme="borderless"
              type="danger"
              aria-label={t("delete")}
              icon={<i className="bi bi-trash3" />}
              onClick={onDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Templates() {
  useThemedPage();
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const defaultTemplates = useLiveQuery(() =>
    db.templates.where({ custom: 0 }).toArray(),
  );
  const customTemplates = useLiveQuery(() =>
    db.templates.where({ custom: 1 }).toArray(),
  );

  useEffect(() => {
    document.title = `${t("templates_title")} | drawDB`;
  }, [t]);

  const openTemplate = (template) =>
    navigate(`/editor/templates/${template.templateId}`);

  const confirmDelete = (template) =>
    Modal.confirm({
      title: t("templates_delete_title", { name: template.title }),
      okText: t("delete"),
      cancelText: t("cancel"),
      okButtonProps: { type: "danger" },
      onOk: () => db.templates.delete(template.id),
    });

  const grid = (templates, custom) => (
    <div className="grid gap-6 my-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
      {templates?.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          theme={settings.mode}
          onUse={() => openTemplate(template)}
          onDelete={custom ? () => confirmDelete(template) : null}
        />
      ))}
    </div>
  );

  return (
    <div className="theme min-h-screen flex flex-col">
      <header className="flex items-center gap-3 px-8 md:px-4 py-4 border-b border-(--semi-color-border)">
        <Link to="/">
          <Button
            theme="borderless"
            type="tertiary"
            icon={<i className="bi bi-arrow-left" />}
          >
            {t("hub_title")}
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">{t("templates_title")}</h1>
      </header>

      <main className="flex-1 px-8 md:px-4 py-6">
        <p className="max-w-2xl text-sm text-(--semi-color-text-2)">
          {t("templates_subtitle")}
        </p>
        <Tabs>
          <TabPane tab={t("templates_default")} itemKey="default">
            {grid(defaultTemplates, false)}
          </TabPane>
          <TabPane tab={t("templates_yours")} itemKey="custom">
            {customTemplates?.length > 0 ? (
              grid(customTemplates, true)
            ) : (
              <div className="my-6 grid grid-cols-5 lg:grid-cols-1 gap-8 items-start">
                <img
                  src={template_screenshot}
                  alt=""
                  className="col-span-3 lg:col-span-1 rounded-md border border-(--semi-color-border)"
                />
                <div className="col-span-2 lg:col-span-1">
                  <div className="text-lg font-semibold">
                    {t("templates_none")}
                  </div>
                  <div className="text-sm text-(--semi-color-text-2) mb-4">
                    {t("templates_how_to")}
                  </div>
                  <Steps direction="vertical" type="basic">
                    <Steps.Step
                      title={t("templates_step_build")}
                      description={t("templates_step_build_hint")}
                    />
                    <Steps.Step
                      title={t("templates_step_save")}
                      description={t("templates_step_save_hint")}
                    />
                    <Steps.Step
                      title={t("templates_step_use")}
                      description={t("templates_step_use_hint")}
                    />
                  </Steps>
                </div>
              </div>
            )}
          </TabPane>
        </Tabs>
      </main>

      <footer className="text-center text-sm py-3 border-t border-(--semi-color-border) text-(--semi-color-text-2)">
        &copy; {new Date().getFullYear()} <strong>drawDB</strong> - All rights
        reserved.
      </footer>
    </div>
  );
}
