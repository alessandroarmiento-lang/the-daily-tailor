import type { NewsBriefing, NewsItem } from "./types";

const MOCK_ITEMS: NewsItem[] = [
  {
    id: "mock-1",
    title: "I mercati asiatici aprono in rialzo dopo i dati sull’inflazione",
    summary:
      "Tokyo e Seoul guadagnano terreno; gli investitori attendono le decisioni delle banche centrali.",
    source: "Il Post",
    url: "https://www.ilpost.it/mondo/",
    publishedAt: new Date().toISOString(),
  },
  {
    id: "mock-2",
    title: "Vertice europeo: accordo di massima su energia e difesa",
    summary:
      "I leader discutono scorte strategiche e coordinamento industriale per il prossimo semestre.",
    source: "Il Post",
    url: "https://www.ilpost.it/mondo/",
    publishedAt: new Date().toISOString(),
  },
  {
    id: "mock-3",
    title: "Scienza: nuovo studio sul clima mediterraneo",
    summary:
      "Le estati più lunghe e le siccità ricorrenti ridisegnano agricoltura e turismo nel bacino.",
    source: "Il Post",
    url: "https://www.ilpost.it/mondo/",
    publishedAt: new Date().toISOString(),
  },
  {
    id: "mock-4",
    title: "Tecnologia: aggiornamento dei modelli linguistici open source",
    summary:
      "Nuove versioni migliorano ragionamento e multilingua, con licenze più chiare per l’uso commerciale.",
    source: "Il Post",
    url: "https://www.ilpost.it/mondo/",
    publishedAt: new Date().toISOString(),
  },
  {
    id: "mock-5",
    title: "Medio Oriente: riprendono i colloqui di cessate il fuoco",
    summary:
      "Diplomazia intensa a margine dell’Assemblea ONU; resta aperta la questione degli ostaggi.",
    source: "Il Post",
    url: "https://www.ilpost.it/mondo/",
    publishedAt: new Date().toISOString(),
  },
  {
    id: "mock-6",
    title: "Sport: preparativi per la stagione europea di calcio",
    summary:
      "Mercato ancora aperto; le grandi di Serie A e Premier chiudono gli ultimi rinforzi.",
    source: "Il Post",
    url: "https://www.ilpost.it/mondo/",
    publishedAt: new Date().toISOString(),
  },
];

export function mockNews(): NewsBriefing {
  return {
    items: MOCK_ITEMS,
    feedLabel: "Notizie simulate",
    fetchedAt: new Date().toISOString(),
    isMock: true,
  };
}
