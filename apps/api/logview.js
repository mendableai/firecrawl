const fs = require("fs");

const logs = fs.readFileSync("log-20780c8a-52f5-4af7-ac48-62997d11ec9b.log", "utf8")
    .split("\n").filter(x => x.trim().length > 0).map(x => JSON.parse(x));

const crawlIds = [...new Set(logs.map(x => x.crawlId).filter(x => x))];

const urlFilter = x => new URL(x).pathname.slice(1) || "root"

for (const crawlId of crawlIds) {
    const crawlLogs = logs.filter(x => x.crawlId === crawlId);

    const jobAdds = crawlLogs.filter(x => x.jobPriority !== undefined && x.message.startsWith("Added job for URL "));
    const jobStarts = crawlLogs.filter(x => x.message.startsWith("🐂 Worker taking job"));

    fs.writeFileSync(crawlId + ".md",
        "```mermaid\nflowchart LR\n    "
            + jobStarts.map(x => `${x.jobId}[${urlFilter(x.url)}]`).join("\n    ") + "\n    "
            + jobAdds.map(x => `${x.jobId}[${urlFilter(jobStarts.find(y => y.jobId === x.jobId).url)}] --> ${x.newJobId}[${urlFilter(x.url)}]`).join("\n    ")
            + "\n```\n\nURLs scraped: (" + jobStarts.length + ")\n"
            + jobStarts.map(x => "- " + x.url).join("\n")
    );
}
