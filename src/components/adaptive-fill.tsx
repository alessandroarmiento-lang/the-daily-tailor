"use client";

import {
  Children,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Props = {
  /**
   * Keep at least this many whole items when possible. Never shows a partial
   * item: if the next one does not fit in full, it is omitted.
   */
  minCount?: number;
  /** Drop this many items per trim step (2 keeps a 2-column day grid even). */
  step?: number;
  className?: string;
  as?: "div" | "ul";
  role?: string;
  "aria-label"?: string;
  /** Show `+N` under the list for items omitted here or earlier. */
  showOverflow?: boolean;
  /** Items already dropped before render (server pool cap). */
  priorHidden?: number;
  children: ReactNode;
};

function lastVisible(nodes: HTMLElement[]): HTMLElement | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (!nodes[i].hidden) return nodes[i];
  }
  return null;
}

/** True only when every visible child sits fully inside the body box. */
function allVisibleFit(body: HTMLElement, nodes: HTMLElement[]): boolean {
  if (body.scrollHeight > body.clientHeight + 1) return false;
  const last = lastVisible(nodes);
  if (!last) return true;
  const bodyBox = body.getBoundingClientRect();
  const itemBox = last.getBoundingClientRect();
  return itemBox.bottom <= bodyBox.bottom + 1;
}

/**
 * Shows as many whole children as fit in a height-capped section body.
 * Never clips an item mid-way: the last one that does not fit is left out.
 */
export function AdaptiveFill({
  minCount = 0,
  step = 1,
  className,
  as = "div",
  role,
  "aria-label": ariaLabel,
  showOverflow = false,
  priorHidden = 0,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | HTMLUListElement>(null);
  const overflowRef = useRef<HTMLParagraphElement>(null);
  const items = Children.toArray(children);
  const Tag = as;
  const [hiddenHere, setHiddenHere] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const body = el.closest(".sheet-section__body") as HTMLElement | null;
    if (!body) return;

    let cancelled = false;

    const fit = () => {
      if (cancelled) return;
      const nodes = Array.from(el.children) as HTMLElement[];
      if (nodes.length === 0) {
        setHiddenHere(0);
        return;
      }

      for (const node of nodes) {
        node.hidden = false;
      }
      if (overflowRef.current) overflowRef.current.hidden = true;

      let visible = nodes.length;
      while (visible > minCount) {
        if (allVisibleFit(body, nodes)) break;
        visible -= step;
        if (visible < minCount) visible = minCount;
        for (let i = 0; i < nodes.length; i += 1) {
          nodes[i].hidden = i >= visible;
        }
      }

      // If even minCount does not fit, keep dropping whole items.
      while (visible > 0 && !allVisibleFit(body, nodes)) {
        visible -= step;
        if (visible < 0) visible = 0;
        for (let i = 0; i < nodes.length; i += 1) {
          nodes[i].hidden = i >= visible;
        }
      }

      const omitted = Math.max(0, nodes.length - visible);
      setHiddenHere(omitted);

      const totalHidden = priorHidden + omitted;
      if (showOverflow && overflowRef.current) {
        overflowRef.current.hidden = totalHidden <= 0;
        overflowRef.current.textContent =
          totalHidden > 0 ? `+${totalHidden}` : "";
        // Overflow line itself may push the last item — drop one more if needed.
        while (visible > 0 && !allVisibleFit(body, nodes)) {
          visible -= step;
          if (visible < 0) visible = 0;
          for (let i = 0; i < nodes.length; i += 1) {
            nodes[i].hidden = i >= visible;
          }
          const again = Math.max(0, nodes.length - visible);
          setHiddenHere(again);
          const total = priorHidden + again;
          overflowRef.current.hidden = total <= 0;
          overflowRef.current.textContent = total > 0 ? `+${total}` : "";
        }
      }
    };

    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(body);
    const area = el.closest(
      ".area-weather, .area-calendar, .area-news, .area-reminders, .area-emails",
    );
    if (area) ro.observe(area);
    const page = el.closest(".sheet-page");
    if (page) ro.observe(page);

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [items, minCount, step, showOverflow, priorHidden]);

  const totalHidden = priorHidden + hiddenHere;

  return (
    <>
      <Tag
        ref={ref as never}
        className={className}
        role={role}
        aria-label={ariaLabel}
      >
        {items}
      </Tag>
      {showOverflow ? (
        <p
          ref={overflowRef}
          className="section-overflow"
          hidden={totalHidden <= 0}
        >
          {totalHidden > 0 ? `+${totalHidden}` : ""}
        </p>
      ) : null}
    </>
  );
}
