-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v12-gorr — Gorr battle mechanics (v9 ATB engine)                     ║
-- ║                                                                              ║
-- ║  SK1  Cleaver Rush       140% P.ATK, single (lowest HP), Bleed 2T (18%/T)  ║
-- ║  SK2  Intimidating Slam  158% P.ATK, single front-row,   Terrify 2T (−15%) ║
-- ║  SK3  Bloodlust (passive) 10% lifesteal on every hit Gorr deals             ║
-- ║  ULT  Reaping Arc         88% P.ATK AOE, +30% vs Bleeding, refresh Bleed   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

DO $patch$
DECLARE
  src TEXT;
BEGIN
  -- ── Load ──────────────────────────────────────────────────────────────────
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  p.proname = 'rpc_simulate_battle' AND n.nspname = 'public'
  ORDER  BY p.oid DESC LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'rpc_simulate_battle not found';
  END IF;

  -- ── CRITICAL: normalize CRLF → LF so all string anchors are consistent ───
  src := replace(src, chr(13) || chr(10), chr(10));

  -- ── Verify v9 ATB engine ──────────────────────────────────────────────────
  IF position('v_max_ticks' IN src) = 0 THEN
    RAISE EXCEPTION 'Expected v9 ATB engine (v_max_ticks missing). len=%', length(src);
  END IF;

  -- ── Idempotent guard ──────────────────────────────────────────────────────
  IF position('Cleaver Rush' IN src) > 0 THEN
    RAISE NOTICE 'patch_v12_gorr already applied — skipping';
    RETURN;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- A — Gorr hero-skill block
  --     Unique anchor: RockSlime inline ELSE + END CASE + END IF + END
  --     (only place in the function where all 4 appear consecutively)
  -- ════════════════════════════════════════════════════════════════════════
  IF position(
      '          ELSE        v_ratio := 0.9;' || chr(10) ||
      '        END CASE;'                      || chr(10) ||
      '      END IF;'                          || chr(10) ||
      '    END;'
      IN src) = 0 THEN
    RAISE EXCEPTION
      'Anchor A not found. len=%, near-RockSlime=%',
      length(src),
      substring(src FROM GREATEST(1, position($$v_skill_name := 'Boulder'$$ IN src) - 20) FOR 300);
  END IF;

  src := replace(src,
    '          ELSE        v_ratio := 0.9;' || chr(10) ||
    '        END CASE;'                      || chr(10) ||
    '      END IF;'                          || chr(10) ||
    '    END;',

    $A$          ELSE        v_ratio := 0.9;
        END CASE;

      -- ── Gorr ──────────────────────────────────────────────────────────────
      ELSIF v_hname = 'Gorr' THEN
        v_is_magic := FALSE;
        CASE v_skill_slot
          WHEN 1 THEN v_ratio := 1.40; v_skill_name := 'Cleaver Rush';      v_sfx := 'basic';
          WHEN 2 THEN v_ratio := 1.58; v_skill_name := 'Intimidating Slam'; v_sfx := 'skill2';
          WHEN 5 THEN v_ratio := 0.88; v_skill_name := 'Reaping Arc';       v_sfx := 'ult'; v_aoe := TRUE;
          ELSE        v_ratio := 1.40;
        END CASE;

      END IF;
    END;$A$
  );

  IF position('Cleaver Rush' IN src) = 0 THEN
    RAISE EXCEPTION 'Inject A failed';
  END IF;
  RAISE NOTICE 'A OK: Gorr skill block';

  -- ════════════════════════════════════════════════════════════════════════
  -- B — Bleed tick + Terrify decrement for acting unit
  --     Injected BEFORE "    -- Determine skill to use"
  -- ════════════════════════════════════════════════════════════════════════
  IF position('    -- Determine skill to use' IN src) = 0 THEN
    RAISE EXCEPTION 'Anchor B not found (-- Determine skill to use)';
  END IF;

  src := replace(src,
    '    -- Determine skill to use',

    $B$    -- ── [Gorr] Status ticks: Bleed damage + Terrify decrement ─────────────────
    DECLARE
      v_gbt INT := COALESCE(((v_units->v_acting)->>'bleed_turns')::INT,       0);
      v_gtT INT := COALESCE(((v_units->v_acting)->>'terrify_turns')::INT,     0);
      v_gbd INT := GREATEST(1, COALESCE(((v_units->v_acting)->>'bleed_dmg_per_tick')::INT, 0));
      v_gbh INT;
    BEGIN
      -- Bleed damage tick
      IF v_gbt > 0 THEN
        v_gbh := GREATEST(0, ((v_units->v_acting)->>'hp')::INT - v_gbd);
        v_units := v_units || jsonb_build_object(v_acting,
          (v_units->v_acting) || jsonb_build_object(
            'hp',          v_gbh,
            'alive',       v_gbh > 0,
            'bleed_turns', v_gbt - 1));
        v_turn_log := v_turn_log || ARRAY[jsonb_build_object(
          'actor',      v_acting,
          'skill_slot', 0,
          'skill_name', 'Bleed',
          'sfx',        'bleed',
          'hits',       jsonb_build_array(jsonb_build_object(
            'target',  v_acting,
            'dmg',     v_gbd,
            'killed',  v_gbh <= 0,
            'hp_left', v_gbh)),
          'snapshot',  v_units)];
      END IF;
      -- Terrify duration tick
      IF v_gtT > 0 THEN
        v_units := v_units || jsonb_build_object(v_acting,
          (v_units->v_acting) || jsonb_build_object('terrify_turns', v_gtT - 1));
      END IF;
    END;
    -- Refresh v_u; skip turn if Bleed killed this unit
    v_u := v_units -> v_acting;
    CONTINUE WHEN NOT COALESCE((v_u->>'alive')::BOOLEAN, FALSE);

    -- Determine skill to use$B$
  );

  IF position('Bleed damage tick' IN src) = 0 THEN
    RAISE EXCEPTION 'Inject B failed';
  END IF;
  RAISE NOTICE 'B OK: Bleed tick + Terrify decrement';

  -- ════════════════════════════════════════════════════════════════════════
  -- C — Terrify P.ATK reduction (applied locally to acting unit, not stored)
  --     Anchor: "      v_actor_u := v_units -> v_acting;"
  -- ════════════════════════════════════════════════════════════════════════
  IF position('      v_actor_u := v_units -> v_acting;' IN src) = 0 THEN
    RAISE EXCEPTION 'Anchor C not found (v_actor_u := v_units -> v_acting)';
  END IF;

  src := replace(src,
    '      v_actor_u := v_units -> v_acting;',

    $C$      v_actor_u := v_units -> v_acting;
      -- [Gorr] Terrify: if this actor is Terrified, reduce effective P.ATK by 15%
      IF COALESCE((v_actor_u->>'terrify_turns')::INT, 0) > 0 THEN
        v_actor_u := v_actor_u || jsonb_build_object('p_atk',
          ROUND((v_actor_u->>'p_atk')::NUMERIC * 0.85));
      END IF;$C$
  );

  IF position('[Gorr] Terrify: if this actor' IN src) = 0 THEN
    RAISE EXCEPTION 'Inject C failed';
  END IF;
  RAISE NOTICE 'C OK: Terrify P.ATK reduction';

  -- ════════════════════════════════════════════════════════════════════════
  -- D — Gorr ULT +30% damage vs Bleeding targets (before variance roll)
  --     Anchor: the variance line (appears exactly once)
  -- ════════════════════════════════════════════════════════════════════════
  IF position(
      '        v_hit_dmg := GREATEST(1, ROUND(v_hit_dmg * (0.95 + random() * 0.10)));'
      IN src) = 0 THEN
    RAISE EXCEPTION 'Anchor D not found (variance line)';
  END IF;

  src := replace(src,
    '        v_hit_dmg := GREATEST(1, ROUND(v_hit_dmg * (0.95 + random() * 0.10)));',

    $D$        -- [Gorr] ULT: +30% damage vs Bleeding targets (applied before variance)
        IF (v_units->v_acting->>'name') = 'Gorr'
           AND v_skill_slot = 5
           AND COALESCE((v_units->v_tuid->>'bleed_turns')::INT, 0) > 0
        THEN
          v_hit_dmg := ROUND(v_hit_dmg * 1.30);
        END IF;
        -- Variance ±10%
        v_hit_dmg := GREATEST(1, ROUND(v_hit_dmg * (0.95 + random() * 0.10)));$D$
  );

  IF position('ULT: +30% damage vs Bleeding' IN src) = 0 THEN
    RAISE EXCEPTION 'Inject D failed';
  END IF;
  RAISE NOTICE 'D OK: Gorr ULT Bleed bonus';

  -- ════════════════════════════════════════════════════════════════════════
  -- E — Gorr SK2 targeting override: single_front (enemy with lowest slot)
  --     Anchor: "    -- Apply damage to each target"
  -- ════════════════════════════════════════════════════════════════════════
  IF position('    -- Apply damage to each target' IN src) = 0 THEN
    RAISE EXCEPTION 'Anchor E not found (-- Apply damage to each target)';
  END IF;

  src := replace(src,
    '    -- Apply damage to each target',

    $E$    -- [Gorr] SK2 single_front: override target to lowest-slot alive enemy
    IF (v_units->v_acting->>'name') = 'Gorr' AND v_skill_slot = 2 AND NOT v_aoe THEN
      v_target := NULL;
      FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
        IF (v_units->v_k->>'alive')::BOOLEAN
           AND (v_units->v_k->>'side') != (v_units->v_acting->>'side') THEN
          IF v_target IS NULL OR
             (v_units->v_k->>'slot')::INT < (v_units->v_target->>'slot')::INT
          THEN v_target := v_k; END IF;
        END IF;
      END LOOP;
      IF v_target IS NOT NULL THEN v_tuids := ARRAY[v_target]; END IF;
    END IF;

    -- Apply damage to each target$E$
  );

  IF position('SK2 single_front: override' IN src) = 0 THEN
    RAISE EXCEPTION 'Inject E failed';
  END IF;
  RAISE NOTICE 'E OK: Gorr SK2 single_front targeting';

  -- ════════════════════════════════════════════════════════════════════════
  -- F — Bloodlust (lifesteal) + apply Bleed(SK1) + apply Terrify(SK2)
  --                           + refresh Bleed(ULT)
  --     Anchor: "        v_one_hit := jsonb_build_object("
  --     Context: inside FOREACH v_tuid loop, v_units already updated with
  --              new hp/alive for this target, v_hit_dmg = final damage.
  -- ════════════════════════════════════════════════════════════════════════
  IF position('        v_one_hit := jsonb_build_object(' IN src) = 0 THEN
    RAISE EXCEPTION 'Anchor F not found (v_one_hit := jsonb_build_object)';
  END IF;

  src := replace(src,
    '        v_one_hit := jsonb_build_object(',

    $F$        -- [Gorr] Bloodlust: recover 10% of every hit Gorr deals
        IF (v_units->v_acting->>'name') = 'Gorr' AND v_hit_dmg > 0 THEN
          v_heal := GREATEST(1, ROUND(v_hit_dmg * 0.10));
          v_units := v_units || jsonb_build_object(v_acting,
            (v_units->v_acting) || jsonb_build_object('hp',
              LEAST((v_units->v_acting->>'max_hp')::INT,
                    (v_units->v_acting->>'hp')::INT + v_heal)));
        END IF;

        -- [Gorr] SK1 Cleaver Rush: apply / refresh Bleed 2T
        --   Bleed/tick = 18% of Gorr's current P.ATK (snapshot at cast)
        IF (v_units->v_acting->>'name') = 'Gorr' AND v_skill_slot = 1 THEN
          v_units := v_units || jsonb_build_object(v_tuid,
            (v_units->v_tuid) || jsonb_build_object(
              'bleed_turns',        2,
              'bleed_dmg_per_tick', GREATEST(1,
                ROUND((v_actor_u->>'p_atk')::NUMERIC * 0.18))));
        END IF;

        -- [Gorr] SK2 Intimidating Slam: apply / refresh Terrify 2T
        IF (v_units->v_acting->>'name') = 'Gorr' AND v_skill_slot = 2 THEN
          v_units := v_units || jsonb_build_object(v_tuid,
            (v_units->v_tuid) || jsonb_build_object('terrify_turns', 2));
        END IF;

        -- [Gorr] ULT Reaping Arc: refresh Bleed to 2T on already-Bleeding targets
        IF (v_units->v_acting->>'name') = 'Gorr' AND v_skill_slot = 5
           AND COALESCE((v_units->v_tuid->>'bleed_turns')::INT, 0) > 0
        THEN
          v_units := v_units || jsonb_build_object(v_tuid,
            (v_units->v_tuid) || jsonb_build_object('bleed_turns', 2));
        END IF;

        v_one_hit := jsonb_build_object($F$
  );

  IF position('Bloodlust: recover 10%' IN src) = 0 THEN
    RAISE EXCEPTION 'Inject F failed';
  END IF;
  RAISE NOTICE 'F OK: Bloodlust + Bleed(SK1) + Terrify(SK2) + Bleed-refresh(ULT)';

  -- ── Execute ───────────────────────────────────────────────────────────────
  EXECUTE src;
  RAISE NOTICE 'patch_v12_gorr COMPLETE';
END;
$patch$;

-- ── Permissions ────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(TEXT, TEXT) TO authenticated;

-- ── Verify ─────────────────────────────────────────────────────────────────────
SELECT routine_name,
       length(routine_definition) AS body_len
FROM   information_schema.routines
WHERE  routine_name = 'rpc_simulate_battle'
  AND  routine_schema = 'public';
