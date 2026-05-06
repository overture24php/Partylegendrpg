import { useState } from 'react';
import { GamePageLayout } from '../components/GamePageLayout';
import { HeroDetailView } from '../components/HeroDetailView';
import { EmmaDetailView } from '../components/EmmaDetailView';
import { HeroPreviewView } from '../components/HeroPreviewView';
import { useLanguage } from '../context/LanguageContext';
import { HeroCard, HeroCardWithAnimation, HERO_RARITIES } from '../components/HeroCard';
import { LockedHeroCard } from '../components/LockedHeroCard';
import { useHero } from '../context/HeroContext';
import { playBtnSound } from '../utils/buttonSound';

// ─── Cloudinary base ───────────────────────────────────────────────────────────
// ─── All hero data comes from heroGallery.ts (single source of truth) ────────
import { HERO_GALLERY, getHeroIlust } from '../data/heroGallery';

const LUCAS_ILUST_SRC = HERO_GALLERY.find(h => h.heroId === 'lucas')?.ilust ?? '';
const EMMA_ILUST_SRC  = HERO_GALLERY.find(h => h.heroId === 'emma')?.ilust  ?? '';

/**
 * getIlust — card illustration for a hero_id.
 * Reads from heroGallery.ts. Falls back to EMMA_ILUST_SRC if none defined.
 */
function getIlust(heroId: string): string {
  return getHeroIlust(heroId) ?? EMMA_ILUST_SRC;
}

// ─── Rarity string from DB  →  HERO_RARITIES id ───────────────────────────────
// hero_defs.rarity may store e.g. 'common','rare','epic','legendary','mythic'
// OR the letter grade 'C','B','A','S','SS' — normalise both
function normRarity(r: string): string {
  const map: Record<string,string> = {
    C:'common', B:'rare', A:'epic', S:'legendary', SS:'mythic',
    common:'common', rare:'rare', epic:'epic', legendary:'legendary', mythic:'mythic',
  };
  return map[r] ?? 'common';
}

// ─── Card dimensions ──────────────────────────────────────────────────────────
const CARD_W = 186;
const CARD_H = Math.round(CARD_W * 400 / 250);

