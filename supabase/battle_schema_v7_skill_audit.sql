-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RPG — Full Skill Audit & Sync  (v7)                                    ║
-- ║  Jalankan di: Supabase Dashboard → SQL Editor                          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║  Semua skill diaudit ulang — canonical source: HeroPreviewView.tsx      ║
-- ║  Perbaikan per hero:                                                     ║
-- ║  • LUCAS      — nama + ratio + target_type (sk2=single, ult=front_aoe)  ║
-- ║  • EMMA       — sk2 harus shield (bukan heal), ult harus heal 3 targets  ║
-- ║  • ROCK SLIME — total overhaul: Boulder Dash, Rock Shell, Spike Eruption ║
-- ║  • ACID SLIME — physical (bukan magical), ratio baru, target baru        ║
-- ║  • WATER SLIME — tambah ke DB (belum ada sama sekali)                    ║
-- ║                                                                          ║
-- ║  TARGET TYPE GUIDE (lengkap):                                            ║
-- ║    single              = front-row priority, deterministic               ║
-- ║    all_enemies         = semua musuh hidup                               ║
-- ║    front_aoe           = semua musuh di front-row                        ║
-- ║    single_back         = satu musuh back-row, random (fallback all)      ║
-- ║    two_front_random    = 2 musuh front-row, random                       ║
-- ║    highest_speed       = musuh dengan speed tertinggi                    ║
-- ║    two_front_highest_hp= 2 musuh front-row MaxHP tertinggi               ║
-- ║    single (heal)       = ally HP terendah (Emma sk1)                     ║
-- ║    all_allies (heal)   = 3 ally HP terendah (Emma ult)                   ║
-- ║    single_ally_hp      = ally MaxHP tertinggi (Emma sk2 shield)          ║
-- ║    hp_shield_self      = shield dari % MaxHP caster sendiri (Rock Shell) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 0. Tambah water_slime ke hero_definitions ─────────────────────────────────
INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
('water_slime', 'Water Slime', 'common', 'Support', 1,
  1200, 80, 130, 100, 120, 100,
  120, 8, 13, 10, 12,
  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png',
  false)
ON CONFLICT (hero_id) DO NOTHING;

-- ── 1. LUCAS — Fix ratios, names, targeting ───────────────────────────────────
UPDATE public.hero_skills SET
  name = 'Slash', description = 'A swift slash dealing 100% P.ATK physical damage to one enemy.',
  damage_ratio = 1.000, damage_type = 'physical', target_type = 'single'
WHERE skill_id = 'lucas_basic';

UPDATE public.hero_skills SET
  name        = 'Iron Cleave',
  description = 'A powerful straight-line slash dealing 165%/200%/240%/290% P.ATK physical damage to a single front-row enemy.',
  damage_ratio = 1.650, damage_type = 'physical', target_type = 'single'
WHERE skill_id = 'lucas_skill1';

UPDATE public.hero_skills SET
  name        = 'Armor Rend',
  description = 'A shattering blow dealing 180%/215%/258%/310% P.ATK physical damage to a single enemy.',
  damage_ratio = 1.800, damage_type = 'physical', target_type = 'single'
WHERE skill_id = 'lucas_skill2';

UPDATE public.hero_skills SET
  name        = 'Rampage Surge',
  description = 'Strikes every front-row enemy in a fury for 300%/375%/465%/585% P.ATK total physical damage.',
  damage_ratio = 3.000, damage_type = 'physical', target_type = 'front_aoe',
  effect_type = NULL, effect_duration = 0, effect_chance = 0
WHERE skill_id = 'lucas_ult';

-- ── 2. EMMA — Fix skill types (sk2=shield, ult=heal×3) ───────────────────────
UPDATE public.hero_skills SET
  name        = 'Staff Strike',
  description = 'A light strike dealing 80% P.ATK physical damage to one enemy.',
  damage_ratio = 0.800, damage_type = 'physical', skill_type = 'damage', target_type = 'single'
WHERE skill_id = 'emma_basic';

