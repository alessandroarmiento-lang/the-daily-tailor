"use client";

import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import type { NewspaperEdition } from "@/lib/edition-types";
import { normalizeArticleUrl } from "@/lib/news-links";
import type { PrecipitationForecast } from "@/lib/weather/types";
import { formatOggiPrecipMm } from "@/lib/weather/mock";
import type { NewsItem } from "@/lib/news/types";

const NEWS_MAX = 4;
const REMINDERS_MAX = 4;
const EMAILS_MAX = 3;
const EVENTS_PER_DAY = 2;

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

const PRECIP_ROW_SIZE = 8;

function PrecipitationBlock({ precip }: { precip: PrecipitationForecast }) {
  const hasToday = precip.todayAmountMm != null;
  const hours = precip.nextHours;
  if (!hasToday && hours.length === 0) return null;

  const rows: (typeof hours)[] = [];
  for (let i = 0; i < hours.length; i += PRECIP_ROW_SIZE) {
    rows.push(hours.slice(i, i + PRECIP_ROW_SIZE));
  }

  return (
    <div className="weather__precip">
      <p className="weather__precip-title">Precipitazioni</p>
      {hasToday ? (
        <p className="weather__precip-today">
          {formatOggiPrecipMm(precip.todayAmountMm!)}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="weather__precip-rows" aria-label="Previsione oraria">
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
                      title={`${h.hourLabel}: ${h.chancePercent}%`}
                    />
                  </div>
                  <span className="weather__precip-hour">{h.hourLabel}</span>
                  <span className="weather__precip-pct">{h.chancePercent}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatDue(iso: string | null, timeZone: string): string {
  if (!iso) return "Senza scadenza";
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function formatEventTime(
  iso: string,
  isAllDay: boolean,
  timeZone: string,
): string {
  if (isAllDay) return "Tutto il giorno";
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function formatReceived(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function formatUpdatedAt(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function priorityLabel(priority: string): string | null {
  switch (priority) {
    case "high":
      return "Alta";
    case "medium":
      return "Media";
    case "low":
      return "Bassa";
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
};

/**
 * Full A4 newspaper sheet from a frozen edition snapshot.
 * Same DOM is captured for the PDF button and optional browser print.
 */
export function EditionSheet({ edition }: Props) {
  const tz = edition.timezone;
  const weatherResult = edition.weather;
  const newsResult = edition.news;
  const remindersResult = edition.reminders;
  const calendarResult = edition.calendar;
  const emailsResult = edition.actionEmails;

  return (
    <main className="sheet-page">
      <header className="masthead">
        <p className="masthead__edition">
          Edizione personale · {edition.dateLine}
        </p>
        <h1 className="masthead__brand">{edition.productName}</h1>
        <p className="masthead__tagline">{edition.tagline}</p>
        <div className="masthead__rule" aria-hidden="true" />
      </header>

      <aside className="aphorism" aria-label="Aforisma del giorno">
        <blockquote className="aphorism__quote">
          <p className="aphorism__text">«{edition.aphorism.text}»</p>
        </blockquote>
      </aside>

      <div className="sheet-grid">
        <div className="area-weather">
          {weatherResult.status === "error" && !weatherResult.data ? (
            <SectionError title="Meteo di oggi" message={weatherResult.message} />
          ) : weatherResult.data ? (
            <SectionShell
              title="Meteo di oggi"
              kicker={weatherResult.data.city}
              tone={weatherResult.status === "error" ? "error" : "ok"}
              footerNote={[
                weatherResult.status === "error"
                  ? `Dati di riserva: ${weatherResult.message}`
                  : null,
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
                      {weatherResult.data.conditionLabelIt}
                    </p>
                    <ul className="weather__facts">
                      {weatherResult.data.feelsLikeC != null ? (
                        <li>Percepiti {weatherResult.data.feelsLikeC}°</li>
                      ) : null}
                      {weatherResult.data.highC != null &&
                      weatherResult.data.lowC != null ? (
                        <li>
                          Max {weatherResult.data.highC}° / Min{" "}
                          {weatherResult.data.lowC}°
                        </li>
                      ) : null}
                      {weatherResult.data.humidityPercent != null ? (
                        <li>Umidità {weatherResult.data.humidityPercent}%</li>
                      ) : null}
                      {weatherResult.data.windKmh != null ? (
                        <li>Vento {weatherResult.data.windKmh} km/h</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
                <PrecipitationBlock
                  precip={weatherResult.data.precipitation}
                />
              </div>
            </SectionShell>
          ) : (
            <SectionEmpty title="Meteo di oggi" message="Meteo non disponibile." />
          )}
        </div>

        <div className="area-calendar">
          {calendarResult.status === "error" && !calendarResult.data ? (
            <SectionError title="Agenda" message={calendarResult.message} />
          ) : calendarResult.data ? (
            (() => {
              const days = calendarResult.data.days.map((day) => ({
                ...day,
                events: day.events.slice(0, EVENTS_PER_DAY),
              }));
              const hasAny = days.some((d) => d.events.length > 0);
              if (!hasAny) {
                return (
                  <SectionEmpty
                    title="Agenda"
                    message="Nessun evento nei prossimi giorni."
                  />
                );
              }
              return (
                <SectionShell
                  title="Agenda"
                  kicker="Prossimi giorni"
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
                          {day.isToday ? "Oggi · " : ""}
                          {day.label}
                        </p>
                        {day.events.length === 0 ? (
                          <p className="cal-day__empty">—</p>
                        ) : (
                          <ul className="cal-day__events">
                            {day.events.map((event) => (
                              <li key={event.id} className="cal-event">
                                <span className="cal-event__time">
                                  {formatEventTime(
                                    event.startsAt,
                                    event.isAllDay,
                                    tz,
                                  )}
                                </span>
                                <span className="cal-event__title">
                                  {event.title}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionShell>
              );
            })()
          ) : (
            <SectionEmpty title="Agenda" message="Agenda non disponibile." />
          )}
        </div>

        <div className="area-news">
          {newsResult.status === "error" && !newsResult.data ? (
            <SectionError
              title="Notizie dal mondo"
              message={newsResult.message}
            />
          ) : newsResult.data && newsResult.data.items.length > 0 ? (
            (() => {
              const items = newsResult.data.items.slice(0, NEWS_MAX);
              return (
                <SectionShell
                  title="Notizie dal mondo"
                  kicker="Il Post"
                  tone={newsResult.status === "error" ? "error" : "ok"}
                >
                  <ol className="headline-list">
                    {items.map((item, i) => (
                      <li key={item.id} className="headline-list__item">
                        <span className="headline-list__index">{i + 1}.</span>
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
                  </ol>
                </SectionShell>
              );
            })()
          ) : (
            <SectionEmpty
              title="Notizie dal mondo"
              message="Nessun titolo disponibile questa mattina."
            />
          )}
        </div>

        <div className="area-reminders">
          {remindersResult.status === "error" && !remindersResult.data ? (
            <SectionError title="Promemoria" message={remindersResult.message} />
          ) : remindersResult.data && remindersResult.data.items.length > 0 ? (
            (() => {
              const items = remindersResult.data.items.slice(0, REMINDERS_MAX);
              return (
                <SectionShell
                  title="Promemoria"
                  kicker="Oggi / aperti"
                  tone={remindersResult.status === "error" ? "error" : "ok"}
                >
                  <ul className="reminder-list">
                    {items.map((item) => {
                      const pri = priorityLabel(item.priority);
                      return (
                        <li key={item.id} className="reminder-list__item">
                          <span
                            className="reminder-list__box"
                            aria-hidden="true"
                          />
                          <div>
                            <p className="reminder-list__title">{item.title}</p>
                            <p className="reminder-list__meta">
                              {item.listName}
                              {" · "}
                              {formatDue(item.dueAt, tz)}
                              {pri ? ` · Priorità ${pri}` : ""}
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
              title="Promemoria"
              message="Nessun reminder aperto per oggi."
            />
          )}
        </div>

        <div className="area-emails">
          {emailsResult.status === "error" && !emailsResult.data ? (
            <SectionError
              title="Email"
              message={emailsResult.message}
            />
          ) : emailsResult.data && emailsResult.data.items.length > 0 ? (
            (() => {
              const items = emailsResult.data.items.slice(0, EMAILS_MAX);
              return (
                <SectionShell
                  title="Email"
                  kicker="Ieri · richieste d’azione"
                  tone={emailsResult.status === "error" ? "error" : "ok"}
                >
                  <ul className="action-mail-list">
                    {items.map((item) => (
                      <li key={item.id} className="action-mail-list__item">
                        <p className="action-mail-list__subject">
                          {item.subject}
                        </p>
                        <p className="action-mail-list__from">
                          {item.senderName}
                          <span className="action-mail-list__when">
                            {" · "}
                            {formatReceived(item.receivedAt, tz)}
                          </span>
                        </p>
                        <p className="action-mail-list__cue">{item.actionCue}</p>
                      </li>
                    ))}
                  </ul>
                </SectionShell>
              );
            })()
          ) : (
            <SectionEmpty
              title="Email"
              message="Nessuna email d’azione arrivata ieri."
            />
          )}
        </div>
      </div>

      <footer className="sheet-footer">
        <span className="sheet-footer__updated">
          Aggiornamento {formatUpdatedAt(edition.generatedAt, tz)}
        </span>
      </footer>
    </main>
  );
}
