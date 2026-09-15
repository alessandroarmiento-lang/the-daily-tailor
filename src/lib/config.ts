/**
 * The Daily Tailor runtime config.
 * Override via env without code changes.
 */
export const config = {
  productName: process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "The Daily Tailor",
  tagline:
    process.env.NEXT_PUBLIC_PRODUCT_TAGLINE ??
    "Il giornale del mattino in una pagina, su misura per te",
  locale: "it-IT",
  timezone: process.env.NEWSPAPER_TIMEZONE ?? "Europe/Rome",
  weather: {
    city: process.env.WEATHER_CITY ?? "Roma",
    latitude: Number(process.env.WEATHER_LAT ?? "41.9028"),
    longitude: Number(process.env.WEATHER_LON ?? "12.4964"),
    /**
     * Provider preference: auto | weatherkit | open-meteo | mock.
     * auto → WeatherKit when Apple keys are set, else Open-Meteo (with precip).
     */
    provider: (process.env.WEATHER_PROVIDER ?? "auto") as
      | "auto"
      | "weatherkit"
      | "open-meteo"
      | "mock",
    /** Optional legacy key; unused when WeatherKit / Open-Meteo are active. */
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY ?? "",
    weatherKit: {
      teamId: process.env.WEATHERKIT_TEAM_ID ?? "",
      keyId: process.env.WEATHERKIT_KEY_ID ?? "",
      serviceId: process.env.WEATHERKIT_SERVICE_ID ?? "",
      /** PEM contents (use \n for newlines) or leave empty and set path. */
      privateKey: process.env.WEATHERKIT_PRIVATE_KEY ?? "",
      privateKeyPath: process.env.WEATHERKIT_PRIVATE_KEY_PATH ?? "",
    },
  },
  news: {
    /** Il Post — sezione Mondo (world/international). Trailing slash required. */
    feedUrl:
      process.env.NEWS_FEED_URL ?? "https://www.ilpost.it/mondo/feed/",
    /** Cap for one-A4 print budget (screen can still feel dense). */
    maxItems: Number(process.env.NEWS_MAX_ITEMS ?? "4"),
  },
  reminders: {
    /**
     * Active adapter: "mock" on this cloud VM.
     * Later: "eventkit" | "shortcuts" | "applescript" on Mac.
     */
    source: (process.env.REMINDERS_SOURCE ?? "mock") as "mock",
    maxItems: Number(process.env.REMINDERS_MAX_ITEMS ?? "4"),
  },
  actionEmails: {
    /**
     * Active adapter: "mock" on this cloud VM.
     * Later: "imap" | "gmail" | "applemail" with real mailbox access.
     */
    source: (process.env.ACTION_EMAIL_SOURCE ?? "mock") as "mock",
    maxItems: Number(process.env.ACTION_EMAIL_MAX_ITEMS ?? "3"),
  },
  calendar: {
    /**
     * Active adapter: "mock" on this cloud VM.
     * Later: "eventkit" | "caldav" on Mac.
     */
    source: (process.env.CALENDAR_SOURCE ?? "mock") as "mock",
    horizonDays: Number(process.env.CALENDAR_HORIZON_DAYS ?? "4"),
    maxEventsPerDay: Number(process.env.CALENDAR_MAX_EVENTS_PER_DAY ?? "2"),
  },
} as const;
