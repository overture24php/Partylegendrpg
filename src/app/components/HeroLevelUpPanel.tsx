/**
 * HeroLevelUpPanel — bottom-center overlay in HeroDetailView.
 * Always +1 per tap (no slot selector). Horizontal cost row.
 * Cost mirror of SQL rpc_level_up_hero — MUST stay in sync.
 */

import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useHero } from '../context/HeroContext';
import { playBtnSound } from '../utils/buttonSound';
import { computeLevelUpCost } from '../constants/balanceEngine';

const F  = "'Roboto Condensed', sans-serif";
const FP = "'Playfair Display', serif";
const MAX_LEVEL = 240;
const RARITY_LABEL: Record<string, string> = {
  common: 'C', rare: 'B', epic: 'A', legendary: 'S', mythic: 'SS',
};

// ── Breakthrough stone cost (unchanged — only at milestone levels ×20) ───────
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

// Stone rarity scale (unchanged)
const STONE_RARITY_MULT: Record<string, number> = {
  common: 1.0, rare: 1.5, epic: 2.0, legendary: 3.0, mythic: 5.0,
};

function calcCost1(rarity: string, currentLevel: number) {
  if (currentLevel >= MAX_LEVEL) return { exp: 0, gold: 0, stones: 0, actualLevels: 0 };
  const { gold, exp } = computeLevelUpCost(rarity, currentLevel);
  const sm     = STONE_RARITY_MULT[rarity] ?? 1.0;
  const stones = Math.ceil(getStoneCostBase(currentLevel + 1) * sm);
  return { exp, gold, stones, actualLevels: 1 };
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

export function HeroLevelUpPanel({ heroId, rarity, currentLevel, rarityColor, onClose }: Props) {
  const { user }        = useAuth();
  const { levelUpHero } = useHero();

  const [loading, setLoading] = useState(false);

  const availExp    = user?.hero_exp            ?? 0;
  const availGold   = user?.gold                ?? 0;
  const availStones = user?.breakthrough_stones ?? 0;

  const isMaxLevel = currentLevel >= MAX_LEVEL;
  const rarityLbl  = RARITY_LABEL[rarity] ?? 'C';

  // Always +1
  const cost = useMemo(
    () => calcCost1(rarity, currentLevel),
    [rarity, currentLevel],
  );

  const canAfford  = cost.exp <= availExp && cost.gold <= availGold && cost.stones <= availStones;
  const hasLevels  = cost.actualLevels > 0;
  const btnActive  = !loading && canAfford && hasLevels;

  const handleLevelUp = async () => {
    if (!btnActive) return;
    playBtnSound();
    setLoading(true);
    await levelUpHero(heroId, 1);
    setLoading(false);
  };

  if (isMaxLevel) {
    return (
      <div style={{
        position: 'absolute', left: '18%', right: '18%', bottom: '5%',
        background: 'rgba(0,0,0,0.72)',
        border: `1.5px solid ${rarityColor}55`,
        borderRadius: 12, padding: '12px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(16px)', zIndex: 30,
      }}>
        <span style={{
          fontFamily: FP, fontSize: 'clamp(12px,2vw,16px)', fontWeight: 800,
          color: '#F97316', letterSpacing: '0.15em', textTransform: 'uppercase',
          textShadow: '0 0 18px rgba(249,115,22,0.7)',
        }}>
          ✦ MAX LEVEL REACHED ✦
        </span>
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', left: '18%', right: '18%', bottom: '3%',
      maxHeight: 'clamp(130px,24vh,215px)',
      background: 'rgba(0,0,0,0.86)',
      border: `1.5px solid ${rarityColor}55`,
      borderRadius: 13,
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      zIndex: 30,
      overflow: 'hidden',
      boxShadow: `0 0 38px ${rarityColor}18, 0 8px 28px rgba(0,0,0,0.9)`,
    }}>
      {/* ── Close button ───────────────────────────────────────────────────── */}
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
      {/* ── Rarity stripe ──────────────────────────────────────────────────── */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${rarityColor}, ${rarityColor}44, transparent)`,
      }}/>

      <div style={{ padding: '8px 13px 11px' }}>

        {/* ── Row 1: Title + Level display ──────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 7,
        }}>
          <span style={{
            fontFamily: FP, fontSize: 'clamp(8px,1.3vw,11px)', fontWeight: 700,
            color: rarityColor, letterSpacing: '0.15em', textTransform: 'uppercase',
          }}>
            Level UP [{rarityLbl}]
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.05)', borderRadius: 7,
            padding: '2px 9px',
            border: '1px solid rgba(255,255,255,0.10)',
          }}>
            <span style={{ fontFamily: FP, fontSize: 'clamp(8px,1.5vw,13px)', color: '#FFD700', fontWeight: 800 }}>
              Lv. {currentLevel}
            </span>
            {hasLevels && (
              <>
                <svg width="12" height="9" viewBox="0 0 14 10" fill="none">
                  <path d="M1 5h12M8 1l5 4-5 4" stroke="#F97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontFamily: FP, fontSize: 'clamp(8px,1.5vw,13px)', color: '#4ade80', fontWeight: 800 }}>
                  Lv. {currentLevel + 1}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Row 2: Cost — full horizontal ─────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 7, alignItems: 'center',
        }}>
          {/* Hero EXP group */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: availExp < cost.exp ? 'rgba(239,68,68,0.08)' : 'rgba(134,239,172,0.06)',
            border: `1px solid ${availExp < cost.exp ? 'rgba(239,68,68,0.45)' : 'rgba(134,239,172,0.2)'}`,
            borderRadius: 8, padding: '5px 6px',
          }}>
            {/* Bigger icon */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="8" stroke="#86efac" strokeWidth="1.5" strokeOpacity="0.8"/>
              <path d="M11 6v5l3 2" stroke="#86efac" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="11" cy="11" r="2" fill="#4ade80"/>
            </svg>
            {/* Cost / owned — horizontal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
              <span style={{
                fontFamily: F, fontSize: 'clamp(8px,1.3vw,11px)', fontWeight: 800,
                color: availExp < cost.exp ? '#f87171' : '#FFD700',
              }}>{fmtNum(cost.exp)}</span>
              <span style={{ fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)', color: 'rgba(255,255,255,0.3)' }}>/</span>
              <span style={{
                fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)',
                color: availExp < cost.exp ? 'rgba(239,68,68,0.7)' : 'rgba(74,222,128,0.8)',
              }}>{fmtNum(availExp)}</span>
            </div>
          </div>

          {/* Gold group */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: availGold < cost.gold ? 'rgba(239,68,68,0.08)' : 'rgba(252,211,77,0.06)',
            border: `1px solid ${availGold < cost.gold ? 'rgba(239,68,68,0.45)' : 'rgba(252,211,77,0.2)'}`,
            borderRadius: 8, padding: '5px 6px',
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="8" fill="#FCD34D" fillOpacity="0.22" stroke="#FCD34D" strokeWidth="1.5"/>
              <text x="11" y="15" textAnchor="middle" fontFamily="serif" fontSize="10" fontWeight="900" fill="#FCD34D">G</text>
            </svg>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
              <span style={{
                fontFamily: F, fontSize: 'clamp(8px,1.3vw,11px)', fontWeight: 800,
                color: availGold < cost.gold ? '#f87171' : '#FFD700',
              }}>{fmtNum(cost.gold)}</span>
              <span style={{ fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)', color: 'rgba(255,255,255,0.3)' }}>/</span>
              <span style={{
                fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)',
                color: availGold < cost.gold ? 'rgba(239,68,68,0.7)' : 'rgba(74,222,128,0.8)',
              }}>{fmtNum(availGold)}</span>
            </div>
          </div>

          {/* Breakthrough Stone — only when milestone hit */}
          {cost.stones > 0 && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: availStones < cost.stones ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.08)',
              border: `1px solid ${availStones < cost.stones ? 'rgba(239,68,68,0.45)' : 'rgba(249,115,22,0.35)'}`,
              borderRadius: 8, padding: '5px 6px',
            }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <polygon points="11,2 20,8 17,18 5,18 2,8"
                  fill={`${rarityColor}33`} stroke={rarityColor} strokeWidth="1.5"/>
                <polygon points="11,6 16,9.5 14.5,15 7.5,15 6,9.5"
                  fill={rarityColor} fillOpacity="0.55"/>
                <circle cx="11" cy="11" r="2" fill="white" fillOpacity="0.7"/>
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                <span style={{
                  fontFamily: F, fontSize: 'clamp(8px,1.3vw,11px)', fontWeight: 800,
                  color: availStones < cost.stones ? '#f87171' : '#F97316',
                }}>{fmtNum(cost.stones)}</span>
                <span style={{ fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)', color: 'rgba(255,255,255,0.3)' }}>/</span>
                <span style={{
                  fontFamily: F, fontSize: 'clamp(6px,0.9vw,8px)',
                  color: availStones < cost.stones ? 'rgba(239,68,68,0.7)' : 'rgba(74,222,128,0.8)',
                }}>{fmtNum(availStones)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── LEVEL UP button ───────────────────────────────────────────────── */}
        <button
          onClick={handleLevelUp}
          disabled={!btnActive}
          style={{
            width: '100%', height: 'clamp(28px,4vh,40px)',
            background: btnActive
              ? `linear-gradient(90deg, ${rarityColor}cc, ${rarityColor}88)`
              : 'rgba(255,255,255,0.07)',
            border: `1.5px solid ${btnActive ? rarityColor : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 9, cursor: btnActive ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            boxShadow: btnActive ? `0 0 20px ${rarityColor}44` : 'none',
            transition: 'all 0.16s',
            opacity: btnActive ? 1 : 0.45,
          }}
        >
          {loading ? (
            <span style={{ fontFamily: F, fontSize: 'clamp(9px,1.5vw,12px)', fontWeight: 800,
              color: '#fff', letterSpacing: '0.12em' }}>PROCESSING…</span>
          ) : !canAfford && hasLevels ? (
            <span style={{ fontFamily: F, fontSize: 'clamp(9px,1.5vw,12px)', fontWeight: 800,
              color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>RESOURCE KURANG</span>
          ) : !hasLevels ? (
            <span style={{ fontFamily: F, fontSize: 'clamp(9px,1.5vw,12px)', fontWeight: 800,
              color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>SUDAH MAX</span>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 22 22" fill="none">
                <polygon points="11,3 19,17 11,14 3,17" fill="white"/>
              </svg>
              <span style={{ fontFamily: F, fontSize: 'clamp(9px,1.5vw,12px)', fontWeight: 900,
                color: '#fff', letterSpacing: '0.16em',
                textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
                LEVEL UP
              </span>
            </>
          )}
        </button>

      </div>
    </div>
  );
}