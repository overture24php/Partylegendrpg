// ─── Shared Skill Icon Canvas Cache ───────────────────────────────────────────
// Module-level Map shared between HeroPreviewView (renderer) and LoadingPage
// (pre-warmer). Storing both the chroma-keyed canvas AND the tight trim bounds
// so SkillIconCanvas can render instantly on mount — zero async delay.
// ─────────────────────────────────────────────────────────────────────────────

import { applyChromaKey } from './chromaKey';

export interface TrimBounds { sx: number; sy: number; sw: number; sh: number; }
export interface SkillIconEntry { bounds: TrimBounds; canvas: HTMLCanvasElement; }

/** Shared cache — populated by warmSkillIconCache(), read by SkillIconCanvas. */
export const SKILL_ICON_CACHE = new Map<string, SkillIconEntry>();

/** Detect bounding box of non-transparent pixels from already-processed data. */
export function detectTrimBounds(
  data: Uint8ClampedArray, w: number, h: number,
): TrimBounds {
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 15) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY) return { sx: 0, sy: 0, sw: w, sh: h };
  return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
}

// ─── All skill icon URLs — single source of truth ────────────────────────────
export const ALL_SKILL_ICON_URLS: string[] = [
  // Lucas
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550848/ChatGPT_Image_Apr_30_2026_07_02_57_PM_kbtfs3.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550841/psvluk_b0quhw.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550833/ultlukas_jcehyx.png',
  // Emma
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png',
  // RockSlime
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565812/s1rlime_hfstrz.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565820/s2rslime_shjl5b.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565826/s3rslime_vip7sb.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565833/s4rslime_duuc2g.png',
  // AcidSlime
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806549/sk1acd_nqz0x5.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806563/sk2acd_x4d8qu.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806571/sk3acd_gh45ki.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806578/sk4acd_mcmpzu.png',
  // WaterSlime
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807420/sk1wtr.pg_fbx8a0.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807428/sk2wtr_vmi777.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807444/sk3wtr_fedwpe.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807456/sk4wtr_fbixax.png',
  // Gorr
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002904/sk1gor_wkgpaz.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002911/sk2gor_grkelh.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002917/sk3gor_ppjc9j.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002925/sk4gor_axfkc2.png',
  // Craw
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002931/sk1craw_cgwnc7.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002935/sk2craw_hmjjoz.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002946/sk3craw_f6s5e5.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002939/sk4craw_zg73ez.png',
  // Myko
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009427/sk1myk_nr36fc.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009434/sk2myk_nry1oe.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009440/sk3myk_oc94bf.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009488/sk4myk_egyexz.png',
  // Fang
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066250/sk1fang_lzaud9.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066256/sk2fang_mkmdui.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066265/sk3fang_wdo19c.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066271/sk4fang_msdipt.png',
  // Clover
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066277/sk1clov_pwyu2r.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066283/sk2clov_ebrxbb.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066288/sk3clov_p4van1.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066294/sk4clov_hysri6.png',
];

// ─── Pre-warmer — called by LoadingPage ──────────────────────────────────────
// Processes every URL through canvas chroma-key, trims bounds, caches result.
// Fires onEachDone() once per URL (cache-hit or fresh), so LoadingPage can
// count progress accurately.
export function warmSkillIconCache(onEachDone: () => void): void {
  ALL_SKILL_ICON_URLS.forEach(url => {
    if (SKILL_ICON_CACHE.has(url)) { onEachDone(); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width  = img.naturalWidth;
      off.height = img.naturalHeight;
      const ctx = off.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, off.width, off.height);
        applyChromaKey(id.data);
        ctx.putImageData(id, 0, 0);
        const bounds = detectTrimBounds(id.data, img.naturalWidth, img.naturalHeight);
        SKILL_ICON_CACHE.set(url, { bounds, canvas: off });
      }
      onEachDone();
    };
    img.onerror = onEachDone;
    img.src = url;
  });
}
