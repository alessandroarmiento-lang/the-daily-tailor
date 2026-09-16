/**
 * Action emails — messages from yesterday that imply a to-do / request / deadline.
 * Not a full inbox.
 */

export type ActionEmailItem = {
  id: string;
  subject: string;
  senderName: string;
  senderAddress: string;
  /** One-line cue of what the user should do. */
  actionCue: string;
  /** Compact plain-text body snippet for the sheet preview. */
  bodyPreview: string;
  receivedAt: string;
  /** Optional Mail.app deep link (message://…). */
  messageUrl?: string;
  /** Account label when known (iCloud Mail, Gmail, …). */
  account?: string;
};

export type ActionEmailBriefing = {
  items: ActionEmailItem[];
  /** Important actionable emails not shown (A4 budget). */
  hiddenCount: number;
  fetchedAt: string;
  sourceLabel: string;
  windowLabel: string;
  isMock: boolean;
};

export type SectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; data?: T };

export interface ActionEmailAdapter {
  readonly id: string;
  readonly label: string;
  /** Emails arrived yesterday whose content implies an actionable request. */
  getYesterdaysActionEmails(): Promise<ActionEmailItem[]>;
}
