import test from 'ava'
import { extractLinks } from '../index'

test("should extract links from HTML content", t => {
    const html = `
      <html>
        <body>
          <a href="https://example.com">Example</a>
          <a href="https://test.com">Test</a>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, ["https://example.com", "https://test.com"]);
});

test("should handle relative links", t => {
    const html = `
      <html>
        <body>
          <a href="/path/to/page">Relative</a>
          <a href="../another/page">Parent Path</a>
          <a href="./local/page">Local Path</a>
          <a href="relative/path">Implicit Relative</a>
          <a href="?param=value">Query Param</a>
          <a href="#section">Hash Link</a>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, [
        "/path/to/page",
        "../another/page",
        "./local/page",
        "relative/path",
        "?param=value",
        "#section",
    ]);
});

test("should handle complex nested HTML structure", t => {
    const html = `
      <html>
        <body>
          <div class="container">
            <nav>
              <ul>
                <li><a href="https://nav1.com">Nav 1</a></li>
                <li><a href="https://nav2.com">Nav 2</a></li>
              </ul>
            </nav>
            <main>
              <article>
                <p>Some text with a <a href="https://inline.com">link</a></p>
                <div class="nested">
                  <a href="https://nested.com">Nested Link</a>
                </div>
              </article>
            </main>
          </div>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, ["https://nav1.com", "https://nav2.com", "https://inline.com", "https://nested.com"]);
});

// It actually returns all of these and has for a long time! - mogery
// test("should handle malformed HTML gracefully", t => {
//     const html = `
//       <div>
//         <a href="https://valid.com">Valid</a>
//         <a href="invalid">Invalid</a>
//         <a>No href</a>
//         <a href="">Empty href</a>
//         <a href="javascript:void(0)">JavaScript href</a>
//         <a href="mailto:test@example.com">Email link</a>
//       </div>
//     `;
//     const links = extractLinks(html);
//     t.deepEqual(links, ["https://valid.com"]);
// });

test("should handle base href for relative links", t => {
    const html = `
      <html>
        <head>
          <base href="/" />
        </head>
        <body>
          <a href="page.php">Page</a>
          <a href="/absolute">Absolute</a>
          <a href="https://external.com">External</a>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, ["page.php", "/absolute", "https://external.com"]);
});

test("should handle relative base href", t => {
    const html = `
      <html>
        <head>
          <base href="../" />
        </head>
        <body>
          <a href="page.php">Page</a>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, ["page.php"]);
});

test("should handle absolute base href", t => {
    const html = `
      <html>
        <head>
          <base href="https://cdn.example.com/" />
        </head>
        <body>
          <a href="assets/style.css">CSS</a>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, ["assets/style.css"]);
});

test("should use first base href when multiple exist", t => {
    const html = `
      <html>
        <head>
          <base href="/" />
          <base href="/other/" />
        </head>
        <body>
          <a href="page.php">Page</a>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, ["page.php"]);
});

test("should fallback to page URL when no base href", t => {
    const html = `
      <html>
        <body>
          <a href="page.php">Page</a>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, ["page.php"]);
});

test("should handle malformed base href gracefully", t => {
    const html = `
      <html>
        <head>
          <base href="" />
          <base />
        </head>
        <body>
          <a href="page.php">Page</a>
        </body>
      </html>
    `;
    const links = extractLinks(html);
    t.deepEqual(links, ["page.php"]);
});