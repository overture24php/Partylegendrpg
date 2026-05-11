// ═══════════════════════════════════════════════════════════════════════════
//  Battle Engine — TypeScript (Deno-compatible)
//  Single source of truth for all per-turn battle logic.
//
//  No SQL, no imports, no side effects. Pure deterministic functions.
//  Each hero's unique behaviour is declared in HERO_MECHANICS at the bottom.
//  Adding a new hero = add one entry to HERO_MECHANICS. Nothing else changes.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillDef {
  skill_slot:   number;
  name:         string;
  skill_type:   string;    // 'damage' | 'heal' | 'buff' | 'passive'
  damage_ratio: number;
  damage_type:  string;    // 'physical' | 'magical'
  target_type:  string;    // see resolveTargets() switch
  unlock_level: number;
}

export interface Combatant {
  uid:              string;
  hero_id:          string;
  name:             string;
  side:             'hero' | 'enemy';
  slot_index:       number;
  level:            number;
  hero_type:        string;
  max_hp:           number;
  current_hp:       number;
  p_atk:            number;
  m_atk:            number;
  p_def:            number;
  m_def:            number;
  speed:            number;
  turn_index:       number;
  is_alive:         boolean;
  rage:             number;
  sk1_used:         boolean;
  sk2_used:         boolean;
  fang_kill_stacks?: number;
  skills:           SkillDef[];
}

export interface BattleState {
  combatants: Combatant[];
  ap:         Record<string, number>;
  winner:     string | null;
  ended:      boolean;
}

export interface TurnTarget {
  target_uid: string;
  damage:     number;
  heal:       number;
  shield?:    number;
  type:       'dmg' | 'heal' | 'shield' | 'life_bloom';
  died:       boolean;
}

export interface TurnResult {
  targets:     TurnTarget[];
  hp_state:    Record<string, number>;
  alive_state: Record<string, boolean>;
  rage_state:  Record<string, number>;
  skill_flags: Record<string, { sk1_used: boolean; sk2_used: boolean }>;
  winner:      string | null;
  ended:       boolean;
  skill_name:  string;
  skill_slot:  number;
}

// ─── Hero Mechanics Registry ─────────────────────────────────────────────────
// Mirror of /src/app/constants/heroMechanics.ts — Deno-compatible.
// Add new heroes HERE. Nothing else in this file needs to change.

interface HeroMechanics {
  /** SK2 checked before SK1 in selection priority */
  sk2BeforeSk1?: boolean;
  /** SK1 has no cooldown — fires every eligible turn */
  sk1NoCooldown?: boolean;
  /** Number of hits for SK1 (twin_slash = 2) */
  sk1HitCount?: number;
  /** Execute: bonus multiplier when target HP < threshold (applied to ULT) */
  ultExecuteThreshold?: number;
  ultExecuteMult?: number;
  /** On-kill passive: boosts P.ATK per kill, capped at maxStacks */
  onKillPatkStack?: boolean;
  onKillStackRatio?: number; // P.ATK % increase per stack (e.g. 0.28 = +28%)
  onKillMaxStacks?: number;
  /** Reactive passive: chance to heal an ally when they take damage */
  reactiveHealChance?: number;   // 0..1 probability
  reactiveHealRatio?: number;    // multiplier on M.ATK
  reactiveHealPassiveSlot?: number; // skill_slot that carries unlock_level
}

