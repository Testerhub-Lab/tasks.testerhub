import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import ZeroWorkspaceClient from "./ZeroWorkspaceClient";

export const dynamic = "force-dynamic";

export default async function ZeroWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/zero");

  const cacheURL = process.env.NEXT_PUBLIC_ZERO_CACHE_URL;
  if (!cacheURL) {
    return (
      <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-200">
        NEXT_PUBLIC_ZERO_CACHE_URL is not configured.
      </p>
    );
  }

  return (
    <ZeroWorkspaceClient
      cacheURL={cacheURL}
      displayName={user.name ?? user.email}
      userID={user.id}
    />
  );
}
