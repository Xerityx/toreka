/**
 * Image-measurement engine for grading prediction. Pure TS over grayscale
 * pixel arrays so the whole thing is unit-testable with synthetic cards.
 *
 * Input contract: a photo of ONE card, cropped to the card's physical bounds
 * (the capture UI's overlay enforces this), ideally ≥ 700 px on the short side.
 *
 * Honesty model: centering is measured geometrically (high confidence);
 * corners/edges use whitening detection (medium); surface uses high-pass
 * outliers and is inherently limited from a photo (low confidence).
 */

import { resizeBilinear } from "../scanner/hash";
import type { CenteringMeasurement, ComponentScore, Confidence, SideMeasurements } from "./types";

/** Working resolution: analysis happens on a normalized card raster. */
const W = 480;
const H = Math.round(480 / (63 / 88)); // 671 — physical card aspect

export interface GrayImage {
  data: Float32Array;
  width: number;
  height: number;
}

export function normalizeCardImage(gray: Float32Array, width: number, height: number): GrayImage {
  return { data: resizeBilinear(gray, width, height, W, H), width: W, height: H };
}

// ---------------------------------------------------------------------------
// Centering
// ---------------------------------------------------------------------------

/**
 * Find the inner artwork-frame line from each side by locating the strongest
 * sustained gradient inside a search band, then convert opposing border
 * widths to the familiar "58/42" split.
 */
