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
const HERO_DETAIL_BG    = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777381178/ChatGPT_Image_Apr_28_2026_07_59_00_PM_ud1ln3.png';
// Login / Register / HeroPage / Hero-Obtained shared background
const LOGIN_BG          = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777419184/ChatGPT_Image_Apr_29_2026_06_32_08_AM_hch81k.png';

// ── Character card illustrations (green-screen → chroma key) ─────────────────
const LUCAS_CARD_ILUST = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777386997/LUCAS_tyqcnf.png';
const EMMA_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777387003/emma_aqsnsd.png';

// ── Tavern Normal Summon banner (green-screen → chroma key) ───────────────────
const BANNER_TAVERN = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777895161/60d9c15d-f208-4d63-b2ac-9c93cde4e1a5.png';

// ── Gorr card illustration & battle sprites (green-screen → chroma key) ──────
const GORR_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777918499/ChatGPT_Image_May_5_2026_01_13_20_AM_eyckzn.png';
const GORR_IDLE_BATTLE = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919607/ChatGPT_Image_May_5_2026_01_23_54_AM_nhkzmq.png';
const GORR_ACTION      = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919615/ChatGPT_Image_May_5_2026_01_31_48_AM_m65s2g.png';

// ── Craw card illustration & battle sprites (green-screen → chroma key) ──────
const CRAW_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919641/ChatGPT_Image_May_5_2026_01_27_29_AM_axdemu.png';
const CRAW_IDLE_BATTLE = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919783/ChatGPT_Image_May_5_2026_01_26_59_AM_zfdewm.png';
const CRAW_ACTION      = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919799/ChatGPT_Image_May_5_2026_01_27_08_AM_p8yjub.png';

// ── Lucas skill icons (CORRECT URLs — v1777550xxx series) ─────────────────────
const LUCAS_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png';
const LUCAS_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550848/ChatGPT_Image_Apr_30_2026_07_02_57_PM_kbtfs3.png';
const LUCAS_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550841/psvluk_b0quhw.png';
const LUCAS_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550833/ultlukas_jcehyx.png';

// ── Emma skill icons ──────────────────────────────────────────────────────────
const EMMA_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png';
const EMMA_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png';
const EMMA_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png';
const EMMA_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png';

// ── Rock Slime skill icons ────────────────────────────────────────────────────
const RSLIME_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565812/s1rlime_hfstrz.png';
const RSLIME_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565820/s2rslime_shjl5b.png';
const RSLIME_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565826/s3rslime_vip7sb.png';
const RSLIME_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565833/s4rslime_duuc2g.png';

// ── Acid Slime skill icons ────────────────────────────────────────────────────
const ASLIME_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806549/sk1acd_nqz0x5.png';
const ASLIME_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806563/sk2acd_x4d8qu.png';
const ASLIME_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806571/sk3acd_gh45ki.png';
const ASLIME_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806578/sk4acd_mcmpzu.png';

// ── Water Slime skill icons ───────────────────────────────────────────────────
const WSLIME_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807420/sk1wtr.pg_fbx8a0.png';
const WSLIME_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807428/sk2wtr_vmi777.png';
const WSLIME_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807444/sk3wtr_fedwpe.png';
const WSLIME_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807456/sk4wtr_fbixax.png';

// ── Battle hero idle sprites (green-screen, used with chroma key in battle) ───
const LUCAS_IDLE_BATTLE = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630336/idle_luk_mobysy.png';
const EMMA_IDLE_BATTLE  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630434/idle_em_p8uxjs.png';
// Lucas action — server-side background removal (no chroma key needed)
const LUCAS_ACTION      = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777631550/act_luc_mhmivj.png';
// Emma action — green-screen, chroma key
const EMMA_ACTION       = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630357/act_em_fnrl1t.png';

// ── Enemy idle sprites — server-side bgremove ─────────────────────────────────
const RSLIME_IDLE = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634810/Gemini_Generated_Image_c7qsl1c7qsl1c7qs_mekkjz.png';
const ASLIME_IDLE = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634782/ChatGPT_Image_May_1_2026_06_25_59_PM_dsoxsd.png';
const WSLIME_IDLE = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png';

