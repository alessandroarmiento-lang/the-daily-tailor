"use client";

import {
  Children,
  useLayoutEffect,
  useRef,
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
  children: ReactNode;
};

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
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | HTMLUListElement>(null);
  const items = Children.toArray(children);
  const Tag = as;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const body = el.closest(".sheet-section__body") as HTMLElement | null;
    if (!body) return;

    let cancelled = false;
    let timer = 0;

    const fits = () => body.scrollHeight <= body.clientHeight + 2;

    const markLastVisible = (nodes: HTMLElement[]) => {
      for (const node of nodes) node.classList.remove("is-last-visible");
      const visible = nodes.filter((n) => !n.hidden);
      const last = visible[visible.length - 1];
      if (last) last.classList.add("is-last-visible");
    };

    const hideGeometricOverflow = (nodes: HTMLElement[]) => {
      const bodyBottom = body.getBoundingClientRect().bottom;
      for (const node of nodes) {
        if (node.hidden) continue;
        const bottom = node.getBoundingClientRect().bottom;
        if (bottom > bodyBottom + 1) {
          node.hidden = true;
          node.style.display = "none";
        }
      }
    };

    const fit = () => {
      if (cancelled) return;
      const nodes = Array.from(el.children) as HTMLElement[];
      if (nodes.length === 0) return;

      for (const node of nodes) {
        node.hidden = false;
        node.style.removeProperty("display");
        node.classList.remove("is-last-visible");
      }

      // Body not height-capped yet (still sizing) — retry next frame.
      if (body.clientHeight < 24) {
        timer = window.setTimeout(fit, 32);
        return;
      }

      let visible = nodes.length;
      const apply = (n: number) => {
        for (let i = 0; i < nodes.length; i += 1) {
          const hide = i >= n;
          nodes[i].hidden = hide;
          // Author CSS sets display on list items; override when hiding.
          if (hide) nodes[i].style.display = "none";
          else nodes[i].style.removeProperty("display");
        }
      };

      while (visible > minCount && !fits()) {
        visible -= step;
        if (visible < minCount) visible = minCount;
        apply(visible);
      }
      while (visible > 0 && !fits()) {
        visible -= step;
        if (visible < 0) visible = 0;
        apply(visible);
      }

      // Catch partial rows clipped by overflow:hidden (ghost dotted rules).
      hideGeometricOverflow(nodes);
      markLastVisible(nodes);
    };

    fit();
    const onRefit = () => fit();
    el.addEventListener("tdt:refit-adaptive", onRefit);
    // Capture may dispatch on the sheet root; listen there too.
    const page = el.closest(".sheet-page");
    page?.addEventListener("tdt:refit-adaptive", onRefit);

    const ro = new ResizeObserver(() => fit());
    ro.observe(body);
    const area = el.closest(".area-calendar, .area-news");
    if (area) ro.observe(area);
    if (page) ro.observe(page);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ro.disconnect();
      el.removeEventListener("tdt:refit-adaptive", onRefit);
      page?.removeEventListener("tdt:refit-adaptive", onRefit);
    };
  }, [items, minCount, step]);

  return (
    <Tag
      ref={ref as never}
      className={className}
      role={role}
      aria-label={ariaLabel}
    >
      {items}
    </Tag>
  );
}
