"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ServiceWorkerRegister } from "@/components/sw-register";
import type { EditionListItem } from "@/lib/edition-types";
import { listLocalEditions } from "@/lib/offline-editions";

function formatIt(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const instant = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Rome",
  }).format(instant);
}

export default function StoriaPage() {
  const [serverItems, setServerItems] = useState<EditionListItem[]>([]);
  const [localItems, setLocalItems] = useState<EditionListItem[]>([]);
  const [todayKey, setTodayKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const local = await listLocalEditions();
      if (!cancelled) setLocalItems(local);

      try {
        const res = await fetch("/api/editions", { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as {
            editions: EditionListItem[];
            todayKey: string;
          };
          if (!cancelled) {
            setServerItems(body.editions ?? []);
            setTodayKey(body.todayKey ?? null);
          }
        } else if (!cancelled) {
          setError("Archivio server non raggiungibile — mostro solo la cache.");
        }
      } catch {
        if (!cancelled) {
          setError("Offline — elenco dalle edizioni salvate sul dispositivo.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = useMemo(() => {
    const map = new Map<string, EditionListItem & { local: boolean }>();
    for (const item of serverItems) {
      map.set(item.dateKey, { ...item, local: false });
    }
    for (const item of localItems) {
      const prev = map.get(item.dateKey);
      if (prev) {
        map.set(item.dateKey, { ...prev, local: true });
      } else {
        map.set(item.dateKey, { ...item, local: true });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.dateKey < b.dateKey ? 1 : -1,
    );
  }, [serverItems, localItems]);

  return (
    <>
      <ServiceWorkerRegister />
      <div className="no-print toolbar">
        <div className="toolbar__copy">
          <p className="toolbar__hint">Storia delle edizioni</p>
          <p className="toolbar__status">
            {loading
              ? "Caricamento…"
              : error ??
                `${merged.length} giornate · apri una copia locale se offline`}
          </p>
        </div>
        <div className="toolbar__actions">
          <Link className="toolbar__btn" href="/">
            Oggi
          </Link>
        </div>
      </div>

      <main className="history-page">
        <h1 className="history-page__title">Edizioni passate</h1>
        <p className="history-page__lead">
          Ogni mattina alle 06:00 (Europe/Rome) il Mac genera lo snapshot. Sul
          telefono l’edizione resta in memoria locale per tutto il giorno.
        </p>
        {merged.length === 0 && !loading ? (
          <p className="state-line">
            Nessuna edizione ancora. Apri oggi online, oppure lancia{" "}
            <code>/api/morning-warm</code> sul Mac.
          </p>
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
                    {formatIt(item.dateKey)}
                  </span>
                  <span className="history-list__meta">
                    {item.dateKey}
                    {item.dateKey === todayKey ? " · oggi" : ""}
                    {item.local ? " · sul dispositivo" : ""}
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
