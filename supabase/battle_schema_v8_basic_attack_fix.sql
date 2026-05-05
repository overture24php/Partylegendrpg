-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RPG — Basic Attack Fix  (v8)                                           ║
-- ║  Jalankan di: Supabase Dashboard → SQL Editor                          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║  Rule: semua basic attack SELALU menyerang front-row musuh.             ║
-- ║  Back-row targeting hanya berlaku untuk skill tertentu (bukan basic).   ║
-- ║                                                                          ║
-- ║  Sebelumnya acid_basic memakai target_type='single_back' — diubah ke    ║
-- ║  'single' (front-row priority, deterministik) agar konsisten dengan     ║
-- ║  lucas_basic, emma_basic, dan rock_basic yang sudah benar.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UPDATE public.hero_skills SET
  name        = 'Acid Spit',
  description = 'Spits a glob of acid at the nearest front-row enemy for 90% P.ATK physical damage.',
  target_type = 'single'
WHERE skill_id = 'acid_basic';

-- Verify semua basic attack sudah single (front-row)
SELECT skill_id, name, target_type
FROM   public.hero_skills
WHERE  skill_slot = 0
ORDER  BY hero_id;
