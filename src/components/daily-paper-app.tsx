"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

function DailyPaperAppInner({
  dateKey,
  timezone,
  showHistoryLink = true,
  initialEdition = null,
}: Props) {
  const { t } = useLang();
  const [edition, setEdition] = useState<NewspaperEdition | null>(
    initialEdition,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialEdition);
  /**
   * Kept beside the edition, not merged into it: a later edition load
   * (network, AGGIORNA) must not put the 06:00 snapshot back on screen.
   */
  const [geoWeather, setGeoWeather] =
    useState<SectionResult<WeatherSnapshot> | null>(null);

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
            throw new Error(t("warmFail", { status: warm.status }));
          }
        }
        const result = await loadEditionForClient(dateKey);
        // Keep SSR / previous sheet if network+IDB both miss — don't blank the page.
        setEdition((prev) => result.edition ?? prev);
        setError(result.edition ? null : (result.error ?? null));
        // AGGIORNA rebuilds from the stored fix, so take a fresh one too.
        if (options?.forceRebuild && dateKey === "today") {
          void refreshWeatherGeo();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("loadFail"),
        );
      } finally {
        setLoading(false);
      }
    },
    [dateKey, refreshWeatherGeo, t],
  );

  // Position runs alongside the edition fetch: with permission already granted
  // the sheet shows the current place as soon as the fix lands, not at 06:00.
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
