// ─── Lucas Sprite Global Cache ───────────────────────────────────────────────
// Populated ONCE by LoadingPage. LucasSpritePlayer reads directly — zero re-decode.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto';

export const LUCAS_FRAMES: string[] = [
  `${BASE}/v1777137827/0007_pnu1ta.png`,
  `${BASE}/v1777137833/0008_gk3iwj.png`,
  `${BASE}/v1777137834/0009_nigabu.png`,
  `${BASE}/v1777137830/0010_vvdp2d.png`,
  `${BASE}/v1777137832/0011_lfhp8c.png`,
  `${BASE}/v1777137838/0012_mhun58.png`,
  `${BASE}/v1777137837/0013_mxkael.png`,
  `${BASE}/v1777137838/0014_m9kwy4.png`,
  `${BASE}/v1777137839/0015_ickn8i.png`,
  `${BASE}/v1777137842/0016_rhygfo.png`,
  `${BASE}/v1777137843/0017_rgffdm.png`,
  `${BASE}/v1777137845/0018_fmprel.png`,
  `${BASE}/v1777137847/0019_b1mpla.png`,
  `${BASE}/v1777137849/0020_tifcrd.png`,
  `${BASE}/v1777137851/0021_vhdayk.png`,
  `${BASE}/v1777137852/0022_ttv92f.png`,
  `${BASE}/v1777137854/0023_yvgbav.png`,
  `${BASE}/v1777137857/0024_jm8upl.png`,
  `${BASE}/v1777137858/0025_wehqtj.png`,
  `${BASE}/v1777137860/0026_k5klef.png`,
  `${BASE}/v1777137862/0027_htpuac.png`,
  `${BASE}/v1777137864/0028_pbbxbl.png`,
  `${BASE}/v1777137866/0029_btveup.png`,
  `${BASE}/v1777137868/0030_onlile.png`,
  `${BASE}/v1777137868/0030_onlile.png`, // duplicate — slower frame
  `${BASE}/v1777137870/0031_jyibjm.png`,
  `${BASE}/v1777137871/0032_ofqbot.png`,
  `${BASE}/v1777137873/0033_bsn0sl.png`,
  `${BASE}/v1777137875/0034_het6wg.png`,
  `${BASE}/v1777137877/0035_p1byof.png`,
  `${BASE}/v1777137879/0036_rcbobg.png`,
  `${BASE}/v1777137880/0037_tcmptz.png`,
  `${BASE}/v1777137882/0038_e8npaz.png`,
  `${BASE}/v1777137883/0039_rdtyej.png`,
  `${BASE}/v1777137883/0039_rdtyej.png`, // duplicate — slower frame
];

// Module-level persistent storage — lives for the whole app session
// Index matches LUCAS_FRAMES index exactly (including duplicates → same object reused)
export const lucasImgCache: HTMLImageElement[] = [];

/** True only when every slot is a fully decoded image. */
export function isCacheReady(): boolean {
  if (lucasImgCache.length < LUCAS_FRAMES.length) return false;
  return lucasImgCache.every(img => img != null && img.naturalWidth > 0);
}
