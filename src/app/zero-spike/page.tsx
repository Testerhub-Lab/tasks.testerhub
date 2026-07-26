import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import ZeroSpikeClient from "./ZeroSpikeClient";

export const dynamic = "force-dynamic";

export default async function ZeroSpikePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const cacheURL = process.env.NEXT_PUBLIC_ZERO_CACHE_URL;
  if (!cacheURL) {
    return (
      <p className="text-sm text-amber-300">
        NEXT_PUBLIC_ZERO_CACHE_URL is not configured.
      </p>
    );
  }

  return <ZeroSpikeClient cacheURL={cacheURL} userID={user.id} />;
}
