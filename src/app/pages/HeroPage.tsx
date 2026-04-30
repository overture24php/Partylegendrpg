import { useState } from 'react';
import { GamePageLayout } from '../components/GamePageLayout';
import { HeroDetailView } from '../components/HeroDetailView';
import { EmmaDetailView } from '../components/EmmaDetailView';
import { useLanguage } from '../context/LanguageContext';
import { useChromaKeyDataUrl } from '../utils/chromaKey';
import { HeroCardAnimated } from '../components/HeroCardAnimated';
import { LockedHeroCard } from '../components/LockedHeroCard';

// ─── Cloudinary base ───────────────────────────────────────────────────────────
const LUCAS_ILUST_SRC = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777386997/LUCAS_tyqcnf.png';
// Emma card illustration — frame 1, green-screen, chroma key applied client-side
const EMMA_ILUST_SRC  = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777387003/emma_aqsnsd.png';

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
  heroType: 'Fighter',
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

const EMMA = {
  name: 'Emma',
  rarity: 'rare',
  level: 1,
  heroType: 'Support',
  stats: {
    hp: 980,
    pAtk: 140,
    mAtk: 310,
    pDef: 175,
    mDef: 280,
    speed: 340,
    expCurrent: 0,
    expMax: 1000,
  },
};

// ─── Card dimensions ──────────────────────────────────────────────────────────
const CARD_W = 186;
const CARD_H = Math.round(CARD_W * 400 / 250);

