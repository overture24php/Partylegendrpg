/**
 * CrawVFX — Arrow projectile effects for Craw.
 *
 * Asset: ChatGPT-generated arrow image. Background removed via Cloudinary
 * (e_background_removal/f_png,q_auto) — no client-side chroma key needed.
 *
 * basic / sk1 / sk2:
 *   One projectile per target — flies from Craw's slot to target with a
 *   subtle upward arc. Travel time ≈ 200 ms.
 *
 * ult (Skypiercer Volley):
 *   All arrows launch from Craw's position, rise to an apex directly above
 *   each target enemy, then plunge straight down.
 *   Rise ≈ 220 ms · Plunge ≈ 300 ms · Fade ≈ 70 ms.
 *
 * The image is rotated each frame to face the direction of travel.
 */

import { useEffect, useRef } from 'react';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Arrow image asset ─────────────────────────────────────────────────────────
// Shared crossbow bolt asset (e_background_removal/f_png keeps transparency).
const ARROW_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778742882/bulletcraw.png_dqejai.png';

let _arrowImg: HTMLImageElement | null = null;
const _arrowCbs: Array<() => void> = [];

function ensureArrow(cb: () => void): void {
  if (_arrowImg) { cb(); return; }
  _arrowCbs.push(cb);
  if (_arrowCbs.length > 1) return; // already in-flight
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    _arrowImg = img;
    _arrowCbs.forEach(f => f());
    _arrowCbs.length = 0;
  };
  img.onerror = () => { _arrowCbs.length = 0; };
  img.src = ARROW_URL;
}

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

// ── Public event type ─────────────────────────────────────────────────────────
export type CrawVFXTrigger = {
  type:        'craw_arrow' | 'craw_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Arrow pool ──────────────────────────────────────────────────────────��─────
type Arrow = {
  sx: number; sy: number;
  ax: number; ay: number;   // apex (= target for basic; above target for ULT)
  ex: number; ey: number;   // final target
  isUlt:    boolean;
  riseMs:   number;
  plungeMs: number;
  fadeMs:   number;
  startMs:  number;
};

const pool: Arrow[] = [];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const c01  = (x: number) => Math.max(0, Math.min(1, x));

function slotPos(side: 'hero' | 'enemy', slot: number) {
  const col  = slot % 2;
  const rowI = Math.min(2, Math.floor(slot / 2));
  const row  = getRow(side, rowI);
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x: gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y: window.innerHeight - GRID_H + row.y + row.slotH / 2 - ROW_BODY_LIFT[rowI],
  };
}

function push(a: Omit<Arrow, 'startMs'>) {
  pool.push({ ...a, startMs: performance.now() });
}

// ── Spawners ─────────────────────────────────────────────────────────────────

function spawnArrow(
  aSide: 'hero' | 'enemy', aSlot: number,
  tSide: 'hero' | 'enemy', tSlot: number,
) {
  ensureArrow(() => {
    const src = slotPos(aSide, aSlot);
    const dst = slotPos(tSide, tSlot);
    push({
      sx: src.x, sy: src.y,
      ax: dst.x, ay: dst.y,
      ex: dst.x, ey: dst.y,
      isUlt:    false,
      riseMs:   200,
      plungeMs: 0,
      fadeMs:   90,
    });
  });
}

function spawnUltArrow(
  aSide: 'hero' | 'enemy', aSlot: number,
  tSide: 'hero' | 'enemy', tSlot: number,
  delayMs: number,
) {
  ensureArrow(() => {
    setTimeout(() => {
      const src   = slotPos(aSide, aSlot);
      const dst   = slotPos(tSide, tSlot);
      const apexY = Math.min(src.y, dst.y) - 90;
      push({
        sx: src.x, sy: src.y,
        ax: dst.x, ay: apexY,
        ex: dst.x, ey: dst.y,
        isUlt:    true,
        riseMs:   220,
        plungeMs: 300,
        fadeMs:   70,
      });
    }, delayMs);
  });
}

// ── Position + angle at progress t (0–1 over total flight time) ──────────────
function arrowState(a: Arrow, t: number): { x: number; y: number; angle: number } {
  const totalMs = a.riseMs + a.plungeMs;

  if (!a.isUlt) {
    const dx   = a.ex - a.sx;
    const dy   = a.ey - a.sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const arcH = dist * 0.12;
    const x    = lerp(a.sx, a.ex, t);
    const y    = lerp(a.sy, a.ey, t) - Math.sin(Math.PI * t) * arcH;
    const dtx  = a.ex - a.sx;
    const dty  = (a.ey - a.sy) - Math.PI * arcH * Math.cos(Math.PI * t);
    return { x, y, angle: Math.atan2(dty, dtx) };
  }

  const t1 = c01(t * totalMs / a.riseMs);
  const t2 = c01((t * totalMs - a.riseMs) / a.plungeMs);

  if (t * totalMs <= a.riseMs) {
    return {
      x:     lerp(a.sx, a.ax, t1),
      y:     lerp(a.sy, a.ay, t1),
      angle: Math.atan2(a.ay - a.sy, a.ax - a.sx),
    };
  }
  return {
    x:     lerp(a.ax, a.ex, t2),
    y:     lerp(a.ay, a.ey, t2),
    angle: Math.atan2(a.ey - a.ay, a.ex - a.ax),
  };
}

// ── Render ───────────────────────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  if (!_arrowImg) return;
  const cfg = getSpriteSize('vfx_craw_slash');

  for (let i = pool.length - 1; i >= 0; i--) {
    const a       = pool[i];
    const age     = now - a.startMs;
    const totalMs = a.riseMs + a.plungeMs + a.fadeMs;
    if (age >= totalMs) { pool.splice(i, 1); continue; }

    const flightMs = a.riseMs + a.plungeMs;
    const t        = c01(age / Math.max(flightMs, 1));

    let alpha: number;
    if (age < flightMs) {
      alpha = 1.0;
    } else {
      alpha = 1.0 - (age - flightMs) / a.fadeMs;
    }

    const { x, y, angle } = arrowState(a, t);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(_arrowImg, -cfg.w / 2, -cfg.h / 2, cfg.w, cfg.h);

    // Ghost trail — 25 ms behind, 30% opacity
    if (age < flightMs) {
      const tBack = c01((age - 25) / Math.max(flightMs, 1));
      if (tBack > 0) {
        const back = arrowState(a, tBack);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = alpha * 0.30;
        ctx.translate(back.x, back.y);
        ctx.rotate(back.angle);
        ctx.drawImage(_arrowImg, -cfg.w / 2, -cfg.h / 2, cfg.w, cfg.h);
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
    ensureArrow(() => {}); // pre-load

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<CrawVFXTrigger>).detail;

      if (e.type === 'craw_arrow') {
        for (const tSlot of e.targetSlots) {
          spawnArrow(e.actorSide, e.actorSlot, e.targetSide, tSlot);
        }
      } else {
        // ULT — slight stagger between arrows
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
        zIndex:        500,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  );
}