type SectionShellProps = {
  title: string;
  kicker?: string;
  /** Compact +N badge on the title row (no extra vertical band under the list). */
  overflowLabel?: string;
  children: React.ReactNode;
  footerNote?: string;
  tone?: "ok" | "error" | "empty";
};

export function SectionShell({
  title,
  kicker,
  overflowLabel,
  children,
  footerNote,
  tone = "ok",
}: SectionShellProps) {
  return (
    <section className={`sheet-section sheet-section--${tone}`}>
      <header className="sheet-section__head">
        {/* Always reserve kicker row so Meteo | Agenda | Notizie share one top edge. */}
        <p className="sheet-section__kicker">
          {kicker ? kicker : "\u00a0"}
        </p>
        <div className="sheet-section__title-row">
          <h2 className="sheet-section__title">{title}</h2>
          {overflowLabel ? (
            <span className="section-overflow section-overflow--inline">
              {overflowLabel}
            </span>
          ) : null}
        </div>
      </header>
      <div className="sheet-section__body">{children}</div>
      {footerNote ? (
        <p className="sheet-section__note">{footerNote}</p>
      ) : null}
    </section>
  );
}

export function SectionLoading({
  title,
  kicker,
}: {
  title: string;
  kicker?: string;
}) {
  return (
    <SectionShell title={title} kicker={kicker} tone="empty">
      <p className="state-line">Caricamento…</p>
    </SectionShell>
  );
}

export function SectionError({
  title,
  message,
  kicker,
}: {
  title: string;
  message: string;
  kicker?: string;
}) {
  return (
    <SectionShell title={title} kicker={kicker} tone="error">
      <p className="state-line state-line--error">{message}</p>
    </SectionShell>
  );
}

export function SectionEmpty({
  title,
  message,
  kicker,
}: {
  title: string;
  message: string;
  kicker?: string;
}) {
  return (
    <SectionShell title={title} kicker={kicker} tone="empty">
      <p className="state-line">{message}</p>
    </SectionShell>
  );
}
