-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH — Add Bolo (Fighter, Common C)                                       ║
-- ║                                                                              ║
-- ║  STEP 1. Upsert Bolo into hero_definitions                                  ║
-- ║  STEP 2. Upsert Bolo skills into hero_skills                                ║
-- ║  STEP 3. Replace rpc_gacha_pull — pool C now includes 'bolo'                ║
-- ║                                                                              ║
-- ║  Pool C after this patch:                                                   ║
-- ║    rock_slime, acid_slime, water_slime, gorr, craw, myko, fang, clover,     ║
-- ║    bolo                                                                      ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: hero_definitions — upsert Bolo
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
  ('bolo', 'Bolo', 'common', 'Fighter', 1,
   -- base_hp  base_p_atk  base_m_atk  base_p_def  base_m_def  base_speed
   1320,       130,        90,         130,        120,        54,
   -- growth_hp  growth_p_atk  growth_m_atk  growth_p_def  growth_m_def
   -- Derived: base × GROWTH_RATE['common']=0.07. formula: stat@lv = base + lv × growth
   -- lv61: HP=6932  P.ATK=679   lv70: HP=7760  P.ATK=760
   92,         9,            6,            9,           8,
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778231187/ChatGPT_Image_May_8_2026_04_06_08_PM_kvuuqu.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778231010/ChatGPT_Image_May_8_2026_03_58_18_PM_bchzp9.png',
   true)
ON CONFLICT (hero_id) DO UPDATE SET
  name=EXCLUDED.name, rarity=EXCLUDED.rarity, hero_type=EXCLUDED.hero_type,
  base_hp=EXCLUDED.base_hp, base_p_atk=EXCLUDED.base_p_atk, base_m_atk=EXCLUDED.base_m_atk,
  base_p_def=EXCLUDED.base_p_def, base_m_def=EXCLUDED.base_m_def, base_speed=EXCLUDED.base_speed,
  growth_hp=EXCLUDED.growth_hp, growth_p_atk=EXCLUDED.growth_p_atk,
  growth_m_atk=EXCLUDED.growth_m_atk, growth_p_def=EXCLUDED.growth_p_def,
  growth_m_def=EXCLUDED.growth_m_def,
  sprite_url=EXCLUDED.sprite_url, illust_url=EXCLUDED.illust_url,
  is_playable=EXCLUDED.is_playable;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: hero_skills — Bolo (safe DELETE + INSERT)
-- ═══════════════════════════════════════════════════���═══════════════════════════

DELETE FROM public.hero_skills WHERE hero_id = 'bolo';
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  (gen_random_uuid(), 'bolo', 0, 'Wild Hook',     'damage',  1.00, 'physical', 'single',       1),
  (gen_random_uuid(), 'bolo', 1, 'Goofy Punch',   'damage',  1.45, 'physical', 'single',       1),
  (gen_random_uuid(), 'bolo', 2, 'Punch Cannon',  'damage',  1.05, 'physical', 'front_aoe',   21),
  (gen_random_uuid(), 'bolo', 3, 'Anger Fist',    'passive', 0.05, 'none',     'passive',     41),
  (gen_random_uuid(), 'bolo', 4, 'Typhoon Fists', 'damage',  0.90, 'physical', 'all_enemies', 61);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Replace rpc_gacha_pull — pool C now includes 'bolo'
-- ═══════════════════════════════════════════════════════════════════════════════

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
  -- ── Pool C — includes Bolo ─────────────���────────────────────────────────────
  v_pool_c      TEXT[]  := ARRAY['rock_slime','acid_slime','water_slime',
                                  'gorr','craw','myko','fang','clover','bolo'];
  v_pool_b      TEXT[]  := ARRAY['emma','lucas'];
  i             INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_count NOT IN (1,10) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_count');
  END IF;
  IF p_pool NOT IN ('normal','epic','superior') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pool');
  END IF;
  IF p_pool IN ('epic','superior') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pool_unavailable');
  END IF;

  v_cost := CASE
    WHEN p_pool='normal'   AND p_count=1  THEN 10
    WHEN p_pool='normal'   AND p_count=10 THEN 90
    WHEN p_pool='epic'     AND p_count=1  THEN 30
    WHEN p_pool='epic'     AND p_count=10 THEN 270
    WHEN p_pool='superior' AND p_count=1  THEN 80
    WHEN p_pool='superior' AND p_count=10 THEN 720
    ELSE 9999
  END;

  SELECT gems INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_gems', 'have', v_balance, 'need', v_cost);
  END IF;

  UPDATE profiles SET gems = gems - v_cost WHERE id = v_uid;

  FOR i IN 1..p_count LOOP
    v_roll    := random() * 100;
    v_hero_id := NULL;
    v_shards  := 0;

    IF p_pool = 'normal' THEN
      v_rarity := CASE
        WHEN v_roll <  80 THEN 'C'
        WHEN v_roll <  95 THEN 'B'
        ELSE                    'A'
      END;
    END IF;

    IF v_rarity = 'C' THEN
      SELECT unnest INTO v_hero_id FROM unnest(v_pool_c) ORDER BY random() LIMIT 1;
    ELSIF v_rarity = 'B' THEN
      SELECT unnest INTO v_hero_id FROM unnest(v_pool_b) ORDER BY random() LIMIT 1;
    END IF;

    -- Verify hero exists in definitions (guards against FK violation)
    IF v_hero_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM hero_definitions WHERE hero_id = v_hero_id) THEN
        v_hero_id := NULL;
      END IF;
    END IF;

    IF v_hero_id IS NULL THEN
      INSERT INTO hero_shards(user_id, hero_id, amount)
      VALUES(v_uid, '__mystery_' || v_rarity || '__', 20)
      ON CONFLICT(user_id, hero_id) DO UPDATE
        SET amount = hero_shards.amount + 20;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'hero_id', NULL, 'hero_name', 'Mystery ' || v_rarity,
        'rarity', v_rarity, 'is_new', false, 'shards', 20, 'mystery', true
      ));
      CONTINUE;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM player_heroes WHERE user_id = v_uid AND hero_id = v_hero_id
    ) INTO v_has_hero;

    SELECT name INTO v_hero_name FROM hero_definitions WHERE hero_id = v_hero_id;

    IF NOT v_has_hero THEN
      INSERT INTO player_heroes(user_id, hero_id, stars, level, xp, hp, obtained_at)
      VALUES(v_uid, v_hero_id, 1, 1, 0, 100, NOW())
      ON CONFLICT(user_id, hero_id) DO NOTHING;
    ELSE
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

  RETURN jsonb_build_object('ok', true, 'results', v_results, 'cost', v_cost, 'currency', 'gems');
