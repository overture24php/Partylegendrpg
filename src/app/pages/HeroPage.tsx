import { useState } from 'react';
import { GamePageLayout } from '../components/GamePageLayout';
import { HeroDetailView } from '../components/HeroDetailView';

// ─── Cloudinary base ───────────────────────────────────────────────────────────
const LUCAS_ILUST = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777137886/ILUST_LUCAS_rpwdoz.png';

// ─── Rarity configs ───────────────────────────────────────────────────────────
const HERO_RARITIES = [
  { id: 'mythic',    label: 'Mythic',    text: 'SS', border: '#450A0A', fill: '#E00000', shine: '#FCA5A5', stars: 5 },
  { id: 'legendary', label: 'Legendary', text: 'S',  border: '#78350F', fill: '#FB923C', shine: '#FED7AA', stars: 4 },
  { id: 'epic',      label: 'Epic',      text: 'A',  border: '#3B0764', fill: '#A855F7', shine: '#D8B4FE', stars: 3 },
  { id: 'rare',      label: 'Rare',      text: 'B',  border: '#1E3A5F', fill: '#1877F2', shine: '#93C5FD', stars: 2 },
  { id: 'common',    label: 'Common',    text: 'C',  border: '#14532D', fill: '#22C55E', shine: '#86EFAC', stars: 1 },
];

// ─── Hero data + stats ────────────────────────────────────────────────────────
const HERO = {
  name: 'Lucas',
  rarity: 'rare',
  level: 1,
  stats: {
    hp: 1250,
    pAtk: 320,
    mAtk: 180,
    pDef: 245,
    mDef: 190,
    speed: 310,
    expCurrent: 120,
    expMax: 1000,
  },
};

// ─── Card dimensions ──────────────────────────────────────────────────────────
const CARD_W = 186;
const CARD_H = Math.round(CARD_W * 400 / 250);

// ─── Five-pointed star path helper ────────────────────────────────────────────
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

