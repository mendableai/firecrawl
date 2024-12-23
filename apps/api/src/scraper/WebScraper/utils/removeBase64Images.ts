export const removeBase64Images = async (markdown: string) => {
  const regex = /(!\[.*?\])\(data:image\/.*?;base64,.*?\)/g;
  markdown = markdown.replace(regex, "$1(<Base64-Image-Removed>)");
  return markdown;
};
