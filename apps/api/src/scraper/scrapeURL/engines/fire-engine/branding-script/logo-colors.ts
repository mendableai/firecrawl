import { getComputedStyleCached, recordError } from "./helpers";

export interface LogoColor {
  /** #RRGGBB */
  color: string;
  /** Share of the logo's painted area, 0–1. */
  share: number;
}

const MAX_COLORS = 4;
const MIN_SHARE = 0.03;
const SAMPLE_PX = 64;

const toHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map(v => Math.round(v).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

/** rgb()/rgba() as the browser computes paint, or null if not a solid color. */
const parsePaint = (paint: string): [number, number, number] | null => {
  const m = paint.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return null;
  const parts = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(parseFloat);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
  if (parts.length >= 4 && parts[3] < 0.5) return null;
  return [parts[0], parts[1], parts[2]];
};

const rgbOf = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// Shades closer than this count as one color: anti-aliased edges and
// gradients split a logo's color into many near-identical ones.
const SAME_COLOR = 40;

const ranked = (weights: Map<string, number>): LogoColor[] => {
  const total = [...weights.values()].reduce((s, w) => s + w, 0);
  if (total <= 0) return [];
  const merged: Array<{ color: string; rgb: number[]; weight: number }> = [];
  [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([color, weight]) => {
      const rgb = rgbOf(color);
      const same = merged.find(
        m =>
          Math.hypot(m.rgb[0] - rgb[0], m.rgb[1] - rgb[1], m.rgb[2] - rgb[2]) <
          SAME_COLOR,
      );
      if (same) same.weight += weight;
      else merged.push({ color, rgb, weight });
    });
  return merged
    .map(({ color, weight }) => ({
      color,
      share: Math.round((weight / total) * 100) / 100,
    }))
    .filter(c => c.share >= MIN_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_COLORS);
};

// Definitions, clip paths and masks shape the logo but aren't painted. Tag
// names compared in lowercase: selectors match camel-case SVG names unevenly.
const UNPAINTED = new Set([
  "defs",
  "clippath",
  "mask",
  "symbol",
  "pattern",
  "marker",
]);

const isUnpainted = (shape: Element, svg: Element): boolean => {
  for (let n = shape.parentElement; n && n !== svg; n = n.parentElement) {
    if (UNPAINTED.has(n.localName.toLowerCase())) return true;
  }
  return false;
};

/** Fill and stroke colors of an inline SVG's shapes, weighted by their area. */
const svgColors = (svg: SVGSVGElement): LogoColor[] => {
  const weights = new Map<string, number>();
  const shapes = svg.querySelectorAll(
    "path, rect, circle, ellipse, polygon, polyline, line, text, use",
  );
  shapes.forEach(shape => {
    if (isUnpainted(shape, svg)) return;
    const cs = getComputedStyleCached(shape);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    if (parseFloat(cs.opacity) < 0.5) return;
    let area = 1;
    try {
      const box = (shape as SVGGraphicsElement).getBBox();
      area = Math.max(1, box.width * box.height);
    } catch {
      // Not rendered: count it once.
    }
    const add = (paint: string, weight: number) => {
      const rgb = parsePaint(paint);
      if (!rgb) return;
      const hex = toHex(...rgb);
      weights.set(hex, (weights.get(hex) ?? 0) + weight);
    };
    if (parseFloat(cs.fillOpacity) >= 0.5) add(cs.fill, area);
    if (parseFloat(cs.strokeWidth) > 0 && parseFloat(cs.strokeOpacity) >= 0.5)
      add(cs.stroke, area * 0.1);
  });
  return ranked(weights);
};

/**
 * Colors of a loaded image, from a small copy on a canvas. Images from
 * another origin without CORS can't be read and return nothing.
 */
const imageColors = (img: HTMLImageElement): LogoColor[] => {
  if (!img.complete || !img.naturalWidth || !img.naturalHeight) return [];
  const scale = Math.min(
    1,
    SAMPLE_PX / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return []; // cross-origin
  }
  // Group pixels into 4-bit-per-channel buckets; report each bucket's average.
  const buckets = new Map<
    number,
    { n: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key =
      ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += data[i];
    bucket.g += data[i + 1];
    bucket.b += data[i + 2];
    buckets.set(key, bucket);
  }
  const weights = new Map<string, number>();
  buckets.forEach(b => {
    const hex = toHex(b.r / b.n, b.g / b.n, b.b / b.n);
    weights.set(hex, (weights.get(hex) ?? 0) + b.n);
  });
  return ranked(weights);
};

/** The colors a logo is drawn in, most used first, when they can be read. */
export const getLogoColors = (el: Element): LogoColor[] => {
  try {
    if (el instanceof SVGSVGElement) return svgColors(el);
    if (el instanceof HTMLImageElement) return imageColors(el);
    // A logo drawn as a CSS background: read the image when the browser
    // already has it (an image it still has to load reads as nothing).
    const url = getComputedStyleCached(el).backgroundImage.match(
      /url\(["']?([^"')]+)["']?\)/,
    )?.[1];
    if (url) {
      const img = new Image();
      img.src = url;
      return imageColors(img);
    }
  } catch (e) {
    recordError("getLogoColors", e);
  }
  return [];
};
