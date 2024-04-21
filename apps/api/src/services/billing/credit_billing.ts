import { withAuth } from "../../lib/withAuth";
import { supabase_service } from "../supabase";

const FREE_CREDITS = 100;

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

  if (!subscription) {
    const { data: credit_usage } = await supabase_service
      .from("credit_usage")
      .insert([
        {
          team_id,
          credits_used: credits,
          created_at: new Date(),
        },
      ])
      .select();

    return { success: true, credit_usage };
  }

  // 2. add the credits to the credits_usage
  const { data: credit_usage } = await supabase_service
    .from("credit_usage")
    .insert([
      {
        team_id,
        subscription_id: subscription.id,
        credits_used: credits,
        created_at: new Date(),
      },
    ])
    .select();

  return { success: true, credit_usage };
}

export async function checkTeamCredits(team_id: string, credits: number) {
  return withAuth(supaCheckTeamCredits)(team_id, credits);
}
// if team has enough credits for the operation, return true, else return false
export async function supaCheckTeamCredits(team_id: string, credits: number) {
  if (team_id === "preview") {
    return { success: true, message: "Preview team, no credits used" };
  }
  // 1. Retrieve the team's active subscription based on the team_id.
  const { data: subscription, error: subscriptionError } =
    await supabase_service
      .from("subscriptions")
      .select("id, price_id, current_period_start, current_period_end")
      .eq("team_id", team_id)
      .eq("status", "active")
      .single();

  if (subscriptionError || !subscription) {
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

  // 2. Get the price_id from the subscription.
  const { data: price, error: priceError } = await supabase_service
    .from("prices")
    .select("credits")
    .eq("id", subscription.price_id)
    .single();

  if (priceError) {
    throw new Error(
      `Failed to retrieve price for price_id: ${subscription.price_id}`
    );
  }

  // 4. Calculate the total credits used by the team within the current billing period.
  const { data: creditUsages, error: creditUsageError } = await supabase_service
    .from("credit_usage")
    .select("credits_used")
    .eq("subscription_id", subscription.id)
    .gte("created_at", subscription.current_period_start)
    .lte("created_at", subscription.current_period_end);

  if (creditUsageError) {
    throw new Error(
      `Failed to retrieve credit usage for subscription_id: ${subscription.id}`
    );
  }

  const totalCreditsUsed = creditUsages.reduce(
    (acc, usage) => acc + usage.credits_used,
    0
  );

  // 5. Compare the total credits used with the credits allowed by the plan.
  if (totalCreditsUsed + credits > price.credits) {
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

  if (subscriptionError || !subscription) {
    // throw new Error(`Failed to retrieve subscription for team_id: ${team_id}`);

    // Free
    const { data: creditUsages, error: creditUsageError } =
      await supabase_service
        .from("credit_usage")
        .select("credits_used")
        .is("subscription_id", null)
        .eq("team_id", team_id);
    // .gte("created_at", subscription.current_period_start)
    // .lte("created_at", subscription.current_period_end);

    if (creditUsageError || !creditUsages) {
      throw new Error(
        `Failed to retrieve credit usage for subscription_id: ${subscription.id}`
      );
    }

    const totalCreditsUsed = creditUsages.reduce(
      (acc, usage) => acc + usage.credits_used,
      0
    );

    // 4. Calculate remaining credits.
    const remainingCredits = FREE_CREDITS - totalCreditsUsed;

    return { totalCreditsUsed, remainingCredits, totalCredits: FREE_CREDITS };
  }

  // 2. Get the price_id from the subscription to retrieve the total credits available.
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

  // 3. Calculate the total credits used by the team within the current billing period.
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

  // 4. Calculate remaining credits.
  const remainingCredits = price.credits - totalCreditsUsed;

  return { totalCreditsUsed, remainingCredits, totalCredits: price.credits };
}
