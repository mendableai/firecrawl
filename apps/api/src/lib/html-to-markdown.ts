export function parseMarkdown(html: string, removeLinks: boolean = false) {
  var TurndownService = require('turndown');
  var turndownPluginGfm = require('joplin-turndown-plugin-gfm');

  const turndownService = new TurndownService();

  if (!removeLinks) {
    turndownService.addRule('inlineLink', {
      filter: function (node, options) {
        return (
          options.linkStyle === 'inlined' &&
          node.nodeName === 'A' &&
          node.getAttribute('href')
        );
      },
      replacement: function (content, node) {
        var href = node.getAttribute('href').trim();
        var title = node.title ? ' "' + node.title + '"' : '';
        return '[' + content.trim() + '](' + href + title + ')\n';
      },
    });
  } else {
    turndownService.addRule('inlineNoLink', {
      filter: function (node, options) {
        return (
          options.linkStyle === 'inlined' &&
          node.nodeName === 'A' &&
          node.getAttribute('href')
        );
      },
      replacement: function (content, node) {
        var title = node.title ? ' "' + node.title + '"' : '';
        return '[' + content.trim() + '](' + title + ')\n';
      },
    });

    // Rule to handle image tags and remove the src attribute
    turndownService.addRule('imageNoSrc', {
      filter: function (node) {
        return node.nodeName === 'IMG' && node.getAttribute('src');
      },
      replacement: function (content, node) {
        var alt = node.alt ? node.alt : '';
        var title = node.title ? ' "' + node.title + '"' : '';
        return alt ? `![${alt}]${title}\n` : '';
      },
    });
  }

  var gfm = turndownPluginGfm.gfm;
  turndownService.use(gfm);
  let markdownContent = turndownService.turndown(html);

  // multiple line links
  let insideLinkContent = false;
  let newMarkdownContent = '';
  let linkOpenCount = 0;
  for (let i = 0; i < markdownContent.length; i++) {
    const char = markdownContent[i];

    if (char == '[') {
      linkOpenCount++;
    } else if (char == ']') {
      linkOpenCount = Math.max(0, linkOpenCount - 1);
    }
    insideLinkContent = linkOpenCount > 0;

    if (insideLinkContent && char == '\n') {
      newMarkdownContent += '\\' + '\n';
    } else {
      newMarkdownContent += char;
    }
  }
  markdownContent = newMarkdownContent;

  // Remove [Skip to Content](#page) and [Skip to content](#skip)
  markdownContent = markdownContent.replace(
    /\[Skip to Content\]\(#[^\)]*\)/gi,
    ''
  );

  return markdownContent;
}
