/**
 * PixiEnemyInfoRow — WebGL enemy-info card row for Stage Info Panel.
 *
 * Renders 1–N enemy cards (identical visual to HeroCard SVG) using PixiJS.
 * Count badges (×N) are DOM overlays so they stay sharp at all DPRs.
 *
 * Card size: 82 × 131 px (250:400 aspect, same as all other Pixi card grids).
 * Shared bg textures cached at module level → zero re-creation on stage change.
 * Application is created on mount and destroyed on unmount (panel lifecycle).
 */

import React, { useEffect, useRef } from 'react';
import {
  Application, Container, Graphics, Sprite, Texture, BLEND_MODES,
} from 'pixi.js';
import {
  chromaDataUrlCache, applyChromaKey, keepChromaUrl,
} from '../utils/chromaKey';
import { HERO_RARITIES } from './HeroCard';

// ─── Public data shape ────────────────────────────────────────────────────────
export interface EnemyCardData {
  enemyId:   string;  // unique per enemy type (for key / cache)
  name:      string;
  rarity:    string;
  heroType:  string;
  level:     number;
  illustUrl: string;  // card illustration URL (green-screen → chroma key)
  count:     number;  // total in stage (for ×N badge overlay)
}

interface Props {
  enemies: EnemyCardData[];
}

type RCfg = typeof HERO_RARITIES[number];

// ─── Card geometry ────────────────────────────────────────────────────────────
const CARD_W = 82;
const CARD_H = Math.round(CARD_W * 400 / 250); // 131
const GAP    = 7;

// ─── Module-level GPU caches (persist across stage panel open/close) ──────────
const _eBgTex:   Map<string, Texture> = new Map();
const _eIllTex:  Map<string, Texture> = new Map();
let   _eSweepTex: Texture | null = null;
let   _eHoloTex:  Texture | null = null;

// ─── Canvas 2D helpers ────────────────────────────────────────────────────────
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

// ─── BG texture (border + fill) — shared per rarity at CARD_W ────────────────
function getEnemyBgTex(cfg: RCfg): Texture {
  const key = `eb-${cfg.id}`;
  if (_eBgTex.has(key)) return _eBgTex.get(key)!;
  const cv = document.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d')!;
  const s = CARD_W / 250;
  rrect(ctx, 0, 0, CARD_W, CARD_H, 12 * s); ctx.fillStyle = cfg.border; ctx.fill();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s); ctx.fillStyle = cfg.fill;   ctx.fill();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2*s; ctx.stroke();
  const tex = Texture.from(cv);
  _eBgTex.set(key, tex);
  return tex;
}

// ─── Shared sweep + holo textures (fixed at CARD_W) ──────────────────────────
function getEnemySharedFx(): { sweep: Texture; holo: Texture } {
  if (_eSweepTex && _eHoloTex) return { sweep: _eSweepTex, holo: _eHoloTex };
  const s = CARD_W / 250;

  // Sweep
  const scv = document.createElement('canvas');
  scv.width  = Math.round(CARD_W * 0.52); scv.height = Math.round(CARD_H * 2.2);
  const sc   = scv.getContext('2d')!;
  const sg   = sc.createLinearGradient(0, 0, scv.width, 0);
  sg.addColorStop(0,    'rgba(255,255,255,0)');
  sg.addColorStop(0.30, 'rgba(255,255,255,0.28)');
  sg.addColorStop(0.50, 'rgba(255,255,255,0.36)');
  sg.addColorStop(0.70, 'rgba(255,255,255,0.28)');
  sg.addColorStop(1,    'rgba(255,255,255,0)');
  sc.fillStyle=sg; sc.fillRect(0,0,scv.width,scv.height);
  _eSweepTex = Texture.from(scv);

  // Holo: soft iridescent, clipped to illustration area
  const hcv = document.createElement('canvas');
  hcv.width=CARD_W; hcv.height=CARD_H;
  const hc  = hcv.getContext('2d')!;
  rrect(hc, 3*s, 3*s, 244*s, 354*s, 10*s); hc.clip();
  const hg = hc.createLinearGradient(3*s, 3*s, CARD_W-3*s, 357*s);
  hg.addColorStop(0,    'rgba(255,220,240,1)');
  hg.addColorStop(0.25, 'rgba(220,235,255,1)');
  hg.addColorStop(0.50, 'rgba(215,255,235,1)');
  hg.addColorStop(0.75, 'rgba(245,220,255,1)');
  hg.addColorStop(1,    'rgba(255,248,215,1)');
  hc.fillStyle=hg; hc.fillRect(0,0,CARD_W,CARD_H);
  _eHoloTex = Texture.from(hcv);

  return { sweep: _eSweepTex, holo: _eHoloTex };
}

