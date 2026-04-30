import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GamePageLayout } from '../components/GamePageLayout';
import { useLanguage } from '../context/LanguageContext';

const F = "'Playfair Display', serif";

const GUILD = {
  name: 'Eternal Forge',
  level: 14,
  emblem: '⚔️',
  members: 28,
  maxMembers: 30,
  totalPower: 4_820_500,
  rank: 7,
  wins: 148,
  losses: 32,
  notice: 'Guild war every Sunday 20:00 SGT. All members must participate. Check Discord for strategy.',
};

const MEMBERS = [
  { name: 'ShadowVeil',   role: 'Master',     power: 198_450, online: true,  contrib: 12400 },
  { name: 'IronWarden',   role: 'Officer',    power: 187_210, online: true,  contrib: 10850 },
  { name: 'BlazeProwler', role: 'Officer',    power: 175_880, online: false, contrib: 9200  },
  { name: 'NightBringer', role: 'Elite',      power: 162_540, online: true,  contrib: 8700  },
  { name: 'StormCleaver', role: 'Elite',      power: 154_320, online: false, contrib: 7650  },
  { name: 'AshWalker',    role: 'Member',     power: 148_770, online: false, contrib: 6200  },
  { name: 'DawnRider',    role: 'Member',     power: 142_190, online: true,  contrib: 5900  },
  { name: 'VoidEdge',     role: 'Member',     power: 138_500, online: false, contrib: 5400  },
  { name: 'CrimsonVeil',  role: 'Member',     power: 131_040, online: true,  contrib: 4800  },
  { name: 'LunarGuard',   role: 'Member',     power: 124_760, online: false, contrib: 4200  },
];

const ROLE_COLORS: Record<string, string> = {
  Master:  '#FFD700',
  Officer: '#FB923C',
  Elite:   '#A855F7',
  Member:  'rgba(255,255,255,0.5)',
};

