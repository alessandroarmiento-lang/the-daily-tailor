/**
 * Deep links + payloads for the Mac local opener (127.0.0.1:3855).
 * Fallback hrefs when the helper is offline (iPhone / helper not installed).
 */

const REMINDER_UUID_RE =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

const OPEN_HELPER = "http://127.0.0.1:3855/open";

export type NativeOpenKind = "mail" | "reminder" | "event";

export type NativeOpenPayload = {
  kind: NativeOpenKind;
  title?: string;
  listName?: string;
  startsAt?: string | null;
  messageId?: string;
  id?: string;
  calendarName?: string | null;
};

/** Strip x-apple-reminder:// prefix to a bare UUID when present. */
export function reminderKitUuid(id: string): string | undefined {
  const bare = id.trim();
  if (!bare) return undefined;
  const fromScheme = bare.match(
    /^(?:x-apple-reminder:\/\/|x-apple-reminderkit:\/\/REMCDReminder\/)?([0-9A-Fa-f-]{36})$/i,
  );
  if (fromScheme?.[1] && REMINDER_UUID_RE.test(fromScheme[1])) {
    return fromScheme[1];
  }
  if (REMINDER_UUID_RE.test(bare)) return bare;
  return undefined;
}

export function reminderDeepLink(id: string): string | undefined {
  const uuid = reminderKitUuid(id);
  if (uuid) {
    return `x-apple-reminderkit://REMCDReminder/${uuid}`;
  }
  // listName|title from iPhone Shortcut — helper opens the exact item on Mac.
  return "x-apple-reminderkit://";
}

export function calendarEventDeepLink(
  id: string,
  options?: { title?: string; calendarName?: string | null },
): string | undefined {
  const bare = id.trim();
  const title = options?.title?.trim();
  const cal = (options?.calendarName || "").toLowerCase();
  if (cal.includes("gmail") || cal.includes("google")) {
    if (title) {
      return `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent(title)}`;
    }
  }
  if (!bare) return undefined;
  // EventKit / CalDAV uid — best-effort; Mac helper matches by title+start.
  return `ical://ekevent/${encodeURIComponent(bare)}`;
}

export function reminderOpenPayload(item: {
  id: string;
  title: string;
  listName: string;
}): NativeOpenPayload {
  return {
    kind: "reminder",
    id: item.id,
    title: item.title,
    listName: item.listName,
  };
}

export function eventOpenPayload(event: {
  id: string;
  title: string;
  startsAt: string;
  calendarName?: string | null;
}): NativeOpenPayload {
  return {
    kind: "event",
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    calendarName: event.calendarName,
  };
}

export function mailOpenPayload(item: {
  id: string;
  messageUrl?: string;
  account?: string;
}): NativeOpenPayload {
  const bare = item.id.replace(/^<|>$/g, "").trim();
  return {
    kind: "mail",
    id: item.id,
    messageId: bare,
  };
}

/**
 * Ask the Mac helper to open the exact item and activate the app.
 * Returns true when the helper handled it (caller should not navigate).
 */
export async function tryNativeOpen(
  payload: NativeOpenPayload,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch(OPEN_HELPER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}
