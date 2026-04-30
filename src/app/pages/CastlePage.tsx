import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GamePageLayout } from '../components/GamePageLayout';
import { useLanguage } from '../context/LanguageContext';

const F = "'Playfair Display', serif";

interface Building {
  id: string; name: string; level: number; maxLevel: number;
  effect: string; upgradeCost: number; upgradeCostType: 'gold' | 'gems';
  upgradeTime: string; accent: string; icon: React.ReactNode;
}

const BUILDINGS: Building[] = [
  { id: 'great_hall',  name: 'Great Hall',     level: 10, maxLevel: 30, effect: '+5% All Res.',    upgradeCost: 48_000, upgradeCostType: 'gold', upgradeTime: '2h 30m',  accent: '#FFD700', icon: <HallIcon/> },
  { id: 'barracks',    name: 'Barracks',        level: 8,  maxLevel: 30, effect: '+3% P.Atk',      upgradeCost: 32_000, upgradeCostType: 'gold', upgradeTime: '1h 45m',  accent: '#FF5252', icon: <SwordIcon/> },
  { id: 'mage_tower',  name: 'Mage Tower',      level: 7,  maxLevel: 30, effect: '+3% M.Atk',      upgradeCost: 30_000, upgradeCostType: 'gold', upgradeTime: '1h 30m',  accent: '#A855F7', icon: <WandIcon/> },
  { id: 'sanctuary',   name: 'Sanctuary',       level: 6,  maxLevel: 30, effect: '+5% Max HP',     upgradeCost: 28_000, upgradeCostType: 'gold', upgradeTime: '1h 15m',  accent: '#22C55E', icon: <ShieldIcon/> },
  { id: 'treasury',    name: 'Treasury',        level: 9,  maxLevel: 30, effect: '+8% Gold/hr',    upgradeCost: 40_000, upgradeCostType: 'gold', upgradeTime: '2h 00m',  accent: '#F5C842', icon: <ChestIcon/> },
  { id: 'smithy',      name: 'Smithy',          level: 5,  maxLevel: 30, effect: '-5% Craft Cost', upgradeCost: 25_000, upgradeCostType: 'gold', upgradeTime: '1h 00m',  accent: '#FB923C', icon: <AnvilIcon/> },
  { id: 'observatory', name: 'Observatory',     level: 4,  maxLevel: 20, effect: '+2% EXP gain',   upgradeCost: 80,     upgradeCostType: 'gems', upgradeTime: '45m',     accent: '#40C4FF', icon: <StarIcon/> },
];

function HallIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>; }
function SwordIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M2 2l20 20"/></svg>; }
function WandIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="m17.8 11.8 1.4 1.4"/><path d="M10.2 6.2 8.8 4.8"/><path d="m17.8 6.2-1.4 1.4"/><path d="m10.2 11.8 1.4-1.4"/><path d="M4 20l6.4-6.4"/></svg>; }
function ShieldIcon(){ return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function ChestIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2z"/><path d="M3 9h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M12 9v4"/><path d="M9 11h6"/></svg>; }
function AnvilIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10c0-3 2-7 5-7s5 4 5 7"/><path d="M4 10h16"/><path d="M6 14v6h12v-6"/><path d="M4 10v4h16v-4"/></svg>; }
function StarIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }

