/**
 * battleEngine.ts
 * Core turn-based battle logic for the RPG game.
 *
 * Turn order: highest Speed acts first; ties broken by hero vs enemy
 *             (heroes go before enemies on equal speed).
 *
 * Skill rotation per combatant (resets each full cycle):
 *   Turn 1 → Basic Attack (slot 0)
 *   Turn 2 → Skill 1      (slot 1)  — if unlocked, else basic
 *   Turn 3 → Skill 2      (slot 2)  — if unlocked, else basic
 *   Turn 4 → back to Basic…
 *
 * Stun: combatant skips their turn. Cycle counter does NOT advance for them.
 *
 * Damage formula:
 *   physical → floor(attacker.p_atk × ratio × (200 / (200 + target.p_def)))
 *   magical  → floor(attacker.m_atk × ratio × (200 / (200 + target.m_def)))
 *
 * Heal formula:
 *   heal amount = floor(caster.m_atk × ratio)
 */

import type { HeroSkillDef } from '../../utils/supabase/hero-db';

// ─── Public types ────────────────────────────────────────────────────────────
export type Side = 'hero' | 'enemy';

export interface StatusEffect {
  type:      'stun' | 'poison' | 'burn' | 'shield' | 'def_up' | 'atk_up';
  remaining: number;   // turns left
  value?:    number;   // for shield: amount, for poison: dpt
}

export interface Combatant {
  uid:         string;        // unique in battle — e.g. 'lucas', 'enemy_rock_slime_slot1'
  name:        string;
  hero_id:     string;
  side:        Side;
  slot:        number;        // formation slot 0-5
  // Stats
  max_hp:      number;
  current_hp:  number;
  p_atk:       number;
  m_atk:       number;
  p_def:       number;
  m_def:       number;
  speed:       number;
  // Skill catalog for this combatant
  skills:      HeroSkillDef[];
  // Battle state
  turn_index:  number;        // counts successful (non-stunned) turns taken (0-based)
  status:      StatusEffect[];
  is_alive:    boolean;
}

export interface BattleAction {
  /** The combatant whose turn it is */
  actorUid:    string;
  /** Skill used */
  skillUsed:   HeroSkillDef;
  /** Targets affected (may be empty for self-buffs, etc.) */
  targets:     ActionTarget[];
}

export interface ActionTarget {
  targetUid:   string;
  damage:      number;    // positive = damage dealt; 0 = heal/buff
  heal:        number;    // positive = healed
  statusApplied?: StatusEffect;
  died:        boolean;
}

export interface BattleLog {
  round:       number;   // starts at 1
  actions:     BattleAction[];
  turnOrder:   string[]; // uid list in speed order for this round
}

