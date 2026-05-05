-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Chapter 1 Stage Data v2 — 20 Stages + Water Slime + Progress Tracking     ║
-- ╠══════════════════════════════════════════════════════════════════════════════╣
-- ║  Rewards balancing:                                                          ║
-- ║    Account EXP: always flat 100 per stage (all stages)                      ║
-- ║    Hero EXP: 50–350 (increases per stage)                                   ║
-- ║    Gold: 150–1600 (increases per stage)                                      ║
-- ║    Gems: ONLY at multiples of 5 (1-5, 1-10, 1-15, 1-20) — increasing       ║
-- ║  Enemy slots: Rock Slime=front(even:0,2,4) | Acid/Water=back(odd:1,3,5)    ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Add chapter1_progress to profiles ─────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chapter1_progress INTEGER DEFAULT 0;

-- ── 2. Seed Water Slime hero_definition ──────────────────────────────────────
INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
('water_slime', 'Water Slime', 'common', 'Support', 1,
 1400, 80, 160, 100, 140, 98,
 140,  8,  16, 10,  14,
 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png',
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png',
 false)
ON CONFLICT (hero_id) DO NOTHING;

-- ── 3. Seed Water Slime skills ────────────────────────────────────────────────
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type, effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
('water_basic',  'water_slime', 0, 'Water Splash',
  'Splashes water at one enemy for 0.7× magical damage.',
  'damage', 0.700, 'magical', NULL, 0, 0, 'single', 1, 10),
('water_skill1', 'water_slime', 1, 'Bubble Heal',
  'Heals the ally with lowest HP for 1.5× M.ATK.',
  'heal', 1.500, 'magical', NULL, 0, 0, 'single', 1, 10),
('water_skill2', 'water_slime', 2, 'Tidal Mend',
  'Heals all allies for 0.8× M.ATK.',
  'heal', 0.800, 'magical', NULL, 0, 0, 'all_allies', 5, 10),
('water_ult',    'water_slime', 3, 'Reviving Tide',
  'A surge of sacred water heals all allies for 1.8× M.ATK.',
  'heal', 1.800, 'magical', NULL, 0, 0, 'all_allies', 10, 10)
ON CONFLICT (skill_id) DO NOTHING;

-- ── 4. Update Stage 1-1 rewards (rebalanced) ─────────────────────────────────
UPDATE public.stage_definitions SET
  recommended_power = 300,
  exp_reward        = 100,
  hero_exp_reward   = 50,
  gold_reward       = 150,
  gem_reward        = 0
WHERE stage_id = '1-1';

-- ── 5. Insert / update stages 1-2 to 1-20 ────────────────────────────────────
INSERT INTO public.stage_definitions
  (stage_id, chapter, stage_number, name, recommended_power,
   exp_reward, gold_reward, gem_reward, hero_exp_reward, energy_cost)
VALUES
('1-2',  1,  2, 'Rocky Path',         500,  100, 200,   0,  60, 6),
('1-3',  1,  3, 'Muddy Fields',        700,  100, 250,   0,  70, 6),
('1-4',  1,  4, 'Slime Pit',           900,  100, 300,   0,  80, 6),
('1-5',  1,  5, 'Verdant Hollow',     1100,  100, 400,   5, 100, 6),
('1-6',  1,  6, 'Swamp Border',       1400,  100, 450,   0, 110, 6),
('1-7',  1,  7, 'Acid Lakes',         1600,  100, 500,   0, 120, 6),
('1-8',  1,  8, 'Stone Grove',        1900,  100, 550,   0, 130, 6),
('1-9',  1,  9, 'Sour Springs',       2200,  100, 600,   0, 140, 6),
('1-10', 1, 10, 'Ooze Ravine',        2500,  100, 700,   8, 160, 6),
('1-11', 1, 11, 'Toxic Dell',         2800,  100, 750,   0, 170, 6),
('1-12', 1, 12, 'Blighted Glade',     3100,  100, 800,   0, 180, 6),
('1-13', 1, 13, 'Crystal Fen',        3400,  100, 850,   0, 190, 6),
('1-14', 1, 14, 'Mossy Canyon',       3800,  100, 900,   0, 200, 6),
('1-15', 1, 15, 'Emerald Bog',        4200,  100,1000,  12, 220, 6),
('1-16', 1, 16, 'Slime Fortress',     4600,  100,1100,   0, 240, 6),
('1-17', 1, 17, 'Venom Crossing',     5100,  100,1200,   0, 260, 6),
('1-18', 1, 18, 'Mire Depths',        5600,  100,1300,   0, 280, 6),
('1-19', 1, 19, 'Ancient Marsh',      6200,  100,1400,   0, 300, 6),
('1-20', 1, 20, 'Slime King Lair',    7000,  100,1600,  20, 350, 6)
ON CONFLICT (stage_id) DO UPDATE SET
  recommended_power = EXCLUDED.recommended_power,
  exp_reward        = EXCLUDED.exp_reward,
  gold_reward       = EXCLUDED.gold_reward,
  gem_reward        = EXCLUDED.gem_reward,
  hero_exp_reward   = EXCLUDED.hero_exp_reward;

