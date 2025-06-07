import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const poolConnection = mysql.createPool({
	uri: process.env.DATABASE_URL!,
});

export const main_db = drizzle({ client: poolConnection });
