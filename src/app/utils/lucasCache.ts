// ─── Lucas Sprite Global Cache ───────────────────────────────────────────────
// 5-frame green-screen sprites — chroma key pre-processed in LoadingPage.
// Ping-pong sequence: 1→2→3→4→5→4→3→2 (indices 0,1,2,3,4,3,2,1)
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto';

export const LUCAS_FRAMES: string[] = [
  `${BASE}/v1777378794/lcs1_vh9tjj.png`,
  `${BASE}/v1777378801/lcs2_glqgvp.png`,
  `${BASE}/v1777378797/lcs3_wg0rjh.png`,
  `${BASE}/v1777378809/lcs4_w1mgni.png`,
  `${BASE}/v1777378805/lcs5_qsyo8h.png`,
];

// Sequence: 1→2→3→4→5→4→3→2 (then back to 1)
export const LUCAS_PINGPONG: number[] = [0, 1, 2, 3, 4, 3, 2, 1];

// 500ms per frame
export const LUCAS_FRAME_MS = 500;

// ── Raw HTMLImageElement cache (populated by LoadingPage) ─────────────────────
export const lucasImgCache: HTMLImageElement[] = [];

/** True only when every raw slot is a fully decoded image. */
export function isCacheReady(): boolean {
  if (lucasImgCache.length < LUCAS_FRAMES.length) return false;
  return lucasImgCache.every(img => img != null && img.naturalWidth > 0);
}

// ── Chroma-keyed canvas cache (built by LoadingPage after raw frames load) ───
// Each slot is an HTMLCanvasElement with green background already removed.
// RAF loop draws directly from here — zero per-frame pixel work.
export const lucasChromaCache: HTMLCanvasElement[] = [];

/** True when all chroma-keyed frames are ready to draw. */
export function isChromaCacheReady(): boolean {
  if (lucasChromaCache.length < LUCAS_FRAMES.length) return false;
  return lucasChromaCache.every(c => c != null && c.width > 0);
}
