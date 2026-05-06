/**
 * heroGallery.ts — Single Source of Truth for ALL hero display data.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  WORKFLOW (mandatory before releasing any hero):                        │
 * │  1. Add entry to HERO_GALLERY with ilust, heroType, rarity             │
 * │  2. Add skill data (names, descriptions, ratio tables)                  │
 * │  3. Add skill icon URLs (upload to Cloudinary first)                    │
 * │  4. Nothing else needs to change — HeroDetailView, HeroPage, Tavern    │
 * │     all read from here automatically.                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Skill icon URL rules (from Guidelines.md):
 *   - WITH e_background_removal → use f_png,q_auto  (NOT f_auto)
 *   - WITHOUT background removal → f_auto,q_auto is fine
 *   - null → PlaceholderSkillIcon rendered in HeroDetailView
 */

export interface SkillRatioLevel {
  label:  string;
  values: string[];  // [Lv1, Lv2, Lv3, Lv4]
}

export interface HeroSkillData {
  name:        string;
  description: string;
  ratioLevels: SkillRatioLevel[];
}

export interface HeroSkillSet {
  sk1: HeroSkillData;
  sk2: HeroSkillData;
  sk3: HeroSkillData;  // passive / 3rd skill
  ult: HeroSkillData;
}

export interface HeroSkillIcons {
  sk1: string | null;
  sk2: string | null;
  sk3: string | null;
  ult: string | null;
}

export interface HeroGalleryEntry {
  heroId:     string;        // matches hero_definitions.hero_id in DB
  name:       string;        // display name
  rarity:     string;        // 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  heroType:   string;        // role label shown on card
  ilust:      string | null; // card illustration URL; null = locked/no art yet
  skillIcons: HeroSkillIcons;
  skills:     HeroSkillSet;
}

