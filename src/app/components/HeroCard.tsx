/**
 * HeroCard — shared SVG hero card design.
 * Used by HeroPage (gallery + obtained grid) and TavernPage (gacha result).
 * This is the canonical card rendering — update here to change design everywhere.
 */
import { memo } from 'react';
import { useChromaKeyDataUrl } from '../utils/chromaKey';
import { HeroCardAnimated } from './HeroCardAnimated';

export const HERO_RARITIES = [
  { id: 'mythic',    label: 'Mythic',    text: 'SS', border: '#450A0A', fill: '#E00000', shine: '#FCA5A5', stars: 5 },
  { id: 'legendary', label: 'Legendary', text: 'S',  border: '#78350F', fill: '#FB923C', shine: '#FED7AA', stars: 4 },
  { id: 'epic',      label: 'Epic',      text: 'A',  border: '#3B0764', fill: '#A855F7', shine: '#D8B4FE', stars: 3 },
  { id: 'rare',      label: 'Rare',      text: 'B',  border: '#1E3A5F', fill: '#1877F2', shine: '#93C5FD', stars: 2 },
  { id: 'common',    label: 'Common',    text: 'C',  border: '#14532D', fill: '#22C55E', shine: '#86EFAC', stars: 1 },
] as const;

export type RarityId = typeof HERO_RARITIES[number]['id'];

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

interface HeroCardProps {
  name:     string;
  rarity:   string;
  level:    number;
  ilust:    string;
  heroType: string;
  /** Player's current star count — overrides the rarity default when provided */
  stars?:   number;
  /** unique id suffix to avoid SVG id collisions when multiple cards render */
  uid?:     string;
}

/** Raw SVG card — no animated wrapper. Wrap in HeroCardAnimated yourself if needed. */
export const HeroCard = memo(function HeroCard({ name, rarity, level, ilust, heroType, stars, uid }: HeroCardProps) {
  const cfg      = HERO_RARITIES.find(r => r.id === rarity) ?? HERO_RARITIES[4];
  const safeId   = uid ?? name.replace(/\s+/g, '-');
  const clipId   = `hc-clip-${safeId}`;
  const tgId     = `hc-tg-${safeId}`;
  const barFade  = `hc-bar-${safeId}`;
  const botFade  = `hc-botfade-${safeId}`;
  const chromaUrl = useChromaKeyDataUrl(ilust);

  const sx = cfg.text === 'SS' ? 210 : 218;
  const sy = 321;
  const starPath = `M ${sx},${sy-28} Q ${sx+5},${sy-5} ${sx+28},${sy} Q ${sx+5},${sy+5} ${sx},${sy+28} Q ${sx-5},${sy+5} ${sx-28},${sy} Q ${sx-5},${sy-5} ${sx},${sy-28} Z`;
  const RS_R = 14, RS_r = 5.3, RS_CY = 338, RS_X0 = 24, RS_STEP = 32;
  const S = 66;
  const lvFontSize = level >= 100 ? 11 : level >= 10 ? 14 : 18;
  const lvStroke   = level >= 100 ? 3   : level >= 10 ? 3.5 : 4;
  // Use player's actual star count if provided; clamp to sensible range
  const starCount  = stars !== undefined ? Math.max(1, Math.min(16, stars)) : cfg.stars;

  return (
    <svg
      viewBox="0 0 250 400"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      style={{ display: 'block', width: '100%', height: '100%', filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.7))' }}
    >
      <defs>
        <clipPath id={clipId}><rect x="3" y="3" width="244" height="394" rx="10" ry="10"/></clipPath>
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

      {/* ── Illustration: SVG <image> avoids foreignObject flickering on mobile ── */}
      <g clipPath={`url(#${clipId})`}>
        <g style={{ transform: 'translateX(var(--hci-x, 0px)) translateY(var(--hci-y, 0px))' }}>
          <g className="hca-ilust-anim">
            {chromaUrl ? (
              <image
                href={chromaUrl}
                x="3" y="3" width="244" height="394"
                preserveAspectRatio="xMidYMax slice"
              />
            ) : null}
          </g>
        </g>
      </g>

      <rect x="3" y="280" width="244" height="77" fill={`url(#${botFade})`} clipPath={`url(#${clipId})`}/>
      <rect x="3" y="291" width="185" height="25" fill={`url(#${barFade})`}/>

      <text x="11" y="304" textAnchor="start" dominantBaseline="middle"
        fill="#ffffff" fontFamily="'Playfair Display',serif" fontSize="13" fontWeight="700" letterSpacing="2"
        style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,1))' }}
      >{heroType}</text>

      {(() => {
        // Tier: yellow 1-5 | red 6-10 | white 11-15 | rainbow 16 (max)
        const sc     = Math.max(1, starCount);
        const tier   = Math.min(3, Math.floor((sc - 1) / 5)); // 0=yellow,1=red,2=white,3=rainbow
        const inTier = sc - tier * 5;                         // 1-5 filled in current tier
        const slots  = tier === 3 ? 1 : 5;                   // rainbow: only 1 slot
        const FILL   = ['#FFD700', '#FF3333', '#D8D8D8', '#FFD700'] as const;
        const STROKE = ['#000000', '#000000', '#888888', '#000000'] as const;
        return Array.from({ length: slots }).map((_, i) => {
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
        });
      })()}

      <path d={starPath} fill="rgba(0,0,0,0.6)"/>
      <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle"
        fill={`url(#${tgId})`} stroke="#000000" strokeWidth="1.5" paintOrder="stroke"
        fontFamily="'Playfair Display',serif" fontSize="52" fontWeight="bold"
      >{cfg.text}</text>

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
  );
});

/** HeroCard wrapped in the animated 3D-tilt container. Use in gallery/obtained grids. */
export function HeroCardWithAnimation({ children, rarityColor }: { children: React.ReactNode; rarityColor: string }) {
  return <HeroCardAnimated rarityColor={rarityColor}>{children}</HeroCardAnimated>;
}