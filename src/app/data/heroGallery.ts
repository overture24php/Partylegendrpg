/**
 * heroGallery.ts — DERIVED from heroDefs.ts
 *
 * DO NOT manually add hero data here.
 * All data comes from /src/app/data/heroDefs.ts — edit that file instead.
 *
 * This file re-exports the same interfaces and builds HERO_GALLERY
 * automatically from HERO_DEFS so all existing consumers stay unchanged.
 */

import { HERO_DEFS, heroSpriteName } from './heroDefs';
import type { HeroFullDef, HeroSkillDef } from './heroDefs';

// ─── Re-export interfaces (backward-compatible with all existing imports) ──────

export interface SkillRatioLevel {
  label:  string;
  values: string[];
}

export interface HeroSkillData {
  name:        string;
  description: string;
  ratioLevels: SkillRatioLevel[];
}

export interface HeroSkillSet {
  sk1: HeroSkillData;
  sk2: HeroSkillData;
  sk3: HeroSkillData;
  ult: HeroSkillData;
}

export interface HeroSkillIcons {
  sk1: string | null;
  sk2: string | null;
  sk3: string | null;
  ult: string | null;
}

export interface HeroGalleryEntry {
  heroId:     string;
  name:       string;
  rarity:     string;
  heroType:   string;
  ilust:      string | null;
  skillIcons: HeroSkillIcons;
  skills:     HeroSkillSet;
}

// ─── Placeholder fallbacks ────────────────────────────────────────────────────

const UNKNOWN_SKILL: HeroSkillData = {
  name:        '???',
  description: 'This skill has not been revealed yet.',
  ratioLevels: [],
};
const UNKNOWN_ICONS: HeroSkillIcons = { sk1: null, sk2: null, sk3: null, ult: null };
const UNKNOWN_SKILLS: HeroSkillSet  = {
  sk1: UNKNOWN_SKILL, sk2: UNKNOWN_SKILL, sk3: UNKNOWN_SKILL, ult: UNKNOWN_SKILL,
};

// ─── Derive from heroDefs ─────────────────────────────────────────────────────

function skillDataFromDef(def: HeroSkillDef): HeroSkillData {
  return { name: def.name, description: def.description, ratioLevels: def.ratioLevels };
}

function toGalleryEntry(def: HeroFullDef): HeroGalleryEntry {
  const skills = def.skills;

  if (!skills) {
    return {
      heroId: def.heroId, name: def.name, rarity: def.rarity,
      heroType: def.heroType, ilust: def.ilust,
      skillIcons: UNKNOWN_ICONS, skills: UNKNOWN_SKILLS,
    };
  }

  const bySlot: Record<number, HeroSkillDef> = {};
  for (const s of skills) bySlot[s.slot] = s;

  const sk1 = bySlot[1]; const sk2 = bySlot[2];
  const sk3 = bySlot[3]; const ult = bySlot[4];

  return {
    heroId:   def.heroId,
    name:     def.name,
    rarity:   def.rarity,
    heroType: def.heroType,
    ilust:    def.ilust,
    skillIcons: {
      sk1: sk1?.iconUrl ?? null,
      sk2: sk2?.iconUrl ?? null,
      sk3: sk3?.iconUrl ?? null,
      ult: ult?.iconUrl ?? null,
    },
    skills: {
      sk1: sk1 ? skillDataFromDef(sk1) : UNKNOWN_SKILL,
      sk2: sk2 ? skillDataFromDef(sk2) : UNKNOWN_SKILL,
      sk3: sk3 ? skillDataFromDef(sk3) : UNKNOWN_SKILL,
      ult: ult ? skillDataFromDef(ult) : UNKNOWN_SKILL,
    },
  };
}

export const HERO_GALLERY: HeroGalleryEntry[] = HERO_DEFS.map(toGalleryEntry);

// ─── Helpers (unchanged API) ──────────────────────────────────────────────────

export function getHeroIlust(heroId: string): string | null {
  const entry = HERO_GALLERY.find(h => h.heroId === heroId);
  return entry?.ilust ?? null;
}

export function getHeroById(heroId: string): HeroGalleryEntry | null {
  return HERO_GALLERY.find(h => h.heroId === heroId) ?? null;
}

export { heroSpriteName };