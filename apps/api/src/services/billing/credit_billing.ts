import { NotificationType } from "../../types";
import { withAuth } from "../../lib/withAuth";
import { sendNotification } from "../notification/email_notification";
import { supabase_service } from "../supabase";
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
  //   When the API is used, you can log the credit usage in the credit_usage table:
  // team_id: The ID of the team using the API.
  // subscription_id: The ID of the team's active subscription.
  // credits_used: The number of credits consumed by the API call.
  // created_at: The timestamp of the API usage.

  // 1. get the subscription and check for available coupons concurrently
  const [{ data: subscription }, { data: coupons }] = await Promise.all([
    supabase_service
      .from("subscriptions")
      .select("*")
      .eq("team_id", team_id)
      .eq("status", "active")
      .single(),
    supabase_service
      .from("coupons")
      .select("id, credits")
      .eq("team_id", team_id)
      .eq("status", "active"),
  ]);

  let couponCredits = 0;
  let sortedCoupons = [];

  if (coupons && coupons.length > 0) {
    couponCredits = coupons.reduce(
      (total, coupon) => total + coupon.credits,
      0
    );
    sortedCoupons = [...coupons].sort((a, b) => b.credits - a.credits);
  }
  // using coupon credits:
  if (couponCredits > 0) {
    // if there is no subscription and they have enough coupon credits
    if (!subscription) {
      // using only coupon credits:
      // if there are enough coupon credits
      if (couponCredits >= credits) {
        // remove credits from coupon credits
        let usedCredits = credits;
        while (usedCredits > 0) {
          // update coupons
          if (sortedCoupons[0].credits < usedCredits) {
            usedCredits = usedCredits - sortedCoupons[0].credits;
            // update coupon credits
            await supabase_service
              .from("coupons")
              .update({
                credits: 0,
              })
              .eq("id", sortedCoupons[0].id);
            sortedCoupons.shift();
          } else {
            // update coupon credits
            await supabase_service
              .from("coupons")
              .update({
                credits: sortedCoupons[0].credits - usedCredits,
              })
              .eq("id", sortedCoupons[0].id);
            usedCredits = 0;
          }
        }

        return await createCreditUsage({ team_id, credits: 0 });

        // not enough coupon credits and no subscription
      } else {
        // update coupon credits
        const usedCredits = credits - couponCredits;
        for (let i = 0; i < sortedCoupons.length; i++) {
          await supabase_service
            .from("coupons")
            .update({
              credits: 0,
            })
            .eq("id", sortedCoupons[i].id);
        }

        return await createCreditUsage({ team_id, credits: usedCredits });
      }
    }

    // with subscription
    // using coupon + subscription credits:
    if (credits > couponCredits) {
      // update coupon credits
      for (let i = 0; i < sortedCoupons.length; i++) {
        await supabase_service
          .from("coupons")
          .update({
            credits: 0,
          })
          .eq("id", sortedCoupons[i].id);
      }
      const usedCredits = credits - couponCredits;
      return await createCreditUsage({
        team_id,
        subscription_id: subscription.id,
        credits: usedCredits,
      });
    } else {
      // using only coupon credits
      let usedCredits = credits;
      while (usedCredits > 0) {
        // update coupons
        if (sortedCoupons[0].credits < usedCredits) {
          usedCredits = usedCredits - sortedCoupons[0].credits;
          // update coupon credits
          await supabase_service
            .from("coupons")
            .update({
              credits: 0,
            })
            .eq("id", sortedCoupons[0].id);
          sortedCoupons.shift();
        } else {
          // update coupon credits
          await supabase_service
            .from("coupons")
            .update({
              credits: sortedCoupons[0].credits - usedCredits,
            })
            .eq("id", sortedCoupons[0].id);
          usedCredits = 0;
        }
      }

      return await createCreditUsage({
        team_id,
        subscription_id: subscription.id,
        credits: 0,
      });
    }
  }

  // not using coupon credits
  if (!subscription) {
    return await createCreditUsage({ team_id, credits });
  }

  return await createCreditUsage({
    team_id,
    subscription_id: subscription.id,
    credits,
  });
}

export async function checkTeamCredits(team_id: string, credits: number) {
  return withAuth(supaCheckTeamCredits)(team_id, credits);
}

