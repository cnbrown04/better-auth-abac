import { db } from "./abac-config"; // Adjust import path as needed
import { nanoid } from "nanoid"; // For generating UUIDs

// Types for ABAC entities based on your schema
interface ActionData {
	name: string;
	description?: string;
	resource_type_id: string;
}

interface ResourceTypeData {
	name: string;
	description?: string;
	table_name: string;
}

interface AttributeData {
	name: string;
	type: string; // 'string' | 'number' | 'boolean' | 'array'
	description?: string;
	category: string; // 'subject' | 'resource' | 'environment' | 'action'
	valid_values?: string; // JSON string of valid values
}

interface PolicySetData {
	name: string;
	description?: string;
	priority: number;
	is_active?: number;
}

interface PolicyData {
	name: string;
	description?: string;
	effect: "permit" | "deny";
	rules: string; // JSON condition expression
	priority: number;
	policy_set_id: string;
	is_active?: number;
}

interface RoleData {
	id: string; // Unique identifier for the role
	name: string;
	description?: string;
	color?: string;
}

// Create Resource Types
export async function createResourceTypes(): Promise<Record<string, string>> {
	const resourceTypes: ResourceTypeData[] = [
		{
			name: "user",
			description: "User profiles and accounts",
			table_name: "resource",
		},
		{
			name: "document",
			description: "Documents and files",
			table_name: "resource",
		},
		{
			name: "system",
			description: "System configuration and settings",
			table_name: "resource",
		},
		{
			name: "billing",
			description: "Billing and payment information",
			table_name: "resource",
		},
		{
			name: "analytics",
			description: "Analytics and reporting data",
			table_name: "resource",
		},
		{
			name: "project",
			description: "Projects and workspaces",
			table_name: "resource",
		},
		{
			name: "organization",
			description: "Organization settings and data",
			table_name: "resource",
		},
	];

	const createdIds: Record<string, string> = {};

	for (const resourceType of resourceTypes) {
		const id = nanoid();
		await db
			.insertInto("resource_type")
			.values({
				id,
				name: resourceType.name,
				description: resourceType.description,
				table_name: resourceType.table_name,
				created_at: new Date(),
			})
			.execute();

		createdIds[resourceType.name] = id;
	}

	console.log(`Created ${resourceTypes.length} resource types`, createdIds);
	return createdIds;
}

// Create Actions
export async function createActions(
	resourceTypeIds: Record<string, string>
): Promise<Record<string, string>> {
	const actions: (Omit<ActionData, "resource_type_id"> & {
		resource_type: string;
	})[] = [
		// Basic CRUD actions
		{
			name: "read.user",
			description: "Read/view access to resources",
			resource_type: "user",
		},
		{
			name: "write.user",
			description: "Write/modify access to resources",
			resource_type: "user",
		},
		{
			name: "delete.user",
			description: "Delete access to resources",
			resource_type: "user",
		},

		// Document-specific actions
		{
			name: "read.document",
			description: "View document content",
			resource_type: "document",
		},
		{
			name: "write.document",
			description: "Edit document content",
			resource_type: "document",
		},
		{
			name: "delete.document",
			description: "Delete document",
			resource_type: "document",
		},
		{
			name: "share.document",
			description: "Share document with others",
			resource_type: "document",
		},

		// User management actions
		{
			name: "manage.user",
			description: "Manage users",
			resource_type: "system",
		},

		// System actions
		{
			name: "configure.system",
			description: "Configure system settings",
			resource_type: "system",
		},
		{
			name: "backup.system",
			description: "Perform system backup",
			resource_type: "system",
		},
		{
			name: "monitor.system",
			description: "Monitor system health",
			resource_type: "system",
		},

		// Financial actions
		{
			name: "read.billing",
			description: "View billing information",
			resource_type: "billing",
		},
		{
			name: "write.billing",
			description: "Modify billing settings",
			resource_type: "billing",
		},
		{
			name: "view.analytics",
			description: "View analytics data",
			resource_type: "analytics",
		},
		{
			name: "export.analytics",
			description: "Export analytics data",
			resource_type: "analytics",
		},
	];

	const createdIds: Record<string, string> = {};

	for (const action of actions) {
		const id = nanoid();
		const key = `${action.name}-${action.resource_type}`;
		const resourceTypeId = resourceTypeIds[action.resource_type];

		await db
			.insertInto("actions")
			.values({
				id,
				name: action.name,
				description: action.description,
				resource_type_id: resourceTypeId ?? "",
				created_at: new Date(),
			})
			.execute();

		createdIds[key] = id;
	}

	console.log(`Created ${actions.length} actions`);
	return createdIds;
}

