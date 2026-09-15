type SectionShellProps = {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  footerNote?: string;
  tone?: "ok" | "error" | "empty";
};

export function SectionShell({
  title,
  kicker,
  children,
  footerNote,
  tone = "ok",
}: SectionShellProps) {
  return (
    <section className={`sheet-section sheet-section--${tone}`}>
      <header className="sheet-section__head">
        {kicker ? <p className="sheet-section__kicker">{kicker}</p> : null}
        <h2 className="sheet-section__title">{title}</h2>
      </header>
      <div className="sheet-section__body">{children}</div>
      {footerNote ? (
        <p className="sheet-section__note">{footerNote}</p>
      ) : null}
    </section>
  );
}

export function SectionLoading({ title }: { title: string }) {
  return (
    <SectionShell title={title} tone="empty">
      <p className="state-line">Caricamento…</p>
    </SectionShell>
  );
}

export function SectionError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <SectionShell title={title} tone="error">
      <p className="state-line state-line--error">{message}</p>
    </SectionShell>
  );
}

export function SectionEmpty({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <SectionShell title={title} tone="empty">
      <p className="state-line">{message}</p>
    </SectionShell>
  );
}
