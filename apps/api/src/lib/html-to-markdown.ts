
import { spawn } from 'node:child_process';
import { join } from 'node:path';

export async function parseMarkdown(html: string): Promise<string> {
  if (!html) {
    return '';
  }

  if (process.env.USE_GO_MARKDOWN_PARSER == "true") {
    const goScriptPath = join(__dirname, 'go-html-to-md/html-to-markdown.go');
    const goModDir = join(__dirname, 'go-html-to-md');
    const child = spawn('go', ['run', goScriptPath, '--html', html], {
      cwd: goModDir,
    });

    return new Promise((resolve, reject) => {
      let data = '';

      child.stdout.on('data', (chunk) => {
        data += chunk.toString(); // Convert Buffer to string
      });

      child.stderr.on('data', (chunk) => {
        reject(chunk.toString()); // Convert Buffer to string before rejecting
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(data.trim());
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  } else {
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
}
