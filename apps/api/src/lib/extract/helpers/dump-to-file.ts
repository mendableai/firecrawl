import * as fs from "fs";
import * as path from "path";

/**
 * Helper function to dump data to a file for debugging/logging purposes
 * @param filename The name of the file to write to (will be created in __dirname)
 * @param data The data to write to the file
 * @param formatter Optional function to format each item in the data array
 */
export function dumpToFile<T>(
  filename: string,
  data: T[],
  formatter?: (item: T, index: number) => string,
) {
  const filePath = path.join(__dirname, filename);

  let fileContent: string;
  if (formatter) {
    fileContent = data.map((item, index) => formatter(item, index)).join("\n");
  } else {
    fileContent = data
      .map((item, index) => `${index + 1}. ${JSON.stringify(item)}`)
      .join("\n");
  }

  fs.writeFileSync(filePath, fileContent, "utf8");
  console.log(`Dumped data to ${filename}`);
}
