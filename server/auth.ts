import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { randomBytes } from "crypto";
import { pool } from "./db";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { parseGoogleIdToken } from "./google-token";
import { verifyAppleIdToken, sha256Hex } from "./apple-token";

declare module "express-session" {
  interface SessionData {
    userId: number;
    googleState: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth for every non-public /api route.
      userId: number;
    }
  }
}

const isProduction = process.env.NODE_ENV === "production";

export const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Sign in with Apple. Web uses a Services ID (e.g. com.leveltrack.web); the
// native iOS app's tokens are issued for its bundle id (com.leveltrack.app).
const appleServicesId = process.env.APPLE_SERVICES_ID;
const appleBundleId = process.env.APPLE_BUNDLE_ID;
export const appleWebConfigured = !!appleServicesId;
const APPLE_COOKIE = "lt.apple";

// Demo sign-in logs straight into a shared demo account. On by
// default in development so the app works without Google credentials; off in
// production unless DEMO_MODE=true is set explicitly.
export const demoEnabled = process.env.DEMO_MODE
  ? process.env.DEMO_MODE === "true"
  : !isProduction;

// API routes reachable without signing in.
const PUBLIC_API_PATHS = new Set([
  "/api/drugs",
  "/api/push/vapid-public-key",
]);

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function signIn(req: Request, userId: number): Promise<void> {
  // Regenerate the session on sign-in so a pre-login session id can't be reused.
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save(saveErr => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

interface SignInProfile {
  provider: "google" | "apple";
  sub: string;      // the provider's stable user id
  email: string;    // verified by the provider
  name?: string;
  picture?: string;
}

async function findOrCreateUser(profile: SignInProfile): Promise<User> {
  const idField = profile.provider === "google" ? "googleId" : "appleId";
  const existing = profile.provider === "google"
    ? await storage.getUserByGoogleId(profile.sub)
    : await storage.getUserByAppleId(profile.sub);
  if (existing) return existing;

  // One-time hand-over of the pre-auth single-user data (user #1) to its owner.
  const legacyEmail = process.env.LEGACY_USER_EMAIL?.toLowerCase();
  if (legacyEmail && legacyEmail === profile.email) {
    const legacy = await storage.getUser(1);
    if (legacy && !legacy.googleId && !legacy.appleId) {
      return storage.updateUser(1, {
        [idField]: profile.sub,
        email: profile.email,
        name: profile.name ?? legacy.name,
        avatar: profile.picture ?? legacy.avatar,
      });
    }
  }

  // The provider has verified this address, so link it to an existing account
  // with the same email (e.g. someone who first signed in with the other provider).
  const byEmail = await storage.getUserByEmail(profile.email);
  if (byEmail && !byEmail[idField]) {
    return storage.updateUser(byEmail.id, { [idField]: profile.sub });
  }

  const base = profile.email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").slice(0, 24) || "user";
  return storage.createUser({
    username: `${base}-${randomBytes(3).toString("hex")}`,
    email: profile.email,
    name: profile.name ?? base,
    avatar: profile.picture ?? null,
    [idField]: profile.sub,
    streak: 0,
    totalCompliance: 0,
  });
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// Apple sends the user's name only on their first sign-in, as a JSON string.
function appleDisplayName(userJson: unknown): string | undefined {
  if (typeof userJson !== "string") return undefined;
  try {
    const { name } = JSON.parse(userJson);
    const full = [name?.firstName, name?.lastName].filter(n => typeof n === "string" && n).join(" ");
    return full || undefined;
  } catch {
    return undefined;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_API_PATHS.has(req.originalUrl.split("?")[0])) return next();
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Not signed in" });
  req.userId = userId;
  next();
}

export function setupAuth(app: Express): void {
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (isProduction) {
      throw new Error("SESSION_SECRET must be set in production (any long random string).");
    }
    secret = randomBytes(32).toString("hex");
    console.warn("[auth] SESSION_SECRET not set — using a random dev secret; sessions reset on restart");
  }

  const PgStore = connectPgSimple(session);
  app.use(session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret,
    name: "lt.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax", // must stay lax so the cookie survives OAuth redirects back to us
      secure: isProduction,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }));

  storage.syncUserIdSequence().catch(err => console.error("[auth] user id sequence sync failed:", err));
  if (demoEnabled) {
    console.log("[auth] Demo sign-in enabled");
  }
  if (!googleConfigured) {
    console.warn("[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google sign-in disabled");
  }
  if (!appleServicesId && !appleBundleId) {
    console.warn("[auth] APPLE_SERVICES_ID / APPLE_BUNDLE_ID not set — Sign in with Apple disabled");
  }

  app.get("/api/auth/config", (_req, res) => {
    res.json({ google: googleConfigured, apple: appleWebConfigured, demo: demoEnabled });
  });

  app.get("/api/auth/google", (req, res) => {
    if (!googleConfigured) return res.redirect("/?auth_error=google_not_configured");
    const state = randomBytes(24).toString("hex");
    req.session.googleState = state;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${getAppBaseUrl(req)}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    req.session.save(() => {
      res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const expectedState = req.session.googleState;
    delete req.session.googleState;

    if (error) return res.redirect("/?auth_error=google_denied");
    if (!googleConfigured || typeof code !== "string") return res.redirect("/?auth_error=google_failed");
    if (typeof state !== "string" || !expectedState || state !== expectedState) {
      return res.redirect("/?auth_error=google_state_invalid");
    }

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${getAppBaseUrl(req)}/api/auth/google/callback`,
          grant_type: "authorization_code",
        }).toString(),
      });
      const tokenData = await tokenRes.json();
      const profile = typeof tokenData.id_token === "string"
        ? parseGoogleIdToken(tokenData.id_token, clientId)
        : null;
      if (!profile) return res.redirect("/?auth_error=google_failed");

      const user = await findOrCreateUser({ provider: "google", ...profile });
      await signIn(req, user.id);
      res.redirect("/");
    } catch (err) {
      console.error("[auth] Google callback failed:", err);
      res.redirect("/?auth_error=google_failed");
    }
  });

  // ─── Sign in with Apple (web) ─────────────────────────────────────────────
  // Apple POSTs the result back cross-site (response_mode=form_post), so our
  // SameSite=Lax session cookie isn't sent with it. The state and nonce ride in
  // their own short-lived SameSite=None cookie instead.
  app.get("/api/auth/apple", (req, res) => {
    if (!appleWebConfigured) return res.redirect("/?auth_error=apple_not_configured");
    const state = randomBytes(24).toString("hex");
    const nonce = randomBytes(24).toString("hex");
    res.cookie(APPLE_COOKIE, `${state}.${nonce}`, {
      httpOnly: true, secure: true, sameSite: "none", path: "/api/auth/apple", maxAge: 10 * 60 * 1000,
    });
    const params = new URLSearchParams({
      client_id: appleServicesId!,
      redirect_uri: `${getAppBaseUrl(req)}/api/auth/apple/callback`,
      response_type: "code id_token",
      response_mode: "form_post",
      scope: "name email",
      state,
      nonce,
    });
    res.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
  });

  app.post("/api/auth/apple/callback", async (req, res) => {
    const fail = (code: string) => res.redirect(303, `/?auth_error=${code}`);
    const [expectedState, expectedNonce] = (readCookie(req, APPLE_COOKIE) ?? "").split(".");
    res.clearCookie(APPLE_COOKIE, { path: "/api/auth/apple", secure: true, sameSite: "none" });

    const { state, id_token: idToken, error, user: userJson } = req.body ?? {};
    if (error) return fail(error === "user_cancelled_authorize" ? "apple_denied" : "apple_failed");
    if (!appleWebConfigured || typeof idToken !== "string") return fail("apple_failed");
    if (typeof state !== "string" || !expectedState || state !== expectedState) return fail("apple_state_invalid");

    try {
      const profile = await verifyAppleIdToken(idToken, { audiences: [appleServicesId!], expectedNonce });
      if (!profile) return fail("apple_failed");
      if (!profile.email || !profile.emailVerified) return fail("apple_no_email");
      const user = await findOrCreateUser({
        provider: "apple",
        sub: profile.sub,
        email: profile.email,
        name: appleDisplayName(userJson),
      });
      await signIn(req, user.id);
      res.redirect(303, "/");
    } catch (err) {
      console.error("[auth] Apple callback failed:", err);
      fail("apple_failed");
    }
  });

  // ─── Sign in with Apple (native iOS app) ─────────────────────────────────
  // The app signs in with expo-apple-authentication, passing SHA-256(rawNonce)
  // as the nonce, then posts the identity token and the raw nonce here.
  app.post("/api/auth/apple/native", async (req, res) => {
    if (!appleBundleId) return res.status(503).json({ error: "Sign in with Apple isn't set up on this server." });
    const { identityToken, nonce, fullName } = req.body ?? {};
    if (typeof identityToken !== "string" || typeof nonce !== "string" || nonce.length < 16) {
      return res.status(400).json({ error: "identityToken and nonce are required" });
    }
    try {
      const profile = await verifyAppleIdToken(identityToken, { audiences: [appleBundleId], expectedNonce: sha256Hex(nonce) });
      if (!profile) return res.status(401).json({ error: "Invalid Apple sign-in" });
      if (!profile.email || !profile.emailVerified) {
        return res.status(400).json({ error: "Apple didn't share a verified email address" });
      }
      const name = [fullName?.givenName, fullName?.familyName].filter(n => typeof n === "string" && n).join(" ");
      const user = await findOrCreateUser({ provider: "apple", sub: profile.sub, email: profile.email, name: name || undefined });
      await signIn(req, user.id);
      res.json(user);
    } catch (err) {
      console.error("[auth] Apple native sign-in failed:", err);
      res.status(500).json({ error: "Apple sign-in failed" });
    }
  });

  app.post("/api/auth/demo", async (req, res) => {
    if (!demoEnabled) return res.status(404).json({ error: "Not found" });
    try {
      const demoUser = await storage.ensureDemoUser();
      await signIn(req, demoUser.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Demo sign-in failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("lt.sid");
      res.json({ success: true });
    });
  });

  // Everything else under /api requires a signed-in user.
  app.use("/api", requireAuth);
}
