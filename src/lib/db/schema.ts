import {
	mysqlTable,
	mysqlSchema,
	AnyMySqlColumn,
	foreignKey,
	primaryKey,
	varchar,
	text,
	int,
	timestamp,
	unique,
	tinyint,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const accessRequest = mysqlTable(
	"access_request",
	{
		id: varchar({ length: 36 }).notNull(),
		userId: varchar("user_id", { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		resourceId: varchar("resource_id", { length: 36 })
			.notNull()
			.references(() => resource.id, { onDelete: "cascade" }),
		actionId: varchar("action_id", { length: 36 })
			.notNull()
			.references(() => actions.id, { onDelete: "cascade" }),
		decision: text(),
		appliedPolicies: text("applied_policies"),
		requestContext: text("request_context"),
		processingTimeMs: int("processing_time_ms"),
		createdAt: timestamp("created_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "access_request_id" })]
);

export const account = mysqlTable(
	"account",
	{
		id: varchar({ length: 36 }).notNull(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: varchar("user_id", { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			mode: "string",
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			mode: "string",
		}),
		scope: text(),
		password: text(),
		createdAt: timestamp("created_at", { mode: "string" }).notNull(),
		updatedAt: timestamp("updated_at", { mode: "string" }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.id], name: "account_id" })]
);

export const actionAttribute = mysqlTable(
	"action_attribute",
	{
		id: varchar({ length: 36 }).notNull(),
		actionId: varchar("action_id", { length: 36 })
			.notNull()
			.references(() => actions.id, { onDelete: "cascade" }),
		attributeId: varchar("attribute_id", { length: 36 })
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
		value: text().notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "action_attribute_id" })]
);

export const actions = mysqlTable(
	"actions",
	{
		id: varchar({ length: 36 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		description: text(),
		resourceTypeId: varchar("resource_type_id", { length: 36 })
			.notNull()
			.references(() => resourceType.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "actions_id" }),
		unique("actions_name_unique").on(table.name),
	]
);

export const attribute = mysqlTable(
	"attribute",
	{
		id: varchar({ length: 36 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		type: text().notNull(),
		category: text().notNull(),
		description: text(),
		validValues: text("valid_values"),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "attribute_id" }),
		unique("attribute_name_unique").on(table.name),
	]
);

export const dynamicAttribute = mysqlTable(
	"dynamic_attribute",
	{
		id: varchar({ length: 36 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		attributeId: varchar("attribute_id", { length: 36 })
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
		computationRule: text("computation_rule").notNull(),
		cacheTimeoutMinutes: int("cache_timeout_minutes").default(60),
		isActive: tinyint("is_active").default(1),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "dynamic_attribute_id" }),
		unique("dynamic_attribute_name_unique").on(table.name),
	]
);

export const environmentAttribute = mysqlTable(
	"environment_attribute",
	{
		id: varchar({ length: 36 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		attributeId: varchar("attribute_id", { length: 36 })
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
		value: text().notNull(),
		validFrom: timestamp("valid_from", { mode: "string" }),
		validTo: timestamp("valid_to", { mode: "string" }),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "environment_attribute_id" }),
		unique("environment_attribute_name_unique").on(table.name),
	]
);

export const policy = mysqlTable(
	"policy",
	{
		id: varchar({ length: 36 }).notNull(),
		name: text().notNull(),
		description: text(),
		policySetId: varchar("policy_set_id", { length: 36 })
			.notNull()
			.references(() => policySet.id, { onDelete: "cascade" }),
		effect: text().notNull(),
		priority: int().notNull(),
		isActive: tinyint("is_active").default(1),
		rules: text().notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "policy_id" })]
);

export const policyRule = mysqlTable(
	"policy_rule",
	{
		id: varchar({ length: 36 }).notNull(),
		policyId: varchar("policy_id", { length: 36 })
			.notNull()
			.references(() => policy.id, { onDelete: "cascade" }),
		attributeId: varchar("attribute_id", { length: 36 })
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
		operator: text().notNull(),
		value: text().notNull(),
		logicalOperator: text("logical_operator"),
		groupId: text("group_id"),
		createdAt: timestamp("created_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "policy_rule_id" })]
);

export const policySet = mysqlTable(
	"policy_set",
	{
		id: varchar({ length: 36 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		description: text(),
		isActive: tinyint("is_active").default(1),
		priority: int().notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "policy_set_id" }),
		unique("policy_set_name_unique").on(table.name),
	]
);

export const policyTarget = mysqlTable(
	"policy_target",
	{
		id: varchar({ length: 36 }).notNull(),
		policyId: varchar("policy_id", { length: 36 })
			.notNull()
			.references(() => policy.id, { onDelete: "cascade" }),
		targetType: text("target_type").notNull(),
		targetId: text("target_id").notNull(),
		attributeId: varchar("attribute_id", { length: 36 })
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
		operator: text().notNull(),
		value: text().notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "policy_target_id" })]
);

export const resource = mysqlTable(
	"resource",
	{
		id: varchar({ length: 36 }).notNull(),
		resourceTypeId: varchar("resource_type_id", { length: 36 })
			.notNull()
			.references(() => resourceType.id, { onDelete: "cascade" }),
		resourceId: text("resource_id").notNull(),
		name: text().notNull(),
		ownerId: varchar("owner_id", { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "resource_id" })]
);

export const resourceAttribute = mysqlTable(
	"resource_attribute",
	{
		id: varchar({ length: 36 }).notNull(),
		resourceId: varchar("resource_id", { length: 36 })
			.notNull()
			.references(() => resource.id, { onDelete: "cascade" }),
		attributeId: varchar("attribute_id", { length: 36 })
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
		value: text().notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "resource_attribute_id" }),
	]
);

