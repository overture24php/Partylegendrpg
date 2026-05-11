/**
 * SylvieVFX — Crossbow bolt projectile for Sylvie (Crossbow Acrobat).
 *
 * Asset: shared crossbow bolt image (e_background_removal/f_png,q_auto).
 *
 * basic / SK1 (single_back):
 *   One bolt arcs from Sylvie → back-row target. Slight upward arc.
 *   Travel ≈ 200 ms.
 *
 * SK2 (two_front_random):
 *   Two bolts fired with a 60 ms stagger, each to a (possibly same) front target.
 *   Travel ≈ 180 ms each.
 *
 * ULT (two_front_highest_hp — Crossfire Storm):
 *   Both bolts launch from Sylvie, arc high, then plunge down onto the two
 *   highest-HP front targets. Rise ≈ 200 ms · Plunge ≈ 280 ms.
 *   20 ms stagger between bolts.
 */

import { useEffect, useRef } from 'react';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Bolt image ────────────────────────────────────────────────────────────────
const BOLT_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778258626/ChatGPT_Image_May_8_2026_11_22_35_PM_jxu2lv.png';

let _boltImg: HTMLImageElement | null = null;
const _boltCbs: Array<() => void> = [];

function ensureBolt(cb: () => void): void {
  if (_boltImg) { cb(); return; }
  _boltCbs.push(cb);
  if (_boltCbs.length > 1) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    _boltImg = img;
    _boltCbs.forEach(f => f());
    _boltCbs.length = 0;
  };
  img.onerror = () => { _boltCbs.length = 0; };
  img.src = BOLT_URL;
}

// ── Grid layout ───────────────────────────────────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW: 60,  slotH: 60,  col0X: 30,  col1X: 278, y: 8   },
  { slotW: 86,  slotH: 86,  col0X: 17,  col1X: 265, y: 82  },
  { slotW: 120, slotH: 120, col0X: 0,   col1X: 248, y: 190 },
] as const;

const ROW_BODY_LIFT = [70, 95, 110] as const;

export type SylvieVFXTrigger = {
  type:        'sylvie_bolt' | 'sylvie_sk2' | 'sylvie_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Bolt pool ─────────────────────────────────────────────────────────────────
type Bolt = {
  sx: number; sy: number;
  ax: number; ay: number;   // apex (= target for basic; above target for ULT)
  ex: number; ey: number;
  isUlt:    boolean;
  riseMs:   number;
  plungeMs: number;
  fadeMs:   number;
  startMs:  number;
};

const pool: Bolt[] = [];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const c01  = (x: number) => Math.max(0, Math.min(1, x));

function slotPos(side: 'hero' | 'enemy', slot: number) {
  const col  = slot % 2;
  const rowI = Math.min(2, Math.floor(slot / 2));
  const row  = ROW_DATA[rowI];
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x: gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y: window.innerHeight - GRID_H + row.y + row.slotH / 2 - ROW_BODY_LIFT[rowI],
  };
}

function push(a: Omit<Bolt, 'startMs'>) {
  pool.push({ ...a, startMs: performance.now() });
}

// ── Spawners ──────────────────────────────────────────────────────────────────

function spawnBolt(
  aSide: 'hero' | 'enemy', aSlot: number,
  tSide: 'hero' | 'enemy', tSlot: number,
  travelMs = 200,
) {
  ensureBolt(() => {
    const src = slotPos(aSide, aSlot);
    const dst = slotPos(tSide, tSlot);
    push({
      sx: src.x, sy: src.y,
      ax: dst.x, ay: dst.y,
      ex: dst.x, ey: dst.y,
      isUlt: false, riseMs: travelMs, plungeMs: 0, fadeMs: 80,
    });
  });
}

function spawnUltBolt(
  aSide: 'hero' | 'enemy', aSlot: number,
  tSide: 'hero' | 'enemy', tSlot: number,
  delayMs: number,
) {
  ensureBolt(() => {
    setTimeout(() => {
      const src   = slotPos(aSide, aSlot);
      const dst   = slotPos(tSide, tSlot);
      const apexY = Math.min(src.y, dst.y) - 100;
      push({
        sx: src.x, sy: src.y,
        ax: dst.x, ay: apexY,
        ex: dst.x, ey: dst.y,
        isUlt: true, riseMs: 200, plungeMs: 280, fadeMs: 60,
      });
    }, delayMs);
  });
}

