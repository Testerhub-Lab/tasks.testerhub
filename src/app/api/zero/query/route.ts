import { handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetQuery } from "@rocicorp/zero";
import { getCurrentUser } from "@/server/auth/session";
import { zeroQueries } from "@/zero/queries";
import { zeroSchema } from "@/zero/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await handleQueryRequest({
    handler: (name, args) => {
      const query = mustGetQuery(zeroQueries, name);
      return query.fn({
        args,
        ctx: { userID: user.id },
      });
    },
    schema: zeroSchema,
    request,
    userID: user.id,
  });

  return Response.json(result);
}
