/**
 * SpriteEditor — Visual size editor for all battle sprites & VFX effects.
 * Access via /sprite-editor (dev tool, no auth required).
 *
 * Preview context:
 *   • Grid overlay (toggle): configurable cols × rows, overlaid directly on sprite
 *   • Checkerboard background shows transparency
 *   • Ground line + 3 slot reference boxes (Back 60 / Mid 86 / Front 120)
 *     drawn at the same scale so you can see real relative sizes
 *   • Zoom control: 25 / 50 / 75 / 100 / 150% or Auto-fit
 *   • Pixel rulers on left + top
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useChromaKeyDataUrl } from '../../utils/chromaKey';
import {
  getSpriteSize, setSpriteSize, resetSpriteSize,
  getDefaultSize, getAllOverrides, clearAllOverrides,
  type SpriteSize,
} from '../../data/spriteConfig';
import { HERO_DEFS } from '../../data/heroDefs';

// ── VFX asset URLs ─────────────────────────────────────────────────────────────
const VFX_ITEMS = [
  { key: 'vfx_lucas_slash',    label: 'Lucas — Slash VFX',         group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743519/slashlucas_shbdmd.png' },
  { key: 'vfx_emma_heal',      label: 'Emma — Heal VFX',           group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743503/healemma_kgeprm.png' },
  { key: 'vfx_emma_shield',    label: 'Emma — Shield VFX',         group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743510/shieldemma_lac0xm.png' },
  { key: 'vfx_gorr_slash',     label: 'Gorr — Slash VFX',          group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743521/slashgorr_vuccpo.png' },
  { key: 'vfx_fang_slash',     label: 'Fang — Slash VFX',          group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743508/slashfang_wlxt0j.png' },
  { key: 'vfx_craw_slash',     label: 'Craw — Bullet VFX',         group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778742882/bulletcraw.png_dqejai.png' },
  { key: 'vfx_sylvie_bolt',    label: 'Sylvie — Bolt VFX',         group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778743501/bulletsylvie_yfg25d.png' },
  { key: 'vfx_clover_heal',    label: 'Clover — Heal Herb VFX',    group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778742883/herbclover_jdrdoi.png' },
  { key: 'vfx_myko_shield',    label: 'Myko — Shield VFX',         group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743520/shieldmyko_q12jq3.png' },
  { key: 'vfx_myko_ult',       label: 'Myko — Mushroom Ult VFX',   group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743507/jamurmyko_d982w6.png' },
  { key: 'vfx_brennan_shield', label: 'Brennan — Shield VFX',      group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743518/shieldbrennan_i4ou5b.png' },
  { key: 'vfx_rslime_spike',   label: 'Rock Slime — Spike Ult VFX',group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743509/spikerslime_zvlqrn.png' },
  { key: 'vfx_aslime_flood',   label: 'Acid Slime — Flood Ult VFX',group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743523/floodaslime_cnkxu0.png' },
  { key: 'vfx_wslime_wave',    label: 'Water Slime — Wave Ult VFX',group: 'VFX Effects', url: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778743524/wavewslime_bptmpu.png' },
] as const;

// ── Slot reference data (matching BattlePlayback ROW_DATA) ─────────────────────
const SLOT_ROWS = [
  { label: 'Back',  h: 60,  w: 60,  color: 'rgba(96,165,250,0.18)',  border: 'rgba(96,165,250,0.45)'  },
  { label: 'Mid',   h: 86,  w: 86,  color: 'rgba(167,139,250,0.18)', border: 'rgba(167,139,250,0.45)' },
  { label: 'Front', h: 120, w: 120, color: 'rgba(52,211,153,0.18)',   border: 'rgba(52,211,153,0.45)'  },
];

type EditorItem = {
  key: string; label: string; group: string;
  url: string | null;
  needsChroma: boolean; needsBgRemoval: boolean;
  isVFX: boolean;
};

function buildItems(): EditorItem[] {
  const items: EditorItem[] = [];
  for (const hero of HERO_DEFS) {
    if (!hero.battleReady || !hero.sprites) continue;
    const sp = hero.sprites as any;
    const idleNeedsChroma = sp.isHumanHero || !!sp.enemyNeedsChroma;
    if (sp.idleUrl)   items.push({ key: `sprite_${hero.heroId}_idle`,   label: `${hero.name} — Idle`,   group: hero.name, url: sp.idleUrl,   needsChroma: idleNeedsChroma,                needsBgRemoval: !!sp.enemyNeedsBgRemoval, isVFX: false });
    if (sp.actionUrl) items.push({ key: `sprite_${hero.heroId}_action`, label: `${hero.name} — Attack`, group: hero.name, url: sp.actionUrl, needsChroma: sp.actionMethod === 'chroma', needsBgRemoval: false,                   isVFX: false });
  }
  for (const v of VFX_ITEMS) items.push({ key: v.key, label: v.label, group: v.group, url: v.url, needsChroma: true, needsBgRemoval: false, isVFX: true });
  return items;
}

const CURSOR_MAP: Record<string, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
};

// ── Handle dot ─────────────────────────────────────────────────────────────────
function Handle({ pos, size, onMouseDown }: { pos: string; size: SpriteSize; onMouseDown: (e: React.MouseEvent) => void }) {
  const left = pos.includes('e') ? size.w : pos.includes('w') ? 0 : size.w / 2;
  const top  = pos.includes('s') ? size.h : pos.includes('n') ? 0 : size.h / 2;
  return (
    <div onMouseDown={onMouseDown} style={{
      position: 'absolute', left: left - 7, top: top - 7,
      width: 14, height: 14,
      background: '#a78bfa', border: '2.5px solid #7c3aed', borderRadius: 3,
      cursor: CURSOR_MAP[pos] ?? 'pointer', zIndex: 20,
      boxShadow: '0 0 0 2px rgba(167,139,250,0.25)',
    }} />
  );
}

// ── 1:1 GRID OVERLAY ──────────────────────────────────────────────────────────
// SVG grid drawn directly over the sprite container at full W×H.
// Centre-axis lines are highlighted (red vertical / blue horizontal).
// All other lines are thin dashed white.
function GridOverlay({ w, h, cols, rows }: { w: number; h: number; cols: number; rows: number }) {
  const vLines: React.ReactNode[] = [];
  const hLines: React.ReactNode[] = [];
  const cw = w / cols;
  const ch = h / rows;

  for (let c = 1; c < cols; c++) {
    const x     = cw * c;
    const isMid = cols % 2 === 0 && c === cols / 2;
    vLines.push(
      <line key={`v${c}`} x1={x} y1={0} x2={x} y2={h}
        stroke={isMid ? 'rgba(255,90,90,0.85)' : 'rgba(255,255,255,0.28)'}
        strokeWidth={isMid ? 1.4 : 0.7}
        strokeDasharray={isMid ? undefined : '4 3'}
      />
    );
  }

  for (let r = 1; r < rows; r++) {
    const y     = ch * r;
    const isMid = rows % 2 === 0 && r === rows / 2;
    hLines.push(
      <line key={`h${r}`} x1={0} y1={y} x2={w} y2={y}
        stroke={isMid ? 'rgba(80,180,255,0.85)' : 'rgba(255,255,255,0.28)'}
        strokeWidth={isMid ? 1.4 : 0.7}
        strokeDasharray={isMid ? undefined : '4 3'}
      />
    );
  }

  // Cell dimension label (shown only when cells are big enough to read)
  const cellLabelW = Math.round(w  / cols);
  const cellLabelH = Math.round(h  / rows);
  const showLabels = cw >= 28 && ch >= 22;

  return (
    <svg width={w} height={h}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 18, overflow: 'visible' }}>
      {/* Outer border */}
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1}
        fill="none" stroke="rgba(167,139,250,0.55)" strokeWidth={1.2} />
      {vLines}
      {hLines}
      {/* Cell size legend in top-left corner */}
      {showLabels && (
        <text x={6} y={14} fill="rgba(255,255,255,0.45)" fontSize={9} fontFamily="ui-monospace,monospace">
          {cellLabelW}×{cellLabelH}px / cell
        </text>
      )}
      {/* Grid dimension badge bottom-right */}
      <text x={w - 4} y={h - 4} fill="rgba(255,255,255,0.35)"
        fontSize={8} fontFamily="ui-monospace,monospace" textAnchor="end">
        {cols}col × {rows}row
      </text>
    </svg>
  );
}

