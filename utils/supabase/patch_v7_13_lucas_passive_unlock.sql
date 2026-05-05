-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v7.13 — Lucas Passive Unlock Level Fix                               ║
-- ║                                                                              ║
-- ║  Bug: Warlord's Edge berjalan di semua level (termasuk Lv1).               ║
-- ║  Root cause: Fix B di v7.11c tidak memiliki level guard — hanya cek        ║
-- ║    `v_ahid='lucas'`, tidak cek `v_alv >= 41`.                              ║
-- ║                                                                              ║
-- ║  Fix: Tambah `AND v_alv >= 41` ke kondisi outer IF Fix B.                  ║
-- ║    Level thresholds passive (slot 3) sesuai sistem:                        ║
-- ║      Lv  1–40  : passive belum terbuka → 0 stack, tidak ada P.ATK boost   ║
-- ║      Lv 41–120 : passive Lv1 aktif → +8% / stack, max 5                   ║
-- ║      (Lv 121+ dst: passive tetap +8%/stack — per SQL implementation)       ║
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

  -- Pastikan v7.12 sudah dijalankan (anchor Fix B v7.12 harus ada)
  IF src NOT LIKE $q$%COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0) < 5%$q$ THEN
    RAISE EXCEPTION 'Pre-req gagal: patch_v7_12 belum dijalankan (lucas_stacks < 5 tidak ditemukan)';
  END IF;

  -- ── Fix: Tambah level guard ke kondisi outer IF Warlord's Edge ─────────────
  -- Sebelum: IF v_ahid='lucas' THEN
  -- Sesudah: IF v_ahid='lucas' AND v_alv>=41 THEN
  src := replace(src,
    $q$IF v_ahid='lucas' THEN
        IF COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0) < 5 THEN$q$,
    $q$IF v_ahid='lucas' AND v_alv>=41 THEN
        IF COALESCE((v_units->v_auid->>'lucas_stacks')::INT,0) < 5 THEN$q$);

  -- Verifikasi hasil
  IF src NOT LIKE $q$%IF v_ahid='lucas' AND v_alv>=41 THEN%$q$ THEN
    RAISE EXCEPTION 'Fix GAGAL: level guard tidak disisipkan — cek anchor "IF v_ahid=''lucas'' THEN"';
  END IF;

  EXECUTE src;

  RAISE NOTICE 'patch_v7_13 BERHASIL: Warlord''s Edge sekarang hanya aktif saat Lucas >= Lv 41';
END;
$t$;

REVOKE EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_simulate_battle(text,jsonb) TO authenticated;
