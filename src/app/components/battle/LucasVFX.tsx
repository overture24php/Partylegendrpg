/**
 * LucasVFX — thick tapered white slash effects for Lucas.
 *
 * LENGTHS (referenced from the 20×20 lobby grid):
 *   Basic / SK1 / SK2 : 8 grid cells = window.innerHeight × 0.40
 *   ULT               : 20 grid cells = window.innerHeight × 1.00
 *
 * SHAPE: quadratic-bezier lens — pointed at both tips, 32px wide at waist
 *   (= 4 × HP-bar height of 8 px). Slight bend (3 %) for a natural sword feel.
 *   Outer edges have a white semi-transparent gradient.
 *
 * DIRECTIONS:
 *   basic    — diagonal ↘  centred on target
 *   sk1      — vertical ↓  centred on target
 *   sk2      — diagonal ↗  centred on target  (bottom-left → top-right)
 *   ult hit0 — diagonal ↘  centred on enemy column mid-point
 *   ult hit1 — diagonal ↗  centred on enemy column mid-point
 *   ult hit2 — vertical ↓  centred on enemy column mid-point
 *   (sk3 passive: no effect)
 */

import { useEffect, useRef } from 'react';

// ── Layout constants (mirror BattlePlayback) ──────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW: 60,  slotH: 60,  col0X: 30,  col1X: 278, y: 8   },
  { slotW: 86,  slotH: 86,  col0X: 17,  col1X: 265, y: 82  },
  { slotW: 120, slotH: 120, col0X: 0,   col1X: 248, y: 190 },
] as const;

// ── Public event type ─────────────────────────────────────────────────────────
export type VFXTrigger = {
  type: 'lucas_basic' | 'lucas_sk1' | 'lucas_sk2' | 'lucas_ult_hit';
  actorSlot:   number; actorSide:  'hero'|'enemy';
  targetSlots: number[]; targetSide: 'hero'|'enemy';
  hitIndex?: number;
};

// ── Slash pool ────────────────────────────────────────────────────────────────
type Slash = {
  ax: number; ay: number;   // start tip
  bx: number; by: number;   // end tip
  maxW:  number;            // blade waist width (px)
  bend:  number;            // bend fraction of length
  startMs: number;
  drawMs:  number;
  holdMs:  number;
  fadeMs:  number;
  glow:  number;
};

const pool: Slash[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;
const c01   = (x: number) => Math.max(0, Math.min(1, x));
const INV_RT2 = 1 / Math.SQRT2;  // 0.7071…

/** Slash length in pixels: n lobby-grid cells out of 20×20 */
const gridLen = (n: number) => window.innerHeight * (n / 20);

function slotPos(side: 'hero'|'enemy', slot: number) {
  const col  = slot % 2;
  const rowI = Math.min(2, Math.floor(slot / 2));
  const row  = ROW_DATA[rowI];
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x: gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y: window.innerHeight - GRID_H + row.y + row.slotH / 2,
  };
}

/** Enemy column centre X — consistent across all 3 rows. */
function enemyColX(side: 'hero'|'enemy', col: number): number {
  const gl = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return gl + (col === 0 ? 60 : 308);
}

/** Vertical mid-point of the enemy/hero grid column area. */
function colCentreY(): number {
  const yTop = window.innerHeight - GRID_H + ROW_DATA[0].y;
  const yBot = window.innerHeight - GRID_H + ROW_DATA[2].y + ROW_DATA[2].slotH;
  return (yTop + yBot) / 2;
}

function push(s: Omit<Slash, 'startMs'>) {
  pool.push({ ...s, startMs: performance.now() });
}

// ── Spawners ──────────────────────────────────────────────────────────────────
const MAX_W =  32;   // 4 × HP bar H (8 px)
const BEND   =  0.03;  // 3 % of length — very subtle

/**
 * basic — diagonal ↘, 4 grid cells long, centred on target slot.
 */
function spawnBasic(_actorSlot: number, _actorSide: 'hero'|'enemy',
                    tSlot: number, tSide: 'hero'|'enemy') {
  const { x, y } = slotPos(tSide, tSlot);
  const h = gridLen(8) / 2;  // half-length
  const d = h * INV_RT2;     // diagonal component
  push({
    ax: x - d, ay: y - d,
    bx: x + d, by: y + d,
    maxW: MAX_W, bend: BEND,
    drawMs: 80, holdMs: 20, fadeMs: 110, glow: 10,
  });
}

/**
 * sk1 — vertical ↓, 4 grid cells long, centred on target.
 */
function spawnSk1(tSlot: number, tSide: 'hero'|'enemy') {
  const { x, y } = slotPos(tSide, tSlot);
  const h = gridLen(8) / 2;
  push({
    ax: x, ay: y - h,
    bx: x, by: y + h,
    maxW: MAX_W, bend: -BEND,   // bends right (normal for ↓ points left)
    drawMs: 100, holdMs: 20, fadeMs: 120, glow: 10,
  });
}

