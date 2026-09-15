import type { ReminderFeed } from "@/lib/types";

type RemindersSectionProps = {
  reminders: ReminderFeed;
};

const priorityLabel: Record<ReminderFeed["reminders"][number]["priority"], string> = {
  alta: "Alta",
  media: "Media",
  bassa: "Bassa",
};

export function RemindersSection({ reminders }: RemindersSectionProps) {
  return (
    <section aria-labelledby="reminders-heading">
      <div className="mb-2 flex items-baseline justify-between border-b border-stone-900 pb-1">
        <h2 id="reminders-heading" className="section-kicker">
          Promemoria email
        </h2>
        <span className="source-pill">esempio</span>
      </div>

      <ul className="space-y-3">
        {reminders.reminders.map((item) => (
          <li key={item.id} className="border-b border-stone-200 pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-serif text-[0.95rem] leading-snug font-semibold text-stone-950">
                {item.subject}
              </p>
              <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-stone-500">
                {item.dueLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-stone-700">{item.preview}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-stone-500">
              Da {item.from} · priorità {priorityLabel[item.priority]}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-dashed border-stone-300 pt-2 text-[11px] leading-relaxed text-stone-500">
        {reminders.note}
      </p>
    </section>
  );
}
