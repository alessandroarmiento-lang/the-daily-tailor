"use client";

import { AdaptiveFill } from "@/components/adaptive-fill";
import { NativeOpenLink } from "@/components/native-open-link";
import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import {
  calendarEventDeepLink,
  eventOpenPayload,
  mailOpenPayload,
  reminderDeepLink,
  reminderOpenPayload,
} from "@/lib/apple/deep-links";
import { aphorismText, getAphorismForDateKey } from "@/lib/aphorism";
import { config } from "@/lib/config";
import type { NewspaperEdition } from "@/lib/edition-types";
import type { Lang, MessageKey } from "@/lib/i18n/messages";
import { normalizeArticleUrl } from "@/lib/news-links";
import { remindersEmptyMessage } from "@/lib/reminders/empty-copy";
import { sanitizeReminderItem } from "@/lib/reminders/normalize-push";
import {
  emailsOverflowLabel,
  remindersOverflowLabel,
} from "@/lib/section-overflow";
import type { PrecipitationForecast } from "@/lib/weather/types";
import {
  conditionLabel,
  formatPrecipTodayMm,
} from "@/lib/weather/labels";
import type { NewsItem } from "@/lib/news/types";
import { useLang } from "@/lib/i18n/provider";

const NEWS_MIN = 1;

function weatherSourceLabel(source: string): string {
  switch (source) {
    case "weatherkit":
      return "Apple Weather";
    case "open-meteo":
      return "Open-Meteo";
    case "openweathermap":
      return "OpenWeatherMap";
    case "mock":
      return "Mock";
    default:
      return source;
  }
}

function formatEditionDateLine(
  dateKey: string,
  locale: string,
  timeZone: string,
): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const instant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(instant);
}

function formatDayLabel(
  dateKey: string,
  locale: string,
  timeZone: string,
): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
}

/** Six hours per row so iPhone (~390px) can read labels; print stays compact. */
const PRECIP_ROW_SIZE = 6;

