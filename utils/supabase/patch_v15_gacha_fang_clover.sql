-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v15 — Add Fang + Clover to Normal Summon pool C                     ║
-- ║                                                                              ║
-- ║  Root cause of "Pull failed — try again":                                   ║
-- ║    rpc_gacha_pull has a hardcoded v_pool_c array that did NOT include        ║
-- ║    'fang' or 'clover'. patch_v14 inserted them into a gacha_pool table      ║
-- ║    but the function NEVER reads that table — it uses the hardcoded array.   ║
-- ║                                                                              ║
-- ║    Additionally, if patch_v14 was not applied (or partially failed), fang   ║
-- ║    and clover were absent from hero_definitions. The FK constraint on        ║
-- ║    player_heroes.hero_id → hero_definitions.hero_id would then throw a      ║
-- ║    violation whenever those heroes rolled, aborting the transaction and      ║
-- ║    causing the "Pull failed" error.                                          ║
-- ║                                                                              ║
-- ║  This patch is SELF-CONTAINED and SAFE to run alone (no patch_v14 needed):  ║
-- ║    STEP 1. Upsert Fang + Clover into hero_definitions                       ║
-- ║    STEP 2. Upsert Fang + Clover skills into hero_skills                     ║
-- ║    STEP 3. Replace rpc_gacha_pull with expanded pool C                      ║
-- ║                                                                              ║
-- ║  Pool C after this patch:                                                   ║
-- ║    rock_slime, acid_slime, water_slime, gorr, craw, myko, fang, clover      ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: hero_definitions — upsert Fang + Clover (safe to re-run)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
('fang', 'Fang', 'common', 'Assassin', 1,
  680, 162, 40, 48, 58, 138,
  68, 16, 4, 5, 6,
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058539/ChatGPT_Image_May_6_2026_03_43_22_PM_ejhf1t.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058505/ChatGPT_Image_May_6_2026_03_43_11_PM_xagzjf.png',
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

INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
('clover', 'Clover', 'common', 'Support', 1,
  880, 62, 158, 65, 100, 118,
  88, 6, 15, 6, 10,
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058829/ChatGPT_Image_May_6_2026_03_57_38_PM_jwipj1.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058786/ChatGPT_Image_May_6_2026_03_55_39_PM_dssunr.png',
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
-- STEP 2: hero_skills — Fang + Clover (safe DELETE + INSERT)
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.hero_skills WHERE hero_id = 'fang';
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
(gen_random_uuid(), 'fang', 0, 'Shadow Strike',  'damage', 1.00, 'physical', 'single',              1),
(gen_random_uuid(), 'fang', 1, 'Twin Slash',     'damage', 0.90, 'physical', 'twin_slash',          1),
(gen_random_uuid(), 'fang', 2, 'Shadow Sprint',  'damage', 0.75, 'physical', 'front_aoe',          21),
(gen_random_uuid(), 'fang', 3, 'Hunter''s Mark', 'passive', 0.00, 'none',    'passive_kill_stack', 41),
(gen_random_uuid(), 'fang', 4, 'Death Bound',    'damage', 2.60, 'physical', 'single_lowest_hp',   61);

DELETE FROM public.hero_skills WHERE hero_id = 'clover';
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
(gen_random_uuid(), 'clover', 0, 'Herb Toss',     'damage',   0.75, 'magical', 'single',                 1),
(gen_random_uuid(), 'clover', 1, 'Healing Herb',  'heal',     1.30, 'magical', 'single_lowest_hp_ally',  1),
(gen_random_uuid(), 'clover', 2, 'Lucky Toss',    'hot',      0.55, 'magical', 'single_random_ally',    21),
(gen_random_uuid(), 'clover', 3, 'Life Bloom',    'passive',  0.40, 'magical', 'passive_ally_hit',      41),
(gen_random_uuid(), 'clover', 4, 'Bloom Cascade', 'heal_aoe', 0.90, 'magical', 'all_allies',            61);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Replace rpc_gacha_pull — pool C now includes fang + clover
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
  -- ── Pool C — includes Fang + Clover ────────────────────────────────────────
  v_pool_c      TEXT[]  := ARRAY['rock_slime','acid_slime','water_slime',
                                  'gorr','craw','myko','fang','clover'];
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
        v_hero_id := NULL; -- treat as mystery if def missing
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
SELECT hero_id, name, hero_type, rarity, base_hp, base_p_atk, base_speed
FROM public.hero_definitions
WHERE hero_id IN ('fang', 'clover')
ORDER BY hero_id;

SELECT hero_id, skill_slot, name, skill_type, target_type, unlock_level
FROM public.hero_skills
WHERE hero_id IN ('fang', 'clover')
ORDER BY hero_id, skill_slot;
