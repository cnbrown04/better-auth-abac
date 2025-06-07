import { type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import {
	canUserDelete,
	canUserPerformAction,
	canUserPerformActionOnResources,
	canUserRead,
	canUserWrite,
} from "./abac-funcs";
import { resource } from "@/lib/db/schema";

interface AttributeValue {
	id: string;
	name: string;
	type: string;
	category: string;
	value: string;
}

export const abac = () => {
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
		endpoints: {
			canUserPerformAction: createAuthEndpoint(
				"/abac/canUserPerformAction",
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
					const decision = await canUserPerformAction(ctx.body);

					return {
						decision,
					};
				}
			),
			canUserRead: createAuthEndpoint(
				"/abac/canUserRead",
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
				"/abac/canUserWrite",
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
				"/abac/canUserDelete",
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
				"/abac/canUserPerformActionOnResources",
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
