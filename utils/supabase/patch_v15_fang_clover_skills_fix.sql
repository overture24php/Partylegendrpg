-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v15 — Fix Fang & Clover Skill Mechanics (Full Audit)               ║
-- ╠══════════════════════════════════════════════════════════════════════════════╣
-- ║  ROOT CAUSE:                                                                ║
-- ║  patch_v14 inserted hero_skills rows with target_types/skill_types the      ║
-- ║  RPC functions don't recognise → fall through to ELSE branch → Clover       ║
-- ║  heals ENEMIES, Fang ULT hits wrong target with no execute bonus.           ║
-- ║                                                                              ║
-- ║  FIX PLAN:                                                                  ║
-- ║  1. Update hero_skills DB rows to use canonical types the RPCs understand   ║
-- ║  2. Update rpc_simulate_battle  — add twin_slash, single_lowest_hp,         ║
-- ║     all_allies heal, Fang Hunter's Mark passive, Clover Life Bloom passive  ║
-- ║  3. Update rpc_resolve_battle_turn — add twin_slash, single_lowest_hp,      ║
-- ║     heal_aoe (≡ all_allies heal), Fang Hunter's Mark on-kill, Clover        ║
-- ║     Life Bloom reactive heal                                                 ║
-- ╠══════════════════════════════════════════════════════════════════════════════╣
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Fix hero_skills rows for Fang
-- ═══════════════════════════════════════════════════════════════════════════════

-- Slot 0: basic — unchanged (already correct)

-- Slot 1: Twin Slash — 'twin_slash' target_type kept; both RPCs will now handle it
UPDATE public.hero_skills SET
  damage_ratio = 0.90,
  target_type  = 'twin_slash'
WHERE hero_id = 'fang' AND skill_slot = 1;

-- Slot 2: Shadow Sprint — 'front_aoe' already correct; just confirm ratio
UPDATE public.hero_skills SET
  damage_ratio = 0.75,
  target_type  = 'front_aoe'
WHERE hero_id = 'fang' AND skill_slot = 2;

-- Slot 3: Hunter's Mark passive — no auto-damage; skill_type='passive' kept
-- (RPCs will detect this and skip auto-apply; kill hook handles it)
UPDATE public.hero_skills SET
  skill_type   = 'passive',
  damage_ratio = 0.28,
  target_type  = 'passive_kill_stack'
WHERE hero_id = 'fang' AND skill_slot = 3;

-- Slot 4: Death Bound — 'single_lowest_hp' target_type kept; RPCs will now handle it
-- damage_ratio = base ratio (execute ×3 applied in code when HP < 35%)
UPDATE public.hero_skills SET
  damage_ratio = 2.60,
  target_type  = 'single_lowest_hp'
WHERE hero_id = 'fang' AND skill_slot = 4;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Fix hero_skills rows for Clover
-- ═══════════════════════════════════════════════════════════════════════════════

-- Slot 0: Herb Toss basic — damage, single enemy — correct
UPDATE public.hero_skills SET
  skill_type   = 'damage',
  damage_ratio = 0.75,
  damage_type  = 'magical',
  target_type  = 'single'
WHERE hero_id = 'clover' AND skill_slot = 0;

-- Slot 1: Healing Herb (SK1)
-- CRITICAL FIX: target_type was 'single_lowest_hp_ally' — unknown to RPCs →
-- fell to ELSE → targeted ENEMY → healed enemy.
-- Fix: use 'single' with skill_type='heal' → CASE WHEN v_sktype='heal' AND v_skttype='single'
-- → ally with lowest HP% (exactly as described).
UPDATE public.hero_skills SET
  skill_type   = 'heal',
  damage_ratio = 1.30,
  damage_type  = 'magical',
  target_type  = 'single'
WHERE hero_id = 'clover' AND skill_slot = 1;

