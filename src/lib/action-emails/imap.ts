/**
 * Headless IMAP actionable-mail adapter.
 * Scans iCloud Mail + Gmail (app passwords) — works with Mac powered off.
 * Rolling lookback: newest actionable messages fill the A4 slot (last N).
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import { getEditionDateKey } from "@/lib/edition";
import {
  actionEmailFetchPool,
  pictureFromMessages,
  type MailRawMessage,
} from "./actionable";
import { loadContactEmails } from "@/lib/contacts/carddav";
import type { ActionEmailAdapter, ActionEmailItem, MailScan } from "./types";

function asMailScan(data: MailScan | ActionEmailItem[] | undefined): MailScan | null {
  if (!data || Array.isArray(data)) return null;
  if (Array.isArray(data.items) && typeof data.analysis === "string") return data;
  return null;
}

type ImapAccount = {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  pass: string;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function configuredImapAccounts(): ImapAccount[] {
  const accounts: ImapAccount[] = [];

  const icloudUser = env("ICLOUD_MAIL_USER");
  const icloudPass = env("ICLOUD_MAIL_APP_PASSWORD");
  if (icloudUser && icloudPass) {
    accounts.push({
      id: "icloud",
      label: "iCloud Mail",
      host: env("ICLOUD_IMAP_HOST") || "imap.mail.me.com",
      port: Number(env("ICLOUD_IMAP_PORT") || "993"),
      user: icloudUser,
      pass: icloudPass.replace(/\s+/g, ""),
    });
  }

  const gmailUser = env("GMAIL_USER") || env("GOOGLE_MAIL_USER");
  const gmailPass = env("GMAIL_APP_PASSWORD") || env("GOOGLE_MAIL_APP_PASSWORD");
  if (gmailUser && gmailPass) {
    accounts.push({
      id: "gmail",
      label: "Gmail",
      host: env("GMAIL_IMAP_HOST") || "imap.gmail.com",
      port: Number(env("GMAIL_IMAP_PORT") || "993"),
      user: gmailUser,
      pass: gmailPass.replace(/\s+/g, ""),
    });
  }

  return accounts;
}

export function hasImapCredentials(): boolean {
  return configuredImapAccounts().length > 0;
}

/** Civil lookback start in newspaper timezone → Date (host TZ / Fly TZ=Rome). */
function lookbackSince(timeZone: string, lookbackDays: number): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = fmt.format(now);
  const [y, m, d] = todayKey.split("-").map(Number);
  const todayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const since = new Date(todayStart);
  since.setDate(since.getDate() - Math.max(1, lookbackDays));
  return since;
}

const SKIP_SPECIAL = new Set([
  "\\Trash",
  "\\Junk",
  "\\Drafts",
  "\\Sent",
  "\\All",
  "\\Flagged",
]);

function isReceivedMailbox(box: {
  path: string;
  name?: string;
  specialUse?: string;
  flags?: Set<string>;
}): boolean {
  if (box.flags?.has("\\Noselect")) return false;
  if (box.specialUse && SKIP_SPECIAL.has(box.specialUse)) return false;
  const label = `${box.path} ${box.name ?? ""}`.toLowerCase();
  return !/trash|junk|spam|draft|cestino|indesiderat|bozze|\bsent\b|inviat|all mail|tutti i messaggi|starred|contrassegn/.test(
    label,
  );
}

function formatAddress(entry?: { name?: string; address?: string }): string {
  if (!entry) return "";
  if (entry.name && entry.address) return `${entry.name} <${entry.address}>`;
  return entry.address || entry.name || "";
}

function addressedToUser(
  to: Array<{ address?: string }> | undefined,
  user: string,
): boolean {
  const want = user.toLowerCase();
  return (to ?? []).some((entry) => (entry.address ?? "").toLowerCase() === want);
}

