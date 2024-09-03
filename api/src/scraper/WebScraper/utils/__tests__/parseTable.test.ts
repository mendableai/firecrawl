import { parseTablesToMarkdown, convertTableElementToMarkdown, convertTableRowElementToMarkdown, createMarkdownDividerRow } from '../parseTable';
import cheerio from 'cheerio';

describe('parseTablesToMarkdown', () => {
  it('converts a simple HTML table to Markdown', async () => {
    const html = `
      <table>
        <tr><th>Header 1</th><th>Header 2</th></tr>
        <tr><td>Row 1 Col 1</td><td>Row 1 Col 2</td></tr>
        <tr><td>Row 2 Col 1</td><td>Row 2 Col 2</td></tr>
      </table>
    `;
    const expectedMarkdown = `<div>| Header 1 | Header 2 |\n| --- | --- |\n| Row 1 Col 1 | Row 1 Col 2 |\n| Row 2 Col 1 | Row 2 Col 2 |</div>`;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

  it('converts a table with a single row to Markdown', async () => {
    const html = `
      <table>
        <tr><th>Header 1</th><th>Header 2</th></tr>
        <tr><td>Row 1 Col 1</td><td>Row 1 Col 2</td></tr>
      </table>
    `;
    const expectedMarkdown = `<div>| Header 1 | Header 2 |\n| --- | --- |\n| Row 1 Col 1 | Row 1 Col 2 |</div>`;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

  it('converts a table with a single column to Markdown', async () => {
    const html = `
      <table>
        <tr><th>Header 1</th></tr>
        <tr><td>Row 1 Col 1</td></tr>
        <tr><td>Row 2 Col 1</td></tr>
      </table>
    `;
    const expectedMarkdown = `<div>| Header 1 |\n| --- |\n| Row 1 Col 1 |\n| Row 2 Col 1 |</div>`;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

  it('converts a table with a single cell to Markdown', async () => {
    const html = `
      <table>
        <tr><th>Header 1</th></tr>
        <tr><td>Row 1 Col 1</td></tr>
      </table>
    `;
    const expectedMarkdown = `<div>| Header 1 |\n| --- |\n| Row 1 Col 1 |</div>`;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

  it('converts a table with no header to Markdown', async () => {
    const html = `
      <table>
        <tr><td>Row 1 Col 1</td><td>Row 1 Col 2</td></tr>
        <tr><td>Row 2 Col 1</td><td>Row 2 Col 2</td></tr>
      </table>
    `;
    const expectedMarkdown = `<div>| Row 1 Col 1 | Row 1 Col 2 |\n| Row 2 Col 1 | Row 2 Col 2 |</div>`;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

  it('converts a table with no rows to Markdown', async () => {
    const html = `
      <table>
      </table>
    `;
    const expectedMarkdown = `<div></div>`;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

  it('converts a table with no cells to Markdown', async () => {
    const html = `
      <table>
        <tr></tr>
      </table>
    `;
    const expectedMarkdown = `<div></div>`;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

  it('converts a table with no columns to Markdown', async () => {
    const html = `
      <table>
        <tr><th></th></tr>
      </table>
    `;
    const expectedMarkdown = `<div></div>`;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

  it('converts a table with no table to Markdown', async () => {
    const html = ``;
    const expectedMarkdown = ``;
    const markdown = await parseTablesToMarkdown(html);
    expect(markdown).toBe(expectedMarkdown);
  });

it('converts a table inside of a bunch of html noise', async () => {
  const html = `
    <div>
      <p>Some text before</p>
      <table>
        <tr><td>Row 1 Col 1</td><td>Row 1 Col 2</td></tr>
        <tr><td>Row 2 Col 1</td><td>Row 2 Col 2</td></tr>
      </table>
      <p>Some text after</p>
    </div>
  `;
  const expectedMarkdown = `<div>
      <p>Some text before</p>
      <div>| Row 1 Col 1 | Row 1 Col 2 |
| Row 2 Col 1 | Row 2 Col 2 |</div>
      <p>Some text after</p>
    </div>`;
    
  const markdown = await parseTablesToMarkdown(html);
  expect(markdown).toBe(expectedMarkdown);
});

});
