/**
 * heroMechanics.ts — DERIVED from heroDefs.ts
 *
 * DO NOT manually add hero mechanics here.
 * All data comes from /src/app/data/heroDefs.ts — edit that file instead.
 *
 * This file auto-builds HERO_MECHANICS from HERO_DEFS so all existing
 * consumers (BattleScreen, BattlePlayback) stay unchanged.
 */

import { HERO_DEFS } from '../data/heroDefs';

// ─── Types (unchanged public API) ────────────────────────────────────────────

export interface SkillMechanics {
  hitCount?:         number;
  hitDelay?:         number;
  noCooldown?:       boolean;
  target?:           string;
  executeThreshold?: number;
  executeMult?:      number;
  passiveType?:      string;
  maxStacks?:        number;
}

export interface HeroSkillsMechanics {
  sk2BeforeSk1?: boolean;
  sk1?: SkillMechanics;
  sk2?: SkillMechanics;
  sk3?: SkillMechanics;
  ult?: SkillMechanics;
}

// ─── Auto-build registry from heroDefs ───────────────────────────────────────

function slotMechanics(skills: typeof HERO_DEFS[0]['skills'], slot: 1|2|3|4): SkillMechanics | undefined {
  if (!skills) return undefined;
  const s = skills.find(sk => sk.slot === slot);
  if (!s) return undefined;

  const m: SkillMechanics = {};
  if (s.hitCount         != null) m.hitCount         = s.hitCount;
  if (s.hitDelay         != null) m.hitDelay         = s.hitDelay;
  if (s.noCooldown)               m.noCooldown       = true;
  if (s.executeThreshold != null) m.executeThreshold = s.executeThreshold;
  if (s.executeMult      != null) m.executeMult      = s.executeMult;
  if (s.passiveType      != null) m.passiveType      = s.passiveType;
  if (s.maxStacks        != null) m.maxStacks        = s.maxStacks;

  return Object.keys(m).length > 0 ? m : undefined;
}

export const HERO_MECHANICS: Record<string, HeroSkillsMechanics> = Object.fromEntries(
  HERO_DEFS
    .filter(d => d.battleReady && d.skills)
    .map(d => {
      const entry: HeroSkillsMechanics = {};
      if (d.sk2BeforeSk1) entry.sk2BeforeSk1 = true;
      const sk1 = slotMechanics(d.skills, 1); if (sk1) entry.sk1 = sk1;
      const sk2 = slotMechanics(d.skills, 2); if (sk2) entry.sk2 = sk2;
      const sk3 = slotMechanics(d.skills, 3); if (sk3) entry.sk3 = sk3;
      const ult = slotMechanics(d.skills, 4); if (ult) entry.ult = ult;
      return [d.name, entry];
    })
);

// ─── Helpers (unchanged public API) ──────────────────────────────────────────

export function getHeroMechanics(heroName: string): HeroSkillsMechanics {
  return HERO_MECHANICS[heroName] ?? {};
}

export function getSkillMechanics(heroName: string, slot: string): SkillMechanics {
  const hm = getHeroMechanics(heroName);
  if (slot === 'sk1') return hm.sk1 ?? {};
  if (slot === 'sk2') return hm.sk2 ?? {};
  if (slot === 'sk3') return hm.sk3 ?? {};
  if (slot === 'ult') return hm.ult ?? {};
  return {};
}

export function isNoCooldown(heroName: string, slot: string): boolean {
  return getSkillMechanics(heroName, slot).noCooldown === true;
}

export function isSk2BeforeSk1(heroName: string): boolean {
  return getHeroMechanics(heroName).sk2BeforeSk1 === true;
}
