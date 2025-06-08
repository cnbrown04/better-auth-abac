import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import { Database } from "./database-types";

interface AbacAdapterConfig {
	db: {
		uri: string;
		connectionLimit?: number;
		waitForConnections?: boolean;
		queueLimit?: number;
	};
}

export function createAbacAdapter(config: AbacAdapterConfig): Kysely<Database> {
	/*******************************************************************
	 * Kysely ABAC Plugin DB Config
	 * EDIT ONLY BELOW THIS LINE
	 *
	 * THIS IS NEEDED FOR THE ABAC PLUGIN TO WORK
	 ******************************************************************/

	const dialect = new MysqlDialect({
		pool: createPool({
			uri: config.db.uri,
			connectionLimit: config.db.connectionLimit ?? 10,
			waitForConnections: config.db.waitForConnections ?? true,
			queueLimit: config.db.queueLimit ?? 0,
		}),
	});

	/*******************************************************************
	 * Kysely ABAC Plugin DB Config
	 * EDIT ONLY ABOVE THIS LINE
	 ******************************************************************/

	return new Kysely<Database>({
		dialect,
	});
}

// Usage example:
// const abacAdapter = createAbacAdapter({
//   db: {
//     uri: process.env.DATABASE_URL!,
//     connectionLimit: 10,
//     waitForConnections: true,
//     queueLimit: 0,
//   }
// });
