import type { ActionEmailAdapter, ActionEmailItem } from "./types";

function yesterdayAt(hours: number, minutes: number): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

const MOCK_ACTION_EMAILS: ActionEmailItem[] = [
  {
    id: "ae-1",
    subject: "Revisione contratto — serve firma entro venerdì",
    senderName: "Chiara Bianchi",
    senderAddress: "chiara.bianchi@studiolegale.example",
    actionCue: "Rileggere e firmare il PDF allegato entro venerdì.",
    receivedAt: yesterdayAt(9, 14),
  },
  {
    id: "ae-2",
    subject: "Conferma presenza kickoff prodotto",
    senderName: "Marco Rossi",
    senderAddress: "marco.rossi@team.example",
    actionCue: "Confermare o declinare la partecipazione al kickoff di mercoledì.",
    receivedAt: yesterdayAt(11, 42),
  },
  {
    id: "ae-3",
    subject: "Fattura #4821 in scadenza",
    senderName: "Amministrazione",
    senderAddress: "billing@fornitore.example",
    actionCue: "Verificare importo e autorizzare il pagamento entro 48 ore.",
    receivedAt: yesterdayAt(16, 5),
  },
  {
    id: "ae-4",
    subject: "Feedback sul brief The Daily Tailor",
    senderName: "Elena Conti",
    senderAddress: "elena.conti@collaboratori.example",
    actionCue: "Rispondere con 3 punti di feedback sulla bozza di ieri.",
    receivedAt: yesterdayAt(18, 30),
  },
];

export class MockActionEmailAdapter implements ActionEmailAdapter {
  readonly id = "mock";
  readonly label = "Action email (mock)";

  async getYesterdaysActionEmails(): Promise<ActionEmailItem[]> {
    return MOCK_ACTION_EMAILS;
  }
}
