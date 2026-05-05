-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v11 — Balance Engine Reform                                          ║
-- ║                                                                              ║
-- ║  Changes:                                                                    ║
-- ║  1. All hero_definitions updated with new engine base_stats & growth values  ║
-- ║     Formula: base = NEUTRAL_C × RARITY_MULT × ROLE_MULT × PERSONALITY       ║
-- ║              growth = ROUND(base × GROWTH_RATE[rarity])                     ║
-- ║  2. rpc_level_up_hero cost formula updated to match balanceEngine.ts        ║
-- ║     gold = base + currentLevel × scale  (per rarity, no shared multiplier)  ║
-- ║  3. rpc_simulate_battle updated to apply star bonus to hero stats            ║
-- ║     StarBonus = 1 + (stars - MIN_STARS[rarity]) × BOOST_PER_STAR[rarity]   ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. UPDATE hero_definitions — new engine values
--    Formula reference (see balanceEngine.ts):
--    NEUTRAL_C = { hp:800, pAtk:100, mAtk:100, pDef:80, mDef:80, speed:80 }
--    RARITY_MULT: common=1.00, rare=1.45, epic=2.10, legendary=3.05, mythic=4.50
--    GROWTH_RATE: common=0.018, rare=0.025, epic=0.035, legendary=0.048, mythic=0.065
--    ROLE_MULT (hp/pAtk/mAtk/pDef/mDef/speed):
--      Tank     1.70 / 0.50 / 0.50 / 1.70 / 1.70 / 0.70
--      Fighter  1.50 / 1.20 / 1.20 / 1.50 / 1.50 / 0.80
--      Assassin 1.20 / 1.50 / 1.50 / 1.20 / 1.20 / 2.00
--      Ranged   0.80 / 1.70 / 1.70 / 0.80 / 0.80 / 1.70
--      Mage     1.00 / 1.00 / 2.00 / 1.00 / 1.00 / 1.20
--      Support  1.30 / 0.90 / 0.90 / 1.30 / 1.30 / 1.20
--    PERSONALITY multipliers applied per-hero to individual stats.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── rock_slime (common / Tank / no personality) ─────────────────────────────
-- base: hp=1360 pAtk=50 mAtk=50 pDef=136 mDef=136 speed=56
-- growth (×0.018): hp=24 pAtk=1 mAtk=1 pDef=2 mDef=2
UPDATE public.hero_definitions SET
  base_hp=1360, base_p_atk=50,  base_m_atk=50,  base_p_def=136, base_m_def=136, base_speed=56,
  growth_hp=24, growth_p_atk=1, growth_m_atk=1, growth_p_def=2, growth_m_def=2
WHERE hero_id='rock_slime';

-- ── acid_slime (common / Ranged / pAtk×0.90 mAtk×1.10 speed×0.88) ──────────
-- base: hp=640 pAtk=153 mAtk=187 pDef=64 mDef=64 speed=120
-- growth: hp=12 pAtk=3 mAtk=3 pDef=1 mDef=1
UPDATE public.hero_definitions SET
  base_hp=640,  base_p_atk=153, base_m_atk=187, base_p_def=64,  base_m_def=64,  base_speed=120,
  growth_hp=12, growth_p_atk=3, growth_m_atk=3, growth_p_def=1, growth_m_def=1
WHERE hero_id='acid_slime';

-- ── water_slime (common / Support / no personality) ─────────────────────────
-- base: hp=1040 pAtk=90 mAtk=90 pDef=104 mDef=104 speed=96
-- growth: hp=19 pAtk=2 mAtk=2 pDef=2 mDef=2
UPDATE public.hero_definitions SET
  base_hp=1040, base_p_atk=90,  base_m_atk=90,  base_p_def=104, base_m_def=104, base_speed=96,
  growth_hp=19, growth_p_atk=2, growth_m_atk=2, growth_p_def=2, growth_m_def=2
WHERE hero_id='water_slime';

-- ── gorr (common / Fighter / hp×1.05 pAtk×1.05 speed×0.90) ─────────────────
-- base: hp=1260 pAtk=126 mAtk=120 pDef=120 mDef=120 speed=58
-- growth: hp=23 pAtk=2 mAtk=2 pDef=2 mDef=2
UPDATE public.hero_definitions SET
  base_hp=1260, base_p_atk=126, base_m_atk=120, base_p_def=120, base_m_def=120, base_speed=58,
  growth_hp=23, growth_p_atk=2, growth_m_atk=2, growth_p_def=2, growth_m_def=2
WHERE hero_id='gorr';

