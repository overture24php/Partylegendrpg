/**
 * SvgLibraryPage — halaman referensi aset SVG.
 *
 * Cara menambah aset baru:
 *   1. Buat SVG (bisa sebagai JSX element atau fungsi builder)
 *   2. Tambahkan entry ke array SVG_ASSETS di bagian bawah file ini
 *   Format entry:
 *     {
 *       id:          'unique-id',
 *       name:        'Nama Aset',
 *       description: 'Deskripsi singkat (opsional)',
 *       svg:         <SvgElement />,
 *     }
 *
 * Card Hero ukuran referensi: 2.5 grid × 4 grid (20×20 system) → viewBox 250×400
 */

import React, { useState, useRef, useEffect } from 'react';

// ─── Hero Card Builder ────────────────────────────────────────────────────────
interface HeroCardCfg {
  id:          string;
  rarityLabel: string;
  rarityText:  string;
  border:      string;
  fill:        string;
  shineTop:    string;
  starX?:      number;
  starCount:   number;
}

// helper: 5-pointed star path given center, outer radius R, inner radius r
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

// rating-star constants: R=14, r=5.3, cy=338 (bottom ≈ y349 same as 4-pt star), step=32
const RS_R    = 14;
const RS_r    = 5.3;
const RS_CY   = 338;
const RS_X0   = 24;   // center-x of first star
const RS_STEP = 32;   // center-to-center gap

