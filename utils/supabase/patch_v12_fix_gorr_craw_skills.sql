-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v12 — Gorr & Craw: passive slots + battle simulation integration     ║
-- ║                                                                              ║
-- ║  Target function: rpc_simulate_battle (patch_v9 ATB tick-based version)     ║
-- ║  Signature: (p_stage_id TEXT, p_hero_ids TEXT) RETURNS JSONB                ║
-- ║                                                                              ║
-- ║  DB Changes (hero_skills):                                                   ║
-- ║    1. gorr_ult   → skill_slot 4                                             ║
-- ║    2. craw_ult   → skill_slot 4                                             ║
-- ║    3. gorr_passive (Bloodlust) inserted at slot 3, unlock 41                ║
-- ║    4. craw_passive (Cornered Rat) inserted at slot 3, unlock 41             ║
-- ║    5. gorr_skill2 target_type = 'single_front'                              ║
-- ║    6. craw_skill1 target_type = 'single_random'                             ║
-- ║    7. craw_skill2 target_type = 'single_highest_patk'                       ║
-- ║                                                                              ║
-- ║  Function Changes (rpc_simulate_battle v9 ATB):                             ║
-- ║    A. Add Gorr per-hero skill block (Cleaver Rush / Slam / Reaping Arc)     ║
-- ║    B. Add Craw per-hero skill block (Crude Shot / Blind Arrow / Volley)     ║
-- ║    C. Extended targeting override after main target selection:               ║
-- ║         Gorr SK2 → single_front (highest-slot enemy)                        ║
-- ║         Craw SK1 → single_random                                             ║
-- ║         Craw SK2 → single_highest_patk                                      ║
-- ║    D. Gorr Bloodlust: +10% lifesteal on every hit                           ║
-- ║    E. Craw Cornered Rat: one-time buff at <40% HP                           ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════════════════════
-- 1-2. Fix ULT slots (display / future use)
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE public.hero_skills SET skill_slot = 4 WHERE skill_id = 'gorr_ult';
UPDATE public.hero_skills SET skill_slot = 4 WHERE skill_id = 'craw_ult';

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Gorr passive: Bloodlust
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type, effect_type, effect_duration,
   effect_chance, target_type, unlock_level, max_skill_level)
VALUES
  ('gorr_passive', 'gorr', 3, 'Bloodlust',
   'Passive. Every hit Gorr lands recovers HP equal to 10% of damage dealt.',
   'passive', 0.00, 'physical', 'lifesteal', 0, 100, 'self', 41, 10)
ON CONFLICT (skill_id) DO UPDATE SET
  skill_slot   = EXCLUDED.skill_slot,
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  skill_type   = EXCLUDED.skill_type,
  effect_type  = EXCLUDED.effect_type,
  unlock_level = EXCLUDED.unlock_level;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Craw passive: Cornered Rat
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type, effect_type, effect_duration,
   effect_chance, target_type, unlock_level, max_skill_level)
VALUES
  ('craw_passive', 'craw', 3, 'Cornered Rat',
   'Passive (one-time). When HP falls below 40%, permanently gain +25% P.ATK and +12% Speed.',
   'passive', 0.00, 'physical', 'cornered_rat', 0, 100, 'self', 41, 10)
