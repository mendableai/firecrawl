import { CheerioAPI } from "cheerio";
import { Logger } from "../../../lib/logger";

interface Metadata {
  title?: string;
  description?: string;
  language?: string;
  keywords?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  ogAudio?: string;
  ogDeterminer?: string;
  ogLocale?: string;
  ogLocaleAlternate?: string[];
  ogSiteName?: string;
  ogVideo?: string;
  dctermsCreated?: string;
  dcDateCreated?: string;
  dcDate?: string;
  dctermsType?: string;
  dcType?: string;
  dctermsAudience?: string;
  dctermsSubject?: string;
  dcSubject?: string;
  dcDescription?: string;
  dctermsKeywords?: string;
  modifiedTime?: string;
  publishedTime?: string;
  articleTag?: string;
  articleSection?: string;
  sourceURL?: string;
  pageStatusCode?: number;
  pageError?: string;
}

export function extractMetadata(soup: CheerioAPI, url: string): Metadata {
  let title: string | null = null;
  let description: string | null = null;
  let language: string | null = null;
  let keywords: string | null = null;
  let robots: string | null = null;
  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let ogUrl: string | null = null;
  let ogImage: string | null = null;
  let ogAudio: string | null = null;
  let ogDeterminer: string | null = null;
  let ogLocale: string | null = null;
  let ogLocaleAlternate: string[] | null = null;
  let ogSiteName: string | null = null;
  let ogVideo: string | null = null;
  let dctermsCreated: string | null = null;
  let dcDateCreated: string | null = null;
  let dcDate: string | null = null;
  let dctermsType: string | null = null;
  let dcType: string | null = null;
  let dctermsAudience: string | null = null;
  let dctermsSubject: string | null = null;
  let dcSubject: string | null = null;
  let dcDescription: string | null = null;
  let dctermsKeywords: string | null = null;
  let modifiedTime: string | null = null;
  let publishedTime: string | null = null;
  let articleTag: string | null = null;
  let articleSection: string | null = null;
  let sourceURL: string | null = null;
  let pageStatusCode: number | null = null;
  let pageError: string | null = null;

  try {
    title = soup("title").text() || null;
    description = soup('meta[name="description"]').attr("content") || null;
    
    // Assuming the language is part of the URL as per the regex pattern
    const pattern = /([a-zA-Z]+-[A-Z]{2})/;
    const match = pattern.exec(url);
    language = match ? match[1] : null;

    keywords = soup('meta[name="keywords"]').attr("content") || null;
    robots = soup('meta[name="robots"]').attr("content") || null;
    ogTitle = soup('meta[property="og:title"]').attr("content") || null;
    ogDescription = soup('meta[property="og:description"]').attr("content") || null;
    ogUrl = soup('meta[property="og:url"]').attr("content") || null;
    ogImage = soup('meta[property="og:image"]').attr("content") || null;
    ogAudio = soup('meta[property="og:audio"]').attr("content") || null;
    ogDeterminer = soup('meta[property="og:determiner"]').attr("content") || null;
    ogLocale = soup('meta[property="og:locale"]').attr("content") || null;
    ogLocaleAlternate = soup('meta[property="og:locale:alternate"]').map((i, el) => soup(el).attr("content")).get() || null;
    ogSiteName = soup('meta[property="og:site_name"]').attr("content") || null;
    ogVideo = soup('meta[property="og:video"]').attr("content") || null;
    articleSection = soup('meta[name="article:section"]').attr("content") || null;
    articleTag = soup('meta[name="article:tag"]').attr("content") || null;
    publishedTime = soup('meta[property="article:published_time"]').attr("content") || null;
    modifiedTime = soup('meta[property="article:modified_time"]').attr("content") || null;
    dctermsKeywords = soup('meta[name="dcterms.keywords"]').attr("content") || null;
    dcDescription = soup('meta[name="dc.description"]').attr("content") || null;
    dcSubject = soup('meta[name="dc.subject"]').attr("content") || null;
    dctermsSubject = soup('meta[name="dcterms.subject"]').attr("content") || null;
    dctermsAudience = soup('meta[name="dcterms.audience"]').attr("content") || null;
    dcType = soup('meta[name="dc.type"]').attr("content") || null;
    dctermsType = soup('meta[name="dcterms.type"]').attr("content") || null;
    dcDate = soup('meta[name="dc.date"]').attr("content") || null;
    dcDateCreated = soup('meta[name="dc.date.created"]').attr("content") || null;
    dctermsCreated = soup('meta[name="dcterms.created"]').attr("content") || null;

  } catch (error) {
    Logger.error(`Error extracting metadata: ${error}`);
  }

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(language ? { language } : {}),
    ...(keywords ? { keywords } : {}),
    ...(robots ? { robots } : {}),
    ...(ogTitle ? { ogTitle } : {}),
    ...(ogDescription ? { ogDescription } : {}),
    ...(ogUrl ? { ogUrl } : {}),
    ...(ogImage ? { ogImage } : {}),
    ...(ogAudio ? { ogAudio } : {}),
    ...(ogDeterminer ? { ogDeterminer } : {}),
    ...(ogLocale ? { ogLocale } : {}),
    ...(ogLocaleAlternate ? { ogLocaleAlternate } : {}),
    ...(ogSiteName ? { ogSiteName } : {}),
    ...(ogVideo ? { ogVideo } : {}),
    ...(dctermsCreated ? { dctermsCreated } : {}),
    ...(dcDateCreated ? { dcDateCreated } : {}),
    ...(dcDate ? { dcDate } : {}),
    ...(dctermsType ? { dctermsType } : {}),
    ...(dcType ? { dcType } : {}),
    ...(dctermsAudience ? { dctermsAudience } : {}),
    ...(dctermsSubject ? { dctermsSubject } : {}),
    ...(dcSubject ? { dcSubject } : {}),
    ...(dcDescription ? { dcDescription } : {}),
    ...(dctermsKeywords ? { dctermsKeywords } : {}),
    ...(modifiedTime ? { modifiedTime } : {}),
    ...(publishedTime ? { publishedTime } : {}),
    ...(articleTag ? { articleTag } : {}),
    ...(articleSection ? { articleSection } : {}),
    ...(sourceURL ? { sourceURL } : {}),
    ...(pageStatusCode ? { pageStatusCode } : {}),
    ...(pageError ? { pageError } : {}),
  };
}
