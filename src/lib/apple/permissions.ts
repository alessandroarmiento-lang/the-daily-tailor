/**
 * Human-readable TCC / Automation permission hints for Apple adapters.
 */

export function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not authorized|not allowed|permission|access denied|(-1743)|(-10004)|(-1728)|osascript.*failed|Application.?s? aren'?t? running|Can.?t get/i.test(
    msg,
  );
}

export function mailAuthMessage(detail?: string): string {
  const base =
    "Autorizza Mail (Automazione) per Terminal/Node, oppure configura IMAP (iCloud + Gmail app password) per generare a Mac spento. Vedi scripts/macos/grant-apple-access.sh";
  return detail ? `${base} — ${detail}` : base;
}

export function calendarAuthMessage(detail?: string): string {
  const base =
    "Autorizza Calendario (Automazione), oppure configura CalDAV iCloud per generare a Mac spento. Vedi scripts/macos/grant-apple-access.sh";
  return detail ? `${base} — ${detail}` : base;
}

export function remindersAuthMessage(detail?: string): string {
  const base =
    "Autorizza Promemoria (Automazione), oppure configura CalDAV iCloud (VTODO) per generare a Mac spento. Vedi scripts/macos/grant-apple-access.sh";
  return detail ? `${base} — ${detail}` : base;
}
