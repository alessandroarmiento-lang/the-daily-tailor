export type WeatherSnapshot = {
  city: string;
  country: string;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKmh: number;
  weatherCode: number;
  summary: string;
  source: "live" | "mock";
  fetchedAt: string;
};

export type NewsHeadline = {
  id: string;
  title: string;
  source: string;
  publishedAt: string | null;
  url: string;
};

export type NewsFeed = {
  headlines: NewsHeadline[];
  source: "live" | "mock";
  fetchedAt: string;
};

export type EmailReminder = {
  id: string;
  from: string;
  subject: string;
  dueLabel: string;
  priority: "alta" | "media" | "bassa";
  preview: string;
};

export type ReminderFeed = {
  reminders: EmailReminder[];
  source: "mock";
  note: string;
};
