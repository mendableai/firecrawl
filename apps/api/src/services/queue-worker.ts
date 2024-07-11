import { CustomError } from "../lib/custom-error";
import { getWebScraperQueue } from "./queue-service";
import "dotenv/config";
import { logtail } from "./logtail";
import { startWebScraperPipeline } from "../main/runWebScraper";
import { callWebhook } from "./webhook";
import { logJob } from "./logging/log_job";
// import { initSDK } from '@hyperdx/node-opentelemetry';

// if(process.env.ENV === 'production') {
//   initSDK({ consoleCapture: true, additionalInstrumentations: []});
// }

const wsq = getWebScraperQueue();
const myJobs = [];

wsq.process(
  Math.floor(Number(process.env.NUM_WORKERS_PER_QUEUE ?? 8)),
  async function (job, done) {
    myJobs.push(job.id);
    try {
      job.progress({
        current: 1,
        total: 100,
        current_step: "SCRAPING",
        current_url: "",
      });
      const start = Date.now();
      const { success, message, docs } = await startWebScraperPipeline({ job });
      const end = Date.now();
      const timeTakenInSeconds = (end - start) / 1000;

      const data = {
        success: success,
        result: {
          links: docs.map((doc) => {
            return { content: doc, source: doc?.metadata?.sourceURL ?? doc?.url ?? "" };
          }),
        },
        project_id: job.data.project_id,
        error: message /* etc... */,
      };

      await callWebhook(job.data.team_id, job.id as string, data);

      await logJob({
        job_id: job.id as string,
        success: success,
        message: message,
        num_docs: docs.length,
        docs: docs,
        time_taken: timeTakenInSeconds,
        team_id: job.data.team_id,
        mode: "crawl",
        url: job.data.url,
        crawlerOptions: job.data.crawlerOptions,
        pageOptions: job.data.pageOptions,
        origin: job.data.origin,
      });
      done(null, data);
    } catch (error) {
      if (error instanceof CustomError) {
        // Here we handle the error, then save the failed job
        console.error(error.message); // or any other error handling

        logtail.error("Custom error while ingesting", {
          job_id: job.id,
          error: error.message,
          dataIngestionJob: error.dataIngestionJob,
        });
      }
      console.log(error);

      logtail.error("Overall error ingesting", {
        job_id: job.id,
        error: error.message,
      });

      const data = {
        success: false,
        project_id: job.data.project_id,
        error:
          "Something went wrong... Contact help@mendable.ai or try again." /* etc... */,
      };
      await callWebhook(job.data.team_id, job.id as string, data);
      await logJob({
        job_id: job.id as string,
        success: false,
        message: typeof error === 'string' ? error : (error.message ?? "Something went wrong... Contact help@mendable.ai"),
        num_docs: 0,
        docs: [],
        time_taken: 0,
        team_id: job.data.team_id,
        mode: "crawl",
        url: job.data.url,
        crawlerOptions: job.data.crawlerOptions,
        pageOptions: job.data.pageOptions,
        origin: job.data.origin,
      });
      done(null, data);
    }
    myJobs.splice(myJobs.indexOf(job.id), 1);
  }
);

let shuttingDown = false;

process.on("SIGINT", async () => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("Gracefully shutting down...");

  await wsq.pause(true, true);
  
  if (myJobs.length > 0) {
    const jobs = await Promise.all(myJobs.map(x => wsq.getJob(x)));
    console.log("Removing", jobs.length, "jobs...");
    await Promise.all(jobs.map(async x => {
      await x.moveToFailed({ message: "interrupted" });
      await x.remove();
    }));
    console.log("Re-adding", jobs.length, "jobs...");
    await wsq.addBulk(jobs.map(x => ({
      data: x.data,
      opts: {
        jobId: x.id,
      },
    })));
    console.log("Done!");
  }

  process.exit(0);
});
