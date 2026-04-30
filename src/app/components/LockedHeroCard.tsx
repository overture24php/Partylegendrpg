// ─── Locked / Undiscovered Hero Card ──────────────────────────────────────────
// Same SVG 250×400 frame as HeroCard. Renders with dark rarity tint + lock UI.

const RARITIES = [
  { id: 'mythic',    text: 'SS', border: '#450A0A', fill: '#6B0000', shine: '#FCA5A5', stars: 5 },
  { id: 'legendary', text: 'S',  border: '#78350F', fill: '#7C3200', shine: '#FED7AA', stars: 4 },
  { id: 'epic',      text: 'A',  border: '#3B0764', fill: '#2D0552', shine: '#D8B4FE', stars: 3 },
  { id: 'rare',      text: 'B',  border: '#1E3A5F', fill: '#0D2340', shine: '#93C5FD', stars: 2 },
  { id: 'common',    text: 'C',  border: '#14532D', fill: '#0A2E18', shine: '#86EFAC', stars: 1 },
] as const;

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

// Lock icon path — padlock shape in SVG coordinates (centered at cx,cy with size s)
function LockPath(cx: number, cy: number, s: number) {
  // shackle arc
  const bw = s * 0.55, bh = s * 0.45;
  const bx = cx - bw / 2, by = cy - s * 0.05;
  // body rectangle
  const rw = s * 0.75, rh = s * 0.52;
  const rx = cx - rw / 2, ry = cy + s * 0.04;
  const sr = bw / 2;
  return {
    shackle: `M ${bx},${by + bh * 0.5} L ${bx},${by + sr} A ${sr},${sr} 0 0 1 ${bx + bw},${by + sr} L ${bx + bw},${by + bh * 0.5}`,
    body:    `M ${rx},${ry} H ${rx + rw} V ${ry + rh} H ${rx} Z`,
    rx, ry, rw, rh,
    keyhole: { cx, cy: ry + rh * 0.42, r: s * 0.085 },
    slot:    { x: cx - s * 0.04, y: ry + rh * 0.46, w: s * 0.08, h: rh * 0.33 },
  };
}

interface Props {
  name:     string;
  rarity:   string;
  heroType: string;
}

