/**
 * GameEnterPage — "Entering the Game" loading screen.
 *
 * Shown AFTER the player taps on the IntroPage (tap-to-start), BEFORE /game.
 * Responsibilities:
 *   1. Display cinematic art + branded loading bar
 *   2. Run PixiJS pre-warm imperatively (prewarmObtained + prewarmGallery)
 *      → WebGL context created, ALL cards built, ALL overlay textures
 *        uploaded to GPU BEFORE the player ever opens HeroPage.
 *   3. Navigate to /game once both the minimum display time has elapsed
 *      and the initial prewarm kicks off (async overlay stagger continues
 *      in background — player never feels a freeze).
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useHero }             from '../context/HeroContext';
import { HERO_GALLERY, getHeroIlust } from '../data/heroGallery';
import { HERO_RARITIES }       from '../components/HeroCard';
import { prewarmObtained, HeroData as PixiHeroData }  from '../components/PixiObtainedGrid';
import { prewarmGallery, GalleryHeroData }             from '../components/PixiGalleryGrid';
import { startBgm } from '../components/BgmController';

const ENTER_ART = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778095697/ChatGPT_Image_May_7_2026_02_25_42_AM_irn4gb.png';

// Minimum display time so the screen doesn't flash past instantly
const MIN_DISPLAY_MS = 3200;

function normRarity(r: string): string {
  const map: Record<string, string> = {
    C:'common', B:'rare', A:'epic', S:'legendary', SS:'mythic',
    common:'common', rare:'rare', epic:'epic', legendary:'legendary', mythic:'mythic',
  };
  return map[r] ?? 'common';
}

export default function GameEnterPage() {
  const navigate = useNavigate();
  const { ownedHeroes, isLoading: heroLoading } = useHero();
  const [progress, setProgress]   = useState(0);
  const [artLoaded, setArtLoaded] = useState(false);
  const prewarmDoneRef = useRef(false);
  const timerDoneRef   = useRef(false);
  const navigatedRef   = useRef(false);

  // ── Hero data — same computation as HeroPage ──────────────────────────────
  const pixiHeroes = useMemo<PixiHeroData[]>(() => {
    if (heroLoading) return [];
    return ownedHeroes.map(oh => {
      const rar = normRarity(oh.def.rarity);
      return {
        heroId:    oh.playerHero.hero_id,
        name:      oh.def.name ?? oh.playerHero.hero_id,
        rarity:    rar,
        heroType:  oh.def.hero_type ?? '',
        level:     oh.playerHero.level ?? 1,
        stars:     oh.playerHero.stars ?? (HERO_RARITIES.find(r => r.id === rar)?.stars ?? 1),
        illustUrl: getHeroIlust(oh.playerHero.hero_id) ?? '',
      };
    });
  }, [heroLoading, ownedHeroes]);

  const galleryHeroes = useMemo<GalleryHeroData[]>(() => {
    if (heroLoading) return [];
    return HERO_GALLERY.map(h => {
      const hasIllust = !!(h.ilust?.trim());
      const isLocked  = !hasIllust;
      const rar       = normRarity(h.rarity);
      const owned     = ownedHeroes.find(oh => oh.playerHero.hero_id === h.heroId);
      const heroCfg   = HERO_RARITIES.find(r => r.id === rar) ?? HERO_RARITIES[4];
      return {
        heroId:    h.heroId,
        name:      h.name,
        rarity:    rar,
        heroType:  h.heroType,
        level:     owned?.playerHero.level ?? 1,
        stars:     owned?.playerHero.stars ?? heroCfg.stars,
        illustUrl: isLocked ? '' : (h.ilust ?? ''),
        isLocked,
      };
    });
  }, [heroLoading, ownedHeroes]);

  // ── Navigate when both conditions met ────────────────────────────────────
  const tryEnter = () => {
    if (!prewarmDoneRef.current || !timerDoneRef.current || navigatedRef.current) return;
    navigatedRef.current = true;
    setProgress(100);
    setTimeout(() => navigate('/game', { replace: true }), 220);
  };

  // ── Minimum display timer + progress animation ───────────────────────────
  useEffect(() => {
    // Animate progress bar: fast to 85%, then hold until prewarm signals done
    let raf = 0;
    const start = performance.now();
    const FAST_PHASE = MIN_DISPLAY_MS * 0.72; // 72% of time to reach 85%

    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed < FAST_PHASE) {
        setProgress(Math.round((elapsed / FAST_PHASE) * 85));
      } else if (!prewarmDoneRef.current) {
        // Slow crawl while waiting for prewarm
        const extra = elapsed - FAST_PHASE;
        setProgress(Math.min(97, 85 + Math.round((extra / 4000) * 12)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const timer = setTimeout(() => {
      timerDoneRef.current = true;
      tryEnter();
    }, MIN_DISPLAY_MS);

    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Run prewarm once hero data is available ──────────────────────────────
  useEffect(() => {
    if (heroLoading || prewarmDoneRef.current) return;

    // Start BGM on this gesture-free opportunity (audio policy allows after login)
    startBgm();

    prewarmObtained(pixiHeroes);
    prewarmGallery(galleryHeroes);

    // Mark prewarm as kicked off — the actual overlay stagger continues in BG
    prewarmDoneRef.current = true;
    tryEnter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroLoading, pixiHeroes, galleryHeroes]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100dvh',
      overflow: 'hidden',
      background: '#04080f',
      fontFamily: "'Playfair Display', Georgia, serif",
    }}>
      {/* ── Full-screen art ───────────────────────────────────────────────── */}
      <img
        src={ENTER_ART}
        alt=""
        onLoad={() => setArtLoaded(true)}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          objectPosition: 'center center',
          opacity: artLoaded ? 1 : 0,
          transition: 'opacity 0.5s ease',
          userSelect: 'none', pointerEvents: 'none',
        }}
        draggable={false}
      />

      {/* ── Vignette ──────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(4,8,15,0.1) 25%, rgba(4,8,15,0.45) 65%, rgba(4,8,15,0.93) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Bottom bar zone ───────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        padding: '0 0 18px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
      }}>
        {/* Label */}
        <p style={{
          margin: '0 0 10px 0',
          color: 'rgba(215, 235, 255, 0.82)',
          fontSize: '13px',
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 600,
          letterSpacing: '0.05em',
          textAlign: 'center',
          textShadow: '0 1px 8px rgba(0,0,0,0.9)',
          userSelect: 'none',
        }}>
          Preparing Your Journey &mdash; Entering the Game
        </p>

        {/* Track */}
        <div style={{
          width: '100%',
          height: '22px',
          background: 'rgba(0, 0, 0, 0.55)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Fill */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #001f5c 0%, #1a4db5 45%, #4d88ff 100%)',
            transition: 'width 0.18s linear',
            boxShadow: '0 0 18px rgba(77,136,255,0.5)',
          }} />
          {/* Shimmer sweep */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            width: `${progress}%`,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
            backgroundSize: '60px 100%',
            backgroundRepeat: 'repeat-x',
            animation: 'shimmerBarEnter 1.4s linear infinite',
            pointerEvents: 'none',
          }} />
          {/* Top shine line */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0,
            width: `${progress}%`,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(150,200,255,0.7) 40%, rgba(150,200,255,0.3) 100%)',
          }} />
        </div>
      </div>

      <style>{`
        @keyframes shimmerBarEnter {
          0%   { background-position: -120px 0; }
          100% { background-position: 300px 0; }
        }
      `}</style>
    </div>
  );
}
