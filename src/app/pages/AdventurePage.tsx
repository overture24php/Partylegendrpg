import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GamePageLayout } from '../components/GamePageLayout';
import { useLanguage } from '../context/LanguageContext';

const F = "'Playfair Display', serif";

interface Stage {
  id: string; chapter: number; stage: number; name: string;
  difficulty: 'Normal' | 'Hard' | 'Nightmare';
  cleared: boolean; stars: number; recommend: number; energy: number;
}

const STAGES: Stage[] = [
  { id: 's1',  chapter: 1, stage: 1,  name: 'Goblin Hollow',      difficulty: 'Normal',    cleared: true,  stars: 3, recommend: 800,   energy: 6  },
  { id: 's2',  chapter: 1, stage: 2,  name: 'Darkwood Path',      difficulty: 'Normal',    cleared: true,  stars: 3, recommend: 1_200, energy: 6  },
  { id: 's3',  chapter: 1, stage: 3,  name: 'Ruined Outpost',     difficulty: 'Normal',    cleared: true,  stars: 2, recommend: 1_800, energy: 6  },
  { id: 's4',  chapter: 1, stage: 4,  name: 'Ogre Lair',          difficulty: 'Normal',    cleared: true,  stars: 1, recommend: 2_500, energy: 6  },
  { id: 's5',  chapter: 1, stage: 5,  name: 'Warlord Krag',       difficulty: 'Normal',    cleared: false, stars: 0, recommend: 3_200, energy: 10 },
  { id: 's6',  chapter: 2, stage: 1,  name: 'Ashen Plains',       difficulty: 'Normal',    cleared: false, stars: 0, recommend: 4_000, energy: 8  },
  { id: 's7',  chapter: 2, stage: 2,  name: 'Shadow Citadel',     difficulty: 'Hard',      cleared: false, stars: 0, recommend: 8_500, energy: 12 },
  { id: 's8',  chapter: 2, stage: 3,  name: 'The Forsaken Keep',  difficulty: 'Hard',      cleared: false, stars: 0, recommend: 12_000,energy: 12 },
  { id: 's9',  chapter: 3, stage: 1,  name: 'Void Gate',          difficulty: 'Nightmare', cleared: false, stars: 0, recommend: 20_000,energy: 15 },
];

const DIFF_COLORS = { Normal: '#22C55E', Hard: '#FB923C', Nightmare: '#FF1744' };

function StarRow({ n, max }: { n: number; max: number }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {Array.from({ length: max }).map((_, i) => (
        <svg key={i} width="10" height="10" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={i < n ? '#FFD700' : 'rgba(255,255,255,0.1)'} stroke={i < n ? '#CC9900' : 'rgba(255,255,255,0.08)'} strokeWidth="1"/>
        </svg>
      ))}
    </div>
  );
}

