import { spawn } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HealthBriefing, HealthLine } from "./types";

const CUE_RE = /^([a-z_]+): ([a-z]+)\s*$/;

/** Directions written at the end of the Second Brain report. No figures. */
export function parseSheetCues(markdown: string): Record<string, string> | null {
  const start = markdown.indexOf("## Sheet cues");
  if (start < 0) return null;
  const body = markdown.slice(start).split(/\n## /)[0] ?? "";
  const cues: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const match = CUE_RE.exec(line.trim());
    if (match?.[1] && match[2]) cues[match[1]] = match[2];
  }
  if (!cues.sleep || !cues.bp || !cues.activity) return null;
  return cues;
}

/**
 * Judgment and one piece of advice, from the report's direction words.
 * The sentences stay descriptive: no figures and no device names.
 */
export function healthLinesFromCues(cues: Record<string, string>): HealthLine[] | null {
  const sleep = cues.sleep;
  const regularity = cues.sleep_regularity ?? "thin";
  const bp = cues.bp;
  const activity = cues.activity;
  const intake = cues.intake ?? "missing";
  const intakePrior = cues.intake_prior ?? "thin";
  const recovery = cues.recovery ?? "thin";
  if (!sleep || !bp || !activity) return null;

  let sleepText: string;
  if (sleep === "missing") {
    sleepText = "Non c'è la notte appena passata, quindi niente giudizio sul sonno.";
  } else if (sleep === "thin") {
    sleepText = "Non c'è abbastanza sonno recente per un giudizio.";
  } else if (sleep === "split") {
    sleepText = "I rilievi del sonno non vanno d'accordo tra loro. Tieni lo stesso orario di sonno.";
  } else if (sleep === "short") {
    sleepText = regularity === "down"
      ? "Il sonno è più corto e meno regolare del tuo solito. Anticipa un po' l'ora di dormire e tienila stabile."
      : "Il sonno è più corto del tuo solito. Anticipa un po' l'ora di dormire e tieni la sveglia uguale.";
  } else if (sleep === "long") {
    sleepText = regularity === "down"
      ? "Hai dormito a lungo, ma l'orario è meno regolare del tuo solito. Tieni l'ora di dormire e della sveglia vicine al solito."
      : "Hai dormito bene: sonno più lungo del tuo solito. Tieni lo stesso orario di sonno.";
  } else if (regularity === "down") {
    sleepText = "Il sonno è meno regolare del tuo solito. Tieni l'ora di dormire e della sveglia vicine al solito.";
  } else {
    sleepText = "Hai dormito bene: sonno in linea col tuo solito. Tieni lo stesso orario di sonno.";
  }

  let pressure: string;
  if (bp === "thin") {
    pressure = "Non c'è una pressione arteriosa recente.";
  } else if (bp === "low") {
    pressure = "L'ultima pressione è più bassa del tuo solito.";
  } else if (bp === "high") {
    pressure = "L'ultima pressione è più alta del tuo solito. Giornata più leggera, senza sforzo intenso.";
  } else if (bp === "rising") {
    pressure = "La pressione arteriosa è più alta del tuo solito e sta salendo. Giornata più leggera, senza sforzo intenso.";
  } else if (bp === "falling") {
    pressure = "La pressione arteriosa è più bassa del tuo solito e sta scendendo. Se ti senti fiacco, non aggiungere sforzo.";
  } else {
    pressure = "La pressione arteriosa è nel tuo solito. Niente da cambiare.";
  }

  let movement: string;
  if (activity === "missing") {
    movement = "Non c'è l'attività di ieri, quindi niente giudizio.";
  } else if (activity === "thin") {
    movement = "Non c'è abbastanza attività recente per un giudizio.";
  } else if (activity === "low") {
    movement = "L'attività è sotto il tuo solito. Una camminata, senza alzare l'intensità.";
  } else if (activity === "high") {
    movement = "L'attività è sopra il tuo solito. Non alzare l'intensità.";
  } else {
    movement = "L'attività è in linea col tuo solito. Tieni questo passo, senza alzare l'intensità.";
  }

  let intakeText: string;
  if (intake === "thin") {
    intakeText = "Non c'è abbastanza alimentazione recente per un giudizio. Segna i pasti per qualche giorno.";
  } else if (intake === "low") {
    intakeText = "L'alimentazione di ieri è sotto il tuo solito. Avvicinala al tuo solito, senza inseguire un numero.";
  } else if (intake === "high") {
    intakeText = "L'alimentazione di ieri è sopra il tuo solito. Non aggiungere.";
  } else if (intake === "line") {
    intakeText = "L'alimentazione di ieri è in linea col tuo solito. Tieni questo.";
  } else if (intake === "stale") {
    if (intakePrior === "high") {
      intakeText = "Il diario alimentare è fermo: nell'ultimo periodo segnato l'apporto era sopra il tuo solito. Riprendi a segnare i pasti, senza aggiungere.";
    } else if (intakePrior === "low") {
      intakeText = "Il diario alimentare è fermo: nell'ultimo periodo segnato l'apporto era sotto il tuo solito. Riprendi a segnare i pasti, senza tagliare ancora.";
    } else if (intakePrior === "line") {
      intakeText = "Il diario alimentare è fermo: nell'ultimo periodo segnato l'apporto era in linea col tuo solito. Riprendi a segnare i pasti e tieni questo.";
    } else {
      intakeText = "Il diario alimentare è fermo, quindi niente giudizio sull'apporto recente. Riprendi a segnare i pasti.";
    }
  } else {
    intakeText = "Non c'è un diario alimentare. Segna i pasti per qualche giorno.";
  }

  const lines: HealthLine[] = [
    { label: "Sonno", text: sleepText },
    { label: "Pressione", text: pressure },
    { label: "Attività", text: movement },
    { label: "Alimentazione", text: intakeText },
  ];
  if (recovery === "off") {
    lines.push({
      label: "In generale",
      text: "Il recupero è sotto il tuo solito. Giornata più leggera, senza sforzo intenso.",
    });
  }

  const leaked = lines.some((line) => /\d/.test(line.text) || /withings|ringconn|watch|apple|mmhg|bpm/i.test(line.text));
  if (leaked) return null;
  return lines;
}

