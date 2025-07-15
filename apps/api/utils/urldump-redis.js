require("dotenv").config();
const Redis = require("ioredis");

const crawlId = process.argv[2];

const redisConnection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

(async () => {
    const res = await redisConnection.sscan("crawl:" + crawlId + ":visited_unique", 0, "COUNT", 999);
    await require("fs/promises").writeFile(crawlId + "-visited.txt", res[1].map(x => x.split("://").slice(1).join("://")).sort().join("\n"));
    process.exit(0);
})();