export function LockedHeroCard({ name, rarity, heroType }: Props) {
  const cfg    = RARITIES.find(r => r.id === rarity) ?? RARITIES[3];
  const clipId = `lhc-clip-${name}`;
  const tgId   = `lhc-tg-${name}`;
  const botId  = `lhc-bot-${name}`;

  const RS_R = 14, RS_r = 5.3, RS_CY = 338, RS_X0 = 24, RS_STEP = 32;

  // lock icon centred in card illustration area
  const lk = LockPath(125, 160, 70);

  // rarity badge (top-right diamond)
  const sx = cfg.text === 'SS' ? 210 : 218;
  const sy = 321;
  const badgePath = `M ${sx},${sy - 28} Q ${sx + 5},${sy - 5} ${sx + 28},${sy} Q ${sx + 5},${sy + 5} ${sx},${sy + 28} Q ${sx - 5},${sy + 5} ${sx - 28},${sy} Q ${sx - 5},${sy - 5} ${sx},${sy - 28} Z`;

  return (
    <svg
      viewBox="0 0 250 400"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', height: '100%', filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.7))' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="3" y="3" width="244" height="394" rx="10" ry="10"/>
        </clipPath>
        {/* Rarity text gradient */}
        <linearGradient id={tgId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={cfg.shine} stopOpacity="1"/>
          <stop offset="48%"  stopColor={cfg.shine} stopOpacity="1"/>
          <stop offset="100%"  stopColor={cfg.fill}  stopOpacity="1"/>
        </linearGradient>
        {/* Bottom fade */}
        <linearGradient id={botId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#000000" stopOpacity="0"/>
          <stop offset="100%" stopColor="#000000" stopOpacity="1"/>
        </linearGradient>
      </defs>

      {/* ── Frame ── */}
      <rect x="0" y="0" width="250" height="400" rx="12" ry="12" fill={cfg.border}/>
      <rect x="3" y="3" width="244" height="394" rx="10" ry="10" fill={cfg.fill}/>

      {/* ── Subtle noise pattern overlay ── */}
      <rect x="3" y="3" width="244" height="394" rx="10" ry="10"
        fill="rgba(0,0,0,0.35)" clipPath={`url(#${clipId})`}/>

      {/* ── Grid / lattice silhouette bg ── */}
      <g clipPath={`url(#${clipId})`} opacity="0.07">
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`v${i}`} x1={3 + i * 18} y1="3" x2={3 + i * 18} y2="357" stroke={cfg.shine} strokeWidth="0.8"/>
        ))}
        {Array.from({ length: 20 }).map((_, i) => (
          <line key={`h${i}`} x1="3" y1={3 + i * 18} x2="247" y2={3 + i * 18} stroke={cfg.shine} strokeWidth="0.8"/>
        ))}
      </g>

      {/* ── Silhouette radial glow ── */}
      <ellipse cx="125" cy="145" rx="80" ry="100"
        fill={cfg.shine} fillOpacity="0.06" clipPath={`url(#${clipId})`}/>

      {/* ── Lock icon ── */}
      <g clipPath={`url(#${clipId})`}>
        {/* Shackle */}
        <path d={lk.shackle}
          fill="none" stroke={cfg.shine} strokeWidth="8"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.75"/>
        {/* Body */}
        <rect x={lk.rx} y={lk.ry} width={lk.rw} height={lk.rh}
          rx="6" ry="6" fill={cfg.shine} fillOpacity="0.18"
          stroke={cfg.shine} strokeWidth="3" strokeOpacity="0.7"/>
        {/* Keyhole circle */}
        <circle cx={lk.keyhole.cx} cy={lk.keyhole.cy} r={lk.keyhole.r}
          fill={cfg.shine} opacity="0.65"/>
        {/* Keyhole slot */}
        <rect x={lk.slot.x} y={lk.slot.y} width={lk.slot.w} height={lk.slot.h}
          rx="2" fill={cfg.shine} opacity="0.65"/>
      </g>

      {/* ── "?" question mark — subtle, below lock ── */}
      <text x="125" y="254" textAnchor="middle" dominantBaseline="middle"
        fill={cfg.shine} fillOpacity="0.22"
        fontFamily="'Playfair Display',serif" fontSize="38" fontWeight="900"
        clipPath={`url(#${clipId})`}>?</text>

      {/* ── Bottom fade ── */}
      <rect x="3" y="280" width="244" height="77" fill={`url(#${botId})`} clipPath={`url(#${clipId})`}/>

      {/* ── Hero Type label ── */}
      <text x="11" y="304" textAnchor="start" dominantBaseline="middle"
        fill="rgba(255,255,255,0.45)" fontFamily="'Playfair Display',serif"
        fontSize="13" fontWeight="700" letterSpacing="2">{heroType}</text>

      {/* ── Stars ── */}
      {Array.from({ length: cfg.stars }).map((_, i) => (
        <path key={i} d={fiveStarPath(RS_X0 + i * RS_STEP, RS_CY, RS_R, RS_r)}
          fill="rgba(255,215,0,0.35)" stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" strokeLinejoin="round"/>
      ))}

      {/* ── Rarity diamond badge ── */}
      <path d={badgePath} fill="rgba(0,0,0,0.5)"/>
      <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle"
        fill={`url(#${tgId})`} stroke="#000000" strokeWidth="1.5" paintOrder="stroke"
        fontFamily="'Playfair Display',serif" fontSize="52" fontWeight="bold"
        fillOpacity="0.55">{cfg.text}</text>

      {/* ── Name bar ── */}
      <rect x="3" y="357" width="244" height="40" fill="rgba(0,0,0,0.7)" clipPath={`url(#${clipId})`}/>
      <polyline
        points="3,367 15,387 27,367 39,387 51,367 63,387 75,367 87,387 99,367 111,387 123,367 135,387 147,367 159,387 171,367 183,387 195,367 207,387 219,367 231,387 243,367"
        fill="none" stroke="rgba(100,60,10,0.25)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`}/>
      <text x="125" y="378" textAnchor="middle" dominantBaseline="middle"
        fill="rgba(255,255,255,0.5)" fontFamily="'Playfair Display',serif"
        fontSize="18" fontWeight="700" letterSpacing="3"
        clipPath={`url(#${clipId})`}>{name}</text>

      {/* ── Outer glow border ── */}
      <rect x="1" y="1" width="248" height="398" rx="11" ry="11"
        fill="none" stroke={cfg.shine} strokeWidth="1" strokeOpacity="0.2"/>
    </svg>
  );
}
