"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ServiceWorkerRegister } from "@/components/sw-register";
import type { EditionListItem } from "@/lib/edition-types";
import { listLocalEditions } from "@/lib/offline-editions";
import { LanguageProvider, useLang } from "@/lib/i18n/provider";

function formatDate(dateKey: string, locale: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const instant = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Rome",
  }).format(instant);
}

function StoriaPageInner() {
  const { t, locale, lang, setLang } = useLang();
  const [serverItems, setServerItems] = useState<EditionListItem[]>([]);
  const [localItems, setLocalItems] = useState<EditionListItem[]>([]);
  const [todayKey, setTodayKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/editions", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          items?: EditionListItem[];
          todayKey?: string;
        };
        if (cancelled) return;
        setServerItems(data.items ?? []);
        setTodayKey(data.todayKey ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("loadFail"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        const local = await listLocalEditions();
        if (!cancelled) setLocalItems(local);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const merged = useMemo(() => {
    const map = new Map<string, EditionListItem & { local?: boolean }>();
    for (const item of serverItems) map.set(item.dateKey, { ...item });
    for (const item of localItems) {
      const prev = map.get(item.dateKey);
      if (prev) map.set(item.dateKey, { ...prev, local: true });
      else map.set(item.dateKey, { ...item, local: true });
    }
    return [...map.values()].sort((a, b) =>
      a.dateKey < b.dateKey ? 1 : -1,
    );
  }, [serverItems, localItems]);

  return (
    <>
      <ServiceWorkerRegister />
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
        <div className="toolbar__copy">
          <p className="toolbar__hint">{t("historyTitle")}</p>
          <p className="toolbar__status">
            {loading
              ? t("loading")
              : error ?? t("daysCount", { n: merged.length })}
          </p>
        </div>
        <div className="toolbar__actions">
          <Link className="toolbar__btn" href="/">
            {t("backToday")}
          </Link>
        </div>
      </div>

      <main className="history-page">
        <h1 className="history-page__title">{t("historyTitle")}</h1>
        <p className="history-page__lead">{t("historyHint")}</p>
        {merged.length === 0 && !loading ? (
          <p className="state-line">{t("historyEmpty")}</p>
        ) : (
          <ul className="history-list">
            {merged.map((item) => (
              <li key={item.dateKey} className="history-list__item">
                <Link
                  href={
                    item.dateKey === todayKey
                      ? "/"
                      : `/edizione/${item.dateKey}`
                  }
                  className="history-list__link"
                >
                  <span className="history-list__date">
                    {formatDate(item.dateKey, locale)}
                  </span>
                  <span className="history-list__meta">
                    {item.dateKey}
                    {item.dateKey === todayKey ? ` · ${t("todayPrefix").replace(" · ", "")}` : ""}
                    {item.local ? (lang === "en" ? " · on device" : " · sul dispositivo") : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

export default function StoriaPage() {
  return (
    <LanguageProvider>
      <StoriaPageInner />
    </LanguageProvider>
  );
}
