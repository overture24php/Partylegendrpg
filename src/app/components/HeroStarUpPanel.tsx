/**
 * HeroStarUpPanel — rendered inside HeroDetailView when "Star UP" tab is active.
 * Reads hero shards via rpc_fetch_hero_shards(), executes rpc_star_up(playerHero.id).
 * Costs mirror patch_v8_gacha.sql rpc_star_up exactly.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useHero } from '../context/HeroContext';
import { getSupabase } from '../../lib/supabase';
import { playBtnSound } from '../utils/buttonSound';
import { upsertPlayerHero } from '/utils/supabase/hero-db';
import { computeStarBonus, computeFinalStats } from '../constants/balanceEngine';

const F  = "'Roboto Condensed', sans-serif";
const FP = "'Playfair Display', serif";

const MAX_STARS = 16; // yellow 1-5 | red 6-10 | white 11-15 | rainbow 16

// Mirror of SQL rpc_star_up cost tables
// tier = floor((currentStars - 1) / 5), max 3
const SHARD_COST = [60, 80, 100, 120]; // per tier

const GOLD_COST: Record<string, number[]> = {
  // letter grade → per-tier gold
  C:  [500,    1_000,   2_000,   4_000],
  B:  [2_000,  4_000,   8_000,  16_000],
  A:  [5_000,  10_000,  20_000,  40_000],
  S:  [15_000, 30_000,  60_000, 120_000],
  SS: [50_000, 100_000, 200_000, 400_000],
  // long-form fallbacks (hero_definitions.rarity may use these)
  common:    [500,    1_000,   2_000,   4_000],
  rare:      [2_000,  4_000,   8_000,  16_000],
  epic:      [5_000,  10_000,  20_000,  40_000],
  legendary: [15_000, 30_000,  60_000, 120_000],
  mythic:    [50_000, 100_000, 200_000, 400_000],
};

const TIER_LABEL  = ['Yellow', 'Red',    'White',  'Rainbow'];
const TIER_COLOR  = ['#FFD700','#FF3333','#D8D8D8','#FFD700']; // rainbow uses gold+glow

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${+(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${+(n/1_000).toFixed(1)}K`;
  return `${n}`;
}

// ── Star row display ──────────────────────────────────────────────────────────
function StarRow({ filled, tier }: { filled: number; tier: number }) {
  const col   = TIER_COLOR[tier];
  // rainbow tier has only 1 slot (max 16 stars = 1 rainbow star)
  const slots = tier === 3 ? 1 : 5;
  return (
    <div style={{ display:'flex', gap:5, alignItems:'center', justifyContent:'center' }}>
      {Array.from({length: slots}, (_, i) => {
        const lit = i < filled;
        const rainbowFilter = lit && tier === 3
          ? 'drop-shadow(0 0 5px #FFD700) drop-shadow(0 0 10px rgba(255,80,255,0.8))'
          : undefined;
        return (
          <svg key={i} width="18" height="18" viewBox="0 0 18 18">
            <path
              d="M9 1 L10.8 6.5 H16.5 L11.9 9.8 L13.7 15.3 L9 12 L4.3 15.3 L6.1 9.8 L1.5 6.5 H7.2 Z"
              fill={lit ? col : 'rgba(255,255,255,0.12)'}
              stroke={lit ? (tier === 2 ? '#888888' : col) : 'rgba(255,255,255,0.2)'}
              strokeWidth="0.5"
              style={{ filter: rainbowFilter ?? (lit ? `drop-shadow(0 0 4px ${col})` : 'none') }}
            />
          </svg>
        );
      })}
    </div>
  );
}

interface Props {
  heroId:      string;
  rarity:      string;   // 'common'|'rare'|'epic'|'legendary'|'mythic' (or letter grade)
  rarityColor: string;
  onClose?:    () => void;
}

export function HeroStarUpPanel({ heroId, rarity, rarityColor, onClose }: Props) {
  const { user, refreshProfile } = useAuth();
  const { ownedHeroes, refreshHeroes } = useHero();

  const [shards,  setShards]  = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);

  // ── Find owned hero ─────────────────────────────────────────────────────────
  const owned = ownedHeroes.find(oh => oh.playerHero.hero_id === heroId);
  const currentStars  = owned?.playerHero.stars ?? 1;
  const playerHeroId  = owned?.playerHero.id;   // UUID for rpc_star_up

  // ── Load shard balance ──────────────────────────────────────────────────────
  const loadShards = useCallback(async () => {
    if (!user?.id) return;
    const sb = getSupabase();
    const { data, error } = await sb.rpc('rpc_fetch_hero_shards');
    if (error || !data) return;
    const row = (data as { hero_id: string; amount: number }[])
      .find(r => r.hero_id === heroId);
    setShards(row?.amount ?? 0);
  }, [user?.id, heroId]);

  useEffect(() => { loadShards(); }, [loadShards]);

  // ── Cost calculations ───────────────────────────────────────────────────────
  const isMaxed    = currentStars >= MAX_STARS;
  // dispTier: which color tier we're currently in (yellow/red/white/rainbow)
  // stars 1-5→0(yellow), 6-10→1(red), 11-15→2(white), 16→3(rainbow)
  const dispTier   = Math.min(3, Math.floor(Math.max(0, currentStars - 1) / 5));
  // costTier: matches SQL rpc_star_up (floor(stars/5)) — determines upgrade price
  // upgrading from star-5→6 costs tier-1 (red) prices since you're entering the red tier
  const costTier   = Math.min(3, Math.floor(currentStars / 5));
  const tier       = dispTier; // alias used by StarRow / display
  const shardCost  = SHARD_COST[costTier];
  const goldCost   = (GOLD_COST[rarity] ?? GOLD_COST.common)[costTier];
  const userGold   = user?.gold ?? 0;
  const canUp      = !isMaxed
    && (shards ?? 0) >= shardCost
    && userGold >= goldCost
    && !!playerHeroId;

  // ── Execute star up ─────────────────────────────────────────────────────────
  const doStarUp = async () => {
    if (!canUp || loading || !playerHeroId) return;
    playBtnSound();
    setLoading(true);
    setMsg(null);

    const sb = getSupabase();
    const { data, error } = await sb.rpc('rpc_star_up', {
      p_player_hero_id: playerHeroId,
    }) as { data: { ok?: boolean; error?: string; new_stars?: number } | null; error: unknown };

    setLoading(false);

    if (error || !data?.ok) {
      const err = data?.error ?? 'Star Up failed';
      const txt = err === 'max_stars'          ? '⭐ Already at max stars!'
                : err === 'insufficient_shards' ? `Not enough shards (need ${shardCost})`
                : err === 'insufficient_gold'   ? `Not enough Gold (need ${fmtNum(goldCost)}G)`
                : err;
      setMsg({ text: txt, ok: false });
      return;
    }

    // ── Re-sync stats with new star multiplier (battle RPC reads these directly) ─
    const newStars = data.new_stars ?? (currentStars + 1);
    const ownedNow = ownedHeroes.find(oh => oh.playerHero.hero_id === heroId);
    if (ownedNow && user) {
      const d   = ownedNow.def;
      const lv  = ownedNow.playerHero.level;
      const s   = computeFinalStats(d, lv, newStars);
      const power = Math.round((s.hp/10) + (s.pAtk*3) + (s.mAtk*2) + (s.pDef*2) + (s.mDef*2) + (s.speed*2));
      await upsertPlayerHero({
        user_id: user.id, hero_id: heroId,
        stars: newStars, level: lv, xp: ownedNow.playerHero.xp,
        hp: s.hp, p_atk: s.pAtk, m_atk: s.mAtk, p_def: s.pDef, m_def: s.mDef, speed: s.speed, power,
      });
    }

    await Promise.all([refreshHeroes(), refreshProfile(), loadShards()]);
    setMsg({ text: `★ Reached ${newStars} Stars!`, ok: true });
    setTimeout(() => setMsg(null), 2800);
  };

  // ── Star tier breakdown display ─────────────────────────────────────────────
  const currentTierBase = dispTier * 5;
  const starsInTier     = currentStars - currentTierBase; // 1-5 (or 1 for rainbow tier)

  return (
    <div style={{
      position:'absolute', bottom:'10.5%', left:'50%', transform:'translateX(-50%)',
      zIndex:60, width:'min(340px,88vw)',
      background:'rgba(6,3,14,0.96)',
      border:`1.5px solid rgba(255,215,0,0.28)`,
      borderRadius:14,
      padding:'14px 16px 12px',
      boxShadow:'0 6px 36px rgba(0,0,0,0.85)',
      display:'flex', flexDirection:'column', gap:10,
    }}>

      {/* ── Close button ── */}
      {onClose && (
        <button onClick={onClose} style={{
          position:'absolute', top:6, right:7, zIndex:40,
          width:22, height:22, borderRadius:'50%',
          background:'rgba(0,0,0,0.7)', border:'1px solid rgba(255,255,255,0.25)',
          color:'rgba(255,255,255,0.7)', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:13, lineHeight:1, padding:0,
        }}>✕</button>
      )}

      {/* ── Current stars summary (compact — no big tier grid) ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        <StarRow filled={starsInTier} tier={tier}/>
        <div style={{ fontFamily:FP, fontSize:11, color:'rgba(255,215,0,.85)', letterSpacing:'.14em' }}>
          {isMaxed ? 'MAX ★ 16 — Fully Ascended' : `★ ${currentStars} / 16`}
        </div>
      </div>

      {/* ── Next upgrade info ── */}
      {!isMaxed ? (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontFamily:F, fontSize:9, color:'rgba(255,255,255,.35)',
            letterSpacing:'.14em', textAlign:'center' }}>
            UPGRADE TO ★ {currentStars + 1}  ·  {TIER_LABEL[Math.min(3, Math.floor(currentStars / 5))]} Tier
          </div>

          {/* Cost row */}
          <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
            {/* Shard cost */}
            <div style={{
              flex:1, background:'rgba(0,0,0,.4)', border:'1px solid rgba(255,255,255,.08)',
              borderRadius:8, padding:'7px 10px',
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            }}>
              <div style={{ fontFamily:F, fontSize:8, color:'rgba(180,140,255,.6)',
                letterSpacing:'.08em' }}>SHARDS</div>
              <div style={{ fontFamily:FP, fontSize:14, fontWeight:800,
                color: (shards ?? 0) >= shardCost ? '#c084fc' : '#f87171' }}>
                {shards === null ? '…' : shards} / {shardCost}
              </div>
              {shards !== null && shards < shardCost && (
                <div style={{ fontFamily:F, fontSize:7, color:'#f87171',
                  letterSpacing:'.05em' }}>
                  Need {shardCost - shards} more
                </div>
              )}
            </div>

            {/* Gold cost */}
            <div style={{
              flex:1, background:'rgba(0,0,0,.4)', border:'1px solid rgba(255,255,255,.08)',
              borderRadius:8, padding:'7px 10px',
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            }}>
              <div style={{ fontFamily:F, fontSize:8, color:'rgba(255,215,0,.5)',
                letterSpacing:'.08em' }}>GOLD</div>
              <div style={{ fontFamily:FP, fontSize:14, fontWeight:800,
                color: userGold >= goldCost ? '#FFD700' : '#f87171' }}>
                {fmtNum(goldCost)}G
              </div>
              <div style={{ fontFamily:F, fontSize:7,
                color: userGold >= goldCost ? 'rgba(255,215,0,.5)' : '#f87171',
                letterSpacing:'.05em' }}>
                Have {fmtNum(userGold)}G
              </div>
            </div>
          </div>

          {/* Star Up button */}
          <button
            disabled={!canUp || loading}
            onClick={doStarUp}
            style={{
              width:'100%', padding:'10px 0',
              borderRadius:9999,
              border:'2px solid #ffffff',
              background: canUp && !loading
                ? `linear-gradient(180deg, ${rarityColor}cc 0%, ${rarityColor} 100%)`
                : 'rgba(60,40,20,.4)',
              cursor: canUp && !loading ? 'pointer' : 'not-allowed',
              opacity: loading ? .6 : 1,
              boxShadow: canUp && !loading
                ? `0 2px 14px ${rarityColor}88, 0 1px 4px rgba(0,0,0,.5)` : 'none',
              transition:'all .18s',
              fontFamily:FP, fontSize:12, fontWeight:800, letterSpacing:'.18em',
              color:'#ffffff', textShadow:'0 1px 4px rgba(0,0,0,.6)',
            }}
          >
            {loading ? 'Ascending…' : `✦ STAR UP  ★${currentStars} → ★${currentStars+1}`}
          </button>
        </div>
      ) : (
        <div style={{ textAlign:'center', padding:'8px 0' }}>
          <div style={{ fontFamily:FP, fontSize:14, color:'#FFD700',
            textShadow:'0 0 16px rgba(255,215,0,.7)', letterSpacing:'.12em' }}>
            ✦ Fully Ascended ✦
          </div>
          <div style={{ fontFamily:F, fontSize:8, color:'rgba(255,255,255,.28)',
            letterSpacing:'.08em', marginTop:4 }}>
            Maximum 16 stars reached
          </div>
        </div>
      )}

      {/* ── Feedback message ── */}
      {msg && (
        <div style={{
          textAlign:'center', fontFamily:F, fontSize:10, fontWeight:800,
          color: msg.ok ? '#4ade80' : '#f87171', letterSpacing:'.06em',
          padding:'4px 0',
        }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
