import { execFileSync } from "node:child_process";
import type { ReminderItem } from "./types";

/**
 * Incomplete flagged reminder ids from the local Reminders store.
 * EventKit on this macOS has no public flag field, and the AppleScript
 * query hangs on iCloud lists. Null when the store cannot be read:
 * callers must leave existing flags alone.
 */
const READ_FLAGS = `
import json, sqlite3
from pathlib import Path
root = Path.home() / "Library/Group Containers/group.com.apple.reminders/Container_v1/Stores"
if not root.is_dir():
    print("null")
    raise SystemExit(0)
ids = []
opened = False
sql = """
SELECT ZDACALENDARITEMUNIQUEIDENTIFIER
FROM ZREMCDREMINDER
WHERE ZFLAGGED = 1
  AND (ZCOMPLETED IS NULL OR ZCOMPLETED = 0)
  AND (ZMARKEDFORDELETION IS NULL OR ZMARKEDFORDELETION = 0)
  AND ZDACALENDARITEMUNIQUEIDENTIFIER IS NOT NULL
"""
for path in root.glob("Data-*.sqlite"):
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error:
        continue
    opened = True
    try:
        ids.extend(row[0] for row in con.execute(sql) if row[0])
    except sqlite3.Error:
        pass
    finally:
        con.close()
print(json.dumps(ids if opened else None))
`;

export function flaggedReminderIds(): Set<string> | null {
  let raw: string;
  try {
    raw = execFileSync("python3", ["-c", READ_FLAGS], {
      encoding: "utf8",
      timeout: 8_000,
    }).trim();
  } catch {
    return null;
  }
  if (!raw || raw === "null") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return new Set(
      parsed.filter((id): id is string => typeof id === "string").map((id) => id.toUpperCase()),
    );
  } catch {
    return null;
  }
}

/** Overlay the local flag. Items the store does not list stay unflagged. */
export function applyLocalFlags(items: ReminderItem[]): ReminderItem[] {
  const ids = flaggedReminderIds();
  if (!ids) return items;
  return items.map((item) => ({
    ...item,
    flagged: ids.has(item.id.toUpperCase()),
  }));
}
