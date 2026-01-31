import { createHash } from "crypto";
import { z } from "zod";

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional().nullable(),
  iss: z.string().min(1),
  aud: z.string().min(1),
  ver: z.union([z.string(), z.number()]),
});

const responseSchema = z.object({
  ok: z.literal(true),
  claims: claimsSchema,
});

export type SsoClaims = z.infer<typeof claimsSchema>;
export type SsoExchangeErrorKind = "http" | "network" | "invalid_response";

export type SsoExchangeResult = {
  ok: true;
  status: number;
  claims: SsoClaims;
};

export class SsoExchangeError extends Error {
  status?: number;
  kind: SsoExchangeErrorKind;
  responseBodySnippet?: string;

  constructor(
    message: string,
    kind: SsoExchangeErrorKind,
    status?: number,
    responseBodySnippet?: string
  ) {
    super(message);
    this.name = "SsoExchangeError";
    this.kind = kind;
    this.status = status;
    this.responseBodySnippet = responseBodySnippet;
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

function getClientId(): string {
  return process.env.SSO_CLIENT_ID?.trim() || "tasks";
}

function codeHashPrefix(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 12);
}

export async function exchangeCode(code: string): Promise<SsoExchangeResult> {
  const baseUrl = requireEnv("MAIN_APP_BASE_URL");
  const path = requireEnv("SSO_EXCHANGE_PATH");
  const secret = requireEnv("SSO_SHARED_SECRET");
  const clientId = getClientId();
  const audience = "tasks";

  const url = `${baseUrl}${path}`;
  const codeHash = codeHashPrefix(code);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SSO-CLIENT": clientId,
        "X-SSO-SECRET": secret,
      },
      body: JSON.stringify({ code, audience }),
      cache: "no-store",
    });

    const bodyText = await res.text().catch(() => "");
    const bodySnippet = bodyText.slice(0, 2048);
    let parsedJson: unknown = null;
    if (bodyText) {
      try {
        parsedJson = JSON.parse(bodyText) as unknown;
      } catch {
        parsedJson = null;
      }
    }
    const okValue =
      parsedJson &&
      typeof parsedJson === "object" &&
      "ok" in parsedJson &&
      typeof (parsedJson as { ok?: unknown }).ok === "boolean"
        ? (parsedJson as { ok: boolean }).ok
        : undefined;

    console.info("[sso:exchange]", {
      baseUrl,
      path,
      audience,
      clientId,
      status: res.status,
      ok: okValue,
      codeHashPrefix: codeHash,
    });

    if (!res.ok) {
      if (bodySnippet) {
        console.warn("[sso:exchange:non-200]", { status: res.status, bodySnippet });
      }
      throw new SsoExchangeError("SSO code exchange failed", "http", res.status, bodySnippet);
    }

    if (okValue === false) {
      console.warn("[sso:exchange:ok-false]", {
        status: res.status,
        bodySnippet,
      });
      throw new SsoExchangeError(
        "SSO exchange returned ok=false",
        "invalid_response",
        res.status,
        bodySnippet
      );
    }

    const parsed = responseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.warn("[sso:exchange:invalid-response]", {
        status: res.status,
        bodySnippet,
      });
      throw new SsoExchangeError(
        "SSO response validation failed",
        "invalid_response",
        res.status,
        bodySnippet
      );
    }

    return { ok: true, status: res.status, claims: parsed.data.claims };
  } catch (error) {
    if (error instanceof SsoExchangeError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("[sso:exchange:network-error]", {
      baseUrl,
      path,
      audience,
      clientId,
      codeHashPrefix: codeHash,
      message,
    });
    throw new SsoExchangeError("SSO exchange network error", "network");
  }
}
