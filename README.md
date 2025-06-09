# IN BETA - IN DEVELOPMENT

# better-auth-abac

A flexible and extensible Attribute-Based Access Control (ABAC) plugin for the Better Auth framework. This package allows developers to implement fine-grained authorization using attributes, policies, and rules with comprehensive access control validation.

## Features

- **Attribute-Based Access Control**: Define and manage user, role, resource, action, and environment attributes
- **Policy Management**: Create flexible policy sets with priority-based evaluation
- **Dynamic Attributes**: Support for computed attributes with caching
- **Resource Management**: Comprehensive resource type and instance management
- **Access Logging**: Built-in access request tracking and audit trails
- **Multiple Authorization Patterns**: Support for read, write, delete, and custom action permissions
- **Extensible Schema**: Flexible attribute system supporting various data types and categories

## Installation

```bash
npm install better-auth-abac
```

## Setup

```ts
import { betterAuth } from "better-auth"
import { abac, createAbacAdapter } from "better-auth-abac"

// Initialize your database adapter
const abacAdapter = await createAbacAdapter({
    type: "mysql" // mysql | postgres | sqlite
    uri: process.env.DB_URL!
    // filename: "./db" // OPTIONAL FOR SQLITE
})

export const auth = betterAuth({
    // other options here
    plugins: [abac(abacAdapter)]
})
```

### Alternative Setup with Options

```ts
const abacAdapter = await createAbacAdapter({
    type: "mysql" // mysql | postgres | sqlite
    uri: process.env.DB_URL!
    // filename: "./db" // OPTIONAL FOR SQLITE
})

const OPTIONS = {
	database: drizzleAdapter(main_db, {
		provider: "mysql",
		schema: {
			...schema,
		},
	}),
	emailAndPassword: {
		enabled: true,
	},
    plugins: [abac(abacAdapter)]
} satisfies BetterAuthOptions;

export const auth = betterAuth({
    ...OPTIONS,
    appName: "My App"
})
```

## Database Schema

> ⚠️ **IMPORTANT**: Please remember to run `npx @better-auth/cli generate` and push changes to your database before using this plugin.

The plugin automatically creates the following tables in your database:

- **role**: User roles with attributes
- **attribute**: Attribute definitions with types and categories
- **user_attribute**: User-specific attribute assignments
- **role_attribute**: Role-based attribute assignments
- **resource_type**: Definitions for different resource types
- **resource**: Resource instances with ownership
- **resource_attribute**: Resource-specific attributes
- **actions**: Available actions per resource type
- **action_attribute**: Action-specific attributes
- **environment_attribute**: Context-based attributes
- **policy_set**: Policy groupings with priorities
- **policy**: Individual policies with rules
- **policy_rule**: Detailed policy rule definitions
- **policy_target**: Policy targeting specifications
- **access_request**: Access request audit logs
- **dynamic_attribute**: Computed attributes with caching

## Usage

### Client-Side API

#### Check User Action Permissions

```ts
// Check if user can perform a specific action
const result = await authClient.abac.canuserperformaction({
	subjectId: "user123",
	resourceId: "document456", // optional
	resourceType: "document", // optional
	actionName: "edit",
	context: {
		ip_address: "192.168.1.1",
		time_of_day: "business_hours",
		department: "engineering",
	},
});

console.log(result);
```

#### Check Read Permissions

```ts
const canRead = await authClient.abac.canuserread({
	userId: "user123",
	resourceId: "document456",
	context: {
		classification_level: "internal",
	},
});

console.log(canRead);
```

#### Check Write Permissions

```ts
const canWrite = await authClient.abac.canuserwrite({
	userId: "user123",
	resourceId: "document456",
	context: {
		modification_reason: "content_update",
	},
});

console.log(canWrite);
```

#### Check Delete Permissions

```ts
const canDelete = await authClient.abac.canuserdelete({
	userId: "user123",
	resourceId: "document456",
	context: {
		backup_exists: "true",
	},
});

console.log(canDelete);
```

#### Bulk Resource Permission Check

```ts
// Check permissions across multiple resources
const bulkResult = await authClient.abac.canuserperformactiononresources({
	userId: "user123",
	actionName: "view",
	resourceIds: ["doc1", "doc2", "doc3"],
	context: {
		request_purpose: "audit",
	},
});

console.log(bulkResult);
```

#### Test Plugin Connection

```ts
const testResult = await authClient.abac.test();
console.log(testResult.message); // "ABAC plugin is working!"
```

### Server-Side Integration

The plugin automatically handles user registration by:

1. Creating a default "USER" role if it doesn't exist
2. Assigning new users to the default role
3. Creating user resources for access control

### Policy Configuration

Policies are stored as JSON structures in the database and support:

- **Attribute Matching**: Compare user, resource, action, and environment attributes
- **Logical Operators**: AND, OR conditions between rules
- **Comparison Operators**: equals, not_equals, greater_than, less_than, contains, etc.
- **Priority Handling**: Higher priority policies override lower priority ones
- **Effect Types**: Allow or Deny decisions

### Dynamic Attributes

Support for computed attributes that are:

- Calculated at runtime based on rules
- Cached for performance (configurable timeout)
- Context-aware and environment-sensitive

### Environment Context

The plugin supports rich contextual information including:

- IP addresses and geographic location
- Time-based access (business hours, weekends)
- Device and browser information
- Custom application context

## API Endpoints

All endpoints are automatically mounted under `/api/auth/abac/`:

- `POST /api/auth/abac/canuserperformaction` - Generic action permission check
- `POST /api/auth/abac/canuserread` - Read permission check
- `POST /api/auth/abac/canuserwrite` - Write permission check
- `POST /api/auth/abac/canuserdelete` - Delete permission check
- `POST /api/auth/abac/canuserperformactiononresources` - Bulk permission check
- `GET /api/auth/abac/test` - Plugin health check

## Example Use Cases

### Document Management System

```ts
// Check if user can edit a document based on:
// - User's role and department
// - Document classification level
// - Current time (business hours only)
// - User's previous edit history

const canEdit = await authClient.abac.canuserperformaction({
	subjectId: userId,
	resourceId: documentId,
	resourceType: "document",
	actionName: "edit",
	context: {
		current_time: new Date().toISOString(),
		user_department: "legal",
		document_classification: "confidential",
		recent_edit_count: "2",
	},
});
```

### Multi-tenant SaaS Application

```ts
// Ensure users can only access resources in their tenant
const canAccess = await authClient.abac.canuserperformactiononresources({
	userId: userId,
	actionName: "view",
	resourceIds: requestedResourceIds,
	context: {
		tenant_id: userTenantId,
		subscription_level: "premium",
		feature_flags: JSON.stringify(enabledFeatures),
	},
});
```

## Contributing

Contributions are welcome! Please ensure your code follows the established patterns and includes appropriate tests.

## License

MIT License
