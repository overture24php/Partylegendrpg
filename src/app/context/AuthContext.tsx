import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';
import { setupDatabase, upsertProfile, fetchProfile, findEmailByUsername } from '/utils/supabase/setup-db';
import {
  getMaxXpForLevel,
  addExp,
  hydrateLevelState,
  LevelState,
} from '../utils/expSystem';

// ─── DB ready guard (module-level, shared across HMR) ─────────────────────
let _dbReady = false;
let _dbChecking: Promise<void> | null = null;

function ensureDB(): Promise<void> {
  if (_dbReady) return Promise.resolve();
  if (_dbChecking) return _dbChecking;
  _dbChecking = setupDatabase().then(res => {
    if (res.ok) {
      _dbReady = true;
      console.log('[DB] ✓', res.msg);
    } else {
      console.warn('[DB] ⚠️', res.msg);
      if (res.needsManualSQL) {
        console.log('[DB] Run in Supabase SQL Editor:\n', res.needsManualSQL);
      }
    }
    _dbChecking = null;
  });
  return _dbChecking;
}

// ─── Types ─────────────────────────────────────────────────────────────────
export interface UserProfile {
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
  vip_level: number;
  vip_exp: number;
  createdAt: string;
}

interface AuthContextType {
  user: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  loginByUsername: (username: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error?: string }>;
  refreshProfile: () => Promise<void>;
  /** Gain `amount` XP — auto handles multi-level-up cascade */
  gainExp: (amount: number) => Promise<{ leveledUp: boolean; newLevel: number }>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const asInt = (v: unknown, fb = 0): number =>
  typeof v === 'number' ? Math.round(v) : fb;

// ─── Helpers ────────────────────────────────────────────────────────────────
function applyLevelState(profile: UserProfile, ls: LevelState): UserProfile {
  return {
    ...profile,
    level:          ls.level,
    xp:             ls.xp,
    maxXp:          ls.maxXp,
    exp_percentage: ls.exp_percentage,
  };
}

// ─── JWT decode ─────────────────────────────────────────────────────────────
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

// ─── localStorage helpers ───────────────────────────────────────────────────
const LS_PREFIX = 'rp_profile:';

function lsLoad(userId: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + userId);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch { return null; }
}

function lsSave(profile: UserProfile): void {
  try { localStorage.setItem(LS_PREFIX + profile.id, JSON.stringify(profile)); } catch { /* noop */ }
}

function lsClear(userId: string): void {
  try { localStorage.removeItem(LS_PREFIX + userId); } catch { /* noop */ }
}

// ─── resolveProfile: DB → localStorage → JWT metadata → defaults ──────────
async function resolveProfile(session: Session): Promise<UserProfile> {
  const userId = session.user.id;
  const email  = session.user.email ?? '';

  // 1. Try DB (service_role fetch — bypasses RLS)
  const dbResult = await fetchProfile(userId);
  if (dbResult.prof) {
    // Re-derive maxXp from table (don't trust stored value)
    const ls = hydrateLevelState(
      dbResult.prof.level,
      dbResult.prof.xp,
      dbResult.prof.maxXp,
      dbResult.prof.exp_percentage,
    );
    const prof = applyLevelState({
      ...dbResult.prof,
      vip_level: dbResult.prof.vip_level ?? 0,
      vip_exp:   dbResult.prof.vip_exp   ?? 0,
    }, ls);
    lsSave(prof);
    console.log('[Profile] ✓ DB (gold:', prof.gold, 'gems:', prof.gems, 'lv:', prof.level, 'vip:', prof.vip_level, ')');
    return prof;
  }

  // 2. Fallback to localStorage
  const cached = lsLoad(userId);
  if (cached) {
    console.log('[Profile] ⚠️  DB unavailable, using localStorage');
    upsertProfile(cached); // best-effort sync
    return cached;
  }

  // 3. Seed defaults from JWT metadata
  const payload  = decodeJwt(session.access_token);
  const meta     = (payload?.user_metadata ?? session.user.user_metadata ?? {}) as Record<string, unknown>;
  const username = String(meta.username ?? email.split('@')[0] ?? 'Hero');

  const fresh: UserProfile = {
    id: userId, email, username,
    nickname: 'New Player',
    level: 0, xp: 0, maxXp: getMaxXpForLevel(0), exp_percentage: 0,
    gold: 500, gems: 30, power: 0, hero_exp: 0,
    vip_level: 0, vip_exp: 0,
    createdAt: new Date().toISOString(),
  };

  lsSave(fresh);
  upsertProfile(fresh);
  console.log('[Profile] ✓ Seeded defaults');
  return fresh;
}

