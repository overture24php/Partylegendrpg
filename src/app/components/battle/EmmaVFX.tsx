/**
 * EmmaVFX — HTML5 Canvas VFX for all of Emma's skills.
 *
 *  emma_basic   → 4-pointed Gemini-star projectile (silver, spinning) flies from
 *                 Emma to each target enemy.
 *  emma_sk1     → Cluster of bright-green plus signs rising upward at heal target.
 *  emma_sk2     → Large sky-blue shield descends from above onto the shield target.
 *  emma_passive → Same shield animation applied to every shielded hero (staggered).
 *  emma_ult     → Same rising plus-sign cluster on each of the 3 heal targets.
 */

import { useEffect, useRef } from 'react';

// ── Layout constants (mirror BattlePlayback) ──────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW:  60, slotH:  60, col0X:  30, col1X: 278, y:   8 },
  { slotW:  86, slotH:  86, col0X:  17, col1X: 265, y:  82 },
  { slotW: 120, slotH: 120, col0X:   0, col1X: 248, y: 190 },
] as const;

// ── Public trigger type ───────────────────────────────────────────────────────
export type EmmaVFXTrigger = {
  type:        'emma_basic' | 'emma_sk1' | 'emma_sk2' | 'emma_passive' | 'emma_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Slot → screen coords ──────────────────────────────────────────────────────
function slotPos(side: 'hero' | 'enemy', slot: number) {
  const col  = slot % 2;
  const ri   = Math.min(2, Math.floor(slot / 2));
  const row  = ROW_DATA[ri];
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x:     gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y:     window.innerHeight - GRID_H + row.y + row.slotH / 2,
    slotH: row.slotH,
  };
}

const c01 = (x: number) => Math.max(0, Math.min(1, x));

// ─────────────────────────────────────────────────────────────────────────────
// Particle pool types
// ─────────────────────────────────────────────────────────────────────────────

/** Gemini-star projectile */
type GeminiProj = {
  sx: number; sy: number;   // start
  ex: number; ey: number;   // end
  spawnMs:  number;
  travelMs: number;
  holdMs:   number;
  fadeMs:   number;
  size:     number;
  angle:    number;         // travel direction (radians) — used for orientation
};

/** Single rising plus/cross */
type PlusParticle = {
  cx:     number;           // target anchor
  cy:     number;
  ox:     number;           // random cluster offset X
  oy:     number;           // random cluster offset Y
  size:   number;           // arm half-length
  thick:  number;           // arm thickness
  spawnMs: number;
  delay:  number;           // stagger delay ms
  riseMs: number;           // total animation duration
  fadeIn: number;           // fade-in portion ms
};

/** Shield particle */
type ShieldPart = {
  cx:      number;
  anchorY: number;          // final resting center-Y
  w:       number;
  h:       number;
  spawnMs: number;
  delay:   number;          // stagger for passive multi-shield
  dropMs:  number;
  holdMs:  number;
  fadeMs:  number;
};

// Module-level pools (shared across all instances; only one EmmaVFX renders)
const projPool:   GeminiProj[]   = [];
const plusPool:   PlusParticle[] = [];
const shieldPool: ShieldPart[]   = [];

// ─────────────────────────────────────────────────────────────────────────────
// Spawners
// ─────────────────────────────────────────────────────────────────────────────

function spawnProj(actorSlot: number, actorSide: 'hero' | 'enemy',
                   tSlot: number, tSide: 'hero' | 'enemy') {
  const from = slotPos(actorSide, actorSlot);
  const to   = slotPos(tSide, tSlot);
  // Aim at upper-body of target (not feet)
  const sy   = from.y - from.slotH * 0.28;
  const ey   = to.y   - to.slotH   * 0.28;
  projPool.push({
    sx: from.x, sy,
    ex: to.x,   ey,
    spawnMs:  performance.now(),
    travelMs: 185,
    holdMs:   30,
    fadeMs:   70,
    size:     72,              // ×4 from original 18
    angle:    Math.atan2(ey - sy, to.x - from.x),
  });
}

