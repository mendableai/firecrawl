
export async function parseMarkdown(html: string) {
  var TurndownService = require("turndown");
  var turndownPluginGfm = require('joplin-turndown-plugin-gfm')


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
  let markdownContent = "";
  const turndownPromise = new Promise<string>((resolve, reject) => {
    try {
      const result = turndownService.turndown(html);
      resolve(result);
    } catch (error) {
      reject("Error converting HTML to Markdown: " + error);
    }
  });

  const timeoutPromise = new Promise<string>((resolve, reject) => {
    const timeout = 5000; // Timeout in milliseconds
    setTimeout(() => reject("Conversion timed out after " + timeout + "ms"), timeout);
  });

  try {
    markdownContent = await Promise.race([turndownPromise, timeoutPromise]);
  } catch (error) {
    console.error(error);
    return ""; // Optionally return an empty string or handle the error as needed
  }

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
