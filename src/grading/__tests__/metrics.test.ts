import { analyzeCorners, analyzeEdges, analyzeSurface, measureCentering, normalizeCardImage } from "../metrics";

/**
 * Synthetic card generator with ground-truth geometry.
 * Border tone ~190 (light), artwork ~70 (dark) → strong frame edges.
 */
function makeCard(opts: {
  w?: number;
  h?: number;
  borders: { l: number; r: number; t: number; b: number }; // px at native res
  cornerNotch?: { corner: "tl" | "tr" | "bl" | "br"; size: number };
  edgeWhitening?: { edge: "top" | "bottom" | "left" | "right"; thickness: number; length: number };
  surfaceSpecks?: number;
}): { gray: Float32Array; w: number; h: number } {
  const w = opts.w ?? 480;
  const h = opts.h ?? 671;
  const gray = new Float32Array(w * h).fill(190);
  const { l, r, t, b } = opts.borders;

  // Artwork region (dark) inside the border frame.
  for (let y = t; y < h - b; y++) {
    for (let x = l; x < w - r; x++) {
      gray[y * w + x] = 70 + 10 * Math.sin(x / 17) * Math.cos(y / 23); // mild texture
    }
  }

  if (opts.cornerNotch) {
    const s = opts.cornerNotch.size;
    const region =
      opts.cornerNotch.corner === "tl"
        ? { x0: 0, y0: 0 }
        : opts.cornerNotch.corner === "tr"
          ? { x0: w - s, y0: 0 }
          : opts.cornerNotch.corner === "bl"
            ? { x0: 0, y0: h - s }
            : { x0: w - s, y0: h - s };
    for (let y = region.y0; y < region.y0 + s; y++) {
      for (let x = region.x0; x < region.x0 + s; x++) {
        gray[y * w + x] = 255; // frayed white
      }
    }
  }

  if (opts.edgeWhitening) {
    const { edge, thickness, length } = opts.edgeWhitening;
    const start = Math.round((w - length) / 2);
    for (let i = 0; i < length; i++) {
      for (let d = 0; d < thickness; d++) {
        if (edge === "top") gray[d * w + start + i] = 255;
        if (edge === "bottom") gray[(h - 1 - d) * w + start + i] = 255;
        if (edge === "left") gray[(start + i) * w + d] = 255;
        if (edge === "right") gray[(start + i) * w + (w - 1 - d)] = 255;
      }
    }
  }

  if (opts.surfaceSpecks) {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < opts.surfaceSpecks; i++) {
      const x = Math.round(w * 0.2 + rand() * w * 0.6);
      const y = Math.round(h * 0.2 + rand() * h * 0.6);
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          gray[(y + dy) * w + x + dx] = 255;
        }
      }
    }
  }

  return { gray, w, h };
}

describe("measureCentering", () => {
  it("reads a perfectly centered card as ~50/50", () => {
    const { gray, w, h } = makeCard({ borders: { l: 24, r: 24, t: 34, b: 34 } });
    const c = measureCentering(normalizeCardImage(gray, w, h));
    expect(c).not.toBeNull();
    expect(c!.leftRight[0]).toBeLessThan(53);
    expect(c!.topBottom[0]).toBeLessThan(53);
    expect(c!.confidence).toBe("high");
  });

  it("measures a 60/40 left-right offset within tolerance", () => {
    const { gray, w, h } = makeCard({ borders: { l: 30, r: 20, t: 34, b: 34 } });
    const c = measureCentering(normalizeCardImage(gray, w, h));
    expect(c).not.toBeNull();
    expect(c!.leftRight[0]).toBeGreaterThan(56);
    expect(c!.leftRight[0]).toBeLessThan(64);
  });

  it("measures a severe 70/30 top-bottom offset", () => {
    const { gray, w, h } = makeCard({ borders: { l: 24, r: 24, t: 49, b: 21 } });
    const c = measureCentering(normalizeCardImage(gray, w, h));
    expect(c).not.toBeNull();
    expect(c!.topBottom[0]).toBeGreaterThan(65);
    expect(c!.worst).toBeGreaterThan(65);
  });
});

describe("corner / edge / surface analysis", () => {
  const clean = makeCard({ borders: { l: 24, r: 24, t: 34, b: 34 } });

  it("scores a clean card highly across components", () => {
    const img = normalizeCardImage(clean.gray, clean.w, clean.h);
    expect(analyzeCorners(img).score).toBeGreaterThanOrEqual(9.5);
    expect(analyzeEdges(img).score).toBeGreaterThanOrEqual(9.5);
    expect(analyzeSurface(img).score).toBeGreaterThanOrEqual(9);
  });

  it("detects a whitened corner and names it", () => {
    const damaged = makeCard({
      borders: { l: 24, r: 24, t: 34, b: 34 },
      cornerNotch: { corner: "tr", size: 26 },
    });
    const img = normalizeCardImage(damaged.gray, damaged.w, damaged.h);
    const result = analyzeCorners(img);
    expect(result.score).toBeLessThanOrEqual(8);
    expect(result.findings.join(" ")).toContain("top-right");
  });

  it("detects edge whitening", () => {
    const damaged = makeCard({
      borders: { l: 24, r: 24, t: 34, b: 34 },
      edgeWhitening: { edge: "top", thickness: 6, length: 200 },
    });
    const img = normalizeCardImage(damaged.gray, damaged.w, damaged.h);
    const result = analyzeEdges(img);
    expect(result.score).toBeLessThanOrEqual(8.5);
    expect(result.findings.join(" ")).toContain("top");
  });

  it("flags surface damage from specks", () => {
    const damaged = makeCard({
      borders: { l: 24, r: 24, t: 34, b: 34 },
      surfaceSpecks: 220,
    });
    const img = normalizeCardImage(damaged.gray, damaged.w, damaged.h);
    const cleanScore = analyzeSurface(normalizeCardImage(clean.gray, clean.w, clean.h)).score;
    const result = analyzeSurface(img);
    expect(result.score).toBeLessThan(cleanScore);
  });
});