// Create Attributes
export async function createAttributes(): Promise<Record<string, string>> {
	const attributes: AttributeData[] = [
		// Subject attributes (user attributes)
		{
			name: "role",
			type: "string",
			description: "User role (admin, user, manager)",
			category: "subject",
			valid_values: JSON.stringify(["admin", "manager", "user"]),
		},
		{
			name: "user.department",
			type: "string",
			description: "User department",
			category: "subject",
		},
		{
			name: "permissions",
			type: "array",
			description: "User permissions list",
			category: "subject",
		},
		{
			name: "isActive",
			type: "boolean",
			description: "User account status",
			category: "subject",
		},
		{
			name: "clearanceLevel",
			type: "number",
			description: "Security clearance level",
			category: "subject",
		},
		{
			name: "user.organizationId",
			type: "string",
			description: "User organization ID",
			category: "subject",
		},

		// Resource attributes
		{
			name: "owner",
			type: "string",
			description: "Resource owner ID",
			category: "resource",
		},
		{
			name: "resource.department",
			type: "string",
			description: "Resource department",
			category: "resource",
		},
		{
			name: "confidentiality",
			type: "string",
			description: "Confidentiality level",
			category: "resource",
			valid_values: JSON.stringify([
				"public",
				"internal",
				"confidential",
				"restricted",
			]),
		},
		{
			name: "classification",
			type: "number",
			description: "Security classification level",
			category: "resource",
		},
		{
			name: "tags",
			type: "array",
			description: "Resource tags",
			category: "resource",
		},
		{
			name: "resource.organizationId",
			type: "string",
			description: "Resource organization ID",
			category: "resource",
		},
		{
			name: "projectId",
			type: "string",
			description: "Associated project ID",
			category: "resource",
		},

		// Environment attributes
		{
			name: "timeOfDay",
			type: "string",
			description: "Current time of day",
			category: "environment",
		},
		{
			name: "ipAddress",
			type: "string",
			description: "Client IP address",
			category: "environment",
		},
		{
			name: "location",
			type: "string",
			description: "Geographic location",
			category: "environment",
		},
		{
			name: "deviceType",
			type: "string",
			description: "Device type",
			category: "environment",
			valid_values: JSON.stringify(["mobile", "desktop", "tablet"]),
		},
		{
			name: "isSecureConnection",
			type: "boolean",
			description: "HTTPS connection status",
			category: "environment",
		},

		// Action attributes
		{
			name: "actionType",
			type: "string",
			description: "Type of action being performed",
			category: "action",
		},
		{
			name: "riskLevel",
			type: "string",
			description: "Risk level of the action",
			category: "action",
		},
	];

	const createdIds: Record<string, string> = {};

	for (const attribute of attributes) {
		const id = nanoid();
		const key = `${attribute.category}-${attribute.name}`;

		await db
			.insertInto("attribute")
			.values({
				id,
				name: attribute.name,
				type: attribute.type,
				description: attribute.description,
				category: attribute.category,
				valid_values: attribute.valid_values,
				created_at: new Date(),
				updated_at: new Date(),
			})
			.execute();

		createdIds[key] = id;
	}

	console.log(`Created ${attributes.length} attributes`);
	return createdIds;
}

// Create Roles
export async function createRoles(): Promise<Record<string, string>> {
	const roles: RoleData[] = [
		// {
		// 	id: "ADMIN",
		// 	name: "Admin",
		// 	description: "System Administrator",
		// 	color: "#dc2626",
		// },
		// {
		// 	id: "MANAGER",
		// 	name: "Manager",
		// 	description: "Department Manager",
		// 	color: "#2563eb",
		// },
		// { id: "GUEST", name: "Guest", description: "Guest User", color: "#6b7280" },
	];

	const createdIds: Record<string, string> = {};

	for (const role of roles) {
		const id = nanoid();

		await db
			.insertInto("role")
			.values({
				id: role.id,
				name: role.name,
				description: role.description,
				color: role.color,
				created_at: new Date(),
				updated_at: new Date(),
			})
			.execute();

		createdIds[role.name] = id;
	}

	console.log(`Created ${roles.length} roles`);
	return createdIds;
}

