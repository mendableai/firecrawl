import cheerio from "cheerio";

export const parseTablesToMarkdown = async (html: string) => {
  let soup = cheerio.load(html, {
    xmlMode: true,
    withStartIndices: true,
    withEndIndices: true
  });
  let tables = soup("table");
  let replacements = [];


  if (tables.length) {
    for (const table of Array.from(tables)) {
      const start = table.startIndex;
      const end = table.endIndex;
      const markdownTable = await convertTableElementToMarkdown(cheerio.load(table));
      replacements.push({ start, end, markdownTable });
    };
  }

  replacements.sort((a, b) => b.start - a.start);
  
  let modifiedHtml = html;
  for (const { start, end, markdownTable } of replacements) {
    modifiedHtml = modifiedHtml.slice(0, start) + `<div>${markdownTable}</div>` + modifiedHtml.slice(end);
  }

  return modifiedHtml;
}

const convertTableElementToMarkdown = async (tableSoup) => {
  const rows = [];
  const trEls = tableSoup("tr");

  trEls.each((i, tr) => {
    const markdownRow = convertTableRowElementToMarkdown(cheerio.load(tr), i);
    rows.push(markdownRow);
  });

  return rows.join('\n');
}

function convertTableRowElementToMarkdown(rowSoup, rowNumber) {
  const cells = [];
  const cellEls = rowSoup("td, th");

  cellEls.each((i, cell) => {
    let cellText = cheerio.load(cell).text();
    cellText = cellText.replace(/\n/g, " ").trim();
    cells.push(cellText + ' |');
  });

  let row = '| ' + cells.join(" ");

  if (rowNumber === 0) {
    row += '\n' + createMarkdownDividerRow(cellEls.length);
  }

  return row;
}

function createMarkdownDividerRow(cellCount) {
  const dividerCells = Array(cellCount).fill('--- |');
  return '| ' + dividerCells.join(" ");
}