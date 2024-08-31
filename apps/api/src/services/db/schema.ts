import { pgTable, index, foreignKey, uuid, text, jsonb, boolean, smallint, bigint, integer, timestamp, varchar, date, serial, doublePrecision, unique, real, numeric, primaryKey, pgEnum, bigserial } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ScrapeEvent } from "../../lib/scrape-events"

export const pricingPlanInterval = pgEnum("pricing_plan_interval", ['day', 'week', 'month', 'year'])
export const pricingType = pgEnum("pricing_type", ['one_time', 'recurring'])
export const subscriptionStatus = pgEnum("subscription_status", ['trialing', 'active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'paused'])

export const users = pgTable("users", {
	id: uuid("id").primaryKey().notNull(),
	fullName: text("full_name"),
	avatarUrl: text("avatar_url"),
	billingAddress: jsonb("billing_address"),
	paymentMethod: jsonb("payment_method"),
	email: text("email"),
	teamId: uuid("team_id"),
},
(table) => {
	return {
		teamIdIdx: index("users_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		publicUsersTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "public_users_team_id_fkey"
		}),
		usersIdFkey: foreignKey({
			columns: [table.id],
			foreignColumns: [table.id],
			name: "users_id_fkey"
		}),
	}
});

export const customers = pgTable("customers", {
	id: uuid("id").primaryKey().notNull(),
	stripeCustomerId: text("stripe_customer_id"),
},
(table) => {
	return {
		customersIdFkey: foreignKey({
			columns: [table.id],
			foreignColumns: [users.id],
			name: "customers_id_fkey"
		}),
	}
});

export const products = pgTable("products", {
	id: text("id").primaryKey().notNull(),
	active: boolean("active"),
	name: text("name"),
	description: text("description"),
	image: text("image"),
	metadata: jsonb("metadata"),
	order: smallint("order"),
	testMode: boolean("test_mode").default(true),
	isEnterprise: boolean("is_enterprise").default(false),
});

export const prices = pgTable("prices", {
	id: text("id").primaryKey().notNull(),
	productId: text("product_id"),
	active: boolean("active"),
	description: text("description"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitAmount: bigint("unit_amount", { mode: "number" }),
	currency: text("currency"),
	type: pricingType("type"),
	interval: pricingPlanInterval("interval"),
	intervalCount: integer("interval_count"),
	trialPeriodDays: integer("trial_period_days"),
	metadata: jsonb("metadata"),
	credits: integer("credits").default(50),
	isUsage: boolean("is_usage").default(false),
},
(table) => {
	return {
		productIdIdx: index("prices_product_id_idx").using("btree", table.productId.asc().nullsLast()),
		pricesProductIdFkey: foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "prices_product_id_fkey"
		}),
	}
});

export const subscriptions = pgTable("subscriptions", {
	id: text("id").primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	status: subscriptionStatus("status"),
	metadata: jsonb("metadata"),
	priceId: text("price_id"),
	quantity: integer("quantity"),
	cancelAtPeriodEnd: boolean("cancel_at_period_end"),
	created: timestamp("created", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	cancelAt: timestamp("cancel_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	canceledAt: timestamp("canceled_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	trialStart: timestamp("trial_start", { withTimezone: true, mode: 'string' }).defaultNow(),
	trialEnd: timestamp("trial_end", { withTimezone: true, mode: 'string' }).defaultNow(),
	teamId: uuid("team_id"),
	isUsage: boolean("is_usage").default(false),
},
(table) => {
	return {
		idxSubscriptionsTeamId: index("idx_subscriptions_team_id").using("btree", table.teamId.asc().nullsLast()),
		priceIdIdx: index("subscriptions_price_id_idx").using("btree", table.priceId.asc().nullsLast()),
		userIdIdx: index("subscriptions_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		publicSubscriptionsTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "public_subscriptions_team_id_fkey"
		}),
		subscriptionsPriceIdFkey: foreignKey({
			columns: [table.priceId],
			foreignColumns: [prices.id],
			name: "subscriptions_price_id_fkey"
		}),
		subscriptionsUserIdFkey: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "subscriptions_user_id_fkey"
		}),
	}
});

export const teams = pgTable("teams", {
	id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	name: text("name"),
});

