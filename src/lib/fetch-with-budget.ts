/**
 * Fetch that always settles within `budgetMs`.
 * Safari / iOS can leave a hung HTTP/2 request unresolved even after
 * AbortController.abort(); Promise.race guarantees the UI can move on.
 */
export async function fetchWithBudget(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  budgetMs: number,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);

  const upstream = fetch(input, {
    ...init,
    signal: controller.signal,
  })
    .then((res) => res)
    .catch(() => null);

  const budget = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), budgetMs);
  });

  try {
    return await Promise.race([upstream, budget]);
  } finally {
    clearTimeout(timer);
  }
}
