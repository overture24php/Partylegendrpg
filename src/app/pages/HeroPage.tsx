import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { GamePageLayout }   from '../components/GamePageLayout';
import { HeroDetailView }   from '../components/HeroDetailView';
import { EmmaDetailView }   from '../components/EmmaDetailView';
import { HeroPreviewView }  from '../components/HeroPreviewView';
import { useLanguage }      from '../context/LanguageContext';
import { HERO_RARITIES }    from '../components/HeroCard';
import { useHero }          from '../context/HeroContext';
import { playBtnSound }     from '../utils/buttonSound';
import { chromaDataUrlCache, keepChromaUrl } from '../utils/chromaKey';
import { HERO_GALLERY, getHeroIlust } from '../data/heroGallery';
import { PixiObtainedGrid, HeroData as PixiHeroData } from '../components/PixiObtainedGrid';
import { PixiGalleryGrid, GalleryHeroData }            from '../components/PixiGalleryGrid';

// ─── Chroma warm-up hook ──────────────────────────────────────────────────────
// Processes all illustration URLs on mount, populating chromaDataUrlCache.
// PixiObtainedGrid + PixiGalleryGrid both consume this cache on first render.
// Returns void — call site doesn't need the map.
function useChromaBatch(urls: string[]): void {
  const processingRef = useRef(new Set<string>());

  useEffect(() => {
    const loadOne = (url: string) => {
      if (!url || processingRef.current.has(url)) return;
      if (chromaDataUrlCache.has(url)) return; // already warmed
      processingRef.current.add(url);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width  = img.naturalWidth;
        off.height = img.naturalHeight;
        const ctx  = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, off.width, off.height);
        const d  = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i+1], b = d[i+2];
          const diff = g - Math.max(r, b);
          if (diff > 55) { d[i+3] = 0; }
          else if (diff > 25) {
            const t = (diff - 25) / 30;
            d[i+3] = Math.round(d[i+3] * (1 - t));
            d[i+1] = Math.round(r * 0.5 + b * 0.5);
          }
        }
        ctx.putImageData(id, 0, 0);
        keepChromaUrl(url, off.toDataURL('image/png'));
      };
      img.src = url;
    };
    urls.forEach(loadOne);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — runs once on mount
}

// ─── Asset helpers ────────────────────────────────────────────────────────────
const LUCAS_ILUST = HERO_GALLERY.find(h => h.heroId === 'lucas')?.ilust ?? '';
const EMMA_ILUST  = HERO_GALLERY.find(h => h.heroId === 'emma')?.ilust  ?? '';

function getIlust(heroId: string): string {
  return getHeroIlust(heroId) ?? EMMA_ILUST;
}

function normRarity(r: string): string {
  const map: Record<string, string> = {
    C:'common', B:'rare', A:'epic', S:'legendary', SS:'mythic',
    common:'common', rare:'rare', epic:'epic', legendary:'legendary', mythic:'mythic',
  };
  return map[r] ?? 'common';
}

