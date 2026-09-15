export type NewsItem = {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  url: string;
  publishedAt: string | null;
};

export type NewsBriefing = {
  items: NewsItem[];
  feedLabel: string;
  fetchedAt: string;
  isMock: boolean;
};

export type SectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; data?: T };
