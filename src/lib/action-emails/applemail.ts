/**
 * Apple Mail adapter — yesterday's actionable inbox messages via osascript.
 * Results are edition-cached so the 06:00 snapshot / page load stay fast.
 */
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import { runOsascriptJson } from "@/lib/apple/run-osascript";
import {
  toActionEmailItems,
  type MailRawMessage,
} from "./actionable";
import type { ActionEmailAdapter, ActionEmailItem } from "./types";

type ScriptResult = {
  ok: boolean;
  error?: string;
  total?: number;
  items?: MailRawMessage[];
};

export class AppleMailActionEmailAdapter implements ActionEmailAdapter {
  readonly id = "applemail";
  readonly label = "Apple Mail";

  async getYesterdaysActionEmails(): Promise<ActionEmailItem[]> {
    const cached = await readEditionCacheEnvelope<ActionEmailItem[]>("action-emails");
    if (cached?.data) {
      return cached.data.slice(0, config.actionEmails.maxItems);
    }

    const result = await runOsascriptJson<ScriptResult>(
      "fetch-action-emails.applescript",
      [String(Math.max(20, config.actionEmails.maxItems * 8))],
      90_000,
    );

    if (!result.ok) {
      throw new Error(result.error ?? "Apple Mail: fetch fallito");
    }

    const items = toActionEmailItems(
      result.items ?? [],
      config.actionEmails.maxItems,
    );
    await writeEditionCache("action-emails", items);
    return items;
  }
}
