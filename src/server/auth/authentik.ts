import { randomBytes } from "crypto";
import { z } from "zod";

const openidConfigSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url().optional(),
  issuer: z.string(),
});

const userinfoSchema = z
  .object({
    sub: z.union([z.string(), z.number()]).transform((v) => String(v)),
    email: z
      .union([z.string().email(), z.string().length(0), z.literal(undefined)])
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    name: z.string().optional().nullable(),
    preferred_username: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

export type AuthentikUserinfo = z.infer<typeof userinfoSchema>;

let cachedConfig: z.infer<typeof openidConfigSchema> | null = null;

function getIssuer(): string {
  const issuer = process.env.AUTHENTIK_ISSUER?.trim().replace(/\/$/, "");
  if (!issuer) throw new Error("AUTHENTIK_ISSUER is not set");
  return issuer;
}

function getClientId(): string {
  const id = process.env.AUTHENTIK_CLIENT_ID?.trim();
  if (!id) throw new Error("AUTHENTIK_CLIENT_ID is not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.AUTHENTIK_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("AUTHENTIK_CLIENT_SECRET is not set");
  return secret;
}

export function isAuthentikConfigured(): boolean {
  return !!(
    process.env.AUTHENTIK_ISSUER?.trim() &&
    process.env.AUTHENTIK_CLIENT_ID?.trim() &&
    process.env.AUTHENTIK_CLIENT_SECRET?.trim()
  );
}

export async function getAuthentikOidcConfig(): Promise<z.infer<typeof openidConfigSchema>> {
  if (cachedConfig) return cachedConfig;
  const issuer = getIssuer();
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
  const res = await fetch(discoveryUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Authentik discovery failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as unknown;
  const parsed = openidConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid Authentik OpenID configuration");
  }
  cachedConfig = parsed.data;
  return cachedConfig;
}

export function buildAuthentikAuthorizeUrl(params: {
  redirectUri: string;
  state: string;
  scope?: string;
}): Promise<string> {
  return getAuthentikOidcConfig().then((config) => {
    const url = new URL(config.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", getClientId());
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", params.scope ?? "openid email profile");
    url.searchParams.set("state", params.state);
    return url.toString();
  });
}

export async function exchangeAuthentikCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; idToken?: string }> {
  const config = await getAuthentikOidcConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: getClientId(),
    client_secret: getClientSecret(),
  });
  const res = await fetch(config.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Authentik token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; id_token?: string };
  return {
    accessToken: data.access_token,
    idToken: data.id_token,
  };
}

export async function getAuthentikUserinfo(accessToken: string): Promise<AuthentikUserinfo> {
  const config = await getAuthentikOidcConfig();
  const endpoint = config.userinfo_endpoint ?? `${getIssuer()}/userinfo/`;
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Authentik userinfo failed: ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  const parsed = userinfoSchema.safeParse(data);
  if (!parsed.success) {
    console.warn("[authentik] userinfo parse failed", {
      error: parsed.error.flatten(),
      raw: JSON.stringify(data).slice(0, 500),
    });
    throw new Error("Invalid Authentik userinfo response");
  }
  const u = parsed.data;
  const email =
    u.email ??
    (u.preferred_username && u.preferred_username.includes("@") ? u.preferred_username : undefined) ??
    (u.username && u.username.includes("@") ? u.username : undefined);
  return {
    sub: u.sub,
    email: email ?? undefined,
    name: u.name ?? u.preferred_username ?? u.username ?? null,
  };
}

export function generateAuthentikState(): string {
  return randomBytes(24).toString("base64url");
}
