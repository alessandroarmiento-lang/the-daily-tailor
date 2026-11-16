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
    /** Locked with the A4 sheet. The news column runs the full height. */
    maxItems: 7,
  },
  reminders: {
    /**
     * auto: EventKit on darwin; elsewhere the iPhone push snapshot with CalDAV
     * fallback (Apple Reminders live in CloudKit, invisible to CalDAV).
     * push | caldav | eventkit | mock
     */
    source: defaultAppleSource(
      process.env.REMINDERS_SOURCE,
      "auto",
      "auto",
    ) as "mock" | "eventkit" | "caldav" | "push" | "auto",
    /** Locked with the A4 sheet: three flagged lines. */
    maxItems: 3,
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
    /** Locked. Wide sheet is this many columns. */
    columns: 3,
    /** Locked. Wide sheet is this many mail rows. Do not add a third. */
    rows: 2,
    /** Locked: columns × rows. Notable cards only fill cells left empty. */
    maxItems: 6,
    /** Ranked internally. Cards appear only inside the six cells. The sheet shows no line under the mail. */
    notableMax: 3,
    /** How far back IMAP/Mail scan for actionable mail (rolling last-N). */
    lookbackDays: Number(process.env.ACTION_EMAIL_LOOKBACK_DAYS ?? "45"),
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
    /** Locked. Today, then the next day. Both cards stay even when empty. */
    dayCount: 2,
    horizonDays: Math.min(
      6,
      Math.max(1, Number(process.env.CALENDAR_HORIZON_DAYS ?? "6") || 6),
    ),
  },
} as const;
