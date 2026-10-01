// API integration tests: run the real app against a throwaway Postgres.
//
//   TEST_DATABASE_URL=postgres://... npm run test:integration
//
// The database is WIPED before the run. Google's token endpoint is faked
// in-process, so no Google credentials or network access are needed.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "net";
import type { Server } from "http";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) {
  throw new Error("Set TEST_DATABASE_URL to a throwaway Postgres database (it will be wiped).");
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === TEST_DB) {
  throw new Error("TEST_DATABASE_URL must not be the same database as DATABASE_URL.");
}
process.env.DATABASE_URL = TEST_DB;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "integration-test-secret";
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.LEGACY_USER_EMAIL = "owner@example.com";
delete process.env.DEMO_MODE;
delete process.env.OPENAI_API_KEY;
delete process.env.APP_BASE_URL;

// ─── Fake Google token endpoint; the auth `code` picks the account ──────────
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const GOOGLE_ACCOUNTS: Record<string, Record<string, unknown>> = {
  alice: { sub: "g-alice", email: "alice@example.com", email_verified: true, name: "Alice A" },
  bob: { sub: "g-bob", email: "bob@example.com", email_verified: true, name: "Bob B" },
  owner: { sub: "g-owner", email: "Owner@Example.com", email_verified: true, name: "Owner" },
  unverified: { sub: "g-unv", email: "unv@example.com", email_verified: false },
};
// Fake OpenAI chat completions for label scanning. A marker in the first
// image's data picks the outcome.
function fakeOpenAI(init?: RequestInit): Response {
  const req = JSON.parse(String(init?.body));
  const image: string = req.messages[1].content[1].image_url.url;
  if (image.includes("FAIL")) return Response.json({ error: { message: "bad request" } }, { status: 400 });
  const content = image.includes("NOTALABEL")
    ? { isSupplementLabel: false }
    : {
        isSupplementLabel: true, supplementName: "Magnesium Glycinate", brand: "Acme", dosageAmount: 200,
        dosageUnit: "mg", servingSize: "2 capsules", ingredients: ["Magnesium (as glycinate)"], confidence: 91,
        suggestions: ["Take with food, as the label directs"],
      };
  return Response.json({
    id: "chatcmpl-test", object: "chat.completion", created: 0, model: req.model,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }],
  });
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === "https://api.openai.com/v1/chat/completions") return fakeOpenAI(init);
  if (url !== "https://oauth2.googleapis.com/token") return realFetch(input, init);
  const body = new URLSearchParams(String(init?.body));
  const code = body.get("code") ?? "";
  if (body.get("client_secret") !== "test-secret") return Response.json({ error: "invalid_client" }, { status: 401 });
  const account = GOOGLE_ACCOUNTS[code === "wrongaud" || code === "expired" ? "alice" : code];
  if (!account) return Response.json({ error: "invalid_grant" }, { status: 400 });
  const claims = {
    iss: "https://accounts.google.com",
    aud: code === "wrongaud" ? "someone-else" : "test-client",
    exp: Math.floor(Date.now() / 1000) + (code === "expired" ? -60 : 3600),
    ...account,
  };
  return Response.json({ access_token: "x", id_token: `${b64({ alg: "RS256" })}.${b64(claims)}.sig` });
}) as typeof fetch;

// ─── Helpers ─────────────────────────────────────────────────────────────────
let server: Server;
let base = "";
let closePool: () => Promise<void>;

interface ApiResult { status: number; body: any; location: string | null; cookie: string | null }
type Api = (method: string, path: string, body?: unknown) => Promise<ApiResult>;

function sessionCookie(res: Response): string | null {
  const c = res.headers.getSetCookie().find(x => x.startsWith("lt.sid="));
  return c ? c.split(";")[0] : null;
}

