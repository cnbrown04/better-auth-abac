import { BetterAuthClientPlugin } from "better-auth";
import { abac } from "./abac-server";

export const abacClient = () => {
	return {
		id: "abac-client",
		$InferServerPlugin: {} as Awaited<ReturnType<typeof abac>>,
	} satisfies BetterAuthClientPlugin;
};
