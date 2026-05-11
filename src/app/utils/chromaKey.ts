// ─── Shared Chroma Key Utility ────────────────────────────────────────────────
// RULE: ALL character assets use green-screen background.
//       Never use Cloudinary e_background_removal for characters.
//       Always use f_auto,q_auto (raw) + this client-side chroma key.
//       Apply everywhere: card illustrations, hero detail, battle sprites.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

// ── Core pixel-level chroma key ───────────────────────────────────────────────
// HARD: greenDiff > HARD → alpha = 0 (core area, raise if too aggressive)
// SOFT: transition band below HARD for smooth edges
// Despill: replace green channel on edge pixels with avg(r,b)
export const CHROMA_HARD = 55;
export const CHROMA_SOFT = 30;

export function applyChromaKey(
  data: Uint8ClampedArray,
  hard = CHROMA_HARD,
  soft = CHROMA_SOFT,
): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const diff = g - Math.max(r, b);
    if (diff > hard) {
      data[i + 3] = 0;
    } else if (diff > hard - soft) {
      const t = (diff - (hard - soft)) / soft;
      data[i + 3] = Math.round(data[i + 3] * (1 - t));
      // Despill green fringe
      data[i + 1] = Math.round(r * 0.5 + b * 0.5);
    }
  }
}

// ── Module-level data-URL cache ───────────────────────────────────────────────
// Key   = original src URL
// Value = chroma-keyed PNG data URL (or blob: URL)
// Populated by LoadingPage for every card illustration → survives navigation,
// so useChromaKeyDataUrl() can return synchronously on every subsequent mount.
export const chromaDataUrlCache = new Map<string, string>();

// ── Decoded-bitmap keeper ──────────────────────────────────────────────────────
// Holds live Image() objects loaded with each chroma data URL.
// As long as this Map keeps a reference, the browser cannot GC the decoded
// bitmap — so any <img src={dataUrl}> or <image href={dataUrl}> that mounts
// later gets an instant cache hit with zero flash.
const chromaImgKeeper = new Map<string, HTMLImageElement>();

// Use this instead of chromaDataUrlCache.set() everywhere so the keeper is
// always populated together with the cache.
export function keepChromaUrl(srcKey: string, dataUrl: string): void {
  chromaDataUrlCache.set(srcKey, dataUrl);
  if (!chromaImgKeeper.has(srcKey)) {
    const keeper = new Image();
    keeper.src = dataUrl; // triggers decode; browser caches decoded bitmap
    chromaImgKeeper.set(srcKey, keeper);
  }
}

// ── Hook: loads image with CORS, applies chroma key, returns data URL ─────────
// Usage in any component:
//   const dataUrl = useChromaKeyDataUrl('https://res.cloudinary.com/.../char.png');
//   <image href={dataUrl ?? ''} ... />
//
// ★ Cache-first: if LoadingPage already warmed chromaDataUrlCache for this src,
//   useState() initializer returns it SYNCHRONOUSLY — zero delay, zero flash.
export function useChromaKeyDataUrl(src: string): string | null {
  // Synchronous cache read in the initializer — instant on remount.
  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    chromaDataUrlCache.get(src) ?? null,
  );

  useEffect(() => {
    if (!src) return;

    // Cache hit — no async work, no null flash at all.
    const cached = chromaDataUrlCache.get(src);
    if (cached) {
      setDataUrl(cached);   // same value → React bails out, no re-render
      return;
    }

    // Cache miss — async load (fallback path when LoadingPage was skipped).
    setDataUrl(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width  = img.naturalWidth;
      off.height = img.naturalHeight;
      const ctx = off.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, off.width, off.height);
      applyChromaKey(imageData.data);
      ctx.putImageData(imageData, 0, 0);
      const url = off.toDataURL('image/png');
      keepChromaUrl(src, url); // warm cache for future mounts
      setDataUrl(url);
    };
    img.onerror = () => setDataUrl(src); // fallback: show original
    img.src = src;
  }, [src]);

  return dataUrl;
}

// ── Content bounds ─────────────────────────────────────────────────────────────
// Scans post-chroma pixel data to find the tightest non-transparent bounding box.
// Use this to strip transparent padding before sizing / drawing sprites.
export function getContentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 8,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ── Cropped chroma data URL cache ─────────────────────────────────────────────
// Separate from chromaDataUrlCache — stores content-cropped versions.
export const chromaCroppedUrlCache = new Map<string, string>();

/**
 * Like useChromaKeyDataUrl but ALSO crops the result to the content bounding
 * box (strips transparent padding). Use this for all battle action sprites so
 * objectFit:contain always fills the container with the actual character body,
 * regardless of how much transparent padding the source image has.
 */
export function useChromaKeyCroppedDataUrl(src: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    chromaCroppedUrlCache.get(src) ?? null,
  );

  useEffect(() => {
    if (!src) return;
    const cached = chromaCroppedUrlCache.get(src);
    if (cached) { setDataUrl(cached); return; }

    setDataUrl(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width  = img.naturalWidth;
      off.height = img.naturalHeight;
      const ctx  = off.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, off.width, off.height);
      applyChromaKey(imageData.data);
      ctx.putImageData(imageData, 0, 0);

      // Crop to content bounds
      const bounds = getContentBounds(imageData.data, off.width, off.height);
      let url: string;
      if (bounds) {
        const crop = document.createElement('canvas');
        crop.width  = bounds.w;
        crop.height = bounds.h;
        const cctx  = crop.getContext('2d')!;
        cctx.drawImage(off, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
        url = crop.toDataURL('image/png');
      } else {
        url = off.toDataURL('image/png');
      }

      chromaCroppedUrlCache.set(src, url);
      setDataUrl(url);
    };
    img.onerror = () => setDataUrl(src);
    img.src = src;
  }, [src]);

  return dataUrl;
}