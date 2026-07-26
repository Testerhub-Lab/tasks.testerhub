import { createBuilder, defineQueries, defineQuery } from "@rocicorp/zero";
import { zeroSchema } from "./schema";
import type { ZeroContext } from "./context";

const zql = createBuilder(zeroSchema);

export const zeroQueries = defineQueries({
  issues: {
    mine: defineQuery(({ ctx }: { ctx: ZeroContext }) =>
      zql.spikeIssue.where("ownerID", ctx.userID).orderBy("id", "asc")
    ),
  },
});
