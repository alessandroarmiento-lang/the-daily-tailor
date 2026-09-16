import { config } from "@/lib/config";
import { remindersAuthMessage } from "@/lib/apple/permissions";
import {
  CalDavRemindersAdapter,
  hasRemindersCalDavCredentials,
} from "./caldav";
import { EventKitRemindersAdapter } from "./eventkit";
import { MockRemindersAdapter } from "./mock";
import { rankAndCapReminders } from "./rank";
import type {
  RemindersAdapter,
  RemindersBriefing,
  SectionResult,
} from "./types";

function resolveAdapter(): RemindersAdapter {
  const source = config.reminders.source;
  switch (source) {
    case "caldav":
      return new CalDavRemindersAdapter();
    case "eventkit":
      return new EventKitRemindersAdapter();
    case "mock":
      return new MockRemindersAdapter();
    case "auto":
    default: {
      // Mac awake: EventKit sees local + iCloud + Google lists. CalDAV alone
      // often returns empty VTODO and used to cache [] forever.
      if (process.platform === "darwin") {
        return new EventKitRemindersAdapter();
      }
      if (hasRemindersCalDavCredentials()) {
        return new CalDavRemindersAdapter();
      }
      return new CalDavRemindersAdapter();
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
    const { items, hiddenCount } = rankAndCapReminders(
      pool,
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
    const message = useMock ? raw : remindersAuthMessage(raw);

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
