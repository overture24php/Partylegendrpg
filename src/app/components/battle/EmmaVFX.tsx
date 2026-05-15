/**
 * EmmaVFX v2 — Image-based VFX for Emma's skills.
 *
 *  emma_basic   → 4-pointed Gemini-star projectile (unchanged — canvas drawn)
 *  emma_sk1     → Heal image flies from Emma → target (green-screen asset, chroma-keyed)
 *  emma_sk2     → Shield image appears on target, scale-up + fade (green-screen asset)
 *  emma_passive → Same shield image, one per shielded ally (staggered 90ms)
 *  emma_ult     → Same heal image as SK1, one flying instance per target (up to 3)
 *
 * Both image assets use getContentBounds() to find actual content region after
 * chroma key, ensuring correct aspect ratio and full-size rendering independent
 * of transparent padding in the source image.
 *
 * Size reference: HERO_SPRITE_H = 280px  (≈ Lucas/Emma visible body height).
 */

import { useEffect, useRef } from 'react';
import { applyChromaKey, getContentBounds } from '../../utils/chromaKey';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Asset URLs ─────────────────────────────────────────────────────────────────
const BULLET_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778743496/bulletemma_sajf0q.png';
const HEAL_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743503/healemma_kgeprm.png';
const SHIELD_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743510/shieldemma_lac0xm.png';

// ── Layout constants (mirror BattlePlayback) ──────────────────────────────────
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

// Per-row lift so PROJECTILE ORIGINS land on upper body
const ROW_BODY_LIFT = [70, 95, 170] as const;

// Per-row foot-Y offset: innerHeight - ROW_FOOT_OFFSET[ri] = where this row's characters stand
// Derived from: innerHeight - GRID_H + row.y + row.slotH
//   row0: 310-8-60=242  row1: 310-82-86=142  row2: 310-190-120=0
const ROW_FOOT_OFFSET = [242, 142, 60] as const;

/** Returns the screen Y of a character's feet for the given slot. */
function slotFootY(slot: number): number {
  const ri = Math.min(2, Math.floor(slot / 2));
  return window.innerHeight - ROW_FOOT_OFFSET[ri];
}

/** Reference "full human character" height in screen-px (matches Lucas/Emma sprite container). */
const HERO_SPRITE_H = 280;

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
  const row  = getRow(side, ri);
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x:     gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y:     window.innerHeight - GRID_H + row.y + row.slotH / 2 - ROW_BODY_LIFT[ri],
    slotH: row.slotH,
  };
}

const c01 = (x: number) => Math.max(0, Math.min(1, x));
const eio = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// ─────────────────────────────────────────────────────────────────────────────
// Asset loader helpers — load once, chroma-key, detect content bounds
// ─────────────────────────────────────────────────────────────────────────────

type AssetState = {
  canvas:  HTMLCanvasElement | null;
  bounds:  { x: number; y: number; w: number; h: number } | null;
  aspect:  number;
  cbs:     Array<() => void>;
};

function makeAsset(): AssetState {
  return { canvas: null, bounds: null, aspect: 1, cbs: [] };
}

function ensureAsset(url: string, state: AssetState, cb: () => void) {
  if (state.canvas) { cb(); return; }
  state.cbs.push(cb);
  if (state.cbs.length > 1) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c   = document.createElement('canvas');
    c.width   = img.naturalWidth;
    c.height  = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d   = ctx.getImageData(0, 0, c.width, c.height);
    applyChromaKey(d.data);
    ctx.putImageData(d, 0, 0);
    const b = getContentBounds(d.data, c.width, c.height);
    state.bounds = b ?? { x: 0, y: 0, w: c.width, h: c.height };
    state.aspect = state.bounds.w / Math.max(1, state.bounds.h);
    state.canvas = c;
    state.cbs.forEach(f => f());
    state.cbs.length = 0;
  };
  img.onerror = () => { state.cbs.length = 0; };
  img.src = url;
}

const bulletAsset = makeAsset();
const healAsset   = makeAsset();
const shieldAsset = makeAsset();

// ─────────────────────────────────────────────────────────────────────────────
// Particle pool types
// ─────────────────────────────────────────────────────────────────────────────

