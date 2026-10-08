/**
 * Quick sanity checks for edition-day + upcoming reminder filtering.
 * Run: npx --yes tsx scripts/check-reminders-edition-day.ts
 */
import {
  filterRemindersForEditionDay,
  isReminderForEditionDay,
  reminderDueDateKey,
} from "../src/lib/reminders/for-edition-day";
import { rankAndCapReminders, rankReminders } from "../src/lib/reminders/rank";
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
  item({ id: "1", title: "Due that day morning", dueAt: "2026-09-30T09:00:00" }),
  item({ id: "2", title: "Overdue", dueAt: "2026-09-29T18:00:00" }),
  item({ id: "3", title: "Undated", dueAt: null }),
  item({ id: "4", title: "Future later", dueAt: "2026-10-02T10:00:00" }),
  item({
    id: "5",
    title: "Due that day evening",
    dueAt: "2026-09-30T18:00:00+02:00",
  }),
  item({
    id: "6",
    title: "Tomorrow",
    dueAt: "2026-10-01T08:00:00",
  }),
  item({ id: "7", title: "Far future", dueAt: "2026-10-05T12:00:00" }),
  item({ id: "8", title: "Also tomorrow", dueAt: "2026-10-01T14:00:00" }),
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
  isReminderForEditionDay(samples[0]!, day, tz),
  "include due that day",
);
assert(!isReminderForEditionDay(samples[1]!, day, tz), "exclude overdue");
assert(!isReminderForEditionDay(samples[2]!, day, tz), "exclude undated");
assert(isReminderForEditionDay(samples[3]!, day, tz), "include future");
assert(isReminderForEditionDay(samples[5]!, day, tz), "include tomorrow");

const filtered = filterRemindersForEditionDay(samples, day, tz);
assert(
  filtered.map((r) => r.id).sort().join(",") === "1,4,5,6,7,8",
  `filtered ids=${filtered.map((r) => r.id).join(",")}`,
);

const ranked = rankReminders(samples, { dateKey: day, timeZone: tz });
assert(
  ranked.map((r) => r.id).join(",") === "1,5,6,8,4,7",
  `chrono order got ${ranked.map((r) => r.id).join(",")}`,
);

const capped = rankAndCapReminders(samples, 6, { dateKey: day, timeZone: tz });
assert(capped.items.length === 6, `cap to 6 got ${capped.items.length}`);
assert(
  capped.items.map((r) => r.id).join(",") === "1,5,6,8,4,7",
  `capped order got ${capped.items.map((r) => r.id).join(",")}`,
);
assert(capped.hiddenCount === 0, `hidden ${capped.hiddenCount}`);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall checks passed");
