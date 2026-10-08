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

function showNode(node: HTMLElement): void {
  node.hidden = false;
  node.style.removeProperty("display");
}

function hideNode(node: HTMLElement): void {
  node.hidden = true;
  node.style.setProperty("display", "none", "important");
}

function asElements(nodes: NodeListOf<Element> | Element[]): HTMLElement[] {
  return Array.from(nodes).filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function sectionBody(list: Element): HTMLElement | null {
  const body = list.closest(".sheet-section__body");
  return body instanceof HTMLElement ? body : null;
}

/** True when the item's box, including its text, sticks out of the section. */
function overflowsBody(node: HTMLElement, bottom: number): boolean {
  const rect = node.getBoundingClientRect();
  if (rect.height < 1) return false;
  return rect.bottom > bottom + 1.5;
}

/**
 * Keep the longest prefix of whole items that sit fully inside the section.
 * Does not clip a title or a paragraph: the next item is omitted entirely.
 */
function fitItemList(list: Element | null, itemSelector: string): void {
  if (!(list instanceof HTMLElement)) return;
  const body = sectionBody(list);
  if (!body || body.clientHeight < 24) return;
  const items = asElements(list.querySelectorAll(itemSelector));
  for (const item of items) showNode(item);

  let guard = items.length + 1;
  while (guard-- > 0) {
    const bottom = body.getBoundingClientRect().bottom;
    const overflow = items.find((item) => !item.hidden && overflowsBody(item, bottom));
    if (!overflow) break;
    let cut = false;
    for (const item of items) {
      if (item === overflow) cut = true;
      if (cut) hideNode(item);
    }
  }
  markLastVisible(items);
}

function fitAgenda(root: HTMLElement): void {
  const body = root.querySelector(".area-calendar .sheet-section__body");
  if (!(body instanceof HTMLElement) || body.clientHeight < 24) return;
  const days = asElements(root.querySelectorAll(".area-calendar .cal-day"));
  for (const day of days) {
    showNode(day);
    for (const event of asElements(day.querySelectorAll(".cal-event"))) showNode(event);
  }

  for (const day of days) {
    const events = asElements(day.querySelectorAll(".cal-event"));
    if (events.length === 0) {
      if (overflowsBody(day, body.getBoundingClientRect().bottom)) hideNode(day);
      continue;
    }
    let kept = 0;
    for (const event of events) {
      if (overflowsBody(event, body.getBoundingClientRect().bottom)) hideNode(event);
      else kept += 1;
    }
    if (kept === 0) hideNode(day);
  }
}

/** Pack news, reminders, agenda tasks and emails into the locked PDF boxes. */
export function fitWholeItemsToLockedBoxes(root: HTMLElement): void {
  fitItemList(root.querySelector(".area-news .headline-list"), ".headline-list__item");
  fitItemList(root.querySelector(".area-reminders .reminder-list"), ".reminder-list__item");
  fitItemList(root.querySelector(".area-emails .action-mail-list"), ".action-mail-list__item");
  fitAgenda(root);
}

/** Undo screen clipping so the A4 packer can fill each locked box. */
export function revealFittedItems(root: HTMLElement): void {
  root.querySelectorAll(FITTED_ROW).forEach((node) => {
    if (node instanceof HTMLElement) showNode(node);
  });
}

const FITTED_ROW = [
  ".headline-list__item",
  ".reminder-list__item",
  ".action-mail-list__item",
  ".cal-event",
  ".cal-day",
].join(",");

/**
 * Remove rows that must not paint in the PDF: hidden items, plus news rows
 * that overflow or collapsed into an empty rule.
 */
export function detachFittedRowsForCapture(root: HTMLElement): () => void {
  const detached: Detached[] = [];

  const detach = (parent: Node, node: Node) => {
    detached.push({ parent, node, next: node.nextSibling });
    parent.removeChild(node);
  };

  root.querySelectorAll(FITTED_ROW).forEach((node) => {
    if (!(node instanceof HTMLElement) || !node.parentNode) return;
    const cs = getComputedStyle(node);
    const gone = node.hidden || cs.display === "none" || cs.visibility === "hidden";
    if (gone) detach(node.parentNode, node);
  });

  root.querySelectorAll(HEADLINE_LIST).forEach((list) => {
    if (!(list instanceof HTMLElement)) return;
    const body = list.closest(".sheet-section__body");
    if (!(body instanceof HTMLElement) || body.clientHeight < 24) return;
    const bodyBottom = body.getBoundingClientRect().bottom;
    for (const node of Array.from(list.children)) {
      if (!(node instanceof HTMLElement) || !node.parentNode) continue;
      if (node.getBoundingClientRect().bottom > bodyBottom + 1) {
        detach(node.parentNode, node);
      }
    }
    markLastVisible(Array.from(list.children) as HTMLElement[]);
  });

  return () => {
    for (let i = detached.length - 1; i >= 0; i -= 1) {
      const { parent, node, next } = detached[i]!;
      if (next && next.parentNode === parent) parent.insertBefore(node, next);
      else parent.appendChild(node);
      if (node instanceof HTMLElement) {
        node.hidden = false;
        node.style.removeProperty("display");
        node.classList.remove("is-last-visible");
      }
    }
  };
}

/** @deprecated Prefer detachFittedRowsForCapture for PDF. */
export function trimOverflowingLists(root: HTMLElement): void {
  detachHeadlineRowsForCapture(root)();
}

/** Ask live AdaptiveFill instances to recompute (screen size change). */
export function requestAdaptiveRefit(root: HTMLElement = document.body): void {
  root.dispatchEvent(
    new CustomEvent("tdt:refit-adaptive", { bubbles: true }),
  );
}