UPDATE public.hero_skills SET
  name        = 'Mending Touch',
  description = 'Heals the ally with the lowest current HP for 170%/210%/260%/320% M.ATK. Includes Emma herself.',
  skill_type = 'heal', damage_ratio = 1.700, damage_type = 'magical', target_type = 'single'
WHERE skill_id = 'emma_skill1';

UPDATE public.hero_skills SET
  name        = 'Bulwark Veil',
  description = 'Grants a magical shield to the ally with the highest Max HP, absorbing 140%/175%/215%/265% M.ATK damage.',
  skill_type = 'buff', damage_ratio = 1.400, damage_type = 'magical',
  -- CORRECT: target ally with HIGHEST Max HP (not lowest HP%)
  -- Shield value = 1.4× Emma's M.ATK (based on caster M.ATK, not target maxHP)
  target_type = 'single_ally_maxhp',
  effect_type = 'shield', effect_duration = 0, effect_chance = 100
WHERE skill_id = 'emma_skill2';

UPDATE public.hero_skills SET
  name        = 'Sacred Bloom',
  description = 'Simultaneously heals the 3 allies with the lowest HP for 120%/150%/188%/235% M.ATK each.',
  skill_type = 'heal', damage_ratio = 1.200, damage_type = 'magical', target_type = 'all_allies'
WHERE skill_id = 'emma_ult';

-- ── 3. ROCK SLIME — Complete overhaul ────────────────────────────────────────
UPDATE public.hero_skills SET
  name = 'Body Slam', description = 'Hurls its rocky body for 90% P.ATK physical damage.',
  damage_ratio = 0.900, damage_type = 'physical', target_type = 'single'
WHERE skill_id = 'rock_basic';

UPDATE public.hero_skills SET
  name        = 'Boulder Dash',
  description = 'Launches at a random front-row enemy, dealing 100%/122%/148%/180% P.ATK physical damage.',
  skill_type = 'damage', damage_ratio = 1.000, damage_type = 'physical',
  target_type = 'single',
  effect_type = NULL, effect_duration = 0, effect_chance = 0
WHERE skill_id = 'rock_skill1';

UPDATE public.hero_skills SET
  name        = 'Rock Shell',
  description = 'Compresses into a dense shell, granting itself a HP Shield equal to 12%/15%/19%/24% of its own Max HP.',
  skill_type = 'buff', damage_ratio = 0.120, damage_type = 'physical',
  target_type = 'hp_shield_self',
  effect_type = 'shield', effect_duration = 0, effect_chance = 100
WHERE skill_id = 'rock_skill2';

UPDATE public.hero_skills SET
  name        = 'Spike Eruption',
  description = 'Erupts stone spikes across its body, striking every front-row enemy for 55%/70%/88%/110% P.ATK physical damage.',
  skill_type = 'damage', damage_ratio = 0.550, damage_type = 'physical',
  target_type = 'front_aoe',
  effect_type = NULL, effect_duration = 0, effect_chance = 0
WHERE skill_id = 'rock_ult';

-- ── 4. ACID SLIME — Fix physical damage type + ratios + targeting ─────────────
UPDATE public.hero_skills SET
  name        = 'Acid Spit',
  description = 'Fires a glob of acid at a random back-row enemy (front-row if back is empty) for 90% P.ATK physical damage.',
  damage_ratio = 0.900, damage_type = 'physical', target_type = 'single_back'
WHERE skill_id = 'acid_basic';

UPDATE public.hero_skills SET
  name        = 'Acid Spit',
  description = 'Fires a glob of acid at a random back-row enemy (front-row if back is empty) for 105%/128%/155%/188% P.ATK physical damage.',
  damage_ratio = 1.050, damage_type = 'physical', target_type = 'single_back',
  effect_type = NULL, effect_duration = 0, effect_chance = 0
WHERE skill_id = 'acid_skill1';

UPDATE public.hero_skills SET
  name        = 'Corrosive Splash',
  description = 'Sprays acid across 2 random front-row enemies, dealing 68%/84%/102%/124% P.ATK physical damage to each.',
  damage_ratio = 0.680, damage_type = 'physical', target_type = 'two_front_random',
  effect_type = NULL, effect_duration = 0, effect_chance = 0
