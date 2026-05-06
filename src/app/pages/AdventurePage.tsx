/**
 * AdventurePage — World Map → Chapter view
 * Drag anywhere on screen to scroll chapter cards (full-screen swipe).
 */

import { useState, useRef, useEffect } from 'react';
import { GamePageLayout } from '../components/GamePageLayout';
import { HeroCard } from '../components/HeroCard';
import { HeroCardAnimated } from '../components/HeroCardAnimated';
import { useChromaKeyDataUrl } from '../utils/chromaKey';
import { useHero } from '../context/HeroContext';
import type { StageEnemyFull } from '../context/HeroContext';
import { BattlePlayback } from '../components/battle/BattlePlayback';
import { playBtnSound, playCardSound, playBackSound, playStartBattleSound } from '../utils/buttonSound';
import { pauseMainBgm, resumeMainBgm } from '../components/BgmController';
import { simulateBattle } from '/utils/supabase/battle-service';
import type { SimBattleResult } from '/utils/supabase/battle-service';
import { useAuth } from '../context/AuthContext';
import { getHeroIlust } from '../data/heroGallery';
import { PixiEnemyInfoRow, EnemyCardData } from '../components/PixiEnemyInfoRow';
import { PixiDeployGrid, DeployHeroData } from '../components/PixiDeployGrid';


const MAP_URL   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777566900/ChatGPT_Image_Apr_30_2026_11_34_05_PM_ptwl1w.png';
const GRASS_URL = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777571911/ChatGPT_Image_May_1_2026_12_57_58_AM_xgzne0.png';
const BATTLE_BG_URL = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777582000/35957be7-1c54-4274-80bf-dbabbd1d8a99.png';

const FP = "'Playfair Display', serif";
const F  = "'Roboto Condensed', sans-serif";

// Landscape card dimensions
const CARD_W  = 300;
const CARD_H  = 180;
const CONN_W  = 48;
const PAD_L   = 24;
const PAD_R   = 32;

const CHAPTERS = [
  { num: 'I',   label: 'Grasslands', img: GRASS_URL, available: true  },
  { num: 'II',  label: 'Coming Soon', img: null,      available: false },
  { num: 'III', label: 'Coming Soon', img: null,      available: false },
  { num: 'IV',  label: 'Coming Soon', img: null,      available: false },
  { num: 'V',   label: 'Coming Soon', img: null,      available: false },
];

// ─── Connector ───────────────────────────────────────────────────────────────
function Connector() {
  return (
    <div style={{ width: CONN_W, flexShrink: 0, height: CARD_H, display: 'flex', alignItems: 'center' }}>
      <div style={{
        width: '100%', height: 4,
        background: '#F97316',
        boxShadow: '0 0 0 1.5px #000, 0 0 8px rgba(249,115,22,0.4)',
        borderRadius: 2,
      }}/>
    </div>
  );
}