// ── Bolt state at progress t ──────────────────────────────────────────────────
function boltState(b: Bolt, t: number): { x: number; y: number; angle: number } {
  const totalMs = b.riseMs + b.plungeMs;

  if (!b.isUlt) {
    const dx   = b.ex - b.sx;
    const dy   = b.ey - b.sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const arcH = dist * 0.10;
    const x    = lerp(b.sx, b.ex, t);
    const y    = lerp(b.sy, b.ey, t) - Math.sin(Math.PI * t) * arcH;
    const dty  = (b.ey - b.sy) - Math.PI * arcH * Math.cos(Math.PI * t);
    return { x, y, angle: Math.atan2(dty, dx) };
  }

  const t1 = c01(t * totalMs / b.riseMs);
  const t2 = c01((t * totalMs - b.riseMs) / b.plungeMs);

  if (t * totalMs <= b.riseMs) {
    return {
      x:     lerp(b.sx, b.ax, t1),
      y:     lerp(b.sy, b.ay, t1),
      angle: Math.atan2(b.ay - b.sy, b.ax - b.sx),
    };
  }
  return {
    x:     lerp(b.ax, b.ex, t2),
    y:     lerp(b.ay, b.ey, t2),
    angle: Math.atan2(b.ey - b.ay, b.ex - b.ax),
  };
}

// ── Render ────────────────────────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  if (!_boltImg) return;
  const cfg = getSpriteSize('vfx_sylvie_bolt');

  for (let i = pool.length - 1; i >= 0; i--) {
    const b       = pool[i];
    const age     = now - b.startMs;
    const totalMs = b.riseMs + b.plungeMs + b.fadeMs;
    if (age >= totalMs) { pool.splice(i, 1); continue; }

    const flightMs = b.riseMs + b.plungeMs;
    const t        = c01(age / Math.max(flightMs, 1));

    const alpha = age < flightMs
      ? 1.0
      : 1.0 - (age - flightMs) / b.fadeMs;

    const { x, y, angle } = boltState(b, t);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(_boltImg, -cfg.w / 2, -cfg.h / 2, cfg.w, cfg.h);

    // Ghost trail — 20 ms behind, 28% opacity
    if (age < flightMs) {
      const tBack = c01((age - 20) / Math.max(flightMs, 1));
      if (tBack > 0) {
        const back = boltState(b, tBack);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = alpha * 0.28;
        ctx.translate(back.x, back.y);
        ctx.rotate(back.angle);
        ctx.drawImage(_boltImg, -cfg.w / 2, -cfg.h / 2, cfg.w, cfg.h);
      }
    }

    ctx.restore();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SylvieVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    ensureBolt(() => {}); // pre-load

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<SylvieVFXTrigger>).detail;

      if (e.type === 'sylvie_bolt') {
        // basic / SK1: single arc bolt per target
        for (const tSlot of e.targetSlots) {
          spawnBolt(e.actorSide, e.actorSlot, e.targetSide, tSlot, 200);
        }
      } else if (e.type === 'sylvie_sk2') {
        // SK2: 2 bolts with 60 ms stagger
        e.targetSlots.forEach((tSlot, i) => {
          setTimeout(() => spawnBolt(e.actorSide, e.actorSlot, e.targetSide, tSlot, 180), i * 60);
        });
      } else if (e.type === 'sylvie_ult') {
        // ULT: 2 bolts arc high then plunge, 20 ms stagger
        e.targetSlots.forEach((tSlot, i) => {
          spawnUltBolt(e.actorSide, e.actorSlot, e.targetSide, tSlot, i * 20);
        });
      }
    };

    window.addEventListener('sylvie-vfx', onVFX);
    return () => window.removeEventListener('sylvie-vfx', onVFX);
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