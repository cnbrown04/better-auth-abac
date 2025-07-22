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

// Attribute cache for reducing database queries with size limits
const attributeCache = new Map<string, { attributes: Map<string, AttributeValue>; timestamp: number }>();
const CACHE_TTL = 300000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Maximum cache entries
const CACHE_CLEANUP_INTERVAL = 60000; // 1 minute cleanup interval

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
	let removedCount = 0;
	
	// Remove expired entries
	for (const [key, value] of attributeCache) {
		if (now - value.timestamp > CACHE_TTL) {
			attributeCache.delete(key);
			removedCount++;
		}
	}
	
	// If still over limit, remove oldest entries
	if (attributeCache.size > MAX_CACHE_SIZE) {
		const entries = Array.from(attributeCache.entries());
		entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
		
		const entriesToRemove = entries.slice(0, attributeCache.size - MAX_CACHE_SIZE);
		entriesToRemove.forEach(([key]) => {
			attributeCache.delete(key);
			removedCount++;
		});
	}
	
	if (removedCount > 0) {
		console.log(`🧹 Cleaned up ${removedCount} cache entries. Current size: ${attributeCache.size}`);
	}
}

// Scheduled cache cleanup and memory monitoring
let lastCleanup = Date.now();
let lastMemoryCheck = Date.now();
const MEMORY_CHECK_INTERVAL = 30000; // 30 seconds
const MEMORY_WARNING_THRESHOLD = 100 * 1024 * 1024; // 100MB heap usage
const MEMORY_LIMIT_THRESHOLD = 500 * 1024 * 1024; // 500MB heap usage

function scheduleCleanup() {
	const now = Date.now();
	if (now - lastCleanup > CACHE_CLEANUP_INTERVAL) {
		cleanupCache();
		lastCleanup = now;
	}
}

function checkMemoryUsage() {
	const now = Date.now();
	if (now - lastMemoryCheck > MEMORY_CHECK_INTERVAL) {
		try {
			// Safe Node.js environment check
			const nodeProcess = (globalThis as any).process;
			if (nodeProcess && typeof nodeProcess.memoryUsage === 'function') {
				const memUsage = nodeProcess.memoryUsage();
				const heapUsed = memUsage.heapUsed;
				
				if (heapUsed > MEMORY_LIMIT_THRESHOLD) {
					console.error(`🚨 CRITICAL: Memory usage too high: ${Math.round(heapUsed / 1024 / 1024)}MB. Forcing cleanup.`);
					cleanupCache();
					// Consider throwing an error or implementing circuit breaker logic
				} else if (heapUsed > MEMORY_WARNING_THRESHOLD) {
					console.warn(`⚠️  WARNING: High memory usage detected: ${Math.round(heapUsed / 1024 / 1024)}MB`);
				}
			}
		} catch (error) {
			// Memory monitoring failed, continue silently
		}
		lastMemoryCheck = now;
	}
}

