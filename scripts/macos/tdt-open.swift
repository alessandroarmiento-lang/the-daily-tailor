#!/usr/bin/env swift
/**
 * Open a specific Reminders / Calendar / Mail item and activate the app.
 * Also serves http://127.0.0.1:3855 for the paper (POST /open, GET /health).
 *
 * Usage:
 *   tdt-open serve
 *   tdt-open reminder --title "…" [--list "…"]
 *   tdt-open event --title "…" [--start "2026-09-19T06:30:00Z"]
 *   tdt-open mail --id "msgid@domain"
 */
import AppKit
import EventKit
import Foundation
import Network

let OPEN_HOST = "127.0.0.1"
let OPEN_PORT: NWEndpoint.Port = 3855

func jsonString(_ obj: [String: Any]) -> String {
  guard let data = try? JSONSerialization.data(withJSONObject: obj),
        let text = String(data: data, encoding: .utf8) else {
    return "{\"ok\":false,\"detail\":\"json\"}"
  }
  return text
}

func jsonOut(_ obj: [String: Any]) {
  print(jsonString(obj))
}

func argValue(_ name: String) -> String? {
  let args = CommandLine.arguments
  guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
  return args[i + 1]
}

func activateApp(_ bundleId: String) {
  // Prefer an already-running instance and force it frontmost — openApplication
  // alone often leaves Safari focused when Reminders/Calendar/Mail are open.
  if let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first {
    app.activate(options: [.activateAllWindows])
  }
  let config = NSWorkspace.OpenConfiguration()
  config.activates = true
  if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) {
    NSWorkspace.shared.openApplication(at: url, configuration: config) { _, _ in }
  }
}

func openURL(_ string: String) -> Bool {
  guard let url = URL(string: string) else { return false }
  // Synchronous open — async+semaphore on the main HTTP thread deadlocks.
  return NSWorkspace.shared.open(url)
}

func appleScriptEscape(_ value: String) -> String {
  value
    .replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")
}

/// Run via /usr/bin/osascript so Automation TCC applies to TDT Open.app
/// even when called from the background HTTP server.
@discardableResult
func runOsascript(_ source: String) -> (ok: Bool, output: String) {
  let proc = Process()
  let out = Pipe()
  let err = Pipe()
  proc.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
  proc.arguments = ["-e", source]
  proc.standardOutput = out
  proc.standardError = err
  do {
    try proc.run()
  } catch {
    return (false, "\(error)")
  }
  proc.waitUntilExit()
  let stdout = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  let stderr = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  if proc.terminationStatus == 0 {
    return (true, stdout.isEmpty ? "OK" : stdout)
  }
  return (false, stderr.isEmpty ? "exit \(proc.terminationStatus)" : stderr)
}

/// Bring Reminders forward and show the list / reminder (works when already open).
func showReminderInApp(title: String, list: String?) -> Bool {
  let t = appleScriptEscape(title)
  let source: String
  if let list, !list.isEmpty {
    let l = appleScriptEscape(list)
    source = """
    tell application "Reminders"
      activate
    end tell
    tell application "System Events"
      try
        set frontmost of first process whose bundle identifier is "com.apple.reminders" to true
      end try
    end tell
    tell application "Reminders"
      try
        tell list "\(l)"
          show (first reminder whose name is "\(t)")
        end tell
        return "OK"
      on error
        try
          show (first list whose name is "\(l)")
          return "LIST"
        on error
          return "FAIL"
        end try
      end try
    end tell
    """
  } else {
    source = """
    tell application "Reminders"
      activate
    end tell
    tell application "System Events"
      try
        set frontmost of first process whose bundle identifier is "com.apple.reminders" to true
      end try
    end tell
    tell application "Reminders"
      try
        show (first reminder whose name is "\(t)")
        return "OK"
      on error
        return "FAIL"
      end try
    end tell
    """
  }
  let (ok, output) = runOsascript(source)
  return ok && (output == "OK" || output == "LIST")
}

