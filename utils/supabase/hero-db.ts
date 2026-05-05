/**
 * hero-db.ts
 * All hero, skill, and stage DB operations via service_role (bypasses RLS).
 * Schema: hero_definitions, hero_skills, player_heroes, player_hero_skills,
 *         stage_definitions, stage_enemies
 */
import { projectId, serviceRoleKey } from './info';

const REST = `https://${projectId}.supabase.co/rest/v1`;
const ADMIN: Record<string, string> = {
  apikey:        serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Accept:         'application/json',
};

async function parseErr(r: Response): Promise<string> {
  try { const j = await r.json(); return j?.message ?? `HTTP ${r.status}`; }
  catch { return `HTTP ${r.status}`; }
}

// ─── Auto-setup ─────────────────────────────────────────────────────────────
export interface HeroDbSetupResult {
  ok:              boolean;
  msg:             string;
  needsManualSQL?: string;
}

export async function setupHeroDatabase(): Promise<HeroDbSetupResult> {
  try {
    const r = await fetch(`${REST}/hero_definitions?select=hero_id&limit=1`, { headers: ADMIN });
    if (r.ok) {
      console.log('[HeroDB] ✓ Tables verified');
      return { ok: true, msg: 'ready' };
    }
    const body = await r.json().catch(() => ({})) as Record<string, unknown>;
    const missing =
      r.status === 404 ||
      (body as { code?: string }).code === 'PGRST200' ||
      ((body as { message?: string }).message ?? '').includes('relation');

    if (missing) {
      // Cannot auto-create from browser — pg/query and rpc/exec_sql are
      // Studio-only internals. Surface the SQL for manual execution.
      return { ok: false, msg: 'manual-sql-required', needsManualSQL: HERO_SQL_SCHEMA };
    }
    return { ok: false, msg: `Unexpected: ${(body as { message?: string }).message ?? r.status}` };
  } catch (e) {
    return { ok: false, msg: String(e) };
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────
export interface HeroDef {
  hero_id:    string;
  name:       string;
  rarity:     string;          // common|rare|epic|legendary|mythic
  hero_type:  string;
  stars:      number;
  base_hp:    number;
  base_p_atk: number;
  base_m_atk: number;
  base_p_def: number;
  base_m_def: number;
  base_speed: number;
  growth_hp:  number;
  growth_p_atk: number;
  growth_m_atk: number;
  growth_p_def: number;
  growth_m_def: number;
  power_weight: number;
  sprite_url:  string;
  illust_url:  string;
  is_playable: boolean;
}

export interface HeroSkillDef {
  skill_id:       string;
  hero_id:        string;
  skill_slot:     number;   // 0=basic 1=skill1 2=skill2 3=ultimate
  name:           string;
  description:    string;
  skill_type:     string;   // damage|heal|buff|debuff
  damage_ratio:   number;
  damage_type:    string;   // physical|magical
  effect_type:    string | null;
  effect_duration: number;
  effect_chance:  number;   // 0-100 %
  target_type:    string;   // single|all_enemies|all_allies|self
  unlock_level:   number;
  max_skill_level: number;
}

export interface PlayerHero {
  id:         string;
  user_id:    string;
  hero_id:    string;
  stars:      number;
  level:      number;
  xp:         number;
  hp:         number;
  p_atk:      number;
  m_atk:      number;
  p_def:      number;
  m_def:      number;
  speed:      number;
  power:      number;
  obtained_at: string;
}

export interface PlayerHeroSkill {
  id:          string;
  user_id:     string;
  hero_id:     string;
  skill_id:    string;
  skill_level: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
}

export interface StageDef {
  stage_id:           string;
  chapter:            number;
  stage_number:       number;
  name:               string;
  recommended_power:  number;
  exp_reward:         number;
  gold_reward:        number;
  gem_reward:         number;
  hero_exp_reward:    number;
  energy_cost:        number;
}

export interface StageEnemy {
  id:           string;
  stage_id:     string;
  enemy_hero_id: string;
  enemy_level:  number;
  slot_position: number;
  order_index:  number;
}

// ─── Computed stats helper ─────────────────────────────────────────────────
export function computeStats(def: HeroDef, level: number): {
  hp: number; p_atk: number; m_atk: number;
  p_def: number; m_def: number; speed: number; power: number;
} {
  const lv = Math.max(1, level) - 1;
  const hp    = def.base_hp    + lv * def.growth_hp;
  const p_atk = def.base_p_atk + lv * def.growth_p_atk;
  const m_atk = def.base_m_atk + lv * def.growth_m_atk;
  const p_def = def.base_p_def + lv * def.growth_p_def;
  const m_def = def.base_m_def + lv * def.growth_m_def;
  const speed = def.base_speed; // speed doesn't scale with level
  const power = Math.round(
    (hp / 10) + (p_atk * 3) + (m_atk * 2) + (p_def * 2) + (m_def * 2) + (speed * 2)
  );
  return { hp, p_atk, m_atk, p_def, m_def, speed, power };
}

// ─── fetchAllHeroDefs ───────────────────────────────────────────────────────
export async function fetchAllHeroDefs(): Promise<HeroDef[]> {
  try {
    const r = await fetch(`${REST}/hero_definitions?order=hero_id.asc`, { headers: ADMIN });
    if (!r.ok) return [];
    return (await r.json()) as HeroDef[];
  } catch { return []; }
}

// ─── fetchHeroSkills ────────────────────────────────────────────────────────
export async function fetchHeroSkills(heroId?: string): Promise<HeroSkillDef[]> {
  try {
    const q = heroId
      ? `hero_id=eq.${encodeURIComponent(heroId)}&`
      : '';
    const r = await fetch(`${REST}/hero_skills?${q}order=hero_id.asc,skill_slot.asc`, { headers: ADMIN });
    if (!r.ok) return [];
    return (await r.json()) as HeroSkillDef[];
  } catch { return []; }
}

// ─── fetchPlayerHeroes ──────────────────────────────────────────────────────
export async function fetchPlayerHeroes(userId: string): Promise<PlayerHero[]> {
  try {
    const r = await fetch(
      `${REST}/player_heroes?user_id=eq.${encodeURIComponent(userId)}&order=obtained_at.asc`,
      { headers: ADMIN }
    );
    if (!r.ok) return [];
    return (await r.json()) as PlayerHero[];
  } catch { return []; }
}

// ─── fetchPlayerHeroSkills ───────���─────────────────────────────────────────
export async function fetchPlayerHeroSkills(userId: string): Promise<PlayerHeroSkill[]> {
  try {
    const r = await fetch(
      `${REST}/player_hero_skills?user_id=eq.${encodeURIComponent(userId)}`,
      { headers: ADMIN }
    );
    if (!r.ok) return [];
    return (await r.json()) as PlayerHeroSkill[];
  } catch { return []; }
}

// ─── upsertPlayerHero ───────────────────────────────────────────────────────
export async function upsertPlayerHero(ph: Omit<PlayerHero, 'id' | 'obtained_at'>): Promise<{ err?: string }> {
  try {
    const r = await fetch(`${REST}/player_heroes?on_conflict=user_id,hero_id`, {
      method: 'POST',
      headers: { ...ADMIN, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: ph.user_id, hero_id: ph.hero_id,
        stars: ph.stars, level: ph.level, xp: ph.xp,
        hp: ph.hp, p_atk: ph.p_atk, m_atk: ph.m_atk,
        p_def: ph.p_def, m_def: ph.m_def, speed: ph.speed,
        power: ph.power,
      }),
    });
    if (!r.ok) return { err: await parseErr(r) };
    return {};
  } catch (e) { return { err: String(e) }; }
}

// ─── upsertPlayerHeroSkill ──────────────────────────────────────────────────
export async function upsertPlayerHeroSkill(ps: Omit<PlayerHeroSkill, 'id' | 'unlocked_at'>): Promise<{ err?: string }> {
  try {
    const r = await fetch(`${REST}/player_hero_skills`, {
      method: 'POST',
      headers: { ...ADMIN, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id:     ps.user_id,
        hero_id:     ps.hero_id,
        skill_id:    ps.skill_id,
        skill_level: ps.skill_level,
        is_unlocked: ps.is_unlocked,
      }),
    });
    if (!r.ok) return { err: await parseErr(r) };
    return {};
  } catch (e) { return { err: String(e) }; }
}

