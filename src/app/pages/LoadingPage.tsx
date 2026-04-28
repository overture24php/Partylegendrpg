import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { preloadBgm } from '../components/BgmController';
import { LUCAS_FRAMES, lucasImgCache, lucasChromaCache } from '../utils/lucasCache';
import { EMMA_FRAMES, emmaImgCache, emmaChromaCache } from '../utils/emmaCache';
import { applyChromaKey, chromaDataUrlCache } from '../utils/chromaKey';

// ── Static images (no green-screen, loaded normally) ─────────────────────────
const BG         = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776870641/afcdfbf9-c32b-47d9-b062-7f93ea8573ce.png';
const SPLASH_IMG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776874245/Splash_screen_aygb5n.png';
const INTRO_BG   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776873949/Gemini_Generated_Image_gx2lk8gx2lk8gx2l_uezsg9.png';
const GAME_BG    = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777381395/e0da204d-9767-44b3-99b8-adc3f63f2a40_n9k068.png';
// Hero detail background (used in HeroDetailView)
const HERO_DETAIL_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/v1777381178/ChatGPT_Image_Apr_28_2026_07_59_00_PM_ud1ln3.png';
// Lucas portrait background (used in HeroDetailView portrait mode — AI art, no bg removal)
const LUCAS_PORTRAIT_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/v1777379718/ChatGPT_Image_Apr_28_2026_07_34_14_PM_uxwirc.png';
// Emma portrait background (used in EmmaDetailView portrait mode — AI art, no bg removal)
const EMMA_PORTRAIT_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/v1777379725/ChatGPT_Image_Apr_28_2026_07_34_25_PM_tdq9gi.png';

// ── Character card illustrations (green-screen, need crossOrigin + chroma key) ─
// Card ilust = frame 1 of each hero — preloaded here so useChromaKeyDataUrl()
// in HeroPage finds it in browser cache immediately.
const LUCAS_CARD_ILUST = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777378794/lcs1_vh9tjj.png';
const EMMA_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777378782/em1_gpl2ri.png';

// Static images to preload (normal Image(), no crossOrigin needed)
const STATIC_IMGS: string[] = [SPLASH_IMG, INTRO_BG, GAME_BG, HERO_DETAIL_BG, LUCAS_PORTRAIT_BG, EMMA_PORTRAIT_BG];

// Total asset count (auto-updates when frame arrays grow):
//   static + lucas_card + lucas_frames + lucas_chroma_build
//         + emma_card   + emma_frames  + emma_chroma_build
const TOTAL = STATIC_IMGS.length
  + 1 /*lucas card*/ + LUCAS_FRAMES.length + 1 /*lucas chroma*/
  + 1 /*emma card*/  + EMMA_FRAMES.length  + 1 /*emma chroma*/;

// Safety-net max wait: 30 s
const MAX_WAIT_MS = 30_000;

// ── Build chroma-keyed canvas cache for Lucas ─────────────────────────────────
function buildLucasChromaCache(onDone: () => void): void {
  let done = 0;
  LUCAS_FRAMES.forEach((_, i) => {
    setTimeout(() => {
      const img = lucasImgCache[i];
      if (img && img.naturalWidth > 0) {
        const off = document.createElement('canvas');
        off.width  = img.naturalWidth;
        off.height = img.naturalHeight;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, off.width, off.height);
          applyChromaKey(id.data);
          ctx.putImageData(id, 0, 0);
          lucasChromaCache[i] = off;
          // ★ Pre-warm chromaDataUrlCache for frame 0 (= card illustration)
          if (i === 0) {
            chromaDataUrlCache.set(LUCAS_CARD_ILUST, off.toDataURL('image/png'));
          }
        }
      }
      done++;
      if (done >= LUCAS_FRAMES.length) onDone();
    }, 0);
  });
}

