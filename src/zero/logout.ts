"use client";

import { dropAllDatabases } from "@rocicorp/zero";

type ZeroLogoutCleanup = () => Promise<void>;

const activeCleanups = new Set<ZeroLogoutCleanup>();

export function registerZeroLogoutCleanup(cleanup: ZeroLogoutCleanup) {
  activeCleanups.add(cleanup);
  return () => {
    activeCleanups.delete(cleanup);
  };
}

export async function clearZeroClientDataOnLogout() {
  if (activeCleanups.size > 0) {
    const results = await Promise.allSettled(
      [...activeCleanups].map((cleanup) => cleanup())
    );
    const errors = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to clear active Zero clients");
    }
    return;
  }

  const result = await dropAllDatabases({ logLevel: "error" });
  if (result.errors.length > 0) {
    throw new AggregateError(
      result.errors,
      "Failed to clear persisted Zero data"
    );
  }
}
