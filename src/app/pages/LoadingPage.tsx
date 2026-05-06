import { applyChromaKey, keepChromaUrl, chromaDataUrlCache } from '../utils/chromaKey';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { preloadBgm } from '../components/BgmController';
import { LUCAS_FRAMES, lucasImgCache, lucasChromaCache } from '../utils/lucasCache';
import { EMMA_FRAMES, emmaImgCache, emmaChromaCache } from '../utils/emmaCache';
import { useAuth } from '../context/AuthContext';

// ─── Loading Page Art ─────────────────────────────────────────────────────────
const LOADING_ART = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778095671/ChatGPT_Image_May_7_2026_02_21_36_AM_pluxid.png';

// ─── Backgrounds ──────────────────────────────────────────────────────────────
const SPLASH_IMG     = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776874245/Splash_screen_aygb5n.png';
const INTRO_BG       = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777395784/ChatGPT_Image_Apr_29_2026_12_02_36_AM_p3z4gf.png';
const GAME_BG        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777396811/ChatGPT_Image_Apr_29_2026_12_19_32_AM_squmiv.png';
const HERO_DETAIL_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777381178/ChatGPT_Image_Apr_28_2026_07_59_00_PM_ud1ln3.png';
const LOGIN_BG       = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777419184/ChatGPT_Image_Apr_29_2026_06_32_08_AM_hch81k.png';
const MAP_URL        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777566900/ChatGPT_Image_Apr_30_2026_11_34_05_PM_ptwl1w.png';
const GRASS_URL      = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777571911/ChatGPT_Image_May_1_2026_12_57_58_AM_xgzne0.png';
const BATTLE_BG_URL  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777582000/35957be7-1c54-4274-80bf-dbabbd1d8a99.png';

// ─── Card illustrations ───────────────────────────────────────────────────────
const LUCAS_CARD_ILUST = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777386997/LUCAS_tyqcnf.png';
const EMMA_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777387003/emma_aqsnsd.png';
const GORR_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058398/ChatGPT_Image_May_6_2026_03_41_03_PM_hxymbk.png';
const CRAW_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058474/ChatGPT_Image_May_6_2026_03_43_04_PM_u0dyy5.png';
const MYKO_CARD_ILUST  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058438/ChatGPT_Image_May_6_2026_03_42_51_PM_o43yt7.png';

// ─── Tavern banner ────────────────────────────────────────────────────────────
const BANNER_TAVERN = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777895161/60d9c15d-f208-4d63-b2ac-9c93cde4e1a5.png';

// ─── Battle sprites ───────────────────────────────────────────────────────────
const LUCAS_IDLE_BATTLE  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630336/idle_luk_mobysy.png';
const EMMA_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630434/idle_em_p8uxjs.png';
const EMMA_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630357/act_em_fnrl1t.png';
const GORR_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919607/ChatGPT_Image_May_5_2026_01_23_54_AM_nhkzmq.png';
const GORR_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919615/ChatGPT_Image_May_5_2026_01_31_48_AM_m65s2g.png';
const CRAW_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919783/ChatGPT_Image_May_5_2026_01_26_59_AM_zfdewm.png';
const CRAW_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919799/ChatGPT_Image_May_5_2026_01_27_08_AM_p8yjub.png';
const MYKO_IDLE_BATTLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005026/ChatGPT_Image_May_6_2026_01_01_00_AM_bhjzhr.png';
const MYKO_ACTION        = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005040/ChatGPT_Image_May_6_2026_01_03_49_AM_sirb54.png';
const WATER_SLIME_TEAM   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777907811/7d3947a5-76a6-4422-9dc6-1eb5fd4d29bd.png';

// ─── Static sprites ───────────────────────────────────────────────────────────
const LUCAS_ACTION  = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777631550/act_luc_mhmivj.png';
const RSLIME_IDLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634810/Gemini_Generated_Image_c7qsl1c7qsl1c7qs_mekkjz.png';
const ASLIME_IDLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634782/ChatGPT_Image_May_1_2026_06_25_59_PM_dsoxsd.png';
const WSLIME_IDLE   = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png';

// ─── Slime gallery cards ──────────────────────────────────────────────────────
const RSLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545681/ChatGPT_Image_Apr_30_2026_05_38_28_PM_wzt4ox.png';
const ASLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545738/ChatGPT_Image_Apr_30_2026_05_39_48_PM_oq2njh.png';
const WSLIME_CARD = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png';

