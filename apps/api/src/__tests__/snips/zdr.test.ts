import { supabase_service } from "../../services/supabase";
import { getJobFromGCS } from "../../lib/gcs-jobs";
import { scrape, Identity, crawl, batchScrape } from "./lib";

const zdrIdentity: Identity = {
    apiKey: process.env.TEST_API_KEY_ZDR!,
};

describe("Zero Data Retention", () => {
    it.concurrent("should clean up a scrape immediately", async () => {
        const testId = crypto.randomUUID();
        const scrape1 = await scrape({
            url: "https://firecrawl.dev/?test=" + testId,
        }, zdrIdentity);

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
    }, 60000);

    it.concurrent("should partially clean up a crawl immediately", async () => {
        const crawl1 = await crawl({
            url: "https://firecrawl.dev",
            limit: 100,
        }, zdrIdentity);

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
            expect(job.zdr_cleaned_up).toBe(false); // clean up happens async on a worker after expiry

            if (job.success) {
                const gcsJob = await getJobFromGCS(job.job_id);
                expect(gcsJob).not.toBeNull(); // clean up happens async on a worker after expiry
            }
        }
    }, 600000);

    it.concurrent("should partially clean up a batch scrape immediately", async () => {
        const crawl1 = await batchScrape({
            urls: ["https://firecrawl.dev", "https://mendable.ai"],
        }, zdrIdentity);

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
            expect(job.zdr_cleaned_up).toBe(false); // clean up happens async on a worker after expiry

            if (job.success) {
                const gcsJob = await getJobFromGCS(job.job_id);
                expect(gcsJob).not.toBeNull(); // clean up happens async on a worker after expiry
            }
        }
    }, 600000);
});