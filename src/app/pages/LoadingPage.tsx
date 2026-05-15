import { applyChromaKey, keepChromaUrl, chromaDataUrlCache } from '../utils/chromaKey';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { preloadBgm } from '../components/BgmController';
import { LUCAS_FRAMES, lucasImgCache, lucasChromaCache } from '../utils/lucasCache';
import { EMMA_FRAMES, emmaImgCache, emmaChromaCache } from '../utils/emmaCache';
import { useAuth } from '../context/AuthContext';
import { ALL_SKILL_ICON_URLS, warmSkillIconCache } from '../utils/skillIconCache';

// ─── Loading Page Art ─────────────────────────────────────────────────────────
const LOADING_ART = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778580970/ChatGPT_Image_May_12_2026_05_13_43_PM_tzps4j.png';

// ─── Backgrounds ──────────────────────────────────────────────────────────────
const SPLASH_IMG     = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776874245/Splash_screen_aygb5n.png';
const INTRO_BG       = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778581178/ChatGPT_Image_May_12_2026_05_19_10_PM_gge7ua.png';
const GAME_BG        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778581730/ChatGPT_Image_May_12_2026_05_27_59_PM_nk8qi9.png';
const HERO_DETAIL_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777381178/ChatGPT_Image_Apr_28_2026_07_59_00_PM_ud1ln3.png';
const LOGIN_BG       = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777419184/ChatGPT_Image_Apr_29_2026_06_32_08_AM_hch81k.png';
const MAP_URL        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777566900/ChatGPT_Image_Apr_30_2026_11_34_05_PM_ptwl1w.png';
const GRASS_URL      = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778582261/ChatGPT_Image_May_12_2026_05_36_52_PM_acnp8s.png';
const BATTLE_BG_URL  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778582261/ChatGPT_Image_May_12_2026_05_36_52_PM_acnp8s.png';

// ─── Card illustrations ───────────────────────────────────────────────────────
const LUCAS_CARD_ILUST = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777386997/LUCAS_tyqcnf.png';
const EMMA_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777387003/emma_aqsnsd.png';
const GORR_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058398/ChatGPT_Image_May_6_2026_03_41_03_PM_hxymbk.png';
const CRAW_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058474/ChatGPT_Image_May_6_2026_03_43_04_PM_u0dyy5.png';
const MYKO_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058438/ChatGPT_Image_May_6_2026_03_42_51_PM_o43yt7.png';

// ─── Tavern banner ────────────────────────────────────────────────────────────
const BANNER_TAVERN = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777895161/60d9c15d-f208-4d63-b2ac-9c93cde4e1a5.png';

// ─── Battle sprites ───────────────────────────────────────────────────────────
const LUCAS_IDLE_BATTLE  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778581164/ChatGPT_Image_May_12_2026_05_17_54_PM_qpcmql.png';
const LUCAS_ACTION_BATTLE= 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778581168/ChatGPT_Image_May_12_2026_05_18_02_PM_z86xuq.png';
const EMMA_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778582268/ChatGPT_Image_May_12_2026_05_36_13_PM_qjuyrf.png';
const EMMA_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778582682/ChatGPT_Image_May_12_2026_05_43_02_PM_f7qdru.png';
const BRENNAN_IDLE_BATTLE= 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778583271/ChatGPT_Image_May_12_2026_05_53_56_PM_togkgz.png';
const BRENNAN_ACTION     = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778583274/ChatGPT_Image_May_12_2026_05_54_05_PM_hajvwj.png';
const SYLVIE_IDLE_BATTLE = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778580980/ChatGPT_Image_May_12_2026_04_43_15_PM_t7x8y6.png';
const SYLVIE_ACTION      = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778580985/ChatGPT_Image_May_12_2026_05_00_54_PM_fxc6xq.png';
const GORR_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778652441/ChatGPT_Image_May_12_2026_07_53_17_PM_ozxezi.png';
const GORR_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778652445/ChatGPT_Image_May_12_2026_07_38_40_PM_vm3jgr.png';
const CRAW_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655882/ChatGPT_Image_May_13_2026_01_18_14_PM_cpsmfh.png';
const CRAW_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655888/ChatGPT_Image_May_13_2026_01_18_55_PM_latgcz.png';
const MYKO_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655921/ChatGPT_Image_May_13_2026_01_22_27_PM_o4bmxo.png';
const MYKO_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655927/ChatGPT_Image_May_13_2026_01_20_03_PM_rrxuvi.png';
const FANG_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655909/ChatGPT_Image_May_13_2026_01_20_59_PM_eahwgh.png';
const FANG_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655913/ChatGPT_Image_May_13_2026_01_21_29_PM_dsydt0.png';
const CLOVER_IDLE_BATTLE = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655952/ChatGPT_Image_May_13_2026_01_22_50_PM_xgsxyn.png';
const CLOVER_ACTION      = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655958/ChatGPT_Image_May_13_2026_01_23_38_PM_sd92n5.png';
const BOLO_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655977/ChatGPT_Image_May_13_2026_01_25_09_PM_vvn2zp.png';
const BOLO_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655988/ChatGPT_Image_May_13_2026_01_28_44_PM_oxtxu1.png';
const QUILL_IDLE_BATTLE  = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655966/ChatGPT_Image_May_13_2026_01_24_15_PM_pzebat.png';
const QUILL_ACTION       = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655972/ChatGPT_Image_May_13_2026_01_24_51_PM_fscxoj.png';