func authorizeReminders(_ store: EKEventStore) -> String? {
  let status = EKEventStore.authorizationStatus(for: .reminder)
  if #available(macOS 14.0, *) {
    if status == .fullAccess { return nil }
  } else if status == .authorized {
    return nil
  }
  let sem = DispatchSemaphore(value: 0)
  var err: String?
  if #available(macOS 14.0, *) {
    store.requestFullAccessToReminders { ok, e in
      if !ok { err = e?.localizedDescription ?? "denied" }
      sem.signal()
    }
  } else {
    store.requestAccess(to: .reminder) { ok, e in
      if !ok { err = e?.localizedDescription ?? "denied" }
      sem.signal()
    }
  }
  if sem.wait(timeout: .now() + 12) == .timedOut { return "timeout" }
  return err
}

func authorizeEvents(_ store: EKEventStore) -> String? {
  let status = EKEventStore.authorizationStatus(for: .event)
  if #available(macOS 14.0, *) {
    if status == .fullAccess { return nil }
  } else if status == .authorized {
    return nil
  }
  let sem = DispatchSemaphore(value: 0)
  var err: String?
  if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { ok, e in
      if !ok { err = e?.localizedDescription ?? "denied" }
      sem.signal()
    }
  } else {
    store.requestAccess(to: .event) { ok, e in
      if !ok { err = e?.localizedDescription ?? "denied" }
      sem.signal()
    }
  }
  if sem.wait(timeout: .now() + 12) == .timedOut { return "timeout" }
  return err
}

@discardableResult
func openReminder(title: String, list: String?) -> [String: Any] {
  let store = EKEventStore()
  if let err = authorizeReminders(store) {
    return ["ok": false, "detail": err]
  }
  let sem = DispatchSemaphore(value: 0)
  var found: EKReminder?
  let pred = store.predicateForIncompleteReminders(
    withDueDateStarting: nil, ending: nil, calendars: nil)
  store.fetchReminders(matching: pred) { reminders in
    let matches = (reminders ?? []).filter { ($0.title ?? "") == title }
    if let list, !list.isEmpty {
      found = matches.first { ($0.calendar?.title ?? "") == list } ?? matches.first
    } else {
      found = matches.first
    }
    sem.signal()
  }
  _ = sem.wait(timeout: .now() + 20)
  guard let reminder = found else {
    // Still try AppleScript by title/list so a second click can switch lists.
    if showReminderInApp(title: title, list: list) {
      return ["ok": true, "detail": "OK", "via": "applescript"]
    }
    activateApp("com.apple.reminders")
    return ["ok": false, "detail": "NOT_FOUND"]
  }
  let uuid = reminder.calendarItemIdentifier
  let url = "x-apple-reminderkit://REMCDReminder/\(uuid)"
  // AppleScript first: switches list + fronts the app when already open.
  let shown = showReminderInApp(title: title, list: list)
  _ = openURL(url)
  activateApp("com.apple.reminders")
  // Second activate after URL — ReminderKit often leaves Safari focused.
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
    activateApp("com.apple.reminders")
  }
  return [
    "ok": true,
    "detail": "OK",
    "url": url,
    "via": shown ? "applescript+url" : "url",
  ]
}

func parseStart(_ raw: String?) -> Date? {
  guard let raw, !raw.isEmpty else { return nil }
  let iso = ISO8601DateFormatter()
  iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let d = iso.date(from: raw) { return d }
  iso.formatOptions = [.withInternetDateTime]
  if let d = iso.date(from: raw) { return d }
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_US_POSIX")
  f.timeZone = TimeZone.current
  f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
  return f.date(from: String(raw.prefix(19)))
}

@discardableResult
func openEvent(title: String, startRaw: String?) -> [String: Any] {
  let store = EKEventStore()
  if let err = authorizeEvents(store) {
    return ["ok": false, "detail": err]
  }
  let cal = Calendar.current
  let center = parseStart(startRaw) ?? Date()
  let start = cal.date(byAdding: .hour, value: -12, to: center) ?? center
  let end = cal.date(byAdding: .hour, value: 12, to: center) ?? center
  let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
  var pick = store.events(matching: pred).first { ($0.title ?? "") == title }
  if pick == nil {
    let wideStart = cal.date(byAdding: .day, value: -1, to: Date()) ?? Date()
    let wideEnd = cal.date(byAdding: .day, value: 3, to: Date()) ?? Date()
    let widePred = store.predicateForEvents(withStart: wideStart, end: wideEnd, calendars: nil)
    pick = store.events(matching: widePred).first { ($0.title ?? "") == title }
  }
  guard let event = pick else {
    return ["ok": false, "detail": "NOT_FOUND"]
  }
  let eid = event.eventIdentifier ?? event.calendarItemIdentifier
  let url = "ical://ekevent/\(eid)"
  _ = openURL(url)
  activateApp("com.apple.iCal")
  return ["ok": true, "detail": "OK", "url": url]
}

