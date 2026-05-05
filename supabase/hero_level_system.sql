-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Hero Level-Up System — v1                                                  ║
-- ║  Jalankan di: Supabase Dashboard → SQL Editor                              ║
-- ╠══════════════════════════════════════════════════════════════════════════════╣
-- ║  Resources consumed per level-up:                                           ║
-- ║    • hero_exp   — Currency Pool (profiles.hero_exp)                         ║
-- ║    • gold       — Gold coin     (profiles.gold)                             ║
-- ║    • breakthrough_stones — Every 20 levels (new column, profiles)           ║
-- ║                                                                              ║
-- ║  Rarity cost multipliers (relative to C/common baseline):                   ║
-- ║    C (common)   : 1.0×  EXP/Gold   |  1.0× Stones                         ║
-- ║    B (rare)     : 1.8×  EXP/Gold   |  1.5× Stones                         ║
-- ║    A (epic)     : 3.0×  EXP/Gold   |  2.0× Stones                         ║
-- ║    S (legendary): 5.0×  EXP/Gold   |  3.0× Stones                         ║
-- ║    SS (mythic)  : 8.5×  EXP/Gold   |  5.0× Stones                         ║
-- ║                                                                              ║
-- ║  Base cost per level (Rarity C) — increases with hero level bracket:        ║
-- ║    Lv   1– 40 :   80 EXP,   500 Gold                                       ║
-- ║    Lv  41– 80 :  160 EXP, 1 000 Gold                                       ║
-- ║    Lv  81–120 :  300 EXP, 2 000 Gold                                       ║
-- ║    Lv 121–160 :  550 EXP, 3 800 Gold                                       ║
-- ║    Lv 161–200 : 1 000 EXP, 7 000 Gold                                      ║
-- ║    Lv 201–240 : 1 800 EXP,13 000 Gold                                      ║
-- ║                                                                              ║
-- ║  Breakthrough stone base (per milestone, Rarity C):                         ║
-- ║    Lv 20/40: 1 | Lv 60/80: 2 | Lv 100/120: 3 | Lv 140/160: 4             ║
-- ║    Lv 180: 5   | Lv 200: 6   | Lv 220: 8     | Lv 240: 10                 ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Add breakthrough_stones column to profiles ─────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS breakthrough_stones INTEGER DEFAULT 0;

-- Give existing players 20 starter stones (once)
UPDATE public.profiles
SET breakthrough_stones = 20
WHERE breakthrough_stones = 0;

