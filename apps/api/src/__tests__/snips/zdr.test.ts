import { supabase_service } from "../../services/supabase";
import { getJobFromGCS } from "../../lib/gcs-jobs";
import { scrape, Identity, crawl, batchScrape, defaultIdentity, scrapeStatusRaw, zdrcleaner } from "./lib";
import { readFile, stat } from "fs/promises";

const zdrIdentity: Identity = {
    apiKey: process.env.TEST_API_KEY_ZDR!,
    teamId: process.env.TEST_TEAM_ID_ZDR!,
};

if (process.env.TEST_SUITE_SELF_HOSTED) {
    it("mocked", () => {
        expect(true).toBe(true);
    });
} else {
    async function getServerLogs() {
        if (!process.env.GITHUB_ACTIONS) {
            try {
                await stat("server.log");
            } catch (error) {
                console.warn("Server log file not found");
                return [];
            }
        }

        const logs = await readFile("server.log", "utf-8");
        return logs.split("\n").filter(line => line.trim().length > 0);
    }

    async function getWorkerLogs() {
        if (!process.env.GITHUB_ACTIONS) {
            try {
                await stat("worker.log");
            } catch (error) {
                console.warn("Worker log file not found");
                return [];
            }
        }

        const logs = await readFile("worker.log", "utf-8");
        return logs.split("\n").filter(line => line.trim().length > 0 && !line.includes("Billing queue created"));
    }

    describe("Zero Data Retention", () => {
        describe.each(["Team-scoped", "Request-scoped"] as const)("%s", (scope) => {
            const scopeIdentity = scope === "Team-scoped" ? zdrIdentity : defaultIdentity;

            it("should clean up a scrape immediately", async () => {
                const testId = crypto.randomUUID();

                const preServerLogs = await getServerLogs();
                const preWorkerLogs = await getWorkerLogs();

                const scrape1 = await scrape({
                    url: "https://firecrawl.dev/?test=" + testId,
                    zeroDataRetention: scope === "Request-scoped" ? true : undefined,
                }, scopeIdentity);

                const postServerLogs = (await getServerLogs()).slice(preServerLogs.length);
                const postWorkerLogs = (await getWorkerLogs()).slice(preWorkerLogs.length);

                if (postWorkerLogs.length > 0 || postServerLogs.length > 0) {
                    console.warn("Logs changed during scrape", postServerLogs, postWorkerLogs);
                }

                expect(postServerLogs).toHaveLength(0);
                expect(postWorkerLogs).toHaveLength(0);

                const gcsJob = await getJobFromGCS(scrape1.metadata.scrapeId!);
                expect(gcsJob).toBeNull();

                const { data, error } = await supabase_service.from("firecrawl_jobs")
                    .select("*")
                    .eq("job_id", scrape1.metadata.scrapeId!)
                    .limit(1);

                expect(error).toBeFalsy();
                expect(data).toHaveLength(1);

                if (data && data.length === 1) {
                    const record = data[0];
                    expect(record.url).not.toContain("://"); // no url stored
                    expect(record.docs).toBeNull();
                    expect(record.page_options).toBeNull();
                    expect(record.crawler_options).toBeNull();
                }

                if (scope === "Request-scoped") {
                    const status = await scrapeStatusRaw(scrape1.metadata.scrapeId!, scopeIdentity);

                    expect(status.statusCode).toBe(404);
                }
            }, 60000);

            it("should clean up a crawl", async () => {
                const preServerLogs = await getServerLogs();
                const preWorkerLogs = await getWorkerLogs();

                const crawl1 = await crawl({
                    url: "https://firecrawl.dev",
                    limit: 10,
                    zeroDataRetention: scope === "Request-scoped" ? true : undefined,
                }, scopeIdentity);

                const postServerLogs = (await getServerLogs()).slice(preServerLogs.length);
                const postWorkerLogs = (await getWorkerLogs()).slice(preWorkerLogs.length);

                if (postWorkerLogs.length > 0 || postServerLogs.length > 0) {
                    console.warn("Logs changed during crawl", postServerLogs, postWorkerLogs);
                }

                expect(postServerLogs).toHaveLength(0);
                expect(postWorkerLogs).toHaveLength(0);

                const { data, error } = await supabase_service.from("firecrawl_jobs")
                    .select("*")
                    .eq("job_id", crawl1.id)
                    .limit(1);

                expect(error).toBeFalsy();
                expect(data).toHaveLength(1);

                if (data && data.length === 1) {
                    const record = data[0];
                    expect(record.url).not.toContain("://"); // no url stored
                    expect(record.docs).toBeNull();
                    expect(record.page_options).toBeNull();
                    expect(record.crawler_options).toBeNull();
                }

                const { data: jobs, error: jobsError } = await supabase_service.from("firecrawl_jobs")
                    .select("*")
                    .eq("crawl_id", crawl1.id);

                expect(jobsError).toBeFalsy();
                expect((jobs ?? []).length).toBeGreaterThanOrEqual(1);

                for (const job of jobs ?? []) {
                    expect(job.url).not.toContain("://"); // no url stored
                    expect(job.docs).toBeNull();
                    expect(job.page_options).toBeNull();
                    expect(job.crawler_options).toBeNull();
                    expect(typeof job.dr_clean_by).toBe("string"); // clean up happens async on a worker after expiry

                    if (job.success) {
                        const gcsJob = await getJobFromGCS(job.job_id);
                        expect(gcsJob).not.toBeNull(); // clean up happens async on a worker after expiry
                    }
                }

                await zdrcleaner(scopeIdentity.teamId!);

                for (const job of jobs ?? []) {
                    const gcsJob = await getJobFromGCS(job.job_id);
                    expect(gcsJob).toBeNull();

                    if (scope === "Request-scoped") {
                        const status = await scrapeStatusRaw(job.job_id, scopeIdentity);
                        expect(status.statusCode).toBe(404);
                    }
                }
            }, 600000);

            it("should clean up a batch scrape", async () => {
                const preServerLogs = await getServerLogs();
                const preWorkerLogs = await getWorkerLogs();

                const crawl1 = await batchScrape({
                    urls: ["https://firecrawl.dev", "https://mendable.ai"],
                    zeroDataRetention: scope === "Request-scoped" ? true : undefined,
                }, scopeIdentity);

                const postServerLogs = (await getServerLogs()).slice(preServerLogs.length);
                const postWorkerLogs = (await getWorkerLogs()).slice(preWorkerLogs.length);

                if (postWorkerLogs.length > 0 || postServerLogs.length > 0) {
                    console.warn("Logs changed during batch scrape", postServerLogs, postWorkerLogs);
                }

                expect(postServerLogs).toHaveLength(0);
                expect(postWorkerLogs).toHaveLength(0);

                const { data, error } = await supabase_service.from("firecrawl_jobs")
                    .select("*")
                    .eq("job_id", crawl1.id)
                    .limit(1);

                expect(error).toBeFalsy();
                expect(data).toHaveLength(1);

                if (data && data.length === 1) {
                    const record = data[0];
                    expect(record.url).not.toContain("://"); // no url stored
                    expect(record.docs).toBeNull();
                    expect(record.page_options).toBeNull();
                    expect(record.crawler_options).toBeNull();
                }

                const { data: jobs, error: jobsError } = await supabase_service.from("firecrawl_jobs")
                    .select("*")
                    .eq("crawl_id", crawl1.id);

                expect(jobsError).toBeFalsy();
                expect((jobs ?? []).length).toBe(2);

                for (const job of jobs ?? []) {
                    expect(job.url).not.toContain("://"); // no url stored
                    expect(job.docs).toBeNull();
                    expect(job.page_options).toBeNull();
                    expect(job.crawler_options).toBeNull();
                    expect(typeof job.dr_clean_by).toBe("string"); // clean up happens async on a worker after expiry

                    if (job.success) {
                        const gcsJob = await getJobFromGCS(job.job_id);
                        expect(gcsJob).not.toBeNull(); // clean up happens async on a worker after expiry
                    }
                }

                await zdrcleaner(scopeIdentity.teamId!);

                for (const job of jobs ?? []) {
                    const gcsJob = await getJobFromGCS(job.job_id);
                    expect(gcsJob).toBeNull();

                    if (scope === "Request-scoped") {
                        const status = await scrapeStatusRaw(job.job_id, scopeIdentity);
                        expect(status.statusCode).toBe(404);
                    }
                }
            }, 600000);
        });
    });
}
