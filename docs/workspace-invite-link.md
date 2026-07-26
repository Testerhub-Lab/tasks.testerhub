# Project Entry Link

Use `/entry` to grant an authenticated user access to one project.

## URL format

```
/entry?ws=<workspaceSlug>&projectId=<projectId>&exp=<unixMs>&invite=<inviteId>&sig=<hmac>
```

Parameters:
- `ws`: workspace slug (e.g., `testerhub`)
- `projectId`: target project id (UUID/cuid)
- `exp`: Unix time in **milliseconds** when the link expires
- `invite`: invite id from `WorkspaceInvite`
- `sig`: HMAC-SHA256 of `${ws}.${projectId}.${exp}.${invite}` using `WORKSPACE_INVITE_SECRET`

## Signature

This is a **signature**, not encryption. The server does **not** decrypt anything.
It recomputes the HMAC with the same secret and compares it to `sig`.

Payload:
```
${ws}.${projectId}.${exp}.${invite}
```

HMAC:
```
HMAC_SHA256(payload, WORKSPACE_INVITE_SECRET)
```

## Example (Node.js)

```js
import crypto from "crypto";

function makeEntryLink({ baseUrl, ws, projectId, ttlMs, invite, secret }) {
  const exp = Date.now() + ttlMs;
  const payload = `${ws}.${projectId}.${exp}.${invite}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const params = new URLSearchParams({
    ws,
    projectId,
    exp: String(exp),
    invite,
    sig,
  });
  return `${baseUrl}/entry?${params.toString()}`;
}
```

## Notes
- Set `WORKSPACE_INVITE_SECRET` in production.
- The invite record defines the project role and optional access duration.
- The link is rejected when `WORKSPACE_INVITE_SECRET` is not configured.
- If `exp` is in the past, the link is rejected.

### Where the secret lives
- `WORKSPACE_INVITE_SECRET` is configured in the **tasks** service environment.
- The **external platform** (Testerhub) must use the **same secret** to sign links.
