import type { ActionEmailItem } from "@/lib/action-emails/types";

/**
 * Actionable-email heuristics for The Daily Tailor.
 * Prefer: banks, Poste/shipping, Vinted, Italian PA, Contacts people.
 * Exclude: newsletters, marketing, social notifications, bulk promo
 * unless clearly actionable.
 */

/** Domains / sender patterns that are usually noise (deny). */
const DENY_SENDER =
  /newsletter|mailer-daemon|bounce@|news@|marketing@|promo@|noreply@.*substack|notifications?@(facebook|instagram|twitter|x\.com|linkedin|tiktok)|email\.airc|ilgiorno\.it|kickstarter|delosdigital|info@sprea|maccount@microsoft|family\.microsoft|omptrans\.info|do not reply.*newsletter/i;

/** Subject patterns that are usually noise (deny), unless allow-domain. */
const DENY_SUBJECT =
  /newsletter|unsubscribe|scont[oi]|promo(zione)?|advertisement|view in browser|punto[i]? scad|hai visto|classifica|glp-1|controllo gratuito|attività settimanale|report dell['’]attività|essentiali per iniziare|you're invited|plancia|la mia storia continua|digest settimanale|weekly digest/i;

/**
 * Prefer / allow sender domains (Italian life ops).
 * These pass even for no-reply senders when the subject looks operational.
 */
const ALLOW_DOMAIN =
  /\b(intesa|unicredit|bnl|bps|bancoposta|fineco|chebanca|ing\.|isysbank|revolut|n26|wise\.com|paypal|relaxbanking|posteitaliane|poste\.it|posteid|sda\.it|bartolini|brt\.it|dhl\.|ups\.com|fedex|amazon\.|vinted\.|inps\.|agenziaentrate|agenziaentrateriscossione|pagopa|io\.italia|spazio\.|comune\.|regione\.|poliziadistato|carabinieri|mise\.gov|interno\.gov|istruzione\.it|pec\.it)\b/i;

const ACTION_HINT =
  /\b(scadenz|pagamento|pagare|conferma|fattura|appuntamento|puoi|potresti|per favore|cortesemente|ti chiedo|serve che|dovresti|rispondi|inviami|mandami|entro il|urgente|asap|please|could you|can you|need you to|action required|rsvp|let me know|waiting on you|deadline|firm[ae]|approva|revisione|feedback|ritiro|spedizione|consegn|avviso di|bollettino|cartella|avviso bonario|codice otp|codice di verifica|verifica identit)\b/i;

const SHIPPING_ACTION =
  /\b(ritir[oa]|giacenza|fermoposta|consegn[ae]|tracking|tracciamento|in arrivo|non consegnat|spedizion[ei]|pickup|collect)\b/i;

const BANK_ACTION =
  /\b(bonifico|addebito|addebito diretto|pagamento|scadenz|carta|iban|disposizion|autorizza|otp|sicurezza|accesso|login|moviment)\b/i;

const PA_ACTION =
  /\b(scadenz|pagamento|avviso|cartella|bollettino|appuntamento|document[oi]|certificat|spazio|pec|notifica|ricevuta)\b/i;

export type MailRawMessage = {
  id: string;
  subject: string;
  sender: string;
  receivedAt: string;
  flagged?: boolean;
  unread?: boolean;
  preview?: string;
  /** Mail.app / IMAP account label when known (iCloud, Google, …). */
  account?: string;
  /** message:// deep link when available. */
  messageUrl?: string;
};

export type ActionClassifyContext = {
  /** Lowercased email addresses from iCloud Contacts / CardDAV. */
  contactEmails?: Set<string>;
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

function senderDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1).toLowerCase() : "";
}

function isAllowDomain(address: string, sender: string): boolean {
  const domain = senderDomain(address);
  return ALLOW_DOMAIN.test(domain) || ALLOW_DOMAIN.test(sender);
}

function isContact(
  address: string,
  contactEmails: Set<string> | undefined,
): boolean {
  if (!contactEmails || !address) return false;
  return contactEmails.has(address.toLowerCase());
}

export function isActionableMail(
  msg: MailRawMessage,
  ctx: ActionClassifyContext = {},
): boolean {
  const sender = msg.sender || "";
  const subject = msg.subject || "";
  const preview = msg.preview || "";
  const blob = `${subject}\n${preview}`;
  const { address } = parseSender(sender);

  const allow = isAllowDomain(address, sender);
  const contact = isContact(address, ctx.contactEmails);

  // Hard deny for marketing/noise — unless allow-domain + operational cue.
  if (DENY_SENDER.test(sender) && !allow && !contact) return false;
  if (DENY_SUBJECT.test(subject) && !allow && !contact) return false;

  if (msg.flagged) return true;
  if (contact && (ACTION_HINT.test(blob) || /[?？]/.test(blob) || msg.unread)) {
    return true;
  }
  if (contact && !DENY_SUBJECT.test(subject) && !DENY_SENDER.test(sender)) {
    // Real person in Contacts: keep unread/recent human mail even without keyword.
    if (msg.unread || ACTION_HINT.test(blob) || /[?？]/.test(blob)) return true;
  }

  if (allow) {
    if (SHIPPING_ACTION.test(blob) || BANK_ACTION.test(blob) || PA_ACTION.test(blob)) {
      return true;
    }
    if (ACTION_HINT.test(blob)) return true;
    // Allow-list domain + unread: still surface (ops mail often terse).
    if (msg.unread) return true;
  }

  // Bank/ops cues even from noreply senders not yet on allow-list.
  if (BANK_ACTION.test(blob) && /bank|banca|banking|paypal|revolut|n26|wise/i.test(sender)) {
    return true;
  }

  if (ACTION_HINT.test(blob)) return true;

  if (
    address &&
    !DENY_SENDER.test(address) &&
    /[?？]|per favore|please/i.test(blob)
  ) {
    return true;
  }

  return false;
}

