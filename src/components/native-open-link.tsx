"use client";

import type { MouseEvent, ReactNode } from "react";
import {
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
 * (Gmail https, message:, reminderkit, ical) when the helper is offline.
 *
 * https links (Gmail rfc822msgid, Google Calendar) open directly in the
 * browser — Safari can navigate HTTPS; no helper needed.
 */
export function NativeOpenLink({
  href,
  payload,
  className,
  children,
}: Props) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void (async () => {
      if (href?.startsWith("https://")) {
        window.location.href = href;
        return;
      }
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