// ─── Placeholder skill (heroes listed in gallery but skills not yet designed) ──
const UNKNOWN_SKILL: HeroSkillData = {
  name:        '???',
  description: 'This skill has not been revealed yet.',
  ratioLevels: [],
};
const UNKNOWN_ICONS: HeroSkillIcons = { sk1: null, sk2: null, sk3: null, ult: null };
const UNKNOWN_SKILLS: HeroSkillSet  = {
  sk1: UNKNOWN_SKILL, sk2: UNKNOWN_SKILL, sk3: UNKNOWN_SKILL, ult: UNKNOWN_SKILL,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  HERO REGISTRY
//  Order: SS (Mythic) → S (Legendary) → A (Epic) → B (Rare) → C (Common)
// ════════════════════════════════════════════════════════════════════════════════
export const HERO_GALLERY: HeroGalleryEntry[] = [

  // ── SS Mythic ───────────────────────────────────────────────────────────────
  {
    heroId:     'seraphiel',
    name:       'Seraphiel',
    rarity:     'mythic',
    heroType:   'Celestial',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },
  {
    heroId:     'malphas',
    name:       'Malphas',
    rarity:     'mythic',
    heroType:   'Demon Lord',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },

  // ── S Legendary ─────────────────────────────────────────────────────────────
  {
    heroId:     'theron',
    name:       'Theron',
    rarity:     'legendary',
    heroType:   'Paladin',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },
  {
    heroId:     'valeria',
    name:       'Valeria',
    rarity:     'legendary',
    heroType:   'Sorceress',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },
  {
    heroId:     'kael',
    name:       'Kael',
    rarity:     'legendary',
    heroType:   'Warlord',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },

  // ── A Epic ──────────────────────────────────────────────────────────────────
  {
    heroId:     'zephyr',
    name:       'Zephyr',
    rarity:     'epic',
    heroType:   'Ranger',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },
  {
    heroId:     'lyra',
    name:       'Lyra',
    rarity:     'epic',
    heroType:   'Bard',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },
  {
    heroId:     'dunmore',
    name:       'Dunmore',
    rarity:     'epic',
    heroType:   'Berserker',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },
  {
    heroId:     'riven',
    name:       'Riven',
    rarity:     'epic',
    heroType:   'Rogue',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },

  // ── B Rare ──────────────────────────────────────────────────────────────────
  {
    heroId:   'lucas',
    name:     'Lucas',
    rarity:   'rare',
    heroType: 'Fighter',
    ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777386997/LUCAS_tyqcnf.png',
    skillIcons: {
      sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png',
      sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550848/ChatGPT_Image_Apr_30_2026_07_02_57_PM_kbtfs3.png',
      sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550841/psvluk_b0quhw.png',
      ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550833/ultlukas_jcehyx.png',
    },
    skills: {
      sk1: {
        name:        'Iron Cleave',
        description: 'Lucas delivers a powerful straight-line slash to the enemy directly ahead. His raw physical strength cleaves through armor, dealing heavy physical damage to a single target in the front row.',
        ratioLevels: [
          { label: 'Damage', values: ['165% P.ATK', '200% P.ATK', '240% P.ATK', '290% P.ATK'] },
        ],
      },
      sk2: {
        name:        'Armor Rend',
        description: "A calculated strike aimed at shattering the enemy's physical defenses. Reduces the target's P.DEF by a fixed amount before dealing physical damage — highly effective against heavily armored foes.",
        ratioLevels: [
          { label: 'Damage',      values: ['180% P.ATK', '215% P.ATK', '258% P.ATK', '310% P.ATK'] },
          { label: 'P.DEF Shred', values: ['−80', '−100', '−125', '−150'] },
        ],
      },
      sk3: {
        name:        "Warlord's Edge",
        description: "Passive. Each time Lucas takes a turn, he gains a Warlord's Edge stack — permanently increasing his P.ATK by +8% (compounding) for the remainder of battle. Up to 5 stacks can be accumulated, yielding a maximum total boost of approximately +47% P.ATK.",
        ratioLevels: [
          { label: 'P.ATK / Stack (compounding)', values: ['+8%', '+8%', '+8%', '+8%'] },
          { label: 'Max Stacks',                  values: ['5', '5', '5', '5'] },
          { label: 'Max Total Boost (approx.)',   values: ['+47%', '+47%', '+47%', '+47%'] },
        ],
      },
      ult: {
        name:        'Rampage Surge',
        description: 'Lucas erupts into an unstoppable full-force assault, targeting every enemy on the front row and striking each one 3 consecutive times with crushing physical blows. Devastating against clustered enemies.',
        ratioLevels: [
          { label: 'Dmg / Hit (P.ATK)', values: ['100%', '125%', '155%', '195%'] },
          { label: 'Total (3 hits)',     values: ['300% P.ATK', '375% P.ATK', '465% P.ATK', '585% P.ATK'] },
        ],
      },
    },
  },

  {
    heroId:   'emma',
    name:     'Emma',
    rarity:   'rare',
    heroType: 'Support',
    ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777387003/emma_aqsnsd.png',
    skillIcons: {
      sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png',
      sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png',
      sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png',
      ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png',
    },
    skills: {
      sk1: {
        name:        'Mending Touch',
        description: "Emma pinpoints the ally with the lowest current HP — herself included — and channels concentrated healing energy into them. The less HP the target has remaining, the more urgently this skill should be used.",
        ratioLevels: [
          { label: 'Heal (M.ATK)', values: ['170% M.ATK', '210% M.ATK', '260% M.ATK', '320% M.ATK'] },
        ],
      },
      sk2: {
        name:        'Bulwark Veil',
        description: "Emma reads the battlefield and cloaks the ally with the highest maximum HP in a shimmering magical barrier. Pairing this shield with your frontline tank dramatically reduces burst damage.",
        ratioLevels: [
          { label: 'Shield (M.ATK)', values: ['140% M.ATK', '175% M.ATK', '215% M.ATK', '265% M.ATK'] },
        ],
      },
      sk3: {
        name:        'Blessed Ward',
        description: "Passive. At the start of every battle Emma projects a protective aura across the entire team, wrapping each ally in a magical ward that persists until fully depleted. The shield does not regenerate mid-battle, but its initial value scales with Emma's M.ATK.",
        ratioLevels: [
          { label: 'Shield / Ally (M.ATK)', values: ['90% M.ATK', '115% M.ATK', '145% M.ATK', '185% M.ATK'] },
        ],
      },
      ult: {
        name:        'Sacred Bloom',
        description: "Emma releases a radiant burst of sacred energy that seeks out the three allies with the lowest current HP and restores each of them simultaneously. Essential for pulling the team back from the brink of defeat.",
        ratioLevels: [
          { label: 'Heal × 3 Targets (M.ATK)', values: ['120% M.ATK', '150% M.ATK', '188% M.ATK', '235% M.ATK'] },
        ],
      },
    },
  },

  {
    heroId:     'brennan',
    name:       'Brennan',
    rarity:     'rare',
    heroType:   'Guardian',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },
  {
    heroId:     'sylvia',
    name:       'Sylvia',
    rarity:     'rare',
    heroType:   'Archer',
    ilust:      null,
    skillIcons: UNKNOWN_ICONS,
    skills:     UNKNOWN_SKILLS,
  },

  // ── C Common ────────────────────────────────────────────────────────────────
  // Rock Slime — Tank
  {
    heroId:   'rock_slime',
    name:     'Rock Slime',
    rarity:   'common',
    heroType: 'Tank',
    ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545681/ChatGPT_Image_Apr_30_2026_05_38_28_PM_wzt4ox.png',
    skillIcons: {
      sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565812/s1rlime_hfstrz.png',
      sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565820/s2rslime_shjl5b.png',
      sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565826/s3rslime_vip7sb.png',
      ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565833/s4rslime_duuc2g.png',
    },
    skills: {
      sk1: {
        name:        'Boulder Dash',
        description: 'Targets 1 random front-row enemy. Rock Slime launches itself forward in a heavy body slam, dealing physical damage on impact. After striking, rock dust hardens its surface, granting itself a P.DEF boost for 2 turns.',
        ratioLevels: [
          { label: 'Damage (P.ATK)',      values: ['100%', '122%', '148%', '180%'] },
          { label: 'P.DEF Buff (2 turns)', values: ['+8% P.DEF', '+11% P.DEF', '+14% P.DEF', '+18% P.DEF'] },
        ],
      },
      sk2: {
        name:        'Rock Shell',
        description: 'Self only. Rock Slime compresses its outer layer into a dense stone shell, instantly granting itself a HP Shield proportional to its Max HP. Activates immediately — no targeting condition.',
        ratioLevels: [
          { label: 'Shield (own Max HP)', values: ['12% Max HP', '15% Max HP', '19% Max HP', '24% Max HP'] },
        ],
      },
      sk3: {
        name:        'Mineral Density',
        description: "Passive (self). Rock Slime's dense mineral composition permanently raises its own P.DEF and converts part of that toughness into striking power. Every basic attack deals bonus damage equal to a portion of its P.DEF.",
        ratioLevels: [
          { label: 'Basic Atk Bonus (P.DEF)', values: ['+10% P.DEF', '+14% P.DEF', '+19% P.DEF', '+25% P.DEF'] },
          { label: 'P.DEF Bonus (passive)',   values: ['+4%', '+6%', '+8%', '+11%'] },
        ],
      },
      ult: {
        name:        'Spike Eruption',
        description: 'Targets all front-row enemies. Rock Slime erupts jagged stone spikes across its body, striking every enemy in the front row simultaneously. After the eruption, grants itself a P.DEF boost and a damage-reflect aura for 2 turns.',
        ratioLevels: [
          { label: 'Dmg Front Row (P.DEF)', values: ['55% P.DEF', '70% P.DEF', '88% P.DEF', '110% P.DEF'] },
          { label: 'P.DEF Boost (2T)',      values: ['+18%', '+24%', '+30%', '+38%'] },
          { label: 'Reflect (2T)',          values: ['10%', '13%', '17%', '22%'] },
        ],
      },
    },
  },

  // Acid Slime — Ranged  (source: battle_schema_v7_skill_audit.sql + HeroPreviewView)
  {
    heroId:   'acid_slime',
    name:     'Acid Slime',
    rarity:   'common',
    heroType: 'Ranged',
    ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545738/ChatGPT_Image_Apr_30_2026_05_39_48_PM_oq2njh.png',
    skillIcons: {
      sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806549/sk1acd_nqz0x5.png',
      sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806563/sk2acd_x4d8qu.png',
      sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806571/sk3acd_gh45ki.png',
      ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806578/sk4acd_mcmpzu.png',
    },
    skills: {
      sk1: {
        name:        'Acid Spit',
        description: 'Targets 1 random back-row enemy (front-row if back is empty). On impact the acid weakens the target\'s physical armour, reducing their P.DEF for 2 turns.',
        ratioLevels: [
          { label: 'Damage (P.ATK)',    values: ['105%', '128%', '155%', '188%'] },
          { label: 'P.DEF Shred (2T)', values: ['−8%', '−10%', '−13%', '−17%'] },
        ],
      },
      sk2: {
        name:        'Corrosive Splash',
        description: 'Targets 2 random front-row enemies. Sprays a wide arc of acid, striking both targets with physical damage. Each impact independently rolls its own Stun chance.',
        ratioLevels: [
          { label: 'Dmg (×2 targets)',  values: ['68%', '84%', '102%', '124%'] },
          { label: 'Stun Chance / Tgt', values: ['16%', '20%', '26%', '33%'] },
        ],
      },
      sk3: {
        name:        'Acidic Membrane',
        description: "Passive (self-reactive). Acid Slime's body oozes corrosive fluid at all times. Whenever any enemy strikes Acid Slime with a physical attack, that attacker immediately receives acid damage in return. Also permanently gains a Speed bonus.",
        ratioLevels: [
          { label: 'Contact Dmg (P.ATK)', values: ['10% P.ATK', '14% P.ATK', '19% P.ATK', '25% P.ATK'] },
          { label: 'Speed Bonus',          values: ['+4%', '+5%', '+7%', '+9%'] },
        ],
      },
      ult: {
        name:        'Acid Flood',
        description: 'Targets all enemies. Releases a torrent of concentrated acid that drenches every enemy simultaneously, dealing physical damage to all and reducing the P.DEF of every target for 2 turns.',
        ratioLevels: [
          { label: 'Dmg All (P.ATK)',      values: ['78%', '96%', '118%', '144%'] },
          { label: 'P.DEF Shred All (2T)', values: ['−10%', '−13%', '−17%', '−22%'] },
        ],
      },
    },
  },

  // Gorr — Fighter (C Common)
  {
    heroId:   'gorr',
    name:     'Gorr',
    rarity:   'common',
    heroType: 'Fighter',
    ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058398/ChatGPT_Image_May_6_2026_03_41_03_PM_hxymbk.png',
    skillIcons: {
      sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002904/sk1gor_wkgpaz.png',
      sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002911/sk2gor_grkelh.png',
      sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002917/sk3gor_ppjc9j.png',
      ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002925/sk4gor_axfkc2.png',
    },
    skills: {
      sk1: {
        name:        'Cleaver Rush',
        description: 'Gorr charges forward toward the enemy with the lowest current HP and delivers a savage cleaver strike. The impact inflicts Bleed for 2 turns (non-stacking, duration-based) — the target loses HP at the start of each of their turns equal to a portion of Gorr\'s P.ATK.',
        ratioLevels: [
          { label: 'Damage (P.ATK)',       values: ['140%', '170%', '205%', '250%'] },
          { label: 'Bleed/Turn (P.ATK, 2T)', values: ['18%', '22%', '28%', '35%'] },
        ],
      },
      sk2: {
        name:        'Intimidating Slam',
        description: 'Gorr advances on the nearest front-row enemy and crashes his massive cleaver down with a ground-shattering blow. Deals heavy physical damage and Terrifies the target for 2 turns (non-stacking) — Terrified enemies have their P.ATK significantly reduced, weakening their counterattacks.',
        ratioLevels: [
          { label: 'Damage (P.ATK)',         values: ['158%', '192%', '232%', '282%'] },
          { label: 'P.ATK Debuff Tgt (2T)',  values: ['−15%', '−20%', '−26%', '−33%'] },
        ],
      },
      sk3: {
        name:        'Bloodlust',
        description: "Passive (self). Gorr feeds on the violence of battle. Every time he deals damage — through any of his skills — he recovers HP equal to a percentage of the damage dealt (Lifesteal). This effect applies to all his abilities, rewarding aggressive play with sustained survivability.",
        ratioLevels: [
          { label: 'Lifesteal (% of dmg dealt)', values: ['8%', '10%', '13%', '17%'] },
        ],
      },
      ult: {
        name:        'Reaping Arc',
        description: "Gorr lunges into the center of the enemy formation, sweeping his massive cleaver in a wide, devastating arc that strikes ALL enemies simultaneously. Enemies currently afflicted by Bleed take amplified damage from this hit. The carnage also refreshes Bleed duration on already-Bleeding targets.",
        ratioLevels: [
          { label: 'Base Dmg All (P.ATK)',       values: ['88%', '108%', '132%', '160%'] },
          { label: 'Bonus vs Bleeding targets',   values: ['+30%', '+35%', '+40%', '+48%'] },
          { label: 'Bleed Refresh',               values: ['2T', '2T', '2T', '2T'] },
        ],
      },
    },
  },

  // Craw — Ranged (C Common)
  {
    heroId:   'craw',
    name:     'Craw',
    rarity:   'common',
    heroType: 'Ranged',
    ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058474/ChatGPT_Image_May_6_2026_03_43_04_PM_u0dyy5.png',
    skillIcons: {
      sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002931/sk1craw_cgwnc7.png',
      sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002935/sk2craw_hmjjoz.png',
      sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002946/sk3craw_f6s5e5.png',
      ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002939/sk4craw_zg73ez.png',
    },
    skills: {
      sk1: {
        name:        'Crude Shot',
        description: 'Craw fires a hurried arrow at 1 random enemy (any row). On hit, has a chance to inflict Wound for 2 turns (non-stacking, duration-based) — a Wounded target takes increased damage from ALL sources for the duration, making them prime prey for the whole team.',
        ratioLevels: [
          { label: 'Damage (P.ATK)',         values: ['115%', '140%', '170%', '205%'] },
          { label: 'Wound Chance',           values: ['30%', '38%', '48%', '60%'] },
          { label: 'Wound: Dmg Taken +',     values: ['+10%', '+13%', '+17%', '+22%'] },
        ],
      },
      sk2: {
        name:        'Blind Arrow',
        description: "Craw takes careful aim and fires a specially-tipped arrow at the enemy with the highest P.ATK — the biggest offensive threat on the field. Deals physical damage and inflicts Blind for 2 turns (non-stacking): Blinded enemies suffer a greatly increased chance to miss their attacks.",
        ratioLevels: [
          { label: 'Damage (P.ATK)',       values: ['130%', '158%', '192%', '232%'] },
          { label: 'Blind (2T) Miss Chance', values: ['35%', '45%', '55%', '65%'] },
        ],
      },
      sk3: {
        name:        'Cornered Rat',
        description: "Passive (self, one-time trigger). When Craw's HP falls below 40% for the first time in a battle, desperation takes over — he permanently gains a significant P.ATK and Speed boost for the rest of the battle. Triggers only once. The weaker the enemy thinks Craw is, the more dangerous he becomes.",
        ratioLevels: [
          { label: 'P.ATK Boost (perm, 1×)', values: ['+25%', '+30%', '+36%', '+44%'] },
          { label: 'Speed Boost (perm, 1×)', values: ['+12%', '+15%', '+18%', '+22%'] },
        ],
      },
      ult: {
        name:        'Skypiercer Volley',
        description: "Craw launches a rapid barrage of arrows into the sky that rains down on ALL enemies simultaneously. Every enemy hit receives a Wound (non-stacking, 2T) — amplifying all incoming damage they take. Combined with teammates' attacks, this turns the entire enemy team into vulnerable targets.",
        ratioLevels: [
          { label: 'Dmg All (P.ATK)',     values: ['72%', '88%', '108%', '130%'] },
          { label: 'Wound All (2T) Dmg+', values: ['+10%', '+13%', '+17%', '+22%'] },
        ],
      },
    },
  },

  // Water Slime — Support
  {
    heroId:   'water_slime',
    name:     'Water Slime',
    rarity:   'common',
    heroType: 'Support',
    ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png',
    skillIcons: {
      sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807420/sk1wtr.pg_fbx8a0.png',
      sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807428/sk2wtr_vmi777.png',
      sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807444/sk3wtr_fedwpe.png',
      ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807456/sk4wtr_fbixax.png',
    },
    skills: {
      sk1: {
        name:        'Water Jet',
        description: 'Targets the enemy with the highest Speed. Fires a pressurised jet of water, dealing magic damage and reducing that target\'s Speed for 2 turns. Disrupts the fastest enemy\'s action order.',
        ratioLevels: [
          { label: 'Damage (M.ATK)',  values: ['82% M.ATK', '100% M.ATK', '122% M.ATK', '148% M.ATK'] },
          { label: 'Speed Slow (2T)', values: ['−18% Spd', '−24% Spd', '−30% Spd', '−38% Spd'] },
        ],
      },
      sk2: {
        name:        'Tidal Surge',
        description: 'Targets the 2 front-row enemies with the highest Max HP. Crashes a wave into the two most durable front-liners, dealing magic damage and weakening their M.DEF for 2 turns.',
        ratioLevels: [
          { label: 'Dmg / Target (M.ATK)', values: ['58% M.ATK', '72% M.ATK', '88% M.ATK', '108% M.ATK'] },
          { label: 'M.DEF Shred (2T)',      values: ['−12%', '−16%', '−21%', '−27%'] },
        ],
      },
      sk3: {
        name:        'Soaking Field',
        description: 'Passive (self + team aura). Water Slime perpetually dampens the battlefield. All allies automatically deal bonus magic damage against any enemy currently afflicted by one of Water Slime\'s debuffs. Water Slime also gains a permanent Max HP bonus.',
        ratioLevels: [
          { label: 'Ally Bonus vs. Debuffed (M.ATK)', values: ['+8% M.ATK', '+12% M.ATK', '+16% M.ATK', '+22% M.ATK'] },
          { label: 'Self Max HP Bonus',                values: ['+5%', '+5%', '+5%', '+5%'] },
        ],
      },
      ult: {
        name:        'Deluge Wave',
        description: 'Targets all enemies. Unleashes a massive flood that washes over every enemy — dealing magic damage and applying Waterlogged to all, reducing both P.DEF and M.DEF for 2 turns. Each turn while Waterlogged, affected enemies independently have a chance to be Stunned.',
        ratioLevels: [
          { label: 'Dmg All (M.ATK)',          values: ['72% M.ATK', '88% M.ATK', '108% M.ATK', '132% M.ATK'] },
          { label: 'P.DEF + M.DEF Shred (2T)', values: ['−10% each', '−13% each', '−17% each', '−22% each'] },
          { label: 'Stun Chance / Turn (2T)',   values: ['12%', '16%', '21%', '27%'] },
        ],
      },
    },
  },

  // Myko — Tank (C Common)
  {
    heroId:   'myko',
    name:     'Myko',
    rarity:   'common',
    heroType: 'Tank',
    ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058438/ChatGPT_Image_May_6_2026_03_42_51_PM_o43yt7.png',
    skillIcons: {
      sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009427/sk1myk_nr36fc.png',
      sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009434/sk2myk_nry1oe.png',
      sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009440/sk3myk_oc94bf.png',
      ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009488/sk4myk_egyexz.png',
    },
    skills: {
      sk1: {
        name:        'Iron Casing',
        description: "Myko hunches behind its shield and channels fungal chitin through its body, hardening its outer casing. Instantly generates a protective HP Shield equal to a portion of Myko's maximum HP — absorbing incoming damage before health is lost. Use before a big enemy strike to protect Myko for an extra round.",
        ratioLevels: [
          { label: 'HP Shield (Max HP)', values: ['12%', '16%', '20%', '25%'] },
        ],
      },
      sk2: {
        name:        'Spore Slam',
        description: "Myko drives its shield into the ground with tremendous force, releasing a fungal shockwave that erupts through the front row of enemies. Damage scales with Myko's own P.DEF — the more fortified Myko is, the harder the slam. Enemies struck are infected with Spore Rot for 2 turns: their physical attack power is weakened.",
        ratioLevels: [
          { label: 'Damage (P.DEF)',          values: ['90%', '110%', '135%', '165%'] },
          { label: 'Spore Rot P.ATK − (2T)', values: ['15%', '18%', '22%', '28%'] },
        ],
      },
      sk3: {
        name:        'Fungal Resilience',
        description: "Passive (self, permanent). Myko's fungal biology continuously repairs physical trauma. Each time Myko receives a direct attack, it immediately regenerates HP equal to a percentage of its own P.DEF. Higher P.DEF means greater recovery per hit — making a heavily-armored Myko nearly impossible to chip down.",
        ratioLevels: [
          { label: 'Heal per Hit (P.DEF)', values: ['18%', '25%', '32%', '40%'] },
        ],
      },
      ult: {
        name:        'Spore Eruption',
        description: "Myko raises its shield skyward and channels the underground mycelium network, erupting spores across ALL enemies. Deals magic damage based on Myko's own P.DEF and applies Spore Toxin for 3 turns — each turn, the infected enemy loses HP equal to a portion of Myko's P.DEF. The more fortified Myko becomes, the more devastating this eruption.",
        ratioLevels: [
          { label: 'Damage All (P.DEF)',       values: ['85%', '105%', '130%', '160%'] },
          { label: 'Spore Toxin/Turn (P.DEF)', values: ['15%', '20%', '26%', '34%'] },
        ],
      },
    },
  },
];

// ─── NEW HEROES ───────────────────────────────────────────────────────────────

// Fang — Assassin (C Common) ─────────────────────────────────────────────────
// Killer rabbit wielding twin short daggers. Lightning-fast single-target damage
// and execute potential. Unique passive: kill streaks stack permanent P.ATK boosts.
HERO_GALLERY.push({
  heroId:   'fang',
  name:     'Fang',
  rarity:   'common',
  heroType: 'Assassin',
  ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058505/ChatGPT_Image_May_6_2026_03_43_11_PM_xagzjf.png',
  skillIcons: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002935/sk2craw_hmjjoz.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002946/sk3craw_f6s5e5.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002939/sk4craw_zg73ez.png',
  },
  skills: {
    sk1: {
      name:        'Twin Slash',
      description: 'Fang lunges at a single enemy and unleashes two rapid dagger strikes in quick succession. The second hit targets a gap in the enemy\'s guard, making it harder to mitigate. Consistent damage against any target with no cooldown penalty.',
      ratioLevels: [
        { label: 'Damage per Hit (P.ATK)', values: ['90%', '110%', '135%', '165%'] },
        { label: 'Hits',                   values: ['×2',  '×2',   '×2',   '×2'  ] },
      ],
    },
    sk2: {
      name:        'Shadow Sprint',
      description: 'Fang blurs through the entire front row in a single pass, slashing every enemy in the line simultaneously. Fast, wide, and unpredictable — ideal for clearing out multiple threats before they act.',
      ratioLevels: [
        { label: 'Damage per Enemy (P.ATK)', values: ['75%', '92%', '112%', '138%'] },
        { label: 'Targets',                  values: ['Front Row', 'Front Row', 'Front Row', 'Front Row'] },
      ],
    },
    sk3: {
      name:        "Hunter's Mark",
      description: "Passive (self, permanent). Whenever Fang lands the killing blow on any enemy, it triggers a surge of bloodlust — Fang gains a permanent P.ATK stack. These stacks do not expire and can accumulate up to 3 times over the course of a battle, rewarding aggressive play.",
      ratioLevels: [
        { label: 'P.ATK Bonus per Kill Stack', values: ['+28%', '+36%', '+46%', '+58%'] },
        { label: 'Max Stacks',                  values: ['3',    '3',    '3',    '3'   ] },
      ],
    },
    ult: {
      name:        'Death Bound',
      description: "Fang locks onto the enemy with the lowest remaining HP and delivers one devastating strike. If the target's HP is already below 35%, the raw force of this blow triples in power — an almost certain kill. Best used to finish weakened enemies before they recover.",
      ratioLevels: [
        { label: 'Damage (P.ATK)',             values: ['260%', '320%', '395%', '480%'] },
        { label: 'Bonus × if target < 35% HP', values: ['×3',   '×3',   '×3',   '×3'  ] },
      ],
    },
  },
});