export function measureCentering(img: GrayImage): CenteringMeasurement | null {
  const { data, width, height } = img;

  // Column gradient energy (vertical edges) and row gradient energy.
  const colEnergy = new Float32Array(width);
  for (let y = 2; y < height - 2; y++) {
    for (let x = 1; x < width - 1; x++) {
      colEnergy[x] += Math.abs(data[y * width + x + 1] - data[y * width + x - 1]);
    }
  }
  const rowEnergy = new Float32Array(height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 2; x < width - 2; x++) {
      rowEnergy[y] += Math.abs(data[(y + 1) * width + x] - data[(y - 1) * width + x]);
    }
  }

  // Search for the frame line in a band 2%–18% in from each physical edge.
  const findEdge = (
    energy: Float32Array,
    size: number,
    fromStart: boolean,
  ): { pos: number; strength: number } | null => {
    const lo = Math.round(size * 0.02);
    const hi = Math.round(size * 0.18);
    let bestPos = -1;
    let bestVal = 0;
    let sum = 0;
    let count = 0;
    for (let i = lo; i <= hi; i++) {
      const idx = fromStart ? i : size - 1 - i;
      const v = energy[idx];
      sum += v;
      count++;
      if (v > bestVal) {
        bestVal = v;
        bestPos = idx;
      }
    }
    if (bestPos < 0 || count === 0) return null;
    const mean = sum / count;
    const strength = mean > 0 ? bestVal / mean : 0;
    return { pos: bestPos, strength };
  };

  const left = findEdge(colEnergy, width, true);
  const right = findEdge(colEnergy, width, false);
  const top = findEdge(rowEnergy, height, true);
  const bottom = findEdge(rowEnergy, height, false);
  if (!left || !right || !top || !bottom) return null;

  const lBorder = left.pos;
  const rBorder = width - 1 - right.pos;
  const tBorder = top.pos;
  const bBorder = height - 1 - bottom.pos;
  if (lBorder + rBorder <= 0 || tBorder + bBorder <= 0) return null;

  const lr = (lBorder / (lBorder + rBorder)) * 100;
  const tb = (tBorder / (tBorder + bBorder)) * 100;

  const round1 = (v: number) => Math.round(v * 10) / 10;
  const leftRight: [number, number] = [round1(Math.max(lr, 100 - lr)), round1(Math.min(lr, 100 - lr))];
  const topBottom: [number, number] = [round1(Math.max(tb, 100 - tb)), round1(Math.min(tb, 100 - tb))];

  const minStrength = Math.min(left.strength, right.strength, top.strength, bottom.strength);
  const confidence: Confidence = minStrength > 3.5 ? "high" : minStrength > 2.2 ? "medium" : "low";

  return {
    leftRight,
    topBottom,
    worst: Math.max(leftRight[0], topBottom[0]),
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Whitening detection (corners + edges)
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Fraction of pixels in a region that are much brighter than the border's
 * median tone — frayed cardboard reads as white against the border ink.
 */
function whiteningFraction(
  img: GrayImage,
  region: { x0: number; y0: number; x1: number; y1: number },
  borderMedian: number,
): number {
  const { data, width } = img;
  let whitened = 0;
  let total = 0;
  const threshold = Math.min(250, borderMedian + 55);
  for (let y = region.y0; y < region.y1; y++) {
    for (let x = region.x0; x < region.x1; x++) {
      total++;
      if (data[y * width + x] > threshold) whitened++;
    }
  }
  return total > 0 ? whitened / total : 0;
}

/** Median tone of the outer border ring (excludes corners). */
function borderMedianTone(img: GrayImage): number {
  const { data, width, height } = img;
  const band = Math.round(width * 0.035);
  const samples: number[] = [];
  for (let y = Math.round(height * 0.2); y < Math.round(height * 0.8); y += 3) {
    for (let x = 2; x < band; x += 2) {
      samples.push(data[y * width + x]);
      samples.push(data[y * width + (width - 1 - x)]);
    }
  }
  for (let x = Math.round(width * 0.2); x < Math.round(width * 0.8); x += 3) {
    for (let y = 2; y < band; y += 2) {
      samples.push(data[y * width + x]);
      samples.push(data[(height - 1 - y) * width + x]);
    }
  }
  return median(samples);
}

function scoreFromWhitening(worst: number, avg: number): number {
  // Calibration: pristine ≈ 0; light wear 2–6%; heavy wear > 15%.
  const w = worst * 0.7 + avg * 0.3;
  if (w < 0.01) return 10;
  if (w < 0.025) return 9.5;
  if (w < 0.05) return 9;
  if (w < 0.09) return 8.5;
  if (w < 0.14) return 8;
  if (w < 0.2) return 7;
  if (w < 0.3) return 6;
  if (w < 0.45) return 5;
  return 3;
}

export function analyzeCorners(img: GrayImage): ComponentScore {
  const { width, height } = img;
  const s = Math.round(width * 0.09);
  const tone = borderMedianTone(img);
  const regions = {
    "top-left": { x0: 0, y0: 0, x1: s, y1: s },
    "top-right": { x0: width - s, y0: 0, x1: width, y1: s },
    "bottom-left": { x0: 0, y0: height - s, x1: s, y1: height },
    "bottom-right": { x0: width - s, y0: height - s, x1: width, y1: height },
  };

  const findings: string[] = [];
  let worst = 0;
  let sum = 0;
  let worstName = "";
  for (const [name, region] of Object.entries(regions)) {
    const f = whiteningFraction(img, region, tone);
    sum += f;
    if (f > worst) {
      worst = f;
      worstName = name;
    }
  }
  const avg = sum / 4;
  const score = scoreFromWhitening(worst, avg);
  if (worst >= 0.025) {
    findings.push(`Whitening detected on the ${worstName} corner (${(worst * 100).toFixed(1)}% of the area).`);
  } else {
    findings.push("All four corners look clean at this resolution.");
  }
  return { score, confidence: "medium", findings };
}

export function analyzeEdges(img: GrayImage): ComponentScore {
  const { width, height } = img;
  const band = Math.round(width * 0.025);
  const inset = Math.round(width * 0.1); // skip corners
  const tone = borderMedianTone(img);
  const regions = {
    top: { x0: inset, y0: 0, x1: width - inset, y1: band },
    bottom: { x0: inset, y0: height - band, x1: width - inset, y1: height },
    left: { x0: 0, y0: inset, x1: band, y1: height - inset },
    right: { x0: width - band, y0: inset, x1: width, y1: height - inset },
  };

  const findings: string[] = [];
  let worst = 0;
  let sum = 0;
  let worstName = "";
  for (const [name, region] of Object.entries(regions)) {
    const f = whiteningFraction(img, region, tone);
    sum += f;
    if (f > worst) {
      worst = f;
      worstName = name;
    }
  }
  const avg = sum / 4;
  const score = scoreFromWhitening(worst, avg);
  if (worst >= 0.025) {
    findings.push(`Edge whitening along the ${worstName} edge (${(worst * 100).toFixed(1)}%).`);
  } else {
    findings.push("Edges show no significant whitening at this resolution.");
  }
  return { score, confidence: "medium", findings };
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

/** Box blur helper. */
function boxBlur(img: GrayImage, radius: number): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(width * height);
  const size = radius * 2 + 1;
  // horizontal
  const tmp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += data[y * width + Math.max(0, Math.min(width - 1, x))];
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = acc / size;
      const add = Math.min(width - 1, x + radius + 1);
      const sub = Math.max(0, x - radius);
      acc += data[y * width + add] - data[y * width + sub];
    }
  }
  // vertical
  for (let x = 0; x < width; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.max(0, Math.min(height - 1, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / size;
      const add = Math.min(height - 1, y + radius + 1);
      const sub = Math.max(0, y - radius);
      acc += tmp[add * width + x] - tmp[sub * width + x];
    }
  }
  return out;
}