// ─── Gallery roster (all heroes, obtained + locked) ───────────────────────────
const GALLERY_ROSTER: { name: string; rarity: string; heroType: string; ilust?: string; level?: number }[] = [
  // ── SS Mythic ──
  { name: 'Seraphiel',  rarity: 'mythic',    heroType: 'Celestial'  },
  { name: 'Malphas',    rarity: 'mythic',    heroType: 'Demon Lord' },
  // ── S Legendary ──
  { name: 'Theron',     rarity: 'legendary', heroType: 'Paladin'    },
  { name: 'Valeria',    rarity: 'legendary', heroType: 'Sorceress'  },
  { name: 'Kael',       rarity: 'legendary', heroType: 'Warlord'    },
  // ── A Epic ──
  { name: 'Zephyr',     rarity: 'epic',      heroType: 'Ranger'     },
  { name: 'Lyra',       rarity: 'epic',      heroType: 'Bard'       },
  { name: 'Dunmore',    rarity: 'epic',      heroType: 'Berserker'  },
  { name: 'Riven',      rarity: 'epic',      heroType: 'Rogue'      },
  // ── B Rare (Lucas & Emma obtained) ──
  { name: 'Lucas',      rarity: 'rare',      heroType: 'Fighter'    },
  { name: 'Emma',       rarity: 'rare',      heroType: 'Support'    },
  { name: 'Brennan',    rarity: 'rare',      heroType: 'Guardian'   },
  { name: 'Sylvia',     rarity: 'rare',      heroType: 'Archer'     },
  // ── C Common — illustrated ──
  { name: 'Rock Slime',  rarity: 'common', heroType: 'Tank',    level: 1,
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545681/ChatGPT_Image_Apr_30_2026_05_38_28_PM_wzt4ox.png' },
  { name: 'Acid Slime',  rarity: 'common', heroType: 'Ranged',  level: 1,
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545738/ChatGPT_Image_Apr_30_2026_05_39_48_PM_oq2njh.png' },
  { name: 'Water Slime', rarity: 'common', heroType: 'Support', level: 1,
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png' },
];

// ─── Five-pointed star path helper ───────────────────────────────────────────
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

function HeroCard({ name, rarity, level, ilust, heroType }: { name: string; rarity: string; level: number; ilust: string; heroType: string }) {
  const cfg     = HERO_RARITIES.find(r => r.id === rarity) ?? HERO_RARITIES[3];
  const safeId  = name.replace(/\s+/g, '-');
  const clipId  = `hc-clip-${safeId}`;
  const tgId    = `hc-tg-${safeId}`;
  const barFade = `hc-bar-${safeId}`;
  const botFade = `hc-botfade-${safeId}`;

  // ── Chroma key: load raw green-screen image, process pixels, get data URL ──
  const chromaUrl = useChromaKeyDataUrl(ilust);

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

      {/* Static clip <g> — locks to card frame coordinate space, never moves */}
      <g clipPath={`url(#${clipId})`}>
        {/* Parallax outer g — reads --hci-x/--hci-y CSS vars from HeroCardAnimated */}
        <g style={{ transform: 'translateX(var(--hci-x, 0px)) translateY(var(--hci-y, 0px))' }}>
          {/* Float + breath animation inner g */}
          <g className="hca-ilust-anim">
            {/* foreignObject + <img> shares decoded bitmap cache with chromaImgKeeper → instant render */}
            <foreignObject x="3" y="3" width="244" height="394">
              <img
                src={chromaUrl ?? ''}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center bottom', display: 'block' }}
              />
            </foreignObject>
          </g>
        </g>
      </g>

      <rect x="3" y="280" width="244" height="77" fill={`url(#${botFade})`} clipPath={`url(#${clipId})`}/>
      <rect x="3" y="291" width="185" height="25" fill={`url(#${barFade})`}/>

      <text x="11" y="304" textAnchor="start" dominantBaseline="middle"
        fill="#ffffff" fontFamily="'Playfair Display',serif" fontSize="13" fontWeight="700" letterSpacing="2"
        style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,1))' }}
      >{heroType}</text>

      {Array.from({ length: cfg.stars }).map((_, i) => (
        <path key={i} d={fiveStarPath(RS_X0 + i * RS_STEP, RS_CY, RS_R, RS_r)}
          fill="#FFD700" stroke="#000000" strokeWidth="1.2" strokeLinejoin="round"/>
      ))}

      <path d={starPath} fill="rgba(0,0,0,0.6)"/>
      <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle"
        fill={`url(#${tgId})`} stroke="#000000" strokeWidth="1.5" paintOrder="stroke"
        fontFamily="'Playfair Display',serif" fontSize="52" fontWeight="bold"
      >{cfg.text}</text>

      <rect x="3" y="357" width="244" height="40" fill="#000000" clipPath={`url(#${clipId})`}/>
      <polyline
        points="3,367 15,387 27,367 39,387 51,367 63,387 75,367 87,387 99,367 111,387 123,367 135,387 147,367 159,387 171,367 183,387 195,367 207,387 219,367 231,387 243,367"
        fill="none" stroke="rgba(100,60,10,0.35)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`}
      />

      <text x="125" y="378" textAnchor="middle" dominantBaseline="middle"
        fill="#ffffff" fontFamily="'Playfair Display',serif" fontSize="18" fontWeight="700" letterSpacing="3"
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
        fontFamily="'Playfair Display',serif" fontSize={lvFontSize} fontWeight="700" letterSpacing="1"
        clipPath={`url(#${clipId})`}
      >Lv. {level}</text>

      <rect x="1" y="1" width="248" height="398" rx="11" ry="11" fill="none" stroke={cfg.shine} strokeWidth="1" strokeOpacity="0.4"/>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HeroPage() {
  const [detailOpen, setDetailOpen]           = useState(false);
  const [emmaDetailOpen, setEmmaDetailOpen]   = useState(false);
  const [tab, setTab]                         = useState<'obtained' | 'gallery'>('obtained');
  const { t } = useLanguage();

  const cfg     = HERO_RARITIES.find(r => r.id === HERO.rarity)  ?? HERO_RARITIES[3];
  const emmaCfg = HERO_RARITIES.find(r => r.id === EMMA.rarity)  ?? HERO_RARITIES[3];

  const pageTitle = tab === 'obtained' ? t('hero.obtained_title') : t('hero.gallery_title');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', background: '#1a0535', overflow: 'hidden' }}>

      {/* ── Background Image ── */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'url(https://res.cloudinary.com/dhkethrmc/image/upload/v1777419184/ChatGPT_Image_Apr_29_2026_06_32_08_AM_hch81k.png)', backgroundSize:'cover', backgroundPosition:'center', opacity:0.4 }}/>

      {/* ── Dark overlay ── */}
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(26,5,53,0.7) 0%, rgba(26,5,53,0.85) 100%)', pointerEvents:'none' }}/>

      {/* ── Purple ambient glows ── */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(120,40,200,0.2) 0%, transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 60% 40% at 50% 90%, rgba(60,0,120,0.25) 0%, transparent 70%)', pointerEvents:'none' }}/>

      {/* ── Left tab buttons — horizontal row, aligned with title ── */}
      <div style={{
        position: 'absolute',
        top: '13%',
        left: '8px',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'row',
        gap: '6px',
        alignItems: 'center',
        transform: 'translateY(-50%)',
      }}>
        {([
          { id: 'obtained', label: t('hero.tab_obtained') },
          { id: 'gallery',  label: t('hero.tab_gallery')  },
        ] as const).map(({ id, label }) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive
                  ? 'linear-gradient(90deg, rgba(255,215,0,0.22) 0%, rgba(255,215,0,0.10) 100%)'
                  : 'rgba(0,0,0,0.48)',
                border: isActive
                  ? '1px solid rgba(255,215,0,0.60)'
                  : '1px solid rgba(255,255,255,0.14)',
                borderRadius: '999px',
                padding: '6px 14px',
                cursor: 'pointer',
                transition: 'all 0.18s',
                boxShadow: isActive ? '0 0 12px rgba(255,215,0,0.18)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                color: isActive ? '#FFD700' : 'rgba(255,255,255,0.72)',
                fontFamily: "'Roboto Condensed', sans-serif",
                fontSize: '11px',
                fontWeight: isActive ? 700 : 600,
                letterSpacing: '0.07em',
                textShadow: isActive ? '0 0 8px rgba(255,215,0,0.55)' : 'none',
              }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Page title — centered ── */}
      <div style={{ position:'absolute', top:'13%', left:'50%', transform:'translateX(-50%)', zIndex:10, textAlign:'center', pointerEvents:'none', whiteSpace:'nowrap' }}>
        <div style={{ color:'rgba(255,215,0,0.95)', fontFamily:"'Playfair Display',serif", fontSize:'clamp(12px,2vw,20px)', fontWeight:800, letterSpacing:'0.28em', textShadow:'0 2px 16px rgba(200,100,255,0.5), 0 1px 4px rgba(0,0,0,0.9)' }}>{pageTitle}</div>
      </div>

      {/* ── Orange separator — full width, no fade ── */}
      <div style={{ position:'absolute', top:'19.5%', left:0, right:0, height:'2px', zIndex:10, background:'rgba(255,140,0,0.85)', pointerEvents:'none' }}/>

      {/* ── Hero grid ── */}
      <div style={{
        position: 'absolute', top: '20.5%', bottom: '9%', left: 0, right: 0, zIndex: 10,
        overflowY: 'auto', overflowX: 'hidden',
        padding: '10px 10px 0 10px',
        display: 'flex', flexWrap: 'wrap',
        alignContent: 'flex-start', alignItems: 'flex-start', justifyContent: 'flex-start',
        gap: '8px',
      }}>
        {tab === 'obtained' ? (
          <>
            {/* Lucas card */}
            <div style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer' }} onClick={() => setDetailOpen(true)}>
              <HeroCardAnimated rarityColor={cfg.fill}>
                <HeroCard name={HERO.name} rarity={HERO.rarity} level={HERO.level} ilust={LUCAS_ILUST_SRC} heroType={HERO.heroType}/>
              </HeroCardAnimated>
            </div>
            {/* Emma card */}
            <div style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer' }} onClick={() => setEmmaDetailOpen(true)}>
              <HeroCardAnimated rarityColor={emmaCfg.fill}>
                <HeroCard name={EMMA.name} rarity={EMMA.rarity} level={EMMA.level} ilust={EMMA_ILUST_SRC} heroType={EMMA.heroType}/>
              </HeroCardAnimated>
            </div>
          </>
        ) : (
          <>
            {GALLERY_ROSTER.map(hero => {
              const heroCfg = HERO_RARITIES.find(r => r.id === hero.rarity) ?? HERO_RARITIES[4];
              if (hero.name === 'Lucas') return (
                <div key={hero.name} style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer' }} onClick={() => setDetailOpen(true)}>
                  <HeroCardAnimated rarityColor={cfg.fill}>
                    <HeroCard name={HERO.name} rarity={HERO.rarity} level={HERO.level} ilust={LUCAS_ILUST_SRC} heroType={HERO.heroType}/>
                  </HeroCardAnimated>
                </div>
              );
              if (hero.name === 'Emma') return (
                <div key={hero.name} style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer' }} onClick={() => setEmmaDetailOpen(true)}>
                  <HeroCardAnimated rarityColor={emmaCfg.fill}>
                    <HeroCard name={EMMA.name} rarity={EMMA.rarity} level={EMMA.level} ilust={EMMA_ILUST_SRC} heroType={EMMA.heroType}/>
                  </HeroCardAnimated>
                </div>
              );
              if (hero.ilust) return (
                <div key={hero.name} style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0 }}>
                  <HeroCardAnimated rarityColor={heroCfg.fill}>
                    <HeroCard name={hero.name} rarity={hero.rarity} level={hero.level ?? 1} ilust={hero.ilust} heroType={hero.heroType}/>
                  </HeroCardAnimated>
                </div>
              );
              return (
                <div key={hero.name} style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0 }}>
                  <LockedHeroCard name={hero.name} rarity={hero.rarity} heroType={hero.heroType}/>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Shared game overlay UI ── */}
      <GamePageLayout activeTab="hero" hidePlayerInfo/>

      {/* ── Lucas detail overlay ── */}
      {detailOpen && (
        <HeroDetailView
          name={HERO.name}
          rarity={HERO.rarity}
          rarityLabel={cfg.label}
          rarityColor={cfg.fill}
          rarityShine={cfg.shine}
          level={HERO.level}
          ilust={LUCAS_ILUST_SRC}
          stats={HERO.stats}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {/* ── Emma detail overlay ── */}
      {emmaDetailOpen && (
        <EmmaDetailView
          name={EMMA.name}
          rarity={EMMA.rarity}
          rarityLabel={emmaCfg.label}
          rarityColor={emmaCfg.fill}
          rarityShine={emmaCfg.shine}
          level={EMMA.level}
          ilust={EMMA_ILUST_SRC}
          stats={EMMA.stats}
          onClose={() => setEmmaDetailOpen(false)}
        />
      )}
    </div>
  );
}