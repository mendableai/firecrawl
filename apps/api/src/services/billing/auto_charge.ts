// Import necessary dependencies and types
import { AuthCreditUsageChunk } from "../../controllers/v1/types";
import { getACUC } from "../../controllers/auth";
import { redlock } from "../redlock";
import { supabase_service } from "../supabase";
import { createPaymentIntent } from "./stripe";
import { issueCredits } from "./issue_credits";
import { sendNotification } from "../notification/email_notification";
import { NotificationType } from "../../types";
import { deleteKey, getValue, setValue } from "../redis";
import { sendSlackWebhook } from "../alerts/slack";
import { logger } from "../../lib/logger";

// Define the number of credits to be added during auto-recharge
const AUTO_RECHARGE_CREDITS = 1000;
const AUTO_RECHARGE_COOLDOWN = 300; // 5 minutes in seconds

/**
 * Attempt to automatically charge a user's account when their credit balance falls below a threshold
 * @param chunk The user's current usage data
 * @param autoRechargeThreshold The credit threshold that triggers auto-recharge
 */
export async function autoCharge(
  chunk: AuthCreditUsageChunk,
  autoRechargeThreshold: number,
): Promise<{
  success: boolean;
  message: string;
  remainingCredits: number;
  chunk: AuthCreditUsageChunk;
}> {
  const resource = `auto-recharge:${chunk.team_id}`;
  const cooldownKey = `auto-recharge-cooldown:${chunk.team_id}`;

  try {
    // Check if the team is in the cooldown period
    // Another check to prevent race conditions, double charging - cool down of 5 minutes
    const cooldownValue = await getValue(cooldownKey);
    if (cooldownValue) {
      logger.info(
        `Auto-recharge for team ${chunk.team_id} is in cooldown period`,
      );
      return {
        success: false,
        message: "Auto-recharge is in cooldown period",
        remainingCredits: chunk.remaining_credits,
        chunk,
      };
    }

    // Use a distributed lock to prevent concurrent auto-charge attempts
    return await redlock.using(
      [resource],
      5000,
      async (
        signal,
      ): Promise<{
        success: boolean;
        message: string;
        remainingCredits: number;
        chunk: AuthCreditUsageChunk;
      }> => {
        // Recheck the condition inside the lock to prevent race conditions
        const updatedChunk = await getACUC(chunk.api_key, false, false);
        if (
          updatedChunk &&
          updatedChunk.remaining_credits < autoRechargeThreshold
        ) {
          if (chunk.sub_user_id) {
            // Fetch the customer's Stripe information
            const { data: customer, error: customersError } =
              await supabase_service
                .from("customers")
                .select("id, stripe_customer_id")
                .eq("id", chunk.sub_user_id)
                .single();

            if (customersError) {
              logger.error(`Error fetching customer data: ${customersError}`);
              return {
                success: false,
                message: "Error fetching customer data",
                remainingCredits: chunk.remaining_credits,
                chunk,
              };
            }

            if (customer && customer.stripe_customer_id) {
              let issueCreditsSuccess = false;
              // Attempt to create a payment intent
              const paymentStatus = await createPaymentIntent(
                chunk.team_id,
                customer.stripe_customer_id,
              );

              // If payment is successful or requires further action, issue credits
              if (
                paymentStatus.return_status === "succeeded" ||
                paymentStatus.return_status === "requires_action"
              ) {
                issueCreditsSuccess = await issueCredits(
                  chunk.team_id,
                  AUTO_RECHARGE_CREDITS,
                );
              }

              // Record the auto-recharge transaction
              await supabase_service.from("auto_recharge_transactions").insert({
                team_id: chunk.team_id,
                initial_payment_status: paymentStatus.return_status,
                credits_issued: issueCreditsSuccess ? AUTO_RECHARGE_CREDITS : 0,
                stripe_charge_id: paymentStatus.charge_id,
              });

              // Send a notification if credits were successfully issued
              if (issueCreditsSuccess) {
                await sendNotification(
                  chunk.team_id,
                  NotificationType.AUTO_RECHARGE_SUCCESS,
                  chunk.sub_current_period_start,
                  chunk.sub_current_period_end,
                  chunk,
                  true,
                );

                // Set cooldown period
                await setValue(cooldownKey, "true", AUTO_RECHARGE_COOLDOWN);
              }

              // Reset ACUC cache to reflect the new credit balance
              const cacheKeyACUC = `acuc_${chunk.api_key}`;
              await deleteKey(cacheKeyACUC);

              if (process.env.SLACK_ADMIN_WEBHOOK_URL) {
                const webhookCooldownKey = `webhook_cooldown_${chunk.team_id}`;
                const isInCooldown = await getValue(webhookCooldownKey);

                if (!isInCooldown) {
                  sendSlackWebhook(
                    `Auto-recharge: Team ${chunk.team_id}. ${AUTO_RECHARGE_CREDITS} credits added. Payment status: ${paymentStatus.return_status}.`,
                    false,
                    process.env.SLACK_ADMIN_WEBHOOK_URL,
                  ).catch((error) => {
                    logger.debug(`Error sending slack notification: ${error}`);
                  });

                  // Set cooldown for 1 hour
                  await setValue(webhookCooldownKey, "true", 60 * 60);
                }
              }
              return {
                success: true,
                message: "Auto-recharge successful",
                remainingCredits:
                  chunk.remaining_credits + AUTO_RECHARGE_CREDITS,
                chunk: {
                  ...chunk,
                  remaining_credits:
                    chunk.remaining_credits + AUTO_RECHARGE_CREDITS,
                },
              };
            } else {
              logger.error("No Stripe customer ID found for user");
              return {
                success: false,
                message: "No Stripe customer ID found for user",
                remainingCredits: chunk.remaining_credits,
                chunk,
              };
            }
          } else {
            logger.error("No sub_user_id found in chunk");
            return {
              success: false,
              message: "No sub_user_id found in chunk",
              remainingCredits: chunk.remaining_credits,
              chunk,
            };
          }
        }
        return {
          success: false,
          message: "No need to auto-recharge",
          remainingCredits: chunk.remaining_credits,
          chunk,
        };
      },
    );
  } catch (error) {
    logger.error(`Failed to acquire lock for auto-recharge: ${error}`);
    return {
      success: false,
      message: "Failed to acquire lock for auto-recharge",
      remainingCredits: chunk.remaining_credits,
      chunk,
    };
  }
}
