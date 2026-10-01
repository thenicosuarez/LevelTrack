import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGoogleIdToken } from "./google-token";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.signature`;
const valid = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: Math.floor(Date.now() / 1000) + 3600,
  sub: "1234567890",
  email: "Person@Example.com",
  email_verified: true,
  name: "Person",
  picture: "https://example.com/p.png",
};

test("accepts a valid token and lower-cases the email", () => {
  assert.deepEqual(parseGoogleIdToken(token(valid), CLIENT_ID), {
    sub: "1234567890",
    email: "person@example.com",
    name: "Person",
    picture: "https://example.com/p.png",
  });
});

test("accepts the bare accounts.google.com issuer", () => {
  assert.ok(parseGoogleIdToken(token({ ...valid, iss: "accounts.google.com" }), CLIENT_ID));
});

test("rejects a token issued for another app", () => {
  assert.equal(parseGoogleIdToken(token({ ...valid, aud: "someone-else" }), CLIENT_ID), null);
});

test("rejects a token from another issuer", () => {
  assert.equal(parseGoogleIdToken(token({ ...valid, iss: "https://evil.example" }), CLIENT_ID), null);
});

test("rejects an expired token", () => {
  assert.equal(parseGoogleIdToken(token({ ...valid, exp: Math.floor(Date.now() / 1000) - 1 }), CLIENT_ID), null);
});

test("rejects an unverified or missing email", () => {
  assert.equal(parseGoogleIdToken(token({ ...valid, email_verified: false }), CLIENT_ID), null);
  assert.equal(parseGoogleIdToken(token({ ...valid, email_verified: "true" }), CLIENT_ID), null);
  const { email: _email, ...noEmail } = valid;
  assert.equal(parseGoogleIdToken(token(noEmail), CLIENT_ID), null);
});

test("rejects a missing subject", () => {
  const { sub: _sub, ...noSub } = valid;
  assert.equal(parseGoogleIdToken(token(noSub), CLIENT_ID), null);
});

test("rejects malformed tokens", () => {
  assert.equal(parseGoogleIdToken("not-a-jwt", CLIENT_ID), null);
  assert.equal(parseGoogleIdToken("a.%%%.c", CLIENT_ID), null);
  assert.equal(parseGoogleIdToken("", CLIENT_ID), null);
});
