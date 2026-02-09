import { createHmac, timingSafeEqual } from "crypto";

export function verifyWorkspaceInvite(params: {
  wsSlug: string;
  projectId: string;
  exp: string;
  sig: string;
}) {
  const expMs = Number(params.exp);
  if (Number.isFinite(expMs) && expMs > 0) {
    if (Date.now() > expMs) return false;
  }
  const secret = process.env.WORKSPACE_INVITE_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const { wsSlug, projectId, exp, sig } = params;
  const payload = `${wsSlug}.${projectId}.${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
