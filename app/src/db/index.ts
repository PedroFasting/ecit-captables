import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env or .env.local (see .env.example)."
    );
  }
  return url;
}

function createDb() {
  const client = postgres(getConnectionString());
  return drizzle(client, { schema });
}

declare const globalThis: {
  db: ReturnType<typeof createDb> | undefined;
} & typeof global;

export const db = globalThis.db ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalThis.db = db;
}
