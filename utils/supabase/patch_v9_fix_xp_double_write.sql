-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v9 — Fix XP Double-Write / Level Stuck Bug                           ║
-- ║                                                                              ║
-- ║  ROOT CAUSE:                                                                 ║
-- ║  rpc_simulate_battle was doing:                                              ║
-- ║    UPDATE profiles SET xp = xp + exp_reward, gold = gold + ..., ...         ║
-- ║  This is a RAW ACCUMULATOR with NO level-up cascade.                        ║
-- ║  Players accumulated xp=11000+ at level=2 with bar stuck at 99%.            ║
-- ║                                                                              ║
-- ║  FIX:                                                                        ║
-- ║  Remove xp/gold/gems/hero_exp writes from rpc_simulate_battle.              ║
-- ║  The RPC still RETURNS rewards in its JSON response.                         ║
-- ║  Client applies rewards via gainExp() which properly cascades level-ups.     ║
-- ║  chapter1_progress stays server-authoritative.                               ║
-- ║                                                                              ║
-- ║  ALSO FIX STUCK PLAYERS:                                                    ║
-- ║  For any player with xp > max_xp, cascade their level manually.             ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── Step 1: Fix stuck players — cascade accumulated XP to correct level ────────
-- Uses the same EXP table as expSystem.ts:
--   Lv  1-29  → 960 per level
--   Lv 30-39  → 1440
--   Lv 40-59  → 2880
--   Lv 60-79  → 7200
--   Lv 80-999 → 14400

CREATE OR REPLACE FUNCTION _cascade_xp(p_level INT, p_raw_xp INT)
RETURNS TABLE(out_level INT, out_xp INT, out_max_xp INT, out_pct INT)
LANGUAGE plpgsql AS $$
DECLARE
  lv     INT := GREATEST(1, p_level);
  xp     INT := GREATEST(0, p_raw_xp);
  mx     INT;
BEGIN
  -- Cascade level-ups as long as xp >= threshold
  LOOP
    EXIT WHEN lv >= 1000;
    mx := CASE
      WHEN lv < 30 THEN 960
      WHEN lv < 40 THEN 1440
      WHEN lv < 60 THEN 2880
      WHEN lv < 80 THEN 7200
      ELSE 14400
    END;
    EXIT WHEN xp < mx;
    xp := xp - mx;
    lv  := lv + 1;
  END LOOP;

  mx := CASE
    WHEN lv < 30 THEN 960
    WHEN lv < 40 THEN 1440
    WHEN lv < 60 THEN 2880
    WHEN lv < 80 THEN 7200
    ELSE 14400
  END;

  out_level := lv;
  out_xp    := LEAST(xp, mx - 1);  -- within-level clamp
  out_max_xp := mx;
  out_pct   := LEAST(99, FLOOR((out_xp::NUMERIC / mx) * 100));
  RETURN NEXT;
END;
$$;

-- Apply cascade to every player whose xp >= their max_xp (i.e. level stuck)
DO $$
DECLARE
  r        RECORD;
  cascaded RECORD;
BEGIN
  FOR r IN
    SELECT id, level, xp FROM profiles
    WHERE xp >= CASE
      WHEN level < 30 THEN 960
      WHEN level < 40 THEN 1440
      WHEN level < 60 THEN 2880
      WHEN level < 80 THEN 7200
      ELSE 14400
    END
  LOOP
    SELECT * INTO cascaded FROM _cascade_xp(r.level, r.xp);
    UPDATE profiles SET
      level          = cascaded.out_level,
      xp             = cascaded.out_xp,
      max_xp         = cascaded.out_max_xp,
      exp_percentage = cascaded.out_pct
    WHERE id = r.id;
    RAISE NOTICE 'Fixed player % : level %→% xp %→%',
      r.id, r.level, cascaded.out_level, r.xp, cascaded.out_xp;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS _cascade_xp(INT, INT);


-- ── Step 2: Replace rpc_simulate_battle — remove profile reward writes ──────────
-- Only chapter1_progress stays server-authoritative.
-- Everything else (xp, gold, gems, hero_exp) is applied client-side via gainExp().

