/**
 * Perceptual hashing for card recognition — pure TS so the exact same code
 * runs in the pipeline (Node), the app (Hermes), and jest.
 *
 * We use difference hashes (dHash): resize to a tiny grayscale grid and record
 * whether each pixel is brighter than its right neighbour. Robust to lighting,
 * compression, and moderate blur; cheap to compute and compare.
 *
 * - dhash64  (9×8):   coarse, stored as INTEGER for future realtime use
 * - dhash256 (17×16): the matching hash, stored as a 32-byte BLOB
 */

/** Extract luma from RGBA bytes. */
export function grayscaleFromRgba(rgba: Uint8Array, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  }
  return gray;
}

/** Bilinear resize of a single-channel image. */
export function resizeBilinear(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const dst = new Float32Array(dstW * dstH);
  const xRatio = srcW > 1 ? (srcW - 1) / (dstW - 1 || 1) : 0;
  const yRatio = srcH > 1 ? (srcH - 1) / (dstH - 1 || 1) : 0;
  for (let y = 0; y < dstH; y++) {
    const sy = y * yRatio;
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fy = sy - y0;
    for (let x = 0; x < dstW; x++) {
      const sx = x * xRatio;
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const fx = sx - x0;
      const a = src[y0 * srcW + x0];
      const b = src[y0 * srcW + x1];
      const c = src[y1 * srcW + x0];
      const d = src[y1 * srcW + x1];
      dst[y * dstW + x] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }
  }
  return dst;
}

/** 256-bit dHash (17×16 grid → 16×16 comparisons) as a 32-byte array. */
export function dhash256(gray: Float32Array, width: number, height: number): Uint8Array {
  const g = resizeBilinear(gray, width, height, 17, 16);
  const out = new Uint8Array(32);
  let bit = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (g[y * 17 + x] > g[y * 17 + x + 1]) {
        out[bit >> 3] |= 1 << (7 - (bit & 7));
      }
      bit++;
    }
  }
  return out;
}

/** 64-bit dHash (9×8 grid) as a BigInt (fits SQLite INTEGER when signed). */
export function dhash64(gray: Float32Array, width: number, height: number): bigint {
  const g = resizeBilinear(gray, width, height, 9, 8);
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash <<= 1n;
      if (g[y * 9 + x] > g[y * 9 + x + 1]) hash |= 1n;
    }
  }
  // Map to signed 64-bit so it round-trips through SQLite INTEGER.
  return BigInt.asIntN(64, hash);
}

const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1];
}

/** Hamming distance between two equal-length byte hashes. */
export function hammingBytes(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    d += POPCOUNT[a[i] ^ b[i]];
  }
  return d;
}
