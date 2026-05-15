/**
 * HeroDetailView — full-screen overlay showing hero detail stats + action tabs.
 * Center area shows a static floating hero card (no sprite animation).
 */

import { useState, useEffect, useRef } from 'react';
// ─── Hero gallery is the single source of truth for all hero display data ──────
import { getHeroById } from '../data/heroGallery';
import { computeStarBonus, computeFinalStats } from '../constants/balanceEngine';
import { useHero } from '../context/HeroContext';
import { useChromaKeyDataUrl } from '../utils/chromaKey';
import { HeroCardAnimated } from './HeroCardAnimated';
import { HeroCard, HERO_RARITIES } from './HeroCard';
import { GamePageLayout } from './GamePageLayout';
import { HeroLevelUpPanel } from './HeroLevelUpPanel';
import { HeroResetPanel }  from './HeroResetPanel';
import { HeroStarUpPanel } from './HeroStarUpPanel';
import { playBtnSound, playBackSound } from '../utils/buttonSound';

// ─── Number formatter K / M / B ───
function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${+(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ─── Trim transparent padding: finds actual-art bounding box ─────────────────
interface TrimBounds { sx: number; sy: number; sw: number; sh: number; }
function detectTrimBounds(img: HTMLImageElement): TrimBounds {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  // getImageData throws SecurityError if canvas is tainted (CORS)
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (_) {
    return { sx: 0, sy: 0, sw: w, sh: h };
  }
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY) return { sx: 0, sy: 0, sw: w, sh: h };
  return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
}

// ─── SkillIconChroma: loads icon + applies chroma key (mandatory for green-screen skill arts)
// All skill icons must pass through chroma key — the green background is standard for all heroes.
function SkillIconChroma({ src }: { src: string }) {
  const dataUrl = useChromaKeyDataUrl(src);
  return (
    <img
      src={dataUrl ?? ''}
      draggable={false}
      style={{ width:'100%', height:'100%', objectFit:'contain', display:'block', pointerEvents:'none' }}
    />
  );
}

// ─── SkillIconCanvas: renders skill art cropped to actual content bounds ──────
function SkillIconCanvas({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let ro: ResizeObserver | null = null;
    const draw = (bounds: TrimBounds) => {
      if (!active) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const size = parent.clientWidth;
      if (size === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width  = size + 'px';
      canvas.style.height = size + 'px';
      const c = canvas.getContext('2d')!;
      c.scale(dpr, dpr);
      c.clearRect(0, 0, size, size);
      // Preserve aspect ratio — letterbox/pillarbox so art is never stretched
      const aspect = bounds.sw / (bounds.sh || 1);
      let dx = 0, dy = 0, dw = size, dh = size;
      if (aspect > 1) { dh = size / aspect; dy = (size - dh) / 2; }
      else if (aspect < 1) { dw = size * aspect; dx = (size - dw) / 2; }
      c.drawImage(img, bounds.sx, bounds.sy, bounds.sw, bounds.sh, dx, dy, dw, dh);
    };
    img.onload = () => {
      if (!active) return;
      let bounds: TrimBounds;
      try {
        bounds = detectTrimBounds(img);
      } catch (_) {
        // CORS getImageData blocked — fall back to full image
        bounds = { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
      }
      draw(bounds);
      const parent = canvasRef.current?.parentElement;
      if (parent) {
        ro = new ResizeObserver(() => draw(bounds));
        ro.observe(parent);
      }
    };
    img.src = src;
    return () => { active = false; ro?.disconnect(); };
  }, [src]);
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}


// ─── Types ───────────────────────────────────────────────────────────────────
interface HeroStats {
  hp: number; pAtk: number; mAtk: number;
  pDef: number; mDef: number; speed: number;
  expCurrent: number; expMax: number;
}
interface HeroDetailViewProps {
  heroId:       string;
  name: string; rarity: string; rarityLabel: string;
  rarityColor: string; rarityShine: string;
  role: string;
  level: number; ilust: string; stats: HeroStats; onClose: () => void;
}

const BADGE_COLORS: Record<string, string> = {
  mythic: '#E00000', legendary: '#FB923C', epic: '#A855F7', rare: '#1877F2', common: '#22C55E',
};

// ─── Skill Slot Box ───────────────────────────────────────────────────────────
function SkillSlot({ children, left, top, width, label, skillInfo, skillLevel, locked, onHold, onRelease }: {
  children: React.ReactNode;
  left: string; top: string; width: string; label: string;
  skillInfo: SkillInfo; skillLevel: number; locked: boolean;
  onHold: (info: SkillInfo, level: number, isLocked: boolean) => void;
  onRelease: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      style={{
        position: 'absolute', left, top, width,
        zIndex: 15,
        cursor: 'pointer', userSelect: 'none',
      }}
      onPointerDown={() => {
        setPressed(true);
        // locked skills show Lv1 preview info (no next-level scaling)
        onHold(skillInfo, locked ? 1 : skillLevel, locked);
      }}
      onPointerUp={() => { setPressed(false); onRelease(); }}
      onPointerLeave={() => { setPressed(false); onRelease(); }}
      onPointerCancel={() => { setPressed(false); onRelease(); }}
    >
      {/* ── Animated inner: only label + icon scale, outer container is stable ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
        transform: pressed && !locked ? 'scale(0.82) translateY(2px)' : 'scale(1) translateY(0px)',
        filter:    pressed && !locked ? 'brightness(0.70) drop-shadow(0 0 7px rgba(255,200,50,0.6))' : 'none',
        transition: pressed
          ? 'transform 0.07s cubic-bezier(0.25,0.46,0.45,0.94), filter 0.07s ease-out'
          : 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s ease-out',
      }}>
      <span style={{
        color: locked ? 'rgba(255,255,255,0.35)' : 'rgba(255,215,0,0.95)',
        fontFamily: "'Roboto Condensed', sans-serif",
        fontSize: 'clamp(6px, 1.1vw, 10px)',
        fontWeight: 700,
        letterSpacing: '0.07em',
        textShadow: locked ? 'none' : '0 1px 6px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)',
        whiteSpace: 'nowrap',
        textAlign: 'center',
        lineHeight: 1,
        userSelect: 'none',
      }}>{label}</span>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', boxSizing: 'border-box', overflow: 'hidden' }}>
        <div style={{ width: '100%', height: '100%', opacity: locked ? 0.18 : 1 }}>
          {children}
        </div>
        {locked && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="42%" height="42%" viewBox="0 0 24 28" fill="none">
              <rect x="2" y="12" width="20" height="14" rx="3" fill="white" fillOpacity="0.92"/>
              <path d="M6 12V9a6 6 0 0 1 12 0v3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="18.5" r="1.8" fill="#111"/>
              <line x1="12" y1="20.3" x2="12" y2="23" stroke="#111" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
        )}
        {!locked && (
          <div style={{
            position: 'absolute', bottom: '3px', right: '3px',
            background: 'rgba(0,0,0,0.78)',
            border: `1px solid ${skillLevel >= 4 ? '#F97316' : 'rgba(255,215,0,0.55)'}`,
            borderRadius: '3px', padding: '1px 4px',
            fontFamily: "'Roboto Condensed', sans-serif",
            fontSize: 'clamp(5px, 0.85vw, 8px)',
            fontWeight: 700,
            color: skillLevel >= 4 ? '#F97316' : '#FFD700',
            lineHeight: 1, letterSpacing: '0.03em',
          }}>{skillLevel >= 4 ? 'MAX' : `Lv.${skillLevel}`}</div>
        )}
      </div>
      </div>{/* end animated inner wrapper */}
    </div>
  );
}

// ─── All skill data & icon URLs → /src/app/data/heroGallery.ts ───────────────
// DO NOT add hero skill data here. Use heroGallery.ts as the single source.

// ─── Skill System — Unlock Levels & Level Scaling ────────────────────────────
// Skill slot : [ heroLv to reach Lv1, Lv2, Lv3, Lv4 ]
const SKILL_UNLOCK_LVL: Record<'sk1'|'sk2'|'sk3'|'ult', number[]> = {
  sk1: [  1,  81, 161, 240 ],
  sk2: [ 21, 101, 181, 240 ],
  sk3: [ 41, 121, 201, 240 ],
  ult: [ 61, 141, 221, 240 ],
};

function computeSkillLevel(heroLv: number, key: 'sk1'|'sk2'|'sk3'|'ult'): { level: number; locked: boolean } {
  const tiers = SKILL_UNLOCK_LVL[key];
  if (heroLv < tiers[0]) return { level: 0, locked: true };
  let sl = 1;
  for (let i = 1; i < tiers.length; i++) {
    if (heroLv >= tiers[i]) sl = i + 1; else break;
  }
  return { level: sl, locked: false };
}

// ─── Local type aliases (match heroGallery.ts shapes) ────────────────────────
interface SkillRatioLevel { label: string; values: string[]; }
interface SkillInfo { name: string; description: string; ratioLevels: SkillRatioLevel[]; }

const PLACEHOLDER_SKILL: SkillInfo = {
  name: '???',
  description: 'This skill has not been revealed yet. Stay tuned for future story content.',
  ratioLevels: [],
};

// ─── Placeholder icon — pure SVG, zero external dependency ───────────────────
function PlaceholderSkillIcon() {
  return (
    <svg viewBox="0 0 48 48" style={{ width:'100%', height:'100%', display:'block' }}>
      <rect x="2" y="2" width="44" height="44" rx="8" ry="8"
        fill="rgba(20,10,40,0.85)" stroke="rgba(120,80,200,0.35)" strokeWidth="1.5"/>
      <text x="24" y="30" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Playfair Display', serif" fontSize="24" fontWeight="900"
        fill="rgba(160,120,220,0.40)" stroke="rgba(0,0,0,0.6)" strokeWidth="1" paintOrder="stroke">
        ?
      </text>
    </svg>
  );
}
// ─── heroGallery.ts is the registry. Nothing else needed here. ────────────────

const ACTION_TABS = [
  { id: 'levelup',   label: 'Level UP',  icon: LevelUpIcon   },
  { id: 'starup',    label: 'Star UP',   icon: StarUpIcon    },
  { id: 'awakening', label: 'Awakening', icon: AwakeningIcon },
  { id: 'skin',      label: 'Skin',      icon: SkinIcon      },
  { id: 'reset',     label: 'Reset Lv',  icon: ResetIcon     },
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
function ResetIcon({ active }: { active: boolean }) {
  const c = active ? '#f87171' : 'rgba(255,255,255,0.7)';
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M4 11 A7 7 0 1 1 11 18" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <polyline points="4,7 4,11 8,11" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="11" y1="8" x2="11" y2="12" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="11" cy="14" r="0.9" fill={c}/>
    </svg>
  );
}

// ─── Rarity letter map ────────────────────────────────────────────────────────
const RARITY_TEXT: Record<string, string> = {
  mythic: 'SS', legendary: 'S', epic: 'A', rare: 'B', common: 'C',
};

// ─── 5-pointed star path — used by the stats overlay star row ────────────────
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
const HERO_DETAIL_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778656008/ChatGPT_Image_May_13_2026_01_59_32_PM_n7fx7u.png';

// ── Main Component ───────────────────────────────────────────────────────────
export function HeroDetailView({
  heroId, name, rarity, rarityLabel, rarityColor, rarityShine,
  role, level, ilust, stats, onClose,
}: HeroDetailViewProps) {
  const [activeTab,     setActiveTab]     = useState<string | null>(null);
  const [heldSkillData, setHeldSkillData] = useState<{ info: SkillInfo; level: number; isLocked: boolean } | null>(null);

  // ── Live hero data from HeroContext — updates immediately on level/star up ───
  const { ownedHeroes } = useHero();
  const liveHero  = ownedHeroes.find(h => h.playerHero.hero_id === heroId);
  const liveLevel = liveHero?.playerHero.level ?? level;
  // Live star count — reflects Star Up immediately
  const rarityBaseCfg = HERO_RARITIES.find(r => r.id === rarity);
  const liveStars = liveHero?.playerHero.stars ?? rarityBaseCfg?.stars ?? 1;
  // ── FinalStat = (base + level × growth) × StarBonus ──────────────────────
  // Engine formula: balanceEngine.computeFinalStats — SSOT for all stat display.
  const starMult = computeStarBonus(rarity, liveStars);
  const liveStats = (() => {
    if (!liveHero) return stats;
    const d  = liveHero.def;
    const s  = computeFinalStats(d, liveLevel, liveStars);
    return { ...s,
      expCurrent: liveHero.playerHero.xp ?? stats.expCurrent,
      expMax: stats.expMax,
    };
  })();

  // ── Tab toggle: same tab → hide panel, different tab → show ─────────────────
  const handleTabClick = (id: string) => {
    playBtnSound();
    setActiveTab(prev => prev === id ? null : id);
  };
  const closePanel = () => setActiveTab(null);

  // ── heroGallery lookup — single source of truth for all hero display data ────
  // getHeroById reads from /src/app/data/heroGallery.ts (add new heroes there).
  const galleryEntry = getHeroById(heroId);
  const heroSkills = {
    sk1: (galleryEntry?.skills.sk1 ?? PLACEHOLDER_SKILL) as SkillInfo,
    sk2: (galleryEntry?.skills.sk2 ?? PLACEHOLDER_SKILL) as SkillInfo,
    sk3: (galleryEntry?.skills.sk3 ?? PLACEHOLDER_SKILL) as SkillInfo,
    ult: (galleryEntry?.skills.ult  ?? PLACEHOLDER_SKILL) as SkillInfo,
  };
  const heroUrls = galleryEntry?.skillIcons ?? { sk1: null, sk2: null, sk3: null, ult: null };
  // Force locked when hero has no gallery entry yet (future heroes pre-listed)
  const hasSkills = galleryEntry !== null;

  // ── Compute each skill's current level from LIVE hero level ──────────────────
  const sk1State = computeSkillLevel(liveLevel, 'sk1');
  const sk2State = computeSkillLevel(liveLevel, 'sk2');
  const sk3State = computeSkillLevel(liveLevel, 'sk3');
  const ultState = computeSkillLevel(liveLevel, 'ult');
  const expPct     = Math.round((liveStats.expCurrent / liveStats.expMax) * 100);
  const rarityText = RARITY_TEXT[rarity] ?? 'C';

  // ── Derived power score ──────────────────────────────────���──────────────────
  // 15 HP = 1 pt │ 1 SPD = 121 pt │ all other stats = 2 pt each
  const power = Math.round(
    liveStats.hp    / 15  +
    liveStats.pAtk  * 2   +
    liveStats.mAtk  * 2   +
    liveStats.pDef  * 2   +
    liveStats.mDef  * 2   +
    liveStats.speed * 121
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000', overflow: 'hidden' }}>

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
      <button onClick={() => { playBackSound(); onClose(); }} style={{
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

      {/* ══════════════════════════════════════���═══════════════════════════════
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
        const n      = Math.max(1, liveStars);
        // Tier: yellow 1-5 | red 6-10 | white 11-15 | rainbow 16 (max)
        const tier   = Math.min(3, Math.floor((n - 1) / 5));
        const inTier = n - tier * 5;
        const slots  = tier === 3 ? 1 : 5;
        const FILL   = ['#FFD700', '#FF3333', '#D8D8D8', '#FFD700'] as const;
        const STROKE = ['#000000', '#000000', '#888888', '#000000'] as const;
        // viewBox always covers 5 slots (or 1 for rainbow)
        const vbX  = RS_X0 - RS_R - 2;
        const vbW  = (RS_X0 + (slots - 1) * RS_STEP + RS_R + 2) - vbX;
        const vbY  = RS_CY - RS_R - 2;
        const vbH  = (RS_R + 2) * 2;
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
              {Array.from({ length: slots }).map((_, i) => {
                const lit = i < inTier;
                return (
                  <path key={i}
                    d={fiveStarPath(RS_X0 + i * RS_STEP, RS_CY, RS_R, RS_r)}
                    fill={lit ? FILL[tier] : 'rgba(0,0,0,0.38)'}
                    stroke={lit ? STROKE[tier] : 'rgba(255,255,255,0.18)'}
                    strokeWidth="1.2" strokeLinejoin="round"
                    style={lit && tier === 3 ? { filter:'drop-shadow(0 0 6px #FFD700) drop-shadow(0 0 12px rgba(255,80,255,0.7))' } : undefined}
                  />
                );
              })}
            </svg>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════��═════════════════
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

      {/* ═════════════════════════════════════════════════════════════════════
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
              <span style={{ color: '#FFD700', fontFamily: "'Roboto Condensed',sans-serif", fontSize: '30px', fontWeight: 800, textShadow: '0 0 12px rgba(255,215,0,0.6)' }}>{liveLevel}</span>
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
              {fmtNum(liveStats.expCurrent)} / {fmtNum(liveStats.expMax)} EXP
            </div>
          </div>

          {/* ── 1-grid spacer ── */}
          <div style={{ height: '5vh' }}/>

          {/* Divider */}
          <div style={{ height: '1px', background: `linear-gradient(90deg, ${rarityColor}55, transparent)`, marginBottom: '12px' }}/>

          {/* Stat rows */}
          {[
            { Icon: HpIcon,    label: 'HP',     value: liveStats.hp    },
            { Icon: PAtkIcon,  label: 'P. ATK', value: liveStats.pAtk  },
            { Icon: MAtkIcon,  label: 'M. ATK', value: liveStats.mAtk  },
            { Icon: PDefIcon,  label: 'P. DEF', value: liveStats.pDef  },
            { Icon: MDefIcon,  label: 'M. DEF', value: liveStats.mDef  },
            { Icon: SpeedIcon, label: 'SPEED',  value: liveStats.speed },
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
        {/* ── Shared HeroCard — 100% identical design to obtained hero grid ── */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(220px, 38vw)', aspectRatio: '250 / 400',
          filter: `drop-shadow(0 0 48px ${rarityColor}80) drop-shadow(0 12px 40px rgba(0,0,0,0.9))`,
          zIndex: 6, pointerEvents: 'auto',
        }}>
          <HeroCardAnimated rarityColor={rarityColor}>
            <HeroCard
              name={name}
              rarity={rarity}
              level={liveLevel}
              ilust={ilust}
              heroType={role}
              stars={liveStars}
              uid={`detail-${heroId}`}
            />
          </HeroCardAnimated>
        </div>
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
              onClick={() => handleTabClick(id)}
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
      {/* ── Skill Slots — ALWAYS rendered for every hero ──────────────────────
           Known heroes:   skill data + icons from /src/app/data/heroGallery.ts
           Unknown heroes: PlaceholderSkillIcon + "???" info, all locked
           To add a new hero: add ONE entry to heroGallery.ts — nothing else.   */}
      <>
        <SkillSlot left="25%" top="25%" width="10%" label="Skill 1"
          skillInfo={heroSkills.sk1} skillLevel={sk1State.level} locked={!hasSkills || sk1State.locked}
          onHold={(info, lv, il) => setHeldSkillData({ info, level: lv, isLocked: il })} onRelease={() => setHeldSkillData(null)}>
          {heroUrls.sk1 ? <SkillIconChroma src={heroUrls.sk1} /> : <PlaceholderSkillIcon />}
        </SkillSlot>
        <SkillSlot left="25%" top="60%" width="10%" label="Skill 2"
          skillInfo={heroSkills.sk2} skillLevel={sk2State.level} locked={!hasSkills || sk2State.locked}
          onHold={(info, lv, il) => setHeldSkillData({ info, level: lv, isLocked: il })} onRelease={() => setHeldSkillData(null)}>
          {heroUrls.sk2 ? <SkillIconChroma src={heroUrls.sk2} /> : <PlaceholderSkillIcon />}
        </SkillSlot>
        <SkillSlot left="65%" top="25%" width="10%" label="Passif Skill"
          skillInfo={heroSkills.sk3} skillLevel={sk3State.level} locked={!hasSkills || sk3State.locked}
          onHold={(info, lv, il) => setHeldSkillData({ info, level: lv, isLocked: il })} onRelease={() => setHeldSkillData(null)}>
          {heroUrls.sk3 ? <SkillIconChroma src={heroUrls.sk3} /> : <PlaceholderSkillIcon />}
        </SkillSlot>
        <SkillSlot left="65%" top="60%" width="10%" label="Ultimate Skill"
          skillInfo={heroSkills.ult} skillLevel={ultState.level} locked={!hasSkills || ultState.locked}
          onHold={(info, lv, il) => setHeldSkillData({ info, level: lv, isLocked: il })} onRelease={() => setHeldSkillData(null)}>
          {heroUrls.ult ? <SkillIconChroma src={heroUrls.ult} /> : <PlaceholderSkillIcon />}
        </SkillSlot>
      </>

      {/* ── Level-up panel ─────────────────────────────────────────────────────── */}
      {activeTab === 'levelup' && (
        <HeroLevelUpPanel
          heroId={heroId}
          rarity={rarity}
          currentLevel={liveLevel}
          rarityColor={rarityColor}
          onClose={closePanel}
        />
      )}

      {/* ── Star Up panel ─────────────────────────────────────────────────────── */}
      {activeTab === 'starup' && (
        <HeroStarUpPanel
          heroId={heroId}
          rarity={rarity}
          rarityColor={rarityColor}
          onClose={closePanel}
        />
      )}

      {/* ── Reset panel ────────────────────────────────────────────────────────── */}
      {activeTab === 'reset' && (
        <HeroResetPanel
          heroId={heroId}
          rarity={rarity}
          currentLevel={liveLevel}
          rarityColor={rarityColor}
          onClose={closePanel}
        />
      )}

      {/* ── Skill Info Popup — hold to show, release to dismiss ──────────────── */}
      {heldSkillData && (() => {
        const { info, level, isLocked } = heldSkillData;
        const isMax = level >= 4;
        return (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 90,
            background: '#000',
            border: `2.5px solid ${isLocked ? 'rgba(150,150,200,0.7)' : '#F97316'}`,
            borderRadius: '10px',
            padding: '16px 20px',
            minWidth: '200px',
            maxWidth: 'min(320px, 55vw)',
            boxShadow: '0 0 32px rgba(249,115,22,0.35), 0 8px 40px rgba(0,0,0,0.9)',
            pointerEvents: 'none',
          }}>
            {/* Header: name + level badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
              <span style={{
                fontFamily: "'Roboto Condensed', sans-serif",
                fontSize: 'clamp(13px, 2.2vw, 17px)',
                fontWeight: 700, color: '#fff', letterSpacing: '0.04em',
              }}>{info.name}</span>
              <span style={{
                fontFamily: "'Roboto Condensed', sans-serif",
                fontSize: 'clamp(8px, 1.2vw, 11px)',
                fontWeight: 700,
                color: isLocked ? 'rgba(180,180,220,0.85)' : isMax ? '#F97316' : '#FFD700',
                border: `1px solid ${isLocked ? 'rgba(150,150,200,0.5)' : isMax ? '#F97316' : 'rgba(255,215,0,0.5)'}`,
                borderRadius: '4px', padding: '2px 6px',
                whiteSpace: 'nowrap',
              }}>{isLocked ? 'Locked — Lv. 1 Preview' : isMax ? 'MAX Lv.' : `Lv. ${level}`}</span>
            </div>
            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(249,115,22,0.45)', marginBottom: '10px' }}/>
            {/* Description */}
            <div style={{
              fontFamily: "'Roboto Condensed', sans-serif",
              fontSize: 'clamp(9px, 1.5vw, 12px)',
              color: 'rgba(255,255,255,0.68)',
              marginBottom: '12px', lineHeight: 1.5,
            }}>{info.description}</div>
            {/* Ratio rows — current → next (hidden when locked) */}
            {info.ratioLevels.map(r => {
              const cur  = r.values[level - 1] ?? r.values[0];
              const next = !isLocked && !isMax ? r.values[level] : undefined;
              return (
                <div key={r.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: '10px', marginBottom: '6px',
                }}>
                  <span style={{
                    fontFamily: "'Roboto Condensed', sans-serif",
                    fontSize: 'clamp(9px, 1.4vw, 12px)',
                    color: isLocked ? 'rgba(180,180,220,0.7)' : '#F97316',
                    letterSpacing: '0.06em', flexShrink: 0,
                  }}>{r.label}</span>
                  <span style={{
                    fontFamily: "'Roboto Condensed', sans-serif",
                    fontSize: 'clamp(9px, 1.4vw, 12px)',
                    fontWeight: 700, whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                    <span style={{ color: isLocked ? 'rgba(200,200,240,0.8)' : '#FFD700' }}>{cur}</span>
                    {next && <>
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.85em' }}>▶</span>
                      <span style={{ color: '#4ade80' }}>{next}</span>
                    </>}
                    {isMax && <span style={{ color: '#F97316', fontSize: '0.8em', marginLeft: '4px' }}>MAX</span>}
                  </span>
                </div>
              );
            })}
            {/* Next unlock info — only when skill is actively leveled (not locked preview) */}
            {!isMax && !isLocked && (
              <div style={{
                marginTop: '8px', paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                fontFamily: "'Roboto Condensed', sans-serif",
                fontSize: 'clamp(8px, 1.2vw, 10px)',
                color: 'rgba(255,255,255,0.38)',
              }}>Next upgrade → Lv. {info.ratioLevels[0]?.values[level] ? (level + 1) : '—'}</div>
            )}
          </div>
        );
      })()}

    </div>
  );
}