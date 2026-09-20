export type Lang = "it" | "en";

export const messages = {
  it: {
    langAria: "Lingua",
    history: "Storico",
    refresh: "Aggiorna",
    refreshing: "Aggiorno…",
    pdf: "PDF",
    pdfBusy: "PDF…",
    pdfFail: "Esportazione PDF fallita",
    loadingApp: "Caricamento The Daily Tailor…",
    noEdition: "Nessuna edizione disponibile.",
    noEditionHint:
      "Apri l’app dopo le 06:00 (con rete) per scaricare il giornale del giorno, oppure genera sul Mac con /api/morning-warm.",
    loadFail: "Caricamento edizione fallito",
    warmFail: "Aggiornamento fallito (HTTP {status})",
    backToday: "Torna a oggi",
    personalEdition: "Edizione personale",
    tagline: "Il giornale del mattino in una pagina, su misura per te",
    weather: "Meteo di oggi",
    weatherMissing: "Meteo non disponibile.",
    weatherLoading: "Caricamento meteo…",
    agenda: "Agenda",
    agendaDays: "Prossimi giorni",
    agendaMissing: "Agenda non disponibile.",
    agendaLoading: "Caricamento agenda…",
    todayPrefix: "Oggi · ",
    news: "Notizie dal mondo",
    newsLoading: "Caricamento titoli…",
    reminders: "Promemoria",
    remindersKicker: "Oggi / aperti",
    remindersAuth:
      "Autorizza Promemoria o configura CalDAV iCloud.",
    remindersLoading: "Caricamento promemoria…",
    email: "Email",
    emailKicker: "Ieri · richieste d’azione",
    emailLoading: "Caricamento email…",
    aphorismAria: "Aforisma del giorno",
    updated: "Aggiornamento",
    loading: "Caricamento…",
    historyTitle: "Storico edizioni",
    historyEmpty: "Nessuna giornata in elenco.",
    historyHint:
      "Dopo le 06:00 con rete, il telefono tiene in memoria locale l’edizione per tutto il giorno.",
    daysCount: "{n} giornate · apri una copia locale se offline",
    holiday: "Festività",
  },
  en: {
    langAria: "Language",
    history: "History",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    pdf: "PDF",
    pdfBusy: "PDF…",
    pdfFail: "PDF export failed",
    loadingApp: "Loading The Daily Tailor…",
    noEdition: "No edition available.",
    noEditionHint:
      "Open the app after 06:00 (with network) to download today’s paper, or generate on the Mac with /api/morning-warm.",
    loadFail: "Failed to load edition",
    warmFail: "Refresh failed (HTTP {status})",
    backToday: "Back to today",
    personalEdition: "Personal edition",
    tagline: "The morning paper in one page, tailored to you",
    weather: "Today’s weather",
    weatherMissing: "Weather unavailable.",
    weatherLoading: "Loading weather…",
    agenda: "Agenda",
    agendaDays: "Coming days",
    agendaMissing: "Agenda unavailable.",
    agendaLoading: "Loading agenda…",
    todayPrefix: "Today · ",
    news: "World news",
    newsLoading: "Loading headlines…",
    reminders: "Reminders",
    remindersKicker: "Today / open",
    remindersAuth: "Allow Reminders or configure iCloud CalDAV.",
    remindersLoading: "Loading reminders…",
    email: "Email",
    emailKicker: "Yesterday · action items",
    emailLoading: "Loading email…",
    aphorismAria: "Aphorism of the day",
    updated: "Updated",
    loading: "Loading…",
    historyTitle: "Edition history",
    historyEmpty: "No days listed.",
    historyHint:
      "After 06:00 with network, the phone keeps the edition in local memory for the whole day.",
    daysCount: "{n} days · open a local copy if offline",
    holiday: "Holiday",
  },
} as const;

export type MessageKey = keyof typeof messages.it;

export function localeFor(lang: Lang): string {
  return lang === "en" ? "en-GB" : "it-IT";
}

export function translate(
  lang: Lang,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = messages[lang][key] ?? messages.it[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
