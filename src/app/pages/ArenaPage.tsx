import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GamePageLayout } from '../components/GamePageLayout';
import { useLanguage } from '../context/LanguageContext';

const RANKS = [
  { rank: 1,  name: 'ShadowVeil',    power: 198_450, wins: 312, losses: 14,  streak: 28, tier: 'Grandmaster' },
  { rank: 2,  name: 'IronWarden',    power: 187_210, wins: 289, losses: 22,  streak: 15, tier: 'Grandmaster' },
  { rank: 3,  name: 'BlazeProwler',  power: 175_880, wins: 264, losses: 31,  streak: 9,  tier: 'Master'      },
  { rank: 4,  name: 'NightBringer',  power: 162_540, wins: 241, losses: 40,  streak: 7,  tier: 'Master'      },
  { rank: 5,  name: 'StormCleaver',  power: 154_320, wins: 228, losses: 48,  streak: 4,  tier: 'Master'      },
  { rank: 6,  name: 'AshWalker',     power: 148_770, wins: 215, losses: 55,  streak: 0,  tier: 'Diamond'     },
  { rank: 7,  name: 'DawnRider',     power: 142_190, wins: 204, losses: 63,  streak: 2,  tier: 'Diamond'     },
  { rank: 8,  name: 'VoidEdge',      power: 138_500, wins: 196, losses: 71,  streak: 1,  tier: 'Diamond'     },
  { rank: 9,  name: 'CrimsonVeil',   power: 131_040, wins: 187, losses: 80,  streak: 0,  tier: 'Diamond'     },
  { rank: 10, name: 'LunarGuard',    power: 124_760, wins: 175, losses: 90,  streak: 3,  tier: 'Platinum'    },
];

const TIER_COLORS: Record<string, string> = {
  Grandmaster: '#FFD700',
  Master:      '#E040FB',
  Diamond:     '#40C4FF',
  Platinum:    '#B2DFDB',
};

const SEASONS = ['Season 12', 'Season 11', 'Season 10'];

