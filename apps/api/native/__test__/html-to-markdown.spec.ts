import test from 'ava'
import { htmlToMarkdown } from '../index'

test("should correctly convert simple HTML to Markdown", t => {
  const html = "<p>Hello, world!</p>";
  const expectedMarkdown = "Hello, world!";
  t.is(htmlToMarkdown(html), expectedMarkdown);
});

test("should convert complex HTML with nested elements to Markdown", t => {
  const html =
    "<div><p>Hello <strong>bold</strong> world!</p><ul><li>List item</li></ul></div>";
  const expectedMarkdown = "Hello **bold** world!\n\n- List item";
  t.is(htmlToMarkdown(html), expectedMarkdown);
});

test("should return empty string when input is empty", t => {
  const html = "";
  const expectedMarkdown = "";
  t.is(htmlToMarkdown(html), expectedMarkdown);
});

test("should handle various types of invalid HTML gracefully", t => {
  const invalidHtmls = [
    { html: "<html><p>Unclosed tag", expected: "Unclosed tag" },
    {
      html: "<div><span>Missing closing div",
      expected: "Missing closing div",
    },
    {
      html: "<p><strong>Wrong nesting</em></strong></p>",
      expected: "**Wrong nesting**",
    },
    {
      html: '<a href="http://example.com">Link without closing tag',
      expected: "[Link without closing tag](http://example.com)",
    },
  ];

  for (const { html, expected } of invalidHtmls) {
    t.is(htmlToMarkdown(html), expected);
  }
});
