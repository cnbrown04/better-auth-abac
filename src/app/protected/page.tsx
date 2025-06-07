"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	CheckCircle,
	XCircle,
	AlertCircle,
	Shield,
	User,
	Database,
	Settings,
	FileText,
	Users,
	Lock,
} from "lucide-react";

// Type definitions
interface TestParams {
	userId?: string;
	resourceId?: string;
	resourceType?: string;
	actionName?: string;
	context?: Record<string, unknown>;
	resourceIds?: string[];
}

interface Decision {
	decision: string;
	appliedPolicies?: string[];
	reason?: string;
	processingTimeMs?: number;
}

interface TestError {
	code?: string;
	message?: string;
	status?: number;
	statusText?: string;
}

interface TestResult {
	data?: {
		decision?: Decision;
		appliedPolicies?: string[];
		reason?: string;
		processingTimeMs?: number;
		decisions?: Decision[];
	};
	decision?: Decision;
	allowed?: boolean;
	reason?: string;
	error?: string | TestError | null;
	timestamp: string;
	testType: TestType;
	parameters: TestParams;
	message?: string;
	decisions?: Decision[];
}

type TestType = "read" | "write" | "delete" | "general" | "system" | "multiple";

interface TestCase {
	id: string;
	label: string;
	type: TestType;
	userId: string;
	resourceId?: string;
	resourceType?: string;
	actionName?: string;
	context?: Record<string, unknown>;
}

interface TestSuite {
	title: string;
	icon: React.ReactNode;
	tests: TestCase[];
}

interface TestPermissionParams {
	userId: string;
	resourceId: string;
	testId: string;
	resourceType?: string;
	actionName?: string;
	context?: Record<string, unknown>;
	type?: TestType;
}

