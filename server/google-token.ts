export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

// The id_token arrives directly from Google's token endpoint over TLS in
// exchange for our client secret, so per OpenID Connect Core §3.1.3.7 its
// claims can be trusted without a separate signature check. We still verify
// issuer, audience, expiry and that the email is verified.
export function parseGoogleIdToken(idToken: string, clientId: string): GoogleProfile | null {
  const payloadPart = idToken.split(".")[1];
  if (!payloadPart) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  const audOk = claims.aud === clientId;
  const expOk = typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
  const emailOk = typeof claims.email === "string" && claims.email_verified === true;
  if (!issOk || !audOk || !expOk || !emailOk || typeof claims.sub !== "string") return null;
  return {
    sub: claims.sub,
    email: (claims.email as string).toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}
