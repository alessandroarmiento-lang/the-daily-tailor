/** Compact overflow counters for A4 section budgets (+X only). */

/** Returns `+X` when X > 0, else empty (no counter). */
export function overflowPlusLabel(hiddenCount: number): string {
  if (hiddenCount <= 0) return "";
  return `+${hiddenCount}`;
}

/** @deprecated Prefer overflowPlusLabel — same for Promemoria and Email. */
export function remindersOverflowLabel(hiddenCount: number): string {
  return overflowPlusLabel(hiddenCount);
}

/** @deprecated Prefer overflowPlusLabel — same for Promemoria and Email. */
export function emailsOverflowLabel(hiddenCount: number): string {
  return overflowPlusLabel(hiddenCount);
}

export function capRanked<T>(
  ranked: T[],
  maxVisible: number,
): { items: T[]; hiddenCount: number } {
  const items = ranked.slice(0, Math.max(0, maxVisible));
  const hiddenCount = Math.max(0, ranked.length - items.length);
  return { items, hiddenCount };
}
