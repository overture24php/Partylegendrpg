-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7.8 — Cooldown Skip-Count Fix                                      ║
-- ║                                                                              ║
-- ║  ROOT CAUSE:                                                                 ║
-- ║    Cooldown is decremented at START of the actor's action, THEN checked.   ║
-- ║    Setting sk1_cd=2 after use therefore gives:                              ║
-- ║      Action 2 start: 2→1  (not ready)                                      ║
-- ║      Action 3 start: 1→0  (READY — only 1 action skipped, not 2!)         ║
-- ║                                                                              ║
-- ║  FIX:                                                                        ║
-- ║    SK1 (desired: 2 personal actions skipped) → set sk1_cd = 3              ║
-- ║      Action 2 start: 3→2  (not ready)                                      ║
-- ║      Action 3 start: 2→1  (not ready)                                      ║
-- ║      Action 4 start: 1→0  (READY ✓ — 2 skipped turns)                     ║
-- ║                                                                              ║
-- ║    SK2 (desired: 4 personal actions skipped) → set sk2_cd = 5              ║
-- ║      Actions 2-5 start: 5→4→3→2→1 (not ready)                             ║
-- ║      Action 6  start: 1→0 (READY ✓ — 4 skipped turns)                     ║
-- ║                                                                              ║
-- ║  Run: Supabase Dashboard → SQL Editor → Run                                ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  src text;
BEGIN
  -- Fetch current function definition (returned as "CREATE OR REPLACE FUNCTION ...")
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  p.proname = 'rpc_simulate_battle'
    AND  n.nspname = 'public'
  ORDER  BY p.oid DESC
  LIMIT  1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'rpc_simulate_battle not found — run patch_v7_7 first';
  END IF;

  -- ── Fix 1: SK1 reset value  2 → 3 ─────────────────────────────────────────
  src := replace(src,
    'jsonb_set(v_units,ARRAY[v_auid,''sk1_cd''],to_jsonb(2))',
    'jsonb_set(v_units,ARRAY[v_auid,''sk1_cd''],to_jsonb(3))');

  -- ── Fix 2: SK2 reset value  4 → 5 ─────────────────────────────────────────
  src := replace(src,
    'jsonb_set(v_units,ARRAY[v_auid,''sk2_cd''],to_jsonb(4))',
    'jsonb_set(v_units,ARRAY[v_auid,''sk2_cd''],to_jsonb(5))');

  -- Re-install the patched function
  EXECUTE src;

  RAISE NOTICE 'patch_v7_8 applied: sk1_cd → 3, sk2_cd → 5';
END;
$$;

-- Preserve original permissions
REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) TO authenticated;