// ─── Detail state type ────────────────────────────────────────────────────────
interface DetailHero {
  heroId: string; name: string; rarity: string; rarityLabel: string;
  rarityColor: string; rarityShine: string; role: string;
  level: number; ilust: string;
  stats: { hp:number; pAtk:number; mAtk:number; pDef:number; mDef:number; speed:number; expCurrent:number; expMax:number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HeroPage() {
  const [tab, setTab] = useState<'obtained' | 'gallery'>('obtained');

  // galleryActivated: lazy-init stays false until user first visits gallery tab.
  // Prevents 30+ GL card objects being created before user ever opens gallery.
  const [galleryActivated, setGalleryActivated] = useState(false);
  useEffect(() => {
    if (tab === 'gallery' && !galleryActivated) setGalleryActivated(true);
  }, [tab, galleryActivated]);

  const [detailOpen,  setDetailOpen]  = useState(false);
  const [emmaOpen,    setEmmaOpen]    = useState(false);
  const [detailHero,  setDetailHero]  = useState<DetailHero | null>(null);
  const [previewHero, setPreviewHero] = useState<{ name: string; rarity: string; heroType: string; ilust?: string } | null>(null);

  const { t }           = useLanguage();
  const { ownedHeroes } = useHero();

  // ── Warm chromaDataUrlCache for all owned illustrations ───────────────────
  // Zero-cost if LoadingPage already warmed them (cache-hit early returns).
  const illustUrls = useMemo(
    () => ownedHeroes.map(oh => getIlust(oh.playerHero.hero_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally stable: ownedHeroes list doesn't change within session
  );
  useChromaBatch(illustUrls);

  // ── Live DB stats ─────────────────────────────────────────────────────────
  const lucasDB = ownedHeroes.find(o => o.playerHero.hero_id === 'lucas');
  const emmaDB  = ownedHeroes.find(o => o.playerHero.hero_id === 'emma');

  const LUCAS = useMemo(() => ({
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lucasDB?.playerHero.level]);

  const EMMA = useMemo(() => ({
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [emmaDB?.playerHero.level]);

  const lucasCfg = HERO_RARITIES.find(r => r.id === LUCAS.rarity) ?? HERO_RARITIES[3];
  const emmaCfg  = HERO_RARITIES.find(r => r.id === EMMA.rarity)  ?? HERO_RARITIES[3];
  const pageTitle = tab === 'obtained' ? t('hero.obtained_title') : t('hero.gallery_title');

  // ── Click handlers: obtained cards → open detail/emma view ───────────────
  const openDetailCallbacks = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const oh of ownedHeroes) {
      const hid     = oh.playerHero.hero_id;
      const rar     = normRarity(oh.def.rarity);
      const heroCfg = HERO_RARITIES.find(r => r.id === rar) ?? HERO_RARITIES[4];
      map.set(hid, () => {
        playBtnSound();
        if (hid === 'lucas') { setDetailOpen(true); return; }
        if (hid === 'emma')  { setEmmaOpen(true);   return; }
        setDetailHero({
          heroId:      hid,
          name:        oh.def.name ?? hid,
          rarity:      rar,
          rarityLabel: heroCfg.label,
          rarityColor: heroCfg.fill,
          rarityShine: heroCfg.shine,
          role:        oh.def.hero_type ?? '',
          level:       oh.playerHero.level ?? 1,
          ilust:       getIlust(hid),
          stats: {
            hp:         oh.playerHero.hp    ?? 0,
            pAtk:       oh.playerHero.p_atk ?? 0,
            mAtk:       oh.playerHero.m_atk ?? 0,
            pDef:       oh.playerHero.p_def ?? 0,
            mDef:       oh.playerHero.m_def ?? 0,
            speed:      oh.playerHero.speed ?? 0,
            expCurrent: oh.playerHero.xp    ?? 0,
            expMax:     1000,
          },
        });
      });
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable within session

  // ── PixiJS: Obtained grid data ────────────────────────────────────────────
  const pixiHeroes = useMemo<PixiHeroData[]>(() => ownedHeroes.map(oh => {
    const hid     = oh.playerHero.hero_id;
    const rar     = normRarity(oh.def.rarity);
    const heroCfg = HERO_RARITIES.find(r => r.id === rar) ?? HERO_RARITIES[4];
    return {
      heroId:    hid,
      name:      oh.def.name ?? hid,
      rarity:    rar,
      heroType:  oh.def.hero_type ?? '',
      level:     oh.playerHero.level ?? 1,
      stars:     oh.playerHero.stars ?? heroCfg.stars,
      illustUrl: getIlust(hid),
    };
  }), [ownedHeroes]);

  const handlePixiCardClick = useCallback((heroId: string) => {
    const handler = openDetailCallbacks.get(heroId);
    if (handler) handler();
  }, [openDetailCallbacks]);

  // ── PixiJS: Gallery grid data (lazy — builds only after first gallery visit) ─
  const galleryHeroes = useMemo<GalleryHeroData[]>(() => {
    if (!galleryActivated) return [];
    const ownedIds = new Set(ownedHeroes.map(oh => oh.playerHero.hero_id));
    return HERO_GALLERY.map(h => {
      // isLocked = card shows padlock visual.
      // OLD behaviour (preserved): heroes WITH an ilust URL show their
      // illustration regardless of ownership. Only heroes WITHOUT ilust show locked.
      const hasIllust   = !!(h.ilust && h.ilust.trim().length > 0);
      const isLocked    = !hasIllust;
      const owned       = ownedHeroes.find(oh => oh.playerHero.hero_id === h.heroId);
      const rar         = normRarity(h.rarity);
      const effectiveRar = h.heroId === 'lucas' ? normRarity(lucasDB?.def.rarity ?? rar)
                         : h.heroId === 'emma'  ? normRarity(emmaDB?.def.rarity  ?? rar)
                         : rar;
      const heroCfg = HERO_RARITIES.find(r => r.id === effectiveRar) ?? HERO_RARITIES[4];
      // For illustration URL: use h.ilust directly (same source as old GalleryCard)
      const illustUrl = isLocked ? ''
                      : h.heroId === 'lucas' ? (LUCAS_ILUST || h.ilust || '')
                      : h.heroId === 'emma'  ? (EMMA_ILUST  || h.ilust || '')
                      : (h.ilust ?? '');
      return {
        heroId:   h.heroId,
        name:     h.name,
        rarity:   effectiveRar,
        heroType: h.heroType,
        level:    owned?.playerHero.level ?? 1,
        stars:    owned?.playerHero.stars ?? heroCfg.stars,
        illustUrl,
        isLocked,
      };
    });
  }, [galleryActivated, ownedHeroes]);

  const handleGalleryCardClick = useCallback((heroId: string) => {
    const hero = HERO_GALLERY.find(h => h.heroId === heroId);
    if (!hero) return;
    playBtnSound();
    setPreviewHero({
      name:      hero.name,
      rarity:    normRarity(hero.rarity),
      heroType:  hero.heroType,
      ilust:     getIlust(heroId) ?? undefined,
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', background: '#1a0535', overflow: 'hidden' }}>

      {/* ── Background ── */}
      <div style={{ position:'absolute', inset:0,
        backgroundImage:'url(https://res.cloudinary.com/dhkethrmc/image/upload/v1777419184/ChatGPT_Image_Apr_29_2026_06_32_08_AM_hch81k.png)',
        backgroundSize:'cover', backgroundPosition:'center', opacity:0.4 }}/>
      <div style={{ position:'absolute', inset:0,
        background:'linear-gradient(180deg, rgba(26,5,53,0.7) 0%, rgba(26,5,53,0.85) 100%)',
        pointerEvents:'none' }}/>
      <div style={{ position:'absolute', inset:0,
        background:'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(120,40,200,0.2) 0%, transparent 70%)',
        pointerEvents:'none' }}/>
      <div style={{ position:'absolute', inset:0,
        background:'radial-gradient(ellipse 60% 40% at 50% 90%, rgba(60,0,120,0.25) 0%, transparent 70%)',
        pointerEvents:'none' }}/>

      {/* ── Tab buttons ── */}
      <div style={{ position:'absolute', top:'13%', left:'8px', zIndex:20,
        display:'flex', flexDirection:'row', gap:'6px', alignItems:'center',
        transform:'translateY(-50%)' }}>
        {(['obtained','gallery'] as const).map(id => {
          const isActive = tab === id;
          const label = id === 'obtained' ? t('hero.tab_obtained') : t('hero.tab_gallery');
          return (
            <button key={id}
              onClick={() => { playBtnSound(); setTab(id); }}
              style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                background: isActive
                  ? 'linear-gradient(90deg, rgba(255,215,0,0.22) 0%, rgba(255,215,0,0.10) 100%)'
                  : 'rgba(0,0,0,0.48)',
                border: isActive ? '1px solid rgba(255,215,0,0.60)' : '1px solid rgba(255,255,255,0.14)',
                borderRadius:'999px', padding:'6px 14px', cursor:'pointer',
                transition:'all 0.18s',
                boxShadow: isActive ? '0 0 12px rgba(255,215,0,0.18)' : 'none',
                whiteSpace:'nowrap',
              }}
            >
              <span style={{
                color: isActive ? '#FFD700' : 'rgba(255,255,255,0.72)',
                fontFamily:"'Roboto Condensed', sans-serif",
                fontSize:'11px', fontWeight: isActive ? 700 : 600,
                letterSpacing:'0.07em',
                textShadow: isActive ? '0 0 8px rgba(255,215,0,0.55)' : 'none',
              }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Title ── */}
      <div style={{ position:'absolute', top:'13%', left:'50%', transform:'translateX(-50%)',
        zIndex:10, textAlign:'center', pointerEvents:'none', whiteSpace:'nowrap' }}>
        <div style={{ color:'rgba(255,215,0,0.95)', fontFamily:"'Playfair Display',serif",
          fontSize:'clamp(12px,2vw,20px)', fontWeight:800, letterSpacing:'0.28em',
          textShadow:'0 2px 16px rgba(200,100,255,0.5), 0 1px 4px rgba(0,0,0,0.9)' }}>
          {pageTitle}
        </div>
      </div>

      {/* ── Separator ── */}
      <div style={{ position:'absolute', top:'19.5%', left:0, right:0, height:'2px',
        zIndex:10, background:'rgba(255,140,0,0.85)', pointerEvents:'none' }}/>

      {/* ══════════════════════════════════════════════════════════════════════
          OBTAINED GRID — PixiJS WebGL renderer.
      ════════════════════════════════════════════════════════════════════════ */}
      <PixiObtainedGrid
        heroes={pixiHeroes}
        visible={tab === 'obtained'}
        onCardClick={handlePixiCardClick}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          GALLERY GRID — PixiJS WebGL renderer. Lazy-activated on first visit.
          Unlocked cards: full hero illustration. Locked cards: padlock visual.
      ════════════════════════════════════════════════════════════════════════ */}
      <PixiGalleryGrid
        heroes={galleryHeroes}
        visible={tab === 'gallery'}
        onCardClick={handleGalleryCardClick}
      />

      {/* ── Shared UI overlay ── */}
      <GamePageLayout activeTab="hero" hidePlayerInfo/>

      {/* ── Overlays — lazy-mounted only when open ── */}
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

      {detailOpen && (
        <HeroDetailView
          heroId="lucas"
          name="Lucas"
          rarity={LUCAS.rarity}
          rarityLabel={lucasCfg.label}
          rarityColor={lucasCfg.fill}
          rarityShine={lucasCfg.shine}
          role={LUCAS.heroType}
          level={LUCAS.level}
          ilust={LUCAS_ILUST}
          stats={LUCAS.stats}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {emmaOpen && (
        <EmmaDetailView
          heroId="emma"
          name="Emma"
          rarity={EMMA.rarity}
          rarityLabel={emmaCfg.label}
          rarityColor={emmaCfg.fill}
          rarityShine={emmaCfg.shine}
          role={EMMA.heroType}
          level={EMMA.level}
          ilust={EMMA_ILUST}
          stats={EMMA.stats}
          onClose={() => setEmmaOpen(false)}
        />
      )}
    </div>
  );
}