"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/provider";

const PUSH_FLAG = "tdt-push-subscribed-v1";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * iOS often blocks Notification.requestPermission outside a tap.
 * One banner until subscribed or dismissed.
 */
export function OfflinePushPrompt() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
    const flag = localStorage.getItem(PUSH_FLAG);
    if (flag === "1" || flag === "denied" || flag === "dismissed") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (!standalone && Notification.permission !== "granted") {
      // Still show on first Home Screen-like use; skip plain Safari tabs.
      return;
    }
    if (Notification.permission === "granted") {
      // Subscription may still be missing — keep banner until flag is 1.
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  async function enable() {
    setBusy(true);
    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        localStorage.setItem(PUSH_FLAG, "denied");
        setVisible(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapidRes = await fetch("/api/push/vapid", { cache: "no-store" });
      if (!vapidRes.ok) {
        setVisible(false);
        return;
      }
      const vapid = (await vapidRes.json()) as { publicKey?: string };
      if (!vapid.publicKey) {
        setVisible(false);
        return;
      }
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
      setVisible(false);
    } catch {
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(PUSH_FLAG, "dismissed");
    setVisible(false);
  }

  return (
    <div className="no-print offline-push-prompt" role="status">
      <p className="offline-push-prompt__text">{t("pushPrompt")}</p>
      <div className="offline-push-prompt__actions">
        <button
          type="button"
          className="toolbar__btn"
          disabled={busy}
          onClick={() => {
            void enable();
          }}
        >
          {busy ? t("pushEnabling") : t("pushEnable")}
        </button>
        <button
          type="button"
          className="toolbar__btn toolbar__btn--ghost"
          disabled={busy}
          onClick={dismiss}
        >
          {t("pushLater")}
        </button>
      </div>
    </div>
  );
}
