-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RPG Battle — AcidSlime Targeting Fix + Account Level Default  (v5)    ║
-- ║  Jalankan di: Supabase Dashboard → SQL Editor                          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║  MASALAH:                                                                ║
-- ║    1. AcidSlime targeting semua enemy (front+back) karena DB masih       ║
-- ║       menggunakan target_type='all_enemies' / 'single' (front-priority). ║
-- ║       Desain yang benar: selalu prioritas back-row, random dalam pool,   ║
-- ║       fallback ke front/semua jika back row kosong.                      ║
-- ║    2. Skill names di DB berbeda dari client (Acid Spray ≠ Acid Shot).    ║
-- ║    3. Skill ratios di DB (0.75, 0.60) tidak sinkron dengan client        ║
-- ║       (sk1 Lv1=1.35, sk2 Lv1=1.20) — damage server jauh lebih rendah.  ║
-- ║    4. Akun baru dimulai dari Lv.0 — harusnya Lv.1.                      ║
-- ║       EXP table baru: Lv1-30=960, 30-40=1440, 40-60=2880,               ║
-- ║       60-80=7200, 80+=14400.                                             ║
-- ║                                                                          ║
-- ║  ATURAN MEKANISME (CANONICAL, sesuai client):                            ║
-- ║  ┌────────────────┬──────────┬───────────────┬──────────┬───────────┐   ║
-- ║  │ Hero           │ Slot     │ Skill Name    │ Ratio    │ Target    │   ║
-- ║  ├────────────────┼──────────┼───────────────┼──────────┼───────────┤   ║
-- ║  │ AcidSlime      │ basic(0) │ Acid Spit     │ 0.90     │single_back│   ║
-- ║  │ AcidSlime      │ sk1  (1) │ Acid Shot     │ 1.35     │single_back│   ║
-- ║  │ AcidSlime      │ sk2  (2) │ Venom Spray   │ 1.20     │ all_back  │   ║
-- ║  │ AcidSlime      │ ult  (3) │ Acid Nova     │ 2.20     │ all_back  │   ║
-- ║  └────────────────┴──────────┴───────────────┴──────────┴───────────┘   ║
-- ║                                                                          ║
-- ║  TARGET TYPE GUIDE:                                                      ║
-- ║    single      = front-row priority, deterministic (v3 logic)            ║
-- ║    all_enemies = all alive enemies                                       ║
-- ║    single_back = back-row priority, RANDOM within pool                   ║
-- ║    all_back    = all back-row enemies (AoE), fallback to all if empty    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Update AcidSlime skill data ────────────────────────────────────────────

UPDATE public.hero_skills SET
  name         = 'Acid Spit',
  description  = 'Spits corrosive acid for 0.9× magical damage, prioritizing back-row targets.',
  damage_ratio = 0.900,
  target_type  = 'single_back'
WHERE hero_id = 'acid_slime' AND skill_slot = 0;

UPDATE public.hero_skills SET
  name         = 'Acid Shot',
  description  = 'Fires a concentrated acid bolt for 1.35× magical damage. Targets a random back-row enemy (front row if back is empty).',
  damage_ratio = 1.350,
  target_type  = 'single_back'
WHERE hero_id = 'acid_slime' AND skill_slot = 1;

UPDATE public.hero_skills SET
  name         = 'Venom Spray',
  description  = 'Sprays toxic venom for 1.20× magical damage, hitting ALL back-row enemies. Hits all enemies if back row is empty.',
  damage_ratio = 1.200,
  target_type  = 'all_back'
WHERE hero_id = 'acid_slime' AND skill_slot = 2;

UPDATE public.hero_skills SET
  name         = 'Acid Nova',
  description  = 'Triggers a violent acid explosion for 2.20× magical damage. Prioritizes ALL back-row enemies; hits all if back row is empty.',
  damage_ratio = 2.200,
  target_type  = 'all_back'
WHERE hero_id = 'acid_slime' AND skill_slot = 3;

