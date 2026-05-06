/**
 * PixiObtainedGrid — WebGL hero card grid.
 *
 * DESIGN  : 1-to-1 visual recreation of HeroCard.tsx SVG design.
 * PERF    : Zero live GPU filters. All static card layers (bg, text, stars,
 *           badges, gradients) are pre-baked to Canvas2D textures ONCE, then
 *           displayed as single Sprites.  Only illustration float, sweep, and
 *           holo are driven by the Ticker each frame.
 *
 * DRAW-CALL BUDGET per card:
 *   bgSprite    — 1  (border + rarity fill, shared per rarity)
 *   ilSprite    — 1  (chroma-keyed illustration, NO filter)
 *   ovSprite    — 1  (all text/stars/gradients baked to canvas)
 *   sweepSprite — 1  (ADD blend, shared texture)
 *   holoSprite  — 1  (ADD blend, shared texture)
 *   ─────────────────
 *   Total       — 5  (vs 120+ draw calls + N FBO passes in the previous build)
 */

import React, { useEffect, useRef } from 'react';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  BLEND_MODES,
} from 'pixi.js';
import {
  chromaDataUrlCache,
  applyChromaKey,
  keepChromaUrl,
} from '../utils/chromaKey';
import { HERO_RARITIES } from './HeroCard';

// ─── Public data shape ──────────────────────────────────────────────────────
export interface HeroData {
  heroId:    string;
  name:      string;
  rarity:    string;   // 'common'|'rare'|'epic'|'legendary'|'mythic'
  heroType:  string;
  level:     number;
  stars:     number;   // absolute star count 1-16
  illustUrl: string;   // raw Cloudinary URL — CPU chroma key applied once
}

interface Props {
  heroes:      HeroData[];
  visible:     boolean;
  onCardClick: (heroId: string) => void;
}

type RCfg = typeof HERO_RARITIES[number];

// ─── Layout ───────────────────────────────────────────────────────────────────
const COLS  = 5;
const H_PAD = 10;
const V_PAD = 10;
const GAP   = 8;

// ─── Module-level GPU texture caches ─────────────────────────────────────────
// Survive component remounts — textures are GPU-resident after first load.
const _illTex: Map<string, Texture> = new Map(); // chroma-keyed illustrations
const _bgTex:  Map<string, Texture> = new Map(); // static card BG per rarity+size

// Shared sweep + holo (one set per cardW value)
let _sweepTex: Texture | null = null;
let _holoTex:  Texture | null = null;
let _shTexW = 0;

// ─── Persistent Application state (survives HeroPage unmount/remount) ────────
// WebGL context is NEVER destroyed — canvas detaches/reattaches to DOM only.
// This eliminates the 50-200ms freeze caused by GL context re-creation.
let _app:       Application       | null = null;
let _canvas:    HTMLCanvasElement | null = null;
let _grid:      Container         | null = null;
let _cards:     CardNode[]              = [];
let _scroll                             = { y: 0, vel: 0, max: 0 };
let _heroesKey: string                  = '';
let _clickCb:   ((id: string) => void)  | null = null;
let _ro:        ResizeObserver    | null = null;

// ─── Canvas 2D helpers ────────────────────────────────────────────────────────

/** Rounded-rect path helper */
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

/** Five-point star path helper */
function star5(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number, r: number,
): void {
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const oa = (-90 + k * 72) * (Math.PI / 180);
    const ia = (-54 + k * 72) * (Math.PI / 180);
    if (k === 0) ctx.moveTo(cx + R * Math.cos(oa), cy + R * Math.sin(oa));
    else         ctx.lineTo(cx + R * Math.cos(oa), cy + R * Math.sin(oa));
    ctx.lineTo(cx + r * Math.cos(ia), cy + r * Math.sin(ia));
  }
  ctx.closePath();
}

/** Draw text centered at (x,y) with explicit letter-spacing (px). */
function fillTextLS(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, ls: number,
): void {
  const chars = [...text];
  if (!chars.length) return;
  let totalW = chars.reduce((acc, ch) => acc + ctx.measureText(ch).width, 0);
  totalW += ls * (chars.length - 1);
  let cx = x - totalW / 2;
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + ls;
  }
}

