"use client";

import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import type { NewspaperEdition } from "@/lib/edition-types";
import { normalizeArticleUrl } from "@/lib/news-links";
import type { PrecipitationForecast } from "@/lib/weather/types";
import type { NewsItem } from "@/lib/news/types";

const NEWS_MAX = 4;
const REMINDERS_MAX = 4;
const EMAILS_MAX = 3;
const EVENTS_PER_DAY = 2;

function PrecipitationBlock({ precip }: { precip: PrecipitationForecast }) {
  const hasToday = precip.todayChancePercent != null;
  const hours = precip.nextHours;
  if (!hasToday && hours.length === 0) return null;

  return (
    <div className="weather__precip">
      <p className="weather__precip-title">Precipitazioni</p>
      {hasToday ? (
        <p className="weather__precip-today">
          Oggi {precip.todayChancePercent}%
          {precip.todayAmountMm != null && precip.todayAmountMm > 0
            ? ` · ${precip.todayAmountMm} mm`
            : ""}
        </p>
      ) : null}
      {hours.length > 0 ? (
        <div className="weather__precip-chart" aria-label="Previsione oraria">
          {hours.map((h) => (
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
  /** Shown in footer when served from device storage. */
  sourceNote?: string;
};

/**
 * Full A4 newspaper sheet from a frozen edition snapshot.
 * Same DOM is what window.print() uses — including offline on iPhone.
 */
export function EditionSheet({ edition, sourceNote }: Props) {
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
              const hidden = Math.max(
                0,
                newsResult.data.items.length - items.length,
              );
              const noteParts = [newsResult.data.feedLabel];
              if (hidden > 0) noteParts.push(`+${hidden} omessi (limite 1 pagina)`);
              if (newsResult.status === "error") {
                noteParts.push(`Fallback: ${newsResult.message}`);
              }
              if (newsResult.data.isMock) noteParts.push("Sorgente mock");
              return (
                <SectionShell
                  title="Notizie dal mondo"
                  kicker="Il Post"
                  tone={newsResult.status === "error" ? "error" : "ok"}
                  footerNote={noteParts.join(" · ")}
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
            <SectionError title="Reminders" message={remindersResult.message} />
          ) : remindersResult.data && remindersResult.data.items.length > 0 ? (
            (() => {
              const items = remindersResult.data.items.slice(0, REMINDERS_MAX);
              return (
                <SectionShell
                  title="Reminders"
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
              title="Reminders"
              message="Nessun reminder aperto per oggi."
            />
          )}
        </div>

        <div className="area-emails">
          {emailsResult.status === "error" && !emailsResult.data ? (
            <SectionError
              title="Email da fare"
              message={emailsResult.message}
            />
          ) : emailsResult.data && emailsResult.data.items.length > 0 ? (
            (() => {
              const items = emailsResult.data.items.slice(0, EMAILS_MAX);
              return (
                <SectionShell
                  title="Email da fare"
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
              title="Email da fare"
              message="Nessuna email d’azione arrivata ieri."
            />
          )}
        </div>
      </div>

      <footer className="sheet-footer">
        <span>{edition.productName}</span>
        <span>
          {sourceNote ?? "Web · iPhone · stampa A4"} · {edition.dateKey}
        </span>
      </footer>
    </main>
  );
}
