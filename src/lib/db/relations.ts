import { relations } from "drizzle-orm/relations";
import {
	actions,
	accessRequest,
	resource,
	user,
	account,
	actionAttribute,
	attribute,
	resourceType,
	dynamicAttribute,
	environmentAttribute,
	policySet,
	policy,
	policyRule,
	policyTarget,
	resourceAttribute,
	roleAttribute,
	role,
	session,
	userAttribute,
} from "./schema";

export const accessRequestRelations = relations(accessRequest, ({ one }) => ({
	action: one(actions, {
		fields: [accessRequest.actionId],
		references: [actions.id],
	}),
	resource: one(resource, {
		fields: [accessRequest.resourceId],
		references: [resource.id],
	}),
	user: one(user, {
		fields: [accessRequest.userId],
		references: [user.id],
	}),
}));

export const actionsRelations = relations(actions, ({ one, many }) => ({
	accessRequests: many(accessRequest),
	actionAttributes: many(actionAttribute),
	resourceType: one(resourceType, {
		fields: [actions.resourceTypeId],
		references: [resourceType.id],
	}),
}));

export const resourceRelations = relations(resource, ({ one, many }) => ({
	accessRequests: many(accessRequest),
	user: one(user, {
		fields: [resource.ownerId],
		references: [user.id],
	}),
	resourceType: one(resourceType, {
		fields: [resource.resourceTypeId],
		references: [resourceType.id],
	}),
	resourceAttributes: many(resourceAttribute),
}));

export const userRelations = relations(user, ({ one, many }) => ({
	accessRequests: many(accessRequest),
	accounts: many(account),
	resources: many(resource),
	sessions: many(session),
	role: one(role, {
		fields: [user.roleId],
		references: [role.id],
	}),
	userAttributes: many(userAttribute),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const actionAttributeRelations = relations(
	actionAttribute,
	({ one }) => ({
		action: one(actions, {
			fields: [actionAttribute.actionId],
			references: [actions.id],
		}),
		attribute: one(attribute, {
			fields: [actionAttribute.attributeId],
			references: [attribute.id],
		}),
	})
);

export const attributeRelations = relations(attribute, ({ many }) => ({
	actionAttributes: many(actionAttribute),
	dynamicAttributes: many(dynamicAttribute),
	environmentAttributes: many(environmentAttribute),
	policyRules: many(policyRule),
	policyTargets: many(policyTarget),
	resourceAttributes: many(resourceAttribute),
	roleAttributes: many(roleAttribute),
	userAttributes: many(userAttribute),
}));

export const resourceTypeRelations = relations(resourceType, ({ many }) => ({
	actions: many(actions),
	resources: many(resource),
}));

export const dynamicAttributeRelations = relations(
	dynamicAttribute,
	({ one }) => ({
		attribute: one(attribute, {
			fields: [dynamicAttribute.attributeId],
			references: [attribute.id],
		}),
	})
);

export const environmentAttributeRelations = relations(
	environmentAttribute,
	({ one }) => ({
		attribute: one(attribute, {
			fields: [environmentAttribute.attributeId],
			references: [attribute.id],
		}),
	})
);

export const policyRelations = relations(policy, ({ one, many }) => ({
	policySet: one(policySet, {
		fields: [policy.policySetId],
		references: [policySet.id],
	}),
	policyRules: many(policyRule),
	policyTargets: many(policyTarget),
}));

export const policySetRelations = relations(policySet, ({ many }) => ({
	policies: many(policy),
}));

export const policyRuleRelations = relations(policyRule, ({ one }) => ({
	attribute: one(attribute, {
		fields: [policyRule.attributeId],
		references: [attribute.id],
	}),
	policy: one(policy, {
		fields: [policyRule.policyId],
		references: [policy.id],
	}),
}));

export const policyTargetRelations = relations(policyTarget, ({ one }) => ({
	attribute: one(attribute, {
		fields: [policyTarget.attributeId],
		references: [attribute.id],
	}),
	policy: one(policy, {
		fields: [policyTarget.policyId],
		references: [policy.id],
	}),
}));

export const resourceAttributeRelations = relations(
	resourceAttribute,
	({ one }) => ({
		attribute: one(attribute, {
			fields: [resourceAttribute.attributeId],
			references: [attribute.id],
		}),
		resource: one(resource, {
			fields: [resourceAttribute.resourceId],
			references: [resource.id],
		}),
	})
);

export const roleAttributeRelations = relations(roleAttribute, ({ one }) => ({
	attribute: one(attribute, {
		fields: [roleAttribute.attributeId],
		references: [attribute.id],
	}),
	role: one(role, {
		fields: [roleAttribute.roleId],
		references: [role.id],
	}),
}));

export const roleRelations = relations(role, ({ many }) => ({
	roleAttributes: many(roleAttribute),
	users: many(user),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const userAttributeRelations = relations(userAttribute, ({ one }) => ({
	attribute: one(attribute, {
		fields: [userAttribute.attributeId],
		references: [attribute.id],
	}),
	user: one(user, {
		fields: [userAttribute.userId],
		references: [user.id],
	}),
}));
