-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RPG Game — Battle Schema PATCH v2                                      ║
-- ║  Jalankan di: Supabase Dashboard → SQL Editor                          ║
-- ║                                                                         ║
-- ║  Perubahan dari v1:                                                     ║
-- ║  1. rpc_start_battle: stat hero DIHITUNG ULANG dari hero_definitions    ║
-- ║     (base + growth × level) — tidak lagi percaya nilai di player_heroes ║
-- ║     yang bisa dimanipulasi client lewat serviceRoleKey di browser.      ║
-- ║  2. Validasi level hero tidak melebihi yang seharusnya dari XP.         ║
-- ║  3. Constraint: max 1 active session per user.                          ║
-- ║  4. Helper function untuk cleanup session expired.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Constraint: 1 active session per user ────────────────────────────────────
-- Partial unique index: hanya enforce uniqueness saat status = 'active'
CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_sessions_one_active_per_user
  ON public.battle_sessions(user_id)
  WHERE status = 'active';

-- ── Helper: compute_hero_level_from_xp ───────────────────────────────────────
-- Mirrors expSystem.ts getMaxXpForLevel() — server-side level validation
CREATE OR REPLACE FUNCTION public.compute_hero_level_from_xp(p_xp bigint)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_level     int     := 0;
  v_remaining bigint  := GREATEST(0, p_xp);
  v_needed    bigint;
BEGIN
  LOOP
    EXIT WHEN v_level >= 1000;
    -- getMaxXpForLevel thresholds (matches TypeScript expSystem.ts)
    v_needed := CASE
      WHEN v_level <  30  THEN 1440
      WHEN v_level <  40  THEN 2880
      WHEN v_level <  50  THEN 7200
      WHEN v_level <  70  THEN 14400
      WHEN v_level <  90  THEN 28800
      WHEN v_level < 100  THEN 43200
      ELSE 86400
    END;
    EXIT WHEN v_remaining < v_needed;
    v_remaining := v_remaining - v_needed;
    v_level     := v_level + 1;
  END LOOP;
  RETURN v_level;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- rpc_start_battle v2 — stats RECOMPUTED from hero_definitions
