-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7.11 — Lucas per-turn P.ATK stack + Initial Shield UI fix          ║
-- ║                                                                              ║
-- ║  ISSUE 1 — Lucas Warlord's Edge (passive SK3):                             ║
-- ║    Sebelumnya: one-time multiplier berdasarkan passive level (level-gated). ║
-- ║    Seharusnya: +8% P.ATK COMPOUNDING setiap turn Lucas beraksi.            ║
-- ║    Fix: hapus inline multiplier lama → tambah per-turn stack di akhir turn. ║
-- ║                                                                              ║
-- ║  ISSUE 2 — Emma Blessed Ward shield tidak terlihat di awal battle UI:       ║
-- ║    Shield dari passive Emma sudah ada di server sejak awal, tapi            ║
-- ║    BattlePlayback tidak tahu initial shield → bar tidak muncul.             ║
-- ║    Fix: emit 'passive_init' event (t=-1) berisi map uid→shield SEBELUM     ║
-- ║    ATB loop, sehingga client bisa init shield bar dari frame pertama.       ║
-- ║                                                                              ║
-- ║  SQL changes (via string-replace DO block):                                 ║
-- ║    Fix A: Ganti inline Lucas P.ATK multiplier → no-op (per-turn replace)   ║
-- ║    Fix B: Tambah per-turn P.ATK compounding SEBELUM event log per turn      ║
-- ║    Fix C: Emit 'passive_init' event sebelum skills loading                 ║
-- ║                                                                              ║
-- ║  Run: Supabase Dashboard → SQL Editor → Run                                 ║
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
    RAISE EXCEPTION 'rpc_simulate_battle not found — jalankan patch_v7_7 lebih dulu';
  END IF;

  -- ── Fix A: Nonaktifkan inline Lucas Warlord's Edge multiplier ────────────────
  -- Sebelumnya: v_batk = round(v_batk * (1 + passive_bonus)) berdasarkan level.
  -- Sekarang: handled per-turn compounding (+8% setiap Lucas beraksi).
  -- Replace ekspresi kritis dengan no-op agar IF-END IF tetap valid.
  src := replace(src,
    $q$v_batk:=round(v_batk*(1+CASE v_llv3 WHEN 1 THEN 0.08 WHEN 2 THEN 0.14 WHEN 3 THEN 0.20 ELSE 0.28 END));$q$,
    $q$v_batk:=v_batk; -- Warlord Edge: handled per-turn; inline mult disabled$q$);

  IF src LIKE $q$%v_batk*(1+CASE v_llv3 WHEN 1 THEN 0.08%$q$ THEN
    RAISE EXCEPTION 'Fix A gagal — inline Warlord Edge masih ada. Cek exact string di pg_proc.';
  END IF;

  -- ── Fix B: Tambah per-turn P.ATK stack (+8% compounding) sebelum event log ──
  -- Anchor: baris 'type',CASE v_slot WHEN 4... yang muncul SEKALI di event log.
  -- Setiap kali Lucas beraksi (ANY skill/basic), P.ATK-nya naik 8% compounding.
  -- v_apatk saat itu adalah p_atk dari v_units yang sudah di-read di awal turn.
  -- Kita update v_units['p_atk'] sehingga next turn Lucas punya p_atk lebih tinggi.
  src := replace(src,
    $q$'type',CASE v_slot WHEN 4 THEN 'ult' WHEN 0 THEN 'atk' ELSE 'skill' END,$q$,
    $q$-- Warlord's Edge: P.ATK +8% compounding setiap turn Lucas beraksi
      IF v_ahid='lucas' THEN
        v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)::INT);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'p_atk'],to_jsonb(v_apatk));
      END IF;
      'type',CASE v_slot WHEN 4 THEN 'ult' WHEN 0 THEN 'atk' ELSE 'skill' END,$q$);

  IF src NOT LIKE $q$%v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)::INT)%$q$ THEN
    RAISE EXCEPTION 'Fix B gagal — per-turn stack string tidak disisipkan. Cek anchor type-CASE.';
  END IF;

  -- ── Fix C: Emit passive_init event sebelum skills loading ────────────────────
  -- passive_init event (t=-1) berisi map uid→initial_shield.
  -- Client BattlePlayback membaca event ini untuk init shield bar sebelum battle.
  -- v_combj dipakai sementara sebagai JSONB object (reset ke '[]' setelahnya).
  -- Anchor: SELECT hs.hero_id,hs.skill_slot — muncul sekali di skills loading loop.
  src := replace(src,
    $q$SELECT hs.hero_id,hs.skill_slot,hs.name,hs.skill_type,$q$,
    $q$-- ── Emit passive_init event: initial shield state untuk client UI ─────────
    v_combj:='{}'::JSONB;
    FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
      v_combj:=v_combj||jsonb_build_object(v_k,(v_units->v_k->>'shield')::INT);
    END LOOP;
    v_events:=jsonb_build_array(jsonb_build_object(
      't',-1,'type','passive_init','shields',v_combj
    ))||v_events;
    v_combj:='[]'::JSONB; -- reset ke array kosong untuk dipakai di combatants build nanti
    SELECT hs.hero_id,hs.skill_slot,hs.name,hs.skill_type,$q$);

  IF src NOT LIKE $q$%passive_init%$q$ THEN
    RAISE EXCEPTION 'Fix C gagal — passive_init event tidak disisipkan. Cek anchor SELECT hs.hero_id.';
  END IF;

  EXECUTE src;
  RAISE NOTICE 'patch_v7_11 berhasil: Lucas per-turn +8%% P.ATK stack aktif, passive_init event ditambahkan';
END;
$t$;

-- Revoke/Grant permissions
REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) TO authenticated;
