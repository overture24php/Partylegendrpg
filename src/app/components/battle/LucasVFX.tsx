/**
 * LucasVFX v3 — Flying slash projectile with content-aware sizing.
 *
 * KEY FIX: After chroma key, getContentBounds() finds the ACTUAL slash stroke
 * region inside the source image (ignoring all transparent padding).
 * drawImage() then draws ONLY that content region at the desired display size.
 *
 * This eliminates the "looks like a line" problem caused by:
 *   - Source image being e.g. 1024×1024 with slash occupying 80% diagonally
 *   - Drawing full image at 120px → slash visually = 10px wide line
 *   - With content crop → slash content fills the full target height
 *
 * Sizing reference = HERO_SPRITE_H (Lucas visible height in DOM):
 *   normal  : startH = HERO_SPRITE_H×0.5, endH = HERO_SPRITE_H×1.0
 *   ULT     : same but ×3 (called 3 times by BattlePlayback)
 *
 * Flight: 220ms travel (ease-in-out) + 110ms fade. Opacity: 0.80.
 * Rotation: auto-faces direction of travel (atan2).
 */

import { useEffect, useRef } from 'react';
import { applyChromaKey, getContentBounds } from '../../utils/chromaKey';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Asset URL ─────────────────────────────────────────────────────────────────
const SLASH_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778171220/ChatGPT_Image_May_7_2026_11_26_25_PM_otixhr.png';

// ── Grid layout (mirrors BattlePlayback) ──────────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW: 60,  slotH: 60,  col0X: 30,  col1X: 278, y: 8   },
  { slotW: 86,  slotH: 86,  col0X: 17,  col1X: 265, y: 82  },
  { slotW: 120, slotH: 120, col0X: 0,   col1X: 248, y: 190 },
] as const;

/**
 * Per-row upward lift so effect origins land on the character's
 * upper-body / chest area rather than the feet.
 * Sprites are significantly taller than their slot containers:
 *   front (row2 slotH=120, sprite~270px) → lift 110px
 *   mid   (row1 slotH= 86, sprite~240px) → lift  95px
 *   back  (row0 slotH= 60, sprite~150px) → lift  70px
 */
const ROW_BODY_LIFT = [70, 95, 110] as const;

/**
 * Reference height for "full Lucas body" in screen pixels.
 * Matches spriteH used in HeroBattleSprite for non-slime heroes.
 * Used to scale slash effects proportionally to the actual character.
 */
const HERO_SPRITE_H = 280;

// ── Public event type ─────────────────────────────────────────────────────────
export type VFXTrigger = {
  type:        'lucas_basic' | 'lucas_sk1' | 'lucas_sk2' | 'lucas_ult_hit';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
  hitIndex?:   number;
};

// ── Slash asset state ─────────────────────────────────────────────────────────
let slashCanvas: HTMLCanvasElement | null = null;
// Content bounds of the actual slash stroke (post-chroma-key, no padding)
let slashBounds: { x: number; y: number; w: number; h: number } | null = null;
// Aspect ratio of the CONTENT region (not the full image)
let slashContentAspect = 1.5;
const pendingCbs: Array<() => void> = [];

function ensureSlash(cb: () => void) {
  if (slashCanvas) { cb(); return; }
  pendingCbs.push(cb);
  if (pendingCbs.length > 1) return;  // already in-flight
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c   = document.createElement('canvas');
    c.width   = img.naturalWidth;
    c.height  = img.naturalHeight;
    const cx  = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0);
    const d   = cx.getImageData(0, 0, c.width, c.height);
    applyChromaKey(d.data);
    cx.putImageData(d, 0, 0);

    // Detect actual slash content bounds
    const b = getContentBounds(d.data, c.width, c.height);
    if (b) {
      slashBounds       = b;
      slashContentAspect = b.w / Math.max(1, b.h);
    } else {
      // Fallback: treat full image as content
      slashBounds        = { x: 0, y: 0, w: c.width, h: c.height };
      slashContentAspect = c.width / Math.max(1, c.height);
    }

    slashCanvas = c;
    pendingCbs.forEach(f => f());
    pendingCbs.length = 0;
  };
  img.onerror = () => { pendingCbs.length = 0; };
  img.src = SLASH_URL;
}

