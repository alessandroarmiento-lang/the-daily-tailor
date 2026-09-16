/**
 * Shared Promemoria empty-state copy (server section + client edition sheet).
 * Keep free of node imports — the edition sheet is a client component.
 */

const CLOUDKIT_GAP =
  "Promemoria Apple non leggibili via CalDAV (CloudKit). Invia lo snapshot dall’iPhone (Comando rapido) oppure genera da Mac.";

export function remindersEmptyMessage(sourceLabel?: string | null): string {
  const label = sourceLabel ?? "";
  if (label.includes("CloudKit") || label.includes("nessun push")) {
    return CLOUDKIT_GAP;
  }
  return "Nessun reminder aperto.";
}
