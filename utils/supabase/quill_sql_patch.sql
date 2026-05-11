-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH — Add Quill (Assassin, Common C)                                    ║
-- ║                                                                              ║
-- ║  Pool C after this patch:                                                   ║
-- ║    rock_slime, acid_slime, water_slime, gorr, craw, myko, fang, clover,     ║
-- ║    bolo, quill                                                               ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: hero_definitions — upsert Quill
-- base_hp:864  base_p_atk:165  base_m_atk:120  base_p_def:106  base_m_def:96  base_speed:173
-- growth_hp:60 growth_p_atk:12 growth_m_atk:8  growth_p_def:7  growth_m_def:7
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
  ('quill', 'Quill', 'common', 'Assassin', 1,
   864,  165,  120,  106,  96,  173,
   60,   12,   8,    7,    7,
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778239096/ChatGPT_Image_May_8_2026_06_13_01_PM_qnx2nw.png',
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778238897/ChatGPT_Image_May_8_2026_06_13_09_PM_vnblpy.png',
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
-- STEP 2: hero_skills — Quill (safe DELETE + INSERT)
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.hero_skills WHERE hero_id = 'quill';
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  (gen_random_uuid(), 'quill', 0, 'Spine Poke',   'damage',  1.00, 'physical', 'single',              1),
  (gen_random_uuid(), 'quill', 1, 'Spike Burst',  'damage',  1.55, 'physical', 'single',              1),
  (gen_random_uuid(), 'quill', 2, 'Threat Sense', 'damage',  1.85, 'physical', 'single_highest_patk', 21),
  (gen_random_uuid(), 'quill', 3, 'Quill Coat',   'passive', 0.08, 'none',     'passive',             41),
  (gen_random_uuid(), 'quill', 4, 'Death Roll',   'damage',  2.40, 'physical', 'single_highest_patk', 61);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Replace rpc_gacha_pull — pool C now includes 'quill'
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
  -- ── Pool C — includes Quill ───────────────────────────────────────────────
  v_pool_c      TEXT[]  := ARRAY['rock_slime','acid_slime','water_slime',
                                  'gorr','craw','myko','fang','clover','bolo','quill'];
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Verify
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT hero_id, name, hero_type, base_hp, base_p_atk, base_m_def, base_speed
FROM public.hero_definitions WHERE hero_id = 'quill';

SELECT hero_id, skill_slot, name, skill_type, damage_ratio, target_type, unlock_level
FROM public.hero_skills WHERE hero_id = 'quill'
ORDER BY skill_slot;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MANUAL ADDITIONS NEEDED in rpc_simulate_battle
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── single_highest_patk (SK2 Threat Sense + ULT Death Roll) ──────────────────
-- Add to the CASE v_target_type block in rpc_simulate_battle:
--
--   WHEN 'single_highest_patk' THEN
--     SELECT k INTO v_tuid FROM (
--       SELECT k, (v_units->k->>'p_atk')::NUMERIC AS patk
--       FROM jsonb_object_keys(v_units) AS t(k)
--       WHERE (v_units->k)->>'side' <> v_actor_side
--         AND ((v_units->k)->>'alive')::BOOLEAN
--     ) t ORDER BY patk DESC LIMIT 1;
--
-- ── SK3 Quill Coat — reactive P.DEF stack on taking a hit ────────────────────
-- In the unit-loading loop (INIT), add:
--   v_units := jsonb_set(v_units, ARRAY[v_k, 'quill_coat_stacks'], '0'::JSONB);
--
-- In the post-damage hook (after victim takes any direct hit):
--   IF (v_units->v_victim_k)->>'hero_id' = 'quill'
--      AND ((v_units->v_victim_k)->>'alive')::BOOLEAN THEN
--     v_stacks := COALESCE(((v_units->v_victim_k)->>'quill_coat_stacks')::INT, 0);
--     IF v_stacks < 5 THEN
--       v_stacks := v_stacks + 1;
--       v_units  := jsonb_set(v_units, ARRAY[v_victim_k, 'quill_coat_stacks'], to_jsonb(v_stacks));
--       v_boost  := CASE v_skill_level
--                     WHEN 1 THEN 0.08 WHEN 2 THEN 0.10 WHEN 3 THEN 0.13 ELSE 0.16 END;
--       v_units  := jsonb_set(v_units, ARRAY[v_victim_k, 'p_def'],
--                    to_jsonb(ROUND(((v_units->v_victim_k)->>'p_def')::NUMERIC * (1.0 + v_boost))));
--     END IF;
--   END IF;