// ─── Illustration loader ──────────────────────────────────────────────────────
async function loadEnemyIllust(url: string): Promise<Texture | null> {
  if (!url) return null;
  const key = `ei:${url}`;
  if (_eIllTex.has(key)) return _eIllTex.get(key)!;
  const cached = chromaDataUrlCache.get(url);
  if (cached) {
    const img = new Image(); img.src = cached;
    if (!img.complete) await new Promise<void>(r => { img.onload=()=>r(); img.onerror=()=>r(); });
    const tex = Texture.from(img); _eIllTex.set(key, tex); return tex;
  }
  try {
    const img = new Image(); img.crossOrigin = 'anonymous';
    await new Promise<void>((res,rej) => { img.onload=()=>res(); img.onerror=rej; img.src=url; });
    const off=document.createElement('canvas');
    off.width=img.naturalWidth; off.height=img.naturalHeight;
    const octx=off.getContext('2d',{willReadFrequently:true})!;
    octx.drawImage(img,0,0);
    const id=octx.getImageData(0,0,off.width,off.height);
    applyChromaKey(id.data);
    octx.putImageData(id,0,0);
    keepChromaUrl(url, off.toDataURL('image/png'));
    const tex=Texture.from(off); _eIllTex.set(key,tex); return tex;
  } catch { return null; }
}

// ─── Overlay canvas (identical to PixiGalleryGrid unlocked overlay) ───────────
function createEnemyOverlay(data: EnemyCardData, cfg: RCfg): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d')!;
  const s = CARD_W / 250;

  ctx.save();
  rrect(ctx, 3*s, 3*s, 244*s, 394*s, 10*s); ctx.clip();

  // Bottom fade
  const bot = ctx.createLinearGradient(0, 280*s, 0, 357*s);
  bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle=bot; ctx.fillRect(3*s,280*s,244*s,77*s);

  // Bar fade (left-side)
  const bar=ctx.createLinearGradient(3*s,0,(3+185)*s,0);
  bar.addColorStop(0,'rgba(0,0,0,0.55)'); bar.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=bar; ctx.fillRect(3*s,291*s,185*s,25*s);

  // Hero type
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,1)'; ctx.shadowOffsetY=s; ctx.shadowBlur=4*s;
  ctx.fillStyle='#fff'; ctx.font=`700 ${Math.round(13*s)}px 'Playfair Display',serif`;
  ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillText(data.heroType, 11*s, 304*s);
  ctx.restore();

  // Stars (show rarity stars count)
  {
    const RS_R=14,RS_r=5.3,RS_CY=338,RS_X0=24,RS_STEP=32;
    const sc   = Math.max(1, Math.min(16, 1)); // enemies always start at 1 star
    const FILL = ['#FFD700','#FF3333','#D8D8D8','#FFD700'] as const;
    const STR  = ['#000','#000','#888','#000'] as const;
    for (let i=0; i<5; i++) {
      const lit = i < sc;
      ctx.save();
      star5(ctx,(RS_X0+i*RS_STEP)*s,RS_CY*s,RS_R*s,RS_r*s);
      ctx.fillStyle=lit?FILL[0]:'rgba(0,0,0,0.38)'; ctx.fill();
      ctx.strokeStyle=lit?STR[0]:'rgba(255,255,255,0.18)';
      ctx.lineWidth=1.2*s; ctx.lineJoin='round'; ctx.stroke();
      ctx.restore();
    }
  }

  // Rarity badge
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
    ctx.font=`bold ${Math.round(52*s)}px 'Playfair Display',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='#000'; ctx.lineWidth=1.5*s; ctx.strokeText(cfg.text,bsx,bsy);
    ctx.fillStyle=tg; ctx.fillText(cfg.text,bsx,bsy);
    ctx.restore();
  }

  // Bottom bar + zigzag + name
  ctx.fillStyle='#000'; ctx.fillRect(3*s,357*s,244*s,40*s);
  {
    const pts=[3,367,15,387,27,367,39,387,51,367,63,387,75,367,87,387,99,367,111,387,123,367,
               135,387,147,367,159,387,171,367,183,387,195,367,207,387,219,367,231,387,243,367];
    ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0]*s,pts[1]*s);
    for (let i=2;i<pts.length;i+=2) ctx.lineTo(pts[i]*s,pts[i+1]*s);
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
      ns=Math.max(1,ns-Math.max(1,Math.round(s*0.8)));
      ctx.font=`700 ${ns}px 'Playfair Display',serif`;
    }
    const ls=Math.round(3*s);
    if ('letterSpacing' in ctx) {
      (ctx as any).letterSpacing=`${ls}px`;
      ctx.fillText(data.name,125*s,378*s);
      (ctx as any).letterSpacing='0px';
    } else {
      // simple centred fallback
      ctx.fillText(data.name,125*s,378*s);
    }
    ctx.restore();
  }

  // Level badge (enemy level)
  {
    const S=66, lvX=(3+S*0.28)*s, lvY=(3+S*0.28)*s;
    const lv=data.level;
    const lfs=lv>=100?11:lv>=10?14:18, lsw=lv>=100?3:lv>=10?3.5:4;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(3*s,3*s); ctx.lineTo((3+S)*s,3*s); ctx.lineTo(3*s,(3+S)*s); ctx.closePath();
    ctx.fillStyle='rgba(0,0,0,0.78)'; ctx.fill(); ctx.clip();
    ctx.translate(lvX,lvY); ctx.rotate(-45*Math.PI/180);
    ctx.font=`700 ${Math.round(lfs*s)}px 'Playfair Display',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='#000'; ctx.lineWidth=lsw*s; ctx.strokeText(`Lv. ${lv}`,0,0);
    ctx.fillStyle='#fff'; ctx.fillText(`Lv. ${lv}`,0,0);
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

