import { withAuth } from "../../lib/withAuth";
import { supabase_service } from "../supabase";

const FREE_CREDITS = 300;

export async function billTeam(team_id: string, credits: number) {
  return withAuth(supaBillTeam)(team_id, credits);
}
export async function supaBillTeam(team_id: string, credits: number) {
  if (team_id === "preview") {
    return { success: true, message: "Preview team, no credits used" };
  }
  console.log(`Billing team ${team_id} for ${credits} credits`);
  //   When the API is used, you can log the credit usage in the credit_usage table:
  // team_id: The ID of the team using the API.
  // subscription_id: The ID of the team's active subscription.
  // credits_used: The number of credits consumed by the API call.
  // created_at: The timestamp of the API usage.

  // 1. get the subscription
  const { data: subscription } = await supabase_service
    .from("subscriptions")
    .select("*")
    .eq("team_id", team_id)
    .eq("status", "active")
    .single();

  // 2. Check for available coupons
  const { data: coupons } = await supabase_service
    .from("coupons")
    .select("id, credits")
    .eq("team_id", team_id)
    .eq("status", "active");

  let couponCredits = 0;
  if (coupons && coupons.length > 0) {
    couponCredits = coupons.reduce((total, coupon) => total + coupon.credits, 0);
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
            await supabase_service
            .from("coupons")
            .update({
              credits: 0
            })
            .eq("id", sortedCoupons[0].id);
            sortedCoupons.shift();

          } else {
            // update coupon credits
            await supabase_service
            .from("coupons")
            .update({
              credits: sortedCoupons[0].credits - usedCredits
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
              credits: 0
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
            credits: 0
          })
          .eq("id", sortedCoupons[i].id);
      }
      const usedCredits = credits - couponCredits;
      return await createCreditUsage({ team_id, subscription_id: subscription.id, credits: usedCredits });

    } else { // using only coupon credits
      let usedCredits = credits;
      while (usedCredits > 0) {
        // update coupons
        if (sortedCoupons[0].credits < usedCredits) {
          usedCredits = usedCredits - sortedCoupons[0].credits;
          // update coupon credits
          await supabase_service
          .from("coupons")
          .update({
            credits: 0
          })
          .eq("id", sortedCoupons[0].id);
          sortedCoupons.shift();

        } else {
          // update coupon credits
          await supabase_service
          .from("coupons")
          .update({
            credits: sortedCoupons[0].credits - usedCredits
          })
          .eq("id", sortedCoupons[0].id);
          usedCredits = 0;
        }
      }

      return await createCreditUsage({ team_id, subscription_id: subscription.id, credits: 0 });
    }
  }

  // not using coupon credits
  if (!subscription) {
    return await createCreditUsage({ team_id, credits });
  }

  return await createCreditUsage({ team_id, subscription_id: subscription.id, credits });
}

