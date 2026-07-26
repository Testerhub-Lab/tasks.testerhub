import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
  var pgPool: Pool | undefined;
}

let prismaClient: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (prismaClient) return prismaClient;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool =
    globalThis.pgPool ??
    new Pool({
      connectionString,
    });

  prismaClient =
    globalThis.prisma ??
    new PrismaClient({
      adapter: new PrismaPg(pool),
    });

  if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = prismaClient;
    globalThis.pgPool = pool;
  }

  return prismaClient;
}

const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default prisma;
