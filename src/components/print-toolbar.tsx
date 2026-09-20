"use client";

import Link from "next/link";
import { useState } from "react";
import { exportEditionPdf } from "@/lib/export-edition-pdf";
import { useLang } from "@/lib/i18n/provider";

type Props = {
  onRefresh?: () => void;
  refreshing?: boolean;
  historyHref?: string;
  canExportPdf?: boolean;
  pdfFileStem?: string;
};

export function PrintToolbar({
  onRefresh,
  refreshing = false,
  historyHref,
  canExportPdf = true,
  pdfFileStem = "the-daily-tailor",
}: Props) {
  const { lang, setLang, t } = useLang();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handlePdf() {
    if (!canExportPdf || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportEditionPdf(pdfFileStem);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("pdfFail"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="no-print toolbar">
      <div className="toolbar__lang" role="group" aria-label={t("langAria")}>
        <button
          type="button"
          className={
            "toolbar__btn toolbar__btn--ghost toolbar__btn--lang" +
            (lang === "it" ? " toolbar__btn--lang-on" : "")
          }
          aria-pressed={lang === "it"}
          onClick={() => setLang("it")}
        >
          IT
        </button>
        <button
          type="button"
          className={
            "toolbar__btn toolbar__btn--ghost toolbar__btn--lang" +
            (lang === "en" ? " toolbar__btn--lang-on" : "")
          }
          aria-pressed={lang === "en"}
          onClick={() => setLang("en")}
        >
          EN
        </button>
      </div>
      <span className="toolbar__spacer" aria-hidden="true" />
      <div className="toolbar__actions">
        {historyHref ? (
          <Link className="toolbar__btn toolbar__btn--ghost" href={historyHref}>
            {t("history")}
          </Link>
        ) : null}
        <button
          type="button"
          className="toolbar__btn toolbar__btn--ghost"
          disabled={refreshing}
          aria-busy={refreshing}
          onClick={() => (onRefresh ? onRefresh() : window.location.reload())}
        >
          {refreshing ? t("refreshing") : t("refresh")}
        </button>
        <button
          type="button"
          className="toolbar__btn"
          disabled={!canExportPdf || exporting}
          aria-busy={exporting}
          onClick={() => void handlePdf()}
        >
          {exporting ? t("pdfBusy") : t("pdf")}
        </button>
      </div>
      {exportError ? (
        <p
          className="toolbar__status"
          role="alert"
          style={{ flexBasis: "100%", textAlign: "right", margin: 0 }}
        >
          {exportError}
        </p>
      ) : null}
    </div>
  );
}
