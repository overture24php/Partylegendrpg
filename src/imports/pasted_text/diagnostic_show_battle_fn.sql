-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Tampilkan body fungsi rpc_simulate_battle yang benar
-- (yang dipanggil client: parameter p_hero_entries jsonb)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Cari SEMUA overload fungsi rpc_simulate_battle
SELECT
  oid,
  proname,
  pg_get_function_identity_arguments(oid) AS signature,
  prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'rpc_simulate_battle'
ORDER BY oid;

-- 2. Tampilkan body fungsi yang pakai p_hero_entries (OID ~18193)
--    Salin seluruh output ke chat untuk dipatch.
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'rpc_simulate_battle'
  AND pg_get_function_identity_arguments(oid) ILIKE '%hero_entries%';

-- 3. Cek hero_skills Gorr
SELECT skill_slot, skill_name, min_level, damage_ratio, target_type, skill_type, effect_type, lifesteal_ratio
FROM hero_skills
WHERE hero_id = 'gorr'
ORDER BY skill_slot;

-- 4. Cek hero_skills Lucas (sebagai referensi yang benar)
SELECT skill_slot, skill_name, min_level, damage_ratio, target_type, skill_type, effect_type
FROM hero_skills
WHERE hero_id = 'lucas'
ORDER BY skill_slot;

-- 5. Cek hero_skills Emma (sebagai referensi yang benar)
SELECT skill_slot, skill_name, min_level, damage_ratio, target_type, skill_type, effect_type
FROM hero_skills
WHERE hero_id = 'emma'
ORDER BY skill_slot;
