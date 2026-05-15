/**
 * CloverVFX — Flying heal-orb effects for Clover.
 *
 * Asset: green-screen illustration → chroma-keyed client-side.
 *
 * clover_sk1  (Healing Herb) : orb flies from Clover → lowest-HP ally.
 * clover_sk2  (Lucky Toss)   : orb flies from Clover → random ally.
 * clover_ult  (Bloom Cascade): one orb per each heal target, simultaneous.
 *
 * Flight: ease-in-out, 230 ms travel + 130 ms fade.
 * Size scales 0.45× → 1.0× over the journey (same feel as EmmaVFX heal).
 */

import { useEffect, useRef } from 'react';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Asset URLs ────────────────────────────────────────────────────────────────
const BULLET_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778743502/bulletclover_nhag80.png';
// Herb is green — use Cloudinary AI background removal instead of chroma key
const HEAL_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778742883/herbclover_jdrdoi.png';

// ── Asset loaders ─────────────────────────────────────────────────────────────
let _healImg:    HTMLImageElement | null = null;
const _healCbs:  Array<() => void>       = [];
let _bulletImg:  HTMLImageElement | null = null;
const _bulletCbs: Array<() => void>      = [];

function ensureHeal(cb: () => void) {
  if (_healImg) { cb(); return; }
  _healCbs.push(cb);
  if (_healCbs.length > 1) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    _healImg = img;
    _healCbs.forEach(f => f());
    _healCbs.length = 0;
  };
  img.onerror = () => { _healCbs.length = 0; };
  img.src = HEAL_URL;
}

function ensureBullet(cb: () => void) {
  if (_bulletImg) { cb(); return; }
  _bulletCbs.push(cb);
  if (_bulletCbs.length > 1) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    _bulletImg = img;
    _bulletCbs.forEach(f => f());
    _bulletCbs.length = 0;
  };
  img.onerror = () => { _bulletCbs.length = 0; };
  img.src = BULLET_URL;
}

// ── Grid layout (mirrors BattlePlayback) ─────────────────────────────────────
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

/** Body-center position used as projectile ORIGIN (no over-lift — stays within slot).
 *  Uses 40% from slot top so the orb launches from upper-chest, never above the HP bar. */
function bodyPos(side: 'hero' | 'enemy', slot: number) {
  const col = slot % 2;
  const ri  = Math.min(2, Math.floor(slot / 2));
  const row = getRow(side, ri);
  const gl  = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x:     gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y:     window.innerHeight - GRID_H + row.y + row.slotH * 0.40,
    slotH: row.slotH,
  };
}

