-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RPG — Level-Up Cascade Fix  (v6)                                       ║
-- ║  Jalankan di: Supabase Dashboard → SQL Editor                          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║  ROOT CAUSE:                                                             ║
-- ║    rpc_complete_battle (v4) melakukan:                                  ║
-- ║      UPDATE profiles SET xp = xp + v_stage.exp_reward                  ║
-- ║    tanpa memeriksa apakah xp >= max_xp → level TIDAK PERNAH naik.       ║
-- ║                                                                          ║
-- ║  FIX:                                                                    ║
-- ║    Setelah menambahkan exp_reward ke xp, lakukan loop cascade level-up  ║
-- ║    menggunakan tabel threshold yang sama dengan expSystem.ts:            ║
-- ║      Lv  1– 29 →    960 EXP/level                                       ║
-- ║      Lv 30– 39 →  1,440 EXP/level                                       ║
-- ║      Lv 40– 59 →  2,880 EXP/level                                       ║
-- ║      Lv 60– 79 →  7,200 EXP/level                                       ║
-- ║      Lv 80+    → 14,400 EXP/level  (max Lv 1000)                        ║
-- ║    Kemudian UPDATE profiles.level, profiles.xp (within-level),          ║
-- ║    profiles.max_xp, profiles.exp_percentage dengan nilai final.          ║
-- ║    Nilai level baru dikembalikan di response JSON.                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rpc_complete_battle(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_sess    record;
  v_winner  text;
  v_stage   record;
  -- Level-up cascade variables
  v_lv      int;
  v_lv_xp   int;
  v_lv_max  int;
  v_lv_pct  int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth/unauthorized'; END IF;

  SELECT id, user_id, stage_id, status, state
  INTO   v_sess
  FROM   battle_sessions
  WHERE  id = p_session_id AND user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'session/not-found'; END IF;

  -- Winner is authoritative from server state — cannot be faked by client
  v_winner := CASE v_sess.status
    WHEN 'victory' THEN 'hero'
    WHEN 'defeat'  THEN 'enemy'
    ELSE COALESCE(v_sess.state ->> 'winner', 'enemy')
  END;

  -- Mark completed (idempotent — safe to call multiple times)
  UPDATE battle_sessions SET status = 'completed'
  WHERE  id = p_session_id
    AND  status IN ('victory', 'defeat', 'active');

  IF v_winner = 'hero' THEN
    SELECT * INTO v_stage FROM stage_definitions WHERE stage_id = v_sess.stage_id;
    IF FOUND THEN

      -- ── Step 1: Award raw currency + raw XP to profiles ──────────────────
      -- hero_exp goes to the profiles.hero_exp POOL only (used by manual Level Up in hero detail)
      -- xp goes to the account/player level system
      UPDATE profiles SET
        gold     = gold     + v_stage.gold_reward,
        gems     = gems     + v_stage.gem_reward,
        xp       = xp       + v_stage.exp_reward,
        hero_exp = hero_exp + v_stage.hero_exp_reward
      WHERE id = v_uid;

      -- ── Step 2: Read back xp and level after raw XP addition ──────────────
      SELECT level, xp INTO v_lv, v_lv_xp FROM profiles WHERE id = v_uid;

      -- ── Step 3: Cascade level-ups (same table as expSystem.ts) ───────────
      -- While xp >= threshold for current level → subtract, increment level
      LOOP
        v_lv_max := CASE
          WHEN v_lv <  30 THEN  960
          WHEN v_lv <  40 THEN 1440
          WHEN v_lv <  60 THEN 2880
          WHEN v_lv <  80 THEN 7200
          ELSE 14400
        END;
        EXIT WHEN v_lv_xp < v_lv_max OR v_lv >= 1000;
        v_lv_xp := v_lv_xp - v_lv_max;
        v_lv    := v_lv + 1;
      END LOOP;

      -- ── Step 4: Compute final max_xp and exp_percentage ───────────────────
      v_lv_max := CASE
        WHEN v_lv <  30 THEN  960
        WHEN v_lv <  40 THEN 1440
        WHEN v_lv <  60 THEN 2880
        WHEN v_lv <  80 THEN 7200
        ELSE 14400
      END;
      v_lv_pct := LEAST(100,
        CASE WHEN v_lv_max > 0
             THEN FLOOR(v_lv_xp::float / v_lv_max * 100)::int
             ELSE 0
        END
      );

      -- ── Step 5: Write correct level state back to profiles ────────────────
      UPDATE profiles SET
        level          = v_lv,
        xp             = v_lv_xp,
        max_xp         = v_lv_max,
        exp_percentage = v_lv_pct
      WHERE id = v_uid;

      -- Return rewards + new level info so client can sync without extra DB fetch
      RETURN jsonb_build_object(
        'winner', 'hero',
        'rewards', jsonb_build_object(
          'gold',     v_stage.gold_reward,
          'gems',     v_stage.gem_reward,
          'exp',      v_stage.exp_reward,
          'hero_exp', v_stage.hero_exp_reward
        ),
        'new_level',          v_lv,
        'new_xp',             v_lv_xp,
        'new_max_xp',         v_lv_max,
        'new_exp_percentage', v_lv_pct
      );
    END IF;
  END IF;

  -- Defeat path — no rewards, no level change
  RETURN jsonb_build_object(
    'winner',  COALESCE(v_winner, 'enemy'),
    'rewards', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_complete_battle(uuid) TO authenticated;

-- ── Repair existing profiles with stale level (xp accumulated but level frozen)
-- This re-derives correct level from the raw xp value stored in the column.
-- Run once; safe to re-run.
DO $$
DECLARE
  rec      record;
  v_lv     int;
  v_xp     int;
  v_max    int;
  v_pct    int;
BEGIN
  FOR rec IN SELECT id, level, xp FROM public.profiles LOOP
    v_lv  := GREATEST(1, rec.level);
    v_xp  := GREATEST(0, rec.xp);

    -- Cascade level-ups
    LOOP
      v_max := CASE
        WHEN v_lv <  30 THEN  960
        WHEN v_lv <  40 THEN 1440
        WHEN v_lv <  60 THEN 2880
        WHEN v_lv <  80 THEN 7200
        ELSE 14400
      END;
      EXIT WHEN v_xp < v_max OR v_lv >= 1000;
      v_xp := v_xp - v_max;
      v_lv := v_lv + 1;
    END LOOP;

    v_max := CASE
      WHEN v_lv <  30 THEN  960
      WHEN v_lv <  40 THEN 1440
      WHEN v_lv <  60 THEN 2880
      WHEN v_lv <  80 THEN 7200
      ELSE 14400
    END;
    v_pct := LEAST(100,
      CASE WHEN v_max > 0 THEN FLOOR(v_xp::float / v_max * 100)::int ELSE 0 END
    );

    UPDATE public.profiles SET
      level          = v_lv,
      xp             = v_xp,
      max_xp         = v_max,
      exp_percentage = v_pct
    WHERE id = rec.id;
  END LOOP;
END;
$$;
