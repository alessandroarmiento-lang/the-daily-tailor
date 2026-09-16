import type { ReminderItem, RemindersAdapter } from "./types";

function todayAt(hours: number, minutes: number): string {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

const MOCK_REMINDERS: ReminderItem[] = [
  {
    id: "rem-1",
    title: "Rivedere bozza mattutina del giornale",
    notes: "Controllare meteo Milano e titoli mondo",
    listName: "Lavoro",
    dueAt: todayAt(8, 30),
    isCompleted: false,
    priority: "high",
  },
  {
    id: "rem-2",
    title: "Chiamare il dentista per il controllo",
    notes: null,
    listName: "Personale",
    dueAt: todayAt(12, 0),
    isCompleted: false,
    priority: "medium",
  },
  {
    id: "rem-3",
    title: "Comprare caffè e latte",
    notes: "Lista spesa breve",
    listName: "Spesa",
    dueAt: null,
    isCompleted: false,
    priority: "low",
  },
  {
    id: "rem-4",
    title: "Rispondere a mail di progetto",
    notes: "Priorità: The Daily Tailor",
    listName: "Lavoro",
    dueAt: todayAt(17, 0),
    isCompleted: false,
    priority: "medium",
  },
  {
    id: "rem-5",
    title: "Allenamento 40 minuti",
    notes: null,
    listName: "Salute",
    dueAt: todayAt(19, 0),
    isCompleted: false,
    priority: "none",
  },
  {
    id: "rem-6",
    title: "Ordinare toner stampante",
    notes: null,
    listName: "Casa",
    dueAt: null,
    isCompleted: false,
    priority: "low",
  },
  {
    id: "rem-7",
    title: "Preparare lista spesa weekend",
    notes: "Verdura e pane",
    listName: "Spesa",
    dueAt: todayAt(20, 0),
    isCompleted: false,
    priority: "none",
  },
  {
    id: "rem-8",
    title: "Inviare report settimanale",
    notes: null,
    listName: "Lavoro",
    dueAt: todayAt(16, 0),
    isCompleted: false,
    priority: "medium",
  },
  {
    id: "rem-9",
    title: "Prenotare taglio capelli",
    notes: null,
    listName: "Personale",
    dueAt: null,
    isCompleted: false,
    priority: "low",
  },
];

/**
 * Clean mock Reminders source for environments without Apple access.
 */
export class MockRemindersAdapter implements RemindersAdapter {
  readonly id = "mock";
  readonly label = "Reminders (mock)";

  async getTodaysOpenReminders(): Promise<ReminderItem[]> {
    return MOCK_REMINDERS.filter((r) => !r.isCompleted);
  }
}
