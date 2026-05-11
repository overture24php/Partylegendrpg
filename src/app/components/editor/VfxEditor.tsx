/**
 * VfxEditor — Per-hero per-skill VFX position + size editor.
 * Route: /vfx-editor
 *
 * EDIT SCREEN design:
 *   • Full battle-field preview — exact same slot geometry as BattlePlayback
 *   • Hero team: dummies (Lucas) at top+bot of each row;
 *                edited hero at mid-front (melee) or mid-back (ranged/support)
 *   • Enemy side: 5 Lucas dummies filling front-column rows 0,1,2 + back-column rows 0,1
 *   • Two draggable anchor dots:
 *       ● Green = VFX start  (origin relative to hero slot centre-bottom)
 *       ● Red   = VFX end    (destination relative to chosen enemy slot centre-bottom)
 *   • SVG trajectory line + rotation indicator
 *   • PLAY ▶ button fires a CSS-transition animation preview
 *   • Left sidebar: size (W×H), start/end offsets (numeric), target-slot picker,
 *                   grid overlay toggle, Save/Reset/Export
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { useChromaKeyDataUrl } from '../../utils/chromaKey';
import {
  getSpriteSize, setSpriteSize, resetSpriteSize, getDefaultSize,
  getVfxPos, setVfxPos, resetVfxPos,
  getAllOverrides, getAllVfxPos,
  type SpriteSize, type VfxPosConfig,
} from '../../data/spriteConfig';
import { HERO_DEFS } from '../../data/heroDefs';

// ─── Battle field geometry (identical to BattlePlayback & AdventurePage) ───────
const GRID_W      = 368;
const GRID_H      = 310;
const FIELD_GAP   = 8;
const CANVAS_W    = GRID_W + FIELD_GAP + GRID_W; // 744
const CANVAS_H    = GRID_H;

const ROW_DATA = [
  { slotW:  60, slotH:  60, off: 15, col0X:  30, col1X: 278, y:   8 }, // row 0 top/far
  { slotW:  86, slotH:  86, off: 13, col0X:  17, col1X: 265, y:  82 }, // row 1 mid
  { slotW: 120, slotH: 120, off: 17, col0X:   0, col1X: 248, y: 190 }, // row 2 bot/near
] as const;

function slotGeo(slotIdx: number) {
  const colIdx = slotIdx % 2;
  const rowIdx = Math.floor(slotIdx / 2);
  const row    = ROW_DATA[rowIdx];
  const x      = colIdx === 0 ? row.col0X : row.col1X;
  return {
    x, y: row.y, w: row.slotW, h: row.slotH, off: row.off,
    cx:      x + row.slotW / 2,
    bottomY: row.y + row.slotH,
  };
}

/** Absolute canvas-space position for a hero-side slot. */
function heroSlotAbs(slotIdx: number) { return slotGeo(slotIdx); }

/** Absolute canvas-space position for an enemy-side slot (shifted right by GRID_W + GAP). */
function enemySlotAbs(slotIdx: number) {
  const g = slotGeo(slotIdx);
  return { ...g, x: g.x + GRID_W + FIELD_GAP, cx: g.cx + GRID_W + FIELD_GAP };
}

// ─── VFX Registry ─────────────────────────────────────────────────────────────
const SLASH_URL       = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778227653/edited-photo_ulx54j.png';
const LUCAS_SLASH_URL = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778171220/ChatGPT_Image_May_7_2026_11_26_25_PM_otixhr.png';
const EMMA_HEAL_URL   = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778176231/ChatGPT_Image_May_8_2026_12_44_40_AM_d2unfb.png';
const EMMA_SHIELD_URL = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778176246/ChatGPT_Image_May_8_2026_12_46_59_AM_lv7xxy.png';
const CLOVER_HEAL_URL = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778229880/ChatGPT_Image_May_8_2026_03_41_34_PM_cytadc.png';
const MYKO_SHIELD_URL = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778229955/ChatGPT_Image_May_8_2026_03_45_29_PM_cuy7bo.png';
const ARROW_URL       = 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1778258626/ChatGPT_Image_May_8_2026_11_22_35_PM_jxu2lv.png';

export type SkillKey = 'bsc' | 'sk1' | 'sk2' | 'sk3' | 'ult';

export interface VfxEntry {
  configKey: string; assetUrl: string; needsChroma: boolean; description: string;
}
type HeroSkillMap = Partial<Record<SkillKey, VfxEntry>>;

