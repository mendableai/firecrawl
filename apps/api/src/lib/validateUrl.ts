
const protocolIncluded = (url: string) => {
  // if :// not in the start of the url assume http (maybe https?)
  // regex checks if :// appears before any .
  return(/^([^.:]+:\/\/)/.test(url));
}

const getURLobj = (s: string) => {
  // URL fails if we dont include the protocol ie google.com
  let error = false;
  let urlObj = {};
  try {
    urlObj = new URL(s);
  } catch (err) {
    error = true;
  }
  return { error, urlObj };
};

export const checkAndUpdateURL = (url: string) => {

  if (!protocolIncluded(url)) {
    url = `http://${url}`;
  }

  const { error, urlObj } = getURLobj(url);
  if (error) {
    throw new Error("Invalid URL");
  }

  const typedUrlObj = urlObj as URL;

  if(typedUrlObj.protocol !== "http:" && typedUrlObj.protocol !== "https:") {
    throw new Error("Invalid URL");
  }

  return { urlObj: typedUrlObj, url: url };
}
