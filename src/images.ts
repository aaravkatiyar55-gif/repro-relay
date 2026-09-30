import { LIMITS, id } from './model.ts';
import type { Evidence } from './model.ts';
import { hashBytes, pngSize, pngBytes } from './validation.ts';

export interface Rect { x: number; y: number; width: number; height: number }
export function imageSize(bytes: Uint8Array): { width: number; height: number; type: 'image/png' | 'image/jpeg' } {
  if (bytes.length > LIMITS.sourceBytes) throw new Error('Use a PNG or JPEG of at most 5 MB.');
  if (bytes[0] === 137 && bytes[1] === 80) return { ...pngSize(bytes), type: 'image/png' };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Only actual PNG and JPEG images are accepted.');
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG segment.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda || marker === undefined) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes[offset]! * 256 + bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) throw new Error('Truncated JPEG segment.');
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length < 8) throw new Error('Invalid JPEG size header.');
      const height = bytes[offset + 3]! * 256 + bytes[offset + 4]!;
      const width = bytes[offset + 5]! * 256 + bytes[offset + 6]!;
      if (!width || !height || width * height > LIMITS.pixels) throw new Error('Use an image of at most 8 megapixels.');
      return { width, height, type: 'image/jpeg' };
    }
    offset += length;
  }
  throw new Error('JPEG size could not be verified. Try exporting it as PNG.');
}
export function clampRect(rect: Rect, width: number, height: number): Rect {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) throw new Error('Enter a positive redaction width and height.');
  const x = Math.max(0, Math.min(width, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(height, Math.floor(rect.y)));
  const right = Math.max(x, Math.min(width, Math.ceil(rect.x + rect.width)));
  const bottom = Math.max(y, Math.min(height, Math.ceil(rect.y + rect.height)));
  if (right === x || bottom === y) throw new Error('The redaction must touch the image.');
  return { x, y, width: right - x, height: bottom - y };
}
export function burnRedactions(pixels: Uint8ClampedArray, width: number, height: number, rectangles: Rect[]): void {
  if (pixels.length !== width * height * 4) throw new Error('Invalid pixel buffer.');
  for (const rectangle of rectangles) {
    const r = clampRect(rectangle, width, height);
    for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
      const index = (y * width + x) * 4;
      pixels[index] = 17; pixels[index + 1] = 24; pixels[index + 2] = 22; pixels[index + 3] = 255;
    }
  }
}
export async function prepareImage(file: File): Promise<HTMLCanvasElement> {
  if (file.size > LIMITS.sourceBytes || !file.size) throw new Error('Use a non-empty PNG or JPEG of at most 5 MB.');
  imageSize(new Uint8Array(await file.arrayBuffer())); // bound dimensions before decoding
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This image could not be decoded. Try a fresh PNG or JPEG.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > LIMITS.pixels) throw new Error('Use an image of at most 8 megapixels.');
    const ratio = Math.min(1, LIMITS.edge / Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(bitmap.width * ratio)); canvas.height = Math.max(1,Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { bitmap.close(); }
}
function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed. Your image was not saved.')), 'image/png'));
}
function dataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i + 8192));
  return 'data:image/png;base64,' + btoa(binary);
}
export async function processEvidence(original: HTMLCanvasElement, rectangles: Rect[], caption: string): Promise<Evidence> {
  const canvas = document.createElement('canvas'); canvas.width = original.width; canvas.height = original.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable.');
  context.drawImage(original, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  burnRedactions(pixels.data, canvas.width, canvas.height, rectangles);
  context.putImageData(pixels, 0, 0);
  let output = canvas, blob = await encode(output);
  // Redaction is burned before resizing; no later stage can expose original pixels.
  while (blob.size > LIMITS.imageBytes && Math.max(output.width,output.height) > 200) {
    const smaller = document.createElement('canvas'); smaller.width = Math.max(1,Math.floor(output.width * .75)); smaller.height = Math.max(1,Math.floor(output.height * .75));
    smaller.getContext('2d')!.drawImage(output, 0, 0, smaller.width, smaller.height);
    output = smaller; blob = await encode(output);
  }
  if (blob.size > LIMITS.imageBytes) throw new Error('The processed PNG is still over 2 MB. Try a smaller screenshot.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { id: id(), caption: caption.trim(), width: output.width, height: output.height, png: dataUrl(bytes), sha256: await hashBytes(bytes) };
}
export async function verifyDecodedEvidence(image: Evidence): Promise<void> {
  const bytes = pngBytes(image.png);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' })); }
  catch { throw new Error('An evidence PNG has valid metadata but cannot be decoded. Nothing was imported.'); }
  try { if (bitmap.width !== image.width || bitmap.height !== image.height) throw new Error('Decoded evidence dimensions do not match.'); }
  finally { bitmap.close(); }
}
