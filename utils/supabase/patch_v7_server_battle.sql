-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7 — Full Server-Side ATB Battle Simulation                         ║
-- ║  Run this ENTIRE file in: Supabase Dashboard → SQL Editor → Run            ║
-- ║                                                                              ║
-- ║  SECURITY MODEL:                                                             ║
-- ║  • SECURITY DEFINER: function runs as DB owner, not caller                  ║
-- ║  • auth.uid() verified before ANY data is read                              ║
-- ║  • Hero ownership checked: cannot send heroes you don't own                 ║
-- ║  • All stats loaded from DB — client cannot inject numbers                  ║
-- ║  • Rewards granted server-side — client only receives the log to animate   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── 0. Drop all old battle functions ──────────────────────────────────────────
DROP FUNCTION IF EXISTS rpc_simulate_battle(text, text);
DROP FUNCTION IF EXISTS rpc_simulate_battle(text, jsonb);
DROP FUNCTION IF EXISTS rpc_start_battle(text, jsonb);
DROP FUNCTION IF EXISTS rpc_resolve_battle_turn(text, text, integer);
DROP FUNCTION IF EXISTS rpc_complete_battle(text);

-- ── 1. Ensure stage_definitions table exists ──────────────────────────────────
CREATE TABLE IF NOT EXISTS stage_definitions (
  stage_id          TEXT PRIMARY KEY,
  gold_reward       INTEGER NOT NULL DEFAULT 0,
  gem_reward        INTEGER NOT NULL DEFAULT 0,
  exp_reward        INTEGER NOT NULL DEFAULT 0,
  hero_exp_reward   INTEGER NOT NULL DEFAULT 0
);

-- ── 2. Populate Chapter 1 stage rewards (idempotent) ─────────────────────────
INSERT INTO stage_definitions (stage_id, gold_reward, gem_reward, exp_reward, hero_exp_reward) VALUES
  ('1-1',   150,  0, 100,  50),
  ('1-2',   200,  0, 100,  60),
  ('1-3',   250,  0, 100,  70),
  ('1-4',   300,  0, 100,  80),
  ('1-5',   400,  5, 100, 100),
  ('1-6',   450,  0, 100, 110),
  ('1-7',   500,  0, 100, 120),
  ('1-8',   550,  0, 100, 130),
  ('1-9',   600,  0, 100, 140),
  ('1-10',  700,  8, 100, 160),
  ('1-11',  750,  0, 100, 170),
  ('1-12',  800,  0, 100, 180),
  ('1-13',  850,  0, 100, 190),
  ('1-14',  900,  0, 100, 200),
  ('1-15', 1000, 12, 100, 220),
  ('1-16', 1100,  0, 100, 240),
  ('1-17', 1200,  0, 100, 260),
  ('1-18', 1300,  0, 100, 280),
  ('1-19', 1400,  0, 100, 300),
  ('1-20', 1600, 20, 100, 350)
ON CONFLICT (stage_id) DO UPDATE SET
  gold_reward     = EXCLUDED.gold_reward,
  gem_reward      = EXCLUDED.gem_reward,
  exp_reward      = EXCLUDED.exp_reward,
  hero_exp_reward = EXCLUDED.hero_exp_reward;

