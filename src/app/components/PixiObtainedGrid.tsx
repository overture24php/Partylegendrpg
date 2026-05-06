/**
 * PixiObtainedGrid — WebGL-rendered hero card grid.
 *
 * Why PixiJS instead of DOM:
 * ─────────────────────────────────────────────────────────────────────────────
 * • ChromaKey filter runs on GPU (GLSL shader) → zero CPU pixel loop, images
 *   appear instantly regardless of card count.
 * • ONE Ticker loop drives ALL card animations simultaneously, vs N×rAF/CSS layers.
 * • Assets API caches textures as GPU-resident ImageBitmap; every redraw is a
 *   trivial drawImage call — no decode, no upload, no CSS compositor overhead.
 * • ParticleContainer handles 10 k+ particles at 60 fps; we use it for ambient
 *   glow dots on epic/legendary/mythic cards.
 * • Scroll momentum handled in JS, same frame as render → zero layout thrash.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef } from 'react';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  Assets,
  BLEND_MODES,
  TextStyle,
} from 'pixi.js';
import { ChromaKeyFilter } from '../pixi/ChromaKeyFilter';

// ─── Public data shape ────────────────────────────────────────────────────────
export interface HeroData {
  heroId:   string;
  name:     string;
  rarity:   string;   // 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  heroType: string;
  level:    number;
  stars:    number;   // absolute star count (1-16)
  illustUrl: string;  // raw Cloudinary URL — chroma key done in GLSL
}

interface Props {
  heroes:      HeroData[];
  visible:     boolean;
  onCardClick: (heroId: string) => void;
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const COLS   = 4;
const H_PAD  = 10;
const V_PAD  = 10;
const GAP    = 8;

// ─── Rarity palette ───────────────────────────────────────────────────────────
const RARITY_COL: Record<string, number> = {
  common:    0x8899BB,
  rare:      0x44AAFF,
  epic:      0xCC44FF,
  legendary: 0xFF9900,
  mythic:    0xFF2255,
};
const RARITY_BG: Record<string, number> = {
  common:    0x101820,
  rare:      0x08152A,
  epic:      0x110820,
  legendary: 0x1E0E00,
  mythic:    0x1E0010,
};
// Ambient particle counts per rarity tier
const RARITY_PARTS: Record<string, number> = {
  common: 0, rare: 0, epic: 4, legendary: 8, mythic: 14,
};

// ─── Module-level GPU texture cache ───────────────────────────────────────────
// Shared across component remounts — textures are GPU resident after first load.
const _texCache = new Map<string, Texture>();

async function getTex(url: string): Promise<Texture> {
  if (_texCache.has(url)) return _texCache.get(url)!;
  try {
    const t = await (Assets.load(url) as Promise<Texture>);
    _texCache.set(url, t);
    return t;
  } catch {
    return Texture.EMPTY;
  }
}

// ─── Canvas-based shared textures (created once per grid rebuild) ─────────────

function makeSweepTex(w: number, h: number): Texture {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * 0.55);
  cv.height = h;
  const cx = cv.getContext('2d')!;
  const g  = cx.createLinearGradient(0, 0, cv.width, 0);
  g.addColorStop(0,   'rgba(255,255,255,0)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  g.addColorStop(1,   'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, cv.width, cv.height);
  return Texture.from(cv);
}

function makeHoloTex(w: number, h: number): Texture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d')!;
  const g  = cx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0,    'rgba(255,0,102,1)');
  g.addColorStop(0.25, 'rgba(255,153,0,1)');
  g.addColorStop(0.5,  'rgba(0,255,136,1)');
  g.addColorStop(0.75, 'rgba(0,153,255,1)');
  g.addColorStop(1,    'rgba(204,0,255,1)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, w, h);
  return Texture.from(cv);
}

function makeParticleTex(color: number): Texture {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 8;
  const cx = cv.getContext('2d')!;
  const hex = '#' + color.toString(16).padStart(6, '0');
  const gr  = cx.createRadialGradient(4, 4, 0, 4, 4, 4);
  gr.addColorStop(0, hex);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = gr;
  cx.fillRect(0, 0, 8, 8);
  return Texture.from(cv);
}

// ─── Card node ────────────────────────────────────────────────────────────────
interface CardNode {
  root:       Container;
  update:     (totalTime: number, dt: number) => void;
  loadIllust: () => void;
}

function createCard(
  data:     HeroData,
  cardW:    number,
  cardH:    number,
  sweepTex: Texture,
  holoTex:  Texture,
  partTex:  Texture,
  onClick:  () => void,
  idx:      number,
): CardNode {
  const rCol  = RARITY_COL[data.rarity]  ?? 0x8899BB;
  const rBg   = RARITY_BG[data.rarity]   ?? 0x0D0820;
  const nPart = RARITY_PARTS[data.rarity] ?? 0;
  // Golden-ratio phase offset — staggers animations so cards don't pulse in sync
  const phase = idx * 0.618;

  const root = new Container();
  root.eventMode = 'static';
  root.cursor    = 'pointer';
  // Pivot at card center → scale/skew/tilt happen around the visual center
  root.pivot.set(cardW / 2, cardH / 2);

  // ── 1. Background ──────────────────────────────────────────────────────────
  const bg = new Graphics();
  bg.beginFill(rBg, 0.97);
  bg.drawRoundedRect(0, 0, cardW, cardH, 10);
  bg.endFill();
  root.addChild(bg);

  // ── 2. Rarity bottom glow (multi-layer simulated gradient) ────────────────
  for (let i = 0; i < 7; i++) {
    const g     = new Graphics();
    const yOff  = cardH * (0.35 + (0.65 / 7) * i);
    const alpha = 0.02 + (i / 7) * 0.09;
    g.beginFill(rCol, alpha);
    g.drawRoundedRect(0, yOff, cardW, cardH - yOff, 10);
    g.endFill();
    root.addChild(g);
  }

  // ── 3. Illustration container (clipped to card bounds) ────────────────────
  const clipMask  = new Graphics();
  clipMask.beginFill(0xFFFFFF, 1);
  clipMask.drawRoundedRect(0, 0, cardW, cardH, 10);
  clipMask.endFill();
  const illustCon = new Container();
  illustCon.mask  = clipMask;
  root.addChild(clipMask);
  root.addChild(illustCon);

  let ilSprite: Sprite | null = null;
  let ilBaseX = 0;
  let ilBaseY = 0;

  // ── 4. Top dark strip (star readability) ──────────────────────────────────
  const topG = new Graphics();
  topG.beginFill(0x000000, 0.48);
  topG.drawRoundedRect(0, 0, cardW, 27, 10);
  topG.endFill();
  root.addChild(topG);

  // ── 5. Stars (display up to 5, golden) ───────────────────────────────────
  const dispStars  = Math.min(Math.max(data.stars, 1), 5);
  const starR      = 3.0;
  const starGap    = 1.5;
  const totalStarW = dispStars * (starR * 2) + (dispStars - 1) * starGap;
  const starX0     = (cardW - totalStarW) / 2;

  for (let i = 0; i < dispStars; i++) {
    const sg  = new Graphics();
    const cx  = starX0 + i * (starR * 2 + starGap) + starR;
    const cy  = 11;
    // 5-point star polygon
    const pts: number[] = [];
    for (let j = 0; j < 10; j++) {
      const ang = (j * Math.PI) / 5 - Math.PI / 2;
      const r   = j % 2 === 0 ? starR : starR * 0.38;
      pts.push(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
    }
    sg.beginFill(0xFFD700, 1);
    sg.drawPolygon(pts);
    sg.endFill();
    sg.beginFill(0xFFEE44, 0.18); // soft glow halo
    sg.drawCircle(cx, cy, starR + 1.5);
    sg.endFill();
    root.addChild(sg);
  }

  // ── 6. Bottom strip ───────────────────────────────────────────────────────
  const BOT_H = 38;
  const botG  = new Graphics();
  botG.beginFill(0x000000, 0.68);
  botG.drawRoundedRect(0, cardH - BOT_H, cardW, BOT_H, 10);
  botG.endFill();
  root.addChild(botG);

  // ── 7. Hero name ────────────────────────────────────────────────���─────────
  const nameT = new Text(data.name, new TextStyle({
    fontSize:         10,
    fill:             '#FFFFFF',
    fontFamily:       'Roboto Condensed, sans-serif',
    fontWeight:       '700',
    letterSpacing:    0.4,
    dropShadow:       true,
    dropShadowDistance: 1,
    dropShadowAlpha:  0.9,
  }));
  nameT.anchor.set(0.5, 0);
  nameT.x = cardW / 2;
  nameT.y = cardH - BOT_H + 3;
  root.addChild(nameT);

  // ── 8. Level badge ────────────────────────────────────────────────────────
  const lvlBg = new Graphics();
  lvlBg.beginFill(rCol, 0.88);
  lvlBg.drawRoundedRect(0, 0, 30, 15, 4);
  lvlBg.endFill();
  lvlBg.x = 3;
  lvlBg.y = cardH - 19;
  root.addChild(lvlBg);

  const lvlT = new Text(`Lv${data.level}`, new TextStyle({
    fontSize:   8,
    fill:       '#000000',
    fontFamily: 'Roboto Condensed, sans-serif',
    fontWeight: '700',
  }));
  lvlT.anchor.set(0.5, 0.5);
  lvlT.x = 15;
  lvlT.y = 7.5;
  lvlBg.addChild(lvlT);

  // ── 9. Hero type label ────────────────────────────────────────────────────
  const typeT = new Text(data.heroType.slice(0, 8), new TextStyle({
    fontSize:   7,
    fill:       '#AACCFF',
    fontFamily: 'Roboto Condensed, sans-serif',
  }));
  typeT.anchor.set(1, 1);
  typeT.x = cardW - 3;
  typeT.y = cardH - 3;
  root.addChild(typeT);

  // ── 10. Rarity border ────────────────────────────────────────────────────
  const border = new Graphics();
  border.lineStyle(1.5, rCol, 0.65);
  border.drawRoundedRect(0, 0, cardW, cardH, 10);
  root.addChild(border);

  // ── 11. Diagonal sweep (ADD blend → glow light streak) ──────────────────
  const sweep      = new Sprite(sweepTex);
  sweep.height     = cardH;
  sweep.blendMode  = BLEND_MODES.ADD;
  sweep.x          = -(sweep.width + 10);
  sweep.y          = 0;
  root.addChild(sweep);

  // ── 12. Holographic foil (SCREEN blend → iridescent color shift) ─────────
  const holo      = new Sprite(holoTex);
  holo.width      = cardW;
  holo.height     = cardH;
  holo.blendMode  = BLEND_MODES.SCREEN;
  holo.alpha      = 0.05;
  root.addChild(holo);

  // ── 13. Ambient particles (epic / legendary / mythic only) ───────────────
  const parts: {
    s: Sprite; vx: number; vy: number; life: number; max: number;
  }[] = [];

  if (nPart > 0) {
    for (let i = 0; i < nPart; i++) {
      const ps     = new Sprite(partTex);
      ps.anchor.set(0.5);
      ps.scale.set(0.45 + Math.random() * 0.45);
      ps.x     = Math.random() * cardW;
      ps.y     = cardH * (0.3 + Math.random() * 0.7);
      ps.alpha = 0;
      root.addChild(ps);
      parts.push({
        s:    ps,
        vx:   (Math.random() - 0.5) * 0.22,
        vy:   -(Math.random() * 0.28 + 0.12),
        life: Math.random() * 3.5,
        max:  Math.random() * 1.8 + 1.5,
      });
    }
  }

  // ── Interaction state ─────────────────────────────────────────────────────
  let isHover    = false;
  let hNX        = 0;  // normalized hover x: -1 … +1
  let hNY        = 0;
  let scaleTarget = 1.0;
  let scaleCur    = 1.0;
  let tapPulse    = 0;

  root.on('pointerover',  ()  => { isHover = true;  scaleTarget = 1.05; });
  root.on('pointerout',   ()  => { isHover = false; scaleTarget = 1.0; hNX = 0; hNY = 0; });
  root.on('pointermove',  (e) => {
    const l = root.toLocal(e.global);
    hNX = (l.x - cardW / 2) / (cardW / 2);
    hNY = (l.y - cardH / 2) / (cardH / 2);
  });
  root.on('pointertap',   onClick);
  root.on('pointerdown',  () => { tapPulse = 1.0; });

  // ── Load illustration ─────────────────────────────────────────────────────
  const loadIllust = () => {
    if (!data.illustUrl) return;
    getTex(data.illustUrl).then(tex => {
      if (!tex || tex === Texture.EMPTY) return;

      if (ilSprite) {
        illustCon.removeChild(ilSprite);
        ilSprite.destroy({ texture: false }); // keep GPU texture in cache
      }

      ilSprite = new Sprite(tex);
      // GPU chroma key — runs in shader, instant, no CPU involvement
      ilSprite.filters = [new ChromaKeyFilter()];

      // Scale illustration to fill ~92% of card height
      const scale = (cardH * 0.92) / tex.height;
      ilSprite.scale.set(scale);
      ilSprite.anchor.set(0.5, 0);
      ilSprite.x = cardW / 2;
      ilSprite.y = cardH * 0.03;
      ilBaseX    = ilSprite.x;
      ilBaseY    = ilSprite.y;

      illustCon.addChild(ilSprite);
    });
  };

  // ── Per-frame update (called by shared Ticker) ────────────────────────────
  const SWEEP_PERIOD = 5.2;   // seconds per sweep cycle
  const FLOAT_AMP    = 3.2;   // px of vertical float
  const FLOAT_SPD    = 0.62;  // rad/s

  const update = (totalTime: number, dt: number) => {
    const t  = totalTime + phase;

    // ── Sweep: moves across card once per SWEEP_PERIOD, then hides ──────────
    const sf = (t % SWEEP_PERIOD) / SWEEP_PERIOD;
    sweep.x  = sf < 0.38
      ? -(sweep.width) + (sf / 0.38) * (cardW + sweep.width * 1.5)
      : -(sweep.width + 5);

    // ── Holo: alpha oscillates gently ────────────────────────────────────────
    holo.alpha = 0.03 + Math.abs(Math.sin(t * 0.5)) * 0.05;

    // ── Illustration: float + parallax on hover ──────────────────────────────
    if (ilSprite) {
      const floatY = Math.sin(t * FLOAT_SPD) * FLOAT_AMP;
      if (isHover) {
        // Parallax: illustration moves opposite to tilt direction
        ilSprite.x    = ilBaseX + hNX * 7;
        ilSprite.y    = ilBaseY + floatY + hNY * 5;
        // 3D tilt via skew (feels like a physical card)
        root.skew.set(hNY * 0.042, -hNX * 0.042);
      } else {
        ilSprite.x = ilBaseX;
        ilSprite.y = ilBaseY + floatY;
        // Smooth skew back to zero when not hovering
        root.skew.x += (0 - root.skew.x) * Math.min(1, dt * 9);
        root.skew.y += (0 - root.skew.y) * Math.min(1, dt * 9);
      }
    }

    // ── Scale: smooth hover + tap pulse ──────────────────────────────────────
    if (tapPulse > 0) tapPulse = Math.max(0, tapPulse - dt * 4);
    const ts  = scaleTarget + tapPulse * 0.025;
    scaleCur += (ts - scaleCur) * Math.min(1, dt * 14);
    root.scale.set(scaleCur);

    // ── Particles: drift upward, fade in/out ─────────────────────────────────
    for (const p of parts) {
      p.life += dt;
      if (p.life > p.max) {
        p.life    = 0;
        p.s.x     = Math.random() * cardW;
        p.s.y     = cardH - 4;
        p.s.alpha = 0;
        continue;
      }
      const pf  = p.life / p.max;
      p.s.x    += p.vx;
      p.s.y    += p.vy;
      p.s.alpha = pf < 0.15
        ? (pf / 0.15) * 0.75
        : pf > 0.75
          ? ((1 - pf) / 0.25) * 0.75
          : 0.75;
    }
  };

  return { root, update, loadIllust };
}

// ─── React component ──────────────────────────────────────────────────────────
export function PixiObtainedGrid({ heroes, visible, onCardClick }: Props) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const appRef    = useRef<Application | null>(null);
  const gridRef   = useRef<Container | null>(null);
  const cardsRef  = useRef<CardNode[]>([]);
  const scrollRef = useRef({ y: 0, vel: 0, max: 0 });
  // Always-fresh callback ref — avoids card rebuild on closure change
  const clickRef  = useRef(onCardClick);
  clickRef.current = onCardClick;

  // ── Pause / resume Ticker when visibility toggles ────────────────────────
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    if (visible) app.ticker.start();
    else         app.ticker.stop();
  }, [visible]);

  // ── Initialize PixiJS Application (once on mount) ────────────────────────
  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const w = mountEl.clientWidth  || 390;
    const h = mountEl.clientHeight || 500;

    const app = new Application({
      width:           w,
      height:          h,
      backgroundAlpha: 0,         // transparent — game background shows through
      antialias:       true,
      resolution:      Math.min(window.devicePixelRatio || 1, 2), // cap at 2x
      autoDensity:     true,
    });

    const canvas = app.view as HTMLCanvasElement;
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none;';
    mountEl.appendChild(canvas);
    appRef.current = app;

    // Stage must be interactive for card hit-testing
    app.stage.eventMode = 'static';
    app.stage.hitArea   = app.screen;

    // Scrollable grid container
    const grid = new Container();
    app.stage.addChild(grid);
    gridRef.current = grid;

    // ── Scroll: wheel ────────────────────────────────────────────────────────
    const sc = scrollRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sc.vel = 0; // kill momentum on manual scroll
      sc.y   = Math.max(0, Math.min(sc.max, sc.y + e.deltaY * 0.7));
    };

    // ── Scroll: touch with momentum ──────────────────────────────────────────
    let tY = 0, tT = 0, tVel = 0;
    const onTouchStart = (e: TouchEvent) => {
      tY = e.touches[0].clientY;
      tT = performance.now();
      tVel = sc.vel = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const ny = e.touches[0].clientY;
      const nt = performance.now();
      const dy = tY - ny;
      const dt = Math.max(1, nt - tT);
      tVel = (dy / dt) * 16; // velocity in px/frame
      tY   = ny;
      tT   = nt;
      sc.y = Math.max(0, Math.min(sc.max, sc.y + dy));
    };
    const onTouchEnd = () => { sc.vel = tVel; };

    canvas.addEventListener('wheel',      onWheel,      { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true  });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: true  });

    // ── Ticker: single loop for scroll momentum + all card animations ────────
    let totalTime = 0;
    app.ticker.add((delta: number) => {
      const dt = delta / 60; // PixiJS delta is in frames; convert to seconds
      totalTime += dt;

      // Apply scroll momentum (inertia)
      if (Math.abs(sc.vel) > 0.1) {
        sc.y   = Math.max(0, Math.min(sc.max, sc.y + sc.vel));
        sc.vel *= 0.92; // friction coefficient
        if (Math.abs(sc.vel) < 0.1) sc.vel = 0;
      }
      grid.y = -sc.y;

      // Update all cards in one pass — this is the key perf win over N×rAF
      for (const card of cardsRef.current) {
        card.update(totalTime, dt);
      }
    });

    if (!visible) app.ticker.stop();

    // ── Resize observer ──────────────────────────────────────────────────────
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 10 && height > 10) {
        app.renderer.resize(width, height);
        app.stage.hitArea = app.screen;
      }
    });
    ro.observe(mountEl);

    return () => {
      ro.disconnect();
      canvas.removeEventListener('wheel',      onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
      app.destroy(true, { children: true, texture: false, baseTexture: false });
      appRef.current   = null;
      gridRef.current  = null;
      cardsRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run exactly once

  // ── Rebuild card grid when heroes data changes ────────────────────────────
  useEffect(() => {
    const app  = appRef.current;
    const grid = gridRef.current;
    if (!app || !grid) return;

    // Destroy old card nodes
    for (const card of cardsRef.current) {
      grid.removeChild(card.root);
      card.root.destroy({ children: true, texture: false });
    }
    cardsRef.current = [];

    if (heroes.length === 0) return;

    const appW  = app.screen.width;
    const cardW = Math.floor((appW - H_PAD * 2 - GAP * (COLS - 1)) / COLS);
    const cardH = Math.round(cardW * (400 / 250));

    // Shared gradient textures (same for all cards of same dimensions)
    const sweepTex = makeSweepTex(cardW, cardH);
    const holoTex  = makeHoloTex(cardW, cardH);

    const newCards: CardNode[] = [];

    heroes.forEach((hero, idx) => {
      const col  = idx % COLS;
      const row  = Math.floor(idx / COLS);
      const rCol = RARITY_COL[hero.rarity] ?? 0x8899BB;
      const pTex = makeParticleTex(rCol);

      const card = createCard(
        hero,
        cardW,
        cardH,
        sweepTex,
        holoTex,
        pTex,
        () => clickRef.current(hero.heroId),
        idx,
      );

      // pivot is at (cardW/2, cardH/2) → position card center in grid
      card.root.x = H_PAD + col * (cardW + GAP) + cardW / 2;
      card.root.y = V_PAD + row * (cardH + GAP) + cardH / 2;

      grid.addChild(card.root);
      card.loadIllust(); // async texture load → GPU upload on completion
      newCards.push(card);
    });

    cardsRef.current = newCards;

    // Recompute scroll bounds
    const rows       = Math.ceil(heroes.length / COLS);
    const totalH     = V_PAD + rows * (cardH + GAP) + V_PAD;
    const viewH      = app.screen.height;
    const sc         = scrollRef.current;
    sc.max           = Math.max(0, totalH - viewH);
    sc.y             = Math.min(sc.y, sc.max); // clamp if grid shrank

  }, [heroes]); // note: clickRef is stable, no need in deps

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute',
        top:      '20.5%',
        bottom:   '9%',
        left:     0,
        right:    0,
        zIndex:   10,
        display:  visible ? 'block' : 'none',
        overflow: 'hidden',
        // Prevent native scroll interference
        touchAction: 'none',
      }}
    />
  );
}