export interface BattleState {
  combatants:  Combatant[];
  round:       number;
  logs:        BattleLog[];
  winner:      Side | null;
  ended:       boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function aliveOf(state: BattleState, side: Side): Combatant[] {
  return state.combatants.filter(c => c.side === side && c.is_alive);
}

function byUid(state: BattleState, uid: string): Combatant | undefined {
  return state.combatants.find(c => c.uid === uid);
}

/** Speed-sorted turn order — heroes beat enemies on ties */
function buildTurnOrder(state: BattleState): Combatant[] {
  return state.combatants
    .filter(c => c.is_alive)
    .sort((a, b) =>
      b.speed !== a.speed
        ? b.speed - a.speed
        : a.side === 'hero' ? -1 : 1
    );
}

/** Choose the skill slot to use based on turn_index */
function chooseSkill(actor: Combatant): HeroSkillDef {
  const cyclePos = actor.turn_index % 3; // 0=basic, 1=skill1, 2=skill2
  const slotTarget = cyclePos; // slot 0, 1, or 2
  const skill = actor.skills.find(s => s.skill_slot === slotTarget);
  // fallback to basic if skill not found / locked
  return skill ?? actor.skills.find(s => s.skill_slot === 0) ?? actor.skills[0];
}

/** Pick a random alive enemy from target side */
function pickSingleTarget(state: BattleState, attackerSide: Side): Combatant | null {
  const enemies = aliveOf(state, attackerSide === 'hero' ? 'enemy' : 'hero');
  if (enemies.length === 0) return null;
  return enemies[Math.floor(Math.random() * enemies.length)];
}

/** Pick a random alive ally (excluding self, unless self is only option) */
function pickAllyTarget(state: BattleState, actor: Combatant): Combatant {
  const allies = aliveOf(state, actor.side).filter(c => c.uid !== actor.uid);
  if (allies.length === 0) return actor; // heal self if no allies
  // Pick lowest HP ally (triage)
  allies.sort((a, b) => (a.current_hp / a.max_hp) - (b.current_hp / b.max_hp));
  return allies[0];
}

function calcDamage(attacker: Combatant, target: Combatant, skill: HeroSkillDef): number {
  const baseAtk = skill.damage_type === 'physical' ? attacker.p_atk : attacker.m_atk;
  const baseDef = skill.damage_type === 'physical' ? target.p_def  : target.m_def;
  // Check if target has def_up buff
  const defMult = target.status.some(s => s.type === 'def_up') ? 1.4 : 1;
  const mitigation = 200 / (200 + baseDef * defMult);
  return Math.max(1, Math.floor(baseAtk * skill.damage_ratio * mitigation));
}

function calcHeal(caster: Combatant, skill: HeroSkillDef): number {
  return Math.floor(caster.m_atk * skill.damage_ratio);
}

function isStunned(c: Combatant): boolean {
  return c.status.some(s => s.type === 'stun' && s.remaining > 0);
}

function tickStatus(c: Combatant): number {
  // Returns poison damage dealt this tick
  let poisonDmg = 0;
  c.status = c.status
    .map(s => {
      if (s.type === 'poison' && s.value) poisonDmg += s.value;
      return { ...s, remaining: s.remaining - 1 };
    })
    .filter(s => s.remaining > 0);
  return poisonDmg;
}

function checkWinner(state: BattleState): Side | null {
  if (aliveOf(state, 'enemy').length === 0) return 'hero';
  if (aliveOf(state, 'hero').length  === 0) return 'enemy';
  return null;
}

// ─── initBattle ─────────────────────────────────────────────────────────────
export function initBattle(
  heroes:  Omit<Combatant, 'turn_index' | 'status' | 'is_alive' | 'current_hp'>[],
  enemies: Omit<Combatant, 'turn_index' | 'status' | 'is_alive' | 'current_hp'>[],
): BattleState {
  const combatants: Combatant[] = [
    ...heroes,
    ...enemies,
  ].map(c => ({ ...c, current_hp: c.max_hp, turn_index: 0, status: [], is_alive: true }));
  return { combatants, round: 1, logs: [], winner: null, ended: false };
}

// ─── processTurn: execute ONE full round (all combatants act once) ───────────
export function processTurn(state: BattleState): BattleState {
  if (state.ended) return state;

  const order = buildTurnOrder(state);
  const log: BattleLog = { round: state.round, actions: [], turnOrder: order.map(c => c.uid) };

  // Deep clone combatants for mutation
  const combs = state.combatants.map(c => ({
    ...c,
    status: c.status.map(s => ({ ...s })),
  }));

  const getC = (uid: string) => combs.find(c => c.uid === uid)!;

  for (const actor of order) {
    const a = getC(actor.uid);
    if (!a.is_alive) continue;

    // Tick status effects on actor
    const poisonDmg = tickStatus(a);
    if (poisonDmg > 0) {
      a.current_hp = Math.max(0, a.current_hp - poisonDmg);
      if (a.current_hp === 0) a.is_alive = false;
    }
    if (!a.is_alive) continue;

    // Skip if stunned (status already ticked, so stun duration reduced)
    if (isStunned(a)) continue;

    // Choose skill
    const skill = chooseSkill(a);
    const targets: ActionTarget[] = [];

    if (skill.skill_type === 'damage') {
      const resolveTargets = (): Combatant[] => {
        if (skill.target_type === 'all_enemies')
          return aliveOf({ ...state, combatants: combs }, a.side === 'hero' ? 'enemy' : 'hero');
        const t = pickSingleTarget({ ...state, combatants: combs }, a.side);
        return t ? [t] : [];
      };
      for (const targ of resolveTargets()) {
        const t = getC(targ.uid);
        const dmg = calcDamage(a, t, skill);
        t.current_hp = Math.max(0, t.current_hp - dmg);
        let applied: StatusEffect | undefined;
        if (skill.effect_type && skill.effect_type !== 'shield' && Math.random() * 100 < skill.effect_chance) {
          applied = { type: skill.effect_type as StatusEffect['type'], remaining: skill.effect_duration };
          if (skill.effect_type === 'poison') applied.value = Math.floor(a.m_atk * 0.15);
          t.status.push(applied);
        }
        if (t.current_hp === 0) t.is_alive = false;
        targets.push({ targetUid: t.uid, damage: dmg, heal: 0, statusApplied: applied, died: !t.is_alive });
      }
    } else if (skill.skill_type === 'heal') {
      const resolveTargets = (): Combatant[] => {
        if (skill.target_type === 'all_allies')
          return aliveOf({ ...state, combatants: combs }, a.side);
        return [pickAllyTarget({ ...state, combatants: combs }, a)];
      };
      for (const targ of resolveTargets()) {
        const t = getC(targ.uid);
        const amt = calcHeal(a, skill);
        t.current_hp = Math.min(t.max_hp, t.current_hp + amt);
        targets.push({ targetUid: t.uid, damage: 0, heal: amt, died: false });
      }
    } else if (skill.skill_type === 'buff') {
      // self or all_allies buff (shield, def_up, etc.)
      const resolveTargets = (): Combatant[] => {
        if (skill.target_type === 'all_allies') return aliveOf({ ...state, combatants: combs }, a.side);
        if (skill.target_type === 'self')        return [a];
        return [a];
      };
      for (const targ of resolveTargets()) {
        const t = getC(targ.uid);
        const eff: StatusEffect = {
          type:      skill.effect_type as StatusEffect['type'] ?? 'shield',
          remaining: skill.effect_duration,
          value:     skill.effect_type === 'shield' ? calcHeal(a, skill) : undefined,
        };
        t.status.push(eff);
        targets.push({ targetUid: t.uid, damage: 0, heal: 0, statusApplied: eff, died: false });
      }
    }

    a.turn_index += 1;
    log.actions.push({ actorUid: a.uid, skillUsed: skill, targets });
  }

  const winner = checkWinner({ ...state, combatants: combs });

  return {
    combatants: combs,
    round:  state.round + 1,
    logs:   [...state.logs, log],
    winner,
    ended:  winner !== null || state.round >= 50,
  };
}

/** Run the entire battle to completion (max 50 rounds) — returns final state */
export function simulateBattle(
  heroes:  Omit<Combatant, 'turn_index' | 'status' | 'is_alive' | 'current_hp'>[],
  enemies: Omit<Combatant, 'turn_index' | 'status' | 'is_alive' | 'current_hp'>[],
): BattleState {
  let state = initBattle(heroes, enemies);
  while (!state.ended) {
    state = processTurn(state);
  }
  return state;
}
