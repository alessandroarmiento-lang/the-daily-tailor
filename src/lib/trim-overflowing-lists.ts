/**
 * Hide whole list rows that sit below a height-capped section body.
 * Used after PDF capture restyles (clamp → max-height) because that can
 * grow rows without firing AdaptiveFill's ResizeObserver (scrollHeight
 * alone does not resize the observed body).
 */

const LIST_SELECTORS = [".headline-list"] as const;

function markLastVisible(nodes: HTMLElement[]): void {
  for (const node of nodes) node.classList.remove("is-last-visible");
  const visible = nodes.filter((n) => !n.hidden && n.style.display !== "none");
  const last = visible[visible.length - 1];
  if (last) last.classList.add("is-last-visible");
}

export function trimOverflowingLists(root: HTMLElement): void {
  for (const selector of LIST_SELECTORS) {
    root.querySelectorAll(selector).forEach((list) => {
      if (!(list instanceof HTMLElement)) return;
      const body = list.closest(".sheet-section__body");
      if (!(body instanceof HTMLElement) || body.clientHeight < 24) return;

      const bodyBottom = body.getBoundingClientRect().bottom;
      const nodes = Array.from(list.children) as HTMLElement[];

      for (const node of nodes) {
        if (node.hidden || node.style.display === "none") continue;
        if (node.getBoundingClientRect().bottom > bodyBottom + 1) {
          node.hidden = true;
          node.style.setProperty("display", "none", "important");
          node.style.setProperty("border-bottom", "0", "important");
          node.style.setProperty("padding", "0", "important");
          node.style.setProperty("height", "0", "important");
          node.style.setProperty("overflow", "hidden", "important");
        }
      }

      markLastVisible(nodes);
    });
  }
}

/** Ask live AdaptiveFill instances to recompute (screen → PDF size change). */
export function requestAdaptiveRefit(root: HTMLElement = document.body): void {
  root.dispatchEvent(
    new CustomEvent("tdt:refit-adaptive", { bubbles: true }),
  );
}