export function actionCueFromMessage(msg: MailRawMessage): string {
  const subject = msg.subject.trim();
  const blob = `${subject} ${msg.preview ?? ""}`;
  if (msg.flagged) return `Segnata — ${subject.slice(0, 80)}`;
  if (SHIPPING_ACTION.test(blob)) {
    return `Spedizione / ritiro: ${subject.slice(0, 90)}`;
  }
  if (BANK_ACTION.test(blob)) {
    return `Banca / pagamento: ${subject.slice(0, 90)}`;
  }
  if (PA_ACTION.test(blob) && ALLOW_DOMAIN.test(msg.sender)) {
    return `PA / adempimento: ${subject.slice(0, 90)}`;
  }
  if (/conferma|rsvp|approva/i.test(subject)) {
    return `Confermare / rispondere: ${subject.slice(0, 90)}`;
  }
  if (/scaden|deadline|entro/i.test(blob)) {
    return `Scadenza / termine: ${subject.slice(0, 90)}`;
  }
  if (/fattura/i.test(blob)) {
    return `Fattura da gestire: ${subject.slice(0, 90)}`;
  }
  return `Valutare e rispondere: ${subject.slice(0, 90)}`;
}

/** Compact plain body for the A4 email slot (a few lines). */
export function bodyPreviewFromMessage(msg: MailRawMessage): string {
  const raw = (msg.preview || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  // Drop leading subject echo / boilerplate markers.
  const cleaned = raw
    .replace(/^(re|fw|fwd)\s*:\s*/i, "")
    .replace(/^[-–—]+\s*/, "")
    .trim();
  return cleaned.slice(0, 320);
}

export function messageUrlFromId(messageId: string): string | undefined {
  const id = messageId.trim();
  if (!id) return undefined;
  // Mail.app message:// deep link uses angle-bracket Message-ID, URL-encoded.
  const bare = id.replace(/^<|>$/g, "");
  if (!bare.includes("@") && !bare.includes(".")) {
    // Not an RFC Message-ID — skip fragile deep link.
    return undefined;
  }
  return `message://%3C${encodeURIComponent(bare)}%3E`;
}

/** Higher = more important for the A4 Email slot. */
export function emailImportanceScore(
  msg: MailRawMessage,
  ctx: ActionClassifyContext = {},
): number {
  const sender = msg.sender || "";
  const subject = msg.subject || "";
  const preview = msg.preview || "";
  const blob = `${subject}\n${preview}`;
  const { address } = parseSender(sender);
  let score = 0;

  if (msg.flagged) score += 500;
  if (isAllowDomain(address, sender)) score += 300;
  if (isContact(address, ctx.contactEmails)) score += 220;
  if (SHIPPING_ACTION.test(blob)) score += 180;
  if (BANK_ACTION.test(blob)) score += 180;
  if (PA_ACTION.test(blob)) score += 160;
  if (ACTION_HINT.test(blob)) score += 120;
  if (msg.unread) score += 60;
  // Prefer more recent within yesterday.
  const t = Date.parse(msg.receivedAt);
  if (!Number.isNaN(t)) score += Math.min(40, Math.floor(t / 100_000) % 40);

  return score;
}

export function rankActionableMail(
  messages: MailRawMessage[],
  ctx: ActionClassifyContext = {},
): MailRawMessage[] {
  return messages
    .filter((m) => isActionableMail(m, ctx))
    .sort((a, b) => emailImportanceScore(b, ctx) - emailImportanceScore(a, ctx));
}

export function toActionEmailItems(
  messages: MailRawMessage[],
  maxItems: number,
  ctx: ActionClassifyContext = {},
): ActionEmailItem[] {
  const { items } = toActionEmailItemsWithOverflow(messages, maxItems, ctx);
  return items;
}

export function toActionEmailItemsWithOverflow(
  messages: MailRawMessage[],
  maxItems: number,
  ctx: ActionClassifyContext = {},
): { items: ActionEmailItem[]; hiddenCount: number } {
  const ranked = rankActionableMail(messages, ctx);
  const hiddenCount = Math.max(0, ranked.length - maxItems);
  const picked = ranked.slice(0, maxItems);
  const items = picked.map((msg, i) => {
    const { name, address } = parseSender(msg.sender);
    const messageUrl =
      msg.messageUrl || messageUrlFromId(msg.id) || undefined;
    return {
      id: msg.id || `mail-${i}-${msg.receivedAt}`,
      subject: msg.subject || "(senza oggetto)",
      senderName: name,
      senderAddress: address,
      actionCue: actionCueFromMessage(msg),
      bodyPreview: bodyPreviewFromMessage(msg),
      receivedAt: msg.receivedAt,
      messageUrl,
      account: msg.account,
    };
  });
  return { items, hiddenCount };
}

/** Pool of actionable candidates to keep before A4 cap (for +N altre email). */
export function actionEmailFetchPool(maxVisible: number): number {
  return Math.max(24, maxVisible * 8);
}
