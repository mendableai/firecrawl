const fs = require("fs");

// METHOD: Winston log file
// const logs = fs.readFileSync("7a373219-0eb4-4e47-b2df-e90e12afd5c1.log", "utf8")
//     .split("\n").filter(x => x.trim().length > 0).map(x => JSON.parse(x));

// METHOD: GCloud export
const logs = [
    "downloaded-logs-20241213-225607.json",
    "downloaded-logs-20241213-225654.json",
    "downloaded-logs-20241213-225720.json",
    "downloaded-logs-20241213-225758.json",
    "downloaded-logs-20241213-225825.json",
    "downloaded-logs-20241213-225843.json",
].flatMap(x => JSON.parse(fs.readFileSync(x, "utf8"))).map(x => x.jsonPayload);


const crawlIds = [...new Set(logs.map(x => x.crawlId).filter(x => x))];

const urlFilter = x => new URL(x).pathname.slice(1) || "root"

for (const crawlId of crawlIds) {
    const crawlLogs = logs.filter(x => x.crawlId === crawlId);
    fs.writeFileSync("crawl-" + crawlId + ".log", crawlLogs.map(x => JSON.stringify(x)).join("\n"));

    const jobAdds = crawlLogs.filter(x => x.jobPriority !== undefined && x.message.startsWith("Added job for URL "));
    const jobStarts = crawlLogs.filter(x => x.message.startsWith("🐂 Worker taking job"));
    const ttl = [...new Set(crawlLogs.filter(x => x.method === "lockURL" && x.res !== undefined).map(x => x.url))]

    fs.writeFileSync(crawlId + ".md",
        "```mermaid\nflowchart LR\n    "
            + jobStarts.map(x => `${x.jobId}[${urlFilter(x.url)}]`).join("\n    ") + "\n    "
            + jobAdds.map(x => `${x.jobId}[${urlFilter(jobStarts.find(y => y.jobId === x.jobId).url)}] --> ${x.newJobId}[${urlFilter(x.url)}]`).join("\n    ")
            + "\n```\n\nURLs scraped: (" + jobStarts.length + ")\n"
            + jobStarts.map(x => "- " + x.url).join("\n") + "\n\nURLs tried to lock: (" + ttl.length + ")\n"
            + ttl.map(x => "- " + x + " ("+ crawlLogs.filter(y => y.method === "lockURL" && y.res !== undefined && y.url === x).length + "; " + crawlLogs.filter(y => y.method === "lockURL" && y.res === true && y.url === x).length + ")").join("\n")
    );
}