function validateContextSize(context?: Record<string, any>): Record<string, any> | undefined {
	if (!context) return context;
	
	try {
		const contextStr = JSON.stringify(context);
		const contextSize = Buffer.byteLength(contextStr, 'utf8');
		const MAX_CONTEXT_SIZE = 10 * 1024; // 10KB limit
		
		if (contextSize > MAX_CONTEXT_SIZE) {
			console.warn(`⚠️  Context size too large: ${contextSize} bytes. Truncating...`);
			// Truncate large context values
			const truncatedContext: Record<string, any> = {};
			for (const [key, value] of Object.entries(context)) {
				if (typeof value === 'string' && value.length > 1000) {
					truncatedContext[key] = value.substring(0, 1000) + '...[truncated]';
				} else {
					truncatedContext[key] = value;
				}
			}
			return truncatedContext;
		}
		
		return context;
	} catch (error) {
		console.warn('Failed to validate context size, using original context');
		return context;
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
	// Schedule cleanup and memory monitoring
	scheduleCleanup();
	checkMemoryUsage();

	// Validate and sanitize context
	const sanitizedContext = validateContextSize(request.context);
	const sanitizedRequest = { ...request, context: sanitizedContext };

	// Create cache key based on request parameters
	const cacheKey = `${sanitizedRequest.subjectId}-${sanitizedRequest.resourceId || 'no-resource'}-${sanitizedRequest.actionName}`;
	const cached = attributeCache.get(cacheKey);
	
	if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
		debugLog(config, "🎯 Using cached attributes for:", cacheKey);
		// Return a defensive copy to prevent external mutation
		return new Map(cached.attributes);
	}

	// Use bounded Map with size limit to prevent unbounded growth
	const attributeMap = new Map<string, AttributeValue>();
	const MAX_ATTRIBUTES_PER_REQUEST = 100; // Prevent unbounded attribute collection

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
		.where("user_attribute.user_id", "=", sanitizedRequest.subjectId)
		.execute();

	// Helper function to safely add attributes with bounds checking
	function safelyAddAttribute(key: string, attr: any, attributeCount: { count: number }): boolean {
		if (attributeCount.count >= MAX_ATTRIBUTES_PER_REQUEST) {
			console.warn(`⚠️  Attribute limit reached (${MAX_ATTRIBUTES_PER_REQUEST}). Skipping further attributes.`);
			return false;
		}
		
		attributeMap.set(key, {
			id: attr.id,
			name: attr.name,
			type: attr.type,
			category: attr.category,
			value: attr.value,
		});
		attributeCount.count++;
		debugLog(config, `   ✓ ${key} = "${attr.value}"`);
		return true;
	}

	const attributeCount = { count: 0 };

	debugLog(config, "👤 Found subject attributes:", subjectAttrs.length);
	for (const attr of subjectAttrs) {
		const key = `subject.${attr.name}`;
		if (!safelyAddAttribute(key, attr, attributeCount)) break;
	}

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
		.where("user.id", "=", sanitizedRequest.subjectId)
		.execute();

	debugLog(config, "🎭 Found role attributes:", roleAttrs.length);
	for (const attr of roleAttrs) {
		const key = `subject.${attr.name}`;
		if (!safelyAddAttribute(key, attr, attributeCount)) break;
	}

	// Get resource attributes if resource is specified
	if (sanitizedRequest.resourceId && attributeCount.count < MAX_ATTRIBUTES_PER_REQUEST) {
		debugLog(
			config,
			"📁 Gathering resource attributes for:",
			sanitizedRequest.resourceId
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
			.where("resource.resource_id", "=", sanitizedRequest.resourceId)
			.execute();

		debugLog(config, "📁 Found resource attributes:", resourceAttrs.length);
		for (const attr of resourceAttrs) {
			const key = `resource.${attr.name}`;
			if (!safelyAddAttribute(key, attr, attributeCount)) break;
		}

		// Add resource ownership check (if still within limits)
		if (attributeCount.count < MAX_ATTRIBUTES_PER_REQUEST) {
			const resourceOwner = await db
				.selectFrom("resource")
				.select("owner_id")
				.where("resource_id", "=", sanitizedRequest.resourceId)
				.executeTakeFirst();

			if (resourceOwner && attributeCount.count < MAX_ATTRIBUTES_PER_REQUEST) {
				attributeMap.set("resource.owner_id", {
					id: "resource-owner",
					name: "owner_id",
					type: "string",
					category: "resource",
					value: resourceOwner.owner_id,
				});
				attributeCount.count++;
				debugLog(config, `   ✓ resource.owner_id = "${resourceOwner.owner_id}"`);

				// Add is_owner dynamic attribute (if still within limits)
				if (attributeCount.count < MAX_ATTRIBUTES_PER_REQUEST) {
					const isOwner = (resourceOwner.owner_id === sanitizedRequest.subjectId).toString();
					attributeMap.set("resource.is_owner", {
						id: "resource-is-owner",
						name: "is_owner",
						type: "boolean",
						category: "resource",
						value: isOwner,
					});
					attributeCount.count++;
					debugLog(config, `   ✓ resource.is_owner = "${isOwner}"`);
				}
			}
		}
	}

	// Get action attributes (if still within limits)
	if (attributeCount.count < MAX_ATTRIBUTES_PER_REQUEST) {
		debugLog(config, "⚡ Gathering action attributes for:", sanitizedRequest.actionName);
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
			.where("actions.name", "=", sanitizedRequest.actionName)
			.execute();

		debugLog(config, "⚡ Found action attributes:", actionAttrs.length);
		for (const attr of actionAttrs) {
			const key = `action.${attr.name}`;
			if (!safelyAddAttribute(key, attr, attributeCount)) break;
		}
	}

	// Add dynamic action attribute (if still within limits)
	if (attributeCount.count < MAX_ATTRIBUTES_PER_REQUEST) {
		debugLog(config, "🔄 Adding dynamic action attribute...");
		attributeMap.set("action.action_name", {
			id: "dynamic-action-name",
			name: "action_name",
			type: "string",
			category: "action",
			value: sanitizedRequest.actionName,
		});
		attributeCount.count++;
		debugLog(config, `   ✓ action.action_name = "${sanitizedRequest.actionName}"`);
	}

	// Also add resource type if provided (if still within limits)
	if (sanitizedRequest.resourceType && attributeCount.count < MAX_ATTRIBUTES_PER_REQUEST) {
		debugLog(config, "🔄 Adding dynamic resource type attribute...");
		attributeMap.set("resource.resource_type", {
			id: "dynamic-resource-type",
			name: "resource_type",
			type: "string",
			category: "resource",
			value: sanitizedRequest.resourceType,
		});
		attributeCount.count++;
		debugLog(config, `   ✓ resource.resource_type = "${sanitizedRequest.resourceType}"`);
	}

	// Get environment attributes (if still within limits)
	if (attributeCount.count < MAX_ATTRIBUTES_PER_REQUEST) {
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
		for (const attr of envAttrs) {
			const key = `environment.${attr.name}`;
			if (!safelyAddAttribute(key, attr, attributeCount)) break;
		}
	}

	// Add dynamic environment attributes (with bounds checking)
	addDynamicEnvironmentAttributes(attributeMap, sanitizedRequest.context, config, attributeCount, MAX_ATTRIBUTES_PER_REQUEST);

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
	config?: AuthorizationConfig,
	attributeCount?: { count: number },
	maxAttributes?: number
) {
	debugLog(config, "🔄 Adding dynamic environment attributes...");

	const safeCount = attributeCount || { count: 0 };
	const limit = maxAttributes || 100;

	// Reuse Date object to reduce allocation
	const now = new Date();
	
	// Current time (if within limits)
	if (safeCount.count < limit) {
		const currentTimeString = now.toISOString();
		attributeMap.set("environment.current_time", {
			id: "env-current-time",
			name: "current_time",
			type: "string",
			category: "environment",
			value: currentTimeString,
		});
		safeCount.count++;
		debugLog(config, `   ✓ environment.current_time = "${currentTimeString}"`);
	}

	// Current day of week (if within limits)
	if (safeCount.count < limit) {
		const dayOfWeek = now.getDay().toString();
		attributeMap.set("environment.day_of_week", {
			id: "env-day-of-week",
			name: "day_of_week",
			type: "string",
			category: "environment",
			value: dayOfWeek,
		});
		safeCount.count++;
		debugLog(config, `   ✓ environment.day_of_week = "${dayOfWeek}"`);
	}

	// Add context attributes - with strict limits to prevent memory issues
	if (context && Object.keys(context).length > 0 && safeCount.count < limit) {
		debugLog(config, "🎯 Adding context attributes...");
		const remainingSlots = limit - safeCount.count;
		const maxContextAttrs = Math.min(remainingSlots, 20); // Even stricter limit for context
		const contextEntries = Object.entries(context).slice(0, maxContextAttrs);
		
		for (const [key, value] of contextEntries) {
			if (safeCount.count >= limit) break;
			
			const envKey = `environment.${key}`;
			attributeMap.set(envKey, {
				id: `ctx-${key}`,
				name: key,
				type: typeof value,
				category: "environment",
				value: String(value).slice(0, 1000), // Limit value length to 1000 chars
			});
			safeCount.count++;
			debugLog(config, `   ✓ ${envKey} = "${value}"`);
		}
		
		if (Object.keys(context).length > maxContextAttrs) {
			console.warn(`⚠️  Context has ${Object.keys(context).length} attributes, limiting to ${maxContextAttrs} for memory efficiency`);
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
 * Batch authorization check for multiple resources with memory-safe processing
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
	const MAX_RESOURCE_LIMIT = 1000; // Prevent processing excessive numbers of resources
	
	// Validate input size to prevent memory exhaustion
	if (resourceIds.length > MAX_RESOURCE_LIMIT) {
		throw new Error(`Too many resources requested: ${resourceIds.length}. Maximum allowed: ${MAX_RESOURCE_LIMIT}`);
	}

	// Process resources in batches to limit memory usage
	for (let i = 0; i < resourceIds.length; i += BATCH_SIZE) {
		const batch = resourceIds.slice(i, i + BATCH_SIZE);
		
		// Create promises with explicit cleanup tracking
		const promises = batch.map(async (resourceId) => {
			let batchResult: { resourceId: string; result: AuthorizationResult; success: boolean } | null = null;
			
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
				
				batchResult = { resourceId, result, success: true };
				return batchResult;
			} catch (error) {
				debugLog(config, `Error processing resource ${resourceId}:`, error);
				batchResult = {
					resourceId,
					result: {
						decision: "indeterminate" as const,
						reason: `Error processing resource: ${error instanceof Error ? error.message : 'Unknown error'}`,
						appliedPolicies: [],
						processingTimeMs: 0,
					},
					success: false
				};
				return batchResult;
			} finally {
				// Explicit cleanup for GC assistance
				batchResult = null;
			}
		});

		// Process batch and immediately clean up intermediate arrays
		const batchResults = await Promise.all(promises);

		// Process results and clear the batch array
		batchResults.forEach(({ resourceId, result }) => {
			results[resourceId] = result;
		});
		
		// Clear batch results array to free memory
		batchResults.length = 0;

		// Add small delay between batches to prevent overwhelming the database
		// and allow GC to run
		if (i + BATCH_SIZE < resourceIds.length) {
			await new Promise(resolve => setTimeout(resolve, 50)); // Increased delay for GC
			
			// Force garbage collection hint (if available in Node.js)
			try {
				const nodeProcess = (globalThis as any).process;
				if (nodeProcess && typeof nodeProcess.memoryUsage === 'function') {
					const nodeGlobal = globalThis as any;
					if (nodeGlobal.gc && typeof nodeGlobal.gc === 'function') {
						nodeGlobal.gc();
					}
				}
			} catch (e) {
				// GC not available or failed, continue silently
			}
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
