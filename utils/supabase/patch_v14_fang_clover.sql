-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  PATCH v14 — Add Fang (Assassin C) + Clover (Support C)                    ║
-- ║  + Full battle skill logic for both heroes in rpc_simulate_battle            ║
-- ║                                                                              ║
-- ║  STEPS:                                                                      ║
-- ║    1. hero_definitions  — INSERT Fang + Clover                              ║
-- ║    2. hero_skills       — INSERT all 4 active skill slots each              ║
-- ║    3. gacha pool        — Add both to pool C                                ║
-- ║    4. RPC function      — Update rpc_simulate_battle (OID 18193)            ║
-- ║                                                                              ║
-- ║  BALANCE REFERENCE (C rarity, DB scale ×0.5):                              ║
-- ║    Gorr   (Fighter C)  : base_hp=1080  p_atk=128  speed=96                 ║
-- ║    Craw   (Ranged C)   : base_hp=755   p_atk=148  speed=122                ║
-- ║    Water  (Support C)  : base_hp=900   m_atk=160  speed=125                ║
-- ║    Rock   (Tank C)     : base_hp=1400  p_atk=88   speed=90                 ║
-- ║                                                                              ║
-- ║    Fang   (Assassin C) : base_hp=680   p_atk=162  speed=138  (glass-cannon)║
-- ║    Clover (Support C)  : base_hp=880   m_atk=158  speed=118  (healer)      ║
-- ║                                                                              ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 0: Diagnostic — check current state
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check hero_skills schema (run separately to verify columns)
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'hero_skills' ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: hero_definitions — Fang
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fang: glass-cannon Assassin C
--   Highest Speed + P.ATK of all C heroes. Lowest HP + DEF. High skill damage ceiling.
--   Role: burst single target, execute finisher, front-row sweep.

INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
('fang', 'Fang', 'common', 'Assassin', 1,
  680, 162, 40, 48, 58, 138,
  68, 16, 4, 5, 6,
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058539/ChatGPT_Image_May_6_2026_03_43_22_PM_ejhf1t.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058505/ChatGPT_Image_May_6_2026_03_43_11_PM_xagzjf.png',
  true)
ON CONFLICT (hero_id) DO UPDATE SET
  name=EXCLUDED.name, rarity=EXCLUDED.rarity, hero_type=EXCLUDED.hero_type,
  base_hp=EXCLUDED.base_hp, base_p_atk=EXCLUDED.base_p_atk, base_m_atk=EXCLUDED.base_m_atk,
  base_p_def=EXCLUDED.base_p_def, base_m_def=EXCLUDED.base_m_def, base_speed=EXCLUDED.base_speed,
  growth_hp=EXCLUDED.growth_hp, growth_p_atk=EXCLUDED.growth_p_atk,
  growth_m_atk=EXCLUDED.growth_m_atk, growth_p_def=EXCLUDED.growth_p_def,
  growth_m_def=EXCLUDED.growth_m_def,
  sprite_url=EXCLUDED.sprite_url, illust_url=EXCLUDED.illust_url,
  is_playable=EXCLUDED.is_playable;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: hero_definitions — Clover
-- ═══════════════════════════════════════════════════════════════════════════════
-- Clover: sustained healer Support C
--   High M.ATK, moderate HP/DEF, moderate Speed.
--   Role: single-target heal, HoT, passive proc heal, AoE team recovery.

INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
('clover', 'Clover', 'common', 'Support', 1,
  880, 62, 158, 65, 100, 118,
  88, 6, 15, 6, 10,
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058829/ChatGPT_Image_May_6_2026_03_57_38_PM_jwipj1.png',
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058786/ChatGPT_Image_May_6_2026_03_55_39_PM_dssunr.png',
  true)
