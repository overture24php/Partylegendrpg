/**
 * HeroDetailView — full-screen overlay showing hero detail stats + action tabs.
 * Center area shows a static floating hero card (no sprite animation).
 */

import { useState, useEffect, useRef } from 'react';
import { useChromaKeyDataUrl } from '../utils/chromaKey';
import { HeroCardAnimated } from './HeroCardAnimated';
import { GamePageLayout } from './GamePageLayout';

// ─── Number formatter K / M / B ───
function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${+(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}



// ─── Floating Hero Card (replaces sprite player) ──────────────────────────────
function FloatingHeroCard({
  name, rarity, rarityColor, rarityShine, level, ilust,
}: { name: string; rarity: string; rarityColor: string; rarityShine: string; level: number; ilust: string }) {
  const RARITIES: Record<string, { border: string; fill: string; shine: string; text: string; stars: number }> = {
    mythic:    { border:'#450A0A', fill:'#E00000', shine:'#FCA5A5', text:'SS', stars:5 },
    legendary: { border:'#78350F', fill:'#FB923C', shine:'#FED7AA', text:'S',  stars:4 },
    epic:      { border:'#3B0764', fill:'#A855F7', shine:'#D8B4FE', text:'A',  stars:3 },
    rare:      { border:'#1E3A5F', fill:'#1877F2', shine:'#93C5FD', text:'B',  stars:2 },
    common:    { border:'#14532D', fill:'#22C55E', shine:'#86EFAC', text:'C',  stars:1 },
  };
  const cfg       = RARITIES[rarity] ?? RARITIES.rare;
  const chromaUrl = useChromaKeyDataUrl(ilust);
  const clipId    = `fhc-clip-${name}`;
  const tgId      = `fhc-tg-${name}`;
  const barId     = `fhc-bar-${name}`;
  const botId     = `fhc-bot-${name}`;
  const RS_R = 14, RS_r = 5.3, RS_CY = 338, RS_X0 = 24, RS_STEP = 32;
  const sx = cfg.text === 'SS' ? 210 : 218;
  const sy = 321;
  const starPath = `M ${sx},${sy-28} Q ${sx+5},${sy-5} ${sx+28},${sy} Q ${sx+5},${sy+5} ${sx},${sy+28} Q ${sx-5},${sy+5} ${sx-28},${sy} Q ${sx-5},${sy-5} ${sx},${sy-28} Z`;
  const S          = 66;
  const lvFontSize = level >= 100 ? 11 : level >= 10 ? 14 : 18;
  const lvStroke   = level >= 100 ? 3   : level >= 10 ? 3.5 : 4;
  const fiveStarP  = (cx: number, cy: number, R: number, r: number) => {
    const pts: string[] = [];
    for (let k = 0; k < 5; k++) {
      const oa = (-90 + k * 72) * (Math.PI / 180);
      const ia = (-54 + k * 72) * (Math.PI / 180);
      pts.push(`${(cx + R * Math.cos(oa)).toFixed(1)},${(cy + R * Math.sin(oa)).toFixed(1)}`);
      pts.push(`${(cx + r * Math.cos(ia)).toFixed(1)},${(cy + r * Math.sin(ia)).toFixed(1)}`);
    }
    return `M ${pts.join(' L ')} Z`;
  };
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(220px, 38vw)', aspectRatio: '250 / 400',
      filter: `drop-shadow(0 0 48px ${rarityColor}80) drop-shadow(0 12px 40px rgba(0,0,0,0.9))`,
      zIndex: 6, pointerEvents: 'auto',
    }}>
      <HeroCardAnimated rarityColor={rarityColor}>
      <svg viewBox="0 0 250 400" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink"
        style={{ display:'block', width:'100%', height:'100%' }}>
        <defs>
          <clipPath id={clipId}><rect x="3" y="3" width="244" height="394" rx="10" ry="10"/></clipPath>
          <linearGradient id={tgId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={cfg.shine} stopOpacity="1"/>
            <stop offset="48%"  stopColor={cfg.shine} stopOpacity="1"/>
            <stop offset="100%" stopColor={cfg.fill}  stopOpacity="1"/>
          </linearGradient>
          <linearGradient id={barId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="55%"  stopColor="#000000" stopOpacity="0.55"/>
            <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id={botId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#000000" stopOpacity="0"/>
            <stop offset="100%" stopColor="#000000" stopOpacity="1"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="250" height="400" rx="12" ry="12" fill={cfg.border}/>
        <rect x="3" y="3" width="244" height="394" rx="10" ry="10" fill={cfg.fill}/>
        <rect x="3" y="3" width="244" height="394" rx="10" ry="10" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2"/>

        {/* Static clip <g> — locks to card frame coordinate space, never moves */}
        <g clipPath={`url(#${clipId})`}>
          {/* Parallax outer g — reads --hci-x/--hci-y CSS vars set by HeroCardAnimated */}
          <g style={{ transform: 'translateX(var(--hci-x, 0px)) translateY(var(--hci-y, 0px))' }}>
            {/* Float + breath animation inner g */}
            <g className="hca-ilust-anim">
              {/* foreignObject + <img> shares decoded bitmap cache with chromaImgKeeper → instant render, zero delay */}
              <foreignObject x="3" y="3" width="244" height="394">
                <img
                  src={chromaUrl ?? ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center bottom', display: 'block' }}
                />
              </foreignObject>
            </g>
          </g>
        </g>

        <rect x="3" y="280" width="244" height="77" fill={`url(#${botId})`} clipPath={`url(#${clipId})`}/>
        <rect x="3" y="291" width="185" height="25" fill={`url(#${barId})`}/>
        {Array.from({ length: cfg.stars }).map((_, i) => (
          <path key={i} d={fiveStarP(RS_X0 + i * RS_STEP, RS_CY, RS_R, RS_r)} fill="#FFD700" stroke="#000000" strokeWidth="1.2" strokeLinejoin="round"/>
        ))}
        <path d={starPath} fill="rgba(0,0,0,0.6)"/>
        <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle"
          fill={`url(#${tgId})`} stroke="#000000" strokeWidth="1.5" paintOrder="stroke"
          fontFamily="'Playfair Display',serif" fontSize="52" fontWeight="bold">{cfg.text}</text>
        <rect x="3" y="357" width="244" height="40" fill="#000000" clipPath={`url(#${clipId})`}/>
        <polyline
          points="3,367 15,387 27,367 39,387 51,367 63,387 75,367 87,387 99,367 111,387 123,367 135,387 147,367 159,387 171,367 183,387 195,367 207,387 219,367 231,387 243,367"
          fill="none" stroke="rgba(100,60,10,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`}/>
        <text x="125" y="378" textAnchor="middle" dominantBaseline="middle"
          fill="#ffffff" fontFamily="'Playfair Display',serif" fontSize="18" fontWeight="700" letterSpacing="3"
          clipPath={`url(#${clipId})`}>{name}</text>
        <path d={`M 3,3 L ${3+S},3 L 3,${3+S} Z`} fill="rgba(0,0,0,0.78)" clipPath={`url(#${clipId})`}/>
        <text x={3+S*0.28} y={3+S*0.28} textAnchor="middle" dominantBaseline="middle"
          transform={`rotate(-45, ${3+S*0.28}, ${3+S*0.28})`}
          fill="#ffffff" stroke="#000000" strokeWidth={lvStroke} paintOrder="stroke"
          fontFamily="'Playfair Display',serif" fontSize={lvFontSize} fontWeight="700" letterSpacing="1"
          clipPath={`url(#${clipId})`}>Lv. {level}</text>
        <rect x="1" y="1" width="248" height="398" rx="11" ry="11" fill="none" stroke={cfg.shine} strokeWidth="1" strokeOpacity="0.4"/>
      </svg>
      </HeroCardAnimated>
    </div>
  );
}



// ─── Types ───────────────────────────────────────────────────────────────────
interface HeroStats {
  hp: number; pAtk: number; mAtk: number;
  pDef: number; mDef: number; speed: number;
  expCurrent: number; expMax: number;
}
interface HeroDetailViewProps {
  name: string; rarity: string; rarityLabel: string;
  rarityColor: string; rarityShine: string;
  level: number; ilust: string; stats: HeroStats; onClose: () => void;
}

const BADGE_COLORS: Record<string, string> = {
  mythic: '#E00000', legendary: '#FB923C', epic: '#A855F7', rare: '#1877F2', common: '#22C55E',
};

// ─── Skill Slot Box ───────────────────────────────────────────────────────────
function SkillSlot({ children, left, top, width }: {
  children: React.ReactNode;
  left: string; top: string; width: string;
}) {
  return (
    <div style={{
      position: 'absolute', left, top, width,
      aspectRatio: '1 / 1',
      background: 'rgba(0,0,0,0.40)',
      border: '1.5px solid #dc2626',
      zIndex: 15, boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

// ─── Lucas Skill Image URLs ───────────────────────────────────────────────────
const LUCAS_SKILL_URLS = {
  sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777420534/sk1_lukas_65c48d.png',
  sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777420599/sk2_luk_5f55c9.png',
  sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777420393/sk3_lucas_5f4d58.png',
  ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777420297/ult_lucas_4cf45e.png',
};

// ─── Emma Skill Icons ─────────────────────────────────────────────────────────
function PlusSign({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  const t = s * 0.32;
  return (
    <>
      <rect x={cx - t / 2} y={cy - s / 2} width={t} height={s} rx={t / 3} fill="white"/>
      <rect x={cx - s / 2} y={cy - t / 2} width={s} height={t} rx={t / 3} fill="white"/>
    </>
  );
}

function CircleFramed({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="white" strokeWidth="1"/>
      <circle cx={cx} cy={cy} r={r + 2.5} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
      <circle cx={cx} cy={cy} r={r} fill="white"/>
    </>
  );
}

function EmmaHealPlus({ label }: { label: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 60 60" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
      <PlusSign cx={30} cy={17} s={11}/>
      <PlusSign cx={17} cy={38} s={11}/>
      <PlusSign cx={43} cy={38} s={11}/>
      <polyline points="7,30 4,22 1,30" fill="none" stroke="white" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="4" y1="22" x2="4" y2="53" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
      <polyline points="53,30 56,22 59,30" fill="none" stroke="white" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="56" y1="22" x2="56" y2="53" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
      <text x="2" y="58" fontSize="8" fill="white" fontFamily="'Playfair Display',serif" fontWeight="700">{label}</text>
    </svg>
  );
}

function EmmaCirclePyramid() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 60 60" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
      <CircleFramed cx={30} cy={17} r={6}/>
      <CircleFramed cx={17} cy={38} r={6}/>
      <CircleFramed cx={43} cy={38} r={6}/>
      <polyline points="7,30 4,22 1,30" fill="none" stroke="white" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="4" y1="22" x2="4" y2="53" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
      <polyline points="53,30 56,22 59,30" fill="none" stroke="white" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="56" y1="22" x2="56" y2="53" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  );
}

function EmmaPassiveSkill() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 60 60" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="26" y="10" width="8" height="38" rx="3" fill="white"/>
      <rect x="10" y="26" width="38" height="8" rx="3" fill="white"/>
      <text x="2" y="58" fontSize="8" fill="white" fontFamily="'Playfair Display',serif" fontWeight="700">PPsv.</text>
    </svg>
  );
}

const ACTION_TABS = [
  { id: 'levelup',   label: 'Level UP',  icon: LevelUpIcon   },
  { id: 'starup',    label: 'Star UP',   icon: StarUpIcon    },
  { id: 'awakening', label: 'Awakening', icon: AwakeningIcon },
  { id: 'skin',      label: 'Skin',      icon: SkinIcon      },
] as const;

// ── Stat Icons — all solid white ─────────────────────────────────────────────
function HpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="6.5" y="1.5" width="5" height="15" rx="2" fill="white"/>
      <rect x="1.5" y="6.5" width="15" height="5" rx="2" fill="white"/>
    </svg>
  );
}
function PAtkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <line x1="13.5" y1="4.5" x2="4.5" y2="13.5" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <polygon points="13.5,2.5 15.5,4.5 11.5,4.5" fill="white"/>
      <polygon points="13.5,2.5 15.5,4.5 15.5,6.5" fill="white"/>
      <line x1="8" y1="10" x2="10" y2="8" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="4" cy="14" r="2" fill="white"/>
    </svg>
  );
}
function MAtkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="5" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5"/>
      <circle cx="9" cy="9" r="2.5" fill="white"/>
      <line x1="9" y1="2" x2="9" y2="0.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="16" x2="9" y2="17.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="2" y1="9" x2="0.5" y2="9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="9" x2="17.5" y2="9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="4.2" y1="4.2" x2="3.2" y2="3.2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="13.8" y1="13.8" x2="14.8" y2="14.8" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="13.8" y1="4.2" x2="14.8" y2="3.2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="4.2" y1="13.8" x2="3.2" y2="14.8" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}
function PDefIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 1.5 L15.5 4.5 L15.5 9.5 Q15.5 14.5 9 16.5 Q2.5 14.5 2.5 9.5 L2.5 4.5 Z"
        fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6 5.5 L6 11" stroke="white" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function MDefIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 1.5 L15.5 4.5 L15.5 9.5 Q15.5 14.5 9 16.5 Q2.5 14.5 2.5 9.5 L2.5 4.5 Z"
        fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="9" cy="9" r="2.5" fill="white" fillOpacity="0.7"/>
      <circle cx="9" cy="9" r="1.2" fill="white"/>
    </svg>
  );
}
function SpeedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M10.5 1.5 L5.5 9.5 L9 9.5 L7.5 16.5 L13.5 7.5 L9.5 7.5 Z"
        fill="white" stroke="white" strokeOpacity="0.5" strokeWidth="0.8" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Right panel tab icons ────────────────────────────────────────────────────
function LevelUpIcon({ active }: { active: boolean }) {
  const c = active ? '#FFD700' : 'rgba(255,255,255,0.7)';
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="9" stroke={c} strokeWidth="1.5" strokeOpacity="0.5"/>
      <polygon points="11,5 15,14 11,12 7,14" fill={c}/>
    </svg>
  );
}
function StarUpIcon({ active }: { active: boolean }) {
  const c = active ? '#FFD700' : 'rgba(255,255,255,0.7)';
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 3 L12.8 8.5 H18.5 L13.9 11.8 L15.7 17.3 L11 14 L6.3 17.3 L8.1 11.8 L3.5 8.5 H9.2 Z"
        fill={c} fillOpacity={active ? 1 : 0.6}/>
    </svg>
  );
}
function AwakeningIcon({ active }: { active: boolean }) {
  const c = active ? '#FFD700' : 'rgba(255,255,255,0.7)';
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <ellipse cx="11" cy="11" rx="5" ry="8.5" stroke={c} strokeWidth="1.5" strokeOpacity="0.8"/>
      <ellipse cx="11" cy="11" rx="8.5" ry="5" stroke={c} strokeWidth="1.5" strokeOpacity="0.8"/>
      <circle cx="11" cy="11" r="2" fill={c}/>
    </svg>
  );
}
function SkinIcon({ active }: { active: boolean }) {
  const c = active ? '#FFD700' : 'rgba(255,255,255,0.7)';
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 3 C11 3 7 5 5 8 L4 18 L11 16 L18 18 L17 8 C15 5 11 3 11 3 Z"
        stroke={c} strokeWidth="1.5" strokeLinejoin="round" fill={c} fillOpacity="0.18"/>
      <path d="M8 8 C8 8 9 10 11 10 C13 10 14 8 14 8"
        stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Grid overlay constants ───────────────────────────────────────────────────
const GRID_COLS = 20;
const GRID_ROWS = 20;

// ─── Rarity letter map ────────────────────────────────────────────────────────
const RARITY_TEXT: Record<string, string> = {
  mythic: 'SS', legendary: 'S', epic: 'A', rare: 'B', common: 'C',
};

// ─── Rarity star count (matches SvgLibraryPage HERO_CARD_CFGS) ──────────────
const RARITY_STARS: Record<string, number> = {
  common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5,
};

// ─── 5-pointed star path — exact copy of SvgLibraryPage helper ───────────────
// RS_R=14, RS_r=5.3, RS_CY=338, RS_X0=24, RS_STEP=32
function fiveStarPath(cx: number, cy: number, R: number, r: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 5; k++) {
    const oa = (-90 + k * 72) * (Math.PI / 180);
    const ia = (-54 + k * 72) * (Math.PI / 180);
    pts.push(`${(cx + R * Math.cos(oa)).toFixed(1)},${(cy + R * Math.sin(oa)).toFixed(1)}`);
    pts.push(`${(cx + r * Math.cos(ia)).toFixed(1)},${(cy + r * Math.sin(ia)).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

// ─── Background ───────────────────────────────────────────────────────────────
const HERO_DETAIL_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/v1777381178/ChatGPT_Image_Apr_28_2026_07_59_00_PM_ud1ln3.png';

// ── Main Component ───────────────────────────────────────────────────────────
export function HeroDetailView({
  name, rarity, rarityLabel, rarityColor, rarityShine,
  level, ilust, stats, onClose,
}: HeroDetailViewProps) {
  const [activeTab, setActiveTab] = useState<string>('levelup');
  const expPct     = Math.round((stats.expCurrent / stats.expMax) * 100);
  const rarityText = RARITY_TEXT[rarity] ?? 'C';

  // ── Derived power score ───────────────────────────────────────────────────────
  const power = Math.round(
    stats.hp * 0.5 +
    stats.pAtk * 3 +
    stats.mAtk * 3 +
    stats.pDef * 1.5 +
    stats.mDef * 1.5 +
    stats.speed * 2
  );

  // ── Grid overlay ─────────────────────────────────────────────────────────────
  const [showGrid,  setShowGrid]  = useState(false);
  const gridCanvasRef             = useRef<HTMLCanvasElement>(null);
  const rootRef                   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const drawGrid = () => {
      const canvas = gridCanvasRef.current;
      const root   = rootRef.current;
      if (!canvas || !root) return;
      canvas.width  = root.clientWidth;
      canvas.height = root.clientHeight;
      if (!showGrid) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W  = canvas.width;
      const H  = canvas.height;
      const cW = W / GRID_COLS;
      const cH = H / GRID_ROWS;
      ctx.strokeStyle = 'rgba(255,220,80,1)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      for (let i = 0; i <= GRID_COLS; i++) { const x = i * cW; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let i = 0; i <= GRID_ROWS; i++) { const y = i * cH; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      const COL_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'];
      const labelSize   = Math.max(9, Math.floor(Math.min(cW, cH) * 0.22));
      ctx.shadowColor   = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur    = 4;
      ctx.fillStyle     = 'rgba(255,220,80,1)';
      ctx.font          = `bold ${labelSize}px 'Roboto Condensed'`;
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'top';
      for (let i = 0; i < GRID_COLS; i++) ctx.fillText(COL_LETTERS[i] ?? `${i}`, (i + 0.5) * cW, 4);
      ctx.textAlign     = 'left';
      ctx.textBaseline  = 'middle';
      for (let j = 0; j < GRID_ROWS; j++) ctx.fillText(`${j + 1}`, 4, (j + 0.5) * cH);
      ctx.shadowBlur    = 0;
    };
    drawGrid();
    const ro   = new ResizeObserver(drawGrid);
    const root = rootRef.current;
    if (root) ro.observe(root);
    return () => ro.disconnect();
  }, [showGrid]);

  return (
    <div ref={rootRef} style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000', overflow: 'hidden' }}>

      {/* ── Layer 0: background ── */}
      <img src={HERO_DETAIL_BG} alt="" style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'center center',
        zIndex: 0, pointerEvents: 'none', userSelect: 'none', display: 'block',
      }}/>

      {/* ── Layer 1: vignette ── */}
      <div style={{ position:'absolute', inset:0, zIndex:1, background:'rgba(0,0,0,0.32)', pointerEvents:'none' }}/>

      {/* ── Layer 2: rarity glows ── */}
      <>
        <div style={{ position:'absolute', inset:0, zIndex:2, background:'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(130,40,220,0.28) 0%, transparent 65%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', inset:0, zIndex:2, background:'radial-gradient(ellipse 60% 45% at 50% 105%, rgba(60,0,120,0.35) 0%, transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', width:'320px', height:'480px', zIndex:2, background:`radial-gradient(ellipse 80% 90% at 50% 60%, ${rarityColor}20 0%, transparent 70%)`, pointerEvents:'none' }}/>
      </>

      {/* ── Floating BACK button — top-left ────────────────────────────────── */}
      <button onClick={onClose} style={{
        position: 'absolute', top: '14px', left: '14px', zIndex: 20,
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(0,0,0,0.50)', border: `1px solid ${rarityColor}55`,
        borderRadius: '6px', padding: '6px 12px', cursor: 'pointer',
        color: '#FFD700', fontFamily: "'Playfair Display',serif", fontSize: '11px',
        fontWeight: 700, letterSpacing: '0.12em',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M8 2 L4 6 L8 10" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        BACK
      </button>

      {/* ══════════════════════════════════════════════════════════════════════
          A3–D3 │ Rarity color bar — full-width bg strip behind icon + name
          Color = rarityColor, fade-out on right side
          z:14 (below icon z:15)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute',
        left: '0%', top: '10%',
        width: '20%',  /* 4 cols = 4/20 = 20% */
        height: '5%',  /* 1 row  = 1/20 = 5%  */
        zIndex: 14,
        background: `linear-gradient(90deg, ${rarityColor} 0%, ${rarityColor}cc 55%, ${rarityColor}44 80%, transparent 100%)`,
        pointerEvents: 'none',
      }}/>

      {/* ═══════════════════════════════════════════════════════════════════════
          A3 │ Rarity Icon — col A, row 3, w=½ grid, h=1 grid, z:15
          EXACT extraction from SvgLibraryPage HeroCardSVG:
            sx=218, center=(218,321), R=28, ctrl=±5
            path  = M 218,293 Q 223,316 246,321 Q 223,326 218,349 Q 213,326 190,321 Q 213,316 218,293 Z
            text  = fontSize=56, Georgia bold, gradient fill (shineTop→fill), stroke="#000" sw=1.5
          viewBox="186 289 64 64" crops exactly to the star+text bounding box
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute',
        left: '0%', top: '10%',
        width: '2.5%',   /* ½ grid column */
        height: '5%',    /* 1 grid row    */
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        pointerEvents: 'none',
        overflow: 'visible',
      }}>
        <svg
          viewBox="186 289 64 64"
          width="100%" height="100%"
          preserveAspectRatio="xMinYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible' }}
        >
          <defs>
            {/* Exact gradient from SvgLibraryPage — shineTop→fill, vertical, userSpace */}
            <linearGradient id="rarity-icon-g" x1="218" y1="293" x2="218" y2="349" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor={rarityShine} stopOpacity="1"/>
              <stop offset="48%"  stopColor={rarityShine} stopOpacity="1"/>
              <stop offset="100%" stopColor={rarityColor}  stopOpacity="1"/>
            </linearGradient>
          </defs>
          {/* Exact star path from SvgLibraryPage: sx=218, R=28, ctrl=±5 */}
          <path
            d="M 218,293 Q 223,316 246,321 Q 223,326 218,349 Q 213,326 190,321 Q 213,316 218,293 Z"
            fill="#000000"
          />
          {/* Exact text from SvgLibraryPage: fontSize=56, Georgia bold, gradient fill */}
          <text
            x="218" y="321"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="'Playfair Display', serif"
            fontSize="56"
            fontWeight="bold"
            fill="url(#rarity-icon-g)"
            stroke="#000000"
            strokeWidth="1.5"
            paintOrder="stroke"
          >
            {rarityText}
          </text>
        </svg>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          A4–D4 │ Rating stars — exact fiveStarPath from SvgLibraryPage
          RS_R=14, RS_r=5.3, RS_CY=338, RS_X0=24, RS_STEP=32
          Row 4 = top:15%, height:5%  |  A–D = left:0%, width:20%
          z:15  (same level as rarity icon)
      ═════════════════════════════════════════════════════════════════════= */}
      {(() => {
        const RS_R = 14, RS_r = 5.3, RS_CY = 338, RS_X0 = 24, RS_STEP = 32;
        const n    = RARITY_STARS[rarity] ?? 2;
        // viewBox crops tightly around the n stars
        const vbX  = RS_X0 - RS_R - 2;                              // 8
        const vbW  = (RS_X0 + (n - 1) * RS_STEP + RS_R + 2) - vbX; // n*32
        const vbY  = RS_CY - RS_R - 2;                              // 322
        const vbH  = (RS_R + 2) * 2;                                // 32
        return (
          <div style={{
            position: 'absolute',
            left: '0%', top: '15%',
            width: '20%', height: '5%',
            zIndex: 15,
            display: 'flex', alignItems: 'center',
            paddingLeft: '0.5%',
            pointerEvents: 'none',
          }}>
            <svg
              viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
              preserveAspectRatio="xMinYMid meet"
              style={{ height: '105%', width: 'auto', overflow: 'visible' }}
            >
              {Array.from({ length: n }).map((_, i) => (
                <path
                  key={i}
                  d={fiveStarPath(RS_X0 + i * RS_STEP, RS_CY, RS_R, RS_r)}
                  fill="#FFD700"
                  stroke="#000000"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          </div>
        );
      })()}

      {/* ═════════════════════════════════════════════════════════════════════
          A5–D5 │ Thin dark-orange bottom rule — shifted down 1 grid (was A4)
          left:0%, top:calc(25% - 1.5px), width:20%
          z:15
      ═════════════════════════════════════════════════════════════════════= */}
      <div style={{
        position: 'absolute',
        left: '0%',
        top: 'calc(35% - 1.5px)',
        width: '20%',
        height: '1.5px',
        zIndex: 15,
        background: 'linear-gradient(90deg, #92400e 0%, #b45309 40%, #b4530966 75%, transparent 100%)',
        pointerEvents: 'none',
      }}/>

      {/* ══════════════════════════════════════════════════���═══════════════════
          B3–C3 │ Hero Name — 1 grid row, h=5% (row 3 only), z:15
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute',
        left: '5%', top: '10%',
        width: '10%',
        height: '5%',   /* 1 grid row = 1/20 = 5% */
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'visible',
        pointerEvents: 'none',
      }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 80"
          preserveAspectRatio="xMinYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block', overflow: 'hidden' }}
        >
          <text
            x="0" y="68"
            fontFamily="'Playfair Display', serif"
            fontWeight="900"
            fontSize="72"
            fill="white"
            stroke="black"
            strokeWidth="7"
            paintOrder="stroke"
            letterSpacing="3"
            textLength="190"
            lengthAdjust="spacingAndGlyphs"
          >
            {name}
          </text>
        </svg>
      </div>

      {/* ── Left Stats Panel — glass, top:0, content offset 4 grid rows ─────── */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: '20%',
        zIndex: 10, overflowY: 'auto',
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(255,255,255,0.10)',
      }}>
        {/* Inner content pushed down 4 grid rows = 20vh */}
        <div style={{ paddingTop: '20vh', padding: '20vh 10px 14px 12px' }}>

          {/* Level */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '7px' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Roboto Condensed',sans-serif", fontSize: '15px', fontWeight: 600, letterSpacing: '0.12em' }}>Level</span>
              <span style={{ color: '#FFD700', fontFamily: "'Roboto Condensed',sans-serif", fontSize: '30px', fontWeight: 800, textShadow: '0 0 12px rgba(255,215,0,0.6)' }}>{level}</span>
            </div>
            {/* EXP bar */}
            <div style={{ position: 'relative', paddingRight: '30px' }}>
              <div style={{ position: 'relative', height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${expPct}%`, background: 'linear-gradient(90deg, #4ade80 0%, #86efac 80%, #d9f99d 100%)', borderRadius: '5px', boxShadow: '0 0 6px rgba(74,222,128,0.6)' }}/>
                <div style={{ position: 'absolute', left: 0, top: 0, width: `${expPct}%`, height: '40%', background: 'rgba(255,255,255,0.2)', borderRadius: '5px', pointerEvents: 'none' }}/>
              </div>
              <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: '#86efac', fontFamily: "'Playfair Display',serif", fontSize: '9px', fontWeight: 700 }}>{expPct}%</span>
            </div>
            {/* EXP text */}
            <div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.28)', fontFamily: "'Playfair Display',serif", fontSize: '8px', letterSpacing: '0.06em' }}>
              {fmtNum(stats.expCurrent)} / {fmtNum(stats.expMax)} EXP
            </div>
          </div>

          {/* ── 1-grid spacer ── */}
          <div style={{ height: '5vh' }}/>

          {/* Divider */}
          <div style={{ height: '1px', background: `linear-gradient(90deg, ${rarityColor}55, transparent)`, marginBottom: '12px' }}/>

          {/* Stat rows */}
          {[
            { Icon: HpIcon,    label: 'HP',     value: stats.hp    },
            { Icon: PAtkIcon,  label: 'P. ATK', value: stats.pAtk  },
            { Icon: MAtkIcon,  label: 'M. ATK', value: stats.mAtk  },
            { Icon: PDefIcon,  label: 'P. DEF', value: stats.pDef  },
            { Icon: MDefIcon,  label: 'M. DEF', value: stats.mDef  },
            { Icon: SpeedIcon, label: 'SPEED',  value: stats.speed },
          ].map(({ Icon, label, value }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              marginBottom: '10px', padding: '5px 6px',
              background: 'rgba(255,255,255,0.06)', borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <Icon />
              <span style={{ color: 'rgba(255,255,255,0.62)', fontFamily: "'Playfair Display',serif", fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', flex: 1 }}>{label}</span>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontFamily: "'Playfair Display',serif", fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em' }}>{fmtNum(value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Center: Floating Hero Card ── */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: '20%', right: '20%',
        zIndex: 5, pointerEvents: 'none',
      }}>
        <FloatingHeroCard
          name={name} rarity={rarity} rarityColor={rarityColor}
          rarityShine={rarityShine} level={level} ilust={ilust}
        />
        <div style={{
          position: 'absolute', bottom: 0, left: '10%', right: '10%', height: '60px',
          background: `radial-gradient(ellipse 80% 100% at 50% 100%, ${rarityColor}44 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}/>
      </div>

      {/* ── Right Action Pills — NO glass container, shifted down 2 grids (10%) ── */}
      <div style={{
        position: 'absolute', top: '10%', right: 0, width: '20%',
        zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        justifyContent: 'flex-start',
        padding: '0 10px 0 10px', gap: '8px',
      }}>
        {ACTION_TABS.map(({ id, label, icon: TabIcon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px',
                background: isActive
                  ? 'linear-gradient(90deg, rgba(255,215,0,0.18) 0%, rgba(255,215,0,0.08) 100%)'
                  : 'rgba(0,0,0,0.42)',
                border: isActive
                  ? '1px solid rgba(255,215,0,0.55)'
                  : '1px solid rgba(255,255,255,0.12)',
                borderRadius: '999px',
                cursor: 'pointer',
                padding: '7px 14px 7px 10px',
                transition: 'all 0.18s',
                boxShadow: isActive ? '0 0 10px rgba(255,215,0,0.15)' : 'none',
              }}
            >
              <TabIcon active={isActive} />
              <span style={{
                color: isActive ? '#FFD700' : 'rgba(255,255,255,0.75)',
                fontFamily: "'Roboto Condensed',sans-serif",
                fontSize: '11px',
                fontWeight: isActive ? 700 : 600,
                letterSpacing: '0.06em',
                textShadow: isActive ? '0 0 8px rgba(255,215,0,0.6)' : 'none',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Resource UI delegated to GamePageLayout below
      ═════════════════════════════════════════════════════════════════════= */}

      {/* ── Resource UI — delegated to GamePageLayout (single source of truth) ── */}
      <GamePageLayout activeTab="hero" hidePlayerInfo hideNav hideDropdown />

      {/* ══════════════════════════════════════════════════════════════════════
          A7–D7 │ Power Indicator — 4 grid cols (0–20%), row 7 (top:30%–35%)
          Dipindah dari H18–M18 ke sini (bekas tempat garis orange)
          Icon kiri + angka kanan dalam satu baris, z:16
      ═══════════════════════════════════════════════════════════════════= */}
      {/* ─── A8 │ Power — left:0%, top:37.5% (center of row 8 in 20×20 grid) ── */}
      <div style={{
        position: 'absolute',
        left: '0%', top: '37.5%',
        transform: 'translateY(-50%)',
        width: '20%', height: '5%',
        zIndex: 16,
        display: 'flex',
        alignItems: 'center',
        gap: '3%',
        paddingLeft: '2%',
        pointerEvents: 'none',
        background: 'linear-gradient(90deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.16) 75%, transparent 100%)',
        overflow: 'hidden',
        borderRadius: '4px',
      }}>
        {/* Power fist icon */}
        <svg viewBox="0 0 24 28" style={{ height: '60%', width: 'auto', flexShrink: 0 }} fill="none">
          <rect x="5"  y="5"  width="4" height="7" rx="2" fill="white"/>
          <rect x="10" y="4"  width="4" height="8" rx="2" fill="white"/>
          <rect x="15" y="5"  width="4" height="7" rx="2" fill="white"/>
          <rect x="4"  y="11" width="16" height="9" rx="2.5" fill="white"/>
          <rect x="1"  y="12" width="5"  height="4" rx="2" fill="white"/>
          <rect x="5"  y="19" width="14" height="3" rx="1" fill="white" fillOpacity="0.5"/>
          <path d="M13 8 L10 14 L13 14 L11 20 L16 12 L13 12 Z" fill="rgba(0,0,0,0.35)"/>
        </svg>
        {/* Power number — SVG text sama style dengan hero name */}
        <svg
          width="100%" height="100%"
          viewBox="0 0 260 40"
          preserveAspectRatio="xMinYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block', overflow: 'hidden', flex: 1 }}
        >
          <text
            x="0" y="34"
            fontFamily="'Playfair Display', serif"
            fontWeight="900"
            fontSize="36"
            fill="white"
            stroke="black"
            strokeWidth="3"
            paintOrder="stroke"
            letterSpacing="2"
          >
            {fmtNum(power)}
          </text>
        </svg>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Skill Slots
          Grid 20×20 — cols F-G = 25-35% (left:25%, w:10%) | cols O-P = 70-80% (left:70%, w:10%)
          Rows 6-8  = top:25%, h:15%   |   Rows 13-15 = top:60%, h:15%
      ═══════════════════════════════════════════════════════════════════════ */}
      {name === 'Lucas' && (
        <>
          {/* Skill 1 — F6-G8 */}
          <SkillSlot left="25%" top="25%" width="10%">
            <img src={LUCAS_SKILL_URLS.sk1} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false}/>
          </SkillSlot>
          {/* Skill 2 — F13-G15 */}
          <SkillSlot left="25%" top="60%" width="10%">
            <img src={LUCAS_SKILL_URLS.sk2} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false}/>
          </SkillSlot>
          {/* Skill 3 — 65% (+0.5 grid right from 62%) */}
          <SkillSlot left="65%" top="25%" width="10%">
            <img src={LUCAS_SKILL_URLS.sk3} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false}/>
          </SkillSlot>
          {/* Ultimate — 65% */}
          <SkillSlot left="65%" top="60%" width="10%">
            <img src={LUCAS_SKILL_URLS.ult} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false}/>
          </SkillSlot>
        </>
      )}
      {name === 'Emma' && (
        <>
          {/* Skill 1 — F6-G8 */}
          <SkillSlot left="25%" top="25%" width="10%">
            <EmmaHealPlus label="Act."/>
          </SkillSlot>
          {/* Skill 2 — F13-G15 */}
          <SkillSlot left="25%" top="60%" width="10%">
            <EmmaCirclePyramid/>
          </SkillSlot>
          {/* Passive — 65% */}
          <SkillSlot left="65%" top="25%" width="10%">
            <EmmaPassiveSkill/>
          </SkillSlot>
          {/* Ultimate — 65% */}
          <SkillSlot left="65%" top="60%" width="10%">
            <EmmaHealPlus label="Ult."/>
          </SkillSlot>
        </>
      )}

      {/* ── Grid canvas overlay ───────────────────────────────────────────────── */}
      <canvas
        ref={gridCanvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          zIndex: 60, pointerEvents: 'none', display: 'block',
        }}
      />

      {/* ── Grid toggle button ────────────────────────────────────────────────── */}
      <button className="font-normal"
        onClick={() => setShowGrid(v => !v)}
        style={{
          position: 'absolute', bottom: '16px', right: 'calc(20% + 16px)', zIndex: 61,
          display: 'flex', alignItems: 'center', gap: '6px',
          background:     showGrid ? 'rgba(255,220,80,0.18)' : 'rgba(0,0,0,0.5)',
          border:         showGrid ? '1px solid rgba(255,220,80,0.6)' : '1px solid rgba(255,255,255,0.25)',
          color:          showGrid ? 'rgba(255,220,80,1)' : '#fff',
          fontSize: '10px', fontFamily: "'Playfair Display',serif", letterSpacing: '0.12em',
          padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
          backdropFilter: 'blur(6px)',
          boxShadow: showGrid ? '0 0 10px rgba(255,220,80,0.25)' : 'none',
          transition: 'all 0.2s',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        {showGrid ? 'HIDE GRID' : 'GRID'}
      </button>

    </div>
  );
}