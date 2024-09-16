export const urlSpecificParams = {
  "platform.openai.com": {
    defaultScraper: "fire-engine",
    params:{
      wait: 3000,
      fireEngineOptions:{
        engine: "chrome-cdp"
      },
    },
  },
  "support.greenpay.me":{
    defaultScraper: "fire-engine",
    params: {
        wait_browser: "networkidle2",
        block_resources: false,
        wait: 2000,

      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://www.google.com/",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      },
  },
  "docs.pdw.co":{
    defaultScraper: "fire-engine",
    params: {
        wait_browser: "networkidle2",
        block_resources: false,
        wait: 3000,
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://www.google.com/",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      },
  },
  "ycombinator.com":{
    defaultScraper: "fire-engine",
    params: {
        wait_browser: "networkidle2",
        block_resources: false,
        wait: 3000,
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://www.google.com/",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      },
  },
  "developers.notion.com":{
    defaultScraper: "fire-engine",
    params: {
        wait_browser: "networkidle2",
        block_resources: false,
        wait: 2000,
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://www.google.com/",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      },
  },
  "docs2.hubitat.com":{
    defaultScraper: "fire-engine",
    params: {
        wait_browser: "networkidle2",
        block_resources: false,
        wait: 2000,
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://www.google.com/",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      },
  },
  "scrapethissite.com":{
    defaultScraper: "fetch",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      referer: "https://www.google.com/",
      "accept-language": "en-US,en;q=0.9",
      "accept-encoding": "gzip, deflate, br",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    },
  },
  "rsseau.fr":{
    defaultScraper: "fetch",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      referer: "https://www.google.com/",
      "accept-language": "en-US,en;q=0.9",
      "accept-encoding": "gzip, deflate, br",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    },
  },
  "help.salesforce.com":{
    defaultScraper: "fire-engine",
    params: {
        wait_browser: "networkidle2",
        block_resources: false,
        wait: 2000,
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://www.google.com/",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      },
  },
  "firecrawl.dev":{
    defaultScraper: "fire-engine",
    params: {
      engine: "playwright",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://www.google.com/",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      },
    },
  },
  "ir.veeva.com":{
    defaultScraper: "fire-engine",
  },
  "eonhealth.com":{
    defaultScraper: "fire-engine",
    params:{
      fireEngineOptions:{
        mobileProxy: true,
        method: "get",
        engine: "request",
      },
    },
  },
  "notion.com":{
    defaultScraper: "fire-engine",
    params: {
        wait_browser: "networkidle2",
        block_resources: false,
        wait: 2000,
        engine: "playwright",
      }
  },
  "mendable.ai":{
    defaultScraper: "fire-engine",
    params:{
      fireEngineOptions:{
        mobileProxy: true,
        method: "get",
        engine: "chrome-cdp",
      },
    },
  },
  "developer.apple.com":{
    defaultScraper: "fire-engine",
    params:{
      engine: "playwright",
      wait: 2000,
      fireEngineOptions: {
        blockMedia: false,
      }
    },
  },
  "amazon.com":{
    defaultScraper: "fire-engine",
    params:{
      fireEngineOptions:{
        engine: "chrome-cdp",
      },
    },
  },
  "digikey.com":{
    defaultScraper: "fire-engine",
    params:{
      fireEngineOptions:{
        engine: "tlsclient",
      },
    },
  },
  "zoopla.co.uk":{
    defaultScraper: "fire-engine",
    params:{
      fireEngineOptions:{
        engine: "chrome-cdp",
      },
    },
  },
  "lorealparis.hu":{
    defaultScraper: "fire-engine",
    params:{
      fireEngineOptions:{
        engine: "tlsclient",
      },
    },
  }
};