-- ── 6. Delete old stage enemy seeds (1-2 only, keep 1-1) ─────────────────────
DELETE FROM public.stage_enemies WHERE stage_id IN (
  '1-2','1-3','1-4','1-5','1-6','1-7','1-8','1-9','1-10',
  '1-11','1-12','1-13','1-14','1-15','1-16','1-17','1-18','1-19','1-20'
);

-- ── 7. Insert stage enemies 1-2 to 1-20 ──────────────────────────────────────
-- Slot convention: front=even(0,2,4), back=odd(1,3,5)
-- Rock Slime=front, Acid Slime=back, Water Slime=back
INSERT INTO public.stage_enemies
  (stage_id, enemy_hero_id, enemy_level, slot_position, order_index)
VALUES
-- 1-2: 2 Rock + 1 Acid (lv2)
('1-2','rock_slime',2,0,0),('1-2','rock_slime',2,2,1),('1-2','acid_slime',2,3,2),
-- 1-3: 2 Rock + 2 Acid (lv2)
('1-3','rock_slime',2,0,0),('1-3','rock_slime',2,4,1),('1-3','acid_slime',2,1,2),('1-3','acid_slime',2,3,3),
-- 1-4: 2 Rock + 1 Acid + 1 Water (lv3)
('1-4','rock_slime',3,0,0),('1-4','rock_slime',3,2,1),('1-4','acid_slime',3,1,2),('1-4','water_slime',3,3,3),
-- 1-5: 2 Rock + 2 Acid + 1 Water (lv3)
('1-5','rock_slime',3,0,0),('1-5','rock_slime',3,4,1),('1-5','acid_slime',3,1,2),('1-5','acid_slime',3,3,3),('1-5','water_slime',3,5,4),
-- 1-6: 3 Rock + 1 Acid + 1 Water (lv4)
('1-6','rock_slime',4,0,0),('1-6','rock_slime',4,2,1),('1-6','rock_slime',4,4,2),('1-6','acid_slime',4,1,3),('1-6','water_slime',4,3,4),
-- 1-7: 2 Rock + 2 Acid + 1 Water (lv4-5)
('1-7','rock_slime',4,0,0),('1-7','rock_slime',5,4,1),('1-7','acid_slime',4,1,2),('1-7','acid_slime',5,3,3),('1-7','water_slime',4,5,4),
-- 1-8: 3 Rock + 2 Acid (lv5)
('1-8','rock_slime',5,0,0),('1-8','rock_slime',5,2,1),('1-8','rock_slime',5,4,2),('1-8','acid_slime',5,1,3),('1-8','acid_slime',5,5,4),
-- 1-9: 2 Rock + 2 Acid + 1 Water (lv5-6)
('1-9','rock_slime',5,0,0),('1-9','rock_slime',5,2,1),('1-9','acid_slime',6,1,2),('1-9','acid_slime',6,3,3),('1-9','water_slime',5,5,4),
-- 1-10: 3 Rock + 1 Acid + 1 Water (lv6)
('1-10','rock_slime',6,0,0),('1-10','rock_slime',6,2,1),('1-10','rock_slime',6,4,2),('1-10','acid_slime',6,1,3),('1-10','water_slime',6,3,4),
-- 1-11: 3 Rock + 2 Acid (lv7)
('1-11','rock_slime',7,0,0),('1-11','rock_slime',7,2,1),('1-11','rock_slime',7,4,2),('1-11','acid_slime',7,1,3),('1-11','acid_slime',7,5,4),
-- 1-12: 2 Rock + 2 Acid + 1 Water (lv7-8)
('1-12','rock_slime',7,0,0),('1-12','rock_slime',7,4,1),('1-12','acid_slime',7,1,2),('1-12','acid_slime',8,3,3),('1-12','water_slime',7,5,4),
-- 1-13: 3 Rock + 1 Acid + 1 Water (lv8)
('1-13','rock_slime',8,0,0),('1-13','rock_slime',8,2,1),('1-13','rock_slime',8,4,2),('1-13','acid_slime',8,1,3),('1-13','water_slime',8,3,4),
-- 1-14: 3 Rock + 2 Acid (lv8-9)
('1-14','rock_slime',8,0,0),('1-14','rock_slime',9,2,1),('1-14','rock_slime',8,4,2),('1-14','acid_slime',9,1,3),('1-14','acid_slime',8,5,4),
-- 1-15: 2 Rock + 2 Acid + 1 Water (lv9)
('1-15','rock_slime',9,0,0),('1-15','rock_slime',9,4,1),('1-15','acid_slime',9,1,2),('1-15','acid_slime',9,3,3),('1-15','water_slime',9,5,4),
-- 1-16: 3 Rock + 1 Acid + 1 Water (lv10)
('1-16','rock_slime',10,0,0),('1-16','rock_slime',10,2,1),('1-16','rock_slime',10,4,2),('1-16','acid_slime',10,1,3),('1-16','water_slime',9,3,4),
-- 1-17: 3 Rock + 2 Acid (lv10)
('1-17','rock_slime',10,0,0),('1-17','rock_slime',10,2,1),('1-17','rock_slime',10,4,2),('1-17','acid_slime',10,1,3),('1-17','acid_slime',10,5,4),
-- 1-18: 2 Rock + 2 Acid + 1 Water (lv10-11)
('1-18','rock_slime',11,0,0),('1-18','rock_slime',10,4,1),('1-18','acid_slime',11,1,2),('1-18','acid_slime',10,3,3),('1-18','water_slime',10,5,4),
-- 1-19: 3 Rock + 2 Acid (lv11)
('1-19','rock_slime',11,0,0),('1-19','rock_slime',11,2,1),('1-19','rock_slime',11,4,2),('1-19','acid_slime',11,1,3),('1-19','acid_slime',11,5,4),
-- 1-20: 3 Rock + 1 Acid + 1 Water (lv11-12)
('1-20','rock_slime',12,0,0),('1-20','rock_slime',12,2,1),('1-20','rock_slime',11,4,2),('1-20','acid_slime',12,1,3),('1-20','water_slime',11,3,4);

