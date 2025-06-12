import { supabase_service } from "../supabase";

import { logger } from "../../lib/logger";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

async function getCustomerDefaultPaymentMethod(customerId: string) {
  const paymentMethods = await stripe.customers.listPaymentMethods(customerId, {
    limit: 3,
  });
  return paymentMethods.data[0] ?? null;
}

export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  PAST_DUE: 'past_due'
} as const;


type ReturnStatus = "succeeded" | "requires_action" | "failed";
export async function createPaymentIntent(
  team_id: string,
  customer_id: string,
): Promise<{ return_status: ReturnStatus; charge_id: string }> {
  try {
    const defaultPaymentMethod =
      await getCustomerDefaultPaymentMethod(customer_id);
    if (!defaultPaymentMethod) {
      logger.error(
        `No default payment method found for customer: ${customer_id}`,
      );
      return { return_status: "failed", charge_id: "" };
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1100,
      currency: "usd",
      customer: customer_id,
      description: "Firecrawl: Auto re-charge of 1000 credits",
      payment_method_types: [defaultPaymentMethod?.type ?? "card"],
      payment_method: defaultPaymentMethod?.id,
      off_session: true,
      confirm: true,
    });

    if (paymentIntent.status === "succeeded") {
      logger.info(`Payment succeeded for team: ${team_id}`);
      return { return_status: "succeeded", charge_id: paymentIntent.id };
    } else if (
      paymentIntent.status === "requires_action" ||
      paymentIntent.status === "processing" ||
      paymentIntent.status === "requires_capture"
    ) {
      logger.warn(`Payment requires further action for team: ${team_id}`);
      return { return_status: "requires_action", charge_id: paymentIntent.id };
    } else {
      logger.error(`Payment failed for team: ${team_id}`);
      return { return_status: "failed", charge_id: paymentIntent.id };
    }
  } catch (error) {
    logger.error(
      `Failed to create or confirm PaymentIntent for team: ${team_id}`,
    );
    console.error(error);
    return { return_status: "failed", charge_id: "" };
  }
}
export async function checkExistingSubscription(
  team_id: string,
  price_id: string
): Promise<boolean> {
  const { data: subscription } = await supabase_service
    .from("subscriptions")
    .select("status")
    .eq("team_id", team_id)
    .eq("price_id", price_id)
    .in("status", [SUBSCRIPTION_STATUSES.ACTIVE, SUBSCRIPTION_STATUSES.PAUSED, SUBSCRIPTION_STATUSES.PAST_DUE])
    .single();

  return !!subscription;
}
export async function createSubscription(
  team_id: string,
  customer_id: string,
  price_id: string
): Promise<{ success: boolean; message: string }> {
  if (price_id === process.env.STRIPE_CREDIT_PACK_PRICE_ID) {
    return { success: true, message: "Credit pack purchase allowed" };
  }

  const hasExistingSubscription = await checkExistingSubscription(team_id, price_id);
  if (hasExistingSubscription) {
    return { 
      success: false, 
      message: "You already have an active/paused/past due subscription for this plan. Please update your payment method if needed."
    };
  }

  const defaultPaymentMethod = await getCustomerDefaultPaymentMethod(customer_id);
  if (!defaultPaymentMethod) {
    return {
      success: false,
      message: "Please add a payment method before subscribing"
    };
  }

  return { success: true, message: "Subscription created successfully" };
}


export async function handlePaymentMethodUpdate(
  customer_id: string
): Promise<{ success: boolean; message: string }> {
  try {
    const defaultPaymentMethod = await getCustomerDefaultPaymentMethod(customer_id);
    if (!defaultPaymentMethod) {
      return {
        success: false,
        message: "Please contact help@firecrawl.com if you continue to experience issues"
      };
    }
    return { success: true, message: "Payment method updated successfully" };
  } catch (error) {
    logger.error("Failed to update payment method", { customer_id, error });
    return {
      success: false,
      message: "Please contact help@firecrawl.com if you continue to experience issues"
    };
  }
}
