import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { preloadBgm } from '../components/BgmController';
import { LUCAS_FRAMES, lucasImgCache, lucasChromaCache } from '../utils/lucasCache';
import { EMMA_FRAMES, emmaImgCache, emmaChromaCache } from '../utils/emmaCache';
import { applyChromaKey, keepChromaUrl } from '../utils/chromaKey';
import { useAuth } from '../context/AuthContext';

// ── Static images to preload (no green-screen) ────────────────────────────────
const SPLASH_IMG        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776874245/Splash_screen_aygb5n.png';
const INTRO_BG          = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777395784/ChatGPT_Image_Apr_29_2026_12_02_36_AM_p3z4gf.png';
const GAME_BG           = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777396811/ChatGPT_Image_Apr_29_2026_12_19_32_AM_squmiv.png';
const HERO_DETAIL_BG    = 'https://res.cloudinary.com/dhkethrmc/image/upload/v1777381178/ChatGPT_Image_Apr_28_2026_07_59_00_PM_ud1ln3.png';
// Login / Register / HeroPage / Hero-Obtained shared background
const LOGIN_BG          = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777419184/ChatGPT_Image_Apr_29_2026_06_32_08_AM_hch81k.png';
// ── Character card illustrations (green-screen → chroma key) ─────────────────
const LUCAS_CARD_ILUST = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777386997/LUCAS_tyqcnf.png';
const EMMA_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777387003/emma_aqsnsd.png';

// ── Lucas skill illustrations (no chroma key needed) ──────────────────────────
const LUCAS_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777420534/sk1_lukas_65c48d.png';
const LUCAS_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777420599/sk2_luk_5f55c9.png';
const LUCAS_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777420393/sk3_lucas_5f4d58.png';
const LUCAS_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777420297/ult_lucas_4cf45e.png';

const STATIC_IMGS: string[] = [
  SPLASH_IMG, INTRO_BG, GAME_BG, HERO_DETAIL_BG,
  LOGIN_BG,
  LUCAS_SK1, LUCAS_SK2, LUCAS_SK3, LUCAS_ULT,
];

const TOTAL = STATIC_IMGS.length
  + 1 /*lucas card*/ + LUCAS_FRAMES.length + 1 /*lucas chroma*/
  + 1 /*emma card*/  + EMMA_FRAMES.length  + 1 /*emma chroma*/;

const MAX_WAIT_MS = 30_000;

// ── Build chroma-keyed canvas cache for Lucas ────────────────────────────────
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
        }
      }
      done++;
      if (done >= EMMA_FRAMES.length) onDone();
    }, 0);
  });
}

