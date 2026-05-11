/**
 * setup-db.ts
 * All DB operations use the service_role key via raw fetch.
 * This bypasses RLS completely — no GoTrueClient involved.
 */
import { projectId, serviceRoleKey } from './info';
import { generateStageData } from '../../src/app/data/stageData';

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

// ─── seedStageData ─────────────────────────────────────────────────────────
// Ensures `stage_enemies` and `stage_definitions` have CORRECT data for ALL
// 5 × 40 = 200 stages.
//
// Root-cause history:
//   • Old DB had stages 1-1→1-19 seeded (correct) but 1-20→5-40 missing.
//   • Old "already seeded" guard checked ANY row → skipped re-seed → bug.
//   • stage 1-20 had wrong (stale) enemies because old seed used different
//     algorithm; client info-panel and battle showed different heroes.
//
// Strategy: count stage_definitions rows.
//   - If count === 200 AND stage_enemies count reasonable: skip (fast path).
//   - Otherwise: DELETE everything and INSERT fresh from generateStageData().

let _stageSeeded = false;

// Single source of truth: generateStageData() drives info panel AND DB enemies.
function buildAllStageRows() {
  type EnemyRow = {
    stage_id: string; enemy_hero_id: string;
    slot_position: number; enemy_level: number; order_index: number;
  };
  type DefRow = {
    stage_id: string;
    gold_reward: number; gem_reward: number;
    exp_reward: number; hero_exp_reward: number;
  };

  const enemyRows: EnemyRow[] = [];
  const defRows:   DefRow[]   = [];

  for (let ch = 1; ch <= 5; ch++) {
    for (let st = 1; st <= 40; st++) {
      const stageId    = `${ch}-${st}`;
      const data       = generateStageData(ch, st);
      const baseLevel  = (ch - 1) * 40;
      const enemyLevel = Math.max(1, baseLevel + Math.floor((st - 1) * 0.85) + (data.isBoss ? 8 : 0));

      data.enemySlots.forEach((heroId, slotIdx) => {
        if (heroId) {
          enemyRows.push({
            stage_id:      stageId,
            enemy_hero_id: heroId,
            slot_position: slotIdx,
            enemy_level:   enemyLevel,
            order_index:   slotIdx,
          });
        }
      });

      defRows.push({
        stage_id:        stageId,
        gold_reward:     data.rewards.gold,
        gem_reward:      data.rewards.gems,
        exp_reward:      data.rewards.exp,
        hero_exp_reward: data.rewards.heroExp,
      });
    }
  }

  return { enemyRows, defRows };
}

export async function seedStageData(): Promise<void> {
  if (_stageSeeded) return;

  // ── Count rows via HEAD (no body data transferred) ─────────────────────────
  let defCount = 0;
  try {
    const head = await fetch(`${REST}/stage_definitions?select=stage_id`, {
      method: 'HEAD',
      headers: { ...ADMIN_HEADERS, Prefer: 'count=exact' },
    });
    const range = head.headers.get('content-range'); // "0-199/200"
    defCount = range ? parseInt(range.split('/')[1] ?? '0', 10) : 0;
  } catch { /* defCount stays 0 → triggers re-seed */ }

  let enemyCount = 0;
  try {
    const head = await fetch(`${REST}/stage_enemies?select=stage_id`, {
      method: 'HEAD',
      headers: { ...ADMIN_HEADERS, Prefer: 'count=exact' },
    });
    const range = head.headers.get('content-range');
    enemyCount = range ? parseInt(range.split('/')[1] ?? '0', 10) : 0;
  } catch { /* enemyCount stays 0 → triggers re-seed */ }

  // ── Fast path: all 200 defs + at least 400 enemy rows ─────────────────────
  if (defCount >= 200 && enemyCount >= 400) {
    _stageSeeded = true;
    console.log(`[StageData] ✓ Already complete (defs=${defCount}, enemies=${enemyCount})`);
    return;
  }

  console.log(`[StageData] Re-seeding… (defs=${defCount}/200, enemies=${enemyCount})`);

  // ── DELETE all stale data first (prevents duplicate rows) ─────────────────
  // PostgREST requires a filter; "not.is.null" matches all non-null rows.
  try {
    await fetch(`${REST}/stage_enemies?stage_id=not.is.null`, {
      method: 'DELETE', headers: ADMIN_HEADERS,
    });
  } catch { /* best-effort */ }
  try {
    await fetch(`${REST}/stage_definitions?stage_id=not.is.null`, {
      method: 'DELETE', headers: ADMIN_HEADERS,
    });
  } catch { /* best-effort */ }

  // ── Build and INSERT fresh data in batches ─────────────────────────────────
  const { enemyRows, defRows } = buildAllStageRows();
  const BATCH = 80;

  for (let i = 0; i < defRows.length; i += BATCH) {
    try {
      const res = await fetch(`${REST}/stage_definitions`, {
        method: 'POST',
        headers: { ...ADMIN_HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify(defRows.slice(i, i + BATCH)),
      });
      if (!res.ok) console.warn('[StageData] def insert error:', res.status, await res.text().catch(() => ''));
    } catch (e) { console.warn('[StageData] def exception:', e); }
  }

  for (let i = 0; i < enemyRows.length; i += BATCH) {
    try {
      const res = await fetch(`${REST}/stage_enemies`, {
        method: 'POST',
        headers: { ...ADMIN_HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify(enemyRows.slice(i, i + BATCH)),
      });
      if (!res.ok) console.warn('[StageData] enemy insert error:', res.status, await res.text().catch(() => ''));
    } catch (e) { console.warn('[StageData] enemy exception:', e); }
  }

  _stageSeeded = true;
  console.log(`[StageData] ✓ Seeded ${defRows.length} defs + ${enemyRows.length} enemy rows`);
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

// ─── SQL Schema (for manual fallback) ─────────────────────────────────────
const SQL_SCHEMA = `
-- ╔═════════════════════════════════��════════════════════════════════╗
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