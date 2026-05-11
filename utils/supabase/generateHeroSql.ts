/**
 * generateHeroSql.ts
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Generates the complete SQL patch for a new hero from its HeroFullDef entry.
 *
 *  USAGE (in browser console or Node script):
 *    import { HERO_DEF_BY_ID } from '../../src/app/data/heroDefs';
 *    import { generateHeroSql } from './generateHeroSql';
 *    console.log(generateHeroSql(HERO_DEF_BY_ID['your_hero_id']));
 *    // → copy the output, paste into Supabase SQL Editor, Run.
 *
 *  OR import getNewHeroSqlPatches() into /src/app/pages/DevPage.tsx and
 *  render it there so you can copy it from the browser.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { HeroFullDef, HeroSkillDef } from '../../src/app/data/heroDefs';
import { computeBaseStats, SHIPPED_HERO_DB_STATS } from '../../src/app/constants/balanceEngine';

// ─── SQL escape helpers ───────────────────────────────────────────────────────

function sq(v: string | null): string {
  if (v === null) return 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

function num(v: number | null): string {
  return v === null ? 'NULL' : String(v);
}

// ─── hero_definitions INSERT ──────────────────────────────────────────────────

function heroDefinitionSql(def: HeroFullDef): string {
  // ── Stats source: ALWAYS use the engine when available (prevents hand-code drift).
  // If hero is in SHIPPED_HERO_DB_STATS, derive from computeBaseStats().
  // Fall back to def.stats only for heroes not yet registered in the engine.
  const shipped = SHIPPED_HERO_DB_STATS[def.heroId];
  let s: { base_hp:number; base_p_atk:number; base_m_atk:number;
            base_p_def:number; base_m_def:number; base_speed:number;
            growth_hp:number; growth_p_atk:number; growth_m_atk:number;
            growth_p_def:number; growth_m_def:number } | null = null;

  if (shipped) {
    const d = computeBaseStats(def.heroId, shipped.role, shipped.rarity);
    s = {
      base_hp: d.hp, base_p_atk: d.pAtk, base_m_atk: d.mAtk,
      base_p_def: d.pDef, base_m_def: d.mDef, base_speed: d.speed,
      growth_hp: d.growth_hp, growth_p_atk: d.growth_pAtk,
      growth_m_atk: d.growth_mAtk, growth_p_def: d.growth_pDef,
      growth_m_def: d.growth_mDef,
    };
  } else {
    s = def.stats;
  }

  if (!s) return `-- ${def.heroId}: no stats defined yet (battleReady: false)\n`;

  return `
-- ─── hero_definitions: ${def.name} ───────────────────────────────────────────
-- Stats engine-derived from balanceEngine.ts${shipped ? '' : ' (FALLBACK: no SHIPPED_HERO_DB_STATS entry — add hero to balanceEngine!)'}
INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
  (${sq(def.heroId)}, ${sq(def.name)}, ${sq(def.rarity)}, ${sq(def.heroType)}, 1,
   ${num(s.base_hp)}, ${num(s.base_p_atk)}, ${num(s.base_m_atk)},
   ${num(s.base_p_def)}, ${num(s.base_m_def)}, ${num(s.base_speed)},
   ${num(s.growth_hp)}, ${num(s.growth_p_atk)}, ${num(s.growth_m_atk)},
   ${num(s.growth_p_def)}, ${num(s.growth_m_def)},
   ${sq(def.sprites.idleUrl)}, ${sq(def.ilust)}, ${def.battleReady ? 'true' : 'false'})
ON CONFLICT (hero_id) DO UPDATE SET
  name=EXCLUDED.name, rarity=EXCLUDED.rarity, hero_type=EXCLUDED.hero_type,
  base_hp=EXCLUDED.base_hp, base_p_atk=EXCLUDED.base_p_atk,
  base_m_atk=EXCLUDED.base_m_atk, base_p_def=EXCLUDED.base_p_def,
  base_m_def=EXCLUDED.base_m_def, base_speed=EXCLUDED.base_speed,
  growth_hp=EXCLUDED.growth_hp, growth_p_atk=EXCLUDED.growth_p_atk,
  growth_m_atk=EXCLUDED.growth_m_atk, growth_p_def=EXCLUDED.growth_p_def,
  growth_m_def=EXCLUDED.growth_m_def,
  sprite_url=EXCLUDED.sprite_url, illust_url=EXCLUDED.illust_url,
  is_playable=EXCLUDED.is_playable;
`.trimStart();
}

// ─── hero_skills INSERT ───────────────────────────────────────────────────────

function heroSkillsSql(def: HeroFullDef): string {
  if (!def.skills) return `-- ${def.heroId}: no skills defined yet\n`;

  const rows = def.skills.map((s: HeroSkillDef) =>
    `  (gen_random_uuid(), ${sq(def.heroId)}, ${s.slot}, ${sq(s.name)}, ` +
    `${sq(s.skillType)}, ${num(s.damageRatio)}, ${sq(s.damageType)}, ` +
    `${sq(s.targetType)}, ${s.unlockLevel})`
  ).join(',\n');

  return `
-- ─── hero_skills: ${def.name} ────────────────────────────────────────────────
DELETE FROM public.hero_skills WHERE hero_id = ${sq(def.heroId)};
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, skill_type, damage_ratio, damage_type, target_type, unlock_level)
VALUES
${rows};
`.trimStart();
}

// ─── rpc_gacha_pull pool update ───────────────────────────────────────────────
// NOTE: There is NO gacha_pool table. The pool is a hardcoded TEXT[] array
// inside the rpc_gacha_pull SQL function body. To add a hero to the pool,
// DROP and recreate rpc_gacha_pull with the hero added to the appropriate
// v_pool_c / v_pool_b array. See patch_v15_gacha_fang_clover.sql for pattern.

function gachaPoolSql(def: HeroFullDef): string {
  if (def.gachaWeight === 0) return `-- ${def.heroId}: gachaWeight=0, skip gacha pool update.\n`;

  const rarityToPool: Record<string, string> = {
    common: 'v_pool_c', rare: 'v_pool_b', epic: 'v_pool_a',
    legendary: 'v_pool_s', mythic: 'v_pool_ss',
  };
  const pool = rarityToPool[def.rarity] ?? 'v_pool_c';

  return `
-- ─── rpc_gacha_pull: add ${def.name} to ${pool} ──────────────────────────────
-- The pool is a hardcoded array inside rpc_gacha_pull — NOT a DB table.
-- Run a DROP + CREATE of rpc_gacha_pull (see patch_v15 as template) with
-- '${def.heroId}' appended to the ${pool} array declaration:
--
--   ${pool} TEXT[] := ARRAY[..., '${def.heroId}'];
--
-- This generator CANNOT auto-patch the function body. Do it manually.
`.trimStart();
}

// ─── rpc_simulate_battle hints ────────────────────────────────────────────────
// For standard target_types, the SQL function handles them generically.
// Special mechanics need manual PL/pgSQL blocks — we output the template.

function rpcHintsSql(def: HeroFullDef): string {
  if (!def.skills) return '';

  const hints: string[] = [];

  // Check for special mechanics that need manual SQL function code
  for (const s of def.skills) {
    if (s.passiveType === 'on_kill_patk_stack') {
      hints.push(`
-- ── ${def.name} passive: on_kill_patk_stack (${s.name}) ─────────────────────
-- Add to rpc_simulate_battle INIT section (hero loading loop):
--   IF (v_u->>'hero_id') = '${def.heroId}' THEN
--     v_units := jsonb_set(v_units, ARRAY[v_k, '${def.heroId}_kill_stacks'], '0'::JSONB);
--   END IF;
--
-- Add to kill-event handler (after any unit dies from this hero's attack):
--   IF (v_units->v_attacker_k)->>'hero_id' = '${def.heroId}' THEN
--     v_stacks := LEAST(${s.maxStacks ?? 3},
--                   ((v_units->v_attacker_k)->>'${def.heroId}_kill_stacks')::INT + 1);
--     v_units := jsonb_set(v_units, ARRAY[v_attacker_k, '${def.heroId}_kill_stacks'],
--                  to_jsonb(v_stacks));
--     v_new_patk := ((v_units->v_attacker_k)->>'p_atk')::INT
--                   + ROUND(((v_units->v_attacker_k)->>'base_p_atk')::NUMERIC * ${s.damageRatio});
--     v_units := jsonb_set(v_units, ARRAY[v_attacker_k, 'p_atk'], to_jsonb(v_new_patk));
--   END IF;`);
    }

    if (s.passiveType === 'reactive_ally_hit') {
      hints.push(`
-- ── ${def.name} passive: reactive_ally_hit (${s.name}) ──────────────────────
-- Add to post-damage hook (after any ally on same side takes damage):
--   -- Find ${def.name} on same side as victim
--   FOR v_k IN SELECT k FROM jsonb_object_keys(v_units) AS t(k) LOOP
--     IF (v_units->v_k)->>'hero_id' = '${def.heroId}'
--        AND (v_units->v_k)->>'side' = (v_units->v_victim_k)->>'side'
--        AND ((v_units->v_k)->>'alive')::BOOLEAN THEN
--       IF random() < 0.35 THEN  -- 35% trigger chance
--         v_heal := ROUND(((v_units->v_k)->>'m_atk')::NUMERIC * ${s.damageRatio});
--         -- apply heal to v_victim_k, emit event skill_slot=3, hero_id='${def.heroId}'
--       END IF;
--     END IF;
--   END LOOP;`);
    }

    if (s.passiveType === 'low_hp_once') {
      hints.push(`
-- ── ${def.name} passive: low_hp_once (${s.name}) ─────────────────────────────
-- Add to post-damage hook on ${def.heroId} taking damage:
--   IF (v_units->v_${def.heroId}_k)->>'hero_id' = '${def.heroId}'
--      AND NOT ((v_units->v_${def.heroId}_k)->>'${def.heroId}_cornered')::BOOLEAN
--      AND (v_units->v_${def.heroId}_k->>'hp')::NUMERIC /
--          (v_units->v_${def.heroId}_k->>'max_hp')::NUMERIC < 0.40 THEN
--     -- Apply permanent P.ATK and Speed boost
--     v_units := jsonb_set(v_units, ARRAY[v_${def.heroId}_k, '${def.heroId}_cornered'], 'true'::JSONB);
--     -- Boost p_atk by ${(s.damageRatio * 100).toFixed(0)}%:
--     v_units := jsonb_set(v_units, ARRAY[v_${def.heroId}_k, 'p_atk'],
--       to_jsonb(ROUND(((v_units->v_${def.heroId}_k)->>'p_atk')::NUMERIC * 1.25)));
--     -- emit passive event skill_slot=3
--   END IF;`);
    }

    if (s.executeThreshold) {
      hints.push(`
-- ── ${def.name} ult: execute mechanic (${s.name}) ────────────────────────────
-- In CASE v_target_type WHEN '${s.targetType}' THEN:
--   -- Find target with lowest HP%
--   SELECT k INTO v_tuid FROM (
--     SELECT k, (v_units->k->>'hp')::NUMERIC / NULLIF((v_units->k->>'max_hp')::NUMERIC,1) AS pct
--     FROM jsonb_object_keys(v_units) AS t(k)
--     WHERE (v_units->k)->>'side' <> v_actor_side
--       AND ((v_units->k)->>'alive')::BOOLEAN
--   ) t ORDER BY pct ASC LIMIT 1;
--   v_dmg := ROUND(v_p_atk * v_skill_ratio * v_pdef_factor);
--   -- Execute bonus: multiply by ${s.executeMult} if HP% < ${s.executeThreshold}
--   IF ((v_units->v_tuid->>'hp')::NUMERIC /
--       NULLIF((v_units->v_tuid->>'max_hp')::NUMERIC,1)) < ${s.executeThreshold} THEN
--     v_dmg := v_dmg * ${s.executeMult ?? 3};
--   END IF;
--   -- apply v_dmg to v_tuid (same block as 'single')`);
    }

    if (s.targetType === 'twin_slash') {
      hints.push(`
-- ── ${def.name} sk1: twin_slash (${s.name}) ──────────────────────────────────
-- In CASE v_target_type WHEN 'twin_slash' THEN:
--   v_tuid := (SELECT k FROM jsonb_object_keys(v_units) AS t(k)
--              WHERE (v_units->k)->>'side' <> v_actor_side
--                AND ((v_units->k)->>'alive')::BOOLEAN
--              ORDER BY (v_units->k->>'slot_index')::INT DESC LIMIT 1);
--   -- Apply damage TWICE (per-hit ratio = ${s.damageRatio})
--   FOR i IN 1..2 LOOP
--     v_dmg := ROUND(v_p_atk * v_skill_ratio * v_pdef_factor);
--     -- apply damage to v_tuid (same as 'single' block)
--   END LOOP;`);
    }
  }

  if (hints.length === 0) return '';

  return `
-- ═══════════════════════════════════════════════════════════════════════════
-- MANUAL: rpc_simulate_battle additions for ${def.name}
-- These blocks must be added MANUALLY to the rpc_simulate_battle SQL function.
-- ═══════════════════════════════════════════════════════════════════════════
${hints.join('\n')}
`.trimStart();
}

// ─── Verify section ───────────────────────────────────────────────────────────

function verifySql(def: HeroFullDef): string {
  return `
-- ─── Verify: ${def.name} ─────────────────────────────────────────────────────
SELECT hero_id, name, hero_type, base_hp, base_p_atk, base_m_atk, base_speed
FROM public.hero_definitions WHERE hero_id = ${sq(def.heroId)};

SELECT hero_id, skill_slot, name, skill_type, damage_ratio, target_type, unlock_level
FROM public.hero_skills WHERE hero_id = ${sq(def.heroId)}
ORDER BY skill_slot;
`.trimStart();
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate the full SQL patch for a hero defined in heroDefs.ts.
 * Output: paste into Supabase SQL Editor and Run.
 */
export function generateHeroSql(def: HeroFullDef): string {
  const header = `-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  AUTO-GENERATED HERO PATCH — ${def.name.padEnd(34)}║
-- ║  rarity: ${def.rarity.padEnd(12)} role: ${def.heroType.padEnd(22)}║
-- ║  generated by generateHeroSql() from heroDefs.ts                ║
-- ║  Run in: Supabase Dashboard → SQL Editor → Run                   ║
-- ╚══════════════════════════════════════════════════════════════════╝\n\n`;

  return (
    header +
    heroDefinitionSql(def) + '\n' +
    heroSkillsSql(def) + '\n' +
    gachaPoolSql(def) + '\n' +
    rpcHintsSql(def) + '\n' +
    verifySql(def)
  );
}

/**
 * Generate SQL patches for ALL battle-ready heroes (useful for full DB reset).
 */
export function generateAllHeroesSql(defs: HeroFullDef[]): string {
  return defs
    .filter(d => d.battleReady)
    .map(d => generateHeroSql(d))
    .join('\n\n' + '-- ' + '═'.repeat(70) + '\n\n');
}