function HeroCardSVG(c: HeroCardCfg): React.ReactNode {
  const clipId = `clip-${c.id}`;
  const tgId   = `tg-${c.id}`;
  const sx     = c.starX ?? 218;   // star / text horizontal center
  // star R=28 control points offset ±5 (same concave ratio as before)
  const starPath = `M ${sx},${321-28} Q ${sx+5},${321-5} ${sx+28},321 Q ${sx+5},${321+5} ${sx},${321+28} Q ${sx-5},${321+5} ${sx-28},321 Q ${sx-5},${321-5} ${sx},${321-28} Z`;
  return (
    <svg
      key={c.id}
      viewBox="0 0 250 400"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="3" y="3" width="244" height="394" rx="8" ry="8" />
        </clipPath>
        {/* Shine gradient — fully opaque, same hue */}
        <linearGradient id={tgId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={c.shineTop} stopOpacity="1" />
          <stop offset="48%"  stopColor={c.shineTop} stopOpacity="1" />
          <stop offset="100%" stopColor={c.fill}     stopOpacity="1" />
        </linearGradient>
        {/* Star-label bar fade-out gradient — semi-transparent (above stars) */}
        <linearGradient id={`bgbar-${c.id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="55%"  stopColor="#000000" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0"   />
        </linearGradient>
        {/* Top-left bar fade-out gradient — fully solid black, fade right */}
        <linearGradient id={`bgbar-solid-${c.id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="55%"  stopColor="#000000" stopOpacity="1" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Outer border */}
      <rect x="0" y="0" width="250" height="400" rx="10" ry="10" fill={c.border} />
      {/* Card body */}
      <rect x="3" y="3" width="244" height="394" rx="8" ry="8" fill={c.fill} />
      {/* Dark brown thin frame */}
      <rect x="3" y="3" width="244" height="394" rx="8" ry="8"
            fill="none" stroke="#2B1500" strokeWidth="2" />

      {/* Top-left bar — half width of star bar (163/2≈82), solid black, fade right */}
      <rect
        x="3" y="3" width="82" height="25"
        fill={`url(#bgbar-solid-${c.id})`}
        clipPath={`url(#${clipId})`}
      />

      {/* Black bar — bottom 10% */}
      <rect x="3" y="357" width="244" height="40"
            fill="#000000" clipPath={`url(#${clipId})`} />

      {/* Zigzag decoration — faded brown */}
      <polyline
        points="3,367 15,387 27,367 39,387 51,367 63,387 75,367 87,387 99,367 111,387 123,367 135,387 147,367 159,387 171,367 183,387 195,367 207,387 219,367 231,387 243,367"
        fill="none"
        stroke="rgba(120,72,20,0.32)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        clipPath={`url(#${clipId})`}
      />

      {/* Semi-transparent bar above rating stars */}
      <rect
        x="3" y="291" width="163" height="25"
        fill={`url(#bgbar-${c.id})`}
      />

      {/* Rating stars — yellow 5-pt, left of bar, top-left of black bar */}
      {Array.from({ length: c.starCount }).map((_, i) => (
        <path
          key={i}
          d={fiveStarPath(RS_X0 + i * RS_STEP, RS_CY, RS_R, RS_r)}
          fill="#FFD700"
          stroke="#000000"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ))}

      {/* Concave Four-Pointed Star — 2× size, R=28 */}
      <path d={starPath} fill="#000000" />

      {/* Rarity text — overlaid on top of star */}
      <text
        x={sx} y="321"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={`url(#${tgId})`}
        stroke="#000000"
        strokeWidth="1.5"
        paintOrder="stroke"
        fontFamily="'Georgia', serif"
        fontSize="56"
        fontWeight="bold"
      >
        {c.rarityText}
      </text>
    </svg>
  );
}

// ─── Hero Card Configs ──────────────────────────────────────────────────────
const HERO_CARD_CFGS: HeroCardCfg[] = [
  { id: 'hero-card-common',    rarityLabel: 'Common',    rarityText: 'C',  border: '#14532D', fill: '#22C55E', shineTop: '#86EFAC', starCount: 1 },
  { id: 'hero-card-rare',      rarityLabel: 'Rare',      rarityText: 'B',  border: '#1E3A5F', fill: '#1877F2', shineTop: '#93C5FD', starCount: 2 },
  { id: 'hero-card-epic',      rarityLabel: 'Epic',      rarityText: 'A',  border: '#3B0764', fill: '#A855F7', shineTop: '#D8B4FE', starCount: 3 },
  { id: 'hero-card-legendary', rarityLabel: 'Legendary', rarityText: 'S',  border: '#78350F', fill: '#FB923C', shineTop: '#FED7AA', starCount: 4 },
  { id: 'hero-card-mythic',    rarityLabel: 'Mythic',    rarityText: 'SS', border: '#450A0A', fill: '#E00000', shineTop: '#FCA5A5', starX: 210, starCount: 5 },
];

// ─── Fire Canvas Animation ────────────────────────────────────────────────────
function FireCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 250, H = 400;

    type P = {
      x: number; y: number;
      vx: number; vy: number;
      life: number; maxLife: number;
      baseSize: number;
      layer: number; // 0=core, 1=mid, 2=outer
    };

    const pool: P[] = [];
    let raf: number;

    function emit() {
      // core flame — tall, narrow, bright
      for (let i = 0; i < 4; i++) {
        pool.push({
          x: W / 2 + (Math.random() - 0.5) * W * 0.18,
          y: H - 8 + Math.random() * 8,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -(Math.random() * 3.5 + 2.5),
          life: 0,
          maxLife: 80 + Math.random() * 55,
          baseSize: 14 + Math.random() * 14,
          layer: 0,
        });
      }
      // mid flame — wider, orange-red
      for (let i = 0; i < 5; i++) {
        pool.push({
          x: W / 2 + (Math.random() - 0.5) * W * 0.38,
          y: H - 4 + Math.random() * 8,
          vx: (Math.random() - 0.5) * 1.3,
          vy: -(Math.random() * 2.5 + 1.4),
          life: 0,
          maxLife: 55 + Math.random() * 40,
          baseSize: 20 + Math.random() * 20,
          layer: 1,
        });
      }
      // outer embers — sparse, dark red, drift wide
      if (Math.random() < 0.35) {
        pool.push({
          x: W / 2 + (Math.random() - 0.5) * W * 0.55,
          y: H + Math.random() * 4,
          vx: (Math.random() - 0.5) * 2.2,
          vy: -(Math.random() * 1.8 + 0.8),
          life: 0,
          maxLife: 40 + Math.random() * 30,
          baseSize: 8 + Math.random() * 12,
          layer: 2,
        });
      }
    }

    function colorOf(layer: number, t: number): [number, number, number, number] {
      // t: 0=young(bright), 1=old(faded)
      let r = 255, g = 255, b = 255, a = 1;
      if (layer === 0) {
        // core: white→yellow→orange→red
        if (t < 0.12) {
          b = Math.floor(255 * (1 - t / 0.12)); a = 0.75;
        } else if (t < 0.35) {
          g = Math.floor(255 - ((t - 0.12) / 0.23) * 105); b = 0; a = 0.85;
        } else if (t < 0.65) {
          g = Math.floor(150 - ((t - 0.35) / 0.3) * 150); b = 0; a = 0.85 - ((t - 0.35) / 0.3) * 0.25;
        } else {
          r = Math.floor(255 - ((t - 0.65) / 0.35) * 180);
          g = 0; b = 0;
          a = 0.6 - ((t - 0.65) / 0.35) * 0.6;
        }
      } else if (layer === 1) {
        // mid: yellow→orange→dark red
        g = Math.floor(220 - t * 220); b = 0;
        if (t < 0.5) { a = 0.7; }
        else { r = Math.floor(255 - ((t - 0.5) / 0.5) * 140); a = 0.7 - ((t - 0.5) / 0.5) * 0.7; }
      } else {
        // embers: orange→red→smoke
        g = Math.floor(120 - t * 120); b = 0;
        r = Math.floor(255 - t * 180);
        a = 0.55 - t * 0.55;
      }
      return [r, g, b, a];
    }

    function frame() {
      // soft trail fade — dark base
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 0, W, H);

      emit();

      // draw particles back→front (outer first, core last)
      const byLayer = [
        pool.filter(p => p.layer === 2),
        pool.filter(p => p.layer === 1),
        pool.filter(p => p.layer === 0),
      ];

      ctx.globalCompositeOperation = 'lighter';

      for (const layer of byLayer) {
        for (let i = layer.length - 1; i >= 0; i--) {
          const p = layer[i];
          p.life++;
          const t = p.life / p.maxLife;
          if (t >= 1) { pool.splice(pool.indexOf(p), 1); continue; }

          // turbulence
          p.vx += (Math.random() - 0.5) * (p.layer === 2 ? 0.45 : 0.28);
          p.vx *= 0.93;
          p.x  += p.vx;
          p.y  += p.vy;
          p.vy -= 0.038 + p.layer * 0.01;

          const size = p.baseSize * (1 - t * 0.55);
          const [r, g, b, a] = colorOf(p.layer, t);

          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
          grad.addColorStop(0,    `rgba(${r},${g},${b},${a})`);
          grad.addColorStop(0.35, `rgba(${r},${Math.max(0, g - 60)},0,${(a * 0.55).toFixed(3)})`);
          grad.addColorStop(1,    'rgba(0,0,0,0)');

          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      // base glow pulse
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.12 + Math.sin(Date.now() * 0.004) * 0.04;
      const baseGrad = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, W * 0.52);
      baseGrad.addColorStop(0,   `rgba(255,140,0,${pulse})`);
      baseGrad.addColorStop(0.5, `rgba(255,60,0,${(pulse * 0.4).toFixed(3)})`);
      baseGrad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, H - W * 0.52, W, W * 0.52);

      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }

    // pre-seed pool
    for (let i = 0; i < 40; i++) emit();
    frame();

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={250}
      height={400}
      style={{ display: 'block', width: '100%', height: '100%', background: '#000' }}
    />
  );
}

