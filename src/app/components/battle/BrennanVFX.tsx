/**
 * BrennanVFX — Shield overlay for Brennan's SK2.
 *
 * Asset: green-screen → chroma-keyed client-side.
 *
 * brennan_shield : Shield overlay appears on target, scale-up + hold + fade.
 */

import { useEffect, useRef } from 'react';
import { applyChromaKey, getContentBounds } from '../../utils/chromaKey';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Asset URL ─────────────────────────────────────────────────────────────────
const SHIELD_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743518/shieldbrennan_i4ou5b.png';

// ── Asset loader ──────────────────────────────────────────────────────────────
type AssetState = {
  canvas: HTMLCanvasElement | null;
  bounds: { x: number; y: number; w: number; h: number } | null;
  cbs:    Array<() => void>;
};
const shieldAsset: AssetState = { canvas: null, bounds: null, cbs: [] };

function ensureShield(cb: () => void) {
  if (shieldAsset.canvas) { cb(); return; }
  shieldAsset.cbs.push(cb);
  if (shieldAsset.cbs.length > 1) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c   = document.createElement('canvas');
    c.width   = img.naturalWidth;
    c.height  = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d          = ctx.getImageData(0, 0, c.width, c.height);
    applyChromaKey(d.data);
    ctx.putImageData(d, 0, 0);
    const b           = getContentBounds(d.data, c.width, c.height);
    shieldAsset.bounds = b ?? { x: 0, y: 0, w: c.width, h: c.height };
    shieldAsset.canvas = c;
    shieldAsset.cbs.forEach(f => f());
    shieldAsset.cbs.length = 0;
  };
  img.onerror = () => { shieldAsset.cbs.length = 0; };
  img.src = SHIELD_URL;
}

// ── Layout constants (mirror BattlePlayback) ──────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const HERO_ROW_DATA = [
  { slotW:  60, slotH:  60, col0X:  30, col1X: 154, y:   8 },
  { slotW:  86, slotH:  86, col0X:  17, col1X: 141, y:  82 },
  { slotW: 120, slotH: 120, col0X:   0, col1X: 124, y: 190 },
] as const;
const ENEMY_ROW_DATA = [
  { slotW:  60, slotH:  60, col0X: 154, col1X: 278, y:   8 },
  { slotW:  86, slotH:  86, col0X: 154, col1X: 278, y:  82 },
  { slotW: 120, slotH: 120, col0X: 154, col1X: 278, y: 190 },
] as const;
function getRow(side: 'hero' | 'enemy', ri: number) {
  return (side === 'hero' ? HERO_ROW_DATA : ENEMY_ROW_DATA)[ri];
}
const ROW_BODY_LIFT = [70, 95, 170] as const;

// innerHeight - ROW_FOOT_OFFSET[ri] = foot Y for row ri
// row0: 310-8-60=242  row1: 310-82-86=142  row2: 310-190-120=0
const ROW_FOOT_OFFSET = [242, 172, 60] as const;

function slotFootY(slot: number): number {
  const ri = Math.min(2, Math.floor(slot / 2));
  return window.innerHeight - ROW_FOOT_OFFSET[ri];
}

// ── Public event type ─────────────────────────────────────────────────────────
export type BrennanVFXTrigger = {
  type:        'brennan_shield';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Shield overlay pool ───────────────────────────────────────────────────────
type ShieldOverlay = {
  cx:      number;
  cy:      number;
  startH:  number; endH: number;
  startW:  number; endW: number;
  startMs: number;
  growMs:  number; holdMs: number; fadeMs: number;
  flip:    boolean; // true → mirror horizontally (enemy side faces left)
};

const pool: ShieldOverlay[] = [];

const c01 = (x: number) => Math.max(0, Math.min(1, x));
const eio = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

function slotPos(side: 'hero' | 'enemy', slot: number) {
  const col = slot % 2;
  const ri  = Math.min(2, Math.floor(slot / 2));
  const row = getRow(side, ri);
  const gl  = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x:     gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y:     window.innerHeight - GRID_H + row.y + row.slotH / 2 - ROW_BODY_LIFT[ri],
    slotH: row.slotH,
  };
}

function spawnShield(targetSlot: number, targetSide: 'hero' | 'enemy', delay = 0) {
  ensureShield(() => {
    const { x } = slotPos(targetSide, targetSlot);
    const cfg   = getSpriteSize('vfx_brennan_shield');
    // Foot-baseline: center the shield so its bottom sits 10px below feet
    const cy    = slotFootY(targetSlot) + 10 - cfg.h / 2;
    pool.push({
      cx:      x,
      cy,
      startH:  cfg.h * 0.50,
      endH:    cfg.h,
      startW:  cfg.w * 0.50,
      endW:    cfg.w,
      startMs: performance.now() + delay,
      growMs:  220,
      holdMs:  420,
      fadeMs:  320,
      flip:    targetSide === 'enemy',
    });
  });
}

// ── Draw ─────────────────────────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  const { canvas: sc, bounds: sb } = shieldAsset;
  if (!sc || !sb) return;
  const { x: bx, y: by, w: bw, h: bh } = sb;

  for (let i = pool.length - 1; i >= 0; i--) {
    const s   = pool[i];
    const age = now - s.startMs;
    if (age < 0) continue;
    const tot = s.growMs + s.holdMs + s.fadeMs;
    if (age >= tot) { pool.splice(i, 1); continue; }

    let growT: number, alpha: number;
    if (age < s.growMs) {
      growT = age / s.growMs; alpha = 0.92;
    } else if (age < s.growMs + s.holdMs) {
      growT = 1.0; alpha = 0.92;
    } else {
      growT = 1.0;
      alpha = 0.92 * (1.0 - c01((age - s.growMs - s.holdMs) / s.fadeMs));
    }

    const et = eio(Math.min(1, growT));
    const w  = s.startW + (s.endW - s.startW) * et;
    const h  = s.startH + (s.endH - s.startH) * et;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(s.cx, s.cy);
    if (s.flip) ctx.scale(-1, 1);
    ctx.drawImage(sc, bx, by, bw, bh, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function BrennanVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    ensureShield(() => {}); // pre-load

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<BrennanVFXTrigger>).detail;
      if (e.type === 'brennan_shield') {
        e.targetSlots.forEach((s, i) => spawnShield(s, e.targetSide, i * 90));
      }
    };

    window.addEventListener('brennan-vfx', onVFX);
    return () => window.removeEventListener('brennan-vfx', onVFX);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const loop = () => {
      const dpr = window.devicePixelRatio || 1;
      const pw  = Math.round(window.innerWidth  * dpr);
      const ph  = Math.round(window.innerHeight * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw; canvas.height = ph;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, pw, ph);
        if (pool.length > 0) {
          ctx.save();
          ctx.scale(dpr, dpr);
          drawPool(ctx, performance.now());
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); pool.length = 0; };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        inset:         0,
        width:         '100vw',
        height:        '100vh',
        zIndex:        500,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  );
}