// ─── Skill icons ──────────────────────────────────────────────────────────────
const LUCAS_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png';
const LUCAS_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550848/ChatGPT_Image_Apr_30_2026_07_02_57_PM_kbtfs3.png';
const LUCAS_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550841/psvluk_b0quhw.png';
const LUCAS_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550833/ultlukas_jcehyx.png';
const EMMA_SK1  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png';
const EMMA_SK2  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png';
const EMMA_SK3  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png';
const EMMA_ULT  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png';
const RSLIME_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565812/s1rlime_hfstrz.png';
const RSLIME_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565820/s2rslime_shjl5b.png';
const RSLIME_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565826/s3rslime_vip7sb.png';
const RSLIME_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565833/s4rslime_duuc2g.png';
const ASLIME_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806549/sk1acd_nqz0x5.png';
const ASLIME_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806563/sk2acd_x4d8qu.png';
const ASLIME_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806571/sk3acd_gh45ki.png';
const ASLIME_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806578/sk4acd_mcmpzu.png';
const WSLIME_SK1 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807420/sk1wtr.pg_fbx8a0.png';
const WSLIME_SK2 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807428/sk2wtr_vmi777.png';
const WSLIME_SK3 = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807444/sk3wtr_fedwpe.png';
const WSLIME_ULT = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807456/sk4wtr_fbixax.png';
const GORR_SK1   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002904/sk1gor_wkgpaz.png';
const GORR_SK2   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002911/sk2gor_grkelh.png';
const GORR_SK3   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002917/sk3gor_ppjc9j.png';
const GORR_ULT   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002925/sk4gor_axfkc2.png';
const CRAW_SK1   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002931/sk1craw_cgwnc7.png';
const CRAW_SK2   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002935/sk2craw_hmjjoz.png';
const CRAW_SK3   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002946/sk3craw_f6s5e5.png';
const CRAW_ULT   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002939/sk4craw_zg73ez.png';
const MYKO_SK1   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009427/sk1myk_nr36fc.png';
const MYKO_SK2   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009434/sk2myk_nry1oe.png';
const MYKO_SK3   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009440/sk3myk_oc94bf.png';
const MYKO_ULT   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009488/sk4myk_egyexz.png';

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
  LUCAS_SK1, LUCAS_SK2, LUCAS_SK3, LUCAS_ULT,
  EMMA_SK1,  EMMA_SK2,  EMMA_SK3,  EMMA_ULT,
  RSLIME_SK1, RSLIME_SK2, RSLIME_SK3, RSLIME_ULT,
  ASLIME_SK1, ASLIME_SK2, ASLIME_SK3, ASLIME_ULT,
  WSLIME_SK1, WSLIME_SK2, WSLIME_SK3, WSLIME_ULT,
  GORR_SK1,  GORR_SK2,  GORR_SK3,  GORR_ULT,
  CRAW_SK1,  CRAW_SK2,  CRAW_SK3,  CRAW_ULT,
  MYKO_SK1,  MYKO_SK2,  MYKO_SK3,  MYKO_ULT,
  LUCAS_ACTION, RSLIME_IDLE, ASLIME_IDLE, WSLIME_IDLE,
  RSLIME_CARD, ASLIME_CARD, WSLIME_CARD,
];

const CHROMA_SINGLE: [string, string][] = [
  [LUCAS_CARD_ILUST,  LUCAS_CARD_ILUST],
  [EMMA_CARD_ILUST,   EMMA_CARD_ILUST],
  [BANNER_TAVERN,     BANNER_TAVERN],
  [GORR_CARD_ILUST,   GORR_CARD_ILUST],
  [CRAW_CARD_ILUST,   CRAW_CARD_ILUST],
  [MYKO_CARD_ILUST,   MYKO_CARD_ILUST],
  [LUCAS_IDLE_BATTLE, LUCAS_IDLE_BATTLE],
  [EMMA_IDLE_BATTLE,  EMMA_IDLE_BATTLE],
  [EMMA_ACTION,       EMMA_ACTION],
  [GORR_IDLE_BATTLE,  GORR_IDLE_BATTLE],
  [GORR_ACTION,       GORR_ACTION],
  [CRAW_IDLE_BATTLE,  CRAW_IDLE_BATTLE],
  [CRAW_ACTION,       CRAW_ACTION],
  [MYKO_IDLE_BATTLE,  MYKO_IDLE_BATTLE],
  [MYKO_ACTION,       MYKO_ACTION],
  [WATER_SLIME_TEAM,  WATER_SLIME_TEAM],
  ['https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058505/ChatGPT_Image_May_6_2026_03_43_11_PM_xagzjf.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058505/ChatGPT_Image_May_6_2026_03_43_11_PM_xagzjf.png'],
  ['https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058539/ChatGPT_Image_May_6_2026_03_43_22_PM_ejhf1t.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058539/ChatGPT_Image_May_6_2026_03_43_22_PM_ejhf1t.png'],
  ['https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058739/ChatGPT_Image_May_6_2026_03_45_46_PM_plgice.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058739/ChatGPT_Image_May_6_2026_03_45_46_PM_plgice.png'],
  ['https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058786/ChatGPT_Image_May_6_2026_03_55_39_PM_dssunr.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058786/ChatGPT_Image_May_6_2026_03_55_39_PM_dssunr.png'],
  ['https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058829/ChatGPT_Image_May_6_2026_03_57_38_PM_jwipj1.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058829/ChatGPT_Image_May_6_2026_03_57_38_PM_jwipj1.png'],
  ['https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058887/ChatGPT_Image_May_6_2026_04_00_04_PM_fattkj.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058887/ChatGPT_Image_May_6_2026_04_00_04_PM_fattkj.png'],
];

const TOTAL =
  STATIC_IMGS.length
  + CHROMA_SINGLE.length
  + LUCAS_FRAMES.length + 1
  + EMMA_FRAMES.length  + 1;

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
      position: 'relative',
      width: '100%',
      height: '100dvh',
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
          objectPosition: 'center top',
          opacity: artLoaded ? 1 : 0,
          transition: 'opacity 0.6s ease',
          userSelect: 'none', pointerEvents: 'none',
        }}
        draggable={false}
      />

      {/* ── Vignette (bottom heavy — makes bar readable) ─────────────────── */}
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
            background: 'linear-gradient(90deg, #b84a00 0%, #f97316 45%, #ffb347 100%)',
            transition: 'width 0.18s linear',
            boxShadow: '0 0 18px rgba(249,115,22,0.55)',
          }} />
          {/* Shimmer sweep */}
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
          {/* Top shine line */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0,
            width: `${progress}%`,
            height: '2px',
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