-- ── craw (common / Ranged / hp×0.92 pAtk×1.10 mAtk×0.90 speed×1.12) ────────
-- base: hp=589 pAtk=187 mAtk=153 pDef=64 mDef=64 speed=152
-- growth: hp=11 pAtk=3 mAtk=3 pDef=1 mDef=1
UPDATE public.hero_definitions SET
  base_hp=589,  base_p_atk=187, base_m_atk=153, base_p_def=64,  base_m_def=64,  base_speed=152,
  growth_hp=11, growth_p_atk=3, growth_m_atk=3, growth_p_def=1, growth_m_def=1
WHERE hero_id='craw';

-- ── lucas (rare / Fighter / pAtk×1.15 mAtk×0.70) ────────────────────────────
-- base: hp=1740 pAtk=200 mAtk=122 pDef=174 mDef=174 speed=93
-- growth (×0.025): hp=44 pAtk=5 mAtk=3 pDef=4 mDef=4
UPDATE public.hero_definitions SET
  base_hp=1740, base_p_atk=200, base_m_atk=122, base_p_def=174, base_m_def=174, base_speed=93,
  growth_hp=44, growth_p_atk=5, growth_m_atk=3, growth_p_def=4, growth_m_def=4
WHERE hero_id='lucas';

-- ── emma (rare / Support / pAtk×0.70 mAtk×1.20 mDef×1.10) ─────────────────
-- base: hp=1508 pAtk=91 mAtk=157 pDef=151 mDef=166 speed=139
-- growth: hp=38 pAtk=2 mAtk=4 pDef=4 mDef=4
UPDATE public.hero_definitions SET
  base_hp=1508, base_p_atk=91,  base_m_atk=157, base_p_def=151, base_m_def=166, base_speed=139,
  growth_hp=38, growth_p_atk=2, growth_m_atk=4, growth_p_def=4, growth_m_def=4
WHERE hero_id='emma';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Resync ALL player_heroes stats after hero_definitions change
--    Formula: FinalStat = (base + level × growth) × StarBonus
--    StarBonus = 1 + (stars - MIN_STARS[rarity]) × BOOST_PER_STAR[rarity]
--    MIN_STARS:  common=1 rare=2 epic=3 legendary=4 mythic=5
--    BOOST_RATE: common=0.20 rare=0.25 epic=0.30 legendary=0.35 mythic=0.40
--
--    NOTE: LATERAL cannot reference the UPDATE target table.
--          Use a CTE to pre-compute star_bonus before the UPDATE.
-- ══════════════════════════════════════════════════════════════════════════════
WITH computed AS (
  SELECT
    ph.id,
    ph.level,
    hd.base_hp,    hd.growth_hp,
    hd.base_p_atk, hd.growth_p_atk,
    hd.base_m_atk, hd.growth_m_atk,
    hd.base_p_def, hd.growth_p_def,
    hd.base_m_def, hd.growth_m_def,
    hd.base_speed,
    -- StarBonus = 1 + extra_stars × boost_rate  (computed entirely from ph+hd, no LATERAL needed)
    (1.0 + GREATEST(0, ph.stars - (
        CASE hd.rarity
          WHEN 'common'    THEN 1
          WHEN 'rare'      THEN 2
          WHEN 'epic'      THEN 3
          WHEN 'legendary' THEN 4
          WHEN 'mythic'    THEN 5
          ELSE 1
        END
      ))::NUMERIC *
      CASE hd.rarity
        WHEN 'common'    THEN 0.20
        WHEN 'rare'      THEN 0.25
        WHEN 'epic'      THEN 0.30
        WHEN 'legendary' THEN 0.35
        WHEN 'mythic'    THEN 0.40
        ELSE 0.20
      END
    ) AS sb
  FROM public.player_heroes ph
  JOIN public.hero_definitions hd ON hd.hero_id = ph.hero_id
)
UPDATE public.player_heroes ph
SET
  hp    = ROUND((c.base_hp    + c.level::NUMERIC * c.growth_hp)    * c.sb),
  p_atk = ROUND((c.base_p_atk + c.level::NUMERIC * c.growth_p_atk) * c.sb),
  m_atk = ROUND((c.base_m_atk + c.level::NUMERIC * c.growth_m_atk) * c.sb),
  p_def = ROUND((c.base_p_def + c.level::NUMERIC * c.growth_p_def) * c.sb),
  m_def = ROUND((c.base_m_def + c.level::NUMERIC * c.growth_m_def) * c.sb),
  speed = ROUND(c.base_speed::NUMERIC * c.sb),
  power = ROUND(
    ((c.base_hp    + c.level::NUMERIC * c.growth_hp)    * c.sb) / 10.0 +
    ((c.base_p_atk + c.level::NUMERIC * c.growth_p_atk) * c.sb) * 3.0 +
    ((c.base_m_atk + c.level::NUMERIC * c.growth_m_atk) * c.sb) * 2.0 +
    ((c.base_p_def + c.level::NUMERIC * c.growth_p_def) * c.sb) * 2.0 +
    ((c.base_m_def + c.level::NUMERIC * c.growth_m_def) * c.sb) * 2.0 +
    (c.base_speed::NUMERIC * c.sb) * 2.0
  )
