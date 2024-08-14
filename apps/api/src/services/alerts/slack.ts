import axios from "axios";
import { Logger } from "../../../src/lib/logger";

export async function sendSlackWebhook(
  message: string,
  alertEveryone: boolean = false
) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const messagePrefix = alertEveryone ? "<!channel> " : "";
  const payload = {
    text: `${messagePrefix} ${message}`,
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    Logger.log("Webhook sent successfully:", response.data);
  } catch (error) {
    Logger.debug(`Error sending webhook: ${error}`);
  }
}