const VFX_REGISTRY: Record<string, HeroSkillMap> = {
  lucas:  { bsc: { configKey: 'vfx_lucas_slash', assetUrl: LUCAS_SLASH_URL, needsChroma: true, description: 'Sword swing — flies toward target, rotates to face travel dir' }, sk1: { configKey: 'vfx_lucas_slash', assetUrl: LUCAS_SLASH_URL, needsChroma: true, description: 'Power Slash × 1' }, sk2: { configKey: 'vfx_lucas_slash', assetUrl: LUCAS_SLASH_URL, needsChroma: true, description: 'Heavy Strike' }, ult: { configKey: 'vfx_lucas_slash', assetUrl: LUCAS_SLASH_URL, needsChroma: true, description: 'Supreme Slash × 3 (2.0× scale)' } },
  emma:   { sk1: { configKey: 'vfx_emma_heal',   assetUrl: EMMA_HEAL_URL,   needsChroma: true, description: 'Heal orb — flies from Emma to lowest-HP ally' }, sk2: { configKey: 'vfx_emma_shield', assetUrl: EMMA_SHIELD_URL, needsChroma: true, description: 'Shield bubble on target' }, sk3: { configKey: 'vfx_emma_shield', assetUrl: EMMA_SHIELD_URL, needsChroma: true, description: 'Passive shield (same asset)' }, ult: { configKey: 'vfx_emma_heal', assetUrl: EMMA_HEAL_URL, needsChroma: true, description: 'Mass Heal — one orb per target' } },
  gorr:   { bsc: { configKey: 'vfx_gorr_slash',  assetUrl: SLASH_URL, needsChroma: true, description: 'Shared slash asset × 1.0' }, sk1: { configKey: 'vfx_gorr_slash', assetUrl: SLASH_URL, needsChroma: true, description: 'Berserk Slash × 1.2' }, sk2: { configKey: 'vfx_gorr_slash', assetUrl: SLASH_URL, needsChroma: true, description: 'Rampage multi-target' }, ult: { configKey: 'vfx_gorr_slash', assetUrl: SLASH_URL, needsChroma: true, description: 'Bloodstorm × 2.2' } },
  craw:   { bsc: { configKey: 'vfx_craw_slash',  assetUrl: ARROW_URL, needsChroma: false, description: 'Crossbow bolt arcs to target' }, sk1: { configKey: 'vfx_craw_slash', assetUrl: ARROW_URL, needsChroma: false, description: 'Arrow Shot' }, sk2: { configKey: 'vfx_craw_slash', assetUrl: ARROW_URL, needsChroma: false, description: 'Multi-Shot (2 projectiles)' }, ult: { configKey: 'vfx_craw_slash', assetUrl: ARROW_URL, needsChroma: false, description: 'Skypiercer Volley — plunges from above' } },
  fang:   { bsc: { configKey: 'vfx_fang_slash',  assetUrl: SLASH_URL, needsChroma: true, description: 'Shared slash asset × 1.0' }, sk1: { configKey: 'vfx_fang_slash', assetUrl: SLASH_URL, needsChroma: true, description: 'Twin Slash — 2 angled projectiles 160ms apart' }, sk2: { configKey: 'vfx_fang_slash', assetUrl: SLASH_URL, needsChroma: true, description: 'Shadow Strike' }, ult: { configKey: 'vfx_fang_slash', assetUrl: SLASH_URL, needsChroma: true, description: 'Death Bound × 2.5 (execute)' } },
  clover: { sk1: { configKey: 'vfx_clover_heal', assetUrl: CLOVER_HEAL_URL, needsChroma: true, description: 'Healing Herb orb → lowest-HP ally' }, sk2: { configKey: 'vfx_clover_heal', assetUrl: CLOVER_HEAL_URL, needsChroma: true, description: 'Lucky Toss → random ally' }, ult: { configKey: 'vfx_clover_heal', assetUrl: CLOVER_HEAL_URL, needsChroma: true, description: 'Bloom Cascade — one orb per ally' } },
  myko:   { sk1: { configKey: 'vfx_myko_shield', assetUrl: MYKO_SHIELD_URL, needsChroma: true, description: 'Iron Casing — shield overlay on target' } },
  sylvie: { bsc: { configKey: 'vfx_sylvie_bolt', assetUrl: ARROW_URL, needsChroma: false, description: 'Bolt arcs to target' }, sk1: { configKey: 'vfx_sylvie_bolt', assetUrl: ARROW_URL, needsChroma: false, description: 'Bolt Shot' }, sk2: { configKey: 'vfx_sylvie_bolt', assetUrl: ARROW_URL, needsChroma: false, description: 'Double Shot — 2 bolts 60ms stagger' }, ult: { configKey: 'vfx_sylvie_bolt', assetUrl: ARROW_URL, needsChroma: false, description: 'Crossfire Storm — plunges onto 2 targets' } },
};

const SKILL_DEFS: { key: SkillKey; label: string; color: string }[] = [
  { key: 'bsc', label: 'Basic Attack', color: '#60a5fa' },
  { key: 'sk1', label: 'Skill 1',      color: '#34d399' },
  { key: 'sk2', label: 'Skill 2',      color: '#a78bfa' },
  { key: 'sk3', label: 'Skill 3',      color: '#f472b6' },
  { key: 'ult', label: 'Ultimate',     color: '#fbbf24' },
];

const MELEE_TYPES = ['Fighter', 'Tank', 'Assassin'];
const ZOOM_PRESETS = [0.5, 0.65, 0.8, 1.0];

