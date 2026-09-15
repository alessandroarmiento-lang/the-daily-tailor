"use client";

import Link from "next/link";
import { useState } from "react";
import { exportEditionPdf } from "@/lib/export-edition-pdf";

type Props = {
  onRefresh?: () => void;
  historyHref?: string;
  /** PDF export is optional and manual — never auto-invoked. */
  canExportPdf?: boolean;
  /** Used for the downloaded filename, e.g. the-daily-tailor-2026-09-15 */
  pdfFileStem?: string;
};

/**
 * Screen-only chrome. Left side stays empty — actions only on the right.
 * PDF captures the on-screen sheet (no browser print dialog).
 */
export function PrintToolbar({
  onRefresh,
  historyHref,
  canExportPdf = true,
  pdfFileStem = "the-daily-tailor",
}: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handlePdf() {
    if (!canExportPdf || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportEditionPdf(pdfFileStem);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Esportazione PDF fallita",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="no-print toolbar">
      <span className="toolbar__spacer" aria-hidden="true" />
      <div className="toolbar__actions">
        {historyHref ? (
          <Link className="toolbar__btn toolbar__btn--ghost" href={historyHref}>
            Storico
          </Link>
        ) : null}
        <button
          type="button"
          className="toolbar__btn toolbar__btn--ghost"
          onClick={() => (onRefresh ? onRefresh() : window.location.reload())}
        >
          Aggiorna
        </button>
        <button
          type="button"
          className="toolbar__btn"
          disabled={!canExportPdf || exporting}
          aria-busy={exporting}
          onClick={() => void handlePdf()}
        >
          {exporting ? "PDF…" : "PDF"}
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