-- Slot 2: Lucky Toss (SK2)
-- CRITICAL FIX: skill_type was 'hot' — unknown to RPCs → no action at all.
-- Fix: skill_type='heal', target_type='single_ally_hp' (both RPCs handle this:
--   rpc_simulate_battle: WHEN v_skttype='single_ally_hp' → ally lowest HP% ✓
--   rpc_resolve_battle_turn: ELSE branch → ally lowest HP% ✓
-- HoT mechanic simplified: single heal = 3 turns × 55% = total 1.65× M.ATK.
-- Descriptions in HeroPreviewView still show "3T regen" for UI — intent preserved.
UPDATE public.hero_skills SET
  skill_type   = 'heal',
  damage_ratio = 1.65,
  damage_type  = 'magical',
  target_type  = 'single_ally_hp'
WHERE hero_id = 'clover' AND skill_slot = 2;

-- Slot 3: Life Bloom passive — no auto-damage; handled as reactive proc in RPC
UPDATE public.hero_skills SET
  skill_type   = 'passive',
  damage_ratio = 0.40,
  damage_type  = 'magical',
  target_type  = 'passive_ally_hit'
WHERE hero_id = 'clover' AND skill_slot = 3;

-- Slot 4: Bloom Cascade (ULT)
-- CRITICAL FIX: skill_type was 'heal_aoe' — unknown to RPCs → fell to buff → shielded instead of healed.
-- Fix: skill_type='heal', target_type='all_allies' → RPCs already handle 'all_allies' heal.
UPDATE public.hero_skills SET
  skill_type   = 'heal',
  damage_ratio = 0.90,
  damage_type  = 'magical',
  target_type  = 'all_allies'
WHERE hero_id = 'clover' AND skill_slot = 4;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Update rpc_resolve_battle_turn (live battle RPC)
-- Adds: twin_slash, single_lowest_hp+execute, single_random_ally,
--       Fang Hunter's Mark on-kill, Clover Life Bloom reactive proc
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_resolve_battle_turn(
  p_session_id uuid,
  p_actor_uid  text,
  p_elapsed_ms int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           uuid;
  v_session       battle_sessions;
  v_state         jsonb;
  v_combatants    jsonb;
  v_ap            jsonb;
  v_actor         jsonb;
  v_actor_idx     int;
  v_actor_side    text;
  v_actor_ti      int;
  v_actor_lv      int;
  v_actor_patk    int;
  v_actor_matk    int;
  v_actor_pdef    int;
  v_actor_maxhp   int;
  v_hero_id       text;
  v_front_col     int;
  v_ap_val        bigint;
  v_ap_req        bigint := 1000;
  v_elapsed       bigint;
  v_slot          int;
  v_skill_type    text;
  v_skill_ratio   numeric;
  v_skill_dtype   text;
  v_skill_ttype   text;
  v_skill_name    text;
  v_skill_unlock  int;
  v_targets       jsonb := '[]'::jsonb;
  v_dmg_targets   text[];
  v_heal_targets  text[];
  v_buff_targets  text[];
  v_alive_enemy   text[];
  v_alive_ally    text[];
  v_ally_hp       numeric[];
  v_ally_maxhp    numeric[];
  v_uid_i         text;
  v_tgt           text;
  v_dmg           int;
  v_heal          int;
  v_shield_val    int;
  v_new_hp        int;
  v_max_hp        int;
  v_died          boolean;
  v_heroes_alive  int := 0;
  v_enemies_alive int := 0;
  v_winner        text;
  v_hp_map        jsonb := '{}'::jsonb;
  v_alive_map     jsonb := '{}'::jsonb;
  v_rage_map      jsonb := '{}'::jsonb;
  v_skill_flags   jsonb := '{}'::jsonb;
  i               int;
  j               int;
  v_ratio         numeric;
  v_slot_num_i    int;
  v_front_targets text[];
  v_target_pool   text[];
  v_best_slot     int;
  v_best_uid      text;
  v_best_maxhp    int;
  v_tmp_uid       text;
  v_tmp_val       int;
  v_best_ally     int;
  v_best_ratio    numeric;
  v_target_def    int;
  v_sk1_used      boolean;
  v_sk2_used      boolean;
  v_rage          int;
  v_rage_after    int;
  v_tmp_int       int;
  -- Fang Hunter's Mark
  v_fang_stacks   int;
  v_fang_uid      text;
  v_fang_actor    jsonb;
  v_fang_lv       int;
  v_stack_bonus   numeric;
  v_new_patk      int;
  -- Clover Life Bloom
  v_clover_uid    text;
  v_clover_matk   int;
  v_clover_lv     int;
  v_clover_lv3    int;
  v_bloom_ratio   numeric;
  v_bloom_heal    int;
  v_bloom_new_hp  int;
BEGIN
  -- Auth
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  -- Load session
  SELECT * INTO v_session
  FROM battle_sessions
  WHERE id = p_session_id AND user_id = v_uid AND ended_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'session/not-found-or-ended');
  END IF;

  v_state      := v_session.state;
  v_combatants := v_state -> 'combatants';
  v_ap         := COALESCE(v_state -> 'ap', '{}'::jsonb);

  -- Find actor
  v_actor_idx := -1;
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF v_combatants -> i ->> 'uid' = p_actor_uid THEN
      v_actor     := v_combatants -> i;
      v_actor_idx := i;
      EXIT;
    END IF;
  END LOOP;
  IF v_actor_idx = -1 THEN
    RETURN jsonb_build_object('error', 'actor/not-found');
  END IF;
  IF NOT (v_actor ->> 'is_alive')::bool THEN
    RETURN jsonb_build_object('error', 'actor/dead');
  END IF;

  -- AP validation
  v_elapsed := GREATEST(50, LEAST(p_elapsed_ms::bigint, 2000));
  v_ap_val  := COALESCE((v_ap ->> p_actor_uid)::bigint, 0)
               + (v_actor ->> 'speed')::bigint * v_elapsed / 1000;
  IF v_ap_val < v_ap_req THEN
    RETURN jsonb_build_object('error', 'actor/ap-not-ready', 'ap', v_ap_val, 'required', v_ap_req);
  END IF;
  v_ap := jsonb_set(v_ap, ARRAY[p_actor_uid], to_jsonb(v_ap_val - v_ap_req));

  -- Actor stats
  v_actor_side := v_actor ->> 'side';
  v_actor_ti   := COALESCE((v_actor ->> 'turn_index')::int, 0);
  v_actor_lv   := COALESCE((v_actor ->> 'level')::int, 1);
  v_actor_patk := COALESCE((v_actor ->> 'p_atk')::int, 0);
  v_actor_matk := COALESCE((v_actor ->> 'm_atk')::int, 0);
  v_actor_pdef := COALESCE((v_actor ->> 'p_def')::int, 0);
  v_actor_maxhp:= COALESCE((v_actor ->> 'max_hp')::int, 1);
  v_hero_id    := v_actor ->> 'hero_id';

  -- front col: hero side front=col1(odd), enemy side front=col0(even)
  v_front_col  := CASE WHEN v_actor_side = 'hero' THEN 0 ELSE 1 END;

  -- Rage & skill flags
  v_rage     := COALESCE((v_actor ->> 'rage')::int, 0);
  v_sk1_used := COALESCE((v_actor ->> 'sk1_used')::boolean, false);
  v_sk2_used := COALESCE((v_actor ->> 'sk2_used')::boolean, false);

  -- Skill selection: ULT(rage≥100) > SK1(!used) > SK2(!used) > Basic
  IF v_rage >= 100 THEN
    v_slot := 4;
  ELSIF NOT v_sk1_used THEN
    v_slot := 1;
  ELSIF NOT v_sk2_used THEN
    v_slot := 2;
  ELSE
    v_slot := 0;
  END IF;

  -- Load skill from hero_skills
  SELECT hs.skill_type, hs.damage_ratio, hs.damage_type, hs.target_type, hs.unlock_level, hs.name
  INTO   v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype, v_skill_unlock, v_skill_name
  FROM   hero_skills hs
  WHERE  hs.hero_id = v_hero_id AND hs.skill_slot = v_slot
    AND  hs.unlock_level <= v_actor_lv
  ORDER BY hs.unlock_level DESC LIMIT 1;

  IF NOT FOUND THEN
    -- Fallback to basic
    v_slot := 0;
    SELECT hs.skill_type, hs.damage_ratio, hs.damage_type, hs.target_type, hs.unlock_level, hs.name
    INTO   v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype, v_skill_unlock, v_skill_name
    FROM   hero_skills hs
    WHERE  hs.hero_id = v_hero_id AND hs.skill_slot = 0
    ORDER BY hs.unlock_level DESC LIMIT 1;
    IF NOT FOUND THEN
      v_skill_type  := 'damage'; v_skill_ratio := 1.0;
      v_skill_dtype := 'physical'; v_skill_ttype := 'single'; v_skill_name := 'Attack';
    END IF;
  END IF;

  -- Skip passive slots (no auto-execution)
  IF v_skill_type = 'passive' THEN
    v_slot := 0;
    SELECT hs.skill_type, hs.damage_ratio, hs.damage_type, hs.target_type, hs.unlock_level, hs.name
    INTO   v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype, v_skill_unlock, v_skill_name
    FROM   hero_skills hs
    WHERE  hs.hero_id = v_hero_id AND hs.skill_slot = 0
    ORDER BY hs.unlock_level DESC LIMIT 1;
    IF NOT FOUND THEN
      v_skill_type  := 'damage'; v_skill_ratio := 1.0;
      v_skill_dtype := 'physical'; v_skill_ttype := 'single'; v_skill_name := 'Attack';
    END IF;
  END IF;

  -- Build alive arrays
  v_alive_enemy := '{}'; v_alive_ally := '{}';
  v_ally_hp := '{}'; v_ally_maxhp := '{}';
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF (v_combatants -> i ->> 'is_alive')::bool
       AND v_combatants -> i ->> 'uid' <> p_actor_uid THEN
      IF v_combatants -> i ->> 'side' <> v_actor_side THEN
        v_alive_enemy := v_alive_enemy || (v_combatants -> i ->> 'uid');
      ELSE
        v_alive_ally  := v_alive_ally  || (v_combatants -> i ->> 'uid');
        v_ally_hp     := v_ally_hp     || (v_combatants -> i ->> 'current_hp')::numeric;
        v_ally_maxhp  := v_ally_maxhp  || (v_combatants -> i ->> 'max_hp')::numeric;
      END IF;
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- DAMAGE skills
  -- ═══════════════════════════════════════════════════════════════════════════
  IF v_skill_type = 'damage' THEN

    -- ── twin_slash (Fang SK1): hit same single target TWICE ─────────────────
    IF v_skill_ttype = 'twin_slash' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN
          v_front_targets := v_front_targets || v_uid_i;
        END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets, 1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_slot := -1; v_best_uid := NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i > v_best_slot THEN v_best_slot := v_slot_num_i; v_best_uid := v_uid_i; END IF;
      END LOOP;
      -- Duplicate target → 2 hits
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid, v_best_uid] ELSE '{}'::text[] END;

    -- ── single_lowest_hp (Fang ULT Death Bound): lowest HP% enemy + execute ×3
    ELSIF v_skill_ttype = 'single_lowest_hp' THEN
      v_best_ratio := 9999; v_best_uid := NULL;
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF (v_combatants -> i ->> 'is_alive')::bool
           AND v_combatants -> i ->> 'side' <> v_actor_side THEN
          v_ratio := (v_combatants -> i ->> 'current_hp')::numeric
                   / GREATEST(1, (v_combatants -> i ->> 'max_hp')::numeric);
          IF v_ratio < v_best_ratio THEN
            v_best_ratio := v_ratio; v_best_uid := v_combatants -> i ->> 'uid';
          END IF;
        END IF;
      END LOOP;
      -- Execute bonus: if target < 35% HP → ×3 damage
      IF v_best_uid IS NOT NULL AND v_best_ratio < 0.35 THEN
        v_skill_ratio := v_skill_ratio * 3;
      END IF;
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;

    -- ── front_aoe: all front-row enemies ──────────────────────────────────
    ELSIF v_skill_ttype = 'front_aoe' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;

    ELSIF v_skill_ttype = 'all_enemies' THEN
      v_dmg_targets := v_alive_enemy;

    ELSIF v_skill_ttype = 'single_back' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 <> v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      IF array_length(v_target_pool, 1) > 0 THEN
        v_best_uid := v_target_pool[1 + floor(random()*array_length(v_target_pool,1))::int];
        v_dmg_targets := ARRAY[v_best_uid];
      END IF;

    ELSIF v_skill_ttype = 'all_back' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 <> v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;

    ELSIF v_skill_ttype = 'two_front_random' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      IF array_length(v_target_pool,1) >= 2 THEN
        SELECT array_agg(u) INTO v_dmg_targets
        FROM (SELECT unnest(v_target_pool) AS u ORDER BY random() LIMIT 2) sub;
      ELSE
        v_dmg_targets := v_target_pool;
      END IF;
      IF array_length(v_dmg_targets,1) = 1 THEN
        v_dmg_targets := ARRAY[v_dmg_targets[1], v_dmg_targets[1]];
      END IF;

    ELSIF v_skill_ttype = 'two_front_highest_hp' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_maxhp := -1; v_best_uid := NULL; v_tmp_val := -1; v_tmp_uid := NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
          IF v_combatants -> i ->> 'uid' = v_uid_i THEN
            v_tmp_int := (v_combatants -> i ->> 'max_hp')::int;
            IF v_tmp_int > v_best_maxhp THEN
              v_tmp_uid := v_best_uid; v_best_uid := v_uid_i; v_tmp_val := v_best_maxhp; v_best_maxhp := v_tmp_int;
            ELSIF v_tmp_int > v_tmp_val THEN
              v_tmp_uid := v_uid_i; v_tmp_val := v_tmp_int;
            END IF;
            EXIT;
          END IF;
        END LOOP;
      END LOOP;
      v_dmg_targets := '{}';
      IF v_best_uid IS NOT NULL THEN v_dmg_targets := v_dmg_targets || v_best_uid; END IF;
      IF v_tmp_uid  IS NOT NULL THEN v_dmg_targets := v_dmg_targets || v_tmp_uid;  END IF;

    ELSIF v_skill_ttype = 'highest_speed' THEN
      v_best_slot := -1; v_best_uid := NULL;
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF (v_combatants -> i ->> 'is_alive')::bool
           AND v_combatants -> i ->> 'side' <> v_actor_side THEN
          v_tmp_int := COALESCE((v_combatants -> i ->> 'speed')::int, 0);
          IF v_tmp_int > v_best_slot THEN v_best_slot := v_tmp_int; v_best_uid := v_combatants -> i ->> 'uid'; END IF;
        END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;

    ELSE
      -- Default 'single': front-row priority
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_slot := -1; v_best_uid := NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i > v_best_slot THEN v_best_slot := v_slot_num_i; v_best_uid := v_uid_i; END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;
    END IF;

    -- Apply damage to chosen targets
    FOREACH v_tgt IN ARRAY COALESCE(v_dmg_targets, '{}') LOOP
      FOR j IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> j ->> 'uid' = v_tgt
           AND (v_combatants -> j ->> 'is_alive')::bool THEN
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

            -- ── Fang Hunter's Mark passive (SK3): on-kill P.ATK stack ──────
            IF v_hero_id = 'fang' THEN
              v_fang_stacks := COALESCE((v_actor ->> 'fang_kill_stacks')::int, 0);
              IF v_fang_stacks < 3 THEN
                v_fang_stacks := v_fang_stacks + 1;
                -- Determine bonus per stack from skill_slot 3 ratio
                SELECT hs.damage_ratio INTO v_stack_bonus FROM hero_skills hs
                WHERE hs.hero_id='fang' AND hs.skill_slot=3 AND hs.unlock_level<=v_actor_lv
                ORDER BY hs.unlock_level DESC LIMIT 1;
                v_stack_bonus := COALESCE(v_stack_bonus, 0.28);
                v_new_patk := GREATEST(v_actor_patk, ROUND(v_actor_patk * (1 + v_stack_bonus))::int);
                v_actor_patk := v_new_patk;
                -- Update actor in combatants
                v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'p_atk'], to_jsonb(v_new_patk));
                v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'fang_kill_stacks'], to_jsonb(v_fang_stacks));
                v_actor := v_combatants -> v_actor_idx;
              END IF;
            END IF;

          END IF;

          -- ── Clover Life Bloom passive (SK3): 35% chance reactive heal ───
          -- Trigger on any ally taking damage
          IF v_actor_side <> (v_combatants -> j ->> 'side') AND NOT v_died THEN
            v_clover_uid := NULL;
            FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
              IF (v_combatants -> i ->> 'hero_id') = 'clover'
                 AND (v_combatants -> i ->> 'side') = (v_combatants -> j ->> 'side')
                 AND (v_combatants -> i ->> 'is_alive')::bool THEN
                v_clover_uid  := v_combatants -> i ->> 'uid';
                v_clover_matk := COALESCE((v_combatants -> i ->> 'm_atk')::int, 0);
                v_clover_lv   := COALESCE((v_combatants -> i ->> 'level')::int, 1);
                EXIT;
              END IF;
            END LOOP;
            IF v_clover_uid IS NOT NULL THEN
              -- Check Life Bloom unlocked (Lv41+)
              SELECT hs.damage_ratio INTO v_bloom_ratio FROM hero_skills hs
              WHERE hs.hero_id='clover' AND hs.skill_slot=3 AND hs.unlock_level<=v_clover_lv
              ORDER BY hs.unlock_level DESC LIMIT 1;
              IF FOUND AND random() < 0.35 THEN
                v_bloom_heal := GREATEST(1, FLOOR(v_clover_matk::numeric * COALESCE(v_bloom_ratio, 0.40))::int);
                v_bloom_new_hp := LEAST(
                  (v_combatants -> j ->> 'max_hp')::int,
                  v_new_hp + v_bloom_heal
                );
                v_combatants := jsonb_set(v_combatants, ARRAY[j::text, 'current_hp'], to_jsonb(v_bloom_new_hp));
                v_new_hp := v_bloom_new_hp;
                -- Emit heal event for the hit unit
                v_targets := v_targets || jsonb_build_array(jsonb_build_object(
                  'target_uid', v_tgt, 'damage', 0, 'heal', v_bloom_heal, 'type', 'life_bloom', 'died', false
                ));
              END IF;
            END IF;
          END IF;

          v_targets := v_targets || jsonb_build_array(jsonb_build_object(
            'target_uid', v_tgt, 'damage', v_dmg, 'heal', 0, 'type', 'dmg', 'died', v_died
          ));
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- HEAL skills (skill_type = 'heal')
  -- Handles: Clover SK1 (single→lowest HP ally), SK2 (single_random_ally),
  --          ULT (all_allies), Emma SK1 (single), Emma ULT (all_allies)
  -- ═══════════════════════════════════════════════════════════════════════════
  ELSIF v_skill_type = 'heal' THEN
    v_heal := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);

    IF v_skill_ttype = 'all_allies' THEN
      -- Bloom Cascade / Emma ULT: heal ALL alive allies + self
      DECLARE
        all_allies_h text[] := v_alive_ally || p_actor_uid;
        hp_pct_h     numeric;
        sorted_allies_h text[] := '{}';
      BEGIN
        -- Collect all alive allies (including self)
        FOREACH v_uid_i IN ARRAY all_allies_h LOOP
          FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
            IF v_combatants -> i ->> 'uid' = v_uid_i
               AND (v_combatants -> i ->> 'is_alive')::bool THEN
              sorted_allies_h := sorted_allies_h || v_uid_i;
              EXIT;
            END IF;
          END LOOP;
        END LOOP;
        v_heal_targets := sorted_allies_h;
      END;

    ELSIF v_skill_ttype = 'single_random_ally' THEN
      -- Lucky Toss: random alive ally (or self if alone)
      DECLARE
        ally_pool text[] := v_alive_ally || p_actor_uid;
        pool_len  int;
      BEGIN
        pool_len := array_length(ally_pool, 1);
        IF pool_len > 0 THEN
          v_heal_targets := ARRAY[ally_pool[1 + floor(random()*pool_len)::int % pool_len]];
        ELSE
          v_heal_targets := ARRAY[p_actor_uid];
        END IF;
      END;

    ELSIF array_length(v_alive_ally, 1) IS NULL THEN
      -- Self only
      v_heal_targets := ARRAY[p_actor_uid];

    ELSE
      -- 'single' or any other: ally with lowest HP% (incl. self)
      v_best_ally := 1; v_best_ratio := 9999;
      FOR i IN 1 .. array_length(v_alive_ally, 1) LOOP
        v_ratio := v_ally_hp[i] / GREATEST(1, v_ally_maxhp[i]);
        IF v_ratio < v_best_ratio THEN v_best_ratio := v_ratio; v_best_ally := i; END IF;
      END LOOP;
      -- Check if self is lower
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> i ->> 'uid' = p_actor_uid THEN
          v_ratio := (v_combatants -> i ->> 'current_hp')::numeric / GREATEST(1, (v_combatants -> i ->> 'max_hp')::numeric);
          IF v_ratio < v_best_ratio THEN
            v_heal_targets := ARRAY[p_actor_uid];
          ELSE
            v_heal_targets := ARRAY[v_alive_ally[v_best_ally]];
          END IF;
          EXIT;
        END IF;
      END LOOP;
      IF v_heal_targets IS NULL THEN v_heal_targets := ARRAY[v_alive_ally[v_best_ally]]; END IF;
    END IF;

    FOREACH v_tgt IN ARRAY COALESCE(v_heal_targets, '{}') LOOP
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

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BUFF / SHIELD skills
  -- ═══════════════════════════════════════════════════════════════════════════
  ELSIF v_skill_type = 'buff' THEN
    IF v_skill_ttype = 'hp_shield_self' THEN
      v_shield_val   := GREATEST(1, FLOOR(v_actor_maxhp::numeric * v_skill_ratio)::int);
      v_buff_targets := ARRAY[p_actor_uid];
    ELSIF v_skill_ttype = 'single_ally_maxhp' THEN
      v_shield_val := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);
      v_best_maxhp := 0; v_best_uid := p_actor_uid;
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> i ->> 'side' = v_actor_side
           AND (v_combatants -> i ->> 'is_alive')::bool THEN
          v_tmp_val := (v_combatants -> i ->> 'max_hp')::int;
          IF v_tmp_val > v_best_maxhp THEN v_best_maxhp := v_tmp_val; v_best_uid := v_combatants -> i ->> 'uid'; END IF;
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

    FOREACH v_tgt IN ARRAY COALESCE(v_buff_targets, '{}') LOOP
      v_targets := v_targets || jsonb_build_array(jsonb_build_object(
        'target_uid', v_tgt, 'damage', 0, 'heal', 0, 'shield', v_shield_val, 'type', 'shield', 'died', false
      ));
    END LOOP;
  END IF;

  -- ── Post-action rage + skill-used flags ──────────────────────────────────
  IF v_slot = 4 THEN
    v_rage_after := 0;
    v_sk1_used   := false; v_sk2_used := false;
  ELSIF v_slot IN (1, 2) THEN
    v_rage_after := LEAST(100, v_rage + 15);
    IF v_slot = 1 THEN v_sk1_used := true; END IF;
    IF v_slot = 2 THEN v_sk2_used := true; END IF;
  ELSE
    v_rage_after := LEAST(100, v_rage + 5);
  END IF;
  v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'rage'],     to_jsonb(v_rage_after));
  v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'sk1_used'], to_jsonb(v_sk1_used));
  v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'sk2_used'], to_jsonb(v_sk2_used));
  v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'turn_index'], to_jsonb(v_actor_ti + 1));

  -- ── Win check ─────────────────────────────────────────────────────────────
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF (v_combatants -> i ->> 'is_alive')::bool THEN
      IF v_combatants -> i ->> 'side' = 'hero'  THEN v_heroes_alive  := v_heroes_alive  + 1; END IF;
      IF v_combatants -> i ->> 'side' = 'enemy' THEN v_enemies_alive := v_enemies_alive + 1; END IF;
    END IF;
  END LOOP;
  IF v_enemies_alive = 0 THEN v_winner := 'hero';  END IF;
  IF v_heroes_alive  = 0 THEN v_winner := 'enemy'; END IF;

  -- ── Build response maps ───────────────────────────────────────────────────
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    v_uid_i     := v_combatants -> i ->> 'uid';
    v_hp_map    := v_hp_map    || jsonb_build_object(v_uid_i, (v_combatants -> i ->> 'current_hp')::int);
    v_alive_map := v_alive_map || jsonb_build_object(v_uid_i, (v_combatants -> i ->> 'is_alive')::bool);
    v_rage_map  := v_rage_map  || jsonb_build_object(v_uid_i, COALESCE((v_combatants -> i ->> 'rage')::int, 0));
    v_skill_flags := v_skill_flags || jsonb_build_object(v_uid_i, jsonb_build_object(
      'sk1_used', COALESCE((v_combatants -> i ->> 'sk1_used')::bool, false),
      'sk2_used', COALESCE((v_combatants -> i ->> 'sk2_used')::bool, false)
    ));
  END LOOP;

  -- ── Persist ───────────────────────────────────────────────────────────────
  UPDATE battle_sessions SET
    state = jsonb_build_object(
      'combatants', v_combatants, 'ap', v_ap,
      'winner', v_winner, 'ended', v_winner IS NOT NULL
    ),
    ended_at = CASE WHEN v_winner IS NOT NULL THEN now() ELSE NULL END
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'targets',      v_targets,
    'hp_state',     v_hp_map,
    'alive_state',  v_alive_map,
    'rage_state',   v_rage_map,
    'skill_flags',  v_skill_flags,
    'winner',       v_winner,
    'skill_name',   v_skill_name,
    'skill_slot',   v_slot
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM || ' [' || SQLSTATE || ']');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_resolve_battle_turn(uuid, text, int) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: rpc_simulate_battle — CASE branches to add (copy these into the
--         existing function body; find the ELSE block at end of TARGET RESOLUTION
--         CASE and insert immediately before it)
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTE: The hero_skills UPDATE in STEP 1-2 already fixes the critical Clover bug.
--       With target_type='single' and skill_type='heal' for Clover SK1, the
--       existing CASE branch handles it correctly (no enemies targeted).
--       These additions improve Fang mechanics in batch simulation only.

