import { parseMarkdown } from '../html-to-markdown';

describe('parseMarkdown', () => {
  it('should correctly convert simple HTML to Markdown', async () => {
    const html = '<p>Hello, world!</p>';
    const expectedMarkdown = 'Hello, world!';
    await expect(parseMarkdown(html)).resolves.toBe(expectedMarkdown);
  });

  it('should convert complex HTML with nested elements to Markdown', async () => {
    const html = '<div><p>Hello <strong>bold</strong> world!</p><ul><li>List item</li></ul></div>';
    const expectedMarkdown = 'Hello **bold** world!\n\n- List item';
    await expect(parseMarkdown(html)).resolves.toBe(expectedMarkdown);
  });

  it('should return empty string when input is empty', async () => {
    const html = '';
    const expectedMarkdown = '';
    await expect(parseMarkdown(html)).resolves.toBe(expectedMarkdown);
  });

  it('should handle null input gracefully', async () => {
    const html = null;
    const expectedMarkdown = '';
    await expect(parseMarkdown(html)).resolves.toBe(expectedMarkdown);
  });

  
});
