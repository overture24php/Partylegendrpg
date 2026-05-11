-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH — Add Sylvie (Acrobatic Archer, Rare B)                             ║
-- ║                                                                              ║
-- ║  Stats (engine-derived, HERO_VARIANTS: hp×0.88, pAtk×1.12, mAtk×0.80):    ║
-- ║    base_hp:817   base_p_atk:276  base_m_atk:197                            ║
-- ║    base_p_def:93  base_m_def:93   base_speed:197                           ║
-- ║    growth (×0.09): hp:74 p_atk:25 m_atk:18 p_def:8 m_def:8               ║
-- ║                                                                              ║
-- ║  Kit:                                                                        ║
-- ║    SK0 Snap Shot          — single, 1.00× P.ATK                            ║
-- ║    SK1 Over Cover         — single_back, 1.60× P.ATK (bypasses front row)  ║
-- ║    SK2 Scatter Volley     — two_front_random, 1.05× each                   ║
-- ║    SK3 Swift Footing      — passive_init: own Speed +12/15/20/26%          ║
-- ║    SK4 Crossfire Storm    — two_front_highest_hp, 1.60× each               ║
-- ║                                                                              ║
-- ║  All SK1/SK2/SK4 target_types exist in rpc_simulate_battle already.        ║
-- ║  Only passive_init (Swift Footing) needs the MANUAL SQL addition below.    ║
-- ║                                                                              ║
-- ║  STEP 1. Upsert hero_definitions                                            ║
-- ║  STEP 2. Upsert hero_skills (all 5 slots including passive)                 ║
-- ║  STEP 3. Replace rpc_gacha_pull — pool B now includes 'sylvie'             ║
-- ║  STEP 4. Fix any existing player_heroes rows with wrong stars               ║
-- ║  STEP 5. Verify                                                              ║
-- ║  MANUAL. Add Swift Footing passive_init to rpc_simulate_battle              ║
-- ║                                                                              ║
-- ║  Pool B after this patch: emma, lucas, brennan, sylvie                     ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: hero_definitions — upsert Sylvie
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
  ('sylvie', 'Sylvie', 'rare', 'Archer', 2,
   -- base_hp  base_p_atk  base_m_atk  base_p_def  base_m_def  base_speed
   817,        276,         197,         93,          93,          197,
   -- growth (base × 0.09)
   -- growth_hp  growth_p_atk  growth_m_atk  growth_p_def  growth_m_def
   74,           25,           18,           8,            8,
   -- sprite (idle)
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778253581/ChatGPT_Image_May_8_2026_10_15_54_PM_pk4782.png',
   -- illust (portrait card)
   'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778253528/ChatGPT_Image_May_8_2026_10_17_57_PM_bxj16w.png',
   true)
