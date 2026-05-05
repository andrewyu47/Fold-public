import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../../drizzle/schema";

let _client: Client | undefined;
let _db: LibSQLDatabase<typeof schema> | undefined;

function getClient() {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = drizzle(getClient(), { schema });
    }
    return Reflect.get(_db, prop, receiver);
  },
});

export { schema };
