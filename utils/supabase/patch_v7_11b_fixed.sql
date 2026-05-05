-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7.11b — Fixed (replaces failed v7.11)                              ║
-- ║                                                                              ║
-- ║  Root causes dari v7.11 yang gagal:                                         ║
-- ║    1. Fix A: `-- comment END IF;` → comment makan END IF → syntax error.   ║
-- ║    2. Fix C: anchor `SELECT hs.hero_id` ada DI DALAM `FOR v_rec IN SELECT`  ║
-- ║             → code diinjeksi ke tengah FOR...IN clause → LOOP missing error. ║
-- ║    3. Bonus: Duplikat 2× block Emma lama (lines ~196-249 di function)       ║
-- ║             menyebabkan shield diapply 3× (1× baru + 2× lama).             ║
-- ║                                                                              ║
-- ║  Fixes:                                                                      ║
-- ║    A. Disable Warlord's Edge inline → no-op tanpa comment                   ║
-- ║    B. Per-turn P.ATK +8% stack setelah semua target diproses               ║
-- ║    C. passive_init event → anchor ke `-- Load skills\n  FOR v_rec IN`       ║
-- ║    D. Neutralize KEDUA block Emma lama → replace "Pass 2" comment           ║
-- ║       dengan `v_shv:=0;` sehingga IF v_shv>0 tidak pernah true.            ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

DO $t$
DECLARE
  src    TEXT;
  n_dup  INT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  p.proname = 'rpc_simulate_battle' AND n.nspname = 'public'
  ORDER  BY p.oid DESC LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'rpc_simulate_battle not found — pastikan patch_v7_7 sudah dijalankan';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- Fix D: Neutralize duplicate old Emma passive blocks
  -- ════════════════════════════════════════════════════════════════════════════
  -- Dua block Emma lama masih ada di function (dari patch sebelumnya).
  -- Mereka mengandung "-- Pass 2: apply shield ke semua unit sisi hero jika Emma passive aktif"
  -- tepat SEBELUM "IF v_shv>0 THEN ... END IF;".
  -- Caranya: replace comment tersebut dengan v_shv:=0; — ini memastikan
  -- IF v_shv>0 tidak pernah terpenuhi (no-op) tanpa merusak sintaks.
  -- Karena comment ini hanya ada di block LAMA (block BARU punya text berbeda),
  -- replace() akan netralkan KEDUA duplikat sekaligus.
  n_dup := (length(src) - length(replace(src,
    '-- Pass 2: apply shield ke semua unit sisi hero jika Emma passive aktif',
    ''))) / length('-- Pass 2: apply shield ke semua unit sisi hero jika Emma passive aktif');

  src := replace(src,
    $q$-- Pass 2: apply shield ke semua unit sisi hero jika Emma passive aktif$q$,
    $q$v_shv:=0;$q$);

  RAISE NOTICE 'Fix D: % duplicate Emma block(s) neutralized', n_dup;

  -- ════════════════════════════════════════════════════════════════════════════
  -- Fix A: Disable Warlord's Edge one-time inline multiplier (no comment!)
  -- ════════════════════════════════════════════════════════════════════════════
  -- CATATAN: JANGAN taruh `-- comment` di akhir baris replacement,
  -- karena -- makan sisa baris termasuk END IF; → syntax error.
  -- Solusi: simple no-op assignment, tanpa komentar apapun di baris yang sama.
  src := replace(src,
    $q$v_batk:=round(v_batk*(1+CASE v_llv3 WHEN 1 THEN 0.08 WHEN 2 THEN 0.14 WHEN 3 THEN 0.20 ELSE 0.28 END));$q$,
    $q$v_batk:=v_batk;$q$);

  IF src LIKE $q$%v_batk*(1+CASE v_llv3 WHEN 1 THEN 0.08%$q$ THEN
    RAISE EXCEPTION 'Fix A GAGAL: string inline multiplier masih ditemukan — periksa pg_proc';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- Fix B: Per-turn P.ATK +8% compounding stack untuk Lucas
  -- ════════════════════════════════════════════════════════════════════════════
  -- Injeksi SEBELUM baris event-log (anchor unik: CASE v_slot WHEN 4 THEN 'ult').
  -- Setiap kali Lucas beraksi (ANY slot), p_atk-nya naik 8% compounding di v_units.
  -- Turn berikutnya v_apatk dibaca fresh dari v_units → damage otomatis naik.
  src := replace(src,
    $q$'type',CASE v_slot WHEN 4 THEN 'ult' WHEN 0 THEN 'atk' ELSE 'skill' END,$q$,
    $q$IF v_ahid='lucas' THEN
        v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)::INT);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'p_atk'],to_jsonb(v_apatk));
      END IF;
      'type',CASE v_slot WHEN 4 THEN 'ult' WHEN 0 THEN 'atk' ELSE 'skill' END,$q$);

  IF src NOT LIKE $q$%v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)%$q$ THEN
    RAISE EXCEPTION 'Fix B GAGAL: per-turn stack tidak disisipkan — periksa anchor CASE v_slot';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- Fix C: Emit passive_init event sebelum skills loading
  -- ════════════════════════════════════════════════════════════════════════════
  -- ANCHOR BENAR: `-- Load skills` + newline + `  FOR v_rec IN`
  -- (bukan hanya SELECT hs.hero_id yang ada DI DALAM FOR...IN clause)
  -- Injeksi masuk ANTARA comment "Load skills" dan FOR loop — bukan di dalam FOR.
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
    RAISE EXCEPTION 'Fix C GAGAL: passive_init tidak disisipkan — periksa anchor -- Load skills';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- Execute updated function
  -- ════════════════════════════════════════════════════════════════════════════
  EXECUTE src;

  RAISE NOTICE 'patch_v7_11b berhasil: Fix D(Emma dedup) + Fix A(inline disabled) + Fix B(per-turn +8%%) + Fix C(passive_init event)';
END;
$t$;

REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) TO authenticated;
