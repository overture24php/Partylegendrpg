/**
 * heroDefs.ts — MASTER HERO REGISTRY
 * ════════════════════════════════════════════════════════════════════════════════
 *
 *  SINGLE SOURCE OF TRUTH for EVERY hero property:
 *    • Gallery display  (name, description, ratioLevels, iconUrl)
 *    • Battle engine    (damageRatio, skillType, damageType, targetType, unlockLevel)
 *    • Animation        (moveType, sfxKey, sprite URLs)
 *    • Special mechanics (hitCount, noCooldown, passiveType, executeThreshold …)
 *    • DB stats         (base_hp, base_p_atk … growth_*)
 *
 *  WORKFLOW — adding a new hero:
 *    1. Add one HeroFullDef entry here (copy the template at the bottom)
 *    2. Run generateHeroSql(def) from /utils/supabase/generateHeroSql.ts
 *       to get the SQL patch → paste into Supabase SQL Editor
 *    3. Upload UI assets (skill icons, card art, idle/action sprites) to Cloudinary
 *       and fill in the URLs here.
 *    4. Add sprite_{heroId}_idle and sprite_{heroId}_action default sizes to
 *       spriteConfig.ts → SPRITE_DEFAULTS  (editor won't show correct defaults otherwise)
 *    5. Add hero card + sprite URLs to CHROMA_SINGLE in LoadingPage.tsx for preload.
 *    6. Done. Everything else auto-updates.
 *
 *  ✅ AUTO-DERIVED (do NOT hardcode in these files):
 *     • BattleScreen.tsx  — IDLE_SPRITES, ACTION_BGREMOVE, ACTION_CHROMA,
 *                           ENEMY_IDLE, ENEMY_HUMAN_CHROMA, SKILL_ICONS
 *     • BattlePlayback.tsx — same maps
 *     • SpriteEditor.tsx  — buildItems() list
 *
 *  ⚠️  MANDATORY DB RULE — SLOT 3 (PASSIVE):
 *     EVERY hero MUST have a DB row in hero_skills for skill_slot=3.
 *     Even when the passive is fully hardcoded in rpc_simulate_battle and
 *     is NEVER selected by the skill-selection loop, the DB row is still
 *     required as canonical metadata and for future UI that reads hero_skills.
 *     NEVER write "no DB row needed" or skip slot 3 in any SQL patch.
 *     Rule: slots 0 1 2 3 4 → each = exactly one row in hero_skills.
 *
 *  NEVER manually edit heroGallery.ts, heroMechanics.ts, or the BattleScreen/
 *  BattlePlayback sprite/action maps for hero data — those files derive from this one.
 * ═════���══════════════════════════════════════════════════════════════════════════
 */

// ─── Primitive types ──────────────────────────────────────────────────────────

export type Rarity     = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type MoveType   = 'melee_dash' | 'melee_aoe_center' | 'ranged_place' | 'self_only' | 'passive';
export type SfxKey     = 'lucas' | 'punch' | 'bullet' | 'water' | 'heal' | 'shield' | 'none' | 'craw_arrow';
export type SkillType  = 'damage' | 'heal' | 'buff' | 'passive' | 'hot' | 'heal_aoe';
export type DamageType = 'physical' | 'magical' | 'none';

export interface SkillRatioLevel { label: string; values: string[]; }

// ─── Per-skill definition ─────────────────────────────────────────────────────

export interface HeroSkillDef {
  // ── Gallery display ──────────────────────────────────────────────────────
  name:        string;
  description: string;
  ratioLevels: SkillRatioLevel[];
  iconUrl:     string | null;

  // ── Battle engine → hero_skills DB row ───────────────────────────────────
  /** 0=basic  1=sk1  2=sk2  3=passive  4=ult */
  slot:        0 | 1 | 2 | 3 | 4;
  /** SK1@1  SK2@21  Passive@41  ULT@61 */
  unlockLevel: 1 | 21 | 41 | 61;
  skillType:   SkillType;
  damageType:  DamageType;
  /**
   * Canonical target_type values understood by rpc_simulate_battle:
   *   single | single_random | single_lowest_hp | single_highest_patk
   *   single_back | single_lowest_hp_ally | single_ally_maxhp | single_random_ally
   *   front_aoe | all_enemies | all_allies | two_front_random | two_front_highest_hp
   *   highest_speed | hp_shield_self | twin_slash
   *   passive_kill_stack | passive_ally_hit | passive_init | passive
   */
  targetType:  string;
  /** Lv1 damage/heal ratio.  0.00 for pure passives. */
  damageRatio: number;

  // ── Animation → BattlePlayback ────────────────────────────────────────────
  moveType: MoveType;
  sfxKey:   SfxKey;

  // ── Special mechanics → heroMechanics ────────────────────────────────────
  /** How many consecutive hits on the same target (default 1). */
  hitCount?:         number;
  /** ms stagger between hits (default 220). */
  hitDelay?:         number;
  /** Skill fires every eligible turn — no cooldown flag set. */
  noCooldown?:       boolean;
  /** Execute bonus: multiply by executeMult when target HP% < executeThreshold. */
  executeThreshold?: number;
  executeMult?:      number;
  /** Passive trigger type — drives in-function event hooks. */
  passiveType?:      'on_kill_patk_stack' | 'reactive_ally_hit' | 'reactive_self_hit' | 'low_hp_once';
  /** Max stacks for stack-based passives. */
  maxStacks?:        number;
}

// ─── Hero stats block (maps to hero_definitions DB columns) ──────────────────

export interface HeroStats {
  base_hp:      number;
  base_p_atk:   number;
  base_m_atk:   number;
  base_p_def:   number;
  base_m_def:   number;
  base_speed:   number;
  growth_hp:    number;
  growth_p_atk: number;
  growth_m_atk: number;
  growth_p_def: number;
  growth_m_def: number;
}

// ─── Sprite configuration ─────────────────────────────────────────────────────

export interface HeroSprites {
  /** Hero-team idle URL. For slimes this is also the TEAM_SLIME_IDLE sprite. */
  idleUrl:      string | null;
  /** Action/attack pose URL.  null = no action sprite (rare). */
  actionUrl:    string | null;
  /** How to remove the background from actionUrl. */
  actionMethod: 'chroma' | 'bgremoval' | null;
  /**
   * true  → rendered as a "human hero" in BattlePlayback (uses IDLE_SPRITES lookup,
   *         flip-windup animation, separate action frame).
   * false → rendered as a "slime" (uses TEAM_SLIME_IDLE / bounce animation, no flip).
   */
  isHumanHero: boolean;
  /** Can this hero spawn as an enemy unit in stages? */
  appearsAsEnemy: boolean;
  /**
   * Enemy-side sprite needs client-side chroma key (green screen).
   * Ignored when appearsAsEnemy = false.
   */
  enemyNeedsChroma: boolean;
  /**
   * Enemy-side sprite uses Cloudinary e_background_removal instead of chroma key.
   * Ignored when appearsAsEnemy = false.
   */
  enemyNeedsBgRemoval: boolean;
}

// ─── Full hero definition ─────────────────────────────────────────────────────

export interface HeroFullDef {
  /** snake_case — matches hero_definitions.hero_id in DB */
  heroId:   string;
  /** Display name shown in UI.  PascalCase or Title Case. */
  name:     string;
  rarity:   Rarity;
  /** Role label shown on card: Fighter / Tank / Assassin / Ranged / Support / Mage / … */
  heroType: string;
  /** Card illustration Cloudinary URL.  null = placeholder. */
  ilust:    string | null;
  /** Weight in gacha pool.  0 = not in pool. */
  gachaWeight: number;
  /**
   * true  = hero has full skill data and is deployed in battle.
   * false = placeholder entry only (gallery card, no battle data yet).
   */
  battleReady: boolean;

  /** DB stats — null for placeholder heroes. */
  stats:   HeroStats | null;
  sprites: HeroSprites;

  // ── Hero-level mechanic flags ─────────────────────────────────────────────
  /** Fang-style: check SK2 availability before SK1 in skill selection. */
  sk2BeforeSk1?: boolean;

  /**
   * All skills including basic (slot 0).
   * null for placeholder heroes.
   * Slot order: [0=basic, 1=sk1, 2=sk2, 3=passive, 4=ult]
   */
  skills: HeroSkillDef[] | null;
}

// ─── Utility: derive sprite name (PascalCase, no spaces) ─────────────────────
// "Rock Slime" → "RockSlime"  |  "lucas" → "Lucas"