const HERO_MECHANICS: Record<string, HeroMechanics> = {
  // ── Fang ─────────────────────────────────────────────────────────────────
  fang: {
    sk2BeforeSk1:        true,   // ULT > SK2(if available) > SK1(always)
    sk1NoCooldown:       true,   // Twin Slash never goes on cooldown
    sk1HitCount:         2,      // Two hits on same target
    ultExecuteThreshold: 0.35,   // Execute bonus triggers below 35% HP
    ultExecuteMult:      3,      // Damage ×3 on execute
    onKillPatkStack:     true,   // Hunter's Mark: P.ATK +28% per kill
    onKillStackRatio:    0.28,
    onKillMaxStacks:     3,
  },
  // ── Clover ───────────────────────────────────────────────────────────────
  clover: {
    reactiveHealChance:      0.35,  // Life Bloom: 35% chance on ally hit
    reactiveHealRatio:       0.40,  // Heal = 0.40 × M.ATK  (overridden by DB if found)
    reactiveHealPassiveSlot: 3,
  },
  // ── Lucas ────────────────────────────────────────────────────────────────
  lucas: {
    onKillPatkStack:  true,
    onKillStackRatio: 0.20,
    onKillMaxStacks:  5,
  },
  // ── Gorr ─────────────────────────────────────────────────────────────────
  gorr: {
    onKillPatkStack:  true,
    onKillStackRatio: 0.25,
    onKillMaxStacks:  3,
  },
  // ── Add future heroes here. Zero SQL changes needed. ─────────────────────
};

function mech(heroId: string): HeroMechanics {
  return HERO_MECHANICS[heroId.toLowerCase()] ?? {};
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PDEF_K         = 200;   // def mitigation constant
const AP_COST        = 1000;
const ELAPSED_MIN    = 50;
const ELAPSED_MAX    = 2000;

// ─── Skill selection ─────────────────────────────────────────────────────────

function getUnlockedSlots(actor: Combatant): Set<number> {
  const set = new Set<number>();
  for (const s of actor.skills) {
    if (s.unlock_level <= actor.level && s.skill_type !== 'passive') {
      set.add(s.skill_slot);
    }
  }
  return set;
}

function selectSkill(actor: Combatant): number {
  const m = mech(actor.hero_id);
  const { rage, sk1_used, sk2_used } = actor;
  const slots = getUnlockedSlots(actor);

  // ULT always takes priority
  if (rage >= 100 && slots.has(4)) return 4;

  if (m.sk2BeforeSk1) {
    // Fang-style: SK2 when off-cd, then SK1 (no cooldown — always available)
    if (!sk2_used && slots.has(2)) return 2;
    if (slots.has(1)) return 1;
    return 0;
  }

  // Standard priority: SK1 → SK2 → Basic
  if (!sk1_used && slots.has(1)) return 1;
  if (!sk2_used && slots.has(2)) return 2;
  return 0;
}

// ─── Target resolution ───────────────────────────────────────────────────────

function resolveTargets(
  actor:    Combatant,
  all:      Combatant[],
  skill:    SkillDef,
): string[] {
  const enemies  = all.filter(c => c.is_alive && c.side !== actor.side);
  const allies   = all.filter(c => c.is_alive && c.side === actor.side && c.uid !== actor.uid);
  const frontCol = actor.side === 'hero' ? 0 : 1;

  // Front-row = even cols on hero side, odd cols on enemy side
  const frontEnemies = enemies.filter(c => c.slot_index % 2 === frontCol);
  const pool = (arr: Combatant[]) => arr.length > 0 ? arr : enemies;

  const highestSlot = (arr: Combatant[]) =>
    arr.reduce((a, b) => a.slot_index > b.slot_index ? a : b);

  switch (skill.target_type) {
    // ── Damage targets ──────────────────────────────────────────────────────
    case 'twin_slash': {
      if (enemies.length === 0) return [];
      const t = highestSlot(pool(frontEnemies));
      return [t.uid, t.uid]; // two hits, same target
    }
    case 'single_lowest_hp': {
      if (enemies.length === 0) return [];
      const t = enemies.reduce((a, b) =>
        a.current_hp / a.max_hp < b.current_hp / b.max_hp ? a : b);
      return [t.uid];
    }
    case 'front_aoe':
      return pool(frontEnemies).map(c => c.uid);
    case 'all_enemies':
      return enemies.map(c => c.uid);
    case 'single_back': {
      const backEnemies = enemies.filter(c => c.slot_index % 2 !== frontCol);
      const p = pool(backEnemies);
      if (p.length === 0) return [];
      return [p[Math.floor(Math.random() * p.length)].uid];
    }
    case 'all_back': {
      const backEnemies = enemies.filter(c => c.slot_index % 2 !== frontCol);
      return pool(backEnemies).map(c => c.uid);
    }
    case 'two_front_random': {
      const p = pool(frontEnemies);
      if (p.length === 0) return [];
      if (p.length === 1) return [p[0].uid, p[0].uid];
      const shuffled = [...p].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, 2).map(c => c.uid);
    }
    case 'two_front_highest_hp': {
      const p = pool(frontEnemies);
      if (p.length === 0) return [];
      const sorted = [...p].sort((a, b) => b.max_hp - a.max_hp);
      const two = sorted.slice(0, 2);
      return two.map(c => c.uid);
    }
    case 'highest_speed': {
      if (enemies.length === 0) return [];
      const t = enemies.reduce((a, b) => a.speed > b.speed ? a : b);
      return [t.uid];
    }
    // ── Heal/buff targets ───────────────────────────────────────────────────
    case 'all_allies':
      return [...allies, actor].map(c => c.uid);
    case 'single_ally_hp':
    case 'lowest_hp_ally': {
      const allAllied = [...allies, actor];
      const t = allAllied.reduce((a, b) =>
        a.current_hp / a.max_hp < b.current_hp / b.max_hp ? a : b);
      return [t.uid];
    }
    case 'hp_shield_self':
    case 'self':
      return [actor.uid];
    case 'single_ally_maxhp': {
      const allAllied = [...allies, actor];
      const t = allAllied.reduce((a, b) => a.max_hp > b.max_hp ? a : b);
      return [t.uid];
    }
    // ── Default: single front target (highest slot_index) ───────────────────
    default: {
      if (enemies.length === 0) return [];
      return [highestSlot(pool(frontEnemies)).uid];
    }
  }
}

