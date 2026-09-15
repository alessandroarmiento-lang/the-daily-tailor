"use client";

import Link from "next/link";

type Props = {
  statusLine?: string;
  onRefresh?: () => void;
  historyHref?: string;
  /** Stampa is optional and manual — never auto-invoked. */
  canPrint?: boolean;
};

/**
 * Screen-only chrome. Stampa calls window.print() only on user tap
 * (works on iOS Safari / Add to Home Screen when the edition DOM is present,
 * including offline/local editions). No auto-print on open.
 */
export function PrintToolbar({
  statusLine,
  onRefresh,
  historyHref,
  canPrint = true,
}: Props) {
  return (
    <div className="no-print toolbar">
      {statusLine ? (
        <p className="toolbar__status toolbar__status--solo">{statusLine}</p>
      ) : (
        <span className="toolbar__spacer" aria-hidden="true" />
      )}
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