// ─── Static sprites ───────────────────────────────────────────────────────────
const LUCAS_ACTION  = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777631550/act_luc_mhmivj.png';
const RSLIME_IDLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655860/ChatGPT_Image_May_13_2026_01_16_26_PM_zsqkno.png';
const ASLIME_IDLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778655816/ChatGPT_Image_May_12_2026_06_50_49_PM_jf5slk.png';
const WSLIME_IDLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778652452/ChatGPT_Image_May_12_2026_06_45_40_PM_aftzie.png';

// ─── Slime gallery cards ──────────────────────────────────────────────────────
const RSLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545681/ChatGPT_Image_Apr_30_2026_05_38_28_PM_wzt4ox.png';
const ASLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545738/ChatGPT_Image_Apr_30_2026_05_39_48_PM_oq2njh.png';
const WSLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png';

// ─── Skill icons ──────────────────────────────────────────────────────────────
// (All skill icon URLs are now managed exclusively in skillIconCache.ts)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Audio ────────────────────────────────────────────────────────────────────
const BTN_SFX_URL      = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777874441/emilianodleon-select-button-ui-395763_zildua.mp3';
const CARD_SFX_URL     = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777817847/freesound_community-card-sounds-35956_xd0rrn.mp3';
const BACK_SFX_URL     = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777817753/dragon-studio-button-press-382713_rd1cyr.mp3';
const START_BATTLE_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777824497/dragon-studio-sword-slice-2-393845_xq3npe.mp3';
const LUCAS_ATTACK_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777817667/freesound_community-hit-swing-sword-small-2-95566_ewoib0.mp3';
const BULLET_SFX_URL   = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777825985/u_xpdo8dyg08-bullet-382829_kgh16n.mp3';
const HEAL_SFX_URL     = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826228/yodguard-healing-magic-3-378664_o03eoj.mp3';
const WATER_SFX_URL    = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826345/freesound_community-water-splash-46402_v24mak.mp3';
const SHIELD_SFX_URL   = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826444/freesound_community-shield-guard-6963_xywxza.mp3';
const PUNCH_SFX_URL    = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872406/soraatwod-punch-416719_al8u2e.mp3';
const BATTLE_BGM_URL   = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872315/backgroundmusicforvideos-epic-background-music-484342_qc73ue.mp3';
const VICTORY_SFX_URL  = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872713/universfield-open-new-level-143027_d9hese.mp3';
const DEFEAT_SFX_URL   = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872778/universfield-marimba-lose-250960_s2ocax.mp3';

// ─── Asset list ───────────────────────────────────────────────────────────────
const STATIC_IMGS: string[] = [
  SPLASH_IMG, INTRO_BG, GAME_BG, HERO_DETAIL_BG, LOGIN_BG,
  MAP_URL, GRASS_URL, BATTLE_BG_URL,
  LUCAS_ACTION, RSLIME_IDLE, ASLIME_IDLE, WSLIME_IDLE,
  RSLIME_CARD, ASLIME_CARD, WSLIME_CARD,
  // bgremoval battle sprites (already transparent, no chroma needed)
  GORR_IDLE_BATTLE, GORR_ACTION,
  CRAW_IDLE_BATTLE, CRAW_ACTION,
  MYKO_IDLE_BATTLE, MYKO_ACTION,
  FANG_IDLE_BATTLE, FANG_ACTION,
  CLOVER_IDLE_BATTLE, CLOVER_ACTION,
  BOLO_IDLE_BATTLE, BOLO_ACTION,
  QUILL_IDLE_BATTLE, QUILL_ACTION,
];

