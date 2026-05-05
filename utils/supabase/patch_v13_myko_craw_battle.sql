-- ═══════════════════════════════════════════════════════════════════════════
-- PATCH v13 — Add Myko (Tank C) + Fix Craw Skills + Full Battle Engine Update
-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: hero_definitions — INSERT Myko
-- STEP 2: hero_skills     — DELETE/INSERT Myko + Craw (fix target_types)
-- STEP 3: gacha pool      — Add myko to pool C
-- STEP 4: rpc_simulate_battle — Full replacement with:
--           • Wound system      (Craw SK1 30% / ULT 100%)
--           • Blind system      (Craw SK2 100%, miss check per turn)
--           • Cornered Rat      (Craw passive: HP<40% → pAtk/speed boost once)
--           • Spore Toxin DoT   (Myko ULT 3-turn magical DoT)
--           • Fungal Resilience (Myko passive: heal on being hit, scales pDef)
--           • pDef-based damage (Myko SK2/ULT use own p_def as attack stat)
--           • single_random / single_highest_patk target types (Craw SK1/SK2)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── STEP 1: Myko hero_definitions ──────────────────────────────────────────
-- Stats: Tank C, personality {pAtk:0.85, pDef:1.15, speed:0.90}
-- base: hp=1360 p_atk=43 m_atk=50 p_def=156 m_def=136 speed=50
-- growth (×0.07): hp=95 p_atk=3 m_atk=4 p_def=11 m_def=10
INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
('myko','Myko','common','Tank',1,
 1360, 43, 50, 156, 136, 50,
 95, 3, 4, 11, 10,
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005026/ChatGPT_Image_May_6_2026_01_01_00_AM_bhjzhr.png',
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005010/ChatGPT_Image_May_6_2026_12_58_49_AM_wgnb4t.png',
 true)
ON CONFLICT (hero_id) DO UPDATE SET
  name=EXCLUDED.name, rarity=EXCLUDED.rarity, hero_type=EXCLUDED.hero_type,
  base_hp=EXCLUDED.base_hp, base_p_atk=EXCLUDED.base_p_atk,
  base_m_atk=EXCLUDED.base_m_atk, base_p_def=EXCLUDED.base_p_def,
  base_m_def=EXCLUDED.base_m_def, base_speed=EXCLUDED.base_speed,
  growth_hp=EXCLUDED.growth_hp, growth_p_atk=EXCLUDED.growth_p_atk,
  growth_m_atk=EXCLUDED.growth_m_atk, growth_p_def=EXCLUDED.growth_p_def,
  growth_m_def=EXCLUDED.growth_m_def,
  sprite_url=EXCLUDED.sprite_url, illust_url=EXCLUDED.illust_url,
  is_playable=EXCLUDED.is_playable;

-- ─── STEP 2a: Myko hero_skills ───────────────────────────────────────────────
DELETE FROM public.hero_skills WHERE hero_id='myko';
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  (gen_random_uuid(),'myko',0,'Shield Bash',  'damage',1.00,'physical','single',         1),
  (gen_random_uuid(),'myko',1,'Iron Casing',  'buff',  0.12,'none',    'hp_shield_self', 1),
  (gen_random_uuid(),'myko',2,'Spore Slam',   'damage',0.90,'physical','front_aoe',     21),
  -- slot 3 = Fungal Resilience passive — hardcoded in function, no DB row needed
  (gen_random_uuid(),'myko',4,'Spore Eruption','damage',0.85,'magical', 'all_enemies',  61);

-- ─── STEP 2b: Craw hero_skills — fix target_types + ensure slot 4 ULT ───────
DELETE FROM public.hero_skills WHERE hero_id='craw';
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  (gen_random_uuid(),'craw',0,'Quick Shot',       'damage',0.90,'physical','single',              1),
  (gen_random_uuid(),'craw',1,'Crude Shot',        'damage',1.15,'physical','single_random',       1),
  (gen_random_uuid(),'craw',2,'Blind Arrow',       'damage',1.30,'physical','single_highest_patk',21),
  -- slot 3 = Cornered Rat passive — hardcoded in function
  (gen_random_uuid(),'craw',4,'Skypiercer Volley', 'damage',0.72,'physical','all_enemies',        61);