export const apiKeys = pgTable("api_keys", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }).primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	key: uuid("key").default(sql`uuid_generate_v4()`),
	name: text("name"),
	teamId: uuid("team_id"),
},
(table) => {
	return {
		teamIdIdx: index("api_keys_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		idxApiKeysKey: index("idx_api_keys_key").using("btree", table.key.asc().nullsLast()),
		fkTeam: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "fk_team"
		}),
	}
});

export const bulljobsTeams = pgTable("bulljobs_teams", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }).primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	jobId: text("job_id"),
	teamId: uuid("team_id"),
},
(table) => {
	return {
		teamIdIdx: index("bulljobs_teams_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		bulljobsTeamsTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "bulljobs_teams_team_id_fkey"
		}),
	}
});

export const githubOutbound = pgTable("github_outbound", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }).primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	username: text("username"),
	email: text("email"),
	name: text("name"),
	githubProfile: text("github_profile"),
	starredRepo: text("starred_repo"),
});

export const coupons = pgTable("coupons", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	teamId: uuid("team_id").defaultRandom(),
	credits: integer("credits"),
	status: varchar("status").default('active'),
},
(table) => {
	return {
		teamIdIdx: index("coupons_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		couponsTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "coupons_team_id_fkey"
		}),
	}
});

export const webhooks = pgTable("webhooks", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	url: text("url"),
	teamId: uuid("team_id").defaultRandom(),
},
(table) => {
	return {
		teamIdIdx: index("webhooks_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		publicWebhooksTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "public_webhooks_team_id_fkey"
		}),
	}
});

export const userNotifications = pgTable("user_notifications", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	teamId: uuid("team_id"),
	notificationType: text("notification_type").notNull(),
	sentDate: date("sent_date").notNull(),
},
(table) => {
	return {
		teamIdIdx: index("user_notifications_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		userNotificationsTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "user_notifications_team_id_fkey"
		}),
	}
});

export const proxyResults = pgTable("proxy_results", {
	id: serial("id").primaryKey().notNull(),
	proxy: text("proxy").notNull(),
	url: text("url").notNull(),
	success: boolean("success"),
	responseCode: integer("response_code"),
	timeTakenSeconds: doublePrecision("time_taken_seconds"),
	errorMessage: text("error_message"),
	dateAdded: timestamp("date_added", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	inRetry: boolean("in_retry"),
	html: text("html"),
	ipv4Support: boolean("ipv4_support"),
	ipv6Support: boolean("ipv6_support"),
	engine: text("engine"),
	teamId: uuid("team_id"),
},
(table) => {
	return {
		teamIdIdx: index("proxy_results_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		proxyResultsTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "proxy_results_team_id_fkey"
		}),
	}
});

export const scrapeLogs = pgTable("scrape_logs", {
	id: serial("id").primaryKey().notNull(),
	url: text("url").notNull(),
	scraper: text("scraper").notNull(),
	success: boolean("success"),
	responseCode: integer("response_code"),
	timeTakenSeconds: doublePrecision("time_taken_seconds"),
	proxy: text("proxy"),
	retried: boolean("retried"),
	errorMessage: text("error_message"),
	dateAdded: timestamp("date_added", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	html: text("html"),
	ipv4Support: boolean("ipv4_support"),
	ipv6Support: boolean("ipv6_support"),
});

export const smartcrawlAutomations = pgTable("smartcrawl_automations", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	teamId: uuid("team_id"),
	name: text("name"),
	description: text("description"),
	steps: jsonb("steps"),
	status: text("status"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	output: jsonb("output"),
},
(table) => {
	return {
		smartcrawlProceduresTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "smartcrawl_procedures_team_id_fkey"
		}),
	}
});

export const smartcrawlWaitlist = pgTable("smartcrawl_waitlist", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	email: text("email"),
	usecase: text("usecase"),
	company: text("company"),
});

export const scrapeEvents = pgTable("scrape_events", {
	jobId: uuid("job_id").defaultRandom().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }).primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	type: text("type"),
	content: jsonb("content").$type<ScrapeEvent>(),
},
(table) => {
	return {
		scrapeEventsIdKey: unique("scrape_events_id_key").on(table.id),
	}
});

export const userInvites = pgTable("user_invites", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	teamId: uuid("team_id"),
	email: text("email"),
	code: uuid("code").default(sql`uuid_generate_v4()`),
	invitedBy: uuid("invited_by"),
	role: text("role"),
},
(table) => {
	return {
		teamIdIdx: index("user_invites_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		fkInvitedBy: foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [users.id],
			name: "fk_invited_by"
		}),
		fkTeam: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "fk_team"
		}),
		uniqueTeamInvite: unique("unique_team_invite").on(table.teamId, table.email),
	}
});

