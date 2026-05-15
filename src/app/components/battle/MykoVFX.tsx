/**
 * MykoVFX — Shield VFX for Myko's SK1 (Iron Casing).
 *
 * Asset: green-screen illustration → chroma-keyed client-side.
 *
 * myko_shield : Shield overlay appears on the target slot, scales 0.5× → 1×
 *               over 220 ms, holds 420 ms, fades over 320 ms.
 *               Positioned centered on the character's upper body.
 */

import { useEffect, useRef } from 'react';
import { applyChromaKey, getContentBounds } from '../../utils/chromaKey';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Asset URLs ────────────────────────────────────────────────────────────────
const SHIELD_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743520/shieldmyko_q12jq3.png';
// Mushroom may contain green/lime content — use AI background removal
const ULT_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778743507/jamurmyko_d982w6.png';

// ── Asset loader ─────────────────────────────────────────────────────────────
let _shieldImg: HTMLImageElement | null = null;
const _shieldCbs: Array<() => void>     = [];
let _ultImg:    HTMLImageElement | null = null;
const _ultCbs:  Array<() => void>       = [];

function ensureShield(cb: () => void) {
  if (_shieldImg) { cb(); return; }
  _shieldCbs.push(cb);
  if (_shieldCbs.length > 1) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // Only apply chroma key to shield since it's a green screen
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    applyChromaKey(d.data);
    ctx.putImageData(d, 0, 0);
    
    const processedImg = new Image();
    processedImg.onload = () => {
      _shieldImg = processedImg;
      _shieldCbs.forEach(f => f());
      _shieldCbs.length = 0;
    };
    processedImg.src = c.toDataURL();
  };
  img.onerror = () => { _shieldCbs.length = 0; };
  img.src = SHIELD_URL;
}

function ensureUlt(cb: () => void) {
  if (_ultImg) { cb(); return; }
  _ultCbs.push(cb);
  if (_ultCbs.length > 1) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const b = getContentBounds(d.data, c.width, c.height);
    
    if (b) {
      const cropped = document.createElement('canvas');
      cropped.width = b.w;
      cropped.height = b.h;
      const cctx = cropped.getContext('2d')!;
      cctx.drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      const processedImg = new Image();
      processedImg.onload = () => {
        _ultImg = processedImg;
        _ultCbs.forEach(f => f());
        _ultCbs.length = 0;
      };
      processedImg.src = cropped.toDataURL();
    } else {
      _ultImg = img;
      _ultCbs.forEach(f => f());
      _ultCbs.length = 0;
    }
  };
  img.onerror = () => { _ultCbs.length = 0; };
  img.src = ULT_URL;
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

// innerHeight - ROW_FOOT_OFFSET[ri] = foot Y for row ri
const ROW_FOOT_OFFSET = [242, 142, 60] as const;

function slotFootY(slot: number): number {
  const ri = Math.min(2, Math.floor(slot / 2));
  return window.innerHeight - ROW_FOOT_OFFSET[ri];
}

// ── Public event type ─────────────────────────────────────────────────────────
export type MykoVFXTrigger = {
  type:        'myko_shield' | 'myko_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlot:  number;
  targetSide:  'hero' | 'enemy';
  targetSlots?: number[];
};

// ── Shield overlay pool ───────────────────────────────────────────────────────
type ShieldOverlay = {
  cx:      number;
  cy:      number;
  startH:  number;
  endH:    number;
  startW:  number;
  endW:    number;
  startMs: number;
  growMs:  number;
  holdMs:  number;
  fadeMs:  number;
  flip:    boolean; // true → mirror horizontally (enemy side faces left)
};

const pool:    ShieldOverlay[] = [];

type Proj = {
  sx: number; sy: number;
  ex: number; ey: number;
  startH: number; endH: number;
  startW: number; endW: number;
  spinSpeed: number; // rad/ms clockwise
  startMs:  number;
  travelMs: number;
  fadeMs:   number;
};

const ultPool: Proj[] = [];

const c01 = (x: number) => Math.max(0, Math.min(1, x));
const eio = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// Body-center position for origin
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

