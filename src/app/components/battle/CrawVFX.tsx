/**
 * CrawVFX — white arrow-projectile effects for Craw.
 *
 * basic / sk1 / sk2:
 *   One arrow per target — flies from Craw's slot to target slot with a
 *   subtle upward arc.  Travel time ≈ 200 ms.
 *
 * ult:
 *   All arrows launch simultaneously straight UP from Craw's position,
 *   each rising to the apex directly above its own target enemy,
 *   then plunging straight down onto that enemy.
 *   Rise ≈ 220 ms · Plunge ≈ 300 ms · Total ≈ 520 ms.
 *
 * Arrow shape (drawn pointing RIGHT, centered at origin):
 *   tail-feathers ←── shaft (18 px × 2 px) ──── head (10 px × 5 px) ──▶ tip
 *   Total length 28 px.  White fill + white glow.
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

// ── Public event type ────────────────────────────────────────────────────────
export type CrawVFXTrigger = {
  type:        'craw_arrow' | 'craw_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Arrow pool ───────────────────────────────────────────────────────────────
type Arrow = {
  // Phase 1: start → apex (ULT) or start → end (basic)
  sx: number; sy: number;
  // For basic: (ex,ey) is target; apex unused.
  // For ULT:   (ax,ay) is apex above target; (ex,ey) is target.
  ax: number; ay: number;  // apex (equals ex,ey for basic)
  ex: number; ey: number;  // final target
  isUlt:    boolean;
  riseMs:   number;        // duration of phase 1 (rise / basic travel)
  plungeMs: number;        // duration of phase 2 (plunge); 0 for basic
  fadeMs:   number;        // hold+fade after landing
  startMs:  number;
};

const pool: Arrow[] = [];

// ── Helpers ─────────────────────────────────────────────────────────────────
const lerp    = (a: number, b: number, t: number) => a + (b - a) * t;
const c01     = (x: number) => Math.max(0, Math.min(1, x));

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

function push(a: Omit<Arrow, 'startMs'>) {
  pool.push({ ...a, startMs: performance.now() });
}

// ── Spawners ─────────────────────────────────────────────────────────────────

/**
 * Basic/SK1/SK2: arrow from Craw → target with slight upward arc.
 */
function spawnArrow(
  aSide: 'hero'|'enemy', aSlot: number,
  tSide: 'hero'|'enemy', tSlot: number,
) {
  const src = slotPos(aSide, aSlot);
  const dst = slotPos(tSide, tSlot);
  push({
    sx: src.x, sy: src.y,
    ax: dst.x, ay: dst.y,  // apex = target for basic
    ex: dst.x, ey: dst.y,
    isUlt:    false,
    riseMs:   200,
    plungeMs: 0,
    fadeMs:   90,
  });
}

/**
 * ULT: arrow rises from Craw to apex directly above target, then plunges down.
 */
function spawnUltArrow(
  aSide: 'hero'|'enemy', aSlot: number,
  tSide: 'hero'|'enemy', tSlot: number,
  delayMs: number,
) {
  const src = slotPos(aSide, aSlot);
  const dst = slotPos(tSide, tSlot);
  const apexY = Math.min(src.y, dst.y) - 90;  // above both actors
  setTimeout(() => {
    push({
      sx: src.x, sy: src.y,
      ax: dst.x, ay: apexY,  // apex: directly above target
      ex: dst.x, ey: dst.y,  // plunge straight down
      isUlt:    true,
      riseMs:   220,
      plungeMs: 300,
      fadeMs:   70,
    });
  }, delayMs);
}

