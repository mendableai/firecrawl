import koffi, { KoffiFunction } from "koffi";
import { join } from "path";
import { stat } from "fs/promises";
import { platform } from "os";
import { processMultiLineLinks, removeSkipToContentLinks } from "./html-to-markdown";
import { logger } from "./logger";

// TODO: add a timeout to the Rust transformer
const rustExecutablePath = join(
  process.cwd(),
  "sharedLibs/html-transformer/target/release/",
  platform() === "darwin" ? "libhtml_transformer.dylib" : "libhtml_transformer.so"
);

type TransformHtmlOptions = {
  html: string,
  url: string,
  include_tags: string[],
  exclude_tags: string[],
  only_main_content: boolean,
  omce_signatures?: string[],
};

class RustHTMLTransformer {
  private static instance: RustHTMLTransformer;
  private _extractLinks: KoffiFunction;
  private _extractBaseHref: KoffiFunction;
  private _extractMetadata: KoffiFunction;
  private _transformHtml: KoffiFunction;
  private _freeString: KoffiFunction;
  private _getInnerJSON: KoffiFunction;
  private _htmlToMarkdown: KoffiFunction;
  
  private constructor() {
    const lib = koffi.load(rustExecutablePath);
    this._freeString = lib.func("free_string", "void", ["string"]);
    const cstn = "CString:" + crypto.randomUUID();
    const freedResultString = koffi.disposable(cstn, "string", this._freeString);
    this._extractLinks = lib.func("extract_links", freedResultString, ["string"]);
    this._extractBaseHref = lib.func("extract_base_href", freedResultString, ["string", "string"]);
    this._extractMetadata = lib.func("extract_metadata", freedResultString, ["string"]);
    this._transformHtml = lib.func("transform_html", freedResultString, ["string"]);
    this._getInnerJSON = lib.func("get_inner_json", freedResultString, ["string"]);
    this._htmlToMarkdown = lib.func("html_to_markdown", freedResultString, ["string"]);
  }

  public static async getInstance(): Promise<RustHTMLTransformer> {
    if (!RustHTMLTransformer.instance) {
      try {
        await stat(rustExecutablePath);
      } catch (_) {
        throw Error("Rust html-transformer shared library not found");
      }
      RustHTMLTransformer.instance = new RustHTMLTransformer();
    }
    return RustHTMLTransformer.instance;
  }

  public async extractLinks(html: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      this._extractLinks.async(html, (err: Error, res: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(JSON.parse(res));
        }
      });
    });
  }

  public async extractBaseHref(html: string, url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this._extractBaseHref.async(html, url, (err: Error, res: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }

  public async extractMetadata(html: string): Promise<any> {
    return new Promise<string[]>((resolve, reject) => {
      this._extractMetadata.async(html, (err: Error, res: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(JSON.parse(res));
        }
      });
    });
  }

  public async transformHtml(opts: TransformHtmlOptions): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this._transformHtml.async(JSON.stringify(opts), (err: Error, res: string) => {
        if (err) {
          reject(err);
        } else {
          if (res === "RUSTFC:ERROR" || res.startsWith("RUSTFC:ERROR:")) {
            reject(new Error(res.startsWith("RUSTFC:ERROR:") ? ("Something went wrong on the Rust side. " + res.split("RUSTFC:ERROR:")[1]) : "Something went wrong on the Rust side."));
          } else {
            resolve(res);
          }
        }
      });
    });
  }

  public async getInnerJSON(html: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this._getInnerJSON.async(html, (err: Error, res: string) => {
        if (err) {
          reject(err);
        } else {
          if (res === "RUSTFC:ERROR") {
            reject(new Error("Something went wrong on the Rust side."));
          } else {
            resolve(res);
          }
        }
      });
    });
  }

  public async htmlToMarkdown(html: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this._htmlToMarkdown.async(html, (err: Error, res: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }
}

export async function extractLinks(
  html: string | null | undefined,
): Promise<string[]> {
    if (!html) {
        return [];
    }

    const converter = await RustHTMLTransformer.getInstance();
    return await converter.extractLinks(html);
}

export async function extractBaseHref(
  html: string | null | undefined,
  url: string
): Promise<string> {
    if (!html) {
        return url;
    }

    const converter = await RustHTMLTransformer.getInstance();
    return await converter.extractBaseHref(html, url);
}

export async function extractMetadata(
    html: string | null | undefined,
): Promise<any> {
    if (!html) {
        return [];
    }

    const converter = await RustHTMLTransformer.getInstance();
    return await converter.extractMetadata(html);
}

export async function transformHtml(
  opts: TransformHtmlOptions,
): Promise<string> {
  const converter = await RustHTMLTransformer.getInstance();
  return await converter.transformHtml(opts);
}

export async function getInnerJSON(
  html: string,
): Promise<string> {
  const converter = await RustHTMLTransformer.getInstance();
  return await converter.getInnerJSON(html);
}

export async function parseMarkdownRust(
  html: string | null | undefined,
): Promise<string> {
  if (!html) {
    return "";
  }

  try {
    const converter = await RustHTMLTransformer.getInstance();
    let markdownContent = await converter.htmlToMarkdown(html);

    markdownContent = processMultiLineLinks(markdownContent);
    markdownContent = removeSkipToContentLinks(markdownContent);
    // logger.info(`HTML to Markdown conversion using Go parser successful`);
    return markdownContent;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "Rust html-transformer shared library not found"
    ) {
      logger.error(
        `Error converting HTML to Markdown with Rust parser: ${error}`,
      );
    } else {
      logger.warn(
        "Tried to use Rust parser, but it doesn't exist in the file system.",
        { rustExecutablePath },
      );
    }
  }

  // Fallback to TurndownService if Rust parser fails or is not enabled
  var TurndownService = require("turndown");
  var turndownPluginGfm = require("joplin-turndown-plugin-gfm");

  const turndownService = new TurndownService();
  turndownService.addRule("inlineLink", {
    filter: function (node, options) {
      return (
        options.linkStyle === "inlined" &&
        node.nodeName === "A" &&
        node.getAttribute("href")
      );
    },
    replacement: function (content, node) {
      var href = node.getAttribute("href").trim();
      var title = node.title ? ' "' + node.title + '"' : "";
      return "[" + content.trim() + "](" + href + title + ")\n";
    },
  });
  var gfm = turndownPluginGfm.gfm;
  turndownService.use(gfm);

  try {
    let markdownContent = await turndownService.turndown(html);
    markdownContent = processMultiLineLinks(markdownContent);
    markdownContent = removeSkipToContentLinks(markdownContent);

    return markdownContent;
  } catch (error) {
    logger.error("Error converting HTML to Markdown", { error });
    return ""; // Optionally return an empty string or handle the error as needed
  }
}