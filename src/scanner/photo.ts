import { decode as decodeJpeg } from "jpeg-js";

import { dhash256, grayscaleFromRgba } from "./hash";

const B64_LOOKUP = new Int16Array(128).fill(-1);
{
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < alphabet.length; i++) B64_LOOKUP[alphabet.charCodeAt(i)] = i;
}

/** Base64 → bytes without relying on atob/Buffer (portable across Hermes/Node). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n=]+/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64_LOOKUP[clean.charCodeAt(i)];
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** Decode a base64 JPEG and compute its 256-bit dHash. */
export function hashFromJpegBase64(b64: string): Uint8Array {
  const bytes = base64ToBytes(b64);
  const { data, width, height } = decodeJpeg(bytes, { useTArray: true });
  const gray = grayscaleFromRgba(data, width, height);
  return dhash256(gray, width, height);
}