// ── Arrow position + angle at progress t (0–1 across totalMs) ────────────────
function arrowState(a: Arrow, t: number): { x: number; y: number; angle: number } {
  const totalMs = a.riseMs + a.plungeMs;

  if (!a.isUlt) {
    // Basic: linear + upward arc via sin()
    const dx = a.ex - a.sx;
    const dy = a.ey - a.sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const arcH = dist * 0.12;           // upward bump = 12% of distance
    const x = lerp(a.sx, a.ex, t);
    const y = lerp(a.sy, a.ey, t) - Math.sin(Math.PI * t) * arcH;
    // Tangent for angle
    const dtx = (a.ex - a.sx);
    const dty = (a.ey - a.sy) - Math.PI * arcH * Math.cos(Math.PI * t);
    const angle = Math.atan2(dty, dtx);
    return { x, y, angle };
  }

  // ULT two-phase trajectory
  const t1 = c01(t * totalMs / a.riseMs);              // phase 1 progress
  const t2 = c01((t * totalMs - a.riseMs) / a.plungeMs); // phase 2 progress

  if (t * totalMs <= a.riseMs) {
    // Phase 1: rise (sx,sy → ax,ay)
    const x = lerp(a.sx, a.ax, t1);
    const y = lerp(a.sy, a.ay, t1);
    const angle = Math.atan2(a.ay - a.sy, a.ax - a.sx);
    return { x, y, angle };
  } else {
    // Phase 2: plunge (ax,ay → ex,ey)
    const x = lerp(a.ax, a.ex, t2);
    const y = lerp(a.ay, a.ey, t2);
    const angle = Math.atan2(a.ey - a.ay, a.ex - a.ax);
    return { x, y, angle };
  }
}

// ── Arrow drawing ─────────────────────────────────────────────────────────────
function drawArrowShape(ctx: CanvasRenderingContext2D) {
  // Pointing RIGHT along X axis, centered at origin.
  // 4× scaled from original (28→112, 10→40, 5→20, 2→8)
  const totalLen = 112;
  const headLen  = 40;
  const headW    = 20;
  const shaftW   = 8;
  const shaftLen = totalLen - headLen;
  const tailX    = -totalLen / 2;
  const headX    = totalLen  / 2 - headLen;

  // Shaft
  ctx.fillRect(tailX, -shaftW / 2, shaftLen, shaftW);

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(totalLen / 2,   0);          // tip
  ctx.lineTo(headX,          -headW / 2); // upper-back
  ctx.lineTo(headX,           headW / 2); // lower-back
  ctx.closePath();
  ctx.fill();

  // Tail feathers (scaled 4×: offset 6→24, spread 5→20)
  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.lineWidth   = 6;
  ctx.beginPath();
  ctx.moveTo(tailX, 0);
  ctx.lineTo(tailX - 24, -20);
  ctx.moveTo(tailX, 0);
  ctx.lineTo(tailX - 24,  20);
  ctx.stroke();
}

// ── Render ───────────────────────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  for (let i = pool.length - 1; i >= 0; i--) {
    const a       = pool[i];
    const age     = now - a.startMs;
    const totalMs = a.riseMs + a.plungeMs + a.fadeMs;
    if (age >= totalMs) { pool.splice(i, 1); continue; }

    const flightMs = a.riseMs + a.plungeMs;
    const t        = c01(age / flightMs);

    let alpha: number;
    if (age < flightMs) {
      alpha = 1.0;
    } else {
      alpha = 1.0 - (age - flightMs) / a.fadeMs;
    }

    const { x, y, angle } = arrowState(a, t);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.shadowColor = 'rgba(255,255,255,0.72)';
    ctx.shadowBlur  = 32;
    ctx.fillStyle   = '#ffffff';
    ctx.translate(x, y);
    ctx.rotate(angle);
    drawArrowShape(ctx);

    // Subtle motion-blur ghost (50% opacity, 10–20 px behind)
    if (age < flightMs) {
      const tBack = c01((age - 25) / flightMs);
      if (tBack > 0) {
        const back = arrowState(a, tBack);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = alpha * 0.28;
        ctx.shadowColor = 'rgba(255,255,255,0.4)';
        ctx.shadowBlur  = 16;
        ctx.fillStyle   = '#ffffff';
        ctx.translate(back.x, back.y);
        ctx.rotate(back.angle);
        drawArrowShape(ctx);
      }
    }

    ctx.restore();
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export function CrawVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<CrawVFXTrigger>).detail;

      if (e.type === 'craw_arrow') {
        for (const tSlot of e.targetSlots) {
          spawnArrow(e.actorSide, e.actorSlot, e.targetSide, tSlot);
        }
      } else {
        // ULT — fire all arrows simultaneously (slight stagger optional)
        e.targetSlots.forEach((tSlot, i) => {
          spawnUltArrow(e.actorSide, e.actorSlot, e.targetSide, tSlot, i * 20);
        });
      }
    };
    window.addEventListener('craw-vfx', onVFX);
    return () => window.removeEventListener('craw-vfx', onVFX);
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