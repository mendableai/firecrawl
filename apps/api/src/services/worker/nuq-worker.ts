import "dotenv/config";
import { logger } from "../../lib/logger";
import { processJobInternal } from "./scrape-worker";
import { nuqGetJobToProcess, nuqJobEnd, nuqRenewLock, nuqShutdown } from "./nuq";

(async () => {
    let isShuttingDown = false;
    const myLock = crypto.randomUUID();

    function shutdown() {
        isShuttingDown = true;
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    while (!isShuttingDown) {
        const acquireStart = Date.now();
        const job = await nuqGetJobToProcess(myLock);
        const acquireTime = Date.now() - acquireStart;

        if (job === null) {
            logger.info(`No jobs to process (${acquireTime}ms)`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
        }

        logger.info(`Acquired job (${acquireTime}ms)`, { scrapeId: job.id });

        const lockRenewInterval = setInterval(async () => {
            const renewStart = Date.now();
            if (!await nuqRenewLock(job.id, myLock)) {
                const renewTime = Date.now() - renewStart;
                logger.warn(`Failed to renew lock (${renewTime}ms)`, { scrapeId: job.id });
                clearInterval(lockRenewInterval);
                return;
            }
            const renewTime = Date.now() - renewStart;
            logger.info(`Renewed lock (${renewTime}ms)`, { scrapeId: job.id });
        }, 15000);

        let processResult: { ok: true, data: Awaited<ReturnType<typeof processJobInternal>> } | { ok: false, error: Error };

        try {
            processResult = { ok: true, data: await processJobInternal(job) };
        } catch (error) {
            processResult = { ok: false, error: error as Error };
        }
        
        clearInterval(lockRenewInterval);

        const status: "completed" | "failed" = processResult.ok ? "completed" : "failed";

        if (!await nuqJobEnd(job.id, myLock, status)) {
            logger.warn("Could not update job status", { status, scrapeId: job.id });
        }
    }

    logger.info("NuQ worker shutting down");

    await nuqShutdown();

    logger.info("NuQ worker shut down");

    process.exit(0);
})();