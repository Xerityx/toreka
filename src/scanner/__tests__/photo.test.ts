import { encode as encodeJpeg } from "jpeg-js";

import { computeCoverCrop } from "../crop";
import { dhash256, hammingBytes } from "../hash";
import { base64ToBytes, hashFromJpegBase64 } from "../photo";

describe("computeCoverCrop", () => {
  it("maps a centered overlay when photo is wider than container", () => {
    // Photo 4000×3000 shown cover in a 400×800 container: scale = max(10, 3.75)=10? no:
    // scale = max(400/4000, 800/3000) = max(0.1, 0.2667) = 0.2667
    const crop = computeCoverCrop(4000, 3000, 400, 800, { x: 100, y: 200, width: 200, height: 300 });
    // visibleW = 400/0.26667 = 1500, offsetX = (4000-1500)/2 = 1250
    expect(crop.x).toBe(1250 + Math.round(100 / (800 / 3000)));
    expect(crop.width).toBe(Math.round(200 / (800 / 3000)));
    expect(crop.y).toBe(Math.round(200 / (800 / 3000)));
  });

  it("clamps to photo bounds", () => {
    const crop = computeCoverCrop(100, 100, 100, 100, { x: 90, y: 90, width: 50, height: 50 });
    expect(crop.x + crop.width).toBeLessThanOrEqual(100);
    expect(crop.y + crop.height).toBeLessThanOrEqual(100);
  });
});

describe("photo hashing", () => {
  it("round-trips base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 7]);
    // Node's Buffer produces reference base64.
    const b64 = Buffer.from(bytes).toString("base64");
    expect([...base64ToBytes(b64)]).toEqual([...bytes]);
  });

  it("hash of an encoded JPEG matches the raw image hash", () => {
    // Synthetic RGBA image with smooth structure.
    const w = 160;
    const h = 224;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.round(128 + 100 * Math.sin((x / w) * 6) * Math.cos((y / h) * 4));
        const o = (y * w + x) * 4;
        rgba[o] = v;
        rgba[o + 1] = v;
        rgba[o + 2] = v;
        rgba[o + 3] = 255;
      }
    }
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = rgba[i * 4];
    const directHash = dhash256(gray, w, h);

    const jpeg = encodeJpeg({ data: rgba, width: w, height: h }, 90);
    const b64 = Buffer.from(jpeg.data).toString("base64");
    const jpegHash = hashFromJpegBase64(b64);

    expect(hammingBytes(directHash, jpegHash)).toBeLessThan(12);
  });
});
