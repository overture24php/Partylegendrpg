/**
 * GorrVFX — white vertical slash effects for Gorr (same color as LucasVFX).
 *
 * LENGTHS:
 *   basic / sk1 / sk2 : 8 grid cells  = window.innerHeight × 0.40
 *   ult               : 20 grid cells = window.innerHeight × 1.00
 *
 * SHAPE: quadratic-bezier lens (identical geometry & color to LucasVFX).
 *   Core:  white
 *   Glow:  white shadow
 *
 * DIRECTIONS:
 *   basic/sk1/sk2 — vertical ↓ centred on target slot
 *   ult           — 2 full-height vertical ↓ slashes simultaneously:
 *                   slash 1 at front-column X, slash 2 at back-column X,
 *                   100 ms stagger, both centred on colCentreY()
 */

import { useEffect, useRef } from 'react';

// ── Layout constants (mirror BattlePlayback) ─────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW: 60,  slotH: 60,  col0X: 30,  col1X: 278, y: 8   },
  { slotW: 86,  slotH: 86,  col0X: 17,  col1X: 265, y: 82  },
  { slotW: 120, slotH: 120, col0X: 0,   col1X: 248, y: 190 },
] as const;

// ── Public event type ───────────────────────────────────────────────────────
export type GorrVFXTrigger = {
  type:        'gorr_basic' | 'gorr_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];   // per-slot for basic; ignored for ult
  targetSide:  'hero' | 'enemy';
};

// ── Slash pool ───────────────────────────────────────────────────────────────
type Slash = {
  ax: number; ay: number;
  bx: number; by: number;
  maxW:    number;
  bend:    number;
  startMs: number;
  drawMs:  number;
  holdMs:  number;
  fadeMs:  number;
  glow:    number;
};

const pool: Slash[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────
const lerp    = (a: number, b: number, t: number) => a + (b - a) * t;
const c01     = (x: number) => Math.max(0, Math.min(1, x));
const gridLen = (n: number) => window.innerHeight * (n / 20);

function slotPos(side: 'hero' | 'enemy', slot: number) {
  const col  = slot % 2;
  const rowI = Math.min(2, Math.floor(slot / 2));
  const row  = ROW_DATA[rowI];
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x: gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y: window.innerHeight - GRID_H + row.y + row.slotH / 2,
  };
}

/** X-centre of a column for the given side (mirrors LucasVFX enemyColX). */
function colX(side: 'hero' | 'enemy', col: number): number {
  const gl = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return gl + (col === 0 ? 60 : 308);
}

/** Vertical mid-point of the full character grid. */
function colCentreY(): number {
  const yTop = window.innerHeight - GRID_H + ROW_DATA[0].y;
  const yBot = window.innerHeight - GRID_H + ROW_DATA[2].y + ROW_DATA[2].slotH;
  return (yTop + yBot) / 2;
}

const MAX_W = 32;
const BEND  = 0.03;

function push(s: Omit<Slash, 'startMs'>) {
  pool.push({ ...s, startMs: performance.now() });
}

// ── Spawners ─────────────────────────────────────────────────────────────────

/** Vertical ↓ slash centred on a target slot — basic / sk1 / sk2. */
function spawnBasic(tSlot: number, tSide: 'hero' | 'enemy') {
  const { x, y } = slotPos(tSide, tSlot);
  const h = gridLen(8) / 2;
  push({
    ax: x, ay: y - h,
    bx: x, by: y + h,
    maxW: MAX_W, bend: -BEND,
    drawMs: 90, holdMs: 22, fadeMs: 115, glow: 11,
  });
}

/**
 * ULT — 2 full-height vertical ↓ slashes across both enemy columns.
 * Slash 1 (front col) appears immediately.
 * Slash 2 (back col)  appears 100 ms later for a sweeping feel.
 */
function spawnUlt(tSide: 'hero' | 'enemy') {
  const cy = colCentreY();
  const h  = gridLen(20) / 2;

  // Slash 1: front column
  push({
    ax: colX(tSide, 0), ay: cy - h,
    bx: colX(tSide, 0), by: cy + h,
    maxW: MAX_W, bend: -BEND,
    drawMs: 170, holdMs: 28, fadeMs: 200, glow: 14,
  });

  // Slash 2: back column — staggered 100 ms
  setTimeout(() => {
    push({
      ax: colX(tSide, 1), ay: cy - h,
      bx: colX(tSide, 1), by: cy + h,
      maxW: MAX_W, bend: -BEND,
      drawMs: 170, holdMs: 28, fadeMs: 200, glow: 14,
    });
  }, 100);
}

