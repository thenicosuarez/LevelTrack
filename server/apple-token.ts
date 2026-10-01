import { createHash, createPublicKey, verify, type KeyObject } from "crypto";

// Verifies "Sign in with Apple" identity tokens. Unlike Google's id_token
// (fetched server-to-server), Apple's token reaches us through the browser or
// the phone, so its RS256 signature is checked against Apple's published keys.

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const KEYS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MIN_REFETCH_MS = 60 * 1000; // don't hammer Apple when an unknown kid shows up

export interface AppleProfile {
  sub: string;
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

let keys = new Map<string, KeyObject>();
let fetchedAt = 0;

export function resetAppleKeyCache(): void {
  keys = new Map();
  fetchedAt = 0;
}

async function refreshKeys(): Promise<void> {
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error(`Apple keys request failed: ${res.status}`);
  const body = (await res.json()) as { keys?: Array<Record<string, string>> };
  const next = new Map<string, KeyObject>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty === "RSA" && jwk.kid) next.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
  }
  keys = next;
  fetchedAt = Date.now();
}

async function getKey(kid: string): Promise<KeyObject | undefined> {
  const age = Date.now() - fetchedAt;
  if (age > KEYS_MAX_AGE_MS || (!keys.has(kid) && age > MIN_REFETCH_MS)) {
    await refreshKeys();
  }
  return keys.get(kid);
}

function decodePart(part: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Returns the profile when the token is genuine, unexpired, issued by Apple
// for one of `audiences`, and carries `expectedNonce`; otherwise null.
export async function verifyAppleIdToken(
  token: string,
  opts: { audiences: string[]; expectedNonce: string },
): Promise<AppleProfile | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodePart(headerPart);
  const claims = decodePart(payloadPart);
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const key = await getKey(header.kid);
  if (!key) return null;
  const signatureOk = verify(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    key,
    Buffer.from(signaturePart, "base64url"),
  );
  if (!signatureOk) return null;

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== APPLE_ISSUER) return null;
  if (typeof claims.aud !== "string" || !opts.audiences.includes(claims.aud)) return null;
  if (typeof claims.exp !== "number" || claims.exp <= now) return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  if (!opts.expectedNonce || claims.nonce !== opts.expectedNonce) return null;

  // Apple sends these booleans as either true or "true".
  const flag = (v: unknown) => v === true || v === "true";
  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email.toLowerCase() : undefined,
    emailVerified: flag(claims.email_verified),
    isPrivateEmail: flag(claims.is_private_email),
  };
}