ON CONFLICT (hero_id) DO UPDATE SET
  name=EXCLUDED.name, rarity=EXCLUDED.rarity, hero_type=EXCLUDED.hero_type,
  base_hp=EXCLUDED.base_hp, base_p_atk=EXCLUDED.base_p_atk, base_m_atk=EXCLUDED.base_m_atk,
  base_p_def=EXCLUDED.base_p_def, base_m_def=EXCLUDED.base_m_def, base_speed=EXCLUDED.base_speed,
  growth_hp=EXCLUDED.growth_hp, growth_p_atk=EXCLUDED.growth_p_atk,
  growth_m_atk=EXCLUDED.growth_m_atk, growth_p_def=EXCLUDED.growth_p_def,
  growth_m_def=EXCLUDED.growth_m_def,
  sprite_url=EXCLUDED.sprite_url, illust_url=EXCLUDED.illust_url,
  is_playable=EXCLUDED.is_playable;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: hero_skills — Fang (5 slots: 0=basic, 1=sk1, 2=sk2, 3=passive, 4=ult)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Skill unlock: SK1 @ Lv1, SK2 @ Lv21, Passive @ Lv41, ULT @ Lv61
-- NOTE: slot 3 Hunter's Mark is a KILL-TRIGGER passive — hardcoded in function.
--       DB row still required so skill_name appears in cinematic labels.

DELETE FROM public.hero_skills WHERE hero_id = 'fang';

INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
-- slot 0: Basic Attack — fast single-target melee, no effects
(gen_random_uuid(), 'fang', 0, 'Shadow Strike',  'damage', 1.00, 'physical', 'single',              1),

-- slot 1: SK1 — Twin Slash, unlocks Lv1
-- Hits the same target TWICE. Each hit = 0.90× P.ATK (Lv1 ratio).
-- target_type='twin_slash' tells the function: apply damage_ratio twice to single target.
-- damage_ratio here is PER-HIT (0.90). Function loops 2× hits.
(gen_random_uuid(), 'fang', 1, 'Twin Slash',     'damage', 0.90, 'physical', 'twin_slash',          1),

-- slot 2: SK2 — Shadow Sprint, unlocks Lv21
-- Fang dashes through the front row, hitting ALL front-row enemies once.
-- Same targeting as Gorr ULT / Myko SK2 'front_aoe'.
(gen_random_uuid(), 'fang', 2, 'Shadow Sprint',  'damage', 0.75, 'physical', 'front_aoe',          21),

-- slot 3: Passive — Hunter's Mark, unlocks Lv41
-- Kill-trigger: each killing blow gives Fang a permanent P.ATK stack (+28% Lv1).
-- Handled entirely in-function (like Myko Fungal Resilience / Craw Cornered Rat).
-- No DB damage applied — skill_type='passive' so function skips auto-damage.
(gen_random_uuid(), 'fang', 3, "Hunter's Mark",  'passive', 0.00, 'none',    'passive_kill_stack', 41),

-- slot 4: ULT — Death Bound, unlocks Lv61
-- Targets the LOWEST current-HP-percentage enemy.
-- If that enemy's remaining HP < 35%, multiply final damage × 3.
-- damage_ratio = 2.60 (Lv1). Function checks hp_ratio < 0.35 and multiplies.
(gen_random_uuid(), 'fang', 4, 'Death Bound',    'damage', 2.60, 'physical', 'single_lowest_hp',   61);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: hero_skills — Clover (5 slots)
-- ═══════════════════════════════════════════════════════════════════════════════
-- SK1 @ Lv1, SK2 @ Lv21, Passive @ Lv41, ULT @ Lv61
-- NOTE: slot 3 Life Bloom is a HIT-RECEIVE passive — hardcoded in function.

DELETE FROM public.hero_skills WHERE hero_id = 'clover';

INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
-- slot 0: Basic Attack — ranged, single target (Clover staff poke)
(gen_random_uuid(), 'clover', 0, 'Herb Toss',       'damage', 0.75, 'magical', 'single',              1),

