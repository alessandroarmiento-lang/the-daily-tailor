import { execFileSync } from "node:child_process";
import type { ReminderItem } from "./types";

/**
 * Incomplete flagged reminder ids from the local Reminders store.
 * EventKit on this macOS has no public flag field, and the AppleScript
 * query hangs on iCloud lists. Null when the store cannot be read:
 * callers must leave existing flags alone.
 *
 * Copies each sqlite (+ wal/shm) to a temp dir first: at 05:00 the live
 * DB is often locked and empty satellite stores used to yield [].
 */
const READ_FLAGS = `
import json, shutil, sqlite3, tempfile
from pathlib import Path
root = Path.home() / "Library/Group Containers/group.com.apple.reminders/Container_v1/Stores"
if not root.is_dir():
    print("null")
    raise SystemExit(0)
flagged = []
stores_ok = 0
with tempfile.TemporaryDirectory(prefix="tdt-flags-") as tmp:
    tmp_root = Path(tmp)
    for path in root.glob("Data-*.sqlite"):
        dest = tmp_root / path.name
        try:
            shutil.copy2(path, dest)
            for suffix in ("-wal", "-shm"):
                side = Path(str(path) + suffix)
                if side.is_file():
                    shutil.copy2(side, Path(str(dest) + suffix))
        except OSError:
            continue
        try:
            con = sqlite3.connect(f"file:{dest}?mode=ro", uri=True)
        except sqlite3.Error:
            continue
        try:
            rows = con.execute(
                """
                SELECT ZDACALENDARITEMUNIQUEIDENTIFIER
                FROM ZREMCDREMINDER
                WHERE ZFLAGGED = 1
                  AND (ZCOMPLETED IS NULL OR ZCOMPLETED = 0)
                  AND (ZMARKEDFORDELETION IS NULL OR ZMARKEDFORDELETION = 0)
                  AND ZDACALENDARITEMUNIQUEIDENTIFIER IS NOT NULL
                """
            )
            flagged.extend(row[0] for row in rows if row[0])
            stores_ok += 1
        except sqlite3.Error:
            pass
        finally:
            con.close()
print(json.dumps(flagged if stores_ok else None))
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
      parsed
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.toUpperCase()),
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
