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

    const fit = () => {
      if (cancelled) return;
      const nodes = Array.from(el.children) as HTMLElement[];
      if (nodes.length === 0) return;

      for (const node of nodes) {
        node.hidden = false;
        node.style.removeProperty("display");
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
    };

    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(body);
    const area = el.closest(".area-calendar, .area-news");
    if (area) ro.observe(area);
    const page = el.closest(".sheet-page");
    if (page) ro.observe(page);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ro.disconnect();
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