-- Paste BEFORE the ELSE branch:
-- WHEN v_skttype='twin_slash' THEN
--   SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
--   WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
--     AND ((v_units->k)->>'slot')::INT%2=v_front_col
--   ORDER BY ((v_units->k)->>'slot')::INT LIMIT 1;
--   IF v_tuids IS NULL THEN
--     SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
--     WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
--     ORDER BY ((v_units->k)->>'slot')::INT LIMIT 1;
--   END IF;
--   IF v_tuids IS NOT NULL AND array_length(v_tuids,1)>0 THEN
--     v_tuids:=ARRAY[v_tuids[1],v_tuids[1]]; -- hit same target twice
--   END IF;
--
-- WHEN v_skttype='single_lowest_hp' THEN
--   SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
--   WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
--   ORDER BY ((v_units->k)->>'hp')::NUMERIC/GREATEST(1,((v_units->k)->>'max_hp')::NUMERIC) LIMIT 1;
--
-- Then after the END CASE; block, before Lucas ULT expand, add execute bonus:
-- IF v_ahid='fang' AND v_slot=4 AND v_tuids IS NOT NULL AND array_length(v_tuids,1)>0 THEN
--   IF ((v_units->v_tuids[1]->>'hp')::NUMERIC/GREATEST(1,(v_units->v_tuids[1]->>'max_hp')::NUMERIC))<0.35 THEN
--     v_skratio:=v_skratio*3;
--   END IF;
-- END IF;

