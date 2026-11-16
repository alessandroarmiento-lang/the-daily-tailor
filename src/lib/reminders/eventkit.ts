/**
 * Apple Reminders via EventKit Swift CLI (preferred) or AppleScript fallback.
 * AppleScript often hangs on iCloud reminder lists; EventKit is reliable.
 */
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import {
  runEventKitBinJson,
  runOsascriptJson,
} from "@/lib/apple/run-osascript";
import { getEditionDateKey } from "@/lib/edition";
import { applyLocalFlags } from "./flagged-ids";
import { rankReminders, remindersFetchPool } from "./rank";
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
    flagged?: boolean;
  }>;
};

function mapItems(
  raw: NonNullable<ScriptResult["items"]>,
): ReminderItem[] {
  return raw.map((r) => ({
    id: r.id || `rem-${r.title}`,
    title: r.title,
    notes: r.notes || null,
    listName: r.listName || "Promemoria",
    dueAt: r.dueAt,
    isCompleted: false,
    priority: r.priority ?? "none",
    flagged: r.flagged === true,
  }));
}

export class EventKitRemindersAdapter implements RemindersAdapter {
  readonly id = "eventkit";
  label = "Apple Reminders";

  async getTodaysOpenReminders(dateKey?: string): Promise<ReminderItem[]> {
    const poolSize = remindersFetchPool(config.reminders.maxItems);
    // Fetch a wider incomplete set; Node filters to the edition day.
    const fetchLimit = Math.max(poolSize * 3, 60);
    const cacheKey = dateKey ?? getEditionDateKey();
    const rankOpts = dateKey
      ? { dateKey, timeZone: config.timezone }
      : undefined;
    const cached = await readEditionCacheEnvelope<ReminderItem[]>(
      "reminders",
      cacheKey,
    );
    if (cached?.data) {
      return rankReminders(applyLocalFlags(cached.data), rankOpts).slice(0, poolSize);
    }

    let result: ScriptResult;
    try {
      result = await runEventKitBinJson<ScriptResult>(
        "fetch-reminders-eventkit",
        [String(fetchLimit)],
        45_000,
      );
      this.label = "Apple Reminders (contrassegnati)";
    } catch (binErr) {
      try {
        result = await runOsascriptJson<ScriptResult>(
          "fetch-flagged-reminders.applescript",
          [],
          12_000,
        );
        this.label = "Apple Reminders (contrassegnati)";
      } catch (scriptErr) {
        try {
          result = await runOsascriptJson<ScriptResult>(
            "fetch-reminders.applescript",
            [String(Math.min(8, fetchLimit))],
            25_000,
          );
          this.label = "Apple Reminders (AppleScript)";
        } catch {
          const binMsg =
            binErr instanceof Error ? binErr.message : String(binErr);
          const scriptMsg =
            scriptErr instanceof Error ? scriptErr.message : String(scriptErr);
          throw new Error(
            `Promemoria non disponibili. ${scriptMsg.slice(0, 120)} ${binMsg.slice(0, 120)}`,
          );
        }
      }
    }

    if (!result.ok) {
      throw new Error(result.error ?? "Promemoria: fetch fallito");
    }

    // Cache the full incomplete pool; rank per edition day on read/build.
    const mapped = applyLocalFlags(mapItems(result.items ?? []));
    await writeEditionCache("reminders", mapped, cacheKey);
    return rankReminders(mapped, rankOpts).slice(0, poolSize);
  }
}
