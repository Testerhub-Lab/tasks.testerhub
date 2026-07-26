import { randomUUID } from "node:crypto";
import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { zeroNodePg } from "@rocicorp/zero/server/adapters/pg";
import { Pool } from "pg";
import { zeroMutators } from "../src/zero/mutators";
import { zeroSchema } from "../src/zero/schema";

const appDatabaseURL = process.env.DATABASE_URL;
const zeroDatabaseURL = process.env.ZERO_UPSTREAM_DB;

if (!appDatabaseURL || !zeroDatabaseURL) {
  throw new Error("DATABASE_URL and ZERO_UPSTREAM_DB are required");
}

const appPool = new Pool({ connectionString: appDatabaseURL });
const zeroPool = new Pool({ connectionString: zeroDatabaseURL });
const zeroDatabase = zeroNodePg(zeroSchema, zeroPool);
const foreignIssueID = `foreign-${randomUUID()}`;

async function main() {
  try {
    const userResult = await appPool.query<{ id: string }>(
      'SELECT id FROM "User" ORDER BY id LIMIT 1'
    );
    const userID = userResult.rows[0]?.id;
    if (!userID) throw new Error("Create the isolated spike user first");

    await zeroPool.query(
      "INSERT INTO spike_issue (id, owner_id, title) VALUES ($1, $2, $3)",
      [foreignIssueID, `foreign-${randomUUID()}`, "Foreign ownership check"]
    );

    const timestamp = Date.now();
    const result = await handleMutateRequest({
      dbProvider: zeroDatabase,
      handler: (transact) =>
        transact((tx, name, args) => {
          const mutator = mustGetMutator(zeroMutators, name);
          return mutator.fn({
            args,
            tx,
            ctx: { userID },
          });
        }),
      query: {
        appID: "pulsar_spike",
        schema: "pulsar_spike_0",
      },
      body: {
        clientGroupID: `ownership-${randomUUID()}`,
        mutations: [
          {
            args: [{ done: true, id: foreignIssueID }],
            clientID: `client-${randomUUID()}`,
            id: 1,
            name: "issues.setDone",
            timestamp,
            type: "custom",
          },
        ],
        pushVersion: 1,
        requestID: `request-${randomUUID()}`,
        timestamp,
      },
      userID,
    });

    const mutationResult =
      "kind" in result && result.kind === "MutateResponse"
        ? result.mutations[0]?.result
        : undefined;
    if (
      !mutationResult ||
      !("error" in mutationResult) ||
      mutationResult.error !== "app"
    ) {
      throw new Error("Foreign mutation was not rejected");
    }

    const rowResult = await zeroPool.query<{ done: boolean }>(
      "SELECT done FROM spike_issue WHERE id = $1",
      [foreignIssueID]
    );
    if (rowResult.rows[0]?.done !== false) {
      throw new Error("Foreign row was changed");
    }

    console.info(
      JSON.stringify({
        error: mutationResult.error,
        ownershipDenied: true,
        rowUnchanged: true,
      })
    );
  } finally {
    await zeroPool.query("DELETE FROM spike_issue WHERE id = $1", [
      foreignIssueID,
    ]);
    await Promise.all([appPool.end(), zeroPool.end()]);
  }
}

void main();
