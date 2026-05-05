-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Hero Level Reset System                                                    ║
-- ║  Cost: 100 Gems (Diamonds) — returns 100% Hero EXP + Gold + Stones spent   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rpc_reset_hero_level(
  p_hero_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_player_hero  RECORD;
  v_hero_def     RECORD;
  v_profile      RECORD;
  v_cur_lv       INT;
  v_total_exp    INT := 0;
  v_total_gold   INT := 0;
  v_total_stones INT := 0;
  v_costs        RECORD;
  i              INT;
  RESET_COST_GEMS CONSTANT INT := 100;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  -- Fetch player hero
  SELECT * INTO v_player_hero
  FROM   public.player_heroes
  WHERE  user_id = v_uid AND hero_id = p_hero_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','not_owned');
  END IF;

  v_cur_lv := COALESCE(v_player_hero.level, 1);
  IF v_cur_lv <= 1 THEN
    RETURN jsonb_build_object('error','already_lv1', 'message', 'Hero is already at Level 1.');
  END IF;

  -- Hero rarity
  SELECT rarity INTO v_hero_def
  FROM   public.hero_definitions
  WHERE  hero_id = p_hero_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','hero_def_missing');
  END IF;

  -- Sum all resources spent from Lv1 → current-1
  FOR i IN 0..(v_cur_lv - 2) LOOP
    SELECT * INTO v_costs
    FROM   public.get_hero_level_cost(v_hero_def.rarity, i);
    v_total_exp    := v_total_exp    + v_costs.hero_exp_cost;
    v_total_gold   := v_total_gold   + v_costs.gold_cost;
    v_total_stones := v_total_stones + v_costs.breakthrough_stone_cost;
  END LOOP;

  -- Fetch profile
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','profile_missing');
  END IF;

  -- Validate gems
  IF COALESCE(v_profile.gems, 0) < RESET_COST_GEMS THEN
    RETURN jsonb_build_object(
      'error',     'insufficient_gems',
      'required',  RESET_COST_GEMS,
      'available', COALESCE(v_profile.gems, 0)
    );
  END IF;

  -- Deduct gems + refund resources
  UPDATE public.profiles SET
    gems                = gems - RESET_COST_GEMS,
    hero_exp            = hero_exp + v_total_exp,
    gold                = gold     + v_total_gold,
    breakthrough_stones = COALESCE(breakthrough_stones, 0) + v_total_stones,
    updated_at          = NOW()
  WHERE id = v_uid;

  -- Reset hero to Lv.1
  UPDATE public.player_heroes SET
    level      = 1,
    xp         = 0,
    updated_at = NOW()
  WHERE user_id = v_uid AND hero_id = p_hero_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'hero_id',        p_hero_id,
    'old_level',      v_cur_lv,
    'gems_spent',     RESET_COST_GEMS,
    'exp_refunded',   v_total_exp,
    'gold_refunded',  v_total_gold,
    'stones_refunded', v_total_stones,
    'new_gems',       COALESCE(v_profile.gems, 0) - RESET_COST_GEMS,
    'new_hero_exp',   COALESCE(v_profile.hero_exp, 0) + v_total_exp,
    'new_gold',       COALESCE(v_profile.gold, 0) + v_total_gold
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reset_hero_level(TEXT) TO authenticated;
