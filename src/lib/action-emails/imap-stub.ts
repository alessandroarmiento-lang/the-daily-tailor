/**
 * Placeholder for a future IMAP / Gmail / Apple Mail integration.
 * Documents the swap contract; not used on this cloud VM.
 */
import type { ActionEmailAdapter, ActionEmailItem } from "./types";

export class ImapActionEmailAdapter implements ActionEmailAdapter {
  readonly id = "imap";
  readonly label = "Mailbox (IMAP)";

  async getYesterdaysActionEmails(): Promise<ActionEmailItem[]> {
    throw new Error(
      "ImapActionEmailAdapter requires mailbox credentials and host access. Use MockActionEmailAdapter on cloud/CI.",
    );
  }
}