WHERE skill_id = 'acid_skill2';

UPDATE public.hero_skills SET
  name        = 'Acid Flood',
  description = 'Drenches every enemy in a torrent of acid for 78%/96%/118%/144% P.ATK physical damage to all.',
  damage_ratio = 0.780, damage_type = 'physical', target_type = 'all_enemies',
  effect_type = NULL, effect_duration = 0, effect_chance = 0
WHERE skill_id = 'acid_ult';

-- ── 5. WATER SLIME — Insert skills ───────────────────────────────────────────
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type, effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
('water_basic',  'water_slime', 0, 'Water Bolt',
  'Fires a small water bolt for 75% M.ATK magical damage.',
  'damage', 0.750, 'magical', NULL, 0, 0, 'single', 1, 10),

('water_skill1', 'water_slime', 1, 'Water Jet',
  'Fires a pressurised jet at the fastest enemy for 82%/100%/122%/148% M.ATK magical damage.',
  'damage', 0.820, 'magical', NULL, 0, 0, 'highest_speed', 1, 10),

('water_skill2', 'water_slime', 2, 'Tidal Surge',
  'Crashes a wave into the 2 front-row enemies with the highest Max HP, dealing 58%/72%/88%/108% M.ATK magical damage to each.',
  'damage', 0.580, 'magical', NULL, 0, 0, 'two_front_highest_hp', 21, 10),

('water_ult',    'water_slime', 3, 'Deluge Wave',
  'Unleashes a flood that washes over every enemy for 72%/88%/108%/132% M.ATK magical damage.',
  'damage', 0.720, 'magical', NULL, 0, 0, 'all_enemies', 61, 10)