// Create Policy Sets
export async function createPolicySets(): Promise<Record<string, string>> {
	const policySets: PolicySetData[] = [
		{
			name: "default-policies",
			description: "Default system policies",
			priority: 100,
			is_active: 1,
		},
		{
			name: "admin-policies",
			description: "Administrator policies",
			priority: 200,
			is_active: 1,
		},
		{
			name: "user-policies",
			description: "User-specific policies",
			priority: 150,
			is_active: 1,
		},
		{
			name: "security-policies",
			description: "Security and compliance policies",
			priority: 300,
			is_active: 1,
		},
	];

	const createdIds: Record<string, string> = {};

	for (const policySet of policySets) {
		const id = nanoid();

		await db
			.insertInto("policy_set")
			.values({
				id,
				name: policySet.name,
				description: policySet.description,
				priority: policySet.priority,
				is_active: policySet.is_active || 1,
				created_at: new Date(),
				updated_at: new Date(),
			})
			.execute();

		createdIds[policySet.name] = id;
	}

	console.log(`Created ${policySets.length} policy sets`);
	return createdIds;
}

// Create Policies
export async function createPolicies(
	policySetIds: Record<string, string>
): Promise<void> {
	const policies: (Omit<PolicyData, "policy_set_id"> & {
		policy_set: string;
	})[] = [
		// Admin policies
		{
			name: "admin-full-access",
			description: "Administrators have full access to all resources",
			effect: "permit",
			rules: JSON.stringify({
				operator: "equals",
				attribute: "subject.role_id",
				value: "ADMIN",
			}),
			priority: 100,
			policy_set: "admin-policies",
			is_active: 1,
		},

		// User self-management policies
		{
			name: "user-self-read",
			description: "Users can read their own profile",
			effect: "permit",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "equals",
						attribute: "resource.type",
						value: "user",
					},
					{
						operator: "equals",
						attribute: "subject.id",
						value: "${resource.owner}",
					},
				],
			}),
			priority: 50,
			policy_set: "user-policies",
			is_active: 1,
		},

		{
			name: "user-self-update",
			description: "Users can update their own profile",
			effect: "permit",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "equals",
						attribute: "resource.type",
						value: "user",
					},
					{
						operator: "equals",
						attribute: "subject.id",
						value: "${resource.owner}",
					},
					{
						operator: "equals",
						attribute: "action.name",
						value: "write",
					},
				],
			}),
			priority: 50,
			policy_set: "user-policies",
			is_active: 1,
		},

		// Document policies
		{
			name: "document-department-access",
			description: "Users can access documents from their department",
			effect: "permit",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "equals",
						attribute: "resource.type",
						value: "document",
					},
					{
						operator: "equals",
						attribute: "subject.department",
						value: "${resource.department}",
					},
					{
						operator: "equals",
						attribute: "action.name",
						value: "read",
					},
				],
			}),
			priority: 40,
			policy_set: "user-policies",
			is_active: 1,
		},

		{
			name: "document-owner-full-access",
			description: "Document owners have full access to their documents",
			effect: "permit",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "equals",
						attribute: "resource.type",
						value: "document",
					},
					{
						operator: "equals",
						attribute: "subject.id",
						value: "${resource.owner}",
					},
				],
			}),
			priority: 60,
			policy_set: "user-policies",
			is_active: 1,
		},

		// Manager policies
		{
			name: "manager-department-access",
			description: "Managers can access all resources in their department",
			effect: "permit",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "equals",
						attribute: "subject.role_id",
						value: "MANAGER",
					},
					{
						operator: "equals",
						attribute: "subject.department",
						value: "${resource.department}",
					},
					{
						operator: "in",
						attribute: "action.name",
						value: ["read", "write"],
					},
				],
			}),
			priority: 70,
			policy_set: "user-policies",
			is_active: 1,
		},

		// System policies
		{
			name: "system-admin-only",
			description: "Only admins can access system resources",
			effect: "permit",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "equals",
						attribute: "resource.type",
						value: "system",
					},
					{
						operator: "equals",
						attribute: "subject.role_id",
						value: "ADMIN",
					},
				],
			}),
			priority: 80,
			policy_set: "admin-policies",
			is_active: 1,
		},

		// Billing policies
		{
			name: "billing-admin-finance",
			description: "Only admins and finance department can access billing",
			effect: "permit",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "equals",
						attribute: "resource.type",
						value: "billing",
					},
					{
						operator: "or",
						conditions: [
							{
								operator: "equals",
								attribute: "subject.role_id",
								value: "ADMIN",
							},
							{
								operator: "equals",
								attribute: "subject.department",
								value: "finance",
							},
						],
					},
				],
			}),
			priority: 60,
			policy_set: "default-policies",
			is_active: 1,
		},

		// Analytics policies
		{
			name: "analytics-manager-plus",
			description: "Managers and above can view analytics",
			effect: "permit",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "equals",
						attribute: "resource.type",
						value: "analytics",
					},
					{
						operator: "in",
						attribute: "subject.role_id",
						value: ["ADMIN", "MANAGER"],
					},
					{
						operator: "equals",
						attribute: "action.name",
						value: "view",
					},
				],
			}),
			priority: 50,
			policy_set: "default-policies",
			is_active: 1,
		},

		// Security policies
		{
			name: "secure-connection-required",
			description: "Secure connection required for sensitive operations",
			effect: "deny",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "in",
						attribute: "resource.confidentiality",
						value: ["confidential", "restricted"],
					},
					{
						operator: "equals",
						attribute: "environment.isSecureConnection",
						value: false,
					},
				],
			}),
			priority: 90,
			policy_set: "security-policies",
			is_active: 1,
		},

		// Time-based policies
		{
			name: "business-hours-only",
			description: "Certain operations only allowed during business hours",
			effect: "deny",
			rules: JSON.stringify({
				operator: "and",
				conditions: [
					{
						operator: "in",
						attribute: "action.name",
						value: ["delete", "backup"],
					},
					{
						operator: "not",
						condition: {
							operator: "between",
							attribute: "environment.timeOfDay",
							value: ["09:00", "17:00"],
						},
					},
				],
			}),
			priority: 80,
			policy_set: "security-policies",
			is_active: 1,
		},
	];

	for (const policy of policies) {
		const id = nanoid();

		await db
			.insertInto("policy")
			.values({
				id,
				name: policy.name,
				description: policy.description,
				effect: policy.effect,
				rules: policy.rules,
				priority: policy.priority,
				policy_set_id: policySetIds[policy.policy_set],
				is_active: policy.is_active || 1,
				created_at: new Date(),
				updated_at: new Date(),
			})
			.execute();
	}

	console.log(`Created ${policies.length} policies`);
}