const CHROMA_SINGLE: [string, string][] = [
  [LUCAS_CARD_ILUST,  LUCAS_CARD_ILUST],
  [EMMA_CARD_ILUST,   EMMA_CARD_ILUST],
  [BANNER_TAVERN,     BANNER_TAVERN],
  [GORR_CARD_ILUST,   GORR_CARD_ILUST],
  [CRAW_CARD_ILUST,   CRAW_CARD_ILUST],
  [MYKO_CARD_ILUST,   MYKO_CARD_ILUST],
  [LUCAS_IDLE_BATTLE,  LUCAS_IDLE_BATTLE],
  [LUCAS_ACTION_BATTLE,LUCAS_ACTION_BATTLE],
  [EMMA_IDLE_BATTLE,   EMMA_IDLE_BATTLE],
  [EMMA_ACTION,        EMMA_ACTION],
  // ── Brennan card + battle sprites (chroma) ────────────────────────────────
  ['https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778243229/ChatGPT_Image_May_8_2026_07_24_30_PM_t5y2zh.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778243229/ChatGPT_Image_May_8_2026_07_24_30_PM_t5y2zh.png'],
  [BRENNAN_IDLE_BATTLE, BRENNAN_IDLE_BATTLE],
  [BRENNAN_ACTION,      BRENNAN_ACTION],
  // ── Sylvie card + battle sprites (chroma) ─────────────────────────────────
  ['https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778253528/ChatGPT_Image_May_8_2026_10_17_57_PM_bxj16w.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778253528/ChatGPT_Image_May_8_2026_10_17_57_PM_bxj16w.png'],
  [SYLVIE_IDLE_BATTLE,  SYLVIE_IDLE_BATTLE],
  [SYLVIE_ACTION,       SYLVIE_ACTION],
];

const TOTAL =
  STATIC_IMGS.length
  + CHROMA_SINGLE.length
  + LUCAS_FRAMES.length + 1
  + EMMA_FRAMES.length  + 1
  + ALL_SKILL_ICON_URLS.length;

const MAX_WAIT_MS = 45_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildSingleChroma(url: string, cacheKey: string, onDone: () => void): void {
  if (chromaDataUrlCache.has(cacheKey)) { onDone(); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const off = document.createElement('canvas');
    off.width  = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx  = off.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, off.width, off.height);
      applyChromaKey(id.data);
      ctx.putImageData(id, 0, 0);
      keepChromaUrl(cacheKey, off.toDataURL('image/png'));
    }
    onDone();
  };
  img.onerror = onDone;
  img.src = url;
}

function buildLucasChromaCache(onDone: () => void): void {
  let done = 0;
  const total = LUCAS_FRAMES.length;
  LUCAS_FRAMES.forEach((_, i) => {
    setTimeout(() => {
      const img = lucasImgCache[i];
      if (img && img.naturalWidth > 0) {
        const off = document.createElement('canvas');
        off.width  = img.naturalWidth; off.height = img.naturalHeight;
        const ctx  = off.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, off.width, off.height);
          applyChromaKey(id.data);
          ctx.putImageData(id, 0, 0);
          lucasChromaCache[i] = off;
        }
      }
      if (++done >= total) onDone();
    }, 0);
  });
}

