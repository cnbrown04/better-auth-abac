import { type BetterAuthClientPlugin } from "better-auth";
import { abac } from "./index";

const abacClient = () => {
	return {
		id: "abac-client",
		$InferServerPlugin: {} as ReturnType<typeof abac>,
	} satisfies BetterAuthClientPlugin;
};

export { abacClient };