CREATE OR REPLACE FUNCTION rpc_simulate_battle(
  p_stage_id  TEXT,
  p_hero_ids  TEXT   -- comma-separated hero UUIDs (player_heroes.id)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BATTLE$
DECLARE
  v_uid        UUID;
  v_snum       INT;
  v_sdef       RECORD;
  v_rewards    JSONB;
  v_hero_ids   TEXT[];
  v_combj      JSONB;
  v_log        JSONB;
  v_winner     TEXT;
  v_units      JSONB;
  v_k          TEXT;
  v_u          JSONB;
  v_turn_log   JSONB[];
  v_turn       JSONB;
  v_atb_step   NUMERIC;

  -- Unit fields
  v_uid_key    TEXT;
  v_acting     TEXT;
  v_target     TEXT;
  v_targets    TEXT[];
  v_tuid       TEXT;
  v_skill_slot INT;

  -- ATB & combat
  v_atb        JSONB;  -- uid → atb_value
  v_hp         JSONB;  -- uid → current_hp
  v_tick       INT;
  v_max_ticks  INT;
  v_alive      BOOLEAN;

  -- Skill + damage
  v_ratio       NUMERIC;
  v_base_dmg    NUMERIC;
  v_dmg         INT;
  v_heal        INT;
  v_is_magic    BOOLEAN;
  v_aoe         BOOLEAN;
  v_skill_name  TEXT;
  v_sfx         TEXT;

  -- Hero data
  v_hrec       RECORD;

  -- Temp arrays for expanded targets
  v_expanded   TEXT[];
  v_tuids      TEXT[];

  -- Shield system
  v_shields    JSONB;  -- uid → shield_hp
  v_shield_amt INT;
  v_absorbed   INT;

  -- Status effects (stun, etc.)
  v_status     JSONB;  -- uid → {stun_turns, rage}
  v_stun_turns INT;
  v_rage       JSONB;  -- uid → rage_value (0-100)
  v_rage_val   INT;

  -- Passive / per-turn tracking
  v_lucas_stacks    JSONB;  -- uid → stack_count (Lucas passive)
  v_stack_count     INT;
  v_stack_dmg       NUMERIC;

  -- Emma passive tracking
  v_emma_last_skill JSONB;  -- uid → last_skill_slot_used

BEGIN
  -- ── AUTH ──────────────────────────────────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  -- ── LOAD HEROES ───────────────────────────────────────────────────────────────
  v_hero_ids := string_to_array(p_hero_ids, ',');
  v_units    := '{}'::JSONB;

  FOR v_hrec IN
    SELECT
      ph.id            AS ph_id,
      hd.name,
      hd.hero_type,
      hd.rarity,
      ph.level,
      ph.stars,
      ph.hp            AS max_hp,
      ph.p_atk,
      ph.m_atk,
      ph.p_def,
      ph.m_def,
      ph.speed,
      ph.hero_id,
      ph.slot_index
    FROM player_heroes ph
    JOIN hero_definitions hd ON hd.id = ph.hero_id
    WHERE ph.id = ANY(v_hero_ids)
      AND ph.user_id = v_uid
  LOOP
    v_uid_key := 'h_' || v_hrec.slot_index::TEXT;
    v_units := v_units || jsonb_build_object(
      v_uid_key, jsonb_build_object(
        'hero_id',  v_hrec.ph_id,
        'name',     v_hrec.name,
        'side',     'hero',
        'slot',     v_hrec.slot_index,
        'hero_type',v_hrec.hero_type,
        'level',    v_hrec.level,
        'stars',    v_hrec.stars,
        'max_hp',   v_hrec.max_hp,
        'hp',       v_hrec.max_hp,
        'p_atk',    v_hrec.p_atk,
        'm_atk',    v_hrec.m_atk,
        'p_def',    v_hrec.p_def,
        'm_def',    v_hrec.m_def,
        'speed',    v_hrec.speed,
        'alive',    TRUE,
        'atb',      0,
        'rage',     0,
        'stun',     0,
        'lucas_stacks', 0
      )
    );
  END LOOP;

  IF v_units = '{}'::JSONB THEN
    RETURN jsonb_build_object('error', 'no_valid_heroes');
  END IF;

  -- ── LOAD ENEMIES FROM stage_definitions ───────────────────────────────────────
  -- (Enemy definitions are embedded in stage logic below for portability)
  -- For Chapter 1, enemies are Slimes with fixed stats scaled by stage number
  BEGIN
    v_snum := split_part(p_stage_id, '-', 2)::INT;
  EXCEPTION WHEN OTHERS THEN
    v_snum := 1;
  END;

  -- Add enemies based on stage
  DECLARE
    v_enemy_defs JSONB[];
    v_edef       JSONB;
    v_ei         INT := 0;
    v_base_hp    INT;
    v_base_atk   INT;
    v_base_def   INT;
    v_base_spd   INT;
    v_escale     NUMERIC;
    v_ename      TEXT;
    v_etype      TEXT;
  BEGIN
    -- Scale enemies with stage number
    v_escale := 1.0 + (v_snum - 1) * 0.12;

    -- Stage enemy composition (Chapter 1)
    CASE v_snum
      WHEN 1 THEN
        v_enemy_defs := ARRAY[
          '{"name":"AcidSlime","type":"magic","hp":820,"atk":95,"def":55,"spd":88}'::JSONB
        ];
      WHEN 2 THEN
        v_enemy_defs := ARRAY[
          '{"name":"AcidSlime","type":"magic","hp":820,"atk":95,"def":55,"spd":88}'::JSONB,
          '{"name":"WaterSlime","type":"magic","hp":880,"atk":88,"def":60,"spd":92}'::JSONB
        ];
      WHEN 3 THEN
        v_enemy_defs := ARRAY[
          '{"name":"RockSlime","type":"physical","hp":1100,"atk":108,"def":75,"spd":72}'::JSONB,
          '{"name":"AcidSlime","type":"magic","hp":820,"atk":95,"def":55,"spd":88}'::JSONB
        ];
      WHEN 4 THEN
        v_enemy_defs := ARRAY[
          '{"name":"RockSlime","type":"physical","hp":1100,"atk":108,"def":75,"spd":72}'::JSONB,
          '{"name":"WaterSlime","type":"magic","hp":880,"atk":88,"def":60,"spd":92}'::JSONB,
          '{"name":"AcidSlime","type":"magic","hp":820,"atk":95,"def":55,"spd":88}'::JSONB
        ];
      WHEN 5 THEN
        v_enemy_defs := ARRAY[
          '{"name":"RockSlime","type":"physical","hp":1200,"atk":115,"def":80,"spd":70}'::JSONB,
          '{"name":"RockSlime","type":"physical","hp":1200,"atk":115,"def":80,"spd":70}'::JSONB,
          '{"name":"WaterSlime","type":"magic","hp":950,"atk":100,"def":65,"spd":90}'::JSONB
        ];
      WHEN 6 THEN
        v_enemy_defs := ARRAY[
          '{"name":"RockSlime","type":"physical","hp":1300,"atk":125,"def":85,"spd":70}'::JSONB,
          '{"name":"AcidSlime","type":"magic","hp":900,"atk":110,"def":60,"spd":92}'::JSONB,
          '{"name":"WaterSlime","type":"magic","hp":950,"atk":105,"def":65,"spd":90}'::JSONB
        ];
      WHEN 7 THEN
        v_enemy_defs := ARRAY[
          '{"name":"RockSlime","type":"physical","hp":1400,"atk":135,"def":90,"spd":70}'::JSONB,
          '{"name":"RockSlime","type":"physical","hp":1400,"atk":135,"def":90,"spd":70}'::JSONB,
          '{"name":"AcidSlime","type":"magic","hp":950,"atk":115,"def":62,"spd":92}'::JSONB,
          '{"name":"WaterSlime","type":"magic","hp":1000,"atk":110,"def":68,"spd":90}'::JSONB
        ];
      WHEN 8 THEN
        v_enemy_defs := ARRAY[
          '{"name":"RockSlime","type":"physical","hp":1500,"atk":145,"def":95,"spd":70}'::JSONB,
          '{"name":"AcidSlime","type":"magic","hp":1000,"atk":120,"def":65,"spd":92}'::JSONB,
          '{"name":"WaterSlime","type":"magic","hp":1050,"atk":115,"def":70,"spd":90}'::JSONB,
          '{"name":"RockSlime","type":"physical","hp":1500,"atk":145,"def":95,"spd":70}'::JSONB
        ];
      WHEN 9 THEN
        v_enemy_defs := ARRAY[
          '{"name":"RockSlime","type":"physical","hp":1600,"atk":155,"def":100,"spd":70}'::JSONB,
          '{"name":"RockSlime","type":"physical","hp":1600,"atk":155,"def":100,"spd":70}'::JSONB,
          '{"name":"AcidSlime","type":"magic","hp":1050,"atk":125,"def":68,"spd":92}'::JSONB,
          '{"name":"WaterSlime","type":"magic","hp":1100,"atk":120,"def":72,"spd":90}'::JSONB,
          '{"name":"AcidSlime","type":"magic","hp":1050,"atk":125,"def":68,"spd":92}'::JSONB
        ];
      ELSE -- stage 10+
        v_enemy_defs := ARRAY[
          '{"name":"RockSlime","type":"physical","hp":1800,"atk":170,"def":110,"spd":70}'::JSONB,
          '{"name":"RockSlime","type":"physical","hp":1800,"atk":170,"def":110,"spd":70}'::JSONB,
          '{"name":"WaterSlime","type":"magic","hp":1200,"atk":135,"def":78,"spd":90}'::JSONB,
          '{"name":"AcidSlime","type":"magic","hp":1150,"atk":140,"def":72,"spd":92}'::JSONB,
          '{"name":"RockSlime","type":"physical","hp":1800,"atk":170,"def":110,"spd":70}'::JSONB
        ];
    END CASE;

    FOREACH v_edef IN ARRAY v_enemy_defs LOOP
      v_ei := v_ei + 1;
      v_uid_key  := 'e_' || v_ei::TEXT;
      v_base_hp  := ROUND((v_edef->>'hp')::NUMERIC  * v_escale);
      v_base_atk := ROUND((v_edef->>'atk')::NUMERIC * v_escale);
      v_base_def := ROUND((v_edef->>'def')::NUMERIC * v_escale);
      v_base_spd := (v_edef->>'spd')::INT;
      v_ename    := v_edef->>'name';
      v_etype    := v_edef->>'type';

      v_units := v_units || jsonb_build_object(
        v_uid_key, jsonb_build_object(
          'hero_id',  v_uid_key,
          'name',     v_ename,
          'side',     'enemy',
          'slot',     v_ei,
          'hero_type',v_etype,
          'level',    v_snum,
          'stars',    1,
          'max_hp',   v_base_hp,
          'hp',       v_base_hp,
          'p_atk',    v_base_atk,
          'm_atk',    v_base_atk,
          'p_def',    v_base_def,
          'm_def',    v_base_def,
          'speed',    v_base_spd,
          'alive',    TRUE,
          'atb',      0,
          'rage',     0,
          'stun',     0,
          'lucas_stacks', 0
        )
      );
    END LOOP;
  END;

  -- ── ATB SIMULATION LOOP ───────────────────────────────────────────────────────
  v_turn_log := ARRAY[]::JSONB[];
  v_tick      := 0;
  v_max_ticks := 2000;
  v_winner    := 'enemy';

  LOOP
    EXIT WHEN v_tick >= v_max_ticks;
    v_tick := v_tick + 1;

    -- Check win/lose
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_units) AS t(k)
      WHERE (v_units -> t.k ->> 'side') = 'hero'
        AND (v_units -> t.k ->> 'alive')::BOOLEAN = TRUE
    ) THEN
      v_winner := 'enemy';
      EXIT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_units) AS t(k)
      WHERE (v_units -> t.k ->> 'side') = 'enemy'
        AND (v_units -> t.k ->> 'alive')::BOOLEAN = TRUE
    ) THEN
      v_winner := 'hero';
      EXIT;
    END IF;

    -- Advance ATB for all alive units
    FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k)
    LOOP
      v_u := v_units -> v_k;
      IF (v_u ->> 'alive')::BOOLEAN THEN
        v_atb_step := ((v_u ->> 'speed')::NUMERIC / 100.0) * 12.0;
        -- Stun check
        IF (v_u ->> 'stun')::INT > 0 THEN
          v_atb_step := 0;
          -- Decrement stun
          v_u := v_u || jsonb_build_object('stun', GREATEST(0, (v_u->>'stun')::INT - 1));
          v_units := v_units || jsonb_build_object(v_k, v_u);
        END IF;
        v_u := v_units -> v_k;
        IF (v_u ->> 'alive')::BOOLEAN THEN
          v_u := v_u || jsonb_build_object('atb', LEAST(100, (v_u->>'atb')::NUMERIC + v_atb_step));
          v_units := v_units || jsonb_build_object(v_k, v_u);
        END IF;
      END IF;
    END LOOP;

    -- Find unit with highest ATB >= 100
    v_acting := NULL;
    FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k)
    LOOP
      v_u := v_units -> v_k;
      IF (v_u ->> 'alive')::BOOLEAN AND (v_u ->> 'atb')::NUMERIC >= 100 THEN
        IF v_acting IS NULL OR
           (v_units -> v_k ->> 'atb')::NUMERIC > (v_units -> v_acting ->> 'atb')::NUMERIC THEN
          v_acting := v_k;
        END IF;
      END IF;
    END LOOP;

    CONTINUE WHEN v_acting IS NULL;

    -- Reset acting unit ATB
    v_u := v_units -> v_acting;
    v_u := v_u || jsonb_build_object('atb', 0);
    v_units := v_units || jsonb_build_object(v_acting, v_u);

    -- Gain rage on action
    v_rage_val := LEAST(100, (v_u ->> 'rage')::INT + 12);
    v_u := v_u || jsonb_build_object('rage', v_rage_val);
    v_units := v_units || jsonb_build_object(v_acting, v_u);

    -- Determine skill to use
    v_rage_val   := (v_u ->> 'rage')::INT;
    v_skill_slot := 1; -- default basic
    v_skill_name := 'Basic Attack';
    v_sfx        := 'basic';
    v_ratio      := 1.0;
    v_is_magic   := (v_u ->> 'hero_type') = 'magic';
    v_aoe        := FALSE;

    -- Rage-based skill selection
    IF v_rage_val >= 100 THEN
      v_skill_slot := 5; -- ULT
      v_skill_name := 'Ultimate';
      v_sfx        := 'ult';
      -- Reset rage
      v_u := v_u || jsonb_build_object('rage', 0);
      v_units := v_units || jsonb_build_object(v_acting, v_u);
    ELSIF v_rage_val >= 60 THEN
      v_skill_slot := 2;
      v_skill_name := 'Skill 2';
      v_sfx        := 'skill2';
    END IF;

    -- Per-hero skill overrides
    DECLARE
      v_hname TEXT := v_u ->> 'name';
      v_hlevel INT := (v_u ->> 'level')::INT;
      v_htype  TEXT := v_u ->> 'hero_type';
    BEGIN
      -- Skill ratios by hero name
      IF v_hname = 'Emma' THEN
        v_is_magic := TRUE;
        CASE v_skill_slot
          WHEN 1 THEN v_ratio := 0.95; v_skill_name := 'Aqua Strike';   v_sfx := 'basic';
          WHEN 2 THEN v_ratio := 1.4;  v_skill_name := 'Tidal Burst';   v_sfx := 'skill2'; v_aoe := TRUE;
          WHEN 5 THEN v_ratio := 2.2;  v_skill_name := 'Oceans Wrath';  v_sfx := 'ult';   v_aoe := TRUE;
          ELSE        v_ratio := 0.95;
        END CASE;

      ELSIF v_hname = 'Lucas' THEN
        v_is_magic := FALSE;
        v_stack_count := (v_u ->> 'lucas_stacks')::INT;
        CASE v_skill_slot
          WHEN 1 THEN
            -- Lucas SK1: hits harder per stack, gains 1 stack
            v_stack_count := LEAST(5, v_stack_count + 1);
            v_ratio := 0.9 + (v_stack_count * 0.12);
            v_skill_name := 'Steel Slash';
            v_sfx := 'basic';
            v_u := v_u || jsonb_build_object('lucas_stacks', v_stack_count);
            v_units := v_units || jsonb_build_object(v_acting, v_u);
          WHEN 2 THEN
            v_ratio := 1.5;
            v_skill_name := 'Shield Slam';
            v_sfx := 'skill2';
            -- Gain 2 stacks
            v_stack_count := LEAST(5, v_stack_count + 2);
            v_u := v_u || jsonb_build_object('lucas_stacks', v_stack_count);
            v_units := v_units || jsonb_build_object(v_acting, v_u);
          WHEN 5 THEN
            -- ULT: 3 hits, ratio per hit scales with stacks
            v_ratio := 0.7 + (v_stack_count * 0.1);
            v_skill_name := 'Titans Fury';
            v_sfx := 'ult';
          ELSE
            v_ratio := 0.9;
        END CASE;

      ELSIF v_hname IN ('AcidSlime','WaterSlime') THEN
        v_is_magic := TRUE;
        CASE v_skill_slot
          WHEN 1 THEN v_ratio := 0.85; v_skill_name := 'Acid Spit';   v_sfx := 'basic';
          WHEN 2 THEN v_ratio := 1.3;  v_skill_name := 'Toxic Wave';  v_sfx := 'skill2'; v_aoe := TRUE;
          WHEN 5 THEN v_ratio := 1.9;  v_skill_name := 'Slime Burst'; v_sfx := 'ult';    v_aoe := TRUE;
          ELSE        v_ratio := 0.85;
        END CASE;

      ELSIF v_hname = 'RockSlime' THEN
        v_is_magic := FALSE;
        CASE v_skill_slot
          WHEN 1 THEN v_ratio := 0.9;  v_skill_name := 'Body Slam';  v_sfx := 'basic';
          WHEN 2 THEN v_ratio := 1.35; v_skill_name := 'Rock Crash'; v_sfx := 'skill2';
          WHEN 5 THEN v_ratio := 2.0;  v_skill_name := 'Boulder';    v_sfx := 'ult';   v_aoe := TRUE;
          ELSE        v_ratio := 0.9;
        END CASE;
      END IF;
    END;

    -- Pick target(s)
    v_tuids := ARRAY[]::TEXT[];
    IF v_aoe THEN
      -- All alive enemies of the opposite side
      FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k)
      LOOP
        v_u := v_units -> v_k;
        IF (v_u ->> 'alive')::BOOLEAN THEN
          IF (v_units -> v_acting ->> 'side') = 'hero' AND (v_u ->> 'side') = 'enemy' THEN
            v_tuids := v_tuids || ARRAY[v_k];
          ELSIF (v_units -> v_acting ->> 'side') = 'enemy' AND (v_u ->> 'side') = 'hero' THEN
            v_tuids := v_tuids || ARRAY[v_k];
          END IF;
        END IF;
      END LOOP;
    ELSE
      -- Single target: lowest HP ratio among alive enemies
      v_target := NULL;
      FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k)
      LOOP
        v_u := v_units -> v_k;
        IF (v_u ->> 'alive')::BOOLEAN THEN
          IF (v_units -> v_acting ->> 'side') = 'hero' AND (v_u ->> 'side') = 'enemy' THEN
            IF v_target IS NULL OR
               ((v_units -> v_k ->> 'hp')::NUMERIC / GREATEST(1,(v_units -> v_k ->> 'max_hp')::NUMERIC)) <
               ((v_units -> v_target ->> 'hp')::NUMERIC / GREATEST(1,(v_units -> v_target ->> 'max_hp')::NUMERIC))
            THEN
              v_target := v_k;
            END IF;
          ELSIF (v_units -> v_acting ->> 'side') = 'enemy' AND (v_u ->> 'side') = 'hero' THEN
            IF v_target IS NULL OR
               ((v_units -> v_k ->> 'hp')::NUMERIC / GREATEST(1,(v_units -> v_k ->> 'max_hp')::NUMERIC)) <
               ((v_units -> v_target ->> 'hp')::NUMERIC / GREATEST(1,(v_units -> v_target ->> 'max_hp')::NUMERIC))
            THEN
              v_target := v_k;
            END IF;
          END IF;
        END IF;
      END LOOP;
      IF v_target IS NOT NULL THEN
        -- Lucas ULT: 3 hits on same target
        IF (v_units -> v_acting ->> 'name') = 'Lucas' AND v_skill_slot = 5 THEN
          v_tuids := ARRAY[v_target, v_target, v_target];
        ELSE
          v_tuids := ARRAY[v_target];
        END IF;
      END IF;
    END IF;

    -- Apply damage to each target
    DECLARE
      v_actor_u  JSONB;
      v_tgt_u    JSONB;
      v_hit_dmg  INT;
      v_new_hp   INT;
      v_killed   BOOLEAN;
      v_hit_log  JSONB[];
      v_one_hit  JSONB;
    BEGIN
      v_actor_u := v_units -> v_acting;
      v_hit_log := ARRAY[]::JSONB[];

      FOREACH v_tuid IN ARRAY v_tuids LOOP
        v_tgt_u  := v_units -> v_tuid;
        v_killed := FALSE;

        IF v_is_magic THEN
          v_base_dmg := (v_actor_u ->> 'm_atk')::NUMERIC * v_ratio;
          v_hit_dmg  := GREATEST(1, ROUND(
            v_base_dmg * (100.0 / (100.0 + COALESCE((v_tgt_u->>'m_def')::NUMERIC, 0)))
          ));
        ELSE
          v_base_dmg := (v_actor_u ->> 'p_atk')::NUMERIC * v_ratio;
          v_hit_dmg  := GREATEST(1, ROUND(
            v_base_dmg * (100.0 / (100.0 + COALESCE((v_tgt_u->>'p_def')::NUMERIC, 0)))
          ));
        END IF;

        -- Add some variance ±10%
        v_hit_dmg := GREATEST(1, ROUND(v_hit_dmg * (0.95 + random() * 0.10)));

        v_new_hp  := GREATEST(0, (v_tgt_u ->> 'hp')::INT - v_hit_dmg);
        IF v_new_hp <= 0 THEN v_killed := TRUE; END IF;

        v_tgt_u  := v_tgt_u || jsonb_build_object('hp', v_new_hp, 'alive', NOT v_killed);
        v_units  := v_units || jsonb_build_object(v_tuid, v_tgt_u);

        v_one_hit := jsonb_build_object(
          'target', v_tuid,
          'dmg',    v_hit_dmg,
          'killed', v_killed,
          'hp_left',v_new_hp
        );
        v_hit_log := v_hit_log || ARRAY[v_one_hit];
      END LOOP;

      -- Log the turn
      v_turn_log := v_turn_log || ARRAY[jsonb_build_object(
        'actor',      v_acting,
        'skill_slot', v_skill_slot,
        'skill_name', v_skill_name,
        'sfx',        v_sfx,
        'hits',       array_to_json(v_hit_log)::JSONB,
        'snapshot',   v_units
      )];
    END;

  END LOOP; -- end ATB tick loop

  -- ── STEP 7 — Grant chapter progress ONLY (client manages xp/gold/gems) ────────
  -- xp, gold, gems, hero_exp intentionally REMOVED from server write.
  -- Client calls gainExp() which properly cascades level-ups.
  SELECT gold_reward, gem_reward, exp_reward, hero_exp_reward
  INTO v_sdef
  FROM stage_definitions
  WHERE stage_id = p_stage_id;

  IF v_winner = 'hero' AND FOUND THEN
    BEGIN
      v_snum := split_part(p_stage_id, '-', 2)::INT;
    EXCEPTION WHEN OTHERS THEN
      v_snum := 0;
    END;

    -- ONLY update chapter progress — all other rewards applied client-side
    UPDATE profiles SET
      chapter1_progress = CASE
        WHEN split_part(p_stage_id, '-', 1) = '1'
        THEN GREATEST(chapter1_progress, v_snum)
        ELSE chapter1_progress
      END
    WHERE id = v_uid;

    v_rewards := jsonb_build_object(
      'gold',     COALESCE(v_sdef.gold_reward,     0),
      'gems',     COALESCE(v_sdef.gem_reward,      0),
      'exp',      COALESCE(v_sdef.exp_reward,      0),
      'hero_exp', COALESCE(v_sdef.hero_exp_reward, 0)
    );
  ELSE
    v_rewards := 'null'::JSONB;
  END IF;

  -- ── Build combatants snapshot ──────────────────────────────────────────────────
  v_combj := '[]'::JSONB;
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k)
  LOOP
    v_u := v_units -> v_k;
    v_combj := v_combj || jsonb_build_array(jsonb_build_object(
      'uid',        v_k,
      'hero_id',    v_u ->> 'hero_id',
      'name',       v_u ->> 'name',
      'side',       v_u ->> 'side',
      'slot_index', (v_u ->> 'slot')::INT,
      'level',      (v_u ->> 'level')::INT,
      'hero_type',  v_u ->> 'hero_type',
      'max_hp',     (v_u ->> 'max_hp')::INT,
      'current_hp', (v_u ->> 'hp')::INT,
      'p_atk',      (v_u ->> 'p_atk')::INT,
      'm_atk',      (v_u ->> 'm_atk')::INT,
      'p_def',      (v_u ->> 'p_def')::INT,
      'm_def',      (v_u ->> 'm_def')::INT,
      'speed',      (v_u ->> 'speed')::INT,
      'is_alive',   (v_u ->> 'alive')::BOOLEAN
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'winner',       v_winner,
    'stage_id',     p_stage_id,
    'turns',        array_to_json(v_turn_log)::JSONB,
    'combatants',   v_combj,
    'rewards',      v_rewards
  );

END;
$BATTLE$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION rpc_simulate_battle(TEXT, TEXT) TO authenticated;

-- ── VERIFY: Show current player levels after fix ────────────────────────────────
SELECT id, level, xp, max_xp, exp_percentage FROM profiles ORDER BY level DESC LIMIT 10;