/**
 * Headless IMAP actionable-mail adapter.
 * Scans iCloud Mail + Gmail (app passwords) — works with Mac powered off.
 * No Google/Microsoft OAuth required when app passwords are set.
 *
 * Rolling slot: newest actionable emails in the lookback window.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import {
  actionEmailFetchPool,
  toActionEmailItemsWithOverflow,
  type MailRawMessage,
} from "./actionable";
import { loadContactEmails } from "@/lib/contacts/carddav";
import type { ActionEmailAdapter, ActionEmailItem } from "./types";

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

/** Civil lookback window in the newspaper timezone → UTC-ish bounds. */
function recentWindow(
  timeZone: string,
  lookbackDays: number,
): { since: Date; before: Date } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = fmt.format(now);
  const [y, m, d] = todayKey.split("-").map(Number);
  // End of today (exclusive tomorrow 00:00) so today's mail is included.
  const tomorrowStart = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  const since = new Date(y, m - 1, d, 0, 0, 0, 0);
  since.setDate(since.getDate() - (lookbackDays - 1));
  return { since, before: tomorrowStart };
}

async function fetchAccountRecent(
  account: ImapAccount,
  since: Date,
  before: Date,
  scanCap: number,
): Promise<{ messages: MailRawMessage[]; error?: string }> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });

  const messages: MailRawMessage[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      let uids: number[] = [];
      try {
        const found = await client.search({
          since,
          before,
        });
        uids = Array.isArray(found) ? found : [];
      } catch {
        const found = await client.search({ since });
        uids = Array.isArray(found) ? found : [];
      }

      // Newest first
      uids = uids.sort((a, b) => b - a).slice(0, scanCap);

      for (const uid of uids) {
        try {
          const downloaded = await client.download(uid);
          if (!downloaded?.content) continue;
          const parsed = await simpleParser(downloaded.content);
          const received = parsed.date;
          if (!received || received < since || received >= before) continue;

          const from =
            parsed.from?.text ||
            parsed.from?.value?.[0]?.address ||
            "";
          const subject = parsed.subject || "(senza oggetto)";
          const textPart = (parsed.text || "").trim();
          const htmlPart = (parsed.html || "").trim();
          const previewSource =
            textPart ||
            htmlPart
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<[^>]+>/g, " ");
          const preview = previewSource
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500);
          const messageId =
            (typeof parsed.messageId === "string" && parsed.messageId) ||
            `imap-${account.id}-${uid}`;

          let unread = false;
          try {
            const meta = await client.fetchOne(uid, { flags: true });
            const flags = meta && "flags" in meta ? meta.flags : undefined;
            unread = flags ? !flags.has("\\Seen") : false;
          } catch {
            unread = false;
          }

          messages.push({
            id: messageId,
            subject,
            sender: from,
            receivedAt: received.toISOString(),
            unread,
            flagged: false,
            preview,
            account: account.label,
          });
        } catch {
          // skip bad message
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : String(err);
    return { messages: [], error: `${account.label}: ${message}` };
  }

  return { messages };
}

export class ImapActionEmailAdapter implements ActionEmailAdapter {
  readonly id = "imap";
  readonly label = "IMAP (iCloud + Gmail)";

  async getRecentActionEmails(): Promise<ActionEmailItem[]> {
    const maxVisible = config.actionEmails.maxItems;
    const scanPool = actionEmailFetchPool(maxVisible);
    const cached =
      await readEditionCacheEnvelope<ActionEmailItem[]>("action-emails");
    if (cached?.data) {
      return cached.data.slice(0, maxVisible);
    }

    const accounts = configuredImapAccounts();
    if (accounts.length === 0) {
      throw new Error(
        "IMAP non configurato: imposta ICLOUD_MAIL_USER + ICLOUD_MAIL_APP_PASSWORD e/o GMAIL_USER + GMAIL_APP_PASSWORD",
      );
    }

    const { since, before } = recentWindow(
      config.timezone,
      config.actionEmails.lookbackDays,
    );
    const scanCap = Math.max(80, scanPool);
    const all: MailRawMessage[] = [];
    const errors: string[] = [];
    const foundLabels: string[] = [];

    for (const account of accounts) {
      const result = await fetchAccountRecent(
        account,
        since,
        before,
        scanCap,
      );
      if (result.error) errors.push(result.error);
      else foundLabels.push(account.label);
      all.push(...result.messages);
    }

    if (all.length === 0 && errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    const contacts = await loadContactEmails();
    // Rank newest-first actionable; keep only the rolling visible slot.
    const { items } = toActionEmailItemsWithOverflow(all, maxVisible, {
      contactEmails: contacts,
    });

    (this as { label: string }).label =
      foundLabels.length > 0
        ? `IMAP (${foundLabels.join(" + ")})`
        : this.label;

    await writeEditionCache("action-emails", items);
    if (errors.length > 0 && items.length === 0) {
      throw new Error(errors.join("; "));
    }
    return items;
  }
}