// ── Slime gallery card illustrations (f_auto version for HeroPage) ────────────
const RSLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545681/ChatGPT_Image_Apr_30_2026_05_38_28_PM_wzt4ox.png';
const ASLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545738/ChatGPT_Image_Apr_30_2026_05_39_48_PM_oq2njh.png';
const WSLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png';

// ── Audio SFX URLs ────────────────────────────────────────────────────────────
const BTN_SFX_URL        = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777874441/emilianodleon-select-button-ui-395763_zildua.mp3';
const CARD_SFX_URL       = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777817847/freesound_community-card-sounds-35956_xd0rrn.mp3';
const BACK_SFX_URL       = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777817753/dragon-studio-button-press-382713_rd1cyr.mp3';
const START_BATTLE_URL   = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777824497/dragon-studio-sword-slice-2-393845_xq3npe.mp3';
const LUCAS_ATTACK_URL   = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777817667/freesound_community-hit-swing-sword-small-2-95566_ewoib0.mp3';
const BULLET_SFX_URL     = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777825985/u_xpdo8dyg08-bullet-382829_kgh16n.mp3';
const HEAL_SFX_URL       = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826228/yodguard-healing-magic-3-378664_o03eoj.mp3';
const WATER_SFX_URL      = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826345/freesound_community-water-splash-46402_v24mak.mp3';
const SHIELD_SFX_URL     = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826444/freesound_community-shield-guard-6963_xywxza.mp3';
const PUNCH_SFX_URL      = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872406/soraatwod-punch-416719_al8u2e.mp3';
const BATTLE_BGM_URL     = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872315/backgroundmusicforvideos-epic-background-music-484342_qc73ue.mp3';
const VICTORY_SFX_URL    = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872713/universfield-open-new-level-143027_d9hese.mp3';
const DEFEAT_SFX_URL     = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872778/universfield-marimba-lose-250960_s2ocax.mp3';

const STATIC_IMGS: string[] = [
  // ── Backgrounds ──
  SPLASH_IMG, INTRO_BG, GAME_BG, HERO_DETAIL_BG, LOGIN_BG,
  // ── Skill icons — Lucas (correct v1777550xxx URLs) ──
  LUCAS_SK1, LUCAS_SK2, LUCAS_SK3, LUCAS_ULT,
  // ── Skill icons — Emma ──
  EMMA_SK1, EMMA_SK2, EMMA_SK3, EMMA_ULT,
  // ── Skill icons — Rock Slime ──
  RSLIME_SK1, RSLIME_SK2, RSLIME_SK3, RSLIME_ULT,
  // ── Skill icons — Acid Slime ──
  ASLIME_SK1, ASLIME_SK2, ASLIME_SK3, ASLIME_ULT,
  // ── Skill icons — Water Slime ──
  WSLIME_SK1, WSLIME_SK2, WSLIME_SK3, WSLIME_ULT,
  // ── Battle hero sprites ──
  LUCAS_IDLE_BATTLE, EMMA_IDLE_BATTLE, LUCAS_ACTION, EMMA_ACTION,
  GORR_IDLE_BATTLE, GORR_ACTION,
  CRAW_IDLE_BATTLE, CRAW_ACTION,
  // ── Enemy idle sprites ──
  RSLIME_IDLE, ASLIME_IDLE, WSLIME_IDLE,
  // ── Gallery card illustrations (slimes) ──
  RSLIME_CARD, ASLIME_CARD, WSLIME_CARD,
];

