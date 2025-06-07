import { betterAuth, BetterAuthOptions } from "better-auth";
import { abac } from "./plugins/abac/abac-server";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { main_db } from "../db/db";
import { schema } from "../db/schema";

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

export const auth = betterAuth({
	...OPTIONS,
	plugins: [abac()],
});
