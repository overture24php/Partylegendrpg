import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GamePageLayout } from '../components/GamePageLayout';
import { useLanguage } from '../context/LanguageContext';

const F = "'Playfair Display', serif";

const SUMMON_POOLS = [
  { id: 'basic',    label: 'Tavern Summon',   cost: 300,    currency: 'gold',  costLabel: '300 Gold',   accent: '#F5C842', bg: 'rgba(180,120,0,0.12)',   border: 'rgba(255,200,80,0.35)',  desc: 'Common ~ Rare heroes' },
  { id: 'hero',     label: 'Hero Summon',     cost: 10,     currency: 'gems',  costLabel: '10 Gems',    accent: '#40C4FF', bg: 'rgba(0,100,180,0.12)',   border: 'rgba(64,196,255,0.35)', desc: 'Rare ~ Epic heroes'   },
  { id: 'elite',    label: 'Elite Summon',    cost: 60,     currency: 'gems',  costLabel: '60 Gems',    accent: '#E040FB', bg: 'rgba(120,0,180,0.14)',   border: 'rgba(224,64,251,0.35)', desc: 'Epic ~ Legendary'     },
  { id: 'mythic',   label: 'Mythic Summon',   cost: 300,    currency: 'gems',  costLabel: '300 Gems',   accent: '#FF1744', bg: 'rgba(180,0,30,0.14)',    border: 'rgba(255,23,68,0.35)',  desc: 'Legendary ~ Mythic'   },
];

const RECENT: { name: string; rarity: string; color: string; player: string; time: string }[] = [
  { name: 'Lyra',      rarity: 'Mythic',    color: '#FF1744', player: 'ShadowVeil',   time: '2m ago'  },
  { name: 'Dusk',      rarity: 'Legendary', color: '#FB923C', player: 'IronWarden',   time: '5m ago'  },
  { name: 'Vale',      rarity: 'Epic',      color: '#A855F7', player: 'BlazeProwler', time: '9m ago'  },
  { name: 'Kael',      rarity: 'Legendary', color: '#FB923C', player: 'DawnRider',    time: '14m ago' },
  { name: 'Serra',     rarity: 'Epic',      color: '#A855F7', player: 'NightBringer', time: '18m ago' },
  { name: 'Thornwood', rarity: 'Mythic',    color: '#FF1744', player: 'VoidEdge',     time: '22m ago' },
];

