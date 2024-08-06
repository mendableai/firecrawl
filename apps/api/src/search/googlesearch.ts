import axios from 'axios';
import * as cheerio from 'cheerio';
import * as querystring from 'querystring';
import { SearchResult } from '../../src/lib/entities';
import { Logger } from '../../src/lib/logger';

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

async function _req(term: string, results: number, lang: string, country: string, start: number, proxies: any, timeout: number, tbs: string = null, filter: string = null) {
    const params = {
        "q": term,
        "num": results,  // Number of results to return
        "hl": lang,
        "gl": country,
        "start": start,
    };
    if (tbs) {
        params["tbs"] = tbs;
    }
    if (filter) {
        params["filter"] = filter;
    }
    try {
        const resp = await axios.get("https://www.google.com/search", {
            headers: {
                "User-Agent": get_useragent()
            },
            params: params,
            proxy: proxies,
            timeout: timeout,
        });
        return resp;
    } catch (error) {
        if (error.response && error.response.status === 429) {
            throw new Error('Google Search: Too many requests, try again later.');
        }
        throw error;
    }
}



export async function google_search(term: string, advanced = false, num_results = 7, tbs = null, filter = null, lang = "en", country = "us", proxy = null, sleep_interval = 0, timeout = 5000, ) :Promise<SearchResult[]> {
    let proxies = null;
    if (proxy) {
        if (proxy.startsWith("https")) {
            proxies = {"https": proxy};
        } else {
            proxies = {"http": proxy};
        }
    }

    // TODO: knowledge graph, answer box, etc.

    let start = 0;
    let results : SearchResult[] = [];
    let attempts = 0;
    const maxAttempts = 20; // Define a maximum number of attempts to prevent infinite loop
    while (start < num_results && attempts < maxAttempts) {
        try {
            const resp = await _req(term, num_results - start, lang, country, start, proxies, timeout, tbs, filter);
            const $ = cheerio.load(resp.data);
            const result_block = $("div.g");
            if (result_block.length === 0) {
                start += 1;
                attempts += 1;
            } else {
                attempts = 0; // Reset attempts if we have results
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
                        results.push(new SearchResult(link, title.text(), description));
                    }
                }
            });
            await new Promise(resolve => setTimeout(resolve, sleep_interval * 1000));
        } catch (error) {
            if (error.message === 'Too many requests') {
                Logger.warn('Too many requests, breaking the loop');
                break;
            }
            throw error;
        }

        if (start === 0) {
            return results;
        }
    }
    if (attempts >= maxAttempts) {
      Logger.warn('Max attempts reached, breaking the loop');
    }
    return results
}