function client(cookie: string | null, extraHeaders: Record<string, string> = {}): Api {
  return async (method, path, body) => {
    const res = await realFetch(base + path, {
      method,
      redirect: "manual",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed: unknown = null;
    try { parsed = await res.json(); } catch { /* empty or non-JSON body */ }
    return { status: res.status, body: parsed, location: res.headers.get("location"), cookie: sessionCookie(res) };
  };
}

async function googleSignIn(code: string, opts: { tamperState?: boolean } = {}) {
  const start = await realFetch(`${base}/api/auth/google`, { redirect: "manual" });
  const preCookie = sessionCookie(start);
  const consentUrl = new URL(start.headers.get("location")!);
  let state = consentUrl.searchParams.get("state")!;
  if (opts.tamperState) state = `x${state.slice(1)}`;
  const cb = await realFetch(`${base}/api/auth/google/callback?code=${code}&state=${state}`, {
    redirect: "manual",
    headers: preCookie ? { Cookie: preCookie } : {},
  });
  return { start, consentUrl, preCookie, status: cb.status, location: cb.headers.get("location"), cookie: sessionCookie(cb) };
}

async function signInAs(code: string, extraHeaders: Record<string, string> = {}): Promise<Api> {
  const result = await googleSignIn(code);
  assert.equal(result.location, "/", `sign-in as ${code} failed: ${result.location}`);
  return client(result.cookie, extraHeaders);
}

const today = new Date().toISOString().split("T")[0];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().split("T")[0];

before(async () => {
  const { pool } = await import("../../server/db");
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  if (rows.length) {
    await pool.query(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  closePool = () => pool.end();

  const { createApp } = await import("../../server/app");
  ({ server } = await createApp());
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise(resolve => server?.close(resolve));
  await closePool?.();
});

// ─── Signed out ──────────────────────────────────────────────────────────────
const anon = () => client(null);

test("auth config reports Google and demo available", async () => {
  const r = await anon()("GET", "/api/auth/config");
  assert.deepEqual(r.body, { google: true, demo: true });
});

test("signed-out requests to private APIs get 401", async () => {
  for (const path of ["/api/user", "/api/glp1-logs", "/api/analytics/dashboard", "/api/protocols", "/api/peptide-calcs"]) {
    assert.equal((await anon()("GET", path)).status, 401, path);
  }
  const write = await anon()("POST", "/api/glp1-logs", { date: today, time: "09:00", drugName: "Zepbound", doseAmount: 5, doseUnit: "mg" });
  assert.equal(write.status, 401);
});

test("drug list stays public; debug endpoint is gone", async () => {
  assert.equal((await anon()("GET", "/api/drugs")).status, 200);
  assert.equal((await anon()("GET", "/api/debug/db-test")).status, 401);
});

// ─── Pre-existing single-user data ───────────────────────────────────────────
test("demo sign-in seeds the demo account as user #1 on a fresh database", async () => {
  const res = await realFetch(`${base}/api/auth/demo`, { method: "POST" });
  assert.equal(res.status, 200);
  const me = await client(sessionCookie(res))("GET", "/api/user");
  assert.equal(me.body.id, 1);
});

// ─── Google sign-in ──────────────────────────────────────────────────────────
let alice: Api, bob: Api;
let aliceId: number, bobId: number;

test("Google sign-in redirects to Google with the right parameters", async () => {
  const g = await googleSignIn("alice");
  assert.equal(g.start.status, 302);
  assert.equal(g.consentUrl.host, "accounts.google.com");
  assert.equal(g.consentUrl.searchParams.get("scope"), "openid email profile");
  assert.equal(g.consentUrl.searchParams.get("client_id"), "test-client");
  assert.equal(g.consentUrl.searchParams.get("redirect_uri"), `${base}/api/auth/google/callback`);
  assert.equal(g.status, 302);
  assert.equal(g.location, "/");
  assert.ok(g.cookie, "session cookie set");
  assert.notEqual(g.cookie, g.preCookie, "session id rotated on sign-in");
  alice = client(g.cookie);
});

test("Google sign-in creates a new account for a new user", async () => {
  const me = await alice("GET", "/api/user");
  assert.equal(me.body.email, "alice@example.com");
  assert.equal(me.body.name, "Alice A");
  assert.equal(me.body.googleId, "g-alice");
  assert.equal(me.body.hasCompletedOnboarding, false);
  assert.ok(me.body.id > 1, "new id doesn't collide with user #1");
  aliceId = me.body.id;
});

test("signing in again reuses the same account", async () => {
  const again = await signInAs("alice");
  assert.equal((await again("GET", "/api/user")).body.id, aliceId);
});

test("Google sign-in rejects bad callbacks", async () => {
  assert.equal((await googleSignIn("alice", { tamperState: true })).location, "/?auth_error=google_state_invalid");
  assert.equal((await googleSignIn("unverified")).location, "/?auth_error=google_failed");
  assert.equal((await googleSignIn("wrongaud")).location, "/?auth_error=google_failed");
  assert.equal((await googleSignIn("expired")).location, "/?auth_error=google_failed");
  assert.equal((await googleSignIn("nobody")).location, "/?auth_error=google_failed");
  const noFlow = await anon()("GET", "/api/auth/google/callback?code=alice&state=abc");
  assert.equal(noFlow.location, "/?auth_error=google_state_invalid");
  const denied = await anon()("GET", "/api/auth/google/callback?error=access_denied");
  assert.equal(denied.location, "/?auth_error=google_denied");
});

test("a second Google user gets a separate account", async () => {
  bob = await signInAs("bob");
  bobId = (await bob("GET", "/api/user")).body.id;
  assert.ok(bobId && bobId !== aliceId);
});

// ─── Shots, adherence and validation ─────────────────────────────────────────
const shotIds: number[] = [];

test("onboarding settings save", async () => {
  const r = await alice("PATCH", "/api/user/settings", {
    glp1Drug: "Zepbound", glp1Dose: 5, glp1DoseUnit: "mg", glp1InjectionFrequency: "weekly",
    glp1InjectionDay: "Mon", goalWeight: 180, heightCm: 178, hasCompletedOnboarding: true,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.hasCompletedOnboarding, true);
  assert.equal((await alice("PATCH", "/api/user/settings", { glp1Dose: -5 })).status, 400);
});

test("adherence: perfect weekly injector scores 100%; daily peptides don't count", async () => {
  for (const n of [28, 21, 14, 7, 0]) {
    const r = await alice("POST", "/api/glp1-logs", { date: daysAgo(n), time: "09:00", drugName: "Zepbound", doseAmount: 5, doseUnit: "mg", painScore: 2 });
    assert.equal(r.status, 200);
    shotIds.push(r.body.id);
  }
  for (let n = 0; n < 10; n++) {
    await alice("POST", "/api/glp1-logs", { date: daysAgo(n), time: "08:00", drugName: "BPC-157", doseAmount: 250, doseUnit: "mcg" });
  }
  const dash = await alice("GET", "/api/analytics/dashboard");
  assert.equal(dash.body.glp1Adherence, 100);
  assert.equal(dash.body.todayShotLogged, true);
});

test("adherence: one missed weekly shot scores 75%", async () => {
  assert.equal((await alice("DELETE", `/api/glp1-logs/${shotIds[1]}`)).status, 200);
  assert.equal((await alice("GET", "/api/analytics/dashboard")).body.glp1Adherence, 75);
});

test("shot logging rejects invalid input", async () => {
  const shot = { date: today, time: "09:00", drugName: "Zepbound", doseAmount: 2.5, doseUnit: "mg" };
  for (const bad of [
    { doseAmount: -3 },
    { doseAmount: 0 },
    { painScore: 11 },
    { date: "10/01/2026" },
    { time: "9am" },
    { doseAmount: undefined },
  ]) {
    const r = await alice("POST", "/api/glp1-logs", { ...shot, ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});

test("weight entries feed total weight lost", async () => {
  for (const [n, weight] of [[28, 230], [14, 224], [0, 218.4]] as const) {
    assert.equal((await alice("POST", "/api/progress-photos", { date: daysAgo(n), weight })).status, 200);
  }
  assert.equal((await alice("POST", "/api/progress-photos", { date: today, weight: -1 })).status, 400);
  assert.equal((await alice("GET", "/api/analytics/dashboard")).body.totalWeightLost, 11.6);
});

// ─── Journal ─────────────────────────────────────────────────────────────────
let journalId: number;

test("journal accepts 1-5 scores, one entry per day", async () => {
  assert.equal((await alice("POST", "/api/side-effect-logs", { date: today, nausea: 42 })).status, 400);
  const r = await alice("POST", "/api/side-effect-logs", { date: today, nausea: 3, gi: 2, fatigue: 2, mood: 4, cravings: 1, sleep: 4, energy: 3, freeText: "ok" });
  assert.equal(r.status, 200);
  journalId = r.body.id;
  assert.equal((await alice("POST", "/api/side-effect-logs", { date: today, nausea: 1 })).status, 409);
});

test("journal updates are validated", async () => {
  assert.equal((await alice("PATCH", `/api/side-effect-logs/${journalId}`, { nausea: 0 })).status, 400);
  const r = await alice("PATCH", `/api/side-effect-logs/${journalId}`, { nausea: 1, freeText: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.nausea, 1);
});

// ─── Protocols ───────────────────────────────────────────────────────────────
let protocolId: number, itemId: number, taskId: number;

test("protocol items accept decimal doses", async () => {
  protocolId = (await alice("POST", "/api/protocols", { name: "Morning stack", category: "supplements" })).body.id;
  const r = await alice("POST", `/api/protocols/${protocolId}/items`, { name: "Creatine", dosageAmount: 2.5, dosageUnit: "g" });
  assert.equal(r.status, 200);
  assert.equal(r.body.dosageAmount, 2.5);
  itemId = r.body.id;
});

test("protocol compliance endpoint works", async () => {
  await alice("POST", "/api/tasks/generate", { date: today });
  taskId = (await alice("GET", `/api/tasks?date=${today}`)).body[0].id;
  assert.equal((await alice("PATCH", `/api/tasks/${taskId}`, { completed: true })).body.completed, true);
  const r = await alice("GET", "/api/protocols/compliance?days=30");
  assert.equal(r.status, 200);
  assert.equal(r.body[protocolId], 100);
});

test("PATCH routes ignore fields they don't own", async () => {
  const me = await alice("PATCH", "/api/user", { streak: 9999, email: "attacker@x.com", name: "Alice Renamed" });
  assert.equal(me.status, 200);
  assert.notEqual(me.body.streak, 9999);
  assert.equal(me.body.email, "alice@example.com");
  assert.equal(me.body.name, "Alice Renamed");
  const p = await alice("PATCH", `/api/protocols/${protocolId}`, { userId: bobId, name: "Renamed" });
  assert.equal(p.body.userId, aliceId);
  assert.equal(p.body.name, "Renamed");
});

test("missing or malformed ids return 404 / 400", async () => {
  assert.equal((await alice("DELETE", "/api/glp1-logs/999999")).status, 404);
  assert.equal((await alice("DELETE", "/api/glp1-logs/abc")).status, 400);
  assert.equal((await alice("GET", "/api/protocols/999999")).status, 404);
});

// ─── Isolation between users ─────────────────────────────────────────────────
test("users can't see or change each other's data", async () => {
  assert.deepEqual((await bob("GET", "/api/glp1-logs")).body, []);
  const notFound: Array<[string, string, unknown?]> = [
    ["GET", `/api/glp1-logs/${shotIds[0]}`],
    ["DELETE", `/api/glp1-logs/${shotIds[0]}`],
    ["PATCH", `/api/side-effect-logs/${journalId}`, { nausea: 5 }],
    ["GET", `/api/protocols/${protocolId}`],
    ["PATCH", `/api/protocols/${protocolId}`, { name: "pwned" }],
    ["GET", `/api/protocols/${protocolId}/items`],
    ["POST", `/api/protocols/${protocolId}/items`, { name: "x" }],
    ["PATCH", `/api/protocol-items/${itemId}`, { name: "pwned" }],
    ["DELETE", `/api/protocol-items/${itemId}`],
    ["DELETE", `/api/protocols/${protocolId}/items`],
    ["DELETE", `/api/protocols/${protocolId}`],
    ["PATCH", `/api/tasks/${taskId}`, { completed: false }],
  ];
  for (const [method, path, body] of notFound) {
    assert.equal((await bob(method, path, body)).status, 404, `${method} ${path}`);
  }
  assert.equal((await alice("GET", `/api/glp1-logs/${shotIds[0]}`)).status, 200, "alice's shot survived");
  assert.equal((await alice("GET", `/api/protocols/${protocolId}/items`)).body.length, 1, "alice's item survived");
});

test("peptide calculations are private", async () => {
  const calc = await alice("POST", "/api/peptide-calcs", { name: "Blend", peptides: [{ name: "BPC-157", amountMg: 5, desiredDoseMcg: 250 }], bacWaterMl: 2 });
  assert.equal(calc.status, 200);
  assert.equal((await bob("POST", `/api/peptide-calcs/${calc.body.id}/logs`)).status, 404);
  assert.equal((await bob("DELETE", `/api/peptide-calcs/${calc.body.id}`)).status, 404);
  assert.deepEqual((await bob("GET", "/api/peptide-calcs")).body, []);
  assert.equal((await alice("POST", `/api/peptide-calcs/${calc.body.id}/logs`)).status, 200);
});

test("a new user's dashboard is empty", async () => {
  const dash = (await bob("GET", "/api/analytics/dashboard")).body;
  assert.equal(dash.latestShot, null);
  assert.equal(dash.glp1Adherence, 0);
  assert.equal(dash.latestWeight, null);
});

// ─── Time zones ──────────────────────────────────────────────────────────────
test("'today' follows the browser's time zone, not UTC", async () => {
  // UTC+14 and UTC-11: at any moment at least one is on a different date than UTC.
  const utcToday = new Date().toISOString().slice(0, 10);
  const localToday = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const tz = ["Pacific/Kiritimati", "Pacific/Pago_Pago"].find(z => localToday(z) !== utcToday)!;
  const local = await signInAs("bob", { "X-Timezone": tz });
  const r = await local("POST", "/api/glp1-logs", { date: localToday(tz), time: "21:00", drugName: "Zepbound", doseAmount: 5, doseUnit: "mg" });
  assert.equal(r.status, 200);
  assert.equal((await local("GET", "/api/analytics/dashboard")).body.todayShotLogged, true, `in ${tz}`);
  assert.equal((await bob("GET", "/api/analytics/dashboard")).body.todayShotLogged, false, "UTC client sees a different day");
  assert.equal((await client(null, { "X-Timezone": "Not/AZone" })("GET", "/api/drugs")).status, 200, "bad zone header is ignored");
  await local("DELETE", `/api/glp1-logs/${r.body.id}`);
});

test("the user's time zone is saved for reminders and validated", async () => {
  const ok = await bob("PATCH", "/api/user/settings", { timezone: "America/New_York" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.timezone, "America/New_York");
  assert.equal((await bob("PATCH", "/api/user/settings", { timezone: "Mars/Olympus_Mons" })).status, 400);
});

// ─── Uploads and label scanning ──────────────────────────────────────────────
const jpeg = (marker = "", kb = 50) => `data:image/jpeg;base64,${marker}${"A".repeat(kb * 1024)}`;

test("progress photos larger than 100 KB upload", async () => {
  const r = await alice("POST", "/api/progress-photos", { date: today, weight: 218, photoUrl: jpeg("", 400) });
  assert.equal(r.status, 200);
});

test("label scanning reports when OpenAI isn't configured", async () => {
  const r = await alice("POST", "/api/scan-label", { images: [jpeg()] });
  assert.equal(r.status, 503);
});

test("label scanning reads a label", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const r = await alice("POST", "/api/scan-label", { images: [jpeg(), jpeg()] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.supplementName, "Magnesium Glycinate");
    assert.equal(r.body.dosageAmount, "200");
    assert.equal(r.body.dosageUnit, "mg");
    assert.equal(r.body.confidence, 91);
    assert.equal("isSupplementLabel" in r.body, false);
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test("label scanning rejects bad input and unreadable photos", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  try {
    assert.equal((await alice("POST", "/api/scan-label", { images: [] })).status, 400);
    assert.equal((await alice("POST", "/api/scan-label", { images: [jpeg(), jpeg(), jpeg(), jpeg()] })).status, 400);
    assert.equal((await alice("POST", "/api/scan-label", { images: ["https://example.com/a.jpg"] })).status, 400);
    assert.equal((await alice("POST", "/api/scan-label", { images: [jpeg("NOTALABEL")] })).status, 422);
    assert.equal((await alice("POST", "/api/scan-label", { images: [jpeg("FAIL")] })).status, 502);
    assert.equal((await anon()("POST", "/api/scan-label", { images: [jpeg()] })).status, 401);
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

// ─── Legacy hand-over and demo ───────────────────────────────────────────────
test("LEGACY_USER_EMAIL hands user #1's data to its owner", async () => {
  const owner = await signInAs("owner");
  const me = (await owner("GET", "/api/user")).body;
  assert.equal(me.id, 1);
  assert.equal(me.googleId, "g-owner");
  assert.equal(me.email, "owner@example.com");
});

test("demo sign-in never opens a Google-linked account", async () => {
  const res = await realFetch(`${base}/api/auth/demo`, { method: "POST" });
  assert.equal(res.status, 200);
  const me = (await client(sessionCookie(res))("GET", "/api/user")).body;
  assert.notEqual(me.id, 1);
  assert.equal(me.googleId, null);
  assert.equal(me.email, "alex@example.com");
});

// ─── Sign out ────────────────────────────────────────────────────────────────
test("sign out ends only that session", async () => {
  assert.equal((await alice("POST", "/api/auth/logout")).status, 200);
  assert.equal((await alice("GET", "/api/user")).status, 401);
  assert.equal((await bob("GET", "/api/user")).status, 200);
});