export const idempotencyKeys = pgTable("idempotency_keys", {
	key: uuid("key").defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const creditUsage = pgTable("credit_usage", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }).primaryKey(),
	teamId: uuid("team_id").notNull(),
	subscriptionId: text("subscription_id"),
	creditsUsed: integer("credits_used").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxCreditUsageCreatedAt: index("idx_credit_usage_created_at").using("btree", table.createdAt.asc().nullsLast()),
		idxCreditUsageTeamId: index("idx_credit_usage_team_id").using("btree", table.teamId.asc().nullsLast()),
		idxCreditUsageTeamIdSubscriptionId: index("idx_credit_usage_team_id_subscription_id").using("btree", table.teamId.asc().nullsLast()).where(sql`(subscription_id IS NULL)`),
		idxCreditUsageTeamSubscrCreated: index("idx_credit_usage_team_subscr_created").using("btree", table.teamId.asc().nullsLast(), table.subscriptionId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	}
});

export const dataRetention = pgTable("data_retention", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }).primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	name: text("name"),
	teamId: uuid("team_id").defaultRandom(),
	days: integer("days").default(30),
	lastDeletionDate: timestamp("last_deletion_date", { withTimezone: true, mode: 'string' }),
},
(table) => {
	return {
		teamIdIdx: index("data_retention_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		dataRetentionTeamIdFkey: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "data_retention_team_id_fkey"
		}),
	}
});

export const testSuiteLogs = pgTable("test_suite_logs", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigserial("id", { mode: "number" }).primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	log: jsonb("log"),
	score: real("score"),
	timeTaken: real("time_taken"),
	numTokens: integer("num_tokens"),
	numPagesTested: integer("num_pages_tested"),
	isError: boolean("is_error"),
});

export const firecrawlJobs = pgTable("firecrawl_jobs", {
	id: serial("id").primaryKey().notNull(),
	success: boolean("success").notNull(),
	message: text("message"),
	url: text("url").notNull(),
	mode: text("mode").notNull(),
	numDocs: integer("num_docs").notNull(),
	docs: jsonb("docs"),
	timeTaken: numeric("time_taken").notNull(),
	teamId: uuid("team_id"),
	crawlerOptions: jsonb("crawler_options"),
	pageOptions: jsonb("page_options"),
	dateAdded: timestamp("date_added", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	origin: text("origin"),
	extractorOptions: jsonb("extractor_options"),
	numTokens: integer("num_tokens"),
	jobId: uuid("job_id"),
	jobProgress: jsonb("job_progress"),
	retry: boolean("retry").default(false),
	crawlId: uuid("crawl_id"),
},
(table) => {
	return {
		crawlIdIdx: index("firecrawl_jobs_crawl_id_idx").using("btree", table.crawlId.asc().nullsLast()),
		idxFirecrawlJobsDateAdded: index("idx_firecrawl_jobs_date_added").using("btree", table.dateAdded.asc().nullsLast()),
		idxFirecrawlJobsTeamDateMode: index("idx_firecrawl_jobs_team_date_mode").using("btree", table.teamId.asc().nullsLast(), table.dateAdded.asc().nullsLast(), table.mode.asc().nullsLast()),
		idxFirecrawlJobsTeamId: index("idx_firecrawl_jobs_team_id").using("btree", table.teamId.asc().nullsLast()),
		idxFirecrawlJobsTeamIdDateAdded: index("idx_firecrawl_jobs_team_id_date_added").using("btree", table.teamId.asc().nullsLast(), table.dateAdded.asc().nullsLast()),
		idxJobId: index("idx_job_id").using("btree", table.jobId.asc().nullsLast()),
	}
});

export const userTeams = pgTable("user_teams", {
	userId: uuid("user_id").notNull(),
	teamId: uuid("team_id").notNull(),
	role: text("role").default('admin'),
},
(table) => {
	return {
		teamIdIdx: index("user_teams_team_id_idx").using("btree", table.teamId.asc().nullsLast()),
		userIdIdx: index("user_teams_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		fkTeam: foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "fk_team"
		}),
		fkUser: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "fk_user"
		}),
		userTeamsPkey: primaryKey({ columns: [table.userId, table.teamId], name: "user_teams_pkey"}),
	}
});