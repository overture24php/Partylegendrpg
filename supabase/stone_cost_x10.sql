-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Breakthrough Stone Cost × 10 — Update get_hero_level_cost()               ║
-- ║  Semua base stone cost di-kalikan 10 untuk menambah inflasi resource.       ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- Tabel acuan: breakthrough_stones berlaku di semua rarity dengan base × rarity_mult
-- Base stones (×10):  Lv20/40=10 | Lv60/80=20 | Lv100/120=30 | Lv140/160=40
--                     Lv180=50  | Lv200=60   | Lv220=80     | Lv240=100
-- Rarity mult: C=1.0 | B=1.5 | A=2.0 | S=3.0 | SS=5.0

CREATE OR REPLACE FUNCTION public.get_hero_level_cost(
  p_rarity       TEXT,
  p_current_level INT
)
RETURNS TABLE(
  hero_exp_cost          INT,
  gold_cost              INT,
  breakthrough_stone_cost INT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_next_lv    INT  := p_current_level + 1;
  v_exp_base   INT;
  v_gold_base  INT;
  v_stone_base INT  := 0;
  v_exp_mult   NUMERIC;
  v_gold_mult  NUMERIC;
  v_stone_mult NUMERIC;
BEGIN
  -- Base costs by level bracket (Rarity C baseline)
  IF    p_current_level < 40  THEN v_exp_base := 80;    v_gold_base := 500;
  ELSIF p_current_level < 80  THEN v_exp_base := 160;   v_gold_base := 1000;
  ELSIF p_current_level < 120 THEN v_exp_base := 300;   v_gold_base := 2000;
  ELSIF p_current_level < 160 THEN v_exp_base := 550;   v_gold_base := 3800;
  ELSIF p_current_level < 200 THEN v_exp_base := 1000;  v_gold_base := 7000;
  ELSE                              v_exp_base := 1800;  v_gold_base := 13000;
  END IF;

  -- Rarity multipliers
  CASE LOWER(p_rarity)
    WHEN 'common'    THEN v_exp_mult := 1.0;  v_gold_mult := 1.0;  v_stone_mult := 1.0;
    WHEN 'rare'      THEN v_exp_mult := 1.8;  v_gold_mult := 1.8;  v_stone_mult := 1.5;
    WHEN 'epic'      THEN v_exp_mult := 3.0;  v_gold_mult := 3.0;  v_stone_mult := 2.0;
    WHEN 'legendary' THEN v_exp_mult := 5.0;  v_gold_mult := 5.0;  v_stone_mult := 3.0;
    WHEN 'mythic'    THEN v_exp_mult := 8.5;  v_gold_mult := 8.5;  v_stone_mult := 5.0;
    ELSE                  v_exp_mult := 1.0;  v_gold_mult := 1.0;  v_stone_mult := 1.0;
  END CASE;

  -- Base breakthrough stones (×10 dari versi sebelumnya)
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
    CEIL(v_exp_base  * v_exp_mult)::INT,
    CEIL(v_gold_base * v_gold_mult)::INT,
    CEIL(v_stone_base * v_stone_mult)::INT;
END;
$$;

-- Verify sample
SELECT i AS to_lv, c.*
FROM   generate_series(1, 5) AS i,
       LATERAL public.get_hero_level_cost('common', i - 1) AS c;

-- Breakthrough check (should show 10 stones at Lv20 for common)
SELECT * FROM public.get_hero_level_cost('common', 19);    -- to Lv20
SELECT * FROM public.get_hero_level_cost('mythic', 19);    -- to Lv20 SS = 10×5=50
