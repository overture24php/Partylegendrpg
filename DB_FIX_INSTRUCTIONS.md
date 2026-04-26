# 🔧 FIX: Currency Indicator Not Updating

## Problem
Database memiliki 900 gold & 30900 gems, tapi UI menampilkan 500 gold & 30 gems (default values).

## Root Cause
Prioritas load profile salah: localStorage di-check duluan sebelum DB, sehingga data lama di localStorage override data terbaru dari DB.

## ✅ Changes Applied

### 1. Fixed `resolveProfile()` Priority
**Before:** localStorage → DB → defaults  
**After:** **DB → localStorage → defaults**

```typescript
// OLD (WRONG):
const cached = lsLoad(userId);
if (cached) return cached;  // ← Langsung return tanpa check DB!

// NEW (CORRECT):
const dbResult = await fetchProfile(userId);
if (dbResult.prof) {
  lsSave(dbResult.prof);
  return dbResult.prof;  // ← DB jadi source of truth
}
```

### 2. Fixed `refreshProfile()`
Sekarang fetch dari DB, bukan localStorage:

```typescript
// OLD: Re-read localStorage (stale)
// NEW: Re-fetch from DB (fresh)
const dbResult = await fetchProfile(session.user.id);
if (dbResult.prof) {
  lsSave(dbResult.prof);
  setUser(dbResult.prof);
}
```

### 3. Added Debug Panel
Press **Ctrl+D** di GameStartPage untuk toggle debug panel yang menampilkan:
- Current gold/gems values
- User ID & username
- localStorage status
- Manual refresh button

## 📋 Testing Checklist

### Step 1: Verify DB Setup
1. Open browser console
2. Login dengan akun test (85hz4sf@zenvex.edu.pl)
3. Check console logs:
   ```
   [Profile] ✓ from DB (gold: 900 gems: 30900)
   ```
4. Jika muncul `[Profile] ⚠️ DB failed`, table `profiles` belum di-setup

### Step 2: Manual SQL Setup (if needed)
1. Buka [Supabase SQL Editor](https://supabase.com/dashboard/project/cyecgzghfxtrurzzbfif/sql/new)
2. Copy SQL dari `supabase/migrations/001_initial_schema.sql`
3. Paste & Run
4. Refresh app → login ulang

### Step 3: Verify Currency Update
1. Login → Gold/Gems harus match DB values
2. Press **Ctrl+D** → Debug panel muncul
3. Click "🔄 Refresh from DB" → Values updated
4. Check console: `[Profile] ✓ refreshed from DB`

### Step 4: Test Multi-Device Sync
1. Update gold di DB manual:
   ```sql
   UPDATE profiles
   SET gold = 1500, gems = 50000
   WHERE email = '85hz4sf@zenvex.edu.pl';
   ```
2. Di app: Press Ctrl+D → Click Refresh
3. Values harus langsung update ke 1500 gold & 50000 gems

## 🐛 Debugging

### Console Logs to Watch
```
[DB] ✓ DB ready                          ← DB connection OK
[Profile] ✓ from DB (gold: X gems: Y)   ← Profile loaded from DB
[GameStart] Initial user: {...}          ← Component mount
[GameStart] Auto-refresh currency...     ← Every 30s auto-refresh
```

### If Still Showing Default Values
1. Check browser console for errors
2. Verify table `profiles` exists in Supabase
3. Verify user email exists in `profiles` table
4. Clear localStorage: `localStorage.clear()` → login ulang
5. Use debug panel (Ctrl+D) to manually refresh

## 🎯 Expected Behavior Now

### Login Flow
```
User login
  ↓
Check DB first (await fetchProfile)
  ↓
If found: Use DB values (900 gold, 30900 gems)
  ↓
Update localStorage cache
  ↓
Display in UI ✅
```

### Auto-Refresh (Every 30s)
```
Timer tick
  ↓
Fetch latest from DB
  ↓
Update localStorage
  ↓
Update state → UI reflects latest values
```

### Manual Refresh (Ctrl+D panel)
```
Click "Refresh from DB"
  ↓
Force fetch from DB
  ↓
Update UI immediately
```

## 📁 Modified Files
- ✅ `src/app/context/AuthContext.tsx` - Fixed priority: DB first
- ✅ `src/app/pages/GameStartPage.tsx` - Added debug import & logs
- ✅ `src/app/components/CurrencyDebug.tsx` - New debug panel (Ctrl+D)
- ✅ `utils/supabase/setup-db.ts` - Updated SQL schema with auto-trigger

## 🚀 Next Steps
1. Login dengan akun test
2. Verify console logs show DB values
3. Verify UI shows correct gold/gems from DB
4. Use Ctrl+D panel untuk debug jika ada masalah