// Create sample resources for testing
export async function createSampleResources(
	resourceTypeIds: Record<string, string>,
	attributeIds: Record<string, string>,
	userId: string
): Promise<void> {
	const sampleResources = [
		{
			id: "doc-456",
			name: "Engineering Specification Document",
			resource_id: "doc-456",
			resource_type: "document",
			owner_id: userId,
			attributes: {
				"resource-owner": userId,
				"resource-department": "engineering",
				"resource-confidentiality": "internal",
				"resource-classification": "2",
				"resource-tags": JSON.stringify(["technical", "specification"]),
				"resource-organizationId": "org-1",
			},
		},
		{
			id: "doc-1",
			name: "Marketing Document 1",
			resource_id: "doc-1",
			resource_type: "document",
			owner_id: userId,
			attributes: {
				"resource-owner": userId,
				"resource-department": "marketing",
				"resource-confidentiality": "public",
				"resource-classification": "1",
				"resource-organizationId": "org-1",
			},
		},
		{
			id: "doc-2",
			name: "Confidential Engineering Document",
			resource_id: "doc-2",
			resource_type: "document",
			owner_id: userId,
			attributes: {
				"resource-owner": userId,
				"resource-department": "engineering",
				"resource-confidentiality": "confidential",
				"resource-classification": "3",
				"resource-organizationId": "org-1",
			},
		},
		{
			id: "doc-3",
			name: "Finance Report",
			resource_id: "doc-3",
			resource_type: "document",
			owner_id: userId,
			attributes: {
				"resource-owner": userId,
				"resource-department": "finance",
				"resource-confidentiality": "internal",
				"resource-classification": "2",
				"resource-organizationId": "org-1",
			},
		},
	];

	for (const resource of sampleResources) {
		// Create the resource
		await db
			.insertInto("resource")
			.values({
				id: resource.id,
				name: resource.name,
				resource_id: resource.resource_id,
				resource_type_id: resourceTypeIds[resource.resource_type],
				owner_id: resource.owner_id,
				created_at: new Date(),
			})
			.execute();

		// Create resource attributes
		for (const [attrKey, value] of Object.entries(resource.attributes)) {
			const attributeId = attributeIds[attrKey];
			if (attributeId) {
				await db
					.insertInto("resource_attribute")
					.values({
						id: nanoid(),
						resource_id: resource.id,
						attribute_id: attributeId,
						value: String(value),
						created_at: new Date(),
						updated_at: new Date(),
					})
					.execute();
			}
		}
	}

	console.log(`Created ${sampleResources.length} sample resources`);
}