// ─── Static card BG canvas ─────────────────────────────────────────────────────
// Shared per rarity+size: outer border, inner fill, inner stroke.
function getBgTexture(cfg: RCfg, cardW: number, cardH: number): Texture {
  const key = `${cfg.id}-${cardW}`;
  if (_bgTex.has(key)) return _bgTex.get(key)!;

  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s   = cardW / 250;

  // Outer border (rarity border color)
  rrect(ctx, 0, 0, cardW, cardH, 12 * s);
  ctx.fillStyle = cfg.border;
  ctx.fill();

  // Inner fill (rarity fill color)
  rrect(ctx, 3 * s, 3 * s, 244 * s, 394 * s, 10 * s);
  ctx.fillStyle = cfg.fill;
  ctx.fill();

  // Inner dark stroke
  rrect(ctx, 3 * s, 3 * s, 244 * s, 394 * s, 10 * s);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth   = 2 * s;
  ctx.stroke();

  const tex = Texture.from(cv);
  _bgTex.set(key, tex);
  return tex;
}

// ─── Per-card overlay canvas ──────────────────────────────────────────────────
// Contains: bottom gradient fades, heroType text, stars (all 4 tiers),
// rarity diamond+text, bottom black bar, zigzag, hero name, level badge,
// outer shine stroke.  All transparent where illustration should show through.
function createOverlayCanvas(
  data: HeroData, cfg: RCfg, cardW: number, cardH: number,
): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s   = cardW / 250; // uniform scale (AR is maintained at 250:400)

  // ── Clip to inner card bounds (mirrors SVG clipPath) ──────────────────────
  ctx.save();
  rrect(ctx, 3 * s, 3 * s, 244 * s, 394 * s, 10 * s);
  ctx.clip();

  // ── Bottom fade gradient (over illustration) ──────────────────────────────
  const botGrad = ctx.createLinearGradient(0, 280 * s, 0, 357 * s);
  botGrad.addColorStop(0, 'rgba(0,0,0,0)');
  botGrad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(3 * s, 280 * s, 244 * s, 77 * s);

  // ── Bar fade (horizontal dark strip behind heroType text) ────────────────
  const barGrad = ctx.createLinearGradient(3 * s, 0, (3 + 185) * s, 0);
  barGrad.addColorStop(0, 'rgba(0,0,0,0.55)');
  barGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = barGrad;
  ctx.fillRect(3 * s, 291 * s, 185 * s, 25 * s);

  // ── Hero type text ─────────────────────────────────────────────────────────
  {
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,1)';
    ctx.shadowOffsetY = 1 * s;
    ctx.shadowBlur    = 4 * s;
    ctx.fillStyle     = '#ffffff';
    ctx.font          = `700 ${Math.max(1, Math.round(13 * s))}px 'Playfair Display',serif`;
    ctx.textAlign     = 'left';
    ctx.textBaseline  = 'middle';
    ctx.fillText(data.heroType, 11 * s, 304 * s);
    ctx.restore();
  }

  // ── Stars (tier system: yellow→red→white→rainbow) ─────────────────────────
  {
    const RS_R    = 14, RS_r = 5.3, RS_CY = 338, RS_X0 = 24, RS_STEP = 32;
    const sc      = Math.max(1, Math.min(16, data.stars));
    const tier    = Math.min(3, Math.floor((sc - 1) / 5)); // 0=yellow,1=red,2=white,3=rainbow
    const inTier  = sc - tier * 5;                          // how many filled in current tier
    const slots   = tier === 3 ? 1 : 5;
    const FILL    = ['#FFD700', '#FF3333', '#D8D8D8', '#FFD700'] as const;
    const STROKE  = ['#000000', '#000000', '#888888', '#000000'] as const;

    for (let i = 0; i < slots; i++) {
      const lit = i < inTier;
      const cx  = (RS_X0 + i * RS_STEP) * s;
      const cy  = RS_CY * s;
      ctx.save();
      if (lit && tier === 3) {
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur  = 6 * s;
      }
      star5(ctx, cx, cy, RS_R * s, RS_r * s);
      ctx.fillStyle   = lit ? FILL[tier]   : 'rgba(0,0,0,0.38)';
      ctx.fill();
      ctx.strokeStyle = lit ? STROKE[tier] : 'rgba(255,255,255,0.18)';
      ctx.lineWidth   = 1.2 * s;
      ctx.lineJoin    = 'round';
      ctx.stroke();
      if (lit && tier === 3) {
        // Extra glow ring for rainbow
        ctx.shadowBlur  = 12 * s;
        ctx.shadowColor = 'rgba(255,80,255,0.7)';
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Rarity diamond badge ──────────────────────────────────────────────────
  {
    const bsx = (cfg.text === 'SS' ? 210 : 218) * s;
    const bsy = 321 * s;
    const d   = 28 * s;
    const c   = 5  * s;

    // Diamond shape (quadratic bezier)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bsx, bsy - d);
    ctx.quadraticCurveTo(bsx + c, bsy - c, bsx + d, bsy);
    ctx.quadraticCurveTo(bsx + c, bsy + c, bsx,     bsy + d);
    ctx.quadraticCurveTo(bsx - c, bsy + c, bsx - d, bsy);
    ctx.quadraticCurveTo(bsx - c, bsy - c, bsx,     bsy - d);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();

    // Rarity letter — gradient fill, stroke painted first (paintOrder: stroke)
    const tg = ctx.createLinearGradient(bsx, bsy - 30 * s, bsx, bsy + 30 * s);
    tg.addColorStop(0,    cfg.shine);
    tg.addColorStop(0.48, cfg.shine);
    tg.addColorStop(1,    cfg.fill);
    const rfs = Math.max(1, Math.round(52 * s));
    ctx.font         = `bold ${rfs}px 'Playfair Display',serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = '#000000';
    ctx.lineWidth    = 1.5 * s;
    ctx.strokeText(cfg.text, bsx, bsy); // stroke first
    ctx.fillStyle = tg;
    ctx.fillText(cfg.text, bsx, bsy);
    ctx.restore();
  }

  // ── Bottom black bar ──────────────────────────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(3 * s, 357 * s, 244 * s, 40 * s);

  // ── Zigzag decoration on black bar ───────────────────────────────────────
  {
    const pts = [
      3,367, 15,387, 27,367, 39,387, 51,367, 63,387, 75,367, 87,387,
      99,367, 111,387, 123,367, 135,387, 147,367, 159,387, 171,367,
      183,387, 195,367, 207,387, 219,367, 231,387, 243,367,
    ];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0] * s, pts[1] * s);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * s, pts[i + 1] * s);
    ctx.strokeStyle = 'rgba(100,60,10,0.35)';
    ctx.lineWidth   = 1.5 * s;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // ── Hero name ──────────────────────────────────────────────────────────────
  {
    ctx.save();
    ctx.fillStyle    = '#ffffff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // Auto-scale font so even long names fit the 230-unit bar width
    const maxW       = 230 * s;
    let   nameSize   = Math.max(1, Math.round(18 * s));
    ctx.font = `700 ${nameSize}px 'Playfair Display',serif`;
    while (ctx.measureText(data.name).width > maxW && nameSize > Math.max(1, Math.round(9 * s))) {
      nameSize -= Math.max(1, Math.round(s * 0.8));
      ctx.font  = `700 ${nameSize}px 'Playfair Display',serif`;
    }

    // Use native letterSpacing when supported (Chrome99+, Safari17+)
    // Fallback: fillText without spacing (still centred correctly)
    const ls = Math.round(3 * s);
    if ('letterSpacing' in ctx) {
      (ctx as any).letterSpacing = `${ls}px`;
      ctx.fillText(data.name, 125 * s, 378 * s);
      (ctx as any).letterSpacing = '0px';
    } else {
      fillTextLS(ctx, data.name, 125 * s, 378 * s, ls);
    }
    ctx.restore();
  }

  // ── Level badge (triangle top-left corner) ────────────────────────────────
  {
    const S   = 66;
    const lvX = (3 + S * 0.28) * s;
    const lvY = (3 + S * 0.28) * s;
    const lvFontSize = data.level >= 100 ? 11 : data.level >= 10 ? 14 : 18;
    const lvStroke   = data.level >= 100 ? 3   : data.level >= 10 ? 3.5 : 4;

    ctx.save();
    // Triangle fill + clip
    ctx.beginPath();
    ctx.moveTo(3 * s, 3 * s);
    ctx.lineTo((3 + S) * s, 3 * s);
    ctx.lineTo(3 * s, (3 + S) * s);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fill();
    ctx.clip();
    // Level text rotated -45°
    ctx.translate(lvX, lvY);
    ctx.rotate(-45 * Math.PI / 180);
    ctx.font         = `700 ${Math.max(1, Math.round(lvFontSize * s))}px 'Playfair Display',serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = '#000000';
    ctx.lineWidth    = lvStroke * s;
    ctx.strokeText(`Lv. ${data.level}`, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Lv. ${data.level}`, 0, 0);
    ctx.restore();
  }

  ctx.restore(); // end inner-bounds clip

  // ── Outer shine stroke (drawn outside clip, matches SVG shine rect) ───────
  {
    ctx.save();
    ctx.globalAlpha  = 0.4;
    rrect(ctx, 1 * s, 1 * s, 248 * s, 398 * s, 11 * s);
    ctx.strokeStyle  = cfg.shine;
    ctx.lineWidth    = s;
    ctx.stroke();
    ctx.restore();
  }

  return cv;
}

// ─── Shared sweep + holo textures ────────────────────────────────────────────
function getSharedTextures(
  cardW: number, cardH: number,
): { sweep: Texture; holo: Texture } {
  if (_sweepTex && _holoTex && _shTexW === cardW) {
    return { sweep: _sweepTex, holo: _holoTex };
  }
  const s = cardW / 250;

  // ── Sweep: soft diagonal white streak ─────────────────────────────────────
  const scv = document.createElement('canvas');
  scv.width  = Math.round(cardW * 0.52);
  scv.height = Math.round(cardH * 2.2);
  const sc   = scv.getContext('2d')!;
  const sg   = sc.createLinearGradient(0, 0, scv.width, 0);
  sg.addColorStop(0,    'rgba(255,255,255,0)');
  sg.addColorStop(0.30, 'rgba(255,255,255,0.28)');
  sg.addColorStop(0.50, 'rgba(255,255,255,0.36)');
  sg.addColorStop(0.70, 'rgba(255,255,255,0.28)');
  sg.addColorStop(1,    'rgba(255,255,255,0)');
  sc.fillStyle = sg;
  sc.fillRect(0, 0, scv.width, scv.height);
  _sweepTex = Texture.from(scv);

  // ── Holo: soft iridescent foil — clipped to illustration area ────────────
  // KEY FIX: transparent corners (rounded rect clip) + only above black bar +
  // low-saturation pastels → looks like foil on card surface, not a spotlight.
  const hcv = document.createElement('canvas');
  hcv.width = cardW; hcv.height = cardH;
  const hc  = hcv.getContext('2d')!;

  // Clip to illustration area (inner card bounds, stops above bottom black bar)
  rrect(hc, 3 * s, 3 * s, 244 * s, 354 * s, 10 * s); // height 354 → stops at y=357
  hc.clip();

  // Diagonal soft-pastel gradient (low saturation = foil not disco light)
  const hg = hc.createLinearGradient(3 * s, 3 * s, cardW - 3 * s, 357 * s);
  hg.addColorStop(0,    'rgba(255,220,240,1)'); // soft rose
  hg.addColorStop(0.25, 'rgba(220,235,255,1)'); // soft sky
  hg.addColorStop(0.50, 'rgba(215,255,235,1)'); // soft mint
  hg.addColorStop(0.75, 'rgba(245,220,255,1)'); // soft lavender
  hg.addColorStop(1,    'rgba(255,248,215,1)'); // soft gold
  hc.fillStyle = hg;
  hc.fillRect(0, 0, cardW, cardH);
  _holoTex = Texture.from(hcv);

  _shTexW = cardW;
  return { sweep: _sweepTex, holo: _holoTex };
}

// ─── Illustration texture — CPU chroma key, zero GPU filter ──────────────────
async function loadIllustTex(illustUrl: string): Promise<Texture | null> {
  if (!illustUrl) return null;
  const cacheKey = `ill:${illustUrl}`;
  if (_illTex.has(cacheKey)) return _illTex.get(cacheKey)!;

  // 1. Check CPU chroma cache (warmed by LoadingPage)
  const cached = chromaDataUrlCache.get(illustUrl);
  if (cached) {
    const img = new Image();
    img.src = cached;
    if (!img.complete) {
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
    }
    const tex = Texture.from(img);
    _illTex.set(cacheKey, tex);
    return tex;
  }

  // 2. Fallback: raw URL → CPU chroma key → GPU texture
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = reject;
      img.src = illustUrl;
    });
    const off  = document.createElement('canvas');
    off.width  = img.naturalWidth;
    off.height = img.naturalHeight;
    const octx = off.getContext('2d', { willReadFrequently: true })!;
    octx.drawImage(img, 0, 0);
    const id = octx.getImageData(0, 0, off.width, off.height);
    applyChromaKey(id.data); // existing util from chromaKey.ts
    octx.putImageData(id, 0, 0);
    keepChromaUrl(illustUrl, off.toDataURL('image/png'));
    const tex = Texture.from(off);
    _illTex.set(cacheKey, tex);
    return tex;
  } catch {
    return null;
  }
}

// ─── Card node ────────────────────────────────────────────────────────────────
interface CardNode {
  root:   Container;
  ovSpr:  Sprite;    // exposed → deferred overlay assignment (staggered)
  data:   HeroData;  // kept for deferred createOverlayCanvas call
  cfg:    RCfg;
  update: (totalTime: number, dt: number) => void;
}

function createCard(
  data:     HeroData,
  cfg:      RCfg,
  cardW:    number,
  cardH:    number,
  bgTex:    Texture,
  sweepTex: Texture,
  holoTex:  Texture,
  onClick:  () => void,
  idx:      number,
): CardNode {
  const s     = cardW / 250;
  const phase = idx * 0.618; // golden-ratio stagger

  const root = new Container();
  root.eventMode = 'static';
  root.cursor    = 'pointer';
  // Pivot at card center → scale from center on tap pulse
  root.pivot.set(cardW / 2, cardH / 2);

  // ── 1. BG sprite ─────────────────────────────────────────────────────────
  const bgSpr  = new Sprite(bgTex);
  bgSpr.width  = cardW;
  bgSpr.height = cardH;
  root.addChild(bgSpr);

  // ── 2. Illustration container (clipped to inner card bounds) ──────────────
  // Mask = rounded-rect matching SVG clipPath (rect x=3,y=3,w=244,h=394,rx=10)
  const ilMask = new Graphics();
  ilMask.beginFill(0xFFFFFF, 1);
  ilMask.drawRoundedRect(3 * s, 3 * s, 244 * s, 394 * s, 10 * s);
  ilMask.endFill();

  const ilCon = new Container();
  ilCon.mask  = ilMask;
  root.addChild(ilMask); // mask must be in display list
  root.addChild(ilCon);

  let ilSpr:  Sprite | null = null;
  let ilBaseY = 0;

  // ── 3. Overlay sprite (starts empty; assigned deferred from component) ────
  const ovSpr  = new Sprite(Texture.EMPTY);
  ovSpr.width  = cardW;
  ovSpr.height = cardH;
  root.addChild(ovSpr);

  // ── 4 & 5. Effects container — sweep + holo, clipped to outer card bounds ─
  // FIX: wrapping in a Container with a rounded-rect mask prevents
  // sweep/holo from bleeding outside the card shape.
  const fxMask = new Graphics();
  fxMask.beginFill(0xFFFFFF, 1);
  fxMask.drawRoundedRect(0, 0, cardW, cardH, 12 * s);
  fxMask.endFill();

  const fxCon  = new Container();
  fxCon.mask   = fxMask;
  root.addChild(fxMask);
  root.addChild(fxCon);

  // Sweep (ADD blend — bright white diagonal streak)
  const sweep      = new Sprite(sweepTex);
  sweep.y          = -cardH * 0.60;    // matches CSS: top:-60%
  sweep.height     = cardH * 2.20;    // matches CSS: height:220%
  sweep.blendMode  = BLEND_MODES.ADD;
  sweep.x          = -(sweep.width + 5);
  fxCon.addChild(sweep);

  // Holo (NORMAL blend — soft iridescent tint on card surface, not a spotlight)
  // FIX: NORMAL blend + low alpha + pastel texture = foil shimmer, not ADD light
  const holo       = new Sprite(holoTex);
  holo.width       = cardW;
  holo.height      = cardH;
  holo.blendMode   = BLEND_MODES.NORMAL; // intentional: tint not spotlight
  holo.alpha       = 0.07;
  fxCon.addChild(holo);

  // ── Interaction ───────────────────────────────────────────────────────────
  let tapPulse = 0;
  root.on('pointertap',  onClick);
  root.on('pointerdown', () => { tapPulse = 1; });

  // ── Load illustration (async, no GPU filter ever) ─────────────────────────
  loadIllustTex(data.illustUrl).then(tex => {
    if (!tex || tex === Texture.EMPTY) return;

    const destX = 3  * s;
    const destY = 3  * s;
    const destW = 244 * s;
    const destH = 394 * s;

    // xMidYMax slice: scale to COVER dest, center X, align bottom Y
    const scaleF = Math.max(destW / tex.width, destH / tex.height);
    const drawW  = tex.width  * scaleF;
    const drawH  = tex.height * scaleF;

    ilSpr        = new Sprite(tex);
    ilSpr.width  = drawW;
    ilSpr.height = drawH;
    ilSpr.x      = destX + (destW - drawW) / 2; // center X (xMid)
    ilSpr.y      = destY + (destH - drawH);      // align bottom (YMax)
    ilBaseY      = ilSpr.y;

    ilCon.addChild(ilSpr);
  });

  // ── Per-frame update ──────────────────────────────────────────────────────
  const FLOAT_PERIOD = 3.7;
  const SWEEP_PERIOD = 4.8;
  const HOLO_PERIOD  = 8.0;

  const update = (totalTime: number, dt: number) => {
    const t = totalTime + phase;

    // Illustration float
    if (ilSpr) {
      const fe  = 0.5 * (1 - Math.cos(((t % FLOAT_PERIOD) / FLOAT_PERIOD) * 2 * Math.PI));
      ilSpr.y   = ilBaseY - fe * 10 * s;
    }

    // Sweep
    const sf = (t % SWEEP_PERIOD) / SWEEP_PERIOD;
    if (sf < 0.38) {
      const p    = sf / 0.38;
      const sm   = p * p * (3 - 2 * p);
      sweep.x    = -(sweep.width * 1.2) + sm * (cardW + sweep.width * 2.5);
    } else {
      sweep.x = cardW + 5;
    }

    // Holo: oscillate 0.05 ↔ 0.14 (subtle foil shimmer range)
    const ht   = (t % HOLO_PERIOD) / HOLO_PERIOD;
    holo.alpha = 0.05 + 0.045 * (1 - Math.cos(ht * 2 * Math.PI));

    // Tap pulse
    if (tapPulse > 0) {
      tapPulse = Math.max(0, tapPulse - dt * 5);
      root.scale.set(1 - tapPulse * 0.035);
    } else if (root.scale.x !== 1) {
      root.scale.set(1);
    }
  };

  return { root, ovSpr, data, cfg, update };
}

// ─── React component ──────────────────────────────────────────────────────────
// ── One-time Application bootstrap (called on first-ever mount) ───────────────
function initObtainedApp(w: number, h: number) {
  const app = new Application({
    width: w, height: h,
    backgroundAlpha: 0,
    antialias:       false,
    resolution:      Math.min(window.devicePixelRatio || 1, 2),
    autoDensity:     true,
  });

  const canvas = app.view as HTMLCanvasElement;
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none;';
  // canvas is NOT appended here — caller decides where to put it

  app.stage.eventMode = 'static';
  app.stage.hitArea   = app.screen;

  const grid = new Container();
  app.stage.addChild(grid);

  // Scroll: wheel
  const sc = _scroll;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    sc.vel = 0;
    sc.y   = Math.max(0, Math.min(sc.max, sc.y + e.deltaY * 0.7));
  };

  // Scroll: touch with momentum
  let tY = 0, tT = 0, tVel = 0;
  const onTS = (e: TouchEvent) => { tY = e.touches[0].clientY; tT = performance.now(); tVel = sc.vel = 0; };
  const onTM = (e: TouchEvent) => {
    e.preventDefault();
    const ny = e.touches[0].clientY, nt = performance.now(), dy = tY - ny, dt = Math.max(1, nt - tT);
    tVel = (dy / dt) * 16; tY = ny; tT = nt;
    sc.y = Math.max(0, Math.min(sc.max, sc.y + dy));
  };
  const onTE = () => { sc.vel = tVel; };
  canvas.addEventListener('wheel',      onWheel, { passive: false });
  canvas.addEventListener('touchstart', onTS,    { passive: true  });
  canvas.addEventListener('touchmove',  onTM,    { passive: false });
  canvas.addEventListener('touchend',   onTE,    { passive: true  });

  // Ticker: scroll momentum + card animations
  let totalTime = 0;
  app.ticker.add((delta: number) => {
    const dt = delta / 60;
    totalTime += dt;
    if (Math.abs(sc.vel) > 0.1) {
      sc.y    = Math.max(0, Math.min(sc.max, sc.y + sc.vel));
      sc.vel *= 0.92;
      if (Math.abs(sc.vel) < 0.1) sc.vel = 0;
    }
    grid.y = -Math.round(sc.y);
    for (const card of _cards) card.update(totalTime, dt);
  });

  _app    = app;
  _canvas = canvas;
  _grid   = grid;
}

// ── Imperative pre-warm: called from PixiPreloadManager during loading phase ──
// Creates the Application + builds all cards + staggers GPU overlay uploads.
// Result: when HeroPage first mounts, it just reattaches the canvas — zero init.
export function prewarmObtained(heroes: HeroData[]) {
  if (_app) return; // already warmed

  const w = window.innerWidth  || 390;
  const h = Math.round((window.innerHeight || 800) * 0.705); // ~70.5% = grid area

  initObtainedApp(w, h);
  _app!.ticker.stop(); // don't run until canvas is in DOM

  if (!heroes.length) return;

  const appW  = _app!.screen.width;
  const cardW = Math.floor((appW - H_PAD * 2 - GAP * (COLS - 1)) / COLS);
  const cardH = Math.round(cardW * (400 / 250));
  const { sweep: sweepTex, holo: holoTex } = getSharedTextures(cardW, cardH);

  const newCards: CardNode[] = [];
  heroes.forEach((hero, idx) => {
    const col = idx % COLS, row = Math.floor(idx / COLS);
    const cfg = HERO_RARITIES.find(r => r.id === hero.rarity) ?? HERO_RARITIES[4];
    const bg  = getBgTexture(cfg, cardW, cardH);
    const card = createCard(hero, cfg, cardW, cardH, bg, sweepTex, holoTex,
      () => _clickCb?.(hero.heroId), idx);
    card.root.x = H_PAD + col * (cardW + GAP) + cardW / 2;
    card.root.y = V_PAD + row * (cardH + GAP) + cardH / 2;
    _grid!.addChild(card.root);
    newCards.push(card);
  });
  _cards     = newCards;
  _heroesKey = heroes.map(h => `${h.heroId}:${h.stars}:${h.level}`).join('|');

  const rows   = Math.ceil(heroes.length / COLS);
  const totalH = V_PAD + rows * (cardH + GAP) + V_PAD;
  _scroll.max  = Math.max(0, totalH - h);

  // Stagger overlays; force renderer.render() each batch → textures GPU-uploaded now.
  // By the time HeroPage opens, all textures are already on GPU — zero first-frame stutter.
  const app = _app!;
  document.fonts.ready.then(() => {
    const queue = [...newCards];
    const processNext = () => {
      if (!queue.length) return;
      for (let i = 0; i < 2 && queue.length > 0; i++) {
        const card = queue.shift()!;
        const ov   = createOverlayCanvas(card.data, card.cfg, cardW, cardH);
        card.ovSpr.texture = Texture.from(ov);
        card.ovSpr.width   = cardW;
        card.ovSpr.height  = cardH;
      }
      // Force offscreen render → uploads this batch to GPU immediately
      app.renderer.render(app.stage);
      if (queue.length) requestAnimationFrame(processNext);
    };
    requestAnimationFrame(processNext);
  });
}

export function PixiObtainedGrid({ heroes, visible, onCardClick }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Keep module-level click callback current (used by card event listeners)
  useEffect(() => {
    _clickCb = onCardClick;
    return () => { if (_clickCb === onCardClick) _clickCb = null; };
  }, [onCardClick]);

  // Visibility: start/stop ticker
  useEffect(() => {
    if (!_app) return;
    if (visible) _app.ticker.start();
    else         _app.ticker.stop();
  }, [visible]);

  // Mount: create app once, or reattach canvas on return visit
  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    if (!_app) {
      // First-ever mount — create Application with real DOM dimensions
      const w = mountEl.clientWidth  || 390;
      const h = mountEl.clientHeight || 500;
      initObtainedApp(w, h);
      mountEl.appendChild(_canvas!);
      if (!visible) _app!.ticker.stop();
    } else {
      // Reattach existing canvas (created by prewarm or previous mount)
      mountEl.appendChild(_canvas!);
      _scroll.y = 0; _scroll.vel = 0;
      if (_grid) _grid.y = 0;
      if (visible) _app.ticker.start();
      else         _app.ticker.stop();
    }

    // ResizeObserver: always observe the current mountEl
    _ro?.disconnect();
    _ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 10 && height > 10) {
        _app?.renderer.resize(width, height);
        if (_app) _app.stage.hitArea = _app.screen;
      }
    });
    _ro.observe(mountEl);

    return () => {
      // Unmount: detach canvas — do NOT destroy the Application
      _ro?.disconnect();
      _ro = null;
      _canvas?.parentElement?.removeChild(_canvas);
      _app?.ticker.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cards rebuild — skipped if hero data hasn't actually changed
  useEffect(() => {
    const app  = _app;
    const grid = _grid;
    if (!app || !grid) return;

    const key = heroes.map(h => `${h.heroId}:${h.stars}:${h.level}`).join('|');
    if (key === _heroesKey && grid.children.length > 0) return;
    _heroesKey = key;

    let cancelled = false;

    for (const card of _cards) {
      grid.removeChild(card.root);
      card.root.destroy({ children: true, texture: false });
    }
    _cards = [];

    if (heroes.length === 0) {
      _scroll.max = 0; _scroll.y = 0;
      return () => { cancelled = true; };
    }

    const appW  = app.screen.width;
    const cardW = Math.floor((appW - H_PAD * 2 - GAP * (COLS - 1)) / COLS);
    const cardH = Math.round(cardW * (400 / 250));
    const { sweep: sweepTex, holo: holoTex } = getSharedTextures(cardW, cardH);

    const newCards: CardNode[] = [];
    heroes.forEach((hero, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const cfg = HERO_RARITIES.find(r => r.id === hero.rarity) ?? HERO_RARITIES[4];
      const bg  = getBgTexture(cfg, cardW, cardH);
      const card = createCard(
        hero, cfg, cardW, cardH, bg, sweepTex, holoTex,
        () => _clickCb?.(hero.heroId), idx,
      );
      card.root.x = H_PAD + col * (cardW + GAP) + cardW / 2;
      card.root.y = V_PAD + row * (cardH + GAP) + cardH / 2;
      grid.addChild(card.root);
      newCards.push(card);
    });
    _cards = newCards;

    document.fonts.ready.then(() => {
      if (cancelled) return;
      const queue = [...newCards];
      const processNext = () => {
        if (cancelled || queue.length === 0) return;
        for (let i = 0; i < 2 && queue.length > 0; i++) {
          const card = queue.shift()!;
          const ov   = createOverlayCanvas(card.data, card.cfg, cardW, cardH);
          card.ovSpr.texture = Texture.from(ov);
          card.ovSpr.width   = cardW;
          card.ovSpr.height  = cardH;
        }
        if (queue.length > 0) requestAnimationFrame(processNext);
      };
      requestAnimationFrame(processNext);
    });

    const rows   = Math.ceil(heroes.length / COLS);
    const totalH = V_PAD + rows * (cardH + GAP) + V_PAD;
    _scroll.max = Math.max(0, totalH - app.screen.height);
    _scroll.y   = Math.min(_scroll.y, _scroll.max);

    return () => { cancelled = true; };
  }, [heroes]);

  return (
    <div
      ref={mountRef}
      style={{
        position:    'absolute',
        top:         '20.5%',
        bottom:      '9%',
        left:        0,
        right:       0,
        zIndex:      10,
        display:     visible ? 'block' : 'none',
        overflow:    'hidden',
        touchAction: 'none',
      }}
    />
  );
}