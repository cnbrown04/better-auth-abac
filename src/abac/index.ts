import { type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import {
	canUserDelete,
	canUserPerformAction,
	canUserPerformActionOnResources,
	canUserRead,
	canUserWrite,
	type AuthorizationRequest,
	type AuthorizationResult,
	type AttributeValue,
	type PolicyEvaluation,
	type PolicyWithRules,
	gatherUserAttributes,
} from "./funcs";
import { Kysely } from "kysely";
import { type Database } from "./database-types";
import { abacClient } from "./client";
import { createAbacAdapter } from "./adapter";

const abac = (db: Kysely<Database>, debugLogs: boolean) => {
	const handleUserSetup = async (userId: string) => {
		if (!userId) return;

		try {
			// 1. Ensure USER role exists
			const userRole = await db
				.selectFrom("role")
				.where("id", "=", "USER")
				.selectAll()
				.executeTakeFirst();

			if (!userRole) {
				await db
					.insertInto("role")
					.values({
						id: "USER",
						name: "User",
						description: "Default user role",
						color: "#0000FF",
						created_at: new Date(),
						updated_at: new Date(),
					})
					.execute();
			}

			// 2. Ensure user has USER role assigned
			const user = await db
				.selectFrom("user")
				.where("id", "=", userId)
				.selectAll()
				.executeTakeFirst();

			if (user && (user.role_id == null || user.role_id == "")) {
				await db
					.updateTable("user")
					.set({
						role_id: "USER",
						updated_at: new Date(),
					})
					.where("id", "=", userId)
					.executeTakeFirst();
			}

			// 3. Ensure resource type exists
			const resourceType = await db
				.selectFrom("resource_type")
				.where("name", "=", "user")
				.selectAll()
				.executeTakeFirst();

			if (!resourceType) {
				try {
					await db
						.insertInto("resource_type")
						.values({
							id: "user.resource_type",
							name: "user",
							description: "User resource type",
							table_name: "resource",
							created_at: new Date(),
						})
						.execute();
				} catch (error) {
					console.error("Error creating resource type:", error);
				}
			}

			// 4. Ensure user resource exists
			const existingResource = await db
				.selectFrom("resource")
				.where("id", "=", userId)
				.selectAll()
				.executeTakeFirst();

			if (!existingResource) {
				try {
					await db
						.insertInto("resource")
						.values({
							id: userId,
							resource_type_id: resourceType?.id || "user.resource_type",
							resource_id: userId,
							name: user?.name || user?.email || "Unnamed User",
							owner_id: userId,
							created_at: new Date(),
						})
						.execute();
				} catch (error) {
					console.error("Error creating user resource:", error);
				}
			}
		} catch (error) {
			console.error("Error in handleUserSetup:", error);
		}
	};

	return {
		id: "abac",
		schema: {
			// Define your ABAC schema here
			user: {
				fields: {
					roleId: {
						type: "string",
						references: { model: "role", field: "id" },
						defaultValue: `"USER"`,
					},
				},
			},
			role: {
				fields: {
					name: { type: "string", unique: true, required: true },
					description: { type: "string", required: false },
					color: { type: "string", required: false },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					defaultRole: { type: "boolean", defaultValue: false },
				},
			},
			attribute: {
				fields: {
					name: { type: "string", unique: true, required: true },
					type: { type: "string", required: true },
					category: { type: "string", required: true },
					description: { type: "string", required: false },
					validValues: { type: "string", required: false },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			roleAttribute: {
				fields: {
					roleId: {
						type: "string",
						required: true,
						references: { model: "role", field: "id" },
					},
					attributeId: {
						type: "string",
						required: true,
						references: { model: "attribute", field: "id" },
					},
					value: { type: "string", required: true },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			userAttribute: {
				fields: {
					userId: {
						type: "string",
						required: true,
						references: { model: "user", field: "id" },
					},
					attributeId: {
						type: "string",
						required: true,
						references: { model: "attribute", field: "id" },
					},
					value: { type: "string", required: true },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			resourceType: {
				fields: {
					name: { type: "string", unique: true, required: true },
					description: { type: "string", required: false },
					tableName: { type: "string", required: true },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			resource: {
				fields: {
					resourceTypeId: {
						type: "string",
						required: true,
						references: { model: "resourceType", field: "id" },
					},
					resourceId: { type: "string", required: true },
					name: { type: "string", required: true },
					ownerId: {
						type: "string",
						required: true,
						references: { model: "user", field: "id" },
					},
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			resourceAttribute: {
				fields: {
					resourceId: {
						type: "string",
						required: true,
						references: { model: "resource", field: "id" },
					},
					attributeId: {
						type: "string",
						required: true,
						references: { model: "attribute", field: "id" },
					},
					value: { type: "string", required: true },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			actions: {
				fields: {
					name: { type: "string", unique: true, required: true },
					description: { type: "string", required: false },
					resourceTypeId: {
						type: "string",
						required: true,
						references: { model: "resourceType", field: "id" },
					},
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			actionAttribute: {
				fields: {
					actionId: {
						type: "string",
						required: true,
						references: { model: "actions", field: "id" },
					},
					attributeId: {
						type: "string",
						required: true,
						references: { model: "attribute", field: "id" },
					},
					value: { type: "string", required: true },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			environmentAttribute: {
				fields: {
					name: { type: "string", unique: true, required: true }, // e.g., "current_time", "ip_address", "location"
					attributeId: {
						type: "string",
						required: true,
						references: { model: "attribute", field: "id" },
					},
					value: { type: "string", required: true },
					validFrom: { type: "date", required: false },
					validTo: { type: "date", required: false },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			policySet: {
				fields: {
					name: { type: "string", unique: true, required: true },
					description: { type: "string", required: false },
					isActive: { type: "boolean", defaultValue: true },
					priority: { type: "number", required: true, defaultValue: 0 },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			policy: {
				fields: {
					name: { type: "string", required: true },
					description: { type: "string", required: false },
					policySetId: {
						type: "string",
						required: true,
						references: { model: "policySet", field: "id" },
					},
					effect: { type: "string", required: true },
					priority: { type: "number", required: true, defaultValue: 0 },
					isActive: { type: "boolean", defaultValue: true },
					rules: { type: "string", required: true }, // JSON structure for rules
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			policyRule: {
				fields: {
					policyId: {
						type: "string",
						required: true,
						references: { model: "policy", field: "id" },
					},
					attributeId: {
						type: "string",
						required: true,
						references: { model: "attribute", field: "id" },
					},
					operator: { type: "string", required: true }, // e.g., "equals", "not_equals", "greater_than", etc.
					value: { type: "string", required: true }, // Value to compare against
					logicalOperator: { type: "string", required: false }, // e.g., "AND", "OR"
					groupId: { type: "string", required: false }, // For grouping rules
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			policyTarget: {
				fields: {
					policyId: {
						type: "string",
						required: true,
						references: { model: "policy", field: "id" },
					},
					targetType: { type: "string", required: true }, // e.g., "user", "role", "resource"
					targetId: { type: "string", required: true }, // ID of the target (user, role, resource)
					attributeId: {
						type: "string",
						required: true,
						references: { model: "attribute", field: "id" },
					},
					operator: { type: "string", required: true }, // e.g., "equals", "not_equals", etc.
					value: { type: "string", required: true }, // Value to compare against
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			accessRequest: {
				fields: {
					userId: {
						type: "string",
						required: true,
						references: { model: "user", field: "id" },
					},
					resourceId: {
						type: "string",
						required: true,
						references: { model: "resource", field: "id" },
					},
					actionId: {
						type: "string",
						required: true,
						references: { model: "actions", field: "id" },
					},
					decision: { type: "string", required: false }, // e.g., "approved", "denied", "pending"
					appliedPolicies: { type: "string", required: false }, // IDs of policies applied
					requestContext: { type: "string", required: false }, // JSON structure for request context
					processingTimeMs: { type: "number", required: false }, // Time taken to process the request
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
			dynamicAttribute: {
				fields: {
					name: { type: "string", unique: true, required: true },
					attributeId: {
						type: "string",
						required: true,
						references: { model: "attribute", field: "id" },
					},
					computationRule: { type: "string", required: true }, // Rule for dynamic computation
					cacheTimeoutMinutes: {
						type: "number",
						required: false,
						defaultValue: 60,
					}, // Cache timeout in minutes
					isActive: { type: "boolean", defaultValue: true },
					createdAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
					updatedAt: {
						type: "date",
						defaultValue: () => {
							return new Date();
						},
					},
				},
			},
		},

		onRequest: async (req) => {
			const url = new URL(req.url);
			const path = url.pathname;

			if (path.startsWith("/api/auth/sign-up")) {
				// For sign-up, we'll handle this in the after hook
				const userRole = await db
					.selectFrom("role")
					.where("id", "=", "USER")
					.selectAll()
					.executeTakeFirst();

				if (!userRole) {
					await db
						.insertInto("role")
						.values({
							id: "USER",
							name: "User",
							description: "Default user role",
							color: "#0000FF",
							created_at: new Date(),
							updated_at: new Date(),
						})
						.execute();
				}
			}
		},
		hooks: {
			after: [
				{
					matcher: (context) => {
						return context.path.startsWith("/sign-up");
					},
					handler: async (ctx) => {
						let dbConnection: any = null;
						try {
							const contextData = ctx as any;

							if (!contextData?.context?.returned?.user) {
								console.warn("No user data found in context");
								return ctx;
							}

							const user = contextData.context.returned.user;
							const userId = user.id;

							if (!userId) {
								console.error("User ID is missing");
								return {
									message: "User ID is required",
									error: "Missing user ID",
								};
							}

							// Use the shared handleUserSetup function
							await handleUserSetup(userId);
							return ctx;
						} catch (unexpectedError) {
							console.error(
								"Unexpected error in sign-up handler:",
								unexpectedError
							);
							
							// Ensure any database connections are properly cleaned up
							if (dbConnection && typeof dbConnection.destroy === 'function') {
								try {
									await dbConnection.destroy();
								} catch (cleanupError) {
									console.error("Error cleaning up database connection:", cleanupError);
								}
							}
							
							return {
								message: "Unexpected error occurred",
								error: String(unexpectedError),
							};
						}
					},
				},
				{
					matcher: (context) => {
						return context.path.startsWith("/sign-in");
					},
					handler: async (ctx) => {
						let dbConnection: any = null;
						try {
							const contextData = ctx as any;

							if (!contextData?.context?.returned?.user) {
								console.warn("No user data found in context");
								return ctx;
							}

							const user = contextData.context.returned.user;
							const userId = user.id;

							if (!userId) {
								console.warn("User ID is missing in sign-in");
								return ctx;
							}

							// Use the shared handleUserSetup function
							await handleUserSetup(userId);
							return ctx;
						} catch (unexpectedError) {
							console.error(
								"Unexpected error in sign-in handler:",
								unexpectedError
							);
							
							// Ensure any database connections are properly cleaned up
							if (dbConnection && typeof dbConnection.destroy === 'function') {
								try {
									await dbConnection.destroy();
								} catch (cleanupError) {
									console.error("Error cleaning up database connection:", cleanupError);
								}
							}
							
							return ctx; // Continue processing for sign-in
						}
					},
				},
			],
		},
		endpoints: {
			canUserPerformAction: createAuthEndpoint(
				"/abac/canuserperformaction",
				{
					method: "POST",
					body: z.object({
						subjectId: z.string().optional(),
						resourceId: z.string().optional(),
						resourceType: z.string().optional(),
						actionName: z.string(),
						context: z.record(z.any()), // This is equivalent to Record<string, any>
						debug: z.boolean().optional().default(false),
					}),
					metadata: {
						openapi: {
							operationId: "canUserPerformAction",
							summary: "Check if a user can perform an action on a resource",
							description:
								"This endpoint checks if a user can perform a specific action on a resource based on ABAC policies.",
							responses: {
								200: {
									description:
										"Decision on whether the user can perform the action",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													decision: {
														type: "object",
														properties: {
															decision: {
																type: "enum",
																items: ["permit", "deny", "not_applicable"],
															},
															reason: { type: "string", nullable: true },
															appliedPolicies: {
																type: "array",
																items: {
																	type: "object",
																	properties: {
																		policyId: { type: "string" },
																		policyName: { type: "string" },
																	},
																},
															},
															evaluationTimeMs: { type: "number" },
														},
														required: [
															"decision",
															"appliedPolicies",
															"evaluationTimeMs",
														],
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					// Gather attributes for the subject
					const subjectId = ctx.body.subjectId ?? ctx.context.session?.user?.id;

					if (!subjectId) {
						throw ctx.error("BAD_REQUEST", {
							message: "No Subject ID provided or found in session.",
							status: 400,
						});
					}

					const decision = await canUserPerformAction(
						db,
						{
							subjectId: subjectId,
							resourceId: ctx.body.resourceId,
							resourceType: ctx.body.resourceType,
							actionName: ctx.body.actionName,
							context: ctx.body.context,
						},
						{ debug: debugLogs ?? ctx.body.debug }
					);

					return {
						decision,
					};
				}
			),
			canUserRead: createAuthEndpoint(
				"/abac/canuserread",
				{
					method: "POST",
					body: z.object({
						userId: z.string().optional(),
						resourceId: z.string(),
						context: z.record(z.any()).optional(), // This is equivalent to Record<string, any>
						debug: z.boolean().optional().default(false),
					}),
					metadata: {
						openapi: {
							operationId: "canUserRead",
							summary: "Check if a user can read a resource",
							description:
								"This endpoint checks if a user can read a specific resource based on ABAC policies.",
							responses: {
								200: {
									description:
										"Decision on whether the user can read the resource",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													decision: {
														type: "object",
														properties: {
															decision: {
																type: "enum",
																items: ["permit", "deny", "not_applicable"],
															},
															reason: { type: "string", nullable: true },
															appliedPolicies: {
																type: "array",
																items: {
																	type: "object",
																	properties: {
																		policyId: { type: "string" },
																		policyName: { type: "string" },
																	},
																},
															},
															evaluationTimeMs: { type: "number" },
														},
														required: [
															"decision",
															"appliedPolicies",
															"evaluationTimeMs",
														],
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const userId = ctx.body.userId ?? ctx.context.session?.user?.id;

					if (!userId) {
						throw ctx.error("BAD_REQUEST", {
							message: "No User ID provided or found in session.",
							status: 400,
						});
					}

					const decision = await canUserRead(
						db,
						userId,
						ctx.body.resourceId,
						ctx.body.context,
						{ debug: debugLogs ?? ctx.body.debug }
					);
					return {
						decision,
					};
				}
			),
			canUserWrite: createAuthEndpoint(
				"/abac/canuserwrite",
				{
					method: "POST",
					body: z.object({
						userId: z.string().optional(),
						resourceId: z.string(),
						context: z.record(z.any()).optional(), // This is equivalent to Record<string, any>
						debug: z.boolean().optional().default(false),
					}),
					metadata: {
						openapi: {
							operationId: "canUserWrite",
							summary: "Check if a user can write to a resource",
							description:
								"This endpoint checks if a user can write to a specific resource based on ABAC policies.",
							responses: {
								200: {
									description:
										"Decision on whether the user can write to the resource",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													decision: {
														type: "object",
														properties: {
															decision: {
																type: "enum",
																items: ["permit", "deny", "not_applicable"],
															},
															reason: { type: "string", nullable: true },
															appliedPolicies: {
																type: "array",
																items: {
																	type: "object",
																	properties: {
																		policyId: { type: "string" },
																		policyName: { type: "string" },
																	},
																},
															},
															evaluationTimeMs: { type: "number" },
														},
														required: [
															"decision",
															"appliedPolicies",
															"evaluationTimeMs",
														],
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const userId = ctx.body.userId ?? ctx.context.session?.user?.id;

					if (!userId) {
						throw ctx.error("BAD_REQUEST", {
							message: "No Subject ID provided or found in session.",
							status: 400,
						});
					}

					const decision = await canUserWrite(
						db,
						userId,
						ctx.body.resourceId,
						ctx.body.context,
						{ debug: debugLogs ?? ctx.body.debug }
					);
					return {
						decision,
					};
				}
			),
			canUserDelete: createAuthEndpoint(
				"/abac/canuserdelete",
				{
					method: "POST",
					body: z.object({
						userId: z.string(),
						resourceId: z.string(),
						context: z.record(z.any()).optional(), // This is equivalent to Record<string, any>
					}),
					metadata: {
						openapi: {
							operationId: "canUserDelete",
							summary: "Check if a user can delete a resource",
							description:
								"This endpoint checks if a user can delete a specific resource based on ABAC policies.",
							responses: {
								200: {
									description:
										"Decision on whether the user can delete the resource",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													decision: {
														type: "object",
														properties: {
															decision: {
																type: "enum",
																items: ["permit", "deny", "not_applicable"],
															},
															reason: { type: "string", nullable: true },
															appliedPolicies: {
																type: "array",
																items: {
																	type: "object",
																	properties: {
																		policyId: { type: "string" },
																		policyName: { type: "string" },
																	},
																},
															},
															evaluationTimeMs: { type: "number" },
														},
														required: [
															"decision",
															"appliedPolicies",
															"evaluationTimeMs",
														],
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const userId = ctx.body.userId ?? ctx.context.session?.user?.id;

					if (!userId) {
						throw ctx.error("BAD_REQUEST", {
							message: "No Subject ID provided or found in session.",
							status: 400,
						});
					}

					const decision = await canUserDelete(
						db,
						userId,
						ctx.body.resourceId,
						ctx.body.context
					);
					return {
						decision,
					};
				}
			),
			canUserPerformActionOnResources: createAuthEndpoint(
				"/abac/canuserperformactiononresources",
				{
					method: "POST",
					body: z.object({
						userId: z.string().optional(),
						actionName: z.string(),
						resourceIds: z.array(z.string()),
						context: z.record(z.any()).optional(), // This is equivalent to Record<string, any>
						debug: z.boolean().optional().default(false),
					}),
					metadata: {
						openapi: {
							operationId: "canUserPerformActionOnResources",
							summary:
								"Check if a user can perform an action on multiple resources",
							description:
								"This endpoint checks if a user can perform a specific action on multiple resources based on ABAC policies.",
							responses: {
								200: {
									description:
										"Decisions on whether the user can perform the action on each resource",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													decisions: {
														type: "array",
														items: {
															type: "object",
															properties: {
																resourceId: { type: "string" },
																decision: {
																	type: "enum",
																	items: ["permit", "deny", "not_applicable"],
																},
																reason: { type: "string", nullable: true },
																appliedPolicies: {
																	type: "array",
																	items: {
																		type: "object",
																		properties: {
																			policyId: { type: "string" },
																			policyName: { type: "string" },
																		},
																	},
																},
																evaluationTimeMs: { type: "number" },
															},
															required: [
																"resourceId",
																"decision",
																"appliedPolicies",
																"evaluationTimeMs",
															],
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { userId, actionName, resourceIds, context } = ctx.body;

					const subjectId = userId ?? ctx.context.session?.user?.id;

					if (!subjectId) {
						throw ctx.error("BAD_REQUEST", {
							message: "No Subject ID provided or found in session.",
							status: 400,
						});
					}

					const decisions = await canUserPerformActionOnResources(
						db,
						subjectId,
						actionName,
						resourceIds,
						context,
						{ debug: debugLogs ?? ctx.body.debug }
					);

					return {
						decisions,
					};
				}
			),
			gatherUserAttributes: createAuthEndpoint(
				"/abac/gatheruserattributes",
				{
					method: "POST",
					body: z.object({
						userId: z.string(),
						debug: z.boolean().optional().default(false),
					}),
					metadata: {
						openapi: {
							operationId: "gatherUserAttributes",
							summary: "Gather attributes for a user",
						},
					},
				},
				async (ctx) => {
					const userId = ctx.body.userId ?? ctx.context.session?.user?.id;

					if (!userId) {
						throw ctx.error("BAD_REQUEST", {
							message: "No User ID provided or found in session.",
							status: 400,
						});
					}

					const attributes = await gatherUserAttributes(db, userId, {
						debug: debugLogs ?? ctx.body.debug,
					});

					return {
						attributes,
					};
				}
			),
			testEndpoint: createAuthEndpoint(
				"/abac/test",
				{
					method: "GET",
				},
				async () => {
					try {
						return {
							message: "ABAC plugin is working!",
						};
					} catch (error) {
						return {
							message: "Error in ABAC plugin",
							error: String(error),
						};
					}
				}
			),
		},
	} satisfies BetterAuthPlugin;
};

export {
	abac,
	abacClient,
	createAbacAdapter,
	type AuthorizationResult,
	type AuthorizationRequest,
	type AttributeValue,
	type PolicyEvaluation,
	type PolicyWithRules,
};
