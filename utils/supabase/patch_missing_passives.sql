-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH — Remediate Missing Slot 3 (Passive) DB Rows                        ║
-- ║                                                                              ║
-- ║  PROBLEM DISCOVERED                                                          ║
-- ║  Three heroes (Myko, Craw, Gorr) had their slot-3 passive row omitted       ║
-- ║  from hero_skills with the incorrect comment "no DB row needed".            ║
-- ║  Root causes:                                                                ║
-- ║    • patch_v13: Myko and Craw both tagged "hardcoded in function"           ║
-- ║    • gorr_complete_patch.sql: DELETE/re-INSERT only slots 0/1/2/4          ║
-- ║                                                                              ║
-- ║  IMPACT                                                                      ║
-- ║  Battle passives still fired correctly (hardcoded in rpc_simulate_battle).  ║
-- ║  But hero_skills rows were absent, causing:                                 ║
-- ║    • SELECT skill_slot=3 COUNT → returns 9/13 instead of 13/13             ║
-- ║    • Any future UI that reads hero_skills directly would miss passives      ║
-- ║                                                                              ║
-- ║  ARCHITECTURAL RULE (enforced from this patch forward)                      ║
-- ║  EVERY skill slot 0–4 for every battleReady hero MUST have a DB row.       ║
-- ║  Passives may be hardcoded in function logic, but the DB row                ║
-- ║  is still mandatory as the canonical metadata record.                       ║
-- ║                                                                              ║
-- ║  IDEMPOTENT: ON CONFLICT DO NOTHING — safe to re-run.                      ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════���═════
-- STEP 1: Myko — slot 3 "Fungal Resilience"
--   Passive: reactive_self_hit. When Myko is hit, heals itself for 18%/25%/32%/40%
--   of its own P.DEF (Lv1 ratio = 0.18). Logic hardcoded in rpc_simulate_battle.
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  (gen_random_uuid(), 'myko', 3, 'Fungal Resilience', 'passive', 0.18, 'none', 'passive', 41)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Craw — slot 3 "Cornered Rat"
--   Passive: low_hp_once. When HP drops below 40%, permanently boosts P.ATK
--   by 25–44% and Speed by 12–22% (triggers once per battle). Ratio = 0.00
--   (buff amounts hardcoded in function by level threshold).
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  (gen_random_uuid(), 'craw', 3, 'Cornered Rat', 'passive', 0.00, 'none', 'passive', 41)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Gorr — slot 3 "Bloodlust"
--   Passive: on every kill Gorr's P.ATK grows. Also Gorr restores HP equal to
--   8%/10%/13%/17% of damage dealt (Lv1 ratio = 0.08). Hardcoded in function.
--   Note: gorr_complete_patch.sql re-created slots 0/1/2/4 but omitted slot 3.
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
  (gen_random_uuid(), 'gorr', 3, 'Bloodlust', 'passive', 0.08, 'none', 'passive', 41)
ON CONFLICT DO NOTHING;

-- ════════════════��══════════════════════════════════════════════════════════════
-- STEP 4: Verify — should show exactly 13 rows for skill_slot = 3
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT
  hero_id,
  COUNT(*) FILTER (WHERE skill_slot = 0) AS has_basic,
  COUNT(*) FILTER (WHERE skill_slot = 1) AS has_sk1,
  COUNT(*) FILTER (WHERE skill_slot = 2) AS has_sk2,
  COUNT(*) FILTER (WHERE skill_slot = 3) AS has_passive,
  COUNT(*) FILTER (WHERE skill_slot = 4) AS has_ult
FROM public.hero_skills
WHERE hero_id IN (
  'lucas','emma','gorr','craw','myko','fang','clover',
  'rock_slime','acid_slime','water_slime','bolo','quill','brennan'
)
GROUP BY hero_id
ORDER BY hero_id;

-- Expected: every hero shows 1 for ALL columns (has_basic through has_ult).
-- brennan rows will only appear after brennan_sql_patch.sql is also run.