-- ── 8. Update rpc_complete_battle to track chapter1_progress ─────────────────
CREATE OR REPLACE FUNCTION public.rpc_complete_battle(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_sess        record;
  v_winner      text;
  v_stage       record;
  v_hero_ids    text[];
  v_ph          record;
  v_hd          record;
  v_new_xp      bigint;
  v_new_level   int;
  v_new_hp      int; v_new_patk int; v_new_matk int;
  v_new_pdef    int; v_new_mdef int; v_new_power int;
  v_hid         text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth/unauthorized'; END IF;

  SELECT id, user_id, stage_id, status, state
  INTO   v_sess
  FROM   battle_sessions
  WHERE  id = p_session_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'session/not-found'; END IF;

  v_winner := CASE v_sess.status
    WHEN 'victory' THEN 'hero'
    WHEN 'defeat'  THEN 'enemy'
    ELSE COALESCE(v_sess.state ->> 'winner', 'enemy')
  END;

  UPDATE battle_sessions SET status = 'completed'
  WHERE  id = p_session_id AND status IN ('victory','defeat','active');

  IF v_winner = 'hero' THEN
    SELECT * INTO v_stage FROM stage_definitions WHERE stage_id = v_sess.stage_id;
    IF FOUND THEN
      -- Update currency + track chapter 1 progress
      UPDATE profiles SET
        gold     = gold     + v_stage.gold_reward,
        gems     = gems     + v_stage.gem_reward,
        xp       = xp       + v_stage.exp_reward,
        hero_exp = hero_exp + v_stage.hero_exp_reward,
        -- chapter1_progress: advance only if this stage is next in sequence
        chapter1_progress = CASE
          WHEN v_stage.chapter = 1 AND v_stage.stage_number > COALESCE(chapter1_progress,0)
          THEN v_stage.stage_number
          ELSE COALESCE(chapter1_progress,0)
        END
      WHERE id = v_uid;

      -- Collect hero IDs
      SELECT array_agg(c ->> 'hero_id') INTO v_hero_ids
      FROM   jsonb_array_elements(v_sess.state -> 'combatants') AS c
      WHERE  c ->> 'side' = 'hero';

      -- Award XP + recalculate hero level+stats
      IF v_hero_ids IS NOT NULL THEN
        FOREACH v_hid IN ARRAY v_hero_ids LOOP
          SELECT ph.xp, ph.level INTO v_ph
          FROM   player_heroes ph
          WHERE  ph.user_id = v_uid AND ph.hero_id = v_hid;
          IF FOUND THEN
            v_new_xp    := COALESCE(v_ph.xp, 0) + v_stage.hero_exp_reward;
            v_new_level := LEAST(compute_hero_level_from_xp(v_new_xp), 1000);
            v_new_level := GREATEST(v_new_level, 1);
            SELECT hd.base_hp,    hd.base_p_atk,   hd.base_m_atk,
                   hd.base_p_def, hd.base_m_def,   hd.base_speed,
                   hd.growth_hp,  hd.growth_p_atk,  hd.growth_m_atk,
                   hd.growth_p_def, hd.growth_m_def
            INTO   v_hd
            FROM   hero_definitions hd WHERE hd.hero_id = v_hid;
            IF FOUND THEN
              v_new_hp    := v_hd.base_hp    + (v_new_level - 1) * v_hd.growth_hp;
              v_new_patk  := v_hd.base_p_atk + (v_new_level - 1) * v_hd.growth_p_atk;
              v_new_matk  := v_hd.base_m_atk + (v_new_level - 1) * v_hd.growth_m_atk;
              v_new_pdef  := v_hd.base_p_def + (v_new_level - 1) * v_hd.growth_p_def;
              v_new_mdef  := v_hd.base_m_def + (v_new_level - 1) * v_hd.growth_m_def;
              v_new_power := (v_new_hp / 10) + (v_new_patk * 3) + (v_new_matk * 2) + (v_new_pdef * 2) + (v_new_mdef * 2);
              UPDATE player_heroes SET
                xp         = v_new_xp,
                level      = v_new_level,
                hp         = v_new_hp,   p_atk = v_new_patk, m_atk = v_new_matk,
                p_def      = v_new_pdef, m_def = v_new_mdef, power = v_new_power,
                updated_at = NOW()
              WHERE user_id = v_uid AND hero_id = v_hid;
            END IF;
          END IF;
        END LOOP;
      END IF;

      RETURN jsonb_build_object(
        'winner',  'hero',
        'rewards', jsonb_build_object(
          'gold',     v_stage.gold_reward,
          'gems',     v_stage.gem_reward,
          'exp',      v_stage.exp_reward,
          'hero_exp', v_stage.hero_exp_reward
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('winner','enemy','rewards',NULL);
END;
$$;

-- ── 9. Verify ─────────────────────────────────────────────────────────────────
SELECT stage_id, stage_number, recommended_power, exp_reward, gold_reward, gem_reward, hero_exp_reward
FROM   public.stage_definitions
WHERE  chapter = 1
ORDER  BY stage_number;

SELECT stage_id, COUNT(*) AS enemy_count
FROM   public.stage_enemies
WHERE  stage_id LIKE '1-%'
GROUP  BY stage_id
ORDER  BY stage_id;