-- ── 2. Recreate rpc_resolve_battle_turn with single_back / all_back support ──

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
  v_target_uid     text;
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
  -- Front-row targeting (v3)
  v_front_col      int;
  v_front_targets  text[]  := '{}';
  -- Back-row targeting (v5 — AcidSlime)
  v_back_col       int;
  v_back_targets   text[]  := '{}';
  v_target_pool    text[];
  v_slot_num_i     int;
  v_best_slot      int;
  v_best_uid       text;
  v_rand_idx       int;
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

  -- ── Advance AP for all alive units ────────────────────────────────────────
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

  -- FIX 1: Ensure actor AP >= 1000 before deducting (client/server timing drift)
  IF COALESCE((v_ap ->> p_actor_uid)::numeric, 0) < 1000.0 THEN
    v_ap := jsonb_set(v_ap, ARRAY[p_actor_uid], to_jsonb(1000.0));
  END IF;

  -- Deduct 1000 from actor (carry overflow)
  v_ap := jsonb_set(v_ap, ARRAY[p_actor_uid],
    to_jsonb(GREATEST(0.0,
      COALESCE((v_ap ->> p_actor_uid)::numeric, 0) - 1000.0)));

  -- ── Locate actor ──────────────────────────────────────────────────────────
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

  -- ── Pick skill slot — mirrors client pickSlot(t) ──────────────────────────
  IF v_new_turn_num <= 1 THEN
    v_skill_slot := 0;
  ELSE
    v_skill_slot := CASE ((v_new_turn_num - 2) % 5)
      WHEN 0 THEN 1   -- sk1
      WHEN 1 THEN 2   -- sk2
      WHEN 2 THEN 3   -- ult
      ELSE          0 -- basic
    END;
  END IF;

  -- ── Fetch authoritative skill ─────────────────────────────────────────────
  SELECT name, skill_type, damage_ratio, damage_type, target_type
  INTO   v_skill_name, v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype
  FROM   hero_skills
  WHERE  hero_id = v_actor_hid
    AND  skill_slot = v_skill_slot
    AND  unlock_level <= v_actor_level
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT name, skill_type, damage_ratio, damage_type, target_type
    INTO   v_skill_name, v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype
    FROM   hero_skills
    WHERE  hero_id = v_actor_hid AND skill_slot = 0
    LIMIT 1;
    v_skill_slot := 0;
  END IF;

  IF NOT FOUND THEN
    v_skill_name  := 'Attack'; v_skill_type  := 'damage';
    v_skill_ratio := 1.0;      v_skill_dtype := 'physical';
    v_skill_ttype := 'single'; v_skill_slot  := 0;
  END IF;

  -- ── Collect alive targets ─────────────────────────────────────────────────
  v_alive_enemy := '{}';  v_alive_ally  := '{}';
  v_ally_hp     := '{}';  v_ally_maxhp  := '{}';

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

  -- ── Execute skill ─────────────────────────────────────────────────────────
  IF v_skill_type = 'damage' THEN

    -- ────────────────────────────────────────────────────────────────────────
    -- TARGETING LOGIC
    -- Formation (same panel layout for heroes and enemies):
    --   col0 = even slot_index (0,2,4) = LEFT  side of panel
    --   col1 = odd  slot_index (1,3,5) = RIGHT side of panel
    --
    -- Hero panel  (left  of screen): col1 faces enemies → FRONT = col1 (odd)
    -- Enemy panel (right of screen): col0 faces heroes  → FRONT = col0 (even)
    --
    -- When actor targets enemies (v_enemy_side='enemy'): enemy FRONT col = 0
    -- When actor targets heroes  (v_enemy_side='hero') : hero  FRONT col = 1
    -- → front_col = CASE v_enemy_side WHEN 'enemy' THEN 0 ELSE 1 END
    -- → back_col  = 1 − front_col
    -- ────────────────────────────────────────────────────────────────────────

    IF v_skill_ttype = 'all_enemies' THEN
      -- AoE: hit every alive enemy regardless of row
      v_dmg_targets := v_alive_enemy;

    ELSIF v_skill_ttype = 'all_back' THEN
      -- Back-row AoE (Venom Spray / Acid Nova / etc.):
      -- Hit all enemies in the BACK row; fall back to all alive if back is empty.
      v_back_col     := CASE WHEN v_enemy_side = 'enemy' THEN 1 ELSE 0 END;
      v_back_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_back_col THEN
          v_back_targets := v_back_targets || v_uid_i;
        END IF;
      END LOOP;
      v_dmg_targets := CASE
        WHEN array_length(v_back_targets, 1) > 0 THEN v_back_targets
        ELSE v_alive_enemy
      END;

    ELSIF v_skill_ttype = 'single_back' THEN
      -- Single target, back-row priority, RANDOM within pool (Acid Spit / Acid Shot).
      -- Falls back to all alive if back row is empty.
      v_back_col     := CASE WHEN v_enemy_side = 'enemy' THEN 1 ELSE 0 END;
      v_back_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_back_col THEN
          v_back_targets := v_back_targets || v_uid_i;
        END IF;
      END LOOP;
      v_target_pool := CASE
        WHEN array_length(v_back_targets, 1) > 0 THEN v_back_targets
        ELSE v_alive_enemy
      END;
      IF array_length(v_target_pool, 1) > 0 THEN
        v_rand_idx    := 1 + FLOOR(RANDOM() * array_length(v_target_pool, 1))::int;
        v_dmg_targets := ARRAY[v_target_pool[v_rand_idx]];
      ELSE
        v_dmg_targets := '{}'::text[];
      END IF;

    ELSE
      -- Default 'single': front-row priority, deterministic (highest slot_index = bottom visual row).
      -- Used by RockSlime, Lucas, Emma, and any non-specialised skill.
      v_front_col     := CASE WHEN v_enemy_side = 'enemy' THEN 0 ELSE 1 END;
      v_front_targets := '{}';

      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN
          v_front_targets := v_front_targets || v_uid_i;
        END IF;
      END LOOP;

      v_target_pool := CASE
        WHEN array_length(v_front_targets, 1) > 0 THEN v_front_targets
        ELSE v_alive_enemy
      END;

      -- Pick unit with HIGHEST slot_index in pool (bottom row = frontmost visually)
      v_best_slot := -1;
      v_best_uid  := NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i > v_best_slot THEN
          v_best_slot := v_slot_num_i;
          v_best_uid  := v_uid_i;
        END IF;
      END LOOP;

      v_dmg_targets := CASE
        WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid]
        ELSE '{}'::text[]
      END;
    END IF;

    -- Apply damage to chosen targets
    FOREACH v_tgt IN ARRAY v_dmg_targets LOOP
      FOR j IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> j ->> 'uid' = v_tgt THEN
          v_target_def := CASE WHEN v_skill_dtype = 'physical'
                               THEN (v_combatants -> j ->> 'p_def')::int
                               ELSE (v_combatants -> j ->> 'm_def')::int END;
          v_dmg := GREATEST(1, FLOOR(
            (CASE WHEN v_skill_dtype = 'physical'
                  THEN v_actor_patk ELSE v_actor_matk END)::numeric
            * v_skill_ratio * 200.0 / (200.0 + v_target_def)
          )::int);
          v_new_hp := GREATEST(0, (v_combatants -> j ->> 'current_hp')::int - v_dmg);
          v_died   := v_new_hp = 0;
          v_combatants := jsonb_set(v_combatants,
            ARRAY[j::text, 'current_hp'], to_jsonb(v_new_hp));
          IF v_died THEN
            v_combatants := jsonb_set(v_combatants,
              ARRAY[j::text, 'is_alive'], 'false'::jsonb);
          END IF;
          v_targets := v_targets || jsonb_build_array(jsonb_build_object(
            'target_uid', v_tgt, 'damage', v_dmg,
            'heal', 0,    'type', 'dmg',  'died', v_died
          ));
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

  ELSIF v_skill_type = 'heal' THEN

    v_heal := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);

    IF v_skill_ttype = 'all_allies' THEN
      v_heal_targets := v_alive_ally || p_actor_uid;
    ELSIF array_length(v_alive_ally, 1) IS NULL THEN
      v_heal_targets := ARRAY[p_actor_uid];
    ELSE
      v_best_ally := 1; v_best_ratio := 9999;
      FOR i IN 1 .. array_length(v_alive_ally, 1) LOOP
        v_ratio := v_ally_hp[i] / GREATEST(1, v_ally_maxhp[i]);
        IF v_ratio < v_best_ratio THEN
          v_best_ratio := v_ratio; v_best_ally := i;
        END IF;
      END LOOP;
      v_heal_targets := ARRAY[v_alive_ally[v_best_ally]];
    END IF;

    FOREACH v_tgt IN ARRAY v_heal_targets LOOP
      FOR j IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> j ->> 'uid' = v_tgt
          AND (v_combatants -> j ->> 'is_alive')::bool THEN
          v_max_hp := (v_combatants -> j ->> 'max_hp')::int;
          v_new_hp := LEAST(v_max_hp,
            (v_combatants -> j ->> 'current_hp')::int + v_heal);
          v_combatants := jsonb_set(v_combatants,
            ARRAY[j::text, 'current_hp'], to_jsonb(v_new_hp));
          v_targets := v_targets || jsonb_build_array(jsonb_build_object(
            'target_uid', v_tgt, 'damage', 0,
            'heal', v_heal, 'type', 'heal', 'died', false
          ));
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

  ELSIF v_skill_type = 'buff' THEN

    v_shield_val   := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);
    v_buff_targets := CASE WHEN v_skill_ttype = 'all_allies'
                           THEN v_alive_ally || p_actor_uid
                           ELSE ARRAY[p_actor_uid] END;

    FOREACH v_tgt IN ARRAY v_buff_targets LOOP
      v_targets := v_targets || jsonb_build_array(jsonb_build_object(
        'target_uid', v_tgt, 'damage', 0,
        'heal', 0, 'shield', v_shield_val, 'type', 'shield', 'died', false
      ));
    END LOOP;

  END IF;

  -- ── Increment actor turn_index ────────────────────────────────────────────
  v_combatants := jsonb_set(v_combatants,
    ARRAY[v_actor_idx::text, 'turn_index'], to_jsonb(v_actor_ti + 1));

  -- ── Check winner ──────────────────────────────────────────────────────────
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF (v_combatants -> i ->> 'is_alive')::bool THEN
      IF v_combatants -> i ->> 'side' = 'hero'  THEN v_heroes_alive  := v_heroes_alive  + 1; END IF;
      IF v_combatants -> i ->> 'side' = 'enemy' THEN v_enemies_alive := v_enemies_alive + 1; END IF;
    END IF;
  END LOOP;
  IF v_enemies_alive = 0 THEN v_winner := 'hero';  END IF;
  IF v_heroes_alive  = 0 THEN v_winner := 'enemy'; END IF;

  -- ── Build response maps ────────────────────────────────────────────────────
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    v_uid_i     := v_combatants -> i ->> 'uid';
    v_hp_map    := v_hp_map    || jsonb_build_object(v_uid_i,
                     (v_combatants -> i ->> 'current_hp')::int);
    v_alive_map := v_alive_map || jsonb_build_object(v_uid_i,
                     (v_combatants -> i ->> 'is_alive')::bool);
  END LOOP;

  -- ── Persist ───────────────────────────────────────────────────────────────
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
    'session_id',  p_session_id,
    'actor_uid',   p_actor_uid,
    'skill_slot',  v_skill_slot,
    'skill_name',  COALESCE(v_skill_name, ''),
    'skill_type',  COALESCE(v_skill_type, 'damage'),
    'targets',     v_targets,
    'hp_state',    v_hp_map,
    'alive_state', v_alive_map,
    'ap_state',    v_ap,
    'winner',      v_winner,
    'ended',       v_winner IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_resolve_battle_turn(uuid, text, int) TO authenticated;

-- ── 3. Fix handle_new_user trigger: default level = 1, EXP thresholds ─────────
-- New EXP table (player account level):
--   Lv  1 – 29 →    960 EXP/level
--   Lv 30 – 39 →  1,440 EXP/level
--   Lv 40 – 59 →  2,880 EXP/level
--   Lv 60 – 79 →  7,200 EXP/level
--   Lv 80+     → 14,400 EXP/level  (max Lv 1000)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, username, nickname,
    level, xp, max_xp, exp_percentage,
    gold, gems, power, hero_exp,
    vip_level, vip_exp
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1)),
    1,     -- level: start at Lv 1 (never Lv 0)
    0,     -- xp: 0 EXP within Lv 1
    960,   -- max_xp: EXP needed to reach Lv 2 (Lv 1-30 range = 960)
    0,     -- exp_percentage
    500,   -- gold
    50,    -- gems
    0,     -- power
    0,     -- hero_exp
    0,     -- vip_level
    0      -- vip_exp
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also patch any existing Lv 0 profiles to Lv 1
UPDATE public.profiles SET level = 1, max_xp = 960 WHERE level < 1;
