// ─── Emma Sprite Global Cache ─────────────────────────────────────────────────
// 5-frame green-screen sprites — chroma key pre-processed in LoadingPage.
// Ping-pong sequence: 1→2→3→4→5→4→3→2 (indices 0,1,2,3,4,3,2,1)
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto';

export const EMMA_FRAMES: string[] = [
  `${BASE}/v1777378782/em1_gpl2ri.png`,
  `${BASE}/v1777378786/em2_temuta.png`,
  `${BASE}/v1777378790/em3_yni1yw.png`,
  `${BASE}/v1777378875/em4_q2cpus.png`,
  `${BASE}/v1777378923/em5_s86arq.png`,
];

// Sequence: 1→2→3→4→5→4→3→2 (then back to 1)
export const EMMA_PINGPONG: number[] = [0, 1, 2, 3, 4, 3, 2, 1];

// 500ms per frame
export const EMMA_FRAME_MS = 500;

// ── Raw HTMLImageElement cache (populated by LoadingPage) ─────────────────────
export const emmaImgCache: HTMLImageElement[] = [];

/** True only when every raw slot is a fully decoded image. */
export function isEmmaCacheReady(): boolean {
  if (emmaImgCache.length < EMMA_FRAMES.length) return false;
  return emmaImgCache.every(img => img != null && img.naturalWidth > 0);
}

// ── Chroma-keyed canvas cache (built by LoadingPage after raw frames load) ────
export const emmaChromaCache: HTMLCanvasElement[] = [];

/** True when all chroma-keyed frames are ready to draw. */
export function isEmmaChromaCacheReady(): boolean {
  if (emmaChromaCache.length < EMMA_FRAMES.length) return false;
  return emmaChromaCache.every(c => c != null && c.width > 0);
}
