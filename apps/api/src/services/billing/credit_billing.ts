import { NotificationType } from "../../types";
import { withAuth } from "../../lib/withAuth";
import { sendNotification } from "../notification/email_notification";
import { Logger } from "../../lib/logger";
import { getValue, setValue } from "../redis";
import { redlock } from "../redlock";
import db from "../db";
import { subscriptions, coupons as couponsDb, creditUsage, prices } from "../db/schema";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";


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
  const [[subscription], coupons] = await Promise.all([
    db
      .select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.teamId, team_id),
        eq(subscriptions.status, "active"),
      ))
      .limit(1),
    db
      .select({ id: couponsDb.id, credits: couponsDb.credits })
      .from(couponsDb)
      .where(and(
        eq(couponsDb.teamId, team_id),
        eq(couponsDb.status, "active"),
      )),
  ]);

  let couponCredits = 0;
  if (coupons && coupons.length > 0) {
    couponCredits = coupons.reduce(
      (total, coupon) => total + coupon.credits,
      0
    );
  }

  let sortedCoupons = coupons.sort((a, b) => b.credits - a.credits);
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
            await db.update(couponsDb).set({
              credits: 0
            }).where(eq(couponsDb.id, sortedCoupons[0].id));
          } else {
            // update coupon credits
            await db.update(couponsDb).set({
              credits: sortedCoupons[0].credits - usedCredits,
            }).where(eq(couponsDb.id, sortedCoupons[0].id));
            usedCredits = 0;
          }
        }

        return await createCreditUsage({ team_id, credits: 0 });

        // not enough coupon credits and no subscription
      } else {
        // update coupon credits
        const usedCredits = credits - couponCredits;
        for (let i = 0; i < sortedCoupons.length; i++) {
          await db.update(couponsDb).set({
            credits: 0
          }).where(eq(couponsDb.id, sortedCoupons[i].id));
        }

        return await createCreditUsage({ team_id, credits: usedCredits });
      }
    }

    // with subscription
    // using coupon + subscription credits:
    if (credits > couponCredits) {
      // update coupon credits
      for (let i = 0; i < sortedCoupons.length; i++) {
        await db.update(couponsDb).set({
          credits: 0
        }).where(eq(couponsDb.id, sortedCoupons[i].id));
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
          await db.update(couponsDb).set({
            credits: 0,
          }).where(eq(couponsDb.id, sortedCoupons[0].id));
          sortedCoupons.shift();
        } else {
          // update coupon credits
          await db.update(couponsDb).set({
            credits: sortedCoupons[0].credits - usedCredits,
          }).where(eq(couponsDb.id, sortedCoupons[0].id));
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

  // Retrieve the team's active subscription and check for available coupons concurrently
  const start = Date.now();
  const [subscriptionRes, couponsRes] =
    await Promise.allSettled([
      await db.select({
        id: subscriptions.id,
        priceId: subscriptions.priceId,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.teamId, team_id),
          eq(subscriptions.status, "active"),
        ))
        .limit(1),
      db
        .select({ credits: couponsDb.credits })
        .from(couponsDb)
        .where(and(
          eq(couponsDb.teamId, team_id),
          eq(couponsDb.status, "active"),
        )),
    ]);
  console.log("big", Date.now() - start);
  
  const subscription = subscriptionRes.status === "fulfilled" ? subscriptionRes.value[0] : undefined;
  const subscriptionError = subscriptionRes.status === "rejected" ? subscriptionRes.reason : undefined;
  const coupons = couponsRes.status === "fulfilled" ? couponsRes.value : (() => {throw couponsRes.reason})();

  let couponCredits = 0;
  if (coupons && coupons.length > 0) {
    couponCredits = coupons.reduce(
      (total, coupon) => total + coupon.credits,
      0
    );
  }

  // Free credits, no coupons
  if (subscriptionError || !subscription) {
    // If there is no active subscription but there are available coupons
    if (couponCredits >= credits) {
      return { success: true, message: "Sufficient credits available", remainingCredits: couponCredits };
    }

    let creditUsages: { creditsUsed: number }[];
    try {
      creditUsages =
        await db
          .select({ creditsUsed: creditUsage.creditsUsed })
          .from(creditUsage)
          .where(and(
            isNull(creditUsage.subscriptionId),
            eq(creditUsage.teamId, team_id),
          ))
    } catch (error) {
      throw new Error(
        `Failed to retrieve credit usage for team_id: ${team_id}`
      );
    }

    const totalCreditsUsed = creditUsages.reduce(
      (acc, usage) => acc + usage.creditsUsed,
      0
    );

    Logger.info(`totalCreditsUsed: ${totalCreditsUsed}`);

    const end = new Date();
    end.setDate(end.getDate() + 30);
    // check if usage is within 80% of the limit
    const creditLimit = FREE_CREDITS;
    const creditUsagePercentage = (totalCreditsUsed + credits) / creditLimit;

    if (creditUsagePercentage >= 0.8) {
      await sendNotification(
        team_id,
        NotificationType.APPROACHING_LIMIT,
        new Date().toISOString(),
        end.toISOString()
      );
    }

    // 5. Compare the total credits used with the credits allowed by the plan.
    if (totalCreditsUsed + credits > FREE_CREDITS) {
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
  const cacheKey = `credit_usage_${subscription.id}_${subscription.currentPeriodStart}_${subscription.currentPeriodEnd}_lc`;
  const redLockKey = `lock_${cacheKey}`;
  const lockTTL = 10000; // 10 seconds

  try {
    const lock = await redlock.acquire([redLockKey], lockTTL);

    try {
      const cachedCreditUsage = await getValue(cacheKey);

      if (cachedCreditUsage) {
        totalCreditsUsed = parseInt(cachedCreditUsage);
      } else {
        let creditUsages: { total_credits_used: number }[];
        try {
          const start = Date.now();
          creditUsages = (await db.execute(sql`SELECT * FROM get_credit_usage_2(${subscription.id}, ${subscription.currentPeriodStart}, ${subscription.currentPeriodEnd})`)).rows as any;
          console.log("cu", Date.now() - start);
        } catch (error) {
          Logger.error(`Error calculating credit usage: ${error}`);
        }

        if (creditUsages && creditUsages.length > 0) {
          totalCreditsUsed = creditUsages[0].total_credits_used;
          await setValue(cacheKey, totalCreditsUsed.toString(), 1800); // Cache for 30 minutes
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
  // Get the price details

  let price: { credits: number } | undefined;
  try {
    [price] = await db
      .select({ credits: prices.credits })
      .from(prices)
      .where(eq(prices.id, subscription.priceId))
      .limit(1);
  } catch (error) {
    throw new Error(
      `Failed to retrieve price for price_id: ${subscription.priceId}`
    );
  }

  const creditLimit = price.credits;
  const creditUsagePercentage = (adjustedCreditsUsed + credits) / creditLimit;

  // Compare the adjusted total credits used with the credits allowed by the plan
  if (adjustedCreditsUsed + credits > price.credits) {
    // await sendNotification(
    //   team_id,
    //   NotificationType.LIMIT_REACHED,
    //   subscription.current_period_start,
    //   subscription.current_period_end
    // );
    return { success: false, message: "Insufficient credits, please upgrade!", remainingCredits: creditLimit - adjustedCreditsUsed };
  } else if (creditUsagePercentage >= 0.8) {
    // Send email notification for approaching credit limit
    // await sendNotification(
    //   team_id,
    //   NotificationType.APPROACHING_LIMIT,
    //   subscription.current_period_start,
    //   subscription.current_period_end
    // );
  }

  return { success: true, message: "Sufficient credits available", remainingCredits: creditLimit - adjustedCreditsUsed };
}

// Count the total credits used by a team within the current billing period and return the remaining credits.
export async function countCreditsAndRemainingForCurrentBillingPeriod(
  team_id: string
) {
  // 1. Retrieve the team's active subscription based on the team_id.
  const [subscriptionRes, couponsRes] =
    await Promise.allSettled([
      await db.select({
        id: subscriptions.id,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        priceId: subscriptions.priceId
      })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.teamId, team_id),
        ))
        .limit(1),
      db
        .select({ credits: couponsDb.credits })
        .from(couponsDb)
        .where(and(
          eq(couponsDb.teamId, team_id),
          eq(couponsDb.status, "active"),
        )),
    ]);
  
  const subscription = subscriptionRes.status === "fulfilled" ? subscriptionRes.value[0] : undefined;
  const subscriptionError = subscriptionRes.status === "rejected" ? subscriptionRes.reason : undefined;
  const coupons = couponsRes.status === "fulfilled" ? couponsRes.value : (() => {throw couponsRes.reason})();

  let couponCredits = 0;
  if (coupons && coupons.length > 0) {
    couponCredits = coupons.reduce(
      (total, coupon) => total + coupon.credits,
      0
    );
  }

  if (subscriptionError || !subscription) {
    // Free
    let creditUsages: { creditsUsed: number }[];
    try {
      creditUsages =
        await db.select({ creditsUsed: creditUsage.creditsUsed })
          .from(creditUsage)
          .where(and(
            isNull(creditUsage.subscriptionId),
            eq(creditUsage.teamId, team_id)
          ));
    } catch (error) {
      throw new Error(
        `Failed to retrieve credit usage for team_id: ${team_id}`
      );
    }

    const totalCreditsUsed = creditUsages.reduce(
      (acc, usage) => acc + usage.creditsUsed,
      0
    );

    const remainingCredits = FREE_CREDITS + couponCredits - totalCreditsUsed;
    return {
      totalCreditsUsed: totalCreditsUsed,
      remainingCredits,
      totalCredits: FREE_CREDITS + couponCredits,
    };
  }

  let creditUsages: { creditsUsed: number }[];

  try {
    creditUsages = await db
      .select({ creditsUsed: creditUsage.creditsUsed })
      .from(creditUsage)
      .where(and(
        eq(creditUsage.subscriptionId, subscription.id),
        gte(creditUsage.createdAt, subscription.currentPeriodStart),
        lte(creditUsage.createdAt, subscription.currentPeriodEnd),
      ));
  } catch (error) {
    throw new Error(
      `Failed to retrieve credit usage for subscription_id: ${subscription.id}`
    );
  }

  const totalCreditsUsed = creditUsages.reduce(
    (acc, usage) => acc + usage.creditsUsed,
    0
  );

  let price: { credits: number };
  try {
    [price] = await db.select({ credits: prices.credits })
      .from(prices)
      .where(eq(prices.id, subscription.priceId))
      .limit(1)
  } catch (error) {
    throw new Error(
      `Failed to retrieve price for price_id: ${error}`
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
  const credit_usage = await db
    .insert(creditUsage)
    .values({
      teamId: team_id,
      creditsUsed: credits,
      subscriptionId: subscription_id || null,
      createdAt: new Date().toISOString(),
    })
    .returning();

  return { success: true, credit_usage };
}
