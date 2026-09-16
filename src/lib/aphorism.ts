import { config } from "@/lib/config";
import { editionDayIndex, getEditionDateKey } from "@/lib/edition";

export type Aphorism = {
  text: string;
  attribution: string | null;
};

/**
 * Curated Italian sayings / aphorisms.
 * Selection is deterministic by calendar day in the newspaper timezone.
 */
const APHORISMS: Aphorism[] = [
  {
    text: "La mattina ha l’oro in bocca.",
    attribution: "Proverbio",
  },
  {
    text: "Chi va piano va sano e va lontano.",
    attribution: "Proverbio",
  },
  {
    text: "Il tempo è un’illusione; la sveglia no.",
    attribution: null,
  },
  {
    text: "Meglio un uovo oggi che una gallina domani.",
    attribution: "Proverbio",
  },
  {
    text: "Conosci te stesso.",
    attribution: "Massima delfica",
  },
  {
    text: "La semplicità è l’ultima sofisticazione.",
    attribution: "Leonardo da Vinci",
  },
  {
    text: "Non è la montagna che conquisti, ma te stesso.",
    attribution: null,
  },
  {
    text: "Piccoli gesti, grandi giorni.",
    attribution: null,
  },
  {
    text: "Chi semina vento raccoglie tempesta.",
    attribution: "Proverbio",
  },
  {
    text: "L’abito non fa il monaco, ma aiuta.",
    attribution: "Proverbio",
  },
  {
    text: "Nulla dies sine linea.",
    attribution: "Plinio il Vecchio",
  },
  {
    text: "Prima il dovere, poi il piacere.",
    attribution: "Proverbio",
  },
  {
    text: "Tra il dire e il fare c’è di mezzo il mare.",
    attribution: "Proverbio",
  },
  {
    text: "La costanza batte il talento, quando il talento non si allena.",
    attribution: null,
  },
  {
    text: "Festina lente.",
    attribution: "Augusto",
  },
  {
    text: "Un giorno alla volta è già un programma.",
    attribution: null,
  },
  {
    text: "Chi trova un amico trova un tesoro.",
    attribution: "Proverbio",
  },
  {
    text: "Il silenzio è d’oro, la parola d’argento.",
    attribution: "Proverbio",
  },
  {
    text: "Non rimandare a domani ciò che puoi fare oggi.",
    attribution: "Proverbio",
  },
  {
    text: "Mens sana in corpore sano.",
    attribution: "Giovenale",
  },
  {
    text: "La curiosità è il motore del mattino.",
    attribution: null,
  },
  {
    text: "Patti chiari, amicizia lunga.",
    attribution: "Proverbio",
  },
  {
    text: "Chi vuole vada, chi non vuole mandi.",
    attribution: "Proverbio",
  },
  {
    text: "L’ordine libera la mente.",
    attribution: null,
  },
  {
    text: "Audentes fortuna iuvat.",
    attribution: "Virgilio",
  },
  {
    text: "Il meglio è nemico del bene.",
    attribution: "Proverbio",
  },
  {
    text: "Una pagina al giorno tiene l’oblio lontano.",
    attribution: null,
  },
  {
    text: "Errare humanum est, perseverare autem diabolicum.",
    attribution: "Massima latina",
  },
  {
    text: "Chi dorme non piglia pesci.",
    attribution: "Proverbio",
  },
  {
    text: "In mezzo alla tempesta, una lista chiara.",
    attribution: null,
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
