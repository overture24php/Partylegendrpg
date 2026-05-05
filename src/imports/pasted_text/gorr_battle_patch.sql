-- ═══════════════════════════════════════════════════════════════════════════
-- GORR BATTLE PATCH — semua 5 skill slot (0=basic, 1=sk1, 2=sk2, 3=passive, 4=ult)
-- Jalankan di Supabase SQL Editor (Settings → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── STEP 1: Diagnostic — cek apa yang ada sekarang ─────────────────────────
SELECT skill_slot, skill_name, min_level, damage_ratio, target_type, skill_type, effect_type
FROM hero_skills
WHERE hero_id = 'gorr'
ORDER BY skill_slot;

-- ─── STEP 2: Cek skema kolom tabel hero_skills ──────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hero_skills'
ORDER BY ordinal_position;

-- ─── STEP 3: Cek fungsi rpc_simulate_battle yang benar (OID 18193) ──────────
-- Fungsi ini menerima p_hero_entries JSONB, bukan p_hero_ids text
SELECT oid, proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'rpc_simulate_battle';

-- Tampilkan body fungsi yg dipanggil client (p_hero_entries jsonb):
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'rpc_simulate_battle'
  AND pg_get_function_identity_arguments(oid) LIKE '%hero_entries%';

-- ─── STEP 4: DELETE skill lama Gorr, INSERT ulang semua 5 slot ──────────────
-- PENTING: Sesuaikan kolom di INSERT jika skema berbeda dari asumsi di bawah.
-- Lihat hasil STEP 2 untuk kolom yang ada.

DELETE FROM hero_skills WHERE hero_id = 'gorr';

INSERT INTO hero_skills
  (hero_id, skill_slot, skill_name, min_level, damage_ratio, target_type, skill_type, effect_type, effect_duration, lifesteal_ratio, aoe_targets)
VALUES
-- slot 0: Basic Attack — single melee, physical, no effect
('gorr', 0, 'Savage Strike',   1,  1.00, 'single',  'physical', NULL,      0, 0.00, 1),
-- slot 1: SK1 — Gaping Wound, unlocks Lv1, applies Bleed 3 turns
('gorr', 1, 'Gaping Wound',    1,  1.55, 'single',  'physical', 'bleed',   3, 0.00, 1),
-- slot 2: SK2 — Terror Slash, unlocks Lv21, applies Terrify 2 turns (reduces ATK 20%)
('gorr', 2, 'Terror Slash',    21, 1.75, 'single',  'physical', 'terrify', 2, 0.00, 1),
-- slot 3: Passive — Blood Feast, unlocks Lv41, lifesteal 15% of damage dealt + Bleed tick proc
-- Passive fires as a separate event when Bleed DoT ticks (skill_dtype='bleed')
-- AND restores Gorr's HP via lifesteal_ratio on every hit
('gorr', 3, 'Blood Feast',     41, 0.30, 'self',    'physical', 'bleed_tick', 0, 0.15, 0),
-- slot 4: ULT — Bloodbath, unlocks Lv61, AoE melee (all front-row enemies), 3 hits
('gorr', 4, 'Bloodbath',       61, 1.20, 'aoe_front','physical', NULL,      0, 0.00, 3);

-- ─── STEP 5: Verifikasi hasil INSERT ────────────────────────────────────────
SELECT skill_slot, skill_name, min_level, damage_ratio, target_type, skill_type, effect_type, lifesteal_ratio
FROM hero_skills
WHERE hero_id = 'gorr'
ORDER BY skill_slot;


-- ═══════════════════════════════════════════════════════════════════════════
-- CATATAN PENTING UNTUK PATCHING FUNGSI rpc_simulate_battle
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ARSITEKTUR 5 SKILL SLOT (WAJIB DIPERTAHANKAN):
--   slot 0 = basic attack   (selalu tersedia, semua hero)
--   slot 1 = skill 1        (unlock min_level SK1)
--   slot 2 = skill 2        (unlock min_level SK2)
--   slot 3 = skill PASIF    (unlock min_level passive) ← JANGAN DIHAPUS/SKIP
--   slot 4 = ultimate       (unlock min_level ULT)
--
-- PASSIVE (slot 3) WAJIB menghasilkan event dengan:
--   { type: 'skill', skill_slot: 3, skill_name: 'Blood Feast',
--     skill_dtype: 'bleed',   ← penting! client pakai ini untuk float 🩸
--     actor: gorr_uid,
--     targets: [
--       { uid: bleed_target_uid, dmg: X, hp_after: Y, died: false, ... },
--       { uid: gorr_uid, heal: Z, hp_after: W, ... }   ← lifesteal heal
--     ]
--   }
--
-- SKILL UNLOCK di dalam fungsi SQL (sama persis seperti Emma/Lucas):
--   IF hero_level >= sk.min_level THEN  ← gunakan >= bukan >
--
-- ULT TIDAK KELUAR di Lv 61:
--   Cek apakah kondisi di SQL adalah:
--     hero_level >= 61          ← BENAR
--   Bukan:
--     hero_level > 61           ← SALAH (butuh Lv 62)
--   Atau:
--     hero_level >= v_ult_min_level  ← BENAR jika v_ult_min_level = 61
--
-- UNTUK MELIHAT BODY FUNGSI YANG DIPANGGIL CLIENT:
--   Lihat hasil STEP 3 di atas.
--   Cari bagian WHERE skill_slot = 4 atau skill_slot = 3.
--   Pastikan kondisi >= bukan >.
--
-- GORR RAGE SYSTEM (sama seperti Lucas/Emma):
--   rage >= 100 → gunakan ULT (slot 4), reset rage = 0
--   rage >= 60  → gunakan SK2 (slot 2) jika belum terpakai
--   rage >= 30  → gunakan SK1 (slot 1) jika belum terpakai
--   default     → basic attack (slot 0)
--   passive (slot 3) tidak dipilih via rage → dipicu oleh kondisi (Bleed tick setiap ronde)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- TEMPLATE PATCH FUNGSI (gunakan setelah lihat body fungsi dari STEP 3)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ganti CREATE OR REPLACE FUNCTION rpc_simulate_battle(...) di fungsi OID 18193
-- dengan versi yang sudah diperbaiki.
--
-- Bagian yang perlu diperbaiki:
--
-- 1. SKILL UNLOCK CHECK — pastikan semua slot pakai >=:
--    (tidak perlu ubah jika sudah pakai >= di Lucas/Emma)
--
-- 2. PASSIVE TICK GORR — tambahkan di awal loop ronde sebelum ATB:
--    -- Gorr Bleed tick: untuk setiap musuh dengan status bleed
--    FOR v_bleed_target IN (SELECT uid FROM battle_status WHERE effect='bleed' AND caster_uid = gorr_uid) LOOP
--      v_bleed_dmg := ROUND(gorr_atk * gorr_sk3_ratio);
--      v_lifesteal  := ROUND(v_bleed_dmg * gorr_lifesteal_ratio);
--      -- kurangi HP bleed_target, tambah HP Gorr
--      -- emit event: type='skill', skill_slot=3, skill_dtype='bleed', targets=[{target,dmg},{gorr,heal}]
--    END LOOP;
--
-- 3. ULT LEVEL CHECK — pastikan min_level Gorr slot 4 = 61 dan cek >=:
--    Sudah diset di STEP 4 di atas (min_level=61).
--    Pastikan fungsi SQL baca dari hero_skills.min_level, bukan hardcode.
