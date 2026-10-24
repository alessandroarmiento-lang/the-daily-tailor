"use client";

import type { MouseEvent, ReactNode } from "react";
import {
  apriBridgeHref,
  isAppleTouchClient,
  tryNativeOpen,
  type NativeOpenPayload,
} from "@/lib/apple/deep-links";

type Props = {
  href?: string;
  payload: NativeOpenPayload;
  className?: string;
  children: ReactNode;
};

function isHttps(href?: string): boolean {
  return Boolean(href?.startsWith("https://") || href?.startsWith("http://"));
}

/**
 * Prefer the Mac local opener (exact item + activate). On iPhone, custom
 * schemes cannot be opened from the Home Screen PWA (Safari: “indirizzo non
 * è valido”) — use same-origin `/apri` with target=_blank so Safari hands
 * off to Reminders / Calendar.
 */
export function NativeOpenLink({
  href,
  payload,
  className,
  children,
}: Props) {
  const http = isHttps(href);
  // SSR-safe: always use /apri for non-http schemes (same markup on server + client).
  const anchorHref = http ? href! : apriBridgeHref(payload, href);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (http) {
      return;
    }

    // iPhone / iPad: let target=_blank open /apri in Safari, which redirects
    // to the native scheme. Do not preventDefault (keeps the gesture).
    if (isAppleTouchClient()) {
      return;
    }

    // Mac desktop: local helper / tdt-open.
    event.preventDefault();
    void (async () => {
      const handled = await tryNativeOpen(payload);
      if (handled) return;
      window.location.href = anchorHref;
    })();
  };

  return (
    <a
      href={anchorHref}
      className={className}
      onClick={onClick}
      target={http ? undefined : "_blank"}
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
