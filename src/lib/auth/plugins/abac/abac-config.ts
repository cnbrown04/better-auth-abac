import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import { Database } from "./database-types";

/*******************************************************************
 * Kysely ABAC Plugin DB Config
 * EDIT ONLY BELOW THIS LINE
 *
 * THIS IS NEEDED FOR THE ABAC PLUGIN TO WORK
 ******************************************************************/

const dialect = new MysqlDialect({
	pool: createPool({
		uri: process.env.DATABASE_URL!,
		connectionLimit: 10,
		waitForConnections: true,
		queueLimit: 0,
	}),
});

/*******************************************************************
 * Kysely ABAC Plugin DB Config
 * EDIT ONLY ABOVE THIS LINE
 ******************************************************************/

export const db = new Kysely<Database>({
	dialect,
});
