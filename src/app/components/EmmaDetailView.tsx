/**
 * EmmaDetailView — thin wrapper around HeroDetailView.
 * Provides Emma's sprite player and portrait BG; all layout/UI comes from HeroDetailView.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { HeroDetailView } from './HeroDetailView';
import {
  EMMA_FRAMES, emmaImgCache, isEmmaCacheReady,
  EMMA_FRAME_MS, EMMA_PINGPONG, emmaChromaCache, isEmmaChromaCacheReady,
} from '../utils/emmaCache';
import { applyChromaKey } from '../utils/chromaKey';

// ─── Emma portrait BG (static, no bg-removal) ────────────────────────────────
const EMMA_PORTRAIT_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/v1777379725/ChatGPT_Image_Apr_28_2026_07_34_25_PM_tdq9gi.png';

// ─── Emma Sprite Player ───────────────────────────────────────────────────────
function EmmaSpritePlayer({ rarityColor }: { rarityColor: string }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef     = useRef<HTMLImageElement[]>([]);
  const seqRef       = useRef(0);
  const rafRef       = useRef<number | null>(null);
  const lastTimeRef  = useRef<number>(-Infinity);

  const [loaded, setLoaded] = useState<boolean>(() => {
    if (isEmmaChromaCacheReady() || isEmmaCacheReady()) {
      cacheRef.current = emmaImgCache.slice();
      return true;
    }
    return false;
  });

  const drawFrame = useCallback((frameIdx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cW = canvas.width;
    const cH = canvas.height;

    const chromaCanvas = emmaChromaCache[frameIdx];
    const rawImg       = cacheRef.current[frameIdx];
    if (!chromaCanvas && (!rawImg || rawImg.naturalWidth === 0)) return;

    const srcW  = chromaCanvas ? chromaCanvas.width  : rawImg.naturalWidth;
    const srcH  = chromaCanvas ? chromaCanvas.height : rawImg.naturalHeight;
    const scale = Math.min(cW / srcW, (17 * cH) / (20 * srcH));
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const colW  = (cW + 336) / 20;
    const dx    = (cW - drawW) / 2 - colW;
    const dy    = 17 * cH / 20 - drawH;

    ctx.clearRect(0, 0, cW, cH);
    if (chromaCanvas) {
      ctx.drawImage(chromaCanvas, dx, dy, drawW, drawH);
    } else {
      const off = document.createElement('canvas');
      off.width  = Math.ceil(drawW);
      off.height = Math.ceil(drawH);
      const offCtx = off.getContext('2d', { willReadFrequently: true });
      if (!offCtx) return;
      offCtx.drawImage(rawImg, 0, 0, off.width, off.height);
      const id = offCtx.getImageData(0, 0, off.width, off.height);
      applyChromaKey(id.data);
      offCtx.putImageData(id, 0, 0);
      ctx.drawImage(off, dx, dy, drawW, drawH);
    }
  }, []);

  // Fallback preload if LoadingPage was skipped
  useEffect(() => {
    if (loaded) return;
    let settled = 0;
    EMMA_FRAMES.forEach((src, i) => {
      const existing = emmaImgCache[i];
      if (existing?.naturalWidth > 0) {
        settled++;
        if (settled >= EMMA_FRAMES.length) { cacheRef.current = emmaImgCache.slice(); setLoaded(true); }
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        emmaImgCache[i] = img;
        settled++;
        if (settled >= EMMA_FRAMES.length) { cacheRef.current = emmaImgCache.slice(); setLoaded(true); }
      };
      img.src = src;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas resize → redraw immediately
  useEffect(() => {
    const canvas = canvasRef.current;
    const el     = containerRef.current;
    if (!canvas || !el) return;
    const sync = () => {
      canvas.width  = el.clientWidth  || 300;
      canvas.height = el.clientHeight || 500;
      drawFrame(EMMA_PINGPONG[seqRef.current]);
      lastTimeRef.current = performance.now();
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawFrame]);

  // RAF loop
  useEffect(() => {
    if (!loaded) return;
    seqRef.current = 0;
    lastTimeRef.current = -Infinity;
    drawFrame(EMMA_PINGPONG[0]);
    lastTimeRef.current = performance.now();

    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (ts - lastTimeRef.current < EMMA_FRAME_MS) return;
      lastTimeRef.current = ts;
      seqRef.current = (seqRef.current + 1) % EMMA_PINGPONG.length;
      drawFrame(EMMA_PINGPONG[seqRef.current]);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [loaded, drawFrame]);

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '92%', width: '100%' }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.10) 50%,rgba(255,255,255,0.04) 100%)',
          borderRadius: '8px', animation: 'pulse 1.5s infinite',
        }}/>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block', width: '100%', height: '100%',
          filter: `drop-shadow(0 0 40px ${rarityColor}55) drop-shadow(0 8px 24px rgba(0,0,0,0.9))`,
          pointerEvents: 'none', userSelect: 'none',
        }}
      />
    </div>
  );
}

// ─── Props mirror HeroDetailView ──────────────────────────────────────────────
interface EmmaDetailViewProps {
  name: string; rarity: string; rarityLabel: string;
  rarityColor: string; rarityShine: string;
  level: number; ilust: string;
  stats: { hp: number; pAtk: number; mAtk: number; pDef: number; mDef: number; speed: number; expCurrent: number; expMax: number; };
  onClose: () => void;
}

export function EmmaDetailView(props: EmmaDetailViewProps) {
  return (
    <HeroDetailView
      {...props}
      portraitBg={EMMA_PORTRAIT_BG}
      spritePlayer={<EmmaSpritePlayer rarityColor={props.rarityColor} />}
    />
  );
}