function spawnShield(targetSlot: number, targetSide: 'hero' | 'enemy') {
  ensureShield(() => {
    const { x } = slotPos(targetSide, targetSlot);
    const cfg   = getSpriteSize('vfx_myko_shield');
    const cy    = slotFootY(targetSlot) + 10 - cfg.h / 2;
    pool.push({
      cx:      x,
      cy,
      startH:  cfg.h * 0.50,
      endH:    cfg.h,
      startW:  cfg.w * 0.50,
      endW:    cfg.w,
      startMs: performance.now(),
      growMs:  220,
      holdMs:  420,
      fadeMs:  320,
      flip:    targetSide === 'enemy',
    });
  });
}

function spawnUlt(actorSlot: number, actorSide: 'hero' | 'enemy', targetSlot: number, targetSide: 'hero' | 'enemy', delay = 0) {
  ensureUlt(() => {
    const actor = bodyPos(actorSide, actorSlot);
    const tgt   = bodyPos(targetSide, targetSlot);
    
    const asp   = _ultImg ? _ultImg.naturalWidth / Math.max(1, _ultImg.naturalHeight) : 1;
    const cfg   = getSpriteSize('vfx_myko_ult');
    const endH  = cfg.h;
    const endW  = endH * asp;
    
    ultPool.push({
      sx: actor.x, sy: actor.y,
      ex: tgt.x,   ey: tgt.y,
      startH:   endH * 0.45,
      endH,
      startW:   endW * 0.45,
      endW,
      spinSpeed: Math.PI * 6 / 1000, // 3 clockwise rotations/second
      startMs:  performance.now() + delay,
      travelMs: 230,
      fadeMs:   130,
    });
  });
}

// ── Draw overlay helper ───────────────────────────────────────────────────────
function drawOverlays(
  ctx: CanvasRenderingContext2D, now: number,
  pool: ShieldOverlay[], sc: HTMLImageElement | null,
) {
  if (!sc) return;

  for (let i = pool.length - 1; i >= 0; i--) {
    const s   = pool[i];
    const age = now - s.startMs;
    if (age < 0) continue;
    const tot = s.growMs + s.holdMs + s.fadeMs;
    if (age >= tot) { pool.splice(i, 1); continue; }

    let growT: number, alpha: number;
    if (age < s.growMs) {
      growT = age / s.growMs; alpha = 1.0;
    } else if (age < s.growMs + s.holdMs) {
      growT = 1.0; alpha = 1.0;
    } else {
      growT = 1.0;
      alpha = 1.0 - c01((age - s.growMs - s.holdMs) / s.fadeMs);
    }

    const et = eio(Math.min(1, growT));
    const w  = s.startW + (s.endW - s.startW) * et;
    const h  = s.startH + (s.endH - s.startH) * et;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(s.cx, s.cy);
    if (s.flip) ctx.scale(-1, 1);
    ctx.drawImage(sc, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function drawProjs(ctx: CanvasRenderingContext2D, now: number, pool: Proj[], sc: HTMLImageElement | null) {
  if (!sc) return;

  for (let i = pool.length - 1; i >= 0; i--) {
    const p   = pool[i];
    const age = now - p.startMs;
    if (age < 0) continue;
    const tot = p.travelMs + p.fadeMs;
    if (age >= tot) { pool.splice(i, 1); continue; }

    let t: number, alpha: number;
    if (age <= p.travelMs) {
      t     = age / p.travelMs;
      alpha = 1.0;
    } else {
      t     = 1;
      alpha = 1.0 * (1 - (age - p.travelMs) / p.fadeMs);
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

function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  drawOverlays(ctx, now, pool,    _shieldImg);
  drawProjs(ctx, now, ultPool, _ultImg);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MykoVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    ensureShield(() => {}); // pre-load
    ensureUlt(() => {});    // pre-load

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<MykoVFXTrigger>).detail;
      if (e.type === 'myko_shield') {
        spawnShield(e.targetSlot, e.targetSide);
      } else if (e.type === 'myko_ult') {
        const slots = e.targetSlots ?? [e.targetSlot];
        slots.forEach((s, i) => spawnUlt(e.actorSlot, e.actorSide, s, e.targetSide, i * 100));
      }
    };

    window.addEventListener('myko-vfx', onVFX);
    return () => window.removeEventListener('myko-vfx', onVFX);
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
        if (pool.length > 0 || ultPool.length > 0) {
          ctx.save();
          ctx.scale(dpr, dpr);
          drawPool(ctx, performance.now());
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); pool.length = 0; ultPool.length = 0; };
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