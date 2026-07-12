import { dhash256, dhash64, grayscaleFromRgba, hammingBytes, resizeBilinear } from "../hash";
import { matchHash, type HashIndexEntry } from "../matcher";

/** Deterministic pseudo-random "card art" generator. */
function syntheticImage(seed: number, w: number, h: number): Float32Array {
  const img = new Float32Array(w * h);
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  // Layered sinusoids — smooth structure that survives resizing.
  const fx1 = 1 + rand() * 4;
  const fy1 = 1 + rand() * 4;
  const fx2 = 1 + rand() * 9;
  const fy2 = 1 + rand() * 9;
  const phase = rand() * Math.PI * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      img[y * w + x] =
        128 +
        60 * Math.sin(fx1 * Math.PI * u + phase) * Math.cos(fy1 * Math.PI * v) +
        40 * Math.sin(fx2 * Math.PI * u) * Math.sin(fy2 * Math.PI * v + phase);
    }
  }
  return img;
}

describe("hash primitives", () => {
  it("converts RGBA to grayscale luma", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const gray = grayscaleFromRgba(rgba, 2, 1);
    expect(gray[0]).toBeCloseTo(76.2, 0);
    expect(gray[1]).toBeCloseTo(149.7, 0);
  });

  it("resize preserves constant images", () => {
    const img = new Float32Array(100).fill(42);
    const out = resizeBilinear(img, 10, 10, 4, 4);
    for (const v of out) expect(v).toBeCloseTo(42);
  });

  it("hash of identical images is identical (distance 0)", () => {
    const img = syntheticImage(7, 200, 280);
    expect(hammingBytes(dhash256(img, 200, 280), dhash256(img, 200, 280))).toBe(0);
  });

  it("is scale-invariant (same art at different resolutions)", () => {
    const big = syntheticImage(7, 400, 560);
    const small = resizeBilinear(big, 400, 560, 120, 168);
    const d = hammingBytes(dhash256(big, 400, 560), dhash256(small, 120, 168));
    expect(d).toBeLessThan(20);
  });

  it("survives brightness shifts", () => {
    const img = syntheticImage(7, 200, 280);
    const brighter = img.map((v) => Math.min(255, v * 1.2 + 15)) as Float32Array;
    const d = hammingBytes(dhash256(img, 200, 280), dhash256(brighter, 200, 280));
    expect(d).toBeLessThan(12);
  });

  it("distinguishes different images", () => {
    const a = syntheticImage(7, 200, 280);
    const b = syntheticImage(99, 200, 280);
    const d = hammingBytes(dhash256(a, 200, 280), dhash256(b, 200, 280));
    expect(d).toBeGreaterThan(60);
  });

  it("dhash64 round-trips through signed range", () => {
    const img = syntheticImage(3, 90, 80);
    const h = dhash64(img, 90, 80);
    expect(h >= -(2n ** 63n) && h < 2n ** 63n).toBe(true);
  });
});

describe("matcher", () => {
  it("ranks the true card first among distractors", () => {
    const index: HashIndexEntry[] = [];
    for (let i = 0; i < 500; i++) {
      const img = syntheticImage(i + 1000, 200, 280);
      index.push({
        cardId: `en:test-${i}`,
        hash: dhash256(img, 200, 280),
        language: "en",
      });
    }
    // "Photograph" of card 137: rescaled + brightness-shifted version.
    const original = syntheticImage(1137, 200, 280);
    const photo = resizeBilinear(
      original.map((v) => Math.min(255, v * 1.1 + 8)) as Float32Array,
      200,
      280,
      160,
      224,
    );
    const query = dhash256(photo, 160, 224);

    const results = matchHash(query, index, { topN: 5 });
    expect(results[0].cardId).toBe("en:test-137");
    expect(results[0].distance).toBeLessThan(30);
    expect(results[1].distance).toBeGreaterThan(results[0].distance + 20);
  });

  it("filters by language", () => {
    const img = syntheticImage(5, 100, 140);
    const hash = dhash256(img, 100, 140);
    const index: HashIndexEntry[] = [
      { cardId: "en:a", hash, language: "en" },
      { cardId: "ja:a", hash, language: "ja" },
    ];
    const jaOnly = matchHash(hash, index, { language: "ja" });
    expect(jaOnly.map((r) => r.cardId)).toEqual(["ja:a"]);
  });
});