ON CONFLICT (skill_id) DO UPDATE SET
  skill_slot   = EXCLUDED.skill_slot,
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  skill_type   = EXCLUDED.skill_type,
  effect_type  = EXCLUDED.effect_type,
  unlock_level = EXCLUDED.unlock_level;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Fix target_type for display purposes
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE public.hero_skills SET target_type = 'single_front'        WHERE skill_id = 'gorr_skill2';
UPDATE public.hero_skills SET target_type = 'single_random'       WHERE skill_id = 'craw_skill1';
UPDATE public.hero_skills SET target_type = 'single_highest_patk' WHERE skill_id = 'craw_skill2';

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Patch rpc_simulate_battle (v9 ATB engine)
-- ══════════════════════════════════════════════════════════════════════════════
DO $patch$
DECLARE
  src TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  p.proname = 'rpc_simulate_battle' AND n.nspname = 'public'
  ORDER  BY p.oid DESC LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'rpc_simulate_battle not found';
  END IF;

  -- Idempotent guard
  IF position('Cleaver Rush' IN src) > 0 THEN
    RAISE NOTICE 'patch_v12 already applied — skipping';
    RETURN;
  END IF;

  -- Verify this is the v9 ATB engine (not an older version)
  IF position('v_max_ticks' IN src) = 0 THEN
    RAISE EXCEPTION
      'Expected v9 ATB function (v_max_ticks not found). '
      'Body length=%, snippet=%', length(src), left(src, 300);
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- A+B: Add Gorr and Craw hero skill blocks
  -- Anchor: end of the RockSlime CASE block → we inject new ELSIFs before
  -- the closing END IF; of the hero-name IF chain.
  -- Exact anchor (8sp END CASE + 6sp END IF + 4sp END):
  --   "        END CASE;\n      END IF;\n    END;"
  -- ════════════════════════════════════════════════════════════════════════
  IF position('        END CASE;' || chr(10) || '      END IF;' || chr(10) || '    END;' IN src) = 0 THEN
    RAISE EXCEPTION
      'Hero-block anchor (END CASE / END IF / END) not found. '
      'body length=%, snippet near RockSlime=%',
      length(src),
      substring(src FROM greatest(1, position('RockSlime' IN src) - 20) FOR 300);
  END IF;

  src := replace(src,
    '        END CASE;' || chr(10) ||
    '      END IF;'     || chr(10) ||
    '    END;',

    $gorrcraw$        END CASE;

      ELSIF v_hname = 'Gorr' THEN
        v_is_magic := FALSE;
        CASE v_skill_slot
          WHEN 1 THEN v_ratio := 1.40; v_skill_name := 'Cleaver Rush';      v_sfx := 'basic';
          WHEN 2 THEN v_ratio := 1.58; v_skill_name := 'Intimidating Slam'; v_sfx := 'skill2';
          WHEN 5 THEN v_ratio := 0.88; v_skill_name := 'Reaping Arc';       v_sfx := 'ult';   v_aoe := TRUE;
          ELSE        v_ratio := 1.40;
        END CASE;

      ELSIF v_hname = 'Craw' THEN
        v_is_magic := FALSE;
        CASE v_skill_slot
          WHEN 1 THEN v_ratio := 1.15; v_skill_name := 'Crude Shot';          v_sfx := 'basic';
          WHEN 2 THEN v_ratio := 1.30; v_skill_name := 'Blind Arrow';         v_sfx := 'skill2';
          WHEN 5 THEN v_ratio := 0.72; v_skill_name := 'Skypiercer Volley';   v_sfx := 'ult';   v_aoe := TRUE;
          ELSE        v_ratio := 1.15;
        END CASE;

      END IF;
    END;$gorrcraw$
  );

  IF position('Cleaver Rush' IN src) = 0 THEN
    RAISE EXCEPTION 'Hero block inject failed — Cleaver Rush not found after replace';
  END IF;
  RAISE NOTICE 'A+B: Gorr + Craw hero skill blocks injected OK';

  -- ════════════════════════════════════════════════════════════════════════
  -- C: Extended targeting override
  -- Inject BEFORE "    -- Apply damage to each target"
  -- After the main targeting block has set v_tuids, override for special modes.
  -- ════════════════════════════════════════════════════════════════════════
  IF position('    -- Apply damage to each target' IN src) = 0 THEN
    RAISE EXCEPTION
      'Targeting anchor (-- Apply damage) not found. body length=%', length(src);
  END IF;

  src := replace(src,
    '    -- Apply damage to each target',
    $tgt$    -- Extended targeting override for Gorr SK2 / Craw SK1-SK2
    IF NOT v_aoe THEN
      IF (v_units->v_acting->>'name') = 'Gorr' AND v_skill_slot = 2 THEN
        -- single_front: enemy with highest slot value
        v_target := NULL;
        FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
          IF (v_units->v_k->>'alive')::BOOLEAN
             AND (v_units->v_k->>'side') != (v_units->v_acting->>'side') THEN
            IF v_target IS NULL OR
               (v_units->v_k->>'slot')::INT > (v_units->v_target->>'slot')::INT
            THEN v_target := v_k; END IF;
          END IF;
        END LOOP;
        IF v_target IS NOT NULL THEN v_tuids := ARRAY[v_target]; END IF;

      ELSIF (v_units->v_acting->>'name') = 'Craw' AND v_skill_slot = 1 THEN
        -- single_random
        SELECT ARRAY[k] INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units->k->>'alive')::BOOLEAN
          AND (v_units->k->>'side') != (v_units->v_acting->>'side')
        ORDER BY random() LIMIT 1;

      ELSIF (v_units->v_acting->>'name') = 'Craw' AND v_skill_slot = 2 THEN
        -- single_highest_patk
        SELECT ARRAY[k] INTO v_tuids
        FROM jsonb_object_keys(v_units) AS t(k)
        WHERE (v_units->k->>'alive')::BOOLEAN
          AND (v_units->k->>'side') != (v_units->v_acting->>'side')
        ORDER BY (v_units->k->>'p_atk')::NUMERIC DESC NULLS LAST LIMIT 1;
      END IF;
    END IF;

    -- Apply damage to each target$tgt$
  );

  IF position('single_front' IN src) = 0 THEN
    RAISE EXCEPTION 'Targeting override inject failed';
  END IF;
  RAISE NOTICE 'C: targeting override injected OK';

  -- ════════════════════════════════════════════════════════════════════════
  -- D+E: Gorr Bloodlust + Craw Cornered Rat
  -- Inject BEFORE "        v_one_hit := jsonb_build_object("
  -- which is inside the FOREACH v_tuid loop in the damage DECLARE block.
  -- At this point: v_acting=actor key, v_tuid=target key,
  -- v_hit_dmg=damage dealt, v_new_hp=target HP after hit, v_tgt_u=updated target.
  -- ════════════════════════════════════════════════════════════════════════
  IF position('        v_one_hit := jsonb_build_object(' IN src) = 0 THEN
    RAISE EXCEPTION
      'Damage-event anchor (v_one_hit := jsonb_build_object) not found. body length=%',
      length(src);
  END IF;

  src := replace(src,
    '        v_one_hit := jsonb_build_object(',
    $pass$        /* Gorr Bloodlust: 10% lifesteal on every damage hit */
        IF (v_units->v_acting->>'name') = 'Gorr' AND v_hit_dmg > 0 THEN
          v_heal := GREATEST(1, ROUND(v_hit_dmg * 0.10));
          v_units := v_units || jsonb_build_object(v_acting,
            (v_units->v_acting) || jsonb_build_object('hp',
              LEAST((v_units->v_acting->>'max_hp')::INT,
                    (v_units->v_acting->>'hp')::INT + v_heal)
            )
          );
        END IF;

        /* Craw Cornered Rat: one-time buff when HP drops below 40% */
        IF (v_tgt_u->>'name') = 'Craw'
           AND NOT COALESCE(((v_units->v_tuid)->>'cornered_triggered')::BOOLEAN, FALSE)
           AND v_new_hp > 0
           AND v_new_hp::NUMERIC / GREATEST(1, (v_tgt_u->>'max_hp')::NUMERIC) < 0.40 THEN
          v_units := v_units || jsonb_build_object(v_tuid,
            (v_units->v_tuid) || jsonb_build_object(
              'cornered_triggered', TRUE,
              'p_atk', ROUND((v_units->v_tuid->>'p_atk')::NUMERIC * 1.25),
              'speed', ROUND((v_units->v_tuid->>'speed')::NUMERIC * 1.12)
            )
          );
        END IF;

        v_one_hit := jsonb_build_object($pass$
  );

  IF position('Gorr Bloodlust' IN src) = 0 THEN
    RAISE EXCEPTION 'Bloodlust/CorneredRat inject failed';
  END IF;
  RAISE NOTICE 'D+E: Bloodlust + Cornered Rat injected OK';

  EXECUTE src;
  RAISE NOTICE 'patch_v12 complete — rpc_simulate_battle updated';
END;
$patch$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Restore permissions
-- ══════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(TEXT, TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. Verify hero_skills
-- ══════════════════════════════════════════════════════════════════════════════
SELECT hero_id, skill_id, skill_slot, name, target_type, unlock_level
FROM public.hero_skills
WHERE hero_id IN ('gorr','craw')
ORDER BY hero_id, skill_slot;
