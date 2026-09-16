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

let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
let events = store.events(matching: pred).sorted { $0.startDate < $1.startDate }

let df = DateFormatter()
df.locale = Locale(identifier: "en_US_POSIX")
df.timeZone = TimeZone.current
df.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"

var items: [[String: Any]] = []
for e in events {
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

let payload: [String: Any] = ["ok": true, "items": items]
if let data = try? JSONSerialization.data(withJSONObject: payload),
   let text = String(data: data, encoding: .utf8) {
  print(text)
} else {
  print("{\"ok\":false,\"error\":\"JSON encode failed\"}")
}
