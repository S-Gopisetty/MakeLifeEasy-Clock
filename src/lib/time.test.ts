import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalTimeText,
  describeInstant,
  parseTimeInput,
  relativeOffsetLabel,
  wallTimeToInstant,
  zoneAbbreviation,
} from "./time.ts";

test("UTC 1:00 AM is yesterday 9:00 PM in New York during daylight saving", () => {
  const hit = wallTimeToInstant(2026, 10, 30, 1, 0, "UTC");
  assert.equal(hit.kind, "exact");
  assert.equal(hit.instant.toISOString(), "2026-10-30T01:00:00.000Z");
  const now = new Date("2026-10-30T15:00:00.000Z");
  const face = describeInstant(hit.instant, "America/New_York", now, "America/New_York");
  assert.equal(face.timeLabel, "9:00");
  assert.equal(face.period, "pm");
  assert.equal(face.relation, "Yesterday");
  assert.equal(face.abbr, "EDT");
  assert.equal(face.longName, "Eastern Daylight Time");
  assert.equal(face.offsetLabel, "UTC\u22124");
  assert.equal(face.isDST, true);
  assert.equal(face.longDate.includes("October 29"), true);
});

test("winter in New York is standard time", () => {
  const hit = wallTimeToInstant(2026, 1, 15, 15, 0, "UTC");
  const face = describeInstant(hit.instant, "America/New_York", hit.instant, "UTC");
  assert.equal(face.abbr, "EST");
  assert.equal(face.offsetLabel, "UTC\u22125");
  assert.equal(face.isDST, false);
  assert.equal(face.observesDST, true);
  assert.equal(face.timeLabel, "10:00");
  assert.equal(face.period, "am");
});

test("spring-forward gap moves the typed minutes forward one hour", () => {
  const hit = wallTimeToInstant(2026, 3, 8, 2, 30, "America/New_York");
  assert.equal(hit.kind, "gap");
  assert.equal(hit.instant.toISOString(), "2026-03-08T07:30:00.000Z");
  const face = describeInstant(hit.instant, "America/New_York", hit.instant, "America/New_York");
  assert.equal(face.timeLabel, "3:30");
  assert.equal(face.period, "am");
  assert.equal(face.abbr, "EDT");
});

test("fall-back overlap keeps both occurrences", () => {
  const earlier = wallTimeToInstant(2026, 11, 1, 1, 30, "America/New_York", "earlier");
  const later = wallTimeToInstant(2026, 11, 1, 1, 30, "America/New_York", "later");
  assert.equal(earlier.kind, "overlap");
  assert.equal(later.kind, "overlap");
  assert.equal(earlier.instant.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(later.instant.toISOString(), "2026-11-01T06:30:00.000Z");
});

test("London spring gap and half-hour zones", () => {
  const gap = wallTimeToInstant(2026, 3, 29, 1, 30, "Europe/London");
  assert.equal(gap.kind, "gap");
  assert.equal(gap.instant.toISOString(), "2026-03-29T01:30:00.000Z");
  const india = describeInstant(
    new Date("2026-10-30T01:00:00.000Z"),
    "Asia/Kolkata",
    new Date("2026-10-30T01:00:00.000Z"),
    "UTC",
  );
  assert.equal(india.timeLabel, "6:30");
  assert.equal(india.period, "am");
  assert.equal(india.offsetLabel, "UTC+5:30");
  assert.equal(india.observesDST, false);
  const nepal = describeInstant(
    new Date("2026-10-30T01:00:00.000Z"),
    "Asia/Kathmandu",
    new Date("2026-10-30T01:00:00.000Z"),
    "UTC",
  );
  assert.equal(nepal.timeLabel, "6:45");
  assert.equal(nepal.offsetLabel, "UTC+5:45");
});

test("southern hemisphere daylight saving is summer in January", () => {
  const summer = describeInstant(
    new Date("2026-01-15T01:00:00.000Z"),
    "Australia/Sydney",
    new Date("2026-01-15T01:00:00.000Z"),
    "UTC",
  );
  const winter = describeInstant(
    new Date("2026-07-15T02:00:00.000Z"),
    "Australia/Sydney",
    new Date("2026-07-15T02:00:00.000Z"),
    "UTC",
  );
  assert.equal(summer.isDST, true);
  assert.equal(summer.offsetLabel, "UTC+11");
  assert.equal(winter.isDST, false);
  assert.equal(winter.offsetLabel, "UTC+10");
});

test("a live clock can be tomorrow relative to home", () => {
  const now = new Date("2026-10-30T03:00:00.000Z");
  const london = describeInstant(now, "Europe/London", now, "America/New_York");
  assert.equal(london.relation, "Tomorrow");
});

test("time text parses 12-hour, 24-hour, and the sun/moon fallback", () => {
  assert.deepEqual(parseTimeInput("1 AM", "pm"), { hour24: 1, minute: 0, period: "am" });
  assert.deepEqual(parseTimeInput("1:05pm", "am"), { hour24: 13, minute: 5, period: "pm" });
  assert.deepEqual(parseTimeInput("13:05", "am"), { hour24: 13, minute: 5, period: "pm" });
  assert.deepEqual(parseTimeInput("12 AM", "pm"), { hour24: 0, minute: 0, period: "am" });
  assert.deepEqual(parseTimeInput("12 PM", "am"), { hour24: 12, minute: 0, period: "pm" });
  assert.deepEqual(parseTimeInput("1", "pm"), { hour24: 13, minute: 0, period: "pm" });
  assert.equal(parseTimeInput("25:00", "am"), null);
  assert.equal(parseTimeInput("", "am"), null);
  assert.equal(canonicalTimeText({ hour24: 1, minute: 0, period: "am" }), "1:00 AM");
});

test("subsecond timestamps do not invent daylight saving", () => {
  const now = new Date("2026-10-30T14:04:48.624Z");
  const london = describeInstant(now, "Europe/London", now, "America/New_York");
  assert.equal(london.isDST, false);
  assert.equal(london.abbr, "GMT");
  assert.equal(london.offsetLabel, "UTC");
  assert.equal(london.timeLabel, "2:04");
  assert.equal(london.period, "pm");
});

test("browser-style GMT+0 labels stay GMT, not a fake UTC offset", () => {
  assert.equal(zoneAbbreviation("GMT+0", "UTC", "Europe/London", "GMT+00:00"), "GMT");
  assert.equal(zoneAbbreviation("EDT", "UTC\u22124", "America/New_York", "Eastern Daylight Time"), "EDT");
  assert.equal(zoneAbbreviation("UTC", "UTC", "UTC", "Coordinated Universal Time"), "UTC");
  assert.equal(zoneAbbreviation("GMT+9", "UTC+9", "Asia/Tokyo", "Japan Standard Time"), "UTC+9");
});

test("offset label compares the result with the source zone", () => {
  const instant = new Date("2026-10-30T01:00:00.000Z");
  assert.equal(relativeOffsetLabel(instant, "UTC", "America/New_York"), "4 hours behind");
  assert.equal(relativeOffsetLabel(instant, "UTC", "Asia/Kolkata"), "5 hours 30 min ahead");
});
