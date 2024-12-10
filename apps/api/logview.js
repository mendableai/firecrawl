const fs = require("fs");

const logs = fs.readFileSync("7a373219-0eb4-4e47-b2df-e90e12afd5c1.log", "utf8")
    .split("\n").filter(x => x.trim().length > 0).map(x => JSON.parse(x));

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
