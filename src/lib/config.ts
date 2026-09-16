/**
 * The Daily Tailor runtime config.
 * Override via env without code changes.
 */

function defaultAppleSource<T extends string>(
  envValue: string | undefined,
  macDefault: T,
  otherDefault: T,
): T {
  if (envValue) return envValue as T;
  return process.platform === "darwin" ? macDefault : otherDefault;
}

export const config = {
  productName: process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "The Daily Tailor",
  tagline:
    process.env.NEXT_PUBLIC_PRODUCT_TAGLINE ??
    "Il giornale del mattino in una pagina, su misura per te",
  locale: "it-IT",
  timezone: process.env.NEWSPAPER_TIMEZONE ?? "Europe/Rome",
  weather: {
    city: process.env.WEATHER_CITY ?? "Milano",
    latitude: Number(process.env.WEATHER_LAT ?? "45.4642"),
    longitude: Number(process.env.WEATHER_LON ?? "9.1900"),
    /**
     * Provider preference: auto | weatherkit | open-meteo | mock.
     * Default open-meteo (Apple Weather / WeatherKit not pursued).
     */
    provider: (process.env.WEATHER_PROVIDER ?? "open-meteo") as
      | "auto"
      | "weatherkit"
      | "open-meteo"
      | "mock",
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY ?? "",
    weatherKit: {
      teamId: process.env.WEATHERKIT_TEAM_ID ?? "",
      keyId: process.env.WEATHERKIT_KEY_ID ?? "",
      serviceId: process.env.WEATHERKIT_SERVICE_ID ?? "",
      privateKey: process.env.WEATHERKIT_PRIVATE_KEY ?? "",
      privateKeyPath: process.env.WEATHERKIT_PRIVATE_KEY_PATH ?? "",
    },
  },
  news: {
    /** Il Post — sezione Mondo (trailing slash required). */
    feedUrl:
      process.env.NEWS_FEED_URL ?? "https://www.ilpost.it/mondo/feed/",
    maxItems: Number(process.env.NEWS_MAX_ITEMS ?? "6"),
  },
  reminders: {
    /**
     * auto: CalDAV if creds (Mac-off), else EventKit on darwin.
     * caldav | eventkit | mock
     */
    source: defaultAppleSource(
      process.env.REMINDERS_SOURCE,
      "auto",
      "auto",
    ) as "mock" | "eventkit" | "caldav" | "auto",
    maxItems: Number(process.env.REMINDERS_MAX_ITEMS ?? "6"),
  },
  actionEmails: {
    /**
     * auto: IMAP if creds (Mac-off), else Apple Mail on darwin.
     * imap | applemail | mock
     */
    source: defaultAppleSource(
      process.env.ACTION_EMAIL_SOURCE,
      "auto",
      "auto",
    ) as "mock" | "applemail" | "imap" | "auto",
    maxItems: Number(process.env.ACTION_EMAIL_MAX_ITEMS ?? "4"),
  },
  calendar: {
    /**
     * auto: CalDAV if creds (Mac-off), else EventKit on darwin.
     * caldav | eventkit | mock
     */
    source: defaultAppleSource(
      process.env.CALENDAR_SOURCE,
      "auto",
      "auto",
    ) as "mock" | "eventkit" | "caldav" | "auto",
    horizonDays: Number(process.env.CALENDAR_HORIZON_DAYS ?? "4"),
    maxEventsPerDay: Number(process.env.CALENDAR_MAX_EVENTS_PER_DAY ?? "2"),
  },
} as const;