export async function checkTeamCredits(team_id: string, credits: number) {
  return withAuth(supaCheckTeamCredits)(team_id, credits);
}
// if team has enough credits for the operation, return true, else return false
export async function supaCheckTeamCredits(team_id: string, credits: number) {
  if (team_id === "preview") {
    return { success: true, message: "Preview team, no credits used" };
  }

  // Retrieve the team's active subscription
  const { data: subscription, error: subscriptionError } = await supabase_service
    .from("subscriptions")
    .select("id, price_id, current_period_start, current_period_end")
    .eq("team_id", team_id)
    .eq("status", "active")
    .single();

  // Check for available coupons
  const { data: coupons } = await supabase_service
    .from("coupons")
    .select("credits")
    .eq("team_id", team_id)
    .eq("status", "active");

  let couponCredits = 0;
  if (coupons && coupons.length > 0) {
    couponCredits = coupons.reduce((total, coupon) => total + coupon.credits, 0);
  }

  // Free credits, no coupons
  if (subscriptionError || !subscription) {
    // If there is no active subscription but there are available coupons
    if (couponCredits >= credits) {
      return { success: true, message: "Sufficient credits available" };
    }
      
    const { data: creditUsages, error: creditUsageError } =
      await supabase_service
        .from("credit_usage")
        .select("credits_used")
        .is("subscription_id", null)
        .eq("team_id", team_id);
    // .gte("created_at", subscription.current_period_start)
    // .lte("created_at", subscription.current_period_end);

    if (creditUsageError) {
      throw new Error(
        `Failed to retrieve credit usage for subscription_id: ${subscription.id}`
      );
    }

    const totalCreditsUsed = creditUsages.reduce(
      (acc, usage) => acc + usage.credits_used,
      0
    );

    console.log("totalCreditsUsed", totalCreditsUsed);
    // 5. Compare the total credits used with the credits allowed by the plan.
    if (totalCreditsUsed + credits > FREE_CREDITS) {
      return {
        success: false,
        message: "Insufficient credits, please upgrade!",
      };
    }
    return { success: true, message: "Sufficient credits available" };
  }

  // Calculate the total credits used by the team within the current billing period
  const { data: creditUsages, error: creditUsageError } = await supabase_service
    .from("credit_usage")
    .select("credits_used")
    .eq("subscription_id", subscription.id)
    .gte("created_at", subscription.current_period_start)
    .lte("created_at", subscription.current_period_end);

  if (creditUsageError) {
    throw new Error(`Failed to retrieve credit usage for subscription_id: ${subscription.id}`);
  }

  const totalCreditsUsed = creditUsages.reduce((acc, usage) => acc + usage.credits_used, 0);

  // Adjust total credits used by subtracting coupon value
  const adjustedCreditsUsed = Math.max(0, totalCreditsUsed - couponCredits);

  // Get the price details
  const { data: price, error: priceError } = await supabase_service
    .from("prices")
    .select("credits")
    .eq("id", subscription.price_id)
    .single();

  if (priceError) {
    throw new Error(`Failed to retrieve price for price_id: ${subscription.price_id}`);
  }

  // Compare the adjusted total credits used with the credits allowed by the plan
  if (adjustedCreditsUsed + credits > price.credits) {
    return { success: false, message: "Insufficient credits, please upgrade!" };
  }

  return { success: true, message: "Sufficient credits available" };
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
    couponCredits = coupons.reduce((total, coupon) => total + coupon.credits, 0);
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
      throw new Error(`Failed to retrieve credit usage for team_id: ${team_id}`);
    }

    const totalCreditsUsed = creditUsages.reduce(
      (acc, usage) => acc + usage.credits_used,
      0
    );

    const remainingCredits = FREE_CREDITS + couponCredits - totalCreditsUsed;
    return { totalCreditsUsed: totalCreditsUsed, remainingCredits, totalCredits: FREE_CREDITS + couponCredits };
  }

  const { data: creditUsages, error: creditUsageError } = await supabase_service
    .from("credit_usage")
    .select("credits_used")
    .eq("subscription_id", subscription.id)
    .gte("created_at", subscription.current_period_start)
    .lte("created_at", subscription.current_period_end);

  if (creditUsageError || !creditUsages) {
    throw new Error(`Failed to retrieve credit usage for subscription_id: ${subscription.id}`);
  }

  const totalCreditsUsed = creditUsages.reduce((acc, usage) => acc + usage.credits_used, 0);

  const { data: price, error: priceError } = await supabase_service
    .from("prices")
    .select("credits")
    .eq("id", subscription.price_id)
    .single();

  if (priceError || !price) {
    throw new Error(`Failed to retrieve price for price_id: ${subscription.price_id}`);
  }

  const remainingCredits = price.credits + couponCredits - totalCreditsUsed;

  return {
    totalCreditsUsed,
    remainingCredits,
    totalCredits: price.credits
  };
}

async function createCreditUsage({ team_id, subscription_id, credits }: { team_id: string, subscription_id?: string, credits: number }) {
  const { data: credit_usage } = await supabase_service
    .from("credit_usage")
    .insert([
      {
        team_id,
        credits_used: credits,
        subscription_id: subscription_id || null,
        created_at: new Date(),
      },
    ])
    .select();

  return { success: true, credit_usage };
}