-- Tidak lagi percaya player_heroes.hp / p_atk / m_atk / p_def / m_def
-- Hacker bisa manipulasi kolom itu lewat serviceRoleKey di browser,
-- tapi tidak bisa mengubah hero_definitions (hanya readable oleh user).
-- Level juga divalidasi ulang dari XP menggunakan fungsi di atas.
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
  v_skills      jsonb;
  -- Hero stats — computed server-side from hero_definitions, NOT from player_heroes stored values
  v_db_level    int;   -- level from player_heroes.level
  v_xp          bigint;-- raw XP from player_heroes.xp
  v_safe_level  int;   -- level recomputed from XP (tamper-proof)
  v_hp          int;
  v_p_atk       int;
  v_m_atk       int;
  v_p_def       int;
  v_m_def       int;
  v_speed       int;
  v_name        text;
  v_hero_type   text;
  -- hero_definitions growth fields
  v_base_hp       int; v_base_patk int; v_base_matk int;
  v_base_pdef     int; v_base_mdef int; v_base_speed int;
  v_growth_hp     int; v_growth_patk int; v_growth_matk int;
  v_growth_pdef   int; v_growth_mdef int;
  -- Enemy vars
  v_en_hp       int; v_en_patk  int; v_en_matk  int;
  v_en_pdef     int; v_en_mdef  int;
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

  -- ── Limit: 1 active session per user ────────────────────────────────────
  -- Abandon any previous active session before creating a new one
  UPDATE battle_sessions
  SET    status = 'expired'
  WHERE  user_id = v_uid AND status = 'active';

  -- ── Hero combatants ───────────────────────────────────────────────────────
  FOR i IN 0 .. jsonb_array_length(p_hero_entries) - 1 LOOP
    v_entry    := p_hero_entries -> i;
    v_hero_id  := v_entry ->> 'hero_id';
    v_slot_idx := (v_entry ->> 'slot_index')::int;
    v_unit_uid := 'hero-' || v_slot_idx;

    -- 1. Verify ownership + get raw level & XP
    SELECT ph.level, ph.xp
    INTO   v_db_level, v_xp
    FROM   player_heroes ph
    WHERE  ph.user_id = v_uid AND ph.hero_id = v_hero_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'hero/not-owned: %', v_hero_id;
    END IF;

    -- 2. Validate level from XP (tamper-proof: ignores player_heroes.level if inflated)
    --    compute_hero_level_from_xp mirrors expSystem.ts exactly
    v_safe_level := LEAST(
      compute_hero_level_from_xp(COALESCE(v_xp, 0)),
      COALESCE(v_db_level, 1)   -- take the LOWER of the two (can't be higher than XP allows)
    );
    v_safe_level := GREATEST(v_safe_level, 1); -- minimum level 1

    -- 3. Fetch base + growth from hero_definitions (immutable master data — client cannot write)
    SELECT hd.name, hd.hero_type, hd.base_speed,
           hd.base_hp,    hd.base_p_atk,  hd.base_m_atk,
           hd.base_p_def, hd.base_m_def,
           hd.growth_hp,  hd.growth_p_atk, hd.growth_m_atk,
           hd.growth_p_def, hd.growth_m_def
    INTO   v_name, v_hero_type, v_base_speed,
           v_base_hp,    v_base_patk,   v_base_matk,
           v_base_pdef,  v_base_mdef,
           v_growth_hp,  v_growth_patk,  v_growth_matk,
           v_growth_pdef, v_growth_mdef
    FROM   hero_definitions hd
    WHERE  hd.hero_id = v_hero_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'hero/definition-not-found: %', v_hero_id;
    END IF;

    -- 4. Recompute stats from formula (same as computeStats() in TypeScript)
    --    base + (level - 1) × growth
    v_hp    := v_base_hp    + (v_safe_level - 1) * v_growth_hp;
    v_p_atk := v_base_patk  + (v_safe_level - 1) * v_growth_patk;
    v_m_atk := v_base_matk  + (v_safe_level - 1) * v_growth_matk;
    v_p_def := v_base_pdef  + (v_safe_level - 1) * v_growth_pdef;
    v_m_def := v_base_mdef  + (v_safe_level - 1) * v_growth_mdef;
    v_speed := v_base_speed; -- speed tidak scale by level

    -- 5. Fetch skills unlocked at validated level
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
    WHERE hs.hero_id = v_hero_id AND hs.unlock_level <= v_safe_level;

    v_combatants := v_combatants || jsonb_build_array(jsonb_build_object(
      'uid',        v_unit_uid,  'hero_id',    v_hero_id,
      'name',       v_name,      'side',       'hero',
      'slot_index', v_slot_idx,  'level',      v_safe_level,
      'hero_type',  v_hero_type, 'max_hp',     v_hp,
      'current_hp', v_hp,        'p_atk',      v_p_atk,
      'm_atk',      v_m_atk,     'p_def',      v_p_def,
      'm_def',      v_m_def,     'speed',      v_speed,
      'turn_index', 0,           'is_alive',   true,
      'skills',     COALESCE(v_skills, '[]'::jsonb)
    ));
    v_ap := v_ap || jsonb_build_object(v_unit_uid, 0);
  END LOOP;

  -- ── Enemy combatants from stage DB ───────────────────────────────────────
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
        'skill_id',      hs.skill_id,    'hero_id',       hs.hero_id,
        'skill_slot',    hs.skill_slot,  'name',          hs.name,
        'skill_type',    hs.skill_type,  'damage_ratio',  hs.damage_ratio,
        'damage_type',   hs.damage_type, 'target_type',   hs.target_type,
        'effect_type',   hs.effect_type, 'effect_duration', hs.effect_duration,
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
      'm_def',      v_en_mdef,            'speed',      v_rec.base_speed,
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

-- ════════════════════════════════════════════════════════════════════════════
-- rpc_complete_battle v2 — recalculate hero level+stats after XP award
-- Setelah battle selesai, update player_heroes.level dan stats dari XP baru
-- ════════════════════════════════════════════════════════════════════════════
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
  -- for level recalculation
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

  -- Winner is ALWAYS from server state — not from client claim
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

      -- Update profile currency
      UPDATE profiles SET
        gold     = gold     + v_stage.gold_reward,
        gems     = gems     + v_stage.gem_reward,
        xp       = xp       + v_stage.exp_reward,
        hero_exp = hero_exp + v_stage.hero_exp_reward
      WHERE id = v_uid;

      -- Collect participating hero_ids
      SELECT array_agg(c ->> 'hero_id')
      INTO   v_hero_ids
      FROM   jsonb_array_elements(v_sess.state -> 'combatants') AS c
      WHERE  c ->> 'side' = 'hero';

      -- Award XP to each hero AND recalculate level + stats server-side
      IF v_hero_ids IS NOT NULL THEN
        FOREACH v_hid IN ARRAY v_hero_ids LOOP

          -- Get current hero XP
          SELECT ph.xp, ph.level INTO v_ph
          FROM   player_heroes ph
          WHERE  ph.user_id = v_uid AND ph.hero_id = v_hid;

          IF FOUND THEN
            v_new_xp    := COALESCE(v_ph.xp, 0) + v_stage.hero_exp_reward;
            v_new_level := LEAST(compute_hero_level_from_xp(v_new_xp), 1000);
            v_new_level := GREATEST(v_new_level, 1);

            -- Recompute stats from hero_definitions at new level
            SELECT hd.base_hp,    hd.base_p_atk,   hd.base_m_atk,
                   hd.base_p_def, hd.base_m_def,   hd.base_speed,
                   hd.growth_hp,  hd.growth_p_atk,  hd.growth_m_atk,
                   hd.growth_p_def, hd.growth_m_def
            INTO   v_hd
            FROM   hero_definitions hd
            WHERE  hd.hero_id = v_hid;

            IF FOUND THEN
              v_new_hp   := v_hd.base_hp    + (v_new_level - 1) * v_hd.growth_hp;
              v_new_patk := v_hd.base_p_atk + (v_new_level - 1) * v_hd.growth_p_atk;
              v_new_matk := v_hd.base_m_atk + (v_new_level - 1) * v_hd.growth_m_atk;
              v_new_pdef := v_hd.base_p_def + (v_new_level - 1) * v_hd.growth_p_def;
              v_new_mdef := v_hd.base_m_def + (v_new_level - 1) * v_hd.growth_m_def;
              v_new_power := ROUND(
                (v_new_hp / 10.0) + (v_new_patk * 3) + (v_new_matk * 2) +
                (v_new_pdef * 2) + (v_new_mdef * 2) + (v_hd.base_speed * 2)
              );

              -- Update player_heroes with new XP, level, and recomputed stats
              UPDATE player_heroes SET
                xp         = v_new_xp,
                level      = v_new_level,
                hp         = v_new_hp,
                p_atk      = v_new_patk,
                m_atk      = v_new_matk,
                p_def      = v_new_pdef,
                m_def      = v_new_mdef,
                speed      = v_hd.base_speed,
                power      = v_new_power,
                updated_at = NOW()
              WHERE user_id = v_uid AND hero_id = v_hid;
            END IF;
          END IF;
        END LOOP;
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

-- ════════════════════════════════════════════════════════════════════════════
-- Cleanup function: expire old sessions (bisa dipanggil manual / cron)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cleanup_expired_battle_sessions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE battle_sessions
  SET    status = 'expired'
  WHERE  status = 'active' AND expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.rpc_start_battle(text, jsonb)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_battle_turn(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_battle(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_hero_level_from_xp(bigint)       TO authenticated;