-- ─── STEP 3: gacha pool — add myko ───────────────────────────────────────────
-- Pool C was: rock_slime, acid_slime, water_slime, gorr, craw
-- Pool C now: + myko
DROP FUNCTION IF EXISTS rpc_gacha_pull(text, int);
CREATE OR REPLACE FUNCTION rpc_gacha_pull(
  p_pool   TEXT,
  p_count  INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID    := auth.uid();
  v_cost        INT;
  v_balance     INT;
  v_results     JSONB   := '[]'::JSONB;
  v_roll        FLOAT;
  v_rarity      TEXT;
  v_hero_id     TEXT;
  v_hero_name   TEXT;
  v_has_hero    BOOLEAN;
  v_shards      INT;
  v_pool_c      TEXT[]  := ARRAY['rock_slime','acid_slime','water_slime','gorr','craw','myko'];
  v_pool_b      TEXT[]  := ARRAY['emma','lucas'];
  i             INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;
  IF p_count NOT IN (1,10) THEN
    RETURN jsonb_build_object('error','invalid_count');
  END IF;
  IF p_pool NOT IN ('normal','epic','superior') THEN
    RETURN jsonb_build_object('error','invalid_pool');
  END IF;
  IF p_pool IN ('epic','superior') THEN
    RETURN jsonb_build_object('error','pool_unavailable');
  END IF;

  v_cost := CASE
    WHEN p_pool='normal'   AND p_count=1  THEN 10
    WHEN p_pool='normal'   AND p_count=10 THEN 90
    WHEN p_pool='epic'     AND p_count=1  THEN 30
    WHEN p_pool='epic'     AND p_count=10 THEN 270
    WHEN p_pool='superior' AND p_count=1  THEN 80
    WHEN p_pool='superior' AND p_count=10 THEN 720
    ELSE 9999
  END;

  SELECT gems INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error','profile_not_found');
  END IF;
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('error','insufficient_gems','have',v_balance,'need',v_cost);
  END IF;

  UPDATE profiles SET gems = gems - v_cost WHERE id = v_uid;

  FOR i IN 1..p_count LOOP
    v_roll    := random() * 100;
    v_hero_id := NULL;
    v_shards  := 0;

    IF p_pool = 'normal' THEN
      v_rarity := CASE
        WHEN v_roll <  80 THEN 'C'
        WHEN v_roll <  95 THEN 'B'
        ELSE                    'A'
      END;
    END IF;

    IF v_rarity = 'C' THEN
      SELECT unnest INTO v_hero_id FROM unnest(v_pool_c) ORDER BY random() LIMIT 1;
    ELSIF v_rarity = 'B' THEN
      SELECT unnest INTO v_hero_id FROM unnest(v_pool_b) ORDER BY random() LIMIT 1;
    END IF;

    IF v_hero_id IS NULL THEN
      INSERT INTO hero_shards(user_id, hero_id, amount)
      VALUES(v_uid, '__mystery_' || v_rarity || '__', 20)
      ON CONFLICT(user_id, hero_id) DO UPDATE
        SET amount = hero_shards.amount + 20;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'hero_id', NULL, 'hero_name', 'Mystery ' || v_rarity,
        'rarity', v_rarity, 'is_new', false, 'shards', 20, 'mystery', true
      ));
      CONTINUE;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM player_heroes WHERE user_id = v_uid AND hero_id = v_hero_id
    ) INTO v_has_hero;

    SELECT name INTO v_hero_name FROM hero_definitions WHERE hero_id = v_hero_id;

    IF NOT v_has_hero THEN
      INSERT INTO player_heroes(user_id, hero_id, stars, level, xp, hp, obtained_at)
      VALUES(v_uid, v_hero_id, 1, 1, 0, 100, NOW())
      ON CONFLICT(user_id, hero_id) DO NOTHING;
    ELSE
      v_shards := CASE v_rarity
        WHEN 'C'  THEN 5
        WHEN 'B'  THEN 10
        WHEN 'A'  THEN 20
        WHEN 'S'  THEN 40
        WHEN 'SS' THEN 80
        ELSE 5
      END;
      INSERT INTO hero_shards(user_id, hero_id, amount)
      VALUES(v_uid, v_hero_id, v_shards)
      ON CONFLICT(user_id, hero_id) DO UPDATE
        SET amount = hero_shards.amount + v_shards;
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'hero_id',   v_hero_id,
      'hero_name', COALESCE(v_hero_name, v_hero_id),
      'rarity',    v_rarity,
      'is_new',    NOT v_has_hero,
      'shards',    v_shards,
      'mystery',   false
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'results', v_results, 'cost', v_cost, 'currency', 'gems');
END;
$$;

-- ─── STEP 4: rpc_simulate_battle — full replacement ──────────────────────────
DROP FUNCTION IF EXISTS rpc_simulate_battle(text,text);
DROP FUNCTION IF EXISTS rpc_simulate_battle(text,jsonb);