function reportsDir(): string {
  return path.join(os.homedir(), "Brain", "index", "health", "reports");
}

function reportFile(dateKey: string): string {
  return path.join(reportsDir(), `report_${dateKey}.md`);
}

async function readCues(file: string): Promise<Record<string, string> | null> {
  try {
    const text = await readFile(file, "utf8");
    return parseSheetCues(text);
  } catch {
    return null;
  }
}

async function archiveNewerThan(reportPath: string): Promise<boolean> {
  const reportStat = await stat(reportPath).catch(() => null);
  if (!reportStat) return true;
  const apple = path.join(os.homedir(), "Brain", "index", "health", "apple");
  let names: string[] = [];
  try {
    names = await readdir(apple);
  } catch {
    return false;
  }
  for (const name of names) {
    if (!name.endsWith(".csv")) continue;
    const fileStat = await stat(path.join(apple, name)).catch(() => null);
    if (fileStat && fileStat.mtimeMs > reportStat.mtimeMs) return true;
  }
  return false;
}

function refreshReport(dateKey: string): Promise<void> {
  const script = path.join(os.homedir(), "Brain", "second-brain", "scripts", "health", "report.py");
  return new Promise((resolve) => {
    const child = spawn("python3", [script, "run", "--date", dateKey], { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 120_000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function latestReportWithCues(dateKey: string): Promise<string | null> {
  let names: string[] = [];
  try {
    names = await readdir(reportsDir());
  } catch {
    return null;
  }
  const older = names
    .map((name) => /^report_(\d{4}-\d{2}-\d{2})\.md$/.exec(name)?.[1])
    .filter((day): day is string => Boolean(day && day <= dateKey))
    .sort();
  for (let i = older.length - 1; i >= 0; i -= 1) {
    const day = older[i];
    if (!day) continue;
    const cues = await readCues(reportFile(day));
    if (cues) return reportFile(day);
  }
  return null;
}

/** Rebuild the local report from the downloaded archive, then read its cues. */
export async function briefingFromSecondBrainReport(dateKey: string): Promise<HealthBriefing | null> {
  const script = path.join(os.homedir(), "Brain", "second-brain", "scripts", "health", "report.py");
  try {
    await access(script);
  } catch {
    return null;
  }

  const file = reportFile(dateKey);
  let cues = await readCues(file);
  if (!cues || await archiveNewerThan(file)) {
    await refreshReport(dateKey);
    cues = await readCues(file);
  }
  if (!cues) {
    const older = await latestReportWithCues(dateKey);
    cues = older ? await readCues(older) : null;
  }
  if (!cues) return null;
  const lines = healthLinesFromCues(cues);
  if (!lines || lines.length === 0) return null;
  return {
    lines,
    fetchedAt: new Date().toISOString(),
    sourceLabel: "Second brain",
  };
}
