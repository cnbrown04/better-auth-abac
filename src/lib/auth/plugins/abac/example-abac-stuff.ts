/**
 * Setup helper functions for initial ABAC configuration
 */

import { db } from "./abac-config";

// Example function to create basic attributes
export async function setupBasicAttributes() {
	const basicAttributes = [
		{
			id: "attr-can-edit-all-audits",
			name: "can_edit_all_audits",
			type: "boolean",
			category: "subject",
			description: "Can edit any audit in the system",
			created_at: new Date(),
			updated_at: new Date(),
			valid_values: null,
		},
		{
			id: "attr-can-edit-own-audits",
			name: "can_edit_own_audits",
			type: "boolean",
			category: "subject",
			description: "Can edit own audits",
			created_at: new Date(),
			updated_at: new Date(),
			valid_values: null,
		},
		{
			id: "attr-audit-sensitivity",
			name: "sensitivity_level",
			type: "string",
			category: "resource",
			description: "Sensitivity level of the audit",
			created_at: new Date(),
			updated_at: new Date(),
			valid_values: null,
		},
	];

	// Insert attributes (you'd run this once during setup)
	for (const attr of basicAttributes) {
		await db
			.insertInto("attribute")
			.values(attr)
			.onDuplicateKeyUpdate({
				name: attr.name,
				type: attr.type,
				description: attr.description,
				updated_at: new Date(),
			})
			.execute();
	}
}

// Example function to setup role attributes for administrator
export async function setupAdministratorRoleAttributes(adminRoleId: string) {
	await db
		.insertInto("role_attribute")
		.values({
			id: crypto.randomUUID(),
			role_id: adminRoleId,
			attribute_id: "attr-can-edit-all-audits",
			value: "true",
			created_at: new Date(),
			updated_at: new Date(),
		})
		.execute();
}

// Example function to setup basic user attributes
export async function setupUserAuditAttributes(userId: string) {
	await db
		.insertInto("user_attribute")
		.values({
			id: crypto.randomUUID(),
			user_id: userId,
			attribute_id: "attr-can-edit-own-audits",
			value: "true",
			created_at: new Date(),
			updated_at: new Date(),
		})
		.execute();
}

// Example function to create audit edit policies
export async function setupAuditEditPolicies() {
	// First, create a policy set
	const policySetId = "policy-set-audit-edit";
	await db
		.insertInto("policy_set")
		.values({
			id: policySetId,
			name: "Audit Edit Policies",
			description: "Policies for audit editing permissions",
			priority: 1,
			is_active: 1,
			created_at: new Date(),
			updated_at: new Date(),
		})
		.execute();

	// Policy 1: Admins can edit all audits
	const adminPolicyId = "policy-admin-edit-all-audits";
	await db
		.insertInto("policy")
		.values({
			id: adminPolicyId,
			name: "Administrators can edit all audits",
			description:
				"Users with can_edit_all_audits attribute can edit any audit",
			effect: "permit",
			priority: 100,
			is_active: 1,
			policy_set_id: policySetId,
			rules: "[]",
			created_at: new Date(),
			updated_at: new Date(),
		})
		.execute();

	await db
		.insertInto("policy_rule")
		.values({
			id: crypto.randomUUID(),
			policy_id: adminPolicyId,
			attribute_id: "attr-can-edit-all-audits",
			operator: "equals",
			value: "true",
			logical_operator: "AND",
			group_id: null,
			created_at: new Date(),
		})
		.execute();

	// Policy 2: Users can edit their own audits
	const ownerPolicyId = "policy-owner-edit-own-audits";
	await db
		.insertInto("policy")
		.values({
			id: ownerPolicyId,
			name: "Users can edit their own audits",
			description: "Users can edit audits they own",
			effect: "permit",
			priority: 50,
			is_active: 1,
			policy_set_id: policySetId,
			rules: "[]",
			created_at: new Date(),
			updated_at: new Date(),
		})
		.execute();

	// Add rules for owner policy
	await db
		.insertInto("policy_rule")
		.values([
			{
				id: crypto.randomUUID(),
				policy_id: ownerPolicyId,
				attribute_id: "attr-can-edit-own-audits",
				operator: "equals",
				value: "true",
				logical_operator: "AND",
				group_id: "group1",
				created_at: new Date(),
			},
			{
				id: crypto.randomUUID(),
				policy_id: ownerPolicyId,
				attribute_id: "resource-is-owner", // This references the dynamic attribute
				operator: "equals",
				value: "true",
				logical_operator: "AND",
				group_id: "group1",
				created_at: new Date(),
			},
		])
		.execute();
}