// ─── Five-Pointed Star Builder ─────────────────────────────────────────────
// Regular 5-point star, center (125,200), outer R=100, inner r=38
// Points calculated from -90° with 72° step, inner from -54° with 72° step
const FIVE_STAR_PATH =
  'M 125,100 L 147,169 L 220,169 L 161,212 L 184,281 L 125,238 L 66,281 L 89,212 L 30,169 L 103,169 Z';

function FiveStarSVG({ id, fill, rainbow = false }: {
  id:       string;
  fill?:    string;
  rainbow?: boolean;
}): React.ReactNode {
  const gId = `rainbow-${id}`;
  return (
    <svg
      viewBox="0 0 250 400"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      {rainbow && (
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"    stopColor="#FF0000" />
            <stop offset="16.6%" stopColor="#FF8800" />
            <stop offset="33.3%" stopColor="#FFE800" />
            <stop offset="50%"   stopColor="#00CC44" />
            <stop offset="66.6%" stopColor="#0077FF" />
            <stop offset="83.3%" stopColor="#5500DD" />
            <stop offset="100%"  stopColor="#CC00FF" />
          </linearGradient>
        </defs>
      )}
      <path
        d={FIVE_STAR_PATH}
        fill={rainbow ? `url(#${gId})` : (fill ?? '#000')}
        stroke="#000000"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── SVG Assets Registry ──────────────────────────────────────────────────────
// Tambahkan SVG baru di sini. Format tiap entry:
//   { id, name, description?, svg }
const SVG_ASSETS: {
  id:           string;
  name:         string;
  description?: string;
  svg:          React.ReactNode;
}[] = [
  ...HERO_CARD_CFGS.map(cfg => ({
    id:   cfg.id,
    name: `Hero Card – ${cfg.rarityLabel}`,
    svg:  HeroCardSVG(cfg),
  })),

  // ── Tambahkan aset berikutnya di bawah baris ini ──
  { id: 'star5-yellow',  name: 'Star 5 – Yellow',  svg: FiveStarSVG({ id: 'star5-yellow',  fill: '#FFD700'              }) },
  { id: 'star5-red',     name: 'Star 5 – Red',     svg: FiveStarSVG({ id: 'star5-red',     fill: '#E00000'              }) },
  { id: 'star5-white',   name: 'Star 5 – White',   svg: FiveStarSVG({ id: 'star5-white',   fill: '#FFFFFF'              }) },
  { id: 'star5-rainbow', name: 'Star 5 – Rainbow', svg: FiveStarSVG({ id: 'star5-rainbow', rainbow: true               }) },
  { id: 'fire-canvas',   name: 'Fire Canvas',    svg: <FireCanvas /> },
];
// ─────────────────────────────────────────────────────────────────────────────

export default function SvgLibraryPage() {
  const [search,   setSearch]   = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zoomId,   setZoomId]   = useState<string | null>(null);

  const filtered = SVG_ASSETS.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
    a.id.toLowerCase().includes(search.toLowerCase())
  );

  const copyId = (id: string) => {
    const ta = document.createElement('textarea');
    ta.value = id;
    Object.assign(ta.style, { position: 'fixed', opacity: '0' });
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (_) { /* ignore */ }
    document.body.removeChild(ta);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const zoomed = zoomId ? SVG_ASSETS.find(a => a.id === zoomId) : null;

  return (
    <div style={{
      minHeight:  '100dvh',
      background: '#0a0a10',
      color:      '#e8e0cc',
      fontFamily: "'Cinzel', serif",
      padding:    '28px 20px',
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize:      'clamp(16px, 2.5vw, 26px)',
          fontWeight:    800,
          letterSpacing: '0.22em',
          color:         'rgba(255,215,0,0.95)',
          textShadow:    '0 2px 12px rgba(255,160,0,0.4)',
          margin:        0,
          lineHeight:    1,
        }}>
          SVG LIBRARY
        </h1>
        <p style={{
          marginTop:     '5px',
          fontSize:      'clamp(8px, 1vw, 11px)',
          color:         'rgba(255,255,255,0.3)',
          letterSpacing: '0.12em',
          fontFamily:    'monospace',
        }}>
          {SVG_ASSETS.length} ASSET{SVG_ASSETS.length !== 1 ? 'S' : ''} REGISTERED
        </p>
      </div>

      {/* ── Search ── */}
      <div style={{ marginBottom: '22px', maxWidth: '340px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari nama / id / deskripsi…"
          style={{
            width:        '100%',
            background:   'rgba(255,255,255,0.05)',
            border:       '1px solid rgba(255,215,0,0.22)',
            borderRadius: '7px',
            padding:      '7px 13px',
            color:        '#fff',
            fontFamily:   'monospace',
            fontSize:     '11px',
            outline:      'none',
            boxSizing:    'border-box',
          }}
        />
      </div>

      {/* ── Grid ── */}
      {filtered.length > 0 && (
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap:                 '16px',
        }}>
          {filtered.map(asset => (
            <div
              key={asset.id}
              style={{
                background:   'rgba(255,255,255,0.04)',
                border:       '1px solid rgba(255,215,0,0.15)',
                borderRadius: '10px',
                padding:      '14px 12px 12px',
                display:      'flex',
                flexDirection:'column',
                alignItems:   'center',
                gap:          '10px',
              }}
            >
              {/* Preview */}
              <div
                onClick={() => setZoomId(asset.id)}
                title="Klik untuk perbesar"
                style={{
                  width:          '100%',
                  aspectRatio:    '5 / 8',     // 250:400 hero card ratio
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  background:     'rgba(0,0,0,0.35)',
                  borderRadius:   '7px',
                  border:         '1px solid rgba(255,215,0,0.1)',
                  overflow:       'hidden',
                  cursor:         'pointer',
                }}
              >
                {asset.svg}
              </div>

              {/* Name */}
              <div style={{
                textAlign:     'center',
                width:         '100%',
              }}>
                <div style={{
                  fontSize:      'clamp(8px, 1vw, 10px)',
                  fontWeight:    700,
                  letterSpacing: '0.1em',
                  color:         'rgba(255,215,0,0.9)',
                  whiteSpace:    'nowrap',
                  overflow:      'hidden',
                  textOverflow:  'ellipsis',
                  lineHeight:    1.2,
                }}>
                  {asset.name}
                </div>
                {asset.description && (
                  <div style={{
                    marginTop:    '2px',
                    fontSize:     'clamp(7px, 0.85vw, 9px)',
                    color:        'rgba(255,255,255,0.3)',
                    fontFamily:   'monospace',
                    whiteSpace:   'nowrap',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {asset.description}
                  </div>
                )}
              </div>

              {/* Copy ID */}
              <button
                onClick={() => copyId(asset.id)}
                style={{
                  background:    copiedId === asset.id ? 'rgba(80,200,80,0.14)' : 'rgba(255,215,0,0.07)',
                  border:        `1px solid ${copiedId === asset.id ? 'rgba(80,200,80,0.5)' : 'rgba(255,215,0,0.28)'}`,
                  color:         copiedId === asset.id ? '#88ff88' : 'rgba(255,215,0,0.65)',
                  fontSize:      '8px',
                  fontFamily:    'monospace',
                  letterSpacing: '0.08em',
                  padding:       '4px 8px',
                  borderRadius:  '5px',
                  cursor:        'pointer',
                  width:         '100%',
                  transition:    'all 0.18s',
                  whiteSpace:    'nowrap',
                  overflow:      'hidden',
                  textOverflow:  'ellipsis',
                }}
              >
                {copiedId === asset.id ? '✓ COPIED' : `ID: ${asset.id}`}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {SVG_ASSETS.length === 0 && (
        <div style={{
          marginTop:     '80px',
          textAlign:     'center',
          color:         'rgba(255,215,0,0.22)',
          fontSize:      'clamp(10px, 1.4vw, 13px)',
          letterSpacing: '0.14em',
        }}>
          <svg viewBox="0 0 64 64" width="52" height="52"
               style={{ opacity: 0.18, display: 'block', margin: '0 auto 14px' }}>
            <rect x="8" y="8" width="48" height="48" rx="5"
                  fill="none" stroke="rgba(255,215,0,1)" strokeWidth="3" />
            <line x1="8"  y1="32" x2="56" y2="32"
                  stroke="rgba(255,215,0,1)" strokeWidth="2" strokeDasharray="4 4" />
            <line x1="32" y1="8"  x2="32" y2="56"
                  stroke="rgba(255,215,0,1)" strokeWidth="2" strokeDasharray="4 4" />
          </svg>
          BELUM ADA ASET SVG
          <div style={{
            marginTop:  '8px',
            fontSize:   'clamp(8px, 0.9vw, 10px)',
            color:      'rgba(255,255,255,0.18)',
            fontFamily: 'monospace',
          }}>
            Tambahkan entry ke SVG_ASSETS[] di SvgLibraryPage.tsx
          </div>
        </div>
      )}

      {/* ── No results ── */}
      {SVG_ASSETS.length > 0 && filtered.length === 0 && (
        <div style={{
          marginTop:     '60px',
          textAlign:     'center',
          color:         'rgba(255,255,255,0.18)',
          fontSize:      '11px',
          fontFamily:    'monospace',
          letterSpacing: '0.1em',
        }}>
          TIDAK ADA HASIL UNTUK &quot;{search}&quot;
        </div>
      )}

      {/* ── Zoom modal ── */}
      {zoomed && (
        <div
          onClick={() => setZoomId(null)}
          style={{
            position:       'fixed',
            inset:          0,
            zIndex:         999,
            background:     'rgba(0,0,0,0.82)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            cursor:         'zoom-out',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width:     'min(300px, 70vw)',
              cursor:    'default',
            }}
          >
            {zoomed.svg}
            <div style={{
              marginTop:     '10px',
              textAlign:     'center',
              color:         'rgba(255,215,0,0.8)',
              fontSize:      '11px',
              fontFamily:    'monospace',
              letterSpacing: '0.12em',
            }}>
              {zoomed.name}
            </div>
            <div style={{
              marginTop:     '4px',
              textAlign:     'center',
              color:         'rgba(255,255,255,0.3)',
              fontSize:      '9px',
              fontFamily:    'monospace',
            }}>
              {zoomed.id}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}