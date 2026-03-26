import { storage } from "./storage";
import type { Integration } from "@shared/schema";

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

  const { access_token, refresh_token } = data.body;
  await storage.updateIntegration(integration.id, {
    accessToken: access_token,
    refreshToken: refresh_token,
    lastSync: new Date(),
  });
  return access_token;
}

export async function syncWithingsWeights(userId: number): Promise<{ synced: number; error?: string }> {
  const integration = await storage.getIntegrationByPlatform(userId, "withings");
  if (!integration || !integration.isActive) return { synced: 0, error: "Not connected" };

  let token = integration.accessToken;
  if (!token) {
    token = await refreshWithingsToken(integration);
    if (!token) return { synced: 0, error: "Token refresh failed" };
  }

  // Fetch last 90 days of weight measurements
  const lastupdate = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
  const params = new URLSearchParams({
    action: "getmeas",
    meastype: "1", // body weight
    category: "1", // real measurements
    lastupdate: String(lastupdate),
  });

  const res = await fetch(`${WITHINGS_MEASURE_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    // Try token refresh once
    token = await refreshWithingsToken(integration);
    if (!token) return { synced: 0, error: "Authorization failed" };
    const retry = await fetch(`${WITHINGS_MEASURE_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!retry.ok) return { synced: 0, error: "API request failed" };
    const retryData = await retry.json();
    return await processWithingsData(userId, retryData);
  }

  const data = await res.json();
  return await processWithingsData(userId, data);
}

async function processWithingsData(userId: number, data: { status: number; body?: { measuregrps?: { date: number; measures: { value: number; unit: number; type: number }[] }[] } }): Promise<{ synced: number; error?: string }> {
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

    // Store as health metric
    const existing = await storage.getHealthMetrics(userId, date);
    if (existing.length === 0) {
      await storage.createHealthMetric({
        userId,
        date,
        weight: weightLbs,
        source: "withings",
        sleepHours: null,
        mood: null,
        energy: null,
        stress: null,
        heartRate: null,
        steps: null,
        rawData: null,
      });
      synced++;
    }
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

  await storage.updateIntegration(integration.id, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || integration.refreshToken,
    lastSync: new Date(),
  });
  return data.access_token;
}

export async function syncOuraSleep(userId: number): Promise<{ synced: number; error?: string }> {
  const integration = await storage.getIntegrationByPlatform(userId, "oura");
  if (!integration || !integration.isActive) return { synced: 0, error: "Not connected" };

  let token = integration.accessToken;
  if (!token) {
    token = await refreshOuraToken(integration);
    if (!token) return { synced: 0, error: "Token refresh failed" };
  }

  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  const headers = { Authorization: `Bearer ${token}` };

  const [sleepRes, readinessRes] = await Promise.all([
    fetch(`${OURA_API}/daily_sleep?start_date=${startDate}&end_date=${endDate}`, { headers }),
    fetch(`${OURA_API}/daily_readiness?start_date=${startDate}&end_date=${endDate}`, { headers }),
  ]);

  if (!sleepRes.ok && !readinessRes.ok) {
    token = await refreshOuraToken(integration);
    if (!token) return { synced: 0, error: "Authorization failed" };
    const newHeaders = { Authorization: `Bearer ${token}` };
    const [retrySleep, retryReadiness] = await Promise.all([
      fetch(`${OURA_API}/daily_sleep?start_date=${startDate}&end_date=${endDate}`, { headers: newHeaders }),
      fetch(`${OURA_API}/daily_readiness?start_date=${startDate}&end_date=${endDate}`, { headers: newHeaders }),
    ]);
    return await processOuraData(userId, retrySleep, retryReadiness);
  }

  return await processOuraData(userId, sleepRes, readinessRes);
}

interface OuraSleepEntry { day: string; score: number | null; contributors?: { deep_sleep?: number; rem_sleep?: number; total_sleep?: number } }
interface OuraReadinessEntry { day: string; score: number | null; contributors?: { hrv_balance?: number } }

async function processOuraData(
  userId: number,
  sleepRes: Response,
  readinessRes: Response
): Promise<{ synced: number; error?: string }> {
  let sleepData: { data?: OuraSleepEntry[] } = {};
  let readinessData: { data?: OuraReadinessEntry[] } = {};

  if (sleepRes.ok) sleepData = await sleepRes.json();
  if (readinessRes.ok) readinessData = await readinessRes.json();

  const sleepMap = new Map<string, OuraSleepEntry>();
  for (const s of sleepData.data ?? []) sleepMap.set(s.day, s);

  const readinessMap = new Map<string, OuraReadinessEntry>();
  for (const r of readinessData.data ?? []) readinessMap.set(r.day, r);

  const allDates = new Set([...sleepMap.keys(), ...readinessMap.keys()]);
  let synced = 0;

  for (const date of allDates) {
    const sleep = sleepMap.get(date);
    const readiness = readinessMap.get(date);

    await storage.upsertOuraDailyLog({
      userId,
      date,
      sleepScore: sleep?.score ?? null,
      readinessScore: readiness?.score ?? null,
      hrv: null,
      totalSleep: sleep?.contributors?.total_sleep ? Math.round((sleep.contributors.total_sleep * 28800) / 100) : null,
      deepSleep: sleep?.contributors?.deep_sleep ? Math.round((sleep.contributors.deep_sleep * 28800) / 100) : null,
      remSleep: sleep?.contributors?.rem_sleep ? Math.round((sleep.contributors.rem_sleep * 28800) / 100) : null,
    });
    synced++;
  }

  return { synced };
}
