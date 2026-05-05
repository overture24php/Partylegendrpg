/**
 * HeroResetPanel — Reset hero level to 1, refund 100% resources.
 * Cost: 100 Gems/Diamonds.
 * Client-side cost preview mirrors get_hero_level_cost() SQL function.
 */

import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useHero } from '../context/HeroContext';
import { getSupabase } from '../../lib/supabase';
import { playBtnSound } from '../utils/buttonSound';

const F  = "'Roboto Condensed', sans-serif";
const FP = "'Playfair Display', serif";

const RARITY_MULT: Record<string, { exp: number; gold: number; stone: number }> = {
  common:    { exp: 1.0,  gold: 1.0,  stone: 1.0 },
  rare:      { exp: 1.8,  gold: 1.8,  stone: 1.5 },
  epic:      { exp: 3.0,  gold: 3.0,  stone: 2.0 },
  legendary: { exp: 5.0,  gold: 5.0,  stone: 3.0 },
  mythic:    { exp: 8.5,  gold: 8.5,  stone: 5.0 },
};

const RARITY_LABEL: Record<string, string> = {
  common: 'C', rare: 'B', epic: 'A', legendary: 'S', mythic: 'SS',
};

function getBaseCost(currentLevel: number): { exp: number; gold: number } {
  if (currentLevel < 40)  return { exp: 80,    gold: 500   };
  if (currentLevel < 80)  return { exp: 160,   gold: 1_000 };
  if (currentLevel < 120) return { exp: 300,   gold: 2_000 };
  if (currentLevel < 160) return { exp: 550,   gold: 3_800 };
  if (currentLevel < 200) return { exp: 1_000, gold: 7_000 };
  return                         { exp: 1_800, gold: 13_000 };
}

function getStoneCostBase(nextLevel: number): number {
  if (nextLevel % 20 !== 0) return 0;
  if (nextLevel <= 40)  return 10;
  if (nextLevel <= 80)  return 20;
  if (nextLevel <= 120) return 30;
  if (nextLevel <= 160) return 40;
  if (nextLevel <= 180) return 50;
  if (nextLevel <= 200) return 60;
  if (nextLevel <= 220) return 80;
  return 100;
}

