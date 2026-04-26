/**
 * expSystem.ts
 * EXP / Level-up table engine
 *
 * Level ranges & XP per level:
 *  Lv   1 –   30 →  1,440 XP
 *  Lv  31 –   40 →  2,880 XP
 *  Lv  41 –   50 →  7,200 XP
 *  Lv  51 –   70 → 14,400 XP
 *  Lv  71 –   90 → 28,800 XP
 *  Lv  91 –  100 → 43,200 XP
 *  Lv 101 – 1000 → 86,400 XP
 *
 * `xp`    = within-level XP (0 .. maxXp-1)
 * `maxXp` = XP required to level up from current level
 */

export const MAX_LEVEL = 1000;

/** XP required to advance FROM `level` to `level + 1` */
export function getMaxXpForLevel(level: number): number {
  const lv = Math.max(0, Math.min(level, MAX_LEVEL - 1));
  if (lv <= 30)  return 1_440;
  if (lv <= 40)  return 2_880;
  if (lv <= 50)  return 7_200;
  if (lv <= 70)  return 14_400;
  if (lv <= 90)  return 28_800;
  if (lv <= 100) return 43_200;
  return 86_400;
}

/** Cumulative total XP needed to REACH `level` from Lv 0 */
export function getTotalXpToLevel(level: number): number {
  let total = 0;
  for (let lv = 0; lv < Math.min(level, MAX_LEVEL); lv++) {
    total += getMaxXpForLevel(lv);
  }
  return total;
}

export interface LevelState {
  level: number;
  xp: number;        // within-level XP
  maxXp: number;     // XP needed for this level
  exp_percentage: number; // 0–100
}

/**
 * Resolve level state from cumulative total XP.
 * Useful for recomputing level from an absolute XP store.
 */
export function resolveLevelFromTotalXp(totalXp: number): LevelState {
  let remaining = Math.max(0, Math.round(totalXp));
  let level = 0;

  while (level < MAX_LEVEL) {
    const needed = getMaxXpForLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }

  const maxXp = getMaxXpForLevel(level);
  const exp_percentage = level >= MAX_LEVEL
    ? 100
    : Math.min(100, Math.floor((remaining / maxXp) * 100));

  return { level, xp: remaining, maxXp, exp_percentage };
}

/**
 * Add `gained` XP to the current state, handling multi-level-ups.
 * Returns the new LevelState.
 */
export function addExp(current: LevelState, gained: number): LevelState {
  if (gained <= 0) return current;

  let { level, xp } = current;
  xp += Math.round(gained);

  // Cascade level-ups
  while (level < MAX_LEVEL) {
    const needed = getMaxXpForLevel(level);
    if (xp < needed) break;
    xp -= needed;
    level++;
  }

  // Cap at MAX_LEVEL
  if (level >= MAX_LEVEL) {
    level = MAX_LEVEL;
    xp = 0;
  }

  const maxXp = getMaxXpForLevel(level);
  const exp_percentage = level >= MAX_LEVEL
    ? 100
    : Math.min(100, Math.floor((xp / maxXp) * 100));

  return { level, xp, maxXp, exp_percentage };
}

/**
 * Build an initial LevelState for a brand-new profile (Lv 0, 0 XP).
 */
export function freshLevelState(): LevelState {
  return { level: 0, xp: 0, maxXp: getMaxXpForLevel(0), exp_percentage: 0 };
}

/**
 * Validate & rehydrate a LevelState from DB row values.
 * Guards against NaN / out-of-range values.
 */
export function hydrateLevelState(
  level: number,
  xp: number,
  maxXp: number,
  exp_percentage: number,
): LevelState {
  const lv  = isFinite(level) ? Math.max(0, Math.min(Math.round(level), MAX_LEVEL)) : 0;
  const mx  = getMaxXpForLevel(lv); // always derive from table, not DB
  const x   = isFinite(xp) ? Math.max(0, Math.min(Math.round(xp), mx - 1)) : 0;
  const pct = lv >= MAX_LEVEL
    ? 100
    : Math.min(100, Math.floor((x / mx) * 100));
  void maxXp; void exp_percentage; // DB values are re-derived for safety
  return { level: lv, xp: x, maxXp: mx, exp_percentage: pct };
}
