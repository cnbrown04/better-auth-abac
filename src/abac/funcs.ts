import type { Database } from "./database-types"; // Your Kysely schema types
import { Kysely, sql } from "kysely";

// Types for the authorization system
export interface AuthorizationRequest {
	subjectId: string;
	resourceId?: string;
	resourceType?: string;
	actionName: string;
	context?: Record<string, any>;
}

export interface AuthorizationResult {
	decision: "permit" | "deny" | "not_applicable" | "indeterminate";
	reason?: string;
	appliedPolicies: string[];
	processingTimeMs: number;
}

export interface AuthorizationConfig {
	debug?: boolean;
}

export interface AttributeValue {
	id: string;
	name: string;
	type: string;
	category: string;
	value: string;
}

export interface PolicyEvaluation {
	policyId: string;
	policyName: string;
	effect: "permit" | "deny";
	matches: boolean;
	reason?: string;
}

export interface PolicyWithRules {
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

// Attribute cache for reducing database queries
const attributeCache = new Map<string, { attributes: Map<string, AttributeValue>; timestamp: number }>();
const CACHE_TTL = 300000; // 5 minutes

// Debug logging utility
function debugLog(
	config: AuthorizationConfig | undefined,
	message: string,
	...args: any[]
) {
	if (config?.debug) {
		console.log(message, ...args);
	}
}

// Cache cleanup to prevent memory growth
function cleanupCache() {
	const now = Date.now();
	for (const [key, value] of attributeCache) {
		if (now - value.timestamp > CACHE_TTL) {
			attributeCache.delete(key);
		}
	}
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
	request: AuthorizationRequest,
	config?: AuthorizationConfig
): Promise<AuthorizationResult> {
	const startTime = Date.now();

	debugLog(config, "🚀 === AUTHORIZATION DEBUG START ===");
	debugLog(config, "📋 Request:", JSON.stringify(request, null, 2));

	try {
		// Step 1: Gather all attributes for the request
		debugLog(config, "\n📊 Step 1: Gathering attributes...");
		const attributes = await gatherAttributes(db, request, config);

		// Step 2: Find applicable policies
		debugLog(config, "\n🎯 Step 2: Finding applicable policies...");
		const applicablePolicies = await findApplicablePolicies(
			db,
			request,
			attributes,
			config
		);

		// Step 3: Evaluate policies
		debugLog(config, "\n⚖️ Step 3: Evaluating policies...");
		const policyEvaluations = await evaluatePolicies(
			applicablePolicies,
			attributes,
			config
		);

		// Step 4: Make final decision (now passes policies for priority lookup)
		debugLog(config, "\n🏁 Step 4: Making final decision...");
		const decision = makeFinalDecision(
			policyEvaluations,
			applicablePolicies,
			config
		);

		// Step 5: Log the access request
		const processingTime = Date.now() - startTime;
		if (request.resourceId) {
			await logAccessRequest(
				db,
				request,
				decision,
				policyEvaluations,
				processingTime
			);
		}

		debugLog(config, "\n✅ === AUTHORIZATION DEBUG END ===");
		debugLog(config, "🎭 Final Decision:", decision);
		debugLog(config, "⏱️ Processing Time:", processingTime + "ms");

		return {
			decision: decision.decision,
			reason: decision.reason,
			appliedPolicies: policyEvaluations.map((p) => p.policyName),
			processingTimeMs: processingTime,
		};
	} catch (error) {
		const processingTime = Date.now() - startTime;
		console.error("❌ Authorization error:", error);

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
 * Gather all relevant attributes for the authorization request with caching
 */
async function gatherAttributes(
	db: Kysely<Database>,
	request: AuthorizationRequest,
	config?: AuthorizationConfig
): Promise<Map<string, AttributeValue>> {
	// Clean up old cache entries periodically
	if (Math.random() < 0.1) { // 10% chance to clean up on each call
		cleanupCache();
	}

	// Create cache key based on request parameters
	const cacheKey = `${request.subjectId}-${request.resourceId || 'no-resource'}-${request.actionName}`;
	const cached = attributeCache.get(cacheKey);
	
	if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
		debugLog(config, "🎯 Using cached attributes for:", cacheKey);
		return new Map(cached.attributes);
	}

	const attributeMap = new Map<string, AttributeValue>();

	debugLog(
		config,
		"🔍 Gathering subject attributes for user:",
		request.subjectId
	);

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

	debugLog(config, "👤 Found subject attributes:", subjectAttrs.length);
	subjectAttrs.forEach((attr) => {
		const key = `subject.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		debugLog(config, `   ✓ ${key} = "${attr.value}"`);
	});

	// Get role attributes for the user
	debugLog(config, "🎭 Gathering role attributes...");
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

	debugLog(config, "🎭 Found role attributes:", roleAttrs.length);
	roleAttrs.forEach((attr) => {
		const key = `subject.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		debugLog(config, `   ✓ ${key} = "${attr.value}"`);
	});

	// Get resource attributes if resource is specified
	if (request.resourceId) {
		debugLog(
			config,
			"📁 Gathering resource attributes for:",
			request.resourceId
		);
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

		debugLog(config, "📁 Found resource attributes:", resourceAttrs.length);
		resourceAttrs.forEach((attr) => {
			const key = `resource.${attr.name}`;
			attributeMap.set(key, {
				id: attr.id,
				name: attr.name,
				type: attr.type,
				category: attr.category,
				value: attr.value,
			});
			debugLog(config, `   ✓ ${key} = "${attr.value}"`);
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
			debugLog(config, `   ✓ resource.owner_id = "${resourceOwner.owner_id}"`);

			// Add is_owner dynamic attribute
			const isOwner = (resourceOwner.owner_id === request.subjectId).toString();
			attributeMap.set("resource.is_owner", {
				id: "resource-is-owner",
				name: "is_owner",
				type: "boolean",
				category: "resource",
				value: isOwner,
			});
			debugLog(config, `   ✓ resource.is_owner = "${isOwner}"`);
		}
	}

	// Get action attributes
	debugLog(config, "⚡ Gathering action attributes for:", request.actionName);
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

	debugLog(config, "⚡ Found action attributes:", actionAttrs.length);
	actionAttrs.forEach((attr) => {
		const key = `action.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		debugLog(config, `   ✓ ${key} = "${attr.value}"`);
	});

	debugLog(config, "🔄 Adding dynamic action attribute...");
	attributeMap.set("action.action_name", {
		id: "dynamic-action-name",
		name: "action_name",
		type: "string",
		category: "action",
		value: request.actionName,
	});
	debugLog(config, `   ✓ action.action_name = "${request.actionName}"`);

	// Also add resource type if provided
	if (request.resourceType) {
		debugLog(config, "🔄 Adding dynamic resource type attribute...");
		attributeMap.set("resource.resource_type", {
			id: "dynamic-resource-type",
			name: "resource_type",
			type: "string",
			category: "resource",
			value: request.resourceType,
		});
		debugLog(config, `   ✓ resource.resource_type = "${request.resourceType}"`);
	}

	// Get environment attributes
	debugLog(config, "🌍 Gathering environment attributes...");
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

	debugLog(config, "🌍 Found environment attributes:", envAttrs.length);
	envAttrs.forEach((attr) => {
		const key = `environment.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		debugLog(config, `   ✓ ${key} = "${attr.value}"`);
	});

	// Add dynamic environment attributes
	addDynamicEnvironmentAttributes(attributeMap, request.context, config);

	debugLog(config, "\n📋 === FINAL ATTRIBUTE MAP ===");
	if (config?.debug) {
		for (const [key, value] of attributeMap) {
			debugLog(config, `   ${key} = "${value.value}" (${value.type})`);
		}
	}

	// Cache the results
	attributeCache.set(cacheKey, {
		attributes: new Map(attributeMap),
		timestamp: Date.now()
	});

	return attributeMap;
}

/**
 * Add dynamic environment attributes from context - optimized for memory
 */
function addDynamicEnvironmentAttributes(
	attributeMap: Map<string, AttributeValue>,
	context?: Record<string, any>,
	config?: AuthorizationConfig
) {
	debugLog(config, "🔄 Adding dynamic environment attributes...");

	// Reuse Date object to reduce allocation
	const now = new Date();
	const currentTimeString = now.toISOString();
	
	// Current time
	attributeMap.set("environment.current_time", {
		id: "env-current-time",
		name: "current_time",
		type: "string",
		category: "environment",
		value: currentTimeString,
	});
	debugLog(config, `   ✓ environment.current_time = "${currentTimeString}"`);

	// Current day of week
	const dayOfWeek = now.getDay().toString();
	attributeMap.set("environment.day_of_week", {
		id: "env-day-of-week",
		name: "day_of_week",
		type: "string",
		category: "environment",
		value: dayOfWeek,
	});
	debugLog(config, `   ✓ environment.day_of_week = "${dayOfWeek}"`);

	// Add context attributes - limit context size to prevent memory issues
	if (context && Object.keys(context).length > 0) {
		debugLog(config, "🎯 Adding context attributes...");
		const contextEntries = Object.entries(context).slice(0, 50); // Limit to 50 context attributes
		
		for (const [key, value] of contextEntries) {
			const envKey = `environment.${key}`;
			attributeMap.set(envKey, {
				id: `ctx-${key}`,
				name: key,
				type: typeof value,
				category: "environment",
				value: String(value).slice(0, 1000), // Limit value length to 1000 chars
			});
			debugLog(config, `   ✓ ${envKey} = "${value}"`);
		}
		
		if (Object.keys(context).length > 50) {
			console.warn(`Context has ${Object.keys(context).length} attributes, limiting to 50 for memory efficiency`);
		}
	}
}

/**
 * Find policies that are applicable to this request
 */
async function findApplicablePolicies(
	db: Kysely<Database>,
	request: AuthorizationRequest,
	attributes: Map<string, AttributeValue>,
	config?: AuthorizationConfig
): Promise<PolicyWithRules[]> {
	// Get all active policies
	debugLog(config, "🔍 Finding all active policies...");
	const policies = await db
		.selectFrom("policy")
		.selectAll()
		.where("is_active", "=", 1)
		.orderBy("priority", "desc")
		.execute();

	debugLog(config, `📋 Found ${policies.length} active policies`);

	const policiesWithRulesAndTargets: PolicyWithRules[] = [];

	for (const policy of policies) {
		debugLog(config, `\n🎯 Processing policy: "${policy.name}" (${policy.id})`);

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

		debugLog(config, `   📜 Found ${rules.length} rules for this policy`);
		rules.forEach((rule, index) => {
			debugLog(
				config,
				`      Rule ${index + 1}: ${rule.attributeName} ${rule.operator} "${
					rule.value
				}"`
			);
		});

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

		debugLog(config, `   🎯 Found ${targets.length} targets for this policy`);
		targets.forEach((target, index) => {
			debugLog(
				config,
				`      Target ${index + 1}: ${target.target_type}.${
					target.attributeName
				} ${target.operator} "${target.value}"`
			);
		});

		// Skip policies that have no rules AND no targets
		if (rules.length === 0 && targets.length === 0) {
			debugLog(
				config,
				`   ⏭️ Skipping policy "${policy.name}" - no rules or targets defined`
			);
			continue;
		}

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
	attributes: Map<string, AttributeValue>,
	config?: AuthorizationConfig
): Promise<PolicyEvaluation[]> {
	const evaluations: PolicyEvaluation[] = [];

	debugLog(config, `\n⚖️ Evaluating ${policies.length} policies...`);

	for (const policyData of policies) {
		const { policy, rules, targets } = policyData;

		debugLog(config, `\n🔍 Evaluating policy: "${policy.name}"`);

		// Check if policy targets match
		debugLog(config, "   🎯 Checking targets...");
		const targetMatches = evaluateTargets(targets, attributes, config);
		debugLog(
			config,
			`   🎯 Target result: ${targetMatches ? "✅ PASS" : "❌ FAIL"}`
		);

		if (!targetMatches) {
			debugLog(config, "   ⏭️ Skipping policy due to target mismatch");
			continue; // Skip this policy if targets don't match
		}

		// Evaluate policy rules
		debugLog(config, "   📜 Checking rules...");
		const ruleMatches = evaluateRules(rules, attributes, config);
		debugLog(
			config,
			`   📜 Rule result: ${ruleMatches.matches ? "✅ PASS" : "❌ FAIL"} - ${
				ruleMatches.reason
			}`
		);

		evaluations.push({
			policyId: policy.id,
			policyName: policy.name,
			effect: policy.effect as "permit" | "deny",
			matches: ruleMatches.matches,
			reason: ruleMatches.reason,
		});

		debugLog(
			config,
			`   🏷️ Policy added to evaluations: effect=${policy.effect}, matches=${ruleMatches.matches}`
		);
	}

	debugLog(config, `\n📊 Total policies evaluated: ${evaluations.length}`);
	return evaluations;
}

/**
 * Evaluate policy targets
 */
function evaluateTargets(
	targets: any[],
	attributes: Map<string, AttributeValue>,
	config?: AuthorizationConfig
): boolean {
	if (!targets || targets.length === 0) {
		debugLog(config, "      🎯 No targets defined - returning true");
		return true;
	}

	debugLog(config, `      🎯 Evaluating ${targets.length} targets:`);

	return targets.every((target, index) => {
		if (!target.attribute_id) {
			debugLog(
				config,
				`         Target ${index + 1}: No attribute_id - returning true`
			);
			return true;
		}

		const attrKey = `${target.target_type}.${target.attributeName}`;
		debugLog(
			config,
			`         Target ${index + 1}: Looking for attribute key: "${attrKey}"`
		);

		const attribute = attributes.get(attrKey);
		debugLog(
			config,
			`         Target ${index + 1}: Found attribute: ${
				attribute ? `"${attribute.value}"` : "❌ NOT FOUND"
			}`
		);

		if (!attribute) {
			debugLog(
				config,
				`         Target ${index + 1}: ❌ FAIL - Attribute not found`
			);
			return false;
		}

		const operator = OPERATORS[target.operator as keyof typeof OPERATORS];
		if (!operator) {
			debugLog(
				config,
				`         Target ${index + 1}: ❌ FAIL - Unknown operator: ${
					target.operator
				}`
			);
			return false;
		}

		const result = operator(attribute.value, target.value);
		debugLog(
			config,
			`         Target ${index + 1}: "${attribute.value}" ${target.operator} "${
				target.value
			}" = ${result ? "✅ PASS" : "❌ FAIL"}`
		);
		return result;
	});
}

/**
 * Evaluate policy rules with logical operators
 */
function evaluateRules(
	rules: any[],
	attributes: Map<string, AttributeValue>,
	config?: AuthorizationConfig
): { matches: boolean; reason?: string } {
	if (!rules || rules.length === 0) {
		debugLog(config, "      📜 No rules defined - returning true");
		return { matches: true };
	}

	debugLog(config, `      📜 Evaluating ${rules.length} rules:`);

	// Group rules by groupId
	const ruleGroups = new Map<string, any[]>();

	rules.forEach((rule) => {
		const groupId = rule.group_id || "default";
		if (!ruleGroups.has(groupId)) {
			ruleGroups.set(groupId, []);
		}
		ruleGroups.get(groupId)!.push(rule);
	});

	debugLog(
		config,
		`      📜 Rule groups: ${Array.from(ruleGroups.keys()).join(", ")}`
	);

	// Evaluate each group
	const groupResults: boolean[] = [];

	for (const [groupId, groupRules] of ruleGroups) {
		debugLog(
			config,
			`         📦 Evaluating group "${groupId}" with ${groupRules.length} rules:`
		);
		const groupResult = evaluateRuleGroup(groupRules, attributes, config);
		debugLog(
			config,
			`         📦 Group "${groupId}" result: ${
				groupResult ? "✅ PASS" : "❌ FAIL"
			}`
		);
		groupResults.push(groupResult);
	}

	// All groups must be true (AND between groups)
	const finalResult = groupResults.every((result) => result);
	debugLog(
		config,
		`      📜 Final rule result: ${
			finalResult ? "✅ PASS" : "❌ FAIL"
		} (AND of all groups)`
	);

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
	attributes: Map<string, AttributeValue>,
	config?: AuthorizationConfig
): boolean {
	if (rules.length === 0) return true;

	let result = true;
	let currentOperator = "AND";

	for (const [index, rule] of rules.entries()) {
		debugLog(
			config,
			`            🔍 Rule ${index + 1}: Looking for attribute "${
				rule.attributeName
			}"`
		);

		const attribute = findAttributeByName(rule.attributeName, attributes);
		debugLog(
			config,
			`            🔍 Rule ${index + 1}: Found attribute: ${
				attribute ? `"${attribute.value}"` : "❌ NOT FOUND"
			}`
		);

		if (!attribute) {
			debugLog(
				config,
				`            🔍 Rule ${index + 1}: ❌ FAIL - Attribute not found`
			);
			if (currentOperator === "AND") {
				result = false;
			}
			continue;
		}

		const operator = OPERATORS[rule.operator as keyof typeof OPERATORS];
		if (!operator) {
			debugLog(
				config,
				`            🔍 Rule ${index + 1}: ❌ FAIL - Unknown operator: ${
					rule.operator
				}`
			);
			if (currentOperator === "AND") {
				result = false;
			}
			continue;
		}

		const ruleResult = operator(attribute.value, rule.value);
		debugLog(
			config,
			`            🔍 Rule ${index + 1}: "${attribute.value}" ${
				rule.operator
			} "${rule.value}" = ${ruleResult ? "✅ PASS" : "❌ FAIL"}`
		);

		if (currentOperator === "AND") {
			result = result && ruleResult;
			debugLog(
				config,
				`            🔍 Rule ${index + 1}: AND result so far: ${result}`
			);
		} else if (currentOperator === "OR") {
			result = result || ruleResult;
			debugLog(
				config,
				`            🔍 Rule ${index + 1}: OR result so far: ${result}`
			);
		}

		currentOperator = rule.logical_operator || "AND";
		debugLog(
			config,
			`            🔍 Rule ${index + 1}: Next operator: ${currentOperator}`
		);
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
	for (const [_, value] of attributes) {
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
	policies: PolicyWithRules[],
	config?: AuthorizationConfig
): {
	decision: "permit" | "deny";
	reason: string;
} {
	debugLog(
		config,
		`\n🏁 Making final decision from ${evaluations.length} evaluations...`
	);

	if (evaluations.length === 0) {
		debugLog(config, "🏁 No applicable policies found");
		return {
			decision: "deny",
			reason: "No applicable policies found",
		};
	}

	// Filter to only matching policies
	const matchingEvaluations = evaluations.filter((e) => e.matches);
	debugLog(config, `🏁 Found ${matchingEvaluations.length} matching policies`);

	if (matchingEvaluations.length === 0) {
		debugLog(config, "🏁 No matching policies found");
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

	debugLog(config, "🏁 Sorted matching policies by priority:");
	sortedEvaluations.forEach((evals, index) => {
		const priority = policyPriorityMap.get(evals.policyId) || 0;
		debugLog(
			config,
			`   ${index + 1}. "${evals.policyName}" (priority: ${priority}, effect: ${
				evals.effect
			})`
		);
	});

	// Return the decision of the highest priority matching policy
	const highestPriorityPolicy = sortedEvaluations[0];
	const decision =
		highestPriorityPolicy.effect === "permit" ? "permit" : "deny";
	debugLog(
		config,
		`🏁 Selected highest priority policy: "${
			highestPriorityPolicy.policyName
		}" -> ${decision.toUpperCase()}`
	);

	return {
		decision,
		reason: `${
			highestPriorityPolicy.effect === "permit" ? "Permitted" : "Denied"
		} by highest priority policy: ${highestPriorityPolicy.policyName}`,
	};
}

/**
 * Log the access request for auditing - optimized for memory usage
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

		if (!resourceId || resourceId === "") {
			// If no resource ID is found, we can't log the access request
			console.warn("No resource ID found for logging access request");
			return;
		}

		// Optimize JSON stringification to reduce memory usage
		const appliedPoliciesString = evaluations.length > 0 
			? JSON.stringify(evaluations.map(e => ({
				policyId: e.policyId,
				policyName: e.policyName,
				effect: e.effect,
				matches: e.matches,
			})))
			: "[]";

		const contextString = request.context && Object.keys(request.context).length > 0
			? JSON.stringify(request.context)
			: "{}";

		await db
			.insertInto("access_request")
			.values({
				id: crypto.randomUUID(),
				user_id: request.subjectId,
				resource_id: resourceId,
				action_id: action?.id || request.actionName,
				decision: decision.decision,
				applied_policies: appliedPoliciesString,
				request_context: contextString,
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
	context?: Record<string, any>,
	config?: AuthorizationConfig
) {
	return canUserPerformAction(
		db,
		{
			subjectId: userId,
			resourceId,
			actionName: "read",
			context,
		},
		config
	);
}

/**
 * Check if user can write/update a resource
 */
export async function canUserWrite(
	db: Kysely<Database>,
	userId: string,
	resourceId: string,
	context?: Record<string, any>,
	config?: AuthorizationConfig
) {
	return canUserPerformAction(
		db,
		{
			subjectId: userId,
			resourceId,
			actionName: "write",
			context,
		},
		config
	);
}

/**
 * Check if user can delete a resource
 */
export async function canUserDelete(
	db: Kysely<Database>,
	userId: string,
	resourceId: string,
	context?: Record<string, any>,
	config?: AuthorizationConfig
) {
	return canUserPerformAction(
		db,
		{
			subjectId: userId,
			resourceId,
			actionName: "delete",
			context,
		},
		config
	);
}

/**
 * Batch authorization check for multiple resources with concurrency limiting
 */
export async function canUserPerformActionOnResources(
	db: Kysely<Database>,
	userId: string,
	actionName: string,
	resourceIds: string[],
	context?: Record<string, any>,
	config?: AuthorizationConfig
): Promise<Record<string, AuthorizationResult>> {
	const results: Record<string, AuthorizationResult> = {};
	const BATCH_SIZE = 10; // Limit concurrent operations to prevent memory spikes

	// Process resources in batches to limit memory usage
	for (let i = 0; i < resourceIds.length; i += BATCH_SIZE) {
		const batch = resourceIds.slice(i, i + BATCH_SIZE);
		
		const promises = batch.map(async (resourceId) => {
			try {
				const result = await canUserPerformAction(
					db,
					{
						subjectId: userId,
						resourceId,
						actionName,
						context,
					},
					config
				);
				return { resourceId, result, success: true };
			} catch (error) {
				debugLog(config, `Error processing resource ${resourceId}:`, error);
				return {
					resourceId,
					result: {
						decision: "indeterminate" as const,
						reason: `Error processing resource: ${error instanceof Error ? error.message : 'Unknown error'}`,
						appliedPolicies: [],
						processingTimeMs: 0,
					},
					success: false
				};
			}
		});

		const batchResults = await Promise.all(promises);

		batchResults.forEach(({ resourceId, result }) => {
			results[resourceId] = result;
		});

		// Add small delay between batches to prevent overwhelming the database
		if (i + BATCH_SIZE < resourceIds.length) {
			await new Promise(resolve => setTimeout(resolve, 10));
		}
	}

	return results;
}

/**
 * Get user and their attributes (including role attributes)
 */
export async function gatherUserAttributes(
	db: Kysely<Database>,
	userId: string,
	config?: AuthorizationConfig
): Promise<{ userId: string; attributes: Map<string, AttributeValue> }> {
	const attributeMap = new Map<string, AttributeValue>();

	debugLog(config, "🔍 Gathering user attributes for:", userId);

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
		.where("user_attribute.user_id", "=", userId)
		.execute();

	debugLog(config, "👤 Found subject attributes:", subjectAttrs.length);
	subjectAttrs.forEach((attr) => {
		const key = `subject.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		debugLog(config, `   ✓ ${key} = "${attr.value}"`);
	});

	// Get role attributes for the user
	debugLog(config, "🎭 Gathering role attributes...");
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
		.where("user.id", "=", userId)
		.execute();

	debugLog(config, "🎭 Found role attributes:", roleAttrs.length);
	roleAttrs.forEach((attr) => {
		const key = `subject.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		debugLog(config, `   ✓ ${key} = "${attr.value}"`);
	});

	debugLog(config, "\n📋 === USER ATTRIBUTE MAP ===");
	if (config?.debug) {
		for (const [key, value] of attributeMap) {
			debugLog(config, `   ${key} = "${value.value}" (${value.type})`);
		}
	}

	return { userId, attributes: attributeMap };
}