function HeroCard({ name, rarity, level, ilust }: { name: string; rarity: string; level: number; ilust: string }) {
  const cfg     = HERO_RARITIES.find(r => r.id === rarity) ?? HERO_RARITIES[3];
  const clipId  = `hc-clip-${name}`;
  const tgId    = `hc-tg-${name}`;
  const barFade = `hc-bar-${name}`;
  const botFade = `hc-botfade-${name}`;

  const sx = cfg.text === 'SS' ? 210 : 218;
  const sy = 321;
  const starPath = `M ${sx},${sy-28} Q ${sx+5},${sy-5} ${sx+28},${sy} Q ${sx+5},${sy+5} ${sx},${sy+28} Q ${sx-5},${sy+5} ${sx-28},${sy} Q ${sx-5},${sy-5} ${sx},${sy-28} Z`;

  const RS_R = 14, RS_r = 5.3, RS_CY = 338, RS_X0 = 24, RS_STEP = 32;

  const S = 66;
  const lvFontSize = level >= 100 ? 11 : level >= 10 ? 14 : 18;
  const lvStroke   = level >= 100 ? 3   : level >= 10 ? 3.5 : 4;

  return (
    <svg viewBox="0 0 250 400" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink"
      style={{ display: 'block', width: '100%', height: '100%', filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.7))' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="3" y="3" width="244" height="394" rx="10" ry="10"/>
        </clipPath>
        <linearGradient id={tgId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={cfg.shine} stopOpacity="1"/>
          <stop offset="48%"  stopColor={cfg.shine} stopOpacity="1"/>
          <stop offset="100%" stopColor={cfg.fill}  stopOpacity="1"/>
        </linearGradient>
        <linearGradient id={barFade} x1="0" y1="0" x2="1" y2="0">
          <stop offset="55%"  stopColor="#000000" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={botFade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#000000" stopOpacity="0"/>
          <stop offset="100%" stopColor="#000000" stopOpacity="1"/>
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="250" height="400" rx="12" ry="12" fill={cfg.border}/>
      <rect x="3" y="3" width="244" height="394" rx="10" ry="10" fill={cfg.fill}/>
      <rect x="3" y="3" width="244" height="394" rx="10" ry="10" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2"/>

      <image href={ilust} x="3" y="3" width="244" height="394" preserveAspectRatio="xMidYMax slice" clipPath={`url(#${clipId})`}/>

      <rect x="3" y="280" width="244" height="77" fill={`url(#${botFade})`} clipPath={`url(#${clipId})`}/>
      <rect x="3" y="291" width="185" height="25" fill={`url(#${barFade})`}/>

      <text x="11" y="304" textAnchor="start" dominantBaseline="middle"
        fill="#ffffff" fontFamily="'Cinzel',serif" fontSize="13" fontWeight="700" letterSpacing="2"
        style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,1))' }}
      >Fighter</text>

      {Array.from({ length: cfg.stars }).map((_, i) => (
        <path key={i} d={fiveStarPath(RS_X0 + i * RS_STEP, RS_CY, RS_R, RS_r)}
          fill="#FFD700" stroke="#000000" strokeWidth="1.2" strokeLinejoin="round"/>
      ))}

      <path d={starPath} fill="rgba(0,0,0,0.6)"/>
      <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle"
        fill={`url(#${tgId})`} stroke="#000000" strokeWidth="1.5" paintOrder="stroke"
        fontFamily="'Georgia',serif" fontSize="52" fontWeight="bold"
      >{cfg.text}</text>

      <rect x="3" y="357" width="244" height="40" fill="#000000" clipPath={`url(#${clipId})`}/>
      <polyline
        points="3,367 15,387 27,367 39,387 51,367 63,387 75,367 87,387 99,367 111,387 123,367 135,387 147,367 159,387 171,367 183,387 195,367 207,387 219,367 231,387 243,367"
        fill="none" stroke="rgba(100,60,10,0.35)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`}
      />

      <text x="125" y="378" textAnchor="middle" dominantBaseline="middle"
        fill="#ffffff" fontFamily="'Cinzel',serif" fontSize="18" fontWeight="700" letterSpacing="3"
        clipPath={`url(#${clipId})`}
        style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,1))' }}
      >{name}</text>

      {/* ── Level triangle badge ── */}
      <path d={`M 3,3 L ${3 + S},3 L 3,${3 + S} Z`} fill="rgba(0,0,0,0.78)" clipPath={`url(#${clipId})`}/>
      <text
        x={3 + S * 0.28} y={3 + S * 0.28}
        textAnchor="middle" dominantBaseline="middle"
        transform={`rotate(-45, ${3 + S * 0.28}, ${3 + S * 0.28})`}
        fill="#ffffff" stroke="#000000" strokeWidth={lvStroke} paintOrder="stroke"
        fontFamily="'Cinzel',serif" fontSize={lvFontSize} fontWeight="700" letterSpacing="1"
        clipPath={`url(#${clipId})`}
      >Lv. {level}</text>

      <rect x="1" y="1" width="248" height="398" rx="11" ry="11" fill="none" stroke={cfg.shine} strokeWidth="1" strokeOpacity="0.4"/>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HeroPage() {
  const [detailOpen, setDetailOpen] = useState(false);

  const cfg = HERO_RARITIES.find(r => r.id === HERO.rarity) ?? HERO_RARITIES[3];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', background: '#1a0535', overflow: 'hidden' }}>

      {/* ── Purple ambient glows ── */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(120,40,200,0.35) 0%, transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 60% 40% at 50% 90%, rgba(60,0,120,0.4) 0%, transparent 70%)', pointerEvents:'none' }}/>

      {/* ── Page title ── */}
      <div style={{ position:'absolute', top:'13%', left:'50%', transform:'translateX(-50%)', zIndex:10, textAlign:'center', pointerEvents:'none' }}>
        <div style={{ color:'rgba(255,215,0,0.95)', fontFamily:"'Cinzel',serif", fontSize:'clamp(12px,2vw,20px)', fontWeight:800, letterSpacing:'0.28em', textShadow:'0 2px 16px rgba(200,100,255,0.5), 0 1px 4px rgba(0,0,0,0.9)' }}>HEROES</div>
        <div style={{ marginTop:'3px', color:'rgba(255,255,255,0.3)', fontFamily:'monospace', fontSize:'clamp(7px,0.85vw,9px)', letterSpacing:'0.14em' }}>1 HERO COLLECTED</div>
      </div>

      {/* ── Gold separator ── */}
      <div style={{ position:'absolute', top:'19.5%', left:'10%', right:'10%', height:'2px', zIndex:10, background:'linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.6) 20%, rgba(255,215,0,0.9) 50%, rgba(255,215,0,0.6) 80%, transparent 100%)', pointerEvents:'none' }}/>

      {/* ── Hero grid ── */}
      <div style={{
        position: 'absolute', top: '20.5%', bottom: '9%', left: 0, right: 0, zIndex: 10,
        overflowY: 'auto', overflowX: 'hidden',
        padding: '10px 10px 0 10px',
        display: 'flex', flexWrap: 'wrap',
        alignContent: 'flex-start', alignItems: 'flex-start', justifyContent: 'flex-start',
        gap: '8px',
      }}>
        {/* Hero card — click to open detail */}
        <div
          style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer', transition: 'transform 0.15s' }}
          onClick={() => setDetailOpen(true)}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <HeroCard name={HERO.name} rarity={HERO.rarity} level={HERO.level} ilust={LUCAS_ILUST}/>
        </div>
      </div>

      {/* ── Shared game overlay UI ── */}
      <GamePageLayout activeTab="hero" hidePlayerInfo/>

      {/* ── Hero detail overlay ── */}
      {detailOpen && (
        <HeroDetailView
          name={HERO.name}
          rarity={HERO.rarity}
          rarityLabel={cfg.label}
          rarityColor={cfg.fill}
          rarityShine={cfg.shine}
          level={HERO.level}
          ilust={LUCAS_ILUST}
          stats={HERO.stats}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}