function calcTotalSpent(rarity: string, currentLevel: number) {
  const mult = RARITY_MULT[rarity] ?? RARITY_MULT.common;
  let exp = 0, gold = 0, stones = 0;
  // Sum from Lv0→1, Lv1→2, … Lv(n-1)→n
  for (let i = 0; i < currentLevel - 1; i++) {
    const base = getBaseCost(i);
    exp    += Math.ceil(base.exp  * mult.exp);
    gold   += Math.ceil(base.gold * mult.gold);
    stones += Math.ceil(getStoneCostBase(i + 1) * mult.stone);
  }
  return { exp, gold, stones };
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

interface Props {
  heroId:       string;
  rarity:       string;
  currentLevel: number;
  rarityColor:  string;
  onClose?:     () => void;
}

export function HeroResetPanel({ heroId, rarity, currentLevel, rarityColor, onClose }: Props) {
  const { user, updateProfile } = useAuth();
  const { refreshHeroes } = useHero();

  const [confirm,  setConfirm]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState<{ text: string; ok: boolean } | null>(null);

  const RESET_GEM_COST = 100;
  const availGems  = user?.gems ?? 0;
  const canAfford  = availGems >= RESET_GEM_COST;
  const isLv1      = currentLevel <= 1;
  const rarityLbl  = RARITY_LABEL[rarity] ?? 'C';

  const refund = useMemo(
    () => calcTotalSpent(rarity, currentLevel),
    [rarity, currentLevel],
  );

  const handleReset = async () => {
    if (!canAfford || isLv1 || loading) return;
    setLoading(true);
    setMsg(null);

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('rpc_reset_hero_level', {
      p_hero_id: heroId,
    });

    setLoading(false);
    setConfirm(false);

    if (error) {
      setMsg({ text: error.message, ok: false });
      return;
    }

    const res = data as Record<string, unknown>;
    if (res?.error) {
      const code = String(res.error);
      if (code === 'insufficient_gems')
        return setMsg({ text: `Gems kurang. Butuh ${RESET_GEM_COST}, punya ${availGems}.`, ok: false });
      if (code === 'already_lv1')
        return setMsg({ text: 'Hero sudah di Level 1.', ok: false });
      return setMsg({ text: code, ok: false });
    }

    // Optimistic local update — server already modified DB, just sync client state
    await updateProfile({
      gems:                Math.max(0, availGems - RESET_GEM_COST),
      hero_exp:            (user?.hero_exp ?? 0)            + Number(res.exp_refunded    ?? 0),
      gold:                (user?.gold    ?? 0)              + Number(res.gold_refunded   ?? 0),
      breakthrough_stones: (user?.breakthrough_stones ?? 0) + Number(res.stones_refunded ?? 0),
    });

    await refreshHeroes();
    setMsg({ text: `Level direset ke Lv.1 — Resources dikembalikan 100%!`, ok: true });
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <div style={{
      position: 'absolute', left: '22%', right: '22%', bottom: '3%',
      background: 'rgba(0,0,0,0.88)',
      border: `1.5px solid rgba(239,68,68,0.45)`,
      borderRadius: 14,
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      zIndex: 30, overflow: 'hidden',
      boxShadow: '0 0 40px rgba(239,68,68,0.12), 0 8px 32px rgba(0,0,0,0.9)',
    }}>
      {/* Close button */}
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
      {/* Header stripe */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #ef4444, rgba(239,68,68,0.3), transparent)' }}/>

      <div style={{ padding: '10px 14px 12px' }}>

        {/* Title */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <span style={{
            fontFamily: FP, fontSize: 'clamp(9px,1.4vw,12px)', fontWeight: 700,
            color: '#ef4444', letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>Reset Level [{rarityLbl}]</span>
          <span style={{
            fontFamily: FP, fontSize: 'clamp(9px,1.4vw,12px)', color: '#FFD700', fontWeight: 700,
          }}>Lv. {currentLevel} → Lv. 1</span>
        </div>

        {/* Info: what gets refunded */}
        {!isLv1 && (
          <div style={{
            display: 'flex', gap: 5, marginBottom: 9,
          }}>
            <div style={{ flex: 1, padding: '5px 6px', borderRadius: 7,
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="8" stroke="#86efac" strokeWidth="1.5" strokeOpacity="0.7"/>
                <path d="M11 6v5l3 2" stroke="#86efac" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="11" cy="11" r="2" fill="#4ade80"/>
              </svg>
              <span style={{ fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)', color: 'rgba(255,255,255,0.45)' }}>Hero EXP</span>
              <span style={{ fontFamily: F, fontSize: 'clamp(8px,1.2vw,10px)', fontWeight: 800, color: '#4ade80' }}>+{fmtNum(refund.exp)}</span>
            </div>
            <div style={{ flex: 1, padding: '5px 6px', borderRadius: 7,
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="8" fill="#FCD34D" fillOpacity="0.25" stroke="#FCD34D" strokeWidth="1.5"/>
                <text x="11" y="15" textAnchor="middle" fontFamily="serif" fontSize="9" fontWeight="900" fill="#FCD34D">G</text>
              </svg>
              <span style={{ fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)', color: 'rgba(255,255,255,0.45)' }}>Gold</span>
              <span style={{ fontFamily: F, fontSize: 'clamp(8px,1.2vw,10px)', fontWeight: 800, color: '#4ade80' }}>+{fmtNum(refund.gold)}</span>
            </div>
            {refund.stones > 0 && (
              <div style={{ flex: 1, padding: '5px 6px', borderRadius: 7,
                background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                  <polygon points="11,2 20,8 17,18 5,18 2,8" fill={`${rarityColor}33`} stroke={rarityColor} strokeWidth="1.5"/>
                  <circle cx="11" cy="11" r="2.5" fill="white" fillOpacity="0.7"/>
                </svg>
                <span style={{ fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)', color: 'rgba(255,255,255,0.45)' }}>Stones</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(8px,1.2vw,10px)', fontWeight: 800, color: '#4ade80' }}>+{fmtNum(refund.stones)}</span>
              </div>
            )}
          </div>
        )}

        {/* Cost */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8, marginBottom: 8,
          background: canAfford ? 'rgba(99,102,241,0.12)' : 'rgba(239,68,68,0.12)',
          border: `1px solid ${canAfford ? 'rgba(99,102,241,0.35)' : 'rgba(239,68,68,0.35)'}`,
        }}>
          <svg width="16" height="16" viewBox="0 0 14 16" fill="none">
            <polygon points="7,0 14,5 7,16 0,5" fill="#1AADEE"/>
            <polygon points="7,0 14,5 7,7 0,5" fill="#5BCFFF"/>
            <polygon points="7,0 10,5 7,7 4,5" fill="#A8EEFF"/>
          </svg>
          <span style={{ fontFamily: F, fontSize: 'clamp(9px,1.4vw,12px)', flex: 1,
            color: 'rgba(255,255,255,0.65)', fontWeight: 600, letterSpacing: '0.06em',
          }}>Reset Cost</span>
          <span style={{ fontFamily: F, fontSize: 'clamp(9px,1.4vw,12px)', fontWeight: 800,
            color: canAfford ? '#67e8f9' : '#f87171',
          }}>{RESET_GEM_COST} Gems</span>
          <span style={{ fontFamily: F, fontSize: 'clamp(7px,1.1vw,10px)',
            color: canAfford ? 'rgba(74,222,128,0.75)' : 'rgba(239,68,68,0.75)',
          }}>/{availGems}</span>
        </div>

        {/* Warning */}
        {!isLv1 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8,
            padding: '4px 8px', borderRadius: 6,
            background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.25)',
          }}>
            <svg width="11" height="11" viewBox="0 0 22 22" fill="none">
              <path d="M11 3L2 19h18L11 3z" stroke="#F97316" strokeWidth="1.8" strokeLinejoin="round"/>
              <line x1="11" y1="10" x2="11" y2="14" stroke="#F97316" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="11" cy="16.5" r="0.8" fill="#F97316"/>
            </svg>
            <span style={{ fontFamily: F, fontSize: 'clamp(7px,1.1vw,9px)', color: 'rgba(255,165,0,0.85)', letterSpacing: '0.06em' }}>
              Hero stats reset to Lv.1. Resources returned 100%.
            </span>
          </div>
        )}

        {/* Feedback message */}
        {msg && (
          <div style={{
            marginBottom: 8, padding: '4px 8px', borderRadius: 6,
            background: msg.ok ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${msg.ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.35)'}`,
          }}>
            <span style={{
              fontFamily: F, fontSize: 'clamp(8px,1.2vw,10px)', fontWeight: 700,
              color: msg.ok ? '#4ade80' : '#f87171', letterSpacing: '0.06em',
            }}>{msg.text}</span>
          </div>
        )}

        {isLv1 ? (
          <div style={{
            width: '100%', height: 'clamp(30px,4.5vh,40px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px solid rgba(255,255,255,0.08)',
            borderRadius: 9,
          }}>
            <span style={{ fontFamily: F, fontSize: 'clamp(9px,1.4vw,12px)', fontWeight: 700,
              color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em' }}>
              ALREADY LEVEL 1
            </span>
          </div>
        ) : !confirm ? (
          <button
            onClick={() => { playBtnSound(); setConfirm(true); }}
            disabled={!canAfford}
            style={{
              width: '100%', height: 'clamp(30px,4.5vh,40px)',
              background: canAfford
                ? 'linear-gradient(90deg, rgba(239,68,68,0.7), rgba(239,68,68,0.4))'
                : 'rgba(255,255,255,0.07)',
              border: `1.5px solid ${canAfford ? 'rgba(239,68,68,0.65)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 9, cursor: canAfford ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: canAfford ? 1 : 0.45, transition: 'all 0.16s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 22 22" fill="none">
              <path d="M11 3L2 19h18L11 3z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
              <line x1="11" y1="10" x2="11" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="11" cy="17" r="1" fill="white"/>
            </svg>
            <span style={{ fontFamily: F, fontSize: 'clamp(10px,1.5vw,12px)', fontWeight: 900,
              color: '#fff', letterSpacing: '0.14em', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
              RESET LEVEL
            </span>
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { playBtnSound(); setConfirm(false); }}
              style={{
                flex: 1, height: 'clamp(30px,4.5vh,40px)',
                background: 'rgba(255,255,255,0.07)',
                border: '1.5px solid rgba(255,255,255,0.18)',
                borderRadius: 9, cursor: 'pointer',
                fontFamily: F, fontSize: 'clamp(9px,1.4vw,11px)',
                fontWeight: 700, color: 'rgba(255,255,255,0.6)',
                letterSpacing: '0.1em',
              }}
            >CANCEL</button>
            <button
              onClick={() => { playBtnSound(); handleReset(); }}
              disabled={loading}
              style={{
                flex: 2, height: 'clamp(30px,4.5vh,40px)',
                background: 'linear-gradient(90deg,rgba(239,68,68,0.85),rgba(239,68,68,0.6))',
                border: '1.5px solid rgba(239,68,68,0.7)',
                borderRadius: 9, cursor: 'pointer',
                fontFamily: F, fontSize: 'clamp(10px,1.5vw,12px)',
                fontWeight: 900, color: '#fff', letterSpacing: '0.14em',
                textShadow: '0 1px 6px rgba(0,0,0,0.8)',
              }}
            >
              {loading ? 'PROCESSING…' : '✓ CONFIRM RESET'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}