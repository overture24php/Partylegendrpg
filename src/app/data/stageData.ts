/**
 * stageData.ts — Deterministic stage data generator
 * All 5 chapters × 40 stages, enemies from the 10 C-Rarity hero pool.
 * Boss stages: 20 & 40 in every chapter.
 *
 * SLOT PLACEMENT RULES (must match FormationGrid colIdx logic):
 *   Enemy side → col 0 = FRONT (even slot indices 0,2,4): Tank / Fighter / Assassin
 *   Enemy side → col 1 = BACK  (odd  slot indices 1,3,5): Ranged / Support / Mage
 */

// ─── Role-segregated enemy pools ─────────────────────────────────────────────
/** Front row — Tank, Fighter, Assassin */
const FRONT_ENEMIES = ['rock_slime', 'myko', 'gorr', 'fang', 'bolo', 'quill'] as const;
/** Back row — Ranged, Support */
const BACK_ENEMIES  = ['acid_slime', 'water_slime', 'craw', 'clover'] as const;

/** Boss-only front pool (weighted toward tankier picks) */
const BOSS_FRONT: readonly string[] = ['rock_slime', 'myko', 'gorr', 'bolo', 'quill', 'fang'];
/** Boss-only back pool */
const BOSS_BACK:  readonly string[] = ['acid_slime', 'water_slime', 'craw', 'clover'];

export interface StageClientData {
  name:       string;
  recPower:   number;
  /** 6-element slot array — null = empty. Even indices (0,2,4) = front; odd (1,3,5) = back */
  enemySlots: (string | null)[];
  rewards:    { exp: number; heroExp: number; gold: number; gems: number };
  isBoss:     boolean;
}

// ─── Seeded pseudo-random ─────────────────────────────────────────────────────
function seededRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function pickRandom(pool: readonly string[], seed: number): string {
  return pool[Math.floor(seededRand(seed) * pool.length)];
}

// ─── Power brackets: [normalMin, normalMax] for stages 1-40 ─────────────────
const CHAPTER_POWER: [number, number][] = [
  [300,       20_000],      // Ch 1  Grasslands
  [22_000,    90_000],      // Ch 2  Dark Forest
  [100_000,   320_000],     // Ch 3  Stone Mountains
  [350_000,   1_100_000],   // Ch 4  Ancient Dungeon
  [1_200_000, 3_500_000],   // Ch 5  Volcanic Realm
];

function getRecPower(chapter: number, stage: number, isBoss: boolean): number {
  const [pMin, pMax] = CHAPTER_POWER[chapter - 1];
  const t    = (stage - 1) / 39;
  const base = Math.round(pMin + (pMax - pMin) * t);
  return isBoss ? Math.round(base * 2.8) : base;
}

// ─── Enemy count ramp (uses global stage = (chapter-1)*40 + stage) ──────────
// Max is always 5 — bosses included. Count ramps up through early global stages
// so chapter 2+ always deploys 5 enemies (global stage ≥ 41).
function getEnemyCount(globalStage: number): number {
  if (globalStage <= 3)  return 2;
  if (globalStage <= 8)  return 3;
  if (globalStage <= 14) return 4;
  return 5;
}

// ─── Slot builder — respects front/back placement rules ──────────────────────
/**
 * Builds a 6-slot array (null = empty) placing enemies by role.
 * Front slots (0,2,4): Tank/Fighter/Assassin  from `frontPool`
 * Back  slots (1,3,5): Ranged/Support         from `backPool`
 *
 * Distribution by count (max 5):
 *   count=2 → front×1 (slot 0),        back×1 (slot 1)
 *   count=3 → front×2 (slots 0,2),     back×1 (slot 1)
 *   count=4 → front×2 (slots 0,2),     back×2 (slots 1,3)
 *   count=5 → front×3 (slots 0,2,4),   back×2 (slots 1,3)
 */
