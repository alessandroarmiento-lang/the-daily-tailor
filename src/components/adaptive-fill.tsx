"use client";

import {
  Children,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Props = {
  /** Floor even when the column is tight. */
  minCount: number;
  /** Drop this many items per trim step (2 keeps a 2-column day grid even). */
  step?: number;
  className?: string;
  as?: "div" | "ul";
  role?: string;
  children: ReactNode;
};

/**
 * Renders as many children as fit inside the parent `.sheet-section__body`
 * without overflowing. Starts at full count and steps down to `minCount`.
 */
export function AdaptiveFill({
  minCount,
  step = 1,
  className,
  as = "div",
  role,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | HTMLUListElement>(null);
  const items = Children.toArray(children);
  const [count, setCount] = useState(items.length);
  const Tag = as;

  useLayoutEffect(() => {
    setCount(items.length);
  }, [items.length]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const body = el.closest(".sheet-section__body") as HTMLElement | null;
    if (!body) return;

    let frame = 0;
    let cancelled = false;

    const overflows = () => body.scrollHeight > body.clientHeight + 2;

    const fitFrom = (n: number) => {
      if (cancelled) return;
      setCount(n);
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        if (overflows() && n - step >= minCount) {
          fitFrom(n - step);
        }
      });
    };

    const run = () => fitFrom(items.length);

    run();
    const ro = new ResizeObserver(() => run());
    ro.observe(body);
    const page = el.closest(".sheet-page");
    if (page) ro.observe(page);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [items.length, minCount, step]);

  return (
    <Tag ref={ref as never} className={className} role={role}>
      {items.slice(0, count)}
    </Tag>
  );
}
