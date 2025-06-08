import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Layout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		return redirect("/auth/sign-in");
	}

	return (
		<div className="flex h-screen w-full">
			<div className="h-full w-full overflow-auto">{children}</div>
		</div>
	);
}
