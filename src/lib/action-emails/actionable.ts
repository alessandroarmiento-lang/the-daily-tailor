import type { ActionEmailItem } from "@/lib/action-emails/types";

/**
 * Actionable-email heuristics for The Daily Tailor.
 * Prefer: banks, Poste/shipping, Vinted, Italian PA, Contacts people.
 * Exclude: newsletters, marketing, social notifications, bulk promo
 * unless clearly actionable.
 */

/** Domains / sender patterns that are usually noise (deny). */
const DENY_SENDER =
  /newsletter|mailer-daemon|bounce@|news@|marketing@|promo@|noreply@.*substack|notifications?@(facebook|instagram|twitter|x\.com|linkedin|tiktok)|email\.airc|ilgiorno\.it|kickstarter|delosdigital|info@sprea|maccount@microsoft|family\.microsoft|omptrans\.info|do not reply.*newsletter|decathlon|doctolib|@email\.(decathlon|vinted)|itomi\.|kiprun|magnews|mailchimp|sendgrid|shopify/i;

/** Subject patterns that are usually noise (deny), unless allow-domain. */
const DENY_SUBJECT =
  /newsletter|unsubscribe|scont[oi]|promo(zione)?|advertisement|view in browser|punto[i]? scad|hai visto|classifica|glp-1|controllo gratuito|attività settimanale|report dell['’]attività|essentiali per iniziare|you're invited|plancia|la mia storia continua|digest settimanale|weekly digest|show\/case|leggerezza che performa|quando hai bisogno|risparmia|\d+\s*%|dimagrire|salumi|confezionat|offerta|coupon|black friday|solo oggi|ti aspetta|conto corrente italiano/i;

/**
 * Prefer / allow sender domains (Italian life ops).
 * These pass even for no-reply senders when the subject looks operational.
 */
const ALLOW_DOMAIN =
  /\b(intesa|unicredit|bnl|bps|bancoposta|fineco|chebanca|ing\.|isysbank|revolut|n26|wise\.com|paypal|relaxbanking|posteitaliane|poste\.it|posteid|sda\.it|bartolini|brt\.it|dhl\.|ups\.com|fedex|amazon\.|vinted\.|tim\.it|telecomitalia|inps\.|agenziaentrate|agenziaentrateriscossione|pagopa|io\.italia|spazio\.|comune\.|regione\.|poliziadistato|carabinieri|mise\.gov|interno\.gov|istruzione\.it|pec\.it)\b/i;

const ACTION_HINT =
  /\b(scadenz|pagamento|pagare|conferma|fattura|appuntamento|puoi|potresti|per favore|cortesemente|ti chiedo|serve che|dovresti|rispondi|inviami|mandami|entro il|urgente|asap|please|could you|can you|need you to|action required|rsvp|let me know|waiting on you|deadline|firm[ae]|approva|revisione|feedback|ritiro|spedizione|consegn|avviso di|bollettino|cartella|avviso bonario|codice otp|codice di verifica|verifica identit)\b/i;

const SHIPPING_ACTION =
  /\b(ritir[oa]|giacenza|fermoposta|consegn[ae]|tracking|tracciamento|in arrivo|non consegnat|spedizion[ei]|pickup|collect)\b/i;

const BANK_ACTION =
  /\b(bonifico|addebito|addebito diretto|pagamento|scadenz|carta|iban|disposizion|autorizza|otp|sicurezza|accesso|login|moviment)\b/i;

const PA_ACTION =
  /\b(scadenz|pagamento|avviso|cartella|bollettino|appuntamento|document[oi]|certificat|spazio|pec|notifica|ricevuta)\b/i;

const BULK_SENDER =
  /noreply|no[\s.-]?reply|donotreply|do[\s.-]?not[\s.-]?reply|newsletter|marketing|promo@|mailer-daemon|notifications?@/i;

function looksBulkSender(sender: string, address: string): boolean {
  return BULK_SENDER.test(sender) || BULK_SENDER.test(address);
}

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
  const bulk = looksBulkSender(sender, address);
  const opsSubject =
    /scadenz|fattura|addebito|bonifico|ritir|spedizion|otp|avviso bonario|giacenza|pagopa|cartella|bollettino/i.test(
      subject,
    );

  // Marketing / clickbait subjects never fill the rolling slots.
  if (DENY_SUBJECT.test(subject) && !opsSubject) return false;
  if (DENY_SENDER.test(sender) && !allow) return false;

  if (msg.flagged) return true;

  // Contacts: clear ask only (not every unread message from an address book hit).
  if (contact && !bulk) {
    if (ACTION_HINT.test(blob) || /[?？]/.test(blob)) return true;
  }

  if (allow) {
    if (SHIPPING_ACTION.test(blob) || BANK_ACTION.test(blob) || PA_ACTION.test(blob)) {
      return true;
    }
    if (ACTION_HINT.test(blob)) return true;
  }

  // Bank/ops cues even from noreply senders not yet on allow-list.
  if (BANK_ACTION.test(blob) && /bank|banca|banking|paypal|revolut|n26|wise|tim\.|telecom/i.test(sender + address)) {
    return true;
  }
  if (SHIPPING_ACTION.test(blob) && /poste|sda|brt|bartolini|dhl|ups|fedex|vinted|amazon/i.test(sender + address)) {
    return true;
  }

  // Human-looking senders with an explicit ask — never bare ACTION_HINT on bulk.
  // A lone "?" in a marketing subject is not a personal request.
  if (
    !bulk &&
    contact &&
    ACTION_HINT.test(blob) &&
    /[?？]|per favore|please|potresti|ti chiedo|rispondi/i.test(blob)
  ) {
    return true;
  }

  if (
    address &&
    !bulk &&
    contact &&
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

const HTML_NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  agrave: "à",
  egrave: "è",
  eacute: "é",
  igrave: "ì",
  ograve: "ò",
  ugrave: "ù",
  Agrave: "À",
  Egrave: "È",
  Eacute: "É",
  Igrave: "Ì",
  Ograve: "Ò",
  Ugrave: "Ù",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([A-Za-z]+);/g, (match, name: string) => {
      return HTML_NAMED_ENTITIES[name] ?? HTML_NAMED_ENTITIES[name.toLowerCase()] ?? match;
    });
}

