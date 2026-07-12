/**
 * Maps an overlay rectangle (in preview/container coordinates) to pixel
 * coordinates in the captured photo, assuming the preview renders the photo
 * with `cover` fit (fills the container, cropping the overflow).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeCoverCrop(
  photoW: number,
  photoH: number,
  containerW: number,
  containerH: number,
  overlay: Rect,
): Rect {
  const scale = Math.max(containerW / photoW, containerH / photoH);
  // Size of the container in photo pixels, and the photo region it shows.
  const visibleW = containerW / scale;
  const visibleH = containerH / scale;
  const offsetX = (photoW - visibleW) / 2;
  const offsetY = (photoH - visibleH) / 2;

  const x = offsetX + overlay.x / scale;
  const y = offsetY + overlay.y / scale;
  const width = overlay.width / scale;
  const height = overlay.height / scale;

  // Clamp to photo bounds.
  const cx = Math.max(0, Math.min(photoW - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(photoH - 1, Math.round(y)));
  return {
    x: cx,
    y: cy,
    width: Math.max(1, Math.min(photoW - cx, Math.round(width))),
    height: Math.max(1, Math.min(photoH - cy, Math.round(height))),
  };
}