func isValidMessageId(_ bare: String) -> Bool {
  if bare.isEmpty || bare.hasPrefix("imap-") { return false }
  if bare.range(of: "[*?\\s<>]", options: .regularExpression) != nil { return false }
  guard let at = bare.lastIndex(of: "@"), at > bare.startIndex,
        at < bare.index(before: bare.endIndex) else { return false }
  let domain = String(bare[bare.index(after: at)...])
  return domain.range(
    of: "^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$",
    options: .regularExpression,
  ) != nil
}

/// Find a Mail message via Spotlight and open the .emlx (no AppleScript / Automation).
@discardableResult
func openMailBySubject(_ subject: String) -> [String: Any] {
  let title = subject.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !title.isEmpty else {
    activateApp("com.apple.mail")
    return ["ok": false, "detail": "missing subject"]
  }
  let escaped = title
    .replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")
  let proc = Process()
  let pipe = Pipe()
  proc.executableURL = URL(fileURLWithPath: "/usr/bin/mdfind")
  proc.arguments = ["kMDItemSubject == \"\(escaped)\"c"]
  proc.standardOutput = pipe
  proc.standardError = Pipe()
  do {
    try proc.run()
  } catch {
    return openMailBySubjectAppleScript(title)
  }
  proc.waitUntilExit()
  let data = pipe.fileHandleForReading.readDataToEndOfFile()
  let text = String(data: data, encoding: .utf8) ?? ""
  let paths = text
    .split(whereSeparator: \.isNewline)
    .map(String.init)
    .filter {
      ($0.contains("/Library/Mail/") || $0.contains("/Library/Mobile Documents/"))
        && ($0.hasSuffix(".emlx") || $0.hasSuffix(".partial.emlx") || $0.hasSuffix(".eml"))
    }
  if let first = paths.first {
    NSWorkspace.shared.open(URL(fileURLWithPath: first))
    activateApp("com.apple.mail")
    return ["ok": true, "detail": "OK", "via": "spotlight"]
  }
  return openMailBySubjectAppleScript(title)
}

@discardableResult
func openMailBySubjectAppleScript(_ subject: String) -> [String: Any] {
  let escaped = appleScriptEscape(subject)
  // Exact match on unified inbox only — `contains` scans too much and can hang.
  let source = """
  tell application "Mail"
    set theSubject to "\(escaped)"
    set foundMessage to missing value
    try
      set hits to (messages of inbox whose subject is theSubject)
      if (count of hits) > 0 then set foundMessage to item 1 of hits
    end try
    if foundMessage is missing value then
      repeat with anAccount in accounts
        try
          set inb to mailbox "INBOX" of anAccount
          set hits to (messages of inb whose subject is theSubject)
          if (count of hits) > 0 then
            set foundMessage to item 1 of hits
            exit repeat
          end if
        end try
      end repeat
    end if
    if foundMessage is not missing value then
      open foundMessage
      activate
      return "OK"
    else
      activate
      return "NOT_FOUND"
    end if
  end tell
  """
  var error: NSDictionary?
  guard let script = NSAppleScript(source: source) else {
    activateApp("com.apple.mail")
    return ["ok": true, "detail": "opened Mail"]
  }
  let result = script.executeAndReturnError(&error)
  if let error {
    let msg = error[NSAppleScript.errorMessage] as? String ?? "\(error)"
    activateApp("com.apple.mail")
    return ["ok": true, "detail": msg]
  }
  let output = result.stringValue ?? ""
  if output == "OK" {
    return ["ok": true, "detail": "OK", "via": "applescript"]
  }
  // Still ok:true so the browser does not fall back to a broken message: URL.
  return ["ok": true, "detail": "opened Mail", "via": "applescript"]
}

