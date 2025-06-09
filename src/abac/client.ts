import { BetterAuthClientPlugin } from "better-auth";
import { abac } from ".";

const abacClient = () => {
	return {
		id: "abac-client",
		$InferServerPlugin: {} as Awaited<ReturnType<typeof abac>>,
	} satisfies BetterAuthClientPlugin;
};

export { abacClient };
