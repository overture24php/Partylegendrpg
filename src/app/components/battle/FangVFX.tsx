/**
 * FangVFX — Flying slash effects for Fang.
 *
 * Asset: shared green-screen slash image (chroma-keyed via slashAsset.ts).
 *
 * SKILL 1 (Twin Slash / 2× hit) — Lucas-ULT-style alternating mechanism:
 *   hitIndex 0  → slash angled +0.22 rad above travel axis
 *   hitIndex 1  → slash angled −0.22 rad below travel axis
 *   BattlePlayback fires hitIndex 0 at the attack moment, then fires
 *   hitIndex 1 before the second damage application (160 ms later).
 *
 * All other skills: single slash along actor→target axis.
 * ULT (Death Bound): 2.5× size for execute visual weight.
 */

import { useEffect, useRef } from 'react';
import { applyChromaKey, getContentBounds } from '../../utils/chromaKey';
import { getSpriteSize } from '../../data/spriteConfig';

// ── Fang-specific slash asset ─────────────────────────────────────────────────
const FANG_SLASH_URL =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743508/slashfang_wlxt0j.png';

let _fangCanvas: HTMLCanvasElement | null = null;
let _fangBounds: { x: number; y: number; w: number; h: number } | null = null;
const _fangCbs: Array<() => void> = [];

function ensureSlashAsset(cb: () => void): void {
  if (_fangCanvas) { cb(); return; }
  _fangCbs.push(cb);
  if (_fangCbs.length > 1) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c   = document.createElement('canvas');
    c.width   = img.naturalWidth;
    c.height  = img.naturalHeight;
    const cx  = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0);
    const d   = cx.getImageData(0, 0, c.width, c.height);
    applyChromaKey(d.data);
    cx.putImageData(d, 0, 0);
    const b   = getContentBounds(d.data, c.width, c.height);
    _fangBounds = b ?? { x: 0, y: 0, w: c.width, h: c.height };
    _fangCanvas = c;
    _fangCbs.forEach(f => f());
    _fangCbs.length = 0;
  };
  img.onerror = () => { _fangCbs.length = 0; };
  img.src = FANG_SLASH_URL;
}

function getSlashCanvas(): HTMLCanvasElement | null { return _fangCanvas; }
function getSlashBounds(): { x: number; y: number; w: number; h: number } | null { return _fangBounds; }

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

// Per-row lift so effects land on upper body, not feet
const ROW_BODY_LIFT = [70, 95, 170] as const;

// ── Public event type ─────────────────────────────────────────────────────────
export type FangVFXTrigger = {
  type:        'fang_basic' | 'fang_sk1' | 'fang_sk2' | 'fang_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
  /** 0 = first hit, 1 = second hit (SK1 alternating slashes). */
  hitIndex?:   number;
};

// ── Projectile pool ───────────────────────────────────────────────────────────
type Proj = {
  sx: number; sy: number;
  ex: number; ey: number;
  startH: number; endH: number;
  startW: number; endW: number;
  angle:    number;
  startMs:  number;
  travelMs: number;
  fadeMs:   number;
};

const pool: Proj[] = [];

const eio = (t: number) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// ── Slot centre in screen coords (used for TARGET position) ──────────────────
function slotPos(side: 'hero' | 'enemy', slot: number) {
  const rowI = Math.min(2, Math.floor(slot / 2));
  const col  = slot % 2;
  const row  = getRow(side, rowI);
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x: gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y: window.innerHeight - GRID_H + row.y + row.slotH / 2 - ROW_BODY_LIFT[rowI],
  };
}

// Row 2 sprites are lifted 60px — actor spawn must account for this
const ACTOR_SPRITE_LIFT = [0, 0, 60] as const;

// Actor body-centre — places slash ORIGIN at Fang's visual torso (not head)
function actorBodyPos(side: 'hero' | 'enemy', slot: number) {
  const rowI = Math.min(2, Math.floor(slot / 2));
  const col  = slot % 2;
  const row  = getRow(side, rowI);
  const gl   = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x: gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y: window.innerHeight - GRID_H + row.y + row.slotH * 0.55 - ACTOR_SPRITE_LIFT[rowI],
  };
}

// ── Spawn a single slash projectile ──────────────────────────────────────────
function spawn(
  actorSlot: number, actorSide: 'hero' | 'enemy',
  tSlot:     number, tSide:     'hero' | 'enemy',
  sizeMult:  number,
  angleOffset: number,
) {
  ensureSlashAsset(() => {
    const actor  = actorBodyPos(actorSide, actorSlot);
    const target = slotPos(tSide, tSlot);
    const cfg    = getSpriteSize('vfx_fang_slash');
    pool.push({
      sx: actor.x,  sy: actor.y,
      ex: target.x, ey: target.y,
      startH:   cfg.h * 0.45 * sizeMult,
      endH:     cfg.h * 1.00 * sizeMult,
      startW:   cfg.w * 0.45 * sizeMult,
      endW:     cfg.w * 1.00 * sizeMult,
      angle:    Math.atan2(target.y - actor.y, target.x - actor.x) + angleOffset,
      startMs:  performance.now(),
      travelMs: 195,
      fadeMs:   105,
    });
  });
}

// ── Draw all pooled slashes ───────────────────────────────────────────────────
function drawPool(ctx: CanvasRenderingContext2D, now: number) {
  const sc = getSlashCanvas();
  const sb = getSlashBounds();
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
      alpha = 0.88;
    } else {
      t     = 1;
      alpha = 0.88 * (1 - (age - p.travelMs) / p.fadeMs);
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
export function FangVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    // Pre-load asset so first attack has no delay
    ensureSlashAsset(() => {});

    const onVFX = (ev: Event) => {
      const e = (ev as CustomEvent<FangVFXTrigger>).detail;
      const hitIndex = e.hitIndex ?? 0;

      // SK1 alternating: alternate ±0.22 rad (~13°) around the travel axis
      let angleOffset = 0;
      if (e.type === 'fang_sk1') {
        angleOffset = hitIndex % 2 === 0 ? 0.22 : -0.22;
      }

      // ULT gets a larger slash for visual weight
      const sizeMult = e.type === 'fang_ult' ? 2.5 : 1.0;

      for (const tSlot of e.targetSlots) {
        spawn(e.actorSlot, e.actorSide, tSlot, e.targetSide, sizeMult, angleOffset);
      }
    };

    window.addEventListener('fang-vfx', onVFX);
    return () => window.removeEventListener('fang-vfx', onVFX);
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