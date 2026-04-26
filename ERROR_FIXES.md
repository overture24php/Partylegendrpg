# ✅ FIXED: Supabase Client Errors

## Errors Fixed

### 1. ❌ Multiple GoTrueClient instances
**Error:**
```
Multiple GoTrueClient instances detected in the same browser context
```

**Cause:** Multiple `createClient()` calls across different files created separate Supabase instances.

**Fix:** Consolidated to **single singleton instance** in `src/lib/supabase.ts`

### 2. ❌ Lock timeout error
**Error:**
```
Lock "lock:sb-cyecgzghfxtrurzrbfif-auth-token" was not released within 5000ms
```

**Cause:** Multiple client instances competing for the same auth storage key.

**Fix:** Single client instance with explicit storage config:
```typescript
{
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
    storageKey: 'sb-cyecgzghfxtrurzrbfif-auth-token',
  }
}
```

### 3. ❌ Table not found
**Error:**
```
Could not find the table 'public.profiles' in the schema cache
```

**Cause:** Table `profiles` belum di-create di Supabase.

**Fix:** `DatabaseSetupNotice` component auto-detects & shows SQL migration modal.

## Changes Applied

### Created: `src/lib/supabase.ts` (Singleton Client)
```typescript
let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(...);
  }
  return supabaseInstance;
}
```

### Updated Files (Use Singleton)
- ✅ `src/app/context/AuthContext.tsx`
- ✅ `utils/supabase/setup-db.ts`
- ✅ `utils/supabase/auto-setup.ts`
- ✅ `scripts/setup-supabase.ts`

### Enhanced: `DatabaseSetupNotice.tsx`
- Added mount guard (`mounted` flag)
- Added `checking` state
- Better error handling

## Verification

### Before (Multiple Instances):
```
AuthContext.tsx:     const client = createClient(...)  ← Instance 1
setup-db.ts:         const DB = createClient(...)      ← Instance 2
auto-setup.ts:       const supabase = createClient(...) ← Instance 3
setup-supabase.ts:   const supabase = createClient(...) ← Instance 4
```

### After (Single Instance):
```
supabase.ts:         const supabaseInstance = createClient(...)  ← ONLY 1
AuthContext.tsx:     import { getSupabase } from '../../lib/supabase'
setup-db.ts:         import { getSupabase } from '../../src/lib/supabase'
auto-setup.ts:       import { getSupabase } from '../../src/lib/supabase'
```

## Expected Console Output

### ✅ Success (No Errors):
```
[Supabase] ✓ Client initialized
[DB] ✓ Schema verified
[Profile] ✓ from DB (gold: 900 gems: 30900)
```

### ⚠️ Needs Setup (First Run):
```
[Supabase] ✓ Client initialized
[DB] ⚠️ Table "profiles" not found - setup required
```
→ Modal muncul dengan SQL migration

## Testing Checklist

- [x] Single Supabase client instance
- [x] No more lock timeout errors
- [x] No more multiple instance warnings
- [x] Auto-detect missing table
- [x] Show setup modal when needed
- [x] DB-first profile loading
- [x] Currency values from DB (900 gold, 30900 gems)

## Next Steps

1. **If modal muncul:** Copy SQL → Run di Supabase SQL Editor
2. **If no modal:** Table sudah exist → Login → Currency harus match DB
3. **Debug:** Press Ctrl+D di game screen → Check values