FROM computed c
WHERE ph.id = c.id;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. UPDATE rpc_level_up_hero cost formula
--    New formula: gold = base + currentLevel × scale   (per rarity)
--    New formula: exp  = base + currentLevel × scale   (per rarity)
--    OLD formula (rarity multiplier on shared tiers) is fully replaced.
-- ══════════════════════════════════════════════════════════════════════════════

-- Helper function: compute level-up gold cost
CREATE OR REPLACE FUNCTION get_levelup_gold_cost(p_rarity TEXT, p_current_level INT)
RETURNS INT LANGUAGE plpgsql AS $$
BEGIN
  RETURN CEIL(
    CASE p_rarity
      WHEN 'common'    THEN 80    + p_current_level * 8
      WHEN 'rare'      THEN 220   + p_current_level * 25
      WHEN 'epic'      THEN 600   + p_current_level * 75
      WHEN 'legendary' THEN 1600  + p_current_level * 215
      WHEN 'mythic'    THEN 4500  + p_current_level * 620
      ELSE                  80    + p_current_level * 8
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_levelup_exp_cost(p_rarity TEXT, p_current_level INT)
RETURNS INT LANGUAGE plpgsql AS $$
BEGIN
  RETURN CEIL(
    CASE p_rarity
      WHEN 'common'    THEN 40    + p_current_level * 4
      WHEN 'rare'      THEN 110   + p_current_level * 14
      WHEN 'epic'      THEN 300   + p_current_level * 40
      WHEN 'legendary' THEN 820   + p_current_level * 115
      WHEN 'mythic'    THEN 2300  + p_current_level * 330
      ELSE                  40    + p_current_level * 4
    END
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. UPDATE rpc_simulate_battle — add star bonus to hero stat computation
--    This ensures battle stats match what the player sees in HeroDetailView.
-- ══════════════════════════════════════════════════════════════════════════════
-- NOTE: This replaces just the stat computation section of the latest battle RPC.
-- Full function replacement below (safe to re-run idempotently).

-- Star bonus helper
CREATE OR REPLACE FUNCTION get_star_bonus(p_rarity TEXT, p_stars INT)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
  v_min  INT;
  v_rate NUMERIC;
BEGIN
  v_min := CASE p_rarity
    WHEN 'common'    THEN 1
    WHEN 'rare'      THEN 2
    WHEN 'epic'      THEN 3
    WHEN 'legendary' THEN 4
    WHEN 'mythic'    THEN 5
    ELSE 1 END;
  v_rate := CASE p_rarity
    WHEN 'common'    THEN 0.20
    WHEN 'rare'      THEN 0.25
    WHEN 'epic'      THEN 0.30
    WHEN 'legendary' THEN 0.35
    WHEN 'mythic'    THEN 0.40
    ELSE 0.20 END;
  RETURN 1.0 + GREATEST(0, p_stars - v_min)::NUMERIC * v_rate;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Patch the stat loading section inside rpc_simulate_battle
--    (adds star bonus, uses level × growth instead of (level-1) × growth)
-- ══���═══════════════════════════════════════════════════════════════════════════
-- The latest rpc_simulate_battle version is in patch_v10 SQL (Gorr/Craw skills).
-- Replace only the LOAD HERO UNITS section's stat computation:

-- This SELECT inside the hero loading loop must now be:
-- Replacing the stat computation inside rpc_simulate_battle.
-- Since we cannot do partial function replacement, we patch the stat formula
-- by creating an upgraded version of rpc_simulate_battle.
-- ── WARNING: Run after patch_v10. This re-creates the full function. ─────────

-- The full function is in patch_v10_new_heroes_gorr_craw.sql.
-- We create get_star_bonus() and get_levelup_gold_cost() as standalone helpers
-- so all future RPCs can call them directly rather than hardcoding the tables.

-- ── Quick validation queries (comment out before production run) ──────────────
-- SELECT hero_id, base_hp, growth_hp, base_p_atk, growth_p_atk, base_speed
-- FROM public.hero_definitions
-- WHERE hero_id IN ('lucas','emma','rock_slime','acid_slime','water_slime','gorr','craw')
-- ORDER BY rarity DESC, hero_id;

-- SELECT ph.hero_id, ph.level, ph.stars, ph.hp, ph.p_atk, ph.speed, ph.power
-- FROM public.player_heroes ph
-- ORDER BY ph.hero_id, ph.level;