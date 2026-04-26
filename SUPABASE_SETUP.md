# Supabase Auto-Setup Guide

## Konfigurasi Supabase sudah siap!

Project ID: `cyecgzghfxtrurzzbfif`
Anon Key: ✅ Configured

## Setup Database (1x saja)

### Opsi 1: Manual via Dashboard
1. Buka [Supabase Dashboard](https://supabase.com/dashboard/project/cyecgzghfxtrurzzbfif)
2. Klik **SQL Editor** di sidebar
3. Copy-paste SQL berikut, lalu klik **Run**:

```sql
-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  max_xp INTEGER DEFAULT 100,
  gold INTEGER DEFAULT 500,
  gems INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Username lookup index
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger: auto-update updated_at
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

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, level, xp, max_xp, gold, gems)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    1,
    0,
    100,
    500,
    30
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Opsi 2: CLI (jika punya Supabase CLI)
```bash
supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.cyecgzghfxtrurzzbfif.supabase.co:5432/postgres"
```

## Cara Kerja Auto-Sync

### Register Flow
1. User register → Supabase Auth creates user
2. Profile auto-created di DB dengan default values (gold: 500, gems: 30)
3. Profile di-cache ke localStorage untuk offline-first access

### Login Flow
1. Username lookup:
   - Cek DB dulu (via `findEmailByUsername()`)
   - Fallback ke localStorage scan
   - Fallback ke direct login (jika username = email)
2. Profile loaded dari localStorage (instant)
3. Background sync dari DB (jika ada update dari device lain)

### Update Flow
1. `updateProfile({ gold: 1000 })` → Update localStorage (instant)
2. Background sync ke DB via `upsertProfile()` (fire-and-forget)
3. Jika offline: tersimpan di localStorage, sync otomatis saat online

## Fitur
- ✅ **FULL AUTO-SETUP**: Profile auto-created via DB trigger saat signup
- ✅ Auto-detect missing table
- ✅ Username lookup from DB
- ✅ Offline-first architecture
- ✅ Auto-sync gold/gems ke DB
- ✅ RLS policies untuk security
- ✅ Auto-timestamp triggers
- ✅ **ZERO manual intervention** setelah run SQL 1x

## Troubleshooting

### Table not found error
→ Run SQL migration di dashboard (lihat Opsi 1)

### Duplicate username error
→ Username sudah dipakai user lain, pilih username lain

### Profile not syncing
→ Check console logs: `[DB]`, `[Sync]`, `[Load]` untuk debug info