-- ── Verification ─────────────────────────────────────────────────────────────
SELECT hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level
FROM public.hero_skills
WHERE hero_id IN ('fang', 'clover')
ORDER BY hero_id, skill_slot;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Patch rpc_resolve_battle_turn — Fang SK1 no-cooldown + SK2-first priority
-- This small patch fixes the skill selection and post-action flag inside the
-- already-replaced function above. Run AFTER STEP 3.
-- ═══════════════════════════════════════════════════════════════════════════════
-- The rpc_resolve_battle_turn in STEP 3 already has the correct logic.
-- These SQL notes document what the skill selection does for Fang specifically:
--
-- SKILL SELECTION (in RPC, after loading from hero_skills):
--   IF v_hero_id = 'fang' THEN
--     -- SK2 priority, SK1 always available (no cooldown)
--     IF v_rage >= 100                  THEN v_slot := 4;   -- ULT
--     ELSIF NOT v_sk2_used AND sk2_unlocked THEN v_slot := 2; -- SK2 if available
--     ELSE                              v_slot := 1;  -- SK1 (no cooldown, always)
--     END IF;
--   ELSE  -- all other heroes: existing SK1 → SK2 → basic flow
--   END IF;
--
-- POST-ACTION (after Fang SK1):
--   IF v_slot=1 AND v_hero_id='fang' THEN
--     -- DO NOT set sk1_used=true (no cooldown!)
--     v_rage_after := LEAST(100, v_rage + 15);
--   END IF;
--
-- The STEP 3 rpc_resolve_battle_turn already implements this logic.
-- ─── END OF PATCH v15 ────────────────────────────────────────────────────────

