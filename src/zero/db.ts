import { Pool } from "pg";
import { zeroNodePg } from "@rocicorp/zero/server/adapters/pg";
import { zeroSchema } from "./schema";

let zeroPool: Pool | undefined;
let zeroDatabase: ReturnType<typeof createZeroDatabase> | undefined;

export function getZeroPool() {
  const connectionString = process.env.ZERO_UPSTREAM_DB;
  if (!connectionString) throw new Error("ZERO_UPSTREAM_DB is not set");

  zeroPool ??= new Pool({ connectionString });
  return zeroPool;
}

function createZeroDatabase() {
  return zeroNodePg(zeroSchema, getZeroPool());
}

export function getZeroDatabase() {
  zeroDatabase ??= createZeroDatabase();
  return zeroDatabase;
}

export type ZeroDatabase = ReturnType<typeof createZeroDatabase>;
export type ZeroTransaction = Parameters<
  Parameters<ZeroDatabase["transaction"]>[0]
>[0];

export function withZeroTransaction<T>(
  transaction: ZeroTransaction | undefined,
  callback: (tx: ZeroTransaction) => Promise<T>
) {
  return transaction
    ? callback(transaction)
    : getZeroDatabase().transaction(callback);
}

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: ZeroDatabase;
  }
}
