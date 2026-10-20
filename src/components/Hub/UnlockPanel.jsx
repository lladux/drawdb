import { useState } from "react";
import { Button, Input } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";

export default function UnlockPanel({ workspace, onUnlock }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    const ok = await onUnlock(password).finally(() => setBusy(false));
    if (!ok) {
      setWrong(true);
      setPassword("");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-24 md:mt-12 w-full max-w-sm flex flex-col items-center gap-4 text-center"
    >
      <i className="bi bi-lock text-5xl text-(--semi-color-text-2)" />
      <div>
        <div className="text-lg font-semibold">{workspace.name}</div>
        <div className="text-sm text-(--semi-color-text-2)">
          {t("hub_locked_hint")}
        </div>
      </div>
      <Input
        mode="password"
        autoFocus
        value={password}
        onChange={(v) => {
          setPassword(v);
          setWrong(false);
        }}
        placeholder={t("password")}
        validateStatus={wrong ? "error" : "default"}
        aria-label={t("password")}
      />
      {wrong && (
        <div className="text-sm text-(--semi-color-danger)" role="alert">
          {t("hub_wrong_password")}
        </div>
      )}
      <Button
        htmlType="submit"
        theme="solid"
        block
        loading={busy}
        disabled={!password}
      >
        {t("hub_unlock")}
      </Button>
    </form>
  );
}
