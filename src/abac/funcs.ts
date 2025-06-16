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

	console.log("🚀 === AUTHORIZATION DEBUG START ===");
	console.log("📋 Request:", JSON.stringify(request, null, 2));

	try {
		// Step 1: Gather all attributes for the request
		console.log("\n📊 Step 1: Gathering attributes...");
		const attributes = await gatherAttributes(db, request);

		// Step 2: Find applicable policies
		console.log("\n🎯 Step 2: Finding applicable policies...");
		const applicablePolicies = await findApplicablePolicies(
			db,
			request,
			attributes
		);

		// Step 3: Evaluate policies
		console.log("\n⚖️ Step 3: Evaluating policies...");
		const policyEvaluations = await evaluatePolicies(
			applicablePolicies,
			attributes
		);

		// Step 4: Make final decision (now passes policies for priority lookup)
		console.log("\n🏁 Step 4: Making final decision...");
		const decision = makeFinalDecision(policyEvaluations, applicablePolicies);

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

		console.log("\n✅ === AUTHORIZATION DEBUG END ===");
		console.log("🎭 Final Decision:", decision);
		console.log("⏱️ Processing Time:", processingTime + "ms");

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
 * Gather all relevant attributes for the authorization request
 */
async function gatherAttributes(
	db: Kysely<Database>,
	request: AuthorizationRequest
): Promise<Map<string, AttributeValue>> {
	const attributeMap = new Map<string, AttributeValue>();

	console.log("🔍 Gathering subject attributes for user:", request.subjectId);

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

	console.log("👤 Found subject attributes:", subjectAttrs.length);
	subjectAttrs.forEach((attr) => {
		const key = `subject.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		console.log(`   ✓ ${key} = "${attr.value}"`);
	});

	// Get role attributes for the user
	console.log("🎭 Gathering role attributes...");
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

	console.log("🎭 Found role attributes:", roleAttrs.length);
	roleAttrs.forEach((attr) => {
		const key = `subject.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		console.log(`   ✓ ${key} = "${attr.value}"`);
	});

	// Get resource attributes if resource is specified
	if (request.resourceId) {
		console.log("📁 Gathering resource attributes for:", request.resourceId);
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

		console.log("📁 Found resource attributes:", resourceAttrs.length);
		resourceAttrs.forEach((attr) => {
			const key = `resource.${attr.name}`;
			attributeMap.set(key, {
				id: attr.id,
				name: attr.name,
				type: attr.type,
				category: attr.category,
				value: attr.value,
			});
			console.log(`   ✓ ${key} = "${attr.value}"`);
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
			console.log(`   ✓ resource.owner_id = "${resourceOwner.owner_id}"`);

			// Add is_owner dynamic attribute
			const isOwner = (resourceOwner.owner_id === request.subjectId).toString();
			attributeMap.set("resource.is_owner", {
				id: "resource-is-owner",
				name: "is_owner",
				type: "boolean",
				category: "resource",
				value: isOwner,
			});
			console.log(`   ✓ resource.is_owner = "${isOwner}"`);
		}
	}

	// Get action attributes
	console.log("⚡ Gathering action attributes for:", request.actionName);
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

	console.log("⚡ Found action attributes:", actionAttrs.length);
	actionAttrs.forEach((attr) => {
		const key = `action.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		console.log(`   ✓ ${key} = "${attr.value}"`);
	});

	console.log("🔄 Adding dynamic action attribute...");
	attributeMap.set("action.action_name", {
		id: "dynamic-action-name",
		name: "action_name",
		type: "string",
		category: "action",
		value: request.actionName,
	});
	console.log(`   ✓ action.action_name = "${request.actionName}"`);

	// Also add resource type if provided
	if (request.resourceType) {
		console.log("🔄 Adding dynamic resource type attribute...");
		attributeMap.set("resource.resource_type", {
			id: "dynamic-resource-type",
			name: "resource_type",
			type: "string",
			category: "resource",
			value: request.resourceType,
		});
		console.log(`   ✓ resource.resource_type = "${request.resourceType}"`);
	}

	// Get environment attributes
	console.log("🌍 Gathering environment attributes...");
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

	console.log("🌍 Found environment attributes:", envAttrs.length);
	envAttrs.forEach((attr) => {
		const key = `environment.${attr.name}`;
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		console.log(`   ✓ ${key} = "${attr.value}"`);
	});

	// Add dynamic environment attributes
	addDynamicEnvironmentAttributes(attributeMap, request.context);

	console.log("\n📋 === FINAL ATTRIBUTE MAP ===");
	for (const [key, value] of attributeMap) {
		console.log(`   ${key} = "${value.value}" (${value.type})`);
	}

	return attributeMap;
}

/**
 * Add dynamic environment attributes from context
 */
function addDynamicEnvironmentAttributes(
	attributeMap: Map<string, AttributeValue>,
	context?: Record<string, any>
) {
	console.log("🔄 Adding dynamic environment attributes...");

	// Current time
	attributeMap.set("environment.current_time", {
		id: "env-current-time",
		name: "current_time",
		type: "string",
		category: "environment",
		value: new Date().toISOString(),
	});
	console.log(`   ✓ environment.current_time = "${new Date().toISOString()}"`);

	// Current day of week
	const dayOfWeek = new Date().getDay().toString();
	attributeMap.set("environment.day_of_week", {
		id: "env-day-of-week",
		name: "day_of_week",
		type: "string",
		category: "environment",
		value: dayOfWeek,
	});
	console.log(`   ✓ environment.day_of_week = "${dayOfWeek}"`);

	// Add context attributes
	if (context) {
		console.log("🎯 Adding context attributes...");
		Object.entries(context).forEach(([key, value]) => {
			const envKey = `environment.${key}`;
			attributeMap.set(envKey, {
				id: `ctx-${key}`,
				name: key,
				type: typeof value,
				category: "environment",
				value: String(value),
			});
			console.log(`   ✓ ${envKey} = "${value}"`);
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
	console.log("🔍 Finding all active policies...");
	const policies = await db
		.selectFrom("policy")
		.selectAll()
		.where("is_active", "=", 1)
		.orderBy("priority", "desc")
		.execute();

	console.log(`📋 Found ${policies.length} active policies`);

	const policiesWithRulesAndTargets: PolicyWithRules[] = [];

	for (const policy of policies) {
		console.log(`\n🎯 Processing policy: "${policy.name}" (${policy.id})`);

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

		console.log(`   📜 Found ${rules.length} rules for this policy`);
		rules.forEach((rule, index) => {
			console.log(
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

		console.log(`   🎯 Found ${targets.length} targets for this policy`);
		targets.forEach((target, index) => {
			console.log(
				`      Target ${index + 1}: ${target.target_type}.${
					target.attributeName
				} ${target.operator} "${target.value}"`
			);
		});

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

	console.log(`\n⚖️ Evaluating ${policies.length} policies...`);

	for (const policyData of policies) {
		const { policy, rules, targets } = policyData;

		console.log(`\n🔍 Evaluating policy: "${policy.name}"`);

		// Check if policy targets match
		console.log("   🎯 Checking targets...");
		const targetMatches = evaluateTargets(targets, attributes);
		console.log(
			`   🎯 Target result: ${targetMatches ? "✅ PASS" : "❌ FAIL"}`
		);

		if (!targetMatches) {
			console.log("   ⏭️ Skipping policy due to target mismatch");
			continue; // Skip this policy if targets don't match
		}

		// Evaluate policy rules
		console.log("   📜 Checking rules...");
		const ruleMatches = evaluateRules(rules, attributes);
		console.log(
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

		console.log(
			`   🏷️ Policy added to evaluations: effect=${policy.effect}, matches=${ruleMatches.matches}`
		);
	}

	console.log(`\n📊 Total policies evaluated: ${evaluations.length}`);
	return evaluations;
}

/**
 * Evaluate policy targets
 */
function evaluateTargets(
	targets: any[],
	attributes: Map<string, AttributeValue>
): boolean {
	if (!targets || targets.length === 0) {
		console.log("      🎯 No targets defined - returning true");
		return true;
	}

	console.log(`      🎯 Evaluating ${targets.length} targets:`);

	return targets.every((target, index) => {
		if (!target.attribute_id) {
			console.log(
				`         Target ${index + 1}: No attribute_id - returning true`
			);
			return true;
		}

		const attrKey = `${target.target_type}.${target.attributeName}`;
		console.log(
			`         Target ${index + 1}: Looking for attribute key: "${attrKey}"`
		);

		const attribute = attributes.get(attrKey);
		console.log(
			`         Target ${index + 1}: Found attribute: ${
				attribute ? `"${attribute.value}"` : "❌ NOT FOUND"
			}`
		);

		if (!attribute) {
			console.log(
				`         Target ${index + 1}: ❌ FAIL - Attribute not found`
			);
			return false;
		}

		const operator = OPERATORS[target.operator as keyof typeof OPERATORS];
		if (!operator) {
			console.log(
				`         Target ${index + 1}: ❌ FAIL - Unknown operator: ${
					target.operator
				}`
			);
			return false;
		}

		const result = operator(attribute.value, target.value);
		console.log(
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
	attributes: Map<string, AttributeValue>
): { matches: boolean; reason?: string } {
	if (!rules || rules.length === 0) {
		console.log("      📜 No rules defined - returning true");
		return { matches: true };
	}

	console.log(`      📜 Evaluating ${rules.length} rules:`);

	// Group rules by groupId
	const ruleGroups = new Map<string, any[]>();

	rules.forEach((rule) => {
		const groupId = rule.group_id || "default";
		if (!ruleGroups.has(groupId)) {
			ruleGroups.set(groupId, []);
		}
		ruleGroups.get(groupId)!.push(rule);
	});

	console.log(
		`      📜 Rule groups: ${Array.from(ruleGroups.keys()).join(", ")}`
	);

	// Evaluate each group
	const groupResults: boolean[] = [];

	for (const [groupId, groupRules] of ruleGroups) {
		console.log(
			`         📦 Evaluating group "${groupId}" with ${groupRules.length} rules:`
		);
		const groupResult = evaluateRuleGroup(groupRules, attributes);
		console.log(
			`         📦 Group "${groupId}" result: ${
				groupResult ? "✅ PASS" : "❌ FAIL"
			}`
		);
		groupResults.push(groupResult);
	}

	// All groups must be true (AND between groups)
	const finalResult = groupResults.every((result) => result);
	console.log(
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
	attributes: Map<string, AttributeValue>
): boolean {
	if (rules.length === 0) return true;

	let result = true;
	let currentOperator = "AND";

	for (const [index, rule] of rules.entries()) {
		console.log(
			`            🔍 Rule ${index + 1}: Looking for attribute "${
				rule.attributeName
			}"`
		);

		const attribute = findAttributeByName(rule.attributeName, attributes);
		console.log(
			`            🔍 Rule ${index + 1}: Found attribute: ${
				attribute ? `"${attribute.value}"` : "❌ NOT FOUND"
			}`
		);

		if (!attribute) {
			console.log(
				`            🔍 Rule ${index + 1}: ❌ FAIL - Attribute not found`
			);
			if (currentOperator === "AND") {
				result = false;
			}
			continue;
		}

		const operator = OPERATORS[rule.operator as keyof typeof OPERATORS];
		if (!operator) {
			console.log(
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
		console.log(
			`            🔍 Rule ${index + 1}: "${attribute.value}" ${
				rule.operator
			} "${rule.value}" = ${ruleResult ? "✅ PASS" : "❌ FAIL"}`
		);

		if (currentOperator === "AND") {
			result = result && ruleResult;
			console.log(
				`            🔍 Rule ${index + 1}: AND result so far: ${result}`
			);
		} else if (currentOperator === "OR") {
			result = result || ruleResult;
			console.log(
				`            🔍 Rule ${index + 1}: OR result so far: ${result}`
			);
		}

		currentOperator = rule.logical_operator || "AND";
		console.log(
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
	console.log(
		`\n🏁 Making final decision from ${evaluations.length} evaluations...`
	);

	if (evaluations.length === 0) {
		console.log("🏁 No applicable policies found");
		return {
			decision: "not_applicable",
			reason: "No applicable policies found",
		};
	}

	// Filter to only matching policies
	const matchingEvaluations = evaluations.filter((e) => e.matches);
	console.log(`🏁 Found ${matchingEvaluations.length} matching policies`);

	if (matchingEvaluations.length === 0) {
		console.log("🏁 No matching policies found");
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

	console.log("🏁 Sorted matching policies by priority:");
	sortedEvaluations.forEach((evals, index) => {
		const priority = policyPriorityMap.get(evals.policyId) || 0;
		console.log(
			`   ${index + 1}. "${evals.policyName}" (priority: ${priority}, effect: ${
				evals.effect
			})`
		);
	});

	// Return the decision of the highest priority matching policy
	const highestPriorityPolicy = sortedEvaluations[0];
	const decision =
		highestPriorityPolicy.effect === "permit" ? "permit" : "deny";
	console.log(
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

		if (!resourceId || resourceId === "") {
			// If no resource ID is found, we can't log the access request
			console.warn("No resource ID found for logging access request");
			return;
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