export default function LoadingPage() {
  const navigate              = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [progress, setProgress]          = useState(0);
  const loadedRef             = useRef(0);
  const navigatedRef          = useRef(false);
  const assetsReadyRef        = useRef(false);

  // ── Navigate once assets AND auth are both settled ──────────────────────────
  const tryNavigate = (authDone: boolean, authedUser: typeof user) => {
    if (!assetsReadyRef.current) return;
    if (!authDone) return;
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    const dest = authedUser ? '/splash' : '/language';
    setTimeout(() => navigate(dest, { replace: true }), 300);
  };

  const onSettled = () => {
    loadedRef.current += 1;
    const pct = Math.round((loadedRef.current / TOTAL) * 100);
    setProgress(pct);
    if (loadedRef.current >= TOTAL) {
      assetsReadyRef.current = true;
      tryNavigate(!authLoading, user);
    }
  };

  // Watch for auth to finish loading after assets are done
  useEffect(() => {
    if (!authLoading) {
      tryNavigate(true, user);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    loadedRef.current = 0;

    // ── 1. Static images ─────────────────────────────────────────────────────
    STATIC_IMGS.forEach(src => {
      const img   = new Image();
      img.onload  = onSettled;
      img.onerror = onSettled;
      img.src     = src;
    });

    // ── 2. Lucas card illustration — load + build chroma inline ──────────────
    const lucasCardImg = new Image();
    lucasCardImg.crossOrigin = 'anonymous';
    lucasCardImg.onload = () => {
      const off = document.createElement('canvas');
      off.width  = lucasCardImg.naturalWidth;
      off.height = lucasCardImg.naturalHeight;
      const ctx  = off.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(lucasCardImg, 0, 0);
        const id = ctx.getImageData(0, 0, off.width, off.height);
        applyChromaKey(id.data);
        ctx.putImageData(id, 0, 0);
        keepChromaUrl(LUCAS_CARD_ILUST, off.toDataURL('image/png'));
      }
      onSettled();
    };
    lucasCardImg.onerror = onSettled;
    lucasCardImg.src     = LUCAS_CARD_ILUST;

    // ── 3. Emma card illustration — load + build chroma inline ───────────────
    const emmaCardImg = new Image();
    emmaCardImg.crossOrigin = 'anonymous';
    emmaCardImg.onload = () => {
      const off = document.createElement('canvas');
      off.width  = emmaCardImg.naturalWidth;
      off.height = emmaCardImg.naturalHeight;
      const ctx  = off.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(emmaCardImg, 0, 0);
        const id = ctx.getImageData(0, 0, off.width, off.height);
        applyChromaKey(id.data);
        ctx.putImageData(id, 0, 0);
        keepChromaUrl(EMMA_CARD_ILUST, off.toDataURL('image/png'));
      }
      onSettled();
    };
    emmaCardImg.onerror = onSettled;
    emmaCardImg.src     = EMMA_CARD_ILUST;

    // ── 4. Lucas sprite frames ────────────────────────────────────────────────
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

    // ── 5. Emma sprite frames ─────────────────────────────────────────────────
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

    const safetyTimer = setTimeout(() => {
      if (navigatedRef.current) return;
      assetsReadyRef.current = true;
      navigatedRef.current = true;
      navigate(user ? '/splash' : '/language', { replace: true });
    }, MAX_WAIT_MS);
    return () => clearTimeout(safetyTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dot bounce: index 0,2 → down-phase; index 1,3 → up-phase
  const DOT_DUR = 900; // ms per full cycle

  return (
    <div style={{
      width: '100%', height: '100dvh',
      background: '#ffffff',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 'clamp(14px, 3vh, 32px)',
      overflow: 'hidden',
      fontFamily: "'Playfair Display', Georgia, serif",
    }}>

      {/* ── Keyframes ─────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes ldDot {
          0%, 100% { transform: translateY(-10px); }
          50%      { transform: translateY(10px);  }
        }
      `}</style>

      {/* ── "Loading" + dots row ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: 'clamp(8px, 1.5vw, 20px)',
        lineHeight: 1,
      }}>
        {/* Text */}
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(36px, min(10vw, 14vh), 14vh)',
          fontWeight: 900,
          color: '#ffffff',
          WebkitTextStroke: '7px #000000',
          paintOrder: 'stroke fill',
          letterSpacing: '0.03em',
          userSelect: 'none',
          display: 'block',
          lineHeight: 1,
        }}>Loading</span>

        {/* 4 bouncing dots */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 'clamp(5px, 1vw, 14px)',
          paddingBottom: 'clamp(2px, 0.4vh, 6px)',
          alignSelf: 'flex-end',
        }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width:  'clamp(8px, 1.4vw, 18px)',
              height: 'clamp(8px, 1.4vw, 18px)',
              borderRadius: '50%',
              background: '#000000',
              outline: '2.5px solid #000000',
              outlineOffset: '2px',
              boxSizing: 'border-box',
              animation: `ldDot ${DOT_DUR}ms ease-in-out infinite`,
              animationDelay: i % 2 === 0 ? `-${DOT_DUR / 2}ms` : '0ms',
            }}/>
          ))}
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <div style={{
        width: 'clamp(240px, 40vw, 500px)',
        height: 'clamp(14px, 2.4vh, 26px)',
        background: '#000000',
        borderRadius: '999px',
        padding: '3px',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #FF6200 0%, #FFA500 100%)',
          borderRadius: '999px',
          transition: 'width 0.14s linear',
          minWidth: progress > 2 ? 'clamp(12px, 2vw, 22px)' : '0px',
        }}/>
      </div>

    </div>
  );
}