// ── Build chroma-keyed canvas cache for Emma ──────────────────────────────────
function buildEmmaChromaCache(onDone: () => void): void {
  let done = 0;
  EMMA_FRAMES.forEach((_, i) => {
    setTimeout(() => {
      const img = emmaImgCache[i];
      if (img && img.naturalWidth > 0) {
        const off = document.createElement('canvas');
        off.width  = img.naturalWidth;
        off.height = img.naturalHeight;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, off.width, off.height);
          applyChromaKey(id.data);
          ctx.putImageData(id, 0, 0);
          emmaChromaCache[i] = off;
          // ★ Pre-warm chromaDataUrlCache for frame 0 (= card illustration)
          if (i === 0) {
            chromaDataUrlCache.set(EMMA_CARD_ILUST, off.toDataURL('image/png'));
          }
        }
      }
      done++;
      if (done >= EMMA_FRAMES.length) onDone();
    }, 0);
  });
}

export default function LoadingPage() {
  const navigate     = useNavigate();
  const [progress, setProgress] = useState(0);
  const loadedRef    = useRef(0);
  const navigatedRef = useRef(false);

  const onSettled = () => {
    loadedRef.current += 1;
    const pct = Math.round((loadedRef.current / TOTAL) * 100);
    setProgress(pct);
    if (loadedRef.current >= TOTAL) {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      setTimeout(() => navigate('/splash', { replace: true }), 300);
    }
  };

  useEffect(() => {
    loadedRef.current = 0;

    // ── 1. Static images ─────────────────────────────────────────────────────
    STATIC_IMGS.forEach(src => {
      const img   = new Image();
      img.onload  = onSettled;
      img.onerror = onSettled;
      img.src     = src;
    });

    // ── 2. Lucas card illustration ────────────────────────────────────────────
    const lucasCardImg = new Image();
    lucasCardImg.crossOrigin = 'anonymous';
    lucasCardImg.onload  = onSettled;
    lucasCardImg.onerror = onSettled;
    lucasCardImg.src     = LUCAS_CARD_ILUST;

    // ── 3. Emma card illustration ─────────────────────────────────────────────
    const emmaCardImg = new Image();
    emmaCardImg.crossOrigin = 'anonymous';
    emmaCardImg.onload  = onSettled;
    emmaCardImg.onerror = onSettled;
    emmaCardImg.src     = EMMA_CARD_ILUST;

    // ── 4. Lucas sprite frames (5) ────────────────────────────────────────────
    let lucasSpriteDone = 0;
    LUCAS_FRAMES.forEach((src, i) => {
      const existing = lucasImgCache[i];
      if (existing?.naturalWidth > 0) {
        lucasSpriteDone++;
        onSettled();
        if (lucasSpriteDone >= LUCAS_FRAMES.length) buildLucasChromaCache(onSettled);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        lucasImgCache[i] = img;
        lucasSpriteDone++;
        onSettled();
        if (lucasSpriteDone >= LUCAS_FRAMES.length) buildLucasChromaCache(onSettled);
      };
      img.src = src;
    });

    // ── 5. Emma sprite frames (5) ─────────────────────────────────────────────
    let emmaSpriteDone = 0;
    EMMA_FRAMES.forEach((src, i) => {
      const existing = emmaImgCache[i];
      if (existing?.naturalWidth > 0) {
        emmaSpriteDone++;
        onSettled();
        if (emmaSpriteDone >= EMMA_FRAMES.length) buildEmmaChromaCache(onSettled);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        emmaImgCache[i] = img;
        emmaSpriteDone++;
        onSettled();
        if (emmaSpriteDone >= EMMA_FRAMES.length) buildEmmaChromaCache(onSettled);
      };
      img.src = src;
    });

    // ── 6. Preload BGM ────────────────────────────────────────────────────────
    preloadBgm();

    // Safety-net: navigate even if some images stall
    const safetyTimer = setTimeout(() => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      navigate('/splash', { replace: true });
    }, MAX_WAIT_MS);
    return () => clearTimeout(safetyTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="size-full relative overflow-hidden" style={{ background: '#000' }}>
      <ImageWithFallback
        src={BG}
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: '3px', background: 'rgba(255,255,255,0.15)' }}>
        <div
          className="h-full"
          style={{
            width: `${progress}%`,
            background: '#fff',
            transition: 'width 0.12s linear',
          }}
        />
      </div>
    </div>
  );
}