function fmtPower(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export default function GuildPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [tab, setTab] = useState<'info' | 'members' | 'war'>('info');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#020a14' }}>

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #041220 0%, #020a14 45%, #061018 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(0,100,200,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Decorative shield ── */}
      <svg style={{ position: 'absolute', left: '50%', top: '8%', transform: 'translateX(-50%)', opacity: 0.035, pointerEvents: 'none', width: 'min(220px, 30vw)' }} viewBox="0 0 140 160">
        <path d="M 70,5 L 130,30 L 130,90 Q 130,140 70,158 Q 10,140 10,90 L 10,30 Z" fill="#40C4FF"/>
        <path d="M 70,30 L 100,45 L 100,85 Q 100,115 70,128 Q 40,115 40,85 L 40,45 Z" fill="none" stroke="#40C4FF" strokeWidth="4"/>
      </svg>

      {/* ── Header ── */}
      <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px, 2.2vw, 22px)', fontWeight: 800, color: 'rgba(64,196,255,0.95)', letterSpacing: '0.3em', textShadow: '0 0 24px rgba(0,140,255,0.55), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {t('city.guild').toUpperCase()}
        </div>
        <div style={{ marginTop: '3px', fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em' }}>
          {GUILD.name} · Lv.{GUILD.level}
        </div>
      </div>

      <div style={{ position: 'absolute', top: '19%', left: '8%', right: '8%', height: '1px', zIndex: 10, background: 'linear-gradient(90deg, transparent 0%, rgba(64,196,255,0.5) 20%, rgba(64,196,255,0.8) 50%, rgba(64,196,255,0.5) 80%, transparent 100%)', pointerEvents: 'none' }} />

      {/* ── Tab row ── */}
      <div style={{ position: 'absolute', top: '20.5%', left: '5%', right: '5%', zIndex: 10, display: 'flex', gap: '6px' }}>
        {(['info', 'members', 'war'] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            style={{ background: tab === tb ? 'rgba(0,120,200,0.22)' : 'rgba(0,0,0,0.5)', border: `1px solid ${tab === tb ? 'rgba(64,196,255,0.55)' : 'rgba(255,255,255,0.12)'}`, borderRadius: '5px', color: tab === tb ? 'rgba(130,220,255,1)' : 'rgba(255,255,255,0.35)', fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', padding: '4px 14px', cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.2s' }}
          >
            {tb === 'info' ? 'Overview' : tb === 'members' ? 'Members' : 'Guild War'}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'info' && (
        <div style={{ position: 'absolute', top: '27%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            {[
              { label: 'Guild Rank', value: `#${GUILD.rank}`, color: '#FFD700' },
              { label: 'Total Power', value: fmtPower(GUILD.totalPower), color: '#FB923C' },
              { label: 'Members', value: `${GUILD.members}/${GUILD.maxMembers}`, color: '#40C4FF' },
              { label: 'Wins', value: `${GUILD.wins}`, color: '#22C55E' },
              { label: 'Losses', value: `${GUILD.losses}`, color: '#FF5252' },
              { label: 'Win Rate', value: `${((GUILD.wins / (GUILD.wins + GUILD.losses)) * 100).toFixed(0)}%`, color: '#A855F7' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(64,196,255,0.12)', borderRadius: '7px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>{s.label}</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(10px, 1.3vw, 13px)', fontWeight: 700, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Notice board */}
          <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(64,196,255,0.18)', borderRadius: '8px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(64,196,255,0.7)', letterSpacing: '0.15em' }}>NOTICE BOARD</span>
            <p style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: 0 }}>{GUILD.notice}</p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['Guild Chest', 'Tech Tree', 'Donate'].map(btn => (
              <button key={btn} style={{ flex: 1, background: 'rgba(0,100,180,0.15)', border: '1px solid rgba(64,196,255,0.28)', borderRadius: '6px', color: 'rgba(130,210,255,0.85)', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', letterSpacing: '0.1em', padding: '7px 4px', cursor: 'pointer' }}>
                {btn}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Members ── */}
      {tab === 'members' && (
        <div style={{ position: 'absolute', top: '27%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 70px', gap: '6px', padding: '0 6px 4px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {['Name', 'Role', 'Power', 'Contrib.'].map(h => (
              <span key={h} style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em' }}>{h}</span>
            ))}
          </div>
          {MEMBERS.map((m, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 70px', gap: '6px', alignItems: 'center', background: 'rgba(0,0,0,0.38)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px', padding: '7px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: m.online ? '#22C55E' : 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
                <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
              </div>
              <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.8vw, 9px)', color: ROLE_COLORS[m.role] ?? '#aaa' }}>{m.role}</span>
              <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.8vw, 9px)', color: 'rgba(255,200,100,0.85)' }}>{fmtPower(m.power)}</span>
              <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.8vw, 9px)', color: 'rgba(200,255,200,0.7)' }}>{m.contrib.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Guild War ── */}
      {tab === 'war' && (
        <div style={{ position: 'absolute', top: '27%', bottom: '9%', left: '5%', right: '5%', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', paddingTop: '20px' }}>
          <div style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(64,196,255,0.22)', borderRadius: '10px', padding: '16px 24px', textAlign: 'center', width: '100%', maxWidth: '360px' }}>
            <div style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', marginBottom: '8px' }}>NEXT GUILD WAR</div>
            <div style={{ fontFamily: F, fontSize: 'clamp(14px, 2vw, 20px)', fontWeight: 800, color: '#40C4FF', letterSpacing: '0.08em' }}>Sunday 20:00 SGT</div>
            <div style={{ marginTop: '8px', fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', color: 'rgba(255,255,255,0.45)' }}>vs. <span style={{ color: '#FB923C' }}>Crimson Order</span></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center', width: '100%', maxWidth: '360px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: F, fontSize: 'clamp(9px, 1.2vw, 12px)', fontWeight: 700, color: '#40C4FF' }}>Eternal Forge</div>
              <div style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>Lv.{GUILD.level} · Rank #{GUILD.rank}</div>
            </div>
            <div style={{ fontFamily: F, fontSize: 'clamp(11px, 1.5vw, 15px)', fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>VS</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: F, fontSize: 'clamp(9px, 1.2vw, 12px)', fontWeight: 700, color: '#FB923C' }}>Crimson Order</div>
              <div style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>Lv.12 · Rank #10</div>
            </div>
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
