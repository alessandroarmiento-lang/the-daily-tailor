"use client";

import { useEffect } from "react";

/** Registers the offline service worker (Add to Home Screen / Safari). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const url = "/sw.js";
    navigator.serviceWorker
      .register(url, { updateViaCache: "none" })
      .then((reg) => {
        void reg.update();
      })
      .catch(() => {
        // Silent: SW is best-effort on iOS.
      });

    // Drop obsolete shell/data caches from earlier SW versions that could
    // serve a stuck document (stale HTML → dead /_next CSS → precip “h07%0”).
    if ("caches" in window) {
      void caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith("daily-tailor-") &&
                k !== "daily-tailor-shell-v5" &&
                k !== "daily-tailor-data-v2",
            )
            .map((k) => caches.delete(k)),
        ),
      );
    }
  }, []);

  return null;
}
