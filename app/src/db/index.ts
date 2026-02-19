import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

function createDb() {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

declare const globalThis: {
  db: ReturnType<typeof createDb> | undefined;
} & typeof global;

export const db = globalThis.db ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalThis.db = db;
}
