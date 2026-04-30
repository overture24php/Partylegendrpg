/**
 * GamePageLayout — shared overlay UI for all game sub-pages.
 * Renders: profile bar, resource indicators, dropdown menu,
 * settings popup, and 5-tab bottom navigation.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getMaxXpForLevel } from '../utils/expSystem';
import {
  getBgmEnabled, setBgmEnabled,
  getBgmVolume,   setBgmVolume,
} from './BgmController';

// ─── Grid / layout constants (match GameStartPage) ────────────────────────────
const COLS  = 8;
const ROWS  = 12;
// Fine 20×20 design grid — same as GameStartPage GRID_COLS/GRID_ROWS
// Use GCOLS/GROWS when the user references positions via the 20-col debug overlay.
const GCOLS = 20;
const GROWS = 20;
const cellCenter = (col: string, row: number) => {
  const COL_LABELS = ['A','B','C','D','E','F','G','H'];
  const c = COL_LABELS.indexOf(col);
  const r = row - 1;
  return { left: ((c + 0.5) / COLS) * 100, top: ((r + 0.5) / ROWS) * 100 };
};

function fmtCurrency(n: number): string {
  if (n >= 2_000_000_000) return '2B+';
  if (n >= 1_000_000_000) { const d = Math.floor((n % 1_000_000_000) / 100_000_000); return d > 0 ? `1,${d}B` : '1B'; }
  if (n >= 100_000_000) return `${Math.floor(n / 1_000_000)}M`;
  if (n >= 10_000_000)  { const mj = Math.floor(n / 1_000_000); const mn = Math.floor((n % 1_000_000) / 100_000); return mn > 0 ? `${mj},${mn}M` : `${mj}M`; }
  if (n >= 1_000_000)   { const mj = Math.floor(n / 1_000_000); const mn = Math.floor((n % 1_000_000) / 100_000); return mn > 0 ? `${mj},${mn}M` : `${mj}M`; }
  if (n >= 100_000) return `${Math.floor(n / 1_000)}k`;
  if (n >= 10_000)  return `${Math.floor(n / 1_000)}k`;
  return n.toLocaleString();
}

const getSGT = () => {
  const now = new Date();
  const sgt = { timeZone: 'Asia/Singapore' } as const;
  const day   = new Intl.DateTimeFormat('en', { ...sgt, day:   '2-digit'  }).format(now);
  const month = new Intl.DateTimeFormat('en', { ...sgt, month: 'short'    }).format(now);
  const year  = new Intl.DateTimeFormat('en', { ...sgt, year:  'numeric'  }).format(now);
  const time  = new Intl.DateTimeFormat('en', { ...sgt, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return { date: `${day} ${month} ${year}`, time };
};

export type ActiveTab = 'city' | 'hero' | 'equipment' | 'pet' | 'artifact';

interface Props {
  children?: React.ReactNode;
  activeTab?: ActiveTab;
  hidePlayerInfo?: boolean;
  hideNav?: boolean;
  hideDropdown?: boolean;
}

export function GamePageLayout({ children, activeTab, hidePlayerInfo, hideNav, hideDropdown }: Props) {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { t }     = useLanguage();

  const [serverTime,   setServerTime]   = useState(getSGT);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bgmEnabled,   setBgmEnabledUI] = useState(() => getBgmEnabled());
  const [bgmVol,       setBgmVolUI]     = useState(() => getBgmVolume());

  useEffect(() => {
    const tick = () => setServerTime(getSGT());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Gradient IDs prefixed to avoid conflicts
  const pfx = 'gpl';

  // active-tab highlight helper
  const tabStyle = (tab: ActiveTab) => ({
    background: activeTab === tab ? 'rgba(255,140,0,0.18)' : 'rgba(0,0,0,0.6)',
    boxShadow:  activeTab === tab ? 'inset 0 0 12px rgba(255,160,0,0.25)' : 'none',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

      {/* ── Shared SVG defs (gradients used by nav items) ──────────────────── */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id={`${pfx}-border-fade-h`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(255,215,0,0)" />
            <stop offset="12%"  stopColor="rgba(255,215,0,1)" />
            <stop offset="88%"  stopColor="rgba(255,215,0,1)" />
            <stop offset="100%" stopColor="rgba(255,215,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-border-blk-h`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
            <stop offset="12%"  stopColor="rgba(0,0,0,1)" />
            <stop offset="88%"  stopColor="rgba(0,0,0,1)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-border-fade-v`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="rgba(255,215,0,0)" />
            <stop offset="100%" stopColor="rgba(255,215,0,1)" />
          </linearGradient>
          <linearGradient id={`${pfx}-border-blk-v`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,1)" />
          </linearGradient>
          <linearGradient id={`${pfx}-fade-right`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0.6)" />
            <stop offset="70%"  stopColor="rgba(0,0,0,0.45)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-profile-gold`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(255,215,0,1)" />
            <stop offset="70%"  stopColor="rgba(255,215,0,0.3)" />
            <stop offset="100%" stopColor="rgba(255,215,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-profile-blk`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(0,0,0,1)" />
            <stop offset="70%"  stopColor="rgba(0,0,0,0.3)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-dm-pill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(25,12,4,0.78)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </linearGradient>
          <linearGradient id={`${pfx}-dm-open`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(25,12,4,0.82)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.62)" />
          </linearGradient>
          <linearGradient id={`${pfx}-res-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(0,0,0,0.6)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
          </linearGradient>
          <linearGradient id={`${pfx}-settings-bg-h`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
            <stop offset="14%"  stopColor="rgba(0,0,0,0.40)" />
            <stop offset="86%"  stopColor="rgba(0,0,0,0.40)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-settings-gold`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(255,215,0,0)" />
            <stop offset="14%"  stopColor="rgba(255,215,0,0.85)" />
            <stop offset="50%"  stopColor="rgba(255,215,0,1)" />
            <stop offset="86%"  stopColor="rgba(255,215,0,0.85)" />
            <stop offset="100%" stopColor="rgba(255,215,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-settings-blk`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
            <stop offset="14%"  stopColor="rgba(0,0,0,0.80)" />
            <stop offset="50%"  stopColor="rgba(0,0,0,1)" />
            <stop offset="86%"  stopColor="rgba(0,0,0,0.80)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-fade-l`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0.62)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-fade-r`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.62)" />
          </linearGradient>
          <linearGradient id={`${pfx}-divider`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(255,215,0,0)" />
            <stop offset="30%"  stopColor="rgba(255,215,0,0.7)" />
            <stop offset="50%"  stopColor="rgba(255,215,0,1)" />
            <stop offset="70%"  stopColor="rgba(255,215,0,0.7)" />
            <stop offset="100%" stopColor="rgba(255,215,0,0)" />
          </linearGradient>
          <linearGradient id={`${pfx}-power-bg`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0.4)" />
            <stop offset="65%"  stopColor="rgba(0,0,0,0.25)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
      </svg>

      {/* ── Page content slot ─────────────────────────────────────────────── */}
      {children}



      {/* ── VIP Badge ─────────────────────────────────────────────────────── */}
      {!hidePlayerInfo && <div style={{ position:'absolute', left:`${(2.1/COLS)*100}%`, top:`${(0.25/ROWS)*100}%`, width:`${(0.25/COLS)*100}%`, height:`${(1/ROWS)*100}%`, zIndex:6, cursor:'pointer', pointerEvents:'auto' }}>
        <svg viewBox="0 0 50 100" preserveAspectRatio="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
          <path d="M 10,0 L 40,0 Q 50,0 50,10 L 50,76 L 25,100 L 0,76 L 0,10 Q 0,0 10,0 Z" fill="#FF7000" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round"/>
        </svg>
        <div style={{ position:'absolute', top:'9%', left:0, right:0, textAlign:'center', color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'clamp(5px,1vw,10px)', fontWeight:700, letterSpacing:'0.04em', pointerEvents:'none', lineHeight:1 }}>VIP</div>
        <div style={{ position:'absolute', top:'38%', left:0, right:0, textAlign:'center', color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'clamp(6px,1.3vw,13px)', fontWeight:800, pointerEvents:'none', lineHeight:1 }}>{user?.vip_level ?? 0}</div>
      </div>}

      {/* ── CS Button ─────────────────────────────────────────────────────── */}
      {!hidePlayerInfo && <div style={{ position:'absolute', left:`${(2.475/COLS)*100}%`, top:`calc(${(0.5/ROWS)*100}% - 1.5625vw)`, width:'3.125vw', height:'3.125vw', zIndex:6, cursor:'pointer', pointerEvents:'auto' }}>
        <svg viewBox="0 0 100 100" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
          <circle cx="50" cy="50" r="47" fill="#29B6F6" stroke="#ffffff" strokeWidth="4"/>
          <g transform="translate(50,50) scale(0.75) translate(-50,-50)">
            <path d="M 18,54 C 18,16 82,16 82,54" stroke="white" strokeWidth="9" fill="none" strokeLinecap="round"/>
            <rect x="6" y="47" width="18" height="24" rx="6" fill="white"/>
            <rect x="76" y="47" width="18" height="24" rx="6" fill="white"/>
            <path d="M 24,69 Q 24,86 44,86" stroke="white" strokeWidth="7" fill="none" strokeLinecap="round"/>
            <circle cx="44" cy="86" r="6" fill="white"/>
          </g>
        </svg>
      </div>}

      {/* ── Discord Button ────────────────────────────────────────────────── */}
      {!hidePlayerInfo && <div style={{ position:'absolute', left:`${(2.85/COLS)*100}%`, top:`calc(${(0.5/ROWS)*100}% - 1.5625vw)`, width:'3.125vw', height:'3.125vw', zIndex:6, cursor:'pointer', pointerEvents:'auto' }}>
        <svg viewBox="0 0 100 100" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
          <circle cx="50" cy="50" r="47" fill="#29B6F6" stroke="#ffffff" strokeWidth="4"/>
          <g transform="translate(50,50) scale(0.75) translate(-50,-50)">
            <path d="M 20,32 C 20,17 30,10 40,10 C 43,10 46,11 48,13 C 49,13 50,14 50,14 C 50,14 51,13 52,13 C 54,11 57,10 60,10 C 70,10 80,17 80,32 L 80,63 C 80,75 71,83 62,85 L 62,93 L 50,84 L 38,93 L 38,85 C 29,83 20,75 20,63 Z" fill="white"/>
            <ellipse cx="38" cy="48" rx="8" ry="9" fill="#29B6F6"/>
            <ellipse cx="62" cy="48" rx="8" ry="9" fill="#29B6F6"/>
          </g>
        </svg>
      </div>}

      {/* ── Facebook Button ───────────────────────────────────────────────── */}
      {!hidePlayerInfo && <div style={{ position:'absolute', left:`${(3.225/COLS)*100}%`, top:`calc(${(0.5/ROWS)*100}% - 1.5625vw)`, width:'3.125vw', height:'3.125vw', zIndex:6, cursor:'pointer', pointerEvents:'auto' }}>
        <svg viewBox="0 0 100 100" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
          <circle cx="50" cy="50" r="47" fill="#1877F2" stroke="#ffffff" strokeWidth="4"/>
          <g transform="translate(50,50) scale(-0.75,0.75) translate(-50,-50)">
            <path fill="white" d="M 57,30 C 45,30 37,22 39,12 C 41,4 62,4 72,14 L 72,30 L 72,90 L 57,90 L 57,62 L 35,62 L 35,50 L 57,50 Z"/>
          </g>
        </svg>
      </div>}

      {/* ── Profile Box (top left) — compact 1 grid row, 11px font ─────── */}
      {!hidePlayerInfo && <div style={{ position:'absolute', top:`${(0.25/ROWS)*100}%`, left:0, width:`${(2.5/COLS)*100}%`, height:`${(1/ROWS)*100}%`, zIndex:3, pointerEvents:'none' }}>
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} viewBox="0 0 250 100" preserveAspectRatio="none">
          <path d="M 0,0 L 250,0 L 250,100 L 0,100 Z" fill={`url(#${pfx}-fade-right)`}/>
          <rect x="0" y="0"    width="250" height="2"   fill={`url(#${pfx}-profile-blk)`}/>
          <rect x="0" y="1.2"  width="250" height="1.5" fill={`url(#${pfx}-profile-gold)`}/>
          <rect x="0" y="2.7"  width="250" height="1"   fill={`url(#${pfx}-profile-blk)`}/>
          <rect x="0" y="96.3" width="250" height="1"   fill={`url(#${pfx}-profile-blk)`}/>
          <rect x="0" y="97.3" width="250" height="1.5" fill={`url(#${pfx}-profile-gold)`}/>
          <rect x="0" y="98"   width="250" height="2"   fill={`url(#${pfx}-profile-blk)`}/>
        </svg>
        <div style={{ position:'absolute', inset:0, paddingLeft:`${(0.5/2.5)*100}%`, display:'flex', flexDirection:'column', justifyContent:'center', gap:'3px' }}>
          {/* Username — 11px */}
          <div style={{ color:'#ffffff', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'11px', fontWeight:600, letterSpacing:'0.05em', textShadow:'0 1px 3px rgba(0,0,0,0.8)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.nickname ?? 'New Player'}</div>
          {/* Lv + EXP bar + EXP % — 11px */}
          <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            <span style={{ color:'#ffdd88', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'11px', fontWeight:600, textShadow:'0 1px 3px rgba(0,0,0,0.8)', whiteSpace:'nowrap' }}>Lv. {user?.level ?? 0}</span>
            {(() => {
              const curXp = user?.xp ?? 0;
              const maxXp = (user?.maxXp && user.maxXp > 0) ? user.maxXp : getMaxXpForLevel(user?.level ?? 0);
              const fillW = Math.min(100, maxXp > 0 ? (curXp / maxXp) * 100 : 0);
              return (
                <>
                  <div style={{ position:'relative', flexGrow:1, maxWidth:'55%' }}>
                    <svg width="100%" height="8" viewBox="0 0 100 8" preserveAspectRatio="none">
                      <rect x="0" y="0" width="100" height="8" fill="rgba(0,0,0,0.55)" rx="2"/>
                      {fillW > 0 && <rect x="0" y="0" width={fillW} height="8" fill="#56b4f5" rx="2"/>}
                      {fillW > 0 && <rect x="0" y="0" width={fillW} height="4" fill="rgba(255,255,255,0.18)" rx="2"/>}
                    </svg>
                  </div>
                  <span style={{ color:'#7dd3fc', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'11px', fontWeight:600, textShadow:'0 1px 3px rgba(0,0,0,0.8)', whiteSpace:'nowrap' }}>{Math.round(fillW)}%</span>
                </>
              );
            })()}
          </div>
        </div>
      </div>}

      {/* ── Power Indicator — B3→E3 in 20×20 grid (left:5%, top:10%, w:20%, h:5%) ── */}
      {!hidePlayerInfo && <div style={{ position:'absolute', left:`${(1/GCOLS)*100}%`, top:`${(2/GROWS)*100}%`, width:`${(4/GCOLS)*100}%`, height:`${(1/GROWS)*100}%`, zIndex:3, pointerEvents:'none' }}>
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} viewBox="0 0 250 100" preserveAspectRatio="none">
          {/* Background: solid black 40% on left, fade to transparent right */}
          <path d="M 0,0 L 250,0 L 250,100 L 0,100 Z" fill={`url(#${pfx}-power-bg)`}/>
          {/* Top border: dark + orange gold */}
          <rect x="0" y="0"    width="250" height="2"   fill={`url(#${pfx}-profile-blk)`}/>
          <rect x="0" y="1.2"  width="250" height="1.5" fill={`url(#${pfx}-profile-gold)`}/>
          <rect x="0" y="2.7"  width="250" height="1"   fill={`url(#${pfx}-profile-blk)`}/>
          {/* Bottom border: dark + orange gold */}
          <rect x="0" y="96.3" width="250" height="1"   fill={`url(#${pfx}-profile-blk)`}/>
          <rect x="0" y="97.3" width="250" height="1.5" fill={`url(#${pfx}-profile-gold)`}/>
          <rect x="0" y="98"   width="250" height="2"   fill={`url(#${pfx}-profile-blk)`}/>
        </svg>
        <div style={{ position:'absolute', inset:0, paddingLeft:'1.5%', display:'flex', alignItems:'center', gap:'5px' }}>
          {/* Power fist icon — same SVG as HeroDetailView */}
          <svg viewBox="0 0 24 28" style={{ height:'55%', width:'auto', flexShrink:0 }} fill="none">
            <rect x="5"  y="5"  width="4" height="7" rx="2" fill="white"/>
            <rect x="10" y="4"  width="4" height="8" rx="2" fill="white"/>
            <rect x="15" y="5"  width="4" height="7" rx="2" fill="white"/>
            <rect x="4"  y="11" width="16" height="9" rx="2.5" fill="white"/>
            <rect x="1"  y="12" width="5"  height="4" rx="2" fill="white"/>
            <rect x="5"  y="19" width="14" height="3" rx="1" fill="white" fillOpacity="0.5"/>
            <path d="M13 8 L10 14 L13 14 L11 20 L16 12 L13 12 Z" fill="rgba(0,0,0,0.35)"/>
          </svg>
          {/* Power number */}
          <span style={{ color:'#ffffff', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'11px', fontWeight:600, letterSpacing:'0.05em', textShadow:'0 1px 3px rgba(0,0,0,0.8)', whiteSpace:'nowrap' }}>
            {fmtCurrency(user?.power ?? 0)}
          </span>
        </div>
      </div>}

      {/* ── Hero EXP Resource Box ─────────────────────────────────────────── */}
      <ResourceBox left={`${(4.5/COLS)*100}%`} gradPfx={pfx}>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:'8%', paddingRight:'8%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path d="M 5,6 L 5,14 Q 5,17 8,17 Q 11,17 11,14 L 11,6 Z" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/>
              <path d="M 5.5,10 L 5.5,13.5 Q 5.5,16 8,16 Q 10.5,16 10.5,13.5 L 10.5,10 Z" fill="#4488ff"/>
              <rect x="6" y="3" width="4" height="3" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/>
              <ellipse cx="8" cy="3" rx="2.5" ry="1.2" fill="#8B4513"/>
              <ellipse cx="8" cy="2.2" rx="2.5" ry="1" fill="#A0522D"/>
            </svg>
            <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'14px', fontWeight:600, letterSpacing:'0.06em', textShadow:'-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000', whiteSpace:'nowrap' }}>{fmtCurrency(user?.hero_exp ?? 0)}</span>
          </div>
          <PlusIcon/>
        </div>
      </ResourceBox>

      {/* ── Gold Resource Box ─────────────────────────────────────────────── */}
      <ResourceBox left={`${(5.5/COLS)*100}%`} gradPfx={pfx}>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:'8%', paddingRight:'8%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#D4A017"/>
              <circle cx="12" cy="12" r="8"  fill="#F5C842"/>
              <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#8B6000" fontFamily="'Playfair Display',serif">G</text>
            </svg>
            <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'14px', fontWeight:600, letterSpacing:'0.06em', textShadow:'-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000', whiteSpace:'nowrap' }}>{fmtCurrency(user?.gold ?? 0)}</span>
          </div>
          <PlusIcon/>
        </div>
      </ResourceBox>

      {/* ── Gems Resource Box ─────────────────────────────────────────────── */}
      <ResourceBox left={`${(6.5/COLS)*100}%`} gradPfx={pfx}>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:'8%', paddingRight:'8%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <svg width="18" height="20" viewBox="0 0 14 16" fill="none">
              <polygon points="7,0 14,5 7,16 0,5" fill="#1AADEE"/>
              <polygon points="7,0 14,5 7,7 0,5"  fill="#5BCFFF"/>
              <polygon points="7,0 10,5 7,7 4,5"  fill="#A8EEFF"/>
            </svg>
            <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'14px', fontWeight:600, letterSpacing:'0.06em', textShadow:'-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000', whiteSpace:'nowrap' }}>{fmtCurrency(user?.gems ?? 0)}</span>
          </div>
          <PlusIcon/>
        </div>
      </ResourceBox>

      {/* ── Dropdown Menu ─────────────────────────────────────────────────── */}
      {!hideDropdown && <div style={{ position:'absolute', left:`${(7.5/COLS)*100}%`, top:0, width:`${(0.5/COLS)*100}%`, height: menuOpen ? `${(5/ROWS)*100}%` : `${(1/ROWS)*100}%`, zIndex:10, pointerEvents:'none' }}>

        {!menuOpen && (
          <div onClick={() => setMenuOpen(true)} style={{ position:'absolute', inset:0, cursor:'pointer', pointerEvents:'auto' }}>
            <svg viewBox="0 0 50 100" preserveAspectRatio="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
              <path d="M 10,0 L 40,0 Q 50,0 50,10 L 50,76 L 25,100 L 0,76 L 0,10 Q 0,0 10,0 Z" fill={`url(#${pfx}-dm-pill)`} stroke="rgba(255,215,0,0.88)" strokeWidth="2.2" strokeLinejoin="round"/>
              <line x1="16" y1="36" x2="34" y2="36" stroke="rgba(255,215,0,0.5)" strokeWidth="1.2" strokeLinecap="round"/>
              <polyline points="15,44 25,57 35,44" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}

        {menuOpen && (
          <>
            <svg viewBox="0 0 50 500" preserveAspectRatio="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
              <path d="M 10,0 L 40,0 Q 50,0 50,10 L 50,476 L 25,500 L 0,476 L 0,10 Q 0,0 10,0 Z" fill={`url(#${pfx}-dm-open)`} stroke="rgba(255,215,0,0.88)" strokeWidth="2.2" strokeLinejoin="round"/>
              <line x1="5" y1="100" x2="45" y2="100" stroke="rgba(255,215,0,0.35)" strokeWidth="1.4"/>
              <line x1="5" y1="200" x2="45" y2="200" stroke="rgba(255,215,0,0.35)" strokeWidth="1.4"/>
              <line x1="5" y1="300" x2="45" y2="300" stroke="rgba(255,215,0,0.35)" strokeWidth="1.4"/>
              <line x1="5" y1="400" x2="45" y2="400" stroke="rgba(255,215,0,0.35)" strokeWidth="1.4"/>
              <line x1="8" y1="476" x2="42" y2="476" stroke="rgba(255,215,0,0.35)" strokeWidth="1"/>
              <polyline points="15,480 25,494 35,480" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {/* QUEST */}
            <div style={{ position:'absolute', top:'0%', height:'20%', left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', cursor:'pointer', pointerEvents:'auto', zIndex:1 }}>
              <svg width="24" height="27" viewBox="0 0 22 26" fill="none">
                <path d="M 5,3 L 17,3 Q 19,3 19,5 L 19,23 Q 19,25 17,25 L 5,25 Q 3,25 3,23 L 3,5 Q 3,3 5,3 Z" fill="white"/>
                <path d="M 3,5 Q 3,1 5,1 L 17,1 Q 19,1 19,3" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M 3,23 Q 3,27 5,27 L 17,27 Q 19,27 19,25" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="6" y1="9"  x2="16" y2="9"  stroke="rgba(0,0,0,0.22)" strokeWidth="1.5"/>
                <line x1="6" y1="13" x2="16" y2="13" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5"/>
                <line x1="6" y1="17" x2="12" y2="17" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5"/>
              </svg>
              <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'10.5px', fontWeight:700, letterSpacing:'0.08em', textShadow:'0 1px 3px rgba(0,0,0,0.95)', lineHeight:1 }}>{t('ui.quest')}</span>
            </div>
            {/* BAG */}
            <div style={{ position:'absolute', top:'20%', height:'20%', left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', cursor:'pointer', pointerEvents:'auto', zIndex:1 }}>
              <svg width="24" height="27" viewBox="0 0 22 26" fill="none">
                <path d="M 8,5 Q 8,1 11,1 Q 14,1 14,5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <path d="M 5,6 L 17,6 Q 19,6 19,8 L 19,22 Q 19,25 17,25 L 5,25 Q 3,25 3,22 L 3,8 Q 3,6 5,6 Z" fill="white"/>
                <path d="M 9,6 Q 9,4 11,4 Q 13,4 13,6" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <rect x="6" y="15" width="10" height="8" rx="1.5" fill="rgba(0,0,0,0.15)"/>
              </svg>
              <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'10.5px', fontWeight:700, letterSpacing:'0.08em', textShadow:'0 1px 3px rgba(0,0,0,0.95)', lineHeight:1 }}>{t('ui.bag')}</span>
            </div>
            {/* FRIEND */}
            <div style={{ position:'absolute', top:'40%', height:'20%', left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', cursor:'pointer', pointerEvents:'auto', zIndex:1 }}>
              <svg width="27" height="24" viewBox="0 0 26 22" fill="none">
                <circle cx="7.5" cy="6" r="3.5" fill="white"/>
                <path d="M 1,21 Q 1,14 7.5,14 Q 10,14 11.5,15.5 L 11.5,21 Z" fill="white"/>
                <circle cx="18.5" cy="6" r="3.5" fill="white"/>
                <path d="M 25,21 Q 25,14 18.5,14 Q 16,14 14.5,15.5 L 14.5,21 Z" fill="white"/>
                <path d="M 11.5,15.5 Q 13,13 14.5,15.5 L 14.5,21 L 11.5,21 Z" fill="white"/>
              </svg>
              <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'10.5px', fontWeight:700, letterSpacing:'0.08em', textShadow:'0 1px 3px rgba(0,0,0,0.95)', lineHeight:1 }}>{t('ui.friend')}</span>
            </div>
            {/* MAIL */}
            <div style={{ position:'absolute', top:'60%', height:'20%', left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', cursor:'pointer', pointerEvents:'auto', zIndex:1 }}>
              <svg width="27" height="21" viewBox="0 0 26 20" fill="none">
                <path d="M 2,3 L 24,3 Q 25,3 25,4 L 25,18 Q 25,19 24,19 L 2,19 Q 1,19 1,18 L 1,4 Q 1,3 2,3 Z" fill="white"/>
                <path d="M 1,4 L 13,12 L 25,4" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1.8" strokeLinejoin="round"/>
              </svg>
              <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'10.5px', fontWeight:700, letterSpacing:'0.08em', textShadow:'0 1px 3px rgba(0,0,0,0.95)', lineHeight:1 }}>{t('ui.mail')}</span>
            </div>
            {/* SETTINGS */}
            <div onClick={() => { setSettingsOpen(true); setMenuOpen(false); }} style={{ position:'absolute', top:'80%', height:'15%', left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', cursor:'pointer', pointerEvents:'auto', zIndex:1 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M 12,2 L 13.8,5.8 L 17.5,4.2 L 17.8,8.2 L 21.8,9.5 L 19.8,13 L 22,16 L 18.8,17.8 L 19.8,21.8 L 15.8,21.5 L 14,24.5 L 12,22 L 10,24.5 L 8.2,21.5 L 4.2,21.8 L 5.2,17.8 L 2,16 L 4.2,13 L 2.2,9.5 L 6.2,8.2 L 6.5,4.2 L 10.2,5.8 Z" fill="white"/>
                <circle cx="12" cy="13" r="3.5" fill="rgba(0,0,0,0.6)"/>
              </svg>
              <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'10.5px', fontWeight:700, letterSpacing:'0.08em', textShadow:'0 1px 3px rgba(0,0,0,0.95)', lineHeight:1 }}>{t('ui.settings')}</span>
            </div>
            <div onClick={() => setMenuOpen(false)} style={{ position:'absolute', bottom:0, left:0, right:0, height:'5%', cursor:'pointer', pointerEvents:'auto', zIndex:2 }}/>
          </>
        )}
      </div>}

      {/* ── Bottom Navigation ─────────────────────────────────────────────── */}
      {!hideNav && (
      <>
      <NavTab
        left={`${(0.8/COLS)*100}%`}
        center={`${cellCenter('A',12).top}%`}
        tabStyle={tabStyle('city')}
        pfx={pfx}
        onClick={() => navigate('/game')}
      >
        <svg viewBox="0 0 32 24" width="42" height="33" fill="white" style={{ flexShrink:0, filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}>
          <path fillRule="evenodd" d="M 0,24 L 0,15 L 2,15 L 2,12 L 3,12 L 3,15 L 8,15 L 8,7 L 15,2 L 22,7 L 22,11 L 29,11 L 29,9 L 30,9 L 30,11 L 32,11 L 32,24 Z M 4,21 L 4,18 Q 5,16 6,18 L 6,21 Z M 11,11 L 13,11 L 13,15 L 11,15 Z M 17,11 L 19,11 L 19,15 L 17,15 Z M 13,24 L 13,20 Q 15,18 17,20 L 17,24 Z M 25,14 L 28,14 L 28,18 L 25,18 Z"/>
        </svg>
        <span style={{ color: activeTab === 'city' ? '#FFD700' : '#ffffff', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'16.5px', fontWeight:600, letterSpacing:'0.15em', whiteSpace:'nowrap', textShadow:'0 1px 6px rgba(0,0,0,0.8)', transform:`translateY(${(1/ROWS)*100/5}%)` }}>{t('ui.city')}</span>
      </NavTab>

      {/* Divider CITY/HERO */}
      <NavDivider left={`${(1.6/COLS)*100}%`} center={`${cellCenter('A',12).top}%`} pfx={pfx}/>

      <NavTab
        left={`${(2.4/COLS)*100}%`}
        center={`${cellCenter('A',12).top}%`}
        tabStyle={tabStyle('hero')}
        pfx={pfx}
        onClick={() => navigate('/game/hero')}
      >
        <svg viewBox="0 0 24 26" width="30" height="33" fill="white" style={{ flexShrink:0, filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}>
          <path fillRule="evenodd" d="M 12,2 C 7,2 5,7 5,12 L 5,18 Q 5,20 7,21 L 7,24 L 10,24 L 10,21 L 14,21 L 14,24 L 17,24 L 17,21 Q 19,20 19,18 L 19,12 C 19,7 17,2 12,2 Z M 7,13 L 17,13 L 17,15 L 7,15 Z M 11,15 L 13,15 L 13,19 L 11,19 Z"/>
        </svg>
        <span style={{ color: activeTab === 'hero' ? '#FFD700' : '#ffffff', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'16.5px', fontWeight:600, letterSpacing:'0.15em', whiteSpace:'nowrap', textShadow:'0 1px 6px rgba(0,0,0,0.8)' }}>{t('ui.hero')}</span>
      </NavTab>

      {/* Divider HERO/EQUIPMENT */}
      <NavDivider left={`${(3.2/COLS)*100}%`} center={`${cellCenter('A',12).top}%`} pfx={pfx}/>

      <NavTab
        left={`${(4.0/COLS)*100}%`}
        center={`${cellCenter('A',12).top}%`}
        tabStyle={tabStyle('equipment')}
        pfx={pfx}
        onClick={() => navigate('/game/hero')}
      >
        <svg viewBox="0 0 24 24" width="27" height="27" fill="white" style={{ flexShrink:0, filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}>
          <path d="M 1,2 L 4,1 L 23,20 L 22,23 L 19,22 L 0,3 Z"/>
          <path d="M 20,1 L 23,2 L 4,23 L 1,22 L 2,19 L 21,0 Z"/>
          <path d="M 1,7 L 3,5 L 7,9 L 5,11 Z"/>
          <path d="M 17,5 L 19,3 L 23,7 L 21,9 Z"/>
        </svg>
        <span style={{ color: activeTab === 'equipment' ? '#FFD700' : '#ffffff', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'13.5px', fontWeight:600, letterSpacing:'0.12em', whiteSpace:'nowrap', textShadow:'0 1px 6px rgba(0,0,0,0.8)' }}>{t('ui.equipment')}</span>
      </NavTab>

      {/* Divider EQ/PET */}
      <NavDivider left={`${(4.8/COLS)*100}%`} center={`${cellCenter('A',12).top}%`} pfx={pfx}/>

      <NavTab
        left={`${(5.6/COLS)*100}%`}
        center={`${cellCenter('A',12).top}%`}
        tabStyle={tabStyle('pet')}
        pfx={pfx}
        onClick={() => navigate('/game/hero')}
      >
        <svg viewBox="0 0 24 26" width="30" height="33" fill="white" style={{ flexShrink:0, filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}>
          <ellipse cx="12" cy="19" rx="7" ry="6"/>
          <ellipse cx="5" cy="9" rx="2.8" ry="3.5" transform="rotate(-15 5 9)"/>
          <ellipse cx="9.5" cy="6" rx="2.8" ry="3.5" transform="rotate(-5 9.5 6)"/>
          <ellipse cx="14.5" cy="6" rx="2.8" ry="3.5" transform="rotate(5 14.5 6)"/>
          <ellipse cx="19" cy="9" rx="2.8" ry="3.5" transform="rotate(15 19 9)"/>
        </svg>
        <span style={{ color: activeTab === 'pet' ? '#FFD700' : '#ffffff', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'16.5px', fontWeight:600, letterSpacing:'0.15em', whiteSpace:'nowrap', textShadow:'0 1px 6px rgba(0,0,0,0.8)' }}>{t('ui.pet')}</span>
      </NavTab>

      {/* Divider PET/ARTIFACT */}
      <NavDivider left={`${(6.4/COLS)*100}%`} center={`${cellCenter('A',12).top}%`} pfx={pfx}/>

      <NavTab
        left={`${(7.2/COLS)*100}%`}
        center={`${cellCenter('A',12).top}%`}
        tabStyle={tabStyle('artifact')}
        pfx={pfx}
        onClick={() => navigate('/game/hero')}
      >
        <svg viewBox="0 0 22 28" width="25" height="33" fill="white" style={{ flexShrink:0, filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}>
          <path fillRule="evenodd" d="M 11,1 C 5.5,1 1,5.5 1,11 C 1,16.5 5.5,21 11,21 C 16.5,21 21,16.5 21,11 C 21,5.5 16.5,1 11,1 Z M 10,5 L 12,5 L 12,17 L 10,17 Z M 4,10 L 18,10 L 18,12 L 4,12 Z"/>
          <path d="M 10,21 L 12,21 L 13.5,24 L 8.5,24 Z"/>
          <path d="M 6,24 L 16,24 L 17,27 L 5,27 Z"/>
        </svg>
        <span style={{ color: activeTab === 'artifact' ? '#FFD700' : '#ffffff', fontFamily:"'Roboto Condensed',sans-serif", fontSize:'15px', fontWeight:600, letterSpacing:'0.12em', whiteSpace:'nowrap', textShadow:'0 1px 6px rgba(0,0,0,0.8)' }}>{t('ui.artifact')}</span>
      </NavTab>
      </>
      )}

      {/* ── Settings dim overlay ──────────────────────────────────────────── */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.42)', zIndex:60, cursor:'default', pointerEvents:'auto' }}/>
      )}

      {/* ── Settings popup ────────────────────────────────────────────────── */}
      {settingsOpen && (
        <div onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ position:'absolute', left:'30%', top:'30%', width:'40%', height:'40%', zIndex:61, pointerEvents:'auto' }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
            <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.40)"/>
            <rect x="0"  y="0"   width="14" height="100" fill={`url(#${pfx}-fade-l)`}/>
            <rect x="86" y="0"   width="14" height="100" fill={`url(#${pfx}-fade-r)`}/>
            <rect x="0" y="0"    width="100" height="2"   fill={`url(#${pfx}-settings-blk)`}/>
            <rect x="0" y="1.2"  width="100" height="1.5" fill={`url(#${pfx}-settings-gold)`}/>
            <rect x="0" y="2.7"  width="100" height="1"   fill={`url(#${pfx}-settings-blk)`}/>
            <rect x="0" y="96.3" width="100" height="1"   fill={`url(#${pfx}-settings-blk)`}/>
            <rect x="0" y="97.3" width="100" height="1.5" fill={`url(#${pfx}-settings-gold)`}/>
            <rect x="0" y="98"   width="100" height="2"   fill={`url(#${pfx}-settings-blk)`}/>
          </svg>
          <div style={{ position:'absolute', top:'10%', left:'50%', transform:'translateX(-50%)', color:'rgba(255,215,0,0.92)', fontFamily:"'Playfair Display',serif", fontSize:'clamp(7px,1.4vw,13px)', fontWeight:700, letterSpacing:'0.22em', textShadow:'0 1px 6px rgba(0,0,0,0.9)', whiteSpace:'nowrap', pointerEvents:'none' }}>{t('ui.settings')}</div>
          <svg viewBox="0 0 100 4" preserveAspectRatio="none" style={{ position:'absolute', top:'22%', left:'10%', width:'80%', height:'3px', pointerEvents:'none' }}>
            <rect x="0" y="1" width="100" height="1.5" fill={`url(#${pfx}-divider)`}/>
          </svg>
          {/* BGM row */}
          <div style={{ position:'absolute', top:'30%', left:'16%', right:'16%', display:'flex', alignItems:'center', gap:'7px', pointerEvents:'auto' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white" style={{ flexShrink:0 }}>
              <path d="M11 5L6 9H2v6h4l5 4V5z"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
            </svg>
            <span style={{ color:'#ffffff', fontFamily:"'Playfair Display',serif", fontSize:'clamp(6px,1.1vw,10px)', fontWeight:600, letterSpacing:'0.12em', flex:1, textShadow:'0 1px 4px rgba(0,0,0,0.9)' }}>BGM</span>
            <div onClick={() => { const next=!bgmEnabled; setBgmEnabledUI(next); setBgmEnabled(next); }} style={{ position:'relative', width:'clamp(28px,5vw,44px)', height:'clamp(14px,2.4vw,22px)', borderRadius:'999px', background:bgmEnabled?'#FF7000':'rgba(255,255,255,0.18)', border:bgmEnabled?'1px solid rgba(255,180,80,0.7)':'1px solid rgba(255,255,255,0.25)', cursor:'pointer', transition:'background 0.22s', flexShrink:0 }}>
              <div style={{ position:'absolute', top:'50%', left:bgmEnabled?'calc(100% - clamp(12px,2.1vw,19px) - 1px)':'1px', transform:'translateY(-50%)', width:'clamp(12px,2.1vw,19px)', height:'clamp(12px,2.1vw,19px)', borderRadius:'50%', background:'#ffffff', boxShadow:'0 1px 4px rgba(0,0,0,0.5)', transition:'left 0.22s' }}/>
              <span style={{ position:'absolute', top:'50%', left:bgmEnabled?'4px':'auto', right:bgmEnabled?'auto':'3px', transform:'translateY(-50%)', fontSize:'clamp(4px,0.7vw,7px)', fontFamily:"'Playfair Display',serif", fontWeight:700, color:bgmEnabled?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.5)', pointerEvents:'none' }}>{bgmEnabled?'On':'Off'}</span>
            </div>
          </div>
          {/* BGM volume row */}
          <div style={{ position:'absolute', top:'52%', left:'16%', right:'16%', display:'flex', alignItems:'center', gap:'6px', pointerEvents:'auto', opacity:bgmEnabled?1:0.4, transition:'opacity 0.2s' }}>
            <div onClick={() => { if(!bgmEnabled)return; const n=Math.max(0,bgmVol-10); setBgmVolUI(n); setBgmVolume(n); }} style={{ width:'clamp(14px,2.4vw,20px)', height:'clamp(14px,2.4vw,20px)', borderRadius:'50%', background:'rgba(0,0,0,0.55)', border:'1px solid rgba(255,215,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:bgmEnabled?'pointer':'default', flexShrink:0, color:'rgba(255,215,0,1)', fontSize:'clamp(8px,1.4vw,13px)', fontWeight:700, lineHeight:1, userSelect:'none' }}>−</div>
            <div style={{ position:'relative', flex:1, height:'clamp(8px,1.4vw,12px)', borderRadius:'4px', overflow:'hidden', background:'rgba(0,0,0,0.55)', border:'1px solid rgba(255,215,0,0.25)' }}>
              <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${bgmVol}%`, background:bgmEnabled?'linear-gradient(90deg,#ff9500 0%,#ffcc44 100%)':'rgba(255,255,255,0.25)', borderRadius:'4px', transition:'width 0.15s' }}/>
              <div style={{ position:'absolute', left:0, top:0, width:`${bgmVol}%`, height:'45%', background:'rgba(255,255,255,0.18)', borderRadius:'4px 4px 0 0', pointerEvents:'none', transition:'width 0.15s' }}/>
            </div>
            <div onClick={() => { if(!bgmEnabled)return; const n=Math.min(100,bgmVol+10); setBgmVolUI(n); setBgmVolume(n); }} style={{ width:'clamp(14px,2.4vw,20px)', height:'clamp(14px,2.4vw,20px)', borderRadius:'50%', background:'rgba(0,0,0,0.55)', border:'1px solid rgba(255,215,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:bgmEnabled?'pointer':'default', flexShrink:0, color:'rgba(255,215,0,1)', fontSize:'clamp(8px,1.4vw,13px)', fontWeight:700, lineHeight:1, userSelect:'none' }}>+</div>
            <span style={{ color:bgmEnabled?'rgba(255,215,0,1)':'rgba(255,255,255,0.4)', fontFamily:"'Playfair Display',serif", fontSize:'clamp(6px,1vw,9px)', fontWeight:700, whiteSpace:'nowrap', minWidth:'clamp(18px,3vw,26px)', textAlign:'right', textShadow:'0 1px 3px rgba(0,0,0,0.8)', transition:'color 0.2s' }}>{bgmVol}%</span>
          </div>
          {/* SFX row */}
          <div style={{ position:'absolute', top:'68%', left:'16%', right:'16%', display:'flex', alignItems:'center', gap:'8px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white" style={{ flexShrink:0 }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
            </svg>
            <span style={{ color:'rgba(255,255,255,0.5)', fontFamily:"'Playfair Display',serif", fontSize:'clamp(6px,1.1vw,10px)', fontWeight:600, letterSpacing:'0.12em', flex:1 }}>SFX</span>
            <span style={{ color:'rgba(255,255,255,0.3)', fontFamily:"'Playfair Display',serif", fontSize:'clamp(5px,0.85vw,8px)', fontStyle:'italic' }}>{t('ui.coming_soon')}</span>
          </div>
          {/* Close button */}
          <div onClick={() => setSettingsOpen(false)} style={{ position:'absolute', top:0, right:0, transform:'translate(38%,-38%)', width:'clamp(16px,3.2vw,28px)', aspectRatio:'1/1', cursor:'pointer', zIndex:3 }}>
            <svg viewBox="0 0 40 40" width="100%" height="100%">
              <circle cx="20" cy="20" r="18" fill="#FF7000"/>
              <circle cx="20" cy="20" r="18" fill="none" stroke="white" strokeWidth="2.8"/>
              <circle cx="20" cy="20" r="13.5" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.2"/>
              <line x1="13" y1="13" x2="27" y2="27" stroke="white" strokeWidth="3.8" strokeLinecap="round"/>
              <line x1="27" y1="13" x2="13" y2="27" stroke="white" strokeWidth="3.8" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5"  y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function ResourceBox({ left, gradPfx, children }: { left: string; gradPfx: string; children: React.ReactNode }) {
  const COLS_LOCAL = 8;
  const ROWS_LOCAL = 12;
  return (
    <div style={{ position:'absolute', left, top:0, width:`${(1/COLS_LOCAL)*100}%`, height:`${(1/ROWS_LOCAL)*100}%`, zIndex:3, pointerEvents:'none' }}>
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="20" y="20" width="60" height="60" fill="rgba(0,0,0,0.6)"/>
        <path d="M 20,20 Q 0,20 0,50 Q 0,80 20,80 Z" fill="rgba(0,0,0,0.6)"/>
        <path d="M 80,20 Q 100,20 100,50 Q 100,80 80,80 Z" fill="rgba(0,0,0,0.6)"/>
      </svg>
      {children}
    </div>
  );
}

function NavTab({ left, center, tabStyle, pfx, onClick, children }: {
  left: string; center: string; tabStyle: React.CSSProperties;
  pfx: string; onClick: () => void; children: React.ReactNode;
}) {
  const COLS_LOCAL = 8;
  const ROWS_LOCAL = 12;
  return (
    <div
      onClick={onClick}
      style={{ position:'absolute', left, top:center, width:`${(1.6/COLS_LOCAL)*100}%`, height:`${(1/ROWS_LOCAL)*100}%`, transform:'translate(-50%,-50%)', zIndex:5, cursor:'pointer', pointerEvents:'auto' }}
    >
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="100" fill={tabStyle.background as string ?? 'rgba(0,0,0,0.6)'}/>
        {tabStyle.boxShadow && tabStyle.boxShadow !== 'none' && (
          <rect x="0" y="0" width="100" height="100" fill="rgba(255,140,0,0.1)"/>
        )}
        <rect x="0" y="0"    width="100" height="2"   fill={`url(#${pfx}-border-blk-h)`}/>
        <rect x="0" y="1.2"  width="100" height="1.5" fill={`url(#${pfx}-border-fade-h)`}/>
        <rect x="0" y="2.7"  width="100" height="1"   fill={`url(#${pfx}-border-blk-h)`}/>
        <rect x="0" y="96.3" width="100" height="1"   fill={`url(#${pfx}-border-blk-h)`}/>
        <rect x="0" y="97.3" width="100" height="1.5" fill={`url(#${pfx}-border-fade-h)`}/>
        <rect x="0" y="98"   width="100" height="2"   fill={`url(#${pfx}-border-blk-h)`}/>
      </svg>
      <div style={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', display:'flex', flexDirection:'row', alignItems:'center', gap:'4px', pointerEvents:'none', zIndex:1 }}>
        {children}
      </div>
    </div>
  );
}

function NavDivider({ left, center, pfx }: { left: string; center: string; pfx: string }) {
  const ROWS_LOCAL = 12;
  return (
    <div style={{ position:'absolute', left, top:center, width:'3px', height:`${(0.5/ROWS_LOCAL)*100}%`, transform:'translate(-50%,0%)', zIndex:6, pointerEvents:'none' }}>
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} viewBox="0 0 3 100" preserveAspectRatio="none">
        <rect x="0"   y="0" width="1"   height="100" fill={`url(#${pfx}-border-blk-v)`}/>
        <rect x="1"   y="0" width="1.5" height="100" fill={`url(#${pfx}-border-fade-v)`}/>
        <rect x="2.5" y="0" width="0.5" height="100" fill={`url(#${pfx}-border-blk-v)`}/>
      </svg>
    </div>
  );
}
