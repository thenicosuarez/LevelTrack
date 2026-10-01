import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import pg from "pg";
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon's serverless driver talks to Neon over websockets; a plain Postgres
// (local dev, CI) needs the standard `pg` driver. DB_DRIVER overrides the guess.
const useNeon = process.env.DB_DRIVER
  ? process.env.DB_DRIVER === "neon"
  : /neon\.tech/.test(process.env.DATABASE_URL);

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

let pool: pg.Pool;
let db: ReturnType<typeof drizzlePg<typeof schema>>;

if (useNeon) {
  neonConfig.webSocketConstructor = ws;
  const neonPool = new NeonPool(poolConfig);
  pool = neonPool as unknown as pg.Pool;
  db = drizzleNeon({ client: neonPool, schema }) as unknown as typeof db;
} else {
  pool = new pg.Pool(poolConfig);
  db = drizzlePg(pool, { schema });
}

// Add error handling for pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Test connection on startup
pool.query('SELECT 1').then(() => {
  console.log(`Database connection test successful (${useNeon ? "neon" : "pg"} driver)`);
}).catch((err) => {
  console.error('Database connection test failed:', err);
});

export { pool, db };
