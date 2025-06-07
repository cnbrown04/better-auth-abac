"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

// Import the server action
import { authClient } from "@/lib/auth/auth-client";
import { main_db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

export default function LoginForm() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { data: session } = authClient.useSession();

	// Checking if there is already a session.
	if (session) {
		window.location.href = "/protected";
	}

	const handleSubmit = async (
		e: React.FormEvent<HTMLFormElement>
	): Promise<void> => {
		e.preventDefault();
		setError("");
		setIsLoading(true);

		try {
			const { data } = await authClient.signIn.email(
				{
					email: email,
					password: password,
				},
				{
					onSuccess: (ctx) => {
						const authToken = ctx.response.headers.get("set-auth-token"); // get the token from the response headers
						// Store the token securely (e.g., in localStorage)
						localStorage.setItem("bearer_token", authToken ?? "");
					},
					onError: (ctx) => {
						console.error(ctx.error);
						setError(ctx.error.message);
					},
				}
			);
		} catch {
			setError("An error occurred during login. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Card className="mx-auto max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Login</CardTitle>
				<CardDescription>
					Enter your email below to login to your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="grid gap-4">
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="m@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							disabled={isLoading}
							className="transition-colors"
						/>
					</div>
					<div className="grid gap-2">
						<div className="flex items-center">
							<Label htmlFor="password">Password</Label>
							<Link
								href="/forgot-password"
								className="ml-auto inline-block text-sm underline hover:text-primary"
							>
								Forgot your password?
							</Link>
						</div>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							disabled={isLoading}
							className="transition-colors"
						/>
					</div>
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Logging in...
							</>
						) : (
							"Login"
						)}
					</Button>
					<div className="mt-4 text-center text-sm">
						Don&apos;t have an account?{" "}
						<Link href="/sign-up" className="underline hover:text-primary">
							Sign up
						</Link>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
