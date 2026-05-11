-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v17 — Server-Authoritative Stats                                      ║
-- ║                                                                              ║
-- ║  PROBLEM FIXED:                                                              ║
-- ║  Before this patch, player_heroes stat columns (hp/p_atk/m_atk/p_def/      ║
-- ║  m_def/speed/power) were computed CLIENT-SIDE after level-up and written    ║
-- ║  back to the DB via REST upsert. This opened a window for stat manipulation.║
-- ║                                                                              ║
-- ║  CHANGES:                                                                    ║
-- ║  1. compute_hero_stats() — canonical server-side stat helper                ║
-- ║     Formula: (base + level × growth) × get_star_bonus(rarity, stars)       ║
-- ║  2. rpc_level_up_hero    — now writes ALL stat columns atomically (+ power) ║
-- ║  3. rpc_reset_hero_level — now resets to correct Lv1 stats w/ star bonus    ║
-- ║  4. rpc_star_up          — now recomputes ALL stat columns after star change ║
-- ║  5. rpc_gacha_pull       — now inserts correct initial stats for new heroes  ║
-- ║  6. TRIGGER — Auto-compute stats on ANY INSERT into player_heroes            ║
-- ║  7. Resync UPDATE        — fixes all existing player_heroes rows             ║
-- ║  8. LOCK DOWN RLS — Remove direct UPDATE access from authenticated role    ║
-- ║                                                                              ║
-- ║  DEPENDENCY: Requires get_star_bonus() from patch_v11_balance_engine.sql    ║
-- ║              Run patch_v11 first if not already applied.                    ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. compute_hero_stats — THE SINGLE SOURCE OF TRUTH for stat computation
--    Formula: stat = ROUND((base + level × growth) × get_star_bonus(rarity, stars))
--    Speed: no level scaling — speed = ROUND(base_speed × star_bonus)
--    Power: hp/10 + p_atk×3 + m_atk×2 + p_def×2 + m_def×2 + speed×2
--
--    Called by: rpc_level_up_hero, rpc_reset_hero_level, rpc_star_up,
--               rpc_gacha_pull, and the resync UPDATE below.
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.compute_hero_stats(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.compute_hero_stats(
  p_hero_id TEXT,
  p_level   INT,
  p_stars   INT
)
RETURNS TABLE(
  o_hp    INT,
  o_p_atk INT,
  o_m_atk INT,
  o_p_def INT,
  o_m_def INT,
  o_speed INT,
  o_power INT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_def RECORD;
  v_sb  NUMERIC;
  v_hp  INT; v_pa INT; v_ma INT; v_pd INT; v_md INT; v_sp INT; v_pw INT;
BEGIN
  SELECT * INTO v_def FROM public.hero_definitions WHERE hero_id = p_hero_id;

  -- Fallback: unknown hero → return all zeros (prevents NULL poisoning in callers)
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0,0,0,0,0,0,0;
    RETURN;
  END IF;

  -- Star bonus: 1 + GREATEST(0, stars - min_stars[rarity]) × boost_per_star[rarity]
  v_sb := public.get_star_bonus(v_def.rarity, p_stars);

  -- Core formula — level × growth (NOT level-1; level=1 already adds 1 growth step)
  v_hp := ROUND((v_def.base_hp    + p_level::NUMERIC * v_def.growth_hp)    * v_sb);
  v_pa := ROUND((v_def.base_p_atk + p_level::NUMERIC * v_def.growth_p_atk) * v_sb);
  v_ma := ROUND((v_def.base_m_atk + p_level::NUMERIC * v_def.growth_m_atk) * v_sb);
  v_pd := ROUND((v_def.base_p_def + p_level::NUMERIC * v_def.growth_p_def) * v_sb);
  v_md := ROUND((v_def.base_m_def + p_level::NUMERIC * v_def.growth_m_def) * v_sb);

  -- Speed does NOT scale with level — only star bonus applies
  v_sp := ROUND(v_def.base_speed::NUMERIC * v_sb);

  -- Power formula (mirrors balanceEngine.ts power weight)
  v_pw := ROUND(
    v_hp  / 10.0 +
    v_pa  *  3.0 +
    v_ma  *  2.0 +
    v_pd  *  2.0 +
    v_md  *  2.0 +
    v_sp  *  2.0
  );

  RETURN QUERY SELECT v_hp, v_pa, v_ma, v_pd, v_md, v_sp, v_pw;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_hero_stats(TEXT, INT, INT) TO authenticated, anon;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. rpc_level_up_hero — FULL REPLACEMENT
--    Now writes ALL stat columns atomically using compute_hero_stats.
--    Client receives new resource totals in the response; it must NOT write
--    any stat columns. Client should only call loadPlayerHeroes() to refresh.
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.rpc_level_up_hero(TEXT, INT);

CREATE OR REPLACE FUNCTION public.rpc_level_up_hero(
  p_hero_id        TEXT,
  p_levels_to_gain INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_ph          RECORD;
  v_profile     RECORD;
  v_cur_lv      INT;
  v_new_lv      INT;
  v_gain        INT;
  v_total_exp   INT := 0;
  v_total_gold  INT := 0;
  v_total_stone INT := 0;
  v_costs       RECORD;
  v_stats       RECORD;
  i             INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  IF p_levels_to_gain < 1 OR p_levels_to_gain > 240 THEN
    RETURN jsonb_build_object('error','invalid_gain');
  END IF;

  -- Load hero + def (need stars for stat computation)
  SELECT ph.id, ph.hero_id, ph.level, ph.stars, ph.xp,
         hd.rarity
  INTO   v_ph
  FROM   public.player_heroes ph
  JOIN   public.hero_definitions hd ON hd.hero_id = ph.hero_id
  WHERE  ph.user_id = v_uid AND ph.hero_id = p_hero_id
  FOR UPDATE OF ph;                -- lock row to prevent race conditions

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','not_owned');
  END IF;

  v_cur_lv := COALESCE(v_ph.level, 1);
  IF v_cur_lv >= 240 THEN
    RETURN jsonb_build_object('error','max_level');
  END IF;

  v_gain   := LEAST(p_levels_to_gain, 240 - v_cur_lv);
  v_new_lv := v_cur_lv + v_gain;

  -- Accumulate total cost for all levels being gained
  FOR i IN 0..(v_gain - 1) LOOP
    SELECT * INTO v_costs
    FROM public.get_hero_level_cost(v_ph.rarity, v_cur_lv + i);
    v_total_exp   := v_total_exp   + v_costs.hero_exp_cost;
    v_total_gold  := v_total_gold  + v_costs.gold_cost;
    v_total_stone := v_total_stone + v_costs.breakthrough_stone_cost;
  END LOOP;

  -- Load and lock profile for resource check
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','profile_missing');
  END IF;

  -- Validate resources (server enforces — client cannot bypass)
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
  IF v_total_stone > 0 AND COALESCE(v_profile.breakthrough_stones, 0) < v_total_stone THEN
    RETURN jsonb_build_object(
      'error','insufficient_stones',
      'required', v_total_stone,
      'available', COALESCE(v_profile.breakthrough_stones, 0)
    );
  END IF;

  -- Deduct resources atomically
  UPDATE public.profiles SET
    hero_exp            = hero_exp            - v_total_exp,
    gold                = gold                - v_total_gold,
    breakthrough_stones = COALESCE(breakthrough_stones, 0) - v_total_stone,
    updated_at          = NOW()
  WHERE id = v_uid;

  -- Compute new stats server-side (includes star bonus + correct level×growth formula)
  SELECT * INTO v_stats
  FROM public.compute_hero_stats(p_hero_id, v_new_lv, v_ph.stars);

  -- Update level AND all stat columns atomically — no client can interfere
  UPDATE public.player_heroes SET
    level      = v_new_lv,
    xp         = 0,
    hp         = v_stats.o_hp,
    p_atk      = v_stats.o_p_atk,
    m_atk      = v_stats.o_m_atk,
    p_def      = v_stats.o_p_def,
    m_def      = v_stats.o_m_def,
    speed      = v_stats.o_speed,
    power      = v_stats.o_power,
    updated_at = NOW()
  WHERE user_id = v_uid AND hero_id = p_hero_id;

  -- Return result — client uses these to update its local profile state optimistically
  RETURN jsonb_build_object(
    'ok',            true,
    'hero_id',       p_hero_id,
    'old_level',     v_cur_lv,
    'new_level',     v_new_lv,
    'levels_gained', v_gain,
    'exp_spent',     v_total_exp,
    'gold_spent',    v_total_gold,
    'stones_spent',  v_total_stone,
    'new_hp',        v_stats.o_hp,
    'new_p_atk',     v_stats.o_p_atk,
    'new_m_atk',     v_stats.o_m_atk,
    'new_p_def',     v_stats.o_p_def,
    'new_m_def',     v_stats.o_m_def,
    'new_speed',     v_stats.o_speed,
    'new_power',     v_stats.o_power,
    'new_hero_exp',  v_profile.hero_exp   - v_total_exp,
    'new_gold',      v_profile.gold       - v_total_gold,
    'new_stones',    COALESCE(v_profile.breakthrough_stones, 0) - v_total_stone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_level_up_hero(TEXT, INT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. rpc_reset_hero_level — FULL REPLACEMENT
--    Now resets to Lv1 stats computed server-side (includes star bonus).
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.rpc_reset_hero_level(TEXT);

CREATE OR REPLACE FUNCTION public.rpc_reset_hero_level(p_hero_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID    := auth.uid();
  v_ph          RECORD;
  v_def         RECORD;
  v_profile     RECORD;
  v_cur_lv      INT;
  v_total_exp   INT := 0;
  v_total_gold  INT := 0;
  v_total_stone INT := 0;
  v_costs       RECORD;
  v_stats       RECORD;
  i             INT;
  RESET_GEMS    CONSTANT INT := 100;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  SELECT * INTO v_ph
  FROM public.player_heroes
  WHERE user_id = v_uid AND hero_id = p_hero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','not_owned');
  END IF;

  v_cur_lv := COALESCE(v_ph.level, 1);
  IF v_cur_lv <= 1 THEN
    RETURN jsonb_build_object(
      'error',   'already_lv1',
      'message', 'Hero is already at Level 1.'
    );
  END IF;

  SELECT * INTO v_def FROM public.hero_definitions WHERE hero_id = p_hero_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','hero_def_missing');
  END IF;

  -- Sum up all resources spent getting to current level (to refund them)
  FOR i IN 0..(v_cur_lv - 2) LOOP
    SELECT * INTO v_costs
    FROM public.get_hero_level_cost(v_def.rarity, i);
    v_total_exp   := v_total_exp   + v_costs.hero_exp_cost;
    v_total_gold  := v_total_gold  + v_costs.gold_cost;
    v_total_stone := v_total_stone + v_costs.breakthrough_stone_cost;
  END LOOP;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','profile_missing');
  END IF;

  IF COALESCE(v_profile.gems, 0) < RESET_GEMS THEN
    RETURN jsonb_build_object(
      'error','insufficient_gems',
      'required',  RESET_GEMS,
      'available', COALESCE(v_profile.gems, 0)
    );
  END IF;

  -- Deduct gems, refund exp/gold/stones
  UPDATE public.profiles SET
    gems                = gems                - RESET_GEMS,
    hero_exp            = hero_exp            + v_total_exp,
    gold                = gold                + v_total_gold,
    breakthrough_stones = COALESCE(breakthrough_stones, 0) + v_total_stone,
    updated_at          = NOW()
  WHERE id = v_uid;

  -- Compute Lv1 stats server-side with CURRENT STARS (star bonus preserved)
  SELECT * INTO v_stats
  FROM public.compute_hero_stats(p_hero_id, 1, v_ph.stars);

  -- Reset level AND all stat columns atomically
  UPDATE public.player_heroes SET
    level      = 1,
    xp         = 0,
    hp         = v_stats.o_hp,
    p_atk      = v_stats.o_p_atk,
    m_atk      = v_stats.o_m_atk,
    p_def      = v_stats.o_p_def,
    m_def      = v_stats.o_m_def,
    speed      = v_stats.o_speed,
    power      = v_stats.o_power,
    updated_at = NOW()
  WHERE user_id = v_uid AND hero_id = p_hero_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'hero_id',        p_hero_id,
    'old_level',      v_cur_lv,
    'gems_spent',     RESET_GEMS,
    'exp_refunded',   v_total_exp,
    'gold_refunded',  v_total_gold,
    'stones_refunded',v_total_stone,
    'new_gems',       COALESCE(v_profile.gems, 0) - RESET_GEMS,
    'new_hero_exp',   COALESCE(v_profile.hero_exp, 0) + v_total_exp,
    'new_gold',       COALESCE(v_profile.gold, 0)     + v_total_gold
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reset_hero_level(TEXT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. rpc_star_up — FULL REPLACEMENT
--    Now recomputes ALL stat columns after incrementing stars.
--    Uses hero's current level so stats scale correctly with new star tier.
-- ═════════════════════════════════════════════════════════��════════════════════
DROP FUNCTION IF EXISTS public.rpc_star_up(UUID);

CREATE OR REPLACE FUNCTION public.rpc_star_up(
  p_player_hero_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID  := auth.uid();
  v_ph          RECORD;
  v_stars       INT;
  v_target_tier INT;
  v_shard_cost  INT;
  v_gold_cost   INT;
  v_shard_bal   INT;
  v_gold_bal    INT;
  v_stats       RECORD;
  MAX_STARS     CONSTANT INT := 16;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  -- Fetch and verify ownership — also need level for stat recomputation
  SELECT ph.id, ph.hero_id, ph.stars, ph.level, hd.rarity
    INTO v_ph
  FROM public.player_heroes ph
  JOIN public.hero_definitions hd ON hd.hero_id = ph.hero_id
  WHERE ph.id = p_player_hero_id AND ph.user_id = v_uid
  FOR UPDATE OF ph;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','hero_not_found');
  END IF;

  v_stars := COALESCE(v_ph.stars, 1);

  IF v_stars >= MAX_STARS THEN
    RETURN jsonb_build_object('error','max_stars');
  END IF;

  -- Cost tier: which color tier the NEXT star enters
  -- stars 1–5 → tier0 (yellow), 6–10 → tier1 (red), 11–15 → tier2 (white), 16 → tier3 (rainbow)
  v_target_tier := LEAST(3, v_stars / 5);

  -- Shard cost per tier
  v_shard_cost := CASE v_target_tier
    WHEN 0 THEN 60
    WHEN 1 THEN 80
    WHEN 2 THEN 100
    ELSE        120
  END;

  -- Gold cost per rarity × tier
  v_gold_cost := CASE v_ph.rarity
    WHEN 'common'    THEN (ARRAY[    500,    1000,    2000,    4000])[v_target_tier + 1]
    WHEN 'rare'      THEN (ARRAY[   2000,    4000,    8000,   16000])[v_target_tier + 1]
    WHEN 'epic'      THEN (ARRAY[   5000,   10000,   20000,   40000])[v_target_tier + 1]
    WHEN 'legendary' THEN (ARRAY[  15000,   30000,   60000,  120000])[v_target_tier + 1]
    WHEN 'mythic'    THEN (ARRAY[  50000,  100000,  200000,  400000])[v_target_tier + 1]
    ELSE                  500
  END;

  -- Check shard balance
  SELECT COALESCE(amount, 0) INTO v_shard_bal
  FROM public.hero_shards
  WHERE user_id = v_uid AND hero_id = v_ph.hero_id;

  v_shard_bal := COALESCE(v_shard_bal, 0);
  IF v_shard_bal < v_shard_cost THEN
    RETURN jsonb_build_object(
      'error','insufficient_shards',
      'have', v_shard_bal,
      'need', v_shard_cost
    );
  END IF;

  -- Check and lock gold
  SELECT gold INTO v_gold_bal FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_gold_bal < v_gold_cost THEN
    RETURN jsonb_build_object(
      'error','insufficient_gold',
      'have', v_gold_bal,
      'need', v_gold_cost
    );
  END IF;

  -- Deduct gold + shards
  UPDATE public.profiles    SET gold   = gold   - v_gold_cost    WHERE id = v_uid;
  UPDATE public.hero_shards SET amount = amount - v_shard_cost
    WHERE user_id = v_uid AND hero_id = v_ph.hero_id;

  -- Compute new stats at current level + new star count (server-authoritative)
  SELECT * INTO v_stats
  FROM public.compute_hero_stats(v_ph.hero_id, v_ph.level, v_stars + 1);

  -- Increment stars AND update all stat columns atomically
  UPDATE public.player_heroes SET
    stars      = v_stars + 1,
    hp         = v_stats.o_hp,
    p_atk      = v_stats.o_p_atk,
    m_atk      = v_stats.o_m_atk,
    p_def      = v_stats.o_p_def,
    m_def      = v_stats.o_m_def,
    speed      = v_stats.o_speed,
    power      = v_stats.o_power,
    updated_at = NOW()
  WHERE id = p_player_hero_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'new_stars',  v_stars + 1,
    'shard_cost', v_shard_cost,
    'gold_cost',  v_gold_cost,
    'new_hp',     v_stats.o_hp,
    'new_p_atk',  v_stats.o_p_atk,
    'new_power',  v_stats.o_power
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_star_up(UUID) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. rpc_gacha_pull — FULL REPLACEMENT
--    New heroes are now inserted with ALL stat columns properly computed
--    from hero_definitions using the canonical formula.
--    Starting stars = hero_definitions.stars (not hardcoded 1).
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.rpc_gacha_pull(TEXT, INT);

CREATE OR REPLACE FUNCTION public.rpc_gacha_pull(
  p_pool   TEXT,
  p_count  INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID    := auth.uid();
  v_cost         INT;
  v_balance      INT;
  v_results      JSONB   := '[]'::JSONB;
  v_roll         FLOAT;
  v_rarity       TEXT;
  v_hero_id      TEXT;
  v_hero_name    TEXT;
  v_init_stars   INT;
  v_has_hero     BOOLEAN;
  v_shards       INT;
  v_stats        RECORD;
  v_pool_c       TEXT[]  := ARRAY['rock_slime','acid_slime','water_slime'];
  v_pool_b       TEXT[]  := ARRAY['emma','lucas'];
  i              INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  IF p_count NOT IN (1,10) THEN
    RETURN jsonb_build_object('error','invalid_count');
  END IF;
  IF p_pool NOT IN ('normal','epic','superior') THEN
    RETURN jsonb_build_object('error','invalid_pool');
  END IF;
  IF p_pool IN ('epic','superior') THEN
    RETURN jsonb_build_object('error','pool_unavailable');
  END IF;

  -- Cost schedule (normal pool only currently active)
  v_cost := CASE
    WHEN p_pool='normal'   AND p_count=1  THEN 10
    WHEN p_pool='normal'   AND p_count=10 THEN 90
    WHEN p_pool='epic'     AND p_count=1  THEN 30
    WHEN p_pool='epic'     AND p_count=10 THEN 270
    WHEN p_pool='superior' AND p_count=1  THEN 80
    WHEN p_pool='superior' AND p_count=10 THEN 720
    ELSE 9999
  END;

  -- Check + lock gem balance
  SELECT gems INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error','profile_not_found');
  END IF;
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object(
      'error','insufficient_gems',
      'have', v_balance,
      'need', v_cost
    );
  END IF;

  UPDATE public.profiles SET gems = gems - v_cost WHERE id = v_uid;

  -- Roll loop
  FOR i IN 1..p_count LOOP
    v_roll    := random() * 100;
    v_hero_id := NULL;
    v_shards  := 0;

    -- Rarity roll (normal pool rates: C=80% B=15% A=5%)
    IF p_pool = 'normal' THEN
      v_rarity := CASE
        WHEN v_roll < 80 THEN 'C'
        WHEN v_roll < 95 THEN 'B'
        ELSE                   'A'
      END;
    END IF;

    -- Pick hero from pool
    IF v_rarity = 'C' THEN
      SELECT unnest INTO v_hero_id
      FROM unnest(v_pool_c) ORDER BY random() LIMIT 1;
    ELSIF v_rarity = 'B' THEN
      SELECT unnest INTO v_hero_id
      FROM unnest(v_pool_b) ORDER BY random() LIMIT 1;
    END IF;

    -- A-tier: no heroes yet → mystery shards
    IF v_hero_id IS NULL THEN
      INSERT INTO public.hero_shards(user_id, hero_id, amount)
      VALUES(v_uid, '__mystery_' || v_rarity || '__', 20)
      ON CONFLICT(user_id, hero_id) DO UPDATE
        SET amount = public.hero_shards.amount + 20;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'hero_id',   NULL,
        'hero_name', 'Mystery ' || v_rarity,
        'rarity',    v_rarity,
        'is_new',    false,
        'shards',    20,
        'mystery',   true
      ));
      CONTINUE;
    END IF;

    -- Check ownership
    SELECT EXISTS(
      SELECT 1 FROM public.player_heroes
      WHERE user_id = v_uid AND hero_id = v_hero_id
    ) INTO v_has_hero;

    -- Get hero name and starting stars from hero_definitions
    SELECT name, stars INTO v_hero_name, v_init_stars
    FROM public.hero_definitions WHERE hero_id = v_hero_id;

    v_init_stars := COALESCE(v_init_stars, 1);

    IF NOT v_has_hero THEN
      -- Compute initial stats server-side at level=1, starting stars
      SELECT * INTO v_stats
      FROM public.compute_hero_stats(v_hero_id, 1, v_init_stars);

      -- Insert new hero with ALL stat columns populated
      INSERT INTO public.player_heroes(
        user_id, hero_id, stars, level, xp,
        hp, p_atk, m_atk, p_def, m_def, speed, power,
        obtained_at
      )
      VALUES(
        v_uid, v_hero_id, v_init_stars, 1, 0,
        v_stats.o_hp, v_stats.o_p_atk, v_stats.o_m_atk,
        v_stats.o_p_def, v_stats.o_m_def, v_stats.o_speed, v_stats.o_power,
        NOW()
      )
      ON CONFLICT(user_id, hero_id) DO NOTHING;

    ELSE
      -- Duplicate hero → grant shards
      v_shards := CASE v_rarity
        WHEN 'C'  THEN 5
        WHEN 'B'  THEN 10
        WHEN 'A'  THEN 20
        WHEN 'S'  THEN 40
        WHEN 'SS' THEN 80
        ELSE 5
      END;
      INSERT INTO public.hero_shards(user_id, hero_id, amount)
      VALUES(v_uid, v_hero_id, v_shards)
      ON CONFLICT(user_id, hero_id) DO UPDATE
        SET amount = public.hero_shards.amount + v_shards;
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'hero_id',   v_hero_id,
      'hero_name', COALESCE(v_hero_name, v_hero_id),
      'rarity',    v_rarity,
      'is_new',    NOT v_has_hero,
      'shards',    v_shards,
      'mystery',   false
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok',       true,
    'results',  v_results,
    'cost',     v_cost,
    'currency', 'gems'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_gacha_pull(TEXT, INT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. TRIGGER — Auto-compute stats on ANY INSERT into player_heroes
--    Belt-and-suspenders: even if a future INSERT omits stat columns or writes
--    wrong values (e.g. seed, migration scripts), this trigger enforces the
--    canonical formula before the row hits the disk.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_enforce_hero_stats_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- Always recompute on INSERT — prevents any client from writing inflated stats
  SELECT * INTO v_stats
  FROM public.compute_hero_stats(NEW.hero_id, NEW.level, NEW.stars);

  NEW.hp    := v_stats.o_hp;
  NEW.p_atk := v_stats.o_p_atk;
  NEW.m_atk := v_stats.o_m_atk;
  NEW.p_def := v_stats.o_p_def;
  NEW.m_def := v_stats.o_m_def;
  NEW.speed := v_stats.o_speed;
  NEW.power := v_stats.o_power;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ph_enforce_stats_insert ON public.player_heroes;
CREATE TRIGGER trg_ph_enforce_stats_insert
  BEFORE INSERT ON public.player_heroes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enforce_hero_stats_on_insert();


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. RESYNC — Recompute ALL existing player_heroes with correct formula
--    This fixes any rows that were written by the old client-side code.
--    Safe to run multiple times (idempotent UPDATE).
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE public.player_heroes ph
SET
  hp         = sub.o_hp,
  p_atk      = sub.o_p_atk,
  m_atk      = sub.o_m_atk,
  p_def      = sub.o_p_def,
  m_def      = sub.o_m_def,
  speed      = sub.o_speed,
  power      = sub.o_power,
  updated_at = NOW()
FROM (
  SELECT ph2.id, cs.*
  FROM   public.player_heroes ph2
  CROSS JOIN LATERAL public.compute_hero_stats(ph2.hero_id, ph2.level, ph2.stars) cs
) AS sub
WHERE ph.id = sub.id;

-- ── Verify: show resynced rows ────────────────────────────────────────────────
SELECT
  ph.hero_id,
  ph.level,
  ph.stars,
  ph.hp,
  ph.p_atk,
  ph.m_atk,
  ph.p_def,
  ph.m_def,
  ph.speed,
  ph.power,
  ph.updated_at
FROM public.player_heroes ph
ORDER BY ph.hero_id, ph.level;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. LOCK DOWN RLS — Remove direct UPDATE access from authenticated role
--    All writes to player_heroes must go through SECURITY DEFINER RPCs.
--    Authenticated users can still SELECT their own rows.
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop the existing UPDATE policy that allows client REST writes
DROP POLICY IF EXISTS "player_hero_update" ON public.player_heroes;

-- Authenticated users can only SELECT their own hero rows
-- All mutations (INSERT/UPDATE) must use SECURITY DEFINER RPCs which bypass RLS
-- NOTE: INSERT policy kept for the seed path (uses service_role which bypasses RLS anyway)
--       but the TRIGGER above ensures even seed INSERTs get correct server-computed stats.

-- Verify policies active on player_heroes
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'player_heroes'
ORDER BY policyname;