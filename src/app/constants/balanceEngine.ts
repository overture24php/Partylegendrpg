/**
 * balanceEngine.ts — AUTHORITATIVE stats & cost engine for the RPG game.
 *
 * FORMULA FLOW (mandatory order, never deviate):
 *   1. BaseStats  = NEUTRAL_C × RARITY_BASE_MULT[rarity] × ROLE_MULT[role]
 *   2. LevelStats = BaseStats × (1 + level × GROWTH_RATE[rarity])
 *                 = base_stat + level × growth_stat   (where growth_stat = base_stat × GROWTH_RATE)
 *   3. FinalStats = LevelStats × StarBonus(rarity, currentStars)
 *
 * StarBonus = 1 + (currentStars − STAR_MIN[rarity]) × STAR_BOOST_PER_EXTRA[rarity]
 *   — Percentage gain per extra star is FLAT: always the same % regardless of level.
 *   — Stars bawaan (starting stars) do NOT count toward the bonus.
 *
 * Per-hero personality (HERO_VARIANTS) applies a small multiplier to individual
 * stat columns BEFORE growth is computed, so personality is baked into base_stat
 * and growth_stat consistently.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ DB SYNC RULE:                                                          │
 * │ hero_definitions.base_X  = computeHeroBaseStats(heroId, role, rarity) │
 * │ hero_definitions.growth_X = base_X × GROWTH_RATE[rarity]  (rounded)  
 * │ Any new hero MUST be added to HERO_VARIANTS (or use {} for defaults). │
 * └────────────────────────────────────────────────────────────────────────┘
 */

// ─── Stat block types ─────────────────────────────────────────────────────────
export interface StatBlock {
  hp: number; pAtk: number; mAtk: number;
  pDef: number; mDef: number; speed: number;
}

export interface DBStatBlock extends StatBlock {
  growth_hp: number; growth_pAtk: number; growth_mAtk: number;
  growth_pDef: number; growth_mDef: number;
}

// ─── Universal Level-1 neutral baseline (C rarity, no role applied) ───────────
export const NEUTRAL_C_BASE: StatBlock = {
  hp: 800, pAtk: 100, mAtk: 100, pDef: 80, mDef: 80, speed: 80,
};

// ─── Rarity base multipliers (applied to NEUTRAL_C_BASE) ─────────────────────
// C=1.00 → SS=4.50. Higher rarity = much stronger base stats at the same level.
export const RARITY_BASE_MULT: Record<string, number> = {
  common:    1.00,
  rare:      1.45,
  epic:      2.10,
  legendary: 3.05,
  mythic:    4.50,
};

// ─── Role multipliers (applied per-stat to the rarity-scaled baseline) ────────
// Per user spec: these shape HOW each role distributes its power budget.
export interface RoleMult { hp: number; pAtk: number; mAtk: number; pDef: number; mDef: number; speed: number; }
export const ROLE_MULT: Record<string, RoleMult> = {
  Tank:     { hp: 1.70, pAtk: 0.50, mAtk: 0.50, pDef: 1.70, mDef: 1.70, speed: 0.70 },
  Fighter:  { hp: 1.50, pAtk: 1.20, mAtk: 1.20, pDef: 1.50, mDef: 1.50, speed: 0.80 },
  Assassin: { hp: 1.20, pAtk: 1.50, mAtk: 1.50, pDef: 1.20, mDef: 1.20, speed: 2.00 },
  Ranged:   { hp: 0.80, pAtk: 1.70, mAtk: 1.70, pDef: 0.80, mDef: 0.80, speed: 1.70 },
  Mage:     { hp: 1.00, pAtk: 1.00, mAtk: 2.00, pDef: 1.00, mDef: 1.00, speed: 1.20 },
  Support:  { hp: 1.30, pAtk: 0.90, mAtk: 0.90, pDef: 1.30, mDef: 1.30, speed: 1.20 },
};