CREATE OR REPLACE FUNCTION public.rpc_simulate_battle(p_stage_id text, p_hero_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Gorr Blood Feast passive (Bleed tick + lifesteal)
  v_gorr_lv3   INT;
  v_dmg_total  INT;
  v_bleed_k    TEXT;
  v_bleed_u    JSONB;
  v_bleed_dm   INT;
  v_bleed_hl   INT;
  v_bleed_hp   INT;
  v_bleed_died BOOLEAN;
  v_bleed_tj   JSONB;
  -- Craw Cornered Rat
  v_craw_lv3   INT;
  v_craw_cr_now BOOLEAN;
  -- Myko Fungal Resilience + Spore Toxin
  v_myko_lv3   INT;
  v_myko_heal  INT;
  v_myko_pdef  INT;
  v_spore_dm   INT;
  v_spore_hp   INT;
  v_spore_died BOOLEAN;
  v_spore_tj   JSONB;
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

  -- Load hero units
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
      'ap',0,'rage',0,'sk1_cd',0,'sk2_cd',0,'shield',0,'pds',0,'alive',true,'lucas_stacks',0,
      'bleed_dmg',0,'bleed_turns',0,
      'wound_turns',0,'wound_bonus',0,'blind_turns',0,'blind_miss',0));
    v_inh :=v_inh ||jsonb_build_object(v_uuid_str,v_rec.hp);
    v_inmh:=v_inmh||jsonb_build_object(v_uuid_str,v_rec.hp);
  END LOOP;

  -- Load enemy units
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
      'ap',0,'rage',0,'sk1_cd',0,'sk2_cd',0,'shield',0,'pds',0,'alive',true,'lucas_stacks',0,
      'bleed_dmg',0,'bleed_turns',0,
      'wound_turns',0,'wound_bonus',0,'blind_turns',0,'blind_miss',0));
    v_inh :=v_inh ||jsonb_build_object(v_uuid_str,v_hp);
    v_inmh:=v_inmh||jsonb_build_object(v_uuid_str,v_hp);
  END LOOP;

  IF v_units='{}'::JSONB THEN RETURN jsonb_build_object('error','battle/no-combatants'); END IF;

  -- ── PASSIVE APPLICATION: pre-battle stat boosts ──────────────────────────────
  -- Emma Blessed Ward: Pass 1
  v_shv:=0;
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
    v_u:=v_units->v_k;
    IF (v_u->>'hero_id')='emma' AND (v_u->>'side')='hero' AND ((v_u->>'alive')::BOOLEAN) THEN
      v_llv3:=CASE WHEN (v_u->>'level')::INT>=240 THEN 4
                   WHEN (v_u->>'level')::INT>=201 THEN 3
                   WHEN (v_u->>'level')::INT>=121 THEN 2
                   WHEN (v_u->>'level')::INT>=41  THEN 1 ELSE 0 END;
      IF v_llv3>0 THEN
        v_shv:=GREATEST(1,floor((v_u->>'m_atk')::NUMERIC*
          CASE v_llv3 WHEN 1 THEN 0.90 WHEN 2 THEN 1.15 WHEN 3 THEN 1.45 ELSE 1.85 END)::INT);
      END IF;
      EXIT;
    END IF;
  END LOOP;
  IF v_shv>0 THEN
    FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
      IF (v_units->v_k)->>'side'='hero' AND ((v_units->v_k->>'alive')::BOOLEAN) THEN
        v_units:=jsonb_set(v_units,ARRAY[v_k,'shield'],
          to_jsonb((v_units->v_k->>'shield')::INT+v_shv));
      END IF;
    END LOOP;
  END IF;
  -- Per-unit stat passive: Rock/Acid/Water Slime
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
    v_u:=v_units->v_k;
    IF NOT ((v_u->>'alive')::BOOLEAN) THEN CONTINUE; END IF;
    v_llv3:=CASE WHEN (v_u->>'level')::INT>=240 THEN 4
                 WHEN (v_u->>'level')::INT>=201 THEN 3
                 WHEN (v_u->>'level')::INT>=121 THEN 2
                 WHEN (v_u->>'level')::INT>=41  THEN 1 ELSE 0 END;
    IF v_llv3=0 THEN CONTINUE; END IF;
    IF (v_u->>'hero_id')='rock_slime' THEN
      v_units:=jsonb_set(v_units,ARRAY[v_k,'p_def'],
        to_jsonb(GREATEST(1,round((v_units->v_k->>'p_def')::NUMERIC*
          (1+CASE v_llv3 WHEN 1 THEN 0.15 WHEN 2 THEN 0.20 WHEN 3 THEN 0.25 ELSE 0.35 END))::INT)));
    END IF;
    IF (v_u->>'hero_id')='acid_slime' THEN
      v_units:=jsonb_set(v_units,ARRAY[v_k,'p_atk'],
        to_jsonb(GREATEST(1,round((v_units->v_k->>'p_atk')::NUMERIC*
          (1+CASE v_llv3 WHEN 1 THEN 0.08 WHEN 2 THEN 0.14 WHEN 3 THEN 0.20 ELSE 0.28 END))::INT)));
    END IF;
    IF (v_u->>'hero_id')='water_slime' THEN
      v_units:=jsonb_set(v_units,ARRAY[v_k,'m_atk'],
        to_jsonb(GREATEST(1,round((v_units->v_k->>'m_atk')::NUMERIC*
          (1+CASE v_llv3 WHEN 1 THEN 0.08 WHEN 2 THEN 0.14 WHEN 3 THEN 0.20 ELSE 0.28 END))::INT)));
    END IF;
  END LOOP;

  -- Initialize per-hero tracking fields (Craw + Myko)
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
    v_u:=v_units->v_k;
    IF (v_u->>'hero_id')='craw' THEN
      v_units:=jsonb_set(v_units,ARRAY[v_k,'craw_cr_triggered'],'false'::JSONB);
    END IF;
    IF (v_u->>'hero_id')='myko' THEN
      v_units:=jsonb_set(v_units,ARRAY[v_k,'myko_spore_turns'],'0'::JSONB);
      v_units:=jsonb_set(v_units,ARRAY[v_k,'myko_spore_dmg'],  '0'::JSONB);
    END IF;
  END LOOP;

  -- Load skills
  v_combj:='{}'::JSONB;
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
    v_combj:=v_combj||jsonb_build_object(v_k,(v_units->v_k->>'shield')::INT);
  END LOOP;
  v_events:=jsonb_build_array(jsonb_build_object(
    't',-1,'type','passive_init','shields',v_combj
  ))||v_events;
  v_combj:='[]'::JSONB;
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

  -- ATB loop
  <<outer>>
  LOOP
    v_iter:=v_iter+1;
    EXIT outer WHEN v_iter>5000 OR v_eidx>=1500;
    IF NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v_units) AS t(k) WHERE (v_units->k)->>'side'='hero'  AND ((v_units->k)->>'alive')::BOOLEAN) THEN EXIT outer; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v_units) AS t(k) WHERE (v_units->k)->>'side'='enemy' AND ((v_units->k)->>'alive')::BOOLEAN) THEN EXIT outer; END IF;

    -- Advance AP
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

      -- Pick actor (highest AP, tiebreak: speed)
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

      -- Cooldown decrement
      v_sk1cd := GREATEST(0, (v_actor->>'sk1_cd')::INT - 1);
      v_sk2cd := GREATEST(0, (v_actor->>'sk2_cd')::INT - 1);
      v_units := jsonb_set(v_units, ARRAY[v_auid,'sk1_cd'], to_jsonb(v_sk1cd));
      v_units := jsonb_set(v_units, ARRAY[v_auid,'sk2_cd'], to_jsonb(v_sk2cd));

      -- ══════════════════════════════════════════════════════════════════════
      -- BLEED TICK — fires at START of each BLEEDING unit's own turn
      -- ══════════════════════════════════════════════════════════════════════
      IF COALESCE((v_actor->>'bleed_turns')::INT,0)>0
         AND COALESCE((v_actor->>'bleed_dmg')::INT,0)>0 THEN
        v_bleed_dm   := (v_actor->>'bleed_dmg')::INT;
        v_bleed_hp   := GREATEST(0,(v_actor->>'hp')::INT-v_bleed_dm);
        v_bleed_died := v_bleed_hp<=0;
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'hp'],to_jsonb(v_bleed_hp));
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'bleed_turns'],
          to_jsonb((v_actor->>'bleed_turns')::INT-1));
        IF v_bleed_died THEN
          v_units:=jsonb_set(v_units,ARRAY[v_auid,'alive'],'false'::JSONB);
        END IF;
        v_tuid:=NULL;
        FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
          IF (v_units->v_k)->>'hero_id'='gorr'
             AND (v_units->v_k)->>'side'=v_eside
             AND ((v_units->v_k)->>'alive')::BOOLEAN THEN
            v_tuid:=v_k; EXIT;
          END IF;
        END LOOP;
        v_bleed_hl:=0;
        IF v_tuid IS NOT NULL THEN
          v_gorr_lv3:=CASE WHEN (v_units->v_tuid->>'level')::INT>=240 THEN 4
                           WHEN (v_units->v_tuid->>'level')::INT>=201 THEN 3
                           WHEN (v_units->v_tuid->>'level')::INT>=121 THEN 2
                           WHEN (v_units->v_tuid->>'level')::INT>=41  THEN 1 ELSE 0 END;
          IF v_gorr_lv3>0 THEN
            v_bleed_hl:=GREATEST(1,round(v_bleed_dm::NUMERIC*
              CASE v_gorr_lv3 WHEN 4 THEN 0.17 WHEN 3 THEN 0.13 WHEN 2 THEN 0.10 ELSE 0.08 END));
            v_hp:=(v_units->v_tuid->>'hp')::INT;
            v_bleed_hl:=LEAST((v_units->v_tuid->>'max_hp')::INT,v_hp+v_bleed_hl)-v_hp;
            IF v_bleed_hl>0 THEN
              v_units:=jsonb_set(v_units,ARRAY[v_tuid,'hp'],to_jsonb(v_hp+v_bleed_hl));
            ELSE v_bleed_hl:=0; END IF;
          END IF;
        END IF;
        v_bleed_tj:=jsonb_build_array(jsonb_build_object(
          'uid',v_auid,'dmg',v_bleed_dm,
          'hp_after',v_bleed_hp,'died',v_bleed_died,
          'rage_after',(v_actor->>'rage')::INT,'shield_after',(v_actor->>'shield')::INT
        ));
        IF v_bleed_hl>0 AND v_tuid IS NOT NULL THEN
          v_bleed_tj:=v_bleed_tj||jsonb_build_array(jsonb_build_object(
            'uid',v_tuid,'heal',v_bleed_hl,
            'hp_after',(v_units->v_tuid->>'hp')::INT,'died',false,
            'rage_after',(v_units->v_tuid->>'rage')::INT,'shield_after',(v_units->v_tuid->>'shield')::INT
          ));
        END IF;
        v_events:=v_events||jsonb_build_array(jsonb_build_object(
          't',v_eidx,'type','skill',
          'actor',COALESCE(v_tuid,v_auid),'hero_id','gorr','skill_slot',3,
          'skill_name','Bloodlust','skill_type','passive','skill_dtype','bleed',
          'targets',v_bleed_tj,
          'rage_after',CASE WHEN v_tuid IS NOT NULL THEN (v_units->v_tuid->>'rage')::INT
                            ELSE (v_actor->>'rage')::INT END,
          'lucas_stacks',NULL
        ));
        v_eidx:=v_eidx+1;
        IF v_bleed_died THEN CONTINUE inner; END IF;
      END IF;
      -- ── End Bleed tick ─────────────────────────────────────────────────────

      -- ══════════════════════════════════════════════════════════════════════
      -- SPORE TOXIN TICK — Myko ULT DoT, fires at start of poisoned unit's turn
      -- ══════════════════════════════════════════════════════════════════════
      IF COALESCE((v_actor->>'myko_spore_turns')::INT,0)>0
         AND COALESCE((v_actor->>'myko_spore_dmg')::INT,0)>0 THEN
        v_spore_dm   := (v_actor->>'myko_spore_dmg')::INT;
        v_spore_hp   := GREATEST(0,(v_actor->>'hp')::INT-v_spore_dm);
        v_spore_died := v_spore_hp<=0;
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'hp'],to_jsonb(v_spore_hp));
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'myko_spore_turns'],
          to_jsonb((v_actor->>'myko_spore_turns')::INT-1));
        IF v_spore_died THEN
          v_units:=jsonb_set(v_units,ARRAY[v_auid,'alive'],'false'::JSONB);
        END IF;
        -- Find alive Myko (the spore applier on opposite side)
        v_tuid:=NULL;
        FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
          IF (v_units->v_k)->>'hero_id'='myko'
             AND (v_units->v_k)->>'side'=v_eside
             AND ((v_units->v_k)->>'alive')::BOOLEAN THEN
            v_tuid:=v_k; EXIT;
          END IF;
        END LOOP;
        v_spore_tj:=jsonb_build_array(jsonb_build_object(
          'uid',v_auid,'dmg',v_spore_dm,
          'hp_after',v_spore_hp,'died',v_spore_died,
          'rage_after',(v_actor->>'rage')::INT,'shield_after',(v_actor->>'shield')::INT
        ));
        v_events:=v_events||jsonb_build_array(jsonb_build_object(
          't',v_eidx,'type','skill',
          'actor',COALESCE(v_tuid,v_auid),'hero_id','myko','skill_slot',3,
          'skill_name','Spore Toxin','skill_type','passive','skill_dtype','magical',
          'targets',v_spore_tj,
          'rage_after',(v_actor->>'rage')::INT,'lucas_stacks',NULL
        ));
        v_eidx:=v_eidx+1;
        IF v_spore_died THEN CONTINUE inner; END IF;
      END IF;
      -- ── End Spore Toxin tick ───────────────────────────────────────────────

      -- ══════════════════════════════════════════════════════════════════════
      -- WOUND tick (decrement at start of wounded unit's own turn)
      -- ══════════════════════════════════════════════════════════════════════
      IF COALESCE((v_actor->>'wound_turns')::INT,0)>0 THEN
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'wound_turns'],
          to_jsonb(GREATEST(0,(v_actor->>'wound_turns')::INT-1)));
        v_actor:=v_units->v_auid;
        IF (v_actor->>'wound_turns')::INT=0 THEN
          v_units:=jsonb_set(v_units,ARRAY[v_auid,'wound_bonus'],'0'::JSONB);
          v_actor:=v_units->v_auid;
        END IF;
      END IF;

      -- ══════════════════════════════════════════════════════════════════════
      -- BLIND check (at start of blinded unit's own turn — may skip action)
      -- ══════════════════════════════════════════════════════════════════════
      IF COALESCE((v_actor->>'blind_turns')::INT,0)>0 THEN
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'blind_turns'],
          to_jsonb((v_actor->>'blind_turns')::INT-1));
        v_actor:=v_units->v_auid;
        IF (v_actor->>'blind_turns')::INT=0 THEN
          v_units:=jsonb_set(v_units,ARRAY[v_auid,'blind_miss'],'0'::JSONB);
          v_actor:=v_units->v_auid;
        ELSE
          -- Roll miss: chance = blind_miss %
          IF random() < COALESCE((v_actor->>'blind_miss')::INT,0)/100.0 THEN
            -- Miss: record empty event and skip this actor's action
            v_events:=v_events||jsonb_build_array(jsonb_build_object(
              't',v_eidx,'type','atk',
              'actor',v_auid,'hero_id',v_ahid,'skill_slot',0,
              'skill_name','Blinded','skill_type','miss','skill_dtype',NULL,
              'targets','[]'::JSONB,'rage_after',v_arage,'lucas_stacks',NULL
            ));
            v_eidx:=v_eidx+1;
            CONTINUE inner;
          END IF;
        END IF;
      END IF;
      -- ── End Blind check ────────────────────────────────────────────────────

      -- Skill selection: ULT(rage≥100) > SK1(cd=0) > SK2(cd=0) > Basic
      v_slot:=0; v_sk:=NULL;
      IF v_arage>=100 THEN
        SELECT s INTO v_sk FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s->>'hero_id')=v_ahid AND (s->>'slot')::INT=4 AND (s->>'unlock_lv')::INT<=v_alv
        ORDER BY (s->>'unlock_lv')::INT DESC LIMIT 1;
        IF FOUND AND v_sk IS NOT NULL THEN v_slot:=4; END IF;
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

      -- Lucas SK2: armor-rend debuff (pre-hit)
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

      -- ════════════════════════════════════════════════════════════════════════
      -- TARGET RESOLUTION
      -- ════════════════════════════════════════════════════════════════════════
      v_tuids:=NULL;

      -- Emma SK2 hardcoded override
      IF v_ahid='emma' AND v_slot=2 THEN
        SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units->k)->>'side'=v_alside AND ((v_units->k)->>'alive')::BOOLEAN
        ORDER BY ((v_units->k)->>'max_hp')::INT DESC LIMIT 1;
        IF v_tuids IS NULL OR array_length(v_tuids,1)=0 THEN v_tuids:=ARRAY[v_auid]; END IF;
        v_sktype :='buff';
        v_skttype:='single_ally_maxhp';
      END IF;

      IF v_tuids IS NULL THEN
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
            SELECT array_agg(k) INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside
              AND ((v_units->k)->>'alive')::BOOLEAN
              AND ((v_units->k)->>'slot')::INT % 2 = v_front_col;
            IF v_tuids IS NULL OR array_length(v_tuids,1)=0 THEN
              SELECT array_agg(k) INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
              WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN;
            END IF;

          WHEN v_skttype='all_back' THEN
            SELECT array_agg(k) INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside
              AND ((v_units->k)->>'alive')::BOOLEAN
              AND ((v_units->k)->>'slot')::INT % 2 = v_back_col;
            IF v_tuids IS NULL OR array_length(v_tuids,1)=0 THEN
              SELECT array_agg(k) INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
              WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN;
            END IF;

          WHEN v_skttype='single_back' THEN
            SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside
              AND ((v_units->k)->>'alive')::BOOLEAN
              AND ((v_units->k)->>'slot')::INT % 2 = v_back_col
            ORDER BY random() LIMIT 1;
            IF v_tuids IS NULL THEN
              SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
              WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
              ORDER BY random() LIMIT 1;
            END IF;

          WHEN v_skttype='single_random' THEN
            SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
            ORDER BY random() LIMIT 1;

          WHEN v_skttype='single_highest_patk' THEN
            SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
            WHERE (v_units->k)->>'side'=v_eside AND ((v_units->k)->>'alive')::BOOLEAN
            ORDER BY ((v_units->k)->>'p_atk')::INT DESC LIMIT 1;

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

          ELSE
            IF v_sktype='buff' THEN
              v_tuids:=ARRAY[v_auid];
            ELSE
              SELECT ARRAY[k] INTO v_tuids FROM jsonb_object_keys(v_units) AS t(k)
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
      END IF;

      IF v_tuids IS NULL THEN v_tuids:=ARRAY[]::TEXT[]; END IF;

      -- Lucas ULT: 3 hits per front-row target
      IF v_ahid='lucas' AND v_slot=4 AND array_length(v_tuids,1)>0 THEN
        v_expanded := ARRAY[]::TEXT[];
        FOREACH v_tuid IN ARRAY v_tuids LOOP
          v_expanded := v_expanded || ARRAY[v_tuid, v_tuid, v_tuid];
        END LOOP;
        v_tuids := v_expanded;
      END IF;

      -- Apply to targets
      v_tj:='[]'::JSONB;
      v_craw_cr_now:=FALSE;
      FOREACH v_tuid IN ARRAY COALESCE(v_tuids,ARRAY[]::TEXT[]) LOOP
        CONTINUE WHEN NOT COALESCE(((v_units->v_tuid)->>'alive')::BOOLEAN,FALSE);
        v_tgt    :=v_units->v_tuid;
        v_thp    :=(v_tgt->>'hp')::INT;    v_tmhp  :=(v_tgt->>'max_hp')::INT;
        v_trage  :=(v_tgt->>'rage')::INT;  v_tshield:=(v_tgt->>'shield')::INT;
        v_tpds   :=(v_tgt->>'pds')::INT;   v_tdied :=FALSE;

        IF v_sktype='damage' THEN
          v_batk:=CASE v_skdtype WHEN 'physical' THEN v_apatk ELSE v_amatk END;
          -- Myko SK2/ULT: scale damage with own P.DEF
          IF v_ahid='myko' AND v_slot IN(2,4) THEN
            v_batk:=(v_actor->>'p_def')::INT;
          END IF;
          IF v_ahid='lucas' AND v_skdtype='physical' THEN
            v_llv3:=CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 WHEN v_alv>=41 THEN 1 ELSE 0 END;
            IF v_llv3>0 THEN v_batk:=v_batk; END IF;
          END IF;
          v_edef:=CASE v_skdtype WHEN 'physical' THEN GREATEST(0,floor((v_tgt->>'p_def')::INT*(100-v_tpds)/100.0)) ELSE (v_tgt->>'m_def')::INT END;
          v_dmg:=GREATEST(1,floor(v_batk::NUMERIC*v_skratio*200.0/(200+v_edef)));
          -- Wound amplification: target takes extra % damage if wounded
          IF COALESCE((v_tgt->>'wound_turns')::INT,0)>0 AND v_dmg>0 THEN
            v_dmg:=GREATEST(1,floor(v_dmg::NUMERIC*(1+COALESCE((v_tgt->>'wound_bonus')::INT,0)/100.0)))::INT;
          END IF;
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

          -- ── Myko Fungal Resilience: heal after taking damage ──────────────
          IF (v_tgt->>'hero_id')='myko' AND v_dmg>0 AND NOT v_tdied THEN
            v_myko_lv3:=CASE WHEN (v_tgt->>'level')::INT>=240 THEN 4
                             WHEN (v_tgt->>'level')::INT>=201 THEN 3
                             WHEN (v_tgt->>'level')::INT>=121 THEN 2
                             WHEN (v_tgt->>'level')::INT>=41  THEN 1 ELSE 0 END;
            IF v_myko_lv3>0 THEN
              v_myko_pdef:=(v_tgt->>'p_def')::INT;
              v_myko_heal:=GREATEST(1,round(v_myko_pdef::NUMERIC*
                CASE v_myko_lv3 WHEN 4 THEN 0.40 WHEN 3 THEN 0.32 WHEN 2 THEN 0.25 ELSE 0.18 END));
              v_thp:=LEAST(v_tmhp,v_thp+v_myko_heal);
              v_units:=jsonb_set(v_units,ARRAY[v_tuid,'hp'],to_jsonb(v_thp));
              v_tj:=v_tj||jsonb_build_array(jsonb_build_object(
                'uid',v_tuid,'heal',v_myko_heal,
                'hp_after',v_thp,'died',false,
                'rage_after',v_trage,'shield_after',v_tshield));
            END IF;
          END IF;

          -- ── Craw Cornered Rat: trigger when Craw HP drops below 40% first time ─
          IF (v_tgt->>'hero_id')='craw'
             AND NOT COALESCE((v_tgt->>'craw_cr_triggered')::BOOLEAN,FALSE)
             AND v_thp>0
             AND v_thp::NUMERIC < v_tmhp::NUMERIC*0.40 THEN
            v_craw_lv3:=CASE WHEN (v_tgt->>'level')::INT>=240 THEN 4
                             WHEN (v_tgt->>'level')::INT>=201 THEN 3
                             WHEN (v_tgt->>'level')::INT>=121 THEN 2
                             ELSE 1 END;
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'p_atk'],
              to_jsonb(GREATEST(1,round((v_units->v_tuid->>'p_atk')::NUMERIC*
                (1+CASE v_craw_lv3 WHEN 4 THEN 0.44 WHEN 3 THEN 0.36 WHEN 2 THEN 0.30 ELSE 0.25 END))::INT)));
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'speed'],
              to_jsonb(GREATEST(1,round((v_units->v_tuid->>'speed')::NUMERIC*
                (1+CASE v_craw_lv3 WHEN 4 THEN 0.22 WHEN 3 THEN 0.18 WHEN 2 THEN 0.15 ELSE 0.12 END))::INT)));
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'craw_cr_triggered'],'true'::JSONB);
            v_craw_cr_now:=TRUE;
          END IF;

          -- ── Craw Wound application ─────────────────────────────────────────
          IF v_ahid='craw' AND v_slot=1 AND v_dmg>0 THEN
            v_craw_lv3:=CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 ELSE 1 END;
            IF random() < (CASE v_craw_lv3 WHEN 4 THEN 0.60 WHEN 3 THEN 0.48 WHEN 2 THEN 0.38 ELSE 0.30 END) THEN
              v_units:=jsonb_set(v_units,ARRAY[v_tuid,'wound_turns'],'2'::JSONB);
              v_units:=jsonb_set(v_units,ARRAY[v_tuid,'wound_bonus'],
                to_jsonb(CASE v_craw_lv3 WHEN 4 THEN 22 WHEN 3 THEN 17 WHEN 2 THEN 13 ELSE 10 END));
            END IF;
          END IF;
          -- Craw Blind (SK2, 100%)
          IF v_ahid='craw' AND v_slot=2 AND v_dmg>0 THEN
            v_craw_lv3:=CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 ELSE 1 END;
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'blind_turns'],'2'::JSONB);
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'blind_miss'],
              to_jsonb(CASE v_craw_lv3 WHEN 4 THEN 65 WHEN 3 THEN 55 WHEN 2 THEN 45 ELSE 35 END));
          END IF;
          -- Craw ULT Wound (100%)
          IF v_ahid='craw' AND v_slot=4 AND v_dmg>0 THEN
            v_craw_lv3:=CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 ELSE 1 END;
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'wound_turns'],'2'::JSONB);
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'wound_bonus'],
              to_jsonb(CASE v_craw_lv3 WHEN 4 THEN 22 WHEN 3 THEN 17 WHEN 2 THEN 13 ELSE 10 END));
          END IF;

          -- ── Myko SK2 Spore Rot: pAtk −15% on hit targets ─────────────────
          IF v_ahid='myko' AND v_slot=2 AND v_dmg>0 THEN
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'p_atk'],
              to_jsonb(GREATEST(1,floor((v_units->v_tuid->>'p_atk')::NUMERIC*0.85)::INT)));
          END IF;
          -- Myko ULT Spore Toxin: apply DoT for 3 turns (15% own pDef per turn)
          IF v_ahid='myko' AND v_slot=4 AND v_dmg>0 THEN
            v_myko_pdef:=(v_actor->>'p_def')::INT;
            v_spore_dm:=GREATEST(1,round(v_myko_pdef::NUMERIC*0.15)::INT);
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'myko_spore_turns'],'3'::JSONB);
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'myko_spore_dmg'],to_jsonb(v_spore_dm));
          END IF;

        ELSIF v_sktype='heal' THEN
          v_heal:=GREATEST(1,floor(v_amatk::NUMERIC*v_skratio));
          v_thp:=LEAST(v_tmhp,v_thp+v_heal);
          v_units:=jsonb_set(v_units,ARRAY[v_tuid,'hp'],to_jsonb(v_thp));
          v_tj:=v_tj||jsonb_build_array(jsonb_build_object(
            'uid',v_tuid,'heal',v_heal,'hp_after',v_thp,'died',false,
            'rage_after',v_trage,'shield_after',v_tshield));

        ELSE -- buff / shield grant
          IF v_skttype IN('hp_shield_self','self') THEN
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
      END LOOP; -- end target loop

      -- ══════════════════════════════════════════════════════════════════════
      -- GORR POST-ATTACK PASSIVES
      -- ══════════════════════════════════════════════════════════════════════

      -- (A) Bloodlust — lifesteal on every damage hit
      IF v_ahid='gorr' AND v_sktype='damage' THEN
        v_gorr_lv3:=CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 WHEN v_alv>=41 THEN 1 ELSE 0 END;
        IF v_gorr_lv3>0 THEN
          SELECT COALESCE(SUM((tgt->>'dmg')::INT),0) INTO v_dmg_total
          FROM jsonb_array_elements(v_tj) AS tgt
          WHERE (tgt->>'uid')!=v_auid AND (tgt->>'dmg') IS NOT NULL;
          IF v_dmg_total>0 THEN
            v_heal:=GREATEST(1,round(v_dmg_total::NUMERIC*
              CASE v_gorr_lv3 WHEN 4 THEN 0.17 WHEN 3 THEN 0.13 WHEN 2 THEN 0.10 ELSE 0.08 END));
            v_hp:=(v_units->v_auid->>'hp')::INT;
            v_heal:=LEAST((v_units->v_auid->>'max_hp')::INT,v_hp+v_heal)-v_hp;
            IF v_heal>0 THEN
              v_units:=jsonb_set(v_units,ARRAY[v_auid,'hp'],to_jsonb(v_hp+v_heal));
              v_tj:=v_tj||jsonb_build_array(jsonb_build_object(
                'uid',v_auid,'heal',v_heal,
                'hp_after',v_hp+v_heal,'died',false,
                'rage_after',v_arage,'shield_after',(v_units->v_auid->>'shield')::INT
              ));
            END IF;
          END IF;
        END IF;
      END IF;

      -- (B) Cleaver Rush (SK1) — apply Bleed 2T to hit targets
      IF v_ahid='gorr' AND v_slot=1 THEN
        v_gorr_lv3:=CASE WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 WHEN v_alv>=41 THEN 1 ELSE 1 END;
        v_bleed_dm:=GREATEST(1,round(v_apatk::NUMERIC*
          CASE v_gorr_lv3 WHEN 4 THEN 0.35 WHEN 3 THEN 0.28 WHEN 2 THEN 0.22 ELSE 0.18 END));
        FOREACH v_tuid IN ARRAY COALESCE(v_tuids,ARRAY[]::TEXT[]) LOOP
          IF COALESCE(((v_units->v_tuid)->>'alive')::BOOLEAN,FALSE) THEN
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'bleed_dmg'],to_jsonb(v_bleed_dm));
            v_units:=jsonb_set(v_units,ARRAY[v_tuid,'bleed_turns'],to_jsonb(2));
          END IF;
        END LOOP;
      END IF;
      -- ── End Gorr post-attack passives ──────────────────────────────────────

      -- Post-action: rage + cooldown
      IF v_slot=4 THEN
        v_arage:=0;
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'rage'],to_jsonb(0));
      ELSIF v_slot=1 THEN
        v_arage:=LEAST(100,v_arage+5);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'rage'],to_jsonb(v_arage));
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'sk1_cd'],to_jsonb(3));
      ELSIF v_slot=2 THEN
        v_arage:=LEAST(100,v_arage+5);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'rage'],to_jsonb(v_arage));
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'sk2_cd'],to_jsonb(5));
      ELSE
        v_arage:=LEAST(100,v_arage+5);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'rage'],to_jsonb(v_arage));
      END IF;

      IF v_ahid='lucas' AND v_alv>=41 THEN
        IF COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0) < 5 THEN
          v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)::INT);
          v_units:=jsonb_set(v_units,ARRAY[v_auid,'p_atk'],to_jsonb(v_apatk));
          v_units:=jsonb_set(v_units,ARRAY[v_auid,'lucas_stacks'],
            to_jsonb(COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0)+1));
        END IF;
      END IF;

      v_events:=v_events||jsonb_build_array(jsonb_build_object(
        't',v_eidx,
        'type',CASE v_slot WHEN 4 THEN 'ult' WHEN 0 THEN 'atk' ELSE 'skill' END,
        'actor',v_auid,'hero_id',v_ahid,'skill_slot',v_slot,
        'skill_name',v_skname,'skill_type',v_sktype,'skill_dtype',v_skdtype,
        'targets',v_tj,'rage_after',v_arage,
        'lucas_stacks',CASE WHEN v_ahid='lucas'
          THEN COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0)
          ELSE NULL END));
      v_eidx:=v_eidx+1;
      EXIT outer WHEN v_eidx>=1500;

      -- ══════════════════════════════════════════════════════════════════════
      -- CRAW CORNERED RAT passive event (fires once, after main action event)
      -- ══════════════════════════════════════════════════════════════════════
      IF v_craw_cr_now THEN
        v_tuid:=NULL;
        FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
          IF (v_units->v_k)->>'hero_id'='craw' AND ((v_units->v_k)->>'alive')::BOOLEAN THEN
            v_tuid:=v_k; EXIT;
          END IF;
        END LOOP;
        IF v_tuid IS NOT NULL THEN
          v_events:=v_events||jsonb_build_array(jsonb_build_object(
            't',v_eidx,'type','skill',
            'actor',v_tuid,'hero_id','craw','skill_slot',3,
            'skill_name','Cornered Rat','skill_type','passive','skill_dtype','physical',
            'targets',jsonb_build_array(jsonb_build_object(
              'uid',v_tuid,'dmg',0,
              'hp_after',(v_units->v_tuid->>'hp')::INT,'died',false,
              'rage_after',(v_units->v_tuid->>'rage')::INT,
              'shield_after',(v_units->v_tuid->>'shield')::INT
            )),
            'rage_after',(v_units->v_tuid->>'rage')::INT,'lucas_stacks',NULL
          ));
          v_eidx:=v_eidx+1;
        END IF;
        v_craw_cr_now:=FALSE;
      END IF;

    END LOOP; -- inner
  END LOOP;   -- outer

  -- Determine winner
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

  -- Build combatants array
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
$function$;
