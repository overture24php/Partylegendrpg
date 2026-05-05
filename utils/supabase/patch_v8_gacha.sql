-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v8 — Server-Side Gacha System                                        ║
-- ║  Run this ENTIRE file in: Supabase Dashboard → SQL Editor → Run            ║
-- ║                                                                              ║
-- ║  SECURITY MODEL:                                                             ║
-- ║  • rpc_gacha_pull  : SECURITY DEFINER — deducts gems, rolls server-side,    ║
-- ║                      adds hero or grants shards, all atomic in 1 TX         ║
-- ║  • rpc_star_up     : SECURITY DEFINER — verifies ownership, deducts         ║
-- ║                      shards + gold, increments stars atomically             ║
-- ║  • hero_shards     : row-level-secured; owner reads only own rows           ║
-- ║  • gem rewards     : chapter 1 stage rewards updated for 20-pull budget     ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── 1. hero_shards table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hero_shards (
  user_id  UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hero_id  TEXT    NOT NULL,
  amount   INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (user_id, hero_id)
);

CREATE INDEX IF NOT EXISTS idx_hero_shards_user ON public.hero_shards(user_id);

ALTER TABLE public.hero_shards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hero_shards_owner_select" ON public.hero_shards;
CREATE POLICY "hero_shards_owner_select" ON public.hero_shards
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (used by RPCs)
DROP POLICY IF EXISTS "hero_shards_service_all" ON public.hero_shards;
CREATE POLICY "hero_shards_service_all" ON public.hero_shards
  USING (TRUE) WITH CHECK (TRUE);

-- ── 2. Update chapter 1 stage gem rewards (≈225 gems total → ~22 pulls) ──────
INSERT INTO public.stage_definitions
  (stage_id, gold_reward, gem_reward, exp_reward, hero_exp_reward)
VALUES
  ('1-1',   150,  5, 100,  50),
  ('1-2',   200,  5, 100,  60),
  ('1-3',   250,  5, 100,  70),
  ('1-4',   300,  5, 100,  80),
  ('1-5',   350,  5, 100,  90),
  ('1-6',   400,  8, 100, 110),
  ('1-7',   450,  8, 100, 120),
  ('1-8',   500,  8, 100, 130),
  ('1-9',   550,  8, 100, 140),
  ('1-10',  700,  8, 100, 160),
  ('1-11',  750, 12, 100, 170),
  ('1-12',  800, 12, 100, 180),
  ('1-13',  850, 12, 100, 190),
  ('1-14',  900, 12, 100, 200),
  ('1-15', 1000, 12, 100, 220),
  ('1-16', 1100, 20, 100, 240),
  ('1-17', 1200, 20, 100, 260),
  ('1-18', 1300, 20, 100, 280),
  ('1-19', 1400, 20, 100, 300),
  ('1-20', 1600, 20, 100, 350)
ON CONFLICT (stage_id) DO UPDATE SET
  gold_reward     = EXCLUDED.gold_reward,
  gem_reward      = EXCLUDED.gem_reward,
  exp_reward      = EXCLUDED.exp_reward,
  hero_exp_reward = EXCLUDED.hero_exp_reward;

-- ── 3. rpc_gacha_pull ─────────────────────────────────────────────────────────
-- Params:
--   p_pool  TEXT : 'normal' | 'epic' | 'superior'
--   p_count INT  : 1 | 10
-- Returns JSONB: { ok, results[], cost, currency } or { error }
-- Cost schedule:
--   normal   x1=10  gems  x10=90  gems
--   epic     x1=30  gems  x10=270 gems  (unavailable until release)
--   superior x1=80  gems  x10=720 gems  (unavailable until release)
-- Rates (normal):  C=80%  B=15%  A=5%
-- Current pool:
--   C => rock_slime, acid_slime, water_slime
--   B => emma, lucas
--   A => (none yet → mystery shard ×20)
-- Duplicate => shards: C=5 B=10 A=20 S=40 SS=80
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS rpc_gacha_pull(text, int);

