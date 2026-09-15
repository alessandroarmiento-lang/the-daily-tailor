import type { ActionEmailItem } from "@/lib/action-emails/types";

const NOISE_SENDER =
  /no-?reply|noreply|newsletter|mailer-daemon|notifications?@|bounce@|news@|marketing@|promo@|info@sprea|delosdigital|kickstarternewly|substack\.com|email\.airc|ilgiorno\.it|relaxbanking|posteitaliane|posteinfo|cartafreccia|trenitalia|maccount@microsoft|family\.microsoft|omptrans\.info|do not reply/i;

const NOISE_SUBJECT =
  /newsletter|unsubscribe|scont[oi]|promo(zione)?|advertisement|view in browser|punto[i]? scad|addebito diretto|notifica consegna|stato dell['’]ordine|spedizione|hai visto|classifica|glp-1|controllo gratuito|attività settimanale|report dell['’]attività|buongiorno .+!|essentiali per iniziare|nani e ballerine|you're invited|plancia|la mia storia continua/i;

const ACTION_HINT =
  /\b(puoi|potresti|per favore|cortesemente|ti chiedo|serve che|dovresti|conferma|rispondi|inviami|mandami|scaden|entro il|urgente|asap|please|could you|can you|need you to|action required|rsvp|let me know|waiting on you|deadline|firm[ae]|approva|revisione|feedback)\b/i;

export type MailRawMessage = {
  id: string;
  subject: string;
  sender: string;
  receivedAt: string;
  flagged?: boolean;
  preview?: string;
};

export function parseSender(raw: string): { name: string; address: string } {
  const m = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    return {
      name: (m[1] || m[2] || "").replace(/^"|"$/g, "").trim() || m[2]!,
      address: m[2]!.trim(),
    };
  }
  if (raw.includes("@")) return { name: raw.trim(), address: raw.trim() };
  return { name: raw.trim() || "Sconosciuto", address: "" };
}

export function isActionableMail(msg: MailRawMessage): boolean {
  const sender = msg.sender || "";
  const subject = msg.subject || "";
  const preview = msg.preview || "";
  const blob = `${subject}\n${preview}`;

  if (NOISE_SENDER.test(sender)) return false;
  if (NOISE_SUBJECT.test(subject)) return false;
  if (msg.flagged) return true;
  if (ACTION_HINT.test(blob)) return true;

  // Direct human-looking address + question / imperative cue
  const { address } = parseSender(sender);
  if (address && !NOISE_SENDER.test(address) && /[?？]|per favore|please/i.test(blob)) {
    return true;
  }
  return false;
}

export function actionCueFromMessage(msg: MailRawMessage): string {
  const subject = msg.subject.trim();
  if (msg.flagged) return `Segnata in Mail — ${subject.slice(0, 80)}`;
  if (/conferma|rsvp|approva/i.test(subject)) {
    return `Confermare / rispondere: ${subject.slice(0, 90)}`;
  }
  if (/scaden|deadline|entro/i.test(`${subject} ${msg.preview ?? ""}`)) {
    return `Scadenza / termine: ${subject.slice(0, 90)}`;
  }
  return `Valutare e rispondere: ${subject.slice(0, 90)}`;
}

export function toActionEmailItems(
  messages: MailRawMessage[],
  maxItems: number,
): ActionEmailItem[] {
  const picked = messages.filter(isActionableMail).slice(0, maxItems);
  return picked.map((msg, i) => {
    const { name, address } = parseSender(msg.sender);
    return {
      id: msg.id || `mail-${i}-${msg.receivedAt}`,
      subject: msg.subject || "(senza oggetto)",
      senderName: name,
      senderAddress: address,
      actionCue: actionCueFromMessage(msg),
      receivedAt: msg.receivedAt,
    };
  });
}
