-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7.12 — Lucas Warlord's Edge: 5-Stack Cap + Stack Tracking          ║
-- ║                                                                              ║
-- ║  Pre-req: patch_v7_11c_final.sql sudah berhasil dijalankan.                ║
-- ║                                                                              ║
-- ║  Changes:                                                                    ║
-- ║    A. Tambah field `lucas_stacks` (INT, default 0) ke semua unit init.     ║
-- ║    B. Update Fix B (per-turn +8%): capped di 5 stacks, track count.        ║
-- ║    C. Emit `lucas_stacks` di event log — hanya untuk events Lucas           ║
-- ║       (NULL untuk hero lain → client hanya update saat ada nilainya).      ║
-- ║                                                                              ║
-- ║  Mechanic setelah patch ini:                                                ║
-- ║    - Setiap giliran Lucas: +8% P.ATK compounding (stack ke v_units).       ║
-- ║    - Maximum 5 stacks → boost maksimum ≈ +46.9% P.ATK total.              ║
-- ║    - Stack 5 = final; giliran ke-6 dst tidak ada penambahan lagi.          ║
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

  -- ── Fix A: Tambah lucas_stacks=0 ke semua unit initialization ─────────────
  -- Anchor muncul 2× (hero unit + enemy unit) — keduanya mendapat lucas_stacks=0.
  -- Enemy units tidak pakai field ini, tapi menambahkannya harmless.
  src := replace(src,
    $q$'ap',0,'rage',0,'sk1_cd',0,'sk2_cd',0,'shield',0,'pds',0,'alive',true))$q$,
    $q$'ap',0,'rage',0,'sk1_cd',0,'sk2_cd',0,'shield',0,'pds',0,'alive',true,'lucas_stacks',0))$q$);

  IF src NOT LIKE $q$%'lucas_stacks',0)%$q$ THEN
    RAISE EXCEPTION 'Fix A GAGAL: lucas_stacks tidak disisipkan ke unit init';
  END IF;

  -- ── Fix B: Ganti per-turn stack code dengan versi yang dibatasi 5 stacks ──
  -- Anchor: string persis yang dihasilkan oleh patch_v7_11c.
  src := replace(src,
    $q$IF v_ahid='lucas' THEN
        v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)::INT);
        v_units:=jsonb_set(v_units,ARRAY[v_auid,'p_atk'],to_jsonb(v_apatk));
      END IF;
      v_events:=v_events||jsonb_build_array(jsonb_build_object($q$,
    $q$IF v_ahid='lucas' THEN
        IF COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0) < 5 THEN
          v_apatk:=GREATEST(v_apatk,round(v_apatk*1.08)::INT);
          v_units:=jsonb_set(v_units,ARRAY[v_auid,'p_atk'],to_jsonb(v_apatk));
          v_units:=jsonb_set(v_units,ARRAY[v_auid,'lucas_stacks'],
            to_jsonb(COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0)+1));
        END IF;
      END IF;
      v_events:=v_events||jsonb_build_array(jsonb_build_object($q$);

  IF src NOT LIKE $q$%COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0) < 5%$q$ THEN
    RAISE EXCEPTION 'Fix B GAGAL: stack cap tidak disisipkan — periksa anchor IF v_ahid=''lucas''';
  END IF;

  -- ── Fix C: Emit lucas_stacks dalam event log ───────────────────────────────
  -- NULL untuk non-Lucas actors → client hanya update saat bukan NULL.
  src := replace(src,
    $q$'rage_after',v_arage));$q$,
    $q$'rage_after',v_arage,
  'lucas_stacks',CASE WHEN v_ahid='lucas'
    THEN COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0)
    ELSE NULL END));$q$);

  IF src NOT LIKE $q$%'lucas_stacks',CASE WHEN v_ahid='lucas'%$q$ THEN
    RAISE EXCEPTION 'Fix C GAGAL: lucas_stacks tidak ada di event log — periksa anchor rage_after';
  END IF;

  EXECUTE src;

  RAISE NOTICE 'patch_v7_12 BERHASIL: Warlord''s Edge dibatasi 5 stacks, stack count dikirim ke client';
END;
$t$;

REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) TO authenticated;
