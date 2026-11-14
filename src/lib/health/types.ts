export type HealthLine = {
  label: string;
  text: string;
};

/** Synthetic previous-day + last-night strip. No diagnosis. */
export type HealthBriefing = {
  lines: HealthLine[];
  fetchedAt: string;
  sourceLabel: string;
};

export type SectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; data?: T };
