import type { Database } from "./database-types"; // Your Kysely schema types
import { Kysely, sql } from "kysely";

// Types for the authorization system
interface AuthorizationRequest {
	subjectId: string;
	resourceId?: string;
	resourceType?: string;
	actionName: string;
	context?: Record<string, any>;
}

interface AuthorizationResult {
	decision: "permit" | "deny" | "not_applicable" | "indeterminate";
	reason?: string;
	appliedPolicies: string[];
	processingTimeMs: number;
}

interface AttributeValue {
	id: string;
	name: string;
	type: string;
	category: string;
	value: string;
}

interface PolicyEvaluation {
	policyId: string;
	policyName: string;
	effect: "permit" | "deny";
	matches: boolean;
	reason?: string;
}

interface PolicyWithRules {
	policy: {
		id: string;
		name: string;
		description: string | null;
		effect: string;
		priority: number;
		is_active: number | null;
		policy_set_id: string;
		rules: string;
		created_at: Date | null;
		updated_at: Date | null;
	};
	rules: any[];
	targets: any[];
}

// Operators for rule evaluation
const OPERATORS = {
	equals: (a: any, b: any) => a === b,
	not_equals: (a: any, b: any) => a !== b,
	greater_than: (a: any, b: any) => Number(a) > Number(b),
	less_than: (a: any, b: any) => Number(a) < Number(b),
	contains: (a: any, b: any) => String(a).includes(String(b)),
	not_contains: (a: any, b: any) => !String(a).includes(String(b)),
	in: (a: any, b: any) => {
		const values = Array.isArray(b) ? b : String(b).split(",");
		return values.includes(String(a));
	},
	not_in: (a: any, b: any) => {
		const values = Array.isArray(b) ? b : String(b).split(",");
		return !values.includes(String(a));
	},
	regex: (a: any, b: any) => new RegExp(String(b)).test(String(a)),
	exists: (a: any) => a !== null && a !== undefined && a !== "",
	not_exists: (a: any) => a === null || a === undefined || a === "",
} as const;

/**
 * Main authorization function - checks if a user can perform an action
 */
