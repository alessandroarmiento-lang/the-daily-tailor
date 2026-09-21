/**
 * Action emails — rolling list of the latest actionable messages
 * (to-do / request / deadline). Not a full inbox; not limited to yesterday.
 */

export type ActionEmailItem = {
  id: string;
  subject: string;
  senderName: string;
  senderAddress: string;
  /** One-line cue of what the user should do. */
  actionCue: string;
  /** Compact plain-text body snippet for the sheet preview. */
  bodyPreview?: string;
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
  /** Latest actionable emails (newest first); caller caps to maxItems. */
  getRecentActionEmails(): Promise<ActionEmailItem[]>;
}
