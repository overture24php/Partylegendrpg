import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GamePageLayout } from '../components/GamePageLayout';
import { useLanguage } from '../context/LanguageContext';

const F = "'Playfair Display', serif";

interface Event {
  id: string; title: string; type: string; typeColor: string;
  desc: string; ends: string; progress?: number; reward: string;
  rewardColor: string; claimed?: boolean;
}

const EVENTS: Event[] = [
  { id: 'e1', title: 'Realm Shatter',        type: 'Seasonal',   typeColor: '#FF1744', desc: 'Defeat the World Boss and claim legendary rewards.', ends: '6d 12h',  progress: 62, reward: 'Mythic Summon ×5',      rewardColor: '#FF1744'  },
  { id: 'e2', title: 'Crystal Hunt',          type: 'Weekly',     typeColor: '#40C4FF', desc: 'Collect 200 Void Crystals from dungeons.',          ends: '2d 4h',   progress: 35, reward: '500 Gems + Epic Hero',   rewardColor: '#40C4FF'  },
  { id: 'e3', title: 'Hero Festival',         type: 'Permanent',  typeColor: '#A855F7', desc: 'Login 7 consecutive days for grand prizes.',        ends: '∞',        progress: 71, reward: 'Legendary Shard ×20',    rewardColor: '#A855F7'  },
  { id: 'e4', title: 'Guild Conquest',        type: 'Weekly',     typeColor: '#FB923C', desc: 'Contribute 10,000 points to guild conquest war.',   ends: '4d 8h',   progress: 88, reward: '800 Gems',              rewardColor: '#FB923C'  },
  { id: 'e5', title: 'Birthday Bonanza',      type: 'Limited',    typeColor: '#FFD700', desc: 'Log in during the celebration period for gifts.',   ends: '18h',      progress: 100, reward: 'Cosmetic Pack',         rewardColor: '#FFD700', claimed: true },
  { id: 'e6', title: 'Void Rift Challenge',   type: 'Daily',      typeColor: '#22C55E', desc: 'Complete 3 Void Rift runs today.',                  ends: '6h 30m',  progress: 33, reward: '150 Gems + 5k Gold',    rewardColor: '#22C55E'  },
];

const TYPE_ORDER = ['Seasonal', 'Limited', 'Weekly', 'Daily', 'Permanent'];