// ─── fetchStageDef ──────────────────────────────────────────────────────────
export async function fetchStageDef(stageId: string): Promise<StageDef | null> {
  try {
    const r = await fetch(
      `${REST}/stage_definitions?stage_id=eq.${encodeURIComponent(stageId)}&limit=1`,
      { headers: ADMIN }
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as StageDef[];
    return rows[0] ?? null;
  } catch { return null; }
}

// ─── fetchStageEnemies ─────────────────────────────────────────────────────
export async function fetchStageEnemies(stageId: string): Promise<StageEnemy[]> {
  try {
    const r = await fetch(
      `${REST}/stage_enemies?stage_id=eq.${encodeURIComponent(stageId)}&order=order_index.asc`,
      { headers: ADMIN }
    );
    if (!r.ok) return [];
    return (await r.json()) as StageEnemy[];
  } catch { return []; }
}

// ─── seedStarterHeroes: give new player Lucas + Emma if they have none ───────

// ─── seedPlayerHeroIgnore: INSERT hero row — silently no-ops if already exists ─
// CRITICAL: uses resolution=ignore-duplicates (NOT merge-duplicates) so this
// function can NEVER overwrite an existing hero's level, xp, or stats.
async function seedPlayerHeroIgnore(
  ph: Omit<Parameters<typeof upsertPlayerHero>[0], never>,
): Promise<void> {
  try {
    const r = await fetch(`${REST}/player_heroes?on_conflict=user_id,hero_id`, {
      method: 'POST',
      headers: { ...ADMIN, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: ph.user_id, hero_id: ph.hero_id,
        stars: ph.stars, level: ph.level, xp: ph.xp,
        hp: ph.hp, p_atk: ph.p_atk, m_atk: ph.m_atk,
        p_def: ph.p_def, m_def: ph.m_def, speed: ph.speed,
        power: ph.power,
      }),
    });
    if (!r.ok) console.warn('[Seed] hero insert skipped:', await parseErr(r));
  } catch (e) { console.warn('[Seed] hero insert error:', e); }
}

