import { createHmac, timingSafeEqual } from "crypto";

export function signWorkspaceInvite(params: {
  wsSlug: string;
  projectId: string;
  exp: string;
  inviteId?: string | null;
}) {
  const secret = process.env.WORKSPACE_INVITE_SECRET;
  if (!secret) return null;

  const payload = params.inviteId
    ? `${params.wsSlug}.${params.projectId}.${params.exp}.${params.inviteId}`
    : `${params.wsSlug}.${params.projectId}.${params.exp}`;

  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyWorkspaceInvite(params: {
  wsSlug: string;
  projectId: string;
  exp: string;
  sig: string;
  inviteId?: string | null;
}) {
  const expMs = Number(params.exp);
  if (Number.isFinite(expMs) && expMs > 0) {
    if (Date.now() > expMs) return false;
  }
  const secret = process.env.WORKSPACE_INVITE_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const { wsSlug, projectId, exp, sig, inviteId } = params;
  const payload = inviteId
    ? `${wsSlug}.${projectId}.${exp}.${inviteId}`
    : `${wsSlug}.${projectId}.${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function buildWorkspaceInviteLink(params: {
  baseUrl: string;
  wsSlug: string;
  projectId: string;
  exp: number;
  inviteId?: string | null;
}) {
  const trimmedBase = params.baseUrl.replace(/\/$/, "");
  const exp = String(params.exp);
  const sig =
    signWorkspaceInvite({
      wsSlug: params.wsSlug,
      projectId: params.projectId,
      exp,
      inviteId: params.inviteId,
    }) ?? (process.env.NODE_ENV !== "production" ? "dev" : null);

  if (!sig) return null;

  const query = new URLSearchParams({
    ws: params.wsSlug,
    projectId: params.projectId,
    exp,
    sig,
  });

  if (params.inviteId) {
    query.set("invite", params.inviteId);
  }

  return `${trimmedBase}/entry?${query.toString()}`;
}
