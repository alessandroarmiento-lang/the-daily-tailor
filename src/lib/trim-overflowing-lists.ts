/**
 * PDF / capture helpers: drop whole news rows that would only paint dotted
 * borders (hidden rows that got height:0 during clamp restyle, or rows that
 * overflow the news column).
 */

const HEADLINE_LIST = ".headline-list";

type Detached = {
  parent: Node;
  node: Node;
  next: ChildNode | null;
};

function markLastVisible(nodes: HTMLElement[]): void {
  for (const node of nodes) node.classList.remove("is-last-visible");
  const visible = nodes.filter(
    (n) => !n.hidden && getComputedStyle(n).display !== "none",
  );
  const last = visible[visible.length - 1];
  if (last) last.classList.add("is-last-visible");
}

/**
 * Detach headline rows that must not appear in the PDF:
 * - already `[hidden]` / display:none
 * - bottom edge past the section body
 * - collapsed content (title+summary effectively empty) — leftover height:0
 *   clamps from rows that were hidden when restyled
 *
 * Returns a restore function that re-inserts nodes in order.
 */
export function detachHeadlineRowsForCapture(root: HTMLElement): () => void {
  const detached: Detached[] = [];

  root.querySelectorAll(HEADLINE_LIST).forEach((list) => {
    if (!(list instanceof HTMLElement)) return;
    const body = list.closest(".sheet-section__body");
    if (!(body instanceof HTMLElement) || body.clientHeight < 24) return;

    const bodyBottom = body.getBoundingClientRect().bottom;
    const nodes = Array.from(list.children) as HTMLElement[];

    for (const node of nodes) {
      const cs = getComputedStyle(node);
      const alreadyGone =
        node.hidden || cs.display === "none" || cs.visibility === "hidden";
      const overflows = node.getBoundingClientRect().bottom > bodyBottom + 1;
      const title = node.querySelector(".headline-list__title");
      const summary = node.querySelector(".headline-list__summary");
      const contentH =
        (title instanceof HTMLElement ? title.offsetHeight : 0) +
        (summary instanceof HTMLElement ? summary.offsetHeight : 0);
      const collapsed = !alreadyGone && contentH < 4;

      if (alreadyGone || overflows || collapsed) {
        detached.push({
          parent: list,
          node,
          next: node.nextSibling,
        });
        list.removeChild(node);
      }
    }

    markLastVisible(Array.from(list.children) as HTMLElement[]);
  });

  return () => {
    // Re-insert in reverse so `next` siblings resolve correctly.
    for (let i = detached.length - 1; i >= 0; i -= 1) {
      const { parent, node, next } = detached[i]!;
      if (next && next.parentNode === parent) {
        parent.insertBefore(node, next);
      } else {
        parent.appendChild(node);
      }
      if (node instanceof HTMLElement) {
        node.hidden = false;
        node.style.removeProperty("display");
        node.style.removeProperty("border-bottom");
        node.style.removeProperty("padding");
        node.style.removeProperty("height");
        node.style.removeProperty("overflow");
        node.classList.remove("is-last-visible");
      }
    }
  };
}

/** @deprecated Prefer detachHeadlineRowsForCapture for PDF. */
export function trimOverflowingLists(root: HTMLElement): void {
  detachHeadlineRowsForCapture(root)();
}

/** Ask live AdaptiveFill instances to recompute (screen size change). */
export function requestAdaptiveRefit(root: HTMLElement = document.body): void {
  root.dispatchEvent(
    new CustomEvent("tdt:refit-adaptive", { bubbles: true }),
  );
}
