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
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695232/s1lucas_tg9lmj.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695224/s2lucas_cub3wd.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695243/s3lucas_ofqmbe.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695251/s4lucas_fcdwdn.png',
  // Emma
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695226/s1emma_i7mlep.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695222/s2emma_x3axeo.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695238/s3emma_vuygqp.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695249/s4emma_el8mj7.png',
  // Brennan
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695226/s1brennan_l4vwom.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695218/s2brennan_qfyvxi.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695236/s3brennan_bpfhlz.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695248/s4brennan_egieut.png',
  // Sylvie
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695241/s1sylvie_krsofb.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695233/s2sylvie_leod2u.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695244/s3sylvie_sravk1.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695256/s4sylvie_hw8a57.png',
  // Rock Slime
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695239/s1rslime_kdcgmq.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695231/s2rslime_f4guov.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695244/s3rslime_kqx7xf.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695254/s4rslime_xxpz1q.png',
  // Acid Slime
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695207/s1aslime_owvcru.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695214/s2aslime_bchbeb.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695236/s3aslime_uohsyk.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695251/s4aslime_mz3vyv.png',
  // Water Slime
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695213/s1wslime_hiue5v.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695230/s2wslime_nwbn4l.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695246/s3wslime_fjmrdv.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695255/s4wlime_ffsowm.png',
  // Gorr
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695228/s1gorr_rixif5.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695226/s2gorr_f4wbo0.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695241/s3gorr_kgcdh7.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695252/s4gorr_cwgbei.png',
  // Craw
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695227/s1craw_kk1gnd.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695221/s2craw_jw8klq.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695236/s3craw_dbr8a2.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695250/s4craw_flzkxc.png',
  // Myko
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695233/s1myko_k4yo36.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695229/s2myko_dfzd3y.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695245/s3myko_tq5uku.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695254/s4myko_qnjeyw.png',
  // Fang
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695232/s1fang_v4rjns.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695222/s2fang_k0x9kl.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695240/s3fang_nvxavq.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695251/s4fang_blxzqv.png',
  // Clover
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695226/s1clov_tszbd9.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695218/s2clov_b5hz84.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695239/s3clov_qcc7ds.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695249/s4clov_mn55ew.png',
  // Bolo
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695219/s1bolo_tm5crw.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695218/s2bolo_drtgsf.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695236/s3bolo_nix16w.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695246/s4bolo_sup6qn.png',
  // Quill
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695242/s1quill_ezatl3.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695232/s2quill_rhh6hh.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695244/s3quill_j9yodf.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778695255/s4quill_ni1vkb.png',
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