export default function ABACTestingPage() {
	const [testResults, setTestResults] = useState<Record<string, TestResult>>(
		{}
	);
	const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);

	const { data: session } = authClient.useSession();

	const testPermission = async (
		userId: string,
		resourceId: string,
		testId: string,
		resourceType?: string,
		actionName?: string,
		context: Record<string, unknown> = {},
		type: TestType = "general"
	): Promise<void> => {
		try {
			let response: unknown;

			switch (type) {
				case "read":
					response = await authClient.abac.canuserread({
						userId,
						resourceId,
						context,
					});
					break;
				case "write":
					response = await authClient.abac.canuserwrite({
						userId,
						resourceId,
						context,
					});
					break;
				case "delete":
					response = await authClient.abac.canuserdelete({
						userId,
						resourceId,
						context,
					});
					break;
				case "general":
				default:
					if (!actionName) {
						return;
					}
					response = await authClient.abac.canuserperformaction({
						subjectId: userId,
						resourceId,
						resourceType,
						actionName,
						context,
					});
					break;
			}

			const result: TestResult = {
				...(response as Partial<TestResult>),
				timestamp: new Date().toISOString(),
				testType: type,
				parameters: { userId, resourceId, resourceType, actionName, context },
			};

			setTestResults((prev) => ({
				...prev,
				[testId]: result,
			}));
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			setTestResults((prev) => ({
				...prev,
				[testId]: {
					error: errorMessage,
					timestamp: new Date().toISOString(),
					testType: type,
					parameters: { userId, resourceId, resourceType, actionName, context },
				},
			}));
		}
	};

	const testMultipleResources = async (
		userId: string,
		actionName: string,
		resourceIds: string[],
		context: Record<string, unknown> = {},
		testId: string
	): Promise<void> => {
		try {
			const result = await authClient.abac.canuserperformactiononresources({
				userId,
				actionName,
				resourceIds,
				context,
			});

			setTestResults((prev) => ({
				...prev,
				[testId]: {
					...(result as unknown as Partial<TestResult>),
					timestamp: new Date().toISOString(),
					testType: "multiple",
					parameters: { userId, actionName, resourceIds, context },
				},
			}));
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			setTestResults((prev) => ({
				...prev,
				[testId]: {
					decisions: [],
					error: errorMessage,
					timestamp: new Date().toISOString(),
					testType: "multiple",
					parameters: { userId, actionName, resourceIds, context },
				},
			}));
		}
	};

	const testABACEndpoint = async (): Promise<void> => {
		try {
			const result = await authClient.abac.test();
			setTestResults((prev) => ({
				...prev,
				"abac-test": {
					...(result as Partial<TestResult>),
					timestamp: new Date().toISOString(),
					testType: "system",
					parameters: {},
				},
			}));
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			setTestResults((prev) => ({
				...prev,
				"abac-test": {
					message: "Error testing ABAC endpoint",
					error: errorMessage,
					timestamp: new Date().toISOString(),
					testType: "system",
					parameters: {},
				},
			}));
		}
	};

	const isAllowed = (result: TestResult | null | undefined): boolean => {
		if (!result) return false;
		if (result.error) return false;

		// Check new nested data structure first
		if (result.data?.decision) {
			return result.data.decision.decision === "permit";
		}

		return result.allowed || false;
	};

	const getStatusIcon = (result: TestResult | null | undefined) => {
		if (!result) return <AlertCircle className="h-4 w-4 text-gray-400" />;
		if (result.error) return <XCircle className="h-4 w-4 text-red-500" />;

		return isAllowed(result) ? (
			<CheckCircle className="h-4 w-4 text-green-500" />
		) : (
			<XCircle className="h-4 w-4 text-red-500" />
		);
	};

	const getStatusBadge = (result: TestResult | null | undefined) => {
		if (!result) return <Badge variant="secondary">Not Tested</Badge>;
		if (result.error) return <Badge variant="destructive">Error</Badge>;

		return isAllowed(result) ? (
			<Badge variant="default" className="bg-green-600">
				Allowed
			</Badge>
		) : (
			<Badge variant="destructive">Denied</Badge>
		);
	};

	const getReason = (result: TestResult): string => {
		// Check new nested data structure first
		if (result.data?.reason) {
			return result.data.reason;
		}

		// Fallback to old structure
		if (result.decision?.reason) {
			return result.decision.reason;
		}

		return result.reason || "";
	};

	const getAppliedPolicies = (result: TestResult): string[] => {
		// Check new nested data structure first
		if (result.data?.appliedPolicies) {
			return result.data.appliedPolicies;
		}

		// Fallback to old structure
		if (result.decision?.appliedPolicies) {
			return result.decision.appliedPolicies;
		}

		return [];
	};

	const getProcessingTime = (result: TestResult): number | undefined => {
		// Check new nested data structure first
		if (result.data?.processingTimeMs) {
			return result.data.processingTimeMs;
		}

		// Fallback to old structure
		if (result.decision?.processingTimeMs) {
			return result.decision.processingTimeMs;
		}

		return undefined;
	};

	const testSuites: TestSuite[] = [
		{
			title: "Document Management",
			icon: <FileText className="h-5 w-5" />,
			tests: [
				{
					id: "doc-read-456",
					label: "View Engineering Document (doc-456)",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "doc-456",
					resourceType: "document",
					actionName: "read.document",
					context: {
						department: "engineering",
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "doc-write-456",
					label: "Edit Engineering Document (doc-456)",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "doc-456",
					resourceType: "document",
					actionName: "write.document",
					context: {
						department: "engineering",
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "doc-delete-456",
					label: "Delete Engineering Document (doc-456)",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "doc-456",
					resourceType: "document",
					actionName: "delete.document",
					context: {
						department: "engineering",
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "doc-read-1",
					label: "View Marketing Document (doc-1)",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "doc-1",
					resourceType: "document",
					actionName: "read.document",
					context: {
						department: "marketing",
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "doc-read-2",
					label: "View Confidential Document (doc-2)",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "doc-2",
					resourceType: "document",
					actionName: "read.document",
					context: {
						department: "engineering",
						isSecureConnection: false, // Test insecure connection
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "doc-share-456",
					label: "Share Engineering Document (doc-456)",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "doc-456",
					resourceType: "document",
					actionName: "share.document",
					context: {
						department: "engineering",
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
			],
		},
		{
			title: "Administrative Actions",
			icon: <Settings className="h-5 w-5" />,
			tests: [
				{
					id: "admin-settings",
					label: "Configure System Settings",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "system-config",
					resourceType: "system",
					actionName: "configure.system",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
						deviceType: "desktop",
					},
				},
				{
					id: "admin-users",
					label: "Manage Users",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "user-management",
					resourceType: "system",
					actionName: "manage.user",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
						deviceType: "desktop",
					},
				},
				{
					id: "system-backup",
					label: "System Backup (After Hours)",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "system-backup",
					resourceType: "system",
					actionName: "backup.system",
					context: {
						isSecureConnection: true,
						timeOfDay: "19:30", // After business hours
						deviceType: "desktop",
					},
				},
				{
					id: "system-backup-hours",
					label: "System Backup (Business Hours)",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "system-backup",
					resourceType: "system",
					actionName: "backup.system",
					context: {
						isSecureConnection: true,
						timeOfDay: "14:30", // During business hours
						deviceType: "desktop",
					},
				},
				{
					id: "system-monitor",
					label: "Monitor System Health",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "system-monitor",
					resourceType: "system",
					actionName: "monitor.system",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
						deviceType: "desktop",
					},
				},
			],
		},
		{
			title: "Financial Operations",
			icon: <Database className="h-5 w-5" />,
			tests: [
				{
					id: "billing-read",
					label: "View Billing Information",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "billing-info",
					resourceType: "billing",
					actionName: "read.billing",
					context: {
						department: "finance",
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "billing-write",
					label: "Modify Billing Settings",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "billing-settings",
					resourceType: "billing",
					actionName: "write.billing",
					context: {
						department: "finance",
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "analytics-view",
					label: "View Analytics Dashboard",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "analytics-dashboard",
					resourceType: "analytics",
					actionName: "view.analytics",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
						deviceType: "desktop",
					},
				},
				{
					id: "analytics-export",
					label: "Export Analytics Data",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "analytics-data",
					resourceType: "analytics",
					actionName: "export.analytics",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
						deviceType: "desktop",
					},
				},
			],
		},
		{
			title: "User Management",
			icon: <User className="h-5 w-5" />,
			tests: [
				{
					id: "user-self-read",
					label: "View Own Profile",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: session?.user?.id || "current-user",
					resourceType: "user",
					actionName: "read.user",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "user-self-write",
					label: "Update Own Profile",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: session?.user?.id || "current-user",
					resourceType: "user",
					actionName: "write.user",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "user-other-read",
					label: "View Other User Profile",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "other-user-123",
					resourceType: "user",
					actionName: "read.user",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
				{
					id: "user-delete",
					label: "Delete User Account",
					type: "general",
					userId: session?.user?.id || "current-user",
					resourceId: "test-user-456",
					resourceType: "user",
					actionName: "delete.user",
					context: {
						isSecureConnection: true,
						timeOfDay: new Date().toTimeString().slice(0, 5),
					},
				},
			],
		},
	];

	const runAllTests = async (): Promise<void> => {
		for (const suite of testSuites) {
			for (const test of suite.tests) {
				await testPermission(
					test.userId,
					test.resourceId || "system-resource",
					test.id,
					test.resourceType,
					test.actionName,
					test.context || {},
					test.type
				);
				// Small delay to prevent overwhelming the API
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		// Test the ABAC endpoint itself
		await testABACEndpoint();

		// Test multiple resources with proper context
		await testMultipleResources(
			session?.user?.id || "current-user",
			"read.document",
			["doc-456", "doc-1", "doc-2", "doc-3"],
			{
				isSecureConnection: true,
				timeOfDay: new Date().toTimeString().slice(0, 5),
				deviceType: "desktop",
			},
			"multi-resource-test"
		);
	};

	const databbaseSetup = async (): Promise<void> => {
		try {
			if (!session?.user?.id) {
				alert("User ID is required for database setup.");
				return;
			}

			// Show loading state
			const button = document.querySelector(
				"[data-setup-button]"
			) as HTMLButtonElement;
			if (button) {
				button.disabled = true;
				button.textContent = "Setting up...";
			}

			await authClient.abac.setupdatabase({ userId: session?.user?.id });
			alert(
				"Database setup completed successfully! ABAC policies, resources, and test data have been created."
			);

			// Reset button
			if (button) {
				button.disabled = false;
				button.textContent = "Run Database Setup";
			}
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			alert(`Database setup failed: ${errorMessage}`);

			// Reset button on error
			const button = document.querySelector(
				"[data-setup-button]"
			) as HTMLButtonElement;
			if (button) {
				button.disabled = false;
				button.textContent = "Run Database Setup";
			}
		}
	};

	const databaseClear = async (): Promise<void> => {
		try {
			// Show confirmation dialog
			const confirmed = window.confirm(
				"Are you sure you want to clear all ABAC data? This will remove all policies, resources, and configurations. This action cannot be undone."
			);

			if (!confirmed) {
				return;
			}

			// Show loading state
			const button = document.querySelector(
				"[data-clear-button]"
			) as HTMLButtonElement;
			if (button) {
				button.disabled = true;
				button.textContent = "Clearing...";
			}

			await authClient.abac.cleardatabase();
			alert("Database cleared successfully! All ABAC data has been removed.");

			// Clear test results since they're now invalid
			clearResults();

			// Reset button
			if (button) {
				button.disabled = false;
				button.textContent = "Run Database Clear";
			}
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			alert(`Database clear failed: ${errorMessage}`);

			// Reset button on error
			const button = document.querySelector(
				"[data-clear-button]"
			) as HTMLButtonElement;
			if (button) {
				button.disabled = false;
				button.textContent = "Run Database Clear";
			}
		}
	};

	const clearResults = (): void => {
		setTestResults({});
		setSelectedResult(null);
	};

	const formatError = (
		error: string | TestError | null | undefined
	): string => {
		if (!error) return "";
		if (typeof error === "string") return error;
		if (typeof error === "object" && error.message) return error.message;
		return String(error);
	};

	return (
		<div className="container mx-auto p-6 max-w-6xl">
			<div className="mb-8">
				<div className="flex items-center gap-3 mb-4">
					<Shield className="h-8 w-8 text-blue-600" />
					<div>
						<h1 className="text-3xl font-bold">ABAC Permission Testing</h1>
						<p className="text-gray-600 mt-2">
							Test Attribute-Based Access Control permissions using your Better
							Auth ABAC plugin
						</p>
					</div>
				</div>
			</div>

			<div className="flex gap-2 mb-6">
				<Button
					variant="outline"
					size="sm"
					onClick={databbaseSetup}
					data-setup-button
					className="min-w-24"
				>
					Run Database Setup
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={databaseClear}
					data-clear-button
					className="min-w-24"
				>
					Run Database Clear
				</Button>
			</div>

			{/* Info Card about the test data */}
			<Card className="mb-6 border-blue-200 bg-blue-50">
				<CardContent className="pt-6">
					<div className="flex items-start gap-3">
						<Shield className="h-5 w-5 text-blue-600 mt-0.5" />
						<div>
							<h4 className="font-medium text-blue-900 mb-1">
								Test Database Information
							</h4>
							<p className="text-sm text-blue-700 mb-2">
								The database setup creates comprehensive test data including:
							</p>
							<ul className="text-xs text-blue-600 space-y-1">
								<li>
									• <strong>Policies:</strong> Admin full access,
									department-based access, user self-management, security
									policies
								</li>
								<li>
									• <strong>Resources:</strong> Sample documents (doc-456,
									doc-1, doc-2, doc-3) with different confidentiality levels
								</li>
								<li>
									• <strong>Actions:</strong> read, write, delete, share,
									manage, configure, backup, monitor, export operations
								</li>
								<li>
									• <strong>Attributes:</strong> Role-based, department-based,
									time-based, and security-based attributes
								</li>
								<li>
									• <strong>Context:</strong> Environment attributes like secure
									connection, business hours, device type
								</li>
							</ul>
							<p className="text-xs text-blue-600 mt-2">
								Tests include scenarios for different departments (engineering,
								finance, marketing), security levels, and time constraints.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Test Suites */}
			{testSuites.map((suite) => (
				<Card key={suite.title} className="mb-6">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							{suite.icon}
							{suite.title}
						</CardTitle>
						<CardDescription>
							Test permissions for {suite.title.toLowerCase()} operations
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{suite.tests.map((test) => {
								const result = testResults[test.id];
								return (
									<div key={test.id} className="space-y-2">
										<div className="flex items-center justify-between">
											<span className="font-medium">{test.label}</span>
											<div className="flex items-center gap-2">
												{getStatusIcon(result)}
												{getStatusBadge(result)}
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														testPermission(
															test.userId,
															test.resourceId || "system-resource",
															test.id,
															test.resourceType,
															test.actionName,
															test.context || {},
															test.type
														)
													}
													className="min-w-16"
												>
													Test
												</Button>
											</div>
										</div>
										{result && (
											<Alert
												className={`mt-2 ${
													isAllowed(result)
														? "border-green-200 bg-green-50"
														: "border-red-200 bg-red-50"
												}`}
											>
												<AlertDescription className="space-y-2">
													<div className="flex items-center justify-between">
														<span className="font-medium">
															{isAllowed(result)
																? "Access Granted"
																: "Access Denied"}
														</span>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => setSelectedResult(result)}
															className="h-6 px-2 text-xs"
														>
															Details
														</Button>
													</div>
													{getReason(result) && (
														<p className="text-sm text-gray-600">
															{getReason(result)}
														</p>
													)}
													{result.error && (
														<p className="text-sm text-red-600">
															Error: {formatError(result.error)}
														</p>
													)}
													{getProcessingTime(result) && (
														<p className="text-xs text-gray-500">
															Processing time: {getProcessingTime(result)}ms
														</p>
													)}
												</AlertDescription>
											</Alert>
										)}
									</div>
								);
							})}
						</div>
					</CardContent>
				</Card>
			))}

			{/* Special Tests Section */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Lock className="h-5 w-5" />
						Special Tests
					</CardTitle>
					<CardDescription>
						Test special ABAC functionality and multiple resource operations
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="font-medium">ABAC System Test</span>
								<div className="flex items-center gap-2">
									{getStatusIcon(testResults["abac-test"])}
									{getStatusBadge(testResults["abac-test"])}
									<Button
										variant="outline"
										size="sm"
										onClick={testABACEndpoint}
										className="min-w-16"
									>
										Test
									</Button>
								</div>
							</div>
							{testResults["abac-test"] && (
								<Alert className="mt-2 border-blue-200 bg-blue-50">
									<AlertDescription>
										<div className="flex items-center justify-between">
											<span className="font-medium">
												{testResults["abac-test"].message}
											</span>
											<Button
												variant="ghost"
												size="sm"
												onClick={() =>
													setSelectedResult(testResults["abac-test"])
												}
												className="h-6 px-2 text-xs"
											>
												Details
											</Button>
										</div>
									</AlertDescription>
								</Alert>
							)}
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="font-medium">Multiple Resources Test</span>
								<div className="flex items-center gap-2">
									{getStatusIcon(testResults["multi-resource-test"])}
									{getStatusBadge(testResults["multi-resource-test"])}
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											testMultipleResources(
												session?.user?.id || "current-user",
												"read.document",
												["doc-456", "doc-1", "doc-2", "doc-3"],
												{
													isSecureConnection: true,
													timeOfDay: new Date().toTimeString().slice(0, 5),
													deviceType: "desktop",
												},
												"multi-resource-test"
											)
										}
										className="min-w-16"
									>
										Test
									</Button>
								</div>
							</div>
							{testResults["multi-resource-test"] && (
								<Alert className="mt-2 border-purple-200 bg-purple-50">
									<AlertDescription>
										<div className="flex items-center justify-between">
											<span className="font-medium">
												{testResults["multi-resource-test"].data?.decisions
													?.length ||
													testResults["multi-resource-test"].decisions
														?.length ||
													0}{" "}
												resources tested
											</span>
											<Button
												variant="ghost"
												size="sm"
												onClick={() =>
													setSelectedResult(testResults["multi-resource-test"])
												}
												className="h-6 px-2 text-xs"
											>
												Details
											</Button>
										</div>
									</AlertDescription>
								</Alert>
							)}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Action Buttons */}
			<div className="flex gap-4 mb-6">
				<Button onClick={runAllTests} className="flex items-center gap-2">
					<Users className="h-4 w-4" />
					Run All Tests
				</Button>
				<Button variant="outline" onClick={clearResults}>
					Clear Results
				</Button>
			</div>

			{/* Summary */}
			{Object.keys(testResults).length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Test Summary</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
							<div className="text-center">
								<div className="text-2xl font-bold text-green-600">
									{Object.values(testResults).filter(isAllowed).length}
								</div>
								<div className="text-sm text-gray-600">Allowed</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-red-600">
									{
										Object.values(testResults).filter(
											(r) => !isAllowed(r) && !r.error
										).length
									}
								</div>
								<div className="text-sm text-gray-600">Denied</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-yellow-600">
									{Object.values(testResults).filter((r) => r.error).length}
								</div>
								<div className="text-sm text-gray-600">Errors</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-blue-600">
									{Object.keys(testResults).length}
								</div>
								<div className="text-sm text-gray-600">Total Tests</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Test Details Dialog */}
			<Dialog
				open={!!selectedResult}
				onOpenChange={() => setSelectedResult(null)}
			>
				<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Test Result Details</DialogTitle>
						<DialogDescription>
							Detailed information about the ABAC permission test
						</DialogDescription>
					</DialogHeader>
					{selectedResult && (
						<div className="space-y-4">
							<div>
								<h4 className="font-medium mb-1">Decision</h4>
								<div className="flex items-center gap-2">
									{getStatusIcon(selectedResult)}
									<span
										className={
											isAllowed(selectedResult)
												? "text-green-600"
												: "text-red-600"
										}
									>
										{isAllowed(selectedResult) ? "Allowed" : "Denied"}
									</span>
								</div>
							</div>

							{getReason(selectedResult) && (
								<div>
									<h4 className="font-medium mb-1">Reason</h4>
									<p className="text-sm text-gray-600">
										{getReason(selectedResult)}
									</p>
								</div>
							)}

							{getProcessingTime(selectedResult) && (
								<div>
									<h4 className="font-medium mb-1">Processing Time</h4>
									<p className="text-sm text-gray-600">
										{getProcessingTime(selectedResult)}ms
									</p>
								</div>
							)}

							{selectedResult.message && (
								<div>
									<h4 className="font-medium mb-1">Message</h4>
									<p className="text-sm text-gray-600">
										{selectedResult.message}
									</p>
								</div>
							)}

							{selectedResult.parameters && (
								<div>
									<h4 className="font-medium mb-1">Test Parameters</h4>
									<pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
										{JSON.stringify(selectedResult.parameters, null, 2)}
									</pre>
								</div>
							)}

							{(selectedResult.data?.decisions || selectedResult.decisions) && (
								<div>
									<h4 className="font-medium mb-1">
										Multiple Resource Results
									</h4>
									<div className="space-y-2">
										{(
											selectedResult.data?.decisions || selectedResult.decisions
										)?.map((decision, index) => (
											<div
												key={index}
												className="flex items-center gap-2 text-sm"
											>
												{decision.decision === "permit" ? (
													<CheckCircle className="h-4 w-4 text-green-500" />
												) : (
													<XCircle className="h-4 w-4 text-red-500" />
												)}
												<span>
													Resource {index + 1}:{" "}
													{decision.decision === "permit"
														? "Allowed"
														: "Denied"}
												</span>
												{decision.reason && (
													<span className="text-gray-500">
														- {decision.reason}
													</span>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{getAppliedPolicies(selectedResult).length > 0 && (
								<div>
									<h4 className="font-medium mb-1">Applied Policies</h4>
									<div className="flex flex-wrap gap-1">
										{getAppliedPolicies(selectedResult).map((policy, index) => (
											<Badge key={index} variant="outline" className="text-xs">
												{policy}
											</Badge>
										))}
									</div>
								</div>
							)}

							{selectedResult.error && (
								<div>
									<h4 className="font-medium mb-1 text-red-600">Error</h4>
									<p className="text-sm text-red-600 bg-red-50 p-2 rounded">
										{formatError(selectedResult.error)}
									</p>
								</div>
							)}

							{selectedResult.timestamp && (
								<div>
									<h4 className="font-medium mb-1">Timestamp</h4>
									<p className="text-xs text-gray-500">
										{new Date(selectedResult.timestamp).toLocaleString()}
									</p>
								</div>
							)}

							{/* Raw Response for Debugging */}
							<div>
								<h4 className="font-medium mb-1">Raw Response</h4>
								<pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
									{JSON.stringify(selectedResult, null, 2)}
								</pre>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
