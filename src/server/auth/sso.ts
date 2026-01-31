import { z } from "zod";

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional().nullable(),
});

const responseSchema = z.union([
  z.object({ ok: z.literal(true), claims: claimsSchema }),
  z.object({ claims: claimsSchema }),
  z.object({ ok: z.literal(true), data: z.object({ claims: claimsSchema }) }),
]);

export type SsoClaims = z.infer<typeof claimsSchema>;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

function extractClaims(data: z.infer<typeof responseSchema>): SsoClaims {
  if ("claims" in data) return data.claims;
  return data.data.claims;
}

export async function exchangeCode(code: string): Promise<SsoClaims> {
  const baseUrl = requireEnv("MAIN_APP_BASE_URL");
  const path = requireEnv("SSO_EXCHANGE_PATH");
  const secret = requireEnv("SSO_SHARED_SECRET");

  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SSO-CLIENT": "tasks",
      "X-SSO-SECRET": secret,
    },
    body: JSON.stringify({ code, audience: "tasks" }),
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    throw new Error("SSO code exchange failed");
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("SSO response validation failed");
  }

  return extractClaims(parsed.data);
}