// ─── Slot trapezoid ────────────────────────────────────────────────────────────
function SlotTrap({ slotIdx, isEnemy, isEdited, isTarget }: {
  slotIdx: number; isEnemy: boolean; isEdited?: boolean; isTarget?: boolean;
}) {
  const g = slotGeo(slotIdx);
  const pts = `${g.off},0 ${g.w - g.off},0 ${g.w},${g.h} 0,${g.h}`;
  const fill  = isEdited ? 'rgba(251,191,36,0.18)' : isTarget ? 'rgba(239,68,68,0.18)' : isEnemy ? 'rgba(28,8,8,0.88)' : 'rgba(10,28,12,0.88)';
  const strk  = isEdited ? 'rgba(251,191,36,0.9)'  : isTarget ? 'rgba(239,68,68,0.8)'  : isEnemy ? 'rgba(220,80,60,0.6)' : 'rgba(80,220,120,0.6)';
  return (
    <svg width={g.w} height={g.h} style={{ position:'absolute', left:0, top:0, pointerEvents:'none', overflow:'visible' }}>
      <polygon points={pts} fill={fill} stroke={strk} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Single character sprite inside a slot ────────────────────────────────────
// Each instance owns its own useChromaKeyDataUrl hook call.
function SpriteInSlot({ heroId, slotH, isEnemy, isEdited }: {
  heroId: string | null; slotH: number; isEnemy: boolean; isEdited?: boolean;
}) {
  const def  = useMemo(() => heroId ? HERO_DEFS.find(d => d.heroId === heroId) : null, [heroId]);
  const sp   = def?.sprites as any;
  const src  = sp?.idleUrl ?? '';
  const needsChroma = !!(sp?.isHumanHero || sp?.enemyNeedsChroma);
  const chromaUrl   = useChromaKeyDataUrl(needsChroma && src ? src : '');
  const finalSrc    = needsChroma ? chromaUrl : src;
  const { w: sprW, h: sprH } = useMemo(() =>
    heroId ? getSpriteSize(`sprite_${heroId}_idle`) : { w: 0, h: 0 }, [heroId]);
  const isSlime = def && !sp?.isHumanHero;
  const animCls = isSlime ? 'slime-bounce' : 'battle-idle-breathe';

  if (!heroId || !finalSrc) return null;

  return (
    <div style={{
      position:'absolute', bottom: isSlime ? 0 : -4, left:'50%',
      transform:`translateX(-50%)${isEnemy ? ' scaleX(-1)' : ''}`,
      width: sprW, height: sprH, pointerEvents:'none', zIndex:10,
    }}>
      <img src={finalSrc} alt="" draggable={false} className={animCls}
        style={{ width:'100%', height:'100%', objectFit:'contain', objectPosition:'center bottom' }}/>
      {isEdited && (
        <div style={{
          position:'absolute', bottom: -8, left:'50%', transform:'translateX(-50%)',
          width:'70%', height:6, borderRadius:'50%',
          background:'radial-gradient(ellipse, rgba(251,191,36,0.7) 0%, transparent 80%)',
        }}/>
      )}
    </div>
  );
}

// ─── Full formation half (hero OR enemy) ───────────────────────────────────────
function FormationHalf({ side, slots, editedSlot, targetSlot, zoom }: {
  side: 'hero' | 'enemy';
  slots: (string | null)[];
  editedSlot?: number;
  targetSlot?: number;
  zoom: number;
}) {
  const isEnemy = side === 'enemy';
  return (
    <div style={{ position:'relative', width: GRID_W, height: GRID_H, overflow:'visible', flexShrink:0 }}>
      {Array.from({ length: 6 }).map((_, i) => {
        const g        = slotGeo(i);
        const heroId   = slots[i] ?? null;
        const isEdited = i === editedSlot;
        const isTarget = i === targetSlot;
        return (
          <div key={i} style={{
            position:'absolute', left: g.x, top: g.y,
            width: g.w, height: g.h, overflow:'visible',
            zIndex: Math.floor(i / 2) * 2 + (i % 2 === (isEnemy ? 0 : 1) ? 2 : 1),
          }}>
            <SlotTrap slotIdx={i} isEnemy={isEnemy} isEdited={isEdited} isTarget={isTarget}/>
            {heroId && (
              <SpriteInSlot heroId={heroId} slotH={g.h} isEnemy={isEnemy} isEdited={isEdited}/>
            )}
            {/* ground glow */}
            {heroId && (
              <div style={{
                position:'absolute', bottom:5, left:'50%', transform:'translateX(-50%)',
                width:'55%', height:8, borderRadius:'50%', pointerEvents:'none', zIndex:1,
                background: isEdited
                  ? 'radial-gradient(ellipse, rgba(251,191,36,0.5) 0%, transparent 70%)'
                  : isEnemy
                  ? 'radial-gradient(ellipse, rgba(220,80,60,0.32) 0%, transparent 70%)'
                  : 'radial-gradient(ellipse, rgba(40,220,100,0.32) 0%, transparent 70%)',
              }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Grid overlay (same as SpriteEditor) ──────────────────────────────────────
function GridOverlay({ w, h, cols, rows }: { w: number; h: number; cols: number; rows: number }) {
  const lines: React.ReactNode[] = [];
  for (let c = 1; c < cols; c++) {
    const x = w * c / cols, isMid = cols % 2 === 0 && c === cols / 2;
    lines.push(<line key={`v${c}`} x1={x} y1={0} x2={x} y2={h} stroke={isMid ? 'rgba(255,80,80,0.7)' : 'rgba(255,255,255,0.2)'} strokeWidth={isMid ? 1.2 : 0.6} strokeDasharray={isMid ? undefined : '4 3'}/>);
  }
  for (let r = 1; r < rows; r++) {
    const y = h * r / rows, isMid = rows % 2 === 0 && r === rows / 2;
    lines.push(<line key={`h${r}`} x1={0} y1={y} x2={w} y2={y} stroke={isMid ? 'rgba(80,180,255,0.7)' : 'rgba(255,255,255,0.2)'} strokeWidth={isMid ? 1.2 : 0.6} strokeDasharray={isMid ? undefined : '4 3'}/>);
  }
  return (
    <svg width={w} height={h} style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:20, overflow:'visible' }}>
      <rect x={0.5} y={0.5} width={w-1} height={h-1} fill="none" stroke="rgba(251,191,36,0.4)" strokeWidth={1}/>
      {lines}
    </svg>
  );
}

// ─── Draggable anchor dot ──────────────────────────────────────────────────────
function AnchorDot({ ax, ay, color, label, onDelta, zoom }: {
  ax: number; ay: number; color: string; label: string;
  onDelta: (dx: number, dy: number) => void;
  zoom: number;
}) {
  const dragging = useRef(false);
  const last     = useRef({ x: 0, y: 0 });

  const onPD = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation(); e.preventDefault();
  }, []);
  const onPM = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = (e.clientX - last.current.x) / zoom;
    const dy = (e.clientY - last.current.y) / zoom;
    last.current = { x: e.clientX, y: e.clientY };
    onDelta(dx, dy);
  }, [onDelta, zoom]);
  const onPU = useCallback(() => { dragging.current = false; }, []);

  const DOT = 14;
  return (
    <div
      onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU}
      style={{
        position:'absolute',
        left: ax - DOT / 2, top: ay - DOT / 2,
        width: DOT, height: DOT, borderRadius: '50%',
        background: color, border: '2.5px solid #fff',
        cursor: 'grab', zIndex: 30,
        boxShadow: `0 0 0 3px ${color}55, 0 0 10px ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {/* label tag */}
      <div style={{
        position:'absolute', top: -22, left:'50%', transform:'translateX(-50%)',
        background: color, borderRadius: 3, padding: '1px 5px',
        fontSize: 8, fontFamily:'ui-monospace,monospace', color:'#000',
        whiteSpace:'nowrap', fontWeight:800, pointerEvents:'none',
      }}>
        {label}
      </div>
    </div>
  );
}

// ─── VFX image preview (static + animated) ────────────────────────────────────
function VfxImageOverlay({ entry, size, startAx, startAy, endAx, endAy, playing }: {
  entry: VfxEntry; size: SpriteSize;
  startAx: number; startAy: number;
  endAx: number;   endAy: number;
  playing: boolean;
}) {
  const chromaUrl  = useChromaKeyDataUrl(entry.needsChroma ? entry.assetUrl : '');
  const displayUrl = entry.needsChroma ? chromaUrl : entry.assetUrl;

  // rotation angle (rad) from start to end
  const angle = Math.atan2(endAy - startAy, endAx - startAx);
  const deg   = (angle * 180 / Math.PI) + 45; // +45 because slash assets point diagonally

  const curX = playing ? endAx   : startAx;
  const curY = playing ? endAy   : startAy;

  if (!displayUrl) return null;

  return (
    <div style={{
      position:'absolute',
      left: curX - size.w / 2,
      top:  curY - size.h / 2,
      width: size.w, height: size.h,
      pointerEvents:'none', zIndex: 25,
      transform: `rotate(${deg}deg)`,
      opacity: playing ? 0 : 0.85,
      transition: playing
        ? 'left 280ms ease-in-out, top 280ms ease-in-out, opacity 280ms ease-in-out'
        : 'none',
    }}>
      <img src={displayUrl} alt="" draggable={false}
        style={{ width:'100%', height:'100%', objectFit:'fill', pointerEvents:'none' }}/>
    </div>
  );
}

// ─── Static VFX preview (shown at start anchor when not playing) ──────────────
function StaticVfxPreview({ entry, size, startAx, startAy, endAx, endAy }: {
  entry: VfxEntry; size: SpriteSize;
  startAx: number; startAy: number; endAx: number; endAy: number;
}) {
  const chromaUrl  = useChromaKeyDataUrl(entry.needsChroma ? entry.assetUrl : '');
  const displayUrl = entry.needsChroma ? chromaUrl : entry.assetUrl;
  if (!displayUrl) return null;
  const angle = Math.atan2(endAy - startAy, endAx - startAx);
  const deg   = (angle * 180 / Math.PI) + 45;
  return (
    <div style={{
      position:'absolute',
      left: startAx - size.w / 2, top: startAy - size.h / 2,
      width: size.w, height: size.h,
      pointerEvents:'none', zIndex:25, opacity:0.75,
      transform:`rotate(${deg}deg)`,
    }}>
      <img src={displayUrl} alt="" draggable={false}
        style={{ width:'100%', height:'100%', objectFit:'fill', pointerEvents:'none' }}/>
    </div>
  );
}

// ─── Number stepper ───────────────────────────────────────────────────────────
function Stepper({ label, value, step = 1, onChange, color = '#fbbf24' }: {
  label: string; value: number; step?: number;
  onChange: (v: number) => void; color?: string;
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)', minWidth:40 }}>{label}</span>
      <button onClick={() => onChange(Math.round((value - step) * 10) / 10)}
        style={{ width:20, height:20, background:'#1a1a30', border:`1px solid ${color}44`, borderRadius:3, color, fontSize:13, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
      <input type="number" value={value}
        onChange={e => onChange(+e.target.value || 0)}
        style={{ width:52, background:'#0f0f1a', border:`1px solid ${color}44`, color:'#e2e8f0', borderRadius:4, padding:'3px 5px', fontSize:11, textAlign:'center' }}/>
      <button onClick={() => onChange(Math.round((value + step) * 10) / 10)}
        style={{ width:20, height:20, background:'#1a1a30', border:`1px solid ${color}44`, borderRadius:3, color, fontSize:13, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
    </div>
  );
}

// ─── Selection Screen ─────────────────────────────────────────────────────────
function SelectionScreen({ onEdit }: { onEdit: (heroId: string, skill: SkillKey) => void }) {
  const heroes  = useMemo(() => HERO_DEFS.filter(d => d.battleReady).map(d => ({ heroId: d.heroId, name: d.name })), []);
  const [heroId, setHeroId] = useState(heroes[0]?.heroId ?? '');
  const [skill,  setSkill ] = useState<SkillKey>('bsc');
  const heroMap  = VFX_REGISTRY[heroId] ?? {};
  const entry    = heroMap[skill];
  const heroName = heroes.find(h => h.heroId === heroId)?.name ?? heroId;
  const vfxCount = (id: string) => Object.keys(VFX_REGISTRY[id] ?? {}).length;

  const SEL: React.CSSProperties = {
    background:'#1a1a2e', border:'1px solid rgba(251,191,36,0.45)', color:'#e2e8f0',
    borderRadius:6, padding:'8px 12px', fontSize:12, outline:'none', cursor:'pointer', width:'100%',
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0b0b16', display:'flex', flexDirection:'column', fontFamily:'ui-monospace,monospace', color:'#e2e8f0' }}>
      {/* Header */}
      <div style={{ padding:'18px 28px 14px', borderBottom:'1px solid rgba(251,191,36,0.2)', display:'flex', alignItems:'center', gap:16, background:'#0d0d20' }}>
        <span style={{ color:'#fbbf24', fontSize:13, fontWeight:700, letterSpacing:2 }}>VFX EFFECT EDITOR</span>
        <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', flex:1 }}>Select hero + skill → Open Editor</span>
        <button onClick={() => window.history.back()} style={{ background:'none', border:'1px solid rgba(255,255,255,0.15)', color:'#94a3b8', padding:'4px 14px', borderRadius:4, fontSize:10, cursor:'pointer' }}>← Back</button>
      </div>

      <div style={{ flex:1, overflow:'auto', display:'flex' }}>
        {/* Left panel */}
        <div style={{ width:340, minWidth:340, background:'#111124', borderRight:'1px solid rgba(251,191,36,0.18)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'20px 20px 0' }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', letterSpacing:2, marginBottom:6 }}>HERO</div>
            <select value={heroId} onChange={e => setHeroId(e.target.value)} style={SEL}>
              {heroes.map(h => (
                <option key={h.heroId} value={h.heroId}>
                  {h.name}{vfxCount(h.heroId) > 0 ? ` (${vfxCount(h.heroId)} VFX)` : ' — no VFX'}
                </option>
              ))}
            </select>
          </div>

          <div style={{ padding:'14px 20px 0' }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', letterSpacing:2, marginBottom:6 }}>SKILL</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {SKILL_DEFS.map(sk => {
                const hasVfx = !!heroMap[sk.key];
                const isSel  = skill === sk.key;
                return (
                  <button key={sk.key} onClick={() => setSkill(sk.key)} style={{
                    display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                    background: isSel ? `${sk.color}22` : 'transparent',
                    border: isSel ? `1px solid ${sk.color}88` : '1px solid rgba(255,255,255,0.06)',
                    borderRadius:6, cursor:'pointer', textAlign:'left',
                  }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background: hasVfx ? sk.color : 'rgba(255,255,255,0.12)', flexShrink:0 }}/>
                    <span style={{ fontSize:11, color: isSel ? sk.color : hasVfx ? '#e2e8f0' : 'rgba(255,255,255,0.35)', fontWeight: isSel ? 700 : 400 }}>{sk.label}</span>
                    {hasVfx && <span style={{ marginLeft:'auto', fontSize:8, color:'rgba(255,255,255,0.3)' }}>{heroMap[sk.key]!.configKey}</span>}
                    {!hasVfx && <span style={{ marginLeft:'auto', fontSize:8, color:'rgba(255,255,255,0.2)', fontStyle:'italic' }}>no VFX</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding:'20px' }}>
            {entry ? (
              <button onClick={() => onEdit(heroId, skill)} style={{
                width:'100%', padding:'12px 0',
                background:'linear-gradient(135deg, #d97706, #fbbf24)',
                border:'none', borderRadius:7, color:'#000',
                fontSize:13, fontWeight:800, letterSpacing:2, cursor:'pointer',
                boxShadow:'0 0 20px rgba(251,191,36,0.3)',
              }}>⚡ OPEN EDITOR</button>
            ) : (
              <div style={{ padding:'12px', background:'#1a1a2e', borderRadius:7, textAlign:'center', border:'1px dashed rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.3)', fontSize:11 }}>
                No VFX for {heroName} — {SKILL_DEFS.find(s => s.key === skill)?.label}
              </div>
            )}
          </div>

          {entry && (
            <div style={{ margin:'0 20px 16px', padding:'10px 12px', background:'#0d0d1a', borderRadius:6, border:'1px solid rgba(251,191,36,0.18)' }}>
              <div style={{ fontSize:8, color:'rgba(255,255,255,0.3)', letterSpacing:1, marginBottom:4 }}>CONFIG KEY</div>
              <div style={{ fontSize:10, color:'#fbbf24', fontWeight:700 }}>{entry.configKey}</div>
              <div style={{ fontSize:8, color:'rgba(255,255,255,0.4)', marginTop:6, lineHeight:1.5 }}>{entry.description}</div>
            </div>
          )}
        </div>

        {/* Right: coverage grid */}
        <div style={{ flex:1, padding:'20px 28px', overflowY:'auto' }}>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', letterSpacing:2, marginBottom:14 }}>ALL HEROES — VFX COVERAGE</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:8 }}>
            {HERO_DEFS.filter(d => d.battleReady).map(h => {
              const hMap = VFX_REGISTRY[h.heroId] ?? {};
              const cnt  = Object.keys(hMap).length;
              const isSel = h.heroId === heroId;
              return (
                <div key={h.heroId} onClick={() => setHeroId(h.heroId)} style={{
                  padding:'10px 12px', borderRadius:7, cursor:'pointer',
                  background: isSel ? 'rgba(251,191,36,0.1)' : '#111124',
                  border: isSel ? '1px solid rgba(251,191,36,0.55)' : '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ fontSize:11, fontWeight:700, color: isSel ? '#fbbf24' : '#e2e8f0', marginBottom:6 }}>{h.name}</div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {SKILL_DEFS.map(sk => {
                      const has = !!hMap[sk.key];
                      return (
                        <div key={sk.key} onClick={e => { e.stopPropagation(); setHeroId(h.heroId); setSkill(sk.key); }} style={{
                          padding:'2px 6px', borderRadius:3, cursor:'pointer',
                          background: has ? `${sk.color}25` : 'rgba(255,255,255,0.04)',
                          border:`1px solid ${has ? sk.color+'55' : 'rgba(255,255,255,0.08)'}`,
                          fontSize:8, color: has ? sk.color : 'rgba(255,255,255,0.25)',
                        }}>{sk.key.toUpperCase()}</div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop:5, fontSize:8, color: cnt > 0 ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.2)' }}>
                    {cnt > 0 ? `${cnt} VFX configured` : 'No VFX yet'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Screen ──────────────────────────────────────────────────────────────
function EditScreen({ heroId, skill, onBack }: { heroId: string; skill: SkillKey; onBack: () => void }) {
  const entry      = VFX_REGISTRY[heroId]?.[skill];
  const heroDef    = HERO_DEFS.find(d => d.heroId === heroId);
  const heroName   = heroDef?.name ?? heroId;
  const skillLabel = SKILL_DEFS.find(s => s.key === skill)?.label ?? skill;
  const skillColor = SKILL_DEFS.find(s => s.key === skill)?.color ?? '#fbbf24';

  // Is this hero melee or ranged?
  const isMelee    = MELEE_TYPES.includes(heroDef?.heroType ?? '');
  // Slot index where the edited hero sits:
  // hero side — col 1 = front → slotIdx 3 (mid-front)
  // hero side — col 0 = back  → slotIdx 2 (mid-back)
  const heroSlotIdx = isMelee ? 3 : 2;

  // ── Hero team slots:  [0..5], null = empty ───────────────────────────────────
  // top-back(0), top-front(1), mid-back(2), mid-front(3), bot-back(4), bot-front(5)
  // Dummies (Lucas) at: top-back, top-front, bot-back, bot-front
  // Edited hero at: mid-front (melee) or mid-back (ranged)
  // The OTHER center row slot stays empty to give space
  const heroSlots = useMemo<(string|null)[]>(() => {
    const s: (string|null)[] = ['lucas', 'lucas', null, null, 'lucas', 'lucas'];
    s[heroSlotIdx] = heroId;
    return s;
  }, [heroId, heroSlotIdx]);

  // ── Enemy slots:  5 Lucas, 1 empty ──────────────────────────────────────────
  // Front-col (0,2,4) = melee dummies; back-col (1,3) = ranged dummies; slot 5 = empty
  const enemySlots: (string|null)[] = ['lucas','lucas','lucas','lucas','lucas',null];

  // ── Target slot (which enemy the VFX flies toward) ───────────────────────────
  // Default: mid-front for melee attacks, mid-back for ranged
  const defaultTarget = isMelee ? 2 : 3;
  const [targetSlot, setTargetSlot] = useState(defaultTarget);

  // ── Sprite size + VFX position ───────────────────────────────────────────────
  const posKey = `${heroId}_${skill}`;
  const [size, setSize] = useState<SpriteSize>(() =>
    entry ? getSpriteSize(entry.configKey) : { w: 80, h: 80 });
  const [pos,  setPos ] = useState<VfxPosConfig>(() => getVfxPos(posKey));

  const [saveStatus, setSaveStatus] = useState<'idle'|'saved'|'reset'>('idle');
  const [zoom,       setZoom      ] = useState(0.8);
  const [showGrid,   setShowGrid  ] = useState(false);
  const [gridCols,   setGridCols  ] = useState(8);
  const [gridRows,   setGridRows  ] = useState(8);
  const [showCode,   setShowCode  ] = useState(false);
  const [copied,     setCopied    ] = useState(false);

  // ── Play animation state ─────────────────────────────────────────────────────
  const [playState, setPlayState] = useState<'idle'|'move'|'fade'>('idle');

  const playVfx = () => {
    setPlayState('move');
    setTimeout(() => setPlayState('fade'), 320);
    setTimeout(() => setPlayState('idle'), 600);
  };

  // ── Anchor absolute canvas positions ─────────────────────────────────────────
  const heroGeo   = heroSlotAbs(heroSlotIdx);
  const targetGeo = enemySlotAbs(targetSlot);

  const startAx = heroGeo.cx      + pos.startX;
  const startAy = heroGeo.bottomY + pos.startY;
  const endAx   = targetGeo.cx    + pos.endX;
  const endAy   = targetGeo.bottomY + pos.endY;

  // ── Anchor drag handlers ───────────────────────────────���─────────────────────
  const onStartDelta = useCallback((dx: number, dy: number) => {
    setPos(p => ({ ...p, startX: Math.round(p.startX + dx), startY: Math.round(p.startY + dy) }));
  }, []);
  const onEndDelta = useCallback((dx: number, dy: number) => {
    setPos(p => ({ ...p, endX: Math.round(p.endX + dx), endY: Math.round(p.endY + dy) }));
  }, []);

  // ── Save / Reset ─────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (entry) setSpriteSize(entry.configKey, size);
    setVfxPos(posKey, pos);
    setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 1800);
  };
  const handleReset = () => {
    if (entry) { resetSpriteSize(entry.configKey); setSize(getDefaultSize(entry.configKey)); }
    resetVfxPos(posKey); setPos({ startX:0, startY:-43, endX:0, endY:-43 });
    setSaveStatus('reset'); setTimeout(() => setSaveStatus('idle'), 1800);
  };

  // ── Code export ──────────────────────────────────────────────────────────────
  const codeSnippet = () => {
    const sizes = Object.entries(getAllOverrides()).filter(([k]) => k.startsWith('vfx_'));
    const poss  = Object.entries(getAllVfxPos());
    const sLines = sizes.map(([k,v]) => `  '${k}': { w:${v.w}, h:${v.h} },`);
    const pLines = poss.map(([k,v]) => `  '${k}': { startX:${v.startX}, startY:${v.startY}, endX:${v.endX}, endY:${v.endY} },`);
    return (
      (sLines.length ? `// VFX sizes → SPRITE_DEFAULTS in spriteConfig.ts:\n${sLines.join('\n')}\n\n` : '') +
      (pLines.length ? `// VFX positions → getVfxPos defaults in spriteConfig.ts:\n${pLines.join('\n')}` : '// No pos overrides.')
    );
  };

  if (!entry) return (
    <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#0b0b16', color:'#94a3b8', fontFamily:'ui-monospace,monospace', flexDirection:'column', gap:12 }}>
      <div>No VFX for {heroName} — {skillLabel}</div>
      <button onClick={onBack} style={{ background:'#1e1e38', border:'1px solid rgba(255,255,255,0.15)', color:'#94a3b8', padding:'6px 18px', borderRadius:5, fontSize:11, cursor:'pointer' }}>← Back</button>
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', fontFamily:'ui-monospace,monospace', background:'#0a0a14', color:'#e2e8f0', userSelect:'none' }}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div style={{ padding:'8px 16px', borderBottom:'1px solid rgba(251,191,36,0.18)', display:'flex', alignItems:'center', gap:12, background:'#0d0d20', flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'none', border:'1px solid rgba(255,255,255,0.15)', color:'#94a3b8', padding:'4px 12px', borderRadius:4, fontSize:10, cursor:'pointer' }}>← Select</button>
        <span style={{ color:'#fbbf24', fontSize:12, fontWeight:700 }}>{heroName}</span>
        <span style={{ color:'rgba(255,255,255,0.3)' }}>—</span>
        <span style={{ color:skillColor, fontSize:11, fontWeight:700 }}>{skillLabel}</span>
        <span style={{ fontSize:9, color:'rgba(255,255,255,0.28)', background:'#1a1a2e', padding:'2px 8px', borderRadius:3 }}>{entry.configKey}</span>
        <span style={{ fontSize:9, color:'rgba(255,255,255,0.28)', background:'#1a1a2e', padding:'2px 8px', borderRadius:3 }}>posKey: {posKey}</span>

        {/* PLAY button */}
        <button onClick={playVfx} disabled={playState !== 'idle'} style={{
          marginLeft:8, padding:'5px 18px',
          background: playState === 'idle' ? 'linear-gradient(135deg,#d97706,#fbbf24)' : '#333',
          border:'none', borderRadius:5, color: playState === 'idle' ? '#000' : '#555',
          fontSize:11, fontWeight:800, cursor:'pointer', letterSpacing:1,
        }}>▶ PLAY</button>

        {/* Zoom */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginRight:2 }}>ZOOM</span>
          {ZOOM_PRESETS.map(z => (
            <button key={z} onClick={() => setZoom(z)} style={{
              padding:'3px 8px', borderRadius:4, fontSize:10,
              background: zoom === z ? '#d97706' : '#1e1e38',
              border: zoom === z ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)',
              color: zoom === z ? '#fff' : '#94a3b8', cursor:'pointer',
            }}>{Math.round(z * 100)}%</button>
          ))}
        </div>
      </div>

      {/* Code export */}
      {showCode && (
        <div style={{ background:'#0a0a18', borderBottom:'1px solid rgba(251,191,36,0.15)', padding:'8px 16px', flexShrink:0 }}>
          <pre style={{ margin:0, fontSize:9, color:'#86efac', lineHeight:1.6, maxHeight:80, overflowY:'auto' }}>{codeSnippet()}</pre>
          <button onClick={() => { navigator.clipboard.writeText(codeSnippet()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
            style={{ marginTop:5, padding:'2px 12px', background: copied ? '#16a34a' : '#1e3a2e', border:'1px solid rgba(134,239,172,0.25)', borderRadius:4, color:'#86efac', fontSize:9, cursor:'pointer' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
        <div style={{ width:248, minWidth:248, background:'#111124', borderRight:'1px solid rgba(251,191,36,0.18)', display:'flex', flexDirection:'column', overflowY:'auto', padding:14, gap:10 }}>

          {/* Info */}
          <div style={{ fontSize:8, color:'rgba(255,255,255,0.4)', lineHeight:1.6, padding:'6px 8px', background:'#0d0d1a', borderRadius:5, border:'1px solid rgba(255,255,255,0.07)' }}>
            {entry.description}
          </div>

          {/* SIZE */}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:9 }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', letterSpacing:2, marginBottom:7 }}>VFX SIZE</div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {(['w','h'] as const).map(dim => (
                <div key={dim} style={{ flex:1, display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:10, color:'#94a3b8', width:12 }}>{dim.toUpperCase()}</span>
                  <input type="number" value={size[dim]} onChange={e => setSize(s => ({ ...s, [dim]: Math.max(20, +e.target.value||20) }))}
                    style={{ flex:1, background:'#0f0f1a', border:'1px solid rgba(251,191,36,0.35)', color:'#e2e8f0', borderRadius:4, padding:'4px 5px', fontSize:11, textAlign:'center', minWidth:0 }}/>
                </div>
              ))}
            </div>
            <div style={{ textAlign:'center', marginTop:6, color:'#fbbf24', fontSize:14, fontWeight:700 }}>
              {size.w} × {size.h} <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>px</span>
            </div>
          </div>

          {/* START POSITION */}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:9 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:7 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:'#22c55e', border:'2px solid #fff', boxShadow:'0 0 6px #22c55e' }}/>
              <span style={{ fontSize:9, color:'#22c55e', letterSpacing:2, fontWeight:700 }}>START POSITION</span>
            </div>
            <div style={{ fontSize:8, color:'rgba(255,255,255,0.3)', marginBottom:6, lineHeight:1.5 }}>
              Offset from hero slot centre-bottom.<br/>
              <span style={{ color:'rgba(255,255,255,0.5)' }}>Drag green dot or type values.</span>
            </div>
            <Stepper label="X (←→)" value={pos.startX} step={5} onChange={v => setPos(p => ({...p, startX:v}))} color="#22c55e"/>
            <div style={{ marginTop:5 }}>
              <Stepper label="Y (↑↓)" value={pos.startY} step={5} onChange={v => setPos(p => ({...p, startY:v}))} color="#22c55e"/>
            </div>
            <div style={{ marginTop:5, fontSize:8, color:'rgba(255,255,255,0.25)' }}>
              {'Y<0 = above ground  ·  Y=0 = ground level'}
            </div>
          </div>

          {/* END POSITION */}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:9 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:7 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:'#ef4444', border:'2px solid #fff', boxShadow:'0 0 6px #ef4444' }}/>
              <span style={{ fontSize:9, color:'#ef4444', letterSpacing:2, fontWeight:700 }}>END POSITION</span>
            </div>
            <div style={{ fontSize:8, color:'rgba(255,255,255,0.3)', marginBottom:6 }}>
              Offset from target slot centre-bottom.
            </div>
            <Stepper label="X (←→)" value={pos.endX} step={5} onChange={v => setPos(p => ({...p, endX:v}))} color="#ef4444"/>
            <div style={{ marginTop:5 }}>
              <Stepper label="Y (↑↓)" value={pos.endY} step={5} onChange={v => setPos(p => ({...p, endY:v}))} color="#ef4444"/>
            </div>
          </div>

          {/* TARGET SLOT */}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:9 }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', letterSpacing:2, marginBottom:6 }}>TARGET SLOT</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {[0,1,2,3,4].map(i => {
                const isActive = targetSlot === i;
                const col = i % 2 === 0 ? 'Front' : 'Back';
                const row = ['Top','Mid','Bot'][Math.floor(i/2)];
                return (
                  <button key={i} onClick={() => setTargetSlot(i)} style={{
                    flex:'0 0 auto', padding:'3px 8px', borderRadius:4,
                    background: isActive ? 'rgba(239,68,68,0.3)' : '#1a1a2e',
                    border:`1px solid ${isActive ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.1)'}`,
                    color: isActive ? '#f87171' : '#94a3b8', fontSize:9, cursor:'pointer',
                  }}>{i+1} {row}-{col}</button>
                );
              })}
            </div>
          </div>

          {/* GRID */}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:9 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:9, color:'#fbbf24', letterSpacing:2, fontWeight:700 }}>GRID OVERLAY</span>
              <div onClick={() => setShowGrid(v => !v)} style={{
                position:'relative', width:38, height:18, borderRadius:9, cursor:'pointer',
                background: showGrid ? '#d97706' : '#1e1e38',
                border:`1px solid ${showGrid ? '#fbbf24' : 'rgba(255,255,255,0.15)'}`,
              }}>
                <div style={{ position:'absolute', top:2, left: showGrid ? 18 : 2, width:12, height:12, borderRadius:'50%', background: showGrid ? '#fbbf24' : '#4a4a6a', transition:'left 0.15s' }}/>
              </div>
            </div>
            {showGrid && (
              <div style={{ display:'flex', gap:16 }}>
                <Stepper label="COLS" value={gridCols} step={1} onChange={n => setGridCols(Math.max(2, Math.min(32, n)))} color="#ff8080"/>
                <Stepper label="ROWS" value={gridRows} step={1} onChange={n => setGridRows(Math.max(2, Math.min(32, n)))} color="#80c0ff"/>
              </div>
            )}
          </div>

          {/* ACTIONS */}
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={handleSave} style={{ flex:1, padding:'8px 0', background: saveStatus==='saved' ? '#16a34a' : '#d97706', border:'none', borderRadius:5, color:'#000', fontSize:11, fontWeight:800, cursor:'pointer', letterSpacing:1 }}>
              {saveStatus==='saved' ? '✓ SAVED' : 'SAVE ALL'}
            </button>
            <button onClick={handleReset} style={{ padding:'8px 12px', background: saveStatus==='reset' ? '#92400e' : '#1e1e38', border:'1px solid rgba(255,255,255,0.1)', borderRadius:5, color:'#94a3b8', fontSize:10, cursor:'pointer' }}>
              {saveStatus==='reset' ? '✓' : 'Reset'}
            </button>
          </div>
          <button onClick={() => setShowCode(c => !c)} style={{ padding:'6px 0', background:'#1e1e38', border:'1px solid rgba(251,191,36,0.25)', borderRadius:5, color:'#fbbf24', fontSize:10, cursor:'pointer' }}>
            {showCode ? '▲ Hide Export' : '▼ Export Code'}
          </button>
        </div>

        {/* ── BATTLE FIELD CANVAS ──────────────────────────────────────────── */}
        <div style={{ flex:1, overflow:'auto', background:'radial-gradient(ellipse 120% 80% at 50% 60%, #0d1a0d 0%, #0a0a14 55%)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 24px 60px' }}>

          {/* Scaled canvas container */}
          <div style={{ position:'relative', width: CANVAS_W * zoom, height: (CANVAS_H + 120) * zoom, flexShrink:0 }}>
            <div style={{ position:'absolute', top: 60 * zoom, left:0, width: CANVAS_W, height: CANVAS_H, transform:`scale(${zoom})`, transformOrigin:'top left' }}>

              {/* Ground plane glow */}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:40, background:'linear-gradient(0deg, rgba(30,80,30,0.25) 0%, transparent 100%)', pointerEvents:'none' }}/>

              {/* HERO formation */}
              <FormationHalf side="hero"  slots={heroSlots}  editedSlot={heroSlotIdx} zoom={zoom}/>

              {/* GAP divider */}
              <div style={{ position:'absolute', left: GRID_W, top:0, width: FIELD_GAP, height: CANVAS_H, background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ width:1, height:'60%', background:'rgba(255,255,255,0.07)' }}/>
              </div>

              {/* ENEMY formation */}
              <div style={{ position:'absolute', left: GRID_W + FIELD_GAP, top:0 }}>
                <FormationHalf side="enemy" slots={enemySlots} targetSlot={targetSlot} zoom={zoom}/>
              </div>

              {/* ── VFX PLAYBACK OVERLAY ────────────────────────────────── */}
              {playState !== 'idle' && entry && (
                <VfxImageOverlay
                  entry={entry} size={size}
                  startAx={startAx} startAy={startAy}
                  endAx={endAx}     endAy={endAy}
                  playing={playState === 'move'}
                />
              )}

              {/* Static VFX preview at start (when not playing) */}
              {playState === 'idle' && entry && (
                <StaticVfxPreview
                  entry={entry} size={size}
                  startAx={startAx} startAy={startAy}
                  endAx={endAx} endAy={endAy}
                />
              )}

              {/* ── TRAJECTORY LINE ─────────────────────────────────────── */}
              <svg width={CANVAS_W} height={CANVAS_H} style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:22, overflow:'visible' }}>
                {/* Dashed trajectory line */}
                <line x1={startAx} y1={startAy} x2={endAx} y2={endAy}
                  stroke="rgba(255,255,255,0.2)" strokeWidth={1.2} strokeDasharray="6 4"/>
                {/* Arrow head at end */}
                <circle cx={endAx} cy={endAy} r={4} fill="rgba(239,68,68,0.5)" stroke="#ef4444" strokeWidth={1}/>
                <circle cx={startAx} cy={startAy} r={4} fill="rgba(34,197,94,0.5)" stroke="#22c55e" strokeWidth={1}/>
                {/* Offset readouts */}
                <text x={startAx + 10} y={startAy - 6} fill="rgba(34,197,94,0.7)" fontSize={8} fontFamily="ui-monospace,monospace">
                  sx:{pos.startX} sy:{pos.startY}
                </text>
                <text x={endAx + 10} y={endAy - 6} fill="rgba(239,68,68,0.7)" fontSize={8} fontFamily="ui-monospace,monospace">
                  ex:{pos.endX} ey:{pos.endY}
                </text>
              </svg>

              {/* ── DRAGGABLE ANCHORS ────────────────────────────────────── */}
              <AnchorDot ax={startAx} ay={startAy} color="#22c55e" label="START" onDelta={onStartDelta} zoom={zoom}/>
              <AnchorDot ax={endAx}   ay={endAy}   color="#ef4444" label="END"   onDelta={onEndDelta}   zoom={zoom}/>

              {/* Grid overlay (covers full canvas) */}
              {showGrid && <GridOverlay w={CANVAS_W} h={CANVAS_H} cols={gridCols} rows={gridRows}/>}

            </div>

            {/* Hero type label */}
            <div style={{ position:'absolute', top:0, left:0, fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:1, lineHeight:1.6 }}>
              <span style={{ color: isMelee ? '#f59e0b' : '#60a5fa' }}>{heroDef?.heroType ?? 'Unknown'}</span>
              {' → '}
              <span style={{ color:'rgba(255,255,255,0.5)' }}>
                {isMelee ? 'Mid Front Row (slot 3)' : 'Mid Back Row (slot 2)'}
              </span>
            </div>

            {/* Legend */}
            <div style={{ position:'absolute', bottom:0, left:0, display:'flex', gap:16, fontSize:8, color:'rgba(255,255,255,0.3)', letterSpacing:1, lineHeight:2 }}>
              <span><span style={{ color:'#22c55e' }}>●</span> START anchor (drag)</span>
              <span><span style={{ color:'#ef4444' }}>●</span> END anchor (drag)</span>
              <span><span style={{ color:'#fbbf24' }}>✦</span> Edited hero</span>
              <span>Grey = Lucas dummy</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function VfxEditor() {
  const [screen, setScreen] = useState<'select'|'edit'>('select');
  const [heroId, setHeroId] = useState('');
  const [skill,  setSkill ] = useState<SkillKey>('bsc');

  if (screen === 'edit') {
    return <EditScreen heroId={heroId} skill={skill} onBack={() => setScreen('select')}/>;
  }
  return <SelectionScreen onEdit={(hId, sk) => { setHeroId(hId); setSkill(sk); setScreen('edit'); }}/>;
}