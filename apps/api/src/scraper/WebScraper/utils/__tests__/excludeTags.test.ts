import { excludeNonMainTags } from "../excludeTags";
import * as cheerio from "cheerio";

describe("excludeNonMainTags", () => {
  it("removes script, style, and other non-essential tags", () => {
    const html = `
    <html>
      <body>
        <script>alert('hello');</script>
        <style>body { color: red; }</style>
        <article>Important content</article>
      </body>
    </html>
    `;
    const result = excludeNonMainTags(html);
    const $ = cheerio.load(result);

    expect($("script").length).toBe(0);
    expect($("style").length).toBe(0);
    expect($.text().trim()).toBe("Important content");
  });

  it("removes specified classes like ads and popups", () => {
    const html = `
    <html>
     <body>
        <div class="ad">Buy this!</div>
        <div class="popup">Subscribe to our newsletter!</div>
        <p>Useful content</p>
     </body>
    </html>
    `;
    const result = excludeNonMainTags(html);
    const $ = cheerio.load(result);

    expect($(".ad").length).toBe(0);
    expect($(".popup").length).toBe(0);
    expect($("p").text()).toBe("Useful content");
  });

  it("prioritizes main element over body when both are present", () => {
    const html = `
      <body>
        <main>
          <p>Main content</p>
        </main>
        <section>Section content</section>
      </body>
    `;
    const result = excludeNonMainTags(html);
    const $ = cheerio.load(result);

    expect($.text()).toContain("Main content");
    expect($("section").length).toBe(0); // section should be removed as non-main
  });

  it("uses body as a fallback when no main element is found", () => {
    const html = `
      <body>
        <div>Body content</div>
        <section>Section content</section>
      </body>
    `;
    const result = excludeNonMainTags(html);
    const $ = cheerio.load(result);

    expect($("body").text()).toContain("Body content");
    expect($("section").length).toBe(1);
  });

  it('filters out elements with attribute values containing "filter" except in allowed attributes', () => {
    const html = `
      <main>
        <a href="no-filter-here">Link without filter</a>
        <div data-info="some-filter-info">Filtered out</div>
      </main>
    `;
    const result = excludeNonMainTags(html);
    const $ = cheerio.load(result);

    expect($("a").length).toBe(1);
    expect($("div[data-info]").length).toBe(0);
  });
});
