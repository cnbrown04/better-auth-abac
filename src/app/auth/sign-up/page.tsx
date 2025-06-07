"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";
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
import { toast } from "sonner";

export default function SignUpForm() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSignUp = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);

		try {
			const {} = await authClient.signUp.email(
				{
					email,
					password,
					name,
				},
				{
					onRequest: () => {
						setIsLoading(true);
					},
					onSuccess: () => {
						toast("Account created successfully!", {
							description: "Redirecting you to login...",
						});
						window.location.href = "/auth/sign-in";
					},
					onError: (ctx) => {
						toast("Error creating account", {
							description: ctx.error.message,
						});
					},
				}
			);
		} catch (error) {
			toast("Something went wrong", {
				description:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Card className="mx-auto max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Create an account</CardTitle>
				<CardDescription>
					Enter your details below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="name">Full Name</Label>
						<Input
							id="name"
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="John Doe"
							required
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="m@example.com"
							required
						/>
					</div>
					<div className="grid gap-2">
						<div className="flex items-center">
							<Label htmlFor="password">Password</Label>
						</div>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
						/>
					</div>
					<Button
						type="submit"
						className="w-full"
						onClick={handleSignUp}
						disabled={isLoading}
					>
						{isLoading ? "Creating account..." : "Sign Up"}
					</Button>
				</div>
				<div className="mt-4 text-center text-sm">
					Already have an account?{" "}
					<Link href="/login" className="underline">
						Login
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
