import { storage } from "./storage";
import type { Integration } from "@shared/schema";

// ─── Shared token helpers ─────────────────────────────────────────────────────

function isTokenExpired(integration: Integration): boolean {
  const settings = integration.settings as { expiresAt?: number } | null;
  if (!settings?.expiresAt) return false;
  return Date.now() >= settings.expiresAt - 60_000; // refresh 1 minute early
}

// ─── Withings ────────────────────────────────────────────────────────────────

const WITHINGS_TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2";
const WITHINGS_MEASURE_URL = "https://wbsapi.withings.net/measure";

async function refreshWithingsToken(integration: Integration): Promise<string | null> {
  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  if (!clientId || !clientSecret || !integration.refreshToken) return null;

  const params = new URLSearchParams({
    action: "requesttoken",
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: integration.refreshToken,
  });

  const res = await fetch(WITHINGS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 0) return null;

  const { access_token, refresh_token, expires_in } = data.body;
  const expiresAt = expires_in ? Date.now() + expires_in * 1000 : undefined;
  await storage.updateIntegration(integration.id, {
    accessToken: access_token,
    refreshToken: refresh_token,
    settings: { ...(integration.settings as object), expiresAt },
  });
  return access_token;
}

async function getWithingsToken(integration: Integration): Promise<string | null> {
  if (!integration.accessToken || isTokenExpired(integration)) {
    return refreshWithingsToken(integration);
  }
  return integration.accessToken;
}

export async function syncWithingsWeights(userId: number): Promise<{ synced: number; error?: string }> {
  const integration = await storage.getIntegrationByPlatform(userId, "withings");
  if (!integration || !integration.isActive) return { synced: 0, error: "Not connected" };

  let token = await getWithingsToken(integration);
  if (!token) return { synced: 0, error: "Token refresh failed" };

  // Incremental sync: use lastSync timestamp, fall back to 90 days on first sync
  const lastSyncMs = integration.lastSync ? new Date(integration.lastSync).getTime() : 0;
  const fallbackMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const lastupdate = Math.floor(Math.max(lastSyncMs, fallbackMs) / 1000);
  const params = new URLSearchParams({
    action: "getmeas",
    meastype: "1", // body weight
    category: "1", // real measurements
    lastupdate: String(lastupdate),
  });

  let res = await fetch(`${WITHINGS_MEASURE_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    token = await refreshWithingsToken(integration);
    if (!token) return { synced: 0, error: "Authorization failed" };
    res = await fetch(`${WITHINGS_MEASURE_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (!res.ok) return { synced: 0, error: "API request failed" };

  const data = await res.json();
  return processWithingsData(userId, data);
}

async function processWithingsData(
  userId: number,
  data: { status: number; body?: { measuregrps?: { date: number; measures: { value: number; unit: number; type: number }[] }[] } }
): Promise<{ synced: number; error?: string }> {
  if (data.status !== 0) return { synced: 0, error: `Withings API error: ${data.status}` };

  const groups = data.body?.measuregrps ?? [];
  let synced = 0;

  for (const grp of groups) {
    const weightMeasure = grp.measures.find(m => m.type === 1);
    if (!weightMeasure) continue;

    // Withings weight is in kg with unit exponent
    const weightKg = weightMeasure.value * Math.pow(10, weightMeasure.unit);
    const weightLbs = weightKg * 2.20462;
    const date = new Date(grp.date * 1000).toISOString().split("T")[0];

    // Deterministic upsert by (userId, date, notes="Synced from Withings")
    await storage.upsertWithingsWeightEntry(userId, date, weightLbs);
    synced++;
  }

  // Update lastSync
  const integration = await storage.getIntegrationByPlatform(userId, "withings");
  if (integration) {
    await storage.updateIntegration(integration.id, { lastSync: new Date() });
  }

  return { synced };
}

// ─── Oura ─────────────────────────────────────────────────────────────────────

const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const OURA_API = "https://api.ouraring.com/v2/usercollection";

async function refreshOuraToken(integration: Integration): Promise<string | null> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret || !integration.refreshToken) return null;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: integration.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;

  const expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;
  await storage.updateIntegration(integration.id, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || integration.refreshToken,
    settings: { ...(integration.settings as object), expiresAt },
  });
  return data.access_token;
}

