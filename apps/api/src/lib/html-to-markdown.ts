
import koffi from 'koffi';
import { join } from 'path';
import "../services/sentry"
import * as Sentry from "@sentry/node";

import dotenv from 'dotenv';
import { Logger } from './logger';
dotenv.config();

export async function parseMarkdown(html: string): Promise<string> {
  if (!html) {
    return '';
  }

  try {
    if (process.env.USE_GO_MARKDOWN_PARSER == "true") {
      const goExecutablePath = join(__dirname, 'go-html-to-md/html-to-markdown.so');
      const lib = koffi.load(goExecutablePath);
    
      const convert = lib.func('Convert', 'string', ['string']);

      let markdownContent = await new Promise<string>((resolve, reject) => {
        convert.async(html, (err: Error, res: string) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      });

      markdownContent = processMultiLineLinks(markdownContent);
      markdownContent = removeSkipToContentLinks(markdownContent);
      Logger.info(`HTML to Markdown conversion using Go parser successful`);
      return markdownContent;
    }
  } catch (error) {
    Sentry.captureException(error);
    Logger.error(`Error converting HTML to Markdown with Go parser: ${error}`);
  }

  // Fallback to TurndownService if Go parser fails or is not enabled
  var TurndownService = require("turndown");
  var turndownPluginGfm = require('joplin-turndown-plugin-gfm');

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
    console.error("Error converting HTML to Markdown: ", error);
    return ""; // Optionally return an empty string or handle the error as needed
  }
}

function processMultiLineLinks(markdownContent: string): string {
  let insideLinkContent = false;
  let newMarkdownContent = "";
  let linkOpenCount = 0;
  for (let i = 0; i < markdownContent.length; i++) {
    const char = markdownContent[i];

    if (char == "[") {
      linkOpenCount++;
    } else if (char == "]") {
      linkOpenCount = Math.max(0, linkOpenCount - 1);
    }
    insideLinkContent = linkOpenCount > 0;

    if (insideLinkContent && char == "\n") {
      newMarkdownContent += "\\" + "\n";
    } else {
      newMarkdownContent += char;
    }
  }
  return newMarkdownContent;
}

function removeSkipToContentLinks(markdownContent: string): string {
  // Remove [Skip to Content](#page) and [Skip to content](#skip)
  const newMarkdownContent = markdownContent.replace(
    /\[Skip to Content\]\(#[^\)]*\)/gi,
    ""
  );
  return newMarkdownContent;
}