export const resourceType = mysqlTable(
	"resource_type",
	{
		id: varchar({ length: 36 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		description: text(),
		tableName: text("table_name").notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "resource_type_id" }),
		unique("resource_type_name_unique").on(table.name),
	]
);

export const role = mysqlTable(
	"role",
	{
		id: varchar({ length: 36 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		description: text(),
		color: text(),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "role_id" }),
		unique("role_name_unique").on(table.name),
	]
);

export const roleAttribute = mysqlTable(
	"role_attribute",
	{
		id: varchar({ length: 36 }).notNull(),
		roleId: varchar("role_id", { length: 36 })
			.notNull()
			.references(() => role.id, { onDelete: "cascade" }),
		attributeId: varchar("attribute_id", { length: 36 })
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
		value: text().notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "role_attribute_id" })]
);

export const session = mysqlTable(
	"session",
	{
		id: varchar({ length: 36 }).notNull(),
		expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),
		token: varchar({ length: 255 }).notNull(),
		createdAt: timestamp("created_at", { mode: "string" }).notNull(),
		updatedAt: timestamp("updated_at", { mode: "string" }).notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: varchar("user_id", { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "session_id" }),
		unique("session_token_unique").on(table.token),
	]
);

export const user = mysqlTable(
	"user",
	{
		id: varchar({ length: 36 }).notNull(),
		name: text().notNull(),
		email: varchar({ length: 255 }).notNull(),
		emailVerified: tinyint("email_verified").notNull(),
		image: text(),
		createdAt: timestamp("created_at", { mode: "string" }).notNull(),
		updatedAt: timestamp("updated_at", { mode: "string" }).notNull(),
		roleId: varchar("role_id", { length: 36 })
			.notNull()
			.references(() => role.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.id], name: "user_id" }),
		unique("user_email_unique").on(table.email),
	]
);

export const userAttribute = mysqlTable(
	"user_attribute",
	{
		id: varchar({ length: 36 }).notNull(),
		userId: varchar("user_id", { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		attributeId: varchar("attribute_id", { length: 36 })
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
		value: text().notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "user_attribute_id" })]
);

export const verification = mysqlTable(
	"verification",
	{
		id: varchar({ length: 36 }).notNull(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),
		createdAt: timestamp("created_at", { mode: "string" }),
		updatedAt: timestamp("updated_at", { mode: "string" }),
	},
	(table) => [primaryKey({ columns: [table.id], name: "verification_id" })]
);

export const schema = {
	accessRequest,
	account,
	actionAttribute,
	actions,
	attribute,
	dynamicAttribute,
	environmentAttribute,
	policy,
	policyRule,
	policySet,
	policyTarget,
	resource,
	resourceAttribute,
	resourceType,
	role,
	roleAttribute,
	session,
	user,
	userAttribute,
	verification,
};