export function heroSpriteName(def: HeroFullDef): string {
  return def.name.split(/[\s_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// ─── Engine-derived stats helper ────────────────────────────────────���─────────
// MANDATORY for every new hero — prevents hand-coded growth errors.
// Usage: stats: engineStats('heroId', 'Role', 'rarity')
// Values come from balanceEngine.ts HERO_VARIANTS × ROLE_MULT × GROWTH_RATE.
// NEVER hand-code base_* or growth_* — add the hero to HERO_VARIANTS instead.

import { computeBaseStats } from '../constants/balanceEngine';

function engineStats(heroId: string, role: string, rarity: string): HeroStats {
  const d = computeBaseStats(heroId, role, rarity);
  return {
    base_hp:      d.hp,    base_p_atk:   d.pAtk, base_m_atk:   d.mAtk,
    base_p_def:   d.pDef,  base_m_def:   d.mDef, base_speed:   d.speed,
    growth_hp:    d.growth_hp,   growth_p_atk: d.growth_pAtk,
    growth_m_atk: d.growth_mAtk, growth_p_def: d.growth_pDef,
    growth_m_def: d.growth_mDef,
  };
}

// ─── Placeholder helpers ──────────────────────────────────────────────────────

const UNKNOWN_ICON: null = null;
const PLACEHOLDER_SPRITES: HeroSprites = {
  idleUrl: null, actionUrl: null, actionMethod: null,
  isHumanHero: true, appearsAsEnemy: false,
  enemyNeedsChroma: false, enemyNeedsBgRemoval: false,
};

// ════════════════════════════════════════════════════════════════════════════════
//  HERO REGISTRY
//  Order: SS Mythic → S Legendary → A Epic → B Rare → C Common
// ════════════════════════════════════════════════════════════════════════════════

export const HERO_DEFS: HeroFullDef[] = [

  // ── SS Mythic ───────────────────────────────────────────────────────────────
  {
    heroId: 'seraphiel', name: 'Seraphiel', rarity: 'mythic', heroType: 'Celestial',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },
  {
    heroId: 'malphas', name: 'Malphas', rarity: 'mythic', heroType: 'Demon Lord',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },

  // ── S Legendary ─────────────────────────────────────────────────────────────
  {
    heroId: 'theron', name: 'Theron', rarity: 'legendary', heroType: 'Paladin',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },
  {
    heroId: 'valeria', name: 'Valeria', rarity: 'legendary', heroType: 'Sorceress',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },
  {
    heroId: 'kael', name: 'Kael', rarity: 'legendary', heroType: 'Warlord',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },

  // ── A Epic ──────────────────────────────────────────────────────────────────
  {
    heroId: 'zephyr', name: 'Zephyr', rarity: 'epic', heroType: 'Ranger',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },
  {
    heroId: 'lyra', name: 'Lyra', rarity: 'epic', heroType: 'Bard',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },
  {
    heroId: 'dunmore', name: 'Dunmore', rarity: 'epic', heroType: 'Berserker',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },
  {
    heroId: 'riven', name: 'Riven', rarity: 'epic', heroType: 'Rogue',
    ilust: null, gachaWeight: 0, battleReady: false,
    stats: null, sprites: PLACEHOLDER_SPRITES, skills: null,
  },

  // ── B Rare ──────────────────────────────────────────────────────────────────

  // ── Lucas — Fighter (B Rare) ─────────────────────────────────────────────────
  {
    heroId: 'lucas', name: 'Lucas', rarity: 'rare', heroType: 'Fighter',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777386997/LUCAS_tyqcnf.png',
    gachaWeight: 60,
    battleReady: true,
    stats: {
      base_hp: 1740, base_p_atk: 200, base_m_atk: 122,
      base_p_def: 174, base_m_def: 174, base_speed: 93,
      growth_hp: 44, growth_p_atk: 5, growth_m_atk: 3,
      growth_p_def: 4, growth_m_def: 4,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630336/idle_luk_mobysy.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778171314/ChatGPT_Image_May_7_2026_11_12_56_PM_i1q3sx.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: false,
      enemyNeedsChroma: false, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Heavy Strike', description: 'A straight overhead blow.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Iron Cleave',
        description: 'Lucas delivers a powerful straight-line slash to the enemy directly ahead. His raw physical strength cleaves through armor, dealing heavy physical damage to a single target in the front row.',
        ratioLevels: [
          { label: 'Damage', values: ['165% P.ATK', '200% P.ATK', '240% P.ATK', '290% P.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.65,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Armor Rend',
        description: "A calculated strike aimed at shattering the enemy's physical defenses. Reduces the target's P.DEF by a fixed amount before dealing physical damage — highly effective against heavily armored foes.",
        ratioLevels: [
          { label: 'Damage',      values: ['180% P.ATK', '215% P.ATK', '258% P.ATK', '310% P.ATK'] },
          { label: 'P.DEF Shred', values: ['−80', '−100', '−125', '−150'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550848/ChatGPT_Image_Apr_30_2026_07_02_57_PM_kbtfs3.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.80,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: "Warlord's Edge",
        description: "Passive. Each time Lucas takes a turn, he gains a Warlord's Edge stack — permanently increasing his P.ATK by +8% (compounding) for the remainder of battle. Up to 5 stacks.",
        ratioLevels: [
          { label: 'P.ATK / Stack (compounding)', values: ['+8%', '+8%', '+8%', '+8%'] },
          { label: 'Max Stacks',                  values: ['5', '5', '5', '5'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550841/psvluk_b0quhw.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'on_kill_patk_stack', maxStacks: 5,
      },
      {
        name: 'Rampage Surge',
        description: 'Lucas erupts into an unstoppable full-force assault, targeting every enemy on the front row and striking each one 3 consecutive times with crushing physical blows.',
        ratioLevels: [
          { label: 'Dmg / Hit (P.ATK)', values: ['100%', '125%', '155%', '195%'] },
          { label: 'Total (3 hits)',     values: ['300% P.ATK', '375% P.ATK', '465% P.ATK', '585% P.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550833/ultlukas_jcehyx.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 3.00,
        moveType: 'melee_aoe_center', sfxKey: 'lucas',
      },
    ],
  },

  // ── Emma — Support (B Rare) ──────────────────────────────────────────────────
  {
    heroId: 'emma', name: 'Emma', rarity: 'rare', heroType: 'Support',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777387003/emma_aqsnsd.png',
    gachaWeight: 60,
    battleReady: true,
    stats: {
      base_hp: 1508, base_p_atk: 91, base_m_atk: 157,
      base_p_def: 151, base_m_def: 166, base_speed: 139,
      growth_hp: 38, growth_p_atk: 2, growth_m_atk: 4,
      growth_p_def: 4, growth_m_def: 4,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630434/idle_em_p8uxjs.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630357/act_em_fnrl1t.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: false,
      enemyNeedsChroma: false, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Staff Poke', description: 'A quick ranged tap.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 0.75,
        moveType: 'ranged_place', sfxKey: 'bullet',
      },
      {
        name: 'Mending Touch',
        description: "Emma pinpoints the ally with the lowest current HP — herself included — and channels concentrated healing energy into them.",
        ratioLevels: [
          { label: 'Heal (M.ATK)', values: ['170% M.ATK', '210% M.ATK', '260% M.ATK', '320% M.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png',
        slot: 1, unlockLevel: 1, skillType: 'heal', damageType: 'magical',
        targetType: 'single_lowest_hp_ally', damageRatio: 1.70,
        moveType: 'ranged_place', sfxKey: 'heal',
      },
      {
        name: 'Bulwark Veil',
        description: "Emma cloaks the ally with the highest maximum HP in a shimmering magical barrier.",
        ratioLevels: [
          { label: 'Shield (M.ATK)', values: ['140% M.ATK', '175% M.ATK', '215% M.ATK', '265% M.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png',
        slot: 2, unlockLevel: 21, skillType: 'buff', damageType: 'magical',
        targetType: 'single_ally_maxhp', damageRatio: 1.40,
        moveType: 'self_only', sfxKey: 'shield',
      },
      {
        name: 'Blessed Ward',
        description: "Passive. At the start of every battle Emma projects a protective aura across the entire team, wrapping each ally in a magical ward.",
        ratioLevels: [
          { label: 'Shield / Ally (M.ATK)', values: ['90% M.ATK', '115% M.ATK', '145% M.ATK', '185% M.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_init', damageRatio: 0.90,
        moveType: 'passive', sfxKey: 'shield',
      },
      {
        name: 'Sacred Bloom',
        description: "Emma releases a radiant burst of sacred energy that heals ALL alive allies simultaneously.",
        ratioLevels: [
          { label: 'Heal × All Allies (M.ATK)', values: ['120% M.ATK', '150% M.ATK', '188% M.ATK', '235% M.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png',
        slot: 4, unlockLevel: 61, skillType: 'heal_aoe', damageType: 'magical',
        targetType: 'all_allies', damageRatio: 1.20,
        moveType: 'ranged_place', sfxKey: 'heal',
      },
    ],
  },

  // ── Brennan — Guardian (B Rare) ─────────────────────────────────────────────
  // Burly blonde guardian. Simple wooden shield — no magic, no tricks.
  // Identity: "The Wooden Shield Wall" — only Tank who deals damage FROM P.DEF,
  //   shields the weakest ALLY (not self), converts P.DEF→bonus Max HP at init,
  //   and stuns the entire front row with his ULT.
  // Counter to: Assassins (Fang, Quill) — stun + ally-shield blocks their burst.
  // Countered by: M.ATK mages (his shield is wood = physical only).
  // Synergy: Emma (she heals, he shields & stuns), Clover (she HOTs, he walls).
  {
    heroId: 'brennan', name: 'Brennan', rarity: 'rare', heroType: 'Tank',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778243229/ChatGPT_Image_May_8_2026_07_24_30_PM_t5y2zh.png',
    gachaWeight: 60,
    battleReady: true,
    // ↓ Engine-derived — do NOT hand-code. Edit HERO_VARIANTS['brennan'] in balanceEngine.ts.
    // Resolved lv1: base_hp:2169 base_p_atk:44 base_m_atk:36 base_p_def:227 base_m_def:197 base_speed:65
    // Growth (×0.09):  hp:195  p_atk:4  m_atk:3  p_def:20  m_def:18
    stats: engineStats('brennan', 'Tank', 'rare'),
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778243245/ChatGPT_Image_May_8_2026_07_24_39_PM_mhzv50.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778243251/ChatGPT_Image_May_8_2026_07_24_56_PM_s0psbk.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: false,
      enemyNeedsChroma: false, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Shield Bash', description: 'A solid forward slam with the wooden shield.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Timber Charge',
        description: "Brennan lowers his shoulder and drives his wooden shield straight into the front enemy with his full body weight. The blow scales from his P.DEF — the thicker his guard arm, the harder the slam.",
        ratioLevels: [
          { label: 'Damage (P.DEF)', values: ['80%', '98%', '120%', '146%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778252823/sk1ben_anmvl0.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 0.80,
        moveType: 'melee_dash', sfxKey: 'punch',
        // ► SQL: IF v_ahid='brennan' AND v_slot=1 THEN v_batk:=v_actor_pdef; END IF;
      },
      {
        name: 'Wooden Bulwark',
        description: "Brennan rushes to protect whoever is in the most danger — the ally with the lowest current HP. He raises his wooden shield in front of them, granting a HP shield scaled from his own P.DEF. Unlike Myko or Rock Slime who protect only themselves, Brennan protects others.",
        ratioLevels: [
          { label: 'HP Shield (P.DEF)', values: ['55%', '68%', '84%', '104%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778252833/sk2ben_kbih5d.png',
        slot: 2, unlockLevel: 21, skillType: 'buff', damageType: 'none',
        targetType: 'single_lowest_hp_ally', damageRatio: 0.55,
        moveType: 'self_only', sfxKey: 'shield',
        // ► SQL: IF v_ahid='brennan' AND v_slot=2 THEN apply shield = round(v_actor_pdef * v_skratio) to lowest-HP ally
      },
      {
        name: 'Fortified Frame',
        description: "Passive (init). Brennan's unyielding physical conditioning converts his defensive mass into raw resilience. At the start of every battle, a portion of his P.DEF is added directly to his Maximum HP — the more defensive he is built, the more HP he gains.",
        ratioLevels: [
          { label: 'Max HP Bonus (% of own P.DEF)', values: ['+30%', '+38%', '+48%', '+60%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778252839/sk3ben_uul3ub.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_init', damageRatio: 0.30,
        moveType: 'passive', sfxKey: 'none',
        // ► SQL passive_init hook: IF v_hero_id='brennan' AND passive unlocked THEN
        //     v_bonus_hp := ROUND(v_actor_pdef * ratio);
        //     boost max_hp and current hp by v_bonus_hp
      },
      {
        name: 'Bulwark Advance',
        description: "Brennan charges forward and drives his wooden shield through the entire enemy front row in one unstoppable motion. Every enemy struck is Stunned for 1 turn — unable to act while he repositions his team. Damage scales from P.DEF, not P.ATK.",
        ratioLevels: [
          { label: 'Damage Front Row (P.DEF)', values: ['70%',  '86%',  '105%', '128%'] },
          { label: 'Stun Duration',            values: ['1 turn', '1 turn', '1 turn', '1 turn'] },
          { label: 'Stun Chance / Target',     values: ['100%', '100%', '100%', '100%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778252845/sk4ben_x6skcw.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 0.70,
        moveType: 'melee_aoe_center', sfxKey: 'punch',
        // ► SQL: IF v_ahid='brennan' AND v_slot=4 THEN v_batk:=v_actor_pdef; + stun all hit targets 1 turn
      },
    ],
  },
  // ── Sylvie — Archer (B Rare) ─────────────────────────────────────────────────
  // Acrobatic blonde crossbow woman. Glass-cannon sniper with high speed and P.ATK.
  // Identity: "Back-Line Sniper & Tank Buster"
  //   SK1 (Over Cover) hits BACK-ROW enemies — unique positional bypass, no other hero does this consistently.
  //   SK2 (Scatter Volley) scatters 2 bolts randomly across front-row for soft AOE pressure.
  //   Passive (Swift Footing) boosts own Speed at battle start — she gets more turns than anyone at the same level.
  //   ULT (Crossfire Storm) targets the 2 HIGHEST-HP front-row enemies with precise heavy bolts — tank buster.
  // Counter to: Emma (back-row), Clover (back-row), Brennan/Rock Slime/Myko (ULT hunts HP-tanks).
  // Countered by: Bolo (P.ATK stack grows when hit, and Bolo's HP soaks), Myko (shield SK1 reduces burst).
  // Synergy: Lucas (armor rend → Sylvie cleans up), Brennan (Sylvie threatens ranged while Brennan walls front).
  {
    heroId: 'sylvie', name: 'Sylvie', rarity: 'rare', heroType: 'Ranged',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778253528/ChatGPT_Image_May_8_2026_10_17_57_PM_bxj16w.png',
    gachaWeight: 60,
    battleReady: true,
    // ↓ Engine-derived — do NOT hand-code. Edit HERO_VARIANTS['sylvie'] in balanceEngine.ts.
    // Resolved lv1: base_hp:817  base_p_atk:276  base_m_atk:197  base_p_def:93  base_m_def:93  base_speed:197
    // Growth (×0.09):  hp:74  p_atk:25  m_atk:18  p_def:8  m_def:8
    stats: engineStats('sylvie', 'Ranged', 'rare'),
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778253581/ChatGPT_Image_May_8_2026_10_15_54_PM_pk4782.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778253798/ChatGPT_Image_May_8_2026_10_16_05_PM_miwleg.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: false,
      enemyNeedsChroma: false, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Snap Shot', description: 'A quick, instinctive crossbow bolt aimed at the nearest enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'ranged_place', sfxKey: 'craw_arrow',
      },
      {
        name: 'Over Cover',
        description: "Sylvie vaults backwards and fires an arcing bolt that sails clean over the enemy front line, striking a back-row target. No other hero can reach protected back-row positions this reliably — ideal for neutralizing support heroes, healers, and anyone trying to hide behind their tanks.",
        ratioLevels: [
          { label: 'Damage (P.ATK)', values: ['160%', '195%', '238%', '290%'] },
          { label: 'Target',         values: ['Back Row', 'Back Row', 'Back Row', 'Back Row'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778257924/sk1sil_eeynic.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single_back', damageRatio: 1.60,
        moveType: 'ranged_place', sfxKey: 'craw_arrow',
        // ► No SQL changes needed — single_back already handled by rpc_simulate_battle.
      },
      {
        name: 'Scatter Volley',
        description: "Sylvie fires two rapid crossbow bolts in quick succession that scatter unpredictably into the enemy front line. Each bolt strikes a random front-row target independently — they may hit the same enemy for massive concentrated damage, or split between two targets for broader pressure. Reliable front-line harassment that rewards positioning luck.",
        ratioLevels: [
          { label: 'Damage per Bolt (P.ATK)', values: ['105%', '128%', '156%', '192%'] },
          { label: 'Bolts',                   values: ['×2', '×2', '×2', '×2'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778257930/sk2sil_vefcgf.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'two_front_random', damageRatio: 1.05,
        moveType: 'ranged_place', sfxKey: 'craw_arrow',
        // ► No SQL changes needed — two_front_random already handled by rpc_simulate_battle.
      },
      {
        name: 'Swift Footing',
        description: "Passive (init). Sylvie's years of acrobatic training permanently boost her combat footwork before every battle, increasing her base Speed. In the ATB turn system, higher speed means she acts more frequently over the course of a fight — even a modest boost compounds into several extra turns in long battles.",
        ratioLevels: [
          { label: 'Speed Bonus (self)', values: ['+12%', '+15%', '+20%', '+26%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778257936/sk3sil_itblzj.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_init', damageRatio: 0.12,
        moveType: 'passive', sfxKey: 'none',
        // ► SQL passive_init hook — add alongside Rock/Acid/Water Slime pre-battle stat section:
        //   IF (v_u->>'hero_id')='sylvie' THEN
        //     v_units:=jsonb_set(v_units,ARRAY[v_k,'speed'],
        //       to_jsonb(GREATEST(1,round((v_units->v_k->>'speed')::NUMERIC*
        //         (1+CASE v_llv3 WHEN 1 THEN 0.12 WHEN 2 THEN 0.15 WHEN 3 THEN 0.20 ELSE 0.26 END))::INT)));
        //   END IF;
      },
      {
        name: 'Crossfire Storm',
        description: "Sylvie leaps and locks onto the two front-row enemies with the highest maximum HP — the tanks and heavy hitters — and unleashes pinpoint heavy bolts on each. Unlike most AOE ultimates that spread damage thin across many targets, Crossfire Storm concentrates lethal force exactly where the enemy team is most durable. A surgical tank-buster.",
        ratioLevels: [
          { label: 'Damage per Bolt (P.ATK)', values: ['160%', '195%', '238%', '290%'] },
          { label: 'Targets',                 values: ['Top-2 HP Front', 'Top-2 HP Front', 'Top-2 HP Front', 'Top-2 HP Front'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778257944/sk4sil_z96li3.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'two_front_highest_hp', damageRatio: 1.60,
        moveType: 'ranged_place', sfxKey: 'craw_arrow',
        // ► No SQL changes needed — two_front_highest_hp already handled by rpc_simulate_battle.
      },
    ],
  },

  // ── B Rare — new heroes (art placeholder, battleReady: false) ───────────────

  // ── Vrak — Fighter (B Rare) ──────────────────────────────────────────────────
  // LOOK: Short, stocky dwarf woman (~145cm). Fiery crimson braids tied back with iron rings.
  //       Heavy pauldrons on bare muscular arms. Twin hand-axes, one per hand — black iron with
  //       cracked runes glowing faint orange. War-paint slashes across jaw. Leather kilt,
  //       steel-toed boots. Battle-stance is wide and low — she fights like a spinning top.
  // IDENTITY: "Whirlwind of Steel" — dual-axe berserker who builds power as she lands hits.
  //           More she attacks, harder she hits. Punishes clustered enemies with spinning AoE.
  // COUNTER TO: Front-row melee tanks (AoE punishes stacked formations). Slow enemies.
  // COUNTERED BY: High M.ATK casters (her armor is physical only), crowd control (stuns).
  // SYNERGY: Lucas (armor rend exposes targets for Vrak's axes), Crael (wall lets Vrak spin freely).
  {
    heroId: 'vrak', name: 'Vrak', rarity: 'rare', heroType: 'Fighter',
    ilust: null,
    gachaWeight: 60,
    battleReady: false,
    stats: engineStats('vrak', 'Fighter', 'rare'),
    sprites: PLACEHOLDER_SPRITES,
    skills: [
      {
        name: 'Axe Chop', description: 'A sharp downward chop with one hand-axe at the nearest enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Dual Hack',
        description: 'Vrak brings both axes down in rapid succession on a single target — left then right — delivering two heavy blows in one brutal combo.',
        ratioLevels: [
          { label: 'Damage / Hit (P.ATK)', values: ['85%', '104%', '128%', '157%'] },
          { label: 'Hits',                 values: ['×2', '×2', '×2', '×2'] },
          { label: 'Total',                values: ['170% P.ATK', '208% P.ATK', '256% P.ATK', '314% P.ATK'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.70,
        moveType: 'melee_dash', sfxKey: 'lucas',
        hitCount: 2,
        // ► SQL: fire two separate damage applications of ratio/2 each against same target
      },
      {
        name: 'Iron Cyclone',
        description: 'Vrak spins into the centre of the enemy front line, axes whirling outward in a full rotation that catches every front-row enemy in the sweep. The centrifugal force of her compact mass makes this hit harder than her size suggests.',
        ratioLevels: [
          { label: 'Damage Front Row (P.ATK)', values: ['110%', '135%', '165%', '202%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 1.10,
        moveType: 'melee_aoe_center', sfxKey: 'lucas',
      },
      {
        name: 'Bloodlust',
        description: "Passive. Each time Vrak kills an enemy, the rush of victory sharpens her axes and her focus — permanently increasing her P.ATK by a fixed amount for the rest of the battle. Up to 5 stacks.",
        ratioLevels: [
          { label: 'P.ATK Bonus / Kill (flat)', values: ['+48', '+60', '+75', '+93'] },
          { label: 'Max Stacks',                values: ['5', '5', '5', '5'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_kill_stack', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'on_kill_patk_stack', maxStacks: 5,
      },
      {
        name: "Berserker's End",
        description: "Vrak enters a full berserker state, hurling herself into the enemy formation in a non-stop flurry that hits every enemy on the front row three consecutive times. The relentless assault leaves no room to breathe.",
        ratioLevels: [
          { label: 'Damage / Hit (P.ATK)',   values: ['90%',  '112%', '140%', '175%'] },
          { label: 'Total (3 hits, front row)', values: ['270%', '336%', '420%', '525%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 2.70,
        moveType: 'melee_aoe_center', sfxKey: 'lucas',
        hitCount: 3,
      },
    ],
  },

  // ── Crael — Tank (B Rare) ─────────────────────────────────────────────────────
  // LOOK: Bipedal sea-turtle ~2m tall. Dark teal shell on back, polished smooth from age.
  //       Aquamarine scales on forearms and neck. Carries a round spiked shield carved from
  //       an old shell segment. Calm heavy-lidded amber eyes. No visible neck — head sits
  //       directly on shell shoulder. Slow deliberate movement, but immovable when planted.
  // IDENTITY: "The Ironclad Shore" — P.DEF-to-damage conversion, self-shields, retaliatory spikes.
  //           Hits don't hurt him; they make him stronger.
  // COUNTER TO: Pure physical DPS heroes (Vrak, Lucas, Gorr) — their P.ATK reflects back.
  // COUNTERED BY: Magical attackers (Vex, Naris, Water Slime) — shell only blocks physical.
  // SYNERGY: Lyss (she heals through Crael's damage soak), Brennan (double wall frontline).
  {
    heroId: 'crael', name: 'Crael', rarity: 'rare', heroType: 'Tank',
    ilust: null,
    gachaWeight: 60,
    battleReady: false,
    stats: engineStats('crael', 'Tank', 'rare'),
    sprites: PLACEHOLDER_SPRITES,
    skills: [
      {
        name: 'Shell Slam', description: 'Crael drives his spiked shield forward with his full body weight.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Turtle Guard',
        description: "Crael draws his shell tight and raises his shield, granting himself a HP shield scaled from his own P.DEF. The harder he's built, the better he protects himself.",
        ratioLevels: [
          { label: 'HP Shield (P.DEF)', values: ['65%', '80%', '99%', '122%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 1, unlockLevel: 1, skillType: 'buff', damageType: 'none',
        targetType: 'hp_shield_self', damageRatio: 0.65,
        moveType: 'self_only', sfxKey: 'shield',
        // ► SQL: IF v_ahid='crael' AND v_slot=1 THEN v_batk:=v_actor_pdef; grant HP shield to self.
      },
      {
        name: 'Spike Counter',
        description: "Crael swings his spiked shield in a low arc across the entire enemy front line, scraping every enemy with the jagged shell-spikes. Damage scales from P.DEF — his slow, deliberate strength converts defense into offence.",
        ratioLevels: [
          { label: 'Damage Front Row (P.DEF)', values: ['58%', '72%', '89%', '110%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 0.58,
        moveType: 'melee_aoe_center', sfxKey: 'punch',
        // ► SQL: IF v_ahid='crael' AND v_slot=2 THEN v_batk:=v_actor_pdef; apply front_aoe.
      },
      {
        name: 'Ironclad',
        description: "Passive (init). Crael's ancient shell has never been broken. At the start of every battle, the sheer density of his carapace converts a portion of his P.DEF directly into bonus Maximum HP — turning his defensive architecture into raw survivability.",
        ratioLevels: [
          { label: 'Max HP Bonus (% of P.DEF)', values: ['+35%', '+44%', '+55%', '+68%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_init', damageRatio: 0.35,
        moveType: 'passive', sfxKey: 'none',
        // ► SQL passive_init: IF v_hero_id='crael' THEN bonus_hp = ROUND(pdef × ratio); boost max_hp+current_hp.
      },
      {
        name: 'Crushing Tide',
        description: "Crael surges forward like a tidal wall, ploughing through the entire enemy front row in one unstoppable slow-motion charge. His shell becomes a battering ram — every hit scales from P.DEF. Enemies are sent staggering from the sheer mass.",
        ratioLevels: [
          { label: 'Damage Front Row (P.DEF)', values: ['80%', '99%', '122%', '150%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 0.80,
        moveType: 'melee_aoe_center', sfxKey: 'punch',
        // ► SQL: IF v_ahid='crael' AND v_slot=4 THEN v_batk:=v_actor_pdef; apply front_aoe.
      },
    ],
  },

  // ── Lyss — Support (B Rare) ───────────────────────────────────────────────────
  // LOOK: Petite dark fairy, ~150cm. Moth-like wings with deep indigo eyespot patterns.
  //       Short dark teal hair with silver-tipped ends. Wears a torn black dress trimmed
  //       with bioluminescent purple-green fringe. Holds a twisted thorn wand with a
  //       glowing spore at the tip. Pointed ears, large violet eyes. Deceptively fragile.
  // IDENTITY: "Twisted Healer" — her magic blurs the line between dark & curative.
  //           Heals allies, drains and debuffs enemies, passively empowers with siphoned dark energy.
  // COUNTER TO: Aggressive physical attackers (sustained healing outlasts their burst).
  // COUNTERED BY: Fast AoE killers (fragile body; dies before healing can matter).
  // SYNERGY: Crael (heals through his damage soak), Szara (Lyss's M.DEF debuffs amplify venom damage).
  {
    heroId: 'lyss', name: 'Lyss', rarity: 'rare', heroType: 'Support',
    ilust: null,
    gachaWeight: 60,
    battleReady: false,
    stats: engineStats('lyss', 'Support', 'rare'),
    sprites: PLACEHOLDER_SPRITES,
    skills: [
      {
        name: 'Thorn Bolt', description: 'A crackling dark-magic projectile shot from the thorn wand.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 0.75,
        moveType: 'ranged_place', sfxKey: 'bullet',
      },
      {
        name: 'Shadow Mend',
        description: "Lyss channels dark restorative energy into the most wounded ally — herself included — stitching torn flesh with shadow-silk and dark magic. Unconventional, but effective.",
        ratioLevels: [
          { label: 'Heal (M.ATK)', values: ['160%', '198%', '245%', '302%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 1, unlockLevel: 1, skillType: 'heal', damageType: 'magical',
        targetType: 'single_lowest_hp_ally', damageRatio: 1.60,
        moveType: 'ranged_place', sfxKey: 'heal',
      },
      {
        name: 'Dark Veil',
        description: "Lyss wraps the most heavily-armored ally in a shroud of shadow energy that absorbs incoming damage. The curse woven into the veil also leaches a sliver of magical resistance from the highest-ATK enemy.",
        ratioLevels: [
          { label: 'HP Shield (M.ATK)',        values: ['130%', '161%', '198%', '244%'] },
          { label: 'Enemy M.DEF Shred (flat)', values: ['−60',  '−75',  '−93',  '−115'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 2, unlockLevel: 21, skillType: 'buff', damageType: 'none',
        targetType: 'single_ally_maxhp', damageRatio: 1.30,
        moveType: 'self_only', sfxKey: 'shield',
        // ► SQL: shield = round(m_atk×ratio) on ally_maxhp; then apply M.DEF shred to highest_patk enemy.
      },
      {
        name: 'Siphon Aura',
        description: "Passive (init). Before combat begins Lyss releases a pulse of siphoning dark energy across the battlefield, slightly accelerating all allies by leeching ambient energy — giving the team a subtle but permanent speed advantage.",
        ratioLevels: [
          { label: 'Speed Bonus / Ally', values: ['+12', '+15', '+19', '+24'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_init', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        // ► SQL passive_init: FOR each ally, speed += flat bonus (12/15/19/24 by passive_lv).
      },
      {
        name: 'Twilight Bloom',
        description: "Lyss opens her wings fully and releases a massive pulse of dark-healing magic that washes over the entire allied team simultaneously, restoring HP to all living allies at once.",
        ratioLevels: [
          { label: 'Heal × All Allies (M.ATK)', values: ['115%', '143%', '178%', '220%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 4, unlockLevel: 61, skillType: 'heal_aoe', damageType: 'magical',
        targetType: 'all_allies', damageRatio: 1.15,
        moveType: 'ranged_place', sfxKey: 'heal',
      },
    ],
  },

  // ── Szara — Ranged (B Rare) ───────────────────────────────────────────────────
  // LOOK: Naga woman — upper body humanoid, grey-tinted skin, amber vertical-slit eyes,
  //       forked tongue, sharp cheekbones. Lower body is a massive dark-scaled coiled serpent
  //       with crimson diamond patterns. Wears dark scale-mail torso armour. Fires glowing
  //       venom-green projectile orbs from her palm, which crackle with toxic energy.
  //       Hair is silver-white in a loose braid. No legs — rears up from her coiled base.
  // IDENTITY: "Venom Sniper" — sustained magic damage + poison debuffs that erode magical defence.
  //           Unique passive that stacks M.ATK with each action — gets deadlier over time.
  // COUNTER TO: Clustered enemies (AoE venom hits all), high M.DEF tanks (M.DEF shred ignores armour stacking).
  // COUNTERED BY: Fast assassins (she has moderate speed, poor physical defence).
  // SYNERGY: Vex (double M.DEF shred stacks), Lyss (Dark Veil M.DEF shred triples venom damage).
  {
    heroId: 'szara', name: 'Szara', rarity: 'rare', heroType: 'Ranged',
    ilust: null,
    gachaWeight: 60,
    battleReady: false,
    stats: engineStats('szara', 'Ranged', 'rare'),
    sprites: PLACEHOLDER_SPRITES,
    skills: [
      {
        name: 'Venom Spit', description: 'A quick venomous orb spat toward the nearest enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 0.85,
        moveType: 'ranged_place', sfxKey: 'bullet',
      },
      {
        name: 'Toxic Strike',
        description: "Szara launches a concentrated venom orb that detonates on impact, dealing heavy magical damage and corroding the target's magical defences for 2 turns.",
        ratioLevels: [
          { label: 'Damage (M.ATK)',    values: ['175%', '215%', '265%', '326%'] },
          { label: 'M.DEF Shred',       values: ['−70',  '−88',  '−109', '−134'] },
          { label: 'Shred Duration',    values: ['2T', '2T', '2T', '2T'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 1.75,
        moveType: 'ranged_place', sfxKey: 'bullet',
        // ► SQL: damage then apply M.DEF shred debuff to target for 2 turns.
      },
      {
        name: 'Serpent Coil',
        description: "Szara fires an arcing venom shot over the front line, curving to strike a back-row target. The venom seeps into joints and tendons, reducing the target's Speed as well.",
        ratioLevels: [
          { label: 'Damage (M.ATK)',  values: ['155%', '190%', '234%', '288%'] },
          { label: 'Speed Reduction', values: ['−18', '−22', '−28', '−34'] },
          { label: 'Duration',        values: ['2T', '2T', '2T', '2T'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'magical',
        targetType: 'single_back', damageRatio: 1.55,
        moveType: 'ranged_place', sfxKey: 'bullet',
        // ► SQL: single_back target; apply speed debuff after damage.
      },
      {
        name: 'Accumulated Venom',
        description: "Passive. Every time Szara takes a turn — attack or skill — her venomous metabolism intensifies, permanently increasing her M.ATK for the rest of the battle. The longer the fight lasts, the deadlier she becomes. Up to 5 stacks.",
        ratioLevels: [
          { label: 'M.ATK Bonus / Turn (flat)', values: ['+38', '+48', '+60', '+74'] },
          { label: 'Max Stacks',                values: ['5', '5', '5', '5'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'on_turn_matk_stack', maxStacks: 5,
        // ► SQL: on each actor turn for szara, if stacks < 5: stacks++, m_atk += flat bonus.
      },
      {
        name: 'Venom Flood',
        description: "Szara rears up to full height and unleashes a cascading torrent of venom energy in all directions — a wide-area magical explosion that saturates the entire enemy team. Every surviving enemy has their magical resistance corroded for 2 turns.",
        ratioLevels: [
          { label: 'Damage All Enemies (M.ATK)', values: ['135%', '167%', '206%', '254%'] },
          { label: 'M.DEF Shred (all)',           values: ['−55',  '−68',  '−84',  '−104'] },
          { label: 'Shred Duration',              values: ['2T', '2T', '2T', '2T'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'magical',
        targetType: 'all_enemies', damageRatio: 1.35,
        moveType: 'ranged_place', sfxKey: 'water',
        // ► SQL: all_enemies damage; apply M.DEF shred debuff to all hit targets.
      },
    ],
  },

  // ── Vex — Mage (B Rare) ───────────────────────────────────────────────────────
  // LOOK: Tall lean dark elf, ~175cm. Deep violet-black skin that seems to absorb light.
  //       Long white-silver hair with glowing arcane runes etched along the strands.
  //       Wears tattered dark robes with gold rune trim — old and worn but radiating power.
  //       Cracked amethyst staff topped with a fractured arcane lens. Glowing purple eyes.
  //       Always slight smirk — she finds the concept of effort amusing.
  // IDENTITY: "Shadow Arcane Debuffer" — single-target magical annihilation + M.DEF shred.
  //            First true Mage in the roster. Makes the entire magic-damage line deadlier.
  // COUNTER TO: High-M.DEF tanks (Crael, Rock Slime) — M.DEF shred nullifies their magic resistance.
  // COUNTERED BY: Physical assassins (low HP, weak P.DEF), stuns interrupt her cast timing.
  // SYNERGY: Szara (Vex shreds M.DEF, Szara stacks on top), Naris (double magical AoE).
  {
    heroId: 'vex', name: 'Vex', rarity: 'rare', heroType: 'Mage',
    ilust: null,
    gachaWeight: 60,
    battleReady: false,
    stats: engineStats('vex', 'Mage', 'rare'),
    sprites: PLACEHOLDER_SPRITES,
    skills: [
      {
        name: 'Shadow Bolt', description: 'A crackling bolt of shadow energy aimed at the nearest enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 0.90,
        moveType: 'ranged_place', sfxKey: 'bullet',
      },
      {
        name: 'Void Pulse',
        description: "Vex focuses a concentrated beam of void energy at a single target — high-damage magical attack that simultaneously fractures the target's magical armour.",
        ratioLevels: [
          { label: 'Damage (M.ATK)',  values: ['195%', '240%', '296%', '364%'] },
          { label: 'M.DEF Shred',     values: ['−85',  '−105', '−130', '−160'] },
          { label: 'Duration',        values: ['2T', '2T', '2T', '2T'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 1.95,
        moveType: 'ranged_place', sfxKey: 'bullet',
        // ► SQL: damage then apply M.DEF shred debuff (same mechanism as wslime_mdef).
      },
      {
        name: 'Mind Fracture',
        description: "Vex tears at the mental architecture of a random enemy, overwhelming their cognition. The psychic assault deals magical damage and leaves the target stunned for 1 turn — unable to act as their mind reassembles.",
        ratioLevels: [
          { label: 'Damage (M.ATK)',     values: ['165%', '204%', '252%', '310%'] },
          { label: 'Stun Duration',      values: ['1T', '1T', '1T', '1T'] },
          { label: 'Stun Chance',        values: ['100%', '100%', '100%', '100%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'magical',
        targetType: 'single_random', damageRatio: 1.65,
        moveType: 'ranged_place', sfxKey: 'bullet',
        // ► SQL: single_random damage; apply stun_1t debuff to hit target.
      },
      {
        name: 'Dark Resonance',
        description: "Passive (init). Vex's arcane attunement begins to resonate before combat, amplifying her base magical output. At the start of every battle she permanently imprints a resonance matrix on herself — boosting her M.ATK by a fixed amount.",
        ratioLevels: [
          { label: 'M.ATK Bonus (flat, permanent)', values: ['+55', '+68', '+84', '+104'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_init', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        // ► SQL passive_init: m_atk += flat bonus (55/68/84/104 by passive_lv).
      },
      {
        name: 'Void Cascade',
        description: "Vex tears open a rift in magical reality above the entire battlefield and lets the void pour through — massive magical damage to every enemy simultaneously, each struck also suffering a permanent M.DEF reduction for the remainder of the fight.",
        ratioLevels: [
          { label: 'Damage All Enemies (M.ATK)', values: ['155%', '192%', '237%', '292%'] },
          { label: 'M.DEF Shred (all)',           values: ['−70',  '−87',  '−107', '−132'] },
          { label: 'Duration',                    values: ['2T', '2T', '2T', '2T'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'magical',
        targetType: 'all_enemies', damageRatio: 1.55,
        moveType: 'ranged_place', sfxKey: 'bullet',
        // ► SQL: all_enemies damage; apply M.DEF shred to all hit targets (2 turns).
      },
    ],
  },

  // ── Naris — Mage (B Rare) ─────────────────────────────────────────────────────
  // LOOK: Translucent, barely-there silhouette — a phantasm, not quite corporeal.
  //       Vaguely humanoid outline made of swirling dark smoke and mist. Tattered ghostly
  //       cloak that trails into nothingness below the waist. Multiple semi-transparent
  //       floating hands orbit the body. Two pinpoints of cold white light for eyes.
  //       No face otherwise — just void. Moves with a slow drifting elegance that is deeply unsettling.
  // IDENTITY: "AoE Phantom Terror" — wide magical AoE, soul drain, on-kill spectral echo.
  //            Second Mage in roster; completely different from Vex. Naris is AoE punishment, not shred.
  // COUNTER TO: Clustered enemy formations (every AoE hits all), survivorship-dependent strategies.
  // COUNTERED BY: Single-target burst assassins (low HP, dies fast if focused).
  // SYNERGY: Vex (Vex shreds M.DEF, Naris's AoE destroys the weakened group).
  {
    heroId: 'naris', name: 'Naris', rarity: 'rare', heroType: 'Mage',
    ilust: null,
    gachaWeight: 60,
    battleReady: false,
    stats: engineStats('naris', 'Mage', 'rare'),
    sprites: PLACEHOLDER_SPRITES,
    skills: [
      {
        name: 'Phantom Touch', description: 'A cold spectral hand reaches out and passes through the nearest enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 0.85,
        moveType: 'ranged_place', sfxKey: 'bullet',
      },
      {
        name: 'Soul Drain',
        description: "Naris reaches through reality itself to grasp a single enemy's life-force, tearing it loose. The target takes heavy magical damage while Naris siphons a portion of the damage dealt back as its own restored HP.",
        ratioLevels: [
          { label: 'Damage (M.ATK)',     values: ['170%', '210%', '258%', '318%'] },
          { label: 'Self Heal (% dmg)',  values: ['30%', '30%', '30%', '30%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 1.70,
        moveType: 'ranged_place', sfxKey: 'heal',
        // ► SQL: deal M.ATK damage; self_hp += round(damage_dealt × 0.30).
      },
      {
        name: 'Spectral Wave',
        description: "Naris expands outward in a full spectral pulse — its phantasmal body momentarily engulfs the entire enemy formation, dealing moderate magical damage to every enemy simultaneously.",
        ratioLevels: [
          { label: 'Damage All Enemies (M.ATK)', values: ['110%', '136%', '168%', '207%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'magical',
        targetType: 'all_enemies', damageRatio: 1.10,
        moveType: 'ranged_place', sfxKey: 'bullet',
      },
      {
        name: 'Lingering Haunt',
        description: "Passive. Each time Naris kills an enemy, the slain soul does not depart — it lingers as a vengeful spirit that immediately deals a burst of magical damage to a random surviving enemy. The spirit vanishes after striking once.",
        ratioLevels: [
          { label: 'Haunt Damage (M.ATK)', values: ['55%', '68%', '84%', '104%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'magical',
        targetType: 'passive_kill_stack', damageRatio: 0.55,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'on_kill_matk_hit_random',
        // ► SQL: on kill, fire M.ATK×ratio magical damage to single_random living enemy.
      },
      {
        name: 'Phantom Requiem',
        description: "Naris stops drifting and becomes completely still — then releases every fragment of its spectral essence in a devastating all-or-nothing magical explosion. Every enemy on the field takes massive magical damage. Survivors reel from residual phantom energy, suffering M.ATK reduction.",
        ratioLevels: [
          { label: 'Damage All Enemies (M.ATK)', values: ['185%', '228%', '282%', '347%'] },
          { label: 'M.ATK Debuff (survivors)',   values: ['−60',  '−74',  '−91',  '−112'] },
          { label: 'Duration',                   values: ['2T', '2T', '2T', '2T'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'magical',
        targetType: 'all_enemies', damageRatio: 1.85,
        moveType: 'ranged_place', sfxKey: 'water',
        // ► SQL: all_enemies damage; apply M.ATK debuff to all surviving targets (2 turns).
      },
    ],
  },

  // ── Arix — Assassin (B Rare) ──────────────────────────────────────────────────
  // LOOK: Arachne — upper body humanoid woman, ~165cm torso. Dark brownish-grey skin,
  //       close-cropped white hair with jagged ends. Eight eyes arranged in two rows
  //       across the face: main pair vivid crimson, the rest smaller and amber.
  //       Dressed in torn black silk-weave that trails like web strands. Lower body is a
  //       large black widow spider — jet black with a crimson hourglass on the abdomen.
  //       Eight spider legs, highly articulated. Moves unpredictably.
  // IDENTITY: "Silk Trapper & Venom Striker" — immobilise, poison, multi-hit burst.
  //            Crowd control assassin: debuffs before killing, not pure glass cannon.
  // COUNTER TO: Support heroes (silk trap prevents them from healing/shielding), slow tanks.
  // COUNTERED BY: AoE mages (can't dodge wide blasts), ranged heroes (her web needs close range).
  // SYNERGY: Zyl (Zyl bursts, Arix traps; dual-assassin team dominates back row heroes).
  {
    heroId: 'arix', name: 'Arix', rarity: 'rare', heroType: 'Assassin',
    ilust: null,
    gachaWeight: 60,
    battleReady: false,
    stats: engineStats('arix', 'Assassin', 'rare'),
    sprites: PLACEHOLDER_SPRITES,
    skills: [
      {
        name: 'Fang Strike', description: 'A darting forward lunge with venom-dripping mandible-fangs.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Silk Bind',
        description: "Arix launches a burst of silk that wraps the target in webbing, reducing their speed and dealing piercing physical damage as the strands tighten. Slower targets are easier prey.",
        ratioLevels: [
          { label: 'Damage (P.ATK)',   values: ['155%', '190%', '234%', '288%'] },
          { label: 'Speed Reduction', values: ['−22', '−27', '−34', '−42'] },
          { label: 'Duration',        values: ['2T', '2T', '2T', '2T'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.55,
        moveType: 'melee_dash', sfxKey: 'lucas',
        // ► SQL: damage then apply speed debuff to target for 2 turns.
      },
      {
        name: 'Venom Burst',
        description: "Arix bites twice in rapid succession, injecting venom with each strike. The second bite lands deeper than the first — each hit deals physical damage, and the accumulated venom corrodes the target's physical defence.",
        ratioLevels: [
          { label: 'Damage / Hit (P.ATK)',  values: ['80%', '99%', '122%', '150%'] },
          { label: 'Hits',                  values: ['×2', '×2', '×2', '×2'] },
          { label: 'P.DEF Shred (on hit)',  values: ['−40', '−50', '−62', '−77'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.60,
        moveType: 'melee_dash', sfxKey: 'lucas',
        hitCount: 2,
        // ► SQL: 2 hits of ratio/2; each hit applies P.DEF shred to target.
      },
      {
        name: 'Spider Sense',
        description: "Passive (init). Arix's eight eyes perceive threats from all directions simultaneously. Before combat begins she enters a heightened predatory state — permanently boosting her Speed by a flat amount for the entire battle.",
        ratioLevels: [
          { label: 'Speed Bonus (permanent)', values: ['+28', '+35', '+43', '+53'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_init', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        // ► SQL passive_init: speed += flat bonus (28/35/43/53 by passive_lv).
      },
      {
        name: 'Web of Doom',
        description: "Arix erupts into the entire enemy formation — eight legs striking in all directions as silk webs fill the air. Every enemy is entangled and struck with a devastating physical blow. A terrifying display of what a predator looks like at full speed.",
        ratioLevels: [
          { label: 'Damage All Enemies (P.ATK)', values: ['170%', '210%', '258%', '318%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'all_enemies', damageRatio: 1.70,
        moveType: 'melee_aoe_center', sfxKey: 'lucas',
      },
    ],
  },

  // ── Zyl — Assassin (B Rare) ───────────────────────────────────────────────────
  // LOOK: Bipedal chameleon, lean and athletic. Roughly humanoid silhouette — long limbs,
  //       prehensile tail for balance. Scales shift dynamically: emerald-green in idle,
  //       dark grey/shadow in combat. Large eyes rotate independently. Carries twin curved
  //       obsidian daggers — short, fast, no-nonsense. No armour — just wraps.
  //       Combat stance is unnaturally still until the instant of striking.
  // IDENTITY: "First Strike Specialist" — speed-based assassination, bonus damage on fresh targets,
  //            self-buff that makes them blur with speed. Rewards attacking before the enemy acts.
  // COUNTER TO: Support heroes (isolated before they can heal), slow enemies who haven't acted yet.
  // COUNTERED BY: AoE skills after invisibility (low HP), already-acted fast enemies.
  // SYNERGY: Arix (Arix slows targets, Zyl executes them), Szara (venom softens targets, Zyl finishes).
  {
    heroId: 'zyl', name: 'Zyl', rarity: 'rare', heroType: 'Assassin',
    ilust: null,
    gachaWeight: 60,
    battleReady: false,
    stats: engineStats('zyl', 'Assassin', 'rare'),
    sprites: PLACEHOLDER_SPRITES,
    skills: [
      {
        name: 'Quick Slash', description: 'A blinding-fast dagger strike at the closest enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Phantom Step',
        description: "Zyl blurs out of sight and reappears directly behind a back-row target, driving a dagger into an unguarded position. Attacking from behind — before the target can react — amplifies the strike's brutality.",
        ratioLevels: [
          { label: 'Damage (P.ATK)',           values: ['185%', '228%', '280%', '345%'] },
          { label: 'Target',                   values: ['Back Row', 'Back Row', 'Back Row', 'Back Row'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single_back', damageRatio: 1.85,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Color Shift',
        description: "Zyl's scales shift to their deepest combat pattern — a neural trigger for its most explosive burst state. Zyl instantly gains a significant Speed boost and P.ATK amplification for 2 turns.",
        ratioLevels: [
          { label: 'Speed Bonus',  values: ['+35', '+44', '+54', '+67'] },
          { label: 'P.ATK Bonus', values: ['+8%', '+10%', '+13%', '+16%'] },
          { label: 'Duration',    values: ['2T', '2T', '2T', '2T'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 2, unlockLevel: 21, skillType: 'buff', damageType: 'none',
        targetType: 'hp_shield_self', damageRatio: 0.00,
        moveType: 'self_only', sfxKey: 'shield',
        // ► SQL: self speed += flat bonus and P.ATK *= (1+%) for 2 turns.
      },
      {
        name: 'Surprise Attack',
        description: "Passive (init). Zyl's combat philosophy centres on striking before awareness crystallises. Before every battle begins, Zyl activates a pre-strike focus — permanently boosting P.ATK for the entire battle.",
        ratioLevels: [
          { label: 'P.ATK Bonus (flat, permanent)', values: ['+48', '+60', '+74', '+91'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_init', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        // ► SQL passive_init: p_atk += flat bonus (48/60/74/91 by passive_lv).
      },
      {
        name: 'Kaleidoscope',
        description: "Zyl's scales blur into every colour at once as it launches three consecutive slashing assaults across the entire enemy frontline in rapid succession — each pass faster than the last. By the third strike Zyl is nearly invisible from sheer velocity.",
        ratioLevels: [
          { label: 'Damage / Pass (P.ATK)',       values: ['90%',  '112%', '138%', '170%'] },
          { label: 'Passes',                       values: ['×3', '×3', '×3', '×3'] },
          { label: 'Total (3× front row, P.ATK)', values: ['270%', '336%', '414%', '510%'] },
        ],
        iconUrl: UNKNOWN_ICON,
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 2.70,
        moveType: 'melee_aoe_center', sfxKey: 'lucas',
        hitCount: 3,
      },
    ],
  },

  // ── C Common ────────────────────────────────────────────────────────────────

  // ── Rock Slime — Tank (C) ────────────────────────────────────────────────────
  {
    heroId: 'rock_slime', name: 'Rock Slime', rarity: 'common', heroType: 'Tank',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545681/ChatGPT_Image_Apr_30_2026_05_38_28_PM_wzt4ox.png',
    gachaWeight: 100,
    battleReady: true,
    stats: {
      base_hp: 1360, base_p_atk: 50, base_m_atk: 50,
      base_p_def: 136, base_m_def: 136, base_speed: 56,
      growth_hp: 24, growth_p_atk: 1, growth_m_atk: 1,
      growth_p_def: 2, growth_m_def: 2,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777634810/Gemini_Generated_Image_c7qsl1c7qsl1c7qs_mekkjz.png',
      actionUrl:  null, actionMethod: null,
      isHumanHero: false, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Body Slam', description: 'Hurls its body at a front-row enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Boulder Dash',
        description: 'Rock Slime launches itself forward in a heavy body slam, dealing physical damage on impact.',
        ratioLevels: [
          { label: 'Damage (P.ATK)',      values: ['100%', '122%', '148%', '180%'] },
          { label: 'P.DEF Buff (2 turns)', values: ['+8% P.DEF', '+11% P.DEF', '+14% P.DEF', '+18% P.DEF'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565812/s1rlime_hfstrz.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Rock Shell',
        description: 'Rock Slime compresses its outer layer into a dense stone shell, instantly granting itself a HP Shield proportional to its Max HP.',
        ratioLevels: [
          { label: 'Shield (own Max HP)', values: ['12% Max HP', '15% Max HP', '19% Max HP', '24% Max HP'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565820/s2rslime_shjl5b.png',
        slot: 2, unlockLevel: 21, skillType: 'buff', damageType: 'none',
        targetType: 'hp_shield_self', damageRatio: 0.12,
        moveType: 'self_only', sfxKey: 'shield',
      },
      {
        name: 'Mineral Density',
        description: "Passive. Rock Slime's dense mineral composition permanently raises its own P.DEF.",
        ratioLevels: [
          { label: 'Basic Atk Bonus (P.DEF)', values: ['+10% P.DEF', '+14% P.DEF', '+19% P.DEF', '+25% P.DEF'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565826/s3rslime_vip7sb.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
      },
      {
        name: 'Spike Eruption',
        description: 'Rock Slime erupts jagged stone spikes across its body, striking every enemy in the front row simultaneously.',
        ratioLevels: [
          { label: 'Dmg Front Row (P.DEF)', values: ['55% P.DEF', '70% P.DEF', '88% P.DEF', '110% P.DEF'] },
          { label: 'P.DEF Boost (2T)',      values: ['+18%', '+24%', '+30%', '+38%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565833/s4rslime_duuc2g.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 0.55,
        moveType: 'melee_aoe_center', sfxKey: 'punch',
      },
    ],
  },

  // ── Acid Slime — Ranged (C) ──────────────────────────────────────────────────
  {
    heroId: 'acid_slime', name: 'Acid Slime', rarity: 'common', heroType: 'Ranged',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545738/ChatGPT_Image_Apr_30_2026_05_39_48_PM_oq2njh.png',
    gachaWeight: 100,
    battleReady: true,
    stats: {
      base_hp: 640, base_p_atk: 153, base_m_atk: 187,
      base_p_def: 64, base_m_def: 64, base_speed: 120,
      growth_hp: 12, growth_p_atk: 3, growth_m_atk: 3,
      growth_p_def: 1, growth_m_def: 1,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634782/ChatGPT_Image_May_1_2026_06_25_59_PM_dsoxsd.png',
      actionUrl:  null, actionMethod: null,
      isHumanHero: false, appearsAsEnemy: true,
      enemyNeedsChroma: false, enemyNeedsBgRemoval: true,
    },
    skills: [
      {
        name: 'Acid Glob', description: 'Lobs acid at a random enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single_random', damageRatio: 0.90,
        moveType: 'ranged_place', sfxKey: 'water',
      },
      {
        name: 'Acid Spit',
        description: "Targets 1 random back-row enemy. On impact the acid weakens the target's physical armour, reducing their P.DEF for 2 turns.",
        ratioLevels: [
          { label: 'Damage (P.ATK)',    values: ['105%', '128%', '155%', '188%'] },
          { label: 'P.DEF Shred (2T)', values: ['−8%', '−10%', '−13%', '−17%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806549/sk1acd_nqz0x5.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single_back', damageRatio: 1.05,
        moveType: 'ranged_place', sfxKey: 'water',
      },
      {
        name: 'Corrosive Splash',
        description: 'Targets 2 random front-row enemies. Sprays a wide arc of acid.',
        ratioLevels: [
          { label: 'Dmg (×2 targets)',  values: ['68%', '84%', '102%', '124%'] },
          { label: 'Stun Chance / Tgt', values: ['16%', '20%', '26%', '33%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806563/sk2acd_x4d8qu.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'two_front_random', damageRatio: 0.68,
        moveType: 'ranged_place', sfxKey: 'water',
      },
      {
        name: 'Acidic Membrane',
        description: "Passive. Whenever any enemy strikes Acid Slime with a physical attack, that attacker immediately receives acid damage in return.",
        ratioLevels: [
          { label: 'Contact Dmg (P.ATK)', values: ['10% P.ATK', '14% P.ATK', '19% P.ATK', '25% P.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806571/sk3acd_gh45ki.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'reactive_self_hit',
      },
      {
        name: 'Acid Flood',
        description: 'Releases a torrent of concentrated acid that drenches every enemy simultaneously.',
        ratioLevels: [
          { label: 'Dmg All (P.ATK)',      values: ['78%', '96%', '118%', '144%'] },
          { label: 'P.DEF Shred All (2T)', values: ['−10%', '−13%', '−17%', '−22%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806578/sk4acd_mcmpzu.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'all_enemies', damageRatio: 0.78,
        moveType: 'ranged_place', sfxKey: 'water',
      },
    ],
  },

  // ── Water Slime — Support (C) ────────────────────────────────────────────────
  {
    heroId: 'water_slime', name: 'Water Slime', rarity: 'common', heroType: 'Support',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png',
    gachaWeight: 100,
    battleReady: true,
    stats: {
      base_hp: 1040, base_p_atk: 90, base_m_atk: 90,
      base_p_def: 104, base_m_def: 104, base_speed: 96,
      growth_hp: 19, growth_p_atk: 2, growth_m_atk: 2,
      growth_p_def: 2, growth_m_def: 2,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777907811/7d3947a5-76a6-4422-9dc6-1eb5fd4d29bd.png',
      actionUrl:  null, actionMethod: null,
      isHumanHero: false, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Water Shot', description: 'Fires a pressurised water ball.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single_random', damageRatio: 0.75,
        moveType: 'ranged_place', sfxKey: 'water',
      },
      {
        name: 'Water Jet',
        description: "Targets the enemy with the highest Speed. Deals magic damage and reducing that target's Speed for 2 turns.",
        ratioLevels: [
          { label: 'Damage (M.ATK)',  values: ['82% M.ATK', '100% M.ATK', '122% M.ATK', '148% M.ATK'] },
          { label: 'Speed Slow (2T)', values: ['−18% Spd', '−24% Spd', '−30% Spd', '−38% Spd'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807420/sk1wtr.pg_fbx8a0.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'highest_speed', damageRatio: 0.82,
        moveType: 'ranged_place', sfxKey: 'water',
      },
      {
        name: 'Tidal Surge',
        description: 'Targets the 2 front-row enemies with the highest Max HP. Deals magic damage and weakening their M.DEF for 2 turns.',
        ratioLevels: [
          { label: 'Dmg / Target (M.ATK)', values: ['58% M.ATK', '72% M.ATK', '88% M.ATK', '108% M.ATK'] },
          { label: 'M.DEF Shred (2T)',      values: ['−12%', '−16%', '−21%', '−27%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807428/sk2wtr_vmi777.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'magical',
        targetType: 'two_front_highest_hp', damageRatio: 0.58,
        moveType: 'ranged_place', sfxKey: 'water',
      },
      {
        name: 'Soaking Field',
        description: "Passive. Water Slime perpetually dampens the battlefield. All allies automatically deal bonus magic damage against any enemy currently afflicted by one of Water Slime's debuffs.",
        ratioLevels: [
          { label: 'Ally Bonus vs. Debuffed (M.ATK)', values: ['+8% M.ATK', '+12% M.ATK', '+16% M.ATK', '+22% M.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807444/sk3wtr_fedwpe.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
      },
      {
        name: 'Deluge Wave',
        description: 'Unleashes a massive flood that washes over every enemy — dealing magic damage and reducing both P.DEF and M.DEF for 2 turns.',
        ratioLevels: [
          { label: 'Dmg All (M.ATK)',          values: ['72% M.ATK', '88% M.ATK', '108% M.ATK', '132% M.ATK'] },
          { label: 'P.DEF + M.DEF Shred (2T)', values: ['−10% each', '−13% each', '−17% each', '−22% each'] },
          { label: 'Stun Chance / Turn (2T)',   values: ['12%', '16%', '21%', '27%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807456/sk4wtr_fbixax.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'magical',
        targetType: 'all_enemies', damageRatio: 0.72,
        moveType: 'ranged_place', sfxKey: 'water',
      },
    ],
  },

  // ── Gorr — Fighter (C) ───────────────────────────────────────────────────────
  {
    heroId: 'gorr', name: 'Gorr', rarity: 'common', heroType: 'Fighter',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058398/ChatGPT_Image_May_6_2026_03_41_03_PM_hxymbk.png',
    gachaWeight: 100,
    battleReady: true,
    stats: {
      base_hp: 1260, base_p_atk: 126, base_m_atk: 120,
      base_p_def: 120, base_m_def: 120, base_speed: 58,
      growth_hp: 23, growth_p_atk: 2, growth_m_atk: 2,
      growth_p_def: 2, growth_m_def: 2,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919607/ChatGPT_Image_May_5_2026_01_23_54_AM_nhkzmq.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919615/ChatGPT_Image_May_5_2026_01_31_48_AM_m65s2g.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Cleave', description: 'Overhead chop to a front-row enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Cleaver Rush',
        description: "Gorr charges forward toward the enemy with the lowest current HP and delivers a savage cleaver strike. Inflicts Bleed for 2 turns.",
        ratioLevels: [
          { label: 'Damage (P.ATK)',         values: ['140%', '170%', '205%', '250%'] },
          { label: 'Bleed/Turn (P.ATK, 2T)', values: ['18%', '22%', '28%', '35%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002904/sk1gor_wkgpaz.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single_lowest_hp', damageRatio: 1.40,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Intimidating Slam',
        description: 'Crashes his massive cleaver down on the nearest front-row enemy. Deals heavy damage and Terrifies the target, reducing their P.ATK for 2 turns.',
        ratioLevels: [
          { label: 'Damage (P.ATK)',        values: ['158%', '192%', '232%', '282%'] },
          { label: 'P.ATK Debuff Tgt (2T)', values: ['−15%', '−20%', '−26%', '−33%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002911/sk2gor_grkelh.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.58,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Bloodlust',
        description: "Passive. Every time Gorr deals damage he recovers HP equal to a percentage of the damage dealt (Lifesteal). Applies to all his abilities.",
        ratioLevels: [
          { label: 'Lifesteal (% of dmg dealt)', values: ['8%', '10%', '13%', '17%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002917/sk3gor_ppjc9j.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'on_kill_patk_stack', maxStacks: 3,
      },
      {
        name: 'Reaping Arc',
        description: "Gorr sweeps his massive cleaver in a wide, devastating arc that strikes ALL enemies simultaneously. Bleeding targets take amplified damage.",
        ratioLevels: [
          { label: 'Base Dmg All (P.ATK)',     values: ['88%', '108%', '132%', '160%'] },
          { label: 'Bonus vs Bleeding targets', values: ['+30%', '+35%', '+40%', '+48%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002925/sk4gor_axfkc2.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'all_enemies', damageRatio: 0.88,
        moveType: 'melee_aoe_center', sfxKey: 'lucas',
      },
    ],
  },

  // ── Craw — Ranged (C) ────────────────────────────────────────────────────────
  {
    heroId: 'craw', name: 'Craw', rarity: 'common', heroType: 'Ranged',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058474/ChatGPT_Image_May_6_2026_03_43_04_PM_u0dyy5.png',
    gachaWeight: 100,
    battleReady: true,
    stats: {
      base_hp: 589, base_p_atk: 187, base_m_atk: 153,
      base_p_def: 64, base_m_def: 64, base_speed: 152,
      growth_hp: 11, growth_p_atk: 3, growth_m_atk: 3,
      growth_p_def: 1, growth_m_def: 1,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919783/ChatGPT_Image_May_5_2026_01_26_59_AM_zfdewm.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919799/ChatGPT_Image_May_5_2026_01_27_08_AM_p8yjub.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Quick Shot', description: 'Hurried arrow at a random enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single_random', damageRatio: 0.90,
        moveType: 'ranged_place', sfxKey: 'craw_arrow',
      },
      {
        name: 'Crude Shot',
        description: 'Craw fires a hurried arrow at 1 random enemy (any row). 30% chance to inflict Wound for 2 turns — a Wounded target takes increased damage from ALL sources.',
        ratioLevels: [
          { label: 'Damage (P.ATK)',     values: ['115%', '140%', '170%', '205%'] },
          { label: 'Wound Chance',       values: ['30%', '38%', '48%', '60%'] },
          { label: 'Wound: Dmg Taken +', values: ['+10%', '+13%', '+17%', '+22%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002931/sk1craw_cgwnc7.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single_random', damageRatio: 1.15,
        moveType: 'ranged_place', sfxKey: 'craw_arrow',
      },
      {
        name: 'Blind Arrow',
        description: "Targets the enemy with the highest P.ATK — the biggest offensive threat on the field. Inflicts Blind for 2 turns: Blinded enemies have a greatly increased chance to miss.",
        ratioLevels: [
          { label: 'Damage (P.ATK)',        values: ['130%', '158%', '192%', '232%'] },
          { label: 'Blind (2T) Miss Chance', values: ['35%', '45%', '55%', '65%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002935/sk2craw_hmjjoz.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'single_highest_patk', damageRatio: 1.30,
        moveType: 'ranged_place', sfxKey: 'craw_arrow',
      },
      {
        name: 'Cornered Rat',
        description: "Passive (one-time trigger). When Craw's HP falls below 40% for the first time, he permanently gains a significant P.ATK and Speed boost. Triggers only once.",
        ratioLevels: [
          { label: 'P.ATK Boost (perm, 1×)', values: ['+25%', '+30%', '+36%', '+44%'] },
          { label: 'Speed Boost (perm, 1×)', values: ['+12%', '+15%', '+18%', '+22%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002946/sk3craw_f6s5e5.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'low_hp_once',
      },
      {
        name: 'Skypiercer Volley',
        description: "Craw launches a rapid barrage of arrows that rains down on ALL enemies simultaneously. Every enemy hit receives a Wound — amplifying all incoming damage.",
        ratioLevels: [
          { label: 'Dmg All (P.ATK)',     values: ['72%', '88%', '108%', '130%'] },
          { label: 'Wound All (2T) Dmg+', values: ['+10%', '+13%', '+17%', '+22%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002939/sk4craw_zg73ez.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'all_enemies', damageRatio: 0.72,
        moveType: 'ranged_place', sfxKey: 'craw_arrow',
      },
    ],
  },

  // ── Myko — Tank (C) ─────────────────────────────────────────────────────────
  {
    heroId: 'myko', name: 'Myko', rarity: 'common', heroType: 'Tank',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058438/ChatGPT_Image_May_6_2026_03_42_51_PM_o43yt7.png',
    gachaWeight: 100,
    battleReady: true,
    stats: {
      base_hp: 1360, base_p_atk: 43, base_m_atk: 50,
      base_p_def: 156, base_m_def: 136, base_speed: 50,
      growth_hp: 95, growth_p_atk: 3, growth_m_atk: 4,
      growth_p_def: 11, growth_m_def: 10,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005026/ChatGPT_Image_May_6_2026_01_01_00_AM_bhjzhr.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005040/ChatGPT_Image_May_6_2026_01_03_49_AM_sirb54.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Shield Bash', description: 'Rams its shield into a single enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Iron Casing',
        description: "Myko channels fungal chitin through its body, hardening its outer casing. Instantly generates a protective HP Shield equal to a portion of Myko's maximum HP.",
        ratioLevels: [
          { label: 'HP Shield (Max HP)', values: ['12%', '16%', '20%', '25%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009427/sk1myk_nr36fc.png',
        slot: 1, unlockLevel: 1, skillType: 'buff', damageType: 'none',
        targetType: 'hp_shield_self', damageRatio: 0.12,
        moveType: 'self_only', sfxKey: 'shield',
      },
      {
        name: 'Spore Slam',
        description: "Myko drives its shield into the ground, releasing a fungal shockwave that erupts through the front row. Damage scales with Myko's own P.DEF.",
        ratioLevels: [
          { label: 'Damage (P.DEF)',          values: ['90%', '110%', '135%', '165%'] },
          { label: 'Spore Rot P.ATK − (2T)', values: ['15%', '18%', '22%', '28%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009434/sk2myk_nry1oe.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 0.90,
        moveType: 'melee_aoe_center', sfxKey: 'punch',
      },
      {
        name: 'Fungal Resilience',
        description: "Passive. Each time Myko receives a direct attack, it immediately regenerates HP equal to a percentage of its own P.DEF.",
        ratioLevels: [
          { label: 'Heal per Hit (P.DEF)', values: ['18%', '25%', '32%', '40%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009440/sk3myk_oc94bf.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'reactive_self_hit',
      },
      {
        name: 'Spore Eruption',
        description: "Myko erupts spores across ALL enemies. Deals magic damage based on Myko's own P.DEF and applies Spore Toxin for 3 turns.",
        ratioLevels: [
          { label: 'Damage All (P.DEF)',       values: ['85%', '105%', '130%', '160%'] },
          { label: 'Spore Toxin/Turn (P.DEF)', values: ['15%', '20%', '26%', '34%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009488/sk4myk_egyexz.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'magical',
        targetType: 'all_enemies', damageRatio: 0.85,
        moveType: 'melee_aoe_center', sfxKey: 'punch',
      },
    ],
  },

  // ── Fang — Assassin (C) ──────────────────────────────────────────────────────
  {
    heroId: 'fang', name: 'Fang', rarity: 'common', heroType: 'Assassin',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058505/ChatGPT_Image_May_6_2026_03_43_11_PM_xagzjf.png',
    gachaWeight: 100,
    battleReady: true,
    sk2BeforeSk1: true,
    stats: {
      base_hp: 680, base_p_atk: 162, base_m_atk: 40,
      base_p_def: 48, base_m_def: 58, base_speed: 138,
      growth_hp: 68, growth_p_atk: 16, growth_m_atk: 4,
      growth_p_def: 5, growth_m_def: 6,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058539/ChatGPT_Image_May_6_2026_03_43_22_PM_ejhf1t.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058739/ChatGPT_Image_May_6_2026_03_45_46_PM_plgice.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Shadow Strike', description: 'A fast single dagger jab.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'lucas',
      },
      {
        name: 'Twin Slash',
        description: "Fang lunges at a single enemy and unleashes two rapid dagger strikes in quick succession. Consistent damage against any target with no cooldown penalty.",
        ratioLevels: [
          { label: 'Damage per Hit (P.ATK)', values: ['90%', '110%', '135%', '165%'] },
          { label: 'Hits',                   values: ['×2',  '×2',   '×2',   '×2'  ] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066250/sk1fang_lzaud9.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'twin_slash', damageRatio: 0.90,
        moveType: 'melee_dash', sfxKey: 'lucas',
        noCooldown: true, hitCount: 2, hitDelay: 220,
      },
      {
        name: 'Shadow Sprint',
        description: 'Fang blurs through the entire front row in a single pass, slashing every enemy in the line simultaneously.',
        ratioLevels: [
          { label: 'Damage per Enemy (P.ATK)', values: ['75%', '92%', '112%', '138%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066256/sk2fang_mkmdui.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 0.75,
        moveType: 'melee_aoe_center', sfxKey: 'lucas',
      },
      {
        name: "Hunter's Mark",
        description: "Passive. Each killing blow Fang deals permanently stacks his P.ATK by a percentage of his base P.ATK. Up to 3 stacks.",
        ratioLevels: [
          { label: 'P.ATK Stack / Kill', values: ['+28%', '+36%', '+46%', '+58%'] },
          { label: 'Max Stacks',         values: ['3', '3', '3', '3'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066265/sk3fang_wdo19c.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_kill_stack', damageRatio: 0.00,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'on_kill_patk_stack', maxStacks: 3,
      },
      {
        name: 'Death Bound',
        description: "Fang vanishes and reappears behind the lowest-HP enemy, unleashing a devastating finishing strike. If the target's remaining HP is below 35%, the blow triples in power.",
        ratioLevels: [
          { label: 'Damage (P.ATK)',        values: ['260%', '320%', '395%', '480%'] },
          { label: 'Execute Bonus (<35% HP)', values: ['×3', '×3', '×3', '×3'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066271/sk4fang_msdipt.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'single_lowest_hp', damageRatio: 2.60,
        moveType: 'melee_dash', sfxKey: 'lucas',
        executeThreshold: 0.35, executeMult: 3,
      },
    ],
  },

  // ── Clover — Support (C) ─────────────────────────────────────────────────────
  {
    heroId: 'clover', name: 'Clover', rarity: 'common', heroType: 'Support',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058786/ChatGPT_Image_May_6_2026_03_55_39_PM_dssunr.png',
    gachaWeight: 100,
    battleReady: true,
    stats: {
      base_hp: 880, base_p_atk: 62, base_m_atk: 158,
      base_p_def: 65, base_m_def: 100, base_speed: 118,
      growth_hp: 88, growth_p_atk: 6, growth_m_atk: 15,
      growth_p_def: 6, growth_m_def: 10,
    },
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058829/ChatGPT_Image_May_6_2026_03_57_38_PM_jwipj1.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058887/ChatGPT_Image_May_6_2026_04_00_04_PM_fattkj.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Herb Toss', description: 'Tosses a healing herb — mild magic projectile.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'magical',
        targetType: 'single', damageRatio: 0.75,
        moveType: 'ranged_place', sfxKey: 'bullet',
      },
      {
        name: 'Healing Herb',
        description: "Clover pinpoints the ally with the lowest current HP — herself included — and channels healing energy into them.",
        ratioLevels: [
          { label: 'Heal (M.ATK)', values: ['130% M.ATK', '160% M.ATK', '195% M.ATK', '240% M.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066277/sk1clov_pwyu2r.png',
        slot: 1, unlockLevel: 1, skillType: 'heal', damageType: 'magical',
        targetType: 'single_lowest_hp_ally', damageRatio: 1.30,
        moveType: 'ranged_place', sfxKey: 'heal',
      },
      {
        name: 'Lucky Toss',
        description: "Clover tosses a regenerating charm to a random alive ally. The target recovers HP each turn for 3 turns.",
        ratioLevels: [
          { label: 'HoT / Turn (M.ATK)', values: ['55% M.ATK', '68% M.ATK', '83% M.ATK', '100% M.ATK'] },
          { label: 'Duration',           values: ['3 turns', '3 turns', '3 turns', '3 turns'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066283/sk2clov_ebrxbb.png',
        slot: 2, unlockLevel: 21, skillType: 'hot', damageType: 'magical',
        targetType: 'single_random_ally', damageRatio: 0.55,
        moveType: 'ranged_place', sfxKey: 'heal',
      },
      {
        name: 'Life Bloom',
        description: "Passive. Whenever any ally takes a direct hit, 35% chance Clover instantly heals that ally.",
        ratioLevels: [
          { label: 'Reactive Heal (M.ATK)', values: ['40% M.ATK', '50% M.ATK', '62% M.ATK', '78% M.ATK'] },
          { label: 'Trigger Chance',        values: ['35%', '35%', '35%', '35%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066288/sk3clov_p4van1.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive_ally_hit', damageRatio: 0.40,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'reactive_ally_hit',
      },
      {
        name: 'Bloom Cascade',
        description: "Clover releases a radiant burst of sacred healing that restores ALL alive allies simultaneously, then wraps each in a regenerating aura for 3 turns.",
        ratioLevels: [
          { label: 'Burst Heal / Ally (M.ATK)', values: ['90% M.ATK', '112% M.ATK', '138% M.ATK', '168% M.ATK'] },
          { label: 'HoT / Turn (M.ATK, 3T)',    values: ['38% M.ATK', '46% M.ATK', '56% M.ATK', '68% M.ATK'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778066294/sk4clov_hysri6.png',
        slot: 4, unlockLevel: 61, skillType: 'heal_aoe', damageType: 'magical',
        targetType: 'all_allies', damageRatio: 0.90,
        moveType: 'ranged_place', sfxKey: 'heal',
      },
    ],
  },

  // ── Bolo — Fighter (C) ───────────────────────────────────────────────────────
  {
    heroId: 'bolo', name: 'Bolo', rarity: 'common', heroType: 'Fighter',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778231010/ChatGPT_Image_May_8_2026_03_58_18_PM_bchzp9.png',
    gachaWeight: 100,
    battleReady: true,
    // ↓ Engine-derived — do NOT hand-code. Edit HERO_VARIANTS['bolo'] in balanceEngine.ts.
    stats: engineStats('bolo', 'Fighter', 'common'),
    // Resolved: base_hp:1320 growth_hp:92  base_p_atk:130 growth_p_atk:9
    //           base_p_def:130 growth_p_def:9  base_speed:54
    sprites: {
      idleUrl:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778231187/ChatGPT_Image_May_8_2026_04_06_08_PM_kvuuqu.png',
      actionUrl:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778231197/ChatGPT_Image_May_8_2026_04_05_59_PM_ezsxxp.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Wild Hook', description: 'Swings a heavy fist at the nearest enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Goofy Punch',
        description: "Bolo winds up and fires his sloppiest, heaviest fist straight into one enemy's face. Hits harder than it looks, and has a chance to Stun the target for 1 turn.",
        ratioLevels: [
          { label: 'Damage (P.ATK)',  values: ['145%', '175%', '210%', '255%'] },
          { label: 'Stun Chance',     values: ['35%',  '42%',  '52%',  '65%' ] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778239141/sk1bol_di1n0b.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.45,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Punch Cannon',
        description: "Bolo cocks both fists and fires them forward like a cannon, blasting through every enemy in the front row at once.",
        ratioLevels: [
          { label: 'Damage All Front (P.ATK)', values: ['105%', '128%', '155%', '188%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778239155/sk2bol_a8nmw8.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'front_aoe', damageRatio: 1.05,
        moveType: 'melee_aoe_center', sfxKey: 'punch',
      },
      {
        name: 'Anger Fist',
        description: "Passive. Every time Bolo takes a hit, his fists get angrier and harder — permanently boosting his P.ATK. Up to 4 stacks.",
        ratioLevels: [
          { label: 'P.ATK / Stack (on hit)', values: ['+5%', '+6%', '+8%', '+10%'] },
          { label: 'Max Stacks',             values: ['4',   '4',   '4',   '4'   ] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778239162/sk3bol_qsnicj.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.05,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'reactive_self_hit', maxStacks: 4,
      },
      {
        name: 'Typhoon Fists',
        description: "Bolo spins with both fists swinging, punching every single enemy on the field at the same time.",
        ratioLevels: [
          { label: 'Damage All (P.ATK)', values: ['90%', '110%', '135%', '165%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778239168/sk4bol_bxjrm6.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'all_enemies', damageRatio: 0.90,
        moveType: 'melee_aoe_center', sfxKey: 'punch',
      },
    ],
  },

  // ── Quill — Assassin (C) ─────────────────────────────────────────────────────
  // Hedgehog that attacks exclusively with its back spines. Durable for an Assassin
  // thanks to its natural spine armor, but slower than Fang. Unique identity:
  //  • SK2 "Threat Sense" — always targets the highest P.ATK enemy (threat hunter)
  //  • SK3 "Quill Coat"  — reactive P.DEF stack when hit (up to 5 stacks)
  //  • ULT "Death Roll"  — crashes into highest P.ATK enemy for massive burst
  // Counter to: Fighters & heavy P.ATK dealers. Countered by: M.ATK, fast casters.
  {
    heroId: 'quill', name: 'Quill', rarity: 'common', heroType: 'Assassin',
    ilust: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778238897/ChatGPT_Image_May_8_2026_06_13_09_PM_vnblpy.png',
    gachaWeight: 100,
    battleReady: true,
    // ↓ Engine-derived — edit HERO_VARIANTS['quill'] in balanceEngine.ts.
    stats: engineStats('quill', 'Assassin', 'common'),
    // Resolved: base_hp:864 growth_hp:60  base_p_atk:165 growth_p_atk:12
    //           base_p_def:106 growth_p_def:7  base_speed:173
    sprites: {
      idleUrl:   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778239096/ChatGPT_Image_May_8_2026_06_13_01_PM_qnx2nw.png',
      actionUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778239114/ChatGPT_Image_May_8_2026_06_12_47_PM_gke8kr.png',
      actionMethod: 'chroma',
      isHumanHero: true, appearsAsEnemy: true,
      enemyNeedsChroma: true, enemyNeedsBgRemoval: false,
    },
    skills: [
      {
        name: 'Spine Poke', description: 'Dashes in close and jabs a single spine into the nearest enemy.',
        ratioLevels: [], iconUrl: UNKNOWN_ICON,
        slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.00,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Spike Burst',
        description: "Quill rushes the front enemy and fires a point-blank cluster of spines — concentrated, brutal, and impossible to dodge at this range.",
        ratioLevels: [
          { label: 'Damage (P.ATK)', values: ['155%', '188%', '228%', '278%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778240747/sk1quill_sxuazo.png',
        slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
        targetType: 'single', damageRatio: 1.55,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Threat Sense',
        description: "Quill's survival instincts lock onto the most dangerous foe — the enemy with the highest P.ATK — and fires a devastating spine volley straight at them.",
        ratioLevels: [
          { label: 'Damage (P.ATK)', values: ['185%', '225%', '272%', '330%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778240767/sk2quill_diuxf3.png',
        slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
        targetType: 'single_highest_patk', damageRatio: 1.85,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
      {
        name: 'Quill Coat',
        description: "Passive. Every time Quill takes a direct hit, its spine armor thickens — permanently boosting P.DEF. Up to 5 stacks.",
        ratioLevels: [
          { label: 'P.DEF / Stack (on hit)', values: ['+8%', '+10%', '+13%', '+16%'] },
          { label: 'Max Stacks',             values: ['5',   '5',    '5',    '5'  ] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778240776/sk3quill_pemdai.png',
        slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
        targetType: 'passive', damageRatio: 0.08,
        moveType: 'passive', sfxKey: 'none',
        passiveType: 'reactive_self_hit', maxStacks: 5,
      },
      {
        name: 'Death Roll',
        description: "Quill curls into a spinning ball of spines and crashes at full force into the highest P.ATK enemy. It never runs from the biggest threat — it charges straight at it.",
        ratioLevels: [
          { label: 'Damage (P.ATK)', values: ['240%', '295%', '360%', '440%'] },
        ],
        iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778240783/sk4quill_ykgrvh.png',
        slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
        targetType: 'single_highest_patk', damageRatio: 2.40,
        moveType: 'melee_dash', sfxKey: 'punch',
      },
    ],
  },

];

// ─── Fast-lookup maps (computed once at startup) ──────────────────────────────

export const HERO_DEF_BY_ID: Record<string, HeroFullDef> =
  Object.fromEntries(HERO_DEFS.map(d => [d.heroId, d]));

export const HERO_DEF_BY_SPRITE_NAME: Record<string, HeroFullDef> =
  Object.fromEntries(HERO_DEFS.map(d => [heroSpriteName(d), d]));

// ════════════════════════════════════════════════════════════════════════════════
//  NEW HERO TEMPLATE — copy this when adding a new hero
// ════════════════════════════════════════════════════════════════════════════════
/*
{
  heroId: 'hero_id',          // snake_case, matches DB
  name:   'Hero Name',
  rarity: 'common',           // common | rare | epic | legendary | mythic
  heroType: 'Fighter',        // Tank | Fighter | Assassin | Ranged | Mage | Support | …
  ilust:  null,               // Cloudinary URL when art is ready
  gachaWeight: 100,           // 0 = not in gacha
  battleReady: false,         // set true when all data below is filled
  stats: {
    // Use balanceEngine.ts  computeHeroBaseStats(heroId, heroType, rarity) to get these values
    base_hp: 0, base_p_atk: 0, base_m_atk: 0, base_p_def: 0, base_m_def: 0, base_speed: 0,
    growth_hp: 0, growth_p_atk: 0, growth_m_atk: 0, growth_p_def: 0, growth_m_def: 0,
  },
  sprites: {
    idleUrl:      null,        // Cloudinary idle pose URL
    actionUrl:    null,        // Cloudinary action pose URL
    actionMethod: 'chroma',   // 'chroma' | 'bgremoval'
    isHumanHero:  true,        // true for humanoid characters; false for slimes / creatures
    appearsAsEnemy:      false,
    enemyNeedsChroma:    false,
    enemyNeedsBgRemoval: false,
  },
  // sk2BeforeSk1: true,       // Only for Assassin-style heroes (check SK2 before SK1)
  skills: [
    // ── Slot 0: Basic Attack ────────────────────────────────────────────────
    {
      name: 'Basic Attack', description: 'Short description.',
      ratioLevels: [], iconUrl: null,
      slot: 0, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
      targetType: 'single', damageRatio: 1.00,
      moveType: 'melee_dash', sfxKey: 'punch',
    },
    // ── Slot 1: SK1 — unlocks Lv1 ──────────────────────────────────────────
    {
      name: 'Skill 1 Name', description: 'Full description here.',
      ratioLevels: [
        { label: 'Damage (P.ATK)', values: ['X%', 'Y%', 'Z%', 'W%'] },
      ],
      iconUrl: null,
      slot: 1, unlockLevel: 1, skillType: 'damage', damageType: 'physical',
      targetType: 'single', damageRatio: 1.00,
      moveType: 'melee_dash', sfxKey: 'punch',
    },
    // ── Slot 2: SK2 — unlocks Lv21 ─────────────────────────────────────────
    {
      name: 'Skill 2 Name', description: 'Full description here.',
      ratioLevels: [
        { label: 'Damage (P.ATK)', values: ['X%', 'Y%', 'Z%', 'W%'] },
      ],
      iconUrl: null,
      slot: 2, unlockLevel: 21, skillType: 'damage', damageType: 'physical',
      targetType: 'single', damageRatio: 1.00,
      moveType: 'melee_dash', sfxKey: 'punch',
    },
    // ── Slot 3: Passive — unlocks Lv41 ─────────────────────────────────────
    {
      name: 'Passive Name', description: 'Passive description.',
      ratioLevels: [],
      iconUrl: null,
      slot: 3, unlockLevel: 41, skillType: 'passive', damageType: 'none',
      targetType: 'passive', damageRatio: 0.00,
      moveType: 'passive', sfxKey: 'none',
      // passiveType: 'on_kill_patk_stack',  maxStacks: 3,
    },
    // ── Slot 4: ULT — unlocks Lv61 ─────────────────────────────────────────
    {
      name: 'Ult Name', description: 'Ult description.',
      ratioLevels: [
        { label: 'Damage All (P.ATK)', values: ['X%', 'Y%', 'Z%', 'W%'] },
      ],
      iconUrl: null,
      slot: 4, unlockLevel: 61, skillType: 'damage', damageType: 'physical',
      targetType: 'all_enemies', damageRatio: 1.00,
      moveType: 'melee_aoe_center', sfxKey: 'punch',
    },
  ],
},
*/