// Main setup function to run all migrations
export async function setupABACDatabase(userId: string): Promise<{
	resourceTypeIds: Record<string, string>;
	actionIds: Record<string, string>;
	attributeIds: Record<string, string>;
	roleIds: Record<string, string>;
	policySetIds: Record<string, string>;
}> {
	console.log("Setting up ABAC database...");

	try {
		const resourceTypeIds = await createResourceTypes();
		const actionIds = await createActions(resourceTypeIds);
		const attributeIds = await createAttributes();
		const roleIds = await createRoles();
		const policySetIds = await createPolicySets();

		await createPolicies(policySetIds);
		await createSampleResources(resourceTypeIds, attributeIds, userId);

		console.log("ABAC database setup completed successfully!");
		return {
			resourceTypeIds,
			actionIds,
			attributeIds,
			roleIds,
			policySetIds,
		};
	} catch (error) {
		console.error("Error setting up ABAC database:", error);
		throw error;
	}
}

// Individual cleanup functions
export async function clearABACData(): Promise<void> {
	console.log("Clearing ABAC data...");

	try {
		// Delete in correct order to respect foreign key constraints
		await db.deleteFrom("user_attribute").execute();
		await db.deleteFrom("resource_attribute").execute();
		await db.deleteFrom("role_attribute").execute();
		await db.deleteFrom("action_attribute").execute();
		await db.deleteFrom("environment_attribute").execute();
		await db.deleteFrom("policy_rule").execute();
		await db.deleteFrom("policy_target").execute();
		await db.deleteFrom("policy").execute();
		await db.deleteFrom("policy_set").execute();
		await db.deleteFrom("resource").execute();
		await db.deleteFrom("actions").execute();
		await db.deleteFrom("resource_type").execute();
		await db.deleteFrom("attribute").execute();
		await db.deleteFrom("dynamic_attribute").execute();
		await db.deleteFrom("access_request").execute();

		console.log("ABAC data cleared successfully!");
	} catch (error) {
		console.error("Error clearing ABAC data:", error);
		throw error;
	}
}

// Helper function to create environment attributes for testing
export async function createEnvironmentAttributes(
	attributeIds: Record<string, string>
): Promise<void> {
	const envAttributes = [
		{
			name: "current-session",
			attribute_key: "environment-timeOfDay",
			value: new Date().toTimeString().slice(0, 5), // HH:MM format
		},
		{
			name: "secure-connection",
			attribute_key: "environment-isSecureConnection",
			value: "true",
		},
		{
			name: "office-location",
			attribute_key: "environment-location",
			value: "headquarters",
		},
		{
			name: "desktop-device",
			attribute_key: "environment-deviceType",
			value: "desktop",
		},
	];

	for (const envAttr of envAttributes) {
		const attributeId = attributeIds[envAttr.attribute_key];
		if (attributeId) {
			await db
				.insertInto("environment_attribute")
				.values({
					id: nanoid(),
					name: envAttr.name,
					attribute_id: attributeId,
					value: envAttr.value,
					valid_from: new Date(),
					valid_to: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valid for 24 hours
					created_at: new Date(),
					updated_at: new Date(),
				})
				.execute();
		}
	}

	console.log(`Created ${envAttributes.length} environment attributes`);
}

