/**
 * PixiDeployGrid — WebGL hero-selection grid shown when player taps an empty
 * formation slot.  Architecture identical to PixiObtainedGrid:
 *   • 5 cards per row, vertical scroll with momentum
 *   • bg / illustration / overlay textures pre-baked to Canvas2D once
 *   • Ticker drives float + sweep + holo only
 *
 * Extra vs PixiObtainedGrid:
 *   • `deployed: boolean` per card → dim overlay + "DEPLOYED" badge
 *   • heroes prop changes on rarity-filter switch → grid rebuilds without
 *     destroying the Application (two-effect pattern)
 */

import React, { useEffect, useLayoutEffect, useRef } from 'react';
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
export interface DeployHeroData {
  heroId:    string;
  name:      string;
  rarity:    string;
  heroType:  string;
  level:     number;
  stars:     number;
  illustUrl: string;
  deployed:  boolean; // already occupies a formation slot
}

interface Props {
  heroes:      DeployHeroData[];
  onCardClick: (heroId: string) => void; // no-op for deployed cards (filtered by component)
}

type RCfg = typeof HERO_RARITIES[number];

// ─── Layout constants ─────────────────────────────────────────────────────────
const COLS  = 5;
const H_PAD = 8;
const V_PAD = 8;
const GAP   = 6;

// ─── Module-level GPU caches (survive open/close of overlay) ─────────────────
const _dBgTex:  Map<string, Texture> = new Map(); // key: rarity-cardW
const _dIllTex: Map<string, Texture> = new Map(); // key: url

let _dSweepTex:     Texture | null = null;
let _dHoloTex:      Texture | null = null;
let _dShTexW        = 0;
let _dDeployedTex:  Texture | null = null;
let _dDeployedTexW  = 0;

// ─── Canvas 2D helpers ────────────────────────────────────────────────────────
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);          ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,      y + h, x,     y + h - r, r);
  ctx.lineTo(x,      y + r);
  ctx.arcTo(x,      y,     x + r, y,         r);
  ctx.closePath();
}

