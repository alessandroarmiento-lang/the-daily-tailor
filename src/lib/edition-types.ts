import type { Aphorism } from "@/lib/aphorism";
import type { ActionEmailBriefing } from "@/lib/action-emails/types";
import type { CalendarBriefing } from "@/lib/calendar/types";
import type { NewsBriefing } from "@/lib/news/types";
import type { RemindersBriefing } from "@/lib/reminders/types";
import type { SectionResult } from "@/lib/weather/types";
import type { WeatherSnapshot } from "@/lib/weather/types";

/** One morning newspaper snapshot (built at/after 06:00 Europe/Rome). */
export type NewspaperEdition = {
  schemaVersion: 1;
  /** YYYY-MM-DD edition key (rolls at 06:00 local). */
  dateKey: string;
  generatedAt: string;
  timezone: string;
  productName: string;
  tagline: string;
  /** Human date line for the masthead (Italian). */
  dateLine: string;
  aphorism: Aphorism & { dateKey: string };
  weather: SectionResult<WeatherSnapshot>;
  /**
   * World news snapshot. Each `items[].url` is the original article URL
   * (Il Post) and must be preserved for offline headline links.
   */
  news: SectionResult<NewsBriefing>;
  reminders: SectionResult<RemindersBriefing>;
  calendar: SectionResult<CalendarBriefing>;
  actionEmails: SectionResult<ActionEmailBriefing>;
};

export type EditionListItem = {
  dateKey: string;
  generatedAt: string;
  productName: string;
};