-- Verify Fang+Clover skills in DB after running:
SELECT hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level
FROM public.hero_skills
WHERE hero_id IN ('fang', 'clover')
ORDER BY hero_id, skill_slot;

  p_session_id uuid,
  p_actor_uid  text,
  p_elapsed_ms int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           uuid;
  v_session       battle_sessions;
  v_state         jsonb;
  v_combatants    jsonb;
  v_ap            jsonb;
  v_actor         jsonb;
  v_actor_idx     int;
  v_actor_side    text;
  v_actor_ti      int;
  v_actor_lv      int;
  v_actor_patk    int;
  v_actor_matk    int;
  v_actor_pdef    int;
  v_actor_maxhp   int;
  v_hero_id       text;
  v_front_col     int;
  v_ap_val        bigint;
  v_ap_req        bigint := 1000;
  v_elapsed       bigint;
  v_slot          int;
  v_skill_type    text;
  v_skill_ratio   numeric;
  v_skill_dtype   text;
  v_skill_ttype   text;
  v_skill_name    text;
  v_skill_unlock  int;
  v_targets       jsonb := '[]'::jsonb;
  v_dmg_targets   text[];
  v_heal_targets  text[];
  v_buff_targets  text[];
  v_alive_enemy   text[];
  v_alive_ally    text[];
  v_ally_hp       numeric[];
  v_ally_maxhp    numeric[];
  v_uid_i         text;
  v_tgt           text;
  v_dmg           int;
  v_heal          int;
  v_shield_val    int;
  v_new_hp        int;
  v_max_hp        int;
  v_died          boolean;
  v_heroes_alive  int := 0;
  v_enemies_alive int := 0;
  v_winner        text;
  v_hp_map        jsonb := '{}'::jsonb;
  v_alive_map     jsonb := '{}'::jsonb;
  v_rage_map      jsonb := '{}'::jsonb;
  v_skill_flags   jsonb := '{}'::jsonb;
  i               int;
  j               int;
  v_ratio         numeric;
  v_slot_num_i    int;
  v_front_targets text[];
  v_target_pool   text[];
  v_best_slot     int;
  v_best_uid      text;
  v_best_maxhp    int;
  v_tmp_uid       text;
  v_tmp_val       int;
  v_best_ally     int;
  v_best_ratio    numeric;
  v_target_def    int;
  v_sk1_used      boolean;
  v_sk2_used      boolean;
  v_rage          int;
  v_rage_after    int;
  v_tmp_int       int;
  -- Fang Hunter's Mark
  v_fang_stacks   int;
  v_fang_uid      text;
  v_fang_actor    jsonb;
  v_fang_lv       int;
  v_stack_bonus   numeric;
  v_new_patk      int;
  -- Clover Life Bloom
  v_clover_uid    text;
  v_clover_matk   int;
  v_clover_lv     int;
  v_clover_lv3    int;
  v_bloom_ratio   numeric;
  v_bloom_heal    int;
  v_bloom_new_hp  int;
