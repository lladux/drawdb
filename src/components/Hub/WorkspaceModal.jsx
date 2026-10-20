import { useEffect, useState } from "react";
import { Checkbox, Input, Modal, RadioGroup, Radio } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";

const KEEP = "keep";
const CHANGE = "change";
const REMOVE = "remove";

// Creates a workspace (no `workspace` prop) or edits one. Calls onSubmit with
// { name, password }, where password is undefined to keep the current one and
// "" to remove it.
export default function WorkspaceModal({
  visible,
  workspace,
  onSubmit,
  onCancel,
}) {
  const { t } = useTranslation();
  const editing = Boolean(workspace);
  const [name, setName] = useState("");
  const [passwordMode, setPasswordMode] = useState(KEEP);
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(workspace?.name ?? "");
    setPasswordMode(KEEP);
    setProtect(false);
    setPassword("");
    setConfirm("");
  }, [visible, workspace]);

  const settingPassword = editing
    ? workspace.protected
      ? passwordMode === CHANGE
      : protect
    : protect;
  const mismatch = settingPassword && confirm !== "" && password !== confirm;
  const valid =
    name.trim() !== "" &&
    (!settingPassword || (password !== "" && password === confirm));

  const submit = async () => {
    if (!valid) return;
    let nextPassword;
    if (settingPassword) nextPassword = password;
    else if (editing && workspace.protected && passwordMode === REMOVE)
      nextPassword = "";
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), password: nextPassword });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      centered
      visible={visible}
      title={editing ? t("hub_edit_workspace") : t("hub_new_workspace")}
      okText={editing ? t("save") : t("create")}
      cancelText={t("cancel")}
      onOk={submit}
      onCancel={onCancel}
      okButtonProps={{ disabled: !valid, loading: busy }}
    >
      <div className="flex flex-col gap-4 pb-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("name")}</span>
          <Input
            autoFocus
            value={name}
            maxLength={100}
            onChange={setName}
            onEnterPress={submit}
          />
        </label>

        {editing && workspace.protected ? (
          <RadioGroup
            direction="vertical"
            value={passwordMode}
            onChange={(e) => setPasswordMode(e.target.value)}
          >
            <Radio value={KEEP}>{t("hub_keep_password")}</Radio>
            <Radio value={CHANGE}>{t("hub_change_password")}</Radio>
            <Radio value={REMOVE}>{t("hub_remove_password")}</Radio>
          </RadioGroup>
        ) : (
          <Checkbox
            checked={protect}
            onChange={(e) => setProtect(e.target.checked)}
          >
            {t("hub_protect_with_password")}
          </Checkbox>
        )}

        {settingPassword && (
          <>
            <Input
              mode="password"
              value={password}
              onChange={setPassword}
              placeholder={t("password")}
              aria-label={t("password")}
            />
            <Input
              mode="password"
              value={confirm}
              onChange={setConfirm}
              onEnterPress={submit}
              placeholder={t("hub_confirm_password")}
              aria-label={t("hub_confirm_password")}
              validateStatus={mismatch ? "error" : "default"}
            />
            {mismatch && (
              <div className="text-sm text-(--semi-color-danger)">
                {t("hub_passwords_dont_match")}
              </div>
            )}
            <div className="text-xs text-(--semi-color-text-2)">
              {t("hub_password_warning")}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