// ── Lens shape (quadratic bezier, both tips pointed) ─────────────────────────
function buildBlade(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  maxW: number, bend: number, drawT: number,
) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const nx = -dy / len, ny = dx / len;

  const bendDist = len * bend;
  const midX = (ax + bx) / 2 + nx * bendDist;
  const midY = (ay + by) / 2 + ny * bendDist;

  const ctTx = midX + nx * maxW, ctTy = midY + ny * maxW;
  const ctBx = midX - nx * maxW, ctBy = midY - ny * maxW;

  if (drawT >= 1) {
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(ctTx, ctTy, bx, by);
    ctx.quadraticCurveTo(ctBx, ctBy, ax, ay);
    ctx.closePath();
    return;
  }

  const t = c01(drawT);

  const tm1Tx = lerp(ax, ctTx, t), tm1Ty = lerp(ay, ctTy, t);
  const tm2Tx = lerp(ctTx, bx, t), tm2Ty = lerp(ctTy, by, t);
  const ptTx  = lerp(tm1Tx, tm2Tx, t), ptTy = lerp(tm1Ty, tm2Ty, t);

  const bm1Bx = lerp(ax, ctBx, t), bm1By = lerp(ay, ctBy, t);
  const bm2Bx = lerp(ctBx, bx, t), bm2By = lerp(ctBy, by, t);
  const ptBx  = lerp(bm1Bx, bm2Bx, t), ptBy = lerp(bm1By, bm2By, t);

  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(tm1Tx, tm1Ty, ptTx, ptTy);
  ctx.lineTo(ptBx, ptBy);
  ctx.quadraticCurveTo(bm1Bx, bm1By, ax, ay);
  ctx.closePath();
}

// ── Perpendicular gradient — dark brown core, muted brown edges ───────────────
function makeGrad(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  maxW: number, bend: number,
): CanvasGradient {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ?  dx / len : 1;
  const hw = maxW / 2;
  const cx = (ax + bx) / 2 + nx * (len * bend);
  const cy = (ay + by) / 2 + ny * (len * bend);
  const grd = ctx.createLinearGradient(
    cx - nx * hw, cy - ny * hw,
    cx + nx * hw, cy + ny * hw,
  );
  // transparent → muted brown edge → dark brown core → muted brown edge → transparent
  grd.addColorStop(0.00, 'rgba(255,255,255,0.00)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.40)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.88)');
  grd.addColorStop(0.50, 'rgba(255,255,255,1.00)');
  grd.addColorStop(0.58, 'rgba(255,255,255,0.88)');
  grd.addColorStop(0.82, 'rgba(255,255,255,0.40)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  return grd;
}

// ── Render ───────────────────────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  for (let i = pool.length - 1; i >= 0; i--) {
    const s   = pool[i];
    const age = now - s.startMs;
    const tot = s.drawMs + s.holdMs + s.fadeMs;
    if (age >= tot) { pool.splice(i, 1); continue; }

    let drawT: number, alpha: number;
    if (age < s.drawMs) {
      drawT = age / s.drawMs;
      alpha = 1.0;
    } else if (age < s.drawMs + s.holdMs) {
      drawT = 1.0;
      alpha = 1.0;
    } else {
      drawT = 1.0;
      alpha = 1.0 - (age - s.drawMs - s.holdMs) / s.fadeMs;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.shadowColor = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur  = s.glow;
    ctx.fillStyle   = makeGrad(ctx, s.ax, s.ay, s.bx, s.by, s.maxW, s.bend);
    ctx.beginPath();
    buildBlade(ctx, s.ax, s.ay, s.bx, s.by, s.maxW, s.bend, drawT);
    ctx.fill();
    ctx.restore();
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export function GorrVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<GorrVFXTrigger>).detail;
      if (e.type === 'gorr_ult') {
        spawnUlt(e.targetSide);
      } else {
        for (const tSlot of e.targetSlots) {
          spawnBasic(tSlot, e.targetSide);
        }
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
        zIndex:        300,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  );
}