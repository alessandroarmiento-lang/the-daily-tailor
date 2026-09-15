"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EditionSheet } from "@/components/edition-sheet";
import { MorningReload } from "@/components/morning-reload";
import { PrintToolbar } from "@/components/print-toolbar";
import type { NewspaperEdition } from "@/lib/edition-types";
import {
  loadEditionForClient,
  type EditionLoadSource,
} from "@/lib/offline-editions";

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
  const [source, setSource] = useState<EditionLoadSource>("none");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadEditionForClient(dateKey);
    setEdition(result.edition);
    setSource(result.source);
    setError(result.error ?? null);
    setLoading(false);
  }, [dateKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const sourceNote =
    source === "local"
      ? "Copia locale (offline)"
      : source === "network"
        ? "Edizione del mattino"
        : undefined;

  const statusLine = loading
    ? "Caricamento edizione…"
    : !edition
      ? error ?? "Edizione non disponibile"
      : source === "local"
        ? online
          ? "Mostrata dalla memoria del telefono"
          : "Offline · edizione salvata sul dispositivo"
        : "Aggiornata dal server · salvata per uso offline";

  return (
    <>
      <PrintToolbar
        statusLine={statusLine}
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
          <EditionSheet edition={edition} sourceNote={sourceNote} />
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