// ─── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<UserProfile | null>(null);
  const [session, setSession]     = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let isMounted = true;

    // Kick off DB setup (non-blocking; DatabaseSetupNotice handles UI)
    ensureDB();

    // Resolve existing session
    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      const sess = data.session;
      if (sess) {
        setSession(sess);
        setUser(await resolveProfile(sess));
      }
      setIsLoading(false);
    }).catch(() => {
      if (isMounted) setIsLoading(false);
    });

    // Auth state listener — single subscription
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, sess) => {
        if (!isMounted) return;
        setSession(sess);
        if (sess) {
          const profile = await resolveProfile(sess);
          if (isMounted) setUser(profile);
        } else {
          setUser(null);
        }
        // Finish loading on first meaningful event
        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── refreshProfile ──────────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (!session) return;
    const dbResult = await fetchProfile(session.user.id);
    if (dbResult.prof) {
      lsSave(dbResult.prof);
      setUser(dbResult.prof);
      console.log('[Profile] ✓ Refreshed from DB');
    }
  }, [session]);

  // ── login ───────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<{ error?: string }> => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('invalid login') || msg.includes('invalid credentials'))
        return { error: 'Email atau password salah. Coba lagi.' };
      return { error: `Gagal login: ${error.message}` };
    }
    if (!data.session) return { error: 'Session tidak ditemukan.' };
    const profile = await resolveProfile(data.session);
    setUser(profile);
    setSession(data.session);
    return {};
  }, []);

  // ── loginByUsername ─────────────────────────────────────────────────────
  const loginByUsername = useCallback(async (
    username: string, password: string
  ): Promise<{ error?: string }> => {
    // 1. DB lookup (service_role, bypasses RLS)
    const email = await findEmailByUsername(username);
    if (email) return login(email, password);

    // 2. Scan localStorage fallback
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LS_PREFIX)) continue;
      try {
        const p: UserProfile = JSON.parse(localStorage.getItem(key)!);
        if (p.username === username) return login(p.email, password);
      } catch { /* skip */ }
    }

    // 3. Maybe username IS an email
    if (username.includes('@')) return login(username, password);

    return { error: 'Username tidak ditemukan.' };
  }, [login]);

  // ── register ────────────────────────────────────────────────────────────
  const register = useCallback(async (
    email: string, password: string, username: string
  ): Promise<{ error?: string }> => {
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username } },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Signup failed' };

    // Auto-login after signup
    const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr || !signIn.session)
      return { error: 'Akun dibuat, gagal auto-login. Coba login manual.' };

    // Seed profile immediately (trigger may not fire instantly)
    const profile: UserProfile = {
      id: data.user.id, email, username,
      nickname: 'New Player',
      level: 0, xp: 0, maxXp: getMaxXpForLevel(0), exp_percentage: 0,
      gold: 500, gems: 30, power: 0, hero_exp: 0,
      createdAt: new Date().toISOString(),
    };
    lsSave(profile);
    setUser(profile);
    setSession(signIn.session);

    // Upsert to DB (service_role, bypasses RLS)
    upsertProfile(profile);

    return {};
  }, []);

  // ── logout ────────────────────────────────���─────────────────────────────
  const logout = useCallback(async () => {
    if (user) lsClear(user.id);
    await getSupabase().auth.signOut();
    setUser(null);
    setSession(null);
  }, [user]);

  // ── updateProfile ───────────────────────────────────────────────────────
  const updateProfile = useCallback(async (
    updates: Partial<UserProfile>
  ): Promise<{ error?: string }> => {
    if (!user) return { error: 'Tidak ada profil aktif.' };

    let base: UserProfile = {
      ...user, ...updates,
      id:       user.id,
      email:    user.email,
      gold:     updates.gold !== undefined ? Math.round(updates.gold) : user.gold,
      gems:     updates.gems !== undefined ? Math.round(updates.gems) : user.gems,
      power:    updates.power !== undefined ? Math.round(updates.power) : user.power,
      hero_exp: updates.hero_exp !== undefined ? Math.round(updates.hero_exp) : user.hero_exp,
    };

    // If xp/level is being updated directly, re-validate through exp table
    if (updates.xp !== undefined || updates.level !== undefined) {
      const ls = hydrateLevelState(base.level, base.xp, base.maxXp, base.exp_percentage);
      base = applyLevelState(base, ls);
    }

    lsSave(base);
    setUser(base);
    upsertProfile(base);
    return {};
  }, [user]);

  // ── gainExp ──────────────────────────────────────────────────────────────
  const gainExp = useCallback(async (
    amount: number
  ): Promise<{ leveledUp: boolean; newLevel: number }> => {
    if (!user) return { leveledUp: false, newLevel: 0 };

    const prevLevel = user.level;
    const currentState = { level: user.level, xp: user.xp, maxXp: user.maxXp, exp_percentage: user.exp_percentage };
    const newState = addExp(currentState, amount);

    const updated = applyLevelState(user, newState);
    lsSave(updated);
    setUser(updated);
    upsertProfile(updated);

    const leveledUp = newState.level > prevLevel;
    if (leveledUp) {
      console.log(`[EXP] ✓ Level up! ${prevLevel} → ${newState.level}`);
    }
    return { leveledUp, newLevel: newState.level };
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user, session, isLoading,
      login, loginByUsername, register, logout,
      updateProfile, refreshProfile, gainExp,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}