function buildSlots(
  frontPool: readonly string[],
  backPool:  readonly string[],
  seed:      number,
  count:     number,
): (string | null)[] {
  const slots: (string | null)[] = [null, null, null, null, null, null];

  const frontCount = Math.ceil(count / 2);   // 1,2,2,3,3 for count 2-6
  const backCount  = Math.floor(count / 2);  // 1,1,2,2,3

  const FRONT_SLOTS = [0, 2, 4];
  const BACK_SLOTS  = [1, 3, 5];

  for (let i = 0; i < frontCount; i++) {
    slots[FRONT_SLOTS[i]] = pickRandom(frontPool, seed + i * 7);
  }
  for (let i = 0; i < backCount; i++) {
    slots[BACK_SLOTS[i]] = pickRandom(backPool, seed + i * 11 + 200);
  }

  return slots;
}

// ─── Stage names per chapter (40 each) ──────────────────────────────────────
const CH1_NAMES = [
  'Slime Meadow', 'Rocky Path', 'Muddy Fields', 'Slime Pit', 'Verdant Hollow',
  'Swamp Border', 'Acid Lakes', 'Stone Grove', 'Sour Springs', 'Ooze Ravine',
  'Toxic Dell', 'Blighted Glade', 'Crystal Fen', 'Mossy Canyon', 'Emerald Bog',
  'Slime Fortress', 'Venom Crossing', 'Mire Depths', 'Ancient Marsh',
  '⚔ BOSS: Slime King Lair',
  'Twilight Glade', 'Haunted Meadow', 'Bone Hollow', 'Cursed Thicket', 'Fog Valley',
  'Bandit Crossing', "Hunter's Ridge", 'Decay Fields', 'Withered Grove', 'Echo Swamp',
  'Bloodmoss Fen', 'Rotwood Path', 'Venom Gulch', 'Shadowy Ravine', 'Thornwall Gate',
  'Corrupted Spring', 'Forsaken Dell', 'Gloomhaven', "Wraith's Pass",
  '⚔ BOSS: Shadow King\'s Lair',
];
const CH2_NAMES = [
  'Forest Outskirts', 'Fallen Canopy', 'Darkwood Trail', 'Spider Hollow', 'Moss Cavern',
  'Willowshade', 'Twilight Grove', 'Feral Thicket', "Hunter's Den", 'Elderwood Pass',
  'Root Labyrinth', 'Moonlit Glade', 'Cursed Bark', 'Troll Crossing', 'Nightbloom Fields',
  "Lurker's Path", 'Black Fern Swamp', 'Rotting Timbers', 'Shadowveil Thicket',
  '⚔ BOSS: Ancient Tree Lord',
  'Deep Forest Depths', 'Wraithwood', 'Nightmare Arbor', 'Void Canopy', 'Bloodthorn Pass',
  "Spectre's Hollow", 'Darkvine Marsh', 'Soulwood Trail', "Lost Ranger's Camp", 'Ghost Clearing',
  'Plague Forest', 'Decay Grotto', 'Hex Bark Crossing', 'Dread Thicket', 'Umbra Ravine',
  'Forsaken Grove', 'Ruinwood Depths', 'Eclipse Canopy', 'Oblivion Path',
  "⚔ BOSS: Forest Demon's Throne",
];
const CH3_NAMES = [
  'Stone Foothills', 'Gravel Pass', 'Eagle Cliffs', 'Iron Peak Trail', 'Stormcap Ridge',
  'Avalanche Road', 'Glacier Crossing', 'Thunderstone Summit', 'Frozen Ravine', 'Sky Fortress Gate',
  'Wind Scar Canyon', 'Blizzard Crossing', "Titan's Staircase", 'Cloud Temple Road', 'Stormwall Pass',
  'Frostfang Ridge', 'Iron Hammer Peak', 'Tempest Crossing', 'Shattershard Climb',
  '⚔ BOSS: Mountain Titan Shrine',
  'Ashfall Descent', 'Sulfur Springs', 'Scorched Canyon', 'Burning Sands', 'Desert Colosseum',
  'Sun-Scorched Ruins', 'Mirage Crossing', 'Sandstorm Vault', 'Obsidian Dunes', 'Bonebleach Plains',
  'Molten Sand Ridge', 'Ancient Obelisk', 'Cracked Earth Path', 'Dune Serpent Den', 'Ember Mesa',
  'Sandstone Fortress', 'Searing Gorge', 'Cinder Plateau', "Dust Devil's Arena",
  '⚔ BOSS: Desert War God Altar',
];
const CH4_NAMES = [
  'Dungeon Entrance', 'Torch Corridor', 'Bone Chamber', 'Stone Trap Hall', 'Crystal Vaults',
  'Sunken Catacombs', 'Rune Passage', 'Cursed Armory', 'Shadow Crypt', 'Gargoyle Bridge',
  "Warden's Tower", 'Iron Cage Hall', 'Golem Workshop', 'Ghoul Quarters', 'Necrotic Lair',
  'Lost Soul Corridor', 'Undying Barracks', "Witch's Sanctum", 'Voidgate Threshold',
  '⚔ BOSS: Dungeon Overlord Keep',
  'Abyss Antechamber', 'Nightmare Vault', 'Soul Prison', 'Chaos Corridor', 'Blood Altar Hall',
  'Dark Relic Chamber', 'Forbidden Sanctum', 'Demon Barracks', 'Hellbound Passage', 'Oblivion Crypt',
  'Spectral Throne Room', 'Shadowed Abyss', 'Void Rift Chamber', 'Runic Death Hall', 'Forsaken Keep',
  'Infernal Armory', 'Apocalypse Gate', 'Void Sanctum', 'Eternal Crypt',
  "⚔ BOSS: Demon King's Throne",
];
const CH5_NAMES = [
  'Caldera Gate', 'Lava Flow Trail', 'Ember Crossing', 'Pyroclast Fields', 'Scorching Vents',
  'Magma Bridge', 'Ash Wastes', 'Fire Geyser Path', 'Inferno Basin', 'Molten Core Approach',
  'Lava Colosseum', 'Volcanic Rift', 'Hellfire Passage', 'Magma Titan Arena', 'Cinder Fortress',
  'Blazing Citadel', 'Infernal Plateau', 'Pyroclasm Peak', 'Doomsday Caldera',
  '⚔ BOSS: Volcano War Lord Domain',
  "World's Edge", 'Annihilation Fields', 'Realm Breaker Pass', 'Doomsfire Arena', 'Chaos Summit',
  'Oblivion Caldera', 'Absolute Zero Vent', 'Singularity Gate', 'Primordial Abyss', 'Creation Forge',
  'Fracture Zone', 'Last Hope Crossing', "Eternity's Gate", 'Nexus Rift', 'Final Judgment Pass',
  'Dimension Collapse', "Universe's End", 'Void Throne Antechamber', 'Last Bastion',
  '⚔ FINAL BOSS: Apocalypse',
];
const CHAPTER_NAMES = [CH1_NAMES, CH2_NAMES, CH3_NAMES, CH4_NAMES, CH5_NAMES];

