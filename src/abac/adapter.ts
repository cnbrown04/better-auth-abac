import { Kysely, type Dialect } from "kysely";
import { type Database } from "./database-types";

// Type definitions for dynamic imports
interface PostgresPoolConfig {
	connectionString: string;
	max?: number;
	ssl?: boolean | object;
}

interface PostgresPool {
	new (config: PostgresPoolConfig): any;
}

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

interface SqliteConfig {
	type: "sqlite";
	uri: string; // Path to the SQLite database file
	filename?: string; // Optional, overrides uri for file path
	readonly?: boolean; // Open database in read-only mode
}
interface AbacAdapterConfig {
	db: MysqlConfig | PostgresConfig | SqliteConfig;
}

async function createDialect(
	config: MysqlConfig | PostgresConfig | SqliteConfig
): Promise<Dialect> {
	switch (config.type) {
		case "mysql":
			try {
				// const [{ MysqlDialect }, { createPool }] = await Promise.all([
				// 	import("kysely").then((m) => ({ MysqlDialect: m.MysqlDialect })),
				// 	import("mysql2"),
				// ]);

				const { MysqlDialect } = await import("kysely").then((m) => ({
					MysqlDialect: m.MysqlDialect,
				}));

				// Use eval to dynamically import mysql2 without TypeScript checking
				const mysql2Module = await eval('import("mysql2")').catch(() => {
					throw new Error(
						"MySQL2 package not found. Please install: npm install mysql2"
					);
				});

				const createPool = mysql2Module.createPool;

				return new MysqlDialect({
					pool: createPool({
						uri: config.uri,
						connectionLimit: config.connectionLimit ?? 5,
						waitForConnections: config.waitForConnections ?? true,
						queueLimit: config.queueLimit ?? 0,
						acquireTimeout: 60000,
						timeout: 60000,
						idleTimeout: 300000,
						maxIdle: 2,
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
						max: config.connectionLimit ?? 5,
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

		case "sqlite":
			try {
				const { SqliteDialect } = await import("kysely").then((m) => ({
					SqliteDialect: m.SqliteDialect,
				}));

				// Use eval to dynamically import better-sqlite3 without TypeScript checking
				const sqliteModule = await eval('import("better-sqlite3")').catch(
					() => {
						throw new Error(
							"SQLite dependencies not found. Please install: npm install better-sqlite3"
						);
					}
				);

				const Database = sqliteModule.default || sqliteModule.Database;

				// Use filename if provided, otherwise use uri
				const dbPath = config.filename || config.uri;
				const db = new Database(dbPath, {
					readonly: config.readonly ?? false,
					fileMustExist: false,
					timeout: 5000,
				});

				// Configure SQLite for better memory management
				db.pragma("journal_mode = WAL");
				db.pragma("synchronous = NORMAL");
				db.pragma("cache_size = -8000"); // 8MB cache
				db.pragma("temp_store = MEMORY");
				db.pragma("mmap_size = 268435456"); // 256MB mmap

				return new SqliteDialect({
					database: db,
				});
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("SQLite dependencies not found")
				) {
					throw error;
				}
				throw new Error(
					`SQLite dependencies not found. Please install: npm install better-sqlite3\n` +
						`Note: For better TypeScript support, also install: npm install --save-dev @types/better-sqlite3\n` +
						`Original error: ${
							error instanceof Error ? error.message : String(error)
						}`
				);
			}

		default:
			throw new Error(`Unsupported database type: ${(config as any).type}`);
	}
}

async function createAbacAdapter(
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

// SQLite
// const sqliteAdapter = await createAbacAdapter({
//   db: {
//     type: 'sqlite',
//     uri: './database.db', // or use filename: './database.db'
//     filename: './my-database.sqlite', // optional, overrides uri for file path
//   }
// });

export { createAbacAdapter };