function spawnPlus(cx: number, cy: number, count: number) {
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const a    = Math.random() * Math.PI * 2;
    const dist = Math.random() * 60;   // ×2 horizontal spread
    const size = 7 + Math.random() * 14;   // 7–21 px arm half-length
    plusPool.push({
      cx, cy,
      ox:      Math.cos(a) * dist,
      oy:      Math.sin(a) * dist,
      size,
      thick:   Math.max(3, size * 0.30),
      spawnMs: now,
      delay:   Math.random() * 260,
      riseMs:  380 + Math.random() * 220,
      fadeIn:  110,
    });
  }
}

function spawnShield(cx: number, anchorY: number, slotH: number, delay = 0) {
  shieldPool.push({
    cx,
    anchorY:  anchorY - slotH * 0.12,
    w:        slotH * 1.80,            // ×1.5 width (was 1.20)
    h:        slotH * 2.88,            // ×3 height
    spawnMs:  performance.now(),
    delay,
    dropMs:   260,
    holdMs:   260,
    fadeMs:   400,
  });
}

// ── Public spawn-by-type helpers ──────────────────────────────────────────────
function spawnBasic(actorSlot: number, actorSide: 'hero' | 'enemy',
                    tSlots: number[], tSide: 'hero' | 'enemy') {
  for (const s of tSlots) spawnProj(actorSlot, actorSide, s, tSide);
}

function spawnSk1(tSlots: number[], tSide: 'hero' | 'enemy') {
  for (const s of tSlots) {
    const { x, y } = slotPos(tSide, s);
    spawnPlus(x, y, 11);
  }
}

function spawnSk2(tSlots: number[], tSide: 'hero' | 'enemy') {
  for (const s of tSlots) {
    const p = slotPos(tSide, s);
    spawnShield(p.x, p.y, p.slotH);
  }
}

function spawnPassive(tSlots: number[], tSide: 'hero' | 'enemy') {
  // Stagger each shield 90 ms apart for a pleasing wave effect
  for (let i = 0; i < tSlots.length; i++) {
    const p = slotPos(tSide, tSlots[i]);
    spawnShield(p.x, p.y, p.slotH, i * 90);
  }
}