function buildEmmaChromaCache(onDone: () => void): void {
  let done = 0;
  const total = EMMA_FRAMES.length;
  EMMA_FRAMES.forEach((_, i) => {
    setTimeout(() => {
      const img = emmaImgCache[i];
      if (img && img.naturalWidth > 0) {
        const off = document.createElement('canvas');
        off.width  = img.naturalWidth; off.height = img.naturalHeight;
        const ctx  = off.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, off.width, off.height);
          applyChromaKey(id.data);
          ctx.putImageData(id, 0, 0);
          emmaChromaCache[i] = off;
        }
      }
      if (++done >= total) onDone();
    }, 0);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LoadingPage() {
  const navigate  = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [progress, setProgress]    = useState(0);
  const [artLoaded, setArtLoaded]  = useState(false);
  const loadedRef      = useRef(0);
  const navigatedRef   = useRef(false);
  const assetsReadyRef = useRef(false);

  const tryNavigate = (authDone: boolean, authedUser: typeof user) => {
    if (!assetsReadyRef.current || !authDone || navigatedRef.current) return;
    navigatedRef.current = true;
    const dest = authedUser ? '/splash' : '/language';
    setTimeout(() => navigate(dest, { replace: true }), 300);
  };

  const onSettled = () => {
    loadedRef.current += 1;
    setProgress(Math.round((loadedRef.current / TOTAL) * 100));
    if (loadedRef.current >= TOTAL) {
      assetsReadyRef.current = true;
      tryNavigate(!authLoading, user);
    }
  };

  useEffect(() => {
    if (!authLoading) tryNavigate(true, user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    loadedRef.current = 0;

    STATIC_IMGS.forEach(src => {
      const img = new Image();
      img.onload = img.onerror = onSettled;
      img.src = src;
    });

    CHROMA_SINGLE.forEach(([key, url]) => buildSingleChroma(url, key, onSettled));

    let lucasDone = 0;
    LUCAS_FRAMES.forEach((src, i) => {
      const existing = lucasImgCache[i];
      if (existing?.naturalWidth > 0) {
        lucasImgCache[i] = existing; lucasDone++; onSettled();
        if (lucasDone >= LUCAS_FRAMES.length) buildLucasChromaCache(onSettled);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        lucasImgCache[i] = img; lucasDone++; onSettled();
        if (lucasDone >= LUCAS_FRAMES.length) buildLucasChromaCache(onSettled);
      };
      img.src = src;
    });

    let emmaDone = 0;
    EMMA_FRAMES.forEach((src, i) => {
      const existing = emmaImgCache[i];
      if (existing?.naturalWidth > 0) {
        emmaImgCache[i] = existing; emmaDone++; onSettled();
        if (emmaDone >= EMMA_FRAMES.length) buildEmmaChromaCache(onSettled);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        emmaImgCache[i] = img; emmaDone++; onSettled();
        if (emmaDone >= EMMA_FRAMES.length) buildEmmaChromaCache(onSettled);
      };
      img.src = src;
    });

    preloadBgm();
    [BTN_SFX_URL, CARD_SFX_URL, BACK_SFX_URL, START_BATTLE_URL, LUCAS_ATTACK_URL,
     BULLET_SFX_URL, HEAL_SFX_URL, WATER_SFX_URL, SHIELD_SFX_URL,
     PUNCH_SFX_URL, BATTLE_BGM_URL, VICTORY_SFX_URL, DEFEAT_SFX_URL].forEach(url => {
      const a = new Audio(url); a.preload = 'auto'; a.load();
    });

    warmSkillIconCache(onSettled);

    const safetyTimer = setTimeout(() => {
      if (!navigatedRef.current) {
        assetsReadyRef.current = true;
        navigatedRef.current = true;
        navigate(user ? '/splash' : '/language', { replace: true });
      }
    }, MAX_WAIT_MS);
    return () => clearTimeout(safetyTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      background: '#060409',
      fontFamily: "'Playfair Display', Georgia, serif",
    }}>
      {/* ── Full-screen art ───────────────────────────────────────────────── */}
      <img
        src={LOADING_ART}
        alt=""
        onLoad={() => setArtLoaded(true)}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          objectPosition: 'center center',
          opacity: artLoaded ? 1 : 0,
          transition: 'opacity 0.6s ease',
          userSelect: 'none', pointerEvents: 'none',
        }}
        draggable={false}
      />

      {/* ── Vignette ──────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(6,4,9,0) 30%, rgba(6,4,9,0.55) 70%, rgba(6,4,9,0.92) 100%)',
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
          color: 'rgba(255, 235, 200, 0.82)',
          fontSize: '13px',
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 600,
          letterSpacing: '0.05em',
          textAlign: 'center',
          textShadow: '0 1px 8px rgba(0,0,0,0.9)',
          userSelect: 'none',
        }}>
          Loading Game Assets &mdash; First Load May Take Longer
        </p>

        {/* Track — 11px (50% of original 22px) */}
        <div style={{
          width: '100%',
          height: '11px',
          background: 'rgba(0, 0, 0, 0.55)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #b84a00 0%, #f97316 45%, #ffb347 100%)',
            transition: 'width 0.18s linear',
            boxShadow: '0 0 14px rgba(249,115,22,0.55)',
          }} />
          <div style={{
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            width: `${progress}%`,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
            backgroundSize: '60px 100%',
            backgroundRepeat: 'repeat-x',
            animation: 'shimmerBar 1.4s linear infinite',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            top: 0, left: 0,
            width: `${progress}%`,
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,220,150,0.7) 40%, rgba(255,220,150,0.3) 100%)',
          }} />
        </div>
      </div>

      <style>{`
        @keyframes shimmerBar {
          0%   { background-position: -120px 0; }
          100% { background-position: 300px 0; }
        }
      `}</style>
    </div>
  );
}