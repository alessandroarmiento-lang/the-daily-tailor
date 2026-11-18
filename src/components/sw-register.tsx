"use client";

import { useEffect } from "react";

const PUSH_FLAG = "tdt-push-subscribed-v1";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function collectAssetUrls(): string[] {
  const urls = new Set<string>();
  if (typeof document === "undefined") return [];
  document
    .querySelectorAll("script[src], link[rel='stylesheet'], link[rel='preload']")
    .forEach((el) => {
      const href =
        (el as HTMLScriptElement).src ||
        (el as HTMLLinkElement).href ||
        el.getAttribute("href") ||
        "";
      if (href) urls.add(href);
    });
  try {
    for (const entry of performance.getEntriesByType("resource")) {
      const name = (entry as PerformanceResourceTiming).name;
      if (name.includes("/_next/static/") || name.includes("/icon")) {
        urls.add(name);
      }
    }
  } catch {
    /* ignore */
  }
  urls.add("/");
  urls.add("/storia");
  urls.add("/manifest.webmanifest");
  return [...urls];
}

async function precacheNow(reg: ServiceWorkerRegistration): Promise<void> {
  const worker = reg.active || navigator.serviceWorker.controller;
  if (!worker) return;
  worker.postMessage({ type: "PRECACHE", urls: collectAssetUrls() });
  worker.postMessage({ type: "PREFETCH_EDITION" });
}

async function ensurePushSubscription(
  reg: ServiceWorkerRegistration,
): Promise<void> {
  if (!("PushManager" in window) || !("Notification" in window)) return;

  // Already subscribed this browser profile — refresh endpoint quietly.
  if (localStorage.getItem(PUSH_FLAG) === "1") {
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(existing.toJSON()),
        });
      }
    } catch {
      /* ignore */
    }
    return;
  }

  // One prompt max. If denied, never ask again from this code path.
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    localStorage.setItem(PUSH_FLAG, "denied");
    return;
  }

  const vapidRes = await fetch("/api/push/vapid", { cache: "no-store" });
  if (!vapidRes.ok) return;
  const vapid = (await vapidRes.json()) as { publicKey?: string };
  if (!vapid.publicKey) return;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      vapid.publicKey,
    ) as BufferSource,
  });

  const save = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (save.ok) localStorage.setItem(PUSH_FLAG, "1");
}

/** Registers the offline service worker (Add to Home Screen / Safari). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const url = "/sw.js";
    navigator.serviceWorker
      .register(url, { updateViaCache: "none" })
      .then(async (reg) => {
        void reg.update();
        await precacheNow(reg);
        // Standalone / Home Screen only — avoid prompting in desktop Safari tabs.
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          ("standalone" in navigator &&
            Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
        if (standalone || localStorage.getItem(PUSH_FLAG) === "1") {
          await ensurePushSubscription(reg);
        } else if (localStorage.getItem(PUSH_FLAG) !== "denied") {
          // First visits from Safari: still precache; push after Add to Home.
          // If already granted (rare), subscribe anyway.
          if (Notification.permission === "granted") {
            await ensurePushSubscription(reg);
          }
        }
      })
      .catch(() => {
        // Silent: SW is best-effort on iOS.
      });
  }, []);

  return null;
}
