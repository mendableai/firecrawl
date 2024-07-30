import { supabase_service } from "../supabase";
import { withAuth } from "../../lib/withAuth";
import { Resend } from "resend";
import { NotificationType } from "../../types";
import { Logger } from "../../../src/lib/logger";

const emailTemplates: Record<
  NotificationType,
  { subject: string; html: string }
> = {
  [NotificationType.APPROACHING_LIMIT]: {
    subject: "You've used 80% of your credit limit - Firecrawl",
    html: "Hey there,<br/><p>You are approaching your credit limit for this billing period. Your usage right now is around 80% of your total credit limit. Consider upgrading your plan to avoid hitting the limit. Check out our <a href='https://firecrawl.dev/pricing'>pricing page</a> for more info.</p><br/>Thanks,<br/>Firecrawl Team<br/>",
  },
  [NotificationType.LIMIT_REACHED]: {
    subject:
      "Credit Limit Reached! Take action now to resume usage - Firecrawl",
    html: "Hey there,<br/><p>You have reached your credit limit for this billing period. To resume usage, please upgrade your plan. Check out our <a href='https://firecrawl.dev/pricing'>pricing page</a> for more info.</p><br/>Thanks,<br/>Firecrawl Team<br/>",
  },
  [NotificationType.RATE_LIMIT_REACHED]: {
    subject: "Rate Limit Reached - Firecrawl",
    html: "Hey there,<br/><p>You've hit one of the Firecrawl endpoint's rate limit! Take a breather and try again in a few moments. If you need higher rate limits, consider upgrading your plan. Check out our <a href='https://firecrawl.dev/pricing'>pricing page</a> for more info.</p><p>If you have any questions, feel free to reach out to us at <a href='mailto:hello@firecrawl.com'>hello@firecrawl.com</a></p><br/>Thanks,<br/>Firecrawl Team<br/><br/>Ps. this email is only sent once every 7 days if you reach a rate limit.",
  },
};

export async function sendNotification(
  team_id: string,
  notificationType: NotificationType,
  startDateString: string,
  endDateString: string
) {
  return withAuth(sendNotificationInternal)(
    team_id,
    notificationType,
    startDateString,
    endDateString
  );
}

async function sendEmailNotification(
  email: string,
  notificationType: NotificationType
) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: "Firecrawl <firecrawl@getmendableai.com>",
      to: [email],
      reply_to: "hello@firecrawl.com",
      subject: emailTemplates[notificationType].subject,
      html: emailTemplates[notificationType].html,
    });

    if (error) {
      Logger.debug(`Error sending email: ${error}`);
      return { success: false };
    }
  } catch (error) {
    Logger.debug(`Error sending email (2): ${error}`);
    return { success: false };
  }
}

export async function sendNotificationInternal(
  team_id: string,
  notificationType: NotificationType,
  startDateString: string,
  endDateString: string
): Promise<{ success: boolean }> {
  if (team_id === "preview") {
    return { success: true };
  }

  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  const { data, error } = await supabase_service
    .from("user_notifications")
    .select("*")
    .eq("team_id", team_id)
    .eq("notification_type", notificationType)
    .gte("sent_date", fifteenDaysAgo.toISOString());

  if (error) {
    Logger.debug(`Error fetching notifications: ${error}`);
    return { success: false };
  }

  if (data.length !== 0) {
    // Logger.debug(`Notification already sent for team_id: ${team_id} and notificationType: ${notificationType} in the last 15 days`);
    return { success: false };
  }

  const { data: recentData, error: recentError } = await supabase_service
    .from("user_notifications")
    .select("*")
    .eq("team_id", team_id)
    .eq("notification_type", notificationType)
    .gte("sent_date", startDateString)
    .lte("sent_date", endDateString);

  if (recentError) {
    Logger.debug(`Error fetching recent notifications: ${recentError}`);
    return { success: false };
  }

  if (recentData.length !== 0) {
    // Logger.debug(`Notification already sent for team_id: ${team_id} and notificationType: ${notificationType} within the specified date range`);
    return { success: false };
  } else {
    console.log(`Sending notification for team_id: ${team_id} and notificationType: ${notificationType}`);
    // get the emails from the user with the team_id
    const { data: emails, error: emailsError } = await supabase_service
      .from("users")
      .select("email")
      .eq("team_id", team_id);

    if (emailsError) {
      Logger.debug(`Error fetching emails: ${emailsError}`);
      return { success: false };
    }

    for (const email of emails) {
      await sendEmailNotification(email.email, notificationType);
    }

    const { error: insertError } = await supabase_service
      .from("user_notifications")
      .insert([
        {
          team_id: team_id,
          notification_type: notificationType,
          sent_date: new Date().toISOString(),
        },
      ]);

    if (insertError) {
      Logger.debug(`Error inserting notification record: ${insertError}`);
      return { success: false };
    }

    return { success: true };
  }
}
