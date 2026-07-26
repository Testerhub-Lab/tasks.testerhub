import type { MutatorResult } from "@rocicorp/zero";

function mutationErrorMessage(
  result: Awaited<MutatorResult["server"]>
): string | null {
  return result.type === "error" ? result.error.message : null;
}

export async function waitForZeroMutation(result: MutatorResult) {
  const optimistic = await result.client;
  const optimisticError = mutationErrorMessage(optimistic);
  if (optimisticError) throw new Error(optimisticError);

  const authoritative = await result.server;
  const authoritativeError = mutationErrorMessage(authoritative);
  if (authoritativeError) throw new Error(authoritativeError);
}
