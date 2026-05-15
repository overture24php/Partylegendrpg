/**
 * GorrVFX — Flying slash effects for Gorr.
 *
 * Uses the same shared slash asset as FangVFX (chroma-keyed via slashAsset.ts).
 * Replaces the old quadratic-bezier drawn shape.
 *
 * basic / sk1 / sk2 : one slash projectile per hit target, size 1×.
 * ult               : large slashes (2.2×) to each enemy hit, staggered 80 ms.
 */

import { useEffect, useRef } from 'react';
import { ensureSlashAsset, getSlashCanvas, getSlashBounds } from '../../utils/slashAsset';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Grid layout (mirrors BattlePlayback) ─────────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const HERO_ROW_DATA = [
  { slotW: 60,  slotH: 60,  col0X: 30,  col1X: 154, y: 8   },
  { slotW: 86,  slotH: 86,  col0X: 17,  col1X: 141, y: 82  },
  { slotW: 120, slotH: 120, col0X: 0,   col1X: 124, y: 190 },
] as const;
const ENEMY_ROW_DATA = [
  { slotW: 60,  slotH: 60,  col0X: 154, col1X: 278, y: 8   },
  { slotW: 86,  slotH: 86,  col0X: 154, col1X: 278, y: 82  },
  { slotW: 120, slotH: 120, col0X: 154, col1X: 278, y: 190 },
] as const;
function getRow(side: 'hero' | 'enemy', rowI: number) {
  return (side === 'hero' ? HERO_ROW_DATA : ENEMY_ROW_DATA)[rowI];
}

const ROW_BODY_LIFT = [70, 95, 170] as const;

// ── Public event type ────────────────────────────────────────────────────────
export type GorrVFXTrigger = {
  type:        'gorr_basic' | 'gorr_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Projectile pool ───────────────────────────────────────────────────────────
type Proj = {
  sx: number; sy: number;
  ex: number; ey: number;
  startH: number; endH: number;
  startW: number; endW: number;
  angle:    number;
  startMs:  number;
  travelMs: number;
  fadeMs:   number;
};

const pool: Proj[] = [];

const eio = (t: number) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// ── Slot centre in screen coords ─────────────────────────────────────────────
function slotPos(side: 'hero' | 'enemy', slot: number) {
  const rowI = Math.min(2, Math.floor(slot / 2));
  const col  = slot % 2;
  const row  = getRow(side, rowI);
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x: gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y: window.innerHeight - GRID_H + row.y + row.slotH / 2 - ROW_BODY_LIFT[rowI],
  };
}

// ── Spawn a slash projectile ──────────────────────────────────────────────────
function spawn(
  actorSlot: number, actorSide: 'hero' | 'enemy',
  tSlot:     number, tSide:     'hero' | 'enemy',
  sizeMult:  number,
  delayMs:   number = 0,
) {
  const go = () => {
    const actor  = slotPos(actorSide, actorSlot);
    const target = slotPos(tSide, tSlot);
    const cfg    = getSpriteSize('vfx_gorr_slash');
    pool.push({
      sx: actor.x,  sy: actor.y,
      ex: target.x, ey: target.y,
      startH:   cfg.h * 0.45 * sizeMult,
      endH:     cfg.h * 1.00 * sizeMult,
      startW:   cfg.w * 0.45 * sizeMult,
      endW:     cfg.w * 1.00 * sizeMult,
      angle:    Math.atan2(target.y - actor.y, target.x - actor.x),
      startMs:  performance.now(),
      travelMs: 210,
      fadeMs:   110,
    });
  };

  if (delayMs > 0) {
    ensureSlashAsset(() => setTimeout(go, delayMs));
  } else {
    ensureSlashAsset(go);
  }
}

// ── Draw all pooled slashes ───────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  const sc = getSlashCanvas();
  const sb = getSlashBounds();
  if (!sc || !sb) return;
  const { x: bx, y: by, w: bw, h: bh } = sb;

  for (let i = pool.length - 1; i >= 0; i--) {
    const p   = pool[i];
    const age = now - p.startMs;
    const tot = p.travelMs + p.fadeMs;
    if (age >= tot) { pool.splice(i, 1); continue; }

    let t: number, alpha: number;
    if (age <= p.travelMs) {
      t     = age / p.travelMs;
      alpha = 0.86;
    } else {
      t     = 1;
      alpha = 0.86 * (1 - (age - p.travelMs) / p.fadeMs);
    }

    const et = eio(Math.min(1, t));
    const cx = p.sx + (p.ex - p.sx) * et;
    const cy = p.sy + (p.ey - p.sy) * et;
    const h  = p.startH + (p.endH - p.startH) * et;
    const w  = p.startW + (p.endW - p.startW) * et;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(cx, cy);
    ctx.rotate(p.angle);
    ctx.drawImage(sc, bx, by, bw, bh, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export function GorrVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    ensureSlashAsset(() => {}); // pre-load

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<GorrVFXTrigger>).detail;

      if (e.type === 'gorr_basic') {
        // basic / sk1 / sk2: one slash per hit target
        for (const tSlot of e.targetSlots) {
          spawn(e.actorSlot, e.actorSide, tSlot, e.targetSide, 1.0);
        }
      } else {
        // ULT: larger slashes to each enemy target, staggered 80 ms apart
        e.targetSlots.forEach((tSlot, i) => {
          spawn(e.actorSlot, e.actorSide, tSlot, e.targetSide, 2.2, i * 80);
        });
      }
    };

    window.addEventListener('gorr-vfx', onVFX);
    return () => window.removeEventListener('gorr-vfx', onVFX);
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