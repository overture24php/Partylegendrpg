/**
 * expSystem.ts
 * EXP / Level-up table engine
 *
 * Level ranges & EXP required per level (to advance FROM lv → lv+1):
 *  Lv   1 –  29 →    960 EXP  (within Lv 1–30 range)
 *  Lv  30 –  39 →  1,440 EXP  (within Lv 30–40 range)
 *  Lv  40 –  59 →  2,880 EXP  (within Lv 40–60 range)
 *  Lv  60 –  79 →  7,200 EXP  (within Lv 60–80 range)
 *  Lv  80 – 999 → 14,400 EXP  (Lv 80+ up to max Lv 1000)
 *
 * Default starting level: 1 (NOT 0).
 * EXP source: stage clear rewards or idle chest (not added manually).
 *
 * `xp`    = within-level EXP (0 .. maxXp-1)
 * `maxXp` = EXP required to level up from current level
 */

export const MAX_LEVEL = 1000;

/** EXP required to advance FROM `level` to `level + 1` */
export function getMaxXpForLevel(level: number): number {
  const lv = Math.max(1, Math.min(level, MAX_LEVEL - 1));
  if (lv <  30) return    960; // Lv  1 →  2 … Lv 29 → 30
  if (lv <  40) return  1_440; // Lv 30 → 31 … Lv 39 → 40
  if (lv <  60) return  2_880; // Lv 40 → 41 … Lv 59 → 60
  if (lv <  80) return  7_200; // Lv 60 → 61 … Lv 79 → 80
  return 14_400;               // Lv 80 → 81 … Lv 999→1000
}

/** Cumulative total EXP needed to REACH `level` from Lv 1 */
export function getTotalXpToLevel(level: number): number {
  let total = 0;
  for (let lv = 1; lv < Math.min(level, MAX_LEVEL); lv++) {
    total += getMaxXpForLevel(lv);
  }
  return total;
}

export interface LevelState {
  level: number;
  xp: number;        // within-level EXP (0 .. maxXp-1)
  maxXp: number;     // EXP needed to reach next level
  exp_percentage: number; // 0–100
}

/**
 * Resolve level state from cumulative total EXP (counting from Lv 1 start).
 */
export function resolveLevelFromTotalXp(totalXp: number): LevelState {
  let remaining = Math.max(0, Math.round(totalXp));
  let level = 1; // accounts start at Lv 1

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
 * Add `gained` EXP to the current state, handling multi-level-ups.
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
 * Build an initial LevelState for a brand-new profile (Lv 1, 0 EXP).
 * Accounts always start at Level 1, not Level 0.
 */
export function freshLevelState(): LevelState {
  return { level: 1, xp: 0, maxXp: getMaxXpForLevel(1), exp_percentage: 0 };
}

/**
 * Validate & rehydrate a LevelState from DB row values.
 * Guards against NaN / out-of-range values.
 * Minimum level is 1 (never 0 for player accounts).
 */
export function hydrateLevelState(
  level: number,
  xp: number,
  maxXp: number,
  exp_percentage: number,
): LevelState {
  void maxXp; void exp_percentage; // DB values are always re-derived for safety
  const lv  = isFinite(level) ? Math.max(1, Math.min(Math.round(level), MAX_LEVEL)) : 1;
  const rawXp = isFinite(xp) ? Math.max(0, Math.round(xp)) : 0;

  // If stored xp ≥ maxXp for the stored level (stale DB data), cascade level-ups
  // rather than clamping — prevents the "stuck at 100%" visual glitch on reload.
  if (rawXp >= getMaxXpForLevel(lv) && lv < MAX_LEVEL) {
    return addExp({ level: lv, xp: 0, maxXp: getMaxXpForLevel(lv), exp_percentage: 0 }, rawXp);
  }

  const mx  = getMaxXpForLevel(lv);
  const x   = Math.min(rawXp, mx - 1); // safe clamp for normal within-level xp
  const pct = lv >= MAX_LEVEL
    ? 100
    : Math.min(99, Math.floor((x / mx) * 100)); // cap display at 99% until actual level-up
  return { level: lv, xp: x, maxXp: mx, exp_percentage: pct };
}
