-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v21 — Stage Rewards Rebalance (Chapter 1)                             ║
-- ║                                                                              ║
-- ║  Rules applied:                                                              ║
-- ║    • gold_reward     flat 1000 semua stage                                   ║
-- ║    • hero_exp_reward flat 1000 semua stage                                   ║
-- ║    • exp_reward      flat 100  semua stage                                   ║
-- ║    • gem_reward      0 kecuali 1-5 / 1-10 / 1-15 / 1-20 = 25 flat          ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

INSERT INTO public.stage_definitions
  (stage_id, chapter, stage_number, name,
   recommended_power, exp_reward, gold_reward, gem_reward, hero_exp_reward, energy_cost)
VALUES
--           stage     ch  num  name                rec_pow  exp   gold  gem  hero_exp  nrg
  ('1-1',    1,  1, 'Slime Meadow',    300,   100,  1000,   0,  1000,  6),
  ('1-2',    1,  2, 'Rocky Path',      500,   100,  1000,   0,  1000,  6),
  ('1-3',    1,  3, 'Muddy Fields',    700,   100,  1000,   0,  1000,  6),
  ('1-4',    1,  4, 'Slime Pit',       900,   100,  1000,   0,  1000,  6),
  ('1-5',    1,  5, 'Verdant Hollow', 1100,   100,  1000,  25,  1000,  6),
  ('1-6',    1,  6, 'Swamp Border',   1400,   100,  1000,   0,  1000,  6),
  ('1-7',    1,  7, 'Acid Lakes',     1600,   100,  1000,   0,  1000,  6),
  ('1-8',    1,  8, 'Stone Grove',    1900,   100,  1000,   0,  1000,  6),
  ('1-9',    1,  9, 'Sour Springs',   2200,   100,  1000,   0,  1000,  6),
  ('1-10',   1, 10, 'Ooze Ravine',    2500,   100,  1000,  25,  1000,  6),
  ('1-11',   1, 11, 'Toxic Dell',     2800,   100,  1000,   0,  1000,  6),
  ('1-12',   1, 12, 'Blighted Glade', 3100,   100,  1000,   0,  1000,  6),
  ('1-13',   1, 13, 'Crystal Fen',    3400,   100,  1000,   0,  1000,  6),
  ('1-14',   1, 14, 'Mossy Canyon',   3800,   100,  1000,   0,  1000,  6),
  ('1-15',   1, 15, 'Emerald Bog',    4200,   100,  1000,  25,  1000,  6),
  ('1-16',   1, 16, 'Slime Fortress', 4600,   100,  1000,   0,  1000,  6),
  ('1-17',   1, 17, 'Venom Crossing', 5100,   100,  1000,   0,  1000,  6),
  ('1-18',   1, 18, 'Mire Depths',    5600,   100,  1000,   0,  1000,  6),
  ('1-19',   1, 19, 'Ancient Marsh',  6200,   100,  1000,   0,  1000,  6),
  ('1-20',   1, 20, 'Slime King Lair',7000,   100,  1000,  25,  1000,  6)
ON CONFLICT (stage_id) DO UPDATE SET
  gold_reward      = EXCLUDED.gold_reward,
  gem_reward       = EXCLUDED.gem_reward,
  exp_reward       = EXCLUDED.exp_reward,
  hero_exp_reward  = EXCLUDED.hero_exp_reward,
  recommended_power = EXCLUDED.recommended_power,
  name             = EXCLUDED.name;

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT stage_id, gold_reward, gem_reward, exp_reward, hero_exp_reward
FROM   public.stage_definitions
WHERE  chapter = 1
ORDER  BY stage_number;
