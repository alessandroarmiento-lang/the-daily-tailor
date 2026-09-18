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
 */
export function NativeOpenLink({
  href,
  payload,
  className,
  children,
}: Props) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Always intercept: even with a good href, custom schemes leave the
    // browser grey when the target app is already open.
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
