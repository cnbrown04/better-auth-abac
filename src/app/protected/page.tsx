export default function ProtectedPage() {
	return (
		<div className="flex h-screen w-full items-center justify-center">
			<h1 className="text-2xl font-bold">Protected Page</h1>
			<p className="mt-4">
				You have access to this page because you are authenticated.
			</p>
		</div>
	);
}