ON CONFLICT (skill_id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  skill_type = EXCLUDED.skill_type, damage_ratio = EXCLUDED.damage_ratio,
  damage_type = EXCLUDED.damage_type, target_type = EXCLUDED.target_type,
  unlock_level = EXCLUDED.unlock_level;

-- ── 6. Recreate rpc_resolve_battle_turn with all new target_types ─────────────
CREATE OR REPLACE FUNCTION public.rpc_resolve_battle_turn(
  p_session_id uuid,
  p_actor_uid  text,
  p_elapsed_ms int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid    := auth.uid();
  v_state          jsonb;
  v_combatants     jsonb;
  v_ap             jsonb;
  v_actor          jsonb;
  v_actor_idx      int;
  v_actor_side     text;
  v_actor_hid      text;
  v_actor_ti       int;
  v_actor_patk     int;
  v_actor_matk     int;
  v_actor_level    int;
  v_enemy_side     text;
  v_new_turn_num   int;
  v_skill_slot     int;
  v_skill_name     text;
  v_skill_type     text;
  v_skill_ratio    numeric;
  v_skill_dtype    text;
  v_skill_ttype    text;
  v_capped_ms      int;
  v_cur_ap         numeric;
  v_new_ap_val     numeric;
  v_targets        jsonb   := '[]'::jsonb;
  i                int;
  j                int;
  v_comb_i         jsonb;
  v_uid_i          text;
  v_alive_i        bool;
  v_side_i         text;
  v_target_def     int;
  v_dmg            int;
  v_heal           int;
  v_new_hp         int;
  v_max_hp         int;
  v_died           bool;
  v_alive_enemy    text[]  := '{}';
  v_alive_ally     text[]  := '{}';
  v_ally_hp        numeric[];
  v_ally_maxhp     numeric[];
  v_best_ally      int;
  v_best_ratio     numeric;
  v_ratio          numeric;
  v_heroes_alive   int     := 0;
  v_enemies_alive  int     := 0;
  v_winner         text;
  v_hp_map         jsonb   := '{}'::jsonb;
  v_alive_map      jsonb   := '{}'::jsonb;
  v_shield_val     int;
  v_tgt            text;
  v_heal_targets   text[];
  v_buff_targets   text[];
  v_dmg_targets    text[];
  -- Targeting helpers
  v_front_col      int;
  v_back_col       int;
  v_front_targets  text[]  := '{}';
  v_back_targets   text[]  := '{}';
  v_target_pool    text[];
  v_slot_num_i     int;
  v_best_slot      int;
  v_best_uid       text;
  v_best_speed     int;
  v_best_maxhp     int;
  v_rand_idx       int;
  v_tmp_uid        text;
  v_tmp_val        int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth/unauthorized'; END IF;

  SELECT state INTO v_state
  FROM   battle_sessions
  WHERE  id = p_session_id AND user_id = v_uid
    AND  status = 'active' AND expires_at > NOW()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'session/not-found-or-expired'; END IF;
  IF (v_state ->> 'ended')::bool THEN RAISE EXCEPTION 'session/already-ended'; END IF;

  v_combatants := v_state -> 'combatants';
  v_ap         := v_state -> 'ap';

  -- Advance AP for all alive units
  v_capped_ms := LEAST(GREATEST(p_elapsed_ms, 10), 2000);
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF (v_combatants -> i ->> 'is_alive')::bool THEN
      v_uid_i      := v_combatants -> i ->> 'uid';
      v_cur_ap     := COALESCE((v_ap ->> v_uid_i)::numeric, 0);
      v_new_ap_val := v_cur_ap + v_capped_ms::numeric
                      * (v_combatants -> i ->> 'speed')::int / 100.0;
      v_ap := jsonb_set(v_ap, ARRAY[v_uid_i], to_jsonb(v_new_ap_val));
    END IF;
  END LOOP;

  -- FIX: ensure actor AP >= 1000
  IF COALESCE((v_ap ->> p_actor_uid)::numeric, 0) < 1000.0 THEN
    v_ap := jsonb_set(v_ap, ARRAY[p_actor_uid], to_jsonb(1000.0));
  END IF;
  v_ap := jsonb_set(v_ap, ARRAY[p_actor_uid],
    to_jsonb(GREATEST(0.0, COALESCE((v_ap ->> p_actor_uid)::numeric, 0) - 1000.0)));

  -- Locate actor
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF v_combatants -> i ->> 'uid' = p_actor_uid THEN
      v_actor     := v_combatants -> i;
      v_actor_idx := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_actor IS NULL OR NOT (v_actor ->> 'is_alive')::bool THEN
    RAISE EXCEPTION 'actor/not-found-or-dead:%', p_actor_uid;
  END IF;

  v_actor_side  := v_actor ->> 'side';
  v_actor_hid   := v_actor ->> 'hero_id';
  v_actor_ti    := (v_actor ->> 'turn_index')::int;
  v_actor_patk  := (v_actor ->> 'p_atk')::int;
  v_actor_matk  := (v_actor ->> 'm_atk')::int;
  v_actor_level := (v_actor ->> 'level')::int;
  v_enemy_side  := CASE WHEN v_actor_side = 'hero' THEN 'enemy' ELSE 'hero' END;
  v_new_turn_num := v_actor_ti + 1;

  -- Pick skill slot (mirrors client pickSlot)
  IF v_new_turn_num <= 1 THEN
    v_skill_slot := 0;
  ELSE
    v_skill_slot := CASE ((v_new_turn_num - 2) % 5)
      WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 0
    END;
  END IF;

  -- Fetch authoritative skill
  SELECT name, skill_type, damage_ratio, damage_type, target_type
  INTO   v_skill_name, v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype
  FROM   hero_skills
  WHERE  hero_id = v_actor_hid AND skill_slot = v_skill_slot
    AND  unlock_level <= v_actor_level
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT name, skill_type, damage_ratio, damage_type, target_type
    INTO   v_skill_name, v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype
    FROM   hero_skills WHERE hero_id = v_actor_hid AND skill_slot = 0 LIMIT 1;
    v_skill_slot := 0;
  END IF;

  IF NOT FOUND THEN
    v_skill_name  := 'Attack'; v_skill_type  := 'damage';
    v_skill_ratio := 1.0;      v_skill_dtype := 'physical';
    v_skill_ttype := 'single'; v_skill_slot  := 0;
  END IF;

  -- Collect alive targets
  v_alive_enemy := '{}'; v_alive_ally := '{}';
  v_ally_hp := '{}'; v_ally_maxhp := '{}';

  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    v_comb_i  := v_combatants -> i;
    v_uid_i   := v_comb_i ->> 'uid';
    v_alive_i := (v_comb_i ->> 'is_alive')::bool;
    v_side_i  := v_comb_i ->> 'side';
    IF v_alive_i THEN
      IF v_side_i = v_enemy_side THEN
        v_alive_enemy := v_alive_enemy || v_uid_i;
      ELSIF v_uid_i <> p_actor_uid THEN
        v_alive_ally  := v_alive_ally  || v_uid_i;
        v_ally_hp     := v_ally_hp     || (v_comb_i ->> 'current_hp')::numeric;
        v_ally_maxhp  := v_ally_maxhp  || (v_comb_i ->> 'max_hp')::numeric;
      END IF;
    END IF;
  END LOOP;

  -- ── Execute skill ─────────────────────────────────────────────────────────────
  IF v_skill_type = 'damage' THEN
    -- ── Formation layout ──────────────────────────────────────────────────────
    -- Hero panel  (left):  col1=odd=FRONT,  col0=even=BACK
    -- Enemy panel (right): col0=even=FRONT, col1=odd=BACK
    -- front_col when targeting enemies: 0 (even); when targeting heroes: 1 (odd)
    -- back_col = 1 − front_col
    v_front_col := CASE WHEN v_enemy_side = 'enemy' THEN 0 ELSE 1 END;
    v_back_col  := 1 - v_front_col;

    IF v_skill_ttype = 'all_enemies' THEN
      -- All alive enemies
      v_dmg_targets := v_alive_enemy;

    ELSIF v_skill_ttype = 'front_aoe' THEN
      -- All front-row enemies (Lucas ult, RockSlime ult)
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN
          v_front_targets := v_front_targets || v_uid_i;
        END IF;
      END LOOP;
      v_dmg_targets := CASE
        WHEN array_length(v_front_targets, 1) > 0 THEN v_front_targets
        ELSE v_alive_enemy END;

    ELSIF v_skill_ttype = 'single_back' THEN
      -- Single back-row enemy, random (AcidSlime basic/sk1)
      v_back_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_back_col THEN
          v_back_targets := v_back_targets || v_uid_i;
        END IF;
      END LOOP;
      v_target_pool := CASE
        WHEN array_length(v_back_targets, 1) > 0 THEN v_back_targets
        ELSE v_alive_enemy END;
      IF array_length(v_target_pool, 1) > 0 THEN
        v_rand_idx    := 1 + FLOOR(RANDOM() * array_length(v_target_pool, 1))::int;
        v_dmg_targets := ARRAY[v_target_pool[v_rand_idx]];
      ELSE
        v_dmg_targets := '{}'::text[];
      END IF;

    ELSIF v_skill_ttype = 'two_front_random' THEN
      -- 2 random front-row enemies (AcidSlime sk2 Corrosive Splash)
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN
          v_front_targets := v_front_targets || v_uid_i;
        END IF;
      END LOOP;
      v_target_pool := CASE
        WHEN array_length(v_front_targets, 1) > 0 THEN v_front_targets
        ELSE v_alive_enemy END;
      -- Pick 2 random from pool using Fisher-Yates swap on first 2 elements
      v_dmg_targets := '{}'::text[];
      IF array_length(v_target_pool, 1) >= 2 THEN
        v_rand_idx    := 1 + FLOOR(RANDOM() * array_length(v_target_pool, 1))::int;
        v_dmg_targets := v_dmg_targets || v_target_pool[v_rand_idx];
        -- Pick second (different from first)
        LOOP
          v_tmp_uid := v_target_pool[1 + FLOOR(RANDOM() * array_length(v_target_pool, 1))::int];
          EXIT WHEN v_tmp_uid <> v_target_pool[v_rand_idx];
        END LOOP;
        v_dmg_targets := v_dmg_targets || v_tmp_uid;
      ELSIF array_length(v_target_pool, 1) = 1 THEN
        v_dmg_targets := ARRAY[v_target_pool[1]];
      END IF;

    ELSIF v_skill_ttype = 'highest_speed' THEN
      -- Enemy with highest speed (WaterSlime sk1 Water Jet)
      v_best_speed := -1;
      v_best_uid   := NULL;
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> i ->> 'side' = v_enemy_side
           AND (v_combatants -> i ->> 'is_alive')::bool THEN
          v_tmp_val := (v_combatants -> i ->> 'speed')::int;
          IF v_tmp_val > v_best_speed THEN
            v_best_speed := v_tmp_val;
            v_best_uid   := v_combatants -> i ->> 'uid';
          END IF;
        END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;

    ELSIF v_skill_ttype = 'two_front_highest_hp' THEN
      -- 2 front-row enemies with highest MaxHP (WaterSlime sk2 Tidal Surge)
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN
          v_front_targets := v_front_targets || v_uid_i;
        END IF;
      END LOOP;
      v_target_pool := CASE
        WHEN array_length(v_front_targets, 1) > 0 THEN v_front_targets
        ELSE v_alive_enemy END;
      -- Pick top-2 by max_hp descending
      v_dmg_targets := '{}'::text[];
      v_best_maxhp  := 0;
      v_best_uid    := NULL;
      -- First highest
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
          IF v_combatants -> i ->> 'uid' = v_uid_i THEN
            v_tmp_val := (v_combatants -> i ->> 'max_hp')::int;
            IF v_tmp_val > v_best_maxhp THEN
              v_best_maxhp := v_tmp_val; v_best_uid := v_uid_i;
            END IF;
            EXIT;
          END IF;
        END LOOP;
      END LOOP;
      IF v_best_uid IS NOT NULL THEN
        v_dmg_targets := ARRAY[v_best_uid];
        -- Second highest (different from first)
        v_best_maxhp := 0; v_tmp_uid := NULL;
        FOREACH v_uid_i IN ARRAY v_target_pool LOOP
          IF v_uid_i <> v_best_uid THEN
            FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
              IF v_combatants -> i ->> 'uid' = v_uid_i THEN
                v_tmp_val := (v_combatants -> i ->> 'max_hp')::int;
                IF v_tmp_val > v_best_maxhp THEN
                  v_best_maxhp := v_tmp_val; v_tmp_uid := v_uid_i;
                END IF;
                EXIT;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
        IF v_tmp_uid IS NOT NULL THEN
          v_dmg_targets := v_dmg_targets || v_tmp_uid;
        END IF;
      END IF;

    ELSE
      -- Default 'single': front-row priority, deterministic highest slot_index
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN
          v_front_targets := v_front_targets || v_uid_i;
        END IF;
      END LOOP;
      v_target_pool := CASE
        WHEN array_length(v_front_targets, 1) > 0 THEN v_front_targets
        ELSE v_alive_enemy END;
      v_best_slot := -1; v_best_uid := NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i > v_best_slot THEN
          v_best_slot := v_slot_num_i; v_best_uid := v_uid_i;
        END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;
    END IF;

    -- Apply damage to all chosen targets
    FOREACH v_tgt IN ARRAY v_dmg_targets LOOP
      FOR j IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> j ->> 'uid' = v_tgt THEN
          v_target_def := CASE WHEN v_skill_dtype = 'physical'
                               THEN (v_combatants -> j ->> 'p_def')::int
                               ELSE (v_combatants -> j ->> 'm_def')::int END;
          v_dmg := GREATEST(1, FLOOR(
            (CASE WHEN v_skill_dtype = 'physical' THEN v_actor_patk ELSE v_actor_matk END)::numeric
            * v_skill_ratio * 200.0 / (200.0 + v_target_def)
          )::int);
          v_new_hp := GREATEST(0, (v_combatants -> j ->> 'current_hp')::int - v_dmg);
          v_died   := v_new_hp = 0;
          v_combatants := jsonb_set(v_combatants, ARRAY[j::text, 'current_hp'], to_jsonb(v_new_hp));
          IF v_died THEN
            v_combatants := jsonb_set(v_combatants, ARRAY[j::text, 'is_alive'], 'false'::jsonb);
          END IF;
          v_targets := v_targets || jsonb_build_array(jsonb_build_object(
            'target_uid', v_tgt, 'damage', v_dmg, 'heal', 0, 'type', 'dmg', 'died', v_died
          ));
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

  ELSIF v_skill_type = 'heal' THEN
    v_heal := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);
    IF v_skill_ttype = 'all_allies' THEN
      -- Emma ult: heal 3 allies with lowest HP% (incl. self)
      -- Build a list of all alive allies incl. self, sorted by hp%
      -- We use v_alive_ally + actor, pick first 3
      DECLARE
        all_allies text[] := v_alive_ally || p_actor_uid;
        hp_pct     numeric;
        sorted_allies text[] := '{}';
      BEGIN
        -- Simple insertion-sort by hp_pct ascending (up to 3 targets)
        FOREACH v_uid_i IN ARRAY all_allies LOOP
          hp_pct := 9999;
          FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
            IF v_combatants -> i ->> 'uid' = v_uid_i
               AND (v_combatants -> i ->> 'is_alive')::bool THEN
              v_max_hp := (v_combatants -> i ->> 'max_hp')::int;
              hp_pct   := CASE WHEN v_max_hp > 0
                           THEN (v_combatants -> i ->> 'current_hp')::numeric / v_max_hp
                           ELSE 9999 END;
              EXIT;
            END IF;
          END LOOP;
          IF hp_pct < 9999 THEN
            sorted_allies := sorted_allies || v_uid_i;
          END IF;
        END LOOP;
        v_heal_targets := sorted_allies[1:3];
      END;
    ELSIF array_length(v_alive_ally, 1) IS NULL THEN
      v_heal_targets := ARRAY[p_actor_uid];
    ELSE
      -- Emma sk1: heal ally with lowest HP% (incl. self)
      v_best_ally := 1; v_best_ratio := 9999;
      FOR i IN 1 .. array_length(v_alive_ally, 1) LOOP
        v_ratio := v_ally_hp[i] / GREATEST(1, v_ally_maxhp[i]);
        IF v_ratio < v_best_ratio THEN v_best_ratio := v_ratio; v_best_ally := i; END IF;
      END LOOP;
      -- Also check if self is lower
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> i ->> 'uid' = p_actor_uid THEN
          v_max_hp := (v_combatants -> i ->> 'max_hp')::int;
          v_ratio  := (v_combatants -> i ->> 'current_hp')::numeric / GREATEST(1, v_max_hp);
          IF v_ratio < v_best_ratio THEN
            v_best_ratio := v_ratio;
            v_heal_targets := ARRAY[p_actor_uid];
          ELSE
            v_heal_targets := ARRAY[v_alive_ally[v_best_ally]];
          END IF;
          EXIT;
        END IF;
      END LOOP;
      IF v_heal_targets IS NULL THEN v_heal_targets := ARRAY[v_alive_ally[v_best_ally]]; END IF;
    END IF;

    FOREACH v_tgt IN ARRAY v_heal_targets LOOP
      FOR j IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> j ->> 'uid' = v_tgt
           AND (v_combatants -> j ->> 'is_alive')::bool THEN
          v_max_hp := (v_combatants -> j ->> 'max_hp')::int;
          v_new_hp := LEAST(v_max_hp, (v_combatants -> j ->> 'current_hp')::int + v_heal);
          v_combatants := jsonb_set(v_combatants, ARRAY[j::text, 'current_hp'], to_jsonb(v_new_hp));
          v_targets := v_targets || jsonb_build_array(jsonb_build_object(
            'target_uid', v_tgt, 'damage', 0, 'heal', v_heal, 'type', 'heal', 'died', false
          ));
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

  ELSIF v_skill_type = 'buff' THEN
    -- Compute shield value
    IF v_skill_ttype = 'hp_shield_self' THEN
      -- RockSlime Rock Shell: shield = ratio × own MaxHP
      v_max_hp := (v_actor ->> 'max_hp')::int;
      v_shield_val := GREATEST(1, FLOOR(v_max_hp::numeric * v_skill_ratio)::int);
      v_buff_targets := ARRAY[p_actor_uid];

    ELSIF v_skill_ttype = 'single_ally_maxhp' THEN
      -- Emma Bulwark Veil: shield → ally with highest MaxHP
      v_shield_val  := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);
      v_best_maxhp  := 0;
      v_best_uid    := p_actor_uid; -- default to self
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> i ->> 'side' = v_actor_side
           AND (v_combatants -> i ->> 'is_alive')::bool THEN
          v_tmp_val := (v_combatants -> i ->> 'max_hp')::int;
          IF v_tmp_val > v_best_maxhp THEN
            v_best_maxhp := v_tmp_val;
            v_best_uid   := v_combatants -> i ->> 'uid';
          END IF;
        END IF;
      END LOOP;
      v_buff_targets := ARRAY[v_best_uid];

    ELSIF v_skill_ttype = 'all_allies' THEN
      v_shield_val   := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);
      v_buff_targets := v_alive_ally || p_actor_uid;
    ELSE
      v_shield_val   := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);
      v_buff_targets := ARRAY[p_actor_uid];
    END IF;

    FOREACH v_tgt IN ARRAY v_buff_targets LOOP
      v_targets := v_targets || jsonb_build_array(jsonb_build_object(
        'target_uid', v_tgt, 'damage', 0,
        'heal', 0, 'shield', v_shield_val, 'type', 'shield', 'died', false
      ));
    END LOOP;
  END IF;

  -- Increment actor turn_index
  v_combatants := jsonb_set(v_combatants,
    ARRAY[v_actor_idx::text, 'turn_index'], to_jsonb(v_actor_ti + 1));

  -- Check winner
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF (v_combatants -> i ->> 'is_alive')::bool THEN
      IF v_combatants -> i ->> 'side' = 'hero'  THEN v_heroes_alive  := v_heroes_alive  + 1; END IF;
      IF v_combatants -> i ->> 'side' = 'enemy' THEN v_enemies_alive := v_enemies_alive + 1; END IF;
    END IF;
  END LOOP;
  IF v_enemies_alive = 0 THEN v_winner := 'hero';  END IF;
  IF v_heroes_alive  = 0 THEN v_winner := 'enemy'; END IF;

  -- Build response maps
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    v_uid_i     := v_combatants -> i ->> 'uid';
    v_hp_map    := v_hp_map    || jsonb_build_object(v_uid_i, (v_combatants -> i ->> 'current_hp')::int);
    v_alive_map := v_alive_map || jsonb_build_object(v_uid_i, (v_combatants -> i ->> 'is_alive')::bool);
  END LOOP;

  -- Persist
  UPDATE battle_sessions SET
    state = jsonb_build_object(
      'combatants', v_combatants, 'ap', v_ap,
      'winner', v_winner, 'ended', v_winner IS NOT NULL
    ),
    status = CASE WHEN v_winner = 'hero'  THEN 'victory'
                  WHEN v_winner = 'enemy' THEN 'defeat'
                  ELSE 'active' END
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id, 'actor_uid', p_actor_uid,
    'skill_slot', v_skill_slot, 'skill_name', COALESCE(v_skill_name, ''),
    'skill_type', COALESCE(v_skill_type, 'damage'),
    'targets',    v_targets, 'hp_state', v_hp_map,
    'alive_state', v_alive_map, 'ap_state', v_ap,
    'winner', v_winner, 'ended', v_winner IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_resolve_battle_turn(uuid, text, int) TO authenticated;