// ─── Chapter Card ─────────────────────────────────────────────────────────────
function ChapterCard({ num, label, img, onSelect }: {
  num: string; label: string; img: string | null; onSelect?: () => void;
}) {
  const pressX = useRef(0);

  return (
    <div
      onPointerDown={(e) => { pressX.current = e.clientX; }}
      onClick={(e) => {
        if (Math.abs(e.clientX - pressX.current) > 10) return;
        if (img) playCardSound(); else playBtnSound();
        onSelect?.();
      }}
      style={{
        width: CARD_W, height: CARD_H,
        flexShrink: 0,
        borderRadius: 10,
        overflow: 'hidden',
        border: img ? '2px solid rgba(180,250,100,0.5)' : '2px solid rgba(255,255,255,0.07)',
        boxShadow: img
          ? '0 0 28px rgba(80,160,0,0.28), 0 6px 24px rgba(0,0,0,0.75)'
          : '0 4px 20px rgba(0,0,0,0.5)',
        background: '#000',
        cursor: img ? 'pointer' : 'default',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {img ? (
        <img
          src={img}
          alt={`Chapter ${num}`}
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block', pointerEvents: 'none' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(145deg,#0d0822,#06040e,#0c0820)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5"/>
            <rect x="11" y="23" width="18" height="12" rx="2.5" fill="rgba(120,100,200,0.15)" stroke="rgba(150,120,220,0.2)" strokeWidth="1"/>
            <path d="M13 23v-5a7 7 0 0 1 14 0v5" stroke="rgba(150,120,220,0.28)" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="20" cy="30" r="1.8" fill="rgba(180,150,255,0.28)"/>
          </svg>
        </div>
      )}

      {/* Text label overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        padding: '8px 12px 10px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontFamily: FP, fontSize: 14, fontWeight: 800, color: img ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.2)', letterSpacing: '0.2em', lineHeight: 1.15 }}>
          CHAPTER {num}
        </div>
        <div style={{ fontFamily: F, fontSize: 11, color: img ? 'rgba(180,250,100,0.88)' : 'rgba(255,255,255,0.16)', letterSpacing: '0.1em', marginTop: 3 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── World Map View ───────────────────────────────────────────────────────────
function WorldMapView({ onChapterSelect }: { onChapterSelect: (n: number) => void }) {
  const [offsetX, setOffsetX] = useState(PAD_L);
  const dragRef   = useRef({ active: false, startX: 0, startOffset: 0, lastX: 0, lastTime: 0, velocity: 0, moved: false });
  const rafRef    = useRef<number | null>(null);
  const blockRef  = useRef(false); // block next card click after drag

  const contentW = PAD_L + CHAPTERS.length * CARD_W + (CHAPTERS.length - 1) * CONN_W + PAD_R;

  const clamp = (v: number) => {
    const min = Math.min(PAD_L, window.innerWidth - contentW);
    return Math.max(min, Math.min(PAD_L, v));
  };

  const stopRAF = () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };

  const applyMomentum = (vel: number) => {
    let v = vel * 14;
    const step = () => {
      v *= 0.91;
      if (Math.abs(v) < 0.4) return;
      setOffsetX(prev => {
        const next = clamp(prev + v);
        if (next === prev) { v = 0; }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => stopRAF(), []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // ── Exclude bottom nav zone (~80px) and top resource bar (~60px) ──
    const sy = e.clientY;
    const sh = window.innerHeight;
    if (sy > sh - 82 || sy < 58) return;

    stopRAF();
    dragRef.current = {
      active: true, startX: e.clientX, startOffset: offsetX,
      lastX: e.clientX, lastTime: Date.now(), velocity: 0, moved: false,
    };
    // ── NO setPointerCapture — it hijacks child element events (nav buttons) ──
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 7) d.moved = true;
    if (!d.moved) return;
    e.preventDefault(); // only prevent default when actually dragging
    const now = Date.now(); const dt = now - d.lastTime;
    if (dt > 0) d.velocity = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX; d.lastTime = now;
    setOffsetX(clamp(d.startOffset + dx));
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    if (d.moved) {
      blockRef.current = true;
      setTimeout(() => { blockRef.current = false; }, 80);
      applyMomentum(d.velocity);
    }
  };

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', cursor: dragRef.current.moved ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* World map background */}
      <img
        src={MAP_URL}
        alt=""
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 120% 120% at 50% 50%, transparent 20%, rgba(0,0,0,0.42) 100%)', pointerEvents: 'none' }}/>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '22%', background: 'linear-gradient(0deg,rgba(0,0,0,0.78) 0%,transparent 100%)', pointerEvents: 'none' }}/>

      {/* Chapter card row */}
      <div style={{
        position: 'absolute',
        top: 0,
        bottom: 'clamp(52px,10dvh,80px)',
        left: 0, right: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        overflow: 'visible',
        pointerEvents: 'none', // row container transparent, cards handle clicks
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          transform: `translateX(${offsetX}px)`,
          willChange: 'transform',
          gap: 0,
          pointerEvents: 'auto',
        }}>
          {CHAPTERS.map((ch, i) => (
            <div key={ch.num} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <ChapterCard
                num={ch.num}
                label={ch.label}
                img={ch.img}
                onSelect={ch.available ? () => { if (!blockRef.current) onChapterSelect(i + 1); } : undefined}
              />
              {i < CHAPTERS.length - 1 && <Connector />}
            </div>
          ))}
        </div>
      </div>

      <GamePageLayout activeTab={undefined} hidePlayerInfo hideDropdown />
    </div>
  );
}

// ─── Stage Map — Horizontal Scroll ──────────────────────────────────────────
// Each stage gets H_SPACING px; only 2–3 nodes are visible per screen.
// Nodes alternate between upper and lower lanes for a winding road feel.
const H_SPACING = 190;
const H_R       = 10;    // small dots like original
const H_PAD_L   = 60;
const H_PAD_R   = 80;
const H_YTOP    = 36;
const H_YBOT    = 86;
const SVG_HM_H  = H_YBOT + H_R + 26;    // ~122px
const SVG_HM_W  = H_PAD_L + 19 * H_SPACING + H_PAD_R;

function hNodePos(n: number): { cx: number; cy: number } {
  return {
    cx: H_PAD_L + (n - 1) * H_SPACING,
    cy: n % 2 === 1 ? H_YTOP : H_YBOT,
  };
}

function buildHPath(): string {
  const segs: string[] = [];
  for (let i = 1; i < 20; i++) {
    const { cx: x1, cy: y1 } = hNodePos(i);
    const { cx: x2, cy: y2 } = hNodePos(i + 1);
    const mx = (x1 + x2) / 2;
    segs.push(`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`);
  }
  return segs.join(' ');
}
const H_PATH_D = buildHPath();

function StageMapScrollable({
  selectedStageNum, chapter1Progress, onSelectStage, scrollOffset, wasDragRef, bottomOffset,
}: {
  selectedStageNum: number | null;
  chapter1Progress: number;
  onSelectStage: (n: number) => void;
  scrollOffset: number;
  wasDragRef: React.MutableRefObject<boolean>;
  bottomOffset: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0, right: 0,
        bottom: bottomOffset,
        height: SVG_HM_H + 12,
        overflow: 'hidden',
        zIndex: 55,
        pointerEvents: 'none',
      }}
    >
      <svg
        width={SVG_HM_W}
        height={SVG_HM_H}
        viewBox={`0 0 ${SVG_HM_W} ${SVG_HM_H}`}
        style={{ display: 'block', userSelect: 'none', transform: `translateX(-${Math.round(scrollOffset)}px)`, willChange: 'transform' }}
      >
        {/* Background faint path */}
        <path d={H_PATH_D} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinecap="round"/>
        {/* Thin dashed white line — original style */}
        <path d={H_PATH_D} fill="none"
          stroke="rgba(255,255,255,0.80)" strokeWidth="2.5"
          strokeDasharray="7 9" strokeLinecap="round"/>

        {Array.from({ length: 20 }, (_, i) => i + 1).map(n => {
          const { cx, cy } = hNodePos(n);
          const cleared    = n <= chapter1Progress;
          const isCurrent  = n === chapter1Progress + 1;
          const isLocked   = n > chapter1Progress + 1;
          const isSelected = selectedStageNum === n;
          const stageId    = `1-${n}`;
          const hasGems    = n % 5 === 0;

          const nodeFill   = cleared    ? 'rgba(255,255,255,0.22)'
                           : isCurrent  ? '#FFD700'
                           : 'rgba(255,255,255,0.06)';
          const nodeStroke = cleared    ? 'rgba(255,255,255,0.38)'
                           : isCurrent  ? '#FFA500'
                           : 'rgba(255,255,255,0.22)';
          const textColor  = cleared    ? 'rgba(255,255,255,0.32)'
                           : isCurrent  ? '#fff'
                           : 'rgba(255,255,255,0.22)';
          const labelY     = cy - H_R - 5;

          return (
            <g key={n}
              style={{ cursor: isLocked ? 'default' : 'pointer', pointerEvents: 'auto' }}
              onClick={() => { if (!wasDragRef.current && !isLocked) { playBtnSound(); onSelectStage(n); } }}
            >
              {/* Invisible larger hit area for easier tapping */}
              <circle cx={cx} cy={cy} r={20} fill="transparent"/>

              {/* Glow for selected / current */}
              {(isSelected || isCurrent) && (
                <circle cx={cx} cy={cy} r={18}
                  fill={isSelected ? 'rgba(255,215,0,0.18)' : 'rgba(255,215,0,0.10)'}
                  stroke={isSelected ? 'rgba(255,215,0,0.65)' : 'none'}
                  strokeWidth="1.5"
                />
              )}

              {/* Main node — small dot */}
              <circle cx={cx} cy={cy} r={H_R}
                fill={nodeFill} stroke={nodeStroke} strokeWidth="1.5"/>

              {/* Gem stage indicator */}
              {hasGems && !isLocked && (
                <polygon
                  points={`${cx},${cy-16} ${cx+5},${cy-11} ${cx},${cy-6} ${cx-5},${cy-11}`}
                  fill={cleared ? 'rgba(103,232,249,0.35)' : '#67e8f9'}
                  opacity={cleared ? 0.5 : 0.9}
                />
              )}

              {/* Checkmark for cleared */}
              {cleared && (
                <path d={`M${cx-4},${cy} L${cx-1},${cy+3} L${cx+4},${cy-3}`}
                  stroke="rgba(255,255,255,0.55)" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              )}

              {/* Lock icon for locked */}
              {isLocked && (
                <>
                  <rect x={cx-3} y={cy-1.5} width="6" height="4.5" rx="1"
                    fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
                  <path d={`M${cx-2} ${cy-1.5}v-2a2 2 0 0 1 4 0v2`}
                    stroke="rgba(255,255,255,0.28)" strokeWidth="1.2"
                    strokeLinecap="round" fill="none"/>
                </>
              )}

              {/* Stage ID label */}
              <text x={cx} y={labelY}
                textAnchor="middle"
                fill={textColor}
                fontFamily="'Roboto Condensed',sans-serif"
                fontSize="11" fontWeight="700" letterSpacing="0.5"
              >
                {stageId}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Battle Button with Canvas Fire ──────────────────────────────────────────
// Button dimensions
const BTN_W  = 164;
const BTN_H  = 68;

// Right-flush panel & button
const PANEL_R = '0px';

// ─── Fire canvas removed — replaced with plain styled button ─────────────────
function _unused() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; sz: number; wob: number };
    const pool: P[] = [];

    // Spawn zone: along bottom + left/right edges of button in canvas coords
    const bLeft  = FIRE_X;
    const bRight = FIRE_X + BTN_W;
    const bTop   = FIRE_T;
    const bBot   = CH;

    const spawn = (): P => {
      const r = Math.random();
      let x, y;
      if (r < 0.55) {
        // bottom edge — most particles
        x = bLeft + Math.random() * BTN_W;
        y = bBot - Math.random() * 3;
      } else if (r < 0.77) {
        // left edge
        x = bLeft - Math.random() * 6;
        y = bTop + Math.random() * BTN_H;
      } else {
        // right edge
        x = bRight + Math.random() * 6;
        y = bTop + Math.random() * BTN_H;
      }
      const max = 32 + Math.random() * 38;
      return { x, y, vx: (Math.random() - 0.5) * 0.9, vy: -(1.1 + Math.random() * 2.2), life: max, max, sz: 6 + Math.random() * 11, wob: Math.random() * Math.PI * 2 };
    };

    let raf: number;
    let fc = 0;

    const draw = () => {
      ctx.clearRect(0, 0, CW, CH);

      fc++;
      // Cap at 28 particles (was 55) — halves GPU overdraw on mobile
      if (pool.length < 28) {
        pool.push(spawn());
        if (Math.random() > 0.55) pool.push(spawn());
      }

      ctx.globalCompositeOperation = 'lighter';

      for (let i = pool.length - 1; i >= 0; i--) {
        const p = pool[i];
        p.wob += 0.07;
        p.x  += p.vx + Math.sin(p.wob) * 0.35;
        p.y  += p.vy;
        p.vy *= 0.985;
        p.life--;

        if (p.life <= 0) { pool.splice(i, 1); continue; }

        const t     = p.life / p.max;
        const alpha = Math.sin(t * Math.PI) * 0.68;
        const sz    = p.sz * (0.5 + t * 0.8);

        // Solid circle with additive blend — cheaper than radialGradient per frame
        const g = Math.max(0, Math.floor(t * 210));
        const b = t > 0.72 ? Math.floor((t - 0.72) / 0.28 * 90) : 0;
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = `rgb(255,${g},${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}
    />
  );
}

function BattleButton({ onToggle, open }: { onToggle: () => void; open: boolean }) {
  return (
    <div style={{ position: 'relative', width: BTN_W, height: BTN_H }}>
      <button
        onClick={() => { playBtnSound(); onToggle(); }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: BTN_W,
          height: BTN_H,
          zIndex: 1,
          background: open
            ? 'linear-gradient(180deg,#b83000 0%,#7a1800 100%)'
            : 'linear-gradient(180deg,#ff8c00 0%,#c1340a 100%)',
          border: '2.5px solid #ffd54f',
          borderRadius: 999,
          boxShadow: '0 0 22px rgba(255,140,0,0.65), 0 4px 16px rgba(0,0,0,0.8)',
          color: 'white',
          fontFamily: F,
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: '0.16em',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          transition: 'background 0.15s',
        }}
      >
        ATTACK
      </button>
    </div>
  );
}

// ─── Enemy display data ───────────────────────────────────────────────────────
const ENEMY_DEFS: Record<string, { name: string; rarity: string; heroType: string; ilust: string; rarityColor: string }> = {
  rock_slime:  { name: 'Rock Slime',  rarity: 'common', heroType: 'Tank',    rarityColor: '#22C55E',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545681/ChatGPT_Image_Apr_30_2026_05_38_28_PM_wzt4ox.png' },
  acid_slime:  { name: 'Acid Slime',  rarity: 'common', heroType: 'Ranged',  rarityColor: '#22C55E',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545738/ChatGPT_Image_Apr_30_2026_05_39_48_PM_oq2njh.png' },
  water_slime: { name: 'Water Slime', rarity: 'common', heroType: 'Support', rarityColor: '#22C55E',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png' },
};

// ─── Chapter 1 stage client-side data (display only — server has authoritative data) ─
interface StageClientData {
  name: string; recPower: number;
  enemyIds: string[];  // hero_ids to display cards for
  rewards: { exp: number; heroExp: number; gold: number; gems: number };
}
const C1_STAGE_DATA: Record<string, StageClientData> = {
  '1-1':  { name:'Slime Meadow',   recPower:300,  enemyIds:['rock_slime','acid_slime'], rewards:{exp:100,heroExp:50,gold:150,gems:0} },
  '1-2':  { name:'Rocky Path',     recPower:500,  enemyIds:['rock_slime','rock_slime','acid_slime'], rewards:{exp:100,heroExp:60,gold:200,gems:0} },
  '1-3':  { name:'Muddy Fields',   recPower:700,  enemyIds:['rock_slime','rock_slime','acid_slime','acid_slime'], rewards:{exp:100,heroExp:70,gold:250,gems:0} },
  '1-4':  { name:'Slime Pit',      recPower:900,  enemyIds:['rock_slime','rock_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:80,gold:300,gems:0} },
  '1-5':  { name:'Verdant Hollow', recPower:1100, enemyIds:['rock_slime','rock_slime','acid_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:100,gold:400,gems:5} },
  '1-6':  { name:'Swamp Border',   recPower:1400, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:110,gold:450,gems:0} },
  '1-7':  { name:'Acid Lakes',     recPower:1600, enemyIds:['rock_slime','rock_slime','acid_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:120,gold:500,gems:0} },
  '1-8':  { name:'Stone Grove',    recPower:1900, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','acid_slime'], rewards:{exp:100,heroExp:130,gold:550,gems:0} },
  '1-9':  { name:'Sour Springs',   recPower:2200, enemyIds:['rock_slime','rock_slime','acid_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:140,gold:600,gems:0} },
  '1-10': { name:'Ooze Ravine',    recPower:2500, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:160,gold:700,gems:8} },
  '1-11': { name:'Toxic Dell',     recPower:2800, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','acid_slime'], rewards:{exp:100,heroExp:170,gold:750,gems:0} },
  '1-12': { name:'Blighted Glade', recPower:3100, enemyIds:['rock_slime','rock_slime','acid_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:180,gold:800,gems:0} },
  '1-13': { name:'Crystal Fen',    recPower:3400, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:190,gold:850,gems:0} },
  '1-14': { name:'Mossy Canyon',   recPower:3800, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','acid_slime'], rewards:{exp:100,heroExp:200,gold:900,gems:0} },
  '1-15': { name:'Emerald Bog',    recPower:4200, enemyIds:['rock_slime','rock_slime','acid_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:220,gold:1000,gems:12} },
  '1-16': { name:'Slime Fortress', recPower:4600, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:240,gold:1100,gems:0} },
  '1-17': { name:'Venom Crossing', recPower:5100, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','acid_slime'], rewards:{exp:100,heroExp:260,gold:1200,gems:0} },
  '1-18': { name:'Mire Depths',    recPower:5600, enemyIds:['rock_slime','rock_slime','acid_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:280,gold:1300,gems:0} },
  '1-19': { name:'Ancient Marsh',  recPower:6200, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','acid_slime'], rewards:{exp:100,heroExp:300,gold:1400,gems:0} },
  '1-20': { name:'Slime King Lair',recPower:7000, enemyIds:['rock_slime','rock_slime','rock_slime','acid_slime','water_slime'], rewards:{exp:100,heroExp:350,gold:1600,gems:20} },
};

// Enemy card wrapper — same card as gallery, half gallery size (93×149)
function EnemyCard({ name, rarity, heroType, level, ilust, rarityColor }: {
  name: string; rarity: string; heroType: string; level: number; ilust: string; rarityColor: string;
}) {
  return (
    <div style={{ flexShrink: 0, width: 93, height: 149 }}>
      <HeroCardAnimated rarityColor={rarityColor}>
        <HeroCard name={name} rarity={rarity} level={level} ilust={ilust} heroType={heroType} />
      </HeroCardAnimated>
    </div>
  );
}

// ─── Stage Info Panel (dynamic) ───────────────────────────────────────────────
function OrangeDivider() {
  return <div style={{ width: '100%', height: 1.5, background: 'linear-gradient(90deg,transparent,#F97316,transparent)', margin: '4px 0', flexShrink: 0 }}/>;
}

function RewardItem({ label, icon, value, accent }: { label: string; icon: React.ReactNode; value: string; accent: string }) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 60 }}>
      <div style={{ fontFamily: F, fontSize: 8, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em', whiteSpace: 'nowrap', textAlign: 'center' }}>{label}</div>
      <div style={{ width: 42, height: 42, background: '#000', borderRadius: 8, border: `1.5px solid ${accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ fontFamily: F, fontSize: 10, fontWeight: 800, color: accent, letterSpacing: '0.04em', lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function StageInfoPanel({ stageId, chapter1Progress, onChallenge }: {
  stageId: string; chapter1Progress: number; onChallenge: () => void;
}) {
  const data    = C1_STAGE_DATA[stageId];
  const stageN  = parseInt(stageId.split('-')[1] ?? '1', 10);
  const cleared = stageN <= chapter1Progress;
  const locked  = stageN > chapter1Progress + 1;
  if (!data) return null;

  // Deduplicate enemy IDs for card display (unique per type)
  const uniqueEnemyIds = [...new Set(data.enemyIds)];
  // Enemy level from stage number (rough estimate for display)
  const displayLevel   = Math.max(1, Math.floor((stageN - 1) * 0.6));

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'rgba(6,3,15,0.97)',
      border: `1.5px solid ${cleared ? 'rgba(74,222,128,0.45)' : locked ? 'rgba(100,100,120,0.45)' : 'rgba(249,115,22,0.65)'}`,
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 0 28px rgba(249,115,22,0.2), 0 8px 36px rgba(0,0,0,0.9)',
    }}>
      {/* Stage header */}
      <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontFamily: FP, fontSize: 11, fontWeight: 800, color: cleared ? '#4ade80' : locked ? 'rgba(255,255,255,0.28)' : '#ffd54f', letterSpacing: '0.14em' }}>
              STAGE {stageId}
            </span>
            {cleared && <span style={{ fontFamily: F, fontSize: 9, color: '#4ade80', marginLeft: 6, letterSpacing: '0.08em' }}>✓ CLEARED</span>}
            {locked  && <span style={{ fontFamily: F, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginLeft: 6, letterSpacing: '0.08em' }}>🔒 LOCKED</span>}
          </div>
          <span style={{ fontFamily: F, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em' }}>
            PWR {data.recPower.toLocaleString()}
          </span>
        </div>
        <div style={{ fontFamily: FP, fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.88)', letterSpacing: '0.08em', marginTop: 2 }}>
          {data.name}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '8px 10px 4px' }}>
        {/* Enemy Info */}
        <div style={{ fontFamily: FP, fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.1em', marginBottom: 4, flexShrink: 0 }}>Enemy Info</div>
        <OrangeDivider />
        <div style={{ padding: '6px 0 8px', flexShrink: 0 }}>
          <PixiEnemyInfoRow
            enemies={uniqueEnemyIds.reduce<EnemyCardData[]>((acc, eid) => {
              const def = ENEMY_DEFS[eid];
              if (!def) return acc;
              acc.push({
                enemyId:   eid,
                name:      def.name,
                rarity:    def.rarity,
                heroType:  def.heroType,
                level:     displayLevel || 1,
                illustUrl: def.ilust,
                count:     data.enemyIds.filter(x => x === eid).length,
              });
              return acc;
            }, [])}
          />
        </div>

        {/* Stage Reward */}
        <div style={{ fontFamily: FP, fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.1em', marginBottom: 4, flexShrink: 0 }}>Stage Reward</div>
        <OrangeDivider />
        <div style={{ display: 'flex', flexDirection: 'row', gap: 5, overflowX: 'auto', scrollbarWidth: 'none', padding: '6px 0 8px', flexShrink: 0 }}>
          <RewardItem label="Gold" value={`+${data.rewards.gold.toLocaleString()}`} accent="#FFD700" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#D4A017"/><circle cx="12" cy="12" r="8" fill="#F5C842"/>
              <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#8B6000" fontFamily="serif">G</text>
            </svg>
          }/>
          <RewardItem label="Hero EXP" value={`+${data.rewards.heroExp}`} accent="#42A5F5" icon={
            <svg width="20" height="24" viewBox="0 0 16 20" fill="none">
              <path d="M 5,6 L 5,14 Q 5,17 8,17 Q 11,17 11,14 L 11,6 Z" fill="#fff" stroke="#ddd" strokeWidth="0.5"/>
              <path d="M 5.5,10 L 5.5,13.5 Q 5.5,16 8,16 Q 10.5,16 10.5,13.5 L 10.5,10 Z" fill="#4488ff"/>
              <rect x="6" y="3" width="4" height="3" fill="#fff" stroke="#ddd" strokeWidth="0.5"/>
              <ellipse cx="8" cy="3" rx="2.5" ry="1.2" fill="#8B4513"/>
            </svg>
          }/>
          <RewardItem label="Acct EXP" value="+100" accent="#CE93D8" icon={
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
              <polygon points="10,1 14,7 19,8 15,13 16,19 10,16 4,19 5,13 1,8 6,7" stroke="#CE93D8" strokeWidth="1.3"/>
              <polygon points="10,4 13,8 17,9 14,13 15,17 10,15 5,17 6,13 3,9 7,8" fill="#CE93D8" opacity="0.75"/>
            </svg>
          }/>
          {data.rewards.gems > 0 && (
            <RewardItem label="Gems" value={`+${data.rewards.gems}`} accent="#4DD0E1" icon={
              <svg width="22" height="24" viewBox="0 0 14 16" fill="none">
                <polygon points="7,0 14,5 7,16 0,5" fill="#1AADEE"/>
                <polygon points="7,0 14,5 7,7 0,5" fill="#5BCFFF"/>
                <polygon points="7,0 10,5 7,7 4,5" fill="#A8EEFF"/>
              </svg>
            }/>
          )}
        </div>
      </div>

      {/* Challenge / completed / locked button */}
      <div style={{ padding: '6px 10px 10px', flexShrink: 0 }}>
        {locked ? (
          <div style={{
            width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
          }}>
            <span style={{ fontFamily: FP, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em' }}>
              🔒 COMPLETE PREVIOUS STAGE
            </span>
          </div>
        ) : cleared ? (
          <div style={{
            width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(74,222,128,0.08)', border: '1.5px solid rgba(74,222,128,0.3)',
            borderRadius: 8,
          }}>
            <span style={{ fontFamily: FP, fontSize: 12, fontWeight: 700, color: '#4ade80', letterSpacing: '0.14em' }}>
              ✓ STAGE CLEARED
            </span>
          </div>
        ) : (
          <button
            onClick={() => { playBtnSound(); onChallenge(); }}
            style={{
              width: '100%', height: 40, flexShrink: 0,
              background: 'linear-gradient(180deg,#b84200 0%,#6e1a00 100%)',
              border: '1.5px solid #ffd54f', borderRadius: 8, cursor: 'pointer',
              position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(255,213,79,0.65),transparent)', pointerEvents: 'none' }}/>
            <span style={{ fontFamily: FP, fontSize: 13, fontWeight: 800, color: '#ffd54f', letterSpacing: '0.14em' }}>CHALLENGE</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Formation constants ─────────────────────────────────────────────────────
// (formation slot sizes defined in ROW_DATA below)

// Rarity → card accent colour
const RARITY_COLOR: Record<string, string> = {
  mythic: '#E00000', legendary: '#FB923C', epic: '#A855F7', rare: '#1877F2', common: '#22C55E',
};

// ─── Team sprite config ─────────────────────────────────────────────────────
// Keys MUST match hero_defs.name (display names stored in heroSlots)
const TEAM_SPRITE_CONFIG: Record<string, { src: string; chromaKey: boolean; flipX: boolean }> = {
  'Lucas': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630336/idle_luk_mobysy.png',
    chromaKey: true, flipX: false,
  },
  'Emma': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630434/idle_em_p8uxjs.png',
    chromaKey: true, flipX: false,
  },
  // Slimes — green screen, chroma key client-side; images face RIGHT (no flip for team side)
  'Rock Slime': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777634810/Gemini_Generated_Image_c7qsl1c7qsl1c7qs_mekkjz.png',
    chromaKey: true, flipX: false,
  },
  'Acid Slime': {
    // White background → Cloudinary e_background_removal (no client chroma key)
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634782/ChatGPT_Image_May_1_2026_06_25_59_PM_dsoxsd.png',
    chromaKey: false, flipX: false,
  },
  'Water Slime': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777907811/7d3947a5-76a6-4422-9dc6-1eb5fd4d29bd.png',
    chromaKey: true, flipX: false,
  },
  // Gorr — green screen, faces right (team side), flip for enemy side
  'Gorr': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919607/ChatGPT_Image_May_5_2026_01_23_54_AM_nhkzmq.png',
    chromaKey: true, flipX: false,
  },
  // Craw — green screen, faces right (team side), flip for enemy side
  'Craw': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919783/ChatGPT_Image_May_5_2026_01_26_59_AM_zfdewm.png',
    chromaKey: true, flipX: false,
  },
  // Myko — green screen, mushroom tank, faces right (team side)
  'Myko': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005026/ChatGPT_Image_May_6_2026_01_01_00_AM_bhjzhr.png',
    chromaKey: true, flipX: false,
  },
  // Fang — killer rabbit assassin, green screen
  'Fang': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058539/ChatGPT_Image_May_6_2026_03_43_22_PM_ejhf1t.png',
    chromaKey: true, flipX: false,
  },
  // Clover — bunny support mage, green screen
  'Clover': {
    src: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058829/ChatGPT_Image_May_6_2026_03_57_38_PM_jwipj1.png',
    chromaKey: true, flipX: false,
  },
};

// (BATTLE_SPRITES merged into TEAM_SPRITE_CONFIG above)

// ── Human-type heroes: use battle-idle-breathe + tall sprite (180×338) ────────
// Any hero NOT listed here is treated as a slime → compact 150×150 + slime-bounce.
// ADD new human heroes here whenever they are introduced.
const HUMAN_HERO_NAMES = new Set(['Lucas', 'Emma', 'Gorr', 'Craw', 'Myko', 'Fang', 'Clover']);
// Myko uses reduced sprite size (height −50%, width −25%)
const MYKO_W = 135; // 180 × 0.75
const MYKO_H = 169; // 338 × 0.50

// ── Inject battle-idle CSS once into document.head ────────────────────────────
// ROOT FIX: two separate @keyframes both targeting `transform` = last one
// silently kills the first (CSS animation spec: last-listed wins per property).
// ONE combined keyframe solves this. Injected via document.head so it is
// guaranteed in the global cascade regardless of React render order / HMR.
function ensureBattleIdleCss() {
  if (typeof document === 'undefined') return;
  // Always update textContent so HMR picks up changes
  let s = document.getElementById('battle-idle-css') as HTMLStyleElement | null;
  if (!s) {
    s = document.createElement('style');
    s.id = 'battle-idle-css';
    document.head.appendChild(s);
  }
  // No translateY — position is fixed. Pure scaleY from bottom anchor.
  // Sisi bawah diam sebagai anchor, gambar stretch halus ke atas lalu kembali.
  s.textContent = `
@keyframes battle-idle {
  0%, 100% { transform: scaleY(1.000) scaleX(1.000); }
  40%, 60% { transform: scaleY(1.022) scaleX(0.991); }
}
.battle-idle-breathe {
  animation: battle-idle 3.8s ease-in-out infinite;
  transform-origin: center bottom;
  will-change: transform;
  display: block;
}
@keyframes slime-bounce {
  0%, 100% { transform: translateY(0)    scaleX(1.00) scaleY(1.00); }
  40%       { transform: translateY(-14px) scaleX(0.91) scaleY(1.09); }
  55%       { transform: translateY(-16px) scaleX(0.90) scaleY(1.10); }
  80%       { transform: translateY(2px)   scaleX(1.05) scaleY(0.95); }
}
.slime-bounce {
  animation: slime-bounce 1.7s ease-in-out infinite;
  transform-origin: center bottom;
  will-change: transform;
  display: block;
}`;
}
ensureBattleIdleCss();

// ─── Sprite renders OUTSIDE its slot — slot is footpad, body towers above ─────
// Size: 240��450px (1.5× the previous 160×300). Feet sit at slot bottom;
// character crown is ~330px above the slot's top edge. Game-accurate scale.
// ─── Team sprite — Lucas/Emma via chroma key; slimes use bg-removed Cloudinary URLs ──
function BattleSlotSprite({ heroName }: { heroName: string }) {
  const cfg = TEAM_SPRITE_CONFIG[heroName];
  // Always call hook — pass '' for non-chroma so hook returns null immediately
  const chromaUrl = useChromaKeyDataUrl(cfg?.chromaKey ? (cfg?.src ?? '') : '');
  const finalSrc  = cfg?.chromaKey ? chromaUrl : (cfg?.src ?? null);
  // Slimes use compact 150×150 + slime-bounce; humans use tall 180×338 + battle-idle-breathe
  const isSlime   = Boolean(cfg) && !HUMAN_HERO_NAMES.has(heroName);
  const isMyko    = heroName === 'Myko';
  const w = isSlime ? 150 : isMyko ? MYKO_W : 180;
  const h = isSlime ? 150 : isMyko ? MYKO_H : 338;

  return (
    <div style={{
      position: 'absolute',
      bottom: isSlime ? 0 : -4,
      left: '50%',
      transform: `translateX(-50%)${cfg?.flipX ? ' scaleX(-1)' : ''}`,
      width: w,
      height: h,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      {finalSrc ? (
        <img
          src={finalSrc}
          alt={heroName}
          draggable={false}
          className={isSlime ? 'slime-bounce' : 'battle-idle-breathe'}
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom' }}
        />
      ) : (
        <div style={{ position: 'absolute', bottom: 0, left: '10%', width: '80%', height: '70%', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}/>
      )}
    </div>
  );
}

// ─── Enemy sprite map ─────────────────���───────────────────────────────────────
// Rock/Water = green-screen → client-side chroma key
// Acid       = white bg     → Cloudinary e_background_removal (no chroma key)
const ENEMY_SPRITES: Record<string, string> = {
  RockSlime:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777634810/Gemini_Generated_Image_c7qsl1c7qsl1c7qs_mekkjz.png',
  AcidSlime:  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634782/ChatGPT_Image_May_1_2026_06_25_59_PM_dsoxsd.png',
  WaterSlime: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777907811/7d3947a5-76a6-4422-9dc6-1eb5fd4d29bd.png',
  // Human heroes on enemy side — same idle URL; CSS scaleX(-1) flips to face left
  Myko:   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005026/ChatGPT_Image_May_6_2026_01_01_00_AM_bhjzhr.png',
  Fang:   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058539/ChatGPT_Image_May_6_2026_03_43_22_PM_ejhf1t.png',
  Clover: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058829/ChatGPT_Image_May_6_2026_03_57_38_PM_jwipj1.png',
};
// Slimes that use Cloudinary bg-removal instead of client chroma key
const BGREMOVE_SLIMES = new Set(['AcidSlime']);

// Enemy sprite — flipped LEFT to face the hero team
function EnemySlotSprite({ enemyName }: { enemyName: string }) {
  const rawSrc    = ENEMY_SPRITES[enemyName] ?? '';
  const needsChroma = !BGREMOVE_SLIMES.has(enemyName);
  const chromaUrl = useChromaKeyDataUrl(needsChroma ? rawSrc : '');
  const finalSrc  = needsChroma ? (chromaUrl ?? '') : rawSrc;
  // Myko enemy: 50% height, 25% width reduction. Human heroes use battle-idle-breathe.
  const isMyko = enemyName === 'Myko';
  const isHumanEnemy = ['Fang', 'Clover'].includes(enemyName);
  const w = isMyko ? 135 : 180;
  const h = isMyko ? 90  : 180;
  const animCls = (isMyko || isHumanEnemy) ? 'battle-idle-breathe' : 'slime-bounce';
  return (
    <div style={{
      position: 'absolute', bottom: isMyko || isHumanEnemy ? -2 : 4, left: '50%',
      transform: 'translateX(-50%) scaleX(-1)',
      width: w, height: h,
      pointerEvents: 'none', zIndex: 10,
    }}>
      {finalSrc && (
        <img src={finalSrc} alt={enemyName} draggable={false} className={animCls}
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom' }}
        />
      )}
    </div>
  );
}

// ─── Formation Grid ───────────────────────────────────────────────────────────
// Each slot is a TRAPEZOID (wide bottom, narrow top) rendered as SVG polygon.
// CONNECTED layout: each row's top-edge aligns with the row-above's bottom-edge
//   → col0 left/right: continuous / and \ lines across all 3 rows.
//
// Width chain (user spec):
//   bot-bottom=120, bot-top=mid-bottom=86, mid-top=top-bottom=60, top-top=30
//   trapOffset = (slotW - trapTopW) / 2
//
// col0 startX: row2→0, row1→17(+off_row2), row0→30(+off_row1)
// col1 startX: row2→248(120+128gap), row1→265(+17), row0→278(+13)
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW: 60,  slotH: 60,  off: 15, col0X: 30,  col1X: 278, y: 8   }, // rowIdx 0 top/far
  { slotW: 86,  slotH: 86,  off: 13, col0X: 17,  col1X: 265, y: 82  }, // rowIdx 1 mid
  { slotW: 120, slotH: 120, off: 17, col0X: 0,   col1X: 248, y: 190 }, // rowIdx 2 bot/near
] as const;

function FormationGrid({ side, heroSlots, onSlotClick }: {
  side: 'hero' | 'enemy';
  heroSlots?: (string | null)[];
  onSlotClick?: (i: number) => void;
}) {
  const isHero = side === 'hero';

  return (
    <div style={{ position: 'relative', width: GRID_W, height: GRID_H, overflow: 'visible' }}>
      {Array.from({ length: 6 }).map((_, i) => {
        const assigned = heroSlots?.[i] ?? null;
        const colIdx  = i % 2;
        const rowIdx  = Math.floor(i / 2); // 0=top, 1=mid, 2=bot
        const isFront = isHero ? (colIdx === 1) : (colIdx === 0);
        const rowZ    = rowIdx * 2 + (isFront ? 2 : 1);
        const row     = ROW_DATA[rowIdx];
        const slotX   = colIdx === 0 ? row.col0X : row.col1X;

        // SVG polygon colours
        const fillClr = assigned ? (isHero ? 'rgba(10,28,12,0.88)' : 'rgba(28,8,8,0.88)')
                                 : (isHero ? 'rgba(30,200,80,0.07)' : 'rgba(220,50,30,0.07)');
        const strkClr = assigned ? (isHero ? 'rgba(80,220,120,0.60)' : 'rgba(220,80,60,0.60)')
                                 : (isHero ? 'rgba(80,220,120,0.32)' : 'rgba(220,80,60,0.32)');

        // Trapezoid: wide at bottom (y=slotH), narrow at top (y=0)
        const pts    = `${row.off},0 ${row.slotW - row.off},0 ${row.slotW},${row.slotH} 0,${row.slotH}`;
        const iconSz = Math.round(row.slotW * 0.30);

        return (
          <div key={i}
            onClick={() => isHero && onSlotClick?.(i)}
            style={{ position: 'absolute', left: slotX, top: row.y, width: row.slotW, height: row.slotH, overflow: 'visible', zIndex: rowZ, cursor: isHero ? 'pointer' : 'default' }}
          >
            {/* Trapezoid fill + stroke rendered as SVG polygon */}
            <svg width={row.slotW} height={row.slotH}
              style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}>
              <polygon points={pts} fill={fillClr} stroke={strkClr} strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>

            {/* Slot number — inside visible top area (offset by trapezoid inset) */}
            <div style={{ position: 'absolute', top: 3, left: row.off + 4, zIndex: 2, fontFamily: F, fontSize: Math.max(8, Math.round(row.slotW * 0.09)), fontWeight: 700, color: isHero ? 'rgba(80,220,120,0.45)' : 'rgba(220,80,60,0.40)', pointerEvents: 'none' }}>{i + 1}</div>

            {/* Ground-glow when occupied */}
            {assigned && (
              <div style={{
                position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)',
                width: Math.round(row.slotW * 0.55), height: 8, borderRadius: '50%',
                background: isHero
                  ? 'radial-gradient(ellipse, rgba(40,220,100,0.38) 0%, transparent 70%)'
                  : 'radial-gradient(ellipse, rgba(220,80,60,0.32) 0%, transparent 70%)',
                pointerEvents: 'none', zIndex: 1,
              }}/>
            )}

            {assigned ? (
              isHero ? <BattleSlotSprite heroName={assigned}/> : <EnemySlotSprite enemyName={assigned}/>
            ) : (
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
                <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="4"
                    stroke={isHero ? 'rgba(80,220,120,0.22)' : 'rgba(220,80,60,0.22)'}
                    strokeWidth="1.5" strokeDasharray="3 3"/>
                  <line x1="8" y1="12" x2="16" y2="12"
                    stroke={isHero ? 'rgba(80,220,120,0.22)' : 'rgba(220,80,60,0.22)'}
                    strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="12" y1="8" x2="12" y2="16"
                    stroke={isHero ? 'rgba(80,220,120,0.22)' : 'rgba(220,80,60,0.22)'}
                    strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Fullscreen Hero Deploy Overlay — shown when player taps an empty slot ────
const RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'common'];

function HeroDeployOverlay({ occupiedNames, onSelect, onClose }: {
  occupiedNames: string[];
  onSelect: (heroName: string) => void;
  onClose: () => void;
}) {
  const { ownedHeroes, isLoading } = useHero();
  const [rarityFilter, setRarityFilter] = useState<string>('ALL');

  const sorted = [...ownedHeroes].sort((a, b) =>
    RARITY_ORDER.indexOf(a.def.rarity) - RARITY_ORDER.indexOf(b.def.rarity)
  );
  const filtered = rarityFilter === 'ALL'
    ? sorted
    : sorted.filter(h => h.def.rarity === rarityFilter);

  const filterTabs = [
    { key: 'ALL', label: 'ALL', color: 'rgba(255,255,255,0.7)' },
    { key: 'mythic',    label: 'SS', color: '#f87171' },
    { key: 'legendary', label: 'S',  color: '#fbbf24' },
    { key: 'epic',      label: 'A',  color: '#a78bfa' },
    { key: 'rare',      label: 'B',  color: '#60a5fa' },
    { key: 'common',    label: 'C',  color: '#4ade80' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.96)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontFamily: FP, fontSize: 14, fontWeight: 800, color: 'rgba(255,215,0,0.9)', letterSpacing: '0.2em' }}>
          SELECT HERO
        </span>
        <button onClick={() => { playBackSound(); onClose(); }} style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
          color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}>✕</button>
      </div>

      {/* Rarity filter tabs */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 6, padding: '8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {filterTabs.map(({ key, label, color }) => {
          const active = rarityFilter === key;
          return (
            <button key={key} onClick={() => { playBtnSound(); setRarityFilter(key); }} style={{
              flexShrink: 0, padding: '5px 14px', borderRadius: 999,
              background: active ? `${color}22` : 'rgba(0,0,0,0.4)',
              border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
              color: active ? color : 'rgba(255,255,255,0.45)',
              fontFamily: F, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
              cursor: 'pointer',
            }}>{label}</button>
          );
        })}
      </div>

      {/* Hero card grid — PixiJS WebGL, 5 per row, vertical scroll */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: F, fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>
          Loading heroes…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: F, fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>
          No heroes
        </div>
      ) : (
        <PixiDeployGrid
          heroes={filtered.map(({ playerHero: ph, def }): DeployHeroData => ({
            heroId:    ph.hero_id,
            name:      def.name,
            rarity:    def.rarity,
            heroType:  def.hero_type,
            level:     ph.level,
            stars:     ph.stars ?? 1,
            illustUrl: getHeroIlust(ph.hero_id) ?? def.illust_url ?? '',
            deployed:  occupiedNames.includes(def.name),
          }))}
          onCardClick={(heroId) => {
            const oh = filtered.find(h => h.playerHero.hero_id === heroId);
            if (!oh || occupiedNames.includes(oh.def.name)) return;
            playCardSound();
            onSelect(oh.def.name);
          }}
        />
      )}
    </div>
  );
}

// ─── Battle View ─��────────────────────────────────────────────────────────────
// Enemy slot key → sprite map key (hero_id → ENEMY_SPRITES key)
const HERO_ID_TO_SPRITE: Record<string, string> = {
  rock_slime:  'RockSlime',
  acid_slime:  'AcidSlime',
  water_slime: 'WaterSlime',
  myko:        'Myko',
  fang:        'Fang',
  clover:      'Clover',
};

function BattleView({ onBack, stageId = '1-1', onStageWin }: {
  onBack: () => void; stageId?: string; onStageWin?: () => void;
}) {
  const { loadStage, ownedHeroes } = useHero();
  const { gainExp, refreshProfile } = useAuth();
  const [phase,              setPhase]             = useState<'formation' | 'simulating' | 'battle'>('formation');
  const [heroSlots,          setHeroSlots]         = useState<(string | null)[]>(Array(6).fill(null));
  const [deployOverlaySlot,  setDeployOverlaySlot] = useState<number | null>(null);
  const [maxMsg,             setMaxMsg]             = useState(false);
  const [stageEnemies,       setStageEnemies]      = useState<StageEnemyFull[]>([]);
  const [battleLog,          setBattleLog]         = useState<SimBattleResult | null>(null);
  const [simError,           setSimError]          = useState<string | null>(null);

  // Load stage enemy data from DB
  useEffect(() => {
    loadStage(stageId).then(data => {
      if (data) setStageEnemies(data.enemies);
    });
  }, [stageId, loadStage]);

  // Build enemySlots from DB data (slot_position = formation slot index 0-5)
  const enemySlots: (string | null)[] = Array(6).fill(null);
  for (const se of stageEnemies) {
    const spriteKey = HERO_ID_TO_SPRITE[se.enemy.enemy_hero_id];
    if (spriteKey && se.enemy.slot_position >= 0 && se.enemy.slot_position < 6) {
      enemySlots[se.enemy.slot_position] = spriteKey;
    }
  }

  // ── Trigger full server-side simulation — one RPC call, entire battle ────────
  const handleStartBattle = async () => {
    const heroEntries = heroSlots
      .map((name, idx) => {
        if (!name) return null;
        const owned = ownedHeroes.find(o => o.def.name === name);
        if (!owned) return null;
        return { hero_id: owned.def.hero_id, slot_index: idx };
      })
      .filter((e): e is { hero_id: string; slot_index: number } => e !== null);

    if (!heroEntries.length) return;

    setSimError(null);
    setPhase('simulating'); // show loading screen while server runs full simulation

    const { data, error } = await simulateBattle(stageId, heroEntries);

    if (error || !data) {
      console.error('[Battle] simulateBattle RPC error:', error);
      setSimError(error ?? 'Unknown server error');
      setPhase('formation');
      return;
    }

    // Server returned complete battle log — hand it to BattlePlayback
    setBattleLog(data);
    pauseMainBgm();   // mute main BGM before battle
    setPhase('battle');
  };

  const deployedCount = heroSlots.filter(Boolean).length;

  const handleSlotClick = (i: number) => {
    if (heroSlots[i]) {
      // Occupied slot → remove hero
      playBtnSound();
      setHeroSlots(prev => { const n = [...prev]; n[i] = null; return n; });
    } else {
      // Empty slot → try to deploy
      if (deployedCount >= 5) {
        setMaxMsg(true);
        setTimeout(() => setMaxMsg(false), 2000);
      } else {
        playBtnSound();
        setDeployOverlaySlot(i);
      }
    }
  };

  const handleDeploySelect = (heroName: string) => {
    if (deployOverlaySlot === null) return;
    setHeroSlots(prev => {
      const next = [...prev];
      next[deployOverlaySlot] = heroName;
      return next;
    });
    setDeployOverlaySlot(null);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, overflow: 'hidden' }}>
      {/* Background always visible */}
      <img src={BATTLE_BG_URL} alt="" draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center bottom', display: 'block', pointerEvents: 'none' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }}/>

      {/* ══ FORMATION PHASE — all UI visible ══ */}
      {phase === 'formation' && (
        <>
          {/* Back button */}
          <button onClick={() => { playBackSound(); onBack(); }} style={{
            position: 'absolute', top: 18, left: 16, zIndex: 20,
            background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
            color: 'rgba(255,255,255,0.85)', fontFamily: F, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
            padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
              <path d="M5.5 1L1.5 5.5l4 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>

          {/* Header bar: YOUR TEAM · SET FORMATION · ENEMIES */}
          <div style={{
            position: 'absolute', top: 'clamp(52px,9dvh,68px)', left: 0, right: 0,
            height: 36, display: 'flex', alignItems: 'stretch', zIndex: 12,
          }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center',
              background: 'linear-gradient(90deg, rgba(0,0,0,0.4) 65%, transparent 100%)',
              paddingLeft: 16, overflow: 'hidden',
            }}>
              <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, color: 'rgba(80,220,120,0.92)', letterSpacing: '0.2em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>YOUR TEAM</span>
            </div>
            <div style={{ flexShrink: 0, padding: '0 18px', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: FP, fontSize: 13, fontWeight: 800, color: 'rgba(255,215,0,0.92)', letterSpacing: '0.24em', textShadow: '0 2px 12px rgba(0,0,0,0.95)', whiteSpace: 'nowrap' }}>SET FORMATION</span>
            </div>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              background: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.4) 35%)',
              paddingRight: 16, overflow: 'hidden',
            }}>
              <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, color: 'rgba(220,80,60,0.92)', letterSpacing: '0.2em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>ENEMIES</span>
            </div>
          </div>

          {/* Formation field with slot trapezoids */}
          <div style={{ position: 'absolute', top: 'clamp(98px,17dvh,128px)', bottom: 0, left: 0, right: 0 }}>
            <div style={{ position: 'absolute', left: 12, bottom: 0, overflow: 'visible' }}>
              <FormationGrid side="hero" heroSlots={heroSlots} onSlotClick={handleSlotClick}/>
            </div>
            <div style={{ position: 'absolute', left: '50%', bottom: 48, transform: 'translateX(-50%)', pointerEvents: 'none' }}>
              <div style={{ fontFamily: FP, fontSize: 30, fontWeight: 900, color: 'rgba(255,60,60,0.85)', letterSpacing: '0.08em', textShadow: '0 0 22px rgba(255,60,60,0.55), 0 2px 10px rgba(0,0,0,0.95)' }}>VS</div>
            </div>
            <div style={{ position: 'absolute', right: 12, bottom: 0, overflow: 'visible' }}>
              <FormationGrid side="enemy" heroSlots={enemySlots}/>
            </div>
          </div>

          {/* START BATTLE button — z:60 so it's always above slots/sprites */}
          <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 60 }}>
            <button onClick={() => { playStartBattleSound(); handleStartBattle(); }} style={{
              height: 48, padding: '0 44px',
              background: 'linear-gradient(180deg,#e05000 0%,#8a1e00 100%)',
              border: '2px solid #ffd54f', borderRadius: 999,
              color: '#ffd54f', fontFamily: FP, fontSize: 14, fontWeight: 800, letterSpacing: '0.18em',
              cursor: 'pointer', position: 'relative', overflow: 'hidden', zIndex: 60,
              boxShadow: '0 0 22px rgba(255,120,0,0.45), 0 4px 16px rgba(0,0,0,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(255,213,79,0.7),transparent)', pointerEvents: 'none' }}/>
              START BATTLE
            </button>
            {simError && (
              <div style={{ fontFamily: F, fontSize: 10, color: '#f87171', letterSpacing: '0.06em', textAlign: 'center', maxWidth: 280, padding: '4px 8px', background: 'rgba(239,68,68,0.12)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)' }}>
                {simError}
              </div>
            )}
          </div>

          {/* MAX DEPLOYED message — no overlay, just centered text */}
          {maxMsg && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 80, pointerEvents: 'none',
              fontFamily: FP, fontSize: 'clamp(12px,2.5vw,18px)', fontWeight: 800,
              color: '#fbbf24', letterSpacing: '0.12em', textAlign: 'center',
              textShadow: '0 0 20px rgba(251,191,36,0.7), 0 2px 10px rgba(0,0,0,0.95)',
              animation: 'bp-tap-pulse 0.6s ease-out',
            }}>
              Jumlah Hero yang di deploy sudah max
            </div>
          )}

          {/* Fullscreen hero deploy overlay */}
          {deployOverlaySlot !== null && (
            <HeroDeployOverlay
              occupiedNames={heroSlots.filter((s): s is string => !!s)}
              onSelect={handleDeploySelect}
              onClose={() => setDeployOverlaySlot(null)}
            />
          )}
        </>
      )}

      {/* ══ SIMULATING PHASE — server is computing the full battle ══ */}
      {phase === 'simulating' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 20 }}>
          {/* Pulsing swords icon */}
          <div style={{ position: 'relative', width: 72, height: 72 }}>
            <svg viewBox="0 0 72 72" width="72" height="72" style={{ position: 'absolute', inset: 0, animation: 'bp-tap-pulse 1.2s ease-in-out infinite' }}>
              <circle cx="36" cy="36" r="34" fill="none" stroke="rgba(249,115,22,0.30)" strokeWidth="2"/>
              <circle cx="36" cy="36" r="26" fill="rgba(249,115,22,0.08)" stroke="rgba(249,115,22,0.55)" strokeWidth="1.5"/>
              {/* crossed swords */}
              <line x1="20" y1="20" x2="52" y2="52" stroke="#F97316" strokeWidth="3" strokeLinecap="round"/>
              <line x1="52" y1="20" x2="20" y2="52" stroke="#F97316" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="20" cy="20" r="4" fill="#fbbf24"/>
              <circle cx="52" cy="20" r="4" fill="#fbbf24"/>
            </svg>
          </div>
          {/* Label */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontFamily: FP, fontSize: 'clamp(14px,4vw,20px)', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.22em', textTransform: 'uppercase', textShadow: '0 0 20px rgba(251,191,36,0.65)' }}>
              SIMULATING BATTLE
            </div>
            <div style={{ fontFamily: F, fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em' }}>
              Server is computing full battle…
            </div>
          </div>
          {/* Animated dots */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#F97316',
                animation: `bp-tap-pulse 1.2s ease-in-out ${i * 0.3}s infinite`,
              }}/>
            ))}
          </div>
        </div>
      )}

      {/* ══ BATTLE PHASE — BattlePlayback replays server log, zero client logic ══ */}
      {phase === 'battle' && battleLog && (
        <div style={{ position: 'absolute', top: 'clamp(98px,17dvh,128px)', bottom: 0, left: 0, right: 0 }}>
          <BattlePlayback
            battleLog={battleLog}
            onVictory={async () => {
              // Apply all battle rewards atomically — EXP (with level-up cascade),
              // gold, gems, hero_exp — all in a single awaited upsertProfile call.
              if (battleLog?.rewards) {
                const r = battleLog.rewards;
                await gainExp(r.exp, {
                  gold:     r.gold,
                  gems:     r.gems,
                  hero_exp: r.hero_exp,
                });
              }
              // Sync chapter1_progress from DB (battle RPC already wrote the new value).
              // Also catches any stale level/xp in DB via hydrateLevelState cascade.
              // Fire-and-forget: don't block UI transition on network round-trip.
              refreshProfile();
              onStageWin?.();
              setBattleLog(null);
              setPhase('formation');
              resumeMainBgm();
            }}
            onDefeat={() => { setBattleLog(null); setPhase('formation'); resumeMainBgm(); }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Chapter 1 Stage Map View ─────────────────────────────────────────────────
// Attack-button sits at bottom: NAV_H from screen bottom.
// Stage map strip sits at MAP_BOTTOM px from screen bottom (just above fire flames).
const NAV_H      = 64;   // approx nav-bar height
const MAP_BOTTOM = BTN_H + NAV_H + 18; // button + nav + gap → 150 px

function Chapter1View({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const chapter1Progress = user?.chapter1_progress ?? 0;

  const [selectedStageNum, setSelectedStageNum] = useState<number>(
    Math.min(chapter1Progress + 1, 20),
  );
  const [showPanel, setShowPanel]       = useState(false);
  const [battleStageId, setBattleStageId] = useState<string | null>(null);

  // ── Drag-to-scroll state ──────────────────────────────────────────────────
  const [mapScrollOffset, setMapScrollOffset] = useState<number>(() => {
    const n = Math.min(chapter1Progress + 1, 20);
    const { cx } = hNodePos(n);
    const sw = typeof window !== 'undefined' ? window.innerWidth : 375;
    return Math.max(0, cx - sw * 0.38);
  });
  const dragState  = useRef({ active: false, startX: 0, startOffset: 0 });
  const wasDragRef = useRef(false);

  // Auto-scroll when a node is selected
  useEffect(() => {
    const { cx } = hNodePos(selectedStageNum);
    const sw = window.innerWidth;
    const maxOff = SVG_HM_W - sw;
    const target = Math.max(0, Math.min(maxOff, cx - sw * 0.38));
    setMapScrollOffset(target);
  }, [selectedStageNum]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { active: true, startX: e.clientX, startOffset: mapScrollOffset };
    wasDragRef.current = false;
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const dx = e.clientX - dragState.current.startX;
    if (Math.abs(dx) > 5) {
      wasDragRef.current = true;
      const maxOff = SVG_HM_W - window.innerWidth;
      setMapScrollOffset(Math.max(0, Math.min(maxOff, dragState.current.startOffset - dx)));
    }
  };
  const handlePointerUp = () => { dragState.current.active = false; };

  const selectedStageId  = `1-${selectedStageNum}`;
  const isSelectedLocked = selectedStageNum > chapter1Progress + 1;

  if (battleStageId) {
    return (
      <BattleView
        onBack={() => setBattleStageId(null)}
        stageId={battleStageId}
        onStageWin={() => setBattleStageId(null)}
      />
    );
  }

  return (
    // Root div captures drag everywhere except excluded zones (attack btn, nav, resource bar)
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, cursor: wasDragRef.current ? 'grabbing' : 'default' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >

      {/* ── Background ── */}
      <img src={GRASS_URL} alt="" draggable={false} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'center',
        display: 'block', pointerEvents: 'none', userSelect: 'none',
      }}/>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.54)', pointerEvents: 'none' }}/>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.55) 0%,transparent 22%,transparent 52%,rgba(0,0,0,0.78) 100%)', pointerEvents: 'none' }}/>

      {/* ── Back button — top left ── */}
      <button
        onClick={() => { playBackSound(); onBack(); }}
        onPointerDown={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 10, left: 14, zIndex: 70,
          background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, color: 'rgba(255,255,255,0.85)',
          fontFamily: F, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          padding: '7px 13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M5.5 1L1.5 5.5l4 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>

      {/* ── Chapter title — below resource bar ── */}
      <div style={{
        position: 'absolute',
        top: 'clamp(52px,9dvh,68px)',
        left: 0, right: 0,
        zIndex: 60, textAlign: 'center', pointerEvents: 'none',
      }}>
        <div style={{ fontFamily: FP, fontSize: 'clamp(13px,2vw,19px)', fontWeight: 800, color: 'rgba(255,255,255,0.96)', letterSpacing: '0.22em', textShadow: '0 2px 14px rgba(0,0,0,0.95)' }}>
          CHAPTER I
        </div>
        <div style={{ fontFamily: F, fontSize: 'clamp(9px,1.3vw,12px)', color: 'rgba(180,250,100,0.85)', letterSpacing: '0.2em', marginTop: 1, textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
          GRASSLANDS
        </div>
      </div>

      {/* ── Horizontal stage map — just above attack button ── */}
      <StageMapScrollable
        selectedStageNum={selectedStageNum}
        chapter1Progress={chapter1Progress}
        onSelectStage={(n) => { setSelectedStageNum(n); setShowPanel(false); }}
        scrollOffset={mapScrollOffset}
        wasDragRef={wasDragRef}
        bottomOffset={MAP_BOTTOM}
      />

      {/* ── ATTACK button — bottom right, stop drag propagation ── */}
      <div
        onPointerDown={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          right: PANEL_R,
          bottom: NAV_H,
          zIndex: 66,
          opacity: isSelectedLocked ? 0.3 : 1,
          pointerEvents: isSelectedLocked ? 'none' : 'auto',
          transition: 'opacity 0.2s',
        }}
      >
        <BattleButton open={showPanel} onToggle={() => setShowPanel(p => !p)} />
      </div>

      {/* ── Enemy info panel — right side, full height, 25 vw wide ── */}
      {showPanel && (
        <>
          {/* Dim backdrop — tap to close */}
          <div
            onPointerDown={e => e.stopPropagation()}
            onClick={() => setShowPanel(false)}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.55)',
              zIndex: 67,
            }}
          />
          {/* Panel — right edge, full height, 1/4 screen wide */}
          <div
            onPointerDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '25vw',
              minWidth: 220,
              zIndex: 68,
              overflow: 'hidden',
              borderLeft: '1.5px solid rgba(249,115,22,0.5)',
            }}
          >
            <StageInfoPanel
              stageId={selectedStageId}
              chapter1Progress={chapter1Progress}
              onChallenge={() => {
                setShowPanel(false);
                setBattleStageId(selectedStageId);
              }}
            />
          </div>
        </>
      )}

      <GamePageLayout activeTab={undefined} hidePlayerInfo hideDropdown />
    </div>
  );
}

// ─── Main ────────────────────────────────────────────��────────────────────────
export default function AdventurePage() {
  const [chapterView, setChapterView] = useState<number | null>(null);

  if (chapterView === 1) {
    return <Chapter1View onBack={() => setChapterView(null)} />;
  }

  return <WorldMapView onChapterSelect={setChapterView} />;
}