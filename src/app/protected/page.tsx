"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export default function ProtectedPage() {
	function runTest() {
		const result = authClient.abac.test();
		console.log("ABAC Test Result:", result);
	}

	return (
		<div>
			<h1>Protected Page</h1>
			<p>This page is protected and requires authentication.</p>
			<Button variant="outline" onClick={runTest}>
				Test
			</Button>
		</div>
	);
}
