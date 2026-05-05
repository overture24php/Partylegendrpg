-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7.10 — Passive Skill (slot 3) + ULT slot renumbering (3→4)        ║
-- ║                                                                              ║
-- ║  ROOT CAUSE (definitive):                                                   ║
-- ║    Semua patch sebelumnya (v7_5 s/d v7_9) salah asumsi:                    ║
-- ║      skill_slot 3 = ULT  ← SALAH                                            ║
-- ║    Padahal sistem kanonik:                                                   ║
-- ║      skill_slot 0 = Basic Attack   unlock Lv 1                              ║
-- ║      skill_slot 1 = SK1 (aktif)    unlock Lv 1                              ║
-- ║      skill_slot 2 = SK2 (aktif)    unlock Lv 21                             ║
-- ║      skill_slot 3 = Passive (SK3)  unlock Lv 41  ← TIDAK ADA di DB!        ║
-- ║      skill_slot 4 = Ultimate       unlock Lv 61  ← selama ini di slot 3!   ║
-- ║                                                                              ║
-- ║  EFEK BUG:                                                                   ║
-- ║    • Passive tidak ada di hero_skills → efek boost tidak pernah diterapkan  ║
-- ║      secara benar (Lucas Warlord's Edge unlock threshold 61 bukan 41)       ║
-- ║    • Emma Blessed Ward TIDAK PERNAH diterapkan di simulasi                  ║
-- ║    • ULT di slot 3 dengan unlock_level berbeda-beda (1, 21, 61) tergantung  ║
-- ║      patch mana yang terakhir dijalankan → unlock timing kacau              ║
-- ║                                                                              ║
-- ║  FIX:                                                                        ║
-- ║  PART 1 — DB hero_skills:                                                    ║
-- ║    a. Pindah semua skill_slot=3 (ULT lama) → skill_slot=4                  ║
-- ║    b. Insert passive Lucas (Warlord's Edge) di slot 3, unlock 41            ║
-- ║    c. Insert passive Emma (Blessed Ward) di slot 3, unlock 41               ║
-- ║    d. Insert passive Rock Slime (Stone Skin) di slot 3, unlock 41          ║
-- ║    e. Insert passive Acid Slime (Corrosive Body) di slot 3, unlock 41      ║
-- ║    f. Insert passive Water Slime (Tidal Flow) di slot 3, unlock 41        ║
-- ║    g. Set semua unlock_level definitif: 0→1, 1→1, 2→21, 3→41, 4→61         ║
-- ║                                                                              ║
-- ║  PART 2 — rpc_simulate_battle (string-replace DO block):                    ║
-- ║    a. ULT lookup: slot=3 → slot=4                                           ║
-- ║    b. v_slot:=3 → v_slot:=4 (ULT assignment)                               ║
-- ║    c. Lucas ULT 3-hit expansion: v_slot=3 → v_slot=4                       ║
-- ║    d. Post-action rage reset: IF v_slot=3 → IF v_slot=4                    ║
-- ║    e. Event type CASE: WHEN 3 THEN 'ult' → WHEN 4 THEN 'ult'               ║
-- ║    f. Lucas Warlord's Edge: threshold v_alv>=61 → v_alv>=41                 ║
-- ║    g. INSERT ALL passive application (pre-battle stat boosts)              ║
-- ║                                                                              ║
-- ║  Run: Supabase Dashboard → SQL Editor → Run                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════════
-- PART 1 — DB hero_skills data migration
-- ════════════════════════════════════════════════════════════════════════════════

-- 1a. Pindah semua ULT lama (skill_slot=3) → slot 4
--     Ini berlaku untuk Lucas, Emma, rock_slime, acid_slime, water_slime — semua hero.
UPDATE public.hero_skills
SET skill_slot = 4
WHERE skill_slot = 3;

-- 1b. Insert passive Lucas — Warlord's Edge (slot 3, unlock lv 41)
--     P.ATK permanent bonus: +8/14/20/28% per passive level 1/2/3/4
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type,
   effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
  ('lucas_passive', 'lucas', 3,
   'Warlord''s Edge',
   'Passive. Lucas''s relentless battlefield experience permanently sharpens his striking power. His P.ATK is continuously boosted as long as he stands on the field.',
   'passive', 0.08, 'physical',
   NULL, 0, 0,
   'self', 41, 4)
ON CONFLICT (skill_id) DO UPDATE SET
  skill_slot   = 3,
  unlock_level = 41,
  damage_ratio = EXCLUDED.damage_ratio,
  skill_type   = 'passive';

-- 1c. Insert passive Emma — Blessed Ward (slot 3, unlock lv 41)
--     Starting shield per ally: 90/115/145/185% M.ATK at passive lv 1/2/3/4
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type,
   effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
  ('emma_passive', 'emma', 3,
   'Blessed Ward',
   'Passive. At the start of every battle Emma projects a protective aura across the entire team, wrapping each ally in a magical ward. Shield value scales with Emma''s M.ATK.',
   'passive', 0.90, 'magical',
   'shield', 0, 100,
   'all_allies', 41, 4)
ON CONFLICT (skill_id) DO UPDATE SET
  skill_slot   = 3,
  unlock_level = 41,
  damage_ratio = EXCLUDED.damage_ratio,
  skill_type   = 'passive';

-- 1d. Insert passive Rock Slime — Stone Skin (slot 3, unlock lv 41)
--     P.DEF permanent bonus: +15/20/25/35% per passive lv 1/2/3/4
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type,
   effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
  ('rock_passive', 'rock_slime', 3,
   'Stone Skin',
   'Passive. The Rock Slime''s body hardens with accumulated mineral deposits, permanently reinforcing its physical defense. P.DEF is continuously boosted throughout the battle.',
   'passive', 0.15, 'physical',
   NULL, 0, 0,
   'self', 41, 4)
ON CONFLICT (skill_id) DO UPDATE SET
  skill_slot   = 3,
  unlock_level = 41,
  damage_ratio = EXCLUDED.damage_ratio,
  skill_type   = 'passive';

-- 1e. Insert passive Acid Slime — Corrosive Body (slot 3, unlock lv 41)
--     P.ATK permanent bonus: +8/14/20/28% per passive lv 1/2/3/4
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type,
   effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
  ('acid_passive', 'acid_slime', 3,
   'Corrosive Body',
   'Passive. The Acid Slime''s body constantly secretes toxic enzymes that strengthen its physical attacks. P.ATK is permanently boosted as long as it remains on the battlefield.',
   'passive', 0.08, 'physical',
   NULL, 0, 0,
   'self', 41, 4)
ON CONFLICT (skill_id) DO UPDATE SET
  skill_slot   = 3,
  unlock_level = 41,
  damage_ratio = EXCLUDED.damage_ratio,
  skill_type   = 'passive';

-- 1f. Insert passive Water Slime — Tidal Flow (slot 3, unlock lv 41)
--     M.ATK permanent bonus: +8/14/20/28% per passive lv 1/2/3/4
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type,
   effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
  ('water_passive', 'water_slime', 3,
   'Tidal Flow',
   'Passive. The Water Slime channels ambient moisture into its magical core, permanently amplifying its healing and magical power. M.ATK is continuously boosted throughout the battle.',
   'passive', 0.08, 'magical',
   NULL, 0, 0,
   'self', 41, 4)
ON CONFLICT (skill_id) DO UPDATE SET
  skill_slot   = 3,
  unlock_level = 41,
  damage_ratio = EXCLUDED.damage_ratio,
  skill_type   = 'passive';

-- 1g. Set unlock_level definitif untuk SEMUA hero — no WHERE filter
UPDATE public.hero_skills
SET unlock_level = CASE skill_slot
  WHEN 0 THEN  1   -- Basic attack : selalu tersedia
  WHEN 1 THEN  1   -- SK1 aktif    : unlock Lv 1
  WHEN 2 THEN 21   -- SK2 aktif    : unlock Lv 21
  WHEN 3 THEN 41   -- Passive SK3  : unlock Lv 41
  WHEN 4 THEN 61   -- Ultimate     : unlock Lv 61
  ELSE COALESCE(unlock_level, 1)
END;

-- ════════════════════════════════════════════════════════════════════════════════
-- PART 2 — rpc_simulate_battle function patch via string replacement
-- ════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  src TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  p.proname = 'rpc_simulate_battle' AND n.nspname = 'public'
  ORDER  BY p.oid DESC LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'rpc_simulate_battle not found — jalankan patch_v7_7 lebih dulu';
  END IF;

  -- ── Fix a: ULT lookup slot 3 → 4 (dalam WHERE clause skill selection) ────────
  src := replace(src,
    '(s->>''slot'')::INT=3 AND (s->>''unlock_lv'')::INT<=v_alv',
    '(s->>''slot'')::INT=4 AND (s->>''unlock_lv'')::INT<=v_alv');

  -- ── Fix b: ULT slot assignment v_slot:=3 → v_slot:=4 ─────────────────────────
  src := replace(src,
    'IF FOUND AND v_sk IS NOT NULL THEN v_slot:=3; END IF;',
    'IF FOUND AND v_sk IS NOT NULL THEN v_slot:=4; END IF;');

  -- ── Fix c: Lucas ULT 3-hit expansion v_slot=3 → v_slot=4 ────────────────────
  src := replace(src,
    'v_ahid=''lucas'' AND v_slot=3 AND array_length(v_tuids,1)>0',
    'v_ahid=''lucas'' AND v_slot=4 AND array_length(v_tuids,1)>0');

  -- ── Fix d: Post-action rage reset IF v_slot=3 → IF v_slot=4 ──────────────────
  src := replace(src,
    'IF v_slot=3 THEN',
    'IF v_slot=4 THEN');

  -- ── Fix e: Event type CASE WHEN 3 → WHEN 4 ───────────────────────────────────
  src := replace(src,
    'WHEN 3 THEN ''ult''',
    'WHEN 4 THEN ''ult''');

  -- ── Fix f: Lucas Warlord's Edge unlock threshold: v_alv>=61 → v_alv>=41 ──────
  -- Threshold chain: 240/201/121/61 (Warlord's Edge inline in damage calc)
  -- Armor-rend uses 240/181/101/41 → not matched by this replace
  src := replace(src,
    'WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 WHEN v_alv>=61 THEN 1 ELSE 0 END;',
    'WHEN v_alv>=240 THEN 4 WHEN v_alv>=201 THEN 3 WHEN v_alv>=121 THEN 2 WHEN v_alv>=41 THEN 1 ELSE 0 END;');

  -- ── Fix g: Insert ALL passive applications (pre-battle stat boosts) ───────────
  -- Anchor: setelah cek v_units kosong, sebelum skills loading loop.
  -- Emma   → Blessed Ward  : starting shield = ratio × M.ATK untuk semua ally
  -- Rock   → Stone Skin    : P.DEF × (1 + bonus%) per unit
  -- Acid   → Corrosive Body: P.ATK × (1 + bonus%) per unit
  -- Water  → Tidal Flow    : M.ATK × (1 + bonus%) per unit
  -- Lucas  → Warlord's Edge: handled inline di damage calc (threshold fix: 61→41 via Fix f)
  src := replace(src,
    'IF v_units=''{}''::JSONB THEN RETURN jsonb_build_object(''error'',''battle/no-combatants''); END IF;',
    'IF v_units=''{}''::JSONB THEN RETURN jsonb_build_object(''error'',''battle/no-combatants''); END IF;

  -- ── PASSIVE APPLICATION: pre-battle stat boosts ──────────────────────────────
  -- Emma Blessed Ward: Pass 1 — temukan Emma dan hitung shield value
  v_shv:=0;
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
    v_u:=v_units->v_k;
    IF (v_u->>''hero_id'')=''emma'' AND (v_u->>''side'')=''hero'' AND ((v_u->>''alive'')::BOOLEAN) THEN
      v_llv3:=CASE WHEN (v_u->>''level'')::INT>=240 THEN 4
                   WHEN (v_u->>''level'')::INT>=201 THEN 3
                   WHEN (v_u->>''level'')::INT>=121 THEN 2
                   WHEN (v_u->>''level'')::INT>=41  THEN 1 ELSE 0 END;
      IF v_llv3>0 THEN
        v_shv:=GREATEST(1,floor((v_u->>''m_atk'')::NUMERIC*
          CASE v_llv3 WHEN 1 THEN 0.90 WHEN 2 THEN 1.15 WHEN 3 THEN 1.45 ELSE 1.85 END)::INT);
      END IF;
      EXIT;
    END IF;
  END LOOP;
  -- Emma Blessed Ward: Pass 2 — apply shield ke semua hero-side unit
  IF v_shv>0 THEN
    FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
      IF (v_units->v_k)->>''side''=''hero'' AND ((v_units->v_k->>''alive'')::BOOLEAN) THEN
        v_units:=jsonb_set(v_units,ARRAY[v_k,''shield''],
          to_jsonb((v_units->v_k->>''shield'')::INT+v_shv));
      END IF;
    END LOOP;
  END IF;
  -- Per-unit stat passive: Rock/Acid/Water Slime
  -- Level thresholds sama: Lv41=1, Lv121=2, Lv201=3, Lv240=4
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
    v_u:=v_units->v_k;
    IF NOT ((v_u->>''alive'')::BOOLEAN) THEN CONTINUE; END IF;
    v_llv3:=CASE WHEN (v_u->>''level'')::INT>=240 THEN 4
                 WHEN (v_u->>''level'')::INT>=201 THEN 3
                 WHEN (v_u->>''level'')::INT>=121 THEN 2
                 WHEN (v_u->>''level'')::INT>=41  THEN 1 ELSE 0 END;
    IF v_llv3=0 THEN CONTINUE; END IF;
    -- Rock Slime: Stone Skin — P.DEF +15/20/25/35%
    IF (v_u->>''hero_id'')=''rock_slime'' THEN
      v_units:=jsonb_set(v_units,ARRAY[v_k,''p_def''],
        to_jsonb(GREATEST(1,round((v_units->v_k->>''p_def'')::NUMERIC*
          (1+CASE v_llv3 WHEN 1 THEN 0.15 WHEN 2 THEN 0.20 WHEN 3 THEN 0.25 ELSE 0.35 END))::INT)));
    END IF;
    -- Acid Slime: Corrosive Body — P.ATK +8/14/20/28%
    IF (v_u->>''hero_id'')=''acid_slime'' THEN
      v_units:=jsonb_set(v_units,ARRAY[v_k,''p_atk''],
        to_jsonb(GREATEST(1,round((v_units->v_k->>''p_atk'')::NUMERIC*
          (1+CASE v_llv3 WHEN 1 THEN 0.08 WHEN 2 THEN 0.14 WHEN 3 THEN 0.20 ELSE 0.28 END))::INT)));
    END IF;
    -- Water Slime: Tidal Flow — M.ATK +8/14/20/28%
    IF (v_u->>''hero_id'')=''water_slime'' THEN
      v_units:=jsonb_set(v_units,ARRAY[v_k,''m_atk''],
        to_jsonb(GREATEST(1,round((v_units->v_k->>''m_atk'')::NUMERIC*
          (1+CASE v_llv3 WHEN 1 THEN 0.08 WHEN 2 THEN 0.14 WHEN 3 THEN 0.20 ELSE 0.28 END))::INT)));
    END IF;
  END LOOP;');

  -- Verifikasi semua replacement berhasil
  IF src NOT LIKE '%v_slot:=4; END IF%' THEN
    RAISE EXCEPTION 'Fix b gagal — string v_slot:=3 tidak ditemukan di fungsi. Pastikan patch_v7_7 sudah dijalankan.';
  END IF;
  IF src NOT LIKE '%v_slot=4 AND array_length%' THEN
    RAISE EXCEPTION 'Fix c gagal — Lucas ULT expansion string tidak ditemukan.';
  END IF;
  IF src NOT LIKE '%IF v_slot=4 THEN%' THEN
    RAISE EXCEPTION 'Fix d gagal — rage reset IF v_slot=3 tidak ditemukan.';
  END IF;
  IF src NOT LIKE '%Blessed Ward%' THEN
    RAISE EXCEPTION 'Fix g gagal — Emma passive anchor string tidak ditemukan.';
  END IF;

  EXECUTE src;
  RAISE NOTICE 'patch_v7_10 berhasil: ULT slot 3→4, passive slot 3 unlock 41, Emma Blessed Ward aktif';
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════
-- PART 3 — Verify: tampilkan semua skill per hero (harus 5 baris per hero)
-- ════════════════════════════════════════════════════════════════════════════════
SELECT
  hero_id,
  skill_slot,
  name,
  skill_type,
  unlock_level,
  CASE skill_slot
    WHEN 0 THEN CASE WHEN unlock_level=1  THEN '✓ Basic   Lv1'  ELSE '✗ Basic WRONG'   END
    WHEN 1 THEN CASE WHEN unlock_level=1  THEN '✓ SK1     Lv1'  ELSE '✗ SK1 WRONG'     END
    WHEN 2 THEN CASE WHEN unlock_level=21 THEN '✓ SK2     Lv21' ELSE '✗ SK2 WRONG'     END
    WHEN 3 THEN CASE WHEN unlock_level=41 THEN '✓ Passive Lv41' ELSE '✗ Passive WRONG' END
    WHEN 4 THEN CASE WHEN unlock_level=61 THEN '✓ ULT     Lv61' ELSE '✗ ULT WRONG'     END
    ELSE '? slot tidak dikenal'
  END AS status
FROM public.hero_skills
ORDER BY hero_id, skill_slot;

-- Revoke/Grant permissions (setelah EXECUTE baru permission perlu di-reset)
REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) TO authenticated;