ON CONFLICT (hero_id) DO UPDATE SET
  name=EXCLUDED.name, rarity=EXCLUDED.rarity, hero_type=EXCLUDED.hero_type, stars=EXCLUDED.stars,
  base_hp=EXCLUDED.base_hp, base_p_atk=EXCLUDED.base_p_atk, base_m_atk=EXCLUDED.base_m_atk,
  base_p_def=EXCLUDED.base_p_def, base_m_def=EXCLUDED.base_m_def, base_speed=EXCLUDED.base_speed,
  growth_hp=EXCLUDED.growth_hp, growth_p_atk=EXCLUDED.growth_p_atk,
  growth_m_atk=EXCLUDED.growth_m_atk, growth_p_def=EXCLUDED.growth_p_def,
  growth_m_def=EXCLUDED.growth_m_def,
  sprite_url=EXCLUDED.sprite_url, illust_url=EXCLUDED.illust_url,
  is_playable=EXCLUDED.is_playable;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: hero_skills — all 5 slots (MANDATORY — slots 0–4 every hero)
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.hero_skills WHERE hero_id = 'sylvie';
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  -- slot 0: Basic Attack — ranged single target
  (gen_random_uuid(), 'sylvie', 0, 'Snap Shot',       'damage',  1.00, 'physical', 'single',               1),

  -- slot 1: SK1 — Over Cover, unlocks Lv1
  -- Fires over the front line, hitting a random back-row enemy.
  -- single_back already handled by rpc_simulate_battle CASE block — no function change needed.
  (gen_random_uuid(), 'sylvie', 1, 'Over Cover',       'damage',  1.60, 'physical', 'single_back',          1),

  -- slot 2: SK2 — Scatter Volley, unlocks Lv21
  -- Fires 2 bolts at random front-row enemies (may hit same or split targets).
  -- two_front_random already handled by rpc_simulate_battle CASE block — no function change needed.
  (gen_random_uuid(), 'sylvie', 2, 'Scatter Volley',   'damage',  1.05, 'physical', 'two_front_random',    21),

  -- slot 3: Passive — Swift Footing, unlocks Lv41
  -- passive_init: permanently boosts Sylvie's Speed before battle (12/15/20/26%).
  -- DB row required (MANDATORY per architectural rule). Logic added MANUALLY to rpc_simulate_battle.
  -- See STEP MANUAL below for exact SQL block to add.
  (gen_random_uuid(), 'sylvie', 3, 'Swift Footing',    'passive', 0.12, 'none',     'passive_init',        41),

  -- slot 4: ULT — Crossfire Storm, unlocks Lv61
  -- Fires twin precision bolts at the 2 highest-max-HP front-row enemies — tank buster.
  -- two_front_highest_hp already handled by rpc_simulate_battle CASE block — no function change needed.
  (gen_random_uuid(), 'sylvie', 4, 'Crossfire Storm',  'damage',  1.60, 'physical', 'two_front_highest_hp',61);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Replace rpc_gacha_pull — pool B now includes 'sylvie'
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
  -- ── Pool B — emma, lucas, brennan, sylvie ─────────────────────────────────
  v_pool_b      TEXT[]  := ARRAY['emma','lucas','brennan','sylvie'];
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

    SELECT name, stars INTO v_hero_name, v_init_stars
    FROM hero_definitions WHERE hero_id = v_hero_id;
    v_init_stars := COALESCE(v_init_stars, 1);

    IF NOT v_has_hero THEN
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

GRANT EXECUTE ON FUNCTION public.rpc_gacha_pull(TEXT, INT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Fix any existing player_heroes rows with wrong stars for sylvie
-- (Idempotent — only corrects rows where stars < 2)
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.player_heroes
SET    stars = 2
WHERE  hero_id = 'sylvie'
  AND  stars < 2;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Verify
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT hero_id, name, hero_type, rarity, stars, base_hp, base_p_atk, base_p_def, base_speed
FROM public.hero_definitions WHERE hero_id = 'sylvie';

SELECT hero_id, skill_slot, name, skill_type, damage_ratio, target_type, unlock_level
FROM public.hero_skills WHERE hero_id = 'sylvie'
ORDER BY skill_slot;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP MANUAL — Swift Footing passive_init in rpc_simulate_battle
-- ───────────────────────────────────────────────────────────────────────────────
-- Find this section in rpc_simulate_battle (Per-unit stat passive, ~50 lines after
-- the Emma Blessed Ward section):
--
--   -- Water Slime: Tidal Flow — M.ATK +8/14/20/28%
--   IF (v_u->>'hero_id')='water_slime' THEN
--     v_units:=jsonb_set(...);
--   END IF;
--   <-- ADD HERE -->
-- END LOOP;
--
-- ADD immediately after the Water Slime block (before END LOOP):
--
--   -- Sylvie: Swift Footing — Speed +12/15/20/26% (passive_init, lv1–lv4 unlocks)
--   IF (v_u->>'hero_id')='sylvie' THEN
--     v_units:=jsonb_set(v_units,ARRAY[v_k,'speed'],
--       to_jsonb(GREATEST(1,round((v_units->v_k->>'speed')::NUMERIC*
--         (1+CASE v_llv3 WHEN 1 THEN 0.12 WHEN 2 THEN 0.15 WHEN 3 THEN 0.20 ELSE 0.26 END))::INT)));
--   END IF;
--
-- WHERE v_llv3 is already computed by the surrounding FOR loop using:
--   v_llv3 := CASE WHEN level>=240 THEN 4 WHEN >=201 THEN 3 WHEN >=121 THEN 2 WHEN >=41 THEN 1 ELSE 0 END;
-- So the same level-threshold variable used for Rock/Acid/Water Slime applies here too.
-- No new variable needed. This addition is 5 lines total.
-- ═══════════════════════════════════════════════════════════════════════════════