// ─── Rewards ──────────────────────────────────────────────────────────────────
function buildRewards(chapter: number, stage: number, isBoss: boolean) {
  const chMul   = chapter;
  const stMul   = 1 + (stage - 1) * 0.05;
  const bossMul = isBoss ? 3 : 1;
  return {
    exp:     Math.round(100  * chMul * stMul * bossMul),
    heroExp: Math.round(1000 * chMul * stMul * bossMul),
    gold:    Math.round(1000 * chMul * stMul * bossMul),
    gems:    isBoss ? 80 : (stage % 5 === 0 ? 25 : 0),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function generateStageData(chapter: number, stage: number): StageClientData {
  const isBoss      = stage === 20 || stage === 40;
  const globalStage = (chapter - 1) * 40 + stage;
  const names       = CHAPTER_NAMES[chapter - 1] ?? [];
  const name        = names[stage - 1] ?? `Chapter ${chapter}-${stage}`;
  const seed        = chapter * 10_000 + stage;
  const count       = getEnemyCount(globalStage);

  const enemySlots = isBoss
    ? buildSlots(BOSS_FRONT, BOSS_BACK, seed, count)
    : buildSlots(FRONT_ENEMIES, BACK_ENEMIES, seed, count);

  return {
    name,
    recPower:  getRecPower(chapter, stage, isBoss),
    enemySlots,
    rewards:   buildRewards(chapter, stage, isBoss),
    isBoss,
  };
}

/** Pre-build all stages for a chapter: `{ '2-7': StageClientData, … }` */
export function buildChapterStageMap(chapter: number): Record<string, StageClientData> {
  const map: Record<string, StageClientData> = {};
  for (let s = 1; s <= 40; s++) {
    map[`${chapter}-${s}`] = generateStageData(chapter, s);
  }
  return map;
}
