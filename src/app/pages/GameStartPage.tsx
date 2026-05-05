import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { CurrencyDebug } from '../components/CurrencyDebug';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { GamePageLayout } from '../components/GamePageLayout';
import { playBtnSound } from '../utils/buttonSound';

const BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777396811/ChatGPT_Image_Apr_29_2026_12_19_32_AM_squmiv.png';

const COLS = 8;
const ROWS = 12;
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function cellCenter(col: string, row: number) {
  const c = COL_LABELS.indexOf(col);
  const r = row - 1;
  return {
    left: ((c + 0.5) / COLS) * 100,
    top:  ((r + 0.5) / ROWS) * 100,
  };
}

const CW = (1 / COLS) * 100;
const CH = (1 / ROWS) * 100;

const ASSETS = [
  { id: 'btn-B8',  left: cellCenter('B',  8).left, top: cellCenter('B',  8).top, labelKey: 'city.arena'       as TranslationKey, route: '/game/arena',   interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-GH5', left: 70,                         top: 45,                       labelKey: 'city.castle'      as TranslationKey, route: '/game/castle',  interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-D10', left: cellCenter('D', 10).left,  top: cellCenter('D', 10).top, labelKey: 'city.guild'       as TranslationKey, route: '/game/guild',   interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-C11', left: 25,                         top: cellCenter('C', 11).top, labelKey: 'city.tavern'      as TranslationKey, route: '/game/tavern',  interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-F10', left: cellCenter('F', 10).left,  top: cellCenter('F', 10).top, labelKey: 'city.market'      as TranslationKey, route: '/game/market',  interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-D5',  left: 45.0,                       top: cellCenter('D',  5).top, labelKey: 'city.tower'       as TranslationKey, route: '/game/tower',   interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-A7',  left: 5.0,                         top: 32.5,                     labelKey: 'city.exploration' as TranslationKey, route: '/game/event',   interactive: true, widthCells: 1, heightCells: 0.5 },
];

function getPixelAlpha(imgEl: HTMLImageElement, clientX: number, clientY: number): number {
  try {
    const rect  = imgEl.getBoundingClientRect();
    const natW  = imgEl.naturalWidth;
    const natH  = imgEl.naturalHeight;
    if (!natW || !natH) return 255;
    const scale = Math.min(rect.width / natW, rect.height / natH);
    const rendW = natW * scale;
    const rendH = natH * scale;
    const offX  = (rect.width  - rendW) / 2;
    const offY  = (rect.height - rendH) / 2;
    const imgX  = Math.floor((clientX - rect.left - offX) / scale);
    const imgY  = Math.floor((clientY - rect.top  - offY) / scale);
    if (imgX < 0 || imgX >= natW || imgY < 0 || imgY >= natH) return 0;
    const canvas = document.createElement('canvas');
    canvas.width  = natW;
    canvas.height = natH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 255;
    ctx.drawImage(imgEl, 0, 0);
    return ctx.getImageData(imgX, imgY, 1, 1).data[3];
  } catch {
    return 255;
  }
}

