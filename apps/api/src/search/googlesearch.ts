import axios from 'axios';
import * as cheerio from 'cheerio';
import * as querystring from 'querystring';
import { ScrapingBeeClient } from 'scrapingbee';

const _useragent_list = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.1661.62',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0'
];

function get_useragent(): string {
    return _useragent_list[Math.floor(Math.random() * _useragent_list.length)];
}

async function _req(term: string, results: number, lang: string, start: number, proxies: any, timeout: number) {
    const resp = await axios.get("https://www.google.com/search", {
        headers: {
            "User-Agent": get_useragent()
        },
        params: {
            "q": term,
            "num": results + 2,  // Prevents multiple requests
            "hl": lang,
        },
        proxy: proxies,
        timeout: timeout,
    });
    return resp;
}

class SearchResult {
    url: string;
    title: string;
    description: string;

    constructor(url: string, title: string, description: string) {
        this.url = url;
        this.title = title;
        this.description = description;
    }

    toString(): string {
        return `SearchResult(url=${this.url}, title=${this.title}, description=${this.description})`;
    }
}

export async function search(term: string, advanced = false, num_results = 7, lang = "en", proxy = null, sleep_interval = 0, timeout = 5000) {
    const escaped_term = querystring.escape(term);

    let proxies = null;
    if (proxy) {
        if (proxy.startsWith("https")) {
            proxies = {"https": proxy};
        } else {
            proxies = {"http": proxy};
        }
    }

    // const response = await _req_scraping_bee(escaped_term, num_results, lang);
    // const $ = cheerio.load(response);
    
    // const knowledgeGraphElement = $("div.kno-rdesc");
    // console.log(knowledgeGraphElement);
    // console.log(knowledgeGraphElement.html());

    // let knowledgeGraph = null;
    // if (knowledgeGraphElement.length > 0) {
    //     console.log("Knowledge Graph found");
    //     const title = knowledgeGraphElement.find("h2").text();
    //     const type = knowledgeGraphElement.find("div[data-attrid='subtitle']").text();
    //     const website = knowledgeGraphElement.find("a[data-ved]").attr("href");
    //     const imageUrl = knowledgeGraphElement.find("g-img img").attr("src");
    //     const description = knowledgeGraphElement.find("div[data-attrid='description'] span").text();
    //     const descriptionSource = knowledgeGraphElement.find("div[data-attrid='description'] a").text();
    //     const descriptionLink = knowledgeGraphElement.find("div[data-attrid='description'] a").attr("href");
    //     const attributes = {};
    //     knowledgeGraphElement.find("div[data-attrid='kc:/common:sideways']").each((index, element) => {
    //         const attributeKey = $(element).find("span[data-attrid]").text();
    //         const attributeValue = $(element).find("span[data-log-string]").text();
    //         attributes[attributeKey] = attributeValue;
    //     });
    //     knowledgeGraph = {
    //         "title": title,
    //         "type": type,
    //         "website": website,
    //         "imageUrl": imageUrl,
    //         "description": description,
    //         "descriptionSource": descriptionSource,
    //         "descriptionLink": descriptionLink,
    //         "attributes": attributes
    //     };
    // }

    let start = 0;
    let results = [];
    while (start < num_results) {
        const resp = await _req(escaped_term, num_results - start, lang, start, proxies, timeout);
        const $ = cheerio.load(resp.data);
        const result_block = $("div.g");
        if (result_block.length === 0) {
            start += 1;
        }
        result_block.each((index, element) => {
            const linkElement = $(element).find("a");
            const link = linkElement && linkElement.attr("href") ? linkElement.attr("href") : null;
            const title = $(element).find("h3");
            const ogImage = $(element).find("img").eq(1).attr("src");
            const description_box = $(element).find("div[style='-webkit-line-clamp:2']");
            const answerBox = $(element).find(".mod").text();
            if (description_box) {
                const description = description_box.text();
                if (link && title && description) {
                    start += 1;
                    if (advanced) {
                        results.push(new SearchResult(link, title.text(), description));
                    } else {
                        results.push(link);
                    }
                }
            }
        });
        await new Promise(resolve => setTimeout(resolve, sleep_interval * 1000));

        if (start === 0) {
            return {results: []};
        }
    }
    return {results: results};
}