-- ── 3. Main RPC function ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_simulate_battle(
  p_stage_id     TEXT,
  p_hero_entries JSONB   -- [{"hero_id":"lucas","slot_index":0}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ── Auth ──────────────────────────────────────────────────────────────────
  v_uid        UUID;

  -- ── Battle state — JSONB keyed by uid ─────────────────────────────────────
  -- Each unit: {uid, hero_id, name, side, slot, level, hero_type,
  --             max_hp, hp, p_atk, m_atk, p_def, m_def, speed,
  --             ap, rage, sk1_used, sk2_used, shield, pds, alive}
  v_units      JSONB := '{}'::JSONB;
  v_skills     JSONB := '[]'::JSONB;
  v_events     JSONB := '[]'::JSONB;
  v_inh        JSONB := '{}'::JSONB;   -- initial_hp snapshot
  v_inmh       JSONB := '{}'::JSONB;   -- initial_maxhp snapshot

  -- ── Loop control ──────────────────────────────────────────────────────────
  v_iter       INT     := 0;
  v_eidx       INT     := 0;
  v_atb        NUMERIC := 1000;

  -- ── RECORD for DB queries ─────────────────────────────────────────────────
  v_rec        RECORD;

  -- ── Hero entry iteration ──────────────────────────────────────────────────
  v_i          INT;
  v_he         JSONB;
  v_uuid_str   TEXT;
  v_hp         INT;
  v_lv         INT;

  -- ── Actor (unit taking a turn) ────────────────────────────────────────────
  v_auid       TEXT;
  v_actor      JSONB;
  v_ahid       TEXT;    -- actor hero_id
  v_aside      TEXT;    -- actor side
  v_alv        INT;     -- actor level
  v_arage      INT;
  v_ask1       BOOLEAN;
  v_ask2       BOOLEAN;
  v_apatk      INT;
  v_amatk      INT;
  v_apds       INT;
  v_eside      TEXT;    -- enemy side (opposite of v_aside)
  v_alside     TEXT;    -- ally side

  -- ── Skill ─────────────────────────────────────────────────────────────────
  v_slot       INT;
  v_sk         JSONB;
  v_skname     TEXT;
  v_sktype     TEXT;
  v_skratio    NUMERIC;
  v_skdtype    TEXT;
  v_skttype    TEXT;

  -- ── Targeting ─────────────────────────────────────────────────────────────
  v_tuids      TEXT[];
  v_tuid       TEXT;
  v_tj         JSONB;
  v_expanded   TEXT[];
  v_ultratio   NUMERIC;

  -- ── Target state ──────────────────────────────────────────────────────────
  v_tgt        JSONB;
  v_thp        INT;
  v_tmhp       INT;
  v_trage      INT;
  v_tshield    INT;
  v_tpds       INT;
  v_tdied      BOOLEAN;

  -- ── Damage / Heal / Shield ─────────────────────────────────────────────────
  v_batk       INT;
  v_edef       INT;
  v_dmg        INT;
  v_heal       INT;
  v_shv        INT;

  -- ── AP advance ────────────────────────────────────────────────────────────
  v_madv       NUMERIC;
  v_adv        NUMERIC;

  -- ── Generic loop key / unit ───────────────────────────────────────────────
  v_k          TEXT;
  v_u          JSONB;

  -- ── Lucas special ─────────────────────────────────────────────────────────
  v_llv3       INT;

  -- ── Result ────────────────────────────────────────────────────────────────
  v_halive     BOOLEAN;
  v_ealive     BOOLEAN;
  v_winner     TEXT;
  v_rewards    JSONB;
  v_combj      JSONB;
  v_snum       INT;
  v_sdef       RECORD;
BEGIN

  -- ════════════════════════════════════════════════════════════════════════════
  -- STEP 1 — Verify caller identity
  -- ════════════════════════════════════════════════════════════════════════════
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'auth/unauthorized');
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- STEP 2 — Load HERO units (verified: must be owned by caller)
  -- ════════════════════════════════════════════════════════════════════════════
  FOR v_i IN 0 .. jsonb_array_length(p_hero_entries) - 1
  LOOP
    v_he := p_hero_entries -> v_i;
    v_uuid_str := 'hero-' || (v_he ->> 'slot_index');

    SELECT
      ph.level, ph.hp, ph.p_atk, ph.m_atk, ph.p_def, ph.m_def, ph.speed,
      hd.name, hd.hero_type
    INTO v_rec
    FROM player_heroes ph
    JOIN hero_definitions hd ON hd.hero_id = ph.hero_id
    WHERE ph.user_id = v_uid
      AND ph.hero_id = (v_he ->> 'hero_id');

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'hero/not-owned:' || (v_he ->> 'hero_id'));
    END IF;

    v_units := v_units || jsonb_build_object(
      v_uuid_str, jsonb_build_object(
        'uid',      v_uuid_str,
        'hero_id',  v_he ->> 'hero_id',
        'name',     v_rec.name,
        'side',     'hero',
        'slot',     (v_he ->> 'slot_index')::INT,
        'level',    v_rec.level,
        'hero_type',v_rec.hero_type,
        'max_hp',   v_rec.hp,    'hp',  v_rec.hp,
        'p_atk',    v_rec.p_atk, 'm_atk', v_rec.m_atk,
        'p_def',    v_rec.p_def, 'm_def', v_rec.m_def,
        'speed',    v_rec.speed,
        'ap',0, 'rage',0, 'sk1_used',false, 'sk2_used',false,
        'shield',0, 'pds',0, 'alive',true
      )
    );
    v_inh  := v_inh  || jsonb_build_object(v_uuid_str, v_rec.hp);
    v_inmh := v_inmh || jsonb_build_object(v_uuid_str, v_rec.hp);
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════════
  -- STEP 3 — Load ENEMY units from DB (client cannot choose stats)
  -- ════════════════════════════════════════════════════════════════════════════
  FOR v_rec IN
    SELECT
      se.enemy_hero_id, se.enemy_level, se.slot_position,
      hd.name, hd.hero_type,
      hd.base_hp,    hd.growth_hp,
      hd.base_p_atk, hd.growth_p_atk,
      hd.base_m_atk, hd.growth_m_atk,
      hd.base_p_def, hd.growth_p_def,
      hd.base_m_def, hd.growth_m_def,
      hd.base_speed
    FROM stage_enemies se
    JOIN hero_definitions hd ON hd.hero_id = se.enemy_hero_id
    WHERE se.stage_id = p_stage_id
    ORDER BY se.order_index
  LOOP
    v_uuid_str := 'enemy-' || v_rec.slot_position;
    v_lv  := v_rec.enemy_level;
    v_hp  := v_rec.base_hp + (v_lv - 1) * v_rec.growth_hp;

    v_units := v_units || jsonb_build_object(
      v_uuid_str, jsonb_build_object(
        'uid',      v_uuid_str,
        'hero_id',  v_rec.enemy_hero_id,
        'name',     v_rec.name,
        'side',     'enemy',
        'slot',     v_rec.slot_position,
        'level',    v_lv,
        'hero_type',v_rec.hero_type,
        'max_hp',   v_hp, 'hp', v_hp,
        'p_atk',    v_rec.base_p_atk + (v_lv - 1) * v_rec.growth_p_atk,
        'm_atk',    v_rec.base_m_atk + (v_lv - 1) * v_rec.growth_m_atk,
        'p_def',    v_rec.base_p_def + (v_lv - 1) * v_rec.growth_p_def,
        'm_def',    v_rec.base_m_def + (v_lv - 1) * v_rec.growth_m_def,
        'speed',    v_rec.base_speed,
        'ap',0, 'rage',0, 'sk1_used',false, 'sk2_used',false,
        'shield',0, 'pds',0, 'alive',true
      )
    );
    v_inh  := v_inh  || jsonb_build_object(v_uuid_str, v_hp);
    v_inmh := v_inmh || jsonb_build_object(v_uuid_str, v_hp);
  END LOOP;

  IF v_units = '{}'::JSONB THEN
    RETURN jsonb_build_object('error', 'battle/no-combatants');
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- STEP 4 — Load skills for all hero_ids in battle
  -- ════════════════════════════════════════════════════════════════════════════
  FOR v_rec IN
    SELECT hs.hero_id, hs.skill_slot, hs.name, hs.skill_type,
           hs.damage_ratio, hs.damage_type, hs.target_type, hs.unlock_level
    FROM hero_skills hs
    WHERE hs.hero_id IN (
      SELECT DISTINCT (v_units -> k) ->> 'hero_id'
      FROM jsonb_object_keys(v_units) AS t(k)
    )
  LOOP
    v_skills := v_skills || jsonb_build_array(jsonb_build_object(
      'hero_id',  v_rec.hero_id,
      'slot',     v_rec.skill_slot,
      'name',     v_rec.name,
      'type',     v_rec.skill_type,
      'ratio',    v_rec.damage_ratio,
      'dtype',    v_rec.damage_type,
      'ttype',    v_rec.target_type,
      'unlock_lv',v_rec.unlock_level
    ));
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════════
  -- STEP 5 — ATB Simulation (full battle, server-authoritative)
  --
  --  ATB threshold = 1000.  Each tick: AP += speed.
  --  When AP >= 1000: unit acts, AP -= 1000.
  --  Skip-time: advance all units by minimum needed to make next unit ready.
  --
  --  Rage:  attacker +5 after any action,  target +10 when hit (if survives)
  --  Slots: 0=basic  1=sk1(rage≥30)  2=sk2(rage≥60)  3=ult(rage=100, resets)
  --
  --  Row layout (floor(slot/2)):  row0=far/back  row1=mid  row2=near/front
  --  "front"   = MAX row index with alive units  (nearest to enemy line)
  --  "back"    = MIN row index with alive units  (farthest from enemy line)
  -- ════════════════════════════════════════════════════════════════════════════

  <<outer>>
  LOOP
    v_iter := v_iter + 1;
    EXIT outer WHEN v_iter > 2000 OR v_eidx >= 1200;

    -- Win condition
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_units) AS t(k)
      WHERE (v_units -> k) ->> 'side' = 'hero'
        AND ((v_units -> k) ->> 'alive')::BOOLEAN
    ) THEN EXIT outer; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_units) AS t(k)
      WHERE (v_units -> k) ->> 'side' = 'enemy'
        AND ((v_units -> k) ->> 'alive')::BOOLEAN
    ) THEN EXIT outer; END IF;

    -- ── Skip-time: advance AP to make next unit ready ──────────────────────
    v_madv := NULL;
    FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k)
    LOOP
      v_u := v_units -> v_k;
      IF ((v_u ->> 'alive')::BOOLEAN) AND ((v_u ->> 'ap')::NUMERIC < v_atb) THEN
        v_adv := (v_atb - (v_u ->> 'ap')::NUMERIC)
                 / GREATEST(1, (v_u ->> 'speed')::NUMERIC);
        IF v_madv IS NULL OR v_adv < v_madv THEN
          v_madv := v_adv;
        END IF;
      END IF;
    END LOOP;

    IF v_madv IS NOT NULL AND v_madv > 0 THEN
      FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k)
      LOOP
        IF ((v_units -> v_k ->> 'alive')::BOOLEAN) THEN
          v_units := jsonb_set(v_units, ARRAY[v_k, 'ap'],
            to_jsonb(
              (v_units -> v_k ->> 'ap')::NUMERIC
              + (v_units -> v_k ->> 'speed')::NUMERIC * v_madv
            )
          );
        END IF;
      END LOOP;
    END IF;

    -- ── Process all ready units in this tick ──────────────────────────────
    <<inner>>
    LOOP
      -- Re-check win condition each inner cycle
      EXIT outer WHEN NOT EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = 'hero'
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
      );
      EXIT outer WHEN NOT EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = 'enemy'
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
      );

      -- ── Select actor: highest AP, then highest speed ─────────────────────
      v_auid := NULL;
      FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k)
      LOOP
        v_u := v_units -> v_k;
        IF ((v_u ->> 'alive')::BOOLEAN) AND ((v_u ->> 'ap')::NUMERIC >= v_atb) THEN
          IF v_auid IS NULL
            OR (v_u ->> 'ap')::NUMERIC > (v_units -> v_auid ->> 'ap')::NUMERIC
            OR (
                 (v_u ->> 'ap')::NUMERIC = (v_units -> v_auid ->> 'ap')::NUMERIC
                 AND (v_u ->> 'speed')::INT > (v_units -> v_auid ->> 'speed')::INT
               )
          THEN
            v_auid := v_k;
          END IF;
        END IF;
      END LOOP;

      EXIT inner WHEN v_auid IS NULL;

      -- Deduct ATB from actor
      v_units := jsonb_set(v_units, ARRAY[v_auid, 'ap'],
        to_jsonb((v_units -> v_auid ->> 'ap')::NUMERIC - v_atb));

      -- Read actor state
      v_actor  := v_units -> v_auid;
      v_ahid   := v_actor ->> 'hero_id';
      v_aside  := v_actor ->> 'side';
      v_alv    := (v_actor ->> 'level')::INT;
      v_arage  := (v_actor ->> 'rage')::INT;
      v_ask1   := (v_actor ->> 'sk1_used')::BOOLEAN;
      v_ask2   := (v_actor ->> 'sk2_used')::BOOLEAN;
      v_apatk  := (v_actor ->> 'p_atk')::INT;
      v_amatk  := (v_actor ->> 'm_atk')::INT;
      v_apds   := (v_actor ->> 'pds')::INT;
      v_eside  := CASE WHEN v_aside = 'hero' THEN 'enemy' ELSE 'hero' END;
      v_alside := v_aside;

      -- ────────────────────────────────────────────────────────────────────
      -- PICK SKILL SLOT (rage-based priority)
      -- ────────────────────────────────────────────────────────────────────
      v_slot := 0;
      v_sk   := NULL;

      -- Ultimate (rage = 100)
      IF v_arage >= 100 THEN
        SELECT s INTO v_sk
        FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s ->> 'hero_id') = v_ahid
          AND (s ->> 'slot')::INT = 3
          AND (s ->> 'unlock_lv')::INT <= v_alv
        ORDER BY (s ->> 'unlock_lv')::INT DESC
        LIMIT 1;
        IF FOUND AND v_sk IS NOT NULL THEN v_slot := 3; END IF;
      END IF;

      -- Skill 2 (rage >= 60, not used this cycle)
      IF v_sk IS NULL AND v_arage >= 60 AND NOT v_ask2 THEN
        SELECT s INTO v_sk
        FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s ->> 'hero_id') = v_ahid
          AND (s ->> 'slot')::INT = 2
          AND (s ->> 'unlock_lv')::INT <= v_alv
        ORDER BY (s ->> 'unlock_lv')::INT DESC
        LIMIT 1;
        IF FOUND AND v_sk IS NOT NULL THEN v_slot := 2; END IF;
      END IF;

      -- Skill 1 (rage >= 30, not used this cycle)
      IF v_sk IS NULL AND v_arage >= 30 AND NOT v_ask1 THEN
        SELECT s INTO v_sk
        FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s ->> 'hero_id') = v_ahid
          AND (s ->> 'slot')::INT = 1
          AND (s ->> 'unlock_lv')::INT <= v_alv
        ORDER BY (s ->> 'unlock_lv')::INT DESC
        LIMIT 1;
        IF FOUND AND v_sk IS NOT NULL THEN v_slot := 1; END IF;
      END IF;

      -- Basic attack (always available)
      IF v_sk IS NULL THEN
        SELECT s INTO v_sk
        FROM jsonb_array_elements(v_skills) AS t(s)
        WHERE (s ->> 'hero_id') = v_ahid
          AND (s ->> 'slot')::INT = 0
          AND (s ->> 'unlock_lv')::INT <= v_alv
        ORDER BY (s ->> 'unlock_lv')::INT DESC
        LIMIT 1;
        v_slot := 0;
      END IF;

      -- Hard fallback (should never happen if hero_skills is populated correctly)
      IF v_sk IS NULL THEN
        v_sk := jsonb_build_object(
          'hero_id', v_ahid, 'slot', 0, 'name', 'Attack',
          'type', 'damage', 'ratio', 1.0, 'dtype', 'physical',
          'ttype', 'single', 'unlock_lv', 1
        );
        v_slot := 0;
      END IF;

      v_skname  := v_sk ->> 'name';
      v_sktype  := v_sk ->> 'type';
      v_skratio := (v_sk ->> 'ratio')::NUMERIC;
      v_skdtype := v_sk ->> 'dtype';
      v_skttype := v_sk ->> 'ttype';

      -- ────────────────────────────────────────────────────────────────────
      -- LUCAS SK2 — Armor Rend: shred primary target P.DEF before damage
      -- ────────────────────────────────────────────────────────────────────
      IF v_ahid = 'lucas' AND v_slot = 2 THEN
        v_llv3 := CASE
          WHEN v_alv >= 240 THEN 4
          WHEN v_alv >= 181 THEN 3
          WHEN v_alv >= 101 THEN 2
          WHEN v_alv >= 41  THEN 1
          ELSE 0
        END;
        IF v_llv3 > 0 THEN
          -- Find first unit in front row of enemy side
          SELECT k INTO v_tuid
          FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units -> k) ->> 'side' = v_eside
            AND ((v_units -> k) ->> 'alive')::BOOLEAN
          ORDER BY
            floor(((v_units -> k) ->> 'slot')::NUMERIC / 2) DESC,
            ((v_units -> k) ->> 'slot')::INT
          LIMIT 1;

          IF FOUND AND v_tuid IS NOT NULL THEN
            v_units := jsonb_set(v_units, ARRAY[v_tuid, 'pds'],
              to_jsonb(LEAST(80,
                (v_units -> v_tuid ->> 'pds')::INT
                + CASE v_llv3
                    WHEN 4 THEN 30
                    WHEN 3 THEN 25
                    WHEN 2 THEN 20
                    ELSE 15
                  END
              ))
            );
          END IF;
        END IF;
      END IF;

      -- ────────────────────────────────────────────────────────────────────
      -- RESOLVE TARGETS
      --   front = MAX floor(slot/2) row among alive enemies (nearest)
      --   back  = MIN floor(slot/2) row among alive enemies (farthest)
      -- ────────────────────────────────────────────────────────────────────
      v_tuids := NULL;

      CASE v_skttype

      WHEN 'all_enemies' THEN
        SELECT array_agg(k) INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_eside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN;

      WHEN 'front_aoe' THEN
        SELECT array_agg(k) INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_eside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
          AND floor(((v_units -> k) ->> 'slot')::NUMERIC / 2) = (
            SELECT MAX(floor(((v_units -> k2) ->> 'slot')::NUMERIC / 2))
            FROM jsonb_object_keys(v_units) AS t2(k2)
            WHERE (v_units -> k2) ->> 'side' = v_eside
              AND ((v_units -> k2) ->> 'alive')::BOOLEAN
          );

      WHEN 'all_back' THEN
        SELECT array_agg(k) INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_eside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
          AND floor(((v_units -> k) ->> 'slot')::NUMERIC / 2) = (
            SELECT MIN(floor(((v_units -> k2) ->> 'slot')::NUMERIC / 2))
            FROM jsonb_object_keys(v_units) AS t2(k2)
            WHERE (v_units -> k2) ->> 'side' = v_eside
              AND ((v_units -> k2) ->> 'alive')::BOOLEAN
          );

      WHEN 'single_back' THEN
        SELECT ARRAY[k] INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_eside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
          AND floor(((v_units -> k) ->> 'slot')::NUMERIC / 2) = (
            SELECT MIN(floor(((v_units -> k2) ->> 'slot')::NUMERIC / 2))
            FROM jsonb_object_keys(v_units) AS t2(k2)
            WHERE (v_units -> k2) ->> 'side' = v_eside
              AND ((v_units -> k2) ->> 'alive')::BOOLEAN
          )
        ORDER BY random()
        LIMIT 1;

      WHEN 'two_front_random' THEN
        -- Pick 2 from front row (may duplicate if only 1 unit)
        SELECT array_agg(k) INTO v_tuids
        FROM (
          SELECT k FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units -> k) ->> 'side' = v_eside
            AND ((v_units -> k) ->> 'alive')::BOOLEAN
            AND floor(((v_units -> k) ->> 'slot')::NUMERIC / 2) = (
              SELECT MAX(floor(((v_units -> k2) ->> 'slot')::NUMERIC / 2))
              FROM jsonb_object_keys(v_units) AS t2(k2)
              WHERE (v_units -> k2) ->> 'side' = v_eside
                AND ((v_units -> k2) ->> 'alive')::BOOLEAN
            )
          ORDER BY random()
          LIMIT 2
        ) sub;
        -- Ensure exactly 2 hits (duplicate if only 1 target)
        IF v_tuids IS NOT NULL AND array_length(v_tuids, 1) = 1 THEN
          v_tuids := ARRAY[v_tuids[1], v_tuids[1]];
        END IF;

      WHEN 'two_front_highest_hp' THEN
        SELECT array_agg(k) INTO v_tuids
        FROM (
          SELECT k FROM jsonb_object_keys(v_units) AS t(k)
          WHERE (v_units -> k) ->> 'side' = v_eside
            AND ((v_units -> k) ->> 'alive')::BOOLEAN
            AND floor(((v_units -> k) ->> 'slot')::NUMERIC / 2) = (
              SELECT MAX(floor(((v_units -> k2) ->> 'slot')::NUMERIC / 2))
              FROM jsonb_object_keys(v_units) AS t2(k2)
              WHERE (v_units -> k2) ->> 'side' = v_eside
                AND ((v_units -> k2) ->> 'alive')::BOOLEAN
            )
          ORDER BY ((v_units -> k) ->> 'max_hp')::INT DESC
          LIMIT 2
        ) sub;

      WHEN 'highest_speed' THEN
        SELECT ARRAY[k] INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_eside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
        ORDER BY ((v_units -> k) ->> 'speed')::INT DESC
        LIMIT 1;

      WHEN 'all_allies' THEN
        SELECT array_agg(k) INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_alside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN;

      WHEN 'single_ally_hp' THEN
        -- Lowest HP ratio ally
        SELECT ARRAY[k] INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_alside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
        ORDER BY
          ((v_units -> k) ->> 'hp')::NUMERIC
          / GREATEST(1, ((v_units -> k) ->> 'max_hp')::NUMERIC)
        LIMIT 1;

      WHEN 'hp_shield_self' THEN
        v_tuids := ARRAY[v_auid];

      WHEN 'single_ally_maxhp' THEN
        SELECT ARRAY[k] INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_alside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
        ORDER BY ((v_units -> k) ->> 'max_hp')::INT DESC
        LIMIT 1;

      ELSE
        -- Default: single front enemy
        SELECT ARRAY[k] INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units -> k) ->> 'side' = v_eside
          AND ((v_units -> k) ->> 'alive')::BOOLEAN
          AND floor(((v_units -> k) ->> 'slot')::NUMERIC / 2) = (
            SELECT MAX(floor(((v_units -> k2) ->> 'slot')::NUMERIC / 2))
            FROM jsonb_object_keys(v_units) AS t2(k2)
            WHERE (v_units -> k2) ->> 'side' = v_eside
              AND ((v_units -> k2) ->> 'alive')::BOOLEAN
          )
        ORDER BY ((v_units -> k) ->> 'slot')::INT
        LIMIT 1;

      END CASE;

      IF v_tuids IS NULL THEN v_tuids := ARRAY[]::TEXT[]; END IF;

      -- ────────────────────────────────────────────────────────────────────
      -- LUCAS ULTIMATE — 3-hit expansion (ratio / 3 per hit)
      -- ────────────────────────────────────────────────────────────────────
      IF v_ahid = 'lucas' AND v_slot = 3 THEN
        v_ultratio := v_skratio / 3.0;
        v_expanded := ARRAY[]::TEXT[];
        FOREACH v_tuid IN ARRAY v_tuids LOOP
          v_expanded := v_expanded || ARRAY[v_tuid, v_tuid, v_tuid];
        END LOOP;
        v_tuids   := v_expanded;
        v_skratio := v_ultratio;
      END IF;

      -- ────────────────────────────────────────────────────────────────────
      -- APPLY SKILL TO TARGETS
      -- ────────────────────────────────────────────────────────────────────
      v_tj := '[]'::JSONB;

      FOREACH v_tuid IN ARRAY COALESCE(v_tuids, ARRAY[]::TEXT[])
      LOOP
        -- Skip dead targets (can die mid-multi-hit)
        CONTINUE WHEN NOT COALESCE(
          ((v_units -> v_tuid) ->> 'alive')::BOOLEAN, FALSE
        );

        v_tgt     := v_units -> v_tuid;
        v_thp     := (v_tgt ->> 'hp')::INT;
        v_tmhp    := (v_tgt ->> 'max_hp')::INT;
        v_trage   := (v_tgt ->> 'rage')::INT;
        v_tshield := (v_tgt ->> 'shield')::INT;
        v_tpds    := (v_tgt ->> 'pds')::INT;
        v_tdied   := FALSE;

        -- ── DAMAGE ────────────────────────────────────────────────────────
        IF v_sktype = 'damage' THEN
          v_batk := CASE v_skdtype WHEN 'physical' THEN v_apatk ELSE v_amatk END;

          -- Lucas Passive: physical P.ATK bonus based on level tier
          IF v_ahid = 'lucas' AND v_skdtype = 'physical' THEN
            v_llv3 := CASE
              WHEN v_alv >= 240 THEN 4
              WHEN v_alv >= 201 THEN 3
              WHEN v_alv >= 121 THEN 2
              WHEN v_alv >= 61  THEN 1
              ELSE 0
            END;
            IF v_llv3 > 0 THEN
              v_batk := round(v_batk * (1 + CASE v_llv3
                WHEN 1 THEN 0.08
                WHEN 2 THEN 0.14
                WHEN 3 THEN 0.20
                ELSE       0.28
              END));
            END IF;
          END IF;

          -- Effective defense (with P.DEF shred %)
          v_edef := CASE v_skdtype
            WHEN 'physical' THEN
              GREATEST(0, floor(
                (v_tgt ->> 'p_def')::INT * (100 - v_tpds) / 100.0
              ))
            ELSE
              (v_tgt ->> 'm_def')::INT
          END;

          -- Damage formula: base_atk × ratio × 200 / (200 + eff_def)
          v_dmg := GREATEST(1, floor(
            v_batk::NUMERIC * v_skratio * 200.0 / (200 + v_edef)
          ));

          -- Shield absorbs first
          IF v_tshield > 0 THEN
            IF v_tshield >= v_dmg THEN
              v_tshield := v_tshield - v_dmg;
              v_dmg := 0;
            ELSE
              v_dmg    := v_dmg - v_tshield;
              v_tshield := 0;
            END IF;
          END IF;

          -- Apply to HP
          v_thp := GREATEST(0, v_thp - v_dmg);

          IF v_thp <= 0 THEN
            v_tdied := TRUE;
            v_thp    := 0;
            v_tshield := 0;
            v_units := jsonb_set(v_units, ARRAY[v_tuid, 'alive'], 'false'::JSONB);
          ELSE
            -- Rage gain for surviving a hit
            v_trage := LEAST(100, v_trage + 10);
          END IF;

          v_units := jsonb_set(v_units, ARRAY[v_tuid, 'hp'],     to_jsonb(v_thp));
          v_units := jsonb_set(v_units, ARRAY[v_tuid, 'shield'], to_jsonb(v_tshield));
          v_units := jsonb_set(v_units, ARRAY[v_tuid, 'rage'],   to_jsonb(v_trage));

          v_tj := v_tj || jsonb_build_array(jsonb_build_object(
            'uid', v_tuid, 'dmg', v_dmg,
            'hp_after', v_thp, 'died', v_tdied, 'rage_after', v_trage
          ));

        -- ── HEAL ──────────────────────────────────────────────────────────
        ELSIF v_sktype = 'heal' THEN
          v_heal := GREATEST(1, floor(v_amatk::NUMERIC * v_skratio));
          v_thp  := LEAST(v_tmhp, v_thp + v_heal);
          v_units := jsonb_set(v_units, ARRAY[v_tuid, 'hp'], to_jsonb(v_thp));

          v_tj := v_tj || jsonb_build_array(jsonb_build_object(
            'uid', v_tuid, 'heal', v_heal,
            'hp_after', v_thp, 'died', false, 'rage_after', v_trage
          ));

        -- ── BUFF / SHIELD ─────────────────────────────────────────────────
        ELSE
          IF v_skttype = 'hp_shield_self' THEN
            v_shv := GREATEST(1, floor(v_tmhp::NUMERIC * v_skratio));
          ELSE
            v_shv := GREATEST(1, floor(v_amatk::NUMERIC * v_skratio));
          END IF;
          v_tshield := v_tshield + v_shv;
          v_units := jsonb_set(v_units, ARRAY[v_tuid, 'shield'], to_jsonb(v_tshield));

          v_tj := v_tj || jsonb_build_array(jsonb_build_object(
            'uid', v_tuid, 'shield', v_shv,
            'hp_after', v_thp, 'died', false, 'rage_after', v_trage
          ));
        END IF;
      END LOOP; -- foreach target

      -- ────────────────────────────────────────────────────────────────────
      -- ACTOR RAGE UPDATE after action
      -- ────────────────────────────────────────────────────────────────────
      IF v_slot = 3 THEN
        -- Ultimate resets rage and both skill flags
        v_arage := 0;
        v_units := jsonb_set(v_units, ARRAY[v_auid, 'rage'],     to_jsonb(0));
        v_units := jsonb_set(v_units, ARRAY[v_auid, 'sk1_used'], 'false'::JSONB);
        v_units := jsonb_set(v_units, ARRAY[v_auid, 'sk2_used'], 'false'::JSONB);
      ELSIF v_slot = 1 THEN
        v_arage := LEAST(100, v_arage + 5);
        v_units := jsonb_set(v_units, ARRAY[v_auid, 'rage'],     to_jsonb(v_arage));
        v_units := jsonb_set(v_units, ARRAY[v_auid, 'sk1_used'], 'true'::JSONB);
      ELSIF v_slot = 2 THEN
        v_arage := LEAST(100, v_arage + 5);
        v_units := jsonb_set(v_units, ARRAY[v_auid, 'rage'],     to_jsonb(v_arage));
        v_units := jsonb_set(v_units, ARRAY[v_auid, 'sk2_used'], 'true'::JSONB);
      ELSE
        -- Basic attack
        v_arage := LEAST(100, v_arage + 5);
        v_units := jsonb_set(v_units, ARRAY[v_auid, 'rage'], to_jsonb(v_arage));
      END IF;

      -- ────────────────────────────────────────────────────────────────────
      -- APPEND EVENT to battle log
      -- ────────────────────────────────────────────────────────────────────
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        't',          v_eidx,
        'type',       CASE v_slot WHEN 3 THEN 'ult' WHEN 0 THEN 'atk' ELSE 'skill' END,
        'actor',      v_auid,
        'hero_id',    v_ahid,
        'skill_slot', v_slot,
        'skill_name', v_skname,
        'skill_type', v_sktype,
        'skill_dtype',v_skdtype,
        'targets',    v_tj,
        'rage_after', v_arage
      ));
      v_eidx := v_eidx + 1;
      EXIT outer WHEN v_eidx >= 1200;

    END LOOP; -- inner (turn loop)
  END LOOP;   -- outer (tick loop)

  -- ════════════════════════════════════════════════════════════════════════════
  -- STEP 6 — Determine winner
  -- ════════════════════════════════════════════════════════════════════════════
  v_halive := EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_units) AS t(k)
    WHERE (v_units -> k) ->> 'side' = 'hero'
      AND ((v_units -> k) ->> 'alive')::BOOLEAN
  );
  v_ealive := EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_units) AS t(k)
    WHERE (v_units -> k) ->> 'side' = 'enemy'
      AND ((v_units -> k) ->> 'alive')::BOOLEAN
  );
  v_winner := CASE WHEN v_halive AND NOT v_ealive THEN 'hero' ELSE 'enemy' END;

  -- ════════════════════════════════════════════════════════════════════════════
  -- STEP 7 — Grant rewards (server-side only, client cannot trigger this)
  -- ════════════════════════════════════════════════════════════════════════════
  v_rewards := 'null'::JSONB;

  IF v_winner = 'hero' THEN
    SELECT gold_reward, gem_reward, exp_reward, hero_exp_reward
    INTO v_sdef
    FROM stage_definitions
    WHERE stage_id = p_stage_id;

    IF FOUND THEN
      -- Parse stage number for chapter progress tracking
      BEGIN
        v_snum := split_part(p_stage_id, '-', 2)::INT;
      EXCEPTION WHEN OTHERS THEN
        v_snum := 0;
      END;

      UPDATE profiles SET
        gold     = gold     + COALESCE(v_sdef.gold_reward,     0),
        gems     = gems     + COALESCE(v_sdef.gem_reward,      0),
        xp       = xp       + COALESCE(v_sdef.exp_reward,      0),
        hero_exp = hero_exp + COALESCE(v_sdef.hero_exp_reward, 0),
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
    END IF;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- STEP 8 — Build combatants snapshot (final state)
  -- ════════════════════════════════════════════════════════════════════════════
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

  -- ════════════════════════════════════════════════════════════════════════════
  -- RETURN full battle log — client animates this, never recalculates
  -- ════════════════════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'winner',       v_winner,
    'rewards',      v_rewards,
    'events',       v_events,
    'combatants',   v_combj,
    'initial_hp',   v_inh,
    'initial_maxhp',v_inmh
  );

EXCEPTION WHEN OTHERS THEN
  -- Return error details so client can show a meaningful message
  RETURN jsonb_build_object(
    'error', SQLERRM || ' [' || SQLSTATE || ']'
  );
END;
$$;

-- ── 4. Permissions ────────────────────────────────────────────────────────────
-- Only authenticated users can call this function.
-- Public/anonymous access is DENIED.
REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text, jsonb) TO authenticated;

-- ── 5. stage_definitions RLS (allow authenticated to read) ───────────────────
ALTER TABLE stage_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read stage_definitions" ON stage_definitions;
CREATE POLICY "authenticated can read stage_definitions"
  ON stage_definitions FOR SELECT TO authenticated USING (true);

-- Done. Verify with:
-- SELECT rpc_simulate_battle('1-1', '[{"hero_id":"lucas","slot_index":4}]');