function fmtPower(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export default function ArenaPage() {
  const navigate = useNavigate();
  const { t }    = useLanguage();
  const [tab, setTab]       = useState<'rank' | 'history'>('rank');
  const [season, setSeason] = useState(SEASONS[0]);

  const F = "'Playfair Display', serif";

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0d0005' }}>

      {/* ── Background gradient ── */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #1a0010 0%, #0d0005 40%, #1a0510 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(200,0,60,0.22) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 35% at 50% 100%, rgba(100,0,30,0.28) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Decorative crossed swords SVG background ── */}
      <svg style={{ position: 'absolute', left: '50%', top: '10%', transform: 'translateX(-50%)', opacity: 0.04, pointerEvents: 'none', width: 'min(340px, 45vw)', height: 'auto' }} viewBox="0 0 200 200">
        <path d="M 30,170 L 170,30 M 50,180 L 180,50" stroke="#FF3060" strokeWidth="12" strokeLinecap="round"/>
        <path d="M 170,170 L 30,30 M 150,180 L 20,50" stroke="#FF3060" strokeWidth="12" strokeLinecap="round"/>
        <circle cx="100" cy="100" r="30" fill="none" stroke="#FF3060" strokeWidth="8"/>
      </svg>

      {/* ── Header area ── */}
      <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px, 2.2vw, 22px)', fontWeight: 800, color: 'rgba(255,80,100,0.95)', letterSpacing: '0.3em', textShadow: '0 0 24px rgba(255,60,80,0.55), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {t('city.arena').toUpperCase()}
        </div>
        <div style={{ marginTop: '4px', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em' }}>
          Season Rankings
        </div>
      </div>

      {/* ── Gold separator ── */}
      <div style={{ position: 'absolute', top: '19%', left: '8%', right: '8%', height: '1px', zIndex: 10, background: 'linear-gradient(90deg, transparent 0%, rgba(255,80,100,0.5) 20%, rgba(255,80,100,0.8) 50%, rgba(255,80,100,0.5) 80%, transparent 100%)', pointerEvents: 'none' }} />

      {/* ── Season selector + Tab row ── */}
      <div style={{ position: 'absolute', top: '20.5%', left: '5%', right: '5%', zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <select
          value={season} onChange={e => setSeason(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,80,100,0.35)', borderRadius: '5px', color: 'rgba(255,200,200,0.9)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', padding: '3px 6px', cursor: 'pointer', outline: 'none', letterSpacing: '0.08em' }}
        >
          {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {(['rank', 'history'] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            style={{ background: tab === tb ? 'rgba(255,60,80,0.22)' : 'rgba(0,0,0,0.5)', border: `1px solid ${tab === tb ? 'rgba(255,60,80,0.6)' : 'rgba(255,255,255,0.15)'}`, borderRadius: '5px', color: tab === tb ? 'rgba(255,130,150,1)' : 'rgba(255,255,255,0.45)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', padding: '3px 12px', cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.2s' }}
          >
            {tb === 'rank' ? 'Leaderboard' : 'My History'}
          </button>
        ))}
      </div>

      {/* ── Leaderboard ── */}
      {tab === 'rank' && (
        <div style={{ position: 'absolute', top: '26%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px 60px', gap: '6px', padding: '0 8px 4px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {['#', 'Player', 'Power', 'W / L', 'Tier'].map(h => (
              <span key={h} style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em' }}>{h}</span>
            ))}
          </div>

          {RANKS.map(r => {
            const isTop3 = r.rank <= 3;
            const rowBg = r.rank === 1 ? 'rgba(255,215,0,0.07)' : r.rank === 2 ? 'rgba(200,200,220,0.05)' : r.rank === 3 ? 'rgba(180,100,50,0.06)' : 'rgba(255,255,255,0.025)';
            const rankColor = r.rank === 1 ? '#FFD700' : r.rank === 2 ? '#C0C0C0' : r.rank === 3 ? '#CD7F32' : 'rgba(255,255,255,0.4)';
            return (
              <div key={r.rank} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px 60px', gap: '6px', alignItems: 'center', background: rowBg, border: isTop3 ? `1px solid ${rankColor}22` : '1px solid rgba(255,255,255,0.04)', borderRadius: '6px', padding: '7px 8px', cursor: 'pointer', transition: 'background 0.15s' }}>
                <span style={{ fontFamily: F, fontSize: isTop3 ? 'clamp(9px, 1.2vw, 12px)' : 'clamp(8px, 1vw, 10px)', fontWeight: 700, color: rankColor, textAlign: 'center' }}>
                  {r.rank <= 3 ? ['🥇','🥈','🥉'][r.rank - 1] : `#${r.rank}`}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden' }}>
                  <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1.1vw, 11px)', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  {r.streak > 0 && <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(255,160,80,0.85)' }}>🔥 {r.streak} streak</span>}
                </div>
                <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', color: 'rgba(255,200,100,0.9)', whiteSpace: 'nowrap' }}>{fmtPower(r.power)}</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', color: 'rgba(200,255,200,0.8)', whiteSpace: 'nowrap' }}>{r.wins}W / {r.losses}L</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.8vw, 8px)', color: TIER_COLORS[r.tier] ?? '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.tier}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── My History tab ── */}
      {tab === 'history' && (
        <div style={{ position: 'absolute', top: '26%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" fill="rgba(255,60,80,0.08)" stroke="rgba(255,60,80,0.25)" strokeWidth="1.5"/>
            <path d="M 16,32 L 32,16 M 16,16 L 32,32" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round"/>
            <text x="24" y="28" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.2)" fontSize="20" fontFamily="'Playfair Display',serif">?</text>
          </svg>
          <span style={{ fontFamily: F, fontSize: 'clamp(9px, 1.1vw, 11px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em' }}>No battle records yet</span>
          <button
            onClick={() => {}}
            style={{ background: 'rgba(255,60,80,0.18)', border: '1px solid rgba(255,60,80,0.45)', borderRadius: '6px', color: 'rgba(255,150,150,0.9)', fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', letterSpacing: '0.18em', padding: '7px 22px', cursor: 'pointer', marginTop: '4px' }}
          >
            Challenge Now
          </button>
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

      {/* ── My Rank badge ── */}
      <div style={{ position: 'absolute', top: '12.5%', right: '4%', zIndex: 20, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(64,196,255,0.35)', borderRadius: '6px', padding: '4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
        <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em' }}>My Rank</span>
        <span style={{ fontFamily: F, fontSize: 'clamp(9px, 1.2vw, 12px)', fontWeight: 700, color: TIER_COLORS['Diamond'], letterSpacing: '0.08em' }}>#42 Diamond</span>
      </div>

      {/* ── Shared game UI overlay ── */}
      <GamePageLayout activeTab="city" />
    </div>
  );
}
