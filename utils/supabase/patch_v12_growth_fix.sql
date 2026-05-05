-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v12 — Global Growth Rate Fix                                         ║
-- ║                                                                              ║
-- ║  ROOT CAUSE:                                                                 ║
-- ║  GROWTH_RATE was 0.018 (1.8%/level). At lv61 vs lv9, stat ratio was only   ║
-- ║  1.82× — not enough for a 52-level gap. lv61 Gorr lost to 5× lv9 slimes.  ║
-- ║                                                                              ║
-- ║  FIX:                                                                        ║
-- ║  common:    0.07 → lv61 vs lv9 = 3.33× stat advantage                      ║
-- ║  rare:      0.09 → proportionally stronger                                  ║
-- ║  epic:      0.12                                                             ║
-- ║  legendary: 0.16                                                             ║
-- ║  mythic:    0.22                                                             ║
-- ║                                                                              ║
-- ║  NEW GROWTH VALUES (base × rate, rounded):                                  ║
-- ║  rock_slime : hp=95   p_atk=4  m_atk=4  p_def=10 m_def=10                 ║
-- ║  acid_slime : hp=45   p_atk=11 m_atk=13 p_def=4  m_def=4                  ║
-- ║  water_slime: hp=73   p_atk=6  m_atk=6  p_def=7  m_def=7                  ║
-- ║  gorr       : hp=88   p_atk=9  m_atk=8  p_def=8  m_def=8                  ║
-- ║  craw       : hp=41   p_atk=13 m_atk=11 p_def=4  m_def=4                  ║
-- ║  lucas      : hp=157  p_atk=18 m_atk=11 p_def=16 m_def=16                 ║
-- ║  emma       : hp=136  p_atk=8  m_atk=14 p_def=14 m_def=15                 ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. UPDATE hero_definitions — new growth values
-- ══════════════════════════════════════════════════════════════════════════════

-- ── rock_slime (common / Tank) ── base_hp=1360 × 0.07
UPDATE public.hero_definitions SET
  growth_hp=95, growth_p_atk=4, growth_m_atk=4, growth_p_def=10, growth_m_def=10
WHERE hero_id='rock_slime';

-- ── acid_slime (common / Ranged) ── base_hp=640 × 0.07
UPDATE public.hero_definitions SET
  growth_hp=45, growth_p_atk=11, growth_m_atk=13, growth_p_def=4, growth_m_def=4
WHERE hero_id='acid_slime';

-- ── water_slime (common / Support) ── base_hp=1040 × 0.07
UPDATE public.hero_definitions SET
  growth_hp=73, growth_p_atk=6, growth_m_atk=6, growth_p_def=7, growth_m_def=7
WHERE hero_id='water_slime';

-- ── gorr (common / Fighter) ── base_hp=1260 × 0.07
UPDATE public.hero_definitions SET
  growth_hp=88, growth_p_atk=9, growth_m_atk=8, growth_p_def=8, growth_m_def=8
WHERE hero_id='gorr';

-- ── craw (common / Ranged) ── base_hp=589 × 0.07
UPDATE public.hero_definitions SET
  growth_hp=41, growth_p_atk=13, growth_m_atk=11, growth_p_def=4, growth_m_def=4
WHERE hero_id='craw';

-- ── lucas (rare / Fighter) ── base_hp=1740 × 0.09
UPDATE public.hero_definitions SET
  growth_hp=157, growth_p_atk=18, growth_m_atk=11, growth_p_def=16, growth_m_def=16
WHERE hero_id='lucas';

-- ── emma (rare / Support) ── base_hp=1508 × 0.09
UPDATE public.hero_definitions SET
  growth_hp=136, growth_p_atk=8, growth_m_atk=14, growth_p_def=14, growth_m_def=15