// ─── Gallery roster — derived from heroGallery.ts (single source of truth) ───
// Shapes match previous GALLERY_ROSTER for drop-in compatibility.
const GALLERY_ROSTER = HERO_GALLERY.map(h => ({
  name:     h.name,
  rarity:   h.rarity,
  heroType: h.heroType,
  ilust:    h.ilust ?? undefined,
  level:    1,
}));

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HeroPage() {
  const [detailOpen, setDetailOpen]           = useState(false);
  const [emmaDetailOpen, setEmmaDetailOpen]   = useState(false);
  const [previewHero, setPreviewHero]         = useState<{ name: string; rarity: string; heroType: string; ilust?: string } | null>(null);
  const [detailHero,  setDetailHero]          = useState<{
    heroId: string; name: string; rarity: string; rarityLabel: string;
    rarityColor: string; rarityShine: string; role: string;
    level: number; ilust: string;
    stats: { hp:number; pAtk:number; mAtk:number; pDef:number; mDef:number; speed:number; expCurrent:number; expMax:number };
  } | null>(null);
  const [tab, setTab]                         = useState<'obtained' | 'gallery'>('obtained');
  const { t } = useLanguage();
  const { ownedHeroes } = useHero();

  // ── Pull live stats from DB (fallback to hardcoded Lv1 if not loaded yet) ──
  const lucasDB = ownedHeroes.find(o => o.playerHero.hero_id === 'lucas');
  const emmaDB  = ownedHeroes.find(o => o.playerHero.hero_id === 'emma');

  const HERO = {
    name:     'Lucas',
    rarity:   lucasDB?.def.rarity    ?? 'rare',
    level:    lucasDB?.playerHero.level ?? 1,
    heroType: lucasDB?.def.hero_type ?? 'Fighter',
    stats: {
      hp:         lucasDB?.playerHero.hp    ?? 2838,
      pAtk:       lucasDB?.playerHero.p_atk ?? 323,
      mAtk:       lucasDB?.playerHero.m_atk ?? 99,
      pDef:       lucasDB?.playerHero.p_def ?? 257,
      mDef:       lucasDB?.playerHero.m_def ?? 205,
      speed:      lucasDB?.playerHero.speed ?? 132,
      expCurrent: lucasDB?.playerHero.xp    ?? 0,
      expMax:     1000,
    },
  };

  const EMMA = {
    name:     'Emma',
    rarity:   emmaDB?.def.rarity    ?? 'rare',
    level:    emmaDB?.playerHero.level ?? 1,
    heroType: emmaDB?.def.hero_type ?? 'Support',
    stats: {
      hp:         emmaDB?.playerHero.hp    ?? 2402,
      pAtk:       emmaDB?.playerHero.p_atk ?? 178,
      mAtk:       emmaDB?.playerHero.m_atk ?? 271,
      pDef:       emmaDB?.playerHero.p_def ?? 209,
      mDef:       emmaDB?.playerHero.m_def ?? 267,
      speed:      emmaDB?.playerHero.speed ?? 147,
      expCurrent: emmaDB?.playerHero.xp    ?? 0,
      expMax:     1000,
    },
  };

  const cfg     = HERO_RARITIES.find(r => r.id === HERO.rarity)  ?? HERO_RARITIES[3];
  const emmaCfg = HERO_RARITIES.find(r => r.id === EMMA.rarity)  ?? HERO_RARITIES[3];

  const pageTitle = tab === 'obtained' ? t('hero.obtained_title') : t('hero.gallery_title');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', background: '#1a0535', overflow: 'hidden' }}>

      {/* ── Background Image ── */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'url(https://res.cloudinary.com/dhkethrmc/image/upload/v1777419184/ChatGPT_Image_Apr_29_2026_06_32_08_AM_hch81k.png)', backgroundSize:'cover', backgroundPosition:'center', opacity:0.4 }}/>

      {/* ── Dark overlay ── */}
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(26,5,53,0.7) 0%, rgba(26,5,53,0.85) 100%)', pointerEvents:'none' }}/>

      {/* ── Purple ambient glows ── */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(120,40,200,0.2) 0%, transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 60% 40% at 50% 90%, rgba(60,0,120,0.25) 0%, transparent 70%)', pointerEvents:'none' }}/>

      {/* ── Left tab buttons — horizontal row, aligned with title ── */}
      <div style={{
        position: 'absolute',
        top: '13%',
        left: '8px',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'row',
        gap: '6px',
        alignItems: 'center',
        transform: 'translateY(-50%)',
      }}>
        {([
          { id: 'obtained', label: t('hero.tab_obtained') },
          { id: 'gallery',  label: t('hero.tab_gallery')  },
        ] as const).map(({ id, label }) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              onClick={() => { playBtnSound(); setTab(id); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive
                  ? 'linear-gradient(90deg, rgba(255,215,0,0.22) 0%, rgba(255,215,0,0.10) 100%)'
                  : 'rgba(0,0,0,0.48)',
                border: isActive
                  ? '1px solid rgba(255,215,0,0.60)'
                  : '1px solid rgba(255,255,255,0.14)',
                borderRadius: '999px',
                padding: '6px 14px',
                cursor: 'pointer',
                transition: 'all 0.18s',
                boxShadow: isActive ? '0 0 12px rgba(255,215,0,0.18)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                color: isActive ? '#FFD700' : 'rgba(255,255,255,0.72)',
                fontFamily: "'Roboto Condensed', sans-serif",
                fontSize: '11px',
                fontWeight: isActive ? 700 : 600,
                letterSpacing: '0.07em',
                textShadow: isActive ? '0 0 8px rgba(255,215,0,0.55)' : 'none',
              }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Page title — centered ── */}
      <div style={{ position:'absolute', top:'13%', left:'50%', transform:'translateX(-50%)', zIndex:10, textAlign:'center', pointerEvents:'none', whiteSpace:'nowrap' }}>
        <div style={{ color:'rgba(255,215,0,0.95)', fontFamily:"'Playfair Display',serif", fontSize:'clamp(12px,2vw,20px)', fontWeight:800, letterSpacing:'0.28em', textShadow:'0 2px 16px rgba(200,100,255,0.5), 0 1px 4px rgba(0,0,0,0.9)' }}>{pageTitle}</div>
      </div>

      {/* ── Orange separator — full width, no fade ── */}
      <div style={{ position:'absolute', top:'19.5%', left:0, right:0, height:'2px', zIndex:10, background:'rgba(255,140,0,0.85)', pointerEvents:'none' }}/>

      {/* ── Hero grid ── */}
      <div style={{
        position: 'absolute', top: '20.5%', bottom: '9%', left: 0, right: 0, zIndex: 10,
        overflowY: 'auto', overflowX: 'hidden',
        padding: '10px 10px 0 10px',
        display: 'flex', flexWrap: 'wrap',
        alignContent: 'flex-start', alignItems: 'flex-start', justifyContent: 'flex-start',
        gap: '8px',
        // Isolate scroll container from the rest of the page layout
        contain: 'strict',
        // Hint to browser: this is a scroll surface — promote to own layer
        willChange: 'scroll-position',
        // Smooth scroll on iOS
        WebkitOverflowScrolling: 'touch',
      } as React.CSSProperties}>
        {tab === 'obtained' ? (
          <>
            {ownedHeroes.map(oh => {
              const hid    = oh.playerHero.hero_id;
              const rar    = normRarity(oh.def.rarity);
              const heroCfg= HERO_RARITIES.find(r => r.id === rar) ?? HERO_RARITIES[4];
              const ilust  = getIlust(hid);

              const openDetail = () => {
                playBtnSound();
                if (hid === 'lucas') { setDetailOpen(true); return; }
                if (hid === 'emma')  { setEmmaDetailOpen(true); return; }
                // Generic hero — open full HeroDetailView with their real DB stats
                setDetailHero({
                  heroId:      hid,
                  name:        oh.def.name ?? hid,
                  rarity:      rar,
                  rarityLabel: heroCfg.label,
                  rarityColor: heroCfg.fill,
                  rarityShine: heroCfg.shine,
                  role:        oh.def.hero_type ?? '',
                  level:       oh.playerHero.level ?? 1,
                  ilust:       ilust,
                  stats: {
                    hp:         oh.playerHero.hp    ?? 0,
                    pAtk:       oh.playerHero.p_atk ?? 0,
                    mAtk:       oh.playerHero.m_atk ?? 0,
                    pDef:       oh.playerHero.p_def ?? 0,
                    mDef:       oh.playerHero.m_def ?? 0,
                    speed:      oh.playerHero.speed ?? 0,
                    expCurrent: oh.playerHero.xp   ?? 0,
                    expMax:     1000,
                  },
                });
              };

              return (
                <div
                  key={hid}
                  style={{ width:'calc(25% - 6px)', aspectRatio:'250/400', flexShrink:0, cursor:'pointer' }}
                  onClick={openDetail}
                >
                  <HeroCardWithAnimation rarityColor={heroCfg.fill}>
                    <HeroCard
                      name={oh.def.name ?? hid}
                      rarity={rar}
                      level={oh.playerHero.level ?? 1}
                      ilust={ilust}
                      heroType={oh.def.hero_type ?? ''}
                      stars={oh.playerHero.stars ?? heroCfg.stars}
                    />
                  </HeroCardWithAnimation>
                </div>
              );
            })}
            {ownedHeroes.length === 0 && (
              <div style={{ width:'100%', textAlign:'center', padding:'40px 0',
                color:'rgba(255,255,255,.3)', fontFamily:"'Roboto Condensed',sans-serif",
                fontSize:13, letterSpacing:'.08em' }}>
                No heroes yet — visit the Tavern to summon!
              </div>
            )}
          </>
        ) : (
          <>
            {GALLERY_ROSTER.map(hero => {
              const heroCfg = HERO_RARITIES.find(r => r.id === hero.rarity) ?? HERO_RARITIES[4];
              // ALL gallery heroes → preview mode (even obtained Lucas/Emma)
              if (hero.name === 'Lucas') return (
                <div key={hero.name} style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer' }}
                  onClick={() => { playBtnSound(); setPreviewHero({ name: hero.name, rarity: hero.rarity, heroType: hero.heroType, ilust: LUCAS_ILUST_SRC }); }}>
                  <HeroCardWithAnimation rarityColor={cfg.fill}>
                    <HeroCard name={hero.name} rarity={hero.rarity} level={1} ilust={LUCAS_ILUST_SRC} heroType={hero.heroType} />
                  </HeroCardWithAnimation>
                </div>
              );
              if (hero.name === 'Emma') return (
                <div key={hero.name} style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer' }}
                  onClick={() => { playBtnSound(); setPreviewHero({ name: hero.name, rarity: hero.rarity, heroType: hero.heroType, ilust: EMMA_ILUST_SRC }); }}>
                  <HeroCardWithAnimation rarityColor={emmaCfg.fill}>
                    <HeroCard name={hero.name} rarity={hero.rarity} level={1} ilust={EMMA_ILUST_SRC} heroType={hero.heroType} />
                  </HeroCardWithAnimation>
                </div>
              );
              // Gallery hero with illustration → preview view
              if (hero.ilust) return (
                <div key={hero.name} style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer' }}
                  onClick={() => { playBtnSound(); setPreviewHero({ name: hero.name, rarity: hero.rarity, heroType: hero.heroType, ilust: hero.ilust }); }}>
                  <HeroCardWithAnimation rarityColor={heroCfg.fill}>
                    <HeroCard name={hero.name} rarity={hero.rarity} level={hero.level ?? 1} ilust={hero.ilust} heroType={hero.heroType}/>
                  </HeroCardWithAnimation>
                </div>
              );
              // Locked hero → preview view
              return (
                <div key={hero.name} style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, flexShrink: 0, cursor: 'pointer' }}
                  onClick={() => { playBtnSound(); setPreviewHero({ name: hero.name, rarity: hero.rarity, heroType: hero.heroType }); }}>
                  <LockedHeroCard name={hero.name} rarity={hero.rarity} heroType={hero.heroType}/>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Shared game overlay UI ── */}
      <GamePageLayout activeTab="hero" hidePlayerInfo/>

      {/* ── Gallery preview overlay ── */}
      {previewHero && (
        <HeroPreviewView
          key={previewHero.name}
          name={previewHero.name}
          rarity={previewHero.rarity}
          heroType={previewHero.heroType}
          ilust={previewHero.ilust}
          onClose={() => setPreviewHero(null)}
        />
      )}

      {/* ── Generic hero detail overlay (gacha heroes except Lucas/Emma) ── */}
      {detailHero && (
        <HeroDetailView
          heroId={detailHero.heroId}
          name={detailHero.name}
          rarity={detailHero.rarity}
          rarityLabel={detailHero.rarityLabel}
          rarityColor={detailHero.rarityColor}
          rarityShine={detailHero.rarityShine}
          role={detailHero.role}
          level={detailHero.level}
          ilust={detailHero.ilust}
          stats={detailHero.stats}
          onClose={() => setDetailHero(null)}
        />
      )}

      {/* ── Lucas detail overlay ── */}
      {detailOpen && (
        <HeroDetailView
          heroId="lucas"
          name={HERO.name}
          rarity={HERO.rarity}
          rarityLabel={cfg.label}
          rarityColor={cfg.fill}
          rarityShine={cfg.shine}
          role={HERO.heroType}
          level={HERO.level}
          ilust={LUCAS_ILUST_SRC}
          stats={HERO.stats}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {/* ── Emma detail overlay ── */}
      {emmaDetailOpen && (
        <EmmaDetailView
          heroId="emma"
          name={EMMA.name}
          rarity={EMMA.rarity}
          rarityLabel={emmaCfg.label}
          rarityColor={emmaCfg.fill}
          rarityShine={emmaCfg.shine}
          role={EMMA.heroType}
          level={EMMA.level}
          ilust={EMMA_ILUST_SRC}
          stats={EMMA.stats}
          onClose={() => setEmmaDetailOpen(false)}
        />
      )}
    </div>
  );
}