// if team has enough credits for the operation, return true, else return false
export async function supaCheckTeamCredits(team_id: string, credits: number) {
  if (team_id === "preview") {
    return { success: true, message: "Preview team, no credits used", remainingCredits: Infinity };
  }


  let cacheKeySubscription = `subscription_${team_id}`;
  let cacheKeyCoupons = `coupons_${team_id}`;

  // Try to get data from cache first
  const [cachedSubscription, cachedCoupons] = await Promise.all([
    getValue(cacheKeySubscription),
    getValue(cacheKeyCoupons)
  ]);

  let subscription, subscriptionError;
  let coupons : {credits: number}[];

  if (cachedSubscription && cachedCoupons) {
    subscription = JSON.parse(cachedSubscription);
    coupons = JSON.parse(cachedCoupons);
  } else {
    // If not in cache, retrieve from database
    const [subscriptionResult, couponsResult] = await Promise.all([
      supabase_service
        .from("subscriptions")
        .select("id, price_id, current_period_start, current_period_end")
        .eq("team_id", team_id)
        .eq("status", "active")
        .single(),
      supabase_service
        .from("coupons")
        .select("credits")
        .eq("team_id", team_id)
        .eq("status", "active"),
    ]);

    subscription = subscriptionResult.data;
    subscriptionError = subscriptionResult.error;
    coupons = couponsResult.data;

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
    return { success: true, message: "Sufficient credits available", remainingCredits: couponCredits };
  }
  

  // Free credits, no coupons
  if (!subscription || subscriptionError) {

    let creditUsages;
    let creditUsageError;
    let totalCreditsUsed = 0;
    const cacheKeyCreditUsage = `credit_usage_${team_id}`;

    // Try to get credit usage from cache
    const cachedCreditUsage = await getValue(cacheKeyCreditUsage);

    if (cachedCreditUsage) {
      totalCreditsUsed = parseInt(cachedCreditUsage);
    } else {
      let retries = 0;
      const maxRetries = 3;
      const retryInterval = 2000; // 2 seconds

      while (retries < maxRetries) {
        // Reminder, this has an 1000 limit.
        const result = await supabase_service
          .from("credit_usage")
          .select("credits_used")
          .is("subscription_id", null)
          .eq("team_id", team_id);

        creditUsages = result.data;
        creditUsageError = result.error;

        if (!creditUsageError) {
          break;
        }

        retries++;
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
      }

      if (creditUsageError) {
        Logger.error(`Credit usage error after ${maxRetries} attempts: ${creditUsageError}`);
        throw new Error(
          `Failed to retrieve credit usage for team_id: ${team_id}`
        );
      }

      totalCreditsUsed = creditUsages.reduce(
        (acc, usage) => acc + usage.credits_used,
        0
      );

      // Cache the result for 30 seconds
      await setValue(cacheKeyCreditUsage, totalCreditsUsed.toString(), 30);
    }

    Logger.info(`totalCreditsUsed: ${totalCreditsUsed}`);

    const end = new Date();
    end.setDate(end.getDate() + 30);
    // check if usage is within 80% of the limit
    const creditLimit = FREE_CREDITS;
    const creditUsagePercentage = totalCreditsUsed / creditLimit;

    // Add a check to ensure totalCreditsUsed is greater than 0
    if (totalCreditsUsed > 0 && creditUsagePercentage >= 0.8 && creditUsagePercentage < 1) {
      Logger.info(`Sending notification for team ${team_id}. Total credits used: ${totalCreditsUsed}, Credit usage percentage: ${creditUsagePercentage}`);
      await sendNotification(
        team_id,
        NotificationType.APPROACHING_LIMIT,
        new Date().toISOString(),
        end.toISOString()
      );
    }

    // 5. Compare the total credits used with the credits allowed by the plan.
    if (totalCreditsUsed >= FREE_CREDITS) {
      // Send email notification for insufficient credits
      await sendNotification(
        team_id,
        NotificationType.LIMIT_REACHED,
        new Date().toISOString(),
        end.toISOString()
      );
      return {
        success: false,
        message: "Insufficient credits, please upgrade!",
        remainingCredits: FREE_CREDITS - totalCreditsUsed
      };
    }
    return { success: true, message: "Sufficient credits available", remainingCredits: FREE_CREDITS - totalCreditsUsed };
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
        const { data: creditUsages, error: creditUsageError } =
          await supabase_service.rpc("get_credit_usage_2", {
            sub_id: subscription.id,
            start_time: subscription.current_period_start,
            end_time: subscription.current_period_end,
          });

        if (creditUsageError) {
          Logger.error(`Error calculating credit usage: ${creditUsageError}`);
        }

        if (creditUsages && creditUsages.length > 0) {
          totalCreditsUsed = creditUsages[0].total_credits_used;
          await setValue(cacheKey, totalCreditsUsed.toString(), 500); // Cache for 8 minutes
          // Logger.info(`Cache set for credit usage: ${totalCreditsUsed}`);
        }
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
  let price : {credits: number};

  try {
    const cachedPrice = await getValue(priceCacheKey);
    if (cachedPrice) {
      price = JSON.parse(cachedPrice);
    } else {
      const { data, error: priceError } = await supabase_service
        .from("prices")
        .select("credits")
        .eq("id", subscription.price_id)
        .single();

      if (priceError) {
        throw new Error(
          `Failed to retrieve price for price_id: ${subscription.price_id}`
        );
      }

      price = data;
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

  // Removal of + credits
  const creditUsagePercentage = adjustedCreditsUsed / creditLimit;

  // Compare the adjusted total credits used with the credits allowed by the plan
  if (adjustedCreditsUsed >= price.credits) {
    await sendNotification(
      team_id,
      NotificationType.LIMIT_REACHED,
      subscription.current_period_start,
      subscription.current_period_end
    );
    return { success: false, message: "Insufficient credits, please upgrade!", remainingCredits: creditLimit - adjustedCreditsUsed };
  } else if (creditUsagePercentage >= 0.8 && creditUsagePercentage < 1) {
    // Send email notification for approaching credit limit
    await sendNotification(
      team_id,
      NotificationType.APPROACHING_LIMIT,
      subscription.current_period_start,
      subscription.current_period_end
    );
  }

  return { success: true, message: "Sufficient credits available", remainingCredits: creditLimit - adjustedCreditsUsed };
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

async function createCreditUsage({
  team_id,
  subscription_id,
  credits,
}: {
  team_id: string;
  subscription_id?: string;
  credits: number;
}) {
    await supabase_service
      .from("credit_usage")
    .insert([
      {
        team_id,
        credits_used: credits,
        subscription_id: subscription_id || null,
        created_at: new Date(),
      },
    ]);

  return { success: true };
}
