require("dotenv").config();

//const baseUrl = "https://api.firecrawl.dev";
const baseUrl = "http://localhost:3002";
const crawlId = process.argv[2];

(async () => {
    let url = baseUrl + "/v1/crawl/" + crawlId;
    let urls = [];

    while (url) {
        let res;
        
        while (true) {
            try {
                res = (await (await fetch(url, {
                    headers: {
                        "Authorization": "Bearer " + process.env.TEST_API_KEY
                    }
                })).json());
                break;
            } catch (e) {
                console.error(e);
            }
        }

        console.log(res.data.length);
        if (res.data.length === 0) {
            break;
        }

        urls.push(...res.data.map(x => x.metadata.url ?? x.metadata.sourceURL));

        url = res.next;
        if (url !== undefined) {
            const o = new URL(url)
            o.protocol = new URL(baseUrl).protocol;
            url = o.href;
        }
    }

    await require("fs/promises").writeFile(crawlId + "-urls.txt", urls.map(x => x.split("://").slice(1).join("://")).sort().join("\n"));
})();