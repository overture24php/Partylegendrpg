-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v20 — Admin System: Ban & Delete Players                              ║
-- ║                                                                              ║
-- ║  Adds:                                                                       ║
-- ║    • is_banned, ban_reason, banned_at columns to profiles                    ║
-- ║    • ON DELETE CASCADE fixes for player_heroes & player_hero_skills          ║
-- ║      (so deleting auth.users auto-wipes ALL hero data — no manual cleanup)   ║
-- ║    • Admin list view (rpc_admin_list_players)                                ║
-- ║    • Ban/Unban functions (rpc_admin_ban_player, rpc_admin_unban_player)       ║
-- ║                                                                              ║
-- ║  NOTE: Actual auth deletion is done via Supabase Admin REST API              ║
-- ║  (DELETE /auth/v1/admin/users/{id}) from the Admin Panel UI.                 ║
-- ║  All child tables cascade automatically when auth.users row is deleted.      ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Add ban columns to profiles ────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned   BOOLEAN   DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason  TEXT      DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at   TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_by   TEXT      DEFAULT NULL;  -- admin email

-- ── 2. Ensure CASCADE on player_heroes ────────────────────────────────────────
-- Re-add FK with cascade so deleting auth.users removes all hero rows automatically.
ALTER TABLE public.player_heroes
  DROP CONSTRAINT IF EXISTS player_heroes_user_id_fkey;
ALTER TABLE public.player_heroes
  ADD CONSTRAINT player_heroes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 3. Ensure CASCADE on player_hero_skills ───────────────────────────────────
ALTER TABLE public.player_hero_skills
  DROP CONSTRAINT IF EXISTS player_hero_skills_user_id_fkey;
ALTER TABLE public.player_hero_skills
  ADD CONSTRAINT player_hero_skills_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 4. Ensure CASCADE on battle_sessions (likely already there, idempotent) ───
ALTER TABLE public.battle_sessions
  DROP CONSTRAINT IF EXISTS battle_sessions_user_id_fkey;
ALTER TABLE public.battle_sessions
  ADD CONSTRAINT battle_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 5. Ensure CASCADE on hero_shards ─────────────────────────────────────────
-- hero_shards already references profiles(id) ON DELETE CASCADE — safe to re-add
ALTER TABLE public.hero_shards
  DROP CONSTRAINT IF EXISTS hero_shards_user_id_fkey;
ALTER TABLE public.hero_shards
  ADD CONSTRAINT hero_shards_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 6. Admin: ban player (sets flag — auth ban done via API from UI) ──────────
CREATE OR REPLACE FUNCTION public.rpc_admin_ban_player(
  p_user_id  UUID,
  p_reason   TEXT DEFAULT 'Banned by admin',
  p_admin_email TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET
    is_banned  = true,
    ban_reason = p_reason,
    banned_at  = NOW(),
    banned_by  = p_admin_email,
    updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'reason', p_reason);
END;
$$;

-- ── 7. Admin: unban player ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_admin_unban_player(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET
    is_banned  = false,
    ban_reason = NULL,
    banned_at  = NULL,
    banned_by  = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END;
$$;

-- ── 8. Admin: list all players with stats ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_admin_list_players(
  p_limit  INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.profiles p
  WHERE p_search IS NULL
     OR p.username ILIKE '%' || p_search || '%'
     OR p.email    ILIKE '%' || p_search || '%';

  SELECT jsonb_agg(row_to_json(t)) INTO v_rows
  FROM (
    SELECT
      p.id,
      p.email,
      p.username,
      p.nickname,
      p.level,
      p.gold,
      p.gems,
      p.hero_exp,
      p.power,
      p.vip_level,
      p.is_banned,
      p.ban_reason,
      p.banned_at,
      p.created_at,
      (SELECT COUNT(*) FROM public.player_heroes ph WHERE ph.user_id = p.id) AS hero_count,
      (SELECT COUNT(*) FROM public.battle_sessions bs
       WHERE bs.user_id = p.id AND bs.status = 'completed') AS battles_won
    FROM public.profiles p
    WHERE p_search IS NULL
       OR p.username ILIKE '%' || p_search || '%'
       OR p.email    ILIKE '%' || p_search || '%'
    ORDER BY p.created_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object(
    'players', COALESCE(v_rows, '[]'::JSONB),
    'total',   v_total
  );
END;
$$;

-- ── 9. Permissions ────────────────────────────────────────────────────────────
-- These RPCs are SECURITY DEFINER so they run as DB owner.
-- We still grant execute to service_role for admin API calls.
GRANT EXECUTE ON FUNCTION public.rpc_admin_ban_player(UUID, TEXT, TEXT)   TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_unban_player(UUID)             TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_players(INT, INT, TEXT)   TO service_role;

-- ── 10. Verify cascade chains ─────────────────────────────────────────────────
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name  AS foreign_table,
  rc.delete_rule
FROM information_schema.table_constraints     tc
JOIN information_schema.key_column_usage      kcu  ON kcu.constraint_name  = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc  ON rc.constraint_name  = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('player_heroes','player_hero_skills','battle_sessions','hero_shards','profiles')
ORDER BY tc.table_name;