/** Basic-attack bullet (image-based) */
type GeminiProj = {
  sx: number; sy: number;
  ex: number; ey: number;
  spawnMs:  number;
  travelMs: number;
  holdMs:   number;
  fadeMs:   number;
  size:     number;
  angle:    number;
};

/** Image flying from Emma to heal target (SK1 / ULT) */
type HealProj = {
  sx: number; sy: number;
  ex: number; ey: number;
  startH: number; endH: number;
  startW: number; endW: number;
  angle:    number;
  startMs:  number;
  travelMs: number;
  fadeMs:   number;
};

/** Shield image appearing on target (SK2 / passive) */
type ShieldOverlay = {
  cx:     number;
  cy:     number;
  startH: number; endH: number;
  startW: number; endW: number;
  startMs: number;
  delay:   number;
  growMs:  number;
  holdMs:  number;
  fadeMs:  number;
  flip:    boolean; // true → mirror horizontally (enemy side faces left)
};

// Module-level pools
const projPool:        GeminiProj[]    = [];
const healPool:        HealProj[]      = [];   // unused after SK1/ULT change, kept for safety
const healOverlayPool: ShieldOverlay[] = [];   // instant heal at target (SK1 / ULT)
const shieldPool:      ShieldOverlay[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Spawners
// ─────────────────────────────────────────────────────────────────────────────

function spawnProj(actorSlot: number, actorSide: 'hero' | 'enemy',
                   tSlot: number, tSide: 'hero' | 'enemy') {
  ensureAsset(BULLET_URL, bulletAsset, () => {
    const from = slotPos(actorSide, actorSlot);
    const to   = slotPos(tSide, tSlot);
    const sy   = from.y;
    const ey   = to.y;
    projPool.push({
      sx: from.x, sy,
      ex: to.x,   ey,
      spawnMs:  performance.now(),
      travelMs: 185, holdMs: 30, fadeMs: 70,
      size:  72,
      angle: Math.atan2(ey - sy, to.x - from.x),
    });
  });
}

function spawnHealProj(actorSlot: number, actorSide: 'hero' | 'enemy',
                       tSlot: number, tSide: 'hero' | 'enemy') {
  ensureAsset(HEAL_URL, healAsset, () => {
    const actor = slotPos(actorSide, actorSlot);
    const tgt   = slotPos(tSide, tSlot);
    const sy    = actor.y;
    const ey    = tgt.y;
    const cfg   = getSpriteSize('vfx_emma_heal');
    healPool.push({
      sx: actor.x, sy,
      ex: tgt.x,   ey,
      startH:  cfg.h * 0.45,
      endH:    cfg.h,
      startW:  cfg.w * 0.45,
      endW:    cfg.w,
      angle:   Math.atan2(ey - sy, tgt.x - actor.x),
      startMs: performance.now(),
      travelMs: 230,
      fadeMs:   130,
    });
  });
}

/** Instant heal overlay at target — size scales with target's slot height */
function spawnHealOverlay(tSlot: number, tSide: 'hero' | 'enemy', delay = 0) {
  ensureAsset(HEAL_URL, healAsset, () => {
    const sp   = slotPos(tSide, tSlot);
    // Scale to target body — large front-row targets get a larger heal glow
    const endH = sp.slotH * 2.5;
    const endW = endH * (healAsset.aspect || 1);
    const cy   = slotFootY(tSlot) + 10 - endH / 2;
    healOverlayPool.push({
      cx:      sp.x,
      cy,
      startH:  endH * 0.45,
      endH,
      startW:  endW * 0.45,
      endW,
      startMs: performance.now(),
      delay,
      growMs:  200,
      holdMs:  350,
      fadeMs:  260,
      flip:    false,
    });
  });
}

function spawnShieldOverlay(tSlot: number, tSide: 'hero' | 'enemy', delay = 0) {
  ensureAsset(SHIELD_URL, shieldAsset, () => {
    const { x } = slotPos(tSide, tSlot);
    const cfg    = getSpriteSize('vfx_emma_shield');
    const cy     = slotFootY(tSlot) + 10 - cfg.h / 2;
    shieldPool.push({
      cx:      x,
      cy,
      startH:  cfg.h * 0.50,
      endH:    cfg.h,
      startW:  cfg.w * 0.50,
      endW:    cfg.w,
      startMs: performance.now(),
      delay,
      growMs:  220,
      holdMs:  420,
      fadeMs:  320,
      flip:    tSide === 'enemy',
    });
  });
}

// ── Public spawn-by-type helpers ──────────────────────────────────────────────

function spawnBasic(actorSlot: number, actorSide: 'hero' | 'enemy',
                    tSlots: number[], tSide: 'hero' | 'enemy') {
  for (const s of tSlots) spawnProj(actorSlot, actorSide, s, tSide);
}

/** SK1: instant heal overlay at target (NOT a flying projectile) */
function spawnSk1(_actorSlot: number, _actorSide: 'hero' | 'enemy',
                  tSlots: number[], tSide: 'hero' | 'enemy') {
  for (const s of tSlots) spawnHealOverlay(s, tSide);
}

function spawnSk2(tSlots: number[], tSide: 'hero' | 'enemy') {
  for (const s of tSlots) spawnShieldOverlay(s, tSide);
}

function spawnPassive(tSlots: number[], tSide: 'hero' | 'enemy') {
  // Stagger each shield 90 ms apart for a pleasing wave effect
  for (let i = 0; i < tSlots.length; i++) {
    spawnShieldOverlay(tSlots[i], tSide, i * 90);
  }
}

/** ULT: instant heal overlay per target (NOT flying projectiles) */
function spawnUlt(_actorSlot: number, _actorSide: 'hero' | 'enemy',
                  tSlots: number[], tSide: 'hero' | 'enemy') {
  for (let i = 0; i < tSlots.length; i++) {
    spawnHealOverlay(tSlots[i], tSide, i * 80);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw helpers
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Master render tick
// ─────────────────────────────────────────────────────────────────────────────
function drawPools(ctx: CanvasRenderingContext2D, now: number) {

  // ── Basic bullet (image-based) ────────────────────────────────────────────
  if (bulletAsset.canvas && bulletAsset.bounds) {
    const { x: bx, y: by, w: bw, h: bh } = bulletAsset.bounds;
    for (let i = projPool.length - 1; i >= 0; i--) {
      const p       = projPool[i];
      const elapsed = now - p.spawnMs;
      const total   = p.travelMs + p.holdMs + p.fadeMs;
      if (elapsed >= total) { projPool.splice(i, 1); continue; }
      let t: number, alpha: number;
      if (elapsed < p.travelMs) {
        t = elapsed / p.travelMs; alpha = 1;
      } else if (elapsed < p.travelMs + p.holdMs) {
        t = 1; alpha = 1;
      } else {
        t = 1; alpha = 1 - (elapsed - p.travelMs - p.holdMs) / p.fadeMs;
      }
      const ease = 1 - (1 - t) * (1 - t);
      const cx   = p.sx + (p.ex - p.sx) * ease;
      const cy   = p.sy + (p.ey - p.sy) * ease;
      ctx.save();
      ctx.globalAlpha = c01(alpha);
      ctx.translate(cx, cy);
      ctx.rotate(p.angle);
      ctx.drawImage(bulletAsset.canvas, bx, by, bw, bh, -p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  // ── Heal projectiles (legacy — no longer used but kept for safety) ────────
  if (healAsset.canvas && healAsset.bounds) {
    const { x: bx, y: by, w: bw, h: bh } = healAsset.bounds;
    for (let i = healPool.length - 1; i >= 0; i--) {
      const p   = healPool[i];
      const age = now - p.startMs;
      const tot = p.travelMs + p.fadeMs;
      if (age >= tot) { healPool.splice(i, 1); continue; }
      let t: number, alpha: number;
      if (age <= p.travelMs) { t = age / p.travelMs; alpha = 0.88; }
      else { t = 1; alpha = 0.88 * (1 - (age - p.travelMs) / p.fadeMs); }
      const et = eio(Math.min(1, t));
      const cx = p.sx + (p.ex - p.sx) * et;
      const cy = p.sy + (p.ey - p.sy) * et;
      const h  = p.startH + (p.endH - p.startH) * et;
      const w  = p.startW + (p.endW - p.startW) * et;
      ctx.save();
      ctx.globalAlpha = c01(alpha);
      ctx.drawImage(healAsset.canvas, bx, by, bw, bh, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
    }
  }

  // ── Heal overlays (SK1 / ULT — instant at target) ─────────────────────────
  if (healAsset.canvas && healAsset.bounds) {
    const { x: bx, y: by, w: bw, h: bh } = healAsset.bounds;
    for (let i = healOverlayPool.length - 1; i >= 0; i--) {
      const p   = healOverlayPool[i];
      const age = now - p.startMs - p.delay;
      if (age < 0) continue;
      const tot = p.growMs + p.holdMs + p.fadeMs;
      if (age >= tot) { healOverlayPool.splice(i, 1); continue; }
      let h: number, w: number, alpha: number;
      if (age < p.growMs) {
        const t = eio(age / p.growMs);
        h     = p.startH + (p.endH - p.startH) * t;
        w     = p.startW + (p.endW - p.startW) * t;
        alpha = 0.90 * (age / p.growMs);
      } else if (age < p.growMs + p.holdMs) {
        h     = p.endH;
        w     = p.endW;
        alpha = 0.90;
      } else {
        h     = p.endH;
        w     = p.endW;
        alpha = 0.90 * (1 - (age - p.growMs - p.holdMs) / p.fadeMs);
      }
      ctx.save();
      ctx.globalAlpha = c01(alpha);
      ctx.translate(p.cx, p.cy);
      if (p.flip) ctx.scale(-1, 1);
      ctx.drawImage(healAsset.canvas, bx, by, bw, bh, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  // ── Shield overlays (SK2 / passive) — image-based ─────────────────────────
  if (shieldAsset.canvas && shieldAsset.bounds) {
    const { x: bx, y: by, w: bw, h: bh } = shieldAsset.bounds;
    for (let i = shieldPool.length - 1; i >= 0; i--) {
      const p   = shieldPool[i];
      const age = now - p.startMs - p.delay;
      if (age < 0) continue;
      const tot = p.growMs + p.holdMs + p.fadeMs;
      if (age >= tot) { shieldPool.splice(i, 1); continue; }
      let h: number, w: number, alpha: number;
      if (age < p.growMs) {
        const t = eio(age / p.growMs);
        h     = p.startH + (p.endH - p.startH) * t;
        w     = p.startW + (p.endW - p.startW) * t;
        alpha = 0.88 * (age / p.growMs);
      } else if (age < p.growMs + p.holdMs) {
        h     = p.endH;
        w     = p.endW;
        alpha = 0.88;
      } else {
        h     = p.endH;
        w     = p.endW;
        alpha = 0.88 * (1 - (age - p.growMs - p.holdMs) / p.fadeMs);
      }
      ctx.save();
      ctx.globalAlpha = c01(alpha);
      ctx.translate(p.cx, p.cy);
      if (p.flip) ctx.scale(-1, 1);
      ctx.drawImage(shieldAsset.canvas, bx, by, bw, bh, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function EmmaVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    // Pre-load all assets immediately
    ensureAsset(BULLET_URL, bulletAsset, () => {});
    ensureAsset(HEAL_URL,   healAsset,   () => {});
    ensureAsset(SHIELD_URL, shieldAsset, () => {});

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<EmmaVFXTrigger>).detail;
      switch (e.type) {
        case 'emma_basic':
          spawnBasic(e.actorSlot, e.actorSide, e.targetSlots, e.targetSide);
          break;
        case 'emma_sk1':
          spawnSk1(e.actorSlot, e.actorSide, e.targetSlots, e.targetSide);
          break;
        case 'emma_sk2':
          spawnSk2(e.targetSlots, e.targetSide);
          break;
        case 'emma_passive':
          spawnPassive(e.targetSlots, e.targetSide);
          break;
        case 'emma_ult':
          spawnUlt(e.actorSlot, e.actorSide, e.targetSlots, e.targetSide);
          break;
      }
    };
    window.addEventListener('emma-vfx', onVFX);
    return () => window.removeEventListener('emma-vfx', onVFX);
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
        const hasParticles = projPool.length > 0 || healPool.length > 0 ||
          healOverlayPool.length > 0 || shieldPool.length > 0;
        if (hasParticles) {
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
      projPool.length        = 0;
      healPool.length        = 0;
      healOverlayPool.length = 0;
      shieldPool.length      = 0;
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
        zIndex:        500,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  );
}