// HeroType aliases → canonical role key
export const HERO_TYPE_TO_STAT_ROLE: Record<string, string> = {
  Tank: 'Tank', Guardian: 'Tank', Paladin: 'Tank',
  Fighter: 'Fighter', Warrior: 'Fighter', Warlord: 'Fighter', Berserker: 'Fighter', 'Demon Lord': 'Fighter',
  Assassin: 'Assassin', Rogue: 'Assassin',
  Ranged: 'Ranged', Archer: 'Ranged', Ranger: 'Ranged',
  Mage: 'Mage', Sorceress: 'Mage', Celestial: 'Mage',
  Support: 'Support', Healer: 'Support', Bard: 'Support',
};

// ─── Growth rate per level (fraction of base_stat added per level) ────────────
// C cheapest/slowest → SS most expensive/fastest per-level gain.
// Tuned so that lv61 C hero has ~3.3× stat advantage vs lv9 C hero,
// ensuring high-level heroes meaningfully overpower low-level enemies.
export const GROWTH_RATE: Record<string, number> = {
  common:    0.07,   // +7.0% of base per level  (was 1.8% — too flat)
  rare:      0.09,   // +9.0%
  epic:      0.12,   // +12%
  legendary: 0.16,   // +16%
  mythic:    0.22,   // +22%
};

// ─── Star system ──────────────────────────────────────────────────────────────
// Starting stars by rarity — NOT counted toward bonus. Only EXTRA stars matter.
export const STAR_MIN: Record<string, number> = {
  common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5,
};
export const STAR_MAX = 16;

// % bonus per EXTRA star (beyond starting stars). Flat and multiplicative.
// C example: 4 extra stars → +4×20% = +80% → StarBonus = 1.80
export const STAR_BOOST_PER_EXTRA: Record<string, number> = {
  common:    0.20,   // +20% per extra star
  rare:      0.25,   // +25%
  epic:      0.30,   // +30%
  legendary: 0.35,   // +35%
  mythic:    0.40,   // +40%
};