// ─── seedPlayerHeroSkillIgnore: INSERT skill row — no-op if already exists ───
async function seedPlayerHeroSkillIgnore(
  ps: Omit<Parameters<typeof upsertPlayerHeroSkill>[0], never>,
): Promise<void> {
  try {
    const r = await fetch(`${REST}/player_hero_skills?on_conflict=user_id,hero_id,skill_id`, {
      method: 'POST',
      headers: { ...ADMIN, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id:     ps.user_id,
        hero_id:     ps.hero_id,
        skill_id:    ps.skill_id,
        skill_level: ps.skill_level,
        is_unlocked: ps.is_unlocked,
      }),
    });
    if (!r.ok) console.warn('[Seed] skill insert skipped:', await parseErr(r));
  } catch (e) { console.warn('[Seed] skill insert error:', e); }
}

export async function seedStarterHeroes(
  userId: string,
  heroDefs: HeroDef[],
  skillDefs: HeroSkillDef[],
): Promise<void> {
  // Guard: only attempt seeding if we can confirm the player has no heroes.
  // fetchPlayerHeroes returns [] both for "truly empty" AND for network error.
  // We use ignore-duplicates inserts below so even if the guard is bypassed by
  // a transient error, existing rows are NEVER overwritten — level stays safe.
  const existing = await fetchPlayerHeroes(userId);
  if (existing.length > 0) return; // already seeded — fast exit

  const starters = ['lucas', 'emma'];
  for (const heroId of starters) {
    const def = heroDefs.find(d => d.hero_id === heroId);
    if (!def) continue;

    const stats = computeStats(def, 1);
    // SAFE INSERT: ignore-duplicates means existing hero records are untouched
    await seedPlayerHeroIgnore({ user_id: userId, hero_id: heroId, stars: def.stars, level: 1, xp: 0, ...stats });

    // Seed skill states — ignore if already present
    const heroSkills = skillDefs.filter(s => s.hero_id === heroId);
    for (const skill of heroSkills) {
      const isUnlocked = skill.unlock_level <= 1;
      await seedPlayerHeroSkillIgnore({
        user_id:     userId,
        hero_id:     heroId,
        skill_id:    skill.skill_id,
        skill_level: 1,
        is_unlocked: isUnlocked,
      });
    }
  }
}

