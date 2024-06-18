import { removeUnwantedElements } from "../removeUnwantedElements";
import { PageOptions } from "../../../../lib/entities";

describe('removeUnwantedElements', () => {
  it('should remove script, style, iframe, noscript, meta, and head tags', () => {
    const html = `<html><head><title>Test</title></head><body><script>alert('test');</script><div>Content</div></body></html>`;
    const options: PageOptions = {};
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<head>');
    expect(result).toContain('Content');
  });

  it('should remove specified tags passed as string', () => {
    const html = `<div><span>Remove</span><p>Keep</p></div>`;
    const options: PageOptions = { removeTags: 'span' };
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('<span>');
    expect(result).toContain('<p>Keep</p>');
  });

  it('should remove specified tags passed as array', () => {
    const html = `<div><span>Remove</span><p>Remove</p><a>Keep</a></div>`;
    const options: PageOptions = { removeTags: ['span', 'p'] };
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('<span>');
    expect(result).not.toContain('<p>');
    expect(result).toContain('<a>Keep</a>');
  });

  it('should handle class selectors', () => {
    const html = `<div class="test">Remove</div><div class="keep">Keep</div>`;
    const options: PageOptions = { removeTags: '.test' };
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('class="test"');
    expect(result).toContain('class="keep"');
  });

  it('should handle id selectors', () => {
    const html = `<div id="test">Remove</div><div id="keep">Keep</div>`;
    const options: PageOptions = { removeTags: '#test' };
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('id="test"');
    expect(result).toContain('id="keep"');
  });

  it('should handle regex patterns in class names', () => {
    const html = `<div class="test-123">Remove</div><div class="test-abc">Remove</div><div class="keep">Keep</div>`;
    const options: PageOptions = { removeTags: ['*test*'] };
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('class="test-123"');
    expect(result).not.toContain('class="test-abc"');
    expect(result).toContain('class="keep"');
  });

  it('should remove non-main content if onlyMainContent is true', () => {
    const html = `<div><main>Main Content</main><aside>Remove</aside></div>`;
    const options: PageOptions = { onlyMainContent: true };
    const result = removeUnwantedElements(html, options);
    expect(result).toContain('Main Content');
    expect(result).not.toContain('<aside>');
  });

  it('should handle complex regex patterns for class names', () => {
    const html = `<div class="test-123">Remove</div><div class="test-abc">Remove</div><div class="keep">Keep</div><div class="test-xyz">Remove</div>`;
    const options: PageOptions = { removeTags: ['*.test-[a-z]+*'] };
    const result = removeUnwantedElements(html, options);
    expect(result).toContain('class="test-123"');
    expect(result).not.toContain('class="test-abc"');
    expect(result).not.toContain('class="test-xyz"');
    expect(result).toContain('class="keep"');
  });

  it('should handle complex regex patterns for attributes', () => {
    const html = `<div data-info="12345">Remove</div><div data-info="abcde">Keep</div><div data-info="67890">Remove</div>`;
    const options: PageOptions = { removeTags: ['*data-info="\\d+"*'] }; // Matches data-info that starts with digits
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('data-info="12345"');
    expect(result).not.toContain('data-info="67890"');
    expect(result).toContain('data-info="abcde"');
  });

  it('should handle mixed selectors with regex', () => {
    const html = `<div class="remove-this">Remove</div><div id="remove-this">Remove</div><div class="keep-this">Keep</div>`;
    const options: PageOptions = { removeTags: ['.remove-this', '#remove-this'] };
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('class="remove-this"');
    expect(result).not.toContain('id="remove-this"');
    expect(result).toContain('class="keep-this"');
  });

  it('should handle multiple regex patterns', () => {
    const html = `<div attr="test-123">Remove</div><div class="class-remove">Remove</div><div class="keep">Keep</div><div class="remove-this">Remove</div><div id="remove-this">Remove</div>`;
    const options: PageOptions = { removeTags: ['*test*', '.class-remove', '*.remove-[a-z]+*', '#remove-this'] };
    const result = removeUnwantedElements(html, options);
    expect(result).not.toContain('class="test-123"');
    expect(result).not.toContain('class="test-abc"');
    expect(result).not.toContain('class="remove"');
    expect(result).not.toContain('class="remove-this"');
    expect(result).not.toContain('id="remove-this"');
    expect(result).toContain('class="keep"');
  });
});
