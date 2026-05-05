-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v10b — Fix Gorr & Craw base stats (DB scale alignment)               ║
-- ║                                                                              ║
-- ║  ROOT CAUSE:                                                                 ║
-- ║  patch_v10 set Gorr/Craw base_hp/growth values using gameBalance.ts         ║
-- ║  BASE_STATS_C numbers directly (2200 HP, 1800 HP), but existing C heroes    ║
-- ║  in DB use a ×0.5 scale of those values (Water Slime Support C → 900 HP    ║
-- ║  vs gameBalance 1820). This made Gorr/Craw 2× stronger than same-rarity    ║
-- ║  slime heroes at the same star tier.                                        ║
-- ║                                                                              ║
-- ║  FIX: Align to the ×0.5 DB scale with ~10% base growth per level.          ║
-- ║  Variation within ±5% power budget preserved for character archetype feel.  ║
-- ║                                                                              ║
-- ║  BALANCE REFERENCE (C rarity, DB scale):                                   ║
-- ║  Rock Slime (Tank C)    : base_hp≈1400 growth_hp≈140  p_atk≈88  g≈9       ║
-- ║  Acid Slime (Ranged C)  : base_hp≈790  growth_hp≈79   p_atk≈143 g≈14      ║
-- ║  Water Slime(Support C) : base_hp=900  growth_hp=90   m_atk=160 g=16  ✓DB ║
-- ║  Gorr       (Fighter C) : base_hp=1080 growth_hp=108  p_atk=128 g=13      ║
-- ║  Craw       (Ranged C)  : base_hp=755  growth_hp=76   p_atk=148 g=15      ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Correct hero_definitions for Gorr ─────────────────────────────────────
-- Gorr: stocky Fighter C — slightly more HP/DEF than standard Warrior, less speed.
-- Warrior C gameBalance baseline: hp=2150 → DB scale: ÷2 ≈ 1075, growth ≈ 10%
UPDATE public.hero_definitions SET
  base_hp      = 1080,   -- Warrior C ÷2, +5HP for stout body
  base_p_atk   = 128,    -- slightly below Warrior avg (cleaver, telegraphed)
  base_m_atk   = 36,     -- minimal
  base_p_def   = 100,    -- above Warrior avg (thick hide)
  base_m_def   = 76,     -- average
  base_speed   = 96,     -- below Warrior avg (heavy-set)
  growth_hp    = 108,    -- 10% of base
  growth_p_atk = 13,
  growth_m_atk = 4,
  growth_p_def = 10,
  growth_m_def = 8
WHERE hero_id = 'gorr';

-- ── 2. Correct hero_definitions for Craw ─────────────────────────────────────
-- Craw: lean Ranged C — slightly higher speed/pAtk, slightly lower HP.
-- Ranged C gameBalance baseline: hp=1580 → DB scale: ÷2 ≈ 790, growth ≈ 10%
UPDATE public.hero_definitions SET
  base_hp      = 755,    -- Ranged C ÷2, -35HP for lean build
  base_p_atk   = 148,    -- slightly above Ranged avg (accurate shooter)
  base_m_atk   = 54,
  base_p_def   = 66,     -- below avg (light armor)
  base_m_def   = 76,
  base_speed   = 122,    -- above Ranged avg (nimble)
  growth_hp    = 76,     -- 10% of base
  growth_p_atk = 15,
  growth_m_atk = 5,
  growth_p_def = 7,
  growth_m_def = 8
WHERE hero_id = 'craw';

-- ── 3. Resync player_heroes cached stats for all Gorr/Craw owners ────────────
-- Formula: FinalStat = (base + level × growth) × StarMultiplier
-- StarMultiplier (common rarity):
--   yellow stars 1-5  : × 0.05 each
--   red    stars 6-10 : × 0.08 each
--   white  stars 11-15: × 0.11 each
--   rainbow star  16  : × 0.16
-- Power = ROUND(hp/10 + p_atk×3 + m_atk×2 + p_def×2 + m_def×2 + speed×2)

UPDATE public.player_heroes ph
SET
  hp    = ROUND((hd.base_hp    + ph.level::NUMERIC * hd.growth_hp)    * sm.val),
  p_atk = ROUND((hd.base_p_atk + ph.level::NUMERIC * hd.growth_p_atk) * sm.val),
  m_atk = ROUND((hd.base_m_atk + ph.level::NUMERIC * hd.growth_m_atk) * sm.val),
  p_def = ROUND((hd.base_p_def + ph.level::NUMERIC * hd.growth_p_def) * sm.val),
  m_def = ROUND((hd.base_m_def + ph.level::NUMERIC * hd.growth_m_def) * sm.val),
  speed = ROUND(hd.base_speed::NUMERIC * sm.val),
  power = ROUND(
    ((hd.base_hp    + ph.level::NUMERIC * hd.growth_hp)    * sm.val) / 10.0 +
    ((hd.base_p_atk + ph.level::NUMERIC * hd.growth_p_atk) * sm.val) * 3.0 +
    ((hd.base_m_atk + ph.level::NUMERIC * hd.growth_m_atk) * sm.val) * 2.0 +
    ((hd.base_p_def + ph.level::NUMERIC * hd.growth_p_def) * sm.val) * 2.0 +
    ((hd.base_m_def + ph.level::NUMERIC * hd.growth_m_def) * sm.val) * 2.0 +
    (hd.base_speed::NUMERIC * sm.val) * 2.0
  )
FROM public.hero_definitions hd,
LATERAL (
  SELECT
    1.0
    + LEAST(ph.stars, 5)::NUMERIC                   * 0.05
    + GREATEST(0, LEAST(ph.stars - 5,  5))::NUMERIC * 0.08
    + GREATEST(0, LEAST(ph.stars - 10, 5))::NUMERIC * 0.11
    + CASE WHEN ph.stars >= 16 THEN 0.16 ELSE 0.0 END
    AS val
) sm
WHERE ph.hero_id IN ('gorr', 'craw')
  AND hd.hero_id  = ph.hero_id;

-- Verify (optional — check how many rows updated)
-- SELECT ph.hero_id, ph.level, ph.stars, ph.hp, ph.p_atk, ph.speed, ph.power
-- FROM public.player_heroes ph
-- WHERE ph.hero_id IN ('gorr', 'craw')
-- ORDER BY ph.hero_id, ph.level;
