/**
 * HeroDetailView — full-screen overlay showing hero detail stats + action tabs.
 *
 * ── SPRITE ANIMATION (no-glitch, no-flicker) ─────────────────────────────────
 * 1. Global lucasImgCache populated by LoadingPage → SAME HTMLImageElement objects,
 *    zero re-decode → instant first frame.
 * 2. isCacheReady() checked synchronously in useState() initializer → if warm,
 *    loaded=true from the very first render (no shimmer, no delay).
 * 3. Canvas size set imperatively via ResizeObserver — no setState() round-trip.
 * 4. Single persistent <canvas> + RAF loop — no DOM swap per frame.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import { LUCAS_FRAMES, lucasImgCache, isCacheReady } from '../utils/lucasCache';
import { useAuth } from '../context/AuthContext';

const ANIM_FPS = 12;

// ─── Number formatter K / M / B ───────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${+(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ─── Currency formatter (same as GamePageLayout) ──────────────────────────────
function fmtCurrency(n: number): string {
  if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${+(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ─── Currency Resource Box (matches GamePageLayout ResourceBox shape) ─────────
function CurrencyBox({ left, children }: { left: string; children: React.ReactNode }) {
  return (
    <div style={{ position:'absolute', left, top:0, width:`${(1/8)*100}%`, height:`${(1/12)*100}%`, zIndex:25, pointerEvents:'none' }}>
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="20" y="20" width="60" height="60" fill="rgba(0,0,0,0.4)"/>
        <path d="M 20,20 Q 0,20 0,50 Q 0,80 20,80 Z" fill="rgba(0,0,0,0.4)"/>
        <path d="M 80,20 Q 100,20 100,50 Q 100,80 80,80 Z" fill="rgba(0,0,0,0.4)"/>
      </svg>
      {children}
    </div>
  );
}

// ─── Sprite Player ────────────────────────────────────────────────────────────
function LucasSpritePlayer({ rarityColor }: { rarityColor: string }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef     = useRef<HTMLImageElement[]>([]);
  const frameRef     = useRef(0);
  const rafRef       = useRef<number | null>(null);
  const lastTimeRef  = useRef<number>(0);

  // Synchronous warm-cache check — no setState round-trip if LoadingPage already ran
  const [loaded, setLoaded] = useState<boolean>(() => {
    if (isCacheReady()) {
      cacheRef.current = lucasImgCache.slice();
      return true;
    }
    return false;
  });

  // ── Fallback preload (only if LoadingPage was skipped) ─────────────────────
  useEffect(() => {
    if (loaded) return; // already warm
    let settled = 0;
    const total = LUCAS_FRAMES.length;
    LUCAS_FRAMES.forEach((src, i) => {
      const existing = lucasImgCache[i];
      if (existing?.naturalWidth > 0) {
        settled++;
        if (settled >= total) { cacheRef.current = lucasImgCache.slice(); setLoaded(true); }
        return;
      }
      const img = new Image();
      img.onload = img.onerror = () => {
        lucasImgCache[i] = img;
        settled++;
        if (settled >= total) { cacheRef.current = lucasImgCache.slice(); setLoaded(true); }
      };
      img.src = src;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Canvas size — imperative, no setState round-trip ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const el     = containerRef.current;
    if (!canvas || !el) return;
    const sync = () => {
      canvas.width  = el.clientWidth  || 300;
      canvas.height = el.clientHeight || 500;
    };
    sync(); // immediate on mount
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── RAF animation loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    const INTERVAL = 1000 / ANIM_FPS;
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (ts - lastTimeRef.current < INTERVAL) return;
      lastTimeRef.current = ts;

      frameRef.current = (frameRef.current + 1) % LUCAS_FRAMES.length;
      const img    = cacheRef.current[frameRef.current];
      const canvas = canvasRef.current;
      if (!img || !canvas || img.naturalWidth === 0) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cW    = canvas.width;
      const cH    = canvas.height;
      const scale = Math.min(cW / img.naturalWidth, cH / img.naturalHeight);
      const drawW = img.naturalWidth  * scale;
      const drawH = img.naturalHeight * scale;

      // ── Grid-relative pos: target col I (idx 9) / row 17 (full-screen grid) ─
      // No top bar → canvas top = screen top = 0 → cH = screenH
      // 1 col = screenW/20 = (cW + 235)/20  (235 = left 155 + right 80)
      // 1 row = screenH/20 = cH/20
      // Horizontal: original calibrated formula — canvas-center shifted left 1 col
      const colW = (cW + 235) / 20;             // 1 grid-col width in screen px
      const dx   = (cW - drawW) / 2 - colW;     // shift left 1 col from center
      const dy   = 17 * cH / 20 - drawH;        // feet at row 17 (full-screen grid)

      ctx.clearRect(0, 0, cW, cH);
      ctx.drawImage(img, dx, dy, drawW, drawH);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [loaded]);

  const filterStyle = `drop-shadow(0 0 40px ${rarityColor}55) drop-shadow(0 8px 24px rgba(0,0,0,0.9))`;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', height: '92%', width: '100%' }}
    >
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.10) 50%,rgba(255,255,255,0.04) 100%)',
          borderRadius: '8px', animation: 'pulse 1.5s infinite',
        }}/>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%', height: '100%',
          filter: filterStyle,
          pointerEvents: 'none', userSelect: 'none',
        }}
      />
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Rarity star count (matches SvgLibraryPage HERO_CARD_CFGS) ───────────────
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
const HERO_DETAIL_BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777208680/copy_of_d418651b-bb45-48b4-bce7-4152ac79bac1_f1c136.png';

// ─── Main Component ───────────────────────────────────────────────────────────
export function HeroDetailView({
  name, rarity, rarityLabel, rarityColor, rarityShine,
  level, ilust, stats, onClose,
}: HeroDetailViewProps) {
  const [activeTab, setActiveTab] = useState<string>('levelup');
  const { user } = useAuth();
  const expPct     = Math.round((stats.expCurrent / stats.expMax) * 100);
  const badgeColor = BADGE_COLORS[rarity] ?? '#1877F2';
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
      ctx.font          = `bold ${labelSize}px monospace`;
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
      <div style={{ position:'absolute', inset:0, zIndex:2, background:'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(130,40,220,0.28) 0%, transparent 65%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', inset:0, zIndex:2, background:'radial-gradient(ellipse 60% 45% at 50% 105%, rgba(60,0,120,0.35) 0%, transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', width:'320px', height:'480px', zIndex:2, background:`radial-gradient(ellipse 80% 90% at 50% 60%, ${rarityColor}20 0%, transparent 70%)`, pointerEvents:'none' }}/>

      {/* ── Floating BACK button — top-left ───��─────────────────────────────── */}
      <button onClick={onClose} style={{
        position: 'absolute', top: '14px', left: '14px', zIndex: 20,
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(0,0,0,0.50)', border: `1px solid ${rarityColor}55`,
        borderRadius: '6px', padding: '6px 12px', cursor: 'pointer',
        color: '#FFD700', fontFamily: "'Cinzel',serif", fontSize: '11px',
        fontWeight: 700, letterSpacing: '0.12em',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M8 2 L4 6 L8 10" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        BACK
      </button>

      {/* ═══════════════════════════════════════════════════════════════════════
          A3–C3 │ Rarity color bar — full-width bg strip behind icon + name
          Color = rarityColor, fade-out on right side
          z:14 (below icon z:15)
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute',
        left: '0%', top: '10%',
        width: '15%',  /* 3 cols = 3/20 = 15% */
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
            fontFamily="'Georgia', serif"
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
          A4–C4 │ Rating stars — exact fiveStarPath from SvgLibraryPage
          RS_R=14, RS_r=5.3, RS_CY=338, RS_X0=24, RS_STEP=32
          Row 4 = top:15%, height:5%  |  A–C = left:0%, width:15%
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
            width: '15%', height: '5%',
            zIndex: 15,
            display: 'flex', alignItems: 'center',
            paddingLeft: '0.5%',
            pointerEvents: 'none',
          }}>
            <svg
              viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
              preserveAspectRatio="xMinYMid meet"
              style={{ height: '70%', width: 'auto', overflow: 'visible' }}
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

      {/* ══════════════════════════════════════════════════════════════════════
          A4–C4 │ Thin dark-orange bottom rule — align-down, fade right
          left:0%, top:calc(20% - 1.5px), width:15%
          z:15
      ═════════════════════════════════════════════════════════════════════= */}
      <div style={{
        position: 'absolute',
        left: '0%',
        top: 'calc(20% - 1.5px)',
        width: '15%',
        height: '1.5px',
        zIndex: 15,
        background: 'linear-gradient(90deg, #92400e 0%, #b45309 40%, #b4530966 75%, transparent 100%)',
        pointerEvents: 'none',
      }}/>

      {/* ══════════════════════════════════════════════════════════════════════
          B3–C3 │ Hero Name  — col B→C, row 3, h=1 grid, z:15
          SVG text fills full 1-grid height, white fill + black frame stroke
          col B starts at 5%,  width 2 cols = 10%
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute',
        left: '5%', top: '10%',
        width: '10%',   /* 2 grid columns */
        height: '5%',   /* 1 grid row     */
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        {/* SVG text: fill white, stroke black (paintOrder:stroke) — height = 1 grid */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 40"
          preserveAspectRatio="xMinYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible' }}
        >
          <text
            x="0" y="34"
            fontFamily="'Cinzel', serif"
            fontWeight="900"
            fontSize="36"
            fill="white"
            stroke="black"
            strokeWidth="4"
            paintOrder="stroke"
            letterSpacing="3"
          >
            {name.toUpperCase()}
          </text>
        </svg>
      </div>

      {/* ── Left Stats Panel — glass, top:0, content offset 4 grid rows ─────── */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: '155px',
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
              <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Cinzel',serif", fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em' }}>LEVEL</span>
              <span style={{ color: '#FFD700', fontFamily: "'Cinzel',serif", fontSize: '20px', fontWeight: 800, textShadow: '0 0 12px rgba(255,215,0,0.6)' }}>{level}</span>
            </div>
            {/* EXP bar */}
            <div style={{ position: 'relative', paddingRight: '30px' }}>
              <div style={{ position: 'relative', height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${expPct}%`, background: 'linear-gradient(90deg, #4ade80 0%, #86efac 80%, #d9f99d 100%)', borderRadius: '5px', boxShadow: '0 0 6px rgba(74,222,128,0.6)' }}/>
                <div style={{ position: 'absolute', left: 0, top: 0, width: `${expPct}%`, height: '40%', background: 'rgba(255,255,255,0.2)', borderRadius: '5px', pointerEvents: 'none' }}/>
              </div>
              <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: '#86efac', fontFamily: 'monospace', fontSize: '9px', fontWeight: 700 }}>{expPct}%</span>
            </div>
            {/* EXP text — K/M/B format */}
            <div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', fontSize: '8px', letterSpacing: '0.06em' }}>
              {fmtNum(stats.expCurrent)} / {fmtNum(stats.expMax)} EXP
            </div>
          </div>

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
              <span style={{ color: 'rgba(255,255,255,0.62)', fontFamily: "'Cinzel',serif", fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', flex: 1 }}>{label}</span>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontFamily: "'Cinzel',serif", fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em' }}>{fmtNum(value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Center Illustration — top:0 (no top bar) ────────────────────────── */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: '155px', right: '80px',
        zIndex: 5,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <LucasSpritePlayer rarityColor={rarityColor} />
        <div style={{
          position: 'absolute', bottom: 0, left: '10%', right: '10%', height: '60px',
          background: `radial-gradient(ellipse 80% 100% at 50% 100%, ${rarityColor}44 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}/>
      </div>

      {/* ── Right Action Tabs — glass, top:0 ─────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: '80px',
        zIndex: 10,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderLeft: '1px solid rgba(255,255,255,0.10)',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        paddingTop: '8px', gap: '4px',
      }}>
        {ACTION_TABS.map(({ id, label, icon: TabIcon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                position: 'relative',
                background: isActive ? 'rgba(255,215,0,0.12)' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '3px solid #FFD700' : '3px solid transparent',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
                padding: '10px 4px 8px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                transition: 'background 0.18s',
              }}
            >
              <TabIcon active={isActive} />
              <span style={{
                color: isActive ? '#FFD700' : 'rgba(255,255,255,0.55)',
                fontFamily: "'Cinzel',serif",
                fontSize: '8px',
                fontWeight: isActive ? 700 : 600,
                letterSpacing: '0.08em',
                textAlign: 'center',
                lineHeight: '1.3',
                textShadow: isActive ? '0 0 8px rgba(255,215,0,0.6)' : 'none',
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}>
                {label === 'Level UP' ? 'Level\nUP' : label === 'Star UP' ? 'Star\nUP' : label}
              </span>
              {isActive && (
                <div style={{
                  position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                  width: '4px', height: '4px', borderRadius: '50%',
                  background: '#FFD700', boxShadow: '0 0 6px #FFD700',
                }}/>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Currency Bars — Hero EXP / Gold / Gems
          Posisi IDENTIK dengan GamePageLayout ResourceBox:
            4.5/8 = 56.25%  |  5.5/8 = 68.75%  |  6.5/8 = 81.25%
          Width=1/8=12.5%, Height=1/12=8.33%, z:25
      ═════════════════════════════════════════════════════════════════════= */}

      {/* Hero EXP — col 4.5/8 (= GamePageLayout) */}
      <CurrencyBox left={`${(4.5/8)*100}%`}>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:'8%', paddingRight:'8%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path d="M 5,6 L 5,14 Q 5,17 8,17 Q 11,17 11,14 L 11,6 Z" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/>
              <path d="M 5.5,10 L 5.5,13.5 Q 5.5,16 8,16 Q 10.5,16 10.5,13.5 L 10.5,10 Z" fill="#4488ff"/>
              <rect x="6" y="3" width="4" height="3" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/>
              <ellipse cx="8" cy="3" rx="2.5" ry="1.2" fill="#8B4513"/>
              <ellipse cx="8" cy="2.2" rx="2.5" ry="1" fill="#A0522D"/>
            </svg>
            <span style={{ color:'#88ccff', fontFamily:"'Cinzel',serif", fontSize:'14px', fontWeight:600, letterSpacing:'0.06em', textShadow:'0 1px 4px rgba(0,0,0,0.9)', whiteSpace:'nowrap' }}>{fmtCurrency(user?.hero_exp ?? 0)}</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
      </CurrencyBox>

      {/* Gold — col 5.5/8 (= GamePageLayout) */}
      <CurrencyBox left={`${(5.5/8)*100}%`}>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:'8%', paddingRight:'8%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#D4A017"/>
              <circle cx="12" cy="12" r="8"  fill="#F5C842"/>
              <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#8B6000" fontFamily="serif">G</text>
            </svg>
            <span style={{ color:'#F5C842', fontFamily:"'Cinzel',serif", fontSize:'14px', fontWeight:600, letterSpacing:'0.06em', textShadow:'0 1px 4px rgba(0,0,0,0.9)', whiteSpace:'nowrap' }}>{fmtCurrency(user?.gold ?? 0)}</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
      </CurrencyBox>

      {/* Gems — col 6.5/8 (= GamePageLayout) */}
      <CurrencyBox left={`${(6.5/8)*100}%`}>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:'8%', paddingRight:'8%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <svg width="18" height="20" viewBox="0 0 14 16" fill="none">
              <polygon points="7,0 14,5 7,16 0,5" fill="#1AADEE"/>
              <polygon points="7,0 14,5 7,7 0,5"  fill="#5BCFFF"/>
              <polygon points="7,0 10,5 7,7 4,5"  fill="#A8EEFF"/>
            </svg>
            <span style={{ color:'#5BCFFF', fontFamily:"'Cinzel',serif", fontSize:'14px', fontWeight:600, letterSpacing:'0.06em', textShadow:'0 1px 4px rgba(0,0,0,0.9)', whiteSpace:'nowrap' }}>{fmtCurrency(user?.gems ?? 0)}</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
      </CurrencyBox>

      {/* ══════════════════════════════════════════════════════════════════════
          H18–M18 │ Power Bar
          H = col 7 → left 35%   |  M right edge = col 13 → right at 65%
          width = 6 cols = 30%   |  row 18 top = 85%, height = 5%
          Background: solid black 40% transparent, fade left + right sides
          H18 (1 col = 5%) = power icon
          I18–M18 (5 cols = 25%) = power number, same SVG text size as hero name
          z:15
      ═════════════════════════════════════════════════════════════════════= */}

      {/* Background bar — H18 to M18 */}
      <div style={{
        position: 'absolute',
        left: '35%', top: '85%',
        width: '30%', height: '5%',
        zIndex: 15,
        background: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.4) 10%, rgba(0,0,0,0.4) 90%, transparent 100%)',
        pointerEvents: 'none',
      }}/>

      {/* Power icon — H18 (col 7, 1 col = 5%) */}
      <div style={{
        position: 'absolute',
        left: '35%', top: '85%',
        width: '5%', height: '5%',
        zIndex: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        {/* Raised fist / power icon — solid white */}
        <svg viewBox="0 0 24 28" style={{ height: '60%', width: 'auto' }} fill="none">
          {/* Fist fingers top */}
          <rect x="5"  y="5"  width="4" height="7" rx="2" fill="white"/>
          <rect x="10" y="4"  width="4" height="8" rx="2" fill="white"/>
          <rect x="15" y="5"  width="4" height="7" rx="2" fill="white"/>
          {/* Palm */}
          <rect x="4"  y="11" width="16" height="9" rx="2.5" fill="white"/>
          {/* Thumb */}
          <rect x="1"  y="12" width="5"  height="4" rx="2" fill="white"/>
          {/* Wrist / cuff band */}
          <rect x="5"  y="19" width="14" height="3" rx="1" fill="white" fillOpacity="0.5"/>
          {/* Power bolt overlay */}
          <path d="M13 8 L10 14 L13 14 L11 20 L16 12 L13 12 Z" fill="rgba(0,0,0,0.35)"/>
        </svg>
      </div>

      {/* Power number — I18 to M18 (col 8 → 40%, width 5 cols = 25%) */}
      <div style={{
        position: 'absolute',
        left: '40%', top: '85%',
        width: '25%', height: '5%',
        zIndex: 16,
        display: 'flex', alignItems: 'center',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        {/* SVG text — same size as hero name (fontSize=36 in viewBox 0 0 200 40) */}
        <svg
          width="100%" height="100%"
          viewBox="0 0 400 40"
          preserveAspectRatio="xMinYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible' }}
        >
          <text
            x="0" y="34"
            fontFamily="'Cinzel', serif"
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
          position: 'absolute', bottom: '16px', right: '96px', zIndex: 61,
          display: 'flex', alignItems: 'center', gap: '6px',
          background:     showGrid ? 'rgba(255,220,80,0.18)' : 'rgba(0,0,0,0.5)',
          border:         showGrid ? '1px solid rgba(255,220,80,0.6)' : '1px solid rgba(255,255,255,0.25)',
          color:          showGrid ? 'rgba(255,220,80,1)' : '#fff',
          fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.12em',
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