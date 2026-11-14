#!/usr/bin/env swift
/**
 * Upcoming Calendar events via EventKit (avoids Mail/Calendar Automation TCC for node).
 * Args: horizonDays (default 4)
 * JSON: { ok, error?, items:[{id,title,location,startsAt,endsAt,isAllDay,calendarName}] }
 */
import EventKit
import Foundation

let horizonDays: Int = {
  if CommandLine.arguments.count > 1, let n = Int(CommandLine.arguments[1]) {
    return max(1, min(n, 14))
  }
  return 4
}()

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)
var authErr: String?

if #available(macOS 14.0, *) {
  store.requestFullAccessToEvents { ok, err in
    if !ok { authErr = err?.localizedDescription ?? "denied" }
    sem.signal()
  }
} else {
  store.requestAccess(to: .event) { ok, err in
    if !ok { authErr = err?.localizedDescription ?? "denied" }
    sem.signal()
  }
}

if sem.wait(timeout: .now() + 20) == .timedOut {
  print("{\"ok\":false,\"error\":\"Timeout autorizzazione Calendario (EventKit)\"}")
  exit(0)
}

if let authErr {
  let msg = authErr.replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")
  print("{\"ok\":false,\"error\":\"Autorizza Calendario (Privacy → Calendari) per questo tool: \(msg)\"}")
  exit(0)
}

let cal = Calendar.current
let start = cal.startOfDay(for: Date())
guard let end = cal.date(byAdding: .day, value: horizonDays, to: start) else {
  print("{\"ok\":false,\"error\":\"date bounds\"}")
  exit(1)
}
// Birthdays and holiday subscriptions stay visible past the short agenda
// horizon, the same calendars Calendar.app shows on the month.
let observanceDays = max(horizonDays, 45)
guard let observanceEnd = cal.date(byAdding: .day, value: observanceDays, to: start) else {
  print("{\"ok\":false,\"error\":\"date bounds\"}")
  exit(1)
}

store.refreshSourcesIfNecessary()

func isBirthdayCalendar(_ c: EKCalendar) -> Bool {
  if c.type == .birthday { return true }
  let title = c.title.lowercased()
  return title.contains("birthday") || title.contains("compleann")
}

func isHolidayCalendar(_ c: EKCalendar) -> Bool {
  let title = c.title.lowercased()
  return title.contains("festiv") || title.contains("holiday")
}

let eventCalendars = store.calendars(for: .event)
var events: [EKEvent] = []
var seenEvents = Set<String>()
for c in eventCalendars {
  let windowEnd = (isBirthdayCalendar(c) || isHolidayCalendar(c)) ? observanceEnd : end
  let pred = store.predicateForEvents(withStart: start, end: windowEnd, calendars: [c])
  for e in store.events(matching: pred) {
    let id = e.eventIdentifier ?? e.calendarItemIdentifier
    if seenEvents.contains(id) { continue }
    seenEvents.insert(id)
    events.append(e)
  }
}
events.sort { $0.startDate < $1.startDate }

func reminderAllDay(_ comps: DateComponents) -> Bool {
  return comps.hour == nil
}

let df = DateFormatter()
df.locale = Locale(identifier: "en_US_POSIX")
df.timeZone = TimeZone.current
df.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"

var items: [[String: Any]] = []
for e in events {
  // The Calendar widget drops timed items that have already ended.
  if !e.isAllDay && e.endDate < Date() { continue }
  let loc = e.location
  items.append([
    "id": e.eventIdentifier ?? e.calendarItemIdentifier,
    "title": e.title ?? "(senza titolo)",
    "location": (loc?.isEmpty == false) ? loc! : NSNull(),
    "startsAt": df.string(from: e.startDate),
    "endsAt": df.string(from: e.endDate),
    "isAllDay": e.isAllDay,
    "calendarName": e.calendar?.title ?? "Calendar",
  ])
}