/** Compact plain body for the A4 email slot (a few lines). */
export function bodyPreviewFromMessage(msg: MailRawMessage): string {
  let raw = (msg.preview || "").trim();
  if (!raw) return "";

  // HTML / CSS noise from multipart messages without a clean text part.
  raw = raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/@media[\s\S]*?\{[\s\S]*?\}\s*\}/gi, " ")
    .replace(/@font-face[\s\S]*?\}/gi, " ")
    .replace(/\{[^{}]{0,400}\}/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/<[^>]+>/g, " ");
  raw = decodeHtmlEntities(decodeHtmlEntities(raw))
    .replace(/\s+/g, " ")
    .trim();

  // Drop leftover CSS property chatter.
  raw = raw
    .replace(
      /\b(font-(family|style|weight|display|size)|unicode-range|src|local|format|woff2?|swap)\b[^.;]{0,80}/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "";

  // Prefer a human sentence if we can find one after branding chrome.
  const sentence = raw.match(
    /(?:Gentile|Ciao|Buongiorno|Buonasera|Caro|Cara|Hi |Hello |Dear |ti informiamo|È stato|E' stato|La informiamo)[\s\S]{20,280}/i,
  );
  const picked = (sentence?.[0] || raw).trim();
  return picked.slice(0, 320);
}

/**
 * RFC Message-ID local@domain. Rejects placeholders like `ADR…@*` that Mail
 * cannot resolve (MCMailErrorDomain 1030).
 */
export function isValidRfcMessageId(messageId: string): boolean {
  const bare = messageId.replace(/^<|>$/g, "").trim();
  if (!bare || bare.startsWith("imap-")) return false;
  if (/[*?\s<>]/.test(bare)) return false;
  const at = bare.lastIndexOf("@");
  if (at <= 0 || at >= bare.length - 1) return false;
  const domain = bare.slice(at + 1);
  // Require a real hostname (letter/digit, optional dots), not `*` / bare TLD.
  return /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(domain);
}

/**
 * Deep link to open a message.
 * - Gmail → web search by rfc822msgid (https works in the browser).
 * - iCloud / other → Mail.app via opaque `message:` URL (no `//`).
 *   `message://…@…` is parsed as URL authority by browsers, so the click
 *   silently does nothing. AppleScript’s unencoded `@` is fine once there is
 *   no authority section; still escape literal `%`.
 * Invalid Message-IDs return undefined — Mac helper opens by subject instead.
 */
export function messageUrlFromId(
  messageId: string,
  account?: string | null,
): string | undefined {
  const id = messageId.trim();
  if (!id) return undefined;
  const bare = id.replace(/^<|>$/g, "").trim();
  if (!isValidRfcMessageId(bare)) return undefined;

  const accountLabel = (account ?? "").toLowerCase();
  if (accountLabel.includes("gmail") || accountLabel.includes("google")) {
    return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(bare)}`;
  }

  const escaped = bare.replace(/%/g, "%25");
  return `message:%3C${escaped}%3E`;
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
  // Recency tie-break within importance (primary sort is by date below).
  const t = Date.parse(msg.receivedAt);
  if (!Number.isNaN(t)) score += Math.min(40, Math.floor(t / 100_000) % 40);

  return score;
}

/**
 * Actionable only, newest first. The A4 slot keeps the last N; a newer
 * message bumps the oldest out.
 */
export function rankActionableMail(
  messages: MailRawMessage[],
  ctx: ActionClassifyContext = {},
): MailRawMessage[] {
  return messages
    .filter((m) => isActionableMail(m, ctx))
    .sort((a, b) => {
      const tb = Date.parse(b.receivedAt) || 0;
      const ta = Date.parse(a.receivedAt) || 0;
      if (tb !== ta) return tb - ta;
      return emailImportanceScore(b, ctx) - emailImportanceScore(a, ctx);
    });
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
    const fromId = messageUrlFromId(msg.id, msg.account);
    // Never keep a stale/broken `message:` URL (e.g. `@*` Message-IDs).
    const messageUrl =
      fromId ??
      (msg.messageUrl?.startsWith("https://") ? msg.messageUrl : undefined);
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
