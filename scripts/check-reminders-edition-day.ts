/**
 * Quick sanity checks for edition-day reminder filtering.
 * Run: npx --yes tsx scripts/check-reminders-edition-day.ts
 */
import {
  filterRemindersForEditionDay,
  isReminderForEditionDay,
  reminderDueDateKey,
} from "../src/lib/reminders/for-edition-day";
import { rankReminders } from "../src/lib/reminders/rank";
import type { ReminderItem } from "../src/lib/reminders/types";

const tz = "Europe/Rome";
const day = "2026-09-30";

function item(
  partial: Partial<ReminderItem> & Pick<ReminderItem, "id" | "title">,
): ReminderItem {
  return {
    notes: null,
    listName: "Test",
    dueAt: null,
    isCompleted: false,
    priority: "none",
    ...partial,
  };
}

const samples: ReminderItem[] = [
  item({ id: "1", title: "Due that day", dueAt: "2026-09-30T09:00:00" }),
  item({ id: "2", title: "Overdue", dueAt: "2026-09-29T18:00:00" }),
  item({ id: "3", title: "Undated", dueAt: null }),
  item({ id: "4", title: "Future", dueAt: "2026-10-02T10:00:00" }),
  item({
    id: "5",
    title: "ISO Z evening Rome still that day",
    dueAt: "2026-09-30T18:00:00+02:00",
  }),
  item({
    id: "6",
    title: "Next calendar day after rollover",
    dueAt: "2026-10-01T08:00:00",
  }),
];

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("ok:", msg);
  }
}

assert(reminderDueDateKey("2026-09-30T09:00:00", tz) === day, "local due key");
assert(
  reminderDueDateKey("2026-09-30T18:00:00+02:00", tz) === day,
  "offset due key",
);
assert(
  isReminderForEditionDay(samples[0]!, day, tz),
  "include due that day",
);
assert(isReminderForEditionDay(samples[1]!, day, tz), "include overdue");
assert(isReminderForEditionDay(samples[2]!, day, tz), "include undated");
assert(!isReminderForEditionDay(samples[3]!, day, tz), "exclude future");
assert(!isReminderForEditionDay(samples[5]!, day, tz), "exclude next day");

const filtered = filterRemindersForEditionDay(samples, day, tz);
assert(
  filtered.map((r) => r.id).sort().join(",") === "1,2,3,5",
  `filtered ids=${filtered.map((r) => r.id).join(",")}`,
);

const ranked = rankReminders(samples, { dateKey: day, timeZone: tz });
assert(
  ranked[0]?.id === "2",
  `overdue ranks first (got ${ranked[0]?.id})`,
);
assert(
  !ranked.some((r) => r.id === "4" || r.id === "6"),
  "ranked has no future",
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall checks passed");
