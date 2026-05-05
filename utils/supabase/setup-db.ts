/**
 * setup-db.ts
 * All DB operations use the service_role key via raw fetch.
 * This bypasses RLS completely — no GoTrueClient involved.
 */
import { projectId, serviceRoleKey } from './info';

const REST = `https://${projectId}.supabase.co/rest/v1`;

/** Headers for service-role requests (bypass RLS) */
const ADMIN_HEADERS: Record<string, string> = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

interface SetupResult {
  ok: boolean;
  msg: string;
  needsManualSQL?: string;
}

// ─── Parse PostgREST error body ────────────────────────────────────────────
async function parseErrBody(res: Response): Promise<{ code?: string; message?: string }> {
  try { return await res.json(); } catch { return {}; }
}

// ─── Attempt auto-create the profiles table via Supabase internal pg endpoint ─
async function tryAutoCreateTable(): Promise<boolean> {
  const endpoints = [
    // Supabase pg-meta endpoint (used internally by Studio)
    `https://${projectId}.supabase.co/pg/query`,
    // Supabase REST rpc exec_sql (works if function already exists)
    `${REST}/rpc/exec_sql`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...ADMIN_HEADERS },
        body: JSON.stringify({ query: SQL_SCHEMA }),
      });
      if (res.ok) {
        console.log('[DB] ✓ Auto-created table via', url);
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

// ─── setupDatabase ─────────────────────────────────────────────────────────
export async function setupDatabase(): Promise<SetupResult> {
  try {
    // Use service_role fetch — bypasses all RLS
    const res = await fetch(`${REST}/profiles?select=id&limit=1`, {
      method: 'GET',
      headers: ADMIN_HEADERS,
    });

    if (res.ok) {
      console.log('[DB] ✓ Schema verified (service_role)');
      return { ok: true, msg: 'DB ready' };
    }

    const err = await parseErrBody(res);
    const isNotFound =
      res.status === 404 ||
      err?.code === 'PGRST200' ||
      (err?.message ?? '').includes('not find the table');

    if (isNotFound) {
      console.warn('[DB] ⚠️  Table "profiles" not found — attempting auto-create...');
      const created = await tryAutoCreateTable();
      if (created) {
        // Reload PostgREST schema cache
        await fetch(`${REST}/`, { method: 'GET', headers: ADMIN_HEADERS }).catch(() => {});
        console.log('[DB] ✓ Table created + schema reloaded');
        return { ok: true, msg: 'DB auto-created' };
      }

      console.error('[DB] ✗ Auto-create failed. Manual SQL required.');
      return { ok: false, msg: 'Table not found', needsManualSQL: SQL_SCHEMA };
    }

    // Any other error — log but don't block the app
    console.error('[DB] ✗ Unexpected check error:', err);
    return { ok: false, msg: err?.message ?? `HTTP ${res.status}` };

  } catch (e) {
    console.error('[DB] ✗ Network exception:', e);
    return { ok: false, msg: String(e) };
  }
}

// ─── upsertProfile ─────────────────────────────────────────────────────────
export async function upsertProfile(p: {
  id: string;
  email: string;
  username: string;
  nickname: string;
  level: number;
  xp: number;
  maxXp: number;
  exp_percentage: number;
  gold: number;
  gems: number;
  power: number;
  hero_exp: number;
  vip_level?: number;
  vip_exp?: number;
  breakthrough_stones?: number;
  chapter1_progress?: number;
}): Promise<{ err?: string }> {
  try {
    const res = await fetch(`${REST}/profiles`, {
      method: 'POST',
      headers: {
        ...ADMIN_HEADERS,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: p.id,
        email: p.email,
        username: p.username,
        nickname: p.nickname,
        level: p.level,
        xp: p.xp,
        max_xp: p.maxXp,
        exp_percentage: p.exp_percentage,
        gold: Math.round(p.gold),
        gems: Math.round(p.gems),
        power: Math.round(p.power),
        hero_exp: Math.round(p.hero_exp),
        vip_level: Math.round(p.vip_level ?? 0),
        vip_exp:   Math.round(p.vip_exp   ?? 0),
        breakthrough_stones: Math.round(p.breakthrough_stones ?? 0),
        // chapter1_progress intentionally NOT sent here — server-authoritative
      }),
    });
    if (!res.ok) {
      const err = await parseErrBody(res);
      return { err: err?.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (e) {
    return { err: String(e) };
  }
}

// ─── fetchProfile ──────────────────────────────────────────────────────────
export async function fetchProfile(userId: string): Promise<{
  prof?: {
    id: string; email: string; username: string; nickname: string;
    level: number; xp: number; maxXp: number; exp_percentage: number;
    gold: number; gems: number; power: number; hero_exp: number; createdAt: string;
    vip_level: number; vip_exp: number; breakthrough_stones: number; chapter1_progress: number;
  };
  err?: string;
}> {
  try {
    const res = await fetch(
      `${REST}/profiles?id=eq.${encodeURIComponent(userId)}&limit=1`,
      { method: 'GET', headers: ADMIN_HEADERS }
    );
    if (!res.ok) {
      const err = await parseErrBody(res);
      return { err: err?.message ?? `HTTP ${res.status}` };
    }
    const rows: Record<string, unknown>[] = await res.json();
    if (!rows || rows.length === 0) return { err: 'Not found' };
    const d = rows[0];
    return {
      prof: {
        id:             String(d.id),
        email:          String(d.email ?? ''),
        username:       String(d.username ?? ''),
        nickname:       String(d.nickname ?? 'New Player'),
        level:          Number(d.level ?? 0),
        xp:             Number(d.xp ?? 0),
        maxXp:          Number(d.max_xp ?? 100),
        exp_percentage: Number(d.exp_percentage ?? 0),
        gold:           Math.round(Number(d.gold ?? 0)),
        gems:           Math.round(Number(d.gems ?? 0)),
        power:          Math.round(Number(d.power ?? 0)),
        hero_exp:       Math.round(Number(d.hero_exp ?? 0)),
        createdAt:      String(d.created_at ?? new Date().toISOString()),
        vip_level:      Math.round(Number(d.vip_level ?? 0)),
        vip_exp:        Math.round(Number(d.vip_exp   ?? 0)),
        breakthrough_stones: Math.round(Number(d.breakthrough_stones ?? 0)),
        chapter1_progress:   Math.round(Number(d.chapter1_progress ?? 0)),
      },
    };
  } catch (e) {
    return { err: String(e) };
  }
}

// ─── findEmailByUsername ───────────────────────────────────────────────────
export async function findEmailByUsername(username: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${REST}/profiles?username=eq.${encodeURIComponent(username)}&select=email&limit=1`,
      { method: 'GET', headers: ADMIN_HEADERS }
    );
    if (!res.ok) return null;
    const rows: { email: string }[] = await res.json();
    return rows?.[0]?.email ?? null;
  } catch {
    return null;
  }
}

// ─── SQL Schema (for manual fallback) ──────────────────────────────────────
const SQL_SCHEMA = `
-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  RPG Game — Profiles Table Setup                                 ║
-- ║  Run once in: Supabase Dashboard → SQL Editor                   ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  username       TEXT UNIQUE NOT NULL,
  nickname       TEXT DEFAULT 'New Player',
  level          INTEGER DEFAULT 1,
  xp             INTEGER DEFAULT 0,
  max_xp         INTEGER DEFAULT 100,
  exp_percentage INTEGER DEFAULT 0,
  gold           INTEGER DEFAULT 0,
  gems           INTEGER DEFAULT 0,
  power          INTEGER DEFAULT 0,
  hero_exp       INTEGER DEFAULT 0,
  createdAt      TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  vip_level      INTEGER DEFAULT 0,
  vip_exp        INTEGER DEFAULT 0,
  breakthrough_stones INTEGER DEFAULT 0,
  chapter1_progress   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Migration: add new columns to existing tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_level INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_exp   INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS breakthrough_stones INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chapter1_progress   INTEGER DEFAULT 0;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, nickname, level, xp, max_xp, exp_percentage, gold, gems, power, hero_exp, vip_level, vip_exp)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    'New Player',
    0, 0, 100, 0, 0, 0, 0, 0, 0, 0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`;