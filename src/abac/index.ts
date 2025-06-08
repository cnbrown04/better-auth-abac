import { type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import {
	canUserDelete,
	canUserPerformAction,
	canUserPerformActionOnResources,
	canUserRead,
	canUserWrite,
} from "./funcs";
import { Kysely } from "kysely";
import { Database } from "./database-types";

const abac = (db: Kysely<Database>): BetterAuthPlugin => {
	return {
		id: "abac",
		schema: {
			// Define your ABAC schema here
			user: {
				fields: {
					roleId: {
						type: "string",
						required: true,
						references: { model: "role", field: "id" },
						defaultValue: "USER",
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
		onRequest: async (req, ctx) => {
			const url = new URL(req.url);
			const path = url.pathname;

			if (path.startsWith("/api/auth/sign-up")) {
				// Make sure the role object USER exists, and then insert the user
				const userRole = await db
					.selectFrom("role")
					.where("id", "=", "USER")
					.selectAll()
					.executeTakeFirst();

				if (!userRole) {
					// If the USER role does not exist, create it
					await db
						.insertInto("role")
						.values({
							id: "USER",
							name: "User",
							description: "Default user role",
							color: "#0000FF", // Default color for users
							created_at: new Date(),
							updated_at: new Date(),
						})
						.execute();
				} else {
					console.log("User role already exists:", userRole);
				}
			}

			console.log("ABAC Plugin Request Path:", path);
		},
		hooks: {
			after: [
				{
					matcher: (context) => {
						return context.path.startsWith("/sign-up");
					},
					handler: async (ctx) => {
						try {
							const contextData = ctx as any;

							// Check if user data exists in context
							if (!contextData?.context?.returned?.user) {
								console.warn("No user data found in context");
								return ctx; // Continue processing even without user data
							}

							const user = contextData.context.returned.user;
							const userId = user.id;

							// Validate user ID
							if (!userId) {
								console.error("User ID is missing");
								return {
									message: "User ID is required",
									error: "Missing user ID",
								};
							}

							try {
								// Check if resource type exists
								const resourceType = await db
									.selectFrom("resource_type")
									.where("name", "=", "user")
									.selectAll()
									.executeTakeFirst();

								if (!resourceType) {
									// Create resource type if it doesn't exist
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

										console.log("Resource type 'user' created successfully");
									} catch (error) {
										// Handle duplicate resource type creation (race condition)

										console.error("Error creating resource type:", error);
										return {
											message: "Failed to create resource type",
											error: String(error),
										};
									}
								}

								// Get the resource type ID (either existing or newly created)
								const finalResourceType = resourceType || {
									id: "user.resource_type",
								};

								// Check if user resource already exists
								const existingResource = await db
									.selectFrom("resource")
									.where("id", "=", userId)
									.selectAll()
									.executeTakeFirst();

								if (existingResource) {
									console.log(
										`User resource already exists for user ${userId}`
									);
									return ctx; // Continue processing
								}

								// Create user resource
								try {
									await db
										.insertInto("resource")
										.values({
											id: userId,
											resource_type_id: finalResourceType.id,
											resource_id: userId,
											name: user.name || user.email || "Unnamed User",
											owner_id: userId,
											created_at: new Date(),
										})
										.execute();

									console.log(
										`User resource created successfully for user ${userId}`
									);
								} catch (error) {
									// Handle duplicate resource creation
									console.error("Error creating user resource:", error);
									return {
										message: "Failed to create user resource",
										error: String(error),
										userId: userId,
									};
								}
							} catch (dbError) {
								console.error("Database operation failed:", dbError);
								return {
									message: "Database operation failed",
									error: String(dbError),
									userId: userId,
								};
							}

							return ctx; // Return context to continue processing
						} catch (unexpectedError) {
							console.error("Unexpected error in handler:", unexpectedError);
							return {
								message: "Unexpected error occurred",
								error: String(unexpectedError),
							};
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
						subjectId: z.string(),
						resourceId: z.string().optional(),
						resourceType: z.string().optional(),
						actionName: z.string(),
						context: z.record(z.any()), // This is equivalent to Record<string, any>
					}),
				},
				async (ctx) => {
					// Gather attributes for the subject
					const decision = await canUserPerformAction(db, ctx.body);

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
						userId: z.string(),
						resourceId: z.string(),
						context: z.record(z.any()).optional(), // This is equivalent to Record<string, any>
					}),
				},
				async (ctx) => {
					const decision = await canUserRead(
						db,
						ctx.body.userId,
						ctx.body.resourceId,
						ctx.body.context
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
						userId: z.string(),
						resourceId: z.string(),
						context: z.record(z.any()).optional(), // This is equivalent to Record<string, any>
					}),
				},
				async (ctx) => {
					const decision = await canUserWrite(
						db,

						ctx.body.userId,
						ctx.body.resourceId,
						ctx.body.context
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
				},
				async (ctx) => {
					const decision = await canUserDelete(
						db,
						ctx.body.userId,
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
						userId: z.string(),
						actionName: z.string(),
						resourceIds: z.array(z.string()),
						context: z.record(z.any()).optional(), // This is equivalent to Record<string, any>
					}),
				},
				async (ctx) => {
					const { userId, actionName, resourceIds, context } = ctx.body;

					const decisions = await canUserPerformActionOnResources(
						db,
						userId,
						actionName,
						resourceIds,
						context
					);

					return {
						decisions,
					};
				}
			),
			testEndpoint: createAuthEndpoint(
				"/abac/test",
				{
					method: "GET",
				},
				async (ctx) => {
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

export default abac;
