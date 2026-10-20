import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "../../../../../data/db";
import { useExtensions } from "../../../../../context/ExtensionsContext";

function readError(err) {
  return err?.response?.data?.error || err?.message;
}

export function useDiagramList() {
  const { t } = useTranslation();
  const extensions = useExtensions();
  const cloudList = extensions.cloudList;

  const local = useLiveQuery(() => db.diagrams.toArray(), []);
  const [cloud, setCloud] = useState({
    loading: true,
    error: null,
    items: null,
  });

  useEffect(() => {
    let cancelled = false;
    setCloud({ loading: true, error: null, items: null });
    cloudList()
      .then((items) => {
        if (!cancelled) setCloud({ loading: false, error: null, items });
      })
      .catch((err) => {
        if (!cancelled)
          setCloud({ loading: false, error: err ?? true, items: null });
      });
    return () => {
      cancelled = true;
    };
  }, [cloudList]);

  return {
    loading: cloud.loading || local === undefined,
    error: cloud.error && (readError(cloud.error) || t("failed_to_load_short")),
    cloud: cloud.items ?? [],
    local: local ?? [],
  };
}