-- slot 1: SK1 — Healing Herb, unlocks Lv1
-- Heals the ally with the LOWEST current HP (including self if lowest).
-- skill_type='heal'. damage_ratio is heal ratio × M.ATK. target_type='single_lowest_hp_ally'.
(gen_random_uuid(), 'clover', 1, 'Healing Herb',    'heal',   1.30, 'magical', 'single_lowest_hp_ally', 1),

-- slot 2: SK2 — Lucky Toss, unlocks Lv21
-- Applies a Regeneration aura to a RANDOM alive ally (3 turns, 55%/turn M.ATK).
-- target_type='single_random_ally'. skill_type='hot' (heal-over-time).
-- Function stores a clover_hot_{uid} status; each actor-turn the bearer heals.
(gen_random_uuid(), 'clover', 2, 'Lucky Toss',      'hot',    0.55, 'magical', 'single_random_ally', 21),

-- slot 3: Passive — Life Bloom, unlocks Lv41
-- Whenever any ALLY takes a direct hit, 35% chance Clover heals that ally instantly.
-- heal ratio: 0.40 × M.ATK (Lv1). Handled fully in-function (per-attack hook).
-- skill_type='passive' so no auto damage/heal from generic slot routine.
(gen_random_uuid(), 'clover', 3, 'Life Bloom',      'passive', 0.40, 'magical', 'passive_ally_hit', 41),

-- slot 4: ULT — Bloom Cascade, unlocks Lv61
-- Heals ALL alive allies (instant burst), then applies Lucky Toss HoT to every ally.
-- Burst: 0.90 × M.ATK per ally. HoT tick: 0.38 × M.ATK per turn × 3 turns.
-- target_type='all_allies'. skill_type='heal_aoe'.
-- Function loops all alive same-side units, heals each, then marks hot_turns=3.
(gen_random_uuid(), 'clover', 4, 'Bloom Cascade',   'heal_aoe', 0.90, 'magical', 'all_allies',       61);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Add Fang + Clover to gacha pool C (if gacha tables exist)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.gacha_pool (hero_id, rarity, weight)
VALUES
  ('fang',   'common', 100),
  ('clover', 'common', 100)