/**
 * sk2 — diagonal ↗ (bottom-left → top-right), 4 grid cells long.
 * User confirmed diagonal is fine; ↗ visually differentiates from basic ↘.
 */
function spawnSk2(tSlot: number, tSide: 'hero'|'enemy') {
  const { x, y } = slotPos(tSide, tSlot);
  const h = gridLen(8) / 2;
  const d = h * INV_RT2;
  push({
    ax: x - d, ay: y + d,  // bottom-left
    bx: x + d, by: y - d,  // top-right
    maxW: MAX_W, bend: BEND,
    drawMs: 80, holdMs: 18, fadeMs: 110, glow: 10,
  });
}

/**
 * ult �� 3 slashes (hitIndex 0/1/2), 10 grid cells long.
 * All centred on the enemy column vertical mid-point.
 *  0 → diagonal ↘
 *  1 → diagonal ↗
 *  2 → vertical ↓
 */
function spawnUlt(tSlot: number, tSide: 'hero'|'enemy', hitIndex: number) {
  const col  = tSlot % 2;
  const cx   = enemyColX(tSide, col);
  const cy   = colCentreY();
  const h    = gridLen(20) / 2;   // half of 20 grid cells
  const d    = h * INV_RT2;

  switch (hitIndex % 3) {
    case 0:   // ↘ diagonal
      push({
        ax: cx - d, ay: cy - d,
        bx: cx + d, by: cy + d,
        maxW: MAX_W, bend: BEND,
        drawMs: 170, holdMs: 28, fadeMs: 190, glow: 13,
      });
      break;
    case 1:   // ↗ diagonal
      push({
        ax: cx - d, ay: cy + d,
        bx: cx + d, by: cy - d,
        maxW: MAX_W, bend: BEND,
        drawMs: 170, holdMs: 28, fadeMs: 190, glow: 13,
      });
      break;
    case 2:   // ↓ vertical
      push({
        ax: cx, ay: cy - h,
        bx: cx, by: cy + h,
        maxW: MAX_W, bend: -BEND,
        drawMs: 170, holdMs: 28, fadeMs: 190, glow: 13,
      });
      break;
  }
}

// ── Lens shape (quadratic bezier, both tips pointed) ─────────────────────────
/**
 * Build full or partial lens shape.
 *
 * Control points offset by maxW in the normal direction, so actual waist
 * width at t=0.5 equals maxW (quadratic bezier midpoint = 0.25A+0.5ctrl+0.25B
 * → shifts midAB by maxW/2 per edge, net = maxW total).
 *
 * drawT ∈ [0,1]: de Casteljau split reveals the partial blade with a naturally
 * pointed front tip at every intermediate step.
 */
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

  // Control points — offset maxW so waist width = maxW
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

  // de Casteljau split at t — top edge (A → ctTop → B, forward)
  const tm1Tx = lerp(ax, ctTx, t), tm1Ty = lerp(ay, ctTy, t);
  const tm2Tx = lerp(ctTx, bx, t), tm2Ty = lerp(ctTy, by, t);
  const ptTx  = lerp(tm1Tx, tm2Tx, t), ptTy = lerp(tm1Ty, tm2Ty, t);

  // de Casteljau split at t — bottom edge (A → ctBot → B, same direction)
  const bm1Bx = lerp(ax, ctBx, t), bm1By = lerp(ay, ctBy, t);
  const bm2Bx = lerp(ctBx, bx, t), bm2By = lerp(ctBy, by, t);
  const ptBx  = lerp(bm1Bx, bm2Bx, t), ptBy = lerp(bm1By, bm2By, t);

  // Partial blade: A → ptTop (top partial) → ptBot (front tip) → A (bottom partial reversed)
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(tm1Tx, tm1Ty, ptTx, ptTy);
  ctx.lineTo(ptBx, ptBy);
  ctx.quadraticCurveTo(bm1Bx, bm1By, ax, ay);
  ctx.closePath();
}

// ── Perpendicular gradient ────────────────────────────────────────────────────
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
  grd.addColorStop(0.00, 'rgba(255,255,255,0.00)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.40)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.88)');
  grd.addColorStop(0.50, 'rgba(255,255,255,1.00)');
  grd.addColorStop(0.58, 'rgba(255,255,255,0.88)');
  grd.addColorStop(0.82, 'rgba(255,255,255,0.40)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  return grd;
}

// ── Render ────────────────────────────────────────────────────────────────────
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

// ── Component ────────────────��────────────────────────────────────────────────
export function LucasVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<VFXTrigger>).detail;
      for (const tSlot of e.targetSlots) {
        switch (e.type) {
          case 'lucas_basic':    spawnBasic(e.actorSlot, e.actorSide, tSlot, e.targetSide); break;
          case 'lucas_sk1':      spawnSk1(tSlot, e.targetSide);   break;
          case 'lucas_sk2':      spawnSk2(tSlot, e.targetSide);   break;
          case 'lucas_ult_hit':  spawnUlt(tSlot, e.targetSide, e.hitIndex ?? 0); break;
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