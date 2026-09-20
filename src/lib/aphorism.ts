import { config } from "@/lib/config";
import { editionDayIndex, getEditionDateKey } from "@/lib/edition";
import type { Lang } from "@/lib/i18n/messages";

export type Aphorism = {
  text: string;
  textEn: string;
  attribution: string | null;
  attributionEn: string | null;
};

/**
 * Curated sayings / aphorisms (IT + EN).
 * Selection is deterministic by calendar day in the newspaper timezone.
 */
const APHORISMS: Aphorism[] = [
  {
    text: "La mattina ha l’oro in bocca.",
    textEn: "The early bird catches the worm.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Chi va piano va sano e va lontano.",
    textEn: "Slow and steady wins the race.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Il tempo è un’illusione; la sveglia no.",
    textEn: "Time is an illusion; the alarm clock is not.",
    attribution: null,
    attributionEn: null,
  },
  {
    text: "Meglio un uovo oggi che una gallina domani.",
    textEn: "A bird in the hand is worth two in the bush.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Conosci te stesso.",
    textEn: "Know thyself.",
    attribution: "Massima delfica",
    attributionEn: "Delphic maxim",
  },
  {
    text: "La semplicità è l’ultima sofisticazione.",
    textEn: "Simplicity is the ultimate sophistication.",
    attribution: "Leonardo da Vinci",
    attributionEn: "Leonardo da Vinci",
  },
  {
    text: "Non è la montagna che conquisti, ma te stesso.",
    textEn: "It is not the mountain we conquer, but ourselves.",
    attribution: null,
    attributionEn: null,
  },
  {
    text: "Piccoli gesti, grandi giorni.",
    textEn: "Small gestures, great days.",
    attribution: null,
    attributionEn: null,
  },
  {
    text: "Chi semina vento raccoglie tempesta.",
    textEn: "Who sows the wind reaps the whirlwind.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "L’abito non fa il monaco, ma aiuta.",
    textEn: "Clothes do not make the man — but they help.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Nulla dies sine linea.",
    textEn: "Nulla dies sine linea.",
    attribution: "Plinio il Vecchio",
    attributionEn: "Pliny the Elder",
  },
  {
    text: "Prima il dovere, poi il piacere.",
    textEn: "Duty first, pleasure later.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Tra il dire e il fare c’è di mezzo il mare.",
    textEn: "Between saying and doing lies the sea.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "La costanza batte il talento, quando il talento non si allena.",
    textEn: "Consistency beats talent when talent skips practice.",
    attribution: null,
    attributionEn: null,
  },
  {
    text: "Festina lente.",
    textEn: "Festina lente.",
    attribution: "Augusto",
    attributionEn: "Augustus",
  },
  {
    text: "Un giorno alla volta è già un programma.",
    textEn: "One day at a time is already a plan.",
    attribution: null,
    attributionEn: null,
  },
  {
    text: "Chi trova un amico trova un tesoro.",
    textEn: "A friend is a treasure.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Il silenzio è d’oro, la parola d’argento.",
    textEn: "Speech is silver, silence is golden.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Non rimandare a domani ciò che puoi fare oggi.",
    textEn: "Never put off till tomorrow what you can do today.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Mens sana in corpore sano.",
    textEn: "Mens sana in corpore sano.",
    attribution: "Giovenale",
    attributionEn: "Juvenal",
  },
  {
    text: "La curiosità è il motore del mattino.",
    textEn: "Curiosity is the engine of the morning.",
    attribution: null,
    attributionEn: null,
  },
  {
    text: "Patti chiari, amicizia lunga.",
    textEn: "Clear agreements, lasting friendship.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Chi vuole vada, chi non vuole mandi.",
    textEn: "If you want it done, go yourself.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "L’ordine libera la mente.",
    textEn: "Order clears the mind.",
    attribution: null,
    attributionEn: null,
  },
  {
    text: "Audentes fortuna iuvat.",
    textEn: "Audentes fortuna iuvat.",
    attribution: "Virgilio",
    attributionEn: "Virgil",
  },
  {
    text: "Il meglio è nemico del bene.",
    textEn: "Perfect is the enemy of good.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "Una pagina al giorno tiene l’oblio lontano.",
    textEn: "A page a day keeps oblivion away.",
    attribution: null,
    attributionEn: null,
  },
  {
    text: "Errare humanum est, perseverare autem diabolicum.",
    textEn: "Errare humanum est, perseverare autem diabolicum.",
    attribution: "Massima latina",
    attributionEn: "Latin maxim",
  },
  {
    text: "Chi dorme non piglia pesci.",
    textEn: "You snooze, you lose.",
    attribution: "Proverbio",
    attributionEn: "Proverb",
  },
  {
    text: "In mezzo alla tempesta, una lista chiara.",
    textEn: "In the middle of the storm, a clear list.",
    attribution: null,
    attributionEn: null,
  },
];

/** Aphorism for a given edition date key (YYYY-MM-DD after 06:00 rollover). */
export function getAphorismForDateKey(
  dateKey: string,
): Aphorism & { dateKey: string } {
  const index = editionDayIndex(dateKey) % APHORISMS.length;
  const picked = APHORISMS[index]!;
  return { ...picked, dateKey };
}

/** Today's edition aphorism (rolls with the 06:00 Europe/Rome sheet). */
export function getAphorismOfTheDay(): Aphorism & { dateKey: string } {
  return getAphorismForDateKey(getEditionDateKey(new Date(), config.timezone));
}

export function aphorismText(
  aphorism: Pick<Aphorism, "text" | "textEn">,
  lang: Lang,
): string {
  if (lang === "en") return aphorism.textEn || aphorism.text;
  return aphorism.text;
}