// Scheduled reminders (due in the horizon) show in Apple Calendar.
// EventKit events() does not return them.
let remSem = DispatchSemaphore(value: 0)
var remDenied = false
if #available(macOS 14.0, *) {
  store.requestFullAccessToReminders { ok, _ in
    if !ok { remDenied = true }
    remSem.signal()
  }
} else {
  store.requestAccess(to: .reminder) { ok, _ in
    if !ok { remDenied = true }
    remSem.signal()
  }
}
if remSem.wait(timeout: .now() + 20) == .success && !remDenied {
  // nil start includes overdue series. A daily reminder keeps its old due date
  // and still appears today and tomorrow in Calendar.
  let rpred = store.predicateForIncompleteReminders(
    withDueDateStarting: nil, ending: nil, calendars: nil)
  var reminders: [EKReminder] = []
  let fetchSem = DispatchSemaphore(value: 0)
  store.fetchReminders(matching: rpred) { list in
    reminders = list ?? []
    fetchSem.signal()
  }
  _ = fetchSem.wait(timeout: .now() + 25)

  func occurrence(on day: Date, comps: DateComponents) -> Date? {
    var parts = cal.dateComponents([.year, .month, .day], from: day)
    parts.hour = comps.hour
    parts.minute = comps.minute
    parts.second = 0
    return cal.date(from: parts)
  }

  func appendReminder(_ r: EKReminder, at due: Date, comps: DateComponents) {
    if due < Date() { return }
    items.append([
      "id": "reminder-\(r.calendarItemIdentifier)-\(df.string(from: due))",
      "title": r.title ?? "(promemoria)",
      "location": NSNull(),
      "startsAt": df.string(from: due),
      "endsAt": df.string(from: due),
      "isAllDay": reminderAllDay(comps),
      "calendarName": r.calendar?.title ?? "Promemoria",
    ])
  }

  // Same window as the phone widget: the rest of today and all of tomorrow.
  let widgetEnd = cal.date(byAdding: .day, value: 2, to: start) ?? end
  let now = Date()

  for r in reminders {
    guard let comps = r.dueDateComponents, let anchor = cal.date(from: comps) else { continue }
    let rules = r.recurrenceRules ?? []
    if rules.isEmpty {
      if anchor >= now && anchor < end {
        appendReminder(r, at: anchor, comps: comps)
      }
      continue
    }
    var day = start
    while day < widgetEnd {
      for rule in rules {
        if let stop = rule.recurrenceEnd?.endDate, stop < day { continue }
        let interval = max(rule.interval, 1)
        let occ = occurrence(on: day, comps: comps)
        guard let occ, occ >= anchor, occ >= now, occ < widgetEnd else { continue }
        switch rule.frequency {
        case .daily:
          let delta = cal.dateComponents([.day], from: cal.startOfDay(for: anchor), to: day).day ?? 0
          if delta >= 0 && delta % interval == 0 {
            appendReminder(r, at: occ, comps: comps)
          }
        case .weekly:
          let weekday = cal.component(.weekday, from: day)
          let allowed = rule.daysOfTheWeek?.map { $0.dayOfTheWeek.rawValue }
          let matches = allowed?.contains(weekday) ?? (weekday == cal.component(.weekday, from: anchor))
          let weeks = cal.dateComponents([.weekOfYear], from: cal.startOfDay(for: anchor), to: day).weekOfYear ?? 0
          if matches && weeks >= 0 && weeks % interval == 0 {
            appendReminder(r, at: occ, comps: comps)
          }
        case .monthly:
          if cal.component(.day, from: day) == cal.component(.day, from: anchor) {
            let months = cal.dateComponents([.month], from: anchor, to: day).month ?? 0
            if months >= 0 && months % interval == 0 {
              appendReminder(r, at: occ, comps: comps)
            }
          }
        case .yearly:
          if cal.component(.month, from: day) == cal.component(.month, from: anchor)
            && cal.component(.day, from: day) == cal.component(.day, from: anchor) {
            let years = cal.component(.year, from: day) - cal.component(.year, from: anchor)
            if years >= 0 && years % interval == 0 {
              appendReminder(r, at: occ, comps: comps)
            }
          }
        @unknown default:
          break
        }
      }
      guard let next = cal.date(byAdding: .day, value: 1, to: day) else { break }
      day = next
    }
  }

  var seenKeys = Set<String>()
  items = items.filter { item in
    let key = "\(item["title"] as? String ?? "")|\(item["startsAt"] as? String ?? "")"
    if seenKeys.contains(key) { return false }
    seenKeys.insert(key)
    return true
  }
  items.sort {
    let a = $0["startsAt"] as? String ?? ""
    let b = $1["startsAt"] as? String ?? ""
    return a < b
  }
}

let payload: [String: Any] = ["ok": true, "items": items]
if let data = try? JSONSerialization.data(withJSONObject: payload),
   let text = String(data: data, encoding: .utf8) {
  print(text)
} else {
  print("{\"ok\":false,\"error\":\"JSON encode failed\"}")
}
