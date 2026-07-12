/**
 * Turns the Nano Banana icon master into app assets:
 * - assets/images/icon.png          1024×1024 full-bleed app icon
 * - assets/images/splash-icon.png   card glyph on the dark bg (splash uses bg #0A0C10)
 * - assets/images/favicon.png       48×48
 *
 *   node pipeline/make-icons.mjs pipeline/.cache/art/icon-master.png
 */
import sharp from "sharp";

const src = process.argv[2] ?? "pipeline/.cache/art/icon-master.png";

const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

// Bounding box of the dark rounded-square (luma < 200 = not the white canvas).
let minX = width, minY = height, maxX = 0, maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (data[y * width + x] < 200) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const bw = maxX - minX;
const bh = maxY - minY;
console.log(`dark shape bbox: ${minX},${minY} ${bw}×${bh}`);

// Inset by 15% of the shape so the crop's corners stay inside the rounded rect.
const inset = Math.round(Math.min(bw, bh) * 0.15);
const crop = {
  left: minX + inset,
  top: minY + inset,
  width: bw - inset * 2,
  height: bh - inset * 2,
};
// Make it square (centered).
const side = Math.min(crop.width, crop.height);
crop.left += Math.round((crop.width - side) / 2);
crop.top += Math.round((crop.height - side) / 2);
crop.width = side;
crop.height = side;

await sharp(src).extract(crop).resize(1024, 1024).png().toFile("assets/images/icon.png");
console.log("icon.png written (1024)");

// Splash glyph: central 62% of the icon (the card + sparkle), on its own dark bg.
const glyphSide = Math.round(side * 0.72);
const glyph = {
  left: crop.left + Math.round((side - glyphSide) / 2),
  top: crop.top + Math.round((side - glyphSide) / 2),
  width: glyphSide,
  height: glyphSide,
};
await sharp(src).extract(glyph).resize(512, 512).png().toFile("assets/images/splash-icon.png");
console.log("splash-icon.png written (512)");

await sharp(src).extract(crop).resize(48, 48).png().toFile("assets/images/favicon.png");
console.log("favicon.png written (48)");

// Sample the crop's corner to report the background tone (for splash bg color).
const cornerPx = await sharp(src)
  .extract({ left: crop.left + 2, top: crop.top + 2, width: 1, height: 1 })
  .raw()
  .toBuffer();
console.log(`corner tone rgb(${cornerPx[0]}, ${cornerPx[1]}, ${cornerPx[2]})`);
