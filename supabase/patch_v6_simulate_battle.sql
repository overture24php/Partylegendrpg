-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v6 — rpc_simulate_battle                                          ║
-- ║  Full server-side battle simulation. One call → entire battle log.       ║
-- ║  Client receives the log and plays it back as pure animation.            ║
-- ║  Run once in: Supabase Dashboard → SQL Editor                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rpc_simulate_battle(
  p_stage_id     text,
  p_hero_entries jsonb   -- [{hero_id: text, slot_index: int}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();

  -- ── Combatant arrays (1-indexed) ──────────────────────────────────────────
  v_n     int       := 0;
  v_uids  text[]    := '{}';  -- 'hero-N' or 'enemy-N'
  v_hids  text[]    := '{}';  -- hero_id (db key)
  v_names text[]    := '{}';  -- display name
  v_sides text[]    := '{}';  -- 'hero' | 'enemy'
  v_slots int[]     := '{}';  -- slot_index (0-5)
  v_lvs   int[]     := '{}';  -- level
  v_htyps text[]    := '{}';  -- hero_type
  v_mhp   int[]     := '{}';  -- max hp
  v_chp   int[]     := '{}';  -- current hp
  v_pa    int[]     := '{}';  -- p_atk
  v_ma    int[]     := '{}';  -- m_atk
  v_pd    int[]     := '{}';  -- p_def
  v_md    int[]     := '{}';  -- m_def
  v_spd   int[]     := '{}';  -- speed
  v_alivs bool[]    := '{}';
  v_ap    numeric[] := '{}';  -- ATB action points
  v_rage  int[]     := '{}';  -- 0–100 rage
  v_sk1u  bool[]    := '{}';  -- sk1 used this rage cycle
  v_sk2u  bool[]    := '{}';  -- sk2 used this rage cycle
  v_shld  int[]     := '{}';  -- shield hp
  v_pds   int[]     := '{}';  -- pdef_shred %

  -- ── Simulation vars ───────────────────────────────────────────────────────
  i       int;
  j       int;
  v_iter  int     := 0;
  v_maxiter int   := 1200;  -- safety cap (600 turns × avg 2 actors each)
  v_evtidx  int  := 0;

  -- AP
  v_minadv  numeric;
  v_adv     numeric;

  -- Actor
  v_ai    int;       -- actor index (1-based)
  v_bstap numeric;
  v_aside text;
  v_ahid  text;
  v_alv   int;
  v_apa   int;       -- effective p_atk (may be boosted by passive)
  v_ama   int;
  v_arage int;
  v_eside text;      -- opposing side

  -- Skill
  v_ss     int;      -- skill_slot
  v_sn     text;
  v_stype  text;
  v_srat   numeric;
  v_sdtype text;
  v_sttype text;
  v_ultlv  int;
  v_sk1lv  int;
  v_sk2lv  int;
  v_sk3lv  int;

  -- Targeting
  v_farr   int[]   := '{}';  -- front-row indices (frontmost occupied row)
  v_barr   int[]   := '{}';  -- back-row indices
  v_tarr   int[]   := '{}';  -- final target index list
  v_fridx  int;
  v_t1idx  int;
  v_t2idx  int;
  v_bval   int;

  -- Damage / heal / shield
  v_tdef   int;
  v_dmg    int;
  v_nhp    int;
  v_died   bool;
  v_heal   int;
  v_sval   int;

  -- Alive counts
  v_ahero  int;
  v_aenemy int;

  -- Winner
  v_winner text;

  -- JSONB output
  v_evts   jsonb := '[]'::jsonb;
  v_tout   jsonb;
  v_couts  jsonb := '[]'::jsonb;
  v_ihp    jsonb := '{}'::jsonb;
  v_imhp   jsonb := '{}'::jsonb;
  v_rews   jsonb := 'null'::jsonb;

  -- Loaders
  v_entry  jsonb;
  v_hid2   text;
  v_sidx   int;
  v_rec    record;
  v_stagr  record;
  v_ehp    int;
  v_epa    int;
  v_ema    int;
  v_epd    int;
  v_emd    int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth/unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM stage_definitions WHERE stage_id = p_stage_id) THEN
    RAISE EXCEPTION 'stage/not-found:%', p_stage_id;
  END IF;
  IF p_hero_entries IS NULL OR jsonb_array_length(p_hero_entries) = 0 THEN
    RAISE EXCEPTION 'battle/no-heroes';
  END IF;

  -- ── Load heroes (authoritative from player_heroes + hero_definitions) ──────
  FOR i IN 0 .. jsonb_array_length(p_hero_entries) - 1 LOOP
    v_entry := p_hero_entries -> i;
    v_hid2  := v_entry ->> 'hero_id';
    v_sidx  := (v_entry ->> 'slot_index')::int;

    SELECT ph.level, ph.hp, ph.p_atk, ph.m_atk, ph.p_def, ph.m_def, ph.speed,
           hd.name, hd.hero_type
    INTO   v_rec
    FROM   player_heroes ph
    JOIN   hero_definitions hd ON hd.hero_id = ph.hero_id
    WHERE  ph.user_id = v_uid AND ph.hero_id = v_hid2;
    IF NOT FOUND THEN RAISE EXCEPTION 'hero/not-owned:%', v_hid2; END IF;

    v_n    := v_n + 1;
    v_uids  := v_uids  || ('hero-' || v_sidx);
    v_hids  := v_hids  || v_hid2;
    v_names := v_names || v_rec.name;
    v_sides := array_append(v_sides, 'hero');
    v_slots := v_slots || v_sidx;
    v_lvs   := v_lvs   || v_rec.level;
    v_htyps := v_htyps || v_rec.hero_type;
    v_mhp   := v_mhp   || v_rec.hp;
    v_chp   := v_chp   || v_rec.hp;
    v_pa    := v_pa    || v_rec.p_atk;
    v_ma    := v_ma    || v_rec.m_atk;
    v_pd    := v_pd    || v_rec.p_def;
    v_md    := v_md    || v_rec.m_def;
    v_spd   := v_spd   || v_rec.speed;
    v_alivs := v_alivs || true;
    v_ap    := v_ap    || 0::numeric;
    v_rage  := v_rage  || 0;
    v_sk1u  := v_sk1u  || false;
    v_sk2u  := v_sk2u  || false;
    v_shld  := v_shld  || 0;
    v_pds   := v_pds   || 0;
    v_ihp   := v_ihp   || jsonb_build_object('hero-' || v_sidx, v_rec.hp);
    v_imhp  := v_imhp  || jsonb_build_object('hero-' || v_sidx, v_rec.hp);
  END LOOP;

  -- ── Load enemies (stats = base + (level-1) * growth) ──────────────────────
  FOR v_rec IN (
    SELECT se.enemy_hero_id, se.enemy_level, se.slot_position,
           hd.name, hd.hero_type,
           hd.base_hp,    hd.growth_hp,
           hd.base_p_atk, hd.growth_p_atk,
           hd.base_m_atk, hd.growth_m_atk,
           hd.base_p_def, hd.growth_p_def,
           hd.base_m_def, hd.growth_m_def,
           hd.base_speed
    FROM   stage_enemies se
    JOIN   hero_definitions hd ON hd.hero_id = se.enemy_hero_id
    WHERE  se.stage_id = p_stage_id
    ORDER  BY se.order_index
  ) LOOP
    v_ehp := v_rec.base_hp    + (v_rec.enemy_level - 1) * v_rec.growth_hp;
    v_epa := v_rec.base_p_atk + (v_rec.enemy_level - 1) * v_rec.growth_p_atk;
    v_ema := v_rec.base_m_atk + (v_rec.enemy_level - 1) * v_rec.growth_m_atk;
    v_epd := v_rec.base_p_def + (v_rec.enemy_level - 1) * v_rec.growth_p_def;
    v_emd := v_rec.base_m_def + (v_rec.enemy_level - 1) * v_rec.growth_m_def;

    v_n    := v_n + 1;
    v_uids  := v_uids  || ('enemy-' || v_rec.slot_position);
    v_hids  := v_hids  || v_rec.enemy_hero_id;
    v_names := v_names || v_rec.name;
    v_sides := array_append(v_sides, 'enemy');
    v_slots := v_slots || v_rec.slot_position;
    v_lvs   := v_lvs   || v_rec.enemy_level;
    v_htyps := v_htyps || v_rec.hero_type;
    v_mhp   := v_mhp   || v_ehp;
    v_chp   := v_chp   || v_ehp;
    v_pa    := v_pa    || v_epa;
    v_ma    := v_ma    || v_ema;
    v_pd    := v_pd    || v_epd;
    v_md    := v_md    || v_emd;
    v_spd   := v_spd   || v_rec.base_speed;
    v_alivs := v_alivs || true;
    v_ap    := v_ap    || 0::numeric;
    v_rage  := v_rage  || 0;
    v_sk1u  := v_sk1u  || false;
    v_sk2u  := v_sk2u  || false;
    v_shld  := v_shld  || 0;
    v_pds   := v_pds   || 0;
    v_ihp   := v_ihp   || jsonb_build_object('enemy-' || v_rec.slot_position, v_ehp);
    v_imhp  := v_imhp  || jsonb_build_object('enemy-' || v_rec.slot_position, v_ehp);
  END LOOP;

  IF v_n = 0 THEN RAISE EXCEPTION 'battle/no-combatants'; END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- Main simulation loop
  -- ════════════════════════════════════════════════════════════════════════════
  <<main_loop>>
  LOOP
    EXIT main_loop WHEN v_iter >= v_maxiter;
    v_iter := v_iter + 1;

    -- Count alive
    v_ahero := 0; v_aenemy := 0;
    FOR i IN 1..v_n LOOP
      IF v_alivs[i] THEN
        IF v_sides[i] = 'hero'  THEN v_ahero  := v_ahero  + 1; END IF;
        IF v_sides[i] = 'enemy' THEN v_aenemy := v_aenemy + 1; END IF;
      END IF;
    END LOOP;
    EXIT main_loop WHEN v_aenemy = 0;  -- heroes win
    EXIT main_loop WHEN v_ahero  = 0;  -- enemies win

    -- ── Skip AP: advance to the moment the next unit reaches 1000 ──
    v_minadv := NULL;
    FOR i IN 1..v_n LOOP
      IF v_alivs[i] THEN
        IF v_ap[i] >= 1000 THEN v_minadv := 0; EXIT; END IF;
        v_adv := (1000.0 - v_ap[i]) / GREATEST(1, v_spd[i])::numeric;
        IF v_minadv IS NULL OR v_adv < v_minadv THEN v_minadv := v_adv; END IF;
      END IF;
    END LOOP;
    CONTINUE WHEN v_minadv IS NULL;

    IF v_minadv > 0 THEN
      FOR i IN 1..v_n LOOP
        IF v_alivs[i] THEN v_ap[i] := v_ap[i] + v_spd[i]::numeric * v_minadv; END IF;
      END LOOP;
    END IF;

    -- ── Find actor: highest AP among units with AP ≥ 1000 ──
    v_ai := -1; v_bstap := -1;
    FOR i IN 1..v_n LOOP
      IF v_alivs[i] AND v_ap[i] >= 1000 AND v_ap[i] > v_bstap THEN
        v_bstap := v_ap[i]; v_ai := i;
      END IF;
    END LOOP;
    CONTINUE WHEN v_ai = -1;

    v_ap[v_ai] := v_ap[v_ai] - 1000;

    -- Gather actor info
    v_aside := v_sides[v_ai];
    v_ahid  := v_hids[v_ai];
    v_alv   := v_lvs[v_ai];
    v_apa   := v_pa[v_ai];
    v_ama   := v_ma[v_ai];
    v_arage := v_rage[v_ai];
    v_eside := CASE WHEN v_aside = 'hero' THEN 'enemy' ELSE 'hero' END;

    -- Warlord's Edge passive: Lucas passive P.ATK bonus (sk3, slot unlocks at Lv61)
    IF v_ahid = 'lucas' THEN
      v_sk3lv := CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3
                      WHEN v_alv>=121 THEN 2 WHEN v_alv>=61  THEN 1 ELSE 0 END;
      IF v_sk3lv > 0 THEN
        v_apa := FLOOR(v_apa::numeric * (1.0 + (ARRAY[0.08,0.14,0.20,0.28])[v_sk3lv]))::int;
      END IF;
    END IF;

    -- Skill levels (mirrors client getSkillLv)
    v_ultlv := CASE WHEN v_alv>=200 THEN 4 WHEN v_alv>=121 THEN 3
                    WHEN v_alv>=61  THEN 2 WHEN v_alv>=1   THEN 1 ELSE 0 END;
    v_sk1lv := CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=161 THEN 3
                    WHEN v_alv>=81  THEN 2 WHEN v_alv>=21  THEN 1 ELSE 0 END;
    v_sk2lv := CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=181 THEN 3
                    WHEN v_alv>=101 THEN 2 WHEN v_alv>=41  THEN 1 ELSE 0 END;

    -- Rage-based skill selection (mirrors client pickSlot with rage)
    v_ss := CASE
      WHEN v_arage >= 100 AND v_ultlv > 0                        THEN 3  -- ult
      WHEN v_arage >= 60  AND NOT v_sk2u[v_ai] AND v_sk2lv > 0  THEN 2  -- sk2
      WHEN v_arage >= 30  AND NOT v_sk1u[v_ai] AND v_sk1lv > 0  THEN 1  -- sk1
      ELSE                                                             0  -- basic
    END;

    -- Fetch authoritative skill from DB
    SELECT name, skill_type, damage_ratio, damage_type, target_type
    INTO   v_sn, v_stype, v_srat, v_sdtype, v_sttype
    FROM   hero_skills
    WHERE  hero_id = v_ahid AND skill_slot = v_ss AND unlock_level <= v_alv
    LIMIT  1;

    IF NOT FOUND THEN  -- fallback to basic
      SELECT name, skill_type, damage_ratio, damage_type, target_type
      INTO   v_sn, v_stype, v_srat, v_sdtype, v_sttype
      FROM   hero_skills WHERE hero_id = v_ahid AND skill_slot = 0 LIMIT 1;
      v_ss := 0;
    END IF;
    IF NOT FOUND THEN
      v_sn:='Attack'; v_stype:='damage'; v_srat:=1.0; v_sdtype:='physical'; v_sttype:='single';
    END IF;

    v_tout := '[]'::jsonb;
    v_tarr := '{}';

    -- ════════════════════════════════════════════════════════════════════════
    -- Targeting + execution
    -- ════════════════════════════════════════════════════════════════════════

    IF v_stype = 'damage' THEN

      -- Build frontmost occupied row of enemy side
      v_farr := '{}';
      <<build_front>>
      FOR j IN REVERSE 2..0 LOOP
        FOR i IN 1..v_n LOOP
          IF v_alivs[i] AND v_sides[i]=v_eside AND v_slots[i]/2 = j THEN
            v_farr := v_farr || i;
          END IF;
        END LOOP;
        EXIT build_front WHEN array_length(v_farr,1) IS NOT NULL;
      END LOOP;

      -- Build backmost occupied row of enemy side
      v_barr := '{}';
      <<build_back>>
      FOR j IN 0..2 LOOP
        FOR i IN 1..v_n LOOP
          IF v_alivs[i] AND v_sides[i]=v_eside AND v_slots[i]/2 = j THEN
            v_barr := v_barr || i;
          END IF;
        END LOOP;
        EXIT build_back WHEN array_length(v_barr,1) IS NOT NULL;
      END LOOP;

      -- Resolve target_type
      CASE v_sttype

        WHEN 'all_enemies' THEN
          FOR i IN 1..v_n LOOP
            IF v_alivs[i] AND v_sides[i]=v_eside THEN v_tarr := v_tarr || i; END IF;
          END LOOP;

        WHEN 'front_aoe' THEN
          IF v_ahid = 'lucas' AND v_ss = 3 THEN
            -- Rampage Surge: 3 hits per front-row enemy; ratio in DB is total (3.0)
            -- Each hit = ratio/3 so damage_ratio per hit = 1.0 at base
            v_srat := v_srat / 3.0;
            FOR j IN 1..COALESCE(array_length(v_farr,1),0) LOOP
              v_tarr := v_tarr || v_farr[j] || v_farr[j] || v_farr[j];
            END LOOP;
          ELSE
            v_tarr := v_farr;  -- Spike Eruption etc: 1 hit per front-row enemy
          END IF;

        WHEN 'all_back' THEN
          v_tarr := v_barr;

        WHEN 'single_back' THEN
          IF array_length(v_barr,1) IS NOT NULL THEN
            v_fridx := v_barr[1 + FLOOR(RANDOM()*array_length(v_barr,1))::int];
          ELSIF array_length(v_farr,1) IS NOT NULL THEN
            v_fridx := v_farr[1 + FLOOR(RANDOM()*array_length(v_farr,1))::int];
          ELSE v_fridx := -1; END IF;
          IF v_fridx > 0 THEN v_tarr := ARRAY[v_fridx]; END IF;

        WHEN 'two_front_random' THEN
          IF array_length(v_farr,1) IS NOT NULL THEN
            v_t1idx := v_farr[1 + FLOOR(RANDOM()*array_length(v_farr,1))::int];
            v_t2idx := v_farr[1 + FLOOR(RANDOM()*array_length(v_farr,1))::int];
            v_tarr  := ARRAY[v_t1idx, v_t2idx];
          END IF;

        WHEN 'two_front_highest_hp' THEN
          v_t1idx := -1; v_t2idx := -1; v_bval := -1;
          FOR j IN 1..COALESCE(array_length(v_farr,1),0) LOOP
            IF v_mhp[v_farr[j]] > v_bval THEN v_bval:=v_mhp[v_farr[j]]; v_t1idx:=v_farr[j]; END IF;
          END LOOP;
          v_bval := -1;
          FOR j IN 1..COALESCE(array_length(v_farr,1),0) LOOP
            IF v_farr[j]<>v_t1idx AND v_mhp[v_farr[j]]>v_bval THEN
              v_bval:=v_mhp[v_farr[j]]; v_t2idx:=v_farr[j]; END IF;
          END LOOP;
          IF v_t1idx>0 AND v_t2idx>0 THEN v_tarr:=ARRAY[v_t1idx,v_t2idx];
          ELSIF v_t1idx>0             THEN v_tarr:=ARRAY[v_t1idx]; END IF;

        WHEN 'highest_speed' THEN
          v_t1idx := -1; v_bval := -1;
          FOR i IN 1..v_n LOOP
            IF v_alivs[i] AND v_sides[i]=v_eside AND v_spd[i]>v_bval THEN
              v_bval:=v_spd[i]; v_t1idx:=i;
            END IF;
          END LOOP;
          IF v_t1idx>0 THEN v_tarr:=ARRAY[v_t1idx]; END IF;

        ELSE -- 'single' and any unknown → frontmost alive enemy
          IF array_length(v_farr,1) IS NOT NULL THEN
            v_tarr := ARRAY[v_farr[1]];
          END IF;
      END CASE;

      -- P.DEF shred for Lucas Armor Rend (sk2)
      IF v_ahid='lucas' AND v_ss=2 AND array_length(v_tarr,1) IS NOT NULL THEN
        v_t1idx := v_tarr[1];
        v_pds[v_t1idx] := LEAST(80, v_pds[v_t1idx] +
          CASE WHEN v_sk2lv>=4 THEN 30 WHEN v_sk2lv>=3 THEN 25
               WHEN v_sk2lv>=2 THEN 20 ELSE 15 END);
      END IF;

      -- Deal damage to each target
      FOR j IN 1..COALESCE(array_length(v_tarr,1),0) LOOP
        v_t1idx := v_tarr[j];
        IF NOT v_alivs[v_t1idx] THEN CONTINUE; END IF;

        -- Effective defence with P.DEF shred
        v_tdef := CASE WHEN v_sdtype='physical'
          THEN GREATEST(0, FLOOR(v_pd[v_t1idx]::numeric*(100-v_pds[v_t1idx])/100))::int
          ELSE v_md[v_t1idx] END;

        v_dmg := GREATEST(1, FLOOR(
          (CASE WHEN v_sdtype='physical' THEN v_apa ELSE v_ama END)::numeric
          * v_srat * 200.0 / (200.0 + v_tdef)
        )::int);

        -- Absorb shield first
        IF v_shld[v_t1idx] > 0 THEN
          IF v_shld[v_t1idx] >= v_dmg THEN
            v_shld[v_t1idx] := v_shld[v_t1idx] - v_dmg; v_dmg := 0;
          ELSE
            v_dmg := v_dmg - v_shld[v_t1idx]; v_shld[v_t1idx] := 0;
          END IF;
        END IF;

        v_nhp  := GREATEST(0, v_chp[v_t1idx] - v_dmg);
        v_died := (v_nhp = 0);
        v_chp[v_t1idx]   := v_nhp;
        IF v_died THEN v_alivs[v_t1idx] := false; END IF;
        -- Target rage +10 when hit (if still alive)
        IF NOT v_died THEN v_rage[v_t1idx] := LEAST(100, v_rage[v_t1idx] + 10); END IF;

        v_tout := v_tout || jsonb_build_array(jsonb_build_object(
          'uid',        v_uids[v_t1idx],
          'dmg',        v_dmg,
          'hp_after',   v_nhp,
          'died',       v_died,
          'rage_after', v_rage[v_t1idx]
        ));
      END LOOP;

      -- Actor rage update after attacking
      IF v_ss = 3 THEN               -- ult: reset rage + reset skill flags
        v_arage := 0;
        v_sk1u[v_ai] := false;
        v_sk2u[v_ai] := false;
      ELSIF v_ss = 1 THEN
        v_sk1u[v_ai] := true;
        v_arage := LEAST(100, v_arage + 5);
      ELSIF v_ss = 2 THEN
        v_sk2u[v_ai] := true;
        v_arage := LEAST(100, v_arage + 5);
      ELSE
        v_arage := LEAST(100, v_arage + 5);
      END IF;

    -- ────────────────────────────────────────────────────────────────────────
    ELSIF v_stype = 'heal' THEN

      v_heal := GREATEST(1, FLOOR(v_ama::numeric * v_srat)::int);

      IF v_sttype = 'all_allies' THEN
        -- Sacred Bloom: heal all allies
        FOR i IN 1..v_n LOOP
          IF v_alivs[i] AND v_sides[i] = v_aside THEN
            v_nhp := LEAST(v_mhp[i], v_chp[i] + v_heal);
            v_chp[i] := v_nhp;
            v_tout := v_tout || jsonb_build_array(jsonb_build_object(
              'uid', v_uids[i], 'heal', v_heal, 'hp_after', v_nhp,
              'died', false, 'rage_after', v_rage[i]
            ));
          END IF;
        END LOOP;
      ELSE
        -- Single: heal ally with lowest HP%
        v_t1idx := v_ai;   -- default: self
        DECLARE v_bestrat numeric := 9999;
        BEGIN
          FOR i IN 1..v_n LOOP
            IF v_alivs[i] AND v_sides[i] = v_aside THEN
              v_adv := v_chp[i]::numeric / GREATEST(1, v_mhp[i]);
              IF v_adv < v_bestrat THEN v_bestrat := v_adv; v_t1idx := i; END IF;
            END IF;
          END LOOP;
        END;
        v_nhp := LEAST(v_mhp[v_t1idx], v_chp[v_t1idx] + v_heal);
        v_chp[v_t1idx] := v_nhp;
        v_tout := v_tout || jsonb_build_array(jsonb_build_object(
          'uid', v_uids[v_t1idx], 'heal', v_heal, 'hp_after', v_nhp,
          'died', false, 'rage_after', v_rage[v_t1idx]
        ));
      END IF;
      v_arage := LEAST(100, v_arage + 5);

    -- ────────────────────────────────────────────────────────────────────────
    ELSIF v_stype = 'buff' THEN

      CASE v_sttype

        WHEN 'hp_shield_self' THEN
          -- RockSlime Rock Shell: shield = own MaxHP × ratio
          v_sval := GREATEST(1, FLOOR(v_mhp[v_ai]::numeric * v_srat)::int);
          v_shld[v_ai] := v_shld[v_ai] + v_sval;
          v_tout := v_tout || jsonb_build_array(jsonb_build_object(
            'uid', v_uids[v_ai], 'shield', v_sval, 'hp_after', v_chp[v_ai],
            'died', false, 'rage_after', v_rage[v_ai]
          ));

        WHEN 'single_ally_hp' THEN
          -- Emma Bulwark Veil: shield ally with highest MaxHP
          v_t1idx := v_ai; v_bval := -1;
          FOR i IN 1..v_n LOOP
            IF v_alivs[i] AND v_sides[i]=v_aside AND v_mhp[i]>v_bval THEN
              v_bval:=v_mhp[i]; v_t1idx:=i;
            END IF;
          END LOOP;
          v_sval := GREATEST(1, FLOOR(v_ama::numeric * v_srat)::int);
          v_shld[v_t1idx] := v_shld[v_t1idx] + v_sval;
          v_tout := v_tout || jsonb_build_array(jsonb_build_object(
            'uid', v_uids[v_t1idx], 'shield', v_sval, 'hp_after', v_chp[v_t1idx],
            'died', false, 'rage_after', v_rage[v_t1idx]
          ));

        WHEN 'all_allies' THEN
          -- Shield all allies
          v_sval := GREATEST(1, FLOOR(v_ama::numeric * v_srat)::int);
          FOR i IN 1..v_n LOOP
            IF v_alivs[i] AND v_sides[i]=v_aside THEN
              v_shld[i] := v_shld[i] + v_sval;
              v_tout := v_tout || jsonb_build_array(jsonb_build_object(
                'uid', v_uids[i], 'shield', v_sval, 'hp_after', v_chp[i],
                'died', false, 'rage_after', v_rage[i]
              ));
            END IF;
          END LOOP;

        ELSE -- self buff
          v_sval := GREATEST(1, FLOOR(v_ama::numeric * v_srat)::int);
          v_shld[v_ai] := v_shld[v_ai] + v_sval;
          v_tout := v_tout || jsonb_build_array(jsonb_build_object(
            'uid', v_uids[v_ai], 'shield', v_sval, 'hp_after', v_chp[v_ai],
            'died', false, 'rage_after', v_rage[v_ai]
          ));
      END CASE;
      v_arage := LEAST(100, v_arage + 5);

    END IF; -- end skill_type branch

    v_rage[v_ai] := v_arage;

    -- ── Record event in battle log ─────────────────────────────────────────
    v_evts := v_evts || jsonb_build_array(jsonb_build_object(
      't',          v_evtidx,
      'type',       CASE WHEN v_ss=3 THEN 'ult' WHEN v_ss=0 THEN 'atk' ELSE 'skill' END,
      'actor',      v_uids[v_ai],
      'hero_id',    v_ahid,
      'skill_slot', v_ss,
      'skill_name', COALESCE(v_sn, 'Attack'),
      'skill_type', COALESCE(v_stype, 'damage'),
      'skill_dtype',COALESCE(v_sdtype, 'physical'),
      'targets',    v_tout,
      'rage_after', v_arage
    ));
    v_evtidx := v_evtidx + 1;

  END LOOP; -- main_loop

  -- Determine winner
  v_ahero := 0; v_aenemy := 0;
  FOR i IN 1..v_n LOOP
    IF v_alivs[i] THEN
      IF v_sides[i]='hero'  THEN v_ahero  := v_ahero  + 1; END IF;
      IF v_sides[i]='enemy' THEN v_aenemy := v_aenemy + 1; END IF;
    END IF;
  END LOOP;
  v_winner := CASE WHEN v_aenemy=0 THEN 'hero' WHEN v_ahero=0 THEN 'enemy' ELSE 'enemy' END;

  -- ── Build final combatants output ──────────────────────────────────────────
  FOR i IN 1..v_n LOOP
    v_couts := v_couts || jsonb_build_array(jsonb_build_object(
      'uid',        v_uids[i],
      'hero_id',    v_hids[i],
      'name',       v_names[i],
      'side',       v_sides[i],
      'slot_index', v_slots[i],
      'level',      v_lvs[i],
      'hero_type',  v_htyps[i],
      'max_hp',     v_mhp[i],
      'current_hp', v_chp[i],
      'p_atk',      v_pa[i],
      'm_atk',      v_ma[i],
      'p_def',      v_pd[i],
      'm_def',      v_md[i],
      'speed',      v_spd[i],
      'is_alive',   v_alivs[i]
    ));
  END LOOP;

  -- ── Grant rewards for hero victory ─────────────────────────────────────────
  IF v_winner = 'hero' THEN
    SELECT * INTO v_stagr FROM stage_definitions WHERE stage_id = p_stage_id;
    IF FOUND THEN
      UPDATE profiles SET
        gold     = gold     + v_stagr.gold_reward,
        gems     = gems     + v_stagr.gem_reward,
        xp       = xp       + v_stagr.exp_reward,
        hero_exp = hero_exp + v_stagr.hero_exp_reward
      WHERE id = v_uid;

      v_rews := jsonb_build_object(
        'gold',     v_stagr.gold_reward,
        'gems',     v_stagr.gem_reward,
        'exp',      v_stagr.exp_reward,
        'hero_exp', v_stagr.hero_exp_reward
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'winner',        v_winner,
    'rewards',       v_rews,
    'events',        v_evts,
    'combatants',    v_couts,
    'initial_hp',    v_ihp,
    'initial_maxhp', v_imhp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_simulate_battle(text, jsonb) TO authenticated;