export default function AdventurePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [chapter, setChapter]   = useState<number | 'all'>('all');

  const chapters = [...new Set(STAGES.map(s => s.chapter))];
  const filtered = chapter === 'all' ? STAGES : STAGES.filter(s => s.chapter === chapter);
  const sel = STAGES.find(s => s.id === selected) ?? null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#060800' }}>

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #0c1000 0%, #060800 45%, #080c00 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(80,160,0,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 30% at 80% 60%, rgba(0,100,50,0.16) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Decorative map/compass ── */}
      <svg style={{ position: 'absolute', left: '50%', top: '6%', transform: 'translateX(-50%)', opacity: 0.04, pointerEvents: 'none', width: 'min(220px, 30vw)' }} viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="64" fill="none" stroke="#84CC16" strokeWidth="4"/>
        <circle cx="70" cy="70" r="44" fill="none" stroke="#84CC16" strokeWidth="2"/>
        <polygon points="70,16 74,66 70,74 66,66" fill="#84CC16"/>
        <polygon points="70,124 74,74 70,66 66,74" fill="#84CC16" opacity="0.4"/>
        <polygon points="16,70 66,66 74,70 66,74" fill="#84CC16" opacity="0.4"/>
        <polygon points="124,70 74,66 66,70 74,74" fill="#84CC16"/>
      </svg>

      {/* ── Header ── */}
      <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px, 2.2vw, 22px)', fontWeight: 800, color: 'rgba(132,204,22,0.95)', letterSpacing: '0.3em', textShadow: '0 0 24px rgba(80,160,0,0.55), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {t('menu.adventure').toUpperCase()}
        </div>
        <div style={{ marginTop: '4px', fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em' }}>
          Campaign Stages
        </div>
      </div>

      <div style={{ position: 'absolute', top: '19%', left: '8%', right: '8%', height: '1px', zIndex: 10, background: 'linear-gradient(90deg, transparent 0%, rgba(132,204,22,0.5) 20%, rgba(132,204,22,0.8) 50%, rgba(132,204,22,0.5) 80%, transparent 100%)', pointerEvents: 'none' }} />

      {/* ── Chapter filter ── */}
      <div style={{ position: 'absolute', top: '20.2%', left: '5%', right: '5%', zIndex: 10, display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '2px' }}>
        {(['all', ...chapters] as (number | 'all')[]).map(ch => (
          <button key={ch} onClick={() => setChapter(ch)}
            style={{ background: chapter === ch ? 'rgba(80,160,0,0.2)' : 'rgba(0,0,0,0.45)', border: `1px solid ${chapter === ch ? 'rgba(132,204,22,0.55)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '5px', color: chapter === ch ? 'rgba(180,250,100,1)' : 'rgba(255,255,255,0.3)', fontFamily: F, fontSize: 'clamp(6px, 0.8vw, 8.5px)', padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.18s', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {ch === 'all' ? 'All' : `Ch.${ch}`}
          </button>
        ))}
      </div>

      {/* ── Stage list ── */}
      <div style={{ position: 'absolute', top: '27%', bottom: '9%', left: '4%', width: sel ? '48%' : '92%', zIndex: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', transition: 'width 0.25s ease' }}>
        {filtered.map(s => {
          const isNext = !s.cleared && STAGES.find(x => !x.cleared)?.id === s.id;
          const locked = !s.cleared && !isNext;
          return (
            <div
              key={s.id}
              onClick={() => !locked && setSelected(s.id === selected ? null : s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: selected === s.id ? 'rgba(80,160,0,0.12)' : 'rgba(0,0,0,0.38)', border: `1px solid ${selected === s.id ? 'rgba(132,204,22,0.4)' : isNext ? 'rgba(132,204,22,0.22)' : 'rgba(255,255,255,0.05)'}`, borderRadius: '7px', padding: '8px 10px', cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.35 : 1, transition: 'all 0.18s' }}
            >
              {/* Stage number badge */}
              <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: s.cleared ? 'rgba(100,200,0,0.18)' : isNext ? 'rgba(132,204,22,0.22)' : 'rgba(0,0,0,0.4)', border: `1px solid ${s.cleared ? 'rgba(132,204,22,0.5)' : isNext ? 'rgba(132,204,22,0.45)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {s.cleared
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-9" stroke="rgba(132,204,22,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.9vw, 9px)', fontWeight: 700, color: isNext ? 'rgba(180,250,100,0.9)' : 'rgba(255,255,255,0.28)' }}>{s.stage}</span>
                }
              </div>
              {/* Info */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 600, color: s.cleared ? 'rgba(180,250,100,0.8)' : isNext ? '#fff' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ch.{s.chapter}-{s.stage} {s.name}</span>
                  <span style={{ fontFamily: F, fontSize: 'clamp(5px, 0.6vw, 7px)', color: DIFF_COLORS[s.difficulty], flexShrink: 0 }}>{s.difficulty}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                  <StarRow n={s.stars} max={3}/>
                  <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7.5px)', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.06em' }}>Rec: {s.recommend.toLocaleString()}</span>
                </div>
              </div>
              <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.7vw, 7.5px)', color: 'rgba(255,200,100,0.65)', whiteSpace: 'nowrap', flexShrink: 0 }}>⚡{s.energy}</span>
            </div>
          );
        })}
      </div>

      {/* ── Stage detail panel ── */}
      {sel && (
        <div style={{ position: 'absolute', top: '27%', bottom: '9%', right: '4%', width: '46%', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(132,204,22,0.28)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Title */}
            <div>
              <div style={{ fontFamily: F, fontSize: 'clamp(9px, 1.2vw, 12px)', fontWeight: 700, color: 'rgba(180,250,100,0.9)', letterSpacing: '0.08em' }}>Ch.{sel.chapter}-{sel.stage}: {sel.name}</div>
              <div style={{ marginTop: '3px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: DIFF_COLORS[sel.difficulty] }}>{sel.difficulty}</span>
                <StarRow n={sel.stars} max={3}/>
              </div>
            </div>

            {/* Stats */}
            {[
              { label: 'Recommended Power', value: sel.recommend.toLocaleString(), color: '#FB923C' },
              { label: 'Energy Cost',        value: `${sel.energy} ⚡`,              color: '#F5C842' },
              { label: 'Status',             value: sel.cleared ? '✓ Cleared' : 'Not Cleared', color: sel.cleared ? '#22C55E' : 'rgba(255,255,255,0.4)' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '5px', padding: '7px 10px' }}>
                <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(255,255,255,0.35)' }}>{s.label}</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', fontWeight: 700, color: s.color }}>{s.value}</span>
              </div>
            ))}

            {/* Rewards */}
            <div style={{ background: 'rgba(80,160,0,0.08)', border: '1px solid rgba(132,204,22,0.2)', borderRadius: '6px', padding: '8px 10px' }}>
              <div style={{ fontFamily: F, fontSize: 'clamp(6px, 0.75vw, 8px)', color: 'rgba(132,204,22,0.6)', letterSpacing: '0.12em', marginBottom: '4px' }}>STAGE REWARDS</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['Hero EXP', 'Gold', 'Rare Gear'].map(r => (
                  <span key={r} style={{ fontFamily: F, fontSize: 'clamp(7px, 0.85vw, 9px)', color: 'rgba(180,250,100,0.8)', background: 'rgba(80,160,0,0.12)', border: '1px solid rgba(132,204,22,0.2)', borderRadius: '4px', padding: '2px 7px' }}>{r}</span>
                ))}
              </div>
            </div>

            {/* Battle button */}
            <button
              style={{ background: 'rgba(80,160,0,0.22)', border: '1px solid rgba(132,204,22,0.55)', borderRadius: '7px', color: 'rgba(180,250,100,0.9)', fontFamily: F, fontSize: 'clamp(8px, 1vw, 10px)', fontWeight: 700, letterSpacing: '0.2em', padding: '10px 0', cursor: 'pointer', transition: 'all 0.18s', width: '100%' }}
            >
              {t('menu.battle_cta').toUpperCase()}
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