// ── Slot helpers ──────────────────────────────────────────────────────────────
function slotPos(side: 'hero' | 'enemy', slot: number) {
  const rowI = Math.min(2, Math.floor(slot / 2));
  const col  = slot % 2;
  const row  = ROW_DATA[rowI];
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x: gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    // Raised to upper-body/chest level (sprites extend well above slot boundary)
    y: window.innerHeight - GRID_H + row.y + row.slotH / 2 - ROW_BODY_LIFT[rowI],
  };
}

// ── Projectile pool ───────────────────────────────────────────────────────────
type Proj = {
  sx: number; sy: number;
  ex: number; ey: number;
  startH: number; endH: number;
  startW: number; endW: number;   // independent W (editor-controllable)
  angle:  number;
  startMs:  number;
  travelMs: number;
  fadeMs:   number;
};

const pool: Proj[] = [];

const eio = (t: number) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// ── Spawn ─────────────────────────────────────────────────────────────────────
function spawn(
  actorSlot: number, actorSide: 'hero' | 'enemy',
  tSlot:     number, tSide:     'hero' | 'enemy',
  sizeMult:  number,
) {
  ensureSlash(() => {
    const actor  = slotPos(actorSide, actorSlot);
    const target = slotPos(tSide, tSlot);
    const cfg    = getSpriteSize('vfx_lucas_slash');
    pool.push({
      sx: actor.x,  sy: actor.y,
      ex: target.x, ey: target.y,
      startH:   cfg.h * 0.50 * sizeMult,
      endH:     cfg.h * 1.00 * sizeMult,
      startW:   cfg.w * 0.50 * sizeMult,
      endW:     cfg.w * 1.00 * sizeMult,
      angle:    Math.atan2(target.y - actor.y, target.x - actor.x),
      startMs:  performance.now(),
      travelMs: 220,
      fadeMs:   110,
    });
  });
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  if (!slashCanvas || !slashBounds) return;
  const { x: bx, y: by, w: bw, h: bh } = slashBounds;

  for (let i = pool.length - 1; i >= 0; i--) {
    const p   = pool[i];
    const age = now - p.startMs;
    const tot = p.travelMs + p.fadeMs;
    if (age >= tot) { pool.splice(i, 1); continue; }

    let t: number, alpha: number;
    if (age <= p.travelMs) {
      t     = age / p.travelMs;
      alpha = 0.80;
    } else {
      t     = 1;
      alpha = 0.80 * (1 - (age - p.travelMs) / p.fadeMs);
    }

    const et = eio(Math.min(1, t));
    const cx = p.sx + (p.ex - p.sx) * et;
    const cy = p.sy + (p.ey - p.sy) * et;
    // h = interpolated height of the CONTENT region at this moment
    const h  = p.startH + (p.endH - p.startH) * et;
    const w  = p.startW + (p.endW - p.startW) * et;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(cx, cy);
    ctx.rotate(p.angle);
    // Draw ONLY the content region of the source image, scaled to (w × h)
    ctx.drawImage(slashCanvas, bx, by, bw, bh, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LucasVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    // Pre-load slash asset immediately so first attack has no delay
    ensureSlash(() => {});

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<VFXTrigger>).detail;
      for (const tSlot of e.targetSlots) {
        switch (e.type) {
          case 'lucas_basic':
          case 'lucas_sk1':
          case 'lucas_sk2':
            spawn(e.actorSlot, e.actorSide, tSlot, e.targetSide, 1);
            break;
          case 'lucas_ult_hit':
            // BattlePlayback calls this once per ULT hit (3× total).
            // Each call = one 3× bigger slash.
            spawn(e.actorSlot, e.actorSide, tSlot, e.targetSide, 3);
            break;
        }
      }
    };
    window.addEventListener('lucas-vfx', onVFX);
    return () => window.removeEventListener('lucas-vfx', onVFX);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const loop = () => {
      const dpr = window.devicePixelRatio || 1;
      const pw  = Math.round(window.innerWidth  * dpr);
      const ph  = Math.round(window.innerHeight * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width  = pw;
        canvas.height = ph;
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
    return () => {
      cancelAnimationFrame(rafRef.current);
      pool.length = 0;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        inset:         0,
        width:         '100vw',
        height:        '100vh',
        zIndex:        300,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  );
}