function spawnUlt(tSlots: number[], tSide: 'hero' | 'enemy') {
  for (const s of tSlots) {
    const { x, y } = slotPos(tSide, s);
    spawnPlus(x, y, 11);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 4-pointed Gemini star (sparkle shape).
 * outerR = size, innerR = size×0.16 → very elongated / pointed arms.
 * Uses a radial gradient: white center → silver → transparent rim.
 */
function draw4Star(ctx: CanvasRenderingContext2D,
                   cx: number, cy: number, size: number,
                   rot: number, alpha: number) {
  const outerR = size;
  const innerR = size * 0.16;
  const pts    = 4;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR * 0.9);
  grad.addColorStop(0,    `rgba(255,255,255,${alpha})`);
  grad.addColorStop(0.22, `rgba(230,230,248,${alpha * 0.92})`);
  grad.addColorStop(0.55, `rgba(188,188,215,${alpha * 0.55})`);
  grad.addColorStop(1.00, `rgba(160,160,195,0)`);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i * Math.PI / pts) - Math.PI / 2;
    if (i === 0) ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
    else         ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle   = grad;
  ctx.shadowColor = `rgba(210,215,255,${alpha * 0.65})`;
  ctx.shadowBlur  = 12;
  ctx.fill();
  // Bright core dot
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.90})`;
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.restore();
}

/** Bright-green plus/cross */
function drawPlus(ctx: CanvasRenderingContext2D,
                  cx: number, cy: number, size: number,
                  thick: number, alpha: number) {
  ctx.save();
  ctx.fillStyle   = `rgba(74,222,128,${alpha})`;
  ctx.shadowColor = `rgba(74,222,128,${alpha * 0.75})`;
  ctx.shadowBlur  = 9;
  // Horizontal arm
  ctx.fillRect(cx - size,         cy - thick / 2, size * 2,  thick);
  // Vertical arm
  ctx.fillRect(cx - thick / 2,    cy - size,      thick,     size * 2);
  ctx.restore();
}

/**
 * Classic heater-shield silhouette.
 *  ┌────────┐   ← flat top with rounded corners
 *  │        │   ← straight-ish sides
 *  │        │   ← sides curve inward
 *   \      /    ← converge to a bottom point
 *     \  /
 *      \/
 */
function drawShieldShape(ctx: CanvasRenderingContext2D,
                         cx: number, topY: number, w: number, h: number,
                         alpha: number) {
  const left  = cx - w / 2;
  const right = cx + w / 2;
  const botY  = topY + h;
  const r     = w * 0.13;  // corner radius

  ctx.save();

  // ── Shield fill (sky-blue, faded) ─────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(left + r, topY);
  ctx.lineTo(right - r, topY);
  ctx.quadraticCurveTo(right, topY,           right, topY + r * 1.6);
  ctx.quadraticCurveTo(right, topY + h * 0.64, cx,   botY);
  ctx.quadraticCurveTo(left,  topY + h * 0.64, left, topY + r * 1.6);
  ctx.quadraticCurveTo(left,  topY,            left + r, topY);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(cx, topY, cx, botY);
  fillGrad.addColorStop(0,    `rgba(186,230,255,${alpha * 0.38})`);
  fillGrad.addColorStop(0.45, `rgba(125,200,255,${alpha * 0.25})`);
  fillGrad.addColorStop(1,    `rgba( 59,130,246,${alpha * 0.12})`);
  ctx.fillStyle   = fillGrad;
  ctx.shadowColor = `rgba(135,206,250,${alpha * 0.55})`;
  ctx.shadowBlur  = 22;
  ctx.fill();

  // ── Rim stroke ───────────────────────────────────────────────────────────
  ctx.strokeStyle = `rgba(147,210,255,${alpha * 0.85})`;
  ctx.lineWidth   = 2.2;
  ctx.shadowBlur  = 18;
  ctx.stroke();

  // ── Top highlight bar ─────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(left + r + 5, topY + 5);
  ctx.lineTo(right - r - 5, topY + 5);
  ctx.strokeStyle = `rgba(210,240,255,${alpha * 0.50})`;
  ctx.lineWidth   = 1.2;
  ctx.shadowBlur  = 4;
  ctx.stroke();

  // ── Subtle center cross emblem ────────────────────────────────────────────
  const emY = topY + h * 0.38;
  const ew  = w * 0.22;
  const et  = Math.max(2, w * 0.045);
  ctx.fillStyle = `rgba(200,235,255,${alpha * 0.28})`;
  ctx.shadowBlur = 0;
  // vertical
  ctx.fillRect(cx - et / 2, emY - ew,     et,     ew * 2);
  // horizontal
  ctx.fillRect(cx - ew,     emY - et / 2, ew * 2, et);

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Master render tick
// ─────────────────────────────────────────────────────────────────────────────
function drawPools(ctx: CanvasRenderingContext2D, now: number) {
  // ── Gemini projectiles ────────────────────────────────────────────────────
  for (let i = projPool.length - 1; i >= 0; i--) {
    const p       = projPool[i];
    const elapsed = now - p.spawnMs;
    const total   = p.travelMs + p.holdMs + p.fadeMs;
    if (elapsed >= total) { projPool.splice(i, 1); continue; }

    let t: number, alpha: number;
    if (elapsed < p.travelMs) {
      t     = elapsed / p.travelMs;
      alpha = 1;
    } else if (elapsed < p.travelMs + p.holdMs) {
      t     = 1;
      alpha = 1;
    } else {
      t     = 1;
      alpha = 1 - (elapsed - p.travelMs - p.holdMs) / p.fadeMs;
    }

    // Ease-out quadratic travel
    const ease = 1 - (1 - t) * (1 - t);
    const cx   = p.sx + (p.ex - p.sx) * ease;
    const cy   = p.sy + (p.ey - p.sy) * ease;
    // Star oriented along travel direction, spinning slightly
    const rot  = p.angle + elapsed * 0.004;
    // Slight burst scale at impact
    const scale = t < 1 ? 1 : 1 + (1 - alpha) * 0.45;

    draw4Star(ctx, cx, cy, p.size * scale, rot, c01(alpha));
  }

  // ── Rising plus signs ─────────────────────────────────────────────────────
  for (let i = plusPool.length - 1; i >= 0; i--) {
    const p       = plusPool[i];
    const elapsed = now - p.spawnMs - p.delay;
    if (elapsed < 0) continue;
    if (elapsed >= p.riseMs) { plusPool.splice(i, 1); continue; }

    const t      = elapsed / p.riseMs;
    const riseAmt = 225;               // ×3 rise height
    const x      = p.cx + p.ox;
    const y      = p.cy + p.oy + 66 - riseAmt * t;  // start offset ×3 too

    // Fade: in for first fadeIn ms, then out for remainder
    const fadeT = p.fadeIn / p.riseMs;
    const alpha = t < fadeT
      ? t / fadeT
      : 1 - (t - fadeT) / (1 - fadeT);

    drawPlus(ctx, x, y, p.size, p.thick, c01(alpha));
  }

  // ── Shields ───────────────────────────────────────────────────────────────
  for (let i = shieldPool.length - 1; i >= 0; i--) {
    const p       = shieldPool[i];
    const elapsed = now - p.spawnMs - p.delay;
    if (elapsed < 0) continue;
    const total   = p.dropMs + p.holdMs + p.fadeMs;
    if (elapsed >= total) { shieldPool.splice(i, 1); continue; }

    // Drop start = anchorY - shield height - 80px above character
    const dropStartY = p.anchorY - p.h * 0.5 - 85;

    let alpha: number;
    let currentTopY: number;

    if (elapsed < p.dropMs) {
      const t      = elapsed / p.dropMs;
      // Ease-out cubic: fast start, cushioned landing
      const ease   = 1 - Math.pow(1 - t, 3);
      currentTopY  = dropStartY + (p.anchorY - p.h * 0.5 - dropStartY) * ease;
      alpha        = Math.min(1, elapsed / (p.dropMs * 0.35));
    } else if (elapsed < p.dropMs + p.holdMs) {
      currentTopY = p.anchorY - p.h * 0.5;
      alpha       = 1;
    } else {
      currentTopY = p.anchorY - p.h * 0.5;
      alpha       = 1 - (elapsed - p.dropMs - p.holdMs) / p.fadeMs;
    }

    drawShieldShape(ctx, p.cx, currentTopY, p.w, p.h, c01(alpha));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function EmmaVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  // Listen for VFX events dispatched by BattlePlayback
  useEffect(() => {
    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<EmmaVFXTrigger>).detail;
      switch (e.type) {
        case 'emma_basic':   spawnBasic(e.actorSlot, e.actorSide, e.targetSlots, e.targetSide); break;
        case 'emma_sk1':     spawnSk1(e.targetSlots, e.targetSide);     break;
        case 'emma_sk2':     spawnSk2(e.targetSlots, e.targetSide);     break;
        case 'emma_passive': spawnPassive(e.targetSlots, e.targetSide); break;
        case 'emma_ult':     spawnUlt(e.targetSlots, e.targetSide);     break;
      }
    };
    window.addEventListener('emma-vfx', onVFX);
    return () => window.removeEventListener('emma-vfx', onVFX);
  }, []);

  // rAF render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hasParticles = () =>
      projPool.length > 0 || plusPool.length > 0 || shieldPool.length > 0;

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
        if (hasParticles()) {
          ctx.save();
          ctx.scale(dpr, dpr);
          drawPools(ctx, performance.now());
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      projPool.length   = 0;
      plusPool.length   = 0;
      shieldPool.length = 0;
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