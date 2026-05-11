-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v18 — Fix Registration: "database error saving new user"              ║
-- ║                                                                              ║
-- ║  ROOT CAUSE:                                                                 ║
-- ║  handle_new_user trigger failed silently on:                                 ║
-- ║    1. UNIQUE violation on `username` (e.g. two users with same email prefix) ║
-- ║    2. Missing columns (breakthrough_stones, chapter1_progress)               ║
-- ║    3. No exception handling — any error crashes the trigger                  ║
-- ║       → Supabase rolls back auth.users INSERT                                ║
-- ║       → Client sees "database error saving new user"                         ║
-- ║                                                                              ║
-- ║  FIX:                                                                        ║
-- ║    - Wrap INSERT in BEGIN/EXCEPTION block                                    ║
-- ║    - Auto-append numeric suffix on username conflict (_1, _2 ... _10)        ║
-- ║    - Final fallback: use UUID prefix for guaranteed uniqueness               ║
-- ║    - Include ALL profile columns with sane defaults                          ║
-- ║    - RETURN NEW always fires → auth.users insert never blocked               ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── Ensure profiles table has all required columns ────────────────────────────
-- (idempotent — safe to run even if columns already exist)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_level           INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_exp             INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS breakthrough_stones INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chapter1_progress   INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hero_exp            INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS power               INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname            TEXT    DEFAULT 'New Player';

-- ── Robust handle_new_user — never crashes, handles username conflicts ─────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base     TEXT;
  v_username TEXT;
  v_i        INT := 0;
BEGIN
  -- Derive base username: metadata → email prefix → uuid prefix (guaranteed unique)
  v_base := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'hero_' || substr(NEW.id::TEXT, 1, 8)
  );
  v_username := v_base;

  -- Retry loop: append _1, _2 ... _10 on UNIQUE conflict, then use UUID suffix
  LOOP
    BEGIN
      INSERT INTO public.profiles (
        id,       email,              username,   nickname,
        level,    xp,                 max_xp,     exp_percentage,
        gold,     gems,               power,      hero_exp,
        vip_level, vip_exp,
        breakthrough_stones,          chapter1_progress
      ) VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        v_username,
        v_username,           -- nickname defaults to same as username
        1, 0, 960, 0,         -- level 1, 0 xp, 960 max_xp to reach Lv2, 0%
        2000, 50, 0, 1000,    -- starter: 2000 gold, 50 gems, 1000 hero_exp
        0, 0,                 -- vip_level, vip_exp
        10, 0                 -- 10 breakthrough_stones, chapter1_progress=0
      )
      ON CONFLICT (id) DO NOTHING; -- safe retry: never overwrites existing profile
      RETURN NEW;                  -- success → allow auth.users insert to complete

    EXCEPTION WHEN unique_violation THEN
      -- Username taken → try with numeric suffix
      v_i := v_i + 1;
      IF v_i > 10 THEN
        -- All suffixes exhausted → guaranteed-unique UUID-based username
        v_username := v_base || '_' || substr(replace(NEW.id::TEXT, '-', ''), 1, 8);
      ELSE
        v_username := v_base || '_' || v_i;
      END IF;

    WHEN OTHERS THEN
      -- Any other error: log and still return NEW to unblock auth signup
      -- Profile can be created on first login via client-side upsert fallback
      RAISE WARNING '[handle_new_user] Profile insert failed for user %: %', NEW.id, SQLERRM;
      RETURN NEW;
    END;
  END LOOP;
END;
$$;

-- ── Recreate trigger (idempotent) ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Fix any existing profiles stuck at level 0 ───────────────────────────────
UPDATE public.profiles
SET level = 1, max_xp = 960
WHERE level < 1;

-- ── Verify: check trigger is live ────────────────────────────────────────────
SELECT
  trigger_name,
  event_manipulation,
  event_object_schema,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';