function star5(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number, r: number,
) {
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

function fillTextLS(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, ls: number,
) {
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

// ─── BG texture ───────────────────────────────────────────────────────────────
function getDeplBgTex(cfg: RCfg, cardW: number, cardH: number): Texture {
  const key = `db-${cfg.id}-${cardW}`;
  if (_dBgTex.has(key)) return _dBgTex.get(key)!;
  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s   = cardW / 250;
  rrect(ctx, 0, 0, cardW, cardH, 12 * s); ctx.fillStyle = cfg.border; ctx.fill();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s); ctx.fillStyle = cfg.fill;   ctx.fill();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2*s; ctx.stroke();
  const tex = Texture.from(cv);
  _dBgTex.set(key, tex);
  return tex;
}

// ─── Shared sweep + holo ──────────────────────────────────────────────────────
function getDeplSharedFx(cardW: number, cardH: number): { sweep: Texture; holo: Texture } {
  if (_dSweepTex && _dHoloTex && _dShTexW === cardW) {
    return { sweep: _dSweepTex, holo: _dHoloTex };
  }
  const s = cardW / 250;

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
  sc.fillStyle = sg; sc.fillRect(0, 0, scv.width, scv.height);
  _dSweepTex = Texture.from(scv);

  const hcv = document.createElement('canvas');
  hcv.width = cardW; hcv.height = cardH;
  const hc  = hcv.getContext('2d')!;
  rrect(hc, 3*s, 3*s, 244*s, 354*s, 10*s); hc.clip();
  const hg = hc.createLinearGradient(3*s, 3*s, cardW - 3*s, 357*s);
  hg.addColorStop(0,    'rgba(255,220,240,1)');
  hg.addColorStop(0.25, 'rgba(220,235,255,1)');
  hg.addColorStop(0.50, 'rgba(215,255,235,1)');
  hg.addColorStop(0.75, 'rgba(245,220,255,1)');
  hg.addColorStop(1,    'rgba(255,248,215,1)');
  hc.fillStyle = hg; hc.fillRect(0, 0, cardW, cardH);
  _dHoloTex = Texture.from(hcv);

  _dShTexW = cardW;
  return { sweep: _dSweepTex, holo: _dHoloTex };
}

// ─── Deployed dim overlay texture (shared, cached per cardW) ──────────────────
function getDeployedDimTex(cardW: number, cardH: number): Texture {
  if (_dDeployedTex && _dDeployedTexW === cardW) return _dDeployedTex;
  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s   = cardW / 250;

  // semi-transparent dim
  ctx.fillStyle = 'rgba(0,0,0,0.60)';
  ctx.fillRect(0, 0, cardW, cardH);

  // "DEPLOYED" badge — centered pill
  const pillW = Math.round(90 * s);
  const pillH = Math.round(22 * s);
  const px    = (cardW - pillW) / 2;
  const py    = (cardH - pillH) / 2;
  rrect(ctx, px, py, pillW, pillH, pillH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  rrect(ctx, px, py, pillW, pillH, pillH / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth   = Math.max(0.5, s);
  ctx.stroke();

  const fs = Math.max(1, Math.round(10 * s));
  ctx.font         = `800 ${fs}px 'Roboto Condensed', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'rgba(255,255,255,0.7)';
  ctx.letterSpacing && ((ctx as any).letterSpacing = `${Math.round(2*s)}px`);
  ctx.fillText('DEPLOYED', cardW / 2, cardH / 2);

  _dDeployedTex  = Texture.from(cv);
  _dDeployedTexW = cardW;
  return _dDeployedTex;
}

// ─── Illustration loader (same pipeline as PixiObtainedGrid) ─────────────────
async function loadDeplIllust(url: string): Promise<Texture | null> {
  if (!url) return null;
  const ck = `di:${url}`;
  if (_dIllTex.has(ck)) return _dIllTex.get(ck)!;

  const cached = chromaDataUrlCache.get(url);
  if (cached) {
    const img = new Image(); img.src = cached;
    if (!img.complete) await new Promise<void>(r => { img.onload=()=>r(); img.onerror=()=>r(); });
    const tex = Texture.from(img); _dIllTex.set(ck, tex); return tex;
  }
  try {
    const img = new Image(); img.crossOrigin = 'anonymous';
    await new Promise<void>((res,rej) => { img.onload=()=>res(); img.onerror=rej; img.src=url; });
    const off = document.createElement('canvas');
    off.width = img.naturalWidth; off.height = img.naturalHeight;
    const octx = off.getContext('2d', { willReadFrequently: true })!;
    octx.drawImage(img, 0, 0);
    const id = octx.getImageData(0,0,off.width,off.height);
    applyChromaKey(id.data);
    octx.putImageData(id, 0, 0);
    keepChromaUrl(url, off.toDataURL('image/png'));
    const tex = Texture.from(off); _dIllTex.set(ck, tex); return tex;
  } catch { return null; }
}

// ─── Overlay canvas ───────────────────────────────────────────────────────────
function createDeplOverlay(
  data: DeployHeroData, cfg: RCfg, cardW: number, cardH: number,
): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cardW; cv.height = cardH;
  const ctx = cv.getContext('2d')!;
  const s   = cardW / 250;

  ctx.save();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s); ctx.clip();

  // Bottom fade
  const bg = ctx.createLinearGradient(0, 280*s, 0, 357*s);
  bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = bg; ctx.fillRect(3*s, 280*s, 244*s, 77*s);

  // Bar fade
  const bar = ctx.createLinearGradient(3*s,0,(3+185)*s,0);
  bar.addColorStop(0,'rgba(0,0,0,0.55)'); bar.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = bar; ctx.fillRect(3*s,291*s,185*s,25*s);

  // Hero type
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,1)'; ctx.shadowOffsetY=1*s; ctx.shadowBlur=4*s;
  ctx.fillStyle='#fff'; ctx.font=`700 ${Math.max(1,Math.round(13*s))}px 'Playfair Display',serif`;
  ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillText(data.heroType, 11*s, 304*s);
  ctx.restore();

  // Stars
  {
    const RS_R=14,RS_r=5.3,RS_CY=338,RS_X0=24,RS_STEP=32;
    const sc    = Math.max(1,Math.min(16,data.stars));
    const tier  = Math.min(3,Math.floor((sc-1)/5));
    const inT   = sc - tier*5;
    const slots = tier===3?1:5;
    const FILL  = ['#FFD700','#FF3333','#D8D8D8','#FFD700'] as const;
    const STR   = ['#000','#000','#888','#000']             as const;
    for (let i=0;i<slots;i++) {
      const lit=i<inT;
      ctx.save();
      if (lit&&tier===3){ctx.shadowColor='#FFD700';ctx.shadowBlur=6*s;}
      star5(ctx,(RS_X0+i*RS_STEP)*s,RS_CY*s,RS_R*s,RS_r*s);
      ctx.fillStyle=lit?FILL[tier]:'rgba(0,0,0,0.38)'; ctx.fill();
      ctx.strokeStyle=lit?STR[tier]:'rgba(255,255,255,0.18)';
      ctx.lineWidth=1.2*s; ctx.lineJoin='round'; ctx.stroke();
      if (lit&&tier===3){ctx.shadowBlur=12*s;ctx.shadowColor='rgba(255,80,255,0.7)';ctx.stroke();}
      ctx.restore();
    }
  }

  // Rarity diamond
  {
    const bsx=(cfg.text==='SS'?210:218)*s,bsy=321*s,d=28*s,c=5*s;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bsx,bsy-d); ctx.quadraticCurveTo(bsx+c,bsy-c,bsx+d,bsy);
    ctx.quadraticCurveTo(bsx+c,bsy+c,bsx,bsy+d); ctx.quadraticCurveTo(bsx-c,bsy+c,bsx-d,bsy);
    ctx.quadraticCurveTo(bsx-c,bsy-c,bsx,bsy-d); ctx.closePath();
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fill();
    const tg=ctx.createLinearGradient(bsx,bsy-30*s,bsx,bsy+30*s);
    tg.addColorStop(0,cfg.shine); tg.addColorStop(0.48,cfg.shine); tg.addColorStop(1,cfg.fill);
    const rfs=Math.max(1,Math.round(52*s));
    ctx.font=`bold ${rfs}px 'Playfair Display',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='#000'; ctx.lineWidth=1.5*s; ctx.strokeText(cfg.text,bsx,bsy);
    ctx.fillStyle=tg; ctx.fillText(cfg.text,bsx,bsy);
    ctx.restore();
  }

  // Black bar + zigzag
  ctx.fillStyle='#000'; ctx.fillRect(3*s,357*s,244*s,40*s);
  {
    const pts=[3,367,15,387,27,367,39,387,51,367,63,387,75,367,87,387,
               99,367,111,387,123,367,135,387,147,367,159,387,171,367,
               183,387,195,367,207,387,219,367,231,387,243,367];
    ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0]*s,pts[1]*s);
    for (let i=2;i<pts.length;i+=2) ctx.lineTo(pts[i]*s,pts[i+1]*s);
    ctx.strokeStyle='rgba(100,60,10,0.35)'; ctx.lineWidth=1.5*s;
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); ctx.restore();
  }

  // Name
  {
    ctx.save(); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const maxW=230*s;
    let ns=Math.max(1,Math.round(18*s));
    ctx.font=`700 ${ns}px 'Playfair Display',serif`;
    while(ctx.measureText(data.name).width>maxW&&ns>Math.max(1,Math.round(9*s))){
      ns-=Math.max(1,Math.round(s*0.8));
      ctx.font=`700 ${ns}px 'Playfair Display',serif`;
    }
    const ls=Math.round(3*s);
    if ('letterSpacing' in ctx){ (ctx as any).letterSpacing=`${ls}px`; ctx.fillText(data.name,125*s,378*s); (ctx as any).letterSpacing='0px'; }
    else fillTextLS(ctx,data.name,125*s,378*s,ls);
    ctx.restore();
  }

  // Level badge
  {
    const S=66,lvX=(3+S*0.28)*s,lvY=(3+S*0.28)*s;
    const lvFontSize=data.level>=100?11:data.level>=10?14:18;
    const lvStroke  =data.level>=100?3  :data.level>=10?3.5:4;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(3*s,3*s); ctx.lineTo((3+S)*s,3*s); ctx.lineTo(3*s,(3+S)*s); ctx.closePath();
    ctx.fillStyle='rgba(0,0,0,0.78)'; ctx.fill(); ctx.clip();
    ctx.translate(lvX,lvY); ctx.rotate(-45*Math.PI/180);
    ctx.font=`700 ${Math.max(1,Math.round(lvFontSize*s))}px 'Playfair Display',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='#000'; ctx.lineWidth=lvStroke*s;
    ctx.strokeText(`Lv. ${data.level}`,0,0);
    ctx.fillStyle='#fff'; ctx.fillText(`Lv. ${data.level}`,0,0);
    ctx.restore();
  }

  ctx.restore(); // end inner clip

  // Outer shine
  ctx.save(); ctx.globalAlpha=0.4;
  rrect(ctx,1*s,1*s,248*s,398*s,11*s);
  ctx.strokeStyle=cfg.shine; ctx.lineWidth=s; ctx.stroke();
  ctx.restore();

  return cv;
}

// ─── Card node ────────────────────────────────────────────────────────────────
interface DeplCardNode {
  root:   Container;
  ovSpr:  Sprite;
  data:   DeployHeroData;
  cfg:    RCfg;
  update: (t: number, dt: number) => void;
}

function createDeplCard(
  data:      DeployHeroData,
  cfg:       RCfg,
  cardW:     number,
  cardH:     number,
  bgTex:     Texture,
  sweepTex:  Texture,
  holoTex:   Texture,
  dimTex:    Texture,
  onClick:   () => void,
  idx:       number,
): DeplCardNode {
  const s     = cardW / 250;
  const phase = idx * 0.618;

  const root = new Container();
  root.eventMode = 'static';
  root.cursor    = data.deployed ? 'default' : 'pointer';
  root.pivot.set(cardW / 2, cardH / 2);

  // BG
  const bgSpr = new Sprite(bgTex); bgSpr.width=cardW; bgSpr.height=cardH;
  root.addChild(bgSpr);

  // Illustration (clipped)
  const ilMask = new Graphics();
  ilMask.beginFill(0xFFFFFF,1);
  ilMask.drawRoundedRect(3*s,3*s,244*s,394*s,10*s); ilMask.endFill();
  const ilCon = new Container(); ilCon.mask = ilMask;
  root.addChild(ilMask); root.addChild(ilCon);
  let ilSpr: Sprite|null=null, ilBaseY=0;

  // Overlay (deferred)
  const ovSpr = new Sprite(Texture.EMPTY); ovSpr.width=cardW; ovSpr.height=cardH;
  root.addChild(ovSpr);

  // FX (sweep + holo, clipped)
  const fxMask = new Graphics();
  fxMask.beginFill(0xFFFFFF,1);
  fxMask.drawRoundedRect(0,0,cardW,cardH,12*s); fxMask.endFill();
  const fxCon = new Container(); fxCon.mask = fxMask;
  root.addChild(fxMask); root.addChild(fxCon);

  const sweep = new Sprite(sweepTex);
  sweep.y=-cardH*0.60; sweep.height=cardH*2.20;
  sweep.blendMode=BLEND_MODES.ADD; sweep.x=-(sweep.width+5);
  fxCon.addChild(sweep);

  const holo = new Sprite(holoTex);
  holo.width=cardW; holo.height=cardH;
  holo.blendMode=BLEND_MODES.NORMAL; holo.alpha=0.07;
  fxCon.addChild(holo);

  // Deployed dim overlay (on top of everything)
  if (data.deployed) {
    const dimSpr = new Sprite(dimTex); dimSpr.width=cardW; dimSpr.height=cardH;
    root.addChild(dimSpr);
  }

  // Interaction
  let tapPulse = 0;
  if (!data.deployed) {
    root.on('pointertap',  onClick);
    root.on('pointerdown', () => { tapPulse = 1; });
  }

  // Load illustration
  loadDeplIllust(data.illustUrl).then(tex => {
    if (!tex||tex===Texture.EMPTY) return;
    const dX=3*s,dY=3*s,dW=244*s,dH=394*s;
    const sf=Math.max(dW/tex.width,dH/tex.height);
    ilSpr=new Sprite(tex);
    ilSpr.width=tex.width*sf; ilSpr.height=tex.height*sf;
    ilSpr.x=dX+(dW-ilSpr.width)/2;
    ilSpr.y=dY+(dH-ilSpr.height);
    ilBaseY=ilSpr.y;
    ilCon.addChild(ilSpr);
  });

  // Per-frame update
  const FP=3.7,SP=4.8,HP=8.0;
  const update=(totalTime:number,dt:number)=>{
    const t=totalTime+phase;
    if(ilSpr&&!data.deployed){
      const fe=0.5*(1-Math.cos(((t%FP)/FP)*2*Math.PI));
      ilSpr.y=ilBaseY-fe*10*s;
    }
    const sf=(t%SP)/SP;
    if(sf<0.38){ const p=sf/0.38,sm=p*p*(3-2*p); sweep.x=-(sweep.width*1.2)+sm*(cardW+sweep.width*2.5); }
    else sweep.x=cardW+5;
    holo.alpha=0.05+0.045*(1-Math.cos(((t%HP)/HP)*2*Math.PI));
    if(tapPulse>0){ tapPulse=Math.max(0,tapPulse-dt*5); root.scale.set(1-tapPulse*0.035); }
    else if(root.scale.x!==1) root.scale.set(1);
  };

  return { root, ovSpr, data, cfg, update };
}

// ─── React component ──────────────────────────────────────────────────────────
export function PixiDeployGrid({ heroes, onCardClick }: Props) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const appRef    = useRef<Application | null>(null);
  const gridRef   = useRef<Container | null>(null);
  const cardsRef  = useRef<DeplCardNode[]>([]);
  const scrollRef = useRef({ y: 0, vel: 0, max: 0 });
  const clickRef  = useRef(onCardClick);
  clickRef.current = onCardClick;

  // ── Application init (once on mount) ─────────────────────────────────────
  useLayoutEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const w = mountEl.clientWidth  || 390;
    const h = mountEl.clientHeight || 500;

    const app = new Application({
      width:           w,
      height:          h,
      backgroundAlpha: 0,
      antialias:       false,
      resolution:      Math.min(window.devicePixelRatio || 1, 2),
      autoDensity:     true,
    });

    const canvas = app.view as HTMLCanvasElement;
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none;';
    mountEl.appendChild(canvas);
    appRef.current = app;

    app.stage.eventMode = 'static';
    app.stage.hitArea   = app.screen;

    const grid = new Container();
    app.stage.addChild(grid);
    gridRef.current = grid;

    // Scroll: wheel
    const sc = scrollRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sc.vel = 0;
      sc.y   = Math.max(0, Math.min(sc.max, sc.y + e.deltaY * 0.7));
    };

    // Scroll: touch with momentum
    let tY=0, tT=0, tVel=0;
    const onTS=(e:TouchEvent)=>{ tY=e.touches[0].clientY; tT=performance.now(); tVel=sc.vel=0; };
    const onTM=(e:TouchEvent)=>{
      e.preventDefault();
      const ny=e.touches[0].clientY,nt=performance.now(),dy=tY-ny,dt=Math.max(1,nt-tT);
      tVel=(dy/dt)*16; tY=ny; tT=nt;
      sc.y=Math.max(0,Math.min(sc.max,sc.y+dy));
    };
    const onTE=()=>{ sc.vel=tVel; };

    canvas.addEventListener('wheel',      onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTS,    { passive: true  });
    canvas.addEventListener('touchmove',  onTM,    { passive: false });
    canvas.addEventListener('touchend',   onTE,    { passive: true  });

    // Ticker
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
      for (const card of cardsRef.current) card.update(totalTime, dt);
    });

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTS);
      canvas.removeEventListener('touchmove', onTM);
      canvas.removeEventListener('touchend', onTE);
      app.destroy(true, { children: true, texture: false });
      appRef.current  = null;
      gridRef.current = null;
    };
  }, []); // runs once on mount

  // ── Grid rebuild on heroes change ────────────────────────────────────────
  useEffect(() => {
    const app  = appRef.current;
    const grid = gridRef.current;
    if (!app || !grid) return;
    let cancelled = false;

    // Clear previous cards
    grid.removeChildren();
    cardsRef.current = [];

    // Reset scroll
    const sc = scrollRef.current;
    sc.y = 0; sc.vel = 0;

    if (!heroes.length) return;

    // Compute card size from screen width
    const appW  = app.screen.width;
    const cardW = Math.floor((appW - H_PAD * 2 - GAP * (COLS - 1)) / COLS);
    const cardH = Math.round(cardW * 400 / 250);

    // Compute total content height
    const rows = Math.ceil(heroes.length / COLS);
    sc.max = Math.max(0, rows * (cardH + GAP) - V_PAD - app.screen.height);

    const { sweep: sweepTex, holo: holoTex } = getDeplSharedFx(cardW, cardH);
    const dimTex = getDeployedDimTex(cardW, cardH);

    const nodes: DeplCardNode[] = [];

    heroes.forEach((hero, idx) => {
      const cfg    = HERO_RARITIES.find(r => r.id === hero.rarity) ?? HERO_RARITIES[4];
      const bgTex  = getDeplBgTex(cfg, cardW, cardH);
      const col    = idx % COLS;
      const row    = Math.floor(idx / COLS);
      const x      = H_PAD + col * (cardW + GAP) + cardW / 2;
      const y      = V_PAD + row * (cardH + GAP) + cardH / 2;

      const node = createDeplCard(
        hero, cfg, cardW, cardH, bgTex, sweepTex, holoTex, dimTex,
        () => clickRef.current(hero.heroId),
        idx,
      );
      node.root.x = x;
      node.root.y = y;
      grid.addChild(node.root);
      nodes.push(node);
    });

    cardsRef.current = nodes;

    // Stagger overlay creation — 2 per rAF, after fonts ready
    document.fonts.ready.then(() => {
      if (cancelled) return;
      const queue = [...nodes];
      const processNext = () => {
        if (cancelled || !queue.length) return;
        for (let i = 0; i < 2 && queue.length > 0; i++) {
          const node = queue.shift()!;
          const ov   = createDeplOverlay(node.data, node.cfg, cardW, cardH);
          node.ovSpr.texture = Texture.from(ov);
          node.ovSpr.width   = cardW;
          node.ovSpr.height  = cardH;
        }
        if (queue.length) requestAnimationFrame(processNext);
      };
      requestAnimationFrame(processNext);
    });

    return () => { cancelled = true; };
  }, [heroes]);

  return (
    <div
      ref={mountRef}
      style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}
    />
  );
}
