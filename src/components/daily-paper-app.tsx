"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditionSheet } from "@/components/edition-sheet";
import { MorningReload } from "@/components/morning-reload";
import { PrintToolbar } from "@/components/print-toolbar";
import { LanguageProvider, useLang } from "@/lib/i18n/provider";
import type { NewspaperEdition } from "@/lib/edition-types";
import { loadEditionForClient } from "@/lib/offline-editions";
import {
  readWeatherGeoOverride,
  refreshWeatherFromGeolocation,
} from "@/lib/refresh-weather-geo";
import type { SectionResult, WeatherSnapshot } from "@/lib/weather/types";

type Props = {
  /** "today" or YYYY-MM-DD */
  dateKey: "today" | string;
  timezone: string;
  showHistoryLink?: boolean;
  /** Server-rendered edition so Safari never sticks on loading if client fetch stalls. */
  initialEdition?: NewspaperEdition | null;
};

/** Match deploy scripts; IMAP/CalDAV rebuilds can be slow but must not hang forever. */
const WARM_TIMEOUT_MS = 120_000;

function DailyPaperAppInner({
  dateKey,
  timezone,
  showHistoryLink = true,
  initialEdition = null,
}: Props) {
  const { t } = useLang();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [edition, setEdition] = useState<NewspaperEdition | null>(
    initialEdition,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialEdition);
  /** AGGIORNA spinner — kept separate from first-load so a hung warm cannot look like a loop. */
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Kept beside the edition, not merged into it: a later edition load
   * (network, AGGIORNA) must not put the 06:00 snapshot back on screen.
   */
  const [geoWeather, setGeoWeather] =
    useState<SectionResult<WeatherSnapshot> | null>(null);

  const refreshGen = useRef(0);

  const refreshWeatherGeo = useCallback(async () => {
    if (dateKey !== "today") return;
    try {
      const outcome = await refreshWeatherFromGeolocation({
        override:
          typeof window === "undefined"
            ? null
            : readWeatherGeoOverride(window.location.search),
      });
      if (outcome.weather?.data) setGeoWeather(outcome.weather);
    } catch {
      // Keep edition weather; silent — no toolbar status line.
    }
  }, [dateKey]);

  const refresh = useCallback(
    async (options?: { forceRebuild?: boolean }) => {
      const force = Boolean(options?.forceRebuild);
      const gen = ++refreshGen.current;

      if (force) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        // AGGIORNA on "today" must rebuild live data (not only re-read disk/IDB).
        if (force && dateKey === "today") {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS);
          try {
            const warm = await fetch("/api/morning-warm?force=1", {
              cache: "no-store",
              headers: { "Cache-Control": "no-cache" },
              signal: controller.signal,
            });
            if (!warm.ok) {
              throw new Error(
                tRef.current("warmFail", { status: warm.status }),
              );
            }
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              throw new Error(tRef.current("warmTimeout"));
            }
            throw err;
          } finally {
            clearTimeout(timer);
          }
        }

        if (gen !== refreshGen.current) return;

        const result = await loadEditionForClient(dateKey);
        if (gen !== refreshGen.current) return;

        // Keep SSR / previous sheet if network+IDB both miss — don't blank the page.
        setEdition((prev) => result.edition ?? prev);
        setError(result.edition ? null : (result.error ?? null));
        // AGGIORNA rebuilds from the stored fix, so take a fresh one too.
        if (force && dateKey === "today") {
          void refreshWeatherGeo();
        }
      } catch (err) {
        if (gen !== refreshGen.current) return;
        setError(
          err instanceof Error ? err.message : tRef.current("loadFail"),
        );
      } finally {
        // Always clear both flags for the latest generation so a force rebuild
        // that supersedes the mount load cannot leave loading stuck true.
        if (gen !== refreshGen.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateKey, refreshWeatherGeo],
  );

  // Position runs alongside the edition fetch: with permission already granted
  // the sheet shows the current place as soon as the fix lands, not at 06:00.
  // Intentionally omit `t` from refresh deps so IT/EN switch does not re-warm.
  useEffect(() => {
    void refresh();
    void refreshWeatherGeo();
  }, [refresh, refreshWeatherGeo]);

  const sheetEdition =
    edition && geoWeather?.data ? { ...edition, weather: geoWeather } : edition;
  const showLoading = loading && !edition;

  return (
    <>
      <PrintToolbar
        onRefresh={() => {
          if (refreshing) return;
          void refresh({ forceRebuild: true });
        }}
        refreshing={refreshing}
        statusMessage={edition ? error : null}
        historyHref={showHistoryLink ? "/storia" : undefined}
        canExportPdf={Boolean(edition)}
        pdfFileStem={
          edition
            ? `the-daily-tailor-${edition.dateKey}`
            : "the-daily-tailor"
        }
      />
      {showLoading ? (
        <main className="sheet-page">
          <p className="state-line">{t("loadingApp")}</p>
        </main>
      ) : null}
      {!loading && !edition ? (
        <main className="sheet-page">
          <p className="state-line state-line--error">
            {error ?? t("noEdition")}
          </p>
          <p className="state-line">{t("noEditionHint")}</p>
        </main>
      ) : null}
      {sheetEdition ? (
        <>
          <EditionSheet
            edition={sheetEdition}
            weatherLocationNote={null}
          />
          {dateKey === "today" ? (
            <MorningReload
              editionDateKey={sheetEdition.dateKey}
              timezone={timezone}
            />
          ) : null}
        </>
      ) : null}
      {dateKey !== "today" ? (
        <p className="no-print history-back">
          <Link href="/">{t("backToday")}</Link>
        </p>
      ) : null}
    </>
  );
}


export function DailyPaperApp(props: Props) {
  return (
    <LanguageProvider>
      <DailyPaperAppInner {...props} />
    </LanguageProvider>
  );
}
