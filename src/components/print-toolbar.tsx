"use client";

export function PrintToolbar() {
  return (
    <div className="no-print toolbar">
      <p className="toolbar__hint">
        The Daily Tailor — sul telefono o stampa su una pagina.
      </p>
      <div className="toolbar__actions">
        <button
          type="button"
          className="toolbar__btn toolbar__btn--ghost"
          onClick={() => window.location.reload()}
        >
          Aggiorna
        </button>
        <button
          type="button"
          className="toolbar__btn"
          onClick={() => window.print()}
        >
          Stampa
        </button>
      </div>
    </div>
  );
}
