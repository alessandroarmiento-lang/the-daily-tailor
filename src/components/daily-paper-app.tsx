"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EditionSheet } from "@/components/edition-sheet";
import { MorningReload } from "@/components/morning-reload";
import { PrintToolbar } from "@/components/print-toolbar";
import type { NewspaperEdition } from "@/lib/edition-types";
import { loadEditionForClient } from "@/lib/offline-editions";
import {
  refreshWeatherFromGeolocation,
  type WeatherGeoStatus,
} from "@/lib/refresh-weather-geo";

type Props = {
  /** "today" or YYYY-MM-DD */
  dateKey: "today" | string;
  timezone: string;
  showHistoryLink?: boolean;
  /** Server-rendered edition so Safari never sticks on loading if client fetch stalls. */
  initialEdition?: NewspaperEdition | null;
};

export function DailyPaperApp({
  dateKey,
  timezone,
  showHistoryLink = true,
  initialEdition = null,
}: Props) {
  const [edition, setEdition] = useState<NewspaperEdition | null>(
    initialEdition,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialEdition);
  const [geoStatus, setGeoStatus] = useState<WeatherGeoStatus>({
    kind: "idle",
  });

  const refreshWeatherGeo = useCallback(async () => {
    if (dateKey !== "today") return;
    try {
      await refreshWeatherFromGeolocation(setEdition, setGeoStatus);
    } catch {
      setGeoStatus({
        kind: "fallback",
        location: {
          latitude: 45.4642,
          longitude: 9.19,
          city: "Milano",
          source: "default",
          updatedAt: new Date(0).toISOString(),
        },
        note: "Posizione non aggiornata — meteo dell’edizione.",
      });
    }
  }, [dateKey]);

  const refresh = useCallback(
    async (options?: { forceRebuild?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        // AGGIORNA on "today" must rebuild live data (not only re-read disk/IDB).
        if (options?.forceRebuild && dateKey === "today") {
          const warm = await fetch("/api/morning-warm?force=1", {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          });
          if (!warm.ok) {
            throw new Error(`Aggiornamento fallito (HTTP ${warm.status})`);
          }
        }
        const result = await loadEditionForClient(dateKey);
        // Keep SSR / previous sheet if network+IDB both miss — don't blank the page.
        setEdition((prev) => result.edition ?? prev);
        setError(result.edition ? null : (result.error ?? null));
        if (result.edition && dateKey === "today") {
          void refreshWeatherGeo();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Caricamento edizione fallito",
        );
      } finally {
        setLoading(false);
      }
    },
    [dateKey, refreshWeatherGeo],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showLoading = loading && !edition;
  const geoNote =
    geoStatus.kind === "ok" || geoStatus.kind === "fallback"
      ? geoStatus.note
      : geoStatus.kind === "locating"
        ? "Rilevamento posizione…"
        : null;

  return (
    <>
      <PrintToolbar
        onRefresh={() => void refresh({ forceRebuild: true })}
        refreshing={loading && Boolean(edition)}
        historyHref={showHistoryLink ? "/storia" : undefined}
        canExportPdf={Boolean(edition)}
        pdfFileStem={
          edition
            ? `the-daily-tailor-${edition.dateKey}`
            : "the-daily-tailor"
        }
      />
      {geoNote && dateKey === "today" ? (
        <p className="no-print geo-status" role="status">
          {geoNote}
        </p>
      ) : null}
      {showLoading ? (
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
          <EditionSheet
            edition={edition}
            weatherLocationNote={
              geoStatus.kind === "ok" || geoStatus.kind === "fallback"
                ? geoStatus.note
                : null
            }
          />
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
