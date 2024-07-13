import axios from "axios";

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
    console.log("Webhook sent successfully:", response.data);
  } catch (error) {
    console.error("Error sending webhook:", error);
  }
}
