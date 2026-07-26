import { Pool } from "pg";
import { zeroNodePg } from "@rocicorp/zero/server/adapters/pg";
import { zeroSchema } from "./schema";

let zeroPool: Pool | undefined;
let zeroDatabase: ReturnType<typeof createZeroDatabase> | undefined;

function createZeroDatabase() {
  const connectionString = process.env.ZERO_UPSTREAM_DB;
  if (!connectionString) throw new Error("ZERO_UPSTREAM_DB is not set");

  zeroPool ??= new Pool({ connectionString });
  return zeroNodePg(zeroSchema, zeroPool);
}

export function getZeroDatabase() {
  zeroDatabase ??= createZeroDatabase();
  return zeroDatabase;
}

export type ZeroDatabase = ReturnType<typeof createZeroDatabase>;

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: ZeroDatabase;
  }
}
