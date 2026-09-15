"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EditionSheet } from "@/components/edition-sheet";
import { MorningReload } from "@/components/morning-reload";
import { PrintToolbar } from "@/components/print-toolbar";
import type { NewspaperEdition } from "@/lib/edition-types";
import { loadEditionForClient } from "@/lib/offline-editions";

type Props = {
  /** "today" or YYYY-MM-DD */
  dateKey: "today" | string;
  timezone: string;
  showHistoryLink?: boolean;
};

export function DailyPaperApp({
  dateKey,
  timezone,
  showHistoryLink = true,
}: Props) {
  const [edition, setEdition] = useState<NewspaperEdition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadEditionForClient(dateKey);
    setEdition(result.edition);
    setError(result.error ?? null);
    setLoading(false);
  }, [dateKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <PrintToolbar
        onRefresh={() => void refresh()}
        historyHref={showHistoryLink ? "/storia" : undefined}
        canPrint={Boolean(edition)}
      />
      {loading && !edition ? (
        <main className="sheet-page">
          <p className="state-line">Caricamento The Daily Tailor…</p>
        </main>
      ) : null}
      {!loading && !edition ? (
        <main className="sheet-page">
          <p className="state-line state-line--error">
            {error ?? "Nessuna edizione disponibile."}
          </p>
          <p className="state-line">
            Apri l’app dopo le 06:00 (con rete) per scaricare il giornale del
            giorno, oppure genera sul Mac con{" "}
            <code>/api/morning-warm</code>.
          </p>
        </main>
      ) : null}
      {edition ? (
        <>
          <EditionSheet edition={edition} />
          {dateKey === "today" ? (
            <MorningReload
              editionDateKey={edition.dateKey}
              timezone={timezone}
            />
          ) : null}
        </>
      ) : null}
      {dateKey !== "today" ? (
        <p className="no-print history-back">
          <Link href="/">Torna a oggi</Link>
        </p>
      ) : null}
    </>
  );
}