END;
$$;

-- ═════════════════════════════════════════════���═════════════════════════════════
-- STEP 4: Verify
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT hero_id, name, hero_type, base_hp, base_p_atk, base_m_atk, base_speed
FROM public.hero_definitions WHERE hero_id = 'bolo';

SELECT hero_id, skill_slot, name, skill_type, damage_ratio, target_type, unlock_level
FROM public.hero_skills WHERE hero_id = 'bolo'
ORDER BY skill_slot;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MANUAL ADDITIONS NEEDED in rpc_simulate_battle
-- (paste these blocks into the existing SQL function manually)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── STUN SYSTEM (generic, Bolo SK1 = first user) ─────────────────────────────
--
-- PART A — AT THE START of rpc_simulate_battle unit-loading loop, add:
--
--   v_units := jsonb_set(v_units, ARRAY[v_k, 'stunned_turns'], '0'::JSONB);
--
-- PART B — REPLACE the main action loop block (where v_actor acts each turn):
--   Before executing the actor's action, add this guard:
--
--   IF ((v_units->v_actor_k)->>'stunned_turns')::INT > 0 THEN
--     -- Actor is stunned — skip their action, emit stun_skip event
--     v_stun_left := ((v_units->v_actor_k)->>'stunned_turns')::INT - 1;
--     v_units     := jsonb_set(v_units, ARRAY[v_actor_k, 'stunned_turns'], to_jsonb(v_stun_left));
--     v_log       := v_log || jsonb_build_object(
--       't',          v_tick,
--       'type',       'stun_skip',
--       'actor',      v_actor_k,
--       'hero_id',    (v_units->v_actor_k)->>'hero_id'
--     );
--     CONTINUE;  -- skip to next actor in the loop
--   END IF;
--
-- PART C — AFTER Bolo's SK1 damage is applied (slot = 1), add stun proc:
--
--   IF v_actor_hero = 'bolo' AND v_skill_slot = 1 THEN
--     v_stun_chance := CASE v_bolo_sk1_level
--       WHEN 1 THEN 0.35 WHEN 2 THEN 0.42 WHEN 3 THEN 0.52 ELSE 0.65 END;
--     IF random() < v_stun_chance THEN
--       v_units  := jsonb_set(v_units, ARRAY[v_tuid, 'stunned_turns'], '1'::JSONB);
--       -- Tag target data with stun_applied:true so client shows the indicator
--       -- (set this flag on the specific target JSON object in v_targets)
--       v_target := v_target || jsonb_build_object('stun_applied', true);
--     END IF;
--   END IF;

-- ── Bolo SK3 Anger Fist (passive) — P.ATK stack on taking a hit ──────────────
-- In the post-damage hook (after Bolo takes any direct damage):
--
--   IF (v_units->v_victim_k)->>'hero_id' = 'bolo'
--      AND ((v_units->v_victim_k)->>'alive')::BOOLEAN THEN
--     v_stacks := COALESCE(((v_units->v_victim_k)->>'bolo_iron_stacks')::INT, 0);
--     IF v_stacks < 4 THEN
--       v_stacks := v_stacks + 1;
--       v_units  := jsonb_set(v_units, ARRAY[v_victim_k, 'bolo_iron_stacks'], to_jsonb(v_stacks));
--       v_boost  := CASE v_skill_level
--                     WHEN 1 THEN 0.05 WHEN 2 THEN 0.06 WHEN 3 THEN 0.08 ELSE 0.10 END;
--       v_units  := jsonb_set(v_units, ARRAY[v_victim_k, 'p_atk'],
--                    to_jsonb(ROUND(((v_units->v_victim_k)->>'p_atk')::NUMERIC * (1.0 + v_boost))));
--       -- emit passive event skill_slot=3 for BattlePlayback animation
--     END IF;
--   END IF;
