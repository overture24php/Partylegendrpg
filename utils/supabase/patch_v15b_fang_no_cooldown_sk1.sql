-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v15b — Fang SK1 No-Cooldown + Correct Skill Priority                ║
-- ╠══════════════════════════════════════════════════════════════════════════════╣
-- ║  FIX: Fang SK1 (Twin Slash) fires every turn. Priority: ULT > SK2 > SK1.  ║
-- ║  Previously: sk1_used flag prevented reuse; SK1 came before SK2 in order.  ║
-- ║  Run AFTER patch_v15. Contains ONLY the rpc_resolve_battle_turn update.    ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                             ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

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
  v_fang_stacks   int;
  v_stack_bonus   numeric;
  v_new_patk      int;
  v_clover_uid    text;
  v_clover_matk   int;
  v_clover_lv     int;
  v_bloom_ratio   numeric;
  v_bloom_heal    int;
  v_bloom_new_hp  int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;

  SELECT * INTO v_session FROM battle_sessions
  WHERE id=p_session_id AND user_id=v_uid AND ended_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','session/not-found-or-ended'); END IF;

  v_state      := v_session.state;
  v_combatants := v_state->'combatants';
  v_ap         := COALESCE(v_state->'ap','{}'::jsonb);

  v_actor_idx := -1;
  FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
    IF v_combatants->i->>'uid'=p_actor_uid THEN
      v_actor:=v_combatants->i; v_actor_idx:=i; EXIT;
    END IF;
  END LOOP;
  IF v_actor_idx=-1 THEN RETURN jsonb_build_object('error','actor/not-found'); END IF;
  IF NOT (v_actor->>'is_alive')::bool THEN RETURN jsonb_build_object('error','actor/dead'); END IF;

  v_elapsed := GREATEST(50,LEAST(p_elapsed_ms::bigint,2000));
  v_ap_val  := COALESCE((v_ap->>p_actor_uid)::bigint,0)+(v_actor->>'speed')::bigint*v_elapsed/1000;
  IF v_ap_val<v_ap_req THEN
    RETURN jsonb_build_object('error','actor/ap-not-ready','ap',v_ap_val,'required',v_ap_req);
  END IF;
  v_ap := jsonb_set(v_ap,ARRAY[p_actor_uid],to_jsonb(v_ap_val-v_ap_req));

  v_actor_side := v_actor->>'side';
  v_actor_ti   := COALESCE((v_actor->>'turn_index')::int,0);
  v_actor_lv   := COALESCE((v_actor->>'level')::int,1);
  v_actor_patk := COALESCE((v_actor->>'p_atk')::int,0);
  v_actor_matk := COALESCE((v_actor->>'m_atk')::int,0);
  v_actor_pdef := COALESCE((v_actor->>'p_def')::int,0);
  v_actor_maxhp:= COALESCE((v_actor->>'max_hp')::int,1);
  v_hero_id    := v_actor->>'hero_id';
  v_front_col  := CASE WHEN v_actor_side='hero' THEN 0 ELSE 1 END;
  v_rage       := COALESCE((v_actor->>'rage')::int,0);
  v_sk1_used   := COALESCE((v_actor->>'sk1_used')::boolean,false);
  v_sk2_used   := COALESCE((v_actor->>'sk2_used')::boolean,false);

  -- ── Skill selection ──────────────────────────────────────────────────────
  -- Fang: ULT > SK2(when available) > SK1(NO cooldown, fires every eligible turn)
  -- Others: ULT > SK1(once/cycle) > SK2(once/cycle) > Basic
  IF v_hero_id='fang' THEN
    IF v_rage>=100 THEN
      v_slot:=4;
    ELSIF NOT v_sk2_used THEN
      SELECT 1 INTO v_tmp_int FROM hero_skills hs
      WHERE hs.hero_id='fang' AND hs.skill_slot=2 AND hs.unlock_level<=v_actor_lv LIMIT 1;
      v_slot:=CASE WHEN FOUND THEN 2 ELSE 1 END;
    ELSE
      v_slot:=1; -- SK1 always available (no cooldown)
    END IF;
  ELSE
    IF v_rage>=100 THEN v_slot:=4;
    ELSIF NOT v_sk1_used THEN v_slot:=1;
    ELSIF NOT v_sk2_used THEN v_slot:=2;
    ELSE v_slot:=0;
    END IF;
  END IF;

  -- Load skill
  SELECT hs.skill_type,hs.damage_ratio,hs.damage_type,hs.target_type,hs.unlock_level,hs.name
  INTO   v_skill_type,v_skill_ratio,v_skill_dtype,v_skill_ttype,v_skill_unlock,v_skill_name
  FROM   hero_skills hs
  WHERE  hs.hero_id=v_hero_id AND hs.skill_slot=v_slot AND hs.unlock_level<=v_actor_lv
  ORDER BY hs.unlock_level DESC LIMIT 1;

  IF NOT FOUND THEN
    v_slot:=0;
    SELECT hs.skill_type,hs.damage_ratio,hs.damage_type,hs.target_type,hs.unlock_level,hs.name
    INTO   v_skill_type,v_skill_ratio,v_skill_dtype,v_skill_ttype,v_skill_unlock,v_skill_name
    FROM   hero_skills hs WHERE hs.hero_id=v_hero_id AND hs.skill_slot=0
    ORDER BY hs.unlock_level DESC LIMIT 1;
    IF NOT FOUND THEN
      v_skill_type:='damage'; v_skill_ratio:=1.0;
      v_skill_dtype:='physical'; v_skill_ttype:='single'; v_skill_name:='Attack';
    END IF;
  END IF;

  IF v_skill_type='passive' THEN
    v_slot:=0;
    SELECT hs.skill_type,hs.damage_ratio,hs.damage_type,hs.target_type,hs.unlock_level,hs.name
    INTO   v_skill_type,v_skill_ratio,v_skill_dtype,v_skill_ttype,v_skill_unlock,v_skill_name
    FROM   hero_skills hs WHERE hs.hero_id=v_hero_id AND hs.skill_slot=0
    ORDER BY hs.unlock_level DESC LIMIT 1;
    IF NOT FOUND THEN
      v_skill_type:='damage'; v_skill_ratio:=1.0;
      v_skill_dtype:='physical'; v_skill_ttype:='single'; v_skill_name:='Attack';
    END IF;
  END IF;

  -- Build alive arrays
  v_alive_enemy:='{}'; v_alive_ally:='{}'; v_ally_hp:='{}'; v_ally_maxhp:='{}';
  FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
    IF (v_combatants->i->>'is_alive')::bool AND v_combatants->i->>'uid'<>p_actor_uid THEN
      IF v_combatants->i->>'side'<>v_actor_side THEN
        v_alive_enemy:=v_alive_enemy||(v_combatants->i->>'uid');
      ELSE
        v_alive_ally :=v_alive_ally ||(v_combatants->i->>'uid');
        v_ally_hp    :=v_ally_hp    ||(v_combatants->i->>'current_hp')::numeric;
        v_ally_maxhp :=v_ally_maxhp ||(v_combatants->i->>'max_hp')::numeric;
      END IF;
    END IF;
  END LOOP;

  IF v_skill_type='damage' THEN

    -- ── twin_slash (Fang SK1): 2 hits same target ─────────────────────────
    IF v_skill_ttype='twin_slash' THEN
      v_front_targets:='{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i%2=v_front_col THEN v_front_targets:=v_front_targets||v_uid_i; END IF;
      END LOOP;
      v_target_pool:=CASE WHEN array_length(v_front_targets,1)>0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_slot:=-1; v_best_uid:=NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i>v_best_slot THEN v_best_slot:=v_slot_num_i; v_best_uid:=v_uid_i; END IF;
      END LOOP;
      v_dmg_targets:=CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid,v_best_uid] ELSE '{}'::text[] END;

    -- ── single_lowest_hp (Fang ULT): execute ×3 if <35% HP ──────────────
    ELSIF v_skill_ttype='single_lowest_hp' THEN
      v_best_ratio:=9999; v_best_uid:=NULL;
      FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
        IF (v_combatants->i->>'is_alive')::bool AND v_combatants->i->>'side'<>v_actor_side THEN
          v_ratio:=(v_combatants->i->>'current_hp')::numeric/GREATEST(1,(v_combatants->i->>'max_hp')::numeric);
          IF v_ratio<v_best_ratio THEN v_best_ratio:=v_ratio; v_best_uid:=v_combatants->i->>'uid'; END IF;
        END IF;
      END LOOP;
      IF v_best_uid IS NOT NULL AND v_best_ratio<0.35 THEN v_skill_ratio:=v_skill_ratio*3; END IF;
      v_dmg_targets:=CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;

    ELSIF v_skill_ttype='front_aoe' THEN
      v_front_targets:='{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i%2=v_front_col THEN v_front_targets:=v_front_targets||v_uid_i; END IF;
      END LOOP;
      v_dmg_targets:=CASE WHEN array_length(v_front_targets,1)>0 THEN v_front_targets ELSE v_alive_enemy END;

    ELSIF v_skill_ttype='all_enemies' THEN
      v_dmg_targets:=v_alive_enemy;

    ELSIF v_skill_ttype='single_back' THEN
      v_front_targets:='{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i%2<>v_front_col THEN v_front_targets:=v_front_targets||v_uid_i; END IF;
      END LOOP;
      v_target_pool:=CASE WHEN array_length(v_front_targets,1)>0 THEN v_front_targets ELSE v_alive_enemy END;
      IF array_length(v_target_pool,1)>0 THEN
        v_best_uid:=v_target_pool[1+floor(random()*array_length(v_target_pool,1))::int];
        v_dmg_targets:=ARRAY[v_best_uid];
      END IF;

    ELSIF v_skill_ttype='all_back' THEN
      v_front_targets:='{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i%2<>v_front_col THEN v_front_targets:=v_front_targets||v_uid_i; END IF;
      END LOOP;
      v_dmg_targets:=CASE WHEN array_length(v_front_targets,1)>0 THEN v_front_targets ELSE v_alive_enemy END;

    ELSIF v_skill_ttype='two_front_random' THEN
      v_front_targets:='{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i%2=v_front_col THEN v_front_targets:=v_front_targets||v_uid_i; END IF;
      END LOOP;
      v_target_pool:=CASE WHEN array_length(v_front_targets,1)>0 THEN v_front_targets ELSE v_alive_enemy END;
      IF array_length(v_target_pool,1)>=2 THEN
        SELECT array_agg(u) INTO v_dmg_targets FROM (SELECT unnest(v_target_pool) AS u ORDER BY random() LIMIT 2) sub;
      ELSE v_dmg_targets:=v_target_pool; END IF;
      IF array_length(v_dmg_targets,1)=1 THEN v_dmg_targets:=ARRAY[v_dmg_targets[1],v_dmg_targets[1]]; END IF;

    ELSIF v_skill_ttype='two_front_highest_hp' THEN
      v_front_targets:='{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i%2=v_front_col THEN v_front_targets:=v_front_targets||v_uid_i; END IF;
      END LOOP;
      v_target_pool:=CASE WHEN array_length(v_front_targets,1)>0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_maxhp:=-1; v_best_uid:=NULL; v_tmp_val:=-1; v_tmp_uid:=NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
          IF v_combatants->i->>'uid'=v_uid_i THEN
            v_tmp_int:=(v_combatants->i->>'max_hp')::int;
            IF v_tmp_int>v_best_maxhp THEN v_tmp_uid:=v_best_uid; v_best_uid:=v_uid_i; v_tmp_val:=v_best_maxhp; v_best_maxhp:=v_tmp_int;
            ELSIF v_tmp_int>v_tmp_val THEN v_tmp_uid:=v_uid_i; v_tmp_val:=v_tmp_int; END IF;
            EXIT;
          END IF;
        END LOOP;
      END LOOP;
      v_dmg_targets:='{}';
      IF v_best_uid IS NOT NULL THEN v_dmg_targets:=v_dmg_targets||v_best_uid; END IF;
      IF v_tmp_uid  IS NOT NULL THEN v_dmg_targets:=v_dmg_targets||v_tmp_uid;  END IF;

    ELSIF v_skill_ttype='highest_speed' THEN
      v_best_slot:=-1; v_best_uid:=NULL;
      FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
        IF (v_combatants->i->>'is_alive')::bool AND v_combatants->i->>'side'<>v_actor_side THEN
          v_tmp_int:=COALESCE((v_combatants->i->>'speed')::int,0);
          IF v_tmp_int>v_best_slot THEN v_best_slot:=v_tmp_int; v_best_uid:=v_combatants->i->>'uid'; END IF;
        END IF;
      END LOOP;
      v_dmg_targets:=CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;

    ELSE
      v_front_targets:='{}';
      FOREACH v_uid_i IN ARRAY v_alive_enemy LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i%2=v_front_col THEN v_front_targets:=v_front_targets||v_uid_i; END IF;
      END LOOP;
      v_target_pool:=CASE WHEN array_length(v_front_targets,1)>0 THEN v_front_targets ELSE v_alive_enemy END;
      v_best_slot:=-1; v_best_uid:=NULL;
      FOREACH v_uid_i IN ARRAY v_target_pool LOOP
        v_slot_num_i:=(regexp_match(v_uid_i,'(\d+)$'))[1]::int;
        IF v_slot_num_i>v_best_slot THEN v_best_slot:=v_slot_num_i; v_best_uid:=v_uid_i; END IF;
      END LOOP;
      v_dmg_targets:=CASE WHEN v_best_uid IS NOT NULL THEN ARRAY[v_best_uid] ELSE '{}'::text[] END;
    END IF;

    FOREACH v_tgt IN ARRAY COALESCE(v_dmg_targets,'{}') LOOP
      FOR j IN 0..jsonb_array_length(v_combatants)-1 LOOP
        IF v_combatants->j->>'uid'=v_tgt AND (v_combatants->j->>'is_alive')::bool THEN
          v_target_def:=CASE WHEN v_skill_dtype='physical' THEN (v_combatants->j->>'p_def')::int ELSE (v_combatants->j->>'m_def')::int END;
          v_dmg:=GREATEST(1,FLOOR(
            (CASE WHEN v_skill_dtype='physical' THEN v_actor_patk ELSE v_actor_matk END)::numeric
            *v_skill_ratio*200.0/(200.0+v_target_def))::int);
          v_new_hp:=GREATEST(0,(v_combatants->j->>'current_hp')::int-v_dmg);
          v_died:=v_new_hp=0;
          v_combatants:=jsonb_set(v_combatants,ARRAY[j::text,'current_hp'],to_jsonb(v_new_hp));
          IF v_died THEN
            v_combatants:=jsonb_set(v_combatants,ARRAY[j::text,'is_alive'],'false'::jsonb);
            -- Fang Hunter's Mark: on-kill P.ATK stack (max 3)
            IF v_hero_id='fang' THEN
              v_fang_stacks:=COALESCE((v_actor->>'fang_kill_stacks')::int,0);
              IF v_fang_stacks<3 THEN
                v_fang_stacks:=v_fang_stacks+1;
                SELECT hs.damage_ratio INTO v_stack_bonus FROM hero_skills hs
                WHERE hs.hero_id='fang' AND hs.skill_slot=3 AND hs.unlock_level<=v_actor_lv
                ORDER BY hs.unlock_level DESC LIMIT 1;
                v_stack_bonus:=COALESCE(v_stack_bonus,0.28);
                v_new_patk:=GREATEST(v_actor_patk,ROUND(v_actor_patk*(1+v_stack_bonus))::int);
                v_actor_patk:=v_new_patk;
                v_combatants:=jsonb_set(v_combatants,ARRAY[v_actor_idx::text,'p_atk'],to_jsonb(v_new_patk));
                v_combatants:=jsonb_set(v_combatants,ARRAY[v_actor_idx::text,'fang_kill_stacks'],to_jsonb(v_fang_stacks));
                v_actor:=v_combatants->v_actor_idx;
              END IF;
            END IF;
          END IF;
          -- Clover Life Bloom: 35% reactive heal when ally takes damage
          IF v_actor_side<>(v_combatants->j->>'side') AND NOT v_died THEN
            v_clover_uid:=NULL;
            FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
              IF (v_combatants->i->>'hero_id')='clover'
                 AND (v_combatants->i->>'side')=(v_combatants->j->>'side')
                 AND (v_combatants->i->>'is_alive')::bool THEN
                v_clover_uid:=v_combatants->i->>'uid';
                v_clover_matk:=COALESCE((v_combatants->i->>'m_atk')::int,0);
                v_clover_lv:=COALESCE((v_combatants->i->>'level')::int,1);
                EXIT;
              END IF;
            END LOOP;
            IF v_clover_uid IS NOT NULL THEN
              SELECT hs.damage_ratio INTO v_bloom_ratio FROM hero_skills hs
              WHERE hs.hero_id='clover' AND hs.skill_slot=3 AND hs.unlock_level<=v_clover_lv
              ORDER BY hs.unlock_level DESC LIMIT 1;
              IF FOUND AND random()<0.35 THEN
                v_bloom_heal:=GREATEST(1,FLOOR(v_clover_matk::numeric*COALESCE(v_bloom_ratio,0.40))::int);
                v_bloom_new_hp:=LEAST((v_combatants->j->>'max_hp')::int,v_new_hp+v_bloom_heal);
                v_combatants:=jsonb_set(v_combatants,ARRAY[j::text,'current_hp'],to_jsonb(v_bloom_new_hp));
                v_new_hp:=v_bloom_new_hp;
                v_targets:=v_targets||jsonb_build_array(jsonb_build_object(
                  'target_uid',v_tgt,'damage',0,'heal',v_bloom_heal,'type','life_bloom','died',false));
              END IF;
            END IF;
          END IF;
          v_targets:=v_targets||jsonb_build_array(jsonb_build_object(
            'target_uid',v_tgt,'damage',v_dmg,'heal',0,'type','dmg','died',v_died));
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

  ELSIF v_skill_type='heal' THEN
    v_heal:=GREATEST(1,FLOOR(v_actor_matk::numeric*v_skill_ratio)::int);

    IF v_skill_ttype='all_allies' THEN
      v_heal_targets:='{}';
      FOREACH v_uid_i IN ARRAY (v_alive_ally||p_actor_uid) LOOP
        FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
          IF v_combatants->i->>'uid'=v_uid_i AND (v_combatants->i->>'is_alive')::bool THEN
            v_heal_targets:=v_heal_targets||v_uid_i; EXIT;
          END IF;
        END LOOP;
      END LOOP;
    ELSIF array_length(v_alive_ally,1) IS NULL THEN
      v_heal_targets:=ARRAY[p_actor_uid];
    ELSE
      -- single / single_ally_hp / any other: ally with lowest HP% incl. self
      v_best_ally:=1; v_best_ratio:=9999;
      FOR i IN 1..array_length(v_alive_ally,1) LOOP
        v_ratio:=v_ally_hp[i]/GREATEST(1,v_ally_maxhp[i]);
        IF v_ratio<v_best_ratio THEN v_best_ratio:=v_ratio; v_best_ally:=i; END IF;
      END LOOP;
      FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
        IF v_combatants->i->>'uid'=p_actor_uid THEN
          v_ratio:=(v_combatants->i->>'current_hp')::numeric/GREATEST(1,(v_combatants->i->>'max_hp')::numeric);
          IF v_ratio<v_best_ratio THEN v_heal_targets:=ARRAY[p_actor_uid];
          ELSE v_heal_targets:=ARRAY[v_alive_ally[v_best_ally]]; END IF;
          EXIT;
        END IF;
      END LOOP;
      IF v_heal_targets IS NULL THEN v_heal_targets:=ARRAY[v_alive_ally[v_best_ally]]; END IF;
    END IF;

    FOREACH v_tgt IN ARRAY COALESCE(v_heal_targets,'{}') LOOP
      FOR j IN 0..jsonb_array_length(v_combatants)-1 LOOP
        IF v_combatants->j->>'uid'=v_tgt AND (v_combatants->j->>'is_alive')::bool THEN
          v_max_hp:=(v_combatants->j->>'max_hp')::int;
          v_new_hp:=LEAST(v_max_hp,(v_combatants->j->>'current_hp')::int+v_heal);
          v_combatants:=jsonb_set(v_combatants,ARRAY[j::text,'current_hp'],to_jsonb(v_new_hp));
          v_targets:=v_targets||jsonb_build_array(jsonb_build_object(
            'target_uid',v_tgt,'damage',0,'heal',v_heal,'type','heal','died',false));
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

  ELSIF v_skill_type='buff' THEN
    IF v_skill_ttype='hp_shield_self' THEN
      v_shield_val:=GREATEST(1,FLOOR(v_actor_maxhp::numeric*v_skill_ratio)::int);
      v_buff_targets:=ARRAY[p_actor_uid];
    ELSIF v_skill_ttype='single_ally_maxhp' THEN
      v_shield_val:=GREATEST(1,FLOOR(v_actor_matk::numeric*v_skill_ratio)::int);
      v_best_maxhp:=0; v_best_uid:=p_actor_uid;
      FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
        IF v_combatants->i->>'side'=v_actor_side AND (v_combatants->i->>'is_alive')::bool THEN
          v_tmp_val:=(v_combatants->i->>'max_hp')::int;
          IF v_tmp_val>v_best_maxhp THEN v_best_maxhp:=v_tmp_val; v_best_uid:=v_combatants->i->>'uid'; END IF;
        END IF;
      END LOOP;
      v_buff_targets:=ARRAY[v_best_uid];
    ELSIF v_skill_ttype='all_allies' THEN
      v_shield_val:=GREATEST(1,FLOOR(v_actor_matk::numeric*v_skill_ratio)::int);
      v_buff_targets:=v_alive_ally||p_actor_uid;
    ELSE
      v_shield_val:=GREATEST(1,FLOOR(v_actor_matk::numeric*v_skill_ratio)::int);
      v_buff_targets:=ARRAY[p_actor_uid];
    END IF;

    FOREACH v_tgt IN ARRAY COALESCE(v_buff_targets,'{}') LOOP
      v_targets:=v_targets||jsonb_build_array(jsonb_build_object(
        'target_uid',v_tgt,'damage',0,'heal',0,'shield',v_shield_val,'type','shield','died',false));
    END LOOP;
  END IF;

  -- ── Post-action rage + skill-used flags ──────────────────────────────────
  IF v_slot=4 THEN
    v_rage_after:=0; v_sk1_used:=false; v_sk2_used:=false;
  ELSIF v_slot=1 THEN
    v_rage_after:=LEAST(100,v_rage+15);
    -- Fang SK1: NO cooldown — do NOT mark sk1_used=true
    IF v_hero_id<>'fang' THEN v_sk1_used:=true; END IF;
  ELSIF v_slot=2 THEN
    v_rage_after:=LEAST(100,v_rage+15);
    v_sk2_used:=true;
  ELSE
    v_rage_after:=LEAST(100,v_rage+5);
  END IF;
  v_combatants:=jsonb_set(v_combatants,ARRAY[v_actor_idx::text,'rage'],    to_jsonb(v_rage_after));
  v_combatants:=jsonb_set(v_combatants,ARRAY[v_actor_idx::text,'sk1_used'],to_jsonb(v_sk1_used));
  v_combatants:=jsonb_set(v_combatants,ARRAY[v_actor_idx::text,'sk2_used'],to_jsonb(v_sk2_used));
  v_combatants:=jsonb_set(v_combatants,ARRAY[v_actor_idx::text,'turn_index'],to_jsonb(v_actor_ti+1));

  FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
    IF (v_combatants->i->>'is_alive')::bool THEN
      IF v_combatants->i->>'side'='hero'  THEN v_heroes_alive :=v_heroes_alive +1; END IF;
      IF v_combatants->i->>'side'='enemy' THEN v_enemies_alive:=v_enemies_alive+1; END IF;
    END IF;
  END LOOP;
  IF v_enemies_alive=0 THEN v_winner:='hero';  END IF;
  IF v_heroes_alive =0 THEN v_winner:='enemy'; END IF;

  FOR i IN 0..jsonb_array_length(v_combatants)-1 LOOP
    v_uid_i    :=v_combatants->i->>'uid';
    v_hp_map   :=v_hp_map   ||jsonb_build_object(v_uid_i,(v_combatants->i->>'current_hp')::int);
    v_alive_map:=v_alive_map||jsonb_build_object(v_uid_i,(v_combatants->i->>'is_alive')::bool);
    v_rage_map :=v_rage_map ||jsonb_build_object(v_uid_i,COALESCE((v_combatants->i->>'rage')::int,0));
    v_skill_flags:=v_skill_flags||jsonb_build_object(v_uid_i,jsonb_build_object(
      'sk1_used',COALESCE((v_combatants->i->>'sk1_used')::bool,false),
      'sk2_used',COALESCE((v_combatants->i->>'sk2_used')::bool,false)));
  END LOOP;

  UPDATE battle_sessions SET
    state=jsonb_build_object('combatants',v_combatants,'ap',v_ap,'winner',v_winner,'ended',v_winner IS NOT NULL),
    ended_at=CASE WHEN v_winner IS NOT NULL THEN now() ELSE NULL END
  WHERE id=p_session_id;

  RETURN jsonb_build_object(
    'targets',v_targets,'hp_state',v_hp_map,'alive_state',v_alive_map,
    'rage_state',v_rage_map,'skill_flags',v_skill_flags,
    'winner',v_winner,'skill_name',v_skill_name,'skill_slot',v_slot);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error',SQLERRM||' ['||SQLSTATE||']');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_resolve_battle_turn(uuid, text, int) TO authenticated;
