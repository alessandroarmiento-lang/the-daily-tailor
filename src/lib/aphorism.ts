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
 * Short passages from poems, essays, and classics (public domain).
 * One sentence, with the work named. Deterministic by edition day.
 * A poem in an archaic language is given in prose, not in the original verse.
 * Index 11 is 2026-11-14: Whitman, Song of Myself 51.
 * Passages that think, not mottos.
 */
const QUOTES: Aphorism[] = [
  {
    text: "A metà del cammino della nostra vita mi ritrovai in una selva oscura.",
    textEn: "Halfway through the journey of our life, I found myself in a dark wood.",
    attribution: "Dante, Inferno",
    attributionEn: "Dante, Inferno",
  },
  {
    text: "Voi che entrate, abbandonate ogni speranza.",
    textEn: "You who enter here, abandon all hope.",
    attribution: "Dante, Inferno",
    attributionEn: "Dante, Inferno",
  },
  {
    text: "È l’amore che muove il sole e le altre stelle.",
    textEn: "It is the love that moves the sun and the other stars.",
    attribution: "Dante, Paradiso",
    attributionEn: "Dante, Paradiso",
  },
  {
    text: "Vado solo e pensoso, e misuro a passi lenti i campi più deserti.",
    textEn: "I go alone and thoughtful, and with slow steps I measure the most deserted fields.",
    attribution: "Petrarca, Canzoniere",
    attributionEn: "Petrarch, Canzoniere",
  },
  {
    text: "Non trovo pace, e non ho il modo di fare guerra.",
    textEn: "I find no peace, and I have no way to make war.",
    attribution: "Petrarca, Canzoniere",
    attributionEn: "Petrarch, Canzoniere",
  },
  {
    text: "Sempre caro mi fu quest’ermo colle, e questa siepe, che da tanta parte dell’ultimo orizzonte il guardo esclude.",
    textEn: "Always dear to me was this lonely hill, and this hedge, which from so much of the last horizon shuts off the view.",
    attribution: "Leopardi, L’infinito",
    attributionEn: "Leopardi, The Infinite",
  },
  {
    text: "Or poserai per sempre, stanco mio cor.",
    textEn: "Now you will rest forever, my tired heart.",
    attribution: "Leopardi, A se stesso",
    attributionEn: "Leopardi, To Himself",
  },
  {
    text: "Che fai tu, luna, in ciel? dimmi, che fai, silenziosa luna?",
    textEn: "What are you doing, moon, in the sky? Tell me, what are you doing, silent moon?",
    attribution: "Leopardi, Canto notturno",
    attributionEn: "Leopardi, Night Song",
  },
  {
    text: "Le tombe dei forti accendono un animo forte verso cose egregie.",
    textEn: "The tombs of the strong kindle a strong spirit toward noble things.",
    attribution: "Foscolo, Dei sepolcri",
    attributionEn: "Foscolo, On Sepulchres",
  },
  {
    text: "Un giorno, se non continuerò a fuggire di gente in gente, mi vedrai seduto sulla tua pietra.",
    textEn: "One day, if I do not keep fleeing from people to people, you will see me seated on your stone.",
    attribution: "Foscolo, In morte del fratello Giovanni",
    attributionEn: "Foscolo, On the Death of His Brother Giovanni",
  },
  {
    text: "Non c’è più. Appena ebbe esalato l’ultimo respiro, il corpo restò immobile e senza memoria.",
    textEn: "He is gone. As soon as he had breathed his last, the body stood still and remembered nothing.",
    attribution: "Manzoni, Il cinque maggio",
    attributionEn: "Manzoni, The Fifth of May",
  },
  {
    text: "Mi contraddico? Benissimo, allora mi contraddico (sono grande, contengo moltitudini).",
    textEn: "Do I contradict myself? Very well then I contradict myself (I am large, I contain multitudes).",
    attribution: "Whitman, Canto di me stesso, 51",
    attributionEn: "Whitman, Song of Myself, 51",
  },
  {
    text: "Canto le armi pietose e il capitano che liberò il grande sepolcro di Cristo.",
    textEn: "I sing of the compassionate arms and of the captain who freed the great sepulchre of Christ.",
    attribution: "Tasso, Gerusalemme liberata",
    attributionEn: "Tasso, Jerusalem Delivered",
  },
  {
    text: "Canto le donne, i cavalieri, le armi, gli amori, le cortesie e le imprese audaci.",
    textEn: "I sing of ladies, knights, arms, loves, courtesies, and bold deeds.",
    attribution: "Ariosto, Orlando furioso",
    attributionEn: "Ariosto, Orlando Furioso",
  },
  {
    text: "Senza contrari non c’è progresso.",
    textEn: "Without contraries is no progression.",
    attribution: "Blake, Il matrimonio del cielo e dell’inferno",
    attributionEn: "Blake, The Marriage of Heaven and Hell",
  },
  {
    text: "La via dell’eccesso porta al palazzo della saggezza.",
    textEn: "The road of excess leads to the palace of wisdom.",
    attribution: "Blake, Il matrimonio del cielo e dell’inferno",
    attributionEn: "Blake, The Marriage of Heaven and Hell",
  },
  {
    text: "La filosofia è scritta in questo grandissimo libro che continuamente ci sta aperto innanzi a gli occhi (io dico l’universo).",
    textEn: "Philosophy is written in this grand book which stands continually open to our eyes (I mean the universe).",
    attribution: "Galileo, Il Saggiatore",
    attributionEn: "Galileo, The Assayer",
  },
  {
    text: "Ogni uomo porta in sé la forma intera dell’umana condizione.",
    textEn: "Each man bears the entire form of the human condition.",
    attribution: "Montaigne, Saggi",
    attributionEn: "Montaigne, Essays",
  },
  {
    text: "Il cuore ha le sue ragioni, che la ragione non conosce.",
    textEn: "The heart has its reasons, which reason does not know.",
    attribution: "Pascal, Pensieri",
    attributionEn: "Pascal, Pensées",
  },
  {
    text: "Dolce e chiara è la notte e senza vento.",
    textEn: "Sweet and clear is the night, and without wind.",
    attribution: "Leopardi, La sera del dì di festa",
    attributionEn: "Leopardi, The Evening of the Holiday",
  },
  {
    text: "Neanch’io sono un poco domato, neanch’io sono traducibile.",
    textEn: "I too am not a bit tamed, I too am untranslatable.",
    attribution: "Whitman, Canto di me stesso",
    attributionEn: "Whitman, Song of Myself",
  },
  {
    text: "Lancio il mio grido barbarico sopra i tetti del mondo.",
    textEn: "I sound my barbaric yawp over the roofs of the world.",
    attribution: "Whitman, Canto di me stesso",
    attributionEn: "Whitman, Song of Myself",
  },
  {
    text: "Ci sono lacrime per le cose, e le cose mortali toccano la mente.",
    textEn: "There are tears for things, and mortal things touch the mind.",
    attribution: "Virgilio, Eneide",
    attributionEn: "Virgil, Aeneid",
  },
  {
    text: "Vedere un mondo in un granello di sabbia, e un cielo in un fiore selvatico.",
    textEn: "To see a world in a grain of sand, and a heaven in a wild flower.",
    attribution: "Blake, Auguri di innocenza",
    attributionEn: "Blake, Auguries of Innocence",
  },
  {
    text: "Quale la generazione delle foglie, tale è anche quella degli uomini.",
    textEn: "As is the generation of leaves, so is that of men.",
    attribution: "Omero, Iliade",
    attributionEn: "Homer, Iliad",
  },
  {
    text: "Tramontata è la luna e le Pleiadi a mezzo della notte; anche la giovinezza già dilegua, e io nel mio letto resto sola.",
    textEn: "The moon has set, and the Pleiades; it is the middle of the night, and youth goes by, and I lie in bed alone.",
    attribution: "Saffo",
    attributionEn: "Sappho",
  },
  {
    text: "Sono il poeta del Corpo e sono il poeta dell’Anima.",
    textEn: "I am the poet of the Body and I am the poet of the Soul.",
    attribution: "Whitman, Canto di me stesso",
    attributionEn: "Whitman, Song of Myself",
  },
  {
    text: "Sono Nessuno! E tu chi sei? Sei Nessuno anche tu?",
    textEn: "I’m Nobody! Who are you? Are you — Nobody — too?",
    attribution: "Emily Dickinson",
    attributionEn: "Emily Dickinson",
  },
  {
    text: "Vi sono più cose in cielo e in terra, Orazio, di quante ne sogni la tua filosofia.",
    textEn: "There are more things in heaven and earth, Horatio, than are dreamt of in your philosophy.",
    attribution: "Shakespeare, Amleto",
    attributionEn: "Shakespeare, Hamlet",
  },
  {
    text: "Siamo della stoffa di cui sono fatti i sogni, e la nostra breve vita è circondata da un sonno.",
    textEn: "We are such stuff as dreams are made on, and our little life is rounded with a sleep.",
    attribution: "Shakespeare, La tempesta",
    attributionEn: "Shakespeare, The Tempest",
  },
  {
    text: "Fermati, attimo, sei così bello.",
    textEn: "Stay, moment, you are so fair.",
    attribution: "Goethe, Faust",
    attributionEn: "Goethe, Faust",
  },
  {
    text: "Là, tutto è ordine e bellezza, lusso, calma e voluttà.",
    textEn: "There, all is order and beauty, luxury, calm, and pleasure.",
    attribution: "Baudelaire, I fiori del male",
    attributionEn: "Baudelaire, The Flowers of Evil",
  },
  {
    text: "Io è un altro.",
    textEn: "I is someone else.",
    attribution: "Rimbaud, Lettera del veggente",
    attributionEn: "Rimbaud, Letter of the Seer",
  },
  {
    text: "Tenera è la notte.",
    textEn: "Tender is the night.",
    attribution: "Keats, Ode a un usignolo",
    attributionEn: "Keats, Ode to a Nightingale",
  },
  {
    text: "Di’ tutta la verità, ma dilla obliqua.",
    textEn: "Tell all the truth but tell it slant.",
    attribution: "Emily Dickinson",
    attributionEn: "Emily Dickinson",
  },
  {
    text: "Esisto così come sono, e questo basta.",
    textEn: "I exist as I am, that is enough.",
    attribution: "Whitman, Canto di me stesso",
    attributionEn: "Whitman, Song of Myself",
  },
  {
    text: "Tutte le famiglie felici si assomigliano fra loro; ogni famiglia infelice è infelice a modo suo.",
    textEn: "All happy families are alike; each unhappy family is unhappy in its own way.",
    attribution: "Tolstoj, Anna Karenina",
    attributionEn: "Tolstoy, Anna Karenina",
  },
  {
    text: "È una verità universalmente riconosciuta che uno scapolo in possesso di una bella fortuna debba essere in cerca di moglie.",
    textEn: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    attribution: "Austen, Orgoglio e pregiudizio",
    attributionEn: "Austen, Pride and Prejudice",
  },
  {
    text: "Se le porte della percezione fossero purificate, ogni cosa apparirebbe all’uomo come è, infinita.",
    textEn: "If the doors of perception were cleansed every thing would appear to man as it is, infinite.",
    attribution: "Blake, Il matrimonio del cielo e dell’inferno",
    attributionEn: "Blake, The Marriage of Heaven and Hell",
  },
  {
    text: "Chiamatemi Ismaele.",
    textEn: "Call me Ishmael.",
    attribution: "Melville, Moby Dick",
    attributionEn: "Melville, Moby-Dick",
  },
];

/** Passage for a given edition date key (YYYY-MM-DD after 06:00 rollover). */
export function getAphorismForDateKey(
  dateKey: string,
): Aphorism & { dateKey: string } {
  const index = editionDayIndex(dateKey) % QUOTES.length;
  const picked = QUOTES[index]!;
  return { ...picked, dateKey };
}

/** Today's edition passage (rolls with the 06:00 Europe/Rome sheet). */
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

export function aphorismAttribution(
  aphorism: Pick<Aphorism, "attribution" | "attributionEn">,
  lang: Lang,
): string | null {
  if (lang === "en") return aphorism.attributionEn || aphorism.attribution;
  return aphorism.attribution;
}
