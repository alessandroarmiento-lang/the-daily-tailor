/**
 * Apple Mail adapter — yesterday's actionable inbox via osascript.
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
import {
  actionEmailFetchPool,
  messageUrlFromId,
  toActionEmailItemsWithOverflow,
  type MailRawMessage,
} from "./actionable";
import type { ActionEmailAdapter, ActionEmailItem } from "./types";

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

  async getYesterdaysActionEmails(): Promise<ActionEmailItem[]> {
    const poolSize = actionEmailFetchPool(config.actionEmails.maxItems);
    const cached = await readEditionCacheEnvelope<ActionEmailItem[]>("action-emails");
    if (cached?.data) {
      return cached.data.slice(0, poolSize);
    }

    const result = await runOsascriptJson<ScriptResult>(
      "fetch-action-emails.applescript",
      [String(Math.max(40, poolSize))],
      90_000,
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

    // Keep full ranked actionable pool (not just A4 visible slot).
    const { items } = toActionEmailItemsWithOverflow(raw, poolSize, {
      contactEmails: contacts,
    });
    await writeEditionCache("action-emails", items);
    return items;
  }
}