export default function CastlePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<Set<string>>(new Set());

  const sel = BUILDINGS.find(b => b.id === selected) ?? null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#060004' }}>

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #0d0008 0%, #060004 45%, #0a0006 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(160,0,200,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 30% at 50% 100%, rgba(80,0,120,0.24) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Decorative crown ── */}
      <svg style={{ position: 'absolute', left: '50%', top: '7%', transform: 'translateX(-50%)', opacity: 0.04, pointerEvents: 'none', width: 'min(200px, 28vw)' }} viewBox="0 0 160 120">
        <path d="M 10,100 L 10,50 L 40,80 L 80,20 L 120,80 L 150,50 L 150,100 Z" fill="#FFD700"/>
        <rect x="10" y="98" width="140" height="18" rx="4" fill="#FFD700"/>
      </svg>

      {/* ── Header ── */}
      <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px, 2.2vw, 22px)', fontWeight: 800, color: 'rgba(255,215,0,0.95)', letterSpacing: '0.3em', textShadow: '0 0 24px rgba(200,100,255,0.5), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {t('city.castle').toUpperCase()}
        </div>
        <div style={{ marginTop: '4px', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em' }}>
          Castle Upgrades
        </div>
      </div>

      <div style={{ position: 'absolute', top: '19%', left: '8%', right: '8%', height: '1px', zIndex: 10, background: 'linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.5) 20%, rgba(255,215,0,0.8) 50%, rgba(255,215,0,0.5) 80%, transparent 100%)', pointerEvents: 'none' }} />

      {/* ── Building list (left panel) ── */}
      <div style={{ position: 'absolute', top: '20.5%', bottom: '9%', left: '4%', width: selected ? '44%' : '92%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', transition: 'width 0.25s ease' }}>
        {BUILDINGS.map(b => {
          const pct = (b.level / b.maxLevel) * 100;
          const isUpgrading = upgrading.has(b.id);
          return (
            <div
              key={b.id}
              onClick={() => setSelected(b.id === selected ? null : b.id)}
              style={{ background: selected === b.id ? `${b.accent}14` : 'rgba(0,0,0,0.4)', border: `1px solid ${selected === b.id ? `${b.accent}45` : 'rgba(255,255,255,0.07)'}`, borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', transition: 'all 0.18s', display: 'flex', alignItems: 'center', gap: '9px' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${b.accent}18`, border: `1px solid ${b.accent}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: b.accent, flexShrink: 0 }}>
                {b.icon}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                  <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: b.accent, whiteSpace: 'nowrap', marginLeft: '6px' }}>Lv.{b.level}</span>
                </div>
                <div style={{ position: 'relative', height: '4px', background: 'rgba(0,0,0,0.4)', borderRadius: '2px', marginTop: '4px', border: `1px solid ${b.accent}22` }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: b.accent, borderRadius: '2px', opacity: 0.7 }} />
                </div>
                <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7.5px)', color: 'rgba(255,255,255,0.3)' }}>{b.effect}</span>
                  {isUpgrading && <span style={{ fontFamily: F, fontSize: 'clamp(5px, 0.65vw, 7px)', color: '#40C4FF', letterSpacing: '0.1em' }}>Upgrading…</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Detail panel (right) ── */}
      {sel && (
        <div style={{ position: 'absolute', top: '20.5%', bottom: '9%', right: '4%', width: '48%', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${sel.accent}30`, borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Detail header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${sel.accent}18`, border: `1px solid ${sel.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sel.accent, flexShrink: 0 }}>
                {sel.icon}
              </div>
              <div>
                <div style={{ fontFamily: F, fontSize: 'clamp(9px, 1.2vw, 12px)', fontWeight: 700, color: sel.accent }}>{sel.name}</div>
                <div style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Level {sel.level} → {sel.level + 1}</div>
              </div>
            </div>

            {/* Bonus */}
            <div style={{ background: `${sel.accent}10`, border: `1px solid ${sel.accent}25`, borderRadius: '6px', padding: '8px 10px' }}>
              <div style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', marginBottom: '4px' }}>UPGRADE BONUS</div>
              <div style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', color: sel.accent }}>{sel.effect}</div>
            </div>

            {/* Cost + time */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '7px 10px', textAlign: 'center' }}>
                <div style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7.5px)', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em' }}>COST</div>
                <div style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 700, color: sel.upgradeCostType === 'gold' ? '#F5C842' : '#40C4FF', marginTop: '2px' }}>
                  {sel.upgradeCostType === 'gold' ? '🪙' : '💎'} {sel.upgradeCost.toLocaleString()}
                </div>
              </div>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '7px 10px', textAlign: 'center' }}>
                <div style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7.5px)', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em' }}>TIME</div>
                <div style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 700, color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>{sel.upgradeTime}</div>
              </div>
            </div>

            {/* Upgrade btn */}
            <button
              disabled={upgrading.has(sel.id)}
              onClick={() => setUpgrading(prev => new Set(prev).add(sel.id))}
              style={{ background: upgrading.has(sel.id) ? 'rgba(255,255,255,0.04)' : `${sel.accent}22`, border: `1px solid ${upgrading.has(sel.id) ? 'rgba(255,255,255,0.08)' : `${sel.accent}55`}`, borderRadius: '7px', color: upgrading.has(sel.id) ? 'rgba(255,255,255,0.25)' : sel.accent, fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 700, letterSpacing: '0.18em', padding: '10px 0', cursor: upgrading.has(sel.id) ? 'default' : 'pointer', transition: 'all 0.18s', width: '100%' }}
            >
              {upgrading.has(sel.id) ? 'Upgrading…' : 'Upgrade'}
            </button>
          </div>
        </div>
      )}

      <button onClick={() => navigate('/game')} style={{ position: 'absolute', top: '12.5%', left: '4%', zIndex: 20, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px', color: 'rgba(255,255,255,0.7)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', letterSpacing: '0.1em', padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M 7,1 L 3,5 L 7,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>

      <GamePageLayout activeTab="city" />
    </div>
  );
}
