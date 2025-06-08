import { Kysely, Dialect } from "kysely";
import { Database } from "./database-types";

// Type definitions for dynamic imports
interface PostgresPoolConfig {
	connectionString: string;
	max?: number;
	ssl?: boolean | object;
}

interface PostgresPool {
	new (config: PostgresPoolConfig): any;
}

type DatabaseType = "mysql" | "postgres";

interface BaseDbConfig {
	uri: string;
	connectionLimit?: number;
	waitForConnections?: boolean;
	queueLimit?: number;
}

interface MysqlConfig extends BaseDbConfig {
	type: "mysql";
}

interface PostgresConfig extends BaseDbConfig {
	type: "postgres";
	ssl?: boolean | object;
}

interface AbacAdapterConfig {
	db: MysqlConfig | PostgresConfig;
}

async function createDialect(
	config: MysqlConfig | PostgresConfig
): Promise<Dialect> {
	switch (config.type) {
		case "mysql":
			try {
				const [{ MysqlDialect }, { createPool }] = await Promise.all([
					import("kysely").then((m) => ({ MysqlDialect: m.MysqlDialect })),
					import("mysql2"),
				]);

				return new MysqlDialect({
					pool: createPool({
						uri: config.uri,
						connectionLimit: config.connectionLimit ?? 10,
						waitForConnections: config.waitForConnections ?? true,
						queueLimit: config.queueLimit ?? 0,
					}),
				});
			} catch (error) {
				throw new Error(
					`MySQL dependencies not found. Please install: npm install mysql2\n` +
						`Original error: ${
							error instanceof Error ? error.message : String(error)
						}`
				);
			}

		case "postgres":
			try {
				const { PostgresDialect } = await import("kysely").then((m) => ({
					PostgresDialect: m.PostgresDialect,
				}));

				// Use eval to dynamically import pg without TypeScript checking
				const pgModule = await eval('import("pg")').catch(() => {
					throw new Error(
						"PostgreSQL package not found. Please install: npm install pg"
					);
				});

				const Pool = pgModule.Pool as PostgresPool;

				return new PostgresDialect({
					pool: new Pool({
						connectionString: config.uri,
						max: config.connectionLimit ?? 10,
						ssl: config.ssl ?? false,
					}),
				});
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("PostgreSQL package not found")
				) {
					throw error;
				}
				throw new Error(
					`PostgreSQL dependencies not found. Please install: npm install pg\n` +
						`Note: For better TypeScript support, also install: npm install --save-dev @types/pg\n` +
						`Original error: ${
							error instanceof Error ? error.message : String(error)
						}`
				);
			}

		default:
			throw new Error(`Unsupported database type: ${(config as any).type}`);
	}
}

export async function createAbacAdapter(
	config: AbacAdapterConfig
): Promise<Kysely<Database>> {
	/*******************************************************************
	 * Kysely ABAC Plugin DB Config
	 * EDIT ONLY BELOW THIS LINE
	 *
	 * THIS IS NEEDED FOR THE ABAC PLUGIN TO WORK
	 ******************************************************************/

	const dialect = await createDialect(config.db);

	/*******************************************************************
	 * Kysely ABAC Plugin DB Config
	 * EDIT ONLY ABOVE THIS LINE
	 ******************************************************************/

	return new Kysely<Database>({
		dialect,
	});
}

// Usage examples:

// MySQL
// const mysqlAdapter = await createAbacAdapter({
//   db: {
//     type: 'mysql',
//     uri: process.env.DATABASE_URL!,
//     connectionLimit: 10,
//     waitForConnections: true,
//     queueLimit: 0,
//   }
// });

// PostgreSQL
// const postgresAdapter = await createAbacAdapter({
//   db: {
//     type: 'postgres',
//     uri: process.env.DATABASE_URL!,
//     connectionLimit: 20,
//     ssl: true,
//   }
// });
