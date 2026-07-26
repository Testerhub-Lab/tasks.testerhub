import {
  createBuilder,
  defineMutator,
  defineMutators,
} from "@rocicorp/zero";
import { z } from "zod";
import { zeroSchema } from "./schema";

const zql = createBuilder(zeroSchema);

export const zeroMutators = defineMutators({
  issues: {
    create: defineMutator(
      z.object({
        id: z.string().min(1).max(80),
        title: z.string().trim().min(1).max(160),
      }),
      async ({ args, ctx, tx }) => {
        await tx.mutate.spikeIssue.insert({
          id: args.id,
          ownerID: ctx.userID,
          title: args.title,
          done: false,
        });
      }
    ),
    setDone: defineMutator(
      z.object({
        id: z.string().min(1).max(80),
        done: z.boolean(),
      }),
      async ({ args, ctx, tx }) => {
        const issue = await tx.run(zql.spikeIssue.where("id", args.id).one());
        if (!issue || issue.ownerID !== ctx.userID) {
          throw new Error("Issue is not accessible");
        }

        await tx.mutate.spikeIssue.update({
          id: args.id,
          done: args.done,
        });
      }
    ),
  },
});