export default function TavernPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'summon' | 'recent'>('summon');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a0500' }}>

      {/* ── Background ── */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #1a0e00 0%, #0a0500 45%, #140a00 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(200,120,0,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 35% at 50% 100%, rgba(100,50,0,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Decorative chalice SVG ── */}
      <svg style={{ position: 'absolute', left: '50%', top: '8%', transform: 'translateX(-50%)', opacity: 0.04, pointerEvents: 'none', width: 'min(200px, 28vw)' }} viewBox="0 0 120 160">
        <path d="M 20,10 L 100,10 L 85,60 Q 80,90 60,100 Q 40,90 35,60 Z" fill="#F5C842"/>
        <rect x="52" y="100" width="16" height="40" fill="#F5C842"/>
        <rect x="30" y="140" width="60" height="10" rx="4" fill="#F5C842"/>
      </svg>

      {/* ── Header ── */}
      <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px, 2.2vw, 22px)', fontWeight: 800, color: 'rgba(245,200,66,0.95)', letterSpacing: '0.3em', textShadow: '0 0 24px rgba(200,140,0,0.6), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {t('city.tavern').toUpperCase()}
        </div>
        <div style={{ marginTop: '4px', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em' }}>
          Summon Heroes
        </div>
      </div>

      {/* ── Gold separator ── */}
      <div style={{ position: 'absolute', top: '19%', left: '8%', right: '8%', height: '1px', zIndex: 10, background: 'linear-gradient(90deg, transparent 0%, rgba(245,200,66,0.5) 20%, rgba(245,200,66,0.8) 50%, rgba(245,200,66,0.5) 80%, transparent 100%)', pointerEvents: 'none' }} />

      {/* ── Tab row ── */}
      <div style={{ position: 'absolute', top: '20.5%', left: '5%', right: '5%', zIndex: 10, display: 'flex', gap: '8px' }}>
        {(['summon', 'recent'] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            style={{ background: tab === tb ? 'rgba(200,140,0,0.22)' : 'rgba(0,0,0,0.5)', border: `1px solid ${tab === tb ? 'rgba(245,200,66,0.55)' : 'rgba(255,255,255,0.15)'}`, borderRadius: '5px', color: tab === tb ? 'rgba(245,200,120,1)' : 'rgba(255,255,255,0.4)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', padding: '4px 14px', cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.2s' }}
          >
            {tb === 'summon' ? 'Summon' : 'Recent Drops'}
          </button>
        ))}
      </div>

      {/* ── Summon pools ── */}
      {tab === 'summon' && (
        <div style={{ position: 'absolute', top: '27%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {SUMMON_POOLS.map(pool => (
            <div
              key={pool.id}
              onClick={() => setSelected(pool.id === selected ? null : pool.id)}
              style={{ background: selected === pool.id ? pool.bg : 'rgba(0,0,0,0.45)', border: `1px solid ${selected === pool.id ? pool.border : 'rgba(255,255,255,0.07)'}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '5px' }}
            >
              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontFamily: F, fontSize: 'clamp(9px, 1.2vw, 12px)', fontWeight: 700, color: pool.accent, letterSpacing: '0.1em' }}>{pool.label}</span>
                  <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.8vw, 8px)', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>{pool.desc}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={e => e.stopPropagation()}
                    style={{ background: pool.bg, border: `1px solid ${pool.border}`, borderRadius: '5px', color: pool.accent, fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', letterSpacing: '0.12em', padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                  >
                    ×1 — {pool.costLabel}
                  </button>
                  <button
                    onClick={e => e.stopPropagation()}
                    style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${pool.border}`, borderRadius: '5px', color: 'rgba(255,255,255,0.75)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', letterSpacing: '0.12em', padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                  >
                    ×10
                  </button>
                </div>
              </div>

              {/* Rates row (visible when selected) */}
              {selected === pool.id && (
                <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: `1px solid ${pool.border}`, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {pool.id === 'basic'  && [['Common','#22C55E','45%'],['Rare','#1877F2','40%'],['Epic','#A855F7','15%']].map(([r,c,p]) => <RateTag key={r} label={r} color={c} pct={p}/>)}
                  {pool.id === 'hero'   && [['Rare','#1877F2','55%'],['Epic','#A855F7','40%'],['Legendary','#FB923C','5%']].map(([r,c,p]) => <RateTag key={r} label={r} color={c} pct={p}/>)}
                  {pool.id === 'elite'  && [['Epic','#A855F7','60%'],['Legendary','#FB923C','35%'],['Mythic','#FF1744','5%']].map(([r,c,p]) => <RateTag key={r} label={r} color={c} pct={p}/>)}
                  {pool.id === 'mythic' && [['Legendary','#FB923C','70%'],['Mythic','#FF1744','30%']].map(([r,c,p]) => <RateTag key={r} label={r} color={c} pct={p}/>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Recent drops ── */}
      {tab === 'recent' && (
        <div style={{ position: 'absolute', top: '27%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {RECENT.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.42)', border: `1px solid ${r.color}22`, borderRadius: '7px', padding: '8px 12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color, flexShrink: 0, boxShadow: `0 0 6px ${r.color}` }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1.1vw, 11px)', fontWeight: 700, color: r.color }}>{r.name}</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.8vw, 8px)', color: 'rgba(255,255,255,0.3)', marginLeft: '6px' }}>({r.rarity})</span>
              </div>
              <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.5)' }}>{r.player}</span>
              <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{r.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Back button ── */}
      <button
        onClick={() => navigate('/game')}
        style={{ position: 'absolute', top: '12.5%', left: '4%', zIndex: 20, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px', color: 'rgba(255,255,255,0.7)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', letterSpacing: '0.1em', padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M 7,1 L 3,5 L 7,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>

      <GamePageLayout activeTab="city" />
    </div>
  );
}

function RateTag({ label, color, pct }: { label: string; color: string; pct: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(6px, 0.75vw, 8px)', color }}>{pct}</span>
    </div>
  );
}
