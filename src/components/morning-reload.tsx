"use client";

import { useEffect } from "react";
import {
  EDITION_ROLLOVER_HOUR,
  getEditionDateKey,
  getNextEditionRollover,
} from "@/lib/edition";

type Props = {
  /** Edition key baked at server render (YYYY-MM-DD after 06:00 rollover). */
  editionDateKey: string;
  timezone: string;
};

/**
 * If the tab stays open overnight, reload shortly after the 06:00 edition flip
 * so weather / news / aphorism match the new morning sheet.
 */
export function MorningReload({ editionDateKey, timezone }: Props) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const reload = () => {
      if (!cancelled) window.location.reload();
    };

    const schedule = () => {
      const next = getNextEditionRollover(
        new Date(),
        timezone,
        EDITION_ROLLOVER_HOUR,
      );
      const delay = Math.max(5_000, next.getTime() - Date.now() + 2_000);
      timer = setTimeout(reload, delay);
    };

    schedule();

    poll = setInterval(() => {
      const current = getEditionDateKey(
        new Date(),
        timezone,
        EDITION_ROLLOVER_HOUR,
      );
      if (current !== editionDateKey) reload();
    }, 60_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
    };
  }, [editionDateKey, timezone]);

  return null;
}