-- ── 2. Cost calculator function ───────────────────────────────────────────────
-- Returns cost to go from current_level → current_level+1
-- Used by both server validation AND client preview (must stay in sync)
CREATE OR REPLACE FUNCTION public.get_hero_level_cost(
  p_rarity       TEXT,    -- 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  p_current_level INT      -- hero's current level (before the level-up)
)
RETURNS TABLE(
  hero_exp_cost          INT,
  gold_cost              INT,
  breakthrough_stone_cost INT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_next_lv   INT  := p_current_level + 1;
  v_exp_base  INT;
  v_gold_base INT;
  v_stone_base INT := 0;
  v_exp_mult  NUMERIC;
  v_gold_mult NUMERIC;
  v_stone_mult NUMERIC;
BEGIN
  -- Base costs by level bracket (Rarity C baseline)
  IF    p_current_level < 40  THEN v_exp_base := 80;    v_gold_base := 500;
  ELSIF p_current_level < 80  THEN v_exp_base := 160;   v_gold_base := 1000;
  ELSIF p_current_level < 120 THEN v_exp_base := 300;   v_gold_base := 2000;
  ELSIF p_current_level < 160 THEN v_exp_base := 550;   v_gold_base := 3800;
  ELSIF p_current_level < 200 THEN v_exp_base := 1000;  v_gold_base := 7000;
  ELSE                              v_exp_base := 1800;  v_gold_base := 13000;
  END IF;

  -- Rarity multipliers
  CASE LOWER(p_rarity)
    WHEN 'common'    THEN v_exp_mult := 1.0;  v_gold_mult := 1.0;  v_stone_mult := 1.0;
    WHEN 'rare'      THEN v_exp_mult := 1.8;  v_gold_mult := 1.8;  v_stone_mult := 1.5;
    WHEN 'epic'      THEN v_exp_mult := 3.0;  v_gold_mult := 3.0;  v_stone_mult := 2.0;
    WHEN 'legendary' THEN v_exp_mult := 5.0;  v_gold_mult := 5.0;  v_stone_mult := 3.0;
    WHEN 'mythic'    THEN v_exp_mult := 8.5;  v_gold_mult := 8.5;  v_stone_mult := 5.0;
    ELSE                  v_exp_mult := 1.0;  v_gold_mult := 1.0;  v_stone_mult := 1.0;
  END CASE;

  -- Breakthrough stone at every 20th level
  IF v_next_lv % 20 = 0 THEN
    IF    v_next_lv <= 40  THEN v_stone_base := 1;
    ELSIF v_next_lv <= 80  THEN v_stone_base := 2;
    ELSIF v_next_lv <= 120 THEN v_stone_base := 3;
    ELSIF v_next_lv <= 160 THEN v_stone_base := 4;
    ELSIF v_next_lv <= 180 THEN v_stone_base := 5;
    ELSIF v_next_lv <= 200 THEN v_stone_base := 6;
    ELSIF v_next_lv <= 220 THEN v_stone_base := 8;
    ELSE                        v_stone_base := 10;
    END IF;
  END IF;

  RETURN QUERY SELECT
    CEIL(v_exp_base  * v_exp_mult)::INT,
    CEIL(v_gold_base * v_gold_mult)::INT,
    CEIL(v_stone_base * v_stone_mult)::INT;
END;
$$;

-- ── 3. Level-up RPC ───────────────────────────────────────────────────────────
-- All validation + resource deduction runs server-side.
-- Client cannot spoof stats or bypass cost.
CREATE OR REPLACE FUNCTION public.rpc_level_up_hero(
  p_hero_id      TEXT,
  p_levels_to_gain INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_player_hero  RECORD;
  v_hero_def     RECORD;
  v_profile      RECORD;
  v_cur_lv       INT;
  v_new_lv       INT;
  v_gain         INT;
  v_total_exp    INT := 0;
  v_total_gold   INT := 0;
  v_total_stones INT := 0;
  v_costs        RECORD;
  i              INT;
BEGIN
  -- ── Auth guard ──────────────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  -- ── Validate gain range ─────────────────────────────────────────────────────
  IF p_levels_to_gain < 1 OR p_levels_to_gain > 240 THEN
    RETURN jsonb_build_object('error','invalid_gain',
      'message','p_levels_to_gain must be 1–240');
  END IF;

  -- ── Fetch player hero ───────────────────────────────────────────────────────
  SELECT * INTO v_player_hero
  FROM   public.player_heroes
  WHERE  user_id = v_uid AND hero_id = p_hero_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','not_owned',
      'message','Hero not in your collection');
  END IF;

  v_cur_lv := COALESCE(v_player_hero.level, 1);

  -- ── Already maxed? ──────────────────────────────────────────────────────────
  IF v_cur_lv >= 240 THEN
    RETURN jsonb_build_object('error','max_level',
      'message','Hero is already at max level (240)');
  END IF;

  -- ── Cap to max 240 ──────────────────────────────────────────────────────────
  v_gain   := LEAST(p_levels_to_gain, 240 - v_cur_lv);
  v_new_lv := v_cur_lv + v_gain;

  -- ── Fetch hero rarity ───────────────────────────────────────────────────────
  SELECT rarity INTO v_hero_def
  FROM   public.hero_definitions
  WHERE  hero_id = p_hero_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','hero_def_missing');
  END IF;

  -- ── Accumulate total cost ───────────────────────────────────────────────────
  FOR i IN 0..(v_gain - 1) LOOP
    SELECT * INTO v_costs
    FROM   public.get_hero_level_cost(v_hero_def.rarity, v_cur_lv + i);
    v_total_exp    := v_total_exp    + v_costs.hero_exp_cost;
    v_total_gold   := v_total_gold   + v_costs.gold_cost;
    v_total_stones := v_total_stones + v_costs.breakthrough_stone_cost;
  END LOOP;

  -- ── Fetch profile ───────────────────────────────────────────────────────────
  SELECT * INTO v_profile
  FROM   public.profiles
  WHERE  id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','profile_missing');
  END IF;

  -- ── Resource validation ─────────────────────────────────────────────────────
  IF v_profile.hero_exp < v_total_exp THEN
    RETURN jsonb_build_object(
      'error','insufficient_exp',
      'required', v_total_exp,
      'available', v_profile.hero_exp
    );
  END IF;

  IF v_profile.gold < v_total_gold THEN
    RETURN jsonb_build_object(
      'error','insufficient_gold',
      'required', v_total_gold,
      'available', v_profile.gold
    );
  END IF;

  IF v_total_stones > 0 AND COALESCE(v_profile.breakthrough_stones, 0) < v_total_stones THEN
    RETURN jsonb_build_object(
      'error','insufficient_stones',
      'required', v_total_stones,
      'available', COALESCE(v_profile.breakthrough_stones, 0)
    );
  END IF;

  -- ── Deduct resources ────────────────────────────────────────────────────────
  UPDATE public.profiles SET
    hero_exp            = hero_exp - v_total_exp,
    gold                = gold - v_total_gold,
    breakthrough_stones = COALESCE(breakthrough_stones, 0) - v_total_stones,
    updated_at          = NOW()
  WHERE id = v_uid;

  -- ── Increment hero level ────────────────────────────────────────────────────
  UPDATE public.player_heroes SET
    level      = v_new_lv,
    updated_at = NOW()
  WHERE user_id = v_uid AND hero_id = p_hero_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'hero_id',       p_hero_id,
    'old_level',     v_cur_lv,
    'new_level',     v_new_lv,
    'levels_gained', v_gain,
    'exp_spent',     v_total_exp,
    'gold_spent',    v_total_gold,
    'stones_spent',  v_total_stones,
    'new_hero_exp',  v_profile.hero_exp - v_total_exp,
    'new_gold',      v_profile.gold     - v_total_gold,
    'new_stones',    COALESCE(v_profile.breakthrough_stones, 0) - v_total_stones
  );
END;
$$;

-- ── 4. Grant execute permission ───────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_level_up_hero(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hero_level_cost(TEXT, INT) TO authenticated, anon;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'profiles'
  AND  column_name = 'breakthrough_stones';

-- Preview sample costs (Rarity C, first 5 levels)
SELECT i AS "to_lv", c.*
FROM   generate_series(1, 5) AS i,
       LATERAL public.get_hero_level_cost('common', i - 1) AS c;
