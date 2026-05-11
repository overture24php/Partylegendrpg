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
import { applyChromaKey, getContentBounds } from '../../utils/chromaKey';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Asset URL (green-screen → chroma key) ────────────────────────────────────
const HEAL_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778229880/ChatGPT_Image_May_8_2026_03_41_34_PM_cytadc.png';

// ── Asset loader ─────────────────────────────────────────────────────────────
type AssetState = {
  canvas: HTMLCanvasElement | null;
  bounds: { x: number; y: number; w: number; h: number } | null;
  cbs:    Array<() => void>;
};
const healAsset: AssetState = { canvas: null, bounds: null, cbs: [] };

function ensureHeal(cb: () => void) {
  if (healAsset.canvas) { cb(); return; }
  healAsset.cbs.push(cb);
  if (healAsset.cbs.length > 1) return;
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
    const b         = getContentBounds(d.data, c.width, c.height);
    healAsset.bounds = b ?? { x: 0, y: 0, w: c.width, h: c.height };
    healAsset.canvas = c;
    healAsset.cbs.forEach(f => f());
    healAsset.cbs.length = 0;
  };
  img.onerror = () => { healAsset.cbs.length = 0; };
  img.src = HEAL_URL;
}

// ── Grid layout (mirrors BattlePlayback) ─────────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW:  60, slotH:  60, col0X:  30, col1X: 278, y:   8 },
  { slotW:  86, slotH:  86, col0X:  17, col1X: 265, y:  82 },
  { slotW: 120, slotH: 120, col0X:   0, col1X: 248, y: 190 },
] as const;

const ROW_BODY_LIFT = [70, 95, 110] as const;
// ── Public event type ─────────────────────────────────────────────────────────
export type CloverVFXTrigger = {
  type:        'clover_sk1' | 'clover_sk2' | 'clover_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Projectile pool ───────────────────────────────────────────────────────────
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

const pool: HealProj[] = [];

const eio = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

function slotPos(side: 'hero' | 'enemy', slot: number) {
  const col = slot % 2;
  const ri  = Math.min(2, Math.floor(slot / 2));
  const row = ROW_DATA[ri];
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
    const actor = slotPos(actorSide, actorSlot);
    const tgt   = slotPos(tSide, tSlot);
    const sy    = actor.y - actor.slotH * 0.05;
    const ey    = tgt.y   - tgt.slotH   * 0.05;
    const cfg   = getSpriteSize('vfx_clover_heal');
    pool.push({
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

// ── Draw ─────────────────────────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  const { canvas: sc, bounds: sb } = healAsset;
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
    ctx.rotate(p.angle);
    ctx.drawImage(sc, bx, by, bw, bh, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CloverVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    ensureHeal(() => {}); // pre-load

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<CloverVFXTrigger>).detail;
      for (const tSlot of e.targetSlots) {
        spawnHeal(e.actorSlot, e.actorSide, tSlot, e.targetSide);
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