import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GamePageLayout } from '../components/GamePageLayout';
import { useLanguage } from '../context/LanguageContext';

const F = "'Playfair Display', serif";

const MAX_FLOOR = 120;
const CURRENT_FLOOR = 37;

const FLOOR_REWARDS: Record<number, { label: string; color: string }> = {
  10:  { label: '500 Gems',      color: '#40C4FF' },
  20:  { label: 'Epic Hero',     color: '#A855F7' },
  30:  { label: '1000 Gems',     color: '#40C4FF' },
  40:  { label: 'Legendary Eq.', color: '#FB923C' },
  50:  { label: '2000 Gems',     color: '#40C4FF' },
  60:  { label: 'Mythic Shard',  color: '#FF1744' },
  80:  { label: 'Mythic Hero',   color: '#FF1744' },
  100: { label: 'Title: Legend', color: '#FFD700' },
  120: { label: 'Emblem: Apex',  color: '#FFD700' },
};

const FLOOR_DISPLAY = [10,20,30,40,50,60,70,80,90,100,110,120];

export default function TowerPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [tab, setTab] = useState<'floors' | 'record'>('floors');

  const progressPct = (CURRENT_FLOOR / MAX_FLOOR) * 100;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#080010' }}>

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(175deg, #0e0020 0%, #080010 45%, #10001a 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(140,0,220,0.22) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 30% at 50% 100%, rgba(80,0,140,0.28) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Decorative tower silhouette ── */}
      <svg style={{ position: 'absolute', left: '50%', top: '6%', transform: 'translateX(-50%)', opacity: 0.04, pointerEvents: 'none', width: 'min(160px, 22vw)' }} viewBox="0 0 80 200">
        <rect x="30" y="160" width="20" height="40" fill="#A855F7"/>
        <rect x="20" y="80" width="40" height="80" fill="#A855F7"/>
        <rect x="24" y="50" width="32" height="30" fill="#A855F7"/>
        <polygon points="40,0 55,50 25,50" fill="#A855F7"/>
        <rect x="14" y="90" width="10" height="30" fill="#A855F7"/>
        <rect x="56" y="90" width="10" height="30" fill="#A855F7"/>
      </svg>

      {/* ── Header ── */}
      <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px, 2.2vw, 22px)', fontWeight: 800, color: 'rgba(168,85,247,0.95)', letterSpacing: '0.3em', textShadow: '0 0 24px rgba(140,0,220,0.6), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {t('city.tower').toUpperCase()}
        </div>
        <div style={{ marginTop: '4px', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em' }}>
          Challenge Tower
        </div>
      </div>

      <div style={{ position: 'absolute', top: '19%', left: '8%', right: '8%', height: '1px', zIndex: 10, background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.5) 20%, rgba(168,85,247,0.8) 50%, rgba(168,85,247,0.5) 80%, transparent 100%)', pointerEvents: 'none' }} />

      {/* ── Progress bar ── */}
      <div style={{ position: 'absolute', top: '20.2%', left: '5%', right: '5%', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1.1vw, 11px)', fontWeight: 700, color: 'rgba(200,150,255,0.9)' }}>Floor {CURRENT_FLOOR}</span>
          <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em' }}>/ {MAX_FLOOR}</span>
        </div>
        <div style={{ position: 'relative', height: '6px', background: 'rgba(0,0,0,0.5)', borderRadius: '3px', border: '1px solid rgba(168,85,247,0.2)' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPct}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: '3px', transition: 'width 0.4s ease' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, width: `${progressPct}%`, height: '45%', background: 'rgba(255,255,255,0.18)', borderRadius: '3px' }} />
        </div>
      </div>

      {/* ── Tab row ── */}
      <div style={{ position: 'absolute', top: '27%', left: '5%', right: '5%', zIndex: 10, display: 'flex', gap: '6px' }}>
        {(['floors', 'record'] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            style={{ background: tab === tb ? 'rgba(120,0,200,0.22)' : 'rgba(0,0,0,0.5)', border: `1px solid ${tab === tb ? 'rgba(168,85,247,0.55)' : 'rgba(255,255,255,0.12)'}`, borderRadius: '5px', color: tab === tb ? 'rgba(200,150,255,1)' : 'rgba(255,255,255,0.35)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', padding: '4px 14px', cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.2s' }}
          >
            {tb === 'floors' ? 'Floors' : 'Records'}
          </button>
        ))}
      </div>

      {/* ── Floor list ── */}
      {tab === 'floors' && (
        <div style={{ position: 'absolute', top: '33%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {FLOOR_DISPLAY.map(floor => {
            const cleared = floor < CURRENT_FLOOR;
            const current = floor === Math.ceil(CURRENT_FLOOR / 10) * 10;
            const locked  = floor > CURRENT_FLOOR;
            const reward  = FLOOR_REWARDS[floor];
            return (
              <div key={floor} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: cleared ? 'rgba(100,0,200,0.1)' : current ? 'rgba(168,85,247,0.14)' : 'rgba(0,0,0,0.38)', border: `1px solid ${cleared ? 'rgba(168,85,247,0.2)' : current ? 'rgba(168,85,247,0.45)' : 'rgba(255,255,255,0.05)'}`, borderRadius: '7px', padding: '8px 12px', cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.4 : 1 }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: cleared ? 'rgba(100,0,200,0.25)' : current ? 'rgba(168,85,247,0.3)' : 'rgba(0,0,0,0.4)', border: `1.5px solid ${cleared ? 'rgba(168,85,247,0.5)' : current ? 'rgba(168,85,247,0.8)' : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {cleared ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M 5,12 L 10,17 L 19,7" stroke="rgba(168,85,247,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ) : (
                    <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 700, color: current ? 'rgba(200,150,255,0.9)' : 'rgba(255,255,255,0.3)' }}>{floor}</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1.1vw, 11px)', fontWeight: 600, color: cleared ? 'rgba(200,150,255,0.8)' : current ? '#fff' : 'rgba(255,255,255,0.3)' }}>Floor {floor}</span>
                  {reward && <span style={{ marginLeft: '8px', fontFamily: F, fontSize: 'clamp(6px, 0.8vw, 8px)', color: reward.color }}>🎁 {reward.label}</span>}
                </div>
                {current && (
                  <button style={{ background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.55)', borderRadius: '5px', color: 'rgba(200,150,255,0.9)', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', letterSpacing: '0.12em', padding: '4px 12px', cursor: 'pointer' }}>
                    Challenge
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Records ── */}
      {tab === 'record' && (
        <div style={{ position: 'absolute', top: '33%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: 'Highest Floor',   value: `Floor ${CURRENT_FLOOR - 1}`, color: '#A855F7' },
            { label: 'Best Time',       value: '2m 14s',                     color: '#40C4FF' },
            { label: 'Total Attempts',  value: '84',                         color: 'rgba(255,255,255,0.6)' },
            { label: 'Perfect Clears',  value: '12',                         color: '#22C55E' },
            { label: 'Gems Earned',     value: '4,800',                      color: '#40C4FF' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.38)', border: '1px solid rgba(168,85,247,0.1)', borderRadius: '6px', padding: '9px 14px' }}>
              <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em' }}>{s.label}</span>
              <span style={{ fontFamily: F, fontSize: 'clamp(9px, 1.2vw, 12px)', fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
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
