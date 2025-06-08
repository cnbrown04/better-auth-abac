import { betterAuth, BetterAuthOptions } from "better-auth";
import { abac } from "./plugins/abac/abac-server";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { main_db } from "../db/db";
import { schema } from "../db/schema";
import { createAbacAdapter } from "./plugins/abac/abac-adapter";

const OPTIONS = {
	database: drizzleAdapter(main_db, {
		provider: "mysql",
		schema: {
			...schema,
		},
	}),
	emailAndPassword: {
		enabled: true,
	},
} satisfies BetterAuthOptions;

const abacAdapter = createAbacAdapter({
	db: {
		uri: process.env.DATABASE_URL!,
	},
});

export const auth = betterAuth({
	...OPTIONS,
	plugins: [abac(abacAdapter)],
});