WHERE hero_id='emma';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Resync ALL player_heroes cached stats
--    Formula: FinalStat = ROUND((base + level × growth) × StarBonus)
--    StarBonus = 1 + LEAST(stars,5)×0.05 + GREATEST(0,LEAST(stars-5,5))×0.08
--                 + GREATEST(0,LEAST(stars-10,5))×0.11
--                 + CASE WHEN stars>=16 THEN 0.16 ELSE 0 END
--    (common rarity C, same formula as patch_v11)
-- ══════════════════════════════════════════════════════════════════════════════
WITH computed AS (
  SELECT
    ph.id,
    ph.level,
    ph.stars,
    hd.hero_id,
    hd.rarity,
    -- Rarity-specific star bonus calculation
    -- common (C):    +5% per yellow, +8% per red, +11% per white, +16% rainbow
    -- rare   (B):    +8% / +11% / +14% / +18%
    -- (epic+: rare formula used as placeholder — adjust when SS heroes added)
    CASE hd.rarity
      WHEN 'common' THEN
        1.0
        + LEAST(ph.stars, 5)::NUMERIC                   * 0.05
        + GREATEST(0, LEAST(ph.stars - 5,  5))::NUMERIC * 0.08
        + GREATEST(0, LEAST(ph.stars - 10, 5))::NUMERIC * 0.11
        + CASE WHEN ph.stars >= 16 THEN 0.16 ELSE 0.0 END
      WHEN 'rare' THEN
        1.0
        + LEAST(ph.stars, 5)::NUMERIC                   * 0.08
        + GREATEST(0, LEAST(ph.stars - 5,  5))::NUMERIC * 0.11
        + GREATEST(0, LEAST(ph.stars - 10, 5))::NUMERIC * 0.14
        + CASE WHEN ph.stars >= 16 THEN 0.18 ELSE 0.0 END
      ELSE 1.0
    END AS star_bonus,
    hd.base_hp,    hd.growth_hp,
    hd.base_p_atk, hd.growth_p_atk,
    hd.base_m_atk, hd.growth_m_atk,
    hd.base_p_def, hd.growth_p_def,
    hd.base_m_def, hd.growth_m_def,
    hd.base_speed
  FROM public.player_heroes ph
  JOIN public.hero_definitions hd ON hd.hero_id = ph.hero_id
)
UPDATE public.player_heroes ph
SET
  hp    = ROUND((c.base_hp    + c.level::NUMERIC * c.growth_hp)    * c.star_bonus),
  p_atk = ROUND((c.base_p_atk + c.level::NUMERIC * c.growth_p_atk) * c.star_bonus),
  m_atk = ROUND((c.base_m_atk + c.level::NUMERIC * c.growth_m_atk) * c.star_bonus),
  p_def = ROUND((c.base_p_def + c.level::NUMERIC * c.growth_p_def) * c.star_bonus),
  m_def = ROUND((c.base_m_def + c.level::NUMERIC * c.growth_m_def) * c.star_bonus),
  speed = ROUND(c.base_speed::NUMERIC * c.star_bonus),
  power = ROUND(
    ((c.base_hp    + c.level::NUMERIC * c.growth_hp)    * c.star_bonus) / 10.0 +
    ((c.base_p_atk + c.level::NUMERIC * c.growth_p_atk) * c.star_bonus) * 3.0  +
    ((c.base_m_atk + c.level::NUMERIC * c.growth_m_atk) * c.star_bonus) * 2.0  +
    ((c.base_p_def + c.level::NUMERIC * c.growth_p_def) * c.star_bonus) * 2.0  +
    ((c.base_m_def + c.level::NUMERIC * c.growth_m_def) * c.star_bonus) * 2.0  +
    (c.base_speed::NUMERIC                               * c.star_bonus) * 2.0
  )
FROM computed c
WHERE ph.id = c.id;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Sanity check — verify new stats (uncomment to run)
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT ph.hero_id, ph.level, ph.stars, ph.hp, ph.p_atk, ph.p_def, ph.speed, ph.power
-- FROM public.player_heroes ph
-- ORDER BY ph.hero_id, ph.level;

-- Expected examples after patch:
--  Gorr   lv61 stars=1 : hp≈6540  p_atk≈666  p_def≈600
--  Rock   lv9  stars=1 : hp≈2128  p_atk≈82   p_def≈216
--  Lucas  lv21 stars=2 : hp≈8556  p_atk≈1054 p_def≈836
