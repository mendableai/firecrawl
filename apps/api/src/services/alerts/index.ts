import { getWebScraperQueue } from "../queue-service";
import { sendSlackWebhook } from "./slack";

export function initAlerts() {
  try {
    if (
      process.env.SLACK_WEBHOOK_URL &&
      process.env.ENV === "production" &&
      process.env.ALERT_NUM_ACTIVE_JOBS &&
      process.env.ALERT_NUM_WAITING_JOBS
    ) {
      console.info("Initializing alerts");
      const checkActiveJobs = async () => {
        try {
          const webScraperQueue = getWebScraperQueue();
          const activeJobs = await webScraperQueue.getActiveCount();
          if (activeJobs > Number(process.env.ALERT_NUM_ACTIVE_JOBS)) {
            console.warn(
              `Alert: Number of active jobs is over ${process.env.ALERT_NUM_ACTIVE_JOBS}. Current active jobs: ${activeJobs}.`
            );
            sendSlackWebhook(
              `Alert: Number of active jobs is over ${process.env.ALERT_NUM_ACTIVE_JOBS}. Current active jobs: ${activeJobs}`,
              true
            );
          } else {
            console.info(
              `Number of active jobs is under ${process.env.ALERT_NUM_ACTIVE_JOBS}. Current active jobs: ${activeJobs}`
            );
          }
        } catch (error) {
          console.error("Failed to check active jobs:", error);
        }
      };

      const checkWaitingQueue = async () => {
        const webScraperQueue = getWebScraperQueue();
        const waitingJobs = await webScraperQueue.getWaitingCount();
        if (waitingJobs > Number(process.env.ALERT_NUM_WAITING_JOBS)) {
          console.warn(
            `Alert: Number of waiting jobs is over ${process.env.ALERT_NUM_WAITING_JOBS}. Current waiting jobs: ${waitingJobs}.`
          );
          sendSlackWebhook(
            `Alert: Number of waiting jobs is over ${process.env.ALERT_NUM_WAITING_JOBS}. Current waiting jobs: ${waitingJobs}. Scale up the number of workers with fly scale count worker=20`,
            true
          );
        }
      };

      const checkAll = async () => {
        await checkActiveJobs();
        await checkWaitingQueue();
      };

      setInterval(checkAll, 5 * 60 * 1000); // Run every 5 minutes
    }
  } catch (error) {
    console.error("Failed to initialize alerts:", error);
  }
}
