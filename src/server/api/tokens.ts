import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_MARKER = "pls_pat";
const TOKEN_ID_BYTES = 8;
const TOKEN_SECRET_BYTES = 32;

export type GeneratedApiToken = {
  plainToken: string;
  tokenPrefix: string;
  tokenHash: string;
};

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiToken(): GeneratedApiToken {
  const tokenId = randomBytes(TOKEN_ID_BYTES).toString("hex");
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString("base64url");
  const tokenPrefix = `${TOKEN_MARKER}_${tokenId}`;
  const plainToken = `${tokenPrefix}_${secret}`;

  return {
    plainToken,
    tokenPrefix,
    tokenHash: hashApiToken(plainToken),
  };
}

export function getApiTokenPrefix(token: string): string | null {
  const match = /^(pls_pat_[a-f0-9]{16})_[A-Za-z0-9_-]{32,}$/.exec(token);
  return match?.[1] ?? null;
}

export function verifyApiToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}
