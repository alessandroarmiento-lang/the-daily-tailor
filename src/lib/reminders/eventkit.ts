/**
 * Apple Reminders via AppleScript (EventKit-backed Reminders.app).
 */
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import { runOsascriptJson } from "@/lib/apple/run-osascript";
import type { ReminderItem, RemindersAdapter } from "./types";

type ScriptResult = {
  ok: boolean;
  error?: string;
  items?: Array<{
    id: string;
    title: string;
    notes: string;
    listName: string;
    dueAt: string | null;
    priority: "none" | "low" | "medium" | "high";
  }>;
};

export class EventKitRemindersAdapter implements RemindersAdapter {
  readonly id = "eventkit";
  readonly label = "Apple Reminders";

  async getTodaysOpenReminders(): Promise<ReminderItem[]> {
    const cached = await readEditionCacheEnvelope<ReminderItem[]>("reminders");
    if (cached?.data) {
      return cached.data.slice(0, config.reminders.maxItems);
    }

    const result = await runOsascriptJson<ScriptResult>(
      "fetch-reminders.applescript",
      [String(config.reminders.maxItems)],
      60_000,
    );

    if (!result.ok) {
      throw new Error(result.error ?? "Reminders: fetch fallito");
    }

    const items: ReminderItem[] = (result.items ?? []).map((r) => ({
      id: r.id || `rem-${r.title}`,
      title: r.title,
      notes: r.notes || null,
      listName: r.listName || "Reminders",
      dueAt: r.dueAt,
      isCompleted: false,
      priority: r.priority ?? "none",
    }));

    const capped = items.slice(0, config.reminders.maxItems);
    await writeEditionCache("reminders", capped);
    return capped;
  }
}
