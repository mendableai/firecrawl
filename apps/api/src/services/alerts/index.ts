import { Logger } from "../../../src/lib/logger";
import { getScrapeQueue } from "../queue-service";

export async function checkAlerts() {
  try {
    if (
      process.env.ENV === "production" &&
      process.env.ALERT_NUM_ACTIVE_JOBS &&
      process.env.ALERT_NUM_WAITING_JOBS
    ) {
      Logger.info("Initializing alerts");
      const checkActiveJobs = async () => {
        try {
          const scrapeQueue = getScrapeQueue();
          const activeJobs = await scrapeQueue.getActiveCount();
          if (activeJobs > Number(process.env.ALERT_NUM_ACTIVE_JOBS)) {
            Logger.warn(
              `Alert: Number of active jobs is over ${process.env.ALERT_NUM_ACTIVE_JOBS}. Current active jobs: ${activeJobs}.`
            );
          } else {
            Logger.info(
              `Number of active jobs is under ${process.env.ALERT_NUM_ACTIVE_JOBS}. Current active jobs: ${activeJobs}`
            );
          }
        } catch (error) {
          Logger.error(`Failed to check active jobs: ${error}`);
        }
      };

      const checkWaitingQueue = async () => {
        const scrapeQueue = getScrapeQueue();
        const waitingJobs = await scrapeQueue.getWaitingCount();

        if (waitingJobs > Number(process.env.ALERT_NUM_WAITING_JOBS)) {
          Logger.warn(
            `Alert: Number of waiting jobs is over ${process.env.ALERT_NUM_WAITING_JOBS}. Current waiting jobs: ${waitingJobs}.`
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
    Logger.error(`Failed to initialize alerts: ${error}`);
  }
}
