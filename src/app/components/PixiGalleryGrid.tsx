/**
 * PixiGalleryGrid — WebGL gallery card grid (ALL heroes, owned + locked).
 *
 * Unlocked cards : 1:1 recreation of HeroCard SVG (bg + illustration + overlay).
 * Locked cards   : 1:1 recreation of LockedHeroCard SVG (single baked canvas).
 *
 * DRAW-CALL BUDGET:
 *   Unlocked: bgSprite + ilSprite + ovSprite + sweep + holo = 5
 *   Locked  : bgSprite + ovSprite + sweep + holo            = 4
 *
 * PERF: zero live GPU filters, staggered overlay creation (2/frame),
 *       shared bg textures per rarity, shared sweep+holo, momentum scroll.
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

// ─── Public data shape ────────────────────────────────────────────────────────
export interface GalleryHeroData {
  heroId:    string;
  name:      string;
  rarity:    string;
  heroType:  string;
  level:     number;
  stars:     number;
  illustUrl: string;   // '' when locked
  isLocked:  boolean;
}

interface Props {
  heroes:      GalleryHeroData[];
  visible:     boolean;
  onCardClick: (heroId: string) => void;
}

type RCfg = typeof HERO_RARITIES[number];

// ─── Layout ───────────────────────────────────────────────────────────────────
const GALLERY_COLS = 5;
const H_PAD        = 10;
const V_PAD        = 10;
const GAP          = 8;

// ─── Locked fill colours (darker variants — matches LockedHeroCard.tsx) ───────
const LOCKED_FILLS: Record<string, string> = {
  mythic:    '#6B0000',
  legendary: '#7C3200',
  epic:      '#2D0552',
  rare:      '#0D2340',
  common:    '#0A2E18',
};

// ─── Module-level GPU texture caches (gallery-specific, no conflict with obtained) ──
const _gIllTex: Map<string, Texture> = new Map();
const _gBgTex:  Map<string, Texture> = new Map(); // unlocked bg per rarity+size
const _gLkBgTex: Map<string, Texture> = new Map(); // locked bg per rarity+size

let _gSweepTex: Texture | null = null;
let _gHoloTex:  Texture | null = null;
let _gShTexW = 0;

// ─── Persistent Application state (survives HeroPage unmount/remount) ─────────
// Same pattern as PixiObtainedGrid: canvas detaches/reattaches, never destroyed.
let _gApp:       Application       | null = null;
let _gCanvas:    HTMLCanvasElement | null = null;
let _gGrid:      Container         | null = null;
let _gNodes:     GCardNode[]             = [];
let _gScroll                             = { y: 0, vel: 0, max: 0 };
let _gHeroesKey: string                  = '';
let _gClickCb:   ((id: string) => void)  | null = null;
let _gRo:        ResizeObserver    | null = null;

// ─── Canvas 2D helpers ────────────────────────────────────────────────────────
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);          ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

function star5(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number) {
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

function fillTextLS(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ls: number) {
  const chars = [...text];
  if (!chars.length) return;
  let totalW = chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + ls * (chars.length - 1);
  let cx = x - totalW / 2;
  for (const ch of chars) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ls; }
}

// ─── Unlocked BG (shared per rarity) ─────────────────────────────────────────
function getUnlockedBg(cfg: RCfg, cardW: number, cardH: number): Texture {
  const key = `ul-${cfg.id}-${cardW}`;
  if (_gBgTex.has(key)) return _gBgTex.get(key)!;
  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s = cardW / 250;
  rrect(ctx, 0, 0, cardW, cardH, 12 * s);
  ctx.fillStyle = cfg.border; ctx.fill();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s);
  ctx.fillStyle = cfg.fill;   ctx.fill();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2*s; ctx.stroke();
  const tex = Texture.from(cv);
  _gBgTex.set(key, tex);
  return tex;
}

// ─── Locked BG (shared per rarity) ───────────────────────────────────────────
function getLockedBg(cfg: RCfg, cardW: number, cardH: number): Texture {
  const key = `lk-${cfg.id}-${cardW}`;
  if (_gLkBgTex.has(key)) return _gLkBgTex.get(key)!;
  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s = cardW / 250;
  const lkFill = LOCKED_FILLS[cfg.id] ?? '#0D2340';
  // Outer border
  rrect(ctx, 0, 0, cardW, cardH, 12*s);
  ctx.fillStyle = cfg.border; ctx.fill();
  // Inner locked fill
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s);
  ctx.fillStyle = lkFill; ctx.fill();
  // Dark overlay
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  const tex = Texture.from(cv);
  _gLkBgTex.set(key, tex);
  return tex;
}

// ─── Unlocked overlay (same as PixiObtainedGrid) ─────────────────────────────
function createUnlockedOverlay(data: GalleryHeroData, cfg: RCfg, cardW: number, cardH: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s = cardW / 250;

  ctx.save();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s);
  ctx.clip();

  // Bottom fade
  const bot = ctx.createLinearGradient(0, 280*s, 0, 357*s);
  bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = bot; ctx.fillRect(3*s, 280*s, 244*s, 77*s);

  // Bar fade
  const bar = ctx.createLinearGradient(3*s, 0, (3+185)*s, 0);
  bar.addColorStop(0, 'rgba(0,0,0,0.55)'); bar.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bar; ctx.fillRect(3*s, 291*s, 185*s, 25*s);

  // Hero type
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,1)'; ctx.shadowOffsetY = s; ctx.shadowBlur = 4*s;
  ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(13*s)}px 'Playfair Display',serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(data.heroType, 11*s, 304*s);
  ctx.restore();

  // Stars
  {
    const RS_R=14, RS_r=5.3, RS_CY=338, RS_X0=24, RS_STEP=32;
    const sc    = Math.max(1, Math.min(16, data.stars));
    const tier  = Math.min(3, Math.floor((sc-1)/5));
    const inT   = sc - tier*5;
    const slots = tier===3 ? 1 : 5;
    const FILL  = ['#FFD700','#FF3333','#D8D8D8','#FFD700'] as const;
    const STR   = ['#000','#000','#888','#000'] as const;
    for (let i=0; i<slots; i++) {
      const lit = i < inT;
      ctx.save();
      if (lit && tier===3) { ctx.shadowColor='#FFD700'; ctx.shadowBlur=6*s; }
      star5(ctx, (RS_X0+i*RS_STEP)*s, RS_CY*s, RS_R*s, RS_r*s);
      ctx.fillStyle = lit ? FILL[tier] : 'rgba(0,0,0,0.38)'; ctx.fill();
      ctx.strokeStyle = lit ? STR[tier] : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.2*s; ctx.lineJoin = 'round'; ctx.stroke();
      if (lit && tier===3) { ctx.shadowBlur=12*s; ctx.shadowColor='rgba(255,80,255,0.7)'; ctx.stroke(); }
      ctx.restore();
    }
  }

  // Rarity badge
  {
    const bsx = (cfg.text==='SS' ? 210 : 218)*s, bsy = 321*s, d=28*s, c=5*s;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bsx, bsy-d);
    ctx.quadraticCurveTo(bsx+c, bsy-c, bsx+d, bsy);
    ctx.quadraticCurveTo(bsx+c, bsy+c, bsx,   bsy+d);
    ctx.quadraticCurveTo(bsx-c, bsy+c, bsx-d, bsy);
    ctx.quadraticCurveTo(bsx-c, bsy-c, bsx,   bsy-d);
    ctx.closePath(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fill();
    const tg = ctx.createLinearGradient(bsx, bsy-30*s, bsx, bsy+30*s);
    tg.addColorStop(0, cfg.shine); tg.addColorStop(0.48, cfg.shine); tg.addColorStop(1, cfg.fill);
    ctx.font=`bold ${Math.round(52*s)}px 'Playfair Display',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='#000'; ctx.lineWidth=1.5*s; ctx.strokeText(cfg.text, bsx, bsy);
    ctx.fillStyle=tg; ctx.fillText(cfg.text, bsx, bsy);
    ctx.restore();
  }

  // Bottom bar + zigzag + name
  ctx.fillStyle='#000'; ctx.fillRect(3*s, 357*s, 244*s, 40*s);
  {
    const pts=[3,367,15,387,27,367,39,387,51,367,63,387,75,367,87,387,99,367,111,387,123,367,
               135,387,147,367,159,387,171,367,183,387,195,367,207,387,219,367,231,387,243,367];
    ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0]*s, pts[1]*s);
    for (let i=2; i<pts.length; i+=2) ctx.lineTo(pts[i]*s, pts[i+1]*s);
    ctx.strokeStyle='rgba(100,60,10,0.35)'; ctx.lineWidth=1.5*s;
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); ctx.restore();
  }
  {
    ctx.save();
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const maxW=230*s;
    let ns=Math.round(18*s);
    ctx.font=`700 ${ns}px 'Playfair Display',serif`;
    while (ctx.measureText(data.name).width>maxW && ns>Math.round(9*s)) {
      ns=Math.max(1, ns-Math.max(1, Math.round(s*0.8)));
      ctx.font=`700 ${ns}px 'Playfair Display',serif`;
    }
    const ls=Math.round(3*s);
    if ('letterSpacing' in ctx) { (ctx as any).letterSpacing=`${ls}px`; ctx.fillText(data.name, 125*s, 378*s); (ctx as any).letterSpacing='0px'; }
    else fillTextLS(ctx, data.name, 125*s, 378*s, ls);
    ctx.restore();
  }

  // Level badge
  {
    const S=66, lvX=(3+S*0.28)*s, lvY=(3+S*0.28)*s;
    const lfs=data.level>=100?11:data.level>=10?14:18, lsw=data.level>=100?3:data.level>=10?3.5:4;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(3*s,3*s); ctx.lineTo((3+S)*s,3*s); ctx.lineTo(3*s,(3+S)*s); ctx.closePath();
    ctx.fillStyle='rgba(0,0,0,0.78)'; ctx.fill(); ctx.clip();
    ctx.translate(lvX,lvY); ctx.rotate(-45*Math.PI/180);
    ctx.font=`700 ${Math.round(lfs*s)}px 'Playfair Display',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='#000'; ctx.lineWidth=lsw*s; ctx.strokeText(`Lv. ${data.level}`,0,0);
    ctx.fillStyle='#fff'; ctx.fillText(`Lv. ${data.level}`,0,0);
    ctx.restore();
  }

  ctx.restore(); // end clip

  // Outer shine
  ctx.save(); ctx.globalAlpha=0.4;
  rrect(ctx, 1*s, 1*s, 248*s, 398*s, 11*s);
  ctx.strokeStyle=cfg.shine; ctx.lineWidth=s; ctx.stroke();
  ctx.restore();

  return cv;
}

// ─── Locked overlay canvas ────────────────────────────────────────────────────
// Replicates LockedHeroCard.tsx SVG: grid pattern, lock icon, "?", dimmed text.
function createLockedOverlay(data: GalleryHeroData, cfg: RCfg, cardW: number, cardH: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s = cardW / 250;

  ctx.save();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s);
  ctx.clip();

  // ── Grid / lattice (opacity 0.07, shine coloured) ────────────────────────
  ctx.save(); ctx.globalAlpha = 0.07; ctx.strokeStyle = cfg.shine; ctx.lineWidth = 0.8*s;
  for (let i=0; i<14; i++) { const x=(3+i*18)*s; ctx.beginPath(); ctx.moveTo(x,3*s); ctx.lineTo(x,357*s); ctx.stroke(); }
  for (let i=0; i<20; i++) { const y=(3+i*18)*s; ctx.beginPath(); ctx.moveTo(3*s,y); ctx.lineTo(247*s,y); ctx.stroke(); }
  ctx.restore();

  // ── Radial glow ellipse (cx=125,cy=145,rx=80,ry=100, shine, opacity 0.06) ─
  ctx.save(); ctx.globalAlpha=0.06;
  ctx.beginPath(); ctx.ellipse(125*s, 145*s, 80*s, 100*s, 0, 0, 2*Math.PI);
  ctx.fillStyle=cfg.shine; ctx.fill(); ctx.restore();

  // ── Lock icon (centred at cx=125,cy=160, size=70) ─────────────────────────
  {
    const cx=125*s, cy=160*s, size=70*s;
    const bw=size*0.55, bh=size*0.45;
    const bx=cx-bw/2, by=cy-size*0.05;
    const rw=size*0.75, rh=size*0.52;
    const rx=cx-rw/2, ry=cy+size*0.04;
    const sr=bw/2;
    const sc2=size/70; // normalised for stroke widths

    // Shackle (open arc at top)
    ctx.save(); ctx.globalAlpha=0.75;
    ctx.beginPath();
    ctx.moveTo(bx, by+bh*0.5);
    ctx.lineTo(bx, by+sr);
    ctx.arc(bx+sr, by+sr, sr, Math.PI, 0, true); // anticlockwise → top arch
    ctx.lineTo(bx+bw, by+bh*0.5);
    ctx.strokeStyle=cfg.shine; ctx.lineWidth=8*sc2; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.stroke(); ctx.restore();

    // Body rect
    ctx.save(); ctx.globalAlpha=0.18;
    rrect(ctx, rx, ry, rw, rh, 6*sc2);
    ctx.fillStyle=cfg.shine; ctx.fill(); ctx.restore();
    ctx.save(); ctx.globalAlpha=0.7;
    rrect(ctx, rx, ry, rw, rh, 6*sc2);
    ctx.strokeStyle=cfg.shine; ctx.lineWidth=3*sc2; ctx.stroke(); ctx.restore();

    // Keyhole circle
    ctx.save(); ctx.globalAlpha=0.65;
    ctx.beginPath(); ctx.arc(cx, ry+rh*0.42, size*0.085, 0, 2*Math.PI);
    ctx.fillStyle=cfg.shine; ctx.fill(); ctx.restore();

    // Keyhole slot
    ctx.save(); ctx.globalAlpha=0.65;
    rrect(ctx, cx-size*0.04, ry+rh*0.46, size*0.08, rh*0.33, 2*sc2);
    ctx.fillStyle=cfg.shine; ctx.fill(); ctx.restore();
  }

  // ── "?" text (below lock, dim) ────────────────────────────────────────────
  ctx.save(); ctx.globalAlpha=0.22;
  ctx.font=`900 ${Math.round(38*s)}px 'Playfair Display',serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=cfg.shine; ctx.fillText('?', 125*s, 254*s);
  ctx.restore();

  // ── Bottom fade ────────────────────────────────────────────────────────────
  const bot=ctx.createLinearGradient(0,280*s,0,357*s);
  bot.addColorStop(0,'rgba(0,0,0,0)'); bot.addColorStop(1,'rgba(0,0,0,1)');
  ctx.fillStyle=bot; ctx.fillRect(3*s,280*s,244*s,77*s);

  // ── Hero type (dimmed, opacity 0.45) ──────────────────────────────────────
  ctx.save(); ctx.globalAlpha=0.45;
  ctx.fillStyle='#fff'; ctx.font=`700 ${Math.round(13*s)}px 'Playfair Display',serif`;
  ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillText(data.heroType, 11*s, 304*s);
  ctx.restore();

  // ── Stars (dim gold, opacity 0.35) ────────────────────────────────────────
  {
    const RS_R=14, RS_r=5.3, RS_CY=338, RS_X0=24, RS_STEP=32;
    const slots = Math.max(1, Math.min(5, data.stars));
    for (let i=0; i<slots; i++) {
      ctx.save(); ctx.globalAlpha=0.35;
      star5(ctx, (RS_X0+i*RS_STEP)*s, RS_CY*s, RS_R*s, RS_r*s);
      ctx.fillStyle='rgba(255,215,0,1)'; ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1.2*s; ctx.lineJoin='round'; ctx.stroke();
      ctx.restore();
    }
  }

  // ── Rarity badge (opacity 0.55) ────────────────────────────────────────────
  {
    const bsx=(cfg.text==='SS'?210:218)*s, bsy=321*s, d=28*s, c=5*s;
    ctx.save(); ctx.globalAlpha=0.55;
    ctx.beginPath();
    ctx.moveTo(bsx,bsy-d); ctx.quadraticCurveTo(bsx+c,bsy-c,bsx+d,bsy);
    ctx.quadraticCurveTo(bsx+c,bsy+c,bsx,bsy+d); ctx.quadraticCurveTo(bsx-c,bsy+c,bsx-d,bsy);
    ctx.quadraticCurveTo(bsx-c,bsy-c,bsx,bsy-d); ctx.closePath();
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fill();
    const tg=ctx.createLinearGradient(bsx,bsy-30*s,bsx,bsy+30*s);
    tg.addColorStop(0,cfg.shine); tg.addColorStop(0.48,cfg.shine); tg.addColorStop(1,cfg.fill);
    ctx.font=`bold ${Math.round(52*s)}px 'Playfair Display',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='#000'; ctx.lineWidth=1.5*s; ctx.strokeText(cfg.text,bsx,bsy);
    ctx.fillStyle=tg; ctx.fillText(cfg.text,bsx,bsy);
    ctx.restore();
  }

  // ── Name bar (darker semi-transparent, not solid black) ────────────────────
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(3*s, 357*s, 244*s, 40*s);

  // Zigzag (reduced opacity)
  {
    const pts=[3,367,15,387,27,367,39,387,51,367,63,387,75,367,87,387,99,367,111,387,123,367,
               135,387,147,367,159,387,171,367,183,387,195,367,207,387,219,367,231,387,243,367];
    ctx.save(); ctx.globalAlpha=0.25;
    ctx.beginPath(); ctx.moveTo(pts[0]*s, pts[1]*s);
    for (let i=2; i<pts.length; i+=2) ctx.lineTo(pts[i]*s, pts[i+1]*s);
    ctx.strokeStyle='rgba(100,60,10,1)'; ctx.lineWidth=1.5*s;
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); ctx.restore();
  }

  // Name (dimmed, opacity 0.5)
  {
    ctx.save(); ctx.globalAlpha=0.5;
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const maxW=230*s;
    let ns=Math.round(18*s);
    ctx.font=`700 ${ns}px 'Playfair Display',serif`;
    while (ctx.measureText(data.name).width>maxW && ns>Math.round(9*s)) {
      ns=Math.max(1, ns-Math.max(1, Math.round(s*0.8)));
      ctx.font=`700 ${ns}px 'Playfair Display',serif`;
    }
    const ls=Math.round(3*s);
    if ('letterSpacing' in ctx) { (ctx as any).letterSpacing=`${ls}px`; ctx.fillText(data.name,125*s,378*s); (ctx as any).letterSpacing='0px'; }
    else fillTextLS(ctx, data.name, 125*s, 378*s, ls);
    ctx.restore();
  }

  ctx.restore(); // end clip

  // Outer shine (dim, 0.2)
  ctx.save(); ctx.globalAlpha=0.2;
  rrect(ctx, 1*s, 1*s, 248*s, 398*s, 11*s);
  ctx.strokeStyle=cfg.shine; ctx.lineWidth=s; ctx.stroke();
  ctx.restore();

  return cv;
}

// ─── Shared sweep + holo textures (gallery-specific sizes) ───────────────────
function getSharedTextures(cardW: number, cardH: number): { sweep: Texture; holo: Texture } {
  if (_gSweepTex && _gHoloTex && _gShTexW === cardW) return { sweep: _gSweepTex, holo: _gHoloTex };
  const s = cardW / 250;

  const scv = document.createElement('canvas');
  scv.width  = Math.round(cardW * 0.52); scv.height = Math.round(cardH * 2.2);
  const sc   = scv.getContext('2d')!;
  const sg   = sc.createLinearGradient(0, 0, scv.width, 0);
  sg.addColorStop(0,    'rgba(255,255,255,0)');
  sg.addColorStop(0.30, 'rgba(255,255,255,0.28)');
  sg.addColorStop(0.50, 'rgba(255,255,255,0.36)');
  sg.addColorStop(0.70, 'rgba(255,255,255,0.28)');
  sg.addColorStop(1,    'rgba(255,255,255,0)');
  sc.fillStyle=sg; sc.fillRect(0,0,scv.width,scv.height);
  _gSweepTex = Texture.from(scv);

  const hcv = document.createElement('canvas');
  hcv.width=cardW; hcv.height=cardH;
  const hc  = hcv.getContext('2d')!;
  rrect(hc, 3*s, 3*s, 244*s, 354*s, 10*s); hc.clip();
  const hg = hc.createLinearGradient(3*s, 3*s, cardW-3*s, 357*s);
  hg.addColorStop(0,    'rgba(255,220,240,1)');
  hg.addColorStop(0.25, 'rgba(220,235,255,1)');
  hg.addColorStop(0.50, 'rgba(215,255,235,1)');
  hg.addColorStop(0.75, 'rgba(245,220,255,1)');
  hg.addColorStop(1,    'rgba(255,248,215,1)');
  hc.fillStyle=hg; hc.fillRect(0,0,cardW,cardH);
  _gHoloTex = Texture.from(hcv);

  _gShTexW = cardW;
  return { sweep: _gSweepTex, holo: _gHoloTex };
}

// ─── Illustration loader (gallery-scoped cache) ───────────────────────────────
async function loadGalleryIllust(url: string): Promise<Texture | null> {
  if (!url) return null;
  const key = `gill:${url}`;
  if (_gIllTex.has(key)) return _gIllTex.get(key)!;
  const cached = chromaDataUrlCache.get(url);
  if (cached) {
    const img = new Image();
    img.src = cached;
    if (!img.complete) await new Promise<void>(r => { img.onload=()=>r(); img.onerror=()=>r(); });
    const tex = Texture.from(img);
    _gIllTex.set(key, tex);
    return tex;
  }
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => { img.onload=()=>res(); img.onerror=rej; img.src=url; });
    const off=document.createElement('canvas');
    off.width=img.naturalWidth; off.height=img.naturalHeight;
    const octx=off.getContext('2d',{willReadFrequently:true})!;
    octx.drawImage(img,0,0);
    const id=octx.getImageData(0,0,off.width,off.height);
    applyChromaKey(id.data);
    octx.putImageData(id,0,0);
    keepChromaUrl(url, off.toDataURL('image/png'));
    const tex=Texture.from(off);
    _gIllTex.set(key, tex);
    return tex;
  } catch { return null; }
}

// ─── Card node ────────────────────────────────────────────────────────────────
interface GCardNode {
  root:   Container;
  ovSpr:  Sprite;
  data:   GalleryHeroData;
  cfg:    RCfg;
  update: (t: number, dt: number) => void;
}

function createGalleryCard(
  data:     GalleryHeroData,
  cfg:      RCfg,
  cardW:    number,
  cardH:    number,
  bgTex:    Texture,
  sweepTex: Texture,
  holoTex:  Texture,
  onClick:  () => void,
  idx:      number,
): GCardNode {
  const s     = cardW / 250;
  const phase = idx * 0.618;

  const root = new Container();
  root.eventMode='static'; root.cursor='pointer';
  root.pivot.set(cardW/2, cardH/2);

  // BG
  const bgSpr=new Sprite(bgTex); bgSpr.width=cardW; bgSpr.height=cardH;
  root.addChild(bgSpr);

  // Illustration container (unlocked only)
  let ilSpr:  Sprite | null = null;
  let ilBaseY = 0;

  if (!data.isLocked) {
    const ilMask=new Graphics();
    ilMask.beginFill(0xFFFFFF,1);
    ilMask.drawRoundedRect(3*s,3*s,244*s,394*s,10*s);
    ilMask.endFill();
    const ilCon=new Container(); ilCon.mask=ilMask;
    root.addChild(ilMask); root.addChild(ilCon);

    loadGalleryIllust(data.illustUrl).then(tex => {
      if (!tex || tex===Texture.EMPTY) return;
      const dX=3*s, dY=3*s, dW=244*s, dH=394*s;
      const sf=Math.max(dW/tex.width, dH/tex.height);
      ilSpr=new Sprite(tex);
      ilSpr.width=tex.width*sf; ilSpr.height=tex.height*sf;
      ilSpr.x=dX+(dW-ilSpr.width)/2;
      ilSpr.y=dY+(dH-ilSpr.height);
      ilBaseY=ilSpr.y;
      ilCon.addChild(ilSpr);
    });
  }

  // Overlay (deferred)
  const ovSpr=new Sprite(Texture.EMPTY); ovSpr.width=cardW; ovSpr.height=cardH;
  root.addChild(ovSpr);

  // Effects container clipped to outer card
  const fxMask=new Graphics();
  fxMask.beginFill(0xFFFFFF,1);
  fxMask.drawRoundedRect(0,0,cardW,cardH,12*s); fxMask.endFill();
  const fxCon=new Container(); fxCon.mask=fxMask;
  root.addChild(fxMask); root.addChild(fxCon);

  const sweep=new Sprite(sweepTex);
  sweep.y=-cardH*0.60; sweep.height=cardH*2.20;
  sweep.blendMode=BLEND_MODES.ADD; sweep.x=-(sweep.width+5);
  fxCon.addChild(sweep);

  const holo=new Sprite(holoTex);
  holo.width=cardW; holo.height=cardH;
  holo.blendMode=BLEND_MODES.NORMAL; holo.alpha=0.07;
  fxCon.addChild(holo);

  let tapPulse=0;
  root.on('pointertap', onClick);
  root.on('pointerdown', ()=>{ tapPulse=1; });

  const FLOAT_P=3.7, SWEEP_P=4.8, HOLO_P=8.0;
  const update=(totalTime: number, dt: number)=>{
    const t=totalTime+phase;
    if (ilSpr) {
      const fe=0.5*(1-Math.cos(((t%FLOAT_P)/FLOAT_P)*2*Math.PI));
      ilSpr.y=ilBaseY-fe*10*s;
    }
    const sf=(t%SWEEP_P)/SWEEP_P;
    if (sf<0.38) {
      const sm=(p=>(p*p*(3-2*p)))(sf/0.38);
      sweep.x=-(sweep.width*1.2)+sm*(cardW+sweep.width*2.5);
    } else { sweep.x=cardW+5; }
    holo.alpha=0.05+0.045*(1-Math.cos(((t%HOLO_P)/HOLO_P)*2*Math.PI));
    if (tapPulse>0) { tapPulse=Math.max(0,tapPulse-dt*5); root.scale.set(1-tapPulse*0.035); }
    else if (root.scale.x!==1) root.scale.set(1);
  };

  return { root, ovSpr, data, cfg, update };
}

// ─── React component ──────────────────────────────────────────────────────────
// ── One-time Application bootstrap ────────────────────────────────────────────
function initGalleryApp(mountEl: HTMLElement) {
  const w = mountEl.clientWidth  || 390;
  const h = mountEl.clientHeight || 500;

  const app = new Application({
    width: w, height: h,
    backgroundAlpha: 0, antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  const canvas = app.view as HTMLCanvasElement;
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none;';
  mountEl.appendChild(canvas);

  app.stage.eventMode = 'static';
  app.stage.hitArea   = app.screen;

  const grid = new Container();
  app.stage.addChild(grid);

  const sc = _gScroll;
  const onWheel=(e:WheelEvent)=>{ e.preventDefault(); sc.vel=0; sc.y=Math.max(0,Math.min(sc.max,sc.y+e.deltaY*0.7)); };
  let tY=0,tT=0,tVel=0;
  const onTS=(e:TouchEvent)=>{ tY=e.touches[0].clientY; tT=performance.now(); tVel=sc.vel=0; };
  const onTM=(e:TouchEvent)=>{ e.preventDefault(); const ny=e.touches[0].clientY,nt=performance.now(),dy=tY-ny,dt=Math.max(1,nt-tT); tVel=(dy/dt)*16; tY=ny;tT=nt; sc.y=Math.max(0,Math.min(sc.max,sc.y+dy)); };
  const onTE=()=>{ sc.vel=tVel; };
  canvas.addEventListener('wheel',      onWheel, { passive: false });
  canvas.addEventListener('touchstart', onTS,    { passive: true  });
  canvas.addEventListener('touchmove',  onTM,    { passive: false });
  canvas.addEventListener('touchend',   onTE,    { passive: true  });

  let totalTime = 0;
  app.ticker.add((delta: number) => {
    const dt = delta / 60; totalTime += dt;
    if (Math.abs(sc.vel) > 0.1) {
      sc.y = Math.max(0, Math.min(sc.max, sc.y + sc.vel));
      sc.vel *= 0.92;
      if (Math.abs(sc.vel) < 0.1) sc.vel = 0;
    }
    grid.y = -Math.round(sc.y);
    for (const c of _gNodes) c.update(totalTime, dt);
  });

  _gApp    = app;
  _gCanvas = canvas;
  _gGrid   = grid;
}

export function PixiGalleryGrid({ heroes, visible, onCardClick }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Keep module-level callback current
  useEffect(() => {
    _gClickCb = onCardClick;
    return () => { if (_gClickCb === onCardClick) _gClickCb = null; };
  }, [onCardClick]);

  // Visibility: start/stop ticker
  useEffect(() => {
    if (!_gApp) return;
    if (visible) _gApp.ticker.start();
    else         _gApp.ticker.stop();
  }, [visible]);

  // Mount: create or reattach
  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    if (!_gApp) {
      initGalleryApp(mountEl);
      if (!visible) _gApp!.ticker.stop();
    } else {
      mountEl.appendChild(_gCanvas!);
      _gScroll.y = 0; _gScroll.vel = 0;
      if (_gGrid) _gGrid.y = 0;
      if (visible) _gApp.ticker.start();
      else         _gApp.ticker.stop();
    }

    _gRo?.disconnect();
    _gRo = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 10 && height > 10) {
        _gApp?.renderer.resize(width, height);
        if (_gApp) _gApp.stage.hitArea = _gApp.screen;
      }
    });
    _gRo.observe(mountEl);

    return () => {
      _gRo?.disconnect(); _gRo = null;
      _gCanvas?.parentElement?.removeChild(_gCanvas);
      _gApp?.ticker.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cards rebuild — skip when hero data unchanged
  useEffect(() => {
    const app  = _gApp;
    const grid = _gGrid;
    if (!app || !grid) return;

    const key = heroes.map(h => `${h.heroId}:${h.stars}:${h.level}:${h.isLocked?1:0}`).join('|');
    if (key === _gHeroesKey && grid.children.length > 0) return;
    _gHeroesKey = key;

    let cancelled = false;

    for (const c of _gNodes) { grid.removeChild(c.root); c.root.destroy({ children: true, texture: false }); }
    _gNodes = [];

    if (!heroes.length) { _gScroll.max = 0; _gScroll.y = 0; return () => { cancelled = true; }; }

    const appW  = app.screen.width;
    const cardW = Math.floor((appW - H_PAD * 2 - GAP * (GALLERY_COLS - 1)) / GALLERY_COLS);
    const cardH = Math.round(cardW * (400 / 250));
    const { sweep: sweepTex, holo: holoTex } = getSharedTextures(cardW, cardH);

    const newCards: GCardNode[] = [];
    heroes.forEach((hero, idx) => {
      const col = idx % GALLERY_COLS, row = Math.floor(idx / GALLERY_COLS);
      const cfg  = HERO_RARITIES.find(r => r.id === hero.rarity) ?? HERO_RARITIES[4];
      const bgTex = hero.isLocked ? getLockedBg(cfg, cardW, cardH) : getUnlockedBg(cfg, cardW, cardH);
      const card  = createGalleryCard(
        hero, cfg, cardW, cardH, bgTex, sweepTex, holoTex,
        () => _gClickCb?.(hero.heroId), idx,
      );
      card.root.x = H_PAD + col * (cardW + GAP) + cardW / 2;
      card.root.y = V_PAD + row * (cardH + GAP) + cardH / 2;
      grid.addChild(card.root);
      newCards.push(card);
    });
    _gNodes = newCards;

    document.fonts.ready.then(() => {
      if (cancelled) return;
      const queue = [...newCards];
      const processNext = () => {
        if (cancelled || !queue.length) return;
        for (let i = 0; i < 2 && queue.length > 0; i++) {
          const card = queue.shift()!;
          const ov   = card.data.isLocked
            ? createLockedOverlay(card.data, card.cfg, cardW, cardH)
            : createUnlockedOverlay(card.data, card.cfg, cardW, cardH);
          card.ovSpr.texture = Texture.from(ov);
          card.ovSpr.width = cardW; card.ovSpr.height = cardH;
        }
        if (queue.length) requestAnimationFrame(processNext);
      };
      requestAnimationFrame(processNext);
    });

    const rows = Math.ceil(heroes.length / GALLERY_COLS);
    const totalH = V_PAD + rows * (cardH + GAP) + V_PAD;
    _gScroll.max = Math.max(0, totalH - app.screen.height);
    _gScroll.y   = Math.min(_gScroll.y, _gScroll.max);

    return () => { cancelled = true; };
  }, [heroes]);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute', top: '20.5%', bottom: '9%', left: 0, right: 0,
        zIndex: 10,
        display: visible ? 'block' : 'none',
        overflow: 'hidden', touchAction: 'none',
      }}
    />
  );
}