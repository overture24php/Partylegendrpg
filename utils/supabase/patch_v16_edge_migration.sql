-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v16 — Battle Edge Migration                                          ║
-- ║  Adds ended_at column to battle_sessions (used by Hono server engine).      ║
-- ║  The original schema uses status+expires_at; the Hono engine uses ended_at. ║
-- ║  Run in: Supabase Dashboard → SQL Editor                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Add ended_at column (safe — IF NOT EXISTS equivalent via DO block) ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='battle_sessions'
      AND column_name='ended_at'
  ) THEN
    ALTER TABLE public.battle_sessions ADD COLUMN ended_at TIMESTAMPTZ;
  END IF;
END $$;

-- ── 2. Ensure battle_sessions allows service_role UPDATE (already allowed via  ──
--       service_role bypass, but add explicit policy for authenticated in case   ──
--       RLS is strict on updates).                                               ──
DROP POLICY IF EXISTS "bs_owner_update" ON public.battle_sessions;
CREATE POLICY "bs_owner_update" ON public.battle_sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bs_owner_insert" ON public.battle_sessions;
CREATE POLICY "bs_owner_insert" ON public.battle_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 3. Verify ─────────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='battle_sessions'
ORDER BY ordinal_position;