// ─── Individual hero personality variants ────────────────────────────────────
// Applied as MULTIPLIERS to individual stats BEFORE growth is computed.
// Values must stay within ±15% of 1.0 to preserve rarity/role balance.
// Empty entry ({}) = use clean engine defaults.
export const HERO_VARIANTS: Record<string, Partial<Record<keyof StatBlock, number>>> = {
  // Lucas — physical Fighter: higher P.ATK, lower M.ATK
  lucas:      { pAtk: 1.15, mAtk: 0.70 },
  // Emma — healer Support: higher M.ATK and M.DEF, lower P.ATK
  emma:       { pAtk: 0.70, mAtk: 1.20, mDef: 1.10 },
  // Rock Slime — standard Tank (no variant needed)
  rock_slime: {},
  // Acid Slime — corrosive Ranged: more M.ATK (acid), slightly less P.ATK, slower (slime)
  acid_slime: { pAtk: 0.90, mAtk: 1.10, speed: 0.88 },
  // Water Slime — balanced Support (no variant)
  water_slime: {},
  // Gorr — stocky Fighter: more HP and P.ATK, less speed (heavy body)
  gorr:       { hp: 1.05, pAtk: 1.05, speed: 0.90 },
  // Craw — nimble Ranged archer: more P.ATK and speed, less M.ATK and HP (lean build)
  craw:       { hp: 0.92, pAtk: 1.10, mAtk: 0.90, speed: 1.12 },
  // Myko — shield Tank mushroom: high P.DEF, low P.ATK and speed (heavy shell)
  myko:       { pAtk: 0.85, pDef: 1.15, speed: 0.90 },
  // Fang — nimble Assassin: high P.ATK, less HP (glass cannon)
  fang:       { hp: 0.85, pAtk: 1.08, speed: 1.15 },
  // Clover — Support healer: extra M.ATK for heals, less P.ATK
  clover:     { pAtk: 0.75, mAtk: 1.10, mDef: 1.05 },
  // Bolo — fat brawler Fighter: extra HP + P.DEF (built to be hit), harder punches, slower
  bolo:       { hp: 1.10, pAtk: 1.08, mAtk: 0.75, pDef: 1.08, speed: 0.85 },
  // Quill — hedgehog Assassin: tougher spine armor (P.DEF+), harder spines (P.ATK+),
  //         less M.ATK (pure physical), slightly less HP and speed than baseline Assassin
  quill:      { hp: 0.90, pAtk: 1.10, mAtk: 0.80, pDef: 1.10, speed: 1.08 },
  // Brennan — burly blonde Guardian: extreme HP + P.DEF (wooden shield wall),
  //           negligible P.ATK and M.ATK (not an attacker at all), very slow
  brennan:    { hp: 1.10, pAtk: 0.60, mAtk: 0.50, pDef: 1.15, speed: 0.80 },
  // Sylvie — acrobatic Ranged crossbow: glass cannon, precision shooter.
  //          High P.ATK (crossbow expertise), lower HP (lightly armored), lower M.ATK (pure physical).
  //          Natural speed from Ranged role already high — no speed variant (passive handles that).
  sylvie:     { hp: 0.88, pAtk: 1.12, mAtk: 0.80 },

  // ── B Rare — new heroes ───────────────────────────────────────────────────
  // Vrak — stocky dwarf berserker Fighter: high P.ATK (dual axes), slightly lower HP (compact build),
  //        low M.ATK (purely physical), a bit faster than typical fighter (berserker aggression)
  vrak:   { hp: 0.92, pAtk: 1.12, mAtk: 0.78, speed: 1.05 },
  // Crael — turtle-folk Tank: extreme HP + P.DEF (shell), negligible P.ATK and M.ATK,
  //         very slow (shell weight) — the most defensive unit at B rarity
  crael:  { hp: 1.15, pAtk: 0.75, mAtk: 0.55, pDef: 1.20, speed: 0.75 },
  // Lyss — dark fairy Support: fragile body (low HP), high M.ATK for heals/debuffs,
  //         extra M.DEF (fairy magic resistance), faster than typical support
  lyss:   { hp: 0.82, pAtk: 0.65, mAtk: 1.18, mDef: 1.08, speed: 1.10 },
  // Szara — naga Ranged: high M.ATK (venom magic), lower P.ATK, moderate speed,
  //         slightly less HP (unarmored upper body)
  szara:  { hp: 0.88, pAtk: 0.82, mAtk: 1.18, speed: 1.05 },
  // Vex — dark elf Mage: maximum M.ATK (arcane mastery), very fragile HP,
  //        low P.ATK (glass cannon spellcaster), slightly faster than baseline mage
  vex:    { hp: 0.80, pAtk: 0.65, mAtk: 1.20, speed: 1.08 },
  // Naris — phantasm Mage: extreme M.ATK (otherworldly power), lowest HP in tier
  //          (intangible form = fragile), low P.ATK, low M.DEF paradoxically (unstable form),
  //          fastest mage (ghost can phase through terrain)
  naris:  { hp: 0.78, pAtk: 0.60, mAtk: 1.22, mDef: 0.90, speed: 1.12 },
  // Arix — arachne Assassin: high P.ATK (spider fang), lower HP (agile not armored),
  //         fast (spider reflexes), low M.ATK (pure physical predator)
  arix:   { hp: 0.88, pAtk: 1.10, mAtk: 0.75, speed: 1.12 },
  // Zyl — chameleon Assassin: highest P.ATK of B assassins (precision strike),
  //        lowest HP (no armor, pure speed), fastest in tier (chameleon burst dash)
  zyl:    { hp: 0.82, pAtk: 1.15, mAtk: 0.75, speed: 1.18 },
};

// ─── Level-up cost ────────────────────────────────────────────────────────────
// goldToLevel(rarity, currentLevel) = base + currentLevel × scale
// C cheapest for early-game power spikes; SS extremely expensive for late-game.
export const LEVELUP_GOLD_COST: Record<string, { base: number; scale: number }> = {
  common:    { base: 80,   scale: 8   },  // L1→2: 88g  | L100→101: 880g
  rare:      { base: 220,  scale: 25  },  // L1→2: 245g | L100→101: 2,720g
  epic:      { base: 600,  scale: 75  },  // L1→2: 675g | L100→101: 8,100g
  legendary: { base: 1600, scale: 215 },  // L1→2: 1,815g | L100→101: 23,100g
  mythic:    { base: 4500, scale: 620 },  // L1→2: 5,120g | L100→101: 66,500g
};

