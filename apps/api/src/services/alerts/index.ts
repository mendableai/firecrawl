import { logger } from "../../../src/lib/logger";
import { getScrapeQueue, scrapeQueueNames } from "../queue-service";
import { sendSlackWebhook } from "./slack";

export async function checkAlerts() {
  try {
    if (
      process.env.SLACK_WEBHOOK_URL &&
      process.env.ENV === "production" &&
      process.env.ALERT_NUM_ACTIVE_JOBS &&
      process.env.ALERT_NUM_WAITING_JOBS
    ) {
      logger.info("Initializing alerts");
      const checkActiveJobs = async () => {
        try {
          const activeJobs = (await Promise.all(scrapeQueueNames.map((_, i) => getScrapeQueue(i).getActiveCount()))).reduce((acc, curr) => acc + curr, 0);
          if (activeJobs > Number(process.env.ALERT_NUM_ACTIVE_JOBS)) {
            logger.warn(
              `Alert: Number of active jobs is over ${process.env.ALERT_NUM_ACTIVE_JOBS}. Current active jobs: ${activeJobs}.`,
            );
            sendSlackWebhook(
              `Alert: Number of active jobs is over ${process.env.ALERT_NUM_ACTIVE_JOBS}. Current active jobs: ${activeJobs}`,
              true,
            );
          } else {
            logger.info(
              `Number of active jobs is under ${process.env.ALERT_NUM_ACTIVE_JOBS}. Current active jobs: ${activeJobs}`,
            );
          }
        } catch (error) {
          logger.error(`Failed to check active jobs: ${error}`);
        }
      };

      const checkWaitingQueue = async () => {
        const waitingJobs = (await Promise.all(scrapeQueueNames.map((_, i) => getScrapeQueue(i).getWaitingCount()))).reduce((acc, curr) => acc + curr, 0);

        if (waitingJobs > Number(process.env.ALERT_NUM_WAITING_JOBS)) {
          logger.warn(
            `Alert: Number of waiting jobs is over ${process.env.ALERT_NUM_WAITING_JOBS}. Current waiting jobs: ${waitingJobs}.`,
          );
          sendSlackWebhook(
            `Alert: Number of waiting jobs is over ${process.env.ALERT_NUM_WAITING_JOBS}. Current waiting jobs: ${waitingJobs}. Scale up the number of workers with fly scale count worker=20`,
            true,
          );
        }
      };

      const checkAll = async () => {
        await checkActiveJobs();
        await checkWaitingQueue();
      };

      await checkAll();
      // setInterval(checkAll, 10000); // Run every
    }
  } catch (error) {
    logger.error(`Failed to initialize alerts: ${error}`);
  }
}
