-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v10 — Add Gorr (Fighter C) and Craw (Ranged C)                       ║
-- ║  • hero_definitions + hero_skills inserts                                   ║
-- ║  • rpc_gacha_pull updated: gorr + craw added to normal pool C               ║
-- ║  • rpc_simulate_battle: Gorr + Craw skill branches                          ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Insert hero_definitions ────────────────────────────────────────────────
INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
('gorr', 'Gorr', 'common', 'Fighter', 1,
 1080, 128, 36, 100, 76, 96,
 108, 13, 4, 10, 8,
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919607/ChatGPT_Image_May_5_2026_01_23_54_AM_nhkzmq.png',
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777918499/ChatGPT_Image_May_5_2026_01_13_20_AM_eyckzn.png',
 true),
('craw', 'Craw', 'common', 'Ranged', 1,
 755, 148, 54, 66, 76, 122,
 76, 15, 5, 7, 8,
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919783/ChatGPT_Image_May_5_2026_01_26_59_AM_zfdewm.png',
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919641/ChatGPT_Image_May_5_2026_01_27_29_AM_axdemu.png',
 true)
ON CONFLICT (hero_id) DO UPDATE SET
  name         = EXCLUDED.name,
  rarity       = EXCLUDED.rarity,
  hero_type    = EXCLUDED.hero_type,
  base_hp      = EXCLUDED.base_hp,
  base_p_atk   = EXCLUDED.base_p_atk,
  base_m_atk   = EXCLUDED.base_m_atk,
  base_p_def   = EXCLUDED.base_p_def,
  base_m_def   = EXCLUDED.base_m_def,
  base_speed   = EXCLUDED.base_speed,
  growth_hp    = EXCLUDED.growth_hp,
  growth_p_atk = EXCLUDED.growth_p_atk,
  growth_m_atk = EXCLUDED.growth_m_atk,
  growth_p_def = EXCLUDED.growth_p_def,
  growth_m_def = EXCLUDED.growth_m_def,
  sprite_url   = EXCLUDED.sprite_url,
  illust_url   = EXCLUDED.illust_url,
  is_playable  = EXCLUDED.is_playable;

-- ── 2. Insert hero_skills ─────────────────────────────────────────────────────
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type, effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
-- Gorr
('gorr_basic',  'gorr', 0, 'Cleave',
 'Overhead chop dealing physical damage to one enemy.',
 'damage', 1.000, 'physical', NULL, 0, 0, 'single', 1, 10),
('gorr_skill1', 'gorr', 1, 'Cleaver Rush',
 'Charges toward the lowest-HP enemy. 1.4× physical damage + Bleed 2 turns.',
 'damage', 1.400, 'physical', 'bleed', 2, 100, 'single', 1, 10),
('gorr_skill2', 'gorr', 2, 'Intimidating Slam',
 'Crashes down on nearest front-row enemy. 1.58× physical damage + P.ATK debuff 2 turns.',
 'damage', 1.580, 'physical', 'atk_debuff', 2, 100, 'single', 5, 10),
('gorr_ult',    'gorr', 3, 'Reaping Arc',
 'Wide cleaver arc hits ALL enemies. 0.88× physical damage. Bleeding targets take +30% bonus.',
 'damage', 0.880, 'physical', 'bleed_amp', 2, 100, 'all_enemies', 10, 10),
-- Craw
('craw_basic',  'craw', 0, 'Quick Shot',
 'Hurried arrow dealing 0.9× physical damage to one enemy.',
 'damage', 0.900, 'physical', NULL, 0, 0, 'single', 1, 10),
('craw_skill1', 'craw', 1, 'Crude Shot',
 'Fires at a random enemy. 1.15× physical damage. 30% chance to inflict Wound 2 turns.',
 'damage', 1.150, 'physical', 'wound', 2, 30, 'single', 1, 10),
('craw_skill2', 'craw', 2, 'Blind Arrow',
 'Targets highest P.ATK enemy. 1.3× physical damage + Blind 2 turns (35% miss chance).',
 'damage', 1.300, 'physical', 'blind', 2, 100, 'single', 5, 10),
('craw_ult',    'craw', 3, 'Skypiercer Volley',
 'Arrow barrage hits ALL enemies. 0.72× physical damage + Wound all 2 turns.',
 'damage', 0.720, 'physical', 'wound', 2, 100, 'all_enemies', 10, 10)