export const LEVELUP_EXP_COST: Record<string, { base: number; scale: number }> = {
  common:    { base: 40,   scale: 4   },
  rare:      { base: 110,  scale: 14  },
  epic:      { base: 300,  scale: 40  },
  legendary: { base: 820,  scale: 115 },
  mythic:    { base: 2300, scale: 330 },
};

// ─── Star-up gold cost (per tier, 0=yellow 1=red 2=white 3=rainbow) ──────────
// Shard cost stays as-is. Only gold is rarity-scaled.
export const STARUP_GOLD: Record<string, number[]> = {
  common:    [  500,   1_000,   2_000,    4_000],
  rare:      [2_000,   4_000,   8_000,   16_000],
  epic:      [5_000,  10_000,  20_000,   40_000],
  legendary: [15_000, 30_000,  60_000,  120_000],
  mythic:    [50_000, 100_000, 200_000,  400_000],
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPUTATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * computeBaseStats
 * Returns the Level-1 (no-star-bonus) base stat + per-level growth for a hero.
 * This is exactly what should be stored in hero_definitions.base_X / growth_X.
 *
 * Formula: base = NEUTRAL_C × RARITY_MULT × ROLE_MULT × PERSONALITY
 *          growth = round(base × GROWTH_RATE)  [minimum 1, except speed = 0]
 */
export function computeBaseStats(heroId: string, role: string, rarity: string): DBStatBlock {
  const rm   = RARITY_BASE_MULT[rarity]  ?? 1.00;
  const gr   = GROWTH_RATE[rarity]       ?? 0.018;
  const rolM = ROLE_MULT[role]           ?? ROLE_MULT.Fighter;
  const pers = HERO_VARIANTS[heroId]     ?? {};

  const pv = (key: keyof StatBlock) =>
    pers[key] !== undefined ? (pers[key] as number) : 1.0;

  const base = (neutralKey: keyof StatBlock, roleKey: keyof RoleMult) =>
    Math.round(NEUTRAL_C_BASE[neutralKey] * rm * rolM[roleKey] * pv(neutralKey));

  const hp    = base('hp',    'hp');
  const pAtk  = base('pAtk',  'pAtk');
  const mAtk  = base('mAtk',  'mAtk');
  const pDef  = base('pDef',  'pDef');
  const mDef  = base('mDef',  'mDef');
  const speed = base('speed', 'speed');

  return {
    hp, pAtk, mAtk, pDef, mDef, speed,
    growth_hp:    Math.max(1, Math.round(hp    * gr)),
    growth_pAtk:  Math.max(1, Math.round(pAtk  * gr)),
    growth_mAtk:  Math.max(1, Math.round(mAtk  * gr)),
    growth_pDef:  Math.max(1, Math.round(pDef  * gr)),
    growth_mDef:  Math.max(1, Math.round(mDef  * gr)),
    // Speed does NOT scale with level — stable ATB reference
  };
}

/**
 * computeStarBonus
 * Returns the star multiplier for a hero at the given star count.
 * Stars beyond STAR_MIN[rarity] each add STAR_BOOST_PER_EXTRA[rarity].
 * Starting stars (bawaan) never contribute to the bonus.
 *
 * Example: C (starting=1) at 5 stars → extra=4 → bonus = 1 + 4×0.20 = 1.80
 */
export function computeStarBonus(rarity: string, currentStars: number): number {
  const minStar  = STAR_MIN[rarity]             ?? 1;
  const boostPer = STAR_BOOST_PER_EXTRA[rarity] ?? 0.20;
  const extra    = Math.max(0, currentStars - minStar);
  return 1 + extra * boostPer;
}

// Backward-compat alias (old name used across the codebase)
export const computeStarMultiplier = computeStarBonus;

/**
 * computeFinalStats
 * Full formula: (base + level × growth) × StarBonus
 * Use this for display in HeroDetailView — pass hero_definitions fields directly.
 */
export function computeFinalStats(
  def: { base_hp: number; base_p_atk: number; base_m_atk: number;
         base_p_def: number; base_m_def: number; base_speed: number;
         growth_hp: number; growth_p_atk: number; growth_m_atk: number;
         growth_p_def: number; growth_m_def: number;
         rarity: string; },
  level: number,
  stars: number,
): StatBlock {
  const sb = computeStarBonus(def.rarity, stars);
  return {
    hp:    Math.round((def.base_hp    + level * def.growth_hp)    * sb),
    pAtk:  Math.round((def.base_p_atk + level * def.growth_p_atk) * sb),
    mAtk:  Math.round((def.base_m_atk + level * def.growth_m_atk) * sb),
    pDef:  Math.round((def.base_p_def + level * def.growth_p_def) * sb),
    mDef:  Math.round((def.base_m_def + level * def.growth_m_def) * sb),
    speed: Math.round(def.base_speed * sb),
  };
}

/**
 * computeEngineStats
 * Compute stats purely from role + rarity + heroId + level (no DB required).
 * Used by HeroPreviewView for gallery reference stats.
 */
export function computeEngineStats(heroId: string, role: string, rarity: string, level: number): StatBlock {
  const db  = computeBaseStats(heroId, role, rarity);
  const gr  = GROWTH_RATE[rarity] ?? 0.018;
  return {
    hp:    Math.round(db.hp    * (1 + level * gr)),
    pAtk:  Math.round(db.pAtk  * (1 + level * gr)),
    mAtk:  Math.round(db.mAtk  * (1 + level * gr)),
    pDef:  Math.round(db.pDef  * (1 + level * gr)),
    mDef:  Math.round(db.mDef  * (1 + level * gr)),
    speed: db.speed,
  };
}

/**
 * computeLevelUpCost — client-side mirror of SQL rpc_level_up_hero.
 * MUST stay in sync with the SQL function.
 */
export function computeLevelUpCost(rarity: string, currentLevel: number): { gold: number; exp: number } {
  const g = LEVELUP_GOLD_COST[rarity] ?? LEVELUP_GOLD_COST.common;
  const e = LEVELUP_EXP_COST[rarity]  ?? LEVELUP_EXP_COST.common;
  return {
    gold: Math.ceil(g.base + currentLevel * g.scale),
    exp:  Math.ceil(e.base + currentLevel * e.scale),
  };
}

/**
 * computePower — power score for a hero at given final stats.
 * HP carries lower weight; ATK/DEF/SPD are equal contributors.
 */
export function computePower(s: StatBlock): number {
  return Math.round(
    (s.hp / 10) + (s.pAtk * 3) + (s.mAtk * 2) +
    (s.pDef * 2) + (s.mDef * 2) + (s.speed * 2),
  );
}

// ─── Convenience: all DB-ready rows for shipped heroes ───────────────────────
// Used by SQL patch generator and setup scripts.
export const SHIPPED_HERO_DB_STATS: Record<string, { role: string; rarity: string }> = {
  lucas:      { role: 'Fighter', rarity: 'rare'   },
  emma:       { role: 'Support', rarity: 'rare'   },
  rock_slime: { role: 'Tank',    rarity: 'common' },
  acid_slime: { role: 'Ranged',  rarity: 'common' },
  water_slime:{ role: 'Support', rarity: 'common' },
  gorr:       { role: 'Fighter', rarity: 'common' },
  craw:       { role: 'Ranged',  rarity: 'common' },
  myko:       { role: 'Tank',    rarity: 'common' },
  fang:       { role: 'Assassin',rarity: 'common' },
  clover:     { role: 'Support', rarity: 'common' },
  bolo:       { role: 'Fighter', rarity: 'common' },
  quill:      { role: 'Assassin', rarity: 'common' },
  brennan:    { role: 'Tank',    rarity: 'rare'   },
  sylvie:     { role: 'Ranged',  rarity: 'rare'   },
};