/**
 * gameBalance.ts — backward-compat re-export shim.
 * All authoritative values have moved to balanceEngine.ts.
 * Import from balanceEngine.ts for new code.
 */
export {
  HERO_TYPE_TO_STAT_ROLE,
  STAR_MIN,
  STAR_MAX,
  GROWTH_RATE,
  ROLE_MULT,
  RARITY_BASE_MULT as RARITY_MULT,
  computeStarBonus   as computeStarMultiplier,
  computeEngineStats as computeStatAtLevel,
  computeBaseStats,
  computeStarBonus,
  computeFinalStats,
  computeEngineStats,
  computeLevelUpCost,
  computePower,
  type StatBlock,
  type DBStatBlock,
} from './balanceEngine';

// ── BASE_STATS_C shim — HeroPreviewView uses BASE_STATS_C[role] ───────────────
// Engine now derives stats from role+rarity, but the shim keeps old callers happy.
import { NEUTRAL_C_BASE, RARITY_BASE_MULT, ROLE_MULT, type StatBlock } from './balanceEngine';
function roleBase(role: string): StatBlock {
  const rm = RARITY_BASE_MULT['common'];
  const m  = ROLE_MULT[role] ?? ROLE_MULT['Fighter'];
  return {
    hp:    Math.round(NEUTRAL_C_BASE.hp    * rm * m.hp),
    pAtk:  Math.round(NEUTRAL_C_BASE.pAtk  * rm * m.pAtk),
    mAtk:  Math.round(NEUTRAL_C_BASE.mAtk  * rm * m.mAtk),
    pDef:  Math.round(NEUTRAL_C_BASE.pDef  * rm * m.pDef),
    mDef:  Math.round(NEUTRAL_C_BASE.mDef  * rm * m.mDef),
    speed: Math.round(NEUTRAL_C_BASE.speed * rm * m.speed),
  };
}
export const BASE_STATS_C: Record<string, StatBlock> = {
  Tank:     roleBase('Tank'),
  Fighter:  roleBase('Fighter'),
  Warrior:  roleBase('Fighter'),
  Assassin: roleBase('Assassin'),
  Ranged:   roleBase('Ranged'),
  Mage:     roleBase('Mage'),
  Support:  roleBase('Support'),
};

// ── Other constants kept for old callers ─────────────────────────────────────
export const STAR_BOOST = {
  yellow:  { common: 0.20, rare: 0.25, epic: 0.30, legendary: 0.35, mythic: 0.40 },
  red:     { common: 0.20, rare: 0.25, epic: 0.30, legendary: 0.35, mythic: 0.40 },
  white:   { common: 0.20, rare: 0.25, epic: 0.30, legendary: 0.35, mythic: 0.40 },
  rainbow: { common: 0.20, rare: 0.25, epic: 0.30, legendary: 0.35, mythic: 0.40 },
};

// Equip constants stay unchanged
export const EQUIP_BASE: Record<string, Partial<StatBlock>> = {
  Weapon:    { pAtk: 125, mAtk:  50 },
  Staff:     { mAtk: 145, pAtk:  38 },
  Armor:     { hp: 620,   pDef:  82,  mDef:  58 },
  Helmet:    { hp: 420,   mDef:  92 },
  Boots:     { speed: 28, pDef:  48,  mDef:  48 },
  Ring:      { hp: 210,   pAtk:  38,  mAtk:  38 },
  Necklace:  { hp: 320,   pAtk:  55,  mAtk:  55 },
};
export const EQUIP_RARITY_MULT: Record<string, number> = {
  common: 1.00, rare: 1.38, epic: 1.85, legendary: 2.55, mythic: 3.60,
};
export const EQUIP_ENHANCE_PCT_PER_LV = 0.05;
export const EQUIP_ENHANCE_MAX_LV = 20;

export const STAGE_POWER: Record<string, number> = {
  'W1-1':  36000,  'W1-2':  48000,  'W1-3':  60000,  'W1-4':  72000,
  'W1-5':  86000,  'W1-6':  98000,  'W1-7': 112000,  'W1-8': 128000,
  'W1-9': 148000,  'W1-10':190000,
  'W2-1': 210000,  'W2-2': 245000,  'W2-3': 285000,  'W2-4': 330000,
  'W2-5': 385000,  'W2-6': 445000,  'W2-7': 515000,  'W2-8': 595000,
  'W2-9': 690000,  'W2-10':840000,
};
export interface EnemyEntry { name: string; rarity: string; role: string; count: number; }
export interface SkillRatioTier {
  dmgLight: number; dmgHeavy: number; dmgAoe: number;
  healSingle: number; healAoe: number;
  shieldSingle: number; shieldAoe: number;
  buffAtkPct: number; passiveStack: number;
}