export default function GameStartPage() {
  const containerRef           = useRef<HTMLDivElement>(null);
  const adventureBtnRef        = useRef<HTMLDivElement>(null);
  const adventureRafRef        = useRef<number | null>(null);
  const adventurePressStartRef = useRef<number>(0);
  const adventureHoldingRef    = useRef<boolean>(false);
  const imgRefs       = useRef<Map<string, HTMLImageElement>>(new Map());
  const btnDivRefs    = useRef<Map<string, HTMLDivElement>>(new Map());
  const bldgRafRef    = useRef<number | null>(null);
  const bldgPressStart = useRef<number>(0);
  const bldgHolding   = useRef<boolean>(false);
  const bldgPressedId = useRef<string | null>(null);

  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { t } = useLanguage();

  // ── Fetch real currency on mount + poll every 30s as safety net ──────────
  useEffect(() => {
    console.log('[GameStart] Initial user:', user);
    refreshProfile();
    const id = setInterval(() => {
      console.log('[GameStart] Auto-refresh currency...');
      refreshProfile();
    }, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshProfile, user]);

  // ── Adventure button handlers ─────────────────────────────────────────────
  const onAdventurePress = () => {
    adventureHoldingRef.current    = true;
    adventurePressStartRef.current = Date.now();
    const btn = adventureBtnRef.current;
    if (btn) {
      btn.style.animation  = 'none';
      btn.style.transition = 'transform 0.08s ease';
      btn.style.transform  = 'translateY(-50%) scale(0.92)';
    }
  };

  const onAdventureRelease = (doNavigate: boolean) => {
    if (adventureRafRef.current) { cancelAnimationFrame(adventureRafRef.current); adventureRafRef.current = null; }
    adventureHoldingRef.current = false;
    if (doNavigate) playBtnSound();
    const btn    = adventureBtnRef.current;
    const holdMs = Date.now() - adventurePressStartRef.current;

    if (holdMs < 220) {
      if (btn) {
        btn.style.transform  = 'translateY(-50%)';
        btn.style.transition = 'none';
        btn.style.animation  = 'adventurePress 0.4s ease forwards';
      }
      setTimeout(() => {
        if (btn) { btn.style.animation = 'none'; btn.style.transform = 'translateY(-50%)'; }
        if (doNavigate) navigate('/game/adventure');
      }, 420);
    } else {
      if (btn) {
        btn.style.transition = 'transform 0.22s ease';
        btn.style.transform  = 'translateY(-50%) scale(1)';
        btn.style.animation  = 'none';
      }
      if (doNavigate) navigate('/game/adventure');
    }
  };

  const onAdventureCancel = () => {
    if (adventureRafRef.current) { cancelAnimationFrame(adventureRafRef.current); adventureRafRef.current = null; }
    adventureHoldingRef.current = false;
    const btn = adventureBtnRef.current;
    if (btn) { btn.style.transition = 'transform 0.22s ease'; btn.style.transform = 'translateY(-50%) scale(1)'; btn.style.animation = 'none'; }
  };

  // ── Building press / release / cancel ────────────────────────────────────
  const onBuildingPress = useCallback((id: string) => {
    bldgPressedId.current  = id;
    bldgHolding.current    = true;
    bldgPressStart.current = Date.now();
    const btn  = btnDivRefs.current.get(id);
    if (btn)  { btn.style.animation  = 'none'; btn.style.transition = 'transform 0.08s ease'; btn.style.transform  = 'scale(0.92)'; }
  }, []);

  const onBuildingRelease = useCallback((id: string, doNav: boolean) => {
    if (bldgRafRef.current) { cancelAnimationFrame(bldgRafRef.current); bldgRafRef.current = null; }
    bldgHolding.current   = false;
    bldgPressedId.current = null;
    if (doNav) playBtnSound();
    const btn     = btnDivRefs.current.get(id);
    const holdMs  = Date.now() - bldgPressStart.current;
    const route   = ASSETS.find(a => a.id === id)?.route ?? '';

    if (holdMs < 220) {
      if (btn)  { btn.style.transform  = 'scale(1)'; btn.style.transition = 'none'; btn.style.animation = 'uiPress 0.4s ease forwards'; }
      setTimeout(() => {
        if (btn)  { btn.style.animation = 'none'; btn.style.transform = 'scale(1)'; }
        if (doNav) navigate(route);
      }, 400);
    } else {
      if (btn)  { btn.style.transition = 'transform 0.22s ease'; btn.style.transform  = 'scale(1)'; btn.style.animation = 'none'; }
      if (doNav) navigate(route);
    }
  }, [navigate]);

  const onBuildingCancel = useCallback(() => {
    if (bldgRafRef.current) { cancelAnimationFrame(bldgRafRef.current); bldgRafRef.current = null; }
    const id = bldgPressedId.current;
    bldgHolding.current   = false;
    bldgPressedId.current = null;
    if (!id) return;
    const btn  = btnDivRefs.current.get(id);
    if (btn)  { btn.style.transition = 'transform 0.22s ease'; btn.style.transform  = 'scale(1)'; btn.style.animation = 'none'; }
  }, []);

  // ── Asset hit detection ───────────────────────────────────────────────────
  const getHitAssetId = useCallback((clientX: number, clientY: number): string | null => {
    const container = containerRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const relX = ((clientX - containerRect.left) / containerRect.width) * 100;
    const relY = ((clientY - containerRect.top) / containerRect.height) * 100;
    for (let i = ASSETS.length - 1; i >= 0; i--) {
      const asset = ASSETS[i];
      if (!asset.interactive) continue;
      const w = CW * (asset.widthCells ?? 1);
      const h = CH * (asset.heightCells ?? 1);
      const minX = asset.left - w / 2;
      const maxX = asset.left + w / 2;
      const minY = asset.top - h / 2;
      const maxY = asset.top + h / 2;
      if (relX >= minX && relX <= maxX && relY >= minY && relY <= maxY) {
        return asset.id;
      }
    }
    for (const asset of ASSETS) {
      const imgEl = imgRefs.current.get(asset.id);
      if (!imgEl || !(imgEl instanceof HTMLImageElement)) continue;
      const alpha = getPixelAlpha(imgEl, clientX, clientY);
      if (alpha > 15) return asset.id;
    }
    return null;
  }, []);

  // ── Mouse events ──────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const id = getHitAssetId(e.clientX, e.clientY);
    if (id) onBuildingPress(id);
  }, [getHitAssetId, onBuildingPress]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const pressId = bldgPressedId.current;
    if (pressId) {
      const hitId = getHitAssetId(e.clientX, e.clientY);
      onBuildingRelease(pressId, hitId === pressId);
    }
  }, [getHitAssetId, onBuildingRelease]);

  const handleMouseLeave = useCallback(() => {
    onBuildingCancel();
    if (adventureRafRef.current) { cancelAnimationFrame(adventureRafRef.current); adventureRafRef.current = null; }
    adventureHoldingRef.current = false;
    const btn = adventureBtnRef.current;
    if (btn) { btn.style.transition = 'transform 0.22s ease'; btn.style.transform = 'translateY(-50%) scale(1)'; btn.style.animation = 'none'; }
  }, [onBuildingCancel]);

  // ── Touch events ──────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const id = getHitAssetId(touch.clientX, touch.clientY);
    if (id) onBuildingPress(id);
  }, [getHitAssetId, onBuildingPress]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const pressId = bldgPressedId.current;
    if (pressId) {
      const touch = e.changedTouches[0];
      let doNav = true;
      if (touch) {
        const imgEl = imgRefs.current.get(pressId);
        doNav = imgEl ? getPixelAlpha(imgEl, touch.clientX, touch.clientY) > 15 : true;
      }
      onBuildingRelease(pressId, doNav);
    }
  }, [onBuildingRelease]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="size-full relative overflow-hidden select-none"
      style={{ cursor: 'default' }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDragStart={(e) => e.preventDefault()}
    >
      <style>{`
        @keyframes uiPress {
          0%   { transform: scale(1); }
          40%  { transform: scale(0.88); }
          70%  { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        @keyframes adventurePress {
          0%   { transform: translateY(-50%) scale(1); }
          35%  { transform: translateY(-50%) scale(0.88); }
          68%  { transform: translateY(-50%) scale(1.06); }
          100% { transform: translateY(-50%) scale(1); }
        }
        img {
          -webkit-user-drag: none;
          user-drag: none;
        }
      `}</style>

      {/* ── Background ── */}
      <ImageWithFallback
        src={BG}
        alt=""
        className="absolute inset-0 size-full object-cover"
        draggable={false}
        style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
      />

      {/* ── ADVENTURE Button ── */}
      <div
        ref={adventureBtnRef}
        onMouseDown={(e) => { e.stopPropagation(); onAdventurePress(); }}
        onMouseUp={(e)   => { e.stopPropagation(); onAdventureRelease(true); }}
        onMouseLeave={onAdventureCancel}
        onTouchStart={(e) => { e.stopPropagation(); onAdventurePress(); }}
        onTouchEnd={(e)   => { e.stopPropagation(); onAdventureRelease(true); }}
        onTouchCancel={(e) => { e.stopPropagation(); onAdventureCancel(); }}
        style={{
          position:      'absolute',
          left:          `${(6 / COLS) * 100}%`,
          top:           `${((10 + 0.5) / ROWS) * 100}%`,
          width:         `${(2 / COLS) * 100}%`,
          height:        `${(0.72 / ROWS) * 100}%`,
          transform:     'translateY(-50%)',
          zIndex:        8,
          cursor:        'pointer',
          borderRadius:  '9999px',
          background:    '#FF7000',
          border:        '2.5px solid #ffffff',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'center',
          boxShadow:     '0 2px 12px rgba(255,112,0,0.65), 0 1px 4px rgba(0,0,0,0.5)',
        }}
      >
        <span style={{
          color:         '#ffffff',
          fontFamily:    "'Playfair Display', serif",
          fontSize:      'clamp(7px, 1.6vw, 12px)',
          fontWeight:    800,
          letterSpacing: '0.18em',
          textShadow:    '0 1px 4px rgba(0,0,0,0.5)',
          lineHeight:    1,
          whiteSpace:    'nowrap',
          userSelect:    'none',
        }}>
          ADVENTURE
        </span>
      </div>

      {/* ── Building Assets ── */}
      {ASSETS.map(({ id, left, top, labelKey, img, interactive, widthCells, heightCells, labelCenter } : any) => {
        const label = labelKey ? t(labelKey) : undefined;
        return (
          <div
            key={id}
            style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: `${CW * (widthCells ?? 1)}%`, height: `${CH * (heightCells ?? 1)}%`, transform: 'translate(-50%, -50%)', zIndex: 5, pointerEvents: 'none' }}
          >
            <div
              ref={(el) => {
                if (el && interactive) {
                  btnDivRefs.current.set(id, el);
                  if (!imgRefs.current.has(id)) {
                    const hitDiv = document.createElement('div');
                    hitDiv.style.position = 'absolute';
                    hitDiv.style.inset = '0';
                    hitDiv.style.opacity = '0';
                    imgRefs.current.set(id, hitDiv as any);
                  }
                } else if (!el) {
                  btnDivRefs.current.delete(id);
                }
              }}
              style={{ width: '100%', height: '100%', position: 'relative' }}
            >
              {img ? (
                <img
                  ref={(el) => { if (el) imgRefs.current.set(id, el); else imgRefs.current.delete(id); }}
                  src={img}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }}
                />
              ) : (
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`fade-${id}`} x1="100%" y1="0%" x2="0%" y2="0%">
                      <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
                      <stop offset="15%"  stopColor="rgba(0,0,0,0.6)" />
                      <stop offset="85%"  stopColor="rgba(0,0,0,0.6)" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                    </linearGradient>
                    <linearGradient id={`border-fade-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor="rgba(255,215,0,0)" />
                      <stop offset="12%"  stopColor="rgba(255,215,0,1)" />
                      <stop offset="88%"  stopColor="rgba(255,215,0,1)" />
                      <stop offset="100%" stopColor="rgba(255,215,0,0)" />
                    </linearGradient>
                    <linearGradient id={`border-black-fade-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
                      <stop offset="12%"  stopColor="rgba(0,0,0,1)" />
                      <stop offset="88%"  stopColor="rgba(0,0,0,1)" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="100" height="100" fill={`url(#fade-${id})`} />
                  <rect x="0" y="0"    width="100" height="2"   fill={`url(#border-black-fade-${id})`} />
                  <rect x="0" y="1.2"  width="100" height="1.5" fill={`url(#border-fade-${id})`} />
                  <rect x="0" y="2.7"  width="100" height="1"   fill={`url(#border-black-fade-${id})`} />
                  <rect x="0" y="96.3" width="100" height="1"   fill={`url(#border-black-fade-${id})`} />
                  <rect x="0" y="97.3" width="100" height="1.5" fill={`url(#border-fade-${id})`} />
                  <rect x="0" y="98"   width="100" height="2"   fill={`url(#border-black-fade-${id})`} />
                </svg>
              )}
              {label && !labelCenter && (
                <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', color: '#ffffff', fontSize: '11px', fontFamily: "'Playfair Display', serif", fontWeight: 600, letterSpacing: '0.15em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)', pointerEvents: 'none', zIndex: 1 }}>
                  {label}
                </span>
              )}
              {label && labelCenter && (
                <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', color: '#ffffff', fontSize: '10px', fontFamily: "'Playfair Display', serif", fontWeight: 600, letterSpacing: '0.18em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)', pointerEvents: 'none', zIndex: 10 }}>
                  {label}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <CurrencyDebug />

      {/* ── Shared game UI overlay — single source of truth ── */}
      <GamePageLayout activeTab="city" />
    </div>
  );
}
