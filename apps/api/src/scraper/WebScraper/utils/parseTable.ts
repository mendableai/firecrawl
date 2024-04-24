import cheerio, { CheerioAPI } from "cheerio";

interface Replacement {
  start: number;
  end: number;
  markdownTable: string;
}

export const parseTablesToMarkdown = async (html: string): Promise<string> => {
  const soup: CheerioAPI = cheerio.load(html, {
    xmlMode: true,
    withStartIndices: true,
    withEndIndices: true
  });
  let tables = soup("table");
  let replacements: Replacement[] = [];

  if (tables.length) {
    tables.each((_, tableElement) => {
      const start: number = tableElement.startIndex;
      const end: number = tableElement.endIndex + 1; // Include the closing tag properly
      let markdownTable: string = convertTableElementToMarkdown(cheerio.load(tableElement));
      const isTableEmpty: boolean = markdownTable.replace(/[|\- \n]/g, '').length === 0;
      if (isTableEmpty) {
        markdownTable = '';
      }
      replacements.push({ start, end, markdownTable });
    });
  }

  replacements.sort((a, b) => b.start - a.start);
  
  let modifiedHtml: string = html;
  replacements.forEach(({ start, end, markdownTable }) => {
    modifiedHtml = modifiedHtml.slice(0, start) + `<div>${markdownTable}</div>` + modifiedHtml.slice(end);
  });

  return modifiedHtml.trim();
};

export const convertTableElementToMarkdown = (tableSoup: CheerioAPI): string => {
  let rows: string[] = [];
  let headerRowFound: boolean = false;
  tableSoup("tr").each((i, tr) => {
    const cells: string = tableSoup(tr).find("th, td").map((_, cell) => {
      let cellText: string = tableSoup(cell).text().trim();
      if (tableSoup(cell).is("th") && !headerRowFound) {
        headerRowFound = true;
      }
      return ` ${cellText} |`;
    }).get().join("");
    if (cells) {
      rows.push(`|${cells}`);
    }
    if (headerRowFound && i === 0) { // Header row
      rows.push(createMarkdownDividerRow(tableSoup(tr).find("th, td").length));
    }
  });

  return rows.join('\n').trim();
};

export function convertTableRowElementToMarkdown(rowSoup: CheerioAPI, rowNumber: number): string {
  const cells: string = rowSoup("td, th").map((_, cell) => {
    let cellText: string = rowSoup(cell).text().trim();
    return ` ${cellText} |`;
  }).get().join("");

  return `|${cells}`;
};

export function createMarkdownDividerRow(cellCount: number): string {
  return '| ' + Array(cellCount).fill('---').join(' | ') + ' |';
}