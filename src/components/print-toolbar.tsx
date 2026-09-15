"use client";

import Link from "next/link";

type Props = {
  onRefresh?: () => void;
  historyHref?: string;
  /** Stampa is optional and manual — never auto-invoked. */
  canPrint?: boolean;
};

/**
 * Screen-only chrome. Left side stays empty — actions only on the right.
 * Stampa calls window.print() only on user tap.
 */
export function PrintToolbar({
  onRefresh,
  historyHref,
  canPrint = true,
}: Props) {
  return (
    <div className="no-print toolbar">
      <span className="toolbar__spacer" aria-hidden="true" />
      <div className="toolbar__actions">
        {historyHref ? (
          <Link className="toolbar__btn toolbar__btn--ghost" href={historyHref}>
            Storia
          </Link>
        ) : null}
        <button
          type="button"
          className="toolbar__btn toolbar__btn--ghost"
          onClick={() => (onRefresh ? onRefresh() : window.location.reload())}
        >
          Aggiorna
        </button>
        <button
          type="button"
          className="toolbar__btn"
          disabled={!canPrint}
          onClick={() => {
            if (!canPrint) return;
            window.print();
          }}
        >
          Stampa
        </button>
      </div>
    </div>
  );
}
