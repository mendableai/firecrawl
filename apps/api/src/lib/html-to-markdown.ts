import { Logger } from "./logger";
import { JSDOM } from "jsdom";

export function parseMarkdown(html: string) {
  var TurndownService = require("turndown");
  var turndownPluginGfm = require('joplin-turndown-plugin-gfm')

  // Preprocess HTML to remove large tables that bugs the turndown service
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Remove large tables
  const tables = document.querySelectorAll('table');
  tables.forEach(table => {
    if (table.rows.length > 30000) {
      Logger.error(`Table with ${table.rows.length} rows found, skipping page...`);
      throw new Error("Not able to parse this page.");
    }
  });

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
  let markdownContent = turndownService.turndown(html);

  // multiple line links
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
  markdownContent = newMarkdownContent;

  // Remove [Skip to Content](#page) and [Skip to content](#skip)
  markdownContent = markdownContent.replace(
    /\[Skip to Content\]\(#[^\)]*\)/gi,
    ""
  );
  return markdownContent;
}
