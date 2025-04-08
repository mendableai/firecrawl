import { logger } from "../../lib/logger";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

async function getCustomerDefaultPaymentMethod(customerId: string) {
  const paymentMethods = await stripe.customers.listPaymentMethods(customerId, {
    limit: 3,
  });
  return paymentMethods.data[0] ?? null;
}

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

export async function createInvoiceForAutoRecharge(
  team_id: string,
  customer_id: string,
): Promise<{ return_status: ReturnStatus; invoice_id: string }> {
  try {
    await stripe.invoiceItems.create({
      customer: customer_id,
      amount: 1100,
      currency: "usd",
      description: "Firecrawl: Auto re-charge of 1000 credits",
    });
    
    const invoice = await stripe.invoices.create({
      customer: customer_id,
      auto_advance: true, // auto-finalize & attempt payment
      description: `Firecrawl Auto-Recharge: Team ${team_id}`,
    });
    
    if (invoice.status === "paid") {
      logger.info(`Invoice payment succeeded for team: ${team_id}`);
      return { return_status: "succeeded", invoice_id: invoice.id };
    } else if (invoice.status === "open") {
      logger.warn(`Invoice payment requires further action for team: ${team_id}`);
      return { return_status: "requires_action", invoice_id: invoice.id };
    } else {
      logger.error(`Invoice payment failed for team: ${team_id}`);
      return { return_status: "failed", invoice_id: invoice.id };
    }
  } catch (error) {
    logger.error(`Failed to create invoice for team: ${team_id}`);
    console.error(error);
    return { return_status: "failed", invoice_id: "" };
  }
}
