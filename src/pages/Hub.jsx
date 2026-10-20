import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Banner,
  Button,
  Dropdown,
  Input,
  Modal,
  Spin,
  Toast,
} from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useSettings, useThemedPage } from "../hooks";
import * as workspacesApi from "../api/workspaces";
import * as diagramsApi from "../api/diagrams";
import { backendUrl } from "../config";
import DiagramCard from "../components/Hub/DiagramCard";
import UnlockPanel from "../components/Hub/UnlockPanel";
import WorkspaceModal from "../components/Hub/WorkspaceModal";
import logo_light from "../assets/logo_light_160.png";
import logo_dark from "../assets/logo_dark_160.png";

// Only follow ?next= to paths inside the app.
function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export default function Hub() {
  useThemedPage();
  const { t } = useTranslation();
  const { settings, setSettings } = useSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [workspaces, setWorkspaces] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [diagrams, setDiagrams] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [workspaceModal, setWorkspaceModal] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState("");

  const selected = workspaces?.find((w) => w.id === selectedId) ?? null;

  const loadWorkspaces = useCallback(async () => {
    try {
      const list = await workspacesApi.list();
      setWorkspaces(list);
      setError(null);
      setSelectedId((current) => {
        const wanted = [
          current,
          searchParams.get("unlock"),
          workspacesApi.getLastWorkspace(),
        ].find((id) => id && list.some((w) => w.id === id));
        return wanted ?? list[0]?.id ?? null;
      });
    } catch (e) {
      setError(e);
    }
  }, [searchParams]);

  const loadDiagrams = useCallback(async () => {
    if (!selected?.unlocked) {
      setDiagrams(null);
      return;
    }
    try {
      setDiagrams(await workspacesApi.listDiagrams(selected.id));
    } catch (e) {
      if (workspacesApi.lockedWorkspaceId(e)) {
        // The saved token expired or the password changed.
        workspacesApi.lock(selected.id);
        loadWorkspaces();
      } else {
        setError(e);
      }
    }
  }, [selected?.id, selected?.unlocked, loadWorkspaces]);

  useEffect(() => {
    document.title = `${t("hub_title")} | drawDB`;
    loadWorkspaces();
  }, [loadWorkspaces, t]);

  useEffect(() => {
    setDiagrams(null);
    setQuery("");
    loadDiagrams();
  }, [loadDiagrams]);

  const selectWorkspace = (id) => {
    setSelectedId(id);
    workspacesApi.setLastWorkspace(id);
  };

  const visibleDiagrams = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (diagrams ?? []).filter(
      (d) => !needle || d.name.toLowerCase().includes(needle),
    );
  }, [diagrams, query]);

  const unlock = async (password) => {
    const ok = await workspacesApi.unlock(selected.id, password);
    if (!ok) return false;
    const next = safeNext(searchParams.get("next"));
    if (next && searchParams.get("unlock") === selected.id) {
      navigate(next);
      return true;
    }
    if (searchParams.has("unlock")) setSearchParams({}, { replace: true });
    await loadWorkspaces();
    return true;
  };

  const newDiagram = () => {
    workspacesApi.setLastWorkspace(selected.id);
    navigate(`/editor?workspace=${selected.id}`);
  };

  const openDiagram = (diagram, newTab) => {
    const url = `/editor/diagrams/${diagram.diagramId}`;
    if (newTab) window.open(url, "_blank");
    else navigate(url);
  };

  const runAndRefresh = async (action) => {
    try {
      await action();
    } catch {
      Toast.error(t("oops_smth_went_wrong"));
    }
    await Promise.all([loadWorkspaces(), loadDiagrams()]);
  };

  const submitWorkspace = async (values) => {
    try {
      if (workspaceModal.workspace) {
        await workspacesApi.update(workspaceModal.workspace.id, values);
      } else {
        const created = await workspacesApi.create(
          values.name,
          values.password,
        );
        selectWorkspace(created.id);
      }
      setWorkspaceModal(null);
      await loadWorkspaces();
    } catch {
      Toast.error(t("oops_smth_went_wrong"));
    }
  };

  const confirmDeleteWorkspace = () => {
    Modal.confirm({
      title: t("hub_delete_workspace_title", { name: selected.name }),
      content: t("hub_delete_workspace_warning", {
        count: selected.diagramCount ?? 0,
      }),
      okText: t("delete"),
      cancelText: t("cancel"),
      okButtonProps: { type: "danger" },
      onOk: () =>
        runAndRefresh(async () => {
          await workspacesApi.del(selected.id);
          setSelectedId(null);
        }),
    });
  };

  const confirmDeleteDiagram = (diagram) => {
    Modal.confirm({
      title: t("delete_diagram"),
      content: t("hub_delete_diagram_warning", { name: diagram.name }),
      okText: t("delete"),
      cancelText: t("cancel"),
      okButtonProps: { type: "danger" },
      onOk: () => runAndRefresh(() => diagramsApi.del(diagram.diagramId)),
    });
  };

  const moveDiagram = (diagram, workspace) =>
    runAndRefresh(async () => {
      await diagramsApi.update(diagram.diagramId, {
        workspaceId: workspace.id,
      });
      Toast.success(t("hub_moved_to", { name: workspace.name }));
    });

  const submitRename = () => {
    const name = newName.trim();
    if (!name) return;
    const diagram = renaming;
    setRenaming(null);
    runAndRefresh(() => diagramsApi.update(diagram.diagramId, { name }));
  };

  const toggleTheme = () =>
    setSettings((prev) => ({
      ...prev,
      mode: prev.mode === "dark" ? "light" : "dark",
    }));

  const workspaceMenu = selected && (
    <Dropdown.Menu>
      <Dropdown.Item
        onClick={() => setWorkspaceModal({ workspace: selected })}
        disabled={!selected.unlocked}
      >
        {t("hub_edit_workspace")}
      </Dropdown.Item>
      {selected.protected && selected.unlocked && (
        <Dropdown.Item
          onClick={() => {
            workspacesApi.lock(selected.id);
            loadWorkspaces();
          }}
        >
          {t("hub_lock_now")}
        </Dropdown.Item>
      )}
      <Dropdown.Divider />
      <Dropdown.Item
        type="danger"
        onClick={confirmDeleteWorkspace}
        disabled={!selected.unlocked}
      >
        {t("hub_delete_workspace")}
      </Dropdown.Item>
    </Dropdown.Menu>
  );

  return (
    <div className="theme h-screen flex md:flex-col md:h-auto md:min-h-screen">
      <aside className="w-64 md:w-full shrink-0 flex flex-col border-e md:border-e-0 md:border-b border-(--semi-color-border) bg-(--semi-color-bg-1)">
        <div className="px-4 py-4 flex items-center justify-between">
          <Link to="/" aria-label="drawDB">
            <img
              src={settings.mode === "dark" ? logo_dark : logo_light}
              alt="drawDB"
              className="h-8"
            />
          </Link>
          <Button
            theme="borderless"
            type="tertiary"
            onClick={toggleTheme}
            aria-label={t("theme")}
            icon={
              <i
                className={
                  settings.mode === "dark" ? "bi bi-sun" : "bi bi-moon-stars"
                }
              />
            }
          />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-(--semi-color-text-2)">
          {t("hub_workspaces")}
          <Button
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => setWorkspaceModal({ workspace: null })}
            aria-label={t("hub_new_workspace")}
            icon={<i className="bi bi-plus-lg" />}
          />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4 md:flex md:overflow-x-auto md:gap-1 md:pb-3">
          {workspaces?.map((w) => (
            <button
              key={w.id}
              onClick={() => selectWorkspace(w.id)}
              aria-current={w.id === selectedId ? "page" : undefined}
              className={`w-full md:w-auto md:shrink-0 flex items-center gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors ${
                w.id === selectedId
                  ? "bg-(--semi-color-primary-light-default) text-(--semi-color-primary) font-medium"
                  : "hover:bg-(--semi-color-fill-0)"
              }`}
            >
              <i
                className={`bi ${
                  w.protected
                    ? w.unlocked
                      ? "bi-unlock"
                      : "bi-lock-fill"
                    : "bi-folder2"
                }`}
              />
              <span className="flex-1 truncate">{w.name}</span>
              {w.diagramCount != null && (
                <span className="text-xs text-(--semi-color-text-2)">
                  {w.diagramCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden md:overflow-visible">
        {error && (
          <Banner
            type="danger"
            closeIcon={null}
            description={
              <span>
                {t("hub_server_unreachable", { url: backendUrl })}{" "}
                <Button size="small" onClick={loadWorkspaces}>
                  {t("hub_retry")}
                </Button>
              </span>
            }
          />
        )}

        {selected && (
          <header className="flex items-center gap-3 px-8 md:px-4 py-4 border-b border-(--semi-color-border) lg:flex-wrap">
            <h1 className="text-xl font-semibold truncate flex items-center gap-2 min-w-0">
              {selected.protected && (
                <i
                  className={`bi ${selected.unlocked ? "bi-unlock" : "bi-lock-fill"} text-base text-(--semi-color-text-2)`}
                />
              )}
              <span className="truncate">{selected.name}</span>
            </h1>
            <Dropdown
              trigger="click"
              position="bottomLeft"
              render={workspaceMenu}
            >
              <Button
                theme="borderless"
                type="tertiary"
                aria-label={t("hub_workspace_actions")}
                icon={<i className="bi bi-three-dots" />}
              />
            </Dropdown>
            <div className="flex-1" />
            {selected.unlocked && (
              <>
                <Input
                  className="max-w-64 lg:max-w-none lg:w-full lg:order-last"
                  prefix={<i className="bi bi-search mx-2" />}
                  placeholder={t("hub_search")}
                  value={query}
                  onChange={setQuery}
                  showClear
                  aria-label={t("hub_search")}
                />
                <Link to="/templates">
                  <Button>{t("hub_from_template")}</Button>
                </Link>
                <Button
                  theme="solid"
                  icon={<i className="bi bi-plus-lg" />}
                  onClick={newDiagram}
                >
                  {t("hub_new_diagram")}
                </Button>
              </>
            )}
          </header>
        )}

        <section className="flex-1 overflow-y-auto px-8 md:px-4 py-6">
          {!workspaces && !error && (
            <div className="flex justify-center py-20">
              <Spin size="large" />
            </div>
          )}
          {selected && !selected.unlocked && (
            <UnlockPanel
              key={selected.id}
              workspace={selected}
              onUnlock={unlock}
            />
          )}
          {selected?.unlocked && diagrams === null && (
            <div className="flex justify-center py-20">
              <Spin size="large" />
            </div>
          )}
          {selected?.unlocked && diagrams?.length === 0 && (
            <div className="mt-24 md:mt-12 flex flex-col items-center gap-3 text-center">
              <i className="bi bi-diagram-3 text-5xl text-(--semi-color-text-2)" />
              <div className="text-lg font-semibold">
                {t("hub_empty_title")}
              </div>
              <div className="text-sm text-(--semi-color-text-2)">
                {t("hub_empty_hint")}
              </div>
              <Button theme="solid" onClick={newDiagram}>
                {t("hub_new_diagram")}
              </Button>
            </div>
          )}
          {selected?.unlocked && diagrams?.length > 0 && (
            <>
              {visibleDiagrams.length === 0 && (
                <div className="text-center text-(--semi-color-text-2) py-12">
                  {t("hub_no_matches", { query })}
                </div>
              )}
              <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
                {visibleDiagrams.map((d) => (
                  <DiagramCard
                    key={d.diagramId}
                    diagram={d}
                    theme={settings.mode}
                    workspaces={workspaces}
                    onOpen={openDiagram}
                    onRename={(diagram) => {
                      setNewName(diagram.name);
                      setRenaming(diagram);
                    }}
                    onMove={moveDiagram}
                    onDelete={confirmDeleteDiagram}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      <WorkspaceModal
        visible={workspaceModal !== null}
        workspace={workspaceModal?.workspace}
        onSubmit={submitWorkspace}
        onCancel={() => setWorkspaceModal(null)}
      />
      <Modal
        centered
        visible={renaming !== null}
        title={t("rename_diagram")}
        okText={t("save")}
        cancelText={t("cancel")}
        onOk={submitRename}
        onCancel={() => setRenaming(null)}
        okButtonProps={{ disabled: !newName.trim() }}
      >
        <Input
          autoFocus
          value={newName}
          onChange={setNewName}
          onEnterPress={submitRename}
          aria-label={t("name")}
        />
      </Modal>
    </div>
  );
}
