/**
 * HeroContext.tsx
 * Manages the player's hero collection, skill states, hero master data,
 * and stage data. All reads verified against Supabase (service_role).
 */

import {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  fetchAllHeroDefs,
  fetchHeroSkills,
  fetchPlayerHeroes,
  fetchPlayerHeroSkills,
  fetchStageDef,
  fetchStageEnemies,
  upsertPlayerHero,
  seedStarterHeroes,
  setupHeroDatabase,
  type HeroDef,
  type HeroSkillDef,
  type PlayerHero,
  type PlayerHeroSkill,
  type StageDef,
  type StageEnemy,
  HERO_SQL_SCHEMA,
} from '/utils/supabase/hero-db';
import { computeStarBonus, computeFinalStats } from '../constants/balanceEngine';
import { getSupabase } from '../../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────
/** A player's hero enriched with its definition and skill states */
export interface OwnedHero {
  playerHero:   PlayerHero;
  def:          HeroDef;
  skills:       HeroSkillDef[];       // master skill defs for this hero
  playerSkills: PlayerHeroSkill[];    // player's unlock/level states
}

/** Enemy info for a stage slot */
export interface StageEnemyFull {
  enemy:    StageEnemy;
  def:      HeroDef;
  skills:   HeroSkillDef[];
}

export interface HeroContextType {
  heroDefs:       HeroDef[];
  skillDefs:      HeroSkillDef[];
  ownedHeroes:    OwnedHero[];
  isLoading:      boolean;
  refreshHeroes:  () => Promise<void>;
  levelUpHero:    (heroId: string, levelsToGain?: number) => Promise<{ err?: string; newLevel?: number }>;
  loadStage:      (stageId: string) => Promise<{ def: StageDef; enemies: StageEnemyFull[] } | null>;
  getHeroDef:     (heroId: string) => HeroDef | undefined;
  getHeroSkills:  (heroId: string) => HeroSkillDef[];
  sqlSchema:      string;
}

const HeroContext = createContext<HeroContextType | null>(null);

// ─── DB setup guard ────────────────────────────────────────────────────────
let _heroDbReady = false;
let _heroDbCheck: Promise<void> | null = null;
let _needsManualSql = false;

async function ensureHeroDb(): Promise<void> {
  if (_heroDbReady) return;
  if (_heroDbCheck) return _heroDbCheck;
  _heroDbCheck = (async () => {
    const result = await setupHeroDatabase();
    if (result.ok) {
      _heroDbReady = true;
    } else {
      _needsManualSql = true;
    }
    _heroDbCheck = null;
  })();
  return _heroDbCheck;
}

