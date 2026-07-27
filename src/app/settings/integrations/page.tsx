import { redirect } from "next/navigation";
import ApiTokensClient from "@/components/integrations/ApiTokensClient";
import { listApiTokens } from "@/server/api/token-store";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function IntegrationsSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/settings/integrations");

  const tokens = await listApiTokens(user.id);

  return (
    <div className="mx-auto max-w-5xl">
      <ApiTokensClient
        initialTokens={tokens.map((token) => ({
          ...token,
          createdAt: token.createdAt.toISOString(),
          expiresAt: token.expiresAt?.toISOString() ?? null,
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          revokedAt: token.revokedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
