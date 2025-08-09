import test from 'ava'
import { transformHtml } from '../index'

test("should transform HTML content according to options", t => {
    const options = {
        html: "<div><p>Test</p><span>Remove me</span></div>",
        url: "https://example.com",
        includeTags: ["p"],
        excludeTags: ["span"],
        onlyMainContent: true,
    };

    const result = transformHtml(options);
    t.true(result.includes("<p>"));
    t.false(result.includes("<span>"));
});

test("should handle complex content filtering", t => {
    const options = {
        html: `
        <div class="wrapper">
          <header>
            <nav>Navigation</nav>
          </header>
          <main>
            <article>
              <h1>Title</h1>
              <p>Important content</p>
              <div class="ads">Advertisement</div>
              <aside>Sidebar</aside>
              <div class="social-share">Share buttons</div>
            </article>
          </main>
          <footer>Footer content</footer>
        </div>
      `,
        url: "https://example.com",
        includeTags: ["article", "h1", "p"],
        excludeTags: ["nav", "aside", "footer", ".ads", ".social-share"],
        onlyMainContent: true,
    };

    const result = transformHtml(options);
    t.true(result.includes("<h1>Title</h1>"));
    t.true(result.includes("<p>Important content</p>"));
    t.false(result.includes("Navigation"));
    t.false(result.includes("Advertisement"));
    t.false(result.includes("Share buttons"));
    t.false(result.includes("Footer content"));
});

test("should handle nested content preservation and absolute links", t => {
    const options = {
        html: `
        <article>
          <div class="content">
            <h2>Section</h2>
            <p>Text with <strong>bold</strong> and <em>emphasis</em></p>
            <ul>
              <li>Item 1</li>
              <li>Item 2 <a href="#">with link</a></li>
            </ul>
          </div>
        </article>
      `,
        url: "https://example.com",
        includeTags: ["article", "p", "ul", "li"],
        excludeTags: [],
        onlyMainContent: true,
    };

    const result = transformHtml(options);
    t.true(result.includes("<strong>bold</strong>"));
    t.true(result.includes("<em>emphasis</em>"));
    t.true(result.includes('<a href="https://example.com/#">'));
});

test("should handle empty HTML content", t => {
    const options = {
        html: "",
        url: "https://example.com",
        includeTags: [],
        excludeTags: [],
        onlyMainContent: false,
    };

    const result = transformHtml(options);
    t.is(result, "<html><body></body></html>");
});

test("should handle malformed HTML", t => {
    const options = {
        html: "<div>Unclosed div",
        url: "https://example.com",
        includeTags: [],
        excludeTags: [],
        onlyMainContent: false,
    };

    const result = transformHtml(options);
    t.is(result, "<html><body><div>Unclosed div</div></body></html>");
});

test("should handle HTML with comments and scripts", t => {
    const options = {
        html: `
        <div>
          <!-- Comment -->
          <script>alert('test');</script>
          <p>Real content</p>
          <style>.test { color: red; }</style>
          <noscript>Enable JavaScript</noscript>
        </div>
      `,
        url: "https://example.com",
        includeTags: ["p"],
        excludeTags: ["script", "style", "noscript"],
        onlyMainContent: true,
    };

    const result = transformHtml(options);
    t.true(result.includes("<p>Real content</p>"));
    t.false(result.includes("alert"));
    t.false(result.includes("color: red"));
    t.false(result.includes("Enable JavaScript"));
});

test("should handle special characters and encoding", t => {
    const options = {
        html: `
        <div>
          <p>&copy; 2024</p>
          <p>&lt;tag&gt;</p>
          <p>Special chars: á é í ó ú ñ</p>
          <p>Emojis: 🎉 👍 🚀</p>
        </div>
      `,
        url: "https://example.com",
        includeTags: ["p"],
        excludeTags: [],
        onlyMainContent: true,
    };

    const result = transformHtml(options);
    t.true(result.includes("©"));
    t.true(result.includes("á é í ó ú ñ"));
    t.true(result.includes("🎉 👍 🚀"));
});

test("should make all URLs absolute", t => {
    const options = {
        html: `
        <div>
          <a href="https://example.com/fullurl">hi</a>
          <a href="http://example.net/fullurl">hi</a>
          <a href="/pathurl">hi</a>
          <a href="//example.net/proturl">hi</a>
          <a href="?queryurl">hi</a>
          <a href="#hashurl">hi</a>
          <img src="#q1">
          <img src="#q2">
        </div>
      `,
        url: "https://example.com",
        includeTags: [],
        excludeTags: [],
        onlyMainContent: true,
    };

    const result = transformHtml(options);
    t.true(result.includes("https://example.com/fullurl"));
    t.true(result.includes("http://example.net/fullurl"));
    t.true(result.includes("https://example.com/pathurl"));
    t.true(result.includes("https://example.net/proturl"));
    t.true(result.includes("https://example.com/?queryurl"));
    t.true(result.includes("https://example.com/#hashurl"));
    t.true(result.includes("https://example.com/#q1"));
    t.true(result.includes("https://example.com/#q2"));
});