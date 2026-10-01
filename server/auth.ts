import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { randomBytes } from "crypto";
import { pool } from "./db";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { parseGoogleIdToken, type GoogleProfile } from "./google-token";

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

async function findOrCreateGoogleUser(profile: GoogleProfile): Promise<User> {
  const existing = await storage.getUserByGoogleId(profile.sub);
  if (existing) return existing;

  // One-time hand-over of the pre-auth single-user data (user #1) to its owner.
  const legacyEmail = process.env.LEGACY_USER_EMAIL?.toLowerCase();
  if (legacyEmail && legacyEmail === profile.email) {
    const legacy = await storage.getUser(1);
    if (legacy && !legacy.googleId) {
      return storage.updateUser(1, {
        googleId: profile.sub,
        email: profile.email,
        name: profile.name ?? legacy.name,
        avatar: profile.picture ?? legacy.avatar,
      });
    }
  }

  // Google has verified this address, so link it to an existing account with the same email.
  const byEmail = await storage.getUserByEmail(profile.email);
  if (byEmail && !byEmail.googleId) {
    return storage.updateUser(byEmail.id, { googleId: profile.sub });
  }

  const base = profile.email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").slice(0, 24) || "user";
  return storage.createUser({
    username: `${base}-${randomBytes(3).toString("hex")}`,
    email: profile.email,
    name: profile.name ?? base,
    avatar: profile.picture ?? null,
    googleId: profile.sub,
    streak: 0,
    totalCompliance: 0,
  });
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

  app.get("/api/auth/config", (_req, res) => {
    res.json({ google: googleConfigured, demo: demoEnabled });
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

      const user = await findOrCreateGoogleUser(profile);
      await signIn(req, user.id);
      res.redirect("/");
    } catch (err) {
      console.error("[auth] Google callback failed:", err);
      res.redirect("/?auth_error=google_failed");
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
