/**
 * Smoke checks for reminder / calendar deep links (no browser).
 * Run: npx tsx scripts/check-deep-links.ts
 */
import assert from "node:assert/strict";
import {
  apriBridgeHref,
  agendaItemOpen,
  calendarEventDeepLink,
  calshowDeepLink,
  isAllowedNativeScheme,
  nativeSchemeFromApriParams,
  reminderDeepLink,
  reminderKitUuid,
  reminderOpenPayload,
  tdtOpenSchemeUrl,
} from "../src/lib/apple/deep-links";

const uuid = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890";

assert.equal(reminderKitUuid(uuid), uuid);
assert.equal(
  reminderKitUuid(`x-apple-reminderkit://REMCDReminder/${uuid}`),
  uuid,
);
assert.equal(reminderDeepLink(uuid), `x-apple-reminderkit://REMCDReminder/${uuid}`);
assert.equal(reminderDeepLink("Lista|Titolo"), "x-apple-reminderkit://");

const startsAt = "2026-10-23T09:30:00+02:00";
const show = calshowDeepLink(startsAt);
assert.ok(show?.startsWith("calshow:"), show);

assert.equal(
  calendarEventDeepLink("evt-1", {
    title: "Stand-up",
    calendarName: "Gmail",
    startsAt,
  }),
  `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent("Stand-up")}`,
);

assert.equal(
  calendarEventDeepLink("evt-2", {
    title: "Dentista",
    calendarName: "iCloud",
    startsAt,
  }),
  show,
);

const scheme = tdtOpenSchemeUrl({
  kind: "reminder",
  title: "Latte",
  listName: "Spesa",
  id: "Spesa|Latte",
});
assert.ok(scheme.startsWith("tdt-open://open?"));
assert.ok(scheme.includes("kind=reminder"));
assert.ok(scheme.includes("title=Latte"));

const bridge = apriBridgeHref(
  reminderOpenPayload({
    id: uuid,
    title: "Autolettura gas",
    listName: "Famiglia",
  }),
  reminderDeepLink(uuid),
);
assert.ok(bridge.startsWith("/apri?"));
const bridgeParams = new URL(bridge, "https://example.test").searchParams;
assert.equal(
  nativeSchemeFromApriParams(bridgeParams),
  `x-apple-reminderkit://REMCDReminder/${uuid}`,
);
assert.ok(
  isAllowedNativeScheme(`x-apple-reminderkit://REMCDReminder/${uuid}`),
);
assert.equal(isAllowedNativeScheme("javascript:alert(1)"), false);

const agendaReminder = agendaItemOpen({
  id: `reminder-${uuid}-2026-11-16T09:00:00+01:00`,
  title: "Promemoria",
  startsAt: "2026-11-16T08:00:00.000Z",
  calendarName: "Famiglia",
});
assert.equal(agendaReminder.payload.kind, "reminder");
assert.equal(agendaReminder.payload.id, uuid);
assert.equal(
  agendaReminder.href,
  `x-apple-reminderkit://REMCDReminder/${uuid}`,
);
assert.equal(
  nativeSchemeFromApriParams(
    new URL(apriBridgeHref(agendaReminder.payload, agendaReminder.href), "https://example.test").searchParams,
  ),
  `x-apple-reminderkit://REMCDReminder/${uuid}`,
);

const agendaEvent = agendaItemOpen({
  id: "evt-2",
  title: "Dentista",
  startsAt,
  calendarName: "iCloud",
});
assert.equal(agendaEvent.payload.kind, "event");
assert.equal(agendaEvent.href, show);

console.log("check-deep-links: ok");
