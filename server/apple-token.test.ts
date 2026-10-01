import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "crypto";
import { verifyAppleIdToken, resetAppleKeyCache, sha256Hex } from "./apple-token";

const AUD = "com.leveltrack.web";
const NONCE = "nonce-123";
const appleKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

let keyRequests = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  if (String(input) !== "https://appleid.apple.com/auth/keys") return realFetch(input, init);
  keyRequests++;
  return Response.json({ keys: [{ ...appleKey.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" }] });
}) as typeof fetch;
after(() => { globalThis.fetch = realFetch; });

beforeEach(() => {
  resetAppleKeyCache();
  keyRequests = 0;
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function makeToken(claims: Record<string, unknown>, opts: { kid?: string; key?: typeof appleKey.privateKey; alg?: string } = {}) {
  const head = b64({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1" });
  const body = b64(claims);
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), opts.key ?? appleKey.privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const valid = {
  iss: "https://appleid.apple.com",
  aud: AUD,
  exp: Math.floor(Date.now() / 1000) + 600,
  iat: Math.floor(Date.now() / 1000),
  sub: "001234.abc",
  email: "Abc@PrivateRelay.AppleID.com",
  email_verified: "true",
  is_private_email: "true",
  nonce: NONCE,
};
const verifyToken = (token: string, nonce = NONCE) => verifyAppleIdToken(token, { audiences: [AUD], expectedNonce: nonce });

test("accepts a genuine token and normalises flags and email", async () => {
  assert.deepEqual(await verifyToken(makeToken(valid)), {
    sub: "001234.abc",
    email: "abc@privaterelay.appleid.com",
    emailVerified: true,
    isPrivateEmail: true,
  });
});

test("rejects a token signed by someone else", async () => {
  assert.equal(await verifyToken(makeToken(valid, { key: otherKey.privateKey })), null);
});

test("rejects a token whose claims were edited after signing", async () => {
  const [h, , s] = makeToken(valid).split(".");
  assert.equal(await verifyToken(`${h}.${b64({ ...valid, sub: "attacker" })}.${s}`), null);
});

test("rejects wrong audience, issuer, expiry, nonce or missing subject", async () => {
  assert.equal(await verifyToken(makeToken({ ...valid, aud: "other.app" })), null);
  assert.equal(await verifyToken(makeToken({ ...valid, iss: "https://evil.example" })), null);
  assert.equal(await verifyToken(makeToken({ ...valid, exp: Math.floor(Date.now() / 1000) - 1 })), null);
  assert.equal(await verifyToken(makeToken(valid), "different-nonce"), null);
  assert.equal(await verifyToken(makeToken({ ...valid, nonce: undefined }), ""), null);
  const { sub: _sub, ...noSub } = valid;
  assert.equal(await verifyToken(makeToken(noSub)), null);
});

test("rejects non-RS256 tokens, unknown key ids and garbage", async () => {
  assert.equal(await verifyToken(makeToken(valid, { alg: "none" })), null);
  assert.equal(await verifyToken(makeToken(valid, { kid: "unknown" })), null);
  assert.equal(await verifyToken("a.b"), null);
  assert.equal(await verifyToken("%%%.%%%.%%%"), null);
});

test("Apple's keys are cached between sign-ins", async () => {
  await verifyToken(makeToken(valid));
  await verifyToken(makeToken(valid));
  await verifyToken(makeToken(valid, { kid: "unknown" })); // within a minute: no refetch
  assert.equal(keyRequests, 1);
});

test("native nonce convention: token carries sha256(raw nonce)", async () => {
  const raw = "raw-nonce-from-phone";
  assert.ok(await verifyToken(makeToken({ ...valid, nonce: sha256Hex(raw) }), sha256Hex(raw)));
});
