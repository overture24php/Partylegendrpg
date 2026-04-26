import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { preloadBgm } from '../components/BgmController';
import { LUCAS_FRAMES, lucasImgCache } from '../utils/lucasCache';

const BG         = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776870641/afcdfbf9-c32b-47d9-b062-7f93ea8573ce.png';
const SPLASH_IMG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776874245/Splash_screen_aygb5n.png';
const INTRO_BG   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776873949/Gemini_Generated_Image_gx2lk8gx2lk8gx2l_uezsg9.png';
const GAME_BG    = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777055893/ef374537-5227-45d1-a733-55bceddc2549.png';

// ─── Hero assets ─────────────────────────────────────────────────────────────
const SPRITE_BASE  = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto';
const LUCAS_ILUST  = `${SPRITE_BASE}/v1777137886/ILUST_LUCAS_rpwdoz.png`;
const HERO_DETAIL_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777208680/copy_of_d418651b-bb45-48b4-bce7-4152ac79bac1_f1c136.png';

// ─── Static images (non-sprite) ───────────────────────────────────────────────
const STATIC_IMGS: string[] = [SPLASH_IMG, INTRO_BG, GAME_BG, LUCAS_ILUST, HERO_DETAIL_BG];

// Total: static + sprite frames (with duplicates)
const TOTAL = STATIC_IMGS.length + LUCAS_FRAMES.length;
// Safety-net max wait: 30 s
const MAX_WAIT_MS = 30_000;

export default function LoadingPage() {
  const navigate    = useNavigate();
  const [progress, setProgress] = useState(0);
  const loadedRef   = useRef(0);
  const navigatedRef = useRef(false);

  const tryNavigate = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    setTimeout(() => navigate('/splash', { replace: true }), 300);
  };

  // ── Actual image preloading — drives progress bar ─────────────────────────
  useEffect(() => {
    loadedRef.current = 0;

    const onSettled = () => {
      loadedRef.current += 1;
      const pct = Math.round((loadedRef.current / TOTAL) * 100);
      setProgress(pct);
      if (loadedRef.current >= TOTAL) tryNavigate();
    };

    // ── Static images — load normally ────────────────────────────────────────
    STATIC_IMGS.forEach(src => {
      const img   = new Image();
      img.onload  = onSettled;
      img.onerror = onSettled;
      img.src     = src;
    });

    // ── Lucas sprite frames — store INTO global cache so LucasSpritePlayer
    //    can use the same HTMLImageElement objects (zero re-decode delay) ──────
    LUCAS_FRAMES.forEach((src, i) => {
      // Duplicate URLs share the same object reference
      const existing = lucasImgCache[i];
      if (existing?.naturalWidth > 0) { onSettled(); return; }

      // Check if a same-URL slot already loaded in this batch
      const dupIdx = LUCAS_FRAMES.indexOf(src);
      if (dupIdx < i && lucasImgCache[dupIdx]?.naturalWidth > 0) {
        lucasImgCache[i] = lucasImgCache[dupIdx];
        onSettled();
        return;
      }

      const img   = new Image();
      img.onload  = img.onerror = () => { lucasImgCache[i] = img; onSettled(); };
      img.src     = src;
    });

    // Preload BGM audio buffer
    preloadBgm();

    // Safety-net: navigate even if some images stall
    const safetyTimer = setTimeout(tryNavigate, MAX_WAIT_MS);
    return () => clearTimeout(safetyTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="size-full relative overflow-hidden" style={{ background: '#000' }}>
      {/* Background image */}
      <ImageWithFallback
        src={BG}
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      {/* Dark overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />

      {/* Progress bar — edge to edge, fixed at bottom */}
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