@discardableResult
func openMail(messageId: String, subject: String = "") -> [String: Any] {
  let bare = messageId.trimmingCharacters(in: CharacterSet(charactersIn: "<>"))
  if isValidMessageId(bare) {
    let escaped = bare.replacingOccurrences(of: "%", with: "%25")
    let url = "message:%3C\(escaped)%3E"
    _ = openURL(url)
    activateApp("com.apple.mail")
    return ["ok": true, "detail": "OK", "url": url]
  }
  let title = subject.trimmingCharacters(in: .whitespacesAndNewlines)
  if !title.isEmpty {
    return openMailBySubject(title)
  }
  activateApp("com.apple.mail")
  return ["ok": true, "detail": "opened Mail (no id/subject)"]
}

func handleOpenBody(_ body: [String: Any]) -> [String: Any] {
  let kind = (body["kind"] as? String ?? "").lowercased()
  switch kind {
  case "mail":
    let mid = (body["messageId"] as? String) ?? ""
    let title = (body["title"] as? String) ?? (body["subject"] as? String) ?? ""
    return openMail(messageId: mid, subject: title)
  case "reminder":
    let title = body["title"] as? String ?? ""
    let list = body["listName"] as? String ?? body["list"] as? String
    return openReminder(title: title, list: list)
  case "event", "calendar":
    let title = body["title"] as? String ?? ""
    let start = body["startsAt"] as? String ?? body["start"] as? String
    return openEvent(title: title, startRaw: start)
  default:
    return ["ok": false, "detail": "unknown kind"]
  }
}

/// tdt-open://open?kind=reminder&title=…&listName=…
func handleOpenURLString(_ raw: String) -> [String: Any] {
  guard let url = URL(string: raw) else {
    return ["ok": false, "detail": "bad url"]
  }
  let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
  var body: [String: Any] = [:]
  for item in comps?.queryItems ?? [] {
    if let value = item.value { body[item.name] = value }
  }
  if body["kind"] == nil {
    // tdt-open://reminder?title=…
    let host = (url.host ?? url.path).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    if !host.isEmpty && host != "open" {
      body["kind"] = host
    }
  }
  FileHandle.standardError.write(
    Data("tdt-open URL: \(raw)\n".utf8))
  return handleOpenBody(body)
}

/// Handles Safari → tdt-open://… (HTTPS pages cannot fetch http://127.0.0.1).
final class URLHandler: NSObject {
  static let shared = URLHandler()

  @objc func handleGetURLEvent(
    _ event: NSAppleEventDescriptor,
    withReplyEvent replyEvent: NSAppleEventDescriptor,
  ) {
    guard
      let raw = event.paramDescriptor(forKeyword: AEKeyword(0x2D2D_2D2D))?
        .stringValue
    else { return }
    DispatchQueue.main.async {
      _ = handleOpenURLString(raw)
    }
  }
}

func registerURLSchemeHandler() {
  // Both class and ID are 'GURL' (kInternetEventClass / kAEGetURL).
  let gurl = AEEventClass(0x4755_524C)
  NSAppleEventManager.shared().setEventHandler(
    URLHandler.shared,
    andSelector: #selector(URLHandler.handleGetURLEvent(_:withReplyEvent:)),
    forEventClass: gurl,
    andEventID: AEEventID(gurl),
  )
}

func httpResponse(status: Int, body: String) -> Data {
  let reason: String
  switch status {
  case 200: reason = "OK"
  case 404: reason = "Not Found"
  case 204: reason = "No Content"
  default: reason = "Error"
  }
  let header =
    "HTTP/1.1 \(status) \(reason)\r\n" +
    "Content-Type: application/json\r\n" +
    "Access-Control-Allow-Origin: *\r\n" +
    "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
    "Access-Control-Allow-Headers: Content-Type\r\n" +
    "Content-Length: \(body.utf8.count)\r\n" +
    "Connection: close\r\n\r\n"
  return Data((header + body).utf8)
}

