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

/** Apple reference date for `calshow:` (2001-01-01 UTC), in unix seconds. */
const APPLE_EPOCH_UNIX = Date.UTC(2001, 0, 1) / 1000;

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

/** Open Calendar at an instant (`calshow:` works on iPhone + Mac). */
export function calshowDeepLink(startsAt: string): string | undefined {
  const instant = new Date(startsAt);
  if (Number.isNaN(instant.getTime())) return undefined;
  const seconds = Math.floor(instant.getTime() / 1000 - APPLE_EPOCH_UNIX);
  return `calshow:${seconds}`;
}

export function calendarEventDeepLink(
  id: string,
  options?: {
    title?: string;
    calendarName?: string | null;
    startsAt?: string | null;
  },
): string | undefined {
  const bare = id.trim();
  const title = options?.title?.trim();
  const cal = (options?.calendarName || "").toLowerCase();
  if (cal.includes("gmail") || cal.includes("google")) {
    if (title) {
      return `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent(title)}`;
    }
  }
  // Prefer calshow so iPhone PWA / Safari can leave the sheet (ical:// is Mac-oriented).
  if (options?.startsAt) {
    const show = calshowDeepLink(options.startsAt);
    if (show) return show;
  }
  if (!bare) return undefined;
  // EventKit / CalDAV uid — Mac Calendar fallback when startsAt is missing.
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
  const account = (item.account ?? "").toLowerCase();
  const isGmail =
    account.includes("gmail") ||
    account.includes("google") ||
    (item.messageUrl?.startsWith("https://mail.google.com") ?? false);
  return {
    kind: "mail",
    id: item.id,
    title: item.subject,
    // Gmail opens via https in the browser (NativeOpenLink). Helper is for
    // Apple Mail / iCloud only — pass Message-ID when Mail can resolve it.
    messageId: isGmail
      ? undefined
      : isValidRfcMessageId(bare)
        ? bare
        : undefined,
  };
}

/** True on iPhone/iPad Safari and Home Screen PWA. */
export function isAppleMobileClient(): boolean {
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
  // iPhone: no local helper — use Gmail https / reminderkit / calshow hrefs.
  if (isAppleMobileClient()) return false;

  // HTTPS page cannot fetch http://127.0.0.1 (mixed content). Navigate to the
  // custom scheme in the same turn so Safari keeps the user gesture.
  if (window.location.protocol === "https:") {
    window.location.href = tdtOpenSchemeUrl(payload);
    return true;
  }

  // Local http:// paper: POST to the helper when it is running.
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
    // helper down
  }

  window.location.href = tdtOpenSchemeUrl(payload);
  return true;
}
