import { config } from "@/lib/config";
import { EventKitRemindersAdapter } from "./eventkit";
import { MockRemindersAdapter } from "./mock";
import type {
  RemindersAdapter,
  RemindersBriefing,
  SectionResult,
} from "./types";

function resolveAdapter(): RemindersAdapter {
  switch (config.reminders.source) {
    case "eventkit":
      return new EventKitRemindersAdapter();
    case "mock":
    default:
      return new MockRemindersAdapter();
  }
}

export async function getReminders(): Promise<
  SectionResult<RemindersBriefing>
> {
  const adapter = resolveAdapter();
  try {
    const items = await adapter.getTodaysOpenReminders();
    return {
      status: "ok",
      data: {
        items,
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        isMock: adapter.id === "mock",
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Reminders non disponibili";
    const fallback = new MockRemindersAdapter();
    const items = await fallback.getTodaysOpenReminders();
    return {
      status: "error",
      message,
      data: {
        items,
        fetchedAt: new Date().toISOString(),
        sourceLabel: fallback.label,
        isMock: true,
      },
    };
  }
}

export type { RemindersAdapter, ReminderItem, RemindersBriefing } from "./types";