// ─── Card factory ─────────────────────────────────────────────────────────────
interface EnemyCardNode {
  root:   Container;
  ovSpr:  Sprite;
  data:   EnemyCardData;
  cfg:    RCfg;
  update: (t: number, dt: number) => void;
}

function buildEnemyCard(
  data:     EnemyCardData,
  cfg:      RCfg,
  bgTex:    Texture,
  sweepTex: Texture,
  holoTex:  Texture,
  idx:      number,
): EnemyCardNode {
  const s     = CARD_W / 250;
  const phase = idx * 0.618;

  const root = new Container();
  root.eventMode='static'; root.cursor='default';
  root.pivot.set(CARD_W/2, CARD_H/2);

  // BG
  const bgSpr=new Sprite(bgTex); bgSpr.width=CARD_W; bgSpr.height=CARD_H;
  root.addChild(bgSpr);

  // Illustration container
  const ilMask=new Graphics();
  ilMask.beginFill(0xFFFFFF,1);
  ilMask.drawRoundedRect(3*s,3*s,244*s,394*s,10*s); ilMask.endFill();
  const ilCon=new Container(); ilCon.mask=ilMask;
  root.addChild(ilMask); root.addChild(ilCon);
  let ilSpr:Sprite|null=null, ilBaseY=0;

  loadEnemyIllust(data.illustUrl).then(tex => {
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

  // Overlay sprite (deferred)
  const ovSpr=new Sprite(Texture.EMPTY); ovSpr.width=CARD_W; ovSpr.height=CARD_H;
  root.addChild(ovSpr);

  // FX container clipped to outer card bounds
  const fxMask=new Graphics();
  fxMask.beginFill(0xFFFFFF,1);
  fxMask.drawRoundedRect(0,0,CARD_W,CARD_H,12*s); fxMask.endFill();
  const fxCon=new Container(); fxCon.mask=fxMask;
  root.addChild(fxMask); root.addChild(fxCon);

  const sweep=new Sprite(sweepTex);
  sweep.y=-CARD_H*0.60; sweep.height=CARD_H*2.20;
  sweep.blendMode=BLEND_MODES.ADD; sweep.x=-(sweep.width+5);
  fxCon.addChild(sweep);

  const holo=new Sprite(holoTex);
  holo.width=CARD_W; holo.height=CARD_H;
  holo.blendMode=BLEND_MODES.NORMAL; holo.alpha=0.07;
  fxCon.addChild(holo);

  const FLOAT_P=3.7, SWEEP_P=4.8, HOLO_P=8.0;
  const update=(t:number)=>{
    const tt=t+phase;
    if (ilSpr) {
      const fe=0.5*(1-Math.cos(((tt%FLOAT_P)/FLOAT_P)*2*Math.PI));
      ilSpr.y=ilBaseY-fe*8*s; // slightly less float for smaller cards
    }
    const sf=(tt%SWEEP_P)/SWEEP_P;
    if (sf<0.38) {
      const sm=(p=>(p*p*(3-2*p)))(sf/0.38);
      sweep.x=-(sweep.width*1.2)+sm*(CARD_W+sweep.width*2.5);
    } else { sweep.x=CARD_W+5; }
    holo.alpha=0.05+0.045*(1-Math.cos(((tt%HOLO_P)/HOLO_P)*2*Math.PI));
  };

  return { root, ovSpr, data, cfg, update };
}

// ─── React component ──────────────────────────────────────────────────────────
const F_BADGE = "'Roboto Condensed', sans-serif";

export function PixiEnemyInfoRow({ enemies }: Props) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const appRef    = useRef<Application | null>(null);

  const totalW = enemies.length * CARD_W + Math.max(0, enemies.length - 1) * GAP;

  useEffect(() => {
    if (!enemies.length) return;
    const mountEl = mountRef.current;
    if (!mountEl) return;
    let cancelled = false;

    // Destroy previous application if enemies changed (stage switch)
    if (appRef.current) {
      appRef.current.destroy(true, { children: true, texture: false });
      appRef.current = null;
    }

    const app = new Application({
      width:           totalW,
      height:          CARD_H,
      backgroundAlpha: 0,
      antialias:       false,
      resolution:      Math.min(window.devicePixelRatio || 1, 2),
      autoDensity:     true,
    });
    const canvas = app.view as HTMLCanvasElement;
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    mountEl.appendChild(canvas);
    appRef.current = app;

    const { sweep: sweepTex, holo: holoTex } = getEnemySharedFx();
    const nodes: EnemyCardNode[] = [];

    enemies.forEach((enemy, idx) => {
      const cfg    = HERO_RARITIES.find(r => r.id === enemy.rarity) ?? HERO_RARITIES[4];
      const bgTex  = getEnemyBgTex(cfg);
      const node   = buildEnemyCard(enemy, cfg, bgTex, sweepTex, holoTex, idx);
      node.root.x  = idx * (CARD_W + GAP) + CARD_W / 2;
      node.root.y  = CARD_H / 2;
      app.stage.addChild(node.root);
      nodes.push(node);
    });

    // Stagger overlay creation: 2 per rAF after fonts ready
    document.fonts.ready.then(() => {
      if (cancelled) return;
      const queue = [...nodes];
      const processNext = () => {
        if (cancelled || !queue.length) return;
        for (let i = 0; i < 2 && queue.length > 0; i++) {
          const node = queue.shift()!;
          const ov   = createEnemyOverlay(node.data, node.cfg);
          node.ovSpr.texture = Texture.from(ov);
          node.ovSpr.width   = CARD_W;
          node.ovSpr.height  = CARD_H;
        }
        if (queue.length) requestAnimationFrame(processNext);
      };
      requestAnimationFrame(processNext);
    });

    // Ticker: float + sweep + holo
    let totalTime = 0;
    app.ticker.add((delta: number) => {
      totalTime += delta / 60;
      for (const node of nodes) node.update(totalTime);
    });

    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: false });
        appRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemies]);

  return (
    <div style={{ position: 'relative', width: totalW, height: CARD_H, flexShrink: 0 }}>
      {/* PixiJS canvas mounted here */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Count badges — DOM overlay (crisp at all DPRs, no canvas needed) */}
      {enemies.map((enemy, idx) =>
        enemy.count > 1 ? (
          <div
            key={enemy.enemyId + idx}
            style={{
              position:     'absolute',
              top:          4,
              left:         idx * (CARD_W + GAP) + CARD_W - 20,
              background:   'rgba(0,0,0,0.85)',
              border:       '1px solid rgba(255,255,255,0.3)',
              borderRadius: 10,
              padding:      '1px 5px',
              fontFamily:   F_BADGE,
              fontSize:     10,
              fontWeight:   800,
              color:        '#ffd54f',
              zIndex:       5,
              pointerEvents:'none',
              userSelect:   'none',
            }}
          >×{enemy.count}</div>
        ) : null
      )}
    </div>
  );
}