ON CONFLICT (skill_id) DO UPDATE SET
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  skill_type      = EXCLUDED.skill_type,
  damage_ratio    = EXCLUDED.damage_ratio,
  damage_type     = EXCLUDED.damage_type,
  effect_type     = EXCLUDED.effect_type,
  effect_duration = EXCLUDED.effect_duration,
  effect_chance   = EXCLUDED.effect_chance,
  target_type     = EXCLUDED.target_type,
  unlock_level    = EXCLUDED.unlock_level;

-- ── 3. rpc_gacha_pull — add gorr + craw to normal pool C ─────────────────────
-- Pool C was: rock_slime, acid_slime, water_slime
-- Pool C now: rock_slime, acid_slime, water_slime, gorr, craw
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
  v_pool_c      TEXT[]  := ARRAY['rock_slime','acid_slime','water_slime','gorr','craw'];
  v_pool_b      TEXT[]  := ARRAY['emma','lucas'];
  i             INT;
BEGIN
  -- Auth
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  -- Validate inputs
  IF p_count NOT IN (1,10) THEN
    RETURN jsonb_build_object('error','invalid_count');
  END IF;
  IF p_pool NOT IN ('normal','epic','superior') THEN
    RETURN jsonb_build_object('error','invalid_pool');
  END IF;
  IF p_pool IN ('epic','superior') THEN
    RETURN jsonb_build_object('error','pool_unavailable');
  END IF;

  -- Cost
  v_cost := CASE
    WHEN p_pool='normal'   AND p_count=1  THEN 10
    WHEN p_pool='normal'   AND p_count=10 THEN 90
    WHEN p_pool='epic'     AND p_count=1  THEN 30
    WHEN p_pool='epic'     AND p_count=10 THEN 270
    WHEN p_pool='superior' AND p_count=1  THEN 80
    WHEN p_pool='superior' AND p_count=10 THEN 720
    ELSE 9999
  END;

  -- Check balance (lock row to prevent race)
  SELECT gems INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error','profile_not_found');
  END IF;
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('error','insufficient_gems','have',v_balance,'need',v_cost);
  END IF;

  -- Deduct gems
  UPDATE profiles SET gems = gems - v_cost WHERE id = v_uid;

  -- Roll loop
  FOR i IN 1..p_count LOOP
    v_roll    := random() * 100;
    v_hero_id := NULL;
    v_shards  := 0;

    -- Rarity roll
    IF p_pool = 'normal' THEN
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

    -- Mystery (no hero in pool)
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

    -- Ownership check
    SELECT EXISTS(
      SELECT 1 FROM player_heroes
      WHERE user_id = v_uid AND hero_id = v_hero_id
    ) INTO v_has_hero;

    -- Hero name
    SELECT name INTO v_hero_name
    FROM hero_definitions WHERE hero_id = v_hero_id;

    IF NOT v_has_hero THEN
      -- Add new hero
      INSERT INTO player_heroes(user_id, hero_id, stars, level, xp, hp, obtained_at)
      VALUES(v_uid, v_hero_id, 1, 1, 0, 100, NOW())
      ON CONFLICT(user_id, hero_id) DO NOTHING;
    ELSE
      -- Duplicate → shards
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

-- ── 4. rpc_simulate_battle — add Gorr + Craw hero branches ───────────────────
-- Add these two ELSIF blocks inside rpc_simulate_battle, AFTER the RockSlime block:
--
--   ELSIF v_hname = 'Gorr' THEN
--     v_is_magic := FALSE;
--     CASE v_skill_slot
--       WHEN 1 THEN v_ratio := 1.0;  v_skill_name := 'Cleave';             v_sfx := 'basic';
--       WHEN 2 THEN v_ratio := 1.58; v_skill_name := 'Intimidating Slam';  v_sfx := 'skill2';
--       WHEN 5 THEN v_ratio := 0.88; v_skill_name := 'Reaping Arc';        v_sfx := 'ult'; v_aoe := TRUE;
--       ELSE        v_ratio := 1.0;
--     END CASE;
--
--   ELSIF v_hname = 'Craw' THEN
--     v_is_magic := FALSE;
--     CASE v_skill_slot
--       WHEN 1 THEN v_ratio := 0.9;  v_skill_name := 'Quick Shot';          v_sfx := 'basic';
--       WHEN 2 THEN v_ratio := 1.3;  v_skill_name := 'Blind Arrow';         v_sfx := 'skill2';
--       WHEN 5 THEN v_ratio := 0.72; v_skill_name := 'Skypiercer Volley';   v_sfx := 'ult'; v_aoe := TRUE;
--       ELSE        v_ratio := 0.9;
--     END CASE;