/** Fraction of near-saturated pixels — a proxy for holo glare / reflections. */
export function estimateGlare(img: GrayImage): number {
  const { data, width, height } = img;
  let bright = 0;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    if (data[i] > 245) bright++;
  }
  return bright / total;
}

export function analyzeSurface(img: GrayImage): ComponentScore {
  const { data, width, height } = img;
  const blurred = boxBlur(img, 4);

  // Central art region only (border noise excluded).
  const x0 = Math.round(width * 0.12);
  const x1 = Math.round(width * 0.88);
  const y0 = Math.round(height * 0.12);
  const y1 = Math.round(height * 0.88);

  let outliers = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      total++;
      // Bright, high-frequency deviations = scratches / print lines / dents.
      if (data[i] - blurred[i] > 38) outliers++;
    }
  }
  const fraction = total > 0 ? outliers / total : 0;
  const glare = estimateGlare(img);

  let score: number;
  if (fraction < 0.001) score = 10;
  else if (fraction < 0.003) score = 9.5;
  else if (fraction < 0.007) score = 9;
  else if (fraction < 0.015) score = 8;
  else if (fraction < 0.03) score = 7;
  else if (fraction < 0.06) score = 6;
  else score = 5;

  const findings: string[] = [];
  if (fraction >= 0.003) {
    findings.push(
      `High-frequency surface anomalies on ${(fraction * 100).toFixed(2)}% of the art area — possible scratches or print lines.`,
    );
  } else {
    findings.push("No obvious scratches or print lines detected from this photo.");
  }
  if (glare > 0.02) {
    findings.push(
      `Significant glare in the photo (${(glare * 100).toFixed(1)}% of pixels) — retake with diffuse lighting for a more reliable read.`,
    );
  }

  return {
    score,
    confidence: glare > 0.02 ? "low" : "low", // surface from a photo is always low confidence
    findings,
  };
}

// ---------------------------------------------------------------------------
// Full side analysis
// ---------------------------------------------------------------------------

export function analyzeSide(gray: Float32Array, width: number, height: number): SideMeasurements {
  const img = normalizeCardImage(gray, width, height);
  return {
    centering: measureCentering(img),
    corners: analyzeCorners(img),
    edges: analyzeEdges(img),
    surface: analyzeSurface(img),
    glareFraction: estimateGlare(img),
  };
}