async function fetchAccountRecent(
  account: ImapAccount,
  since: Date,
  scanCap: number,
): Promise<{ messages: MailRawMessage[]; error?: string }> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
    // Without these, a stuck mailbox keeps /api/morning-warm (and AGGIORNA) hanging.
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });

  const messages: MailRawMessage[] = [];
  try {
    await client.connect();
    const listed = await client.list();
    const boxes = listed
      .filter((box) => isReceivedMailbox(box))
      .sort((a, b) => {
        const aInbox = a.specialUse === "\\Inbox" || a.path === "INBOX" ? 0 : 1;
        const bInbox = b.specialUse === "\\Inbox" || b.path === "INBOX" ? 0 : 1;
        return aInbox - bInbox;
      })
      .slice(0, 12);

    type Hit = {
      path: string;
      uid: number;
      id: string;
      subject: string;
      sender: string;
      receivedAt: string;
      unread: boolean;
      flagged: boolean;
      toUser: boolean;
    };
    const hits: Hit[] = [];
    const seenIds = new Set<string>();

    for (const box of boxes) {
      let lock: { release: () => void } | undefined;
      try {
        lock = await client.getMailboxLock(box.path);
        let uids: number[] = [];
        try {
          const found = await client.search({ since }, { uid: true });
          uids = Array.isArray(found) ? found : [];
        } catch {
          uids = [];
        }
        uids = uids.sort((a, b) => b - a).slice(0, 18);
        if (uids.length === 0) continue;
        for await (const msg of client.fetch(
          uids,
          { uid: true, envelope: true, flags: true, internalDate: true },
          { uid: true },
        )) {
          const envelope = msg.envelope;
          const receivedRaw = msg.internalDate ?? envelope?.date;
          const received = receivedRaw ? new Date(receivedRaw) : undefined;
          if (!received || Number.isNaN(received.getTime()) || received < since) continue;
          const id =
            (envelope?.messageId && String(envelope.messageId)) ||
            `imap-${account.id}-${box.path}-${msg.uid}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          const flags = msg.flags;
          hits.push({
            path: box.path,
            uid: msg.uid,
            id,
            subject: envelope?.subject || "(senza oggetto)",
            sender: formatAddress(envelope?.from?.[0]),
            receivedAt: received.toISOString(),
            unread: flags ? !flags.has("\\Seen") : false,
            flagged: flags ? flags.has("\\Flagged") : false,
            toUser: addressedToUser(envelope?.to, account.user),
          });
        }
      } catch {
        // One folder must not abort the account.
      } finally {
        lock?.release();
      }
    }

    const download = [...hits]
      .sort((a, b) => (Date.parse(b.receivedAt) || 0) - (Date.parse(a.receivedAt) || 0))
      .slice(0, Math.min(40, scanCap));

    for (const hit of download) {
      let lock: { release: () => void } | undefined;
      try {
        lock = await client.getMailboxLock(hit.path);
        const downloaded = await client.download(String(hit.uid), undefined, {
          uid: true,
        });
        if (!downloaded?.content) continue;
        const parsed = await simpleParser(downloaded.content);
        const textPart = (parsed.text || "").trim();
        const htmlPart = (typeof parsed.html === "string" ? parsed.html : "").trim();
        const previewSource =
          textPart ||
          htmlPart
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<[^>]+>/g, " ");
        messages.push({
          id: hit.id,
          subject: parsed.subject || hit.subject,
          sender: parsed.from?.text || hit.sender,
          receivedAt: hit.receivedAt,
          unread: hit.unread,
          flagged: hit.flagged,
          preview: previewSource.replace(/\s+/g, " ").trim().slice(0, 500),
          account: account.label,
          mailbox: hit.path,
          toUser: hit.toUser,
        });
      } catch {
        messages.push({
          id: hit.id,
          subject: hit.subject,
          sender: hit.sender,
          receivedAt: hit.receivedAt,
          unread: hit.unread,
          flagged: hit.flagged,
          account: account.label,
          mailbox: hit.path,
          toUser: hit.toUser,
        });
      } finally {
        lock?.release();
      }
    }
    await client.logout();
  } catch (err) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : String(err);
    const response =
      err && typeof err === "object" && "responseText" in err
        ? String((err as { responseText?: unknown }).responseText ?? "")
        : "";
    const detail = response && !response.includes(account.pass) ? ` (${response.slice(0, 120)})` : "";
    return { messages: [], error: `${account.label}: ${message}${detail}` };
  }

  return { messages };
}

export class ImapActionEmailAdapter implements ActionEmailAdapter {
  readonly id = "imap";
  readonly label = "IMAP (iCloud + Gmail)";

  async getRecentActionEmails(editionDateKey?: string): Promise<MailScan> {
    const poolSize = actionEmailFetchPool(config.actionEmails.maxItems);
    const cacheKey = editionDateKey ?? getEditionDateKey();
    const cached = await readEditionCacheEnvelope<MailScan | ActionEmailItem[]>(
      "action-emails",
      cacheKey,
    );
    const cachedScan = asMailScan(cached?.data);
    if (cachedScan) return cachedScan;

    const accounts = configuredImapAccounts();
    if (accounts.length === 0) {
      throw new Error(
        "IMAP non configurato: imposta ICLOUD_MAIL_USER + ICLOUD_MAIL_APP_PASSWORD e/o GMAIL_USER + GMAIL_APP_PASSWORD",
      );
    }

    const since = lookbackSince(
      config.timezone,
      config.actionEmails.lookbackDays,
    );
    // Wide scan: most inbox mail is noise; need enough raw to fill last-N.
    const scanCap = Math.max(120, poolSize * 4);
    const all: MailRawMessage[] = [];
    const errors: string[] = [];
    const foundLabels: string[] = [];

    for (const account of accounts) {
      // Hard budget per mailbox: socketTimeout alone still left AGGIORNA hanging on Fly.
      const result = await Promise.race([
        fetchAccountRecent(account, since, scanCap),
        new Promise<{ messages: MailRawMessage[]; error?: string }>(
          (resolve) => {
            setTimeout(
              () =>
                resolve({
                  messages: [],
                  error: `${account.label}: IMAP timed out`,
                }),
              25_000,
            );
          },
        ),
      ]);
      if (result.error) errors.push(result.error);
      else foundLabels.push(account.label);
      all.push(...result.messages);
    }

    if (all.length === 0 && errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    const contacts = await loadContactEmails();
    const picture = pictureFromMessages(all, poolSize, { contactEmails: contacts }, config.actionEmails.notableMax);

    (this as { label: string }).label =
      foundLabels.length > 0
        ? `IMAP (${foundLabels.join(" + ")})`
        : this.label;

    await writeEditionCache("action-emails", picture, cacheKey);
    if (errors.length > 0 && picture.items.length === 0 && picture.notable.length === 0) {
      throw new Error(errors.join("; "));
    }
    return picture;
  }
}
