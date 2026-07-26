import { handleMutateRequest } from "@rocicorp/zero/server";
import { mustGetMutator } from "@rocicorp/zero";
import { getCurrentUser } from "@/server/auth/session";
import { getZeroDatabase } from "@/zero/db";
import { zeroMutators } from "@/zero/mutators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await handleMutateRequest({
    dbProvider: getZeroDatabase(),
    handler: (transact) =>
      transact((tx, name, args) => {
        const mutator = mustGetMutator(zeroMutators, name);
        return mutator.fn({
          args,
          tx,
          ctx: { userID: user.id },
        });
      }),
    request,
    userID: user.id,
  });

  return Response.json(result);
}