const TOTAL = STATIC_IMGS.length
  + 1 /*lucas card*/ + LUCAS_FRAMES.length + 1 /*lucas chroma*/
  + 1 /*emma card*/  + EMMA_FRAMES.length  + 1 /*emma chroma*/
  + 1 /*tavern banner chroma*/
  + 1 /*gorr card chroma*/
  + 1 /*craw card chroma*/;

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

    // ── 4. Tavern banner — load + build chroma inline ─────────────────────────
    const tavernBannerImg = new Image();
    tavernBannerImg.crossOrigin = 'anonymous';
    tavernBannerImg.onload = () => {
      const off = document.createElement('canvas');
      off.width  = tavernBannerImg.naturalWidth;
      off.height = tavernBannerImg.naturalHeight;
      const ctx  = off.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(tavernBannerImg, 0, 0);
        const id = ctx.getImageData(0, 0, off.width, off.height);
        applyChromaKey(id.data);
        ctx.putImageData(id, 0, 0);
        keepChromaUrl(BANNER_TAVERN, off.toDataURL('image/png'));
      }
      onSettled();
    };
    tavernBannerImg.onerror = onSettled;
    tavernBannerImg.src     = BANNER_TAVERN;

    // ── 5. Gorr card illustration — load + build chroma inline ───────────────
    const gorrCardImg = new Image();
    gorrCardImg.crossOrigin = 'anonymous';
    gorrCardImg.onload = () => {
      const off = document.createElement('canvas');
      off.width  = gorrCardImg.naturalWidth;
      off.height = gorrCardImg.naturalHeight;
      const ctx  = off.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(gorrCardImg, 0, 0);
        const id = ctx.getImageData(0, 0, off.width, off.height);
        applyChromaKey(id.data);
        ctx.putImageData(id, 0, 0);
        keepChromaUrl(GORR_CARD_ILUST, off.toDataURL('image/png'));
      }
      onSettled();
    };
    gorrCardImg.onerror = onSettled;
    gorrCardImg.src     = GORR_CARD_ILUST;

    // ── 6. Craw card illustration — load + build chroma inline ───────────────
    const crawCardImg = new Image();
    crawCardImg.crossOrigin = 'anonymous';
    crawCardImg.onload = () => {
      const off = document.createElement('canvas');
      off.width  = crawCardImg.naturalWidth;
      off.height = crawCardImg.naturalHeight;
      const ctx  = off.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(crawCardImg, 0, 0);
        const id = ctx.getImageData(0, 0, off.width, off.height);
        applyChromaKey(id.data);
        ctx.putImageData(id, 0, 0);
        keepChromaUrl(CRAW_CARD_ILUST, off.toDataURL('image/png'));
      }
      onSettled();
    };
    crawCardImg.onerror = onSettled;
    crawCardImg.src     = CRAW_CARD_ILUST;

    // ── 7. Lucas sprite frames ────────────────────────────────────────────────
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

    // ── 8. Emma sprite frames ─────────────────────────────────────────────────
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

    // ── 9. Preload BGM ────────────────────────────────────────────────────────
    preloadBgm();

    // ── 10. Preload all SFX audio ──────────────────────────────────────────────
    [BTN_SFX_URL, CARD_SFX_URL, BACK_SFX_URL, START_BATTLE_URL, LUCAS_ATTACK_URL,
     BULLET_SFX_URL, HEAL_SFX_URL, WATER_SFX_URL, SHIELD_SFX_URL,
     PUNCH_SFX_URL, BATTLE_BGM_URL, VICTORY_SFX_URL, DEFEAT_SFX_URL].forEach(url => {
      const a = new Audio(url);
      a.preload = 'auto';
      a.load();
    });

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
      background: '#0d0a0f',
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

      {/* ── \"Loading\" + dots row ──────────────────────────────────────────── */}
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
          WebkitTextStroke: '5px #F97316',
          paintOrder: 'stroke fill',
          letterSpacing: '0.03em',
          userSelect: 'none',
          display: 'block',
          lineHeight: 1,
          textShadow: '0 0 48px rgba(249,115,22,0.55)',
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
              background: '#F97316',
              outline: '2.5px solid rgba(249,115,22,0.4)',
              outlineOffset: '2px',
              boxSizing: 'border-box',
              boxShadow: '0 0 8px rgba(249,115,22,0.7)',
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
        background: 'rgba(255,255,255,0.08)',
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