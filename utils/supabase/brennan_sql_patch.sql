-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH — Add Brennan (Guardian Tank, Rare B)                               ║
-- ║                                                                              ║
-- ║  Stats (engine-derived, HERO_VARIANTS: hp×1.10, pDef×1.15,                 ║
-- ║          pAtk×0.60, mAtk×0.50, speed×0.80):                                ║
-- ║    base_hp:2169  base_p_atk:44  base_m_atk:36                              ║
-- ║    base_p_def:227  base_m_def:197  base_speed:65                           ║
-- ║    growth (×0.09): hp:195 p_atk:4 m_atk:3 p_def:20 m_def:18               ║
-- ║                                                                              ║
-- ║  STEP 1. Upsert hero_definitions                                            ║
-- ║  STEP 2. Upsert hero_skills                                                 ║
-- ║  STEP 3. Replace rpc_gacha_pull — pool B now includes 'brennan'            ║
-- ║  STEP 4. Verify                                                              ║
-- ║  MANUAL. Additions needed in rpc_simulate_battle (see bottom)               ║
-- ║                                                                              ║
-- ║  Pool B after this patch:  emma, lucas, brennan                             ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: hero_definitions — upsert Brennan
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
  ('brennan', 'Brennan', 'rare', 'Guardian', 2,
   -- base_hp  base_p_atk  base_m_atk  base_p_def  base_m_def  base_speed
   2169,       44,         36,         227,         197,        65,
   -- growth (base × 0.09, min 1)
   -- growth_hp  growth_p_atk  growth_m_atk  growth_p_def  growth_m_def
   195,          4,            3,            20,           18,
   -- sprite (idle)
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778243245/ChatGPT_Image_May_8_2026_07_24_39_PM_mhzv50.png',
   -- illust (portrait card)
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778243229/ChatGPT_Image_May_8_2026_07_24_30_PM_t5y2zh.png',
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

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2: hero_skills — Brennan (safe DELETE + INSERT)
-- slot 3 (Fortified Frame passive_init) hardcoded in rpc_simulate_battle
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.hero_skills WHERE hero_id = 'brennan';
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  -- basic attack
  (gen_random_uuid(), 'brennan', 0, 'Shield Bash',     'damage', 1.00, 'physical', 'single',               1),
  -- SK1: single P.DEF-scaled slam (SQL manual: v_batk := v_actor_pdef)
  (gen_random_uuid(), 'brennan', 1, 'Timber Charge',   'damage', 0.80, 'physical', 'single',               1),
  -- SK2: shield lowest-HP ally, P.DEF-scaled (SQL manual: shield = pdef * ratio)
  (gen_random_uuid(), 'brennan', 2, 'Wooden Bulwark',  'buff',   0.55, 'none',     'single_lowest_hp_ally',21),
  -- slot 3: Passive — Fortified Frame, unlocks Lv41
  -- passive_init: at battle start, adds (P.DEF × 30/38/48/60%) to own max HP + current HP.
  -- Logic fully hardcoded in rpc_simulate_battle. DB row required as canonical metadata.
  (gen_random_uuid(), 'brennan', 3, 'Fortified Frame', 'passive', 0.30, 'none',     'passive_init',        41),
  -- ULT: front_aoe P.DEF-scaled + 100% stun 1 turn (SQL manual: v_batk := v_actor_pdef + stun)
  (gen_random_uuid(), 'brennan', 4, 'Bulwark Advance', 'damage', 0.70, 'physical', 'front_aoe',            61);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Replace rpc_gacha_pull — pool B now includes 'brennan'
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
  v_init_stars  INT;
  -- ── Pool C ────────────────────────────────────────────────────────────────
  v_pool_c      TEXT[]  := ARRAY['rock_slime','acid_slime','water_slime',
                                  'gorr','craw','myko','fang','clover','bolo','quill'];
  -- ── Pool B — includes Brennan ─────────────────────────────────────────────
  v_pool_b      TEXT[]  := ARRAY['emma','lucas','brennan'];
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
      SELECT stars INTO v_init_stars FROM hero_definitions WHERE hero_id = v_hero_id;
      v_init_stars := COALESCE(v_init_stars, 1);
      INSERT INTO player_heroes(user_id, hero_id, stars, level, xp, hp, obtained_at)
      VALUES(v_uid, v_hero_id, v_init_stars, 1, 0, 100, NOW())
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

-- Fix any existing player_heroes rows that were inserted with wrong stars=1
-- (idempotent: only corrects rows where stars < 2 for a 'rare' hero)
UPDATE public.player_heroes ph
SET    stars = 2
FROM   public.hero_definitions hd
WHERE  ph.hero_id = 'brennan'
  AND  hd.hero_id = 'brennan'
  AND  ph.stars < 2;

SELECT hero_id, name, hero_type, base_hp, base_p_atk, base_p_def, base_speed
FROM public.hero_definitions WHERE hero_id = 'brennan';

SELECT hero_id, skill_slot, name, skill_type, damage_ratio, target_type, unlock_level
FROM public.hero_skills WHERE hero_id = 'brennan'
ORDER BY skill_slot;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MANUAL ADDITIONS NEEDED in rpc_simulate_battle
-- Add these blocks into the existing SQL function body manually.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── DECLARE section: add these variables ─────────────────────────────────────
--
--   v_brennan_lv3  INT;
--   v_brennan_bns  INT;
--

-- ── INIT unit-loading loop: Fortified Frame passive_init ─────────────────────
-- After all units are loaded (end of init loop), add:
--
--   IF (v_units->v_k)->>'hero_id' = 'brennan' THEN
--     v_brennan_lv3 := CASE
--       WHEN (v_units->v_k->>'level')::INT >= 240 THEN 4
--       WHEN (v_units->v_k->>'level')::INT >= 201 THEN 3
--       WHEN (v_units->v_k->>'level')::INT >= 121 THEN 2
--       WHEN (v_units->v_k->>'level')::INT >= 41  THEN 1
--       ELSE 0
--     END;
--     IF v_brennan_lv3 > 0 THEN
--       v_brennan_bns := ROUND(
--         (v_units->v_k->>'p_def')::NUMERIC *
--         CASE v_brennan_lv3
--           WHEN 4 THEN 0.60
--           WHEN 3 THEN 0.48
--           WHEN 2 THEN 0.38
--           ELSE        0.30
--         END
--       );
--       v_units := jsonb_set(v_units, ARRAY[v_k, 'max_hp'],
--                   to_jsonb((v_units->v_k->>'max_hp')::INT + v_brennan_bns));
--       v_units := jsonb_set(v_units, ARRAY[v_k, 'hp'],
--                   to_jsonb((v_units->v_k->>'hp')::INT   + v_brennan_bns));
--     END IF;
--   END IF;
--

-- ── SKILL EXECUTION block — Timber Charge SK1 + Bulwark Advance ULT ──────────
-- In the section: "v_batk := CASE v_skdtype WHEN 'physical' THEN v_apatk ELSE v_amatk END;"
-- Add AFTER that line (alongside myko's pdef override):
--
--   -- Brennan SK1 "Timber Charge" + ULT "Bulwark Advance": P.DEF-based damage
--   IF v_ahid = 'brennan' AND v_slot IN (1, 4) THEN
--     v_batk := (v_actor ->> 'p_def')::INT;
--   END IF;
--

-- ── SKILL EXECUTION — Wooden Bulwark SK2 (shield to lowest-HP ally) ──────────
-- In the CASE v_target_type block, add a new branch for 'single_lowest_hp_ally' buff:
-- (This branch already exists for Emma's heals/buffs — check existing logic and add
--  P.DEF-based shield if hero_id = 'brennan')
--
--   WHEN 'single_lowest_hp_ally' THEN
--     IF v_sktype = 'buff' AND v_ahid = 'brennan' THEN
--       -- Find ally with lowest HP%
--       SELECT k INTO v_tuid FROM (
--         SELECT k, ((v_units->k->>'hp')::NUMERIC / GREATEST(1,(v_units->k->>'max_hp')::NUMERIC)) AS hp_pct
--         FROM jsonb_object_keys(v_units) AS t(k)
--         WHERE (v_units->k)->>'side' = v_actor_side
--           AND ((v_units->k)->>'alive')::BOOLEAN
--       ) t ORDER BY hp_pct ASC LIMIT 1;
--       IF v_tuid IS NOT NULL THEN
--         v_shield_amt := GREATEST(1, ROUND(v_actor_pdef::NUMERIC * v_skratio));
--         v_tshield    := COALESCE(((v_units->v_tuid)->>'shield')::INT, 0) + v_shield_amt;
--         v_units := jsonb_set(v_units, ARRAY[v_tuid, 'shield'], to_jsonb(v_tshield));
--         -- log the shield event
--         v_tj := v_tj || jsonb_build_array(jsonb_build_object(
--           'uid', v_tuid, 'shield_gained', v_shield_amt, 'shield_after', v_tshield, 'dmg', 0
--         ));
--       END IF;
--     END IF;
--

-- ── POST-DAMAGE hook — Bulwark Advance ULT stun ──────────────────────────────
-- After the main damage loop iterates each target (v_tdied check block), add:
--
--   -- Brennan ULT "Bulwark Advance": stun all hit targets 1 turn
--   IF v_ahid = 'brennan' AND v_slot = 4 AND v_dmg > 0 AND NOT v_tdied THEN
--     v_units := jsonb_set(v_units, ARRAY[v_tuid, 'stunned_turns'],
--                  to_jsonb(GREATEST(
--                    COALESCE(((v_units->v_tuid)->>'stunned_turns')::INT, 0), 1
--                  )));
--   END IF;
--
-- NOTE: stunned_turns system must already be initialized in unit-loading loop:
--   v_units := jsonb_set(v_units, ARRAY[v_k, 'stunned_turns'], '0'::JSONB);
-- (This was introduced in bolo_sql_patch.sql MANUAL section — confirm it's present.)