function PrecipitationBlock({
  precip,
  lang,
  t,
}: {
  precip: PrecipitationForecast;
  lang: Lang;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const hasToday = precip.todayAmountMm != null;
  const hours = precip.nextHours;
  if (!hasToday && hours.length === 0) return null;

  const rows: (typeof hours)[] = [];
  for (let i = 0; i < hours.length; i += PRECIP_ROW_SIZE) {
    rows.push(hours.slice(i, i + PRECIP_ROW_SIZE));
  }

  return (
    <div className="weather__precip">
      <p className="weather__precip-title">{t("precipTitle")}</p>
      {hasToday ? (
        <p className="weather__precip-today">
          {formatPrecipTodayMm(precip.todayAmountMm!, lang)}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="weather__precip-rows" aria-label={t("precipHourlyAria")}>
          {rows.map((row, rowIndex) => (
            <div
              key={`precip-row-${row[0]?.hourLabel ?? rowIndex}`}
              className="weather__precip-chart"
            >
              {row.map((h) => (
                <div
                  key={`${h.hourLabel}-${h.chancePercent}`}
                  className="weather__precip-col"
                >
                  <div className="weather__precip-bar-wrap">
                    <div
                      className="weather__precip-bar"
                      style={{ height: `${Math.max(4, h.chancePercent)}%` }}
                      title={`${h.hourLabel}h: ${h.chancePercent}%`}
                    />
                  </div>
                  <div className="weather__precip-hour">{`h${h.hourLabel}`}</div>
                  <div className="weather__precip-pct">{`${h.chancePercent}%`}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatDue(
  iso: string | null,
  timeZone: string,
  locale: string,
  noDueLabel: string,
): string {
  if (!iso) return noDueLabel;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return noDueLabel;
  const now = new Date();
  const sameDay =
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(due) ===
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(due);
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(due);
}

function formatEventTime(
  iso: string,
  isAllDay: boolean,
  timeZone: string,
  locale: string,
  allDayLabel: string,
): string {
  if (isAllDay) return allDayLabel;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function formatReceived(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function formatUpdatedAt(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function priorityLabel(
  priority: string,
  t: (key: "priorityHigh" | "priorityMedium" | "priorityLow") => string,
): string | null {
  switch (priority) {
    case "high":
      return t("priorityHigh");
    case "medium":
      return t("priorityMedium");
    case "low":
      return t("priorityLow");
    default:
      return null;
  }
}

/**
 * Headline as link to the original Il Post piece.
 * Offline: href stays in the DOM; tap opens when network is available.
 */
function HeadlineTitle({ item }: { item: NewsItem }) {
  const href = normalizeArticleUrl(item.url);
  if (href) {
    return (
      <a
        className="headline-list__title"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {item.title}
      </a>
    );
  }
  return <span className="headline-list__title">{item.title}</span>;
}

type Props = {
  edition: NewspaperEdition;
  /** Client GPS / last-known note for the meteo footer (not printed loudly). */
  weatherLocationNote?: string | null;
};

/**
 * Full A4 newspaper sheet from a frozen edition snapshot.
 * Same DOM is captured for the PDF button and optional browser print.
 */
export function EditionSheet({ edition, weatherLocationNote }: Props) {
  const { t, locale, lang } = useLang();
  const tz = edition.timezone;
  const weatherResult = edition.weather;
  const newsResult = edition.news;
  const remindersResult = edition.reminders;
  const calendarResult = edition.calendar;
  const emailsResult = edition.actionEmails;
  const dateLine = formatEditionDateLine(edition.dateKey, locale, tz);
  const dayAphorism = getAphorismForDateKey(edition.dateKey);

  return (
    <main className="sheet-page">
      <header className="masthead">
        <p className="masthead__edition">
          {t("personalEdition")} · {dateLine}
        </p>
        <h1 className="masthead__brand">{edition.productName}</h1>
        <p className="masthead__tagline">{t("tagline")}</p>
        <div className="masthead__rule" aria-hidden="true" />
      </header>

      <aside className="aphorism" aria-label={t("aphorismAria")}>
        <blockquote className="aphorism__quote">
          <p className="aphorism__text">
            «{aphorismText(dayAphorism, lang)}»
          </p>
        </blockquote>
      </aside>

      <div className="sheet-grid">
        <div className="area-weather">
          {weatherResult.status === "error" && !weatherResult.data ? (
            <SectionError
              title={t("weather")}
              kicker="—"
              message={weatherResult.message}
            />
          ) : weatherResult.data ? (
            <SectionShell
              title={t("weather")}
              kicker={weatherResult.data.city}
              tone={weatherResult.status === "error" ? "error" : "ok"}
              footerNote={[
                weatherResult.status === "error"
                  ? t("weatherFallback", { message: weatherResult.message })
                  : null,
                weatherLocationNote ?? null,
                weatherResult.data.isMock
                  ? "Mock"
                  : weatherSourceLabel(weatherResult.data.source),
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <div className="weather">
                <div className="weather__top">
                  <p className="weather__temp">
                    <span className="weather__deg">
                      {weatherResult.data.temperatureC}°
                    </span>
                    <span className="weather__unit">C</span>
                  </p>
                  <div className="weather__meta">
                    <p className="weather__condition">
                      {conditionLabel(weatherResult.data.condition, lang)}
                    </p>
                    <ul className="weather__facts">
                      {weatherResult.data.feelsLikeC != null ? (
                        <li>
                          {t("feelsLike", { n: weatherResult.data.feelsLikeC })}
                        </li>
                      ) : null}
                      {weatherResult.data.highC != null &&
                      weatherResult.data.lowC != null ? (
                        <li>
                          {t("highLow", {
                            high: weatherResult.data.highC,
                            low: weatherResult.data.lowC,
                          })}
                        </li>
                      ) : null}
                      {weatherResult.data.humidityPercent != null ? (
                        <li>
                          {t("humidity", {
                            n: weatherResult.data.humidityPercent,
                          })}
                        </li>
                      ) : null}
                      {weatherResult.data.windKmh != null ? (
                        <li>
                          {t("wind", { n: weatherResult.data.windKmh })}
                        </li>
                      ) : null}
                    </ul>
                  </div>
                </div>
                <PrecipitationBlock
                  precip={weatherResult.data.precipitation}
                  lang={lang}
                  t={t}
                />
              </div>
            </SectionShell>
          ) : (
            <SectionEmpty
              title={t("weather")}
              kicker="—"
              message={t("weatherMissing")}
            />
          )}
        </div>

        <div className="area-calendar">
          {calendarResult.status === "error" &&
          !(calendarResult.data?.days.some((d) => d.events.length > 0)) ? (
            <SectionError
              title={t("agenda")}
              kicker={t("agendaDays")}
              message={calendarResult.message || t("calendarAuth")}
            />
          ) : calendarResult.data ? (
            (() => {
              const days = calendarResult.data.days;
              const hasAny = days.some((d) => d.events.length > 0);
              if (!hasAny) {
                return (
                  <SectionEmpty
                    title={t("agenda")}
                    kicker={t("agendaDays")}
                    message={t("noAgendaEvents")}
                  />
                );
              }
              return (
                <SectionShell
                  title={t("agenda")}
                  kicker={t("agendaDays")}
                  tone={calendarResult.status === "error" ? "error" : "ok"}
                >
                  <div className="cal-widget" role="list">
                    {days.map((day) => (
                      <div
                        key={day.dateKey}
                        className={`cal-day${day.isToday ? " cal-day--today" : ""}`}
                        role="listitem"
                      >
                        <p className="cal-day__label">
                          {day.isToday ? t("todayPrefix") : ""}
                          {formatDayLabel(day.dateKey, locale, tz)}
                        </p>
                        {day.events.length === 0 ? null : (
                          <ul className="cal-day__events">
                            {day.events.map((event) => {
                              const href = calendarEventDeepLink(event.id, {
                                title: event.title,
                                calendarName: event.calendarName,
                              });
                              const title = (
                                <NativeOpenLink
                                  className="cal-event__link"
                                  href={href}
                                  payload={eventOpenPayload(event)}
                                >
                                  {event.title}
                                </NativeOpenLink>
                              );
                              return (
                                <li key={event.id} className="cal-event">
                                  <span className="cal-event__time">
                                    {formatEventTime(
                                      event.startsAt,
                                      event.isAllDay,
                                      tz,
                                      locale,
                                      t("allDay"),
                                    )}
                                  </span>
                                  <span className="cal-event__title">
                                    {title}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionShell>
              );
            })()
          ) : (
            <SectionEmpty
              title={t("agenda")}
              kicker={t("agendaDays")}
              message={t("agendaMissing")}
            />
          )}
        </div>

        <div className="area-news">
            {newsResult.status === "error" && !newsResult.data ? (
              <SectionError
                title={t("news")}
                kicker="Il Post"
                message={newsResult.message}
              />
            ) : newsResult.data && newsResult.data.items.length > 0 ? (
              (() => {
                const items = newsResult.data.items.slice(
                  0,
                  config.news.maxItems,
                );
                return (
                  <SectionShell
                    title={t("news")}
                    kicker="Il Post"
                    tone={newsResult.status === "error" ? "error" : "ok"}
                  >
                    <AdaptiveFill
                      as="ul"
                      className="headline-list"
                      minCount={NEWS_MIN}
                    >
                      {items.map((item) => (
                        <li key={item.id} className="headline-list__item">
                          <div>
                            <HeadlineTitle item={item} />
                            {item.summary ? (
                              <p className="headline-list__summary">
                                {item.summary}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </AdaptiveFill>
                  </SectionShell>
                );
              })()
            ) : (
              <SectionEmpty
                title={t("news")}
                kicker="Il Post"
                message={t("noNews")}
              />
            )}
          </div>

        <div className="area-reminders">
            {remindersResult.status === "error" &&
            !(remindersResult.data && remindersResult.data.items.length > 0) ? (
              <SectionError
                title={t("reminders")}
                message={
                  remindersResult.message ||
                  t("remindersAuth")
                }
              />
            ) : remindersResult.data && remindersResult.data.items.length > 0 ? (
              (() => {
                const items = remindersResult.data.items.slice(
                  0,
                  config.reminders.maxItems,
                );
                const hidden =
                  typeof remindersResult.data.hiddenCount === "number"
                    ? remindersResult.data.hiddenCount
                    : 0;
                const overflow = remindersOverflowLabel(hidden);
                return (
                  <SectionShell
                    title={t("reminders")}
                    kicker={t("remindersKicker")}
                    overflowLabel={overflow || undefined}
                    tone={remindersResult.status === "error" ? "error" : "ok"}
                  >
                    <ul className="reminder-list">
                      {items.map((raw) => {
                        const item = sanitizeReminderItem(raw);
                        const pri = priorityLabel(item.priority, t);
                        const href = reminderDeepLink(item.id);
                        const title = (
                          <NativeOpenLink
                            className="reminder-list__link"
                            href={href}
                            payload={reminderOpenPayload(item)}
                          >
                            {item.title}
                          </NativeOpenLink>
                        );
                        return (
                          <li key={item.id} className="reminder-list__item">
                            <span
                              className="reminder-list__box"
                              aria-hidden="true"
                            />
                            <div>
                              <p className="reminder-list__title">{title}</p>
                              <p className="reminder-list__meta">
                                <span className="reminder-list__list">
                                  {item.listName}
                                </span>
                                {" · "}
                                {formatDue(item.dueAt, tz, locale, t("noDue"))}
                                {pri ? ` · ${pri}` : ""}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </SectionShell>
                );
              })()
            ) : (
              <SectionEmpty
                title={t("reminders")}
                message={remindersEmptyMessage(
                  remindersResult.data?.sourceLabel,
                )}
              />
            )}
        </div>

        <div className="area-emails">
          {emailsResult.status === "error" && !emailsResult.data ? (
            <SectionError
              title={t("email")}
              message={emailsResult.message}
            />
          ) : emailsResult.data && emailsResult.data.items.length > 0 ? (
            (() => {
              const items = emailsResult.data.items.slice(
                0,
                config.actionEmails.maxItems,
              );
              const hidden =
                typeof emailsResult.data.hiddenCount === "number"
                  ? emailsResult.data.hiddenCount
                  : 0;
              const overflow = emailsOverflowLabel(hidden);
              return (
                <SectionShell
                  title={t("email")}
                  kicker={t("emailKicker")}
                  overflowLabel={overflow || undefined}
                  tone={emailsResult.status === "error" ? "error" : "ok"}
                >
                  <ul className="action-mail-list">
                    {items.map((item) => (
                      <li key={item.id} className="action-mail-list__item">
                        <p className="action-mail-list__subject">
                          <NativeOpenLink
                            href={item.messageUrl}
                            className="action-mail-list__link"
                            payload={mailOpenPayload(item)}
                          >
                            {item.subject}
                          </NativeOpenLink>
                        </p>
                        <p className="action-mail-list__from">
                          {item.senderName}
                          {item.account ? ` · ${item.account}` : ""}
                          <span className="action-mail-list__when">
                            {" · "}
                            {formatReceived(item.receivedAt, tz, locale)}
                          </span>
                        </p>
                        {item.actionCue ? (
                          <p className="action-mail-list__cue">
                            {item.actionCue}
                          </p>
                        ) : null}
                        {item.bodyPreview ? (
                          <p className="action-mail-list__body">
                            {item.bodyPreview}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </SectionShell>
              );
            })()
          ) : (
            <SectionEmpty
              title={t("email")}
              message={t("noEmails")}
            />
          )}
        </div>
      </div>

      <footer className="sheet-footer">
        <span className="sheet-footer__updated">
          {t("updated")} {formatUpdatedAt(edition.generatedAt, tz, locale)}
        </span>
      </footer>
    </main>
  );
}
