import { Pool } from "pg";
import { getPgPoolConfig } from "./pgPoolConfig";

const appPool = new Pool(
  getPgPoolConfig({
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  }),
);

appPool.on('error', (err) => {
  console.error('[appDb] non-fatal pool error:', err.message);
});

export async function safeQuery(
  text: string,
  params?: any[]
): Promise<any[] | null> {
  let client;
  try {
    client = await appPool.connect();
    const result = await client.query(text, params);
    return result.rows;
  } catch (err: any) {
    console.error('[appDb] query failed (non-fatal):', 
      err.message);
    return null;
  } finally {
    if (client) client.release();
  }
}

export async function safeQueryOne(
  text: string,
  params?: any[]
): Promise<any | null> {
  const rows = await safeQuery(text, params);
  return rows?.[0] ?? null;
}
