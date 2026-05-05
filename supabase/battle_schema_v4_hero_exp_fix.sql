-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RPG Battle — Hero EXP Fix Patch v4                                     ║
-- ║  Jalankan di: Supabase Dashboard → SQL Editor                          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║  MASALAH (v2):                                                           ║
-- ║    rpc_complete_battle secara otomatis menambahkan hero_exp_reward ke    ║
-- ║    player_heroes.xp dan bahkan menghitung ulang level + stats hero.      ║
-- ║    Ini salah — hero exp dari stage adalah currency, bukan exp hero.      ║
-- ║                                                                          ║
-- ║  ATURAN YANG BENAR:                                                      ║
-- ║    • hero_exp_reward dari stage → profiles.hero_exp (currency pool)     ║
-- ║    • profiles.hero_exp digunakan oleh UI "Level Up" di hero detail       ║
-- ║    • player_heroes.xp / player_heroes.level HANYA naik lewat aksi       ║
-- ║      manual "Level Up" di interface — TIDAK otomatis dari battle         ║
-- ║                                                                          ║
-- ║  FIX:                                                                    ║
-- ║    Hapus seluruh blok UPDATE player_heroes dari rpc_complete_battle.     ║
-- ║    Profiles masih mendapat gold, gems, xp, hero_exp sebagai currency.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rpc_complete_battle(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_sess   record;
  v_winner text;
  v_stage  record;
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

      -- ── Award to profiles only ────────────────────────────────────────────
      -- gold, gems, xp    : player account resources / progression
      -- hero_exp           : currency POOL used to manually level up heroes
      --                      in the hero detail UI — NOT added to hero directly
      --
      -- !! DO NOT update player_heroes here !!
      -- Each hero's individual XP / level only changes through the explicit
      -- "Level Up" action in the hero detail interface.
      UPDATE profiles SET
        gold     = gold     + v_stage.gold_reward,
        gems     = gems     + v_stage.gem_reward,
        xp       = xp       + v_stage.exp_reward,
        hero_exp = hero_exp + v_stage.hero_exp_reward
      WHERE id = v_uid;

      RETURN jsonb_build_object(
        'winner', 'hero',
        'rewards', jsonb_build_object(
          'gold',     v_stage.gold_reward,
          'gems',     v_stage.gem_reward,
          'exp',      v_stage.exp_reward,
          'hero_exp', v_stage.hero_exp_reward
        )
      );
    END IF;
  END IF;

  -- Defeat path — no rewards
  RETURN jsonb_build_object(
    'winner',  COALESCE(v_winner, 'enemy'),
    'rewards', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_complete_battle(uuid) TO authenticated;
