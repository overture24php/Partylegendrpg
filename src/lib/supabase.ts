import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// ─── Strict singleton — prevents multiple GoTrueClient instances ──────────
// Attached to globalThis so React HMR/StrictMode doesn't create duplicates.
const _GLOBAL_KEY = `__sb_${projectId}`;
declare global {
  // eslint-disable-next-line no-var
  var __sbRegistry: Record<string, SupabaseClient> | undefined;
}
if (!globalThis.__sbRegistry) {
  globalThis.__sbRegistry = {};
}

/**
 * Custom lock — bypasses the Web LockManager (avoids "lock timeout" errors
 * caused by React StrictMode double-mount or orphaned locks).
 * Operations are still sequential within the same client via Promise chaining.
 */
const _processLocks: Record<string, Promise<unknown>> = {};
function customLock<T>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>
): Promise<T> {
  const prev = (_processLocks[name] ?? Promise.resolve()) as Promise<unknown>;
  const next = prev.then(fn, fn); // always proceed even if prev rejected
  _processLocks[name] = next.catch(() => {});
  return next as Promise<T>;
}

export function getSupabase(): SupabaseClient {
  if (globalThis.__sbRegistry![_GLOBAL_KEY]) {
    return globalThis.__sbRegistry![_GLOBAL_KEY];
  }

  const client = createClient(
    `https://${projectId}.supabase.co`,
    publicAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: `sb-${projectId}-auth-token`,
        // Custom lock prevents Web LockManager timeouts & multiple-instance conflicts
        lock: customLock,
        lockAcquireTimeout: 30_000,
      },
    }
  );

  globalThis.__sbRegistry![_GLOBAL_KEY] = client;
  console.log('[Supabase] ✓ Singleton initialized');
  return client;
}