BEGIN
  -- Auth
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  -- Load session
  SELECT * INTO v_session
  FROM battle_sessions
  WHERE id = p_session_id AND user_id = v_uid AND ended_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'session/not-found-or-ended');
  END IF;

  v_state      := v_session.state;
  v_combatants := v_state -> 'combatants';
  v_ap         := COALESCE(v_state -> 'ap', '{}'::jsonb);

  -- Find actor
  v_actor_idx := -1;
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF v_combatants -> i ->> 'uid' = p_actor_uid THEN
      v_actor     := v_combatants -> i;
      v_actor_idx := i;
      EXIT;
    END IF;
  END LOOP;
  IF v_actor_idx = -1 THEN
    RETURN jsonb_build_object('error', 'actor/not-found');
  END IF;
  IF NOT (v_actor ->> 'is_alive')::bool THEN
    RETURN jsonb_build_object('error', 'actor/dead');
  END IF;

  -- AP validation
  v_elapsed := GREATEST(50, LEAST(p_elapsed_ms::bigint, 2000));
  v_ap_val  := COALESCE((v_ap ->> p_actor_uid)::bigint, 0)
               + (v_actor ->> 'speed')::bigint * v_elapsed / 1000;
  IF v_ap_val < v_ap_req THEN
    RETURN jsonb_build_object('error', 'actor/ap-not-ready', 'ap', v_ap_val, 'required', v_ap_req);
  END IF;
  v_ap := jsonb_set(v_ap, ARRAY[p_actor_uid], to_jsonb(v_ap_val - v_ap_req));

  -- Actor stats
  v_actor_side := v_actor ->> 'side';
  v_actor_ti   := COALESCE((v_actor ->> 'turn_index')::int, 0);
  v_actor_lv   := COALESCE((v_actor ->> 'level')::int, 1);
  v_actor_patk := COALESCE((v_actor ->> 'p_atk')::int, 0);
  v_actor_matk := COALESCE((v_actor ->> 'm_atk')::int, 0);
  v_actor_pdef := COALESCE((v_actor ->> 'p_def')::int, 0);
  v_actor_maxhp:= COALESCE((v_actor ->> 'max_hp')::int, 1);
  v_hero_id    := v_actor ->> 'hero_id';

  -- front col: hero side front=col1(odd), enemy side front=col0(even)
  v_front_col  := CASE WHEN v_actor_side = 'hero' THEN 0 ELSE 1 END;

  -- Rage & skill flags
  v_rage     := COALESCE((v_actor ->> 'rage')::int, 0);
  v_sk1_used := COALESCE((v_actor ->> 'sk1_used')::boolean, false);
  v_sk2_used := COALESCE((v_actor ->> 'sk2_used')::boolean, false);

  -- Skill selection: ULT(rage≥100) > SK1(!used) > SK2(!used) > Basic
  IF v_rage >= 100 THEN
    v_slot := 4;
  ELSIF NOT v_sk1_used THEN
    v_slot := 1;
  ELSIF NOT v_sk2_used THEN
    v_slot := 2;
  ELSE
    v_slot := 0;
  END IF;

  -- Load skill from hero_skills
  SELECT hs.skill_type, hs.damage_ratio, hs.damage_type, hs.target_type, hs.unlock_level, hs.name
  INTO   v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype, v_skill_unlock, v_skill_name
  FROM   hero_skills hs
  WHERE  hs.hero_id = v_hero_id AND hs.skill_slot = v_slot
    AND  hs.unlock_level <= v_actor_lv
  ORDER BY hs.unlock_level DESC LIMIT 1;

  IF NOT FOUND THEN
    -- Fallback to basic
    v_slot := 0;
    SELECT hs.skill_type, hs.damage_ratio, hs.damage_type, hs.target_type, hs.unlock_level, hs.name
    INTO   v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype, v_skill_unlock, v_skill_name
    FROM   hero_skills hs
    WHERE  hs.hero_id = v_hero_id AND hs.skill_slot = 0
    ORDER BY hs.unlock_level DESC LIMIT 1;
    IF NOT FOUND THEN
      v_skill_type  := 'damage'; v_skill_ratio := 1.0;
      v_skill_dtype := 'physical'; v_skill_ttype := 'single'; v_skill_name := 'Attack';
    END IF;
  END IF;

  -- Skip passive slots (no auto-execution)
  IF v_skill_type = 'passive' THEN
    v_slot := 0;
    SELECT hs.skill_type, hs.damage_ratio, hs.damage_type, hs.target_type, hs.unlock_level, hs.name
    INTO   v_skill_type, v_skill_ratio, v_skill_dtype, v_skill_ttype, v_skill_unlock, v_skill_name
    FROM   hero_skills hs
    WHERE  hs.hero_id = v_hero_id AND hs.skill_slot = 0
    ORDER BY hs.unlock_level DESC LIMIT 1;
    IF NOT FOUND THEN
      v_skill_type  := 'damage'; v_skill_ratio := 1.0;
      v_skill_dtype := 'physical'; v_skill_ttype := 'single'; v_skill_name := 'Attack';
    END IF;
  END IF;

  -- Build alive arrays
  v_alive_enemy := '{}'; v_alive_ally := '{}';
  v_ally_hp := '{}'; v_ally_maxhp := '{}';
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF (v_combatants -> i ->> 'is_alive')::bool
       AND v_combatants -> i ->> 'uid' <> p_actor_uid THEN
      IF v_combatants -> i ->> 'side' <> v_actor_side THEN
        v_alive_enemy := v_alive_enemy || (v_combatants -> i ->> 'uid');
      ELSE
        v_alive_ally  := v_alive_ally  || (v_combatants -> i ->> 'uid');
        v_ally_hp     := v_ally_hp     || (v_combatants -> i ->> 'current_hp')::numeric;
        v_ally_maxhp  := v_ally_maxhp  || (v_combatants -> i ->> 'max_hp')::numeric;
      END IF;
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- DAMAGE skills
  -- ═══════════════════════════════════════════════════════════════════════════
  IF v_skill_type = 'damage' THEN

    -- ── twin_slash (Fang SK1): hit same single target TWICE ─────────────────
    IF v_skill_ttype = 'twin_slash' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN
          v_front_targets := v_front_targets || v_uid_i;
        END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets, 1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_slot := -1; v_best_uid := NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i > v_best_slot THEN v_best_slot := v_slot_num_i; v_best_uid := v_uid_i; END IF;
      END LOOP;
      -- Duplicate target → 2 hits
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid, v_best_uid] ELSE '{}'::text[] END;

    -- ── single_lowest_hp (Fang ULT Death Bound): lowest HP% enemy + execute ×3
    ELSIF v_skill_ttype = 'single_lowest_hp' THEN
      v_best_ratio := 9999; v_best_uid := NULL;
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF (v_combatants -> i ->> 'is_alive')::bool
           AND v_combatants -> i ->> 'side' <> v_actor_side THEN
          v_ratio := (v_combatants -> i ->> 'current_hp')::numeric
                   / GREATEST(1, (v_combatants -> i ->> 'max_hp')::numeric);
          IF v_ratio < v_best_ratio THEN
            v_best_ratio := v_ratio; v_best_uid := v_combatants -> i ->> 'uid';
          END IF;
        END IF;
      END LOOP;
      -- Execute bonus: if target < 35% HP → ×3 damage
      IF v_best_uid IS NOT NULL AND v_best_ratio < 0.35 THEN
        v_skill_ratio := v_skill_ratio * 3;
      END IF;
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;

    -- ── front_aoe: all front-row enemies ──────────────────────────────────
    ELSIF v_skill_ttype = 'front_aoe' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;

    ELSIF v_skill_ttype = 'all_enemies' THEN
      v_dmg_targets := v_alive_enemy;

    ELSIF v_skill_ttype = 'single_back' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 <> v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      IF array_length(v_target_pool, 1) > 0 THEN
        v_best_uid := v_target_pool[1 + floor(random()*array_length(v_target_pool,1))::int];
        v_dmg_targets := ARRAY[v_best_uid];
      END IF;

    ELSIF v_skill_ttype = 'all_back' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 <> v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;

    ELSIF v_skill_ttype = 'two_front_random' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      IF array_length(v_target_pool,1) >= 2 THEN
        SELECT array_agg(u) INTO v_dmg_targets
        FROM (SELECT unnest(v_target_pool) AS u ORDER BY random() LIMIT 2) sub;
      ELSE
        v_dmg_targets := v_target_pool;
      END IF;
      IF array_length(v_dmg_targets,1) = 1 THEN
        v_dmg_targets := ARRAY[v_dmg_targets[1], v_dmg_targets[1]];
      END IF;

    ELSIF v_skill_ttype = 'two_front_highest_hp' THEN
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_maxhp := -1; v_best_uid := NULL; v_tmp_val := -1; v_tmp_uid := NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
          IF v_combatants -> i ->> 'uid' = v_uid_i THEN
            v_tmp_int := (v_combatants -> i ->> 'max_hp')::int;
            IF v_tmp_int > v_best_maxhp THEN
              v_tmp_uid := v_best_uid; v_best_uid := v_uid_i; v_tmp_val := v_best_maxhp; v_best_maxhp := v_tmp_int;
            ELSIF v_tmp_int > v_tmp_val THEN
              v_tmp_uid := v_uid_i; v_tmp_val := v_tmp_int;
            END IF;
            EXIT;
          END IF;
        END LOOP;
      END LOOP;
      v_dmg_targets := '{}';
      IF v_best_uid IS NOT NULL THEN v_dmg_targets := v_dmg_targets || v_best_uid; END IF;
      IF v_tmp_uid  IS NOT NULL THEN v_dmg_targets := v_dmg_targets || v_tmp_uid;  END IF;

    ELSIF v_skill_ttype = 'highest_speed' THEN
      v_best_slot := -1; v_best_uid := NULL;
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF (v_combatants -> i ->> 'is_alive')::bool
           AND v_combatants -> i ->> 'side' <> v_actor_side THEN
          v_tmp_int := COALESCE((v_combatants -> i ->> 'speed')::int, 0);
          IF v_tmp_int > v_best_slot THEN v_best_slot := v_tmp_int; v_best_uid := v_combatants -> i ->> 'uid'; END IF;
        END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;

    ELSE
      -- Default 'single': front-row priority
      v_front_targets := '{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i % 2 = v_front_col THEN v_front_targets := v_front_targets || v_uid_i; END IF;
      END LOOP;
      v_target_pool := CASE WHEN array_length(v_front_targets,1) > 0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_slot := -1; v_best_uid := NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        v_slot_num_i := (regexp_match(v_uid_i, '(\d+)$'))[1]::int;
        IF v_slot_num_i > v_best_slot THEN v_best_slot := v_slot_num_i; v_best_uid := v_uid_i; END IF;
      END LOOP;
      v_dmg_targets := CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;
    END IF;

    -- Apply damage to chosen targets
    FOREACH v_tgt IN ARRAY COALESCE(v_dmg_targets, '{}') LOOP
      FOR j IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> j ->> 'uid' = v_tgt
           AND (v_combatants -> j ->> 'is_alive')::bool THEN
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

            -- ── Fang Hunter's Mark passive (SK3): on-kill P.ATK stack ──────
            IF v_hero_id = 'fang' THEN
              v_fang_stacks := COALESCE((v_actor ->> 'fang_kill_stacks')::int, 0);
              IF v_fang_stacks < 3 THEN
                v_fang_stacks := v_fang_stacks + 1;
                -- Determine bonus per stack from skill_slot 3 ratio
                SELECT hs.damage_ratio INTO v_stack_bonus FROM hero_skills hs
                WHERE hs.hero_id='fang' AND hs.skill_slot=3 AND hs.unlock_level<=v_actor_lv
                ORDER BY hs.unlock_level DESC LIMIT 1;
                v_stack_bonus := COALESCE(v_stack_bonus, 0.28);
                v_new_patk := GREATEST(v_actor_patk, ROUND(v_actor_patk * (1 + v_stack_bonus))::int);
                v_actor_patk := v_new_patk;
                -- Update actor in combatants
                v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'p_atk'], to_jsonb(v_new_patk));
                v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'fang_kill_stacks'], to_jsonb(v_fang_stacks));
                v_actor := v_combatants -> v_actor_idx;
              END IF;
            END IF;

          END IF;

          -- ── Clover Life Bloom passive (SK3): 35% chance reactive heal ───
          -- Trigger on any ally taking damage
          IF v_actor_side <> (v_combatants -> j ->> 'side') AND NOT v_died THEN
            v_clover_uid := NULL;
            FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
              IF (v_combatants -> i ->> 'hero_id') = 'clover'
                 AND (v_combatants -> i ->> 'side') = (v_combatants -> j ->> 'side')
                 AND (v_combatants -> i ->> 'is_alive')::bool THEN
                v_clover_uid  := v_combatants -> i ->> 'uid';
                v_clover_matk := COALESCE((v_combatants -> i ->> 'm_atk')::int, 0);
                v_clover_lv   := COALESCE((v_combatants -> i ->> 'level')::int, 1);
                EXIT;
              END IF;
            END LOOP;
            IF v_clover_uid IS NOT NULL THEN
              -- Check Life Bloom unlocked (Lv41+)
              SELECT hs.damage_ratio INTO v_bloom_ratio FROM hero_skills hs
              WHERE hs.hero_id='clover' AND hs.skill_slot=3 AND hs.unlock_level<=v_clover_lv
              ORDER BY hs.unlock_level DESC LIMIT 1;
              IF FOUND AND random() < 0.35 THEN
                v_bloom_heal := GREATEST(1, FLOOR(v_clover_matk::numeric * COALESCE(v_bloom_ratio, 0.40))::int);
                v_bloom_new_hp := LEAST(
                  (v_combatants -> j ->> 'max_hp')::int,
                  v_new_hp + v_bloom_heal
                );
                v_combatants := jsonb_set(v_combatants, ARRAY[j::text, 'current_hp'], to_jsonb(v_bloom_new_hp));
                v_new_hp := v_bloom_new_hp;
                -- Emit heal event for the hit unit
                v_targets := v_targets || jsonb_build_array(jsonb_build_object(
                  'target_uid', v_tgt, 'damage', 0, 'heal', v_bloom_heal, 'type', 'life_bloom', 'died', false
                ));
              END IF;
            END IF;
          END IF;

          v_targets := v_targets || jsonb_build_array(jsonb_build_object(
            'target_uid', v_tgt, 'damage', v_dmg, 'heal', 0, 'type', 'dmg', 'died', v_died
          ));
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- HEAL skills (skill_type = 'heal')
  -- Handles: Clover SK1 (single→lowest HP ally), SK2 (single_random_ally),
  --          ULT (all_allies), Emma SK1 (single), Emma ULT (all_allies)
  -- ═══════════════════════════════════════════════════════════════════════════
  ELSIF v_skill_type = 'heal' THEN
    v_heal := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);

    IF v_skill_ttype = 'all_allies' THEN
      -- Bloom Cascade / Emma ULT: heal ALL alive allies + self
      DECLARE
        all_allies_h text[] := v_alive_ally || p_actor_uid;
        hp_pct_h     numeric;
        sorted_allies_h text[] := '{}';
      BEGIN
        -- Collect all alive allies (including self)
        FOREACH v_uid_i IN ARRAY all_allies_h LOOP
          FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
            IF v_combatants -> i ->> 'uid' = v_uid_i
               AND (v_combatants -> i ->> 'is_alive')::bool THEN
              sorted_allies_h := sorted_allies_h || v_uid_i;
              EXIT;
            END IF;
          END LOOP;
        END LOOP;
        v_heal_targets := sorted_allies_h;
      END;

    ELSIF v_skill_ttype = 'single_random_ally' THEN
      -- Lucky Toss: random alive ally (or self if alone)
      DECLARE
        ally_pool text[] := v_alive_ally || p_actor_uid;
        pool_len  int;
      BEGIN
        pool_len := array_length(ally_pool, 1);
        IF pool_len > 0 THEN
          v_heal_targets := ARRAY[ally_pool[1 + floor(random()*pool_len)::int % pool_len]];
        ELSE
          v_heal_targets := ARRAY[p_actor_uid];
        END IF;
      END;

    ELSIF array_length(v_alive_ally, 1) IS NULL THEN
      -- Self only
      v_heal_targets := ARRAY[p_actor_uid];

    ELSE
      -- 'single' or any other: ally with lowest HP% (incl. self)
      v_best_ally := 1; v_best_ratio := 9999;
      FOR i IN 1 .. array_length(v_alive_ally, 1) LOOP
        v_ratio := v_ally_hp[i] / GREATEST(1, v_ally_maxhp[i]);
        IF v_ratio < v_best_ratio THEN v_best_ratio := v_ratio; v_best_ally := i; END IF;
      END LOOP;
      -- Check if self is lower
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> i ->> 'uid' = p_actor_uid THEN
          v_ratio := (v_combatants -> i ->> 'current_hp')::numeric / GREATEST(1, (v_combatants -> i ->> 'max_hp')::numeric);
          IF v_ratio < v_best_ratio THEN
            v_heal_targets := ARRAY[p_actor_uid];
          ELSE
            v_heal_targets := ARRAY[v_alive_ally[v_best_ally]];
          END IF;
          EXIT;
        END IF;
      END LOOP;
      IF v_heal_targets IS NULL THEN v_heal_targets := ARRAY[v_alive_ally[v_best_ally]]; END IF;
    END IF;

    FOREACH v_tgt IN ARRAY COALESCE(v_heal_targets, '{}') LOOP
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

  -- ═══════════════════════════════════════════════════════════════════════════
  -- BUFF / SHIELD skills
  -- ═══════════════════════════════════════════════════════════════════════════
  ELSIF v_skill_type = 'buff' THEN
    IF v_skill_ttype = 'hp_shield_self' THEN
      v_shield_val   := GREATEST(1, FLOOR(v_actor_maxhp::numeric * v_skill_ratio)::int);
      v_buff_targets := ARRAY[p_actor_uid];
    ELSIF v_skill_ttype = 'single_ally_maxhp' THEN
      v_shield_val := GREATEST(1, FLOOR(v_actor_matk::numeric * v_skill_ratio)::int);
      v_best_maxhp := 0; v_best_uid := p_actor_uid;
      FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
        IF v_combatants -> i ->> 'side' = v_actor_side
           AND (v_combatants -> i ->> 'is_alive')::bool THEN
          v_tmp_val := (v_combatants -> i ->> 'max_hp')::int;
          IF v_tmp_val > v_best_maxhp THEN v_best_maxhp := v_tmp_val; v_best_uid := v_combatants -> i ->> 'uid'; END IF;
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

    FOREACH v_tgt IN ARRAY COALESCE(v_buff_targets, '{}') LOOP
      v_targets := v_targets || jsonb_build_array(jsonb_build_object(
        'target_uid', v_tgt, 'damage', 0, 'heal', 0, 'shield', v_shield_val, 'type', 'shield', 'died', false
      ));
    END LOOP;
  END IF;

  -- ── Post-action rage + skill-used flags ──────────────────────────────────
  IF v_slot = 4 THEN
    v_rage_after := 0;
    v_sk1_used   := false; v_sk2_used := false;
  ELSIF v_slot IN (1, 2) THEN
    v_rage_after := LEAST(100, v_rage + 15);
    IF v_slot = 1 THEN v_sk1_used := true; END IF;
    IF v_slot = 2 THEN v_sk2_used := true; END IF;
  ELSE
    v_rage_after := LEAST(100, v_rage + 5);
  END IF;
  v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'rage'],     to_jsonb(v_rage_after));
  v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'sk1_used'], to_jsonb(v_sk1_used));
  v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'sk2_used'], to_jsonb(v_sk2_used));
  v_combatants := jsonb_set(v_combatants, ARRAY[v_actor_idx::text, 'turn_index'], to_jsonb(v_actor_ti + 1));

  -- ── Win check ─────────────────────────────────────────────────────────────
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    IF (v_combatants -> i ->> 'is_alive')::bool THEN
      IF v_combatants -> i ->> 'side' = 'hero'  THEN v_heroes_alive  := v_heroes_alive  + 1; END IF;
      IF v_combatants -> i ->> 'side' = 'enemy' THEN v_enemies_alive := v_enemies_alive + 1; END IF;
    END IF;
  END LOOP;
  IF v_enemies_alive = 0 THEN v_winner := 'hero';  END IF;
  IF v_heroes_alive  = 0 THEN v_winner := 'enemy'; END IF;

  -- ── Build response maps ───────────────────────────────────────────────────
  FOR i IN 0 .. jsonb_array_length(v_combatants) - 1 LOOP
    v_uid_i     := v_combatants -> i ->> 'uid';
    v_hp_map    := v_hp_map    || jsonb_build_object(v_uid_i, (v_combatants -> i ->> 'current_hp')::int);
    v_alive_map := v_alive_map || jsonb_build_object(v_uid_i, (v_combatants -> i ->> 'is_alive')::bool);
    v_rage_map  := v_rage_map  || jsonb_build_object(v_uid_i, COALESCE((v_combatants -> i ->> 'rage')::int, 0));
    v_skill_flags := v_skill_flags || jsonb_build_object(v_uid_i, jsonb_build_object(
      'sk1_used', COALESCE((v_combatants -> i ->> 'sk1_used')::bool, false),
      'sk2_used', COALESCE((v_combatants -> i ->> 'sk2_used')::bool, false)
    ));
  END LOOP;

  -- ── Persist ───────────────────────────────────────────────────────────────
  UPDATE battle_sessions SET
    state = jsonb_build_object(
      'combatants', v_combatants, 'ap', v_ap,
      'winner', v_winner, 'ended', v_winner IS NOT NULL
    ),
    ended_at = CASE WHEN v_winner IS NOT NULL THEN now() ELSE NULL END
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'targets',      v_targets,
    'hp_state',     v_hp_map,
    'alive_state',  v_alive_map,
    'rage_state',   v_rage_map,
    'skill_flags',  v_skill_flags,
    'winner',       v_winner,
    'skill_name',   v_skill_name,
    'skill_slot',   v_slot
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM || ' [' || SQLSTATE || ']');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_simulate_battle(uuid, text, int) TO authenticated;