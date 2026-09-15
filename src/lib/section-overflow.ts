/** Compact Italian overflow counters for A4 section budgets. */

export function remindersOverflowLabel(hiddenCount: number): string {
  if (hiddenCount <= 0) return "";
  if (hiddenCount === 1) return "+1 altro promemoria";
  return `+${hiddenCount} altri promemoria`;
}

export function emailsOverflowLabel(hiddenCount: number): string {
  if (hiddenCount <= 0) return "";
  if (hiddenCount === 1) return "+1 altra email";
  return `+${hiddenCount} altre email`;
}

export function capRanked<T>(
  ranked: T[],
  maxVisible: number,
): { items: T[]; hiddenCount: number } {
  const items = ranked.slice(0, Math.max(0, maxVisible));
  const hiddenCount = Math.max(0, ranked.length - items.length);
  return { items, hiddenCount };
}
