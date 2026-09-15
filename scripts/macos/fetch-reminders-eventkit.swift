#!/usr/bin/env swift
/**
 * Fetch today's open Reminders via EventKit (fast; AppleScript hangs on iCloud lists).
 * Prints JSON: { ok, error?, items:[{id,title,notes,listName,dueAt,priority}] }
 * Args: optional maxItems (default 20)
 */
import EventKit
import Foundation

let maxItems: Int = {
  if CommandLine.arguments.count > 1, let n = Int(CommandLine.arguments[1]) {
    return max(1, n)
  }
  return 20
}()

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)
var authErr: String?

if #available(macOS 14.0, *) {
  store.requestFullAccessToReminders { ok, err in
    if !ok { authErr = err?.localizedDescription ?? "denied" }
    sem.signal()
  }
} else {
  store.requestAccess(to: .reminder) { ok, err in
    if !ok { authErr = err?.localizedDescription ?? "denied" }
    sem.signal()
  }
}

if sem.wait(timeout: .now() + 20) == .timedOut {
  print("{\"ok\":false,\"error\":\"Timeout autorizzazione Promemoria (EventKit)\"}")
  exit(0)
}

if let authErr {
  let msg = authErr.replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")
  print("{\"ok\":false,\"error\":\"Autorizza Promemoria (Privacy → Promemoria) per Terminal/this tool: \(msg)\"}")
  exit(0)
}

let cal = Calendar.current
let start = cal.startOfDay(for: Date())
guard let end = cal.date(byAdding: .day, value: 1, to: start) else {
  print("{\"ok\":false,\"error\":\"date bounds\"}")
  exit(1)
}

func fetch(_ pred: NSPredicate) -> [EKReminder] {
  var out: [EKReminder] = []
  let s = DispatchSemaphore(value: 0)
  store.fetchReminders(matching: pred) { reminders in
    out = reminders ?? []
    s.signal()
  }
  _ = s.wait(timeout: .now() + 25)
  return out
}

let dueToday = fetch(
  store.predicateForIncompleteReminders(
    withDueDateStarting: start, ending: end, calendars: nil))
let incomplete = fetch(
  store.predicateForIncompleteReminders(
    withDueDateStarting: nil, ending: nil, calendars: nil))
let undated = incomplete.filter { $0.dueDateComponents == nil }

var items: [[String: Any]] = []
var seen = Set<String>()

func push(_ r: EKReminder) {
  let id = r.calendarItemIdentifier
  if seen.contains(id) { return }
  seen.insert(id)
  let prio: String
  switch r.priority {
  case 1...4: prio = "high"
  case 5: prio = "medium"
  case 6...9: prio = "low"
  default: prio = "none"
  }
  var due: Any = NSNull()
  if let comps = r.dueDateComponents, let date = cal.date(from: comps) {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    due = f.string(from: date)
  }
  items.append([
    "id": id,
    "title": r.title ?? "(senza titolo)",
    "notes": String((r.notes ?? "").prefix(200)),
    "listName": r.calendar?.title ?? "Promemoria",
    "dueAt": due,
    "priority": prio,
  ])
}

for r in dueToday { push(r) }
for r in undated { push(r) }
if items.count > maxItems {
  items = Array(items.prefix(maxItems))
}

let payload: [String: Any] = ["ok": true, "items": items]
if let data = try? JSONSerialization.data(withJSONObject: payload),
   let text = String(data: data, encoding: .utf8) {
  print(text)
} else {
  print("{\"ok\":false,\"error\":\"JSON encode failed\"}")
}
