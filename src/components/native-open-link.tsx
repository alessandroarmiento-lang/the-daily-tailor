"use client";

import type { MouseEvent, ReactNode } from "react";
import {
  isAppleMobileClient,
  tryNativeOpen,
  type NativeOpenPayload,
} from "@/lib/apple/deep-links";

type Props = {
  href?: string;
  payload: NativeOpenPayload;
  className?: string;
  children: ReactNode;
};

/**
 * Prefer the Mac local opener (exact item + activate). Fall back to href
 * (Gmail https, message:, reminderkit, calshow, ical) when the helper is offline.
 *
 * https links (Gmail rfc822msgid, Google Calendar) and iPhone custom schemes
 * must use the default `<a>` navigation: preventDefault + async breaks the
 * user gesture, and Safari / standalone PWA then ignore the scheme.
 */
export function NativeOpenLink({
  href,
  payload,
  className,
  children,
}: Props) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (href?.startsWith("https://") || isAppleMobileClient()) {
      // Synchronous default navigation — keep the tap gesture.
      return;
    }

    event.preventDefault();
    void (async () => {
      const handled = await tryNativeOpen(payload);
      if (handled) return;
      if (href) {
        window.location.href = href;
      }
    })();
  };

  return (
    <a
      href={href || "#"}
      className={className}
      onClick={onClick}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  );
}
