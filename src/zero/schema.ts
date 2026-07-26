import { boolean, createSchema, string, table } from "@rocicorp/zero";

const spikeIssue = table("spikeIssue")
  .from("spike_issue")
  .columns({
    id: string(),
    ownerID: string().from("owner_id"),
    title: string(),
    done: boolean(),
  })
  .primaryKey("id");

export const zeroSchema = createSchema({
  tables: [spikeIssue],
});

export type ZeroSchema = typeof zeroSchema;

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: ZeroSchema;
  }
}
