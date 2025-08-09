import test from 'ava'
import { extractMetadata } from '../index'

test("should extract comprehensive metadata from HTML content", t => {
    const html = `
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="Detailed page description">
          <meta name="keywords" content="test,page,keywords">
          <meta name="author" content="Test Author">
          <meta property="og:title" content="OpenGraph Title">
          <meta property="og:description" content="OpenGraph Description">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta name="twitter:card" content="summary">
          <meta name="twitter:title" content="Twitter Title">
          <link rel="canonical" href="https://example.com/canonical">
        </head>
        <body></body>
      </html>
    `;
    const metadata = extractMetadata(html);
    t.truthy(metadata.title);
    t.truthy(metadata.description);
    t.truthy(metadata.keywords);
    t.truthy(metadata.author);
    t.truthy(metadata["og:title"]);
    t.truthy(metadata["og:description"]);
    t.truthy(metadata["og:image"]);
    t.truthy(metadata["twitter:card"]);
    t.truthy(metadata["twitter:title"]);
});

test("should handle metadata with special characters and encoding", t => {
    const html = `
      <html>
        <head>
          <title>Test &amp; Page with ©️ symbols</title>
          <meta name="description" content="Description with &quot;quotes&quot; and émojis 🎉">
          <meta property="og:title" content="Title with < and > symbols">
        </head>
        <body></body>
      </html>
    `;
    const metadata = extractMetadata(html);
    t.is(metadata.title, "Test & Page with ©️ symbols");
    t.is(metadata.description, "Description with \"quotes\" and émojis 🎉");
    t.is(metadata["og:title"], "Title with < and > symbols");
});

test("should handle missing or malformed metadata gracefully", t => {
    const html = `
      <html>
        <head>
          <meta name="description" content="">
          <meta property="og:title">
          <meta name="keywords" content="  ">
        </head>
        <body></body>
      </html>
    `;
    const metadata = extractMetadata(html);
    t.truthy(metadata);
});