ON CONFLICT (hero_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Verify
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT hero_id, name, hero_type, base_hp, base_p_atk, base_m_atk, base_speed
FROM public.hero_definitions
WHERE hero_id IN ('fang', 'clover')
ORDER BY hero_id;

SELECT hero_id, skill_slot, name, skill_type, damage_ratio, target_type, unlock_level
FROM public.hero_skills
WHERE hero_id IN ('fang', 'clover')
ORDER BY hero_id, skill_slot;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 7: rpc_simulate_battle — RPC FUNCTION CHANGES NEEDED
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Add the following blocks to the existing rpc_simulate_battle function body.
-- Find each existing hero's block (e.g., "IF v_hero_id = 'craw'") and add
-- new blocks for 'fang' and 'clover' in the same pattern.
--
-- ─── FANG INITIALISATION (add near the hero-init loop) ───────────────────────
-- IF (v_u->>'hero_id') = 'fang' THEN
--   -- Track kill stacks for Hunter's Mark passive
--   v_units := jsonb_set(v_units, ARRAY[v_k, 'fang_kill_stacks'], '0'::JSONB);
--   v_units := jsonb_set(v_units, ARRAY[v_k, 'fang_mark_triggered'], 'false'::JSONB);
-- END IF;
--
-- ─── FANG PASSIVE — Hunter's Mark (add in kill-event handler, after target dies) ─
-- When any unit dies from Fang's attack:
-- FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
--   IF (v_units->v_k)->>'hero_id' = 'fang'
--      AND (v_units->v_k)->>'side' = v_actor_side
--      AND ((v_units->v_k)->>'alive')::BOOLEAN THEN
--     v_stacks := LEAST(3, ((v_units->v_k)->>'fang_kill_stacks')::INT + 1);
--     v_units  := jsonb_set(v_units, ARRAY[v_k, 'fang_kill_stacks'], to_jsonb(v_stacks));
--     -- Boost p_atk permanently: +28%/+36%/+46%/+58% per stack level (Lv1–4 ratio)
--     -- Use Lv1 ratio 0.28 per stack as the boost (additive per kill):
--     v_new_patk := ROUND((v_units->v_k)->>'p_atk')::INT + ROUND((v_units->v_k)->>'base_p_atk')::INT * 0.28);
--     v_units    := jsonb_set(v_units, ARRAY[v_k, 'p_atk'], to_jsonb(v_new_patk));
--   END IF;
-- END LOOP;
--
-- ─── FANG SKILLS (add to skill dispatch, CASE v_target_type) ─────────────────
--
-- WHEN 'twin_slash' THEN
--   -- Hit same single target twice (damage_ratio = per-hit)
--   v_tuid := (SELECT uid FROM v_enemy_units ORDER BY slot_index LIMIT 1); -- simplified
--   FOR i IN 1..2 LOOP
--     v_dmg  := ROUND(v_p_atk * v_skill_ratio * v_pdef_factor);
--     -- apply damage to v_tuid (same block as 'single')
--   END LOOP;
--
-- WHEN 'single_lowest_hp' THEN
--   -- Target enemy with lowest current HP percentage
--   SELECT uid INTO v_tuid
--   FROM   (SELECT k AS uid, (v_units->k->>'hp')::NUMERIC / NULLIF((v_units->k->>'max_hp')::NUMERIC, 1) AS pct
--           FROM   jsonb_object_keys(v_units) AS t(k)
--           WHERE  (v_units->k)->>'side' <> v_actor_side
--             AND  ((v_units->k)->>'alive')::BOOLEAN
--          ) t
--   ORDER BY pct ASC LIMIT 1;
--   v_dmg := ROUND(v_p_atk * v_skill_ratio * v_pdef_factor);
--   -- Execute bonus: if target HP < 35%, triple damage
--   IF (v_units->v_tuid->>'hp')::NUMERIC / NULLIF((v_units->v_tuid->>'max_hp')::NUMERIC,1) < 0.35 THEN
--     v_dmg := v_dmg * 3;
--   END IF;
--   -- apply v_dmg to v_tuid (same block as 'single')
--
-- ─── CLOVER INITIALISATION (add near the hero-init loop) ─────────────────────
-- IF (v_u->>'hero_id') = 'clover' THEN
--   -- Track HoT (Lucky Toss regen) per target uid → turns remaining
--   v_units := jsonb_set(v_units, ARRAY[v_k, 'clover_hot'], '{}'::JSONB);
-- END IF;
--
-- ─── CLOVER HOT TICK (add at start of each unit's turn, before skill dispatch) ─
-- If the acting unit has a clover_hot entry, heal them:
-- v_hot_json := v_actor->'clover_hot';  -- might be on any unit
-- IF v_hot_json IS NOT NULL THEN
--   FOR v_hot_uid IN SELECT k FROM jsonb_object_keys(v_hot_json) AS t(k) LOOP
--     v_hot_turns := (v_hot_json->v_hot_uid)::INT;
--     IF v_hot_turns > 0 AND ((v_units->v_hot_uid)->>'alive')::BOOLEAN THEN
--       -- find Clover to get m_atk
--       v_clover_matk := (find_clover_unit on same side)->>'m_atk';
--       v_hot_heal := ROUND(v_clover_matk * 0.55);  -- Lucky Toss Lv1 ratio
--       -- apply heal to v_hot_uid, emit event type='hot_tick'
--       -- decrement turns
--     END IF;
--   END LOOP;
-- END IF;
--
-- ─── CLOVER SKILLS (add to skill dispatch, CASE v_target_type) ───────────────
--
-- WHEN 'single_lowest_hp_ally' THEN
--   -- Heal ally with lowest current HP %
--   SELECT k INTO v_tuid
--   FROM   jsonb_object_keys(v_units) AS t(k)
--   WHERE  (v_units->k)->>'side' = v_actor_side
--     AND  ((v_units->k)->>'alive')::BOOLEAN
--   ORDER BY (v_units->k->>'hp')::NUMERIC / NULLIF((v_units->k->>'max_hp')::NUMERIC,1)
--   LIMIT 1;
--   v_heal := ROUND(v_m_atk * v_skill_ratio);
--   -- apply heal to v_tuid, emit heal event
--
-- WHEN 'single_random_ally' THEN  (Lucky Toss — apply HoT 3 turns)
--   -- Pick random alive ally
--   SELECT k INTO v_tuid
--   FROM   jsonb_object_keys(v_units) AS t(k)
--   WHERE  (v_units->k)->>'side' = v_actor_side
--     AND  ((v_units->k)->>'alive')::BOOLEAN
--   ORDER BY random() LIMIT 1;
--   -- Store HoT on the target unit: clover_hot entry with turns=3
--   v_units := jsonb_set(v_units, ARRAY[v_tuid, 'clover_hot_turns'], '3'::JSONB);
--   v_units := jsonb_set(v_units, ARRAY[v_tuid, 'clover_hot_ratio'], to_jsonb(v_skill_ratio));
--   -- emit buff_applied event for the HoT
--
-- WHEN 'all_allies' THEN  (Bloom Cascade — burst heal all + apply HoT)
--   FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
--     IF (v_units->v_k)->>'side' = v_actor_side
--        AND ((v_units->v_k)->>'alive')::BOOLEAN THEN
--       v_heal := ROUND(v_m_atk * v_skill_ratio);
--       -- apply heal, emit heal event
--       -- Also apply HoT (0.38× M.ATK / turn × 3T)
--       v_units := jsonb_set(v_units, ARRAY[v_k, 'clover_hot_turns'], '3'::JSONB);
--       v_units := jsonb_set(v_units, ARRAY[v_k, 'clover_hot_ratio'], '0.38'::JSONB);
--     END IF;
--   END LOOP;
--
-- ─── CLOVER PASSIVE — Life Bloom (add in hit-received handler, after any dmg) ──
-- After any attack deals damage to an ally (same side as Clover):
-- FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
--   IF (v_units->v_k)->>'hero_id' = 'clover'
--      AND (v_units->v_k)->>'side' = (v_units->v_hit_uid)->>'side'
--      AND ((v_units->v_k)->>'alive')::BOOLEAN THEN
--     IF random() < 0.35 THEN  -- 35% trigger chance
--       v_bloom_heal := ROUND((v_units->v_k->>'m_atk')::NUMERIC * 0.40);
--       -- apply heal to v_hit_uid, emit passive event skill_slot=3
--     END IF;
--   END IF;
-- END LOOP;
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- REMINDER: Skill level scaling in RPC
-- ═══════════════════════════════════════════════════════════════════════════════
-- The RPC reads damage_ratio from hero_skills (Lv1 ratio), then scales up based
-- on hero level using the standard unlock tier table:
--   SK1: Lv1/21/41/61 unlock → ratio ×[1.00, 1.22, 1.50, 1.83]  (example scale)
--   Use the existing Lucas/Emma scaling approach for all new heroes.
--
-- Fang ratio progression (from description):
--   Twin Slash  per-hit: 0.90 / 1.10 / 1.35 / 1.65
--   Shadow Sprint:       0.75 / 0.92 / 1.12 / 1.38
--   Death Bound:         2.60 / 3.20 / 3.95 / 4.80
--
-- Clover ratio progression:
--   Healing Herb:        1.30 / 1.60 / 1.95 / 2.40
--   Lucky Toss (per T):  0.55 / 0.68 / 0.83 / 1.00
--   Bloom Cascade burst: 0.90 / 1.12 / 1.38 / 1.68  (+HoT 0.38/0.46/0.56/0.68 per T)
-- ═══════════════════════════════════════════════════════════════════════════════
