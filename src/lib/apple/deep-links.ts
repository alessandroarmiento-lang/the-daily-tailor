/**
 * Deep links + payloads for the Mac local opener.
 *
 * Safari blocks HTTPS → http://127.0.0.1 fetch (mixed content), so the paper
 * uses the custom URL scheme `tdt-open://` registered by TDT Open.app.
 * HTTP POST to :3855 remains for local smoke tests / non-Safari.
 */

import { isValidRfcMessageId } from "@/lib/action-emails/actionable";

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
  subject?: string;
  messageUrl?: string;
  account?: string;
}): NativeOpenPayload {
  const bare = item.id.replace(/^<|>$/g, "").trim();
  return {
    kind: "mail",
    id: item.id,
    title: item.subject,
    // Only pass Message-IDs Mail can resolve; otherwise helper uses subject.
    messageId: isValidRfcMessageId(bare) ? bare : undefined,
  };
}

function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Custom scheme handled by TDT Open.app (bypasses mixed-content). */
export function tdtOpenSchemeUrl(payload: NativeOpenPayload): string {
  const q = new URLSearchParams();
  q.set("kind", payload.kind);
  if (payload.title) q.set("title", payload.title);
  if (payload.listName) q.set("listName", payload.listName);
  if (payload.startsAt) q.set("startsAt", payload.startsAt);
  if (payload.messageId) q.set("messageId", payload.messageId);
  if (payload.id) q.set("id", payload.id);
  if (payload.calendarName) q.set("calendarName", payload.calendarName);
  return `tdt-open://open?${q.toString()}`;
}

/**
 * Ask the Mac opener to open the exact item and activate the app.
 * Returns true when handled (caller should not navigate to href).
 */
export async function tryNativeOpen(
  payload: NativeOpenPayload,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  // iPhone: no local helper — use Gmail https / reminderkit hrefs.
  if (isAppleMobile()) return false;

  // Fast path: HTTP helper (Chrome / local http). Safari HTTPS blocks this.
  try {
    const res = await fetch(OPEN_HELPER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(400),
    });
    if (res.ok) {
      const body = (await res.json()) as { ok?: boolean };
      if (body.ok === true) return true;
    }
  } catch {
    // mixed content or helper down
  }

  // Safari / mixed-content fallback: custom URL scheme → TDT Open.app
  window.location.href = tdtOpenSchemeUrl(payload);
  return true;
}
