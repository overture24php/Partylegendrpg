-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RPG Game — Server-Side Battle Validation Schema                        ║
-- ║  Jalankan sekali di: Supabase Dashboard → SQL Editor                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── battle_sessions: server-authoritative battle state ──────────────────────
CREATE TABLE IF NOT EXISTS public.battle_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id    TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  state       JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);

CREATE INDEX IF NOT EXISTS idx_battle_sessions_user   ON public.battle_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_battle_sessions_status ON public.battle_sessions(status);

ALTER TABLE public.battle_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bs_owner_select" ON public.battle_sessions;
CREATE POLICY "bs_owner_select" ON public.battle_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- updated_at trigger (reuses function from hero schema)
DROP TRIGGER IF EXISTS trg_battle_sessions_upd ON public.battle_sessions;
CREATE TRIGGER trg_battle_sessions_upd
  BEFORE UPDATE ON public.battle_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 1: rpc_start_battle
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_start_battle(
  p_stage_id     text,
  p_hero_entries jsonb
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
  v_ph_hp       int;
  v_ph_patk     int;
  v_ph_matk     int;
  v_ph_pdef     int;
  v_ph_mdef     int;
  v_ph_speed    int;
  v_ph_level    int;
  v_ph_name     text;
  v_ph_htype    text;
  v_skills      jsonb;
  v_en_hp       int;
  v_en_patk     int;
  v_en_matk     int;
  v_en_pdef     int;
  v_en_mdef     int;
  i             int;
  v_rec         record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth/unauthorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM stage_definitions WHERE stage_id = p_stage_id) THEN
    RAISE EXCEPTION 'stage/not-found: %', p_stage_id;
  END IF;

  IF p_hero_entries IS NULL OR jsonb_array_length(p_hero_entries) = 0 THEN
    RAISE EXCEPTION 'battle/no-heroes';
  END IF;

  -- Hero combatants
  FOR i IN 0 .. jsonb_array_length(p_hero_entries) - 1 LOOP
    v_entry    := p_hero_entries -> i;
    v_hero_id  := v_entry ->> 'hero_id';
    v_slot_idx := (v_entry ->> 'slot_index')::int;
    v_unit_uid := 'hero-' || v_slot_idx;

    SELECT ph.level, ph.hp, ph.p_atk, ph.m_atk, ph.p_def, ph.m_def, ph.speed,
           hd.name, hd.hero_type
    INTO   v_ph_level, v_ph_hp, v_ph_patk, v_ph_matk, v_ph_pdef, v_ph_mdef,
           v_ph_speed, v_ph_name, v_ph_htype
    FROM   player_heroes ph
    JOIN   hero_definitions hd ON hd.hero_id = ph.hero_id
    WHERE  ph.user_id = v_uid AND ph.hero_id = v_hero_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'hero/not-owned: %', v_hero_id;
    END IF;

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

  -- Enemy combatants from stage
  FOR v_rec IN (
    SELECT se.enemy_hero_id, se.enemy_level, se.slot_position, se.order_index,
           hd.name, hd.hero_type,
           hd.base_hp,    hd.base_p_atk,  hd.base_m_atk,
           hd.base_p_def, hd.base_m_def,  hd.base_speed,
           hd.growth_hp,  hd.growth_p_atk, hd.growth_m_atk,
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

    SELECT jsonb_agg(
      jsonb_build_object(
        'skill_id',       hs.skill_id,    'hero_id',       hs.hero_id,
        'skill_slot',     hs.skill_slot,  'name',          hs.name,
        'skill_type',     hs.skill_type,  'damage_ratio',  hs.damage_ratio,
        'damage_type',    hs.damage_type, 'target_type',   hs.target_type,
        'effect_type',    hs.effect_type, 'effect_duration', hs.effect_duration,
        'effect_chance',  hs.effect_chance
      ) ORDER BY hs.skill_slot
    )
    INTO v_skills
    FROM hero_skills hs
    WHERE hs.hero_id = v_rec.enemy_hero_id AND hs.unlock_level <= v_rec.enemy_level;

    v_combatants := v_combatants || jsonb_build_array(jsonb_build_object(
      'uid',        v_unit_uid,          'hero_id',    v_rec.enemy_hero_id,
      'name',       v_rec.name,          'side',       'enemy',
      'slot_index', v_rec.slot_position, 'level',      v_rec.enemy_level,
      'hero_type',  v_rec.hero_type,     'max_hp',     v_en_hp,
      'current_hp', v_en_hp,             'p_atk',      v_en_patk,
      'm_atk',      v_en_matk,           'p_def',      v_en_pdef,
      'm_def',      v_en_mdef,           'speed',      v_rec.base_speed,
      'turn_index', 0,                   'is_alive',   true,
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

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 2: rpc_resolve_battle_turn
-- ════════════════════════════════════════════════════════════════════════════
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
  v_actor_idx      int     := -1;
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
  v_rand_idx       int;
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

  -- Advance AP (cap elapsed at 2 000 ms — anti time-skip cheat)
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

  -- Validate actor AP >= 1000
  IF COALESCE((v_ap ->> p_actor_uid)::numeric, 0) < 999.9 THEN
    RAISE EXCEPTION 'actor/ap-not-ready: %.0f',
      COALESCE((v_ap ->> p_actor_uid)::numeric, 0);
  END IF;

  -- Deduct 1000
  v_ap := jsonb_set(v_ap, ARRAY[p_actor_uid],
    to_jsonb(GREATEST(0.0,
      COALESCE((v_ap ->> p_actor_uid)::numeric, 0) - 1000.0)));

  -- Locate actor
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF v_combatants -> i ->> 'uid' = p_actor_uid THEN
      v_actor     := v_combatants -> i;
      v_actor_idx := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_actor IS NULL OR NOT (v_actor ->> 'is_alive')::bool THEN
    RAISE EXCEPTION 'actor/not-found-or-dead: %', p_actor_uid;
  END IF;

  v_actor_side  := v_actor ->> 'side';
  v_actor_hid   := v_actor ->> 'hero_id';
  v_actor_ti    := (v_actor ->> 'turn_index')::int;
  v_actor_patk  := (v_actor ->> 'p_atk')::int;
  v_actor_matk  := (v_actor ->> 'm_atk')::int;
  v_actor_level := (v_actor ->> 'level')::int;
  v_enemy_side  := CASE WHEN v_actor_side = 'hero' THEN 'enemy' ELSE 'hero' END;
  v_new_turn_num := v_actor_ti + 1;

  -- Pick skill slot — mirrors client pickSlot(t) logic exactly
  -- t<=1 -> slot 0 (basic); else (t-2)%5: 0->1(sk1), 1->2(sk2), 2->3(ult), else->0(basic)
  IF v_new_turn_num <= 1 THEN
    v_skill_slot := 0;
  ELSE
    v_skill_slot := CASE ((v_new_turn_num - 2) % 5)
      WHEN 0 THEN 1
      WHEN 1 THEN 2
      WHEN 2 THEN 3
      ELSE        0
    END;
  END IF;

  -- Fetch authoritative skill from hero_skills table (NOT from client)
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

  -- Collect alive targets
  v_alive_enemy := '{}'; v_alive_ally  := '{}';
  v_ally_hp     := '{}'; v_ally_maxhp  := '{}';

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

  -- Execute skill
  IF v_skill_type = 'damage' THEN

    IF v_skill_ttype = 'all_enemies' THEN
      v_dmg_targets := v_alive_enemy;
    ELSE
      IF array_length(v_alive_enemy, 1) IS NULL THEN
        v_dmg_targets := '{}';
      ELSE
        v_rand_idx    := 1 + FLOOR(RANDOM() * array_length(v_alive_enemy, 1))::int;
        v_dmg_targets := ARRAY[v_alive_enemy[v_rand_idx]];
      END IF;
    END IF;

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
            'heal', 0, 'type', 'dmg', 'died', v_died
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
    v_hp_map    := v_hp_map    || jsonb_build_object(v_uid_i,
                     (v_combatants -> i ->> 'current_hp')::int);
    v_alive_map := v_alive_map || jsonb_build_object(v_uid_i,
                     (v_combatants -> i ->> 'is_alive')::bool);
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

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 3: rpc_complete_battle
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_complete_battle(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_sess     record;
  v_winner   text;
  v_stage    record;
  v_hero_ids text[];
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
  WHERE  id = p_session_id
    AND  status IN ('victory', 'defeat', 'active');

  IF v_winner = 'hero' THEN
    SELECT * INTO v_stage FROM stage_definitions WHERE stage_id = v_sess.stage_id;
    IF FOUND THEN
      UPDATE profiles SET
        gold     = gold     + v_stage.gold_reward,
        gems     = gems     + v_stage.gem_reward,
        xp       = xp       + v_stage.exp_reward,
        hero_exp = hero_exp + v_stage.hero_exp_reward
      WHERE id = v_uid;

      SELECT array_agg(c ->> 'hero_id')
      INTO   v_hero_ids
      FROM   jsonb_array_elements(v_sess.state -> 'combatants') AS c
      WHERE  c ->> 'side' = 'hero';

      IF v_hero_ids IS NOT NULL THEN
        UPDATE player_heroes SET
          xp         = xp         + v_stage.hero_exp_reward,
          updated_at = NOW()
        WHERE user_id = v_uid AND hero_id = ANY(v_hero_ids);
      END IF;

      RETURN jsonb_build_object(
        'winner', 'hero',
        'rewards', jsonb_build_object(
          'gold',     v_stage.gold_reward,
          'gems',     v_stage.gem_reward,
          'exp',      v_stage.exp_reward,
          'hero_exp', v_stage.hero_exp_reward
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'winner',  COALESCE(v_winner, 'enemy'),
    'rewards', NULL
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_start_battle(text, jsonb)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_battle_turn(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_battle(uuid)                TO authenticated;
