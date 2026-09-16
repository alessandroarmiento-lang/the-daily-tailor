import { config } from "@/lib/config";
import { remindersAuthMessage } from "@/lib/apple/permissions";
import { CalDavRemindersAdapter } from "./caldav";
import { EventKitRemindersAdapter } from "./eventkit";
import { MockRemindersAdapter } from "./mock";
import { PushedRemindersAdapter } from "./pushed";
import { sanitizeReminderItems } from "./normalize-push";
import { rankAndCapReminders } from "./rank";
import type {
  RemindersAdapter,
  RemindersBriefing,
  SectionResult,
} from "./types";

function resolveAdapter(): RemindersAdapter {
  const source = config.reminders.source;
  const onDarwin = process.platform === "darwin";

  switch (source) {
    case "mock":
      return new MockRemindersAdapter();
    case "caldav":
      return new CalDavRemindersAdapter();
    case "eventkit":
      return new EventKitRemindersAdapter();
    case "push":
      return new PushedRemindersAdapter();
    case "auto":
    default: {
      // Mac awake: EventKit sees local + iCloud + Google lists. CalDAV alone
      // often returns empty VTODO and used to cache [] forever.
      if (onDarwin) {
        return new EventKitRemindersAdapter();
      }
      // Linux / Fly: no EventKit CLI. Apple Reminders are CloudKit-only, so the
      // iPhone push is the real source; CalDAV stays as fallback.
      return new PushedRemindersAdapter(new CalDavRemindersAdapter());
    }
  }
}

export async function getReminders(): Promise<
  SectionResult<RemindersBriefing>
> {
  const adapter = resolveAdapter();
  const useMock = adapter.id === "mock";

  try {
    const pool = await adapter.getTodaysOpenReminders();
    // Repair stringified Shortcut Dictionaries stored as titles.
    const { items: cleaned } = sanitizeReminderItems(pool);
    const { items, hiddenCount } = rankAndCapReminders(
      cleaned,
      config.reminders.maxItems,
    );
    return {
      status: "ok",
      data: {
        items,
        hiddenCount,
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        isMock: useMock,
      },
    };
  } catch (err) {
    const raw =
      err instanceof Error ? err.message : "Promemoria non disponibili";
    const message =
      useMock || adapter.id === "caldav" || adapter.id === "push"
        ? raw
        : remindersAuthMessage(raw);

    return {
      status: "error",
      message,
      data: {
        items: [],
        hiddenCount: 0,
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        isMock: useMock,
      },
    };
  }
}

export type { RemindersAdapter, ReminderItem, RemindersBriefing } from "./types";
