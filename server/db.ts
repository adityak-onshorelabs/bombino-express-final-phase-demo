import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { getPgPoolConfig } from "./pgPoolConfig";

const pool = new Pool(getPgPoolConfig());

export const db = drizzle(pool, { schema });
