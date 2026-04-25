import { z } from "zod";

const mainUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional().nullable(),
});

const mainMeSchema = z.object({
  ok: z.literal(true),
  user: mainUserSchema,
});

export type MainUser = z.infer<typeof mainUserSchema>;

function getMainMeUrl(): string {
  const baseUrl = process.env.MAIN_APP_BASE_URL;
  if (!baseUrl) {
    throw new Error("MAIN_APP_BASE_URL is not set");
  }
  const path = process.env.MAIN_APP_ME_PATH ?? "/api/auth/me";
  return `${baseUrl}${path}`;
}

export async function fetchMainCurrentUser(
  cookiesHeader: string | null
): Promise<MainUser | null> {
  if (!cookiesHeader) return null;

  const url = getMainMeUrl();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      cookie: cookiesHeader,
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    return null;
  }

  if (res.status !== 200) {
    return null;
  }

  const payload = (await res.json().catch(() => null)) as unknown;
  const parsed = mainMeSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  return parsed.data.user;
}