// ── Public event type ─────────────────────────────────────────────────────────
export type CloverVFXTrigger = {
  type:        'clover_basic' | 'clover_sk1' | 'clover_sk2' | 'clover_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Bullet pool (basic attack) ────────────────────────────────────────────────
type BulletProj = {
  sx: number; sy: number;
  ex: number; ey: number;
  size:     number;
  angle:    number;
  startMs:  number;
  travelMs: number;
  fadeMs:   number;
};
const bulletPool: BulletProj[] = [];

function spawnBullet(
  actorSlot: number, actorSide: 'hero' | 'enemy',
  tSlot:     number, tSide:     'hero' | 'enemy',
) {
  ensureBullet(() => {
    const actor = slotPos(actorSide, actorSlot);
    const tgt   = slotPos(tSide, tSlot);
    bulletPool.push({
      sx: actor.x, sy: actor.y,
      ex: tgt.x,   ey: tgt.y,
      size:    56,
      angle:   Math.atan2(tgt.y - actor.y, tgt.x - actor.x),
      startMs: performance.now(),
      travelMs: 180,
      fadeMs:    70,
    });
  });
}

// ── Heal projectile pool ──────────────────────────────────────────────────────
type HealProj = {
  sx: number; sy: number;
  ex: number; ey: number;
  startH: number; endH: number;
  startW: number; endW: number;
  spinSpeed: number; // rad/ms clockwise (positive = CW in canvas coords)
  startMs:  number;
  travelMs: number;
  fadeMs:   number;
};

const pool: HealProj[] = [];

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

function spawnHeal(
  actorSlot: number, actorSide: 'hero' | 'enemy',
  tSlot:     number, tSide:     'hero' | 'enemy',
) {
  ensureHeal(() => {
    // Use bodyPos so the orb launches from Clover's body, not above the HP bar
    const actor = bodyPos(actorSide, actorSlot);
    const tgt   = bodyPos(tSide, tSlot);
    // Size the herb to the TARGET's body — bigger targets get a larger orb landing
    const asp   = _healImg ? _healImg.naturalWidth / Math.max(1, _healImg.naturalHeight) : 1;
    const endH  = tgt.slotH * 2.2;
    const endW  = endH * asp;
    pool.push({
      sx: actor.x, sy: actor.y,
      ex: tgt.x,   ey: tgt.y,
      startH:   endH * 0.45,
      endH,
      startW:   endW * 0.45,
      endW,
      spinSpeed: Math.PI * 6 / 1000, // 3 clockwise rotations/second
      startMs:  performance.now(),
      travelMs: 230,
      fadeMs:   130,
    });
  });
}

// ── Draw ─────────────────────────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  // Bullet projectiles (basic attack)
  if (_bulletImg) {
    for (let i = bulletPool.length - 1; i >= 0; i--) {
      const p   = bulletPool[i];
      const age = now - p.startMs;
      const tot = p.travelMs + p.fadeMs;
      if (age >= tot) { bulletPool.splice(i, 1); continue; }
      const t     = Math.min(1, age / p.travelMs);
      const ease  = 1 - (1 - t) * (1 - t);
      const alpha = age < p.travelMs ? 1.0 : 1.0 - (age - p.travelMs) / p.fadeMs;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.sx + (p.ex - p.sx) * ease, p.sy + (p.ey - p.sy) * ease);
      ctx.rotate(p.angle);
      ctx.drawImage(_bulletImg, -p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  const sc = _healImg;
  if (!sc) return;

  for (let i = pool.length - 1; i >= 0; i--) {
    const p   = pool[i];
    const age = now - p.startMs;
    const tot = p.travelMs + p.fadeMs;
    if (age >= tot) { pool.splice(i, 1); continue; }

    let t: number, alpha: number;
    if (age <= p.travelMs) {
      t     = age / p.travelMs;
      alpha = 0.90;
    } else {
      t     = 1;
      alpha = 0.90 * (1 - (age - p.travelMs) / p.fadeMs);
    }

    const et = eio(Math.min(1, t));
    const cx = p.sx + (p.ex - p.sx) * et;
    const cy = p.sy + (p.ey - p.sy) * et;
    const h  = p.startH + (p.endH - p.startH) * et;
    const w  = p.startW + (p.endW - p.startW) * et;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(cx, cy);
    ctx.rotate(p.spinSpeed * age); // clockwise spin while in flight
    ctx.drawImage(sc, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CloverVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    ensureHeal(() => {});   // pre-load
    ensureBullet(() => {}); // pre-load

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<CloverVFXTrigger>).detail;
      if (e.type === 'clover_basic') {
        for (const tSlot of e.targetSlots) {
          spawnBullet(e.actorSlot, e.actorSide, tSlot, e.targetSide);
        }
      } else {
        for (const tSlot of e.targetSlots) {
          spawnHeal(e.actorSlot, e.actorSide, tSlot, e.targetSide);
        }
      }
    };

    window.addEventListener('clover-vfx', onVFX);
    return () => window.removeEventListener('clover-vfx', onVFX);
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
        if (pool.length > 0 || bulletPool.length > 0) {
          ctx.save();
          ctx.scale(dpr, dpr);
          drawPool(ctx, performance.now());
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); pool.length = 0; bulletPool.length = 0; };
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