import { mysqlTable, varchar, text, timestamp, boolean, int } from "drizzle-orm/mysql-core";

export const user = mysqlTable("user", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: text('name').notNull(),
 email: varchar('email', { length: 255 }).notNull().unique(),
 emailVerified: boolean('email_verified').$defaultFn(() => false).notNull(),
 image: text('image'),
 createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
 updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
 roleId: text('role_id').notNull().references(()=> role.id, { onDelete: 'cascade' })
				});

export const session = mysqlTable("session", {
					id: varchar('id', { length: 36 }).primaryKey(),
					expiresAt: timestamp('expires_at').notNull(),
 token: varchar('token', { length: 255 }).notNull().unique(),
 createdAt: timestamp('created_at').notNull(),
 updatedAt: timestamp('updated_at').notNull(),
 ipAddress: text('ip_address'),
 userAgent: text('user_agent'),
 userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' })
				});

export const account = mysqlTable("account", {
					id: varchar('id', { length: 36 }).primaryKey(),
					accountId: text('account_id').notNull(),
 providerId: text('provider_id').notNull(),
 userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
 accessToken: text('access_token'),
 refreshToken: text('refresh_token'),
 idToken: text('id_token'),
 accessTokenExpiresAt: timestamp('access_token_expires_at'),
 refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
 scope: text('scope'),
 password: text('password'),
 createdAt: timestamp('created_at').notNull(),
 updatedAt: timestamp('updated_at').notNull()
				});

export const verification = mysqlTable("verification", {
					id: varchar('id', { length: 36 }).primaryKey(),
					identifier: text('identifier').notNull(),
 value: text('value').notNull(),
 expiresAt: timestamp('expires_at').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
 updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date())
				});

export const role = mysqlTable("role", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: varchar('name', { length: 255 }).notNull().unique(),
 description: text('description'),
 color: text('color'),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});

export const attribute = mysqlTable("attribute", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: varchar('name', { length: 255 }).notNull().unique(),
 type: text('type').notNull(),
 category: text('category').notNull(),
 description: text('description'),
 validValues: text('valid_values'),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});

export const roleAttribute = mysqlTable("role_attribute", {
					id: varchar('id', { length: 36 }).primaryKey(),
					roleId: text('role_id').notNull().references(()=> role.id, { onDelete: 'cascade' }),
 attributeId: text('attribute_id').notNull().references(()=> attribute.id, { onDelete: 'cascade' }),
 value: text('value').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});

export const userAttribute = mysqlTable("user_attribute", {
					id: varchar('id', { length: 36 }).primaryKey(),
					userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
 attributeId: text('attribute_id').notNull().references(()=> attribute.id, { onDelete: 'cascade' }),
 value: text('value').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});

export const resourceType = mysqlTable("resource_type", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: varchar('name', { length: 255 }).notNull().unique(),
 description: text('description'),
 tableName: text('table_name').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            })
				});

export const resource = mysqlTable("resource", {
					id: varchar('id', { length: 36 }).primaryKey(),
					resourceTypeId: text('resource_type_id').notNull().references(()=> resourceType.id, { onDelete: 'cascade' }),
 resourceId: text('resource_id').notNull(),
 name: text('name').notNull(),
 ownerId: text('owner_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            })
				});

export const resourceAttribute = mysqlTable("resource_attribute", {
					id: varchar('id', { length: 36 }).primaryKey(),
					resourceId: text('resource_id').notNull().references(()=> resource.id, { onDelete: 'cascade' }),
 attributeId: text('attribute_id').notNull().references(()=> attribute.id, { onDelete: 'cascade' }),
 value: text('value').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});

export const actions = mysqlTable("actions", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: varchar('name', { length: 255 }).notNull().unique(),
 description: text('description'),
 resourceTypeId: text('resource_type_id').notNull().references(()=> resourceType.id, { onDelete: 'cascade' }),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            })
				});

export const actionAttribute = mysqlTable("action_attribute", {
					id: varchar('id', { length: 36 }).primaryKey(),
					actionId: text('action_id').notNull().references(()=> actions.id, { onDelete: 'cascade' }),
 attributeId: text('attribute_id').notNull().references(()=> attribute.id, { onDelete: 'cascade' }),
 value: text('value').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            })
				});

export const environmentAttribute = mysqlTable("environment_attribute", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: varchar('name', { length: 255 }).notNull().unique(),
 attributeId: text('attribute_id').notNull().references(()=> attribute.id, { onDelete: 'cascade' }),
 value: text('value').notNull(),
 validFrom: timestamp('valid_from'),
 validTo: timestamp('valid_to'),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});

export const policySet = mysqlTable("policy_set", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: varchar('name', { length: 255 }).notNull().unique(),
 description: text('description'),
 isActive: boolean('is_active').default(true),
 priority: int('priority').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});

export const policy = mysqlTable("policy", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: text('name').notNull(),
 description: text('description'),
 policySetId: text('policy_set_id').notNull().references(()=> policySet.id, { onDelete: 'cascade' }),
 effect: text('effect').notNull(),
 priority: int('priority').notNull(),
 isActive: boolean('is_active').default(true),
 rules: text('rules').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});

export const policyRule = mysqlTable("policy_rule", {
					id: varchar('id', { length: 36 }).primaryKey(),
					policyId: text('policy_id').notNull().references(()=> policy.id, { onDelete: 'cascade' }),
 attributeId: text('attribute_id').notNull().references(()=> attribute.id, { onDelete: 'cascade' }),
 operator: text('operator').notNull(),
 value: text('value').notNull(),
 logicalOperator: text('logical_operator'),
 groupId: text('group_id'),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            })
				});

export const policyTarget = mysqlTable("policy_target", {
					id: varchar('id', { length: 36 }).primaryKey(),
					policyId: text('policy_id').notNull().references(()=> policy.id, { onDelete: 'cascade' }),
 targetType: text('target_type').notNull(),
 targetId: text('target_id').notNull(),
 attributeId: text('attribute_id').notNull().references(()=> attribute.id, { onDelete: 'cascade' }),
 operator: text('operator').notNull(),
 value: text('value').notNull(),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            })
				});

export const accessRequest = mysqlTable("access_request", {
					id: varchar('id', { length: 36 }).primaryKey(),
					userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
 resourceId: text('resource_id').notNull().references(()=> resource.id, { onDelete: 'cascade' }),
 actionId: text('action_id').notNull().references(()=> actions.id, { onDelete: 'cascade' }),
 decision: text('decision'),
 appliedPolicies: text('applied_policies'),
 requestContext: text('request_context'),
 processingTimeMs: int('processing_time_ms'),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            })
				});

export const dynamicAttribute = mysqlTable("dynamic_attribute", {
					id: varchar('id', { length: 36 }).primaryKey(),
					name: varchar('name', { length: 255 }).notNull().unique(),
 attributeId: text('attribute_id').notNull().references(()=> attribute.id, { onDelete: 'cascade' }),
 computationRule: text('computation_rule').notNull(),
 cacheTimeoutMinutes: int('cache_timeout_minutes').default(60),
 isActive: boolean('is_active').default(true),
 createdAt: timestamp('created_at').$defaultFn(() => {
              return new Date();
            }),
 updatedAt: timestamp('updated_at').$defaultFn(() => {
              return new Date();
            })
				});
