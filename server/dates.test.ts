import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidTimeZone, zonedParts, todayIn, shiftDate, reminderDueDate } from "./dates";

// 2026-10-02 03:30 UTC = Thursday 2026-10-01 20:30 in Los Angeles (PDT, UTC-7)
const at = new Date("2026-10-02T03:30:00Z");

test("a US evening is still today locally, though UTC has rolled over", () => {
  assert.equal(todayIn("UTC", at), "2026-10-02");
  assert.equal(todayIn("America/Los_Angeles", at), "2026-10-01");
});

test("zonedParts gives local time and weekday", () => {
  assert.deepEqual(zonedParts("America/Los_Angeles", at), { date: "2026-10-01", hhmm: "20:30", weekday: 4 });
  assert.deepEqual(zonedParts("Asia/Tokyo", at), { date: "2026-10-02", hhmm: "12:30", weekday: 5 });
  assert.deepEqual(zonedParts("UTC", new Date("2026-10-04T00:05:00Z")), { date: "2026-10-04", hhmm: "00:05", weekday: 0 });
});

test("time zone validation", () => {
  assert.ok(isValidTimeZone("America/New_York"));
  assert.ok(isValidTimeZone("UTC"));
  assert.ok(!isValidTimeZone("Not/AZone"));
  assert.ok(!isValidTimeZone(""));
  assert.ok(!isValidTimeZone(undefined));
  assert.ok(!isValidTimeZone(42));
});

test("shiftDate crosses month and year boundaries", () => {
  assert.equal(shiftDate("2026-10-01", -1), "2026-09-30");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2026-03-08", 30), "2026-04-07");
});

test("reminders fire at the user's local time on their injection day", () => {
  const user = { reminderEnabled: true, reminderTime: "09:00", glp1InjectionDay: "Mon", timezone: "America/Los_Angeles" };
  // Monday 2026-10-05 09:00 PDT = 16:00 UTC
  assert.equal(reminderDueDate(user, new Date("2026-10-05T16:00:00Z")), "2026-10-05");
  // 09:00 UTC is 02:00 in Los Angeles: no reminder in the middle of the night
  assert.equal(reminderDueDate(user, new Date("2026-10-05T09:00:00Z")), null);
  // Tuesday 09:00 PDT: wrong day
  assert.equal(reminderDueDate(user, new Date("2026-10-06T16:00:00Z")), null);
  // Monday 09:01: wrong minute
  assert.equal(reminderDueDate(user, new Date("2026-10-05T16:01:00Z")), null);
});

test("reminders: disabled, incomplete or zone-less users", () => {
  const base = { reminderEnabled: true, reminderTime: "09:00", glp1InjectionDay: "Mon", timezone: null };
  const mon0900utc = new Date("2026-10-05T09:00:00Z");
  assert.equal(reminderDueDate(base, mon0900utc), "2026-10-05", "falls back to UTC");
  assert.equal(reminderDueDate({ ...base, timezone: "Bad/Zone" }, mon0900utc), "2026-10-05");
  assert.equal(reminderDueDate({ ...base, reminderEnabled: false }, mon0900utc), null);
  assert.equal(reminderDueDate({ ...base, glp1InjectionDay: null }, mon0900utc), null);
  assert.equal(reminderDueDate({ ...base, reminderTime: null }, mon0900utc), null);
});