CREATE OR REPLACE FUNCTION rpc_gacha_pull(
  p_pool   TEXT,
  p_count  INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID    := auth.uid();
  v_cost        INT;
  v_balance     INT;
  v_results     JSONB   := '[]'::JSONB;
  v_roll        FLOAT;
  v_rarity      TEXT;
  v_hero_id     TEXT;
  v_hero_name   TEXT;
  v_has_hero    BOOLEAN;
  v_shards      INT;
  v_pool_c      TEXT[]  := ARRAY['rock_slime','acid_slime','water_slime'];
  v_pool_b      TEXT[]  := ARRAY['emma','lucas'];
  i             INT;
BEGIN
  -- ── Auth ──
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  -- ── Validate inputs ──
  IF p_count NOT IN (1,10) THEN
    RETURN jsonb_build_object('error','invalid_count');
  END IF;
  IF p_pool NOT IN ('normal','epic','superior') THEN
    RETURN jsonb_build_object('error','invalid_pool');
  END IF;
  IF p_pool IN ('epic','superior') THEN
    RETURN jsonb_build_object('error','pool_unavailable');
  END IF;

  -- ── Cost ──
  v_cost := CASE
    WHEN p_pool='normal'   AND p_count=1  THEN 10
    WHEN p_pool='normal'   AND p_count=10 THEN 90
    WHEN p_pool='epic'     AND p_count=1  THEN 30
    WHEN p_pool='epic'     AND p_count=10 THEN 270
    WHEN p_pool='superior' AND p_count=1  THEN 80
    WHEN p_pool='superior' AND p_count=10 THEN 720
    ELSE 9999
  END;

  -- ── Check balance (lock row to prevent race) ──
  SELECT gems INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error','profile_not_found');
  END IF;
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('error','insufficient_gems','have',v_balance,'need',v_cost);
  END IF;

  -- ── Deduct gems ──
  UPDATE profiles SET gems = gems - v_cost WHERE id = v_uid;

  -- ── Roll loop ──
  FOR i IN 1..p_count LOOP
    v_roll    := random() * 100;
    v_hero_id := NULL;
    v_shards  := 0;

    -- Rarity roll
    IF    p_pool = 'normal' THEN
      v_rarity := CASE
        WHEN v_roll <  80 THEN 'C'
        WHEN v_roll <  95 THEN 'B'
        ELSE                    'A'
      END;
    END IF;

    -- Hero pick from pool
    IF v_rarity = 'C' THEN
      SELECT unnest INTO v_hero_id
      FROM unnest(v_pool_c) ORDER BY random() LIMIT 1;
    ELSIF v_rarity = 'B' THEN
      SELECT unnest INTO v_hero_id
      FROM unnest(v_pool_b) ORDER BY random() LIMIT 1;
    END IF;
    -- A-tier: no heroes yet → mystery

    -- ── Mystery (no hero in pool) ──
    IF v_hero_id IS NULL THEN
      INSERT INTO hero_shards(user_id, hero_id, amount)
      VALUES(v_uid, '__mystery_' || v_rarity || '__', 20)
      ON CONFLICT(user_id, hero_id) DO UPDATE
        SET amount = hero_shards.amount + 20;

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

    -- ── Ownership check ──
    SELECT EXISTS(
      SELECT 1 FROM player_heroes
      WHERE user_id = v_uid AND hero_id = v_hero_id
    ) INTO v_has_hero;

    -- ── Hero name ──
    SELECT name INTO v_hero_name
    FROM hero_definitions WHERE hero_id = v_hero_id;

    IF NOT v_has_hero THEN
      -- ── Add new hero ──
      INSERT INTO player_heroes(user_id, hero_id, stars, level, xp, hp, obtained_at)
      VALUES(v_uid, v_hero_id, 1, 1, 0, 100, NOW())
      ON CONFLICT(user_id, hero_id) DO NOTHING;

    ELSE
      -- ── Duplicate → shards ──
      v_shards := CASE v_rarity
        WHEN 'C'  THEN 5
        WHEN 'B'  THEN 10
        WHEN 'A'  THEN 20
        WHEN 'S'  THEN 40
        WHEN 'SS' THEN 80
        ELSE 5
      END;
      INSERT INTO hero_shards(user_id, hero_id, amount)
      VALUES(v_uid, v_hero_id, v_shards)
      ON CONFLICT(user_id, hero_id) DO UPDATE
        SET amount = hero_shards.amount + v_shards;
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

GRANT EXECUTE ON FUNCTION rpc_gacha_pull(text,int) TO authenticated;

-- ── 4. rpc_star_up ────────────────────────────────────────────────────────────
-- Params: p_player_hero_id UUID (player_heroes.id)
-- Stars 1-20: tier = floor(stars/5) → 0=gold 1=red 2=white 3=rainbow
-- Shard cost: tier0=60  tier1=80  tier2=100  tier3=120
-- Gold cost by rarity+tier:
--   C  : [500,  1000,  2000,   4000]
--   B  : [2000, 4000,  8000,  16000]
--   A  : [5000,10000, 20000,  40000]
--   S  : [15000,30000,60000, 120000]
--   SS : [50000,100000,200000,400000]
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS rpc_star_up(uuid);

CREATE OR REPLACE FUNCTION rpc_star_up(
  p_player_hero_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID  := auth.uid();
  v_ph          RECORD;
  v_rarity      TEXT;
  v_stars       INT;
  v_target_tier INT;
  v_shard_cost  INT;
  v_gold_cost   INT;
  v_shard_bal   INT;
  v_gold_bal    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  -- Fetch + verify ownership
  SELECT ph.id, ph.hero_id, ph.stars, hd.rarity
    INTO v_ph
  FROM player_heroes ph
  JOIN hero_definitions hd ON hd.hero_id = ph.hero_id
  WHERE ph.id = p_player_hero_id AND ph.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','hero_not_found');
  END IF;

  v_stars  := COALESCE(v_ph.stars, 1);
  v_rarity := v_ph.rarity;

  IF v_stars >= 20 THEN
    RETURN jsonb_build_object('error','max_stars');
  END IF;

  -- target tier = which tier the NEXT star belongs to
  -- stars: 1-5 → tier0, 6-10 → tier1, 11-15 → tier2, 16-20 → tier3
  v_target_tier := LEAST(3, v_stars / 5);

  -- Shard cost
  v_shard_cost := CASE v_target_tier
    WHEN 0 THEN 60
    WHEN 1 THEN 80
    WHEN 2 THEN 100
    ELSE        120
  END;

  -- Gold cost
  v_gold_cost := CASE v_rarity
    WHEN 'C'  THEN (ARRAY[  500,   1000,   2000,   4000])[v_target_tier+1]
    WHEN 'B'  THEN (ARRAY[ 2000,   4000,   8000,  16000])[v_target_tier+1]
    WHEN 'A'  THEN (ARRAY[ 5000,  10000,  20000,  40000])[v_target_tier+1]
    WHEN 'S'  THEN (ARRAY[15000,  30000,  60000, 120000])[v_target_tier+1]
    WHEN 'SS' THEN (ARRAY[50000, 100000, 200000, 400000])[v_target_tier+1]
    ELSE 500
  END;

  -- Check shards
  SELECT COALESCE(amount,0) INTO v_shard_bal
  FROM hero_shards
  WHERE user_id = v_uid AND hero_id = v_ph.hero_id;

  v_shard_bal := COALESCE(v_shard_bal, 0);
  IF v_shard_bal < v_shard_cost THEN
    RETURN jsonb_build_object(
      'error','insufficient_shards','have',v_shard_bal,'need',v_shard_cost);
  END IF;

  -- Check gold (lock)
  SELECT gold INTO v_gold_bal FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_gold_bal < v_gold_cost THEN
    RETURN jsonb_build_object(
      'error','insufficient_gold','have',v_gold_bal,'need',v_gold_cost);
  END IF;

  -- Deduct gold
  UPDATE profiles    SET gold   = gold   - v_gold_cost  WHERE id = v_uid;
  -- Deduct shards
  UPDATE hero_shards SET amount = amount - v_shard_cost
    WHERE user_id = v_uid AND hero_id = v_ph.hero_id;
  -- Increment stars
  UPDATE player_heroes SET stars = v_stars + 1
    WHERE id = p_player_hero_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'new_stars',  v_stars + 1,
    'shard_cost', v_shard_cost,
    'gold_cost',  v_gold_cost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_star_up(uuid) TO authenticated;

-- ── 5. rpc_fetch_hero_shards ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS rpc_fetch_hero_shards();

CREATE OR REPLACE FUNCTION rpc_fetch_hero_shards()
RETURNS TABLE(hero_id TEXT, amount INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hero_id, amount FROM hero_shards WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION rpc_fetch_hero_shards() TO authenticated;
