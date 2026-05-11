-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v19 — Level-Up Cost Formula Fix + Complete rpc_level_up_hero         ║
-- ║                                                                              ║
-- ║  ROOT CAUSE of "level up tidak berfungsi" pada akun baru:                   ║
-- ║                                                                              ║
-- ║  BUG 1 — Formula mismatch (server ≠ UI):                                    ║
-- ║    get_hero_level_cost() lama pakai formula bracket×rarity_mult:             ║
-- ║      rare Lv1: gold=CEIL(500×1.8)=900 | exp=CEIL(80×1.8)=144               ║
-- ║    balanceEngine.ts (UI) pakai formula base+level×scale:                    ║
-- ║      rare Lv1: gold=220+1×25=245     | exp=110+1×14=124                    ║
-- ║    UI menunjukkan cost lebih murah → user pikir cukup → server tolak!        ║
-- ║                                                                              ║
-- ║  BUG 2 — Akun baru hero_exp = 0:                                            ║
-- ║    handle_new_user tidak memberi starter hero_exp → tidak bisa level up      ║
-- ║    apapun. (Fixed di patch_v18 dengan hero_exp=1000, gold=2000)             ║
-- ║                                                                              ║
-- ║  FIX:                                                                        ║
-- ║    1. Replace get_hero_level_cost → formula baru (sync dengan               ║
-- ║       balanceEngine.ts LEVELUP_GOLD_COST / LEVELUP_EXP_COST)                ║
-- ║    2. Full rpc_level_up_hero replacement (server-authoritative stats,        ║
-- ║       star bonus, correct formula) — supersedes patch_v17                   ║
-- ║    3. Boost existing accounts yang mungkin stuck (hero_exp terlalu rendah)   ║
-- ║                                                                              ║
-- ║  DEPENDENCY: patch_v17 compute_hero_stats() + get_star_bonus() harus ada.   ║
-- ║  Run AFTER patch_v17 dan patch_v18.                                          ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Replace get_hero_level_cost — formula baru, sync dengan balanceEngine.ts
--
--    Formula: cost = base + p_current_level × scale    (per rarity)
--    Matches: balanceEngine.ts LEVELUP_GOLD_COST & LEVELUP_EXP_COST exactly.
--
--    BEFORE (old bracket formula — caused mismatch):
--      rare Lv1  : gold=CEIL(500×1.8)=900  | exp=CEIL(80×1.8)=144
--      rare Lv40 : gold=CEIL(1000×1.8)=1800| exp=CEIL(160×1.8)=288
--
--    AFTER (new base+scale formula — matches UI):
--      rare Lv1  : gold=220+1×25=245        | exp=110+1×14=124
--      rare Lv40 : gold=220+40×25=1220      | exp=110+40×14=670
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_hero_level_cost(
  p_rarity        TEXT,
  p_current_level INT
)
RETURNS TABLE(
  hero_exp_cost           INT,
  gold_cost               INT,
  breakthrough_stone_cost INT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_exp_base   INT;
  v_exp_scale  INT;
  v_gold_base  INT;
  v_gold_scale INT;
  v_stone_base INT    := 0;
  v_stone_mult NUMERIC := 1.0;
  v_next_lv    INT    := p_current_level + 1;
BEGIN
  -- ── Per-rarity cost formula ─────────────────────────────────────────────────
  -- Exact values mirror balanceEngine.ts constants so UI preview = server cost.
  CASE LOWER(p_rarity)
    WHEN 'common'    THEN v_exp_base := 40;   v_exp_scale := 4;   v_gold_base := 80;   v_gold_scale := 8;   v_stone_mult := 1.0;
    WHEN 'rare'      THEN v_exp_base := 110;  v_exp_scale := 14;  v_gold_base := 220;  v_gold_scale := 25;  v_stone_mult := 1.5;
    WHEN 'epic'      THEN v_exp_base := 300;  v_exp_scale := 40;  v_gold_base := 600;  v_gold_scale := 75;  v_stone_mult := 2.0;
    WHEN 'legendary' THEN v_exp_base := 820;  v_exp_scale := 115; v_gold_base := 1600; v_gold_scale := 215; v_stone_mult := 3.0;
    WHEN 'mythic'    THEN v_exp_base := 2300; v_exp_scale := 330; v_gold_base := 4500; v_gold_scale := 620; v_stone_mult := 5.0;
    ELSE                  v_exp_base := 40;   v_exp_scale := 4;   v_gold_base := 80;   v_gold_scale := 8;   v_stone_mult := 1.0;
  END CASE;

  -- ── Breakthrough stone base (×10 version — matches stone_cost_x10.sql) ─────
  -- Stone rarity multiplier applied below.
  -- Matches HeroLevelUpPanel.tsx getStoneCostBase() × STONE_RARITY_MULT exactly.
  IF v_next_lv % 20 = 0 THEN
    IF    v_next_lv <= 40  THEN v_stone_base := 10;
    ELSIF v_next_lv <= 80  THEN v_stone_base := 20;
    ELSIF v_next_lv <= 120 THEN v_stone_base := 30;
    ELSIF v_next_lv <= 160 THEN v_stone_base := 40;
    ELSIF v_next_lv <= 180 THEN v_stone_base := 50;
    ELSIF v_next_lv <= 200 THEN v_stone_base := 60;
    ELSIF v_next_lv <= 220 THEN v_stone_base := 80;
    ELSE                        v_stone_base := 100;
    END IF;
  END IF;

  RETURN QUERY SELECT
    CEIL(v_exp_base  + p_current_level::NUMERIC * v_exp_scale)::INT   AS hero_exp_cost,
    CEIL(v_gold_base + p_current_level::NUMERIC * v_gold_scale)::INT  AS gold_cost,
    CEIL(v_stone_base::NUMERIC * v_stone_mult)::INT                   AS breakthrough_stone_cost;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_hero_level_cost(TEXT, INT) TO authenticated, anon;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Complete rpc_level_up_hero — server-authoritative stats + correct formula
--    Supersedes patch_v17 version. Key improvements over all previous versions:
--      • Uses new get_hero_level_cost (synced with balanceEngine.ts)
--      • Writes ALL stat columns atomically via compute_hero_stats()
--      • Applies star bonus correctly (level×growth formula)
--      • FOR UPDATE lock on both profile and player_heroes (race-proof)
--      • Returns new stat values so UI can update instantly without extra fetch
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.rpc_level_up_hero(TEXT, INT);

CREATE OR REPLACE FUNCTION public.rpc_level_up_hero(
  p_hero_id        TEXT,
  p_levels_to_gain INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_ph          RECORD;
  v_profile     RECORD;
  v_cur_lv      INT;
  v_new_lv      INT;
  v_gain        INT;
  v_total_exp   INT := 0;
  v_total_gold  INT := 0;
  v_total_stone INT := 0;
  v_costs       RECORD;
  v_stats       RECORD;
  i             INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  IF p_levels_to_gain < 1 OR p_levels_to_gain > 240 THEN
    RETURN jsonb_build_object('error','invalid_gain');
  END IF;

  -- ── Load hero row (lock to prevent race) ──────────────────────────────────
  SELECT ph.id, ph.hero_id, ph.level, ph.stars, ph.xp,
         hd.rarity
  INTO   v_ph
  FROM   public.player_heroes ph
  JOIN   public.hero_definitions hd ON hd.hero_id = ph.hero_id
  WHERE  ph.user_id = v_uid AND ph.hero_id = p_hero_id
  FOR UPDATE OF ph;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','not_owned');
  END IF;

  v_cur_lv := COALESCE(v_ph.level, 1);
  IF v_cur_lv >= 240 THEN
    RETURN jsonb_build_object('error','max_level');
  END IF;

  v_gain   := LEAST(p_levels_to_gain, 240 - v_cur_lv);
  v_new_lv := v_cur_lv + v_gain;

  -- ── Accumulate total cost using corrected formula ─────────────────────────
  FOR i IN 0..(v_gain - 1) LOOP
    SELECT * INTO v_costs
    FROM public.get_hero_level_cost(v_ph.rarity, v_cur_lv + i);
    v_total_exp   := v_total_exp   + v_costs.hero_exp_cost;
    v_total_gold  := v_total_gold  + v_costs.gold_cost;
    v_total_stone := v_total_stone + v_costs.breakthrough_stone_cost;
  END LOOP;

  -- ── Lock profile row ──────────────────────────────────────────────────────
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','profile_missing');
  END IF;

  -- ── Validate resources (server enforces — client cannot bypass) ───────────
  IF v_profile.hero_exp < v_total_exp THEN
    RETURN jsonb_build_object(
      'error','insufficient_exp',
      'required',  v_total_exp,
      'available', v_profile.hero_exp
    );
  END IF;

  IF v_profile.gold < v_total_gold THEN
    RETURN jsonb_build_object(
      'error','insufficient_gold',
      'required',  v_total_gold,
      'available', v_profile.gold
    );
  END IF;

  IF v_total_stone > 0 AND COALESCE(v_profile.breakthrough_stones, 0) < v_total_stone THEN
    RETURN jsonb_build_object(
      'error','insufficient_stones',
      'required',  v_total_stone,
      'available', COALESCE(v_profile.breakthrough_stones, 0)
    );
  END IF;

  -- ── Deduct resources atomically ───────────────────────────────────────────
  UPDATE public.profiles SET
    hero_exp            = hero_exp            - v_total_exp,
    gold                = gold                - v_total_gold,
    breakthrough_stones = COALESCE(breakthrough_stones, 0) - v_total_stone,
    updated_at          = NOW()
  WHERE id = v_uid;

  -- ── Compute new stats server-side (star bonus + level×growth formula) ─────
  SELECT * INTO v_stats
  FROM public.compute_hero_stats(p_hero_id, v_new_lv, v_ph.stars);

  -- ── Update level + ALL stat columns atomically ────────────────────────────
  UPDATE public.player_heroes SET
    level      = v_new_lv,
    xp         = 0,
    hp         = v_stats.o_hp,
    p_atk      = v_stats.o_p_atk,
    m_atk      = v_stats.o_m_atk,
    p_def      = v_stats.o_p_def,
    m_def      = v_stats.o_m_def,
    speed      = v_stats.o_speed,
    power      = v_stats.o_power,
    updated_at = NOW()
  WHERE user_id = v_uid AND hero_id = p_hero_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'hero_id',       p_hero_id,
    'old_level',     v_cur_lv,
    'new_level',     v_new_lv,
    'levels_gained', v_gain,
    'exp_spent',     v_total_exp,
    'gold_spent',    v_total_gold,
    'stones_spent',  v_total_stone,
    'new_hp',        v_stats.o_hp,
    'new_p_atk',     v_stats.o_p_atk,
    'new_m_atk',     v_stats.o_m_atk,
    'new_p_def',     v_stats.o_p_def,
    'new_m_def',     v_stats.o_m_def,
    'new_speed',     v_stats.o_speed,
    'new_power',     v_stats.o_power,
    'new_hero_exp',  v_profile.hero_exp            - v_total_exp,
    'new_gold',      v_profile.gold                - v_total_gold,
    'new_stones',    COALESCE(v_profile.breakthrough_stones, 0) - v_total_stone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_level_up_hero(TEXT, INT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Give starter resources to accounts that are stuck (hero_exp = 0)
--    Safe to run — only bumps accounts that have 0 hero_exp.
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE public.profiles
SET
  hero_exp            = 1000,
  gold                = GREATEST(gold, 2000),
  breakthrough_stones = GREATEST(COALESCE(breakthrough_stones, 0), 10)
WHERE hero_exp = 0;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Verify — preview cost at key levels so you can confirm UI matches server
-- ══════════════════════════════════════════════════════════════════════════════
SELECT
  rarity,
  lv AS "current_lv",
  c.hero_exp_cost,
  c.gold_cost,
  c.breakthrough_stone_cost
FROM
  (VALUES ('common'), ('rare'), ('epic')) AS r(rarity),
  (VALUES (1), (10), (20), (40)) AS l(lv),
  LATERAL public.get_hero_level_cost(r.rarity, l.lv) c
ORDER BY rarity, lv;