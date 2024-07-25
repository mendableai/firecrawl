import { Logger } from "../../src/lib/logger";
import { supabase_service } from "./supabase";

export const callWebhook = async (teamId: string, jobId: string,data: any) => {
  try {
    const selfHostedUrl = process.env.SELF_HOSTED_WEBHOOK_URL?.replace("{{JOB_ID}}", jobId);
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
    let webhookUrl = selfHostedUrl;

    // Only fetch the webhook URL from the database if the self-hosted webhook URL is not set
    // and the USE_DB_AUTHENTICATION environment variable is set to true
    if (!selfHostedUrl && useDbAuthentication) {
      const { data: webhooksData, error } = await supabase_service
        .from("webhooks")
        .select("url")
        .eq("team_id", teamId)
        .limit(1);
      if (error) {
        Logger.error(`Error fetching webhook URL for team ID: ${teamId}, error: ${error.message}`);
        return null;
      }

      if (!webhooksData || webhooksData.length === 0) {
        return null;
      }

      webhookUrl = webhooksData[0].url;
    }

    let dataToSend = [];
    if (data.result.links && data.result.links.length !== 0) {
      for (let i = 0; i < data.result.links.length; i++) {
        dataToSend.push({
          content: data.result.links[i].content.content,
          markdown: data.result.links[i].content.markdown,
          metadata: data.result.links[i].content.metadata,
        });
      }
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: data.success,
        jobId: jobId,
        data: dataToSend,
        error: data.error || undefined,
      }),
    });
  } catch (error) {
    Logger.debug(`Error sending webhook for team ID: ${teamId}, error: ${error.message}`);
  }
};
