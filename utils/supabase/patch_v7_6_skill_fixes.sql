-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7.6 — Skill data fixes + hp_shield_maxhp_ally target type         ║
-- ║                                                                              ║
-- ║  BUG 1 — Emma SK2 inconsistent shield target:                              ║
-- ║    Old: target_type='single_ally_maxhp' → shield calc used v_amatk (wrong) ║
-- ║    New: target_type='hp_shield_maxhp_ally' → targets ally with highest     ║
-- ║         MaxHP AND shield value = ratio × that ally's maxHP                 ║
-- ║                                                                              ║
-- ║  BUG 3 — Slime SK2 fires at levels < 21:                                  ║
-- ║    unlock_level for SK2 (slot 2) and SK1 (slot 1) of all slimes fixed.    ║
-- ║    Matches hero skill unlock system: SK1=21, SK2=41, ULT=1                ║
-- ║                                                                              ║
-- ║  BUG 4 — Rock slime SK2 heals instead of shields:                         ║
-- ║    skill_type corrected to 'buff' (was likely 'heal')                      ║
-- ║    target_type set to 'hp_shield_self'                                     ║
-- ║    damage_ratio = 0.12 (12% of own maxHP as shield)                       ║
-- ║                                                                              ║
-- ║  Run: Supabase Dashboard → SQL Editor → Run                                ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── BUG 1: Emma SK2 → dedicated hp_shield_maxhp_ally type ────────────────────
UPDATE public.hero_skills
SET target_type = 'hp_shield_maxhp_ally'
WHERE hero_id = 'emma' AND skill_slot = 2;

-- ── BUG 3: Fix unlock_level for all slime skills ──────────────────────────────
-- slot 0 (basic): unlock at lv 1
-- slot 1 (SK1):   unlock at lv 21
-- slot 2 (SK2):   unlock at lv 41
-- slot 3 (ULT):   unlock at lv 1

UPDATE public.hero_skills
SET unlock_level = CASE skill_slot
  WHEN 0 THEN 1
  WHEN 1 THEN 21
  WHEN 2 THEN 41
  WHEN 3 THEN 1
  ELSE unlock_level
END
WHERE hero_id IN ('rock_slime','acid_slime','water_slime');

-- ── BUG 4: Rock slime SK2 — shield not heal ───────────────────────────────────
-- Self-shield of 12% own maxHP. skill_type must be 'buff', not 'heal'.
UPDATE public.hero_skills
SET skill_type   = 'buff',
    target_type  = 'hp_shield_self',
    damage_type  = NULL,
    damage_ratio = 0.12
WHERE hero_id = 'rock_slime' AND skill_slot = 2;

-- ── Full function replacement with hp_shield_maxhp_ally support ───────────────
DROP FUNCTION IF EXISTS rpc_simulate_battle(text,text);
DROP FUNCTION IF EXISTS rpc_simulate_battle(text,jsonb);