async function getOuraToken(integration: Integration): Promise<string | null> {
  if (!integration.accessToken || isTokenExpired(integration)) {
    return refreshOuraToken(integration);
  }
  return integration.accessToken;
}

export async function syncOuraSleep(userId: number): Promise<{ synced: number; error?: string }> {
  const integration = await storage.getIntegrationByPlatform(userId, "oura");
  if (!integration || !integration.isActive) return { synced: 0, error: "Not connected" };

  let token = await getOuraToken(integration);
  if (!token) return { synced: 0, error: "Token refresh failed" };

  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  const makeHeaders = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function fetchOura(path: string, tok: string): Promise<Response> {
    let r = await fetch(`${OURA_API}/${path}?start_date=${startDate}&end_date=${endDate}`, { headers: makeHeaders(tok) });
    if (r.status === 401) {
      const refreshed = await refreshOuraToken(integration);
      if (refreshed) {
        tok = refreshed;
        r = await fetch(`${OURA_API}/${path}?start_date=${startDate}&end_date=${endDate}`, { headers: makeHeaders(tok) });
      }
    }
    return r;
  }

  const [sleepRes, readinessRes, sessionRes] = await Promise.all([
    fetchOura("daily_sleep", token),
    fetchOura("daily_readiness", token),
    fetchOura("sleep", token), // individual sessions with average_hrv
  ]);

  return processOuraData(userId, sleepRes, readinessRes, sessionRes);
}

interface OuraDailySleepEntry {
  day: string;
  score: number | null;
  contributors?: { deep_sleep?: number; rem_sleep?: number; total_sleep?: number };
}
interface OuraReadinessEntry {
  day: string;
  score: number | null;
}
interface OuraSleepSession {
  day: string;
  type: string; // "long_sleep" | "short_sleep" | "rest" | "nap"
  average_hrv: number | null;
  total_sleep_duration: number | null; // seconds
  deep_sleep_duration: number | null; // seconds
  rem_sleep_duration: number | null; // seconds
}

async function processOuraData(
  userId: number,
  sleepRes: Response,
  readinessRes: Response,
  sessionRes: Response
): Promise<{ synced: number; error?: string }> {
  let sleepData: { data?: OuraDailySleepEntry[] } = {};
  let readinessData: { data?: OuraReadinessEntry[] } = {};
  let sessionData: { data?: OuraSleepSession[] } = {};

  if (sleepRes.ok) sleepData = await sleepRes.json();
  if (readinessRes.ok) readinessData = await readinessRes.json();
  if (sessionRes.ok) sessionData = await sessionRes.json();

  const sleepMap = new Map<string, OuraDailySleepEntry>();
  for (const s of sleepData.data ?? []) sleepMap.set(s.day, s);

  const readinessMap = new Map<string, OuraReadinessEntry>();
  for (const r of readinessData.data ?? []) readinessMap.set(r.day, r);

  // Aggregate HRV and durations from session data (take main long_sleep session per day)
  const sessionMap = new Map<string, OuraSleepSession>();
  for (const s of sessionData.data ?? []) {
    if (s.type === "long_sleep") {
      // Keep the one with highest total_sleep_duration if multiple
      const existing = sessionMap.get(s.day);
      if (!existing || (s.total_sleep_duration ?? 0) > (existing.total_sleep_duration ?? 0)) {
        sessionMap.set(s.day, s);
      }
    }
  }

  const allDates = new Set([...sleepMap.keys(), ...readinessMap.keys(), ...sessionMap.keys()]);
  let synced = 0;

  for (const date of allDates) {
    const daily = sleepMap.get(date);
    const readiness = readinessMap.get(date);
    const session = sessionMap.get(date);

    await storage.upsertOuraDailyLog({
      userId,
      date,
      sleepScore: daily?.score ?? null,
      readinessScore: readiness?.score ?? null,
      hrv: session?.average_hrv ?? null,
      totalSleep: session?.total_sleep_duration != null ? Math.round(session.total_sleep_duration / 60) : null,
      deepSleep: session?.deep_sleep_duration != null ? Math.round(session.deep_sleep_duration / 60) : null,
      remSleep: session?.rem_sleep_duration != null ? Math.round(session.rem_sleep_duration / 60) : null,
    });
    synced++;
  }

  // Update lastSync
  const integration = await storage.getIntegrationByPlatform(userId, "oura");
  if (integration) {
    await storage.updateIntegration(integration.id, { lastSync: new Date() });
  }

  return { synced };
}

