import { NotificationType } from "../../types";
import { withAuth } from "../../lib/withAuth";
import { sendNotification } from "../notification/email_notification";
import { supabase_service } from "../supabase";
import { Logger } from "../../lib/logger";
import * as Sentry from "@sentry/node";
import { AuthCreditUsageChunk } from "../../controllers/v1/types";
import { getACUC, setCachedACUC } from "../../controllers/auth";

const FREE_CREDITS = 500;

/**
 * If you do not know the subscription_id in the current context, pass subscription_id as undefined.
 */
export async function billTeam(team_id: string, subscription_id: string | null | undefined, credits: number) {
  return withAuth(supaBillTeam)(team_id, subscription_id, credits);
}
export async function supaBillTeam(team_id: string, subscription_id: string, credits: number) {
  if (team_id === "preview") {
    return { success: true, message: "Preview team, no credits used" };
  }
  Logger.info(`Billing team ${team_id} for ${credits} credits`);

  const { data, error } =
    await supabase_service.rpc("bill_team", { _team_id: team_id, sub_id: subscription_id ?? null, fetch_subscription: subscription_id === undefined, credits });
  
  if (error) {
    Sentry.captureException(error);
    Logger.error("Failed to bill team: " + JSON.stringify(error));
    return;
  }

  (async () => {
    for (const apiKey of (data ?? []).map(x => x.api_key)) {
      await setCachedACUC(apiKey, acuc => (acuc ? {
        ...acuc,
        credits_used: acuc.credits_used + credits,
        adjusted_credits_used: acuc.adjusted_credits_used + credits,
        remaining_credits: acuc.remaining_credits - credits,
      } : null));
    }
  })();
}

export async function checkTeamCredits(chunk: AuthCreditUsageChunk, team_id: string, credits: number) {
  return withAuth(supaCheckTeamCredits)(chunk, team_id, credits);
}

// if team has enough credits for the operation, return true, else return false
export async function supaCheckTeamCredits(chunk: AuthCreditUsageChunk, team_id: string, credits: number) {
  // WARNING: chunk will be null if team_id is preview -- do not perform operations on it under ANY circumstances - mogery
  if (team_id === "preview") {
    return { success: true, message: "Preview team, no credits used", remainingCredits: Infinity };
  }

  const creditsWillBeUsed = chunk.adjusted_credits_used + credits;

  // Removal of + credits
  const creditUsagePercentage = creditsWillBeUsed / chunk.price_credits;

  // Compare the adjusted total credits used with the credits allowed by the plan
  if (creditsWillBeUsed > chunk.price_credits) {
    sendNotification(
      team_id,
      NotificationType.LIMIT_REACHED,
      chunk.sub_current_period_start,
      chunk.sub_current_period_end
    );
    return { success: false, message: "Insufficient credits. For more credits, you can upgrade your plan at https://firecrawl.dev/pricing.", remainingCredits: chunk.remaining_credits, chunk };
  } else if (creditUsagePercentage >= 0.8 && creditUsagePercentage < 1) {
    // Send email notification for approaching credit limit
    sendNotification(
      team_id,
      NotificationType.APPROACHING_LIMIT,
      chunk.sub_current_period_start,
      chunk.sub_current_period_end
    );
  }

  return { success: true, message: "Sufficient credits available", remainingCredits: chunk.remaining_credits, chunk };
}

// Count the total credits used by a team within the current billing period and return the remaining credits.
export async function countCreditsAndRemainingForCurrentBillingPeriod(
  team_id: string
) {
  // 1. Retrieve the team's active subscription based on the team_id.
  const { data: subscription, error: subscriptionError } =
    await supabase_service
      .from("subscriptions")
      .select("id, price_id, current_period_start, current_period_end")
      .eq("team_id", team_id)
      .single();

  const { data: coupons } = await supabase_service
    .from("coupons")
    .select("credits")
    .eq("team_id", team_id)
    .eq("status", "active");

  let couponCredits = 0;
  if (coupons && coupons.length > 0) {
    couponCredits = coupons.reduce(
      (total, coupon) => total + coupon.credits,
      0
    );
  }

  if (subscriptionError || !subscription) {
    // Free
    const { data: creditUsages, error: creditUsageError } =
      await supabase_service
        .from("credit_usage")
        .select("credits_used")
        .is("subscription_id", null)
        .eq("team_id", team_id);

    if (creditUsageError || !creditUsages) {
      throw new Error(
        `Failed to retrieve credit usage for team_id: ${team_id}`
      );
    }

    const totalCreditsUsed = creditUsages.reduce(
      (acc, usage) => acc + usage.credits_used,
      0
    );

    const remainingCredits = FREE_CREDITS + couponCredits - totalCreditsUsed;
    return {
      totalCreditsUsed: totalCreditsUsed,
      remainingCredits,
      totalCredits: FREE_CREDITS + couponCredits,
    };
  }

  const { data: creditUsages, error: creditUsageError } = await supabase_service
    .from("credit_usage")
    .select("credits_used")
    .eq("subscription_id", subscription.id)
    .gte("created_at", subscription.current_period_start)
    .lte("created_at", subscription.current_period_end);

  if (creditUsageError || !creditUsages) {
    throw new Error(
      `Failed to retrieve credit usage for subscription_id: ${subscription.id}`
    );
  }

  const totalCreditsUsed = creditUsages.reduce(
    (acc, usage) => acc + usage.credits_used,
    0
  );

  const { data: price, error: priceError } = await supabase_service
    .from("prices")
    .select("credits")
    .eq("id", subscription.price_id)
    .single();

  if (priceError || !price) {
    throw new Error(
      `Failed to retrieve price for price_id: ${subscription.price_id}`
    );
  }

  const remainingCredits = price.credits + couponCredits - totalCreditsUsed;

  return {
    totalCreditsUsed,
    remainingCredits,
    totalCredits: price.credits,
  };
}
