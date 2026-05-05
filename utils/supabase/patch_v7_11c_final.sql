-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7.11c — Final (replaces failed v7.11b)                             ║
-- ║                                                                              ║
-- ║  Diagnosis v7.11b:                                                          ║
-- ║    Fix D ✓ (lines 213,240 jadi v_shv:=0;)                                 ║
-- ║    Fix A ✓ (line 561: v_batk:=v_batk; END IF;)                             ║
-- ║    Fix C ✓ (lines 251-258: passive_init event)                              ║
-- ║    Fix B ✗ — anchor `'type',CASE v_slot WHEN 4 THEN 'ult'` ternyata        ║
-- ║             ADA DI DALAM jsonb_build_object(...) call → kode PL/pgSQL       ║
-- ║             diinjeksi dalam SQL expression → mismatched parentheses.        ║
-- ║                                                                              ║
-- ║  Fix v7.11c: Ganti anchor Fix B ke baris sebelum jsonb_build_object:       ║
-- ║    `v_events:=v_events||jsonb_build_array(jsonb_build_object(`              ║
-- ║    → injeksi masuk di antara END IF; (rage) dan v_events:=... (aman).      ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

DO $t$
DECLARE
  src TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  p.proname = 'rpc_simulate_battle' AND n.nspname = 'public'
  ORDER  BY p.oid DESC LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'rpc_simulate_battle not found';
  END IF;

  -- ── Fix D: Neutralize duplicate old Emma passive blocks ───────────────────
  src := replace(src,
    $q$-- Pass 2: apply shield ke semua unit sisi hero jika Emma passive aktif$q$,
    $q$v_shv:=0;$q$);

  -- ── Fix A: Disable Warlord's Edge one-time inline multiplier ──────────────
  src := replace(src,
    $q$v_batk:=round(v_batk*(1+CASE v_llv3 WHEN 1 THEN 0.08 WHEN 2 THEN 0.14 WHEN 3 THEN 0.20 ELSE 0.28 END));$q$,
    $q$v_batk:=v_batk;$q$);

  IF src LIKE $q$%v_batk*(1+CASE v_llv3 WHEN 1 THEN 0.08%$q$ THEN
    RAISE EXCEPTION 'Fix A GAGAL: inline multiplier masih ada di pg_proc';
  END IF;

  -- ── Fix B: Per-turn P.ATK +8%% compounding (ANCHOR BENAR) ────────────────
  -- Anchor: `v_events:=v_events||jsonb_build_array(jsonb_build_object(`
  -- Baris ini muncul SEKALI, tepat SEBELUM seluruh event-log expression.
  -- Lucas block diinjeksi SEBELUM baris ini → di luar jsonb_build_object → aman.
  src := replace(src,
    $q$v_events:=v_events||jsonb_build_array(jsonb_build_object($q$,
    $q$IF v_ahid='lucas' THEN
        v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)::INT);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'p_atk'],to_jsonb(v_apatk));
      END IF;
      v_events:=v_events||jsonb_build_array(jsonb_build_object($q$);

  IF src NOT LIKE $q$%v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)%$q$ THEN
    RAISE EXCEPTION 'Fix B GAGAL: per-turn stack tidak disisipkan. Cek anchor v_events:=v_events||jsonb_build_array';
  END IF;

  -- ── Fix C: Emit passive_init event sebelum skills loading ─────────────────
  src := replace(src,
    $q$-- Load skills
  FOR v_rec IN
    SELECT hs.hero_id,hs.skill_slot,hs.name,hs.skill_type,$q$,
    $q$-- Load skills
  v_combj:='{}'::JSONB;
  FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
    v_combj:=v_combj||jsonb_build_object(v_k,(v_units->v_k->>'shield')::INT);
  END LOOP;
  v_events:=jsonb_build_array(jsonb_build_object(
    't',-1,'type','passive_init','shields',v_combj
  ))||v_events;
  v_combj:='[]'::JSONB;
  FOR v_rec IN
    SELECT hs.hero_id,hs.skill_slot,hs.name,hs.skill_type,$q$);

  IF src NOT LIKE $q$%'type','passive_init'%$q$ THEN
    RAISE EXCEPTION 'Fix C GAGAL: passive_init tidak disisipkan. Cek anchor -- Load skills';
  END IF;

  EXECUTE src;

  RAISE NOTICE 'patch_v7_11c BERHASIL: Emma dedup + Lucas per-turn 8%% stack + passive_init event aktif';
END;
$t$;

REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) TO authenticated;
