/**
 * TavernPage — Server-side Gacha
 *
 * All resource deductions, rolls, and shard grants happen inside
 * Supabase SECURITY DEFINER RPCs (patch_v8_gacha.sql).
 * The client is a pure display layer.
 *
 * Carousel: Normal → Epic (coming soon) → Superior (coming soon)
 * Navigation: triangle arrows on left / right edges of banner area.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { GamePageLayout } from '../components/GamePageLayout';
import { useAuth } from '../context/AuthContext';
import { useChromaKeyDataUrl } from '../utils/chromaKey';
import { getSupabase } from '../../lib/supabase';
import { getHeroById } from '../data/heroGallery';
import { HeroCard } from '../components/HeroCard';
import { useHero } from '../context/HeroContext';
import { playCardSound } from '../utils/buttonSound';

const F  = "'Roboto Condensed', sans-serif";
const FP = "'Playfair Display', serif";

// Green-screen banner — processed client-side via chroma key
const BANNER_RAW =
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777895161/60d9c15d-f208-4d63-b2ac-9c93cde4e1a5.png';

// ─── Rarity palette ───────────────────────────────────────────────────────────
type Rarity = 'C' | 'B' | 'A' | 'S' | 'SS';
const RC: Record<Rarity, string> = {
  C:'#9ca3af', B:'#60a5fa', A:'#a78bfa', S:'#fbbf24', SS:'#f87171',
};
const RG: Record<Rarity, string> = {
  C:'rgba(156,163,175,.55)', B:'rgba(96,165,250,.65)',
  A:'rgba(167,139,250,.70)', S:'rgba(251,191,36,.75)', SS:'rgba(248,113,113,.85)',
};

// ─── Pull result row ──────────────────────────────────────────────────────────
interface PullItem {
  hero_id:   string | null;
  hero_name: string;
  rarity:    Rarity;
  is_new:    boolean;
  shards:    number;
  mystery:   boolean;
}

// Overture Indie splash logo — shown on white card face before flip
const SPLASH_LOGO = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776874245/Splash_screen_aygb5n.png';

// Rarity letter → gallery rarity id (used by HeroCard)
function toRarityId(r: Rarity): string {
  const map: Record<Rarity, string> = { C:'common', B:'rare', A:'epic', S:'legendary', SS:'mythic' };
  return map[r] ?? 'common';
}

// ─── Flip Card (white front → actual HeroCard back) ───────────────────────────
function GachaResultCard({ item, flipDelay }: { item: PullItem; flipDelay: number }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), flipDelay);
    return () => clearTimeout(t);
  }, [flipDelay]);

  // Play card sound exactly when the card flips over
  useEffect(() => {
    if (flipped) playCardSound();
  }, [flipped]);

  const rarityId = toRarityId(item.rarity);
  const gallery  = item.hero_id ? getHeroById(item.hero_id) : null;
  const ilust    = gallery?.ilust ?? '';
  const heroType = gallery?.heroType ?? '';

  return (
    <div style={{ width:'min(160px,34vw)', aspectRatio:'250/400', flexShrink:0, perspective:900 }}>
      <div style={{
        width:'100%', height:'100%', position:'relative',
        transformStyle:'preserve-3d',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        transition:'transform 0.55s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* ─ Front face: white card + diagonal Overture logo ─ */}
        <div style={{
          position:'absolute', inset:0,
          backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden' as 'hidden',
          borderRadius:10, background:'#ffffff', overflow:'hidden',
          boxShadow:'0 4px 20px rgba(0,0,0,0.6)',
        }}>
          <img src={SPLASH_LOGO} alt="" draggable={false} style={{
            position:'absolute', top:'50%', left:'50%',
            width:'150%',
            transform:'translate(-50%,-50%) rotate(-45deg)',
            objectFit:'contain', opacity:0.20,
            pointerEvents:'none', userSelect:'none',
          }}/>
          {item.is_new && (
            <div style={{ position:'absolute', top:3, right:3,
              background:'#F97316', borderRadius:3, padding:'1px 3px',
              fontFamily:F, fontSize:6, fontWeight:900, color:'#fff', letterSpacing:'.04em', lineHeight:1.4 }}>
              NEW
            </div>
          )}
        </div>

        {/* ─ Back face: identical HeroCard + fragment overlay for dupes ─ */}
        <div style={{
          position:'absolute', inset:0,
          backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden' as 'hidden',
          transform:'rotateY(180deg)',
          borderRadius:10, overflow:'hidden',
        }}>
          {ilust ? (
            <HeroCard
              name={item.hero_name}
              rarity={rarityId}
              level={1}
              ilust={ilust}
              heroType={heroType}
              uid={`pr-${item.hero_id ?? item.hero_name}-${flipDelay}`}
            />
          ) : (
            <div style={{
              width:'100%', height:'100%',
              background: RC[item.rarity] + '22',
              border:`2px solid ${RC[item.rarity]}88`,
              borderRadius:10,
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:4,
            }}>
              <div style={{ fontFamily:FP, fontSize:9, fontWeight:800, color:RC[item.rarity],
                textAlign:'center', padding:'0 4px', lineHeight:1.3 }}>{item.hero_name}</div>
              <div style={{ fontFamily:F, fontSize:7, color:'rgba(255,255,255,.45)',
                letterSpacing:'.05em' }}>{item.rarity}</div>
            </div>
          )}
          {item.is_new && (
            <div style={{ position:'absolute', top:3, right:3,
              background:'#F97316', borderRadius:3, padding:'1px 3px',
              fontFamily:F, fontSize:6, fontWeight:900, color:'#fff', letterSpacing:'.04em', lineHeight:1.4 }}>
              NEW
            </div>
          )}
          {/* ─ Fragment overlay for duplicate heroes ─ */}
          {!item.is_new && (
            <div style={{
              position:'absolute', inset:0, borderRadius:10,
              background:'rgba(0,0,0,0.52)',
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center',
              gap:5, zIndex:6,
              pointerEvents:'none',
            }}>
              {/* Jigsaw puzzle piece — solid white SVG */}
              <svg viewBox="0 0 44 44" width="32" height="32" fill="none">
                <path
                  d="M5 5 L17 5 Q17 0 19.5 0 Q22 0 22 5 L39 5 L39 17 Q44 17 44 19.5 Q44 22 39 22 L39 39 L27 39 Q27 44 24.5 44 Q22 44 22 39 L5 39 L5 27 Q0 27 0 24.5 Q0 22 5 22 Z"
                  fill="white" opacity="0.92"
                />
              </svg>
              <span style={{
                fontFamily: FP, fontSize:'clamp(13px,3vw,18px)', fontWeight:900,
                color:'#ffffff', textShadow:'0 2px 8px rgba(0,0,0,0.9)',
                letterSpacing:'0.06em',
              }}>+{item.shards}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pull result overlay ──────────────────────────────────────────────────────
function PullResultOverlay({ items, onClose }: { items: PullItem[]; onClose: () => void }) {
  const lastFlipDelay = 500 + (items.length - 1) * 120;
  const [allDone, setAllDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAllDone(true), lastFlipDelay + 650);
    return () => clearTimeout(t);
  }, [lastFlipDelay]);

  const newHeroes = items.filter(i => i.is_new).length;

  // Group cards into rows of 5
  const rows: PullItem[][] = [];
  for (let i = 0; i < items.length; i += 5) rows.push(items.slice(i, i + 5));

  return (
    <div
      onClick={allDone ? onClose : undefined}
      style={{
        position:'fixed', inset:0, zIndex:6000,
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', gap:8,
        background:'radial-gradient(ellipse at 50% 30%, rgba(16,8,30,.97) 0%, rgba(0,0,0,.98) 100%)',
        overflowY:'auto', padding:'20px 0',
      }}
    >
      {/* Each row of 5 — horizontal scroll on very small screens */}
      {rows.map((row, ri) => (
        <div key={ri} style={{
          display:'flex', gap:8, justifyContent:'center',
          overflowX:'auto', padding:'0 8px',
          maxWidth:'100vw', flexShrink:0,
        }}>
          {row.map((item, ci) => {
            const globalIdx = ri * 5 + ci;
            return (
              <GachaResultCard
                key={globalIdx}
                item={item}
                flipDelay={500 + globalIdx * 120}
              />
            );
          })}
        </div>
      ))}

      {allDone && (
        <div style={{ marginTop:14, display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
          {newHeroes > 0 && (
            <span style={{ fontFamily:F, fontSize:12, fontWeight:800, color:'#4ade80', letterSpacing:'.06em' }}>
              ✦ {newHeroes} New Hero{newHeroes > 1 ? 'es' : ''}
            </span>
          )}
          <div style={{ fontFamily:F, fontSize:9, color:'rgba(255,255,255,.3)', letterSpacing:'.12em', marginTop:3 }}>
            TAP ANYWHERE TO CLOSE
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Portal particle canvas ───────────────────────────────────────────────────
function PortalParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const COLORS = ['#ffffff','#88ccff','#aaddff','#ccf4ff','#66bbff','#99eeff','#c8e8ff'];

    interface P {
      a: number; r: number; spd: number; aSp: number;
      sz: number; col: string; life: number; maxLife: number; elong: boolean;
    }

    let particles: P[] = [];
    let frame = 0;
    let raf: number;

    const spawn = () => {
      const dir = Math.random() > 0.5 ? 1 : -1;
      particles.push({
        a:       Math.random() * Math.PI * 2,
        r:       Math.random() * 18 + 2,
        spd:     Math.random() * 2.2 + 0.5,
        aSp:     (Math.random() * 0.05 + 0.008) * dir,
        sz:      Math.random() * 2.8 + 0.4,
        col:     COLORS[Math.floor(Math.random() * COLORS.length)],
        life:    0,
        maxLife: Math.random() * 100 + 30,
        elong:   Math.random() > 0.60,
      });
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H * 0.50;
      ctx.clearRect(0, 0, W, H);

      // Spawn 1–2 particles per frame
      spawn();
      if (frame % 3 === 0) spawn();
      frame++;

      // Soft portal glow at center
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      grd.addColorStop(0,   'rgba(160,230,255,0.14)');
      grd.addColorStop(0.4, 'rgba(80,180,255,0.08)');
      grd.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, 90, 0, Math.PI * 2); ctx.fill();

      // Pulsing ring
      const pulse = 0.5 + 0.5 * Math.sin(frame * 0.06);
      ctx.strokeStyle = `rgba(140,220,255,${0.12 + 0.10 * pulse})`;
      ctx.lineWidth   = 1.2 + pulse * 0.8;
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#88ccff';
      ctx.beginPath(); ctx.arc(cx, cy, 44 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur  = 0;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++; p.a += p.aSp; p.r += p.spd;
        if (p.life >= p.maxLife || p.r > Math.hypot(W, H)) {
          particles.splice(i, 1); continue;
        }
        const alpha = (1 - p.life / p.maxLife) * 0.9;
        const px = cx + Math.cos(p.a) * p.r;
        const py = cy + Math.sin(p.a) * p.r;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur  = 10;
        ctx.shadowColor = p.col;
        ctx.fillStyle   = p.col;

        if (p.elong) {
          ctx.translate(px, py);
          ctx.rotate(p.a);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.sz * 4.5, p.sz * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(px, py, p.sz, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:'absolute', inset:0,
        width:'100%', height:'100%',
        pointerEvents:'none', zIndex:3,
      }}
    />
  );
}

// ─── (old PullCard and PullResultOverlay removed — see GachaResultCard above) ─

// ─── Nav arrow button ─────────────────────────────────────────────────────────
function NavArrow({ dir, onClick }: { dir:'left'|'right'; onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{
      position:'absolute', top:'50%',
      [dir==='left' ? 'left' : 'right']: 0,
      transform:'translateY(-50%)',
      zIndex:30, width:36, height:72,
      borderRadius: dir==='left' ? '0 8px 8px 0' : '8px 0 0 8px',
      background:'rgba(20,10,40,.75)',
      border:`1px solid rgba(160,100,255,.3)`,
      borderLeft:  dir==='right' ? '1px solid rgba(160,100,255,.3)' : 'none',
      borderRight: dir==='left'  ? '1px solid rgba(160,100,255,.3)' : 'none',
      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
      backdropFilter:'blur(6px)',
    }}>
      <svg width="14" height="20" viewBox="0 0 14 20">
        <polygon
          points={dir==='right' ? '2,2 12,10 2,18' : '12,2 2,10 12,18'}
          fill="rgba(190,150,255,.75)"
          stroke="rgba(210,180,255,.4)"
          strokeWidth="1"
        />
      </svg>
    </button>
  );
}

// ─── Rates popup (full screen) ────────────────────────────────────────────────
function RatesPopup({ onClose }: { onClose: () => void }) {
  const pools = [
    {
      label: 'NORMAL SUMMON',
      color: 'rgba(210,170,255,.95)',
      border: 'rgba(160,100,255,.5)',
      glow: 'rgba(160,100,255,.3)',
      rates: [
        { rarity:'A', color:'#a78bfa', pct:'5%' },
        { rarity:'B', color:'#60a5fa', pct:'15%' },
        { rarity:'C', color:'#9ca3af', pct:'80%' },
      ],
      comingSoon: false,
    },
    {
      label: 'EPIC SUMMON',
      color: '#40C4FF',
      border: 'rgba(64,196,255,.5)',
      glow: 'rgba(64,196,255,.3)',
      rates: [
        { rarity:'S', color:'#fbbf24', pct:'1%' },
        { rarity:'A', color:'#a78bfa', pct:'9%' },
        { rarity:'B', color:'#60a5fa', pct:'20%' },
        { rarity:'C', color:'#9ca3af', pct:'70%' },
      ],
      comingSoon: true,
    },
    {
      label: 'SUPERIOR SUMMON',
      color: '#E040FB',
      border: 'rgba(224,64,251,.5)',
      glow: 'rgba(224,64,251,.3)',
      rates: [
        { rarity:'SS', color:'#f87171', pct:'0.5%' },
        { rarity:'S',  color:'#fbbf24', pct:'2.5%' },
        { rarity:'A',  color:'#a78bfa', pct:'17%' },
        { rarity:'B',  color:'#60a5fa', pct:'30%' },
        { rarity:'C',  color:'#9ca3af', pct:'50%' },
      ],
      comingSoon: true,
    },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:9000,
        background:'rgba(4,2,12,.94)',
        backdropFilter:'blur(6px)',
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'20px 16px', gap:16,
        overflowY:'auto',
      }}
    >
      {/* Title */}
      <div style={{ fontFamily:FP, fontSize:'clamp(14px,3vw,22px)', fontWeight:900,
        color:'#fff', letterSpacing:'.22em', textShadow:'0 0 20px rgba(200,140,255,.7)',
        marginBottom:4, userSelect:'none' }}>
        RATES
      </div>

      {/* Pool cards */}
      {pools.map(pool => (
        <div
          key={pool.label}
          onClick={e => e.stopPropagation()}
          style={{
            width:'100%', maxWidth:360,
            background:'rgba(0,0,0,.7)',
            border:`1px solid ${pool.border}`,
            borderRadius:12,
            padding:'14px 18px',
            boxShadow:`0 0 24px ${pool.glow}`,
          }}
        >
          {/* Pool label */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <div style={{ flex:1, height:1, background:`linear-gradient(90deg, transparent, ${pool.border})` }} />
            <span style={{ fontFamily:FP, fontSize:'clamp(9px,1.8vw,13px)', fontWeight:900,
              color:pool.color, letterSpacing:'.18em', whiteSpace:'nowrap',
              textShadow:`0 0 10px ${pool.glow}` }}>
              {pool.label}
            </span>
            <div style={{ flex:1, height:1, background:`linear-gradient(270deg, transparent, ${pool.border})` }} />
          </div>

          {/* Rates */}
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {pool.rates.map(r => (
              <div key={r.rarity} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%',
                    background:r.color, boxShadow:`0 0 6px ${r.color}` }} />
                  <span style={{ fontFamily:F, fontSize:'clamp(11px,2vw,14px)', fontWeight:700,
                    color:'rgba(255,255,255,.85)', letterSpacing:'.06em' }}>
                    Hero {r.rarity}
                  </span>
                </div>
                <span style={{ fontFamily:FP, fontSize:'clamp(12px,2.2vw,16px)', fontWeight:900,
                  color:r.color, letterSpacing:'.04em' }}>
                  {r.pct}
                </span>
              </div>
            ))}
          </div>

          {pool.comingSoon && (
            <div style={{ marginTop:10, textAlign:'center', fontFamily:F,
              fontSize:'clamp(8px,1.2vw,10px)', fontWeight:900, letterSpacing:'.2em',
              color:'rgba(255,255,255,.35)', background:'rgba(255,255,255,.06)',
              borderRadius:4, padding:'4px 0' }}>
              COMING SOON
            </div>
          )}
        </div>
      ))}

      {/* Close hint */}
      <div style={{ fontFamily:F, fontSize:9, color:'rgba(255,255,255,.28)',
        letterSpacing:'.12em', marginTop:4, userSelect:'none' }}>
        TAP ANYWHERE TO CLOSE
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TavernPage() {
  const { user, refreshProfile } = useAuth();
  const { refreshHeroes } = useHero();

  const [slideIdx, setSlideIdx] = useState(0);
  const [pulling,  setPulling]  = useState(false);
  const [result,   setResult]   = useState<PullItem[]|null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [msg,      setMsg]      = useState<string|null>(null);

  const gems = user?.gems ?? 0;
  const bannerSrc = useChromaKeyDataUrl(BANNER_RAW);
  const flash = (m: string) => { setMsg(m); setTimeout(()=>setMsg(null), 2600); };

  const doPull = useCallback(async (count: 1|10) => {
    if (pulling) return;
    const poolId = ['normal','epic','superior'][slideIdx];
    const cost   = count===1 ? (slideIdx===0?10:slideIdx===1?30:80)
                             : (slideIdx===0?90:slideIdx===1?270:720);
    if (gems < cost) { flash(`Not enough 💎! Need ${cost}`); return; }

    setPulling(true);
    const sb = getSupabase();
    const { data, error } = await sb.rpc('rpc_gacha_pull', {
      p_pool: poolId, p_count: count,
    }) as { data: { ok?:boolean; error?:string; results?:PullItem[] }|null; error:unknown };

    if (error || !data?.ok) {
      flash(data?.error ?? 'Pull failed — try again');
      setPulling(false);
      return;
    }

    await refreshProfile();
    await refreshHeroes();
    setResult(data.results ?? []);
    setPulling(false);
  }, [pulling, slideIdx, gems, refreshProfile]);

  const slideCfg = [
    { id:'normal',   label:'Normal Summon',  color:'rgba(210,170,255,.95)',
      border:'rgba(160,100,255,.45)', cost1:10, cost10:90,  comingSoon:false },
    { id:'epic',     label:'Epic Summon',     color:'#40C4FF',
      border:'rgba(64,196,255,.4)',   cost1:30, cost10:270, comingSoon:true  },
    { id:'superior', label:'Superior Summon', color:'#E040FB',
      border:'rgba(224,64,251,.4)',   cost1:80, cost10:720, comingSoon:true  },
  ];

  return (
    <div style={{ position:'relative', width:'100%', height:'100dvh', overflow:'hidden',
      background:'#08050e' }}>

      {/* ── BG layers ── */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'linear-gradient(160deg,#110828 0%,#08050e 45%,#0f0620 100%)' }}/>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'radial-gradient(ellipse 85% 50% at 50% 0%, rgba(110,50,200,.20) 0%,transparent 70%)' }}/>

      {/* Sparkles */}
      {Array.from({length:16},(_,i)=>(
        <div key={i} style={{
          position:'absolute',
          left:`${(i*41+i*11)%90+5}%`, top:`${(i*29+i*7)%78+8}%`,
          width:i%3===0?3:2, height:i%3===0?3:2, borderRadius:'50%',
          background:'rgba(200,155,255,.5)', pointerEvents:'none',
          animation:`sp${i%4} ${1.8+(i%3)*.6}s ease-in-out ${(i*.17)%1.8}s infinite alternate`,
        }}/>
      ))}
      <style>{`
        @keyframes sp0{0%{opacity:.12;transform:scale(.7)}100%{opacity:.85;transform:scale(1.2)}}
        @keyframes sp1{0%{opacity:.22;transform:scale(1)}100%{opacity:.6;transform:scale(.8)}}
        @keyframes sp2{0%{opacity:.1;transform:scale(1.1)}100%{opacity:.7;transform:scale(.9)}}
        @keyframes sp3{0%{opacity:.28;transform:scale(.85)}100%{opacity:.9;transform:scale(1.15)}}
        @keyframes fmsg{0%{opacity:0;transform:translateX(-50%) translateY(-10px) scale(.9)}
          12%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}
          82%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-6px)}}
        .flash-msg{animation:fmsg 2.6s ease-out forwards}
      `}</style>

      {/* ── CHECK RATE button — top right, below resource bar ── */}
      <button
        onClick={() => setRateOpen(true)}
        style={{
          position:'absolute', top:68, right:10, zIndex:60,
          background:'rgba(20,10,40,.85)',
          border:'1px solid rgba(249,115,22,.55)',
          borderRadius:6, color:'rgba(249,180,80,.95)',
          fontFamily:F, fontSize:'clamp(8px,1.4vw,11px)', fontWeight:900,
          padding:'6px 12px', cursor:'pointer',
          letterSpacing:'.1em', whiteSpace:'nowrap',
          boxShadow:'0 0 10px rgba(249,115,22,.25)',
          backdropFilter:'blur(4px)',
          touchAction:'manipulation',
          minHeight:36,
        }}
      >
        CHECK RATE
      </button>

      {/* ══ SUMMON ══ */}
      <div style={{ position:'absolute', top:70, bottom:'9%', left:0, right:0, zIndex:10,
        overflow:'hidden' }}>

        {/* Slide container */}
        <div style={{
          display:'flex', height:'100%', width:'300%',
          transform:`translateX(-${slideIdx*33.333}%)`,
          transition:'transform .38s cubic-bezier(.4,0,.2,1)',
        }}>
          {slideCfg.map((slide, si) => (
            <div key={slide.id} style={{ width:'33.333%', flexShrink:0, height:'100%',
              position:'relative', display:'flex', flexDirection:'column', padding:'0 12px' }}>

              {slide.comingSoon ? (
                <div style={{ flex:1, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:16 }}>
                  <div style={{ width:'clamp(120px,50%,220px)', aspectRatio:'16/9',
                    borderRadius:12, border:`1px solid ${slide.border}`,
                    background:'rgba(0,0,0,.55)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    boxShadow:`0 0 28px ${slide.border}` }}>
                    <svg width="52" height="52" viewBox="0 0 52 52" opacity=".35">
                      <polygon points="26,2 31,18 48,18 35,28 40,46 26,36 12,46 17,28 4,18 21,18"
                        fill={slide.color} stroke={slide.color} strokeWidth="1"/>
                    </svg>
                  </div>
                  <div style={{ fontFamily:FP, fontSize:'clamp(12px,2vw,18px)', fontWeight:800,
                    color:slide.color, letterSpacing:'.16em',
                    textShadow:`0 0 20px ${slide.border}` }}>
                    {slide.label}
                  </div>
                  <div style={{ fontFamily:F, fontSize:'clamp(9px,1.2vw,12px)', fontWeight:900,
                    color:'rgba(255,255,255,.5)', letterSpacing:'.3em',
                    background:'rgba(0,0,0,.5)', border:'1px solid rgba(255,255,255,.12)',
                    borderRadius:6, padding:'6px 20px' }}>
                    COMING SOON
                  </div>
                  <div style={{ fontFamily:F, fontSize:'clamp(7px,.9vw,9px)',
                    color:'rgba(255,255,255,.25)', letterSpacing:'.08em' }}>
                    {si===1 ? 'Rarity B ~ S  ·  30 💎 / pull' : 'Rarity A ~ SS  ·  80 💎 / pull'}
                  </div>
                </div>
              ) : (
                /* ── Normal Summon slide ── */
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

                  {/* ── NORMAL SUMMON header with CSS lines (no manual chars) ── */}
                  <div style={{
                    flexShrink:0, display:'flex', alignItems:'center',
                    gap:8, padding:'5px 4px 3px',
                  }}>
                    {/* Left fade line */}
                    <div style={{ flex:1, height:2,
                      background:'linear-gradient(90deg, transparent 0%, #F97316 100%)',
                      borderRadius:1 }} />
                    {/* Left block accent */}
                    <div style={{ width:3, height:16, background:'#F97316', borderRadius:1,
                      boxShadow:'0 0 6px rgba(249,115,22,.8)' }} />
                    {/* Title text */}
                    <span style={{
                      fontFamily:FP, fontWeight:900, color:'#ffffff',
                      fontSize:'clamp(12px,2.8vw,20px)', letterSpacing:'.22em',
                      textShadow:'0 0 18px rgba(249,115,22,.75)',
                      whiteSpace:'nowrap', userSelect:'none',
                    }}>
                      NORMAL SUMMON
                    </span>
                    {/* Right block accent */}
                    <div style={{ width:3, height:16, background:'#F97316', borderRadius:1,
                      boxShadow:'0 0 6px rgba(249,115,22,.8)' }} />
                    {/* Right fade line */}
                    <div style={{ flex:1, height:2,
                      background:'linear-gradient(270deg, transparent 0%, #F97316 100%)',
                      borderRadius:1 }} />
                  </div>

                  {/* Banner + portal particles — particles NOW above the image */}
                  <div style={{
                    flex:1, position:'relative',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background:'transparent', overflow:'hidden', minHeight:0,
                  }}>
                    {/* Character illustration — z:2 (below particles) */}
                    <img
                      src={bannerSrc ?? ''}
                      alt="Normal Summon Banner"
                      style={{
                        position:'relative', zIndex:2,
                        width:'75%', height:'100%',
                        objectFit:'contain', objectPosition:'center center',
                        display:'block',
                      }}
                    />
                    {/* Portal particles — z:3 (ABOVE image) */}
                    <PortalParticles />
                  </div>

                  {/* Info section */}
                  <div style={{ flexShrink:0, display:'flex', flexDirection:'column',
                    gap:7, paddingBottom:6 }}>

                    {/* GET HERO RARITY label — above buttons, centered */}
                    <div style={{ textAlign:'center', paddingTop:2 }}>
                      <span style={{
                        fontFamily:FP, fontSize:'clamp(10px,2.4vw,17px)', fontWeight:900,
                        color:'rgba(210,170,255,.95)', letterSpacing:'.18em',
                        textShadow:'0 0 14px rgba(160,100,255,.65)',
                        userSelect:'none',
                      }}>
                        GET HERO RARITY C - A
                      </span>
                    </div>

                    {/* Pull buttons */}
                    <div style={{ display:'flex', gap:10 }}>
                      <button
                        disabled={pulling || gems<10}
                        onClick={()=>doPull(1)}
                        style={{
                          flex:1, padding:'10px 0', borderRadius:'9999px',
                          cursor: gems>=10 && !pulling ? 'pointer' : 'not-allowed',
                          border:'2px solid #ffffff',
                          background: gems>=10 && !pulling
                            ? 'linear-gradient(180deg,#FF8C00 0%,#FF5500 100%)'
                            : 'rgba(80,50,30,.4)',
                          boxShadow: gems>=10 && !pulling
                            ? '0 2px 14px rgba(255,112,0,.65),0 1px 4px rgba(0,0,0,.5)'
                            : 'none',
                          opacity: pulling ? .6 : 1, transition:'all .18s',
                          display:'flex', flexDirection:'column',
                          alignItems:'center', justifyContent:'center', gap:1,
                          touchAction:'manipulation', minHeight:48,
                        }}>
                        <span style={{ color:'#ffffff', fontFamily:FP,
                          fontSize:'clamp(8px,1.3vw,11px)', fontWeight:800,
                          letterSpacing:'.18em', textShadow:'0 1px 4px rgba(0,0,0,.5)',
                          lineHeight:1, userSelect:'none', whiteSpace:'nowrap' }}>
                          {pulling ? '…' : 'SINGLE PULL'}
                        </span>
                        <span style={{ color:'rgba(255,240,200,.85)', fontFamily:F,
                          fontSize:'clamp(6px,.85vw,8px)', fontWeight:700,
                          letterSpacing:'.1em', lineHeight:1, userSelect:'none' }}>
                          10 💎
                        </span>
                      </button>

                      <button
                        disabled={pulling || gems<90}
                        onClick={()=>doPull(10)}
                        style={{
                          flex:1, padding:'10px 0', borderRadius:'9999px',
                          cursor: gems>=90 && !pulling ? 'pointer' : 'not-allowed',
                          border:'2px solid #ffffff',
                          background: gems>=90 && !pulling
                            ? 'linear-gradient(180deg,#FF8C00 0%,#FF5500 100%)'
                            : 'rgba(80,50,30,.4)',
                          boxShadow: gems>=90 && !pulling
                            ? '0 2px 14px rgba(255,112,0,.65),0 1px 4px rgba(0,0,0,.5)'
                            : 'none',
                          opacity: pulling ? .6 : 1, transition:'all .18s',
                          display:'flex', flexDirection:'column',
                          alignItems:'center', justifyContent:'center', gap:1,
                          touchAction:'manipulation', minHeight:48,
                        }}>
                        <span style={{ color:'#ffffff', fontFamily:FP,
                          fontSize:'clamp(8px,1.3vw,11px)', fontWeight:800,
                          letterSpacing:'.18em', textShadow:'0 1px 4px rgba(0,0,0,.5)',
                          lineHeight:1, userSelect:'none', whiteSpace:'nowrap' }}>
                          {pulling ? '…' : '10x MULTI PULL'}
                        </span>
                        <span style={{ color:'rgba(255,240,200,.85)', fontFamily:F,
                          fontSize:'clamp(6px,.85vw,8px)', fontWeight:700,
                          letterSpacing:'.1em', lineHeight:1, userSelect:'none' }}>
                          90 💎
                        </span>
                      </button>
                    </div>

                    <div style={{ textAlign:'center', fontFamily:F, fontSize:8,
                      color:'rgba(180,140,255,.32)', letterSpacing:'.06em' }}>
                      ×10 saves 10 💎  ·  9 💎 per pull
                    </div>
                  </div>
                </div>
              )}

              {/* ── Nav arrows ── */}
              {si > 0 && <NavArrow dir="left"  onClick={()=>setSlideIdx(i=>Math.max(0,i-1))}/>}
              {si < 2 && <NavArrow dir="right" onClick={()=>setSlideIdx(i=>Math.min(2,i+1))}/>}
            </div>
          ))}
        </div>

        {/* Slide indicator dots */}
        <div style={{ position:'absolute', bottom:8, left:0, right:0,
          display:'flex', justifyContent:'center', gap:6, pointerEvents:'none' }}>
          {[0,1,2].map(i=>(
            <div key={i} style={{
              width: i===slideIdx?18:6, height:6, borderRadius:3, transition:'all .3s',
              background: i===slideIdx ? 'rgba(190,140,255,.85)' : 'rgba(255,255,255,.18)',
              boxShadow: i===slideIdx ? '0 0 7px rgba(160,100,255,.7)' : 'none',
            }}/>
          ))}
        </div>
      </div>

      {/* ── Flash message ── */}
      {msg && (
        <div className="flash-msg" key={msg} style={{
          position:'fixed', top:'17%', left:'50%',
          zIndex:8000, fontFamily:F, fontSize:'clamp(9px,1.3vw,12px)', fontWeight:800,
          color:'rgba(220,190,255,.98)', letterSpacing:'.1em',
          background:'rgba(10,5,26,.92)', border:'1px solid rgba(160,100,255,.55)',
          borderRadius:8, padding:'8px 20px',
          boxShadow:'0 0 18px rgba(120,60,200,.5),0 4px 16px rgba(0,0,0,.8)',
          pointerEvents:'none', whiteSpace:'nowrap',
        }}>{msg}</div>
      )}

      {/* ── Pull result overlay ── */}
      {result && (
        <PullResultOverlay items={result} onClose={()=>setResult(null)}/>
      )}

      {/* ── Rates popup ── */}
      {rateOpen && <RatesPopup onClose={() => setRateOpen(false)} />}

      {/* ── Bottom nav ── */}
      <GamePageLayout activeTab="city" hidePlayerInfo hideDropdown/>
    </div>
  );
}