// ── Vertical pixel ruler ───────────────────────────────────────────────────────
function VertRuler({ height, zoom }: { height: number; zoom: number }) {
  const RULER_W = 36;
  const ticks: JSX.Element[] = [];
  const total = Math.max(height + 80, 200);
  for (let px = 0; px <= total; px += 10) {
    const y = px * zoom;
    const isMajor  = px % 50  === 0;
    const hasLabel = px % 100 === 0;
    ticks.push(
      <div key={px} style={{ position: 'absolute', top: y, right: 0, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
        {hasLabel && (
          <span style={{ position: 'absolute', right: 10, color: 'rgba(255,255,255,0.5)', fontSize: 8, lineHeight: 1, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}>
            {px}
          </span>
        )}
        <div style={{ width: isMajor ? 8 : 4, height: 1, background: isMajor ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)', marginLeft: 'auto' }} />
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', width: RULER_W, minHeight: total * zoom, background: '#0e0e22', borderRight: '1px solid rgba(124,58,237,0.3)', flexShrink: 0 }}>
      {ticks}
      <div style={{ position: 'absolute', top: height * zoom - 1, left: 0, right: 0, height: 1, background: '#f59e0b', boxShadow: '0 0 4px rgba(245,158,11,0.8)' }} />
    </div>
  );
}

// ── Horizontal pixel ruler ─────────────────────────────────────────────────────
function HorizRuler({ width, zoom }: { width: number; zoom: number }) {
  const RULER_H = 24;
  const total = Math.max(width + 80, 200);
  const ticks: JSX.Element[] = [];
  for (let px = 0; px <= total; px += 10) {
    const x = px * zoom;
    const isMajor  = px % 50  === 0;
    const hasLabel = px % 100 === 0;
    ticks.push(
      <div key={px} style={{ position: 'absolute', left: x, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 1, height: isMajor ? 8 : 4, background: isMajor ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)' }} />
        {hasLabel && (
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', lineHeight: 1, position: 'absolute', top: 10, transform: 'translateX(-50%)' }}>
            {px}
          </span>
        )}
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', height: RULER_H, width: total * zoom, background: '#0e0e22', borderBottom: '1px solid rgba(124,58,237,0.3)', flexShrink: 0 }}>
      {ticks}
      <div style={{ position: 'absolute', left: width * zoom - 1, top: 0, bottom: 0, width: 1, background: '#f59e0b', boxShadow: '0 0 4px rgba(245,158,11,0.8)' }} />
    </div>
  );
}

// ── Slot reference section ─────────────────────────────────────────────────────
function SlotReference({ spriteW, zoom }: { spriteW: number; zoom: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ width: spriteW * zoom, height: 2, background: '#f59e0b', boxShadow: '0 0 8px rgba(245,158,11,0.8)', marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
        {SLOT_ROWS.map(row => (
          <div key={row.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ width: row.w * zoom, height: row.h * zoom, background: row.color, border: `1.5px solid ${row.border}`, borderRadius: 4, position: 'relative' }}>
              <div style={{ position: 'absolute', right: -20, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                  <div style={{ width: 1, flex: 1, minHeight: 4, background: row.border }} />
                  <span style={{ color: row.border, fontSize: 7, lineHeight: 1, writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '2px 0' }}>{row.h}px</span>
                  <div style={{ width: 1, flex: 1, minHeight: 4, background: row.border }} />
                </div>
              </div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, letterSpacing: 1 }}>{row.label}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.22)', fontSize: 9, letterSpacing: 1 }}>BATTLE SLOT REFERENCE (same scale)</div>
    </div>
  );
}

// ── Checkerboard CSS ───────────────────────────────────────────────────────────
const CHECKER_BG = `
  repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, transparent 0% 50%)
  0 0 / 12px 12px
`;

// ── Image preview ──────────────────────────────────────────────────────────────
function PreviewImage({ item, size }: { item: EditorItem; size: SpriteSize }) {
  const chromaUrl  = useChromaKeyDataUrl(item.needsChroma ? (item.url ?? '') : '');
  const displayUrl = item.needsChroma ? chromaUrl : item.url;
  if (!displayUrl) return (
    <div style={{ width: size.w, height: size.h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
      Loading…
    </div>
  );
  return (
    <img src={displayUrl} draggable={false} style={{
      width: size.w, height: size.h, display: 'block',
      objectFit: item.isVFX ? 'fill' : 'contain',
      objectPosition: 'center bottom',
      userSelect: 'none', pointerEvents: 'none',
    }} alt="" />
  );
}

// ── Code snippet builder ───────────────────────────────────────────────────────
function buildCodeSnippet(overrides: Record<string, SpriteSize>): string {
  const lines = Object.entries(overrides).map(([k, v]) => `  '${k}': { w: ${v.w}, h: ${v.h} },`);
  return lines.length ? `// Paste into SPRITE_DEFAULTS in spriteConfig.ts:\n${lines.join('\n')}` : '// No overrides saved yet.';
}

// ── ZOOM presets ───────────────────────────────────────────────────────────────
const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5];

// ── Inline number input ────────────────────────────────────────────────────────
function NumInput({ label, value, min, max, step = 1, onChange, color = '#a78bfa' }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; color?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', minWidth: 28 }}>{label}</span>
      <button onClick={() => onChange(Math.max(min, value - step))}
        style={{ width: 20, height: 20, background: '#1a1a30', border: `1px solid ${color}44`, borderRadius: 3, color, fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
      <span style={{ minWidth: 24, textAlign: 'center', color, fontSize: 12, fontWeight: 700 }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + step))}
        style={{ width: 20, height: 20, background: '#1a1a30', border: `1px solid ${color}44`, borderRadius: 3, color, fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────
export default function SpriteEditor() {
  const navigate = useNavigate();
  const items    = useMemo(buildItems, []);

  const [selectedKey, setSelectedKey] = useState(items[0]?.key ?? '');
  const [size,        setSize        ] = useState<SpriteSize>(() => getSpriteSize(selectedKey));
  const [saveStatus,  setSaveStatus  ] = useState<'idle' | 'saved' | 'reset'>('idle');
  const [showCode,    setShowCode    ] = useState(false);
  const [copied,      setCopied      ] = useState(false);
  const [zoom,        setZoom        ] = useState(0.75);

  // ── GRID state ────────────────────────────────────────────────────────────────
  const [showGrid, setShowGrid] = useState(false);
  const [gridCols, setGridCols] = useState(8);
  const [gridRows, setGridRows] = useState(8);

  const selectedItem = items.find(i => i.key === selectedKey);
  const defaultSize  = getDefaultSize(selectedKey);

  useEffect(() => {
    setSize(getSpriteSize(selectedKey));
    setSaveStatus('idle');
  }, [selectedKey]);

  // ── Drag (divide delta by zoom so 1px mouse = 1px sprite at any zoom) ─────────
  const dragRef = useRef<{ handle: string; startMX: number; startMY: number; startW: number; startH: number; } | null>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const startDrag = useCallback((handle: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { handle, startMX: e.clientX, startMY: e.clientY, startW: size.w, startH: size.h };
  }, [size]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const z  = zoomRef.current;
      const dx = (e.clientX - d.startMX) / z;
      const dy = (e.clientY - d.startMY) / z;
      const h_ = d.handle;
      let w = d.startW, h = d.startH;
      if (h_.includes('n')) h = Math.max(20, d.startH - dy);
      if (h_.includes('s')) h = Math.max(20, d.startH + dy);
      if (h_.includes('e')) w = Math.max(20, d.startW + dx);
      if (h_.includes('w')) w = Math.max(20, d.startW - dx);
      setSize({ w: Math.round(w), h: Math.round(h) });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const handleSave  = () => { setSpriteSize(selectedKey, size); setSaveStatus('saved');  setTimeout(() => setSaveStatus('idle'), 1800); };
  const handleReset = () => { resetSpriteSize(selectedKey); setSize(defaultSize);  setSaveStatus('reset');  setTimeout(() => setSaveStatus('idle'), 1800); };
  const handleCopyCode = () => {
    navigator.clipboard.writeText(buildCodeSnippet(getAllOverrides())).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const groupedItems = useMemo(() => {
    const map = new Map<string, EditorItem[]>();
    for (const item of items) { const a = map.get(item.group) ?? []; a.push(item); map.set(item.group, a); }
    return map;
  }, [items]);

  // ── Scaled sprite size (what to render in the DOM after zoom) ─────────────────
  const scaledW = size.w * zoom;
  const scaledH = size.h * zoom;

  const ANN_GAP = 16;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', fontFamily: 'ui-monospace, SFMono-Regular, monospace', background: '#0b0b16', color: '#e2e8f0', userSelect: 'none' }}>

      {/* ── SIDEBAR ────────────────────────────────────────────────────────── */}
      <div style={{ width: 292, minWidth: 292, background: '#111124', borderRight: '1px solid rgba(124,58,237,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(124,58,237,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#a78bfa', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>SPRITE SIZE EDITOR</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => navigate('/vfx-editor')} style={{ background: 'none', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24', padding: '2px 8px', borderRadius: 4, fontSize: 9, cursor: 'pointer', letterSpacing: 1 }}>VFX →</button>
              <button onClick={() => navigate('/dev')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '2px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>← Back</button>
            </div>
          </div>
          <div style={{ marginTop: 5, color: 'rgba(255,255,255,0.3)', fontSize: 9, lineHeight: 1.6 }}>
            Drag the 8 handles to resize. Toggle GRID for visual alignment guides.
          </div>
        </div>

        {/* Asset list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {Array.from(groupedItems.entries()).map(([group, gItems]) => (
            <div key={group}>
              <div style={{ padding: '6px 14px 2px', color: 'rgba(255,255,255,0.25)', fontSize: 8, letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase' }}>{group}</div>
              {gItems.map(item => (
                <button key={item.key} onClick={() => setSelectedKey(item.key)} style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 14px',
                  background: item.key === selectedKey ? 'rgba(124,58,237,0.22)' : 'transparent',
                  border: 'none', borderLeft: item.key === selectedKey ? '2px solid #7c3aed' : '2px solid transparent',
                  color: item.key === selectedKey ? '#c4b5fd' : '#94a3b8', fontSize: 11, cursor: 'pointer',
                }}>{item.label}</button>
              ))}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(124,58,237,0.2)', display: 'flex', flexDirection: 'column', gap: 9 }}>

          {/* W × H inputs */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['w', 'h'] as const).map(dim => (
              <div key={dim} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, color: '#94a3b8', width: 12 }}>{dim.toUpperCase()}</span>
                <input type="number" value={size[dim]}
                  onChange={e => setSize(s => ({ ...s, [dim]: Math.max(20, +e.target.value || 20) }))}
                  style={{ flex: 1, background: '#0f0f1a', border: '1px solid rgba(124,58,237,0.35)', color: '#e2e8f0', borderRadius: 4, padding: '4px 6px', fontSize: 12, textAlign: 'center', minWidth: 0 }}
                />
              </div>
            ))}
          </div>

          {/* Big size display */}
          <div style={{ textAlign: 'center', background: '#0f0f1a', borderRadius: 6, padding: '6px 0', border: '1px solid rgba(124,58,237,0.2)' }}>
            <span style={{ color: '#f59e0b', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{size.w}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}> × </span>
            <span style={{ color: '#f59e0b', fontSize: 18, fontWeight: 700 }}>{size.h}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}> px</span>
          </div>

          {/* Default hint */}
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
            Default: {defaultSize.w} × {defaultSize.h} px
          </div>

          {/* ── GRID OVERLAY SECTION ────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid rgba(124,58,237,0.18)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: '#a78bfa', letterSpacing: 2, fontWeight: 700 }}>GRID OVERLAY</span>
              {/* Toggle pill */}
              <div onClick={() => setShowGrid(v => !v)} style={{
                position: 'relative', width: 40, height: 20, borderRadius: 10, cursor: 'pointer',
                background: showGrid ? '#7c3aed' : '#1e1e38',
                border: `1px solid ${showGrid ? '#a78bfa' : 'rgba(255,255,255,0.15)'}`,
                transition: 'background 0.2s',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: showGrid ? 20 : 2,
                  width: 14, height: 14, borderRadius: '50%',
                  background: showGrid ? '#c4b5fd' : '#4a4a6a',
                  transition: 'left 0.2s',
                }} />
              </div>
            </div>

            {showGrid && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 8px', background: 'rgba(124,58,237,0.08)', borderRadius: 6, border: '1px solid rgba(124,58,237,0.2)' }}>
                <NumInput label="COLS" value={gridCols} min={2} max={32} onChange={setGridCols} color="#ff8080" />
                <NumInput label="ROWS" value={gridRows} min={2} max={32} onChange={setGridRows} color="#80c0ff" />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[4,6,8,10,12,16].map(n => (
                    <button key={n} onClick={() => { setGridCols(n); setGridRows(n); }}
                      style={{ flex: '0 0 auto', padding: '2px 7px', background: gridCols === n && gridRows === n ? '#7c3aed' : '#1a1a30', border: `1px solid rgba(124,58,237,${gridCols === n && gridRows === n ? '0.9' : '0.3'})`, borderRadius: 3, color: gridCols === n && gridRows === n ? '#fff' : '#94a3b8', fontSize: 9, cursor: 'pointer' }}>
                      {n}×{n}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                  Cell size: <span style={{ color: '#f59e0b' }}>{Math.round(size.w/gridCols)}×{Math.round(size.h/gridRows)}px</span>
                  {' · '}
                  <span style={{ color: '#ff8080' }}>red</span> = V-centre
                  {' · '}
                  <span style={{ color: '#80c0ff' }}>blue</span> = H-centre
                </div>
              </div>
            )}
          </div>

          {/* Save / Reset */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleSave} style={{ flex: 1, padding: '8px 0', background: saveStatus === 'saved' ? '#16a34a' : '#7c3aed', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1 }}>
              {saveStatus === 'saved' ? '✓ SAVED' : 'SAVE'}
            </button>
            <button onClick={handleReset} style={{ padding: '8px 12px', background: saveStatus === 'reset' ? '#92400e' : '#1e1e38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#94a3b8', fontSize: 10, cursor: 'pointer' }}>
              {saveStatus === 'reset' ? '✓' : 'Reset'}
            </button>
          </div>

          {/* Export code */}
          <button onClick={() => setShowCode(c => !c)} style={{ padding: '6px 0', background: '#1e1e38', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 5, color: '#a78bfa', fontSize: 10, cursor: 'pointer' }}>
            {showCode ? '▲ Hide Code Export' : '▼ Export Code Snippet'}
          </button>
        </div>
      </div>

      {/* ── MAIN PREVIEW AREA ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar: zoom + info */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', gap: 12, background: '#0d0d20', flexShrink: 0 }}>
          <span style={{ color: '#a78bfa', fontSize: 12, fontWeight: 700 }}>{selectedItem?.label ?? '—'}</span>
          {selectedItem?.isVFX
            ? <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 4 }}>VFX CANVAS</span>
            : <span style={{ fontSize: 9, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', padding: '2px 8px', borderRadius: 4 }}>SPRITE CONTAINER</span>
          }

          {/* Grid indicator badge */}
          {showGrid && (
            <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(124,58,237,0.18)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(124,58,237,0.4)' }}>
              GRID {gridCols}×{gridRows}
            </span>
          )}

          {/* Zoom controls */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginRight: 4 }}>ZOOM</span>
            {ZOOM_PRESETS.map(z => (
              <button key={z} onClick={() => setZoom(z)} style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 10,
                background: zoom === z ? '#7c3aed' : '#1e1e38',
                border: zoom === z ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.1)',
                color: zoom === z ? '#fff' : '#94a3b8', cursor: 'pointer',
              }}>{z * 100}%</button>
            ))}
          </div>
        </div>

        {/* Code export panel */}
        {showCode && (
          <div style={{ background: '#0a0a18', borderBottom: '1px solid rgba(124,58,237,0.2)', padding: '10px 16px', flexShrink: 0 }}>
            <pre style={{ margin: 0, fontSize: 10, color: '#86efac', lineHeight: 1.6, maxHeight: 100, overflowY: 'auto' }}>
              {buildCodeSnippet(getAllOverrides())}
            </pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button onClick={handleCopyCode} style={{ padding: '3px 14px', background: copied ? '#16a34a' : '#1e3a2e', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 4, color: '#86efac', fontSize: 10, cursor: 'pointer' }}>
                {copied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
              <button onClick={() => { clearAllOverrides(); setSize(getDefaultSize(selectedKey)); }} style={{ padding: '3px 14px', background: '#3b1515', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, color: '#f87171', fontSize: 10, cursor: 'pointer' }}>
                Clear All Overrides
              </button>
            </div>
          </div>
        )}

        {/* ── CANVAS VIEWPORT (scrollable) ───────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', background: 'radial-gradient(ellipse at 40% 30%, #1a0e2e 0%, #0b0b16 65%)' }}>

          <div style={{ padding: '48px 60px 80px 0', display: 'inline-flex', alignItems: 'flex-start', gap: 0, minWidth: '100%', minHeight: '100%' }}>

            {/* ── LEFT RULER ─────────────────────────────────────────── */}
            <div style={{ width: 36, flexShrink: 0, paddingTop: 24 }}>
              <VertRuler height={size.h} zoom={zoom} />
            </div>

            {/* ── MAIN STAGE ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>

              {/* Horizontal ruler */}
              <HorizRuler width={size.w} zoom={zoom} />

              {/* Stage row: sprite area + right annotation */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: ANN_GAP }}>

                {/* ── Sprite + handles + checkerboard + GRID ─────────── */}
                <div style={{ position: 'relative', width: scaledW, height: scaledH, flexShrink: 0 }}>
                  {/* Checkerboard */}
                  <div style={{ position: 'absolute', inset: 0, background: CHECKER_BG, zIndex: 0 }} />

                  {/* Scaled sprite */}
                  {selectedItem && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
                      <PreviewImage item={selectedItem} size={{ w: scaledW, h: scaledH }} />
                    </div>
                  )}

                  {/* ★ GRID OVERLAY — above image, below handles ─────── */}
                  {showGrid && (
                    <GridOverlay w={scaledW} h={scaledH} cols={gridCols} rows={gridRows} />
                  )}

                  {/* Selection dashed border */}
                  <div style={{ position: 'absolute', inset: 0, border: '1.5px dashed rgba(167,139,250,0.55)', zIndex: 15, pointerEvents: 'none' }} />

                  {/* 8 handles */}
                  {(['nw','n','ne','w','e','sw','s','se'] as const).map(h => (
                    <Handle key={h} pos={h} size={{ w: scaledW, h: scaledH }} onMouseDown={startDrag(h)} />
                  ))}
                </div>

                {/* ── RIGHT ANNOTATION: height measurement ───────────── */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', height: scaledH }}>
                  <div style={{ width: 8, height: 1, background: '#f59e0b' }} />
                  <div style={{ flex: 1, width: 1, background: 'rgba(245,158,11,0.6)' }} />
                  <div style={{ background: '#f59e0b', borderRadius: 3, padding: '2px 6px', position: 'relative' }}>
                    <span style={{ color: '#000', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>H: {size.h}px</span>
                  </div>
                  <div style={{ flex: 1, width: 1, background: 'rgba(245,158,11,0.6)' }} />
                  <div style={{ width: 8, height: 1, background: '#f59e0b' }} />
                </div>
              </div>

              {/* Width annotation */}
              <div style={{ display: 'flex', alignItems: 'center', width: scaledW, marginTop: 6, marginBottom: 6 }}>
                <div style={{ height: 1, background: 'rgba(245,158,11,0.6)', flex: 1 }} />
                <div style={{ background: '#f59e0b', borderRadius: 3, padding: '2px 6px', margin: '0 4px' }}>
                  <span style={{ color: '#000', fontSize: 10, fontWeight: 700 }}>W: {size.w}px</span>
                </div>
                <div style={{ height: 1, background: 'rgba(245,158,11,0.6)', flex: 1 }} />
              </div>

              {/* Ground + slot reference */}
              <SlotReference spriteW={size.w} zoom={zoom} />

              {/* Type hint */}
              <div style={{ marginTop: 18, color: 'rgba(255,255,255,0.18)', fontSize: 9, letterSpacing: 1 }}>
                {selectedItem?.isVFX
                  ? 'VFX: both W & H control final canvas draw size (no aspect lock)'
                  : 'SPRITE: H controls container height · W controls container width · objectFit:contain inside'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