CREATE OR REPLACE FUNCTION rpc_simulate_battle(
  p_stage_id     TEXT,
  p_hero_entries JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID;
  v_units      JSONB    := '{}'::JSONB;
  v_skills     JSONB    := '[]'::JSONB;
  v_events     JSONB    := '[]'::JSONB;
  v_inh        JSONB    := '{}'::JSONB;
  v_inmh       JSONB    := '{}'::JSONB;
  v_atb        BIGINT   := 1000000;
  v_iter       INT      := 0;
  v_eidx       INT      := 0;
  v_rec        RECORD;
  v_i          INT;
  v_he         JSONB;
  v_uuid_str   TEXT;
  v_hp         INT;
  v_lv         INT;
  v_auid       TEXT;
  v_actor      JSONB;
  v_ahid       TEXT;
  v_aside      TEXT;
  v_alv        INT;
  v_arage      INT;
  v_sk1cd      INT;
  v_sk2cd      INT;
  v_apatk      INT;
  v_amatk      INT;
  v_apds       INT;
  v_eside      TEXT;
  v_alside     TEXT;
  v_front_col  INT;
  v_back_col   INT;
  v_slot       INT;
  v_sk         JSONB;
  v_skname     TEXT;
  v_sktype     TEXT;
  v_skratio    NUMERIC;
  v_skdtype    TEXT;
  v_skttype    TEXT;
  v_tuids      TEXT[];
  v_tuid       TEXT;
  v_tj         JSONB;
  v_tgt        JSONB;
  v_thp        INT;
  v_tmhp       INT;
  v_trage      INT;
  v_tshield    INT;
  v_tpds       INT;
  v_tdied      BOOLEAN;
  v_batk       INT;
  v_edef       INT;
  v_dmg        INT;
  v_heal       INT;
  v_shv        INT;
  v_madv       BIGINT;
  v_adv        BIGINT;
  v_k          TEXT;
  v_u          JSONB;
  v_llv3       INT;
  v_halive     BOOLEAN;
  v_ealive     BOOLEAN;
  v_winner     TEXT;
  v_rewards    JSONB;
  v_combj      JSONB;
  v_snum       INT;
  v_sdef       RECORD;
  v_expanded   TEXT[];
BEGIN

  IF jsonb_typeof(p_hero_entries)='string' THEN
    BEGIN p_hero_entries:=(p_hero_entries#>>'{}')::JSONB;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('error','hero_entries/invalid-json: '||SQLERRM); END;
  END IF;
  IF jsonb_typeof(p_hero_entries)<>'array' THEN
    RETURN jsonb_build_object('error','hero_entries/must-be-array');
  END IF;

  v_uid:=auth.uid();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','auth/unauthorized'); END IF;

  FOR v_i IN 0..jsonb_array_length(p_hero_entries)-1 LOOP
    v_he:=p_hero_entries->v_i;
    v_uuid_str:='hero-'||(v_he->>'slot_index');
    SELECT ph.level,hd.name,hd.hero_type,
      hd.base_hp   +(ph.level-1)*hd.growth_hp    AS hp,
      hd.base_p_atk+(ph.level-1)*hd.growth_p_atk AS p_atk,
      hd.base_m_atk+(ph.level-1)*hd.growth_m_atk AS m_atk,
      hd.base_p_def+(ph.level-1)*hd.growth_p_def AS p_def,
      hd.base_m_def+(ph.level-1)*hd.growth_m_def AS m_def,
      hd.base_speed AS speed
    INTO v_rec FROM player_heroes ph
    JOIN hero_definitions hd ON hd.hero_id=ph.hero_id
    WHERE ph.user_id=v_uid AND ph.hero_id=(v_he->>'hero_id');
    IF NOT FOUND THEN RETURN jsonb_build_object('error','hero/not-owned:'||(v_he->>'hero_id')); END IF;
    v_units:=v_units||jsonb_build_object(v_uuid_str,jsonb_build_object(
      'uid',v_uuid_str,'hero_id',v_he->>'hero_id','name',v_rec.name,
      'side','hero','slot',(v_he->>'slot_index')::INT,
      'level',v_rec.level,'hero_type',v_rec.hero_type,
      'max_hp',v_rec.hp,'hp',v_rec.hp,
      'p_atk',v_rec.p_atk,'m_atk',v_rec.m_atk,
      'p_def',v_rec.p_def,'m_def',v_rec.m_def,'speed',v_rec.speed,
      'ap',0,'rage',0,'sk1_cd',0,'sk2_cd',0,'shield',0,'pds',0,'alive',true));
    v_inh :=v_inh ||jsonb_build_object(v_uuid_str,v_rec.hp);
    v_inmh:=v_inmh||jsonb_build_object(v_uuid_str,v_rec.hp);
  END LOOP;

  FOR v_rec IN
    SELECT se.enemy_hero_id,se.enemy_level,se.slot_position,
      hd.name,hd.hero_type,
      hd.base_hp,hd.growth_hp,hd.base_p_atk,hd.growth_p_atk,
      hd.base_m_atk,hd.growth_m_atk,hd.base_p_def,hd.growth_p_def,
      hd.base_m_def,hd.growth_m_def,hd.base_speed
    FROM stage_enemies se
    JOIN hero_definitions hd ON hd.hero_id=se.enemy_hero_id
    WHERE se.stage_id=p_stage_id ORDER BY se.order_index
  LOOP
    v_uuid_str:='enemy-'||v_rec.slot_position;
    v_lv:=v_rec.enemy_level;
    v_hp:=v_rec.base_hp+(v_lv-1)*v_rec.growth_hp;
    v_units:=v_units||jsonb_build_object(v_uuid_str,jsonb_build_object(
      'uid',v_uuid_str,'hero_id',v_rec.enemy_hero_id,'name',v_rec.name,
      'side','enemy','slot',v_rec.slot_position,
      'level',v_lv,'hero_type',v_rec.hero_type,
      'max_hp',v_hp,'hp',v_hp,
      'p_atk',v_rec.base_p_atk+(v_lv-1)*v_rec.growth_p_atk,
      'm_atk',v_rec.base_m_atk+(v_lv-1)*v_rec.growth_m_atk,
      'p_def',v_rec.base_p_def+(v_lv-1)*v_rec.growth_p_def,
      'm_def',v_rec.base_m_def+(v_lv-1)*v_rec.growth_m_def,
      'speed',v_rec.base_speed,
      'ap',0,'rage',0,'sk1_cd',0,'sk2_cd',0,'shield',0,'pds',0,'alive',true));
    v_inh :=v_inh ||jsonb_build_object(v_uuid_str,v_hp);
    v_inmh:=v_inmh||jsonb_build_object(v_uuid_str,v_hp);
  END LOOP;

  IF v_units='{}'::JSONB THEN RETURN jsonb_build_object('error','battle/no-combatants'); END IF;

  FOR v_rec IN
    SELECT hs.hero_id,hs.skill_slot,hs.name,hs.skill_type,
           hs.damage_ratio,hs.damage_type,hs.target_type,hs.unlock_level
    FROM hero_skills hs
    WHERE hs.hero_id IN (SELECT DISTINCT (v_units->k)->>'hero_id' FROM jsonb_object_keys(v_units) AS t(k))
  LOOP
    v_skills:=v_skills||jsonb_build_array(jsonb_build_object(
      'hero_id',v_rec.hero_id,'slot',v_rec.skill_slot,'name',v_rec.name,
      'type',v_rec.skill_type,'ratio',v_rec.damage_ratio,
      'dtype',v_rec.damage_type,'ttype',v_rec.target_type,'unlock_lv',v_rec.unlock_level));
  END LOOP;

  <<outer>>
  LOOP
    v_iter:=v_iter+1;
    EXIT outer WHEN v_iter>5000 OR v_eidx>=1500;
    IF NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v_units) AS t(k) WHERE (v_units->k)->>'side'='hero'  AND ((v_units->k)->>'alive')::BOOLEAN) THEN EXIT outer; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v_units) AS t(k) WHERE (v_units->k)->>'side'='enemy' AND ((v_units->k)->>'alive')::BOOLEAN) THEN EXIT outer; END IF;

    v_madv:=NULL;
    FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
      v_u:=v_units->v_k;
      IF ((v_u->>'alive')::BOOLEAN) AND ((v_u->>'ap')::BIGINT<v_atb) THEN
        v_adv:=((v_atb-(v_u->>'ap')::BIGINT)+(v_u->>'speed')::BIGINT-1)/(v_u->>'speed')::BIGINT;
        IF v_madv IS NULL OR v_adv<v_madv THEN v_madv:=v_adv; END IF;
      END IF;
    END LOOP;
    IF v_madv IS NOT NULL AND v_madv>0 THEN
      FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
        IF ((v_units->v_k->>'alive')::BOOLEAN) THEN
          v_units:=jsonb_set(v_units,ARRAY[v_k,'ap'],
            to_jsonb((v_units->v_k->>'ap')::BIGINT+(v_units->v_k->>'speed')::BIGINT*v_madv));
        END IF;
      END LOOP;
    END IF;

    <<inner>>
    LOOP
      EXIT outer WHEN NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v_units) AS t(k) WHERE (v_units->k)->>'side'='hero'  AND ((v_units->k)->>'alive')::BOOLEAN);
      EXIT outer WHEN NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v_units) AS t(k) WHERE (v_units->k)->>'side'='enemy' AND ((v_units->k)->>'alive')::BOOLEAN);

      v_auid:=NULL;
      FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
        v_u:=v_units->v_k;
        IF ((v_u->>'alive')::BOOLEAN) AND ((v_u->>'ap')::BIGINT>=v_atb) THEN
          IF v_auid IS NULL
            OR (v_u->>'ap')::BIGINT>(v_units->v_auid->>'ap')::BIGINT
            OR ((v_u->>'ap')::BIGINT=(v_units->v_auid->>'ap')::BIGINT AND (v_u->>'speed')::INT>(v_units->v_auid->>'speed')::INT)
          THEN v_auid:=v_k; END IF;
        END IF;
      END LOOP;
      EXIT inner WHEN v_auid IS NULL;

      v_units:=jsonb_set(v_units,ARRAY[v_auid,'ap'],to_jsonb((v_units->v_auid->>'ap')::BIGINT-v_atb));

      v_actor :=v_units->v_auid;
      v_ahid  :=v_actor->>'hero_id';
      v_aside :=v_actor->>'side';
      v_alv   :=(v_actor->>'level')::INT;
      v_arage :=(v_actor->>'rage')::INT;
      v_apatk :=(v_actor->>'p_atk')::INT;
      v_amatk :=(v_actor->>'m_atk')::INT;
      v_apds  :=(v_actor->>'pds')::INT;
      v_eside :=CASE WHEN v_aside='hero' THEN 'enemy' ELSE 'hero' END;
      v_alside:=v_aside;

      v_front_col := CASE v_eside WHEN 'hero' THEN 1 ELSE 0 END;
      v_back_col  := 1 - v_front_col;

      -- Cooldown decrement at start of this unit's action
      v_sk1cd := GREATEST(0, (v_actor->>'sk1_cd')::INT - 1);
      v_sk2cd := GREATEST(0, (v_actor->>'sk2_cd')::INT - 1);
      v_units := jsonb_set(v_units, ARRAY[v_auid,'sk1_cd'], to_jsonb(v_sk1cd));
      v_units := jsonb_set(v_units, ARRAY[v_auid,'sk2_cd'], to_jsonb(v_sk2cd));

      -- Skill selection: ULT(rage≥100) > SK1(cd=0) > SK2(cd=0) > Basic
      v_slot:=0; v_sk:=NULL;
      IF v_arage>=100 THEN
        SELECT s INTO v_sk FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s->>'hero_id')=v_ahid AND (s->>'slot')::INT=3 AND (s->>'unlock_lv')::INT<=v_alv
        ORDER BY (s->>'unlock_lv')::INT DESC LIMIT 1;
        IF FOUND AND v_sk IS NOT NULL THEN v_slot:=3; END IF;
      END IF;
      IF v_sk IS NULL AND v_sk1cd=0 THEN
        SELECT s INTO v_sk FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s->>'hero_id')=v_ahid AND (s->>'slot')::INT=1 AND (s->>'unlock_lv')::INT<=v_alv
        ORDER BY (s->>'unlock_lv')::INT DESC LIMIT 1;
        IF FOUND AND v_sk IS NOT NULL THEN v_slot:=1; END IF;
      END IF;
      IF v_sk IS NULL AND v_sk2cd=0 THEN
        SELECT s INTO v_sk FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s->>'hero_id')=v_ahid AND (s->>'slot')::INT=2 AND (s->>'unlock_lv')::INT<=v_alv
        ORDER BY (s->>'unlock_lv')::INT DESC LIMIT 1;
        IF FOUND AND v_sk IS NOT NULL THEN v_slot:=2; END IF;
      END IF;
      IF v_sk IS NULL THEN
        SELECT s INTO v_sk FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s->>'hero_id')=v_ahid AND (s->>'slot')::INT=0 AND (s->>'unlock_lv')::INT<=v_alv
        ORDER BY (s->>'unlock_lv')::INT DESC LIMIT 1;
        v_slot:=0;
      END IF;
      IF v_sk IS NULL THEN
        v_sk:='{"name":"Attack","type":"damage","ratio":1.0,"dtype":"physical","ttype":"single","unlock_lv":1}'::JSONB;
        v_slot:=0;
      END IF;

      v_skname :=v_sk->>'name';
      v_sktype :=v_sk->>'type';
      v_skratio:=(v_sk->>'ratio')::NUMERIC;
      v_skdtype:=v_sk->>'dtype';
      v_skttype:=v_sk->>'ttype';

      -- Lucas SK2: armor-rend debuff on front target (pre-hit)
      IF v_ahid='lucas' AND v_slot=2 THEN
        v_llv3:=CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=181 THEN 3 WHEN v_alv>=101 THEN 2 WHEN v_alv>=41 THEN 1 ELSE 0 END;
        IF v_llv3>0 THEN
          SELECT k INTO v_tuid FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
            AND ((v_units->k)->>'slot')::INT % 2 = v_front_col
          ORDER BY ((v_units->k)->>'slot')::INT LIMIT 1;
          IF NOT FOUND OR v_tuid IS NULL THEN
            SELECT k INTO v_tuid FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
            ORDER BY ((v_units->k)->>'slot')::INT LIMIT 1;
          END IF;
          IF v_tuid IS NOT NULL THEN
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'pds'],
              to_jsonb(LEAST(80,(v_units->v_tuid->>'pds')::INT+
                CASE v_llv3 WHEN 4 THEN 30 WHEN 3 THEN 25 WHEN 2 THEN 20 ELSE 15 END)));
          END IF;
        END IF;
      END IF;

      -- ══════════════════════════════════════════════════════════════════════
      -- TARGET RESOLUTION
      -- Front/back via slot%2 (v_front_col/v_back_col). All branches have fallback.
      -- ══════════════════════════════════════════════════════════════════════
      v_tuids:=NULL;

      CASE

        WHEN v_sktype='heal' AND v_skttype='single' THEN
          SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_alside AND ((v_units->k)->>'alive')::BOOLEAN
          ORDER BY ((v_units->k)->>'hp')::NUMERIC/GREATEST(1,((v_units->k)->>'max_hp')::NUMERIC) LIMIT 1;

        WHEN v_skttype IN('self','hp_shield_self') THEN
          v_tuids:=ARRAY[v_auid];

        WHEN v_skttype='all_enemies' THEN
          SELECT array_agg(k) INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN;

        WHEN v_skttype='front_aoe' THEN
          SELECT array_agg(k) INTO v_tuids
          FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_eside
            AND ((v_units->k)->>'alive')::BOOLEAN
            AND ((v_units->k)->>'slot')::INT % 2 = v_front_col;
          IF v_tuids IS NULL OR array_length(v_tuids,1)=0 THEN
            SELECT array_agg(k) INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN;
          END IF;

        WHEN v_skttype='all_back' THEN
          SELECT array_agg(k) INTO v_tuids
          FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_eside
            AND ((v_units->k)->>'alive')::BOOLEAN
            AND ((v_units->k)->>'slot')::INT % 2 = v_back_col;
          IF v_tuids IS NULL OR array_length(v_tuids,1)=0 THEN
            SELECT array_agg(k) INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN;
          END IF;

        WHEN v_skttype='single_back' THEN
          SELECT ARRAY[k] INTO v_tuids
          FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_eside
            AND ((v_units->k)->>'alive')::BOOLEAN
            AND ((v_units->k)->>'slot')::INT % 2 = v_back_col
          ORDER BY random() LIMIT 1;
          IF v_tuids IS NULL THEN
            SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
            ORDER BY random() LIMIT 1;
          END IF;

        WHEN v_skttype='two_front_random' THEN
          SELECT array_agg(k) INTO v_tuids
          FROM (SELECT k FROM jsonb_object_keys(v_units) AS t(k)
                WHERE (v_units->k)->>'side'=v_eside
                  AND ((v_units->k)->>'alive')::BOOLEAN
                  AND ((v_units->k)->>'slot')::INT % 2 = v_front_col
                ORDER BY random() LIMIT 2) sub;
          IF v_tuids IS NOT NULL AND array_length(v_tuids,1)=1 THEN
            v_tuids:=ARRAY[v_tuids[1],v_tuids[1]];
          END IF;
          IF v_tuids IS NULL OR array_length(v_tuids,1)=0 THEN
            SELECT array_agg(k) INTO v_tuids
            FROM (SELECT k FROM jsonb_object_keys(v_units) AS t(k)
                  WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
                  ORDER BY random() LIMIT 2) sub;
          END IF;

        WHEN v_skttype='two_front_highest_hp' THEN
          SELECT array_agg(k) INTO v_tuids
          FROM (SELECT k FROM jsonb_object_keys(v_units) AS t(k)
                WHERE (v_units->k)->>'side'=v_eside
                  AND ((v_units->k)->>'alive')::BOOLEAN
                  AND ((v_units->k)->>'slot')::INT % 2 = v_front_col
                ORDER BY ((v_units->k)->>'max_hp')::INT DESC LIMIT 2) sub;
          IF v_tuids IS NULL OR array_length(v_tuids,1)=0 THEN
            SELECT array_agg(k) INTO v_tuids
            FROM (SELECT k FROM jsonb_object_keys(v_units) AS t(k)
                  WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
                  ORDER BY ((v_units->k)->>'max_hp')::INT DESC LIMIT 2) sub;
          END IF;

        WHEN v_skttype='highest_speed' THEN
          SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
          ORDER BY ((v_units->k)->>'speed')::INT DESC LIMIT 1;

        WHEN v_skttype='all_allies' THEN
          SELECT array_agg(k) INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_alside AND ((v_units->k)->>'alive')::BOOLEAN;

        WHEN v_skttype='single_ally_hp' THEN
          SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_alside AND ((v_units->k)->>'alive')::BOOLEAN
          ORDER BY ((v_units->k)->>'hp')::NUMERIC/GREATEST(1,((v_units->k)->>'max_hp')::NUMERIC) LIMIT 1;

        WHEN v_skttype='single_ally_maxhp' THEN
          SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_alside AND ((v_units->k)->>'alive')::BOOLEAN
          ORDER BY ((v_units->k)->>'max_hp')::INT DESC LIMIT 1;

        -- ── Emma SK2: shield = ratio × TARGET's maxHP, given to highest-maxHP ally ──
        -- Using dedicated type so the shield calc below can use v_tmhp (target's maxHP)
        -- instead of v_amatk (caster's magic atk) — that was the root cause of bug #1.
        WHEN v_skttype='hp_shield_maxhp_ally' THEN
          SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units->k)->>'side'=v_alside AND ((v_units->k)->>'alive')::BOOLEAN
          ORDER BY ((v_units->k)->>'max_hp')::INT DESC LIMIT 1;

        ELSE
          IF v_sktype='buff' THEN
            v_tuids:=ARRAY[v_auid];
          ELSE
            SELECT ARRAY[k] INTO v_tuids
            FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside
              AND ((v_units->k)->>'alive')::BOOLEAN
              AND ((v_units->k)->>'slot')::INT % 2 = v_front_col
            ORDER BY ((v_units->k)->>'slot')::INT LIMIT 1;
            IF v_tuids IS NULL THEN
              SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
              WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
              ORDER BY ((v_units->k)->>'slot')::INT LIMIT 1;
            END IF;
          END IF;

      END CASE;

      IF v_tuids IS NULL THEN v_tuids:=ARRAY[]::TEXT[]; END IF;

      -- Lucas ULT: 3 hits × 100% per front-row target
      IF v_ahid='lucas' AND v_slot=3 AND array_length(v_tuids,1)>0 THEN
        v_expanded := ARRAY[]::TEXT[];
        FOREACH v_tuid IN ARRAY v_tuids LOOP
          v_expanded := v_expanded || ARRAY[v_tuid, v_tuid, v_tuid];
        END LOOP;
        v_tuids := v_expanded;
      END IF;

      -- Apply to targets
      v_tj:='[]'::JSONB;
      FOREACH v_tuid IN ARRAY COALESCE(v_tuids,ARRAY[]::TEXT[]) LOOP
        CONTINUE WHEN NOT COALESCE(((v_units->v_tuid)->>'alive')::BOOLEAN,FALSE);
        v_tgt    :=v_units->v_tuid;
        v_thp    :=(v_tgt->>'hp')::INT;    v_tmhp  :=(v_tgt->>'max_hp')::INT;
        v_trage  :=(v_tgt->>'rage')::INT;  v_tshield:=(v_tgt->>'shield')::INT;
        v_tpds   :=(v_tgt->>'pds')::INT;   v_tdied :=FALSE;

        IF v_sktype='damage' THEN
          v_batk:=CASE v_skdtype WHEN 'physical' THEN v_apatk ELSE v_amatk END;
          IF v_ahid='lucas' AND v_skdtype='physical' THEN
            v_llv3:=CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 WHEN v_alv>=61 THEN 1 ELSE 0 END;
            IF v_llv3>0 THEN v_batk:=round(v_batk*(1+CASE v_llv3 WHEN 1 THEN 0.08 WHEN 2 THEN 0.14 WHEN 3 THEN 0.20 ELSE 0.28 END)); END IF;
          END IF;
          v_edef:=CASE v_skdtype WHEN 'physical' THEN GREATEST(0,floor((v_tgt->>'p_def')::INT*(100-v_tpds)/100.0)) ELSE (v_tgt->>'m_def')::INT END;
          v_dmg:=GREATEST(1,floor(v_batk::NUMERIC*v_skratio*200.0/(200+v_edef)));
          IF v_tshield>0 THEN
            IF v_tshield>=v_dmg THEN v_tshield:=v_tshield-v_dmg; v_dmg:=0;
            ELSE v_dmg:=v_dmg-v_tshield; v_tshield:=0; END IF;
          END IF;
          v_thp:=GREATEST(0,v_thp-v_dmg);
          IF v_thp<=0 THEN
            v_tdied:=TRUE; v_thp:=0; v_tshield:=0;
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'alive'],'false'::JSONB);
          ELSE v_trage:=LEAST(100,v_trage+10); END IF;
          v_units:=jsonb_set(v_units,ARRAY[v_tuid,'hp'],to_jsonb(v_thp));
          v_units:=jsonb_set(v_units,ARRAY[v_tuid,'shield'],to_jsonb(v_tshield));
          v_units:=jsonb_set(v_units,ARRAY[v_tuid,'rage'],to_jsonb(v_trage));
          v_tj:=v_tj||jsonb_build_array(jsonb_build_object(
            'uid',v_tuid,'dmg',v_dmg,'hp_after',v_thp,'died',v_tdied,
            'rage_after',v_trage,'shield_after',v_tshield));

        ELSIF v_sktype='heal' THEN
          v_heal:=GREATEST(1,floor(v_amatk::NUMERIC*v_skratio));
          v_thp:=LEAST(v_tmhp,v_thp+v_heal);
          v_units:=jsonb_set(v_units,ARRAY[v_tuid,'hp'],to_jsonb(v_thp));
          v_tj:=v_tj||jsonb_build_array(jsonb_build_object(
            'uid',v_tuid,'heal',v_heal,'hp_after',v_thp,'died',false,
            'rage_after',v_trage,'shield_after',v_tshield));

        ELSE -- buff / shield grant
          -- hp_shield_self, self, hp_shield_maxhp_ally → shield = ratio × TARGET's maxHP
          -- all other buff types → shield = ratio × caster's M.ATK
          IF v_skttype IN('hp_shield_self','self','hp_shield_maxhp_ally') THEN
            v_shv:=GREATEST(1,floor(v_tmhp::NUMERIC*v_skratio));
          ELSE
            v_shv:=GREATEST(1,floor(v_amatk::NUMERIC*v_skratio));
          END IF;
          v_tshield:=v_tshield+v_shv;
          v_units:=jsonb_set(v_units,ARRAY[v_tuid,'shield'],to_jsonb(v_tshield));
          v_tj:=v_tj||jsonb_build_array(jsonb_build_object(
            'uid',v_tuid,'shield',v_shv,'hp_after',v_thp,'died',false,
            'rage_after',v_trage,'shield_after',v_tshield));
        END IF;
      END LOOP;

      -- Post-action: rage gain + cooldown set
      IF v_slot=3 THEN
        v_arage:=0;
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'rage'],to_jsonb(0));
      ELSIF v_slot=1 THEN
        v_arage:=LEAST(100,v_arage+5);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'rage'],to_jsonb(v_arage));
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'sk1_cd'],to_jsonb(2));
      ELSIF v_slot=2 THEN
        v_arage:=LEAST(100,v_arage+5);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'rage'],to_jsonb(v_arage));
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'sk2_cd'],to_jsonb(4));
      ELSE
        v_arage:=LEAST(100,v_arage+5);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'rage'],to_jsonb(v_arage));
      END IF;

      v_events:=v_events||jsonb_build_array(jsonb_build_object(
        't',v_eidx,
        'type',CASE v_slot WHEN 3 THEN 'ult' WHEN 0 THEN 'atk' ELSE 'skill' END,
        'actor',v_auid,'hero_id',v_ahid,'skill_slot',v_slot,
        'skill_name',v_skname,'skill_type',v_sktype,'skill_dtype',v_skdtype,
        'targets',v_tj,'rage_after',v_arage));
      v_eidx:=v_eidx+1;
      EXIT outer WHEN v_eidx>=1500;

    END LOOP; -- inner
  END LOOP;   -- outer

  v_halive:=EXISTS(SELECT 1 FROM jsonb_object_keys(v_units) AS t(k) WHERE (v_units->k)->>'side'='hero'  AND ((v_units->k)->>'alive')::BOOLEAN);
  v_ealive:=EXISTS(SELECT 1 FROM jsonb_object_keys(v_units) AS t(k) WHERE (v_units->k)->>'side'='enemy' AND ((v_units->k)->>'alive')::BOOLEAN);
  v_winner:=CASE WHEN v_halive AND NOT v_ealive THEN 'hero' ELSE 'enemy' END;

  v_rewards:='null'::JSONB;
  IF v_winner='hero' THEN
    SELECT gold_reward,gem_reward,exp_reward,hero_exp_reward INTO v_sdef
    FROM stage_definitions WHERE stage_id=p_stage_id;
    IF FOUND THEN
      BEGIN v_snum:=split_part(p_stage_id,'-',2)::INT; EXCEPTION WHEN OTHERS THEN v_snum:=0; END;
      UPDATE profiles SET
        gold      = gold     + COALESCE(v_sdef.gold_reward,0),
        gems      = gems     + COALESCE(v_sdef.gem_reward,0),
        xp        = xp       + COALESCE(v_sdef.exp_reward,0),
        hero_exp  = hero_exp + COALESCE(v_sdef.hero_exp_reward,0),
        chapter1_progress = CASE WHEN split_part(p_stage_id,'-',1)='1'
          THEN GREATEST(chapter1_progress,v_snum) ELSE chapter1_progress END
      WHERE id=v_uid;
      v_rewards:=jsonb_build_object(
        'gold',    COALESCE(v_sdef.gold_reward,0),
        'gems',    COALESCE(v_sdef.gem_reward,0),
        'exp',     COALESCE(v_sdef.exp_reward,0),
        'hero_exp',COALESCE(v_sdef.hero_exp_reward,0));
    END IF;
  END IF;

  v_combj:='[]'::JSONB;
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
    v_u:=v_units->v_k;
    v_combj:=v_combj||jsonb_build_array(jsonb_build_object(
      'uid',v_k,'hero_id',v_u->>'hero_id','name',v_u->>'name','side',v_u->>'side',
      'slot_index',(v_u->>'slot')::INT,'level',(v_u->>'level')::INT,'hero_type',v_u->>'hero_type',
      'max_hp',(v_u->>'max_hp')::INT,'current_hp',(v_u->>'hp')::INT,
      'p_atk',(v_u->>'p_atk')::INT,'m_atk',(v_u->>'m_atk')::INT,
      'p_def',(v_u->>'p_def')::INT,'m_def',(v_u->>'m_def')::INT,
      'speed',(v_u->>'speed')::INT,'is_alive',(v_u->>'alive')::BOOLEAN));
  END LOOP;

  RETURN jsonb_build_object(
    'winner',v_winner,'rewards',v_rewards,'events',v_events,
    'combatants',v_combj,'initial_hp',v_inh,'initial_maxhp',v_inmh);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error',SQLERRM||' ['||SQLSTATE||']');
END;
$$;

REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) TO authenticated;