// ─── SQL Schema string (run in Supabase SQL Editor) ────────────────────────
export const HERO_SQL_SCHEMA = `
-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  RPG Game — Hero System Schema                                   ║
-- ║  Run once in: Supabase Dashboard → SQL Editor                   ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- hero_definitions: master data for every hero/enemy in the game
CREATE TABLE IF NOT EXISTS public.hero_definitions (
  hero_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  rarity        TEXT NOT NULL DEFAULT 'common',
  hero_type     TEXT NOT NULL DEFAULT 'Warrior',
  stars         INTEGER NOT NULL DEFAULT 1,
  base_hp       INTEGER NOT NULL DEFAULT 1000,
  base_p_atk    INTEGER NOT NULL DEFAULT 100,
  base_m_atk    INTEGER NOT NULL DEFAULT 50,
  base_p_def    INTEGER NOT NULL DEFAULT 80,
  base_m_def    INTEGER NOT NULL DEFAULT 60,
  base_speed    INTEGER NOT NULL DEFAULT 100,
  growth_hp     INTEGER NOT NULL DEFAULT 150,
  growth_p_atk  INTEGER NOT NULL DEFAULT 15,
  growth_m_atk  INTEGER NOT NULL DEFAULT 8,
  growth_p_def  INTEGER NOT NULL DEFAULT 10,
  growth_m_def  INTEGER NOT NULL DEFAULT 8,
  power_weight  INTEGER NOT NULL DEFAULT 100,
  sprite_url    TEXT DEFAULT '',
  illust_url    TEXT DEFAULT '',
  is_playable   BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- hero_skills: master skill definitions
CREATE TABLE IF NOT EXISTS public.hero_skills (
  skill_id        TEXT PRIMARY KEY,
  hero_id         TEXT NOT NULL REFERENCES public.hero_definitions(hero_id) ON DELETE CASCADE,
  skill_slot      INTEGER NOT NULL DEFAULT 0,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  skill_type      TEXT NOT NULL DEFAULT 'damage',
  damage_ratio    NUMERIC(6,3) NOT NULL DEFAULT 1.000,
  damage_type     TEXT NOT NULL DEFAULT 'physical',
  effect_type     TEXT,
  effect_duration INTEGER NOT NULL DEFAULT 0,
  effect_chance   INTEGER NOT NULL DEFAULT 0,
  target_type     TEXT NOT NULL DEFAULT 'single',
  unlock_level    INTEGER NOT NULL DEFAULT 1,
  max_skill_level INTEGER NOT NULL DEFAULT 10,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- player_heroes: each player's owned heroes + current stats
CREATE TABLE IF NOT EXISTS public.player_heroes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hero_id     TEXT NOT NULL REFERENCES public.hero_definitions(hero_id),
  stars       INTEGER NOT NULL DEFAULT 1,
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  hp          INTEGER NOT NULL DEFAULT 0,
  p_atk       INTEGER NOT NULL DEFAULT 0,
  m_atk       INTEGER NOT NULL DEFAULT 0,
  p_def       INTEGER NOT NULL DEFAULT 0,
  m_def       INTEGER NOT NULL DEFAULT 0,
  speed       INTEGER NOT NULL DEFAULT 0,
  power       INTEGER NOT NULL DEFAULT 0,
  obtained_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, hero_id)
);

CREATE INDEX IF NOT EXISTS idx_player_heroes_user ON public.player_heroes(user_id);

-- player_hero_skills: per-player skill unlock & level state
CREATE TABLE IF NOT EXISTS public.player_hero_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hero_id     TEXT NOT NULL,
  skill_id    TEXT NOT NULL REFERENCES public.hero_skills(skill_id) ON DELETE CASCADE,
  skill_level INTEGER NOT NULL DEFAULT 1,
  is_unlocked BOOLEAN NOT NULL DEFAULT false,
  unlocked_at TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_player_hero_skills_user ON public.player_hero_skills(user_id);

-- stage_definitions
CREATE TABLE IF NOT EXISTS public.stage_definitions (
  stage_id            TEXT PRIMARY KEY,
  chapter             INTEGER NOT NULL DEFAULT 1,
  stage_number        INTEGER NOT NULL DEFAULT 1,
  name                TEXT NOT NULL DEFAULT '',
  recommended_power   INTEGER NOT NULL DEFAULT 0,
  exp_reward          INTEGER NOT NULL DEFAULT 100,
  gold_reward         INTEGER NOT NULL DEFAULT 3000,
  gem_reward          INTEGER NOT NULL DEFAULT 20,
  hero_exp_reward     INTEGER NOT NULL DEFAULT 1000,
  energy_cost         INTEGER NOT NULL DEFAULT 6,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- stage_enemies
CREATE TABLE IF NOT EXISTS public.stage_enemies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id        TEXT NOT NULL REFERENCES public.stage_definitions(stage_id) ON DELETE CASCADE,
  enemy_hero_id   TEXT NOT NULL REFERENCES public.hero_definitions(hero_id),
  enemy_level     INTEGER NOT NULL DEFAULT 1,
  slot_position   INTEGER NOT NULL DEFAULT 0,
  order_index     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.hero_definitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hero_skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_heroes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_hero_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_enemies      ENABLE ROW LEVEL SECURITY;

-- hero_definitions & hero_skills: readable by all authenticated users
DROP POLICY IF EXISTS "hero_def_read"   ON public.hero_definitions;
CREATE POLICY "hero_def_read"   ON public.hero_definitions   FOR SELECT USING (true);
DROP POLICY IF EXISTS "hero_skill_read" ON public.hero_skills;
CREATE POLICY "hero_skill_read" ON public.hero_skills        FOR SELECT USING (true);
DROP POLICY IF EXISTS "stage_def_read"  ON public.stage_definitions;
CREATE POLICY "stage_def_read"  ON public.stage_definitions  FOR SELECT USING (true);
DROP POLICY IF EXISTS "stage_enemy_read" ON public.stage_enemies;
CREATE POLICY "stage_enemy_read" ON public.stage_enemies     FOR SELECT USING (true);

-- player_heroes: own rows only
DROP POLICY IF EXISTS "player_hero_select" ON public.player_heroes;
CREATE POLICY "player_hero_select" ON public.player_heroes   FOR SELECT  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "player_hero_insert" ON public.player_heroes;
CREATE POLICY "player_hero_insert" ON public.player_heroes   FOR INSERT  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "player_hero_update" ON public.player_heroes;
CREATE POLICY "player_hero_update" ON public.player_heroes   FOR UPDATE  USING (auth.uid() = user_id);

-- player_hero_skills: own rows only
DROP POLICY IF EXISTS "player_skill_select" ON public.player_hero_skills;
CREATE POLICY "player_skill_select" ON public.player_hero_skills FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "player_skill_insert" ON public.player_hero_skills;
CREATE POLICY "player_skill_insert" ON public.player_hero_skills FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "player_skill_update" ON public.player_hero_skills;
CREATE POLICY "player_skill_update" ON public.player_hero_skills FOR UPDATE USING (auth.uid() = user_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_player_heroes_upd      ON public.player_heroes;
CREATE TRIGGER trg_player_heroes_upd      BEFORE UPDATE ON public.player_heroes      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_player_hero_skills_upd ON public.player_hero_skills;
CREATE TRIGGER trg_player_hero_skills_upd BEFORE UPDATE ON public.player_hero_skills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Seed hero_definitions ────────────────────────────────────────────────────
INSERT INTO public.hero_definitions
  (hero_id, name, rarity, hero_type, stars,
   base_hp, base_p_atk, base_m_atk, base_p_def, base_m_def, base_speed,
   growth_hp, growth_p_atk, growth_m_atk, growth_p_def, growth_m_def,
   sprite_url, illust_url, is_playable)
VALUES
-- Lucas (Rare/Fighter) — stats at Lv1 match HeroPage
('lucas', 'Lucas', 'rare', 'Fighter', 2,
 2838, 323, 99, 257, 205, 132,
 280, 32, 10, 26, 20,
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630336/idle_luk_mobysy.png',
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777386997/LUCAS_tyqcnf.png',
 true),
-- Emma (Rare/Support) — stats at Lv1 match HeroPage
('emma', 'Emma', 'rare', 'Support', 2,
 2402, 178, 271, 209, 267, 147,
 240, 18, 27, 21, 27,
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630434/idle_em_p8uxjs.png',
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777387003/emma_aqsnsd.png',
 true),
-- Rock Slime (Common/Tank) — enemy
('rock_slime', 'Rock Slime', 'common', 'Tank', 1,
 1800, 120, 30, 160, 80, 65,
 180, 12, 3, 16, 8,
 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634810/Gemini_Generated_Image_c7qsl1c7qsl1c7qs_mekkjz.png',
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545681/ChatGPT_Image_Apr_30_2026_05_38_28_PM_wzt4ox.png',
 false),
-- Acid Slime (Common/Ranged) — enemy
('acid_slime', 'Acid Slime', 'common', 'Ranged', 1,
 1100, 140, 120, 80, 100, 110,
 110, 14, 12, 8, 10,
 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634782/ChatGPT_Image_May_1_2026_06_25_59_PM_dsoxsd.png',
 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545738/ChatGPT_Image_Apr_30_2026_05_39_48_PM_oq2njh.png',
 false)
ON CONFLICT (hero_id) DO NOTHING;

-- ── Seed hero_skills ─────────────────────────────────────────────────────────
INSERT INTO public.hero_skills
  (skill_id, hero_id, skill_slot, name, description,
   skill_type, damage_ratio, damage_type, effect_type, effect_duration, effect_chance,
   target_type, unlock_level, max_skill_level)
VALUES
-- Lucas skills
('lucas_basic',  'lucas', 0, 'Slash',        'A swift slash dealing physical damage to one enemy.',
 'damage', 1.000, 'physical', NULL, 0, 0, 'single', 1, 10),
('lucas_skill1', 'lucas', 1, 'Power Strike',  'A powerful blow dealing 2× physical damage to one enemy.',
 'damage', 2.000, 'physical', NULL, 0, 0, 'single', 1, 10),
('lucas_skill2', 'lucas', 2, 'Whirlwind',     'Lucas spins, dealing 1.5× physical damage to ALL enemies.',
 'damage', 1.500, 'physical', NULL, 0, 0, 'all_enemies', 5, 10),
('lucas_ult',    'lucas', 3, 'Blade Storm',   'Unleash a storm of blades — 3.5× physical damage to ALL enemies with 30% chance to stun.',
 'damage', 3.500, 'physical', 'stun', 1, 30, 'all_enemies', 10, 10),
-- Emma skills
('emma_basic',   'emma',  0, 'Staff Strike',  'A light strike dealing 0.8× physical damage to one enemy.',
 'damage', 0.800, 'physical', NULL, 0, 0, 'single', 1, 10),
('emma_skill1',  'emma',  1, 'Heal',          'Channel healing energy restoring 1.8× M.Atk HP to one ally.',
 'heal',   1.800, 'magical',  NULL, 0, 0, 'single', 1, 10),
('emma_skill2',  'emma',  2, 'Group Heal',    'Restore 1.0× M.Atk HP to ALL allies.',
 'heal',   1.000, 'magical',  NULL, 0, 0, 'all_allies', 5, 10),
('emma_ult',     'emma',  3, 'Barrier',       'Bestow a protective barrier on ALL allies absorbing 2.5× M.Atk damage for 2 turns.',
 'buff',   2.500, 'magical',  'shield', 2, 100, 'all_allies', 10, 10),
-- Rock Slime skills
('rock_basic',   'rock_slime', 0, 'Body Slam',    'Hurls its rocky body for 0.9× physical damage.',
 'damage', 0.900, 'physical', NULL, 0, 0, 'single', 1, 10),
('rock_skill1',  'rock_slime', 1, 'Rock Throw',   'Hurls a boulder dealing 1.4× physical damage to one enemy.',
 'damage', 1.400, 'physical', NULL, 0, 0, 'single', 1, 10),
('rock_skill2',  'rock_slime', 2, 'Stone Wall',   'Hardens shell — raises own P.Def by 40% for 2 turns.',
 'buff',   0.000, 'physical', 'def_up', 2, 100, 'self', 5, 10),
('rock_ult',     'rock_slime', 3, 'Boulder Crush','Crushes one target with 2.8× physical damage with 40% stun chance.',
 'damage', 2.800, 'physical', 'stun', 1, 40, 'single', 10, 10),
-- Acid Slime skills
('acid_basic',   'acid_slime', 0, 'Acid Spit',    'Spits corrosive acid for 0.9× magical damage.',
 'damage', 0.900, 'magical',  NULL, 0, 0, 'single', 1, 10),
('acid_skill1',  'acid_slime', 1, 'Acid Spray',   'Sprays acid on ALL enemies for 0.75× magical damage.',
 'damage', 0.750, 'magical',  NULL, 0, 0, 'all_enemies', 1, 10),
('acid_skill2',  'acid_slime', 2, 'Poison Mist',  'Releases toxic mist — 0.6× magical damage + 60% poison (2 turns) to ALL enemies.',
 'damage', 0.600, 'magical',  'poison', 2, 60, 'all_enemies', 5, 10),
('acid_ult',     'acid_slime', 3, 'Acid Nova',    'Explosion of pure acid — 2.2× magical damage + 80% poison (3 turns) to ALL enemies.',
 'damage', 2.200, 'magical',  'poison', 3, 80, 'all_enemies', 10, 10)
ON CONFLICT (skill_id) DO NOTHING;

-- ── Seed stage_definitions ───────────────────────────────────────────────────
INSERT INTO public.stage_definitions
  (stage_id, chapter, stage_number, name, recommended_power,
   exp_reward, gold_reward, gem_reward, hero_exp_reward, energy_cost)
VALUES
('1-1', 1, 1, 'Slime Meadow',  800, 100, 3000, 20, 1000, 6),
('1-2', 1, 2, 'Rocky Path',   1200, 120, 3500, 22, 1200, 6)
ON CONFLICT (stage_id) DO NOTHING;

-- ── Seed stage_enemies ───────────────────────────────────────────────────────
INSERT INTO public.stage_enemies
  (stage_id, enemy_hero_id, enemy_level, slot_position, order_index)
VALUES
('1-1', 'rock_slime', 1, 1, 0),
('1-1', 'acid_slime', 1, 3, 1),
('1-2', 'rock_slime', 2, 0, 0),
('1-2', 'rock_slime', 2, 2, 1),
('1-2', 'acid_slime', 2, 4, 2)
ON CONFLICT DO NOTHING;
`;