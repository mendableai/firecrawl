import { logger } from "../../../src/lib/logger";
import { createRedisConnection, getScrapeQueue } from "../queue-service";
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
          const conn = createRedisConnection();
          const scrapeQueue = getScrapeQueue(conn);
          const activeJobs = await scrapeQueue.getActiveCount();
          conn.disconnect();

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
        const conn = createRedisConnection();
        const scrapeQueue = getScrapeQueue(conn);
        const waitingJobs = await scrapeQueue.getWaitingCount();
        conn.disconnect();

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