// Helper function to create action attributes
export async function createActionAttributes(
	actionIds: Record<string, string>,
	attributeIds: Record<string, string>
): Promise<void> {
	const actionAttributes = [
		{
			action_key: "read-user",
			attribute_key: "action-actionType",
			value: "read",
		},
		{
			action_key: "write-user",
			attribute_key: "action-actionType",
			value: "write",
		},
		{
			action_key: "delete-user",
			attribute_key: "action-actionType",
			value: "delete",
		},
		{
			action_key: "read-document",
			attribute_key: "action-actionType",
			value: "read",
		},
		{
			action_key: "write-document",
			attribute_key: "action-actionType",
			value: "write",
		},
		{
			action_key: "delete-document",
			attribute_key: "action-actionType",
			value: "delete",
		},
		{
			action_key: "configure-system",
			attribute_key: "action-riskLevel",
			value: "high",
		},
		{
			action_key: "backup-system",
			attribute_key: "action-riskLevel",
			value: "medium",
		},
		{
			action_key: "delete-document",
			attribute_key: "action-riskLevel",
			value: "high",
		},
		{
			action_key: "delete-user",
			attribute_key: "action-riskLevel",
			value: "critical",
		},
	];

	for (const actionAttr of actionAttributes) {
		const actionId = actionIds[actionAttr.action_key];
		const attributeId = attributeIds[actionAttr.attribute_key];

		if (actionId && attributeId) {
			await db
				.insertInto("action_attribute")
				.values({
					id: nanoid(),
					action_id: actionId,
					attribute_id: attributeId,
					value: actionAttr.value,
					created_at: new Date(),
				})
				.execute();
		}
	}

	console.log(`Created ${actionAttributes.length} action attributes`);
}

// Helper function to create role attributes
export async function createRoleAttributes(
	roleIds: Record<string, string>,
	attributeIds: Record<string, string>
): Promise<void> {
	const roleAttributes = [
		{ role: "ADMIN", attribute_key: "subject-clearanceLevel", value: "4" },
		{
			role: "ADMIN",
			attribute_key: "subject-permissions",
			value: JSON.stringify(["read", "write", "delete", "admin"]),
		},
		{ role: "MANAGER", attribute_key: "subject-clearanceLevel", value: "3" },
		{
			role: "MANAGER",
			attribute_key: "subject-permissions",
			value: JSON.stringify(["read", "write", "manage"]),
		},
		{ role: "USER", attribute_key: "subject-clearanceLevel", value: "2" },
		{
			role: "USER",
			attribute_key: "subject-permissions",
			value: JSON.stringify(["read", "write"]),
		},
		{ role: "GUEST", attribute_key: "subject-clearanceLevel", value: "1" },
		{
			role: "GUEST",
			attribute_key: "subject-permissions",
			value: JSON.stringify(["read"]),
		},
	];

	for (const roleAttr of roleAttributes) {
		const attributeId = attributeIds[roleAttr.attribute_key];

		if (attributeId) {
			await db
				.insertInto("role_attribute")
				.values({
					id: nanoid(),
					role_id: roleAttr.role,
					attribute_id: attributeId,
					value: roleAttr.value,
					created_at: new Date(),
					updated_at: new Date(),
				})
				.execute();
		}
	}

	console.log(`Created ${roleAttributes.length} role attributes`);
}

// Enhanced setup function with all attributes
export async function setupABACDatabaseComplete(userId: string): Promise<any> {
	console.log("Setting up complete ABAC database...");

	try {
		const resourceTypeIds = await createResourceTypes();
		const actionIds = await createActions(resourceTypeIds);
		const attributeIds = await createAttributes();
		const roleIds = await createRoles();
		const policySetIds = await createPolicySets();

		await createPolicies(policySetIds);
		await createSampleResources(resourceTypeIds, attributeIds, userId);

		// Create additional attribute relationships
		await createEnvironmentAttributes(attributeIds);
		await createActionAttributes(actionIds, attributeIds);
		await createRoleAttributes(roleIds, attributeIds);

		console.log("Complete ABAC database setup finished successfully!");
		return {
			resourceTypeIds,
			actionIds,
			attributeIds,
			roleIds,
			policySetIds,
		};
	} catch (error) {
		console.error("Error setting up complete ABAC database:", error);
		throw error;
	}
}

// Usage example:
/*
import { setupABACDatabaseComplete, clearABACData } from './abac-setup';

// To set up the complete database:
await setupABACDatabaseComplete();

// To clear all ABAC data:
await clearABACData();

// To run individual functions:
const resourceTypeIds = await createResourceTypes();
const actionIds = await createActions(resourceTypeIds);
// etc.
*/