func handleHTTP(request: String) -> Data {
  let lines = request.split(separator: "\r\n", omittingEmptySubsequences: false).map(String.init)
  guard let requestLine = lines.first else {
    return httpResponse(status: 400, body: "{\"ok\":false}")
  }
  let parts = requestLine.split(separator: " ")
  let method = parts.count > 0 ? String(parts[0]) : ""
  let path = parts.count > 1 ? String(parts[1]) : "/"

  if method == "OPTIONS" {
    return httpResponse(status: 204, body: "")
  }
  if method == "GET" && (path == "/health" || path.hasPrefix("/health?")) {
    return httpResponse(status: 200, body: "{\"ok\":true,\"service\":\"tdt-open\"}")
  }
  if method == "POST" && (path == "/open" || path.hasPrefix("/open?")) {
    let body: String
    if let idx = request.range(of: "\r\n\r\n")?.upperBound {
      body = String(request[idx...])
    } else {
      body = "{}"
    }
    let parsed = (try? JSONSerialization.jsonObject(with: Data(body.utf8))) as? [String: Any] ?? [:]
    let result = handleOpenBody(parsed)
    let ok = result["ok"] as? Bool ?? false
    let detail = result["detail"] as? String ?? ""
    let status = ok ? 200 : (detail == "NOT_FOUND" ? 404 : 500)
    return httpResponse(status: status, body: jsonString(result))
  }
  return httpResponse(status: 404, body: "{\"ok\":false,\"detail\":\"not found\"}")
}

func serve() {
  let app = NSApplication.shared
  // Accessory = menu-bar / background agent; required for GetURL Apple Events.
  app.setActivationPolicy(.accessory)
  registerURLSchemeHandler()

  let listener: NWListener
  do {
    listener = try NWListener(using: .tcp, on: OPEN_PORT)
  } catch {
    // Another TDT Open already owns :3855 — stay alive briefly so a
    // launch-for-URL can still receive GetURL, then exit.
    FileHandle.standardError.write(
      Data("listen failed (port busy): \(error) — URL handler only\n".utf8))
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { exit(0) }
    app.run()
    return
  }
  listener.newConnectionHandler = { conn in
    conn.start(queue: DispatchQueue.global(qos: .userInitiated))
    var buffer = Data()
    func finish() {
      let text = String(data: buffer, encoding: .utf8) ?? ""
      // EventKit callbacks require the main thread / run loop.
      var response = Data()
      let lock = DispatchSemaphore(value: 0)
      DispatchQueue.main.async {
        response = handleHTTP(request: text)
        lock.signal()
      }
      _ = lock.wait(timeout: .now() + 35)
      if response.isEmpty {
        response = httpResponse(
          status: 500,
          body: "{\"ok\":false,\"detail\":\"timeout\"}",
        )
      }
      conn.send(content: response, completion: .contentProcessed { _ in
        conn.cancel()
      })
    }
    conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, isComplete, error in
      if let data { buffer.append(data) }
      let text = String(data: buffer, encoding: .utf8) ?? ""
      let ready = text.contains("\r\n\r\n")
      // For POST, wait until Content-Length body bytes arrived.
      var need = 0
      if let range = text.range(of: "Content-Length:", options: .caseInsensitive) {
        let rest = text[range.upperBound...]
        if let end = rest.firstIndex(of: "\r") {
          need = Int(rest[..<end].trimmingCharacters(in: .whitespaces)) ?? 0
        }
      }
      let headerEnd = text.range(of: "\r\n\r\n")?.upperBound
      let bodyLen = headerEnd.map { text.distance(from: $0, to: text.endIndex) } ?? 0
      if (ready && bodyLen >= need) || isComplete || error != nil {
        finish()
      }
    }
  }
  listener.stateUpdateHandler = { state in
    if case .failed(let err) = state {
      FileHandle.standardError.write(Data("listener failed: \(err)\n".utf8))
      exit(1)
    }
  }
  listener.start(queue: .main)
  FileHandle.standardError.write(
    Data("tdt-open listening on http://\(OPEN_HOST):\(OPEN_PORT)\n".utf8))
  app.run()
}

let args = CommandLine.arguments
if args.count < 2 || args[1] == "serve" {
  serve()
} else {
  switch args[1] {
  case "reminder":
    jsonOut(openReminder(title: argValue("--title") ?? "", list: argValue("--list")))
  case "event":
    jsonOut(openEvent(title: argValue("--title") ?? "", startRaw: argValue("--start")))
  case "mail":
    jsonOut(
      openMail(
        messageId: argValue("--id") ?? "",
        subject: argValue("--subject") ?? "",
      ))
  default:
    jsonOut(["ok": false, "detail": "unknown kind"])
    exit(1)
  }
}
