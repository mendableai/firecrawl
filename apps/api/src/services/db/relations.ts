import { relations } from "drizzle-orm/relations";
import { teams, users, products, prices, subscriptions, apiKeys, bulljobsTeams, coupons, webhooks, userNotifications, proxyResults, smartcrawlAutomations, userInvites, dataRetention, userTeams } from "./schema";

export const usersRelations = relations(users, ({one, many}) => ({
	team: one(teams, {
		fields: [users.teamId],
		references: [teams.id]
	}),
	userInvites: many(userInvites),
	userTeams: many(userTeams),
}));

export const teamsRelations = relations(teams, ({many}) => ({
	users: many(users),
	subscriptions: many(subscriptions),
	apiKeys: many(apiKeys),
	bulljobsTeams: many(bulljobsTeams),
	coupons: many(coupons),
	webhooks: many(webhooks),
	userNotifications: many(userNotifications),
	proxyResults: many(proxyResults),
	smartcrawlAutomations: many(smartcrawlAutomations),
	userInvites: many(userInvites),
	dataRetentions: many(dataRetention),
	userTeams: many(userTeams),
}));

export const pricesRelations = relations(prices, ({one, many}) => ({
	product: one(products, {
		fields: [prices.productId],
		references: [products.id]
	}),
	subscriptions: many(subscriptions),
}));

export const productsRelations = relations(products, ({many}) => ({
	prices: many(prices),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	team: one(teams, {
		fields: [subscriptions.teamId],
		references: [teams.id]
	}),
	price: one(prices, {
		fields: [subscriptions.priceId],
		references: [prices.id]
	}),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	team: one(teams, {
		fields: [apiKeys.teamId],
		references: [teams.id]
	}),
}));

export const bulljobsTeamsRelations = relations(bulljobsTeams, ({one}) => ({
	team: one(teams, {
		fields: [bulljobsTeams.teamId],
		references: [teams.id]
	}),
}));

export const couponsRelations = relations(coupons, ({one}) => ({
	team: one(teams, {
		fields: [coupons.teamId],
		references: [teams.id]
	}),
}));

export const webhooksRelations = relations(webhooks, ({one}) => ({
	team: one(teams, {
		fields: [webhooks.teamId],
		references: [teams.id]
	}),
}));

export const userNotificationsRelations = relations(userNotifications, ({one}) => ({
	team: one(teams, {
		fields: [userNotifications.teamId],
		references: [teams.id]
	}),
}));

export const proxyResultsRelations = relations(proxyResults, ({one}) => ({
	team: one(teams, {
		fields: [proxyResults.teamId],
		references: [teams.id]
	}),
}));

export const smartcrawlAutomationsRelations = relations(smartcrawlAutomations, ({one}) => ({
	team: one(teams, {
		fields: [smartcrawlAutomations.teamId],
		references: [teams.id]
	}),
}));

export const userInvitesRelations = relations(userInvites, ({one}) => ({
	user: one(users, {
		fields: [userInvites.invitedBy],
		references: [users.id]
	}),
	team: one(teams, {
		fields: [userInvites.teamId],
		references: [teams.id]
	}),
}));

export const dataRetentionRelations = relations(dataRetention, ({one}) => ({
	team: one(teams, {
		fields: [dataRetention.teamId],
		references: [teams.id]
	}),
}));

export const userTeamsRelations = relations(userTeams, ({one}) => ({
	team: one(teams, {
		fields: [userTeams.teamId],
		references: [teams.id]
	}),
	user: one(users, {
		fields: [userTeams.userId],
		references: [users.id]
	}),
}));