export default function EventPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [filter, setFilter] = useState<string>('All');
  const [claimed, setClaimed] = useState<Set<string>>(new Set(EVENTS.filter(e => e.claimed).map(e => e.id)));

  const types = ['All', ...TYPE_ORDER.filter(ty => EVENTS.some(e => e.type === ty))];
  const filtered = filter === 'All' ? EVENTS : EVENTS.filter(e => e.type === filter);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#020810' }}>

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #040e1a 0%, #020810 45%, #051018 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(0,140,200,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 30% at 50% 100%, rgba(0,80,160,0.22) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Decorative compass / exploration symbol ── */}
      <svg style={{ position: 'absolute', left: '50%', top: '7%', transform: 'translateX(-50%)', opacity: 0.04, pointerEvents: 'none', width: 'min(200px, 28vw)' }} viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="64" fill="none" stroke="#40C4FF" strokeWidth="6"/>
        <polygon points="70,20 78,62 70,70 62,62" fill="#40C4FF"/>
        <polygon points="70,120 78,78 70,70 62,78" fill="#40C4FF" opacity="0.5"/>
        <polygon points="20,70 62,62 70,70 62,78" fill="#40C4FF" opacity="0.5"/>
        <polygon points="120,70 78,62 70,70 78,78" fill="#40C4FF"/>
      </svg>

      {/* ── Header ── */}
      <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px, 2.2vw, 22px)', fontWeight: 800, color: 'rgba(56,189,248,0.95)', letterSpacing: '0.3em', textShadow: '0 0 24px rgba(0,160,220,0.55), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {t('city.exploration').toUpperCase()}
        </div>
        <div style={{ marginTop: '4px', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em' }}>
          Events &amp; Exploration
        </div>
      </div>

      <div style={{ position: 'absolute', top: '19%', left: '8%', right: '8%', height: '1px', zIndex: 10, background: 'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.5) 20%, rgba(56,189,248,0.8) 50%, rgba(56,189,248,0.5) 80%, transparent 100%)', pointerEvents: 'none' }} />

      {/* ── Filter chips ── */}
      <div style={{ position: 'absolute', top: '20.2%', left: '5%', right: '5%', zIndex: 10, display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '2px' }}>
        {types.map(ty => (
          <button key={ty} onClick={() => setFilter(ty)}
            style={{ background: filter === ty ? 'rgba(0,140,200,0.2)' : 'rgba(0,0,0,0.45)', border: `1px solid ${filter === ty ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '5px', color: filter === ty ? 'rgba(130,220,255,1)' : 'rgba(255,255,255,0.3)', fontFamily: F, fontSize: 'clamp(6px, 0.8vw, 8.5px)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.1em', transition: 'all 0.18s', flexShrink: 0 }}
          >
            {ty}
          </button>
        ))}
      </div>

      {/* ── Event list ── */}
      <div style={{ position: 'absolute', top: '27%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {filtered.map(ev => {
          const isClaimed = claimed.has(ev.id);
          const isDone = (ev.progress ?? 0) >= 100;
          return (
            <div key={ev.id} style={{ background: 'rgba(0,0,0,0.42)', border: `1px solid ${ev.typeColor}22`, borderRadius: '9px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '7px', opacity: isClaimed ? 0.55 : 1 }}>
              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: `${ev.typeColor}20`, border: `1px solid ${ev.typeColor}45`, borderRadius: '4px', padding: '1px 7px', flexShrink: 0 }}>
                  <span style={{ fontFamily: F, fontSize: 'clamp(5px, 0.65vw, 7px)', color: ev.typeColor, letterSpacing: '0.1em' }}>{ev.type}</span>
                </div>
                <span style={{ flex: 1, fontFamily: F, fontSize: 'clamp(9px, 1.2vw, 12px)', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7.5px)', color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap' }}>⏳ {ev.ends}</span>
              </div>

              {/* Desc */}
              <p style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.45, margin: 0 }}>{ev.desc}</p>

              {/* Progress bar */}
              {ev.progress !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, position: 'relative', height: '5px', background: 'rgba(0,0,0,0.4)', borderRadius: '3px', border: `1px solid ${ev.typeColor}22` }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(ev.progress, 100)}%`, background: ev.typeColor, borderRadius: '3px', opacity: 0.75, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7.5px)', color: ev.typeColor, whiteSpace: 'nowrap', minWidth: '28px', textAlign: 'right' }}>{ev.progress}%</span>
                </div>
              )}

              {/* Reward + claim row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7.5px)', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>REWARD</span>
                  <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', color: ev.rewardColor, fontWeight: 600 }}>{ev.reward}</span>
                </div>
                <button
                  disabled={isClaimed || !isDone}
                  onClick={() => setClaimed(prev => new Set(prev).add(ev.id))}
                  style={{
                    background: isClaimed ? 'rgba(255,255,255,0.04)' : isDone ? `${ev.typeColor}25` : 'rgba(0,0,0,0.4)',
                    border: `1px solid ${isClaimed ? 'rgba(255,255,255,0.06)' : isDone ? `${ev.typeColor}55` : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '5px',
                    color: isClaimed ? 'rgba(255,255,255,0.2)' : isDone ? ev.typeColor : 'rgba(255,255,255,0.25)',
                    fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', letterSpacing: '0.12em',
                    padding: '4px 14px', cursor: isClaimed || !isDone ? 'default' : 'pointer',
                    whiteSpace: 'nowrap', transition: 'all 0.18s', flexShrink: 0,
                  }}
                >
                  {isClaimed ? 'Claimed ✓' : isDone ? 'Claim' : 'In Progress'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => navigate('/game')} style={{ position: 'absolute', top: '12.5%', left: '4%', zIndex: 20, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px', color: 'rgba(255,255,255,0.7)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', letterSpacing: '0.1em', padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M 7,1 L 3,5 L 7,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>

      <GamePageLayout activeTab="city" />
    </div>
  );
}