export function heroDbNeedsManualSql() { return _needsManualSql; }
// ─── Provider ───────────────────────────────────────────────────────────────
export function HeroProvider({ children }: { children: ReactNode }) {
  const { user, updateProfile } = useAuth();

  const [heroDefs,    setHeroDefs]    = useState<HeroDef[]>([]);
  const [skillDefs,   setSkillDefs]   = useState<HeroSkillDef[]>([]);
  const [ownedHeroes, setOwnedHeroes] = useState<OwnedHero[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);

  // Load master data on mount (no user required)
  useEffect(() => {
    (async () => {
      await ensureHeroDb();
      const [defs, skills] = await Promise.all([fetchAllHeroDefs(), fetchHeroSkills()]);
      setHeroDefs(defs);
      setSkillDefs(skills);
      console.log('[HeroDB] ✓ Loaded', defs.length, 'defs,', skills.length, 'skills');
    })();
  }, []);

  // Load / seed player heroes when user changes
  const loadPlayerHeroes = useCallback(async (userId: string) => {
    setIsLoading(true);
    try {
      const [defs, skills] = await Promise.all([
        fetchAllHeroDefs(),
        fetchHeroSkills(),
      ]);
      setHeroDefs(defs);
      setSkillDefs(skills);

      // NOTE: seedStarterHeroes is intentionally NOT called here.
      // Seeding only runs once at login (see useEffect below).
      // Calling seed inside every loadPlayerHeroes is dangerous: if
      // fetchPlayerHeroes returns [] due to a transient network error,
      // the seed upsert runs and can reset existing hero levels to 1.

      const [rawHeroes, rawPSkills] = await Promise.all([
        fetchPlayerHeroes(userId),
        fetchPlayerHeroSkills(userId),
      ]);

      // Guard: if the network failed and returned empty, keep previous
      // ownedHeroes state intact rather than wiping it.
      if (rawHeroes.length === 0 && rawPSkills.length === 0) {
        // Both empty could be a network error — only clear if defs loaded OK
        // (defs are public; if they also failed, something is wrong globally)
        if (defs.length > 0) {
          // Defs loaded but heroes empty — likely the player genuinely has none
          // OR a transient error. Re-use previous state to avoid blank screen.
          const prev = rawHeroes; // still []
          const enriched = prev
            .map(ph => {
              const def = defs.find(d => d.hero_id === ph.hero_id);
              if (!def) return null;
              return {
                playerHero: ph, def,
                skills: skills.filter(s => s.hero_id === ph.hero_id),
                playerSkills: rawPSkills.filter(s => s.hero_id === ph.hero_id),
              };
            })
            .filter((o): o is OwnedHero => o !== null);
          // Only overwrite if we had heroes before → this prevents transient blank
          setOwnedHeroes(prev2 => prev2.length > 0 ? prev2 : enriched);
        }
        return;
      }

      const enriched: OwnedHero[] = rawHeroes
        .map(ph => {
          const def      = defs.find(d => d.hero_id === ph.hero_id);
          if (!def) return null;
          return {
            playerHero:   ph,
            def,
            skills:       skills.filter(s => s.hero_id === ph.hero_id),
            playerSkills: rawPSkills.filter(s => s.hero_id === ph.hero_id),
          };
        })
        .filter((o): o is OwnedHero => o !== null);

      setOwnedHeroes(enriched);
      console.log('[HeroDB] ✓ Player owns', enriched.length, 'heroes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) {
      // Seeding happens ONCE here at login — never inside loadPlayerHeroes.
      // fetchAllHeroDefs + fetchHeroSkills are needed for seeding; after that,
      // loadPlayerHeroes re-fetches them efficiently from its own parallel call.
      (async () => {
        const [defs, skills] = await Promise.all([fetchAllHeroDefs(), fetchHeroSkills()]);
        await seedStarterHeroes(user.id, defs, skills);
        await loadPlayerHeroes(user.id);
      })();
    } else {
      setOwnedHeroes([]);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshHeroes = useCallback(async () => {
    // refreshHeroes ONLY fetches — never seeds. Safe to call any time.
    if (user?.id) await loadPlayerHeroes(user.id);
  }, [user?.id, loadPlayerHeroes]);

  const levelUpHero = useCallback(async (heroId: string, levelsToGain = 1): Promise<{ err?: string; newLevel?: number }> => {
    if (!user?.id) return { err: 'Not logged in' };
    const owned = ownedHeroes.find(o => o.playerHero.hero_id === heroId);
    if (!owned) return { err: 'Hero not owned' };

    // ── Server-side RPC: validates resources, deducts costs, increments level ──
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('rpc_level_up_hero', {
      p_hero_id:       heroId,
      p_levels_to_gain: levelsToGain,
    });

    if (error) return { err: error.message };
    const res = data as Record<string, unknown>;
    if (res?.error) {
      const code = String(res.error);
      if (code === 'insufficient_exp')    return { err: `Hero EXP kurang. Butuh ${res.required}, punya ${res.available}.` };
      if (code === 'insufficient_gold')   return { err: `Gold kurang. Butuh ${res.required}, punya ${res.available}.` };
      if (code === 'insufficient_stones') return { err: `Breakthrough Stone kurang. Butuh ${res.required}, punya ${res.available}.` };
      if (code === 'max_level')           return { err: 'Hero sudah Level MAX (240).' };
      return { err: code };
    }

    const newLevel = Number(res.new_level ?? owned.playerHero.level + levelsToGain);

    // ── FinalStat = (base + level × growth) × StarBonus — balanceEngine formula ─
    const d  = owned.def;
    const s  = computeFinalStats(d, newLevel, owned.playerHero.stars);
    const power = Math.round((s.hp/10) + (s.pAtk*3) + (s.mAtk*2) + (s.pDef*2) + (s.mDef*2) + (s.speed*2));
    const stats = { hp: s.hp, p_atk: s.pAtk, m_atk: s.mAtk, p_def: s.pDef, m_def: s.mDef, speed: s.speed, power };

    // ── Write updated stats back to player_heroes DB ──────────────────────────
    // Critical: rpc_start_battle reads ph.hp/p_atk/m_atk/p_def/m_def directly.
    // rpc_level_up_hero only updates the level column, so we must resync the
    // computed stat columns here — otherwise battle always uses stale Lv1 stats.
    const { err: syncErr } = await upsertPlayerHero({
      user_id: user.id,
      hero_id: heroId,
      stars:   owned.playerHero.stars,
      level:   newLevel,
      xp:      0,
      ...stats,
    });
    if (syncErr) console.warn('[HeroDB] stat-sync after level up failed:', syncErr);

    // ── Sync hero stats locally ──────────────────────────────────────────────
    setOwnedHeroes(prev => prev.map(o =>
      o.playerHero.hero_id === heroId
        ? { ...o, playerHero: { ...o.playerHero, level: newLevel, xp: 0, ...stats } }
        : o
    ));

    // ── Sync profile resources locally (optimistic, server is authoritative) ─
    await updateProfile({
      hero_exp:           Math.max(0, (user.hero_exp)            - Number(res.exp_spent   ?? 0)),
      gold:               Math.max(0, (user.gold)                - Number(res.gold_spent  ?? 0)),
      breakthrough_stones: Math.max(0, (user.breakthrough_stones ?? 0) - Number(res.stones_spent ?? 0)),
    });

    // ── Force DB sync: ensures UI always reflects authoritative DB state ──────
    // Critical: after rpc_level_up_hero + upsertPlayerHero, DB has correct
    // level + stats. Reload so reset panel / battle always read fresh values.
    await loadPlayerHeroes(user.id);

    return { newLevel };
  }, [user, ownedHeroes, updateProfile, loadPlayerHeroes]);

  const loadStage = useCallback(async (
    stageId: string
  ): Promise<{ def: StageDef; enemies: StageEnemyFull[] } | null> => {
    const [def, enemies] = await Promise.all([
      fetchStageDef(stageId),
      fetchStageEnemies(stageId),
    ]);
    if (!def) { console.warn('[HeroDB] Stage not found:', stageId); return null; }

    const defs   = heroDefs.length   > 0 ? heroDefs   : await fetchAllHeroDefs();
    const skills = skillDefs.length  > 0 ? skillDefs  : await fetchHeroSkills();

    const fullEnemies: StageEnemyFull[] = enemies
      .map(e => ({
        enemy:  e,
        def:    defs.find(d => d.hero_id === e.enemy_hero_id)!,
        skills: skills.filter(s => s.hero_id === e.enemy_hero_id),
      }))
      .filter(f => !!f.def);

    return { def, enemies: fullEnemies };
  }, [heroDefs, skillDefs]);

  const getHeroDef    = useCallback((hid: string) => heroDefs.find(d => d.hero_id === hid),  [heroDefs]);
  const getHeroSkills = useCallback((hid: string) => skillDefs.filter(s => s.hero_id === hid), [skillDefs]);

  return (
    <HeroContext.Provider value={{
      heroDefs, skillDefs, ownedHeroes, isLoading,
      refreshHeroes, levelUpHero, loadStage,
      getHeroDef, getHeroSkills,
      sqlSchema: HERO_SQL_SCHEMA,
    }}>
      {children}
    </HeroContext.Provider>
  );
}

export function useHero() {
  const ctx = useContext(HeroContext);
  if (!ctx) throw new Error('useHero must be used within HeroProvider');
  return ctx;
}