// Clover — Support (C Common) ─────────────────────────────────────────────────
// Bunny mage in a flowing robe. Specialises in sustained healing and regeneration
// over time. Counter to bleed/damage-over-time strategies. Passive random heals
// keep the team surprisingly resilient without draining skill turns.
HERO_GALLERY.push({
  heroId:   'clover',
  name:     'Clover',
  rarity:   'common',
  heroType: 'Support',
  ilust:    'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778058786/ChatGPT_Image_May_6_2026_03_55_39_PM_dssunr.png',
  skillIcons: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png',
  },
  skills: {
    sk1: {
      name:        'Healing Herb',
      description: "Clover draws on nature magic to channel a burst of restorative energy into the ally with the lowest current HP. Quick and efficient — prioritises whoever needs help most.",
      ratioLevels: [
        { label: 'Heal (M.ATK)', values: ['130%', '160%', '195%', '240%'] },
      ],
    },
    sk2: {
      name:        'Lucky Toss',
      description: "Clover flicks a glowing clover charm at a random ally, infusing them with a Regeneration aura. The chosen ally recovers HP each turn for 3 turns. Unlike burst healing, this aura works even during enemy turns — keeping allies alive through sustained punishment.",
      ratioLevels: [
        { label: 'Regen per Turn (M.ATK)', values: ['55%', '68%', '83%', '100%'] },
        { label: 'Duration',               values: ['3T',  '3T',  '3T',  '3T'  ] },
      ],
    },
    sk3: {
      name:        'Life Bloom',
      description: "Passive (team, permanent). Clover's magical presence permeates the battlefield. Each time any ally takes a direct hit, there is a 35% chance that Clover automatically channels a small burst of healing energy toward that ally — instantly and at no cost. Works as a reliable safety net against rapid multi-hit attackers.",
      ratioLevels: [
        { label: 'Passive Heal per Proc (M.ATK)', values: ['40%', '52%', '66%', '82%'] },
        { label: 'Trigger Chance',                values: ['35%', '35%', '35%', '35%'] },
      ],
    },
    ult: {
      name:        'Bloom Cascade',
      description: "Clover releases a wave of pure rejuvenating energy across the entire team. Every ally is healed simultaneously, and each also receives a Lucky Toss regen aura that heals them each turn for 3 more turns. The combination of burst healing plus sustained regeneration makes this the ultimate recovery skill — use it when the whole team is hurting.",
      ratioLevels: [
        { label: 'Burst Heal per Ally (M.ATK)', values: ['90%',  '112%', '138%', '168%'] },
        { label: 'Regen per Ally/Turn (M.ATK)', values: ['38%',  '46%',  '56%',  '68%' ] },
        { label: 'Regen Duration',              values: ['3T',   '3T',   '3T',   '3T'  ] },
      ],
    },
  },
});

// ─── Lookup helpers ────────────────────────────────────────────────────────────

/** Lookup by heroId (DB key) */
export function getHeroById(heroId: string): HeroGalleryEntry | undefined {
  return HERO_GALLERY.find(h => h.heroId === heroId);
}

/** Lookup by display name */
export function getHeroByName(name: string): HeroGalleryEntry | undefined {
  return HERO_GALLERY.find(h => h.name === name);
}

/**
 * Card illustration URL for a heroId.
 * Falls back to null if hero not in registry or no art assigned yet.
 */
export function getHeroIlust(heroId: string): string | null {
  return getHeroById(heroId)?.ilust ?? null;
}