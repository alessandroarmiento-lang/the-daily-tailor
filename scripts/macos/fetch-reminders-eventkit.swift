#!/usr/bin/env swift
/**
 * Fetch open (incomplete) Reminders via EventKit.
 * Includes undated, overdue, due-today, and future-dated open items.
 * Soft A4 cap is applied in Node (REMINDERS_MAX_ITEMS).
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

// All incomplete reminders (any due date, including nil / future / overdue).
let incomplete = fetch(
  store.predicateForIncompleteReminders(
    withDueDateStarting: nil, ending: nil, calendars: nil))

func dueDate(of r: EKReminder) -> Date? {
  guard let comps = r.dueDateComponents else { return nil }
  return cal.date(from: comps)
}

/// Prefer overdue → due today → undated → future, then earlier due, then title.
func sortKey(_ r: EKReminder) -> (Int, TimeInterval, String) {
  let title = r.title ?? ""
  guard let due = dueDate(of: r) else {
    return (2, Double.greatestFiniteMagnitude, title)
  }
  if due < start {
    return (0, due.timeIntervalSince1970, title)
  }
  if cal.isDate(due, inSameDayAs: start) {
    return (1, due.timeIntervalSince1970, title)
  }
  return (3, due.timeIntervalSince1970, title)
}

let sorted = incomplete.sorted {
  let a = sortKey($0)
  let b = sortKey($1)
  if a.0 != b.0 { return a.0 < b.0 }
  if a.1 != b.1 { return a.1 < b.1 }
  return a.2.localizedCaseInsensitiveCompare(b.2) == .orderedAscending
}

var items: [[String: Any]] = []
var seen = Set<String>()

for r in sorted {
  let id = r.calendarItemIdentifier
  if seen.contains(id) { continue }
  seen.insert(id)
  let prio: String
  switch r.priority {
  case 1...4: prio = "high"
  case 5: prio = "medium"
  case 6...9: prio = "low"
  default: prio = "none"
  }
  var due: Any = NSNull()
  if let date = dueDate(of: r) {
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
  if items.count >= maxItems { break }
}

let payload: [String: Any] = ["ok": true, "items": items]
if let data = try? JSONSerialization.data(withJSONObject: payload),
   let text = String(data: data, encoding: .utf8) {
  print(text)
} else {
  print("{\"ok\":false,\"error\":\"JSON encode failed\"}")
}