// ─── Damage formula ──────────────────────────────────────────────────────────

function calcDamage(
  attacker: Combatant,
  target:   Combatant,
  ratio:    number,
  dmgType:  string,
): number {
  const atk = dmgType === 'physical' ? attacker.p_atk : attacker.m_atk;
  const def = dmgType === 'physical' ? target.p_def   : target.m_def;
  return Math.max(1, Math.floor(atk * ratio * PDEF_K / (PDEF_K + def)));
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function resolveTurnEngine(
  state:     BattleState,
  actorUid:  string,
  elapsedMs: number,
): { result: TurnResult; newState: BattleState } | { error: string } {

  // Deep-clone state so we never mutate the original
  const cs: Combatant[] = state.combatants.map(c => ({ ...c, skills: [...c.skills] }));
  const ap: Record<string, number> = { ...state.ap };

  // ── Advance AP ───────────────────────────────────────────────────────────
  const capped = Math.max(ELAPSED_MIN, Math.min(elapsedMs, ELAPSED_MAX));
  for (const c of cs) {
    if (c.is_alive) {
      ap[c.uid] = (ap[c.uid] ?? 0) + c.speed * capped / 1000;
    }
  }

  // ── Validate actor ───────────────────────────────────────────────────────
  const actorIdx = cs.findIndex(c => c.uid === actorUid);
  if (actorIdx === -1) return { error: 'actor/not-found' };
  const actor = cs[actorIdx];
  if (!actor.is_alive) return { error: 'actor/dead' };

  const actorAp = ap[actorUid] ?? 0;
  if (actorAp < AP_COST) return { error: `actor/ap-not-ready:${actorAp.toFixed(0)}` };
  ap[actorUid] = actorAp - AP_COST;

  // ── Select skill ─────────────────────────────────────────────────────────
  const slot    = selectSkill(actor);
  const skill   = (slot === 0
    ? actor.skills.find(s => s.skill_slot === 0)
    : actor.skills.filter(s => s.skill_slot === slot && s.unlock_level <= actor.level)
        .sort((a, b) => b.unlock_level - a.unlock_level)[0]
  ) ?? actor.skills.find(s => s.skill_slot === 0);

  // Hard fallback
  const skillDef: SkillDef = skill ?? {
    skill_slot: 0, name: 'Attack', skill_type: 'damage',
    damage_ratio: 1.0, damage_type: 'physical', target_type: 'single', unlock_level: 1,
  };

  // Skip passives — use basic instead
  const effectiveSkillDef: SkillDef = skillDef.skill_type === 'passive'
    ? (actor.skills.find(s => s.skill_slot === 0) ?? skillDef)
    : skillDef;

  const effectiveSlot = effectiveSkillDef.skill_slot;
  const m = mech(actor.hero_id);

  // ── Resolve targets ──────────────────────────────────────────────────────
  const targetUids = resolveTargets(actor, cs, effectiveSkillDef);

  // ── Apply skill effects ──────────────────────────────────────────────────
  const targets: TurnTarget[] = [];

  if (effectiveSkillDef.skill_type === 'damage') {
    let ratio = effectiveSkillDef.damage_ratio;

    for (const tuid of targetUids) {
      const tIdx = cs.findIndex(c => c.uid === tuid);
      if (tIdx === -1) continue;
      const tgt = cs[tIdx];
      if (!tgt.is_alive) continue;

      // Execute multiplier (Fang ULT / other execute mechanics)
      let applyRatio = ratio;
      if (effectiveSlot === 4 && m.ultExecuteThreshold && m.ultExecuteMult) {
        const hpPct = tgt.current_hp / tgt.max_hp;
        if (hpPct < m.ultExecuteThreshold) {
          applyRatio = ratio * m.ultExecuteMult;
        }
      }

      const dmg    = calcDamage(actor, tgt, applyRatio, effectiveSkillDef.damage_type);
      const newHp  = Math.max(0, tgt.current_hp - dmg);
      const died   = newHp === 0;

      cs[tIdx] = { ...tgt, current_hp: newHp, is_alive: !died };

      targets.push({ target_uid: tuid, damage: dmg, heal: 0, type: 'dmg', died });

      // ── On-kill passive (Hunter's Mark / variants) ─────────────────────
      if (died && m.onKillPatkStack) {
        const stacks = actor.fang_kill_stacks ?? 0;
        const maxS   = m.onKillMaxStacks ?? 3;
        if (stacks < maxS) {
          const newStacks = stacks + 1;
          const boost     = m.onKillStackRatio ?? 0.25;
          const newPatk   = Math.round(actor.p_atk * (1 + boost));
          cs[actorIdx] = {
            ...cs[actorIdx],
            p_atk:            newPatk,
            fang_kill_stacks: newStacks,
          };
          // Update actor reference so subsequent hits in this loop use new stats
          Object.assign(actor, cs[actorIdx]);
        }
      }

      // ── Clover Life Bloom (reactive heal on ally-hit) ──────────────────
      // Fires when the attacker is an ENEMY and target is a hero
      if (!died && tgt.side === 'hero' && actor.side === 'enemy') {
        const clover = cs.find(
          c => c.hero_id.toLowerCase() === 'clover' && c.side === 'hero' && c.is_alive
        );
        if (clover) {
          const cm = mech('clover');
          if (Math.random() < (cm.reactiveHealChance ?? 0.35)) {
            const passiveSkill = clover.skills
              .filter(s => s.skill_slot === (cm.reactiveHealPassiveSlot ?? 3) && s.unlock_level <= clover.level)
              .sort((a, b) => b.unlock_level - a.unlock_level)[0];
            const bloomRatio = passiveSkill?.damage_ratio ?? (cm.reactiveHealRatio ?? 0.40);
            const bloomHeal  = Math.max(1, Math.floor(clover.m_atk * bloomRatio));
            const bloomNewHp = Math.min(tgt.max_hp, newHp + bloomHeal);
            const tgtFresh = cs[tIdx]; // already updated
            cs[tIdx] = { ...tgtFresh, current_hp: bloomNewHp };
            targets.push({
              target_uid: tuid, damage: 0, heal: bloomHeal,
              type: 'life_bloom', died: false,
            });
          }
        }
      }
    }

  } else if (effectiveSkillDef.skill_type === 'heal') {
    const heal = Math.max(1, Math.floor(actor.m_atk * effectiveSkillDef.damage_ratio));
    for (const tuid of targetUids) {
      const tIdx = cs.findIndex(c => c.uid === tuid);
      if (tIdx === -1) continue;
      const tgt = cs[tIdx];
      if (!tgt.is_alive) continue;
      const newHp = Math.min(tgt.max_hp, tgt.current_hp + heal);
      cs[tIdx] = { ...tgt, current_hp: newHp };
      targets.push({ target_uid: tuid, damage: 0, heal, type: 'heal', died: false });
    }

  } else if (effectiveSkillDef.skill_type === 'buff') {
    // Shield value: hp_shield_self uses MaxHP, others use M.ATK
    const shieldVal = effectiveSkillDef.target_type === 'hp_shield_self'
      ? Math.max(1, Math.floor(actor.max_hp * effectiveSkillDef.damage_ratio))
      : Math.max(1, Math.floor(actor.m_atk * effectiveSkillDef.damage_ratio));

    for (const tuid of targetUids) {
      targets.push({
        target_uid: tuid, damage: 0, heal: 0,
        shield: shieldVal, type: 'shield', died: false,
      });
    }
  }

  // ── Post-action: rage + skill flags ──────────────────────────────────────
  let newRage   = actor.rage;
  let newSk1    = actor.sk1_used;
  let newSk2    = actor.sk2_used;

  if (effectiveSlot === 4) {
    newRage = 0; newSk1 = false; newSk2 = false; // ULT resets
  } else if (effectiveSlot === 1) {
    newRage = Math.min(100, newRage + 15);
    // Fang SK1: no cooldown — do NOT set sk1_used
    if (!m.sk1NoCooldown) newSk1 = true;
  } else if (effectiveSlot === 2) {
    newRage = Math.min(100, newRage + 15);
    newSk2  = true;
  } else {
    newRage = Math.min(100, newRage + 5); // basic attack rage gain
  }

  cs[actorIdx] = {
    ...cs[actorIdx],
    rage:        newRage,
    sk1_used:    newSk1,
    sk2_used:    newSk2,
    turn_index:  actor.turn_index + 1,
  };

  // ── Check winner ─────────────────────────────────────────────────────────
  const heroAlive  = cs.some(c => c.side === 'hero'  && c.is_alive);
  const enemyAlive = cs.some(c => c.side === 'enemy' && c.is_alive);
  const winner: string | null = !enemyAlive ? 'hero' : !heroAlive ? 'enemy' : null;

  // ── Build response maps ───────────────────────────────────────────────────
  const hp_state:    Record<string, number>  = {};
  const alive_state: Record<string, boolean> = {};
  const rage_state:  Record<string, number>  = {};
  const skill_flags: Record<string, { sk1_used: boolean; sk2_used: boolean }> = {};

  for (const c of cs) {
    hp_state[c.uid]    = c.current_hp;
    alive_state[c.uid] = c.is_alive;
    rage_state[c.uid]  = c.rage;
    skill_flags[c.uid] = { sk1_used: c.sk1_used, sk2_used: c.sk2_used };
  }

  const newState: BattleState = {
    combatants: cs,
    ap,
    winner,
    ended: winner !== null,
  };

  const result: TurnResult = {
    targets,
    hp_state,
    alive_state,
    rage_state,
    skill_flags,
    winner,
    ended: winner !== null,
    skill_name: effectiveSkillDef.name,
    skill_slot: effectiveSlot,
  };

  return { result, newState };
}
