import type { ReminderFeed } from "@/lib/types";

/**
 * Extension point: replace `getEmailReminders` with a real mailbox connector
 * (Gmail API, IMAP, or a webhook that writes JSON). Keep the return shape stable
 * so the newspaper page does not need layout changes.
 */
export async function getEmailReminders(): Promise<ReminderFeed> {
  return {
    source: "mock",
    note: "Dati di esempio. Collega la tua casella in src/lib/reminders.ts.",
    reminders: [
      {
        id: "rem-1",
        from: "studio@avvocato.it",
        subject: "Conferma appuntamento — documentazione da firmare",
        dueLabel: "Oggi, 10:30",
        priority: "alta",
        preview: "Portare documento d’identità e ricevuta del bonifico.",
      },
      {
        id: "rem-2",
        from: "prenotazioni@ristorante-roma.it",
        subject: "Promemoria tavolo per due — stasera",
        dueLabel: "Oggi, 20:00",
        priority: "media",
        preview: "Tavolo confermato. Annullamento gratuito fino alle 18:00.",
      },
      {
        id: "rem-3",
        from: "scuola@istituto.edu",
        subject: "Riunione genitori: conferma presenza",
        dueLabel: "Domani",
        priority: "media",
        preview: "Rispondere al questionario entro sera.",
      },
      {
        id: "rem-4",
        from: "bollette@utenze.it",
        subject: "Scadenza bolletta luce",
        dueLabel: "Tra 3 giorni",
        priority: "bassa",
        preview: "Importo già in addebito SEPA; nessuna azione richiesta.",
      },
    ],
  };
}
