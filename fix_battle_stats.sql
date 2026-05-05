-- ============================================================================
-- fix_battle_stats.sql  (v2 — also fixes duplicate-key crash on new battle)
--
-- BUG 1: rpc_start_battle read stale stat columns from player_heroes.
--   FIX : compute stats dynamically from hero_definitions growth rates.
--
-- BUG 2: unique constraint "idx_battle_sessions_one_active_per_user" caused
--   a duplicate-key error whenever a player started a second battle before
--   the first session expired (e.g. leaving mid-battle, session timeout, etc.)
--   FIX : drop that constraint; instead expire lingering active sessions for
--         the user at the top of rpc_start_battle before inserting the new one.
--
-- Run once in: Supabase Dashboard → SQL Editor
-- ============================================================================

-- ── Step 1: drop the one-active-per-user unique constraint ───────────────────
-- The constraint blocks new sessions if an old 'active' one lingers.
-- We replace it with explicit cleanup logic inside rpc_start_battle.
DROP INDEX IF EXISTS public.idx_battle_sessions_one_active_per_user;

CREATE OR REPLACE FUNCTION public.rpc_start_battle(
  p_stage_id     text,
  p_hero_entries jsonb   -- [{hero_id: text, slot_index: int}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid   := auth.uid();
  v_session_id  uuid   := gen_random_uuid();
  v_combatants  jsonb  := '[]'::jsonb;
  v_ap          jsonb  := '{}'::jsonb;
  v_entry       jsonb;
  v_hero_id     text;
  v_slot_idx    int;
  v_unit_uid    text;

  -- Hero stat vars (computed dynamically from hero_definitions growth)
  v_ph_level    int;
  v_ph_name     text;
  v_ph_htype    text;
  v_base_hp     int;  v_growth_hp    int;
  v_base_patk   int;  v_growth_patk  int;
  v_base_matk   int;  v_growth_matk  int;
  v_base_pdef   int;  v_growth_pdef  int;
  v_base_mdef   int;  v_growth_mdef  int;
  v_base_speed  int;
  -- Computed final stats
  v_ph_hp       int;
  v_ph_patk     int;
  v_ph_matk     int;
  v_ph_pdef     int;
  v_ph_mdef     int;
  v_ph_speed    int;

  v_skills      jsonb;
  -- Enemy stat vars (already computed from growth, kept as-is)
  v_en_hp       int;
  v_en_patk     int;
  v_en_matk     int;
  v_en_pdef     int;
  v_en_mdef     int;
  v_en_speed    int;
  i             int;
  v_rec         record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth/unauthorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM stage_definitions WHERE stage_id = p_stage_id) THEN
    RAISE EXCEPTION 'stage/not-found:%', p_stage_id;
  END IF;

  IF p_hero_entries IS NULL OR jsonb_array_length(p_hero_entries) = 0 THEN
    RAISE EXCEPTION 'battle/no-heroes';
  END IF;

  -- ── Step 2: expire any lingering active sessions for this user ────────────
  -- Prevents duplicate-key violations if the player abandoned a previous battle.
  UPDATE battle_sessions
  SET    status = 'expired'
  WHERE  user_id = v_uid AND status = 'active';

  -- ── Hero combatants ──────────────────────────────────────────────────────
  -- FIX: fetch level + growth rates from hero_definitions, then compute stats
  --      dynamically using base + (level-1)*growth  (same as client computeStats)
  FOR i IN 0 .. jsonb_array_length(p_hero_entries) - 1 LOOP
    v_entry    := p_hero_entries -> i;
    v_hero_id  := v_entry ->> 'hero_id';
    v_slot_idx := (v_entry ->> 'slot_index')::int;
    v_unit_uid := 'hero-' || v_slot_idx;

    SELECT
      ph.level,
      hd.name,        hd.hero_type,
      hd.base_hp,     hd.growth_hp,
      hd.base_p_atk,  hd.growth_p_atk,
      hd.base_m_atk,  hd.growth_m_atk,
      hd.base_p_def,  hd.growth_p_def,
      hd.base_m_def,  hd.growth_m_def,
      hd.base_speed
    INTO
      v_ph_level,
      v_ph_name,     v_ph_htype,
      v_base_hp,     v_growth_hp,
      v_base_patk,   v_growth_patk,
      v_base_matk,   v_growth_matk,
      v_base_pdef,   v_growth_pdef,
      v_base_mdef,   v_growth_mdef,
      v_base_speed
    FROM   player_heroes ph
    JOIN   hero_definitions hd ON hd.hero_id = ph.hero_id
    WHERE  ph.user_id = v_uid AND ph.hero_id = v_hero_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'hero/not-owned:%', v_hero_id;
    END IF;

    -- Compute stats dynamically — mirrors computeStats() in hero-db.ts
    v_ph_hp    := v_base_hp    + (v_ph_level - 1) * v_growth_hp;
    v_ph_patk  := v_base_patk  + (v_ph_level - 1) * v_growth_patk;
    v_ph_matk  := v_base_matk  + (v_ph_level - 1) * v_growth_matk;
    v_ph_pdef  := v_base_pdef  + (v_ph_level - 1) * v_growth_pdef;
    v_ph_mdef  := v_base_mdef  + (v_ph_level - 1) * v_growth_mdef;
    v_ph_speed := v_base_speed;  -- speed does not scale with level

    -- Unlocked skills (authoritative from hero_skills table)
    SELECT jsonb_agg(
      jsonb_build_object(
        'skill_id',        hs.skill_id,
        'hero_id',         hs.hero_id,
        'skill_slot',      hs.skill_slot,
        'name',            hs.name,
        'skill_type',      hs.skill_type,
        'damage_ratio',    hs.damage_ratio,
        'damage_type',     hs.damage_type,
        'target_type',     hs.target_type,
        'effect_type',     hs.effect_type,
        'effect_duration', hs.effect_duration,
        'effect_chance',   hs.effect_chance
      ) ORDER BY hs.skill_slot
    )
    INTO v_skills
    FROM hero_skills hs
    WHERE hs.hero_id = v_hero_id AND hs.unlock_level <= v_ph_level;

    v_combatants := v_combatants || jsonb_build_array(jsonb_build_object(
      'uid',        v_unit_uid,  'hero_id',    v_hero_id,
      'name',       v_ph_name,   'side',       'hero',
      'slot_index', v_slot_idx,  'level',      v_ph_level,
      'hero_type',  v_ph_htype,  'max_hp',     v_ph_hp,
      'current_hp', v_ph_hp,     'p_atk',      v_ph_patk,
      'm_atk',      v_ph_matk,   'p_def',      v_ph_pdef,
      'm_def',      v_ph_mdef,   'speed',      v_ph_speed,
      'turn_index', 0,           'is_alive',   true,
      'skills',     COALESCE(v_skills, '[]'::jsonb)
    ));
    v_ap := v_ap || jsonb_build_object(v_unit_uid, 0);
  END LOOP;

  -- ── Enemy combatants (unchanged — already computed from growth) ──────────
  FOR v_rec IN (
    SELECT se.enemy_hero_id, se.enemy_level, se.slot_position, se.order_index,
           hd.name, hd.hero_type,
           hd.base_hp,   hd.base_p_atk, hd.base_m_atk,
           hd.base_p_def, hd.base_m_def, hd.base_speed,
           hd.growth_hp, hd.growth_p_atk, hd.growth_m_atk,
           hd.growth_p_def, hd.growth_m_def
    FROM   stage_enemies se
    JOIN   hero_definitions hd ON hd.hero_id = se.enemy_hero_id
    WHERE  se.stage_id = p_stage_id
    ORDER  BY se.order_index
  ) LOOP
    v_unit_uid := 'enemy-' || v_rec.slot_position;
    v_en_hp    := v_rec.base_hp    + (v_rec.enemy_level - 1) * v_rec.growth_hp;
    v_en_patk  := v_rec.base_p_atk + (v_rec.enemy_level - 1) * v_rec.growth_p_atk;
    v_en_matk  := v_rec.base_m_atk + (v_rec.enemy_level - 1) * v_rec.growth_m_atk;
    v_en_pdef  := v_rec.base_p_def + (v_rec.enemy_level - 1) * v_rec.growth_p_def;
    v_en_mdef  := v_rec.base_m_def + (v_rec.enemy_level - 1) * v_rec.growth_m_def;
    v_en_speed := v_rec.base_speed;

    SELECT jsonb_agg(
      jsonb_build_object(
        'skill_id',     hs.skill_id,   'hero_id',      hs.hero_id,
        'skill_slot',   hs.skill_slot, 'name',         hs.name,
        'skill_type',   hs.skill_type, 'damage_ratio', hs.damage_ratio,
        'damage_type',  hs.damage_type,'target_type',  hs.target_type,
        'effect_type',  hs.effect_type,'effect_duration', hs.effect_duration,
        'effect_chance', hs.effect_chance
      ) ORDER BY hs.skill_slot
    )
    INTO v_skills
    FROM hero_skills hs
    WHERE hs.hero_id = v_rec.enemy_hero_id AND hs.unlock_level <= v_rec.enemy_level;

    v_combatants := v_combatants || jsonb_build_array(jsonb_build_object(
      'uid',        v_unit_uid,           'hero_id',    v_rec.enemy_hero_id,
      'name',       v_rec.name,           'side',       'enemy',
      'slot_index', v_rec.slot_position,  'level',      v_rec.enemy_level,
      'hero_type',  v_rec.hero_type,      'max_hp',     v_en_hp,
      'current_hp', v_en_hp,              'p_atk',      v_en_patk,
      'm_atk',      v_en_matk,            'p_def',      v_en_pdef,
      'm_def',      v_en_mdef,            'speed',      v_en_speed,
      'turn_index', 0,                    'is_alive',   true,
      'skills',     COALESCE(v_skills, '[]'::jsonb)
    ));
    v_ap := v_ap || jsonb_build_object(v_unit_uid, 0);
  END LOOP;

  INSERT INTO battle_sessions (id, user_id, stage_id, state)
  VALUES (
    v_session_id, v_uid, p_stage_id,
    jsonb_build_object(
      'combatants', v_combatants, 'ap', v_ap,
      'winner', NULL, 'ended', false
    )
  );

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'combatants', v_combatants,
    'ap',         v_ap
  );
END;
$$;