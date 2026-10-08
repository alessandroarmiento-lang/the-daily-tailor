"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditionSheet } from "@/components/edition-sheet";
import { MorningReload } from "@/components/morning-reload";
import { PrintToolbar } from "@/components/print-toolbar";
import { LanguageProvider, useLang } from "@/lib/i18n/provider";
import type { NewspaperEdition } from "@/lib/edition-types";
import { fetchWithBudget } from "@/lib/fetch-with-budget";
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

/**
 * Mobile AGGIORNA must not wait for a hung Fly IMAP/CalDAV rebuild.
 * Production morning-warm often exceeds 30s; keep the toolbar responsive.
 */
const WARM_BUDGET_MS = 12_000;
/** Absolute UI escape hatch if anything above misbehaves on iOS. */
const REFRESH_SAFETY_MS = 18_000;

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
  /** AGGIORNA spinner — kept separate from first-load. */
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

      const safety = window.setTimeout(() => {
        if (gen !== refreshGen.current) return;
        setLoading(false);
        setRefreshing(false);
      }, REFRESH_SAFETY_MS);

      try {
        // Best-effort rebuild: never throw on hang/timeout — always re-pull the sheet.
        let warmNote: string | null = null;
        if (force && dateKey === "today") {
          const warm = await fetchWithBudget(
            "/api/morning-warm?force=1",
            {
              cache: "no-store",
              headers: { "Cache-Control": "no-cache" },
            },
            WARM_BUDGET_MS,
          );
          if (!warm) {
            warmNote = tRef.current("warmTimeout");
          } else if (!warm.ok) {
            warmNote = tRef.current("warmFail", { status: warm.status });
          }
        }

        if (gen !== refreshGen.current) return;

        const result = await loadEditionForClient(dateKey);
        if (gen !== refreshGen.current) return;

        // Keep SSR / previous sheet if network+IDB both miss — don't blank the page.
        setEdition((prev) => result.edition ?? prev);
        if (result.edition) {
          setError(warmNote);
        } else {
          setError(result.error ?? warmNote);
        }
        // AGGIORNA: take a fresh GPS meteo even if warm was slow.
        if (force && dateKey === "today") {
          void refreshWeatherGeo();
        }
      } catch (err) {
        if (gen !== refreshGen.current) return;
        setError(
          err instanceof Error ? err.message : tRef.current("loadFail"),
        );
      } finally {
        window.clearTimeout(safety);
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
