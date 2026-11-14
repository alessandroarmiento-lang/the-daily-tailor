/**
 * Apple Mail adapter — recent actionable inbox via osascript.
 * Mac-awake path only (TCC Automation). Prefer IMAP for Mac-off generation.
 * Scans the unified inbox (iCloud + Gmail and any other accounts in Mail.app).
 * Returns a ranked pool (may exceed A4 max); getActionEmails caps + hiddenCount.
 */
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import { runOsascriptJson } from "@/lib/apple/run-osascript";
import { loadContactEmails } from "@/lib/contacts/carddav";
import { getEditionDateKey } from "@/lib/edition";
import {
  actionEmailFetchPool,
  messageUrlFromId,
  pictureFromMessages,
  type MailRawMessage,
} from "./actionable";
import type { ActionEmailAdapter, ActionEmailItem, MailScan } from "./types";

function asMailScan(data: MailScan | ActionEmailItem[] | undefined): MailScan | null {
  if (!data || Array.isArray(data)) return null;
  if (Array.isArray(data.items) && typeof data.analysis === "string") return data;
  return null;
}

type ScriptResult = {
  ok: boolean;
  error?: string;
  total?: number;
  accounts?: string[];
  items?: MailRawMessage[];
};

export class AppleMailActionEmailAdapter implements ActionEmailAdapter {
  readonly id = "applemail";
  label = "Apple Mail (iCloud + Gmail)";

  async getRecentActionEmails(editionDateKey?: string): Promise<MailScan> {
    const poolSize = actionEmailFetchPool(config.actionEmails.maxItems);
    const cacheKey = editionDateKey ?? getEditionDateKey();
    const cached = await readEditionCacheEnvelope<MailScan | ActionEmailItem[]>(
      "action-emails",
      cacheKey,
    );
    const cachedScan = asMailScan(cached?.data);
    if (cachedScan) return cachedScan;

    const lookback = Math.max(1, config.actionEmails.lookbackDays);
    const result = await runOsascriptJson<ScriptResult>(
      "fetch-action-emails.applescript",
      [String(Math.max(80, poolSize * 3)), String(lookback)],
      120_000,
    );

    if (!result.ok) {
      throw new Error(result.error ?? "Apple Mail: fetch fallito");
    }

    if (result.accounts && result.accounts.length > 0) {
      this.label = `Apple Mail (${result.accounts.join(" + ")})`;
    }

    const contacts = await loadContactEmails();
    const raw = (result.items ?? []).map((m) => ({
      ...m,
      messageUrl: m.messageUrl || messageUrlFromId(m.id, m.account),
    }));

    const picture = pictureFromMessages(
      raw,
      poolSize,
      { contactEmails: contacts },
      config.actionEmails.notableMax,
    );
    await writeEditionCache("action-emails", picture, cacheKey);
    return picture;
  }
}
