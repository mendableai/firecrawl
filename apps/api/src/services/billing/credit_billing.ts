import { withAuth } from "../../lib/withAuth";
import { Logger } from "../../lib/logger";
import { getValue, setValue } from "../redis";
import { redlock } from "../redlock";
import * as Sentry from "@sentry/node";

const FREE_CREDITS = 500;

export async function billTeam(team_id: string, credits: number) {
  return withAuth(supaBillTeam)(team_id, credits);
}
export async function supaBillTeam(team_id: string, credits: number) {
  if (team_id === "preview") {
    return { success: true, message: "Preview team, no credits used" };
  }
  Logger.info(`Billing team ${team_id} for ${credits} credits`);
}

export async function checkTeamCredits(team_id: string, credits: number) {
  return withAuth(supaCheckTeamCredits)(team_id, credits);
}

// if team has enough credits for the operation, return true, else return false
export async function supaCheckTeamCredits(team_id: string, credits: number) {
  if (team_id === "preview") {
    return {
      success: true,
      message: "Preview team, no credits used",
      remainingCredits: Infinity,
    };
  }

  let cacheKeySubscription = `subscription_${team_id}`;
  let cacheKeyCoupons = `coupons_${team_id}`;

  // Try to get data from cache first
  const [cachedSubscription, cachedCoupons] = await Promise.all([
    getValue(cacheKeySubscription),
    getValue(cacheKeyCoupons),
  ]);

  let subscription, subscriptionError;
  let coupons: { credits: number }[];

  if (cachedSubscription && cachedCoupons) {
    subscription = JSON.parse(cachedSubscription);
    coupons = JSON.parse(cachedCoupons);
  } else {
    // Cache the results for a minute, sub can be null and that's fine
    await setValue(cacheKeySubscription, JSON.stringify(subscription), 60); // Cache for 1 minute, even if null
    await setValue(cacheKeyCoupons, JSON.stringify(coupons), 60); // Cache for 1 minute
  }

  let couponCredits = 0;
  if (coupons && coupons.length > 0) {
    couponCredits = coupons.reduce(
      (total, coupon) => total + coupon.credits,
      0
    );
  }

  // If there are available coupons and they are enough for the operation
  if (couponCredits >= credits) {
    return {
      success: true,
      message: "Sufficient credits available",
      remainingCredits: couponCredits,
    };
  }

  let totalCreditsUsed = 0;
  const cacheKey = `credit_usage_${subscription.id}_${subscription.current_period_start}_${subscription.current_period_end}_lc`;
  const redLockKey = `lock_${cacheKey}`;
  const lockTTL = 10000; // 10 seconds

  try {
    const lock = await redlock.acquire([redLockKey], lockTTL);

    try {
      const cachedCreditUsage = await getValue(cacheKey);

      if (cachedCreditUsage) {
        totalCreditsUsed = parseInt(cachedCreditUsage);
      } else {
      }
    } finally {
      await lock.release();
    }
  } catch (error) {
    Logger.error(`Error acquiring lock or calculating credit usage: ${error}`);
  }

  // Adjust total credits used by subtracting coupon value
  const adjustedCreditsUsed = Math.max(0, totalCreditsUsed - couponCredits);

  // Get the price details from cache or database
  const priceCacheKey = `price_${subscription.price_id}`;
  let price: { credits: number };

  try {
    const cachedPrice = await getValue(priceCacheKey);
    if (cachedPrice) {
      price = JSON.parse(cachedPrice);
    } else {
      // There are only 21 records, so this is super fine
      // Cache the price for a long time (e.g., 1 day)
      await setValue(priceCacheKey, JSON.stringify(price), 86400);
    }
  } catch (error) {
    Logger.error(`Error retrieving or caching price: ${error}`);
    Sentry.captureException(error);
    // If errors, just assume it's a big number so user don't get an error
    price = { credits: 10000000 };
  }

  const creditLimit = price.credits;

  return {
    success: true,
    message: "Sufficient credits available",
    remainingCredits: creditLimit - adjustedCreditsUsed,
  };
}