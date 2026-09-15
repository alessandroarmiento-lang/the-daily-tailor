"use client";

import { useEffect } from "react";

/** Registers the offline service worker (Add to Home Screen / Safari). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const url = "/sw.js";
    navigator.serviceWorker.register(url).catch(() => {
      // Silent: SW is best-effort on iOS.
    });
  }, []);

  return null;
}