export async function canUserPerformAction(
	db: Kysely<Database>,
	request: AuthorizationRequest
): Promise<AuthorizationResult> {
	const startTime = Date.now();

	try {
		// Step 1: Gather all attributes for the request
		const attributes = await gatherAttributes(db, request);

		// Step 2: Find applicable policies
		const applicablePolicies = await findApplicablePolicies(
			db,
			request,
			attributes
		);

		// Step 3: Evaluate policies
		const policyEvaluations = await evaluatePolicies(
			applicablePolicies,
			attributes
		);

		// Step 4: Make final decision (now passes policies for priority lookup)
		const decision = makeFinalDecision(policyEvaluations, applicablePolicies);

		// Step 5: Log the access request
		const processingTime = Date.now() - startTime;
		await logAccessRequest(
			db,
			request,
			decision,
			policyEvaluations,
			processingTime
		);

		return {
			decision: decision.decision,
			reason: decision.reason,
			appliedPolicies: policyEvaluations.map((p) => p.policyName),
			processingTimeMs: processingTime,
		};
	} catch (error) {
		const processingTime = Date.now() - startTime;
		console.error("Authorization error:", error);

		return {
			decision: "indeterminate",
			reason: `Authorization error: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
			appliedPolicies: [],
			processingTimeMs: processingTime,
		};
	}
}

/**
 * Gather all relevant attributes for the authorization request
 */
async function gatherAttributes(
	db: Kysely<Database>,
	request: AuthorizationRequest
): Promise<Map<string, AttributeValue>> {
	const attributeMap = new Map<string, AttributeValue>();

	// Get subject attributes (user attributes)
	const subjectAttrs = await db
		.selectFrom("user_attribute")
		.innerJoin("attribute", "user_attribute.attribute_id", "attribute.id")
		.select([
			"attribute.id",
			"attribute.name",
			"attribute.type",
			"attribute.category",
			"user_attribute.value",
		])
		.where("user_attribute.user_id", "=", request.subjectId)
		.execute();

	subjectAttrs.forEach((attr) => {
		attributeMap.set(`subject.${attr.name}`, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
	});

	// Get role attributes for the user
	const roleAttrs = await db
		.selectFrom("user")
		.innerJoin("role_attribute", "user.role_id", "role_attribute.role_id")
		.innerJoin("attribute", "role_attribute.attribute_id", "attribute.id")
		.select([
			"attribute.id",
			"attribute.name",
			"attribute.type",
			"attribute.category",
			"role_attribute.value",
		])
		.where("user.id", "=", request.subjectId)
		.execute();

	roleAttrs.forEach((attr) => {
		attributeMap.set(`subject.${attr.name}`, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
	});

	// Get resource attributes if resource is specified
	if (request.resourceId) {
		const resourceAttrs = await db
			.selectFrom("resource_attribute")
			.innerJoin("attribute", "resource_attribute.attribute_id", "attribute.id")
			.innerJoin("resource", "resource_attribute.resource_id", "resource.id")
			.select([
				"attribute.id",
				"attribute.name",
				"attribute.type",
				"attribute.category",
				"resource_attribute.value",
			])
			.where("resource.resource_id", "=", request.resourceId)
			.execute();

		resourceAttrs.forEach((attr) => {
			attributeMap.set(`resource.${attr.name}`, {
				id: attr.id,
				name: attr.name,
				type: attr.type,
				category: attr.category,
				value: attr.value,
			});
		});

		// Add resource ownership check
		const resourceOwner = await db
			.selectFrom("resource")
			.select("owner_id")
			.where("resource_id", "=", request.resourceId)
			.executeTakeFirst();

		if (resourceOwner) {
			attributeMap.set("resource.owner_id", {
				id: "resource-owner",
				name: "owner_id",
				type: "string",
				category: "resource",
				value: resourceOwner.owner_id,
			});

			// Add is_owner dynamic attribute
			attributeMap.set("resource.is_owner", {
				id: "resource-is-owner",
				name: "is_owner",
				type: "boolean",
				category: "resource",
				value: (resourceOwner.owner_id === request.subjectId).toString(),
			});
		}
	}

	// Get action attributes
	const actionAttrs = await db
		.selectFrom("action_attribute")
		.innerJoin("attribute", "action_attribute.attribute_id", "attribute.id")
		.innerJoin("actions", "action_attribute.action_id", "actions.id")
		.select([
			"attribute.id",
			"attribute.name",
			"attribute.type",
			"attribute.category",
			"action_attribute.value",
		])
		.where("actions.name", "=", request.actionName)
		.execute();

	actionAttrs.forEach((attr) => {
		attributeMap.set(`action.${attr.name}`, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
	});

	// Get environment attributes
	const envAttrs = await db
		.selectFrom("environment_attribute")
		.innerJoin(
			"attribute",
			"environment_attribute.attribute_id",
			"attribute.id"
		)
		.select([
			"attribute.id",
			"attribute.name",
			"attribute.type",
			"attribute.category",
			"environment_attribute.value",
		])
		.where((eb) =>
			eb.or([
				eb("environment_attribute.valid_from", "is", null),
				eb("environment_attribute.valid_from", "<=", sql<Date>`NOW()`),
			])
		)
		.where((eb) =>
			eb.or([
				eb("environment_attribute.valid_to", "is", null),
				eb("environment_attribute.valid_to", ">=", sql<Date>`NOW()`),
			])
		)
		.execute();

	envAttrs.forEach((attr) => {
		attributeMap.set(`environment.${attr.name}`, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
	});

	// Add dynamic environment attributes
	addDynamicEnvironmentAttributes(attributeMap, request.context);

	return attributeMap;
}

/**
 * Add dynamic environment attributes from context
 */
function addDynamicEnvironmentAttributes(
	attributeMap: Map<string, AttributeValue>,
	context?: Record<string, any>
) {
	// Current time
	attributeMap.set("environment.current_time", {
		id: "env-current-time",
		name: "current_time",
		type: "string",
		category: "environment",
		value: new Date().toISOString(),
	});

	// Current day of week
	attributeMap.set("environment.day_of_week", {
		id: "env-day-of-week",
		name: "day_of_week",
		type: "string",
		category: "environment",
		value: new Date().getDay().toString(),
	});

	// Add context attributes
	if (context) {
		Object.entries(context).forEach(([key, value]) => {
			attributeMap.set(`environment.${key}`, {
				id: `ctx-${key}`,
				name: key,
				type: typeof value,
				category: "environment",
				value: String(value),
			});
		});
	}
}

/**
 * Find policies that are applicable to this request
 */
async function findApplicablePolicies(
	db: Kysely<Database>,
	request: AuthorizationRequest,
	attributes: Map<string, AttributeValue>
): Promise<PolicyWithRules[]> {
	// Get all active policies
	const policies = await db
		.selectFrom("policy")
		.selectAll()
		.where("is_active", "=", 1)
		.orderBy("priority", "desc")
		.execute();

	const policiesWithRulesAndTargets: PolicyWithRules[] = [];

	for (const policy of policies) {
		// Get rules for this policy
		const rules = await db
			.selectFrom("policy_rule")
			.innerJoin("attribute", "policy_rule.attribute_id", "attribute.id")
			.select([
				"policy_rule.id",
				"policy_rule.attribute_id",
				"policy_rule.operator",
				"policy_rule.value",
				"policy_rule.logical_operator",
				"policy_rule.group_id",
				"attribute.name as attributeName",
			])
			.where("policy_rule.policy_id", "=", policy.id)
			.execute();

		// Get targets for this policy
		const targets = await db
			.selectFrom("policy_target")
			.innerJoin("attribute", "policy_target.attribute_id", "attribute.id")
			.select([
				"policy_target.id",
				"policy_target.target_type",
				"policy_target.target_id",
				"policy_target.attribute_id",
				"policy_target.operator",
				"policy_target.value",
				"attribute.name as attributeName",
			])
			.where("policy_target.policy_id", "=", policy.id)
			.execute();

		policiesWithRulesAndTargets.push({
			policy,
			rules,
			targets,
		});
	}

	return policiesWithRulesAndTargets;
}

/**
 * Evaluate all applicable policies
 */
async function evaluatePolicies(
	policies: PolicyWithRules[],
	attributes: Map<string, AttributeValue>
): Promise<PolicyEvaluation[]> {
	const evaluations: PolicyEvaluation[] = [];

	for (const policyData of policies) {
		const { policy, rules, targets } = policyData;

		// Check if policy targets match
		const targetMatches = evaluateTargets(targets, attributes);
		if (!targetMatches) {
			continue; // Skip this policy if targets don't match
		}

		// Evaluate policy rules
		const ruleMatches = evaluateRules(rules, attributes);

		evaluations.push({
			policyId: policy.id,
			policyName: policy.name,
			effect: policy.effect as "permit" | "deny",
			matches: ruleMatches.matches,
			reason: ruleMatches.reason,
		});
	}

	return evaluations;
}

/**
 * Evaluate policy targets
 */
function evaluateTargets(
	targets: any[],
	attributes: Map<string, AttributeValue>
): boolean {
	if (!targets || targets.length === 0) return true;

	return targets.every((target) => {
		if (!target.attribute_id) return true;

		const attrKey = `${target.target_type}.${target.attributeName}`;
		const attribute = attributes.get(attrKey);

		if (!attribute) return false;

		const operator = OPERATORS[target.operator as keyof typeof OPERATORS];
		if (!operator) return false;

		return operator(attribute.value, target.value);
	});
}

/**
 * Evaluate policy rules with logical operators
 */
function evaluateRules(
	rules: any[],
	attributes: Map<string, AttributeValue>
): { matches: boolean; reason?: string } {
	if (!rules || rules.length === 0) {
		return { matches: true };
	}

	// Group rules by groupId
	const ruleGroups = new Map<string, any[]>();

	rules.forEach((rule) => {
		const groupId = rule.group_id || "default";
		if (!ruleGroups.has(groupId)) {
			ruleGroups.set(groupId, []);
		}
		ruleGroups.get(groupId)!.push(rule);
	});

	// Evaluate each group
	const groupResults: boolean[] = [];

	for (const [groupId, groupRules] of ruleGroups) {
		const groupResult = evaluateRuleGroup(groupRules, attributes);
		groupResults.push(groupResult);
	}

	// All groups must be true (AND between groups)
	const finalResult = groupResults.every((result) => result);

	return {
		matches: finalResult,
		reason: finalResult
			? "All rule conditions met"
			: "One or more rule conditions failed",
	};
}

/**
 * Evaluate a group of rules with logical operators
 */
function evaluateRuleGroup(
	rules: any[],
	attributes: Map<string, AttributeValue>
): boolean {
	if (rules.length === 0) return true;

	let result = true;
	let currentOperator = "AND";

	for (const rule of rules) {
		const attribute = findAttributeByName(rule.attributeName, attributes);
		if (!attribute) {
			if (currentOperator === "AND") {
				result = false;
			}
			continue;
		}

		const operator = OPERATORS[rule.operator as keyof typeof OPERATORS];
		if (!operator) {
			if (currentOperator === "AND") {
				result = false;
			}
			continue;
		}

		const ruleResult = operator(attribute.value, rule.value);

		if (currentOperator === "AND") {
			result = result && ruleResult;
		} else if (currentOperator === "OR") {
			result = result || ruleResult;
		}

		currentOperator = rule.logical_operator || "AND";
	}

	return result;
}

/**
 * Find attribute by name across all categories
 */
function findAttributeByName(
	attributeName: string,
	attributes: Map<string, AttributeValue>
): AttributeValue | undefined {
	for (const [key, value] of attributes) {
		if (value.name === attributeName) {
			return value;
		}
	}
	return undefined;
}

/**
 * Make final authorization decision based on policy evaluations
 * Properly considers policy priorities
 */
function makeFinalDecision(
	evaluations: PolicyEvaluation[],
	policies: PolicyWithRules[]
): {
	decision: "permit" | "deny" | "not_applicable";
	reason: string;
} {
	if (evaluations.length === 0) {
		return {
			decision: "not_applicable",
			reason: "No applicable policies found",
		};
	}

	// Filter to only matching policies
	const matchingEvaluations = evaluations.filter((e) => e.matches);

	if (matchingEvaluations.length === 0) {
		return {
			decision: "deny",
			reason: "No matching policies found",
		};
	}

	// Create a map of policy priorities for quick lookup
	const policyPriorityMap = new Map<string, number>();
	policies.forEach((p) => {
		policyPriorityMap.set(p.policy.id, p.policy.priority);
	});

	// Sort matching evaluations by priority (highest first)
	const sortedEvaluations = matchingEvaluations.sort((a, b) => {
		const priorityA = policyPriorityMap.get(a.policyId) || 0;
		const priorityB = policyPriorityMap.get(b.policyId) || 0;
		return priorityB - priorityA; // Descending order (highest priority first)
	});

	// Return the decision of the highest priority matching policy
	const highestPriorityPolicy = sortedEvaluations[0];

	return {
		decision: highestPriorityPolicy.effect === "permit" ? "permit" : "deny",
		reason: `${
			highestPriorityPolicy.effect === "permit" ? "Permitted" : "Denied"
		} by highest priority policy: ${highestPriorityPolicy.policyName}`,
	};
}

/**
 * Log the access request for auditing
 */
async function logAccessRequest(
	db: Kysely<Database>,
	request: AuthorizationRequest,
	decision: { decision: string; reason?: string },
	evaluations: PolicyEvaluation[],
	processingTime: number
) {
	try {
		// Get action ID
		const action = await db
			.selectFrom("actions")
			.select("id")
			.where("name", "=", request.actionName)
			.executeTakeFirst();

		// Get resource ID
		let resourceId = request.resourceId || "";
		if (request.resourceId) {
			const resource = await db
				.selectFrom("resource")
				.select("id")
				.where("resource_id", "=", request.resourceId)
				.executeTakeFirst();
			resourceId = resource?.id || request.resourceId;
		}

		await db
			.insertInto("access_request")
			.values({
				id: crypto.randomUUID(),
				user_id: request.subjectId,
				resource_id: resourceId,
				action_id: action?.id || request.actionName,
				decision: decision.decision,
				applied_policies: JSON.stringify(
					evaluations.map((e) => ({
						policyId: e.policyId,
						policyName: e.policyName,
						effect: e.effect,
						matches: e.matches,
					}))
				),
				request_context: JSON.stringify(request.context || {}),
				processing_time_ms: processingTime,
				created_at: new Date(),
			})
			.execute();
	} catch (error) {
		console.error("Failed to log access request:", error);
	}
}

// Convenience wrapper functions for common use cases

/**
 * Check if user can read a resource
 */
export async function canUserRead(
	db: Kysely<Database>,
	userId: string,
	resourceId: string,
	context?: Record<string, any>
) {
	return canUserPerformAction(db, {
		subjectId: userId,
		resourceId,
		actionName: "read",
		context,
	});
}

/**
 * Check if user can write/update a resource
 */
export async function canUserWrite(
	db: Kysely<Database>,
	userId: string,
	resourceId: string,
	context?: Record<string, any>
) {
	return canUserPerformAction(db, {
		subjectId: userId,
		resourceId,
		actionName: "write",
		context,
	});
}

/**
 * Check if user can delete a resource
 */
export async function canUserDelete(
	db: Kysely<Database>,
	userId: string,
	resourceId: string,
	context?: Record<string, any>
) {
	return canUserPerformAction(db, {
		subjectId: userId,
		resourceId,
		actionName: "delete",
		context,
	});
}

/**
 * Batch authorization check for multiple resources
 */
export async function canUserPerformActionOnResources(
	db: Kysely<Database>,
	userId: string,
	actionName: string,
	resourceIds: string[],
	context?: Record<string, any>
): Promise<Record<string, AuthorizationResult>> {
	const results: Record<string, AuthorizationResult> = {};

	// Process in parallel for better performance
	const promises = resourceIds.map(async (resourceId) => {
		const result = await canUserPerformAction(db, {
			subjectId: userId,
			resourceId,
			actionName,
			context,
		});
		return { resourceId, result };
	});

	const resolvedResults = await Promise.all(promises);

	resolvedResults.forEach(({ resourceId, result }) => {
		results[resourceId] = result;
	});

	return results;
}
