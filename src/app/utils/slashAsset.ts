/**
 * slashAsset.ts — Shared image-based slash asset loader.
 *
 * Used by FangVFX, GorrVFX, and CrawVFX so the image is only fetched,
 * chroma-keyed, and cached ONCE no matter how many VFX components render.
 *
 * Asset: green-screen → chroma key processed client-side.
 * URL uses f_auto,q_auto (NO e_background_removal — that's for Cloudinary AI).
 */

import { applyChromaKey, getContentBounds } from './chromaKey';

const SLASH_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778227653/edited-photo_ulx54j.png';

let _canvas: HTMLCanvasElement | null = null;
let _bounds: { x: number; y: number; w: number; h: number } | null = null;
const _cbs: Array<() => void> = [];

/**
 * Ensure the slash canvas is ready.
 * Calls `cb` immediately if already loaded, otherwise queues it.
 */
export function ensureSlashAsset(cb: () => void): void {
  if (_canvas) { cb(); return; }
  _cbs.push(cb);
  if (_cbs.length > 1) return; // already in-flight
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c   = document.createElement('canvas');
    c.width   = img.naturalWidth;
    c.height  = img.naturalHeight;
    const cx  = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0);
    const d   = cx.getImageData(0, 0, c.width, c.height);
    applyChromaKey(d.data);
    cx.putImageData(d, 0, 0);
    const b   = getContentBounds(d.data, c.width, c.height);
    _bounds   = b ?? { x: 0, y: 0, w: c.width, h: c.height };
    _canvas   = c;
    _cbs.forEach(f => f());
    _cbs.length = 0;
  };
  img.onerror = () => { _cbs.length = 0; };
  img.src = SLASH_URL;
}

export function getSlashCanvas(): HTMLCanvasElement | null {
  return _canvas;
}

export function getSlashBounds(): { x: number; y: number; w: number; h: number } | null {
  return _bounds;
}
