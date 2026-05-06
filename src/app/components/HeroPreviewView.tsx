/**
 * HeroPreviewView — Gallery preview: explore level + star scaling.
 * Star controls: ▼/▲ buttons below card.
 * HeroCard receives starsOverride so it reflects the current star state.
 */

import { useState, useEffect, useRef } from 'react';
import { applyChromaKey } from '../utils/chromaKey';
import { playBackSound } from '../utils/buttonSound';
import {
  HERO_TYPE_TO_STAT_ROLE,
  computeEngineStats, computeStarBonus,
  STAR_MIN, STAR_MAX,
} from '../constants/balanceEngine';
import { LockedHeroCard } from './LockedHeroCard';
import { HeroCard } from './HeroCard';
import { HeroCardAnimated } from './HeroCardAnimated';

// ─── Rarity accent colors ─────────────────────────────────────────────────────
const RARITY_CFG: Record<string, { color: string }> = {
  mythic:    { color: '#E00000' },
  legendary: { color: '#FB923C' },
  epic:      { color: '#A855F7' },
  rare:      { color: '#1877F2' },
  common:    { color: '#22C55E' },
};

// ─── Skill unlock level gates ─────────────────────────────────────────────────
const SKILL_UNLOCK: Record<string, number[]> = {
  sk1: [  1,  81, 161, 240 ],
  sk2: [ 21, 101, 181, 240 ],
  sk3: [ 41, 121, 201, 240 ],
  ult: [ 61, 141, 221, 240 ],
};

function computeSkillState(heroLv: number, key: string) {
  const tiers = SKILL_UNLOCK[key];
  if (heroLv < tiers[0]) return { level: 0, locked: true };
  let sl = 1;
  for (let i = 1; i < tiers.length; i++) { if (heroLv >= tiers[i]) sl = i + 1; else break; }
  return { level: sl, locked: false };
}

// ─── Canvas void-trim icon renderer (chroma-key aware) ───────────────────────
interface TrimBounds { sx: number; sy: number; sw: number; sh: number; }
/** Detect trim bounds from already-processed pixel data (alpha > 15 = content). */
function detectTrimBoundsFromData(data: Uint8ClampedArray, w: number, h: number): TrimBounds {
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 15) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (minX > maxX || minY > maxY) return { sx: 0, sy: 0, sw: w, sh: h };
  return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
}
/** Cache stores chroma-keyed offscreen canvas + tight bounds (no green bg). */
const IMG_CACHE = new Map<string, { bounds: TrimBounds; canvas: HTMLCanvasElement }>();
function SkillIconCanvas({ src, size }: { src: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const draw = (e: { bounds: TrimBounds; canvas: HTMLCanvasElement }) => {
      if (!active) return;
      const c = ref.current; if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = size * dpr; c.height = size * dpr;
      c.style.width = `${size}px`; c.style.height = `${size}px`;
      const ctx = c.getContext('2d')!;
      ctx.scale(dpr, dpr); ctx.clearRect(0, 0, size, size);
      const b = e.bounds;
      ctx.drawImage(e.canvas, b.sx, b.sy, b.sw, b.sh, 0, 0, size, size);
    };
    if (IMG_CACHE.has(src)) { draw(IMG_CACHE.get(src)!); return; }
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      const off = document.createElement('canvas');
      off.width = img.naturalWidth; off.height = img.naturalHeight;
      const offCtx = off.getContext('2d', { willReadFrequently: true })!;
      offCtx.drawImage(img, 0, 0);
      const id = offCtx.getImageData(0, 0, off.width, off.height);
      applyChromaKey(id.data);
      offCtx.putImageData(id, 0, 0);
      const bounds = detectTrimBoundsFromData(id.data, img.naturalWidth, img.naturalHeight);
      const entry = { bounds, canvas: off };
      IMG_CACHE.set(src, entry);
      draw(entry);
    };
    img.src = src;
    return () => { active = false; };
  }, [src, size]);
  return <canvas ref={ref} style={{ display: 'block' }} />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <div style={{ width: 18, height: 18, flexShrink: 0, opacity: 0.85 }}>{icon}</div>
      <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Roboto Condensed',sans-serif", fontSize: 11, letterSpacing: '0.06em', flex: 1 }}>{label}</span>
      <span style={{ color: '#fff', fontFamily: "'Roboto Condensed',sans-serif", fontSize: 13, fontWeight: 700 }}>{fmtNum(value)}</span>
    </div>
  );
}
function LvBtn({ delta, onClick, disabled }: { delta: number; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{ background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.55)', border: `1px solid ${disabled ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.2)'}`, color: disabled ? 'rgba(255,255,255,0.18)' : '#fff', borderRadius: 6, padding: '3px 7px', fontFamily: "'Roboto Condensed',sans-serif", fontSize: 11, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' }}>
      {delta > 0 ? `+${delta}` : `${delta}`}
    </button>
  );
}

// ─── Skill data ───────────────────────────────────────────────────────────────
// Balance reference:  B rarity (Lucas/Emma) ≈ 165–310% / skill.
// C rarity target:    ~55–65% of B ratios. Simpler effects, 1–2 conditions max.
// ─────────────────────────────────────────────────────────────────────────────
interface SR { label: string; values: string[]; }
interface PSI { name: string; description: string; ratioLevels: SR[]; iconUrl: string; }

const SD: Record<string, Record<string, PSI>> = {

  // ── B Rarity ────────────────────────────────────────────────────────────────
  Lucas: {
    sk1: { name: 'Iron Cleave',
      description: 'Powerful straight-line slash dealing heavy physical damage to a single front-row target.',
      ratioLevels: [{ label: 'Damage', values: ['165% P.ATK','200% P.ATK','240% P.ATK','290% P.ATK'] }],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png' },
    sk2: { name: 'Armor Rend',
      description: "Shatters the enemy's physical defenses before dealing damage — highly effective against armored foes.",
      ratioLevels: [
        { label: 'Damage',      values: ['180% P.ATK','215% P.ATK','258% P.ATK','310% P.ATK'] },
        { label: 'P.DEF Shred', values: ['−80','−100','−125','−150'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550848/ChatGPT_Image_Apr_30_2026_07_02_57_PM_kbtfs3.png' },
    sk3: { name: "Warlord's Edge",
      description: "Passive. Each turn Lucas acts, he gains a stack — permanently boosting P.ATK by +8% (compounding) up to 5 stacks. Max boost ≈ +47% P.ATK. Stack indicator shown above HP bar in battle.",
      ratioLevels: [
        { label: 'P.ATK / Stack', values: ['+8%','+8%','+8%','+8%'] },
        { label: 'Max Stacks',    values: ['5','5','5','5'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550841/psvluk_b0quhw.png' },
    ult: { name: 'Rampage Surge',
      description: 'Strikes every front-row enemy 3 consecutive times. Devastating against clustered enemies.',
      ratioLevels: [
        { label: 'Dmg / Hit',    values: ['100% P.ATK','125% P.ATK','155% P.ATK','195% P.ATK'] },
        { label: 'Total 3 Hits', values: ['300% P.ATK','375% P.ATK','465% P.ATK','585% P.ATK'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550833/ultlukas_jcehyx.png' },
  },

  Emma: {
    sk1: { name: 'Mending Touch',
      description: "Heals the ally with the lowest current HP (Emma included). Scales with Emma's M.ATK.",
      ratioLevels: [{ label: 'Heal (M.ATK)', values: ['170% M.ATK','210% M.ATK','260% M.ATK','320% M.ATK'] }],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png' },
    sk2: { name: 'Bulwark Veil',
      description: "Shields the ally with the highest max HP. Pairs well with tanks. Scales with Emma's M.ATK.",
      ratioLevels: [{ label: 'Shield (M.ATK)', values: ['140% M.ATK','175% M.ATK','215% M.ATK','265% M.ATK'] }],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png' },
    sk3: { name: 'Blessed Ward',
      description: "Passive. At battle start wraps every ally in a magical ward that persists until depleted.",
      ratioLevels: [{ label: 'Shield / Ally (M.ATK)', values: ['90% M.ATK','115% M.ATK','145% M.ATK','185% M.ATK'] }],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png' },
    ult: { name: 'Sacred Bloom',
      description: "AoE heal to the 3 allies with lowest current HP simultaneously.",
      ratioLevels: [{ label: 'Heal × 3 Targets (M.ATK)', values: ['120% M.ATK','150% M.ATK','188% M.ATK','235% M.ATK'] }],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png' },
  },

  // ── C Rarity — Rock Slime (Tank) ────────────────────────────────────────────
  // High P.DEF, modest P.ATK. Skills should feel slow and sturdy, not flashy.
  // Ratios ≈ 55–65% of B equivalents. Max 1–2 effect lines per skill.
  'Rock Slime': {
    sk1: { name: 'Boulder Dash',
      description: "Targets 1 random front-row enemy. Rock Slime launches itself forward in a heavy body slam, dealing physical damage on impact. After striking, rock dust hardens its surface, granting itself a P.DEF boost for 2 turns.",
      ratioLevels: [
        { label: 'Damage',          values: ['100% P.ATK', '122% P.ATK', '148% P.ATK', '180% P.ATK'] },
        { label: 'P.DEF Buff (2T)', values: ['+8% P.DEF',  '+11% P.DEF', '+14% P.DEF', '+18% P.DEF'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565812/s1rlime_hfstrz.png' },

    sk2: { name: 'Rock Shell',
      description: "Self only. Rock Slime compresses its outer layer into a dense stone shell, instantly granting itself a HP Shield proportional to its Max HP. No targeting condition — activates immediately.",
      ratioLevels: [
        { label: 'Shield (Max HP)', values: ['12% Max HP', '15% Max HP', '19% Max HP', '24% Max HP'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565820/s2rslime_shjl5b.png' },

    sk3: { name: 'Mineral Density',
      description: "Passive (self). Rock Slime's dense mineral composition permanently raises its own P.DEF and converts part of that toughness into striking power. Every basic attack Rock Slime performs deals bonus damage equal to a portion of its P.DEF.",
      ratioLevels: [
        { label: 'Basic Atk Bonus (P.DEF)', values: ['+10% P.DEF', '+14% P.DEF', '+19% P.DEF', '+25% P.DEF'] },
        { label: 'P.DEF Bonus (passive)',   values: ['+4%',         '+6%',         '+8%',         '+11%'       ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565826/s3rslime_vip7sb.png' },

    ult: { name: 'Spike Eruption',
      description: "Targets all front-row enemies. Rock Slime erupts jagged stone spikes across its body, striking every enemy in the front row simultaneously with P.DEF-based damage. After the eruption, grants itself a P.DEF boost and a damage-reflect aura for 2 turns.",
      ratioLevels: [
        { label: 'Dmg Front Row (P.DEF)', values: ['55% P.DEF',  '70% P.DEF',  '88% P.DEF',  '110% P.DEF'] },
        { label: 'P.DEF Boost (2T)',       values: ['+18%',       '+24%',       '+30%',        '+38%'       ] },
        { label: 'Reflect (2T)',            values: ['10%',         '13%',        '17%',         '22%'        ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565833/s4rslime_duuc2g.png' },
  },

  // ── C Rarity — Acid Slime (Ranged DPS) ──────────────────────────────────────
  // Glass cannon: high P.ATK + Speed, low HP/DEF. Niche: P.DEF shredding.
  'Acid Slime': {
    sk1: { name: 'Acid Spit',
      description: "Targets 1 random back-row enemy. If no back-row enemy remains, targets 1 random front-row enemy instead. On impact the acid weakens the target's physical armour, reducing their P.DEF for 2 turns. The back-row priority lets Acid Slime reach threats that melee units cannot.",
      ratioLevels: [
        { label: 'Damage',            values: ['105% P.ATK', '128% P.ATK', '155% P.ATK', '188% P.ATK'] },
        { label: 'P.DEF Shred (2T)', values: ['−8%',         '−10%',       '−13%',        '−17%'       ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806549/sk1acd_nqz0x5.png' },

    sk2: { name: 'Corrosive Splash',
      description: "Targets 2 random front-row enemies. Acid Slime sprays a wide arc of acid, striking both targets with physical damage. Each impact independently rolls its own Stun chance — both targets can be Stunned in the same cast.",
      ratioLevels: [
        { label: 'Dmg (×2 targets)',  values: ['68% P.ATK', '84% P.ATK', '102% P.ATK', '124% P.ATK'] },
        { label: 'Stun Chance / Tgt', values: ['16%',        '20%',       '26%',         '33%'        ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806563/sk2acd_x4d8qu.png' },

    sk3: { name: 'Acidic Membrane',
      description: "Passive (self-reactive). Acid Slime's body oozes corrosive fluid at all times. Whenever any enemy strikes Acid Slime with a physical attack, that attacker immediately receives acid damage in return. Acid Slime also permanently gains a passive Speed bonus.",
      ratioLevels: [
        { label: 'Contact Dmg (P.ATK)', values: ['10% P.ATK', '14% P.ATK', '19% P.ATK', '25% P.ATK'] },
        { label: 'Speed Bonus',          values: ['+4%',        '+5%',        '+7%',        '+9%'       ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806571/sk3acd_gh45ki.png' },

    ult: { name: 'Acid Flood',
      description: "Targets all enemies (entire enemy team). Acid Slime releases a torrent of concentrated acid that drenches every enemy simultaneously, dealing physical damage to all and reducing the P.DEF of every target for 2 turns. The mass armour shred synergises with any physical attacker on the team.",
      ratioLevels: [
        { label: 'Dmg All (P.ATK)',      values: ['78% P.ATK', '96% P.ATK', '118% P.ATK', '144% P.ATK'] },
        { label: 'P.DEF Shred All (2T)', values: ['−10%',       '−13%',      '−17%',        '−22%'       ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806578/sk4acd_mcmpzu.png' },
  },

  // ── C Rarity — Water Slime (Support / Debuffer) ──────────────────────────────
  // Not a healer — a tempo controller. Slows enemies and shreds magic resistance.
  // Enabler for magic-damage teammates. M.ATK stat, moderate speed.
  'Water Slime': {
    sk1: { name: 'Water Jet',
      description: "Targets the enemy with the highest Speed. Water Slime fires a pressurised jet of water, dealing magic damage and reducing that target's Speed for 2 turns. Prioritising the fastest enemy disrupts their action order and maximises the slow's disruptive value.",
      ratioLevels: [
        { label: 'Damage (M.ATK)',  values: ['82% M.ATK',  '100% M.ATK', '122% M.ATK', '148% M.ATK'] },
        { label: 'Speed Slow (2T)', values: ['−18% Spd',   '−24% Spd',   '−30% Spd',   '−38% Spd'  ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807420/sk1wtr.pg_fbx8a0.png' },

    sk2: { name: 'Tidal Surge',
      description: "Targets the 2 front-row enemies with the highest Max HP. Water Slime crashes a wave into the two most durable front-liners, dealing magic damage to each and weakening their M.DEF for 2 turns — making them significantly more vulnerable to follow-up magic attacks from allies.",
      ratioLevels: [
        { label: 'Dmg / Target (M.ATK)', values: ['58% M.ATK', '72% M.ATK', '88% M.ATK', '108% M.ATK'] },
        { label: 'M.DEF Shred (2T)',      values: ['−12%',       '−16%',      '−21%',       '−27%'       ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807428/sk2wtr_vmi777.png' },

    sk3: { name: 'Soaking Field',
      description: "Passive (self + team aura). Water Slime perpetually dampens the battlefield. All allies automatically deal bonus magic damage against any enemy currently afflicted by one of Water Slime's debuffs. Water Slime itself also gains a permanent Max HP bonus.",
      ratioLevels: [
        { label: 'Ally Bonus vs. Debuffed (M.ATK)', values: ['+8% M.ATK', '+12% M.ATK', '+16% M.ATK', '+22% M.ATK'] },
        { label: 'Self Max HP Bonus',                values: ['+5%',        '+5%',         '+5%',         '+5%'        ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807444/sk3wtr_fedwpe.png' },

    ult: { name: 'Deluge Wave',
      description: "Targets all enemies (entire enemy team). Water Slime unleashes a massive flood that washes over every enemy simultaneously — dealing magic damage and applying Waterlogged to all targets, reducing both their P.DEF and M.DEF for 2 turns. Each turn while Waterlogged, every affected enemy independently has a chance to be Stunned.",
      ratioLevels: [
        { label: 'Dmg All (M.ATK)',           values: ['72% M.ATK',  '88% M.ATK',  '108% M.ATK', '132% M.ATK'] },
        { label: 'P.DEF + M.DEF Shred (2T)',  values: ['−10% each',  '−13% each',  '−17% each',  '−22% each' ] },
        { label: 'Stun Chance / Turn (2T)',   values: ['12%',         '16%',         '21%',         '27%'       ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807456/sk4wtr_fbixax.png' },
  },

  // ── C Rarity — Gorr (Fighter / Brawler) ────────────────────────────────────
  Gorr: {
    sk1: { name: 'Blood Slash',
      description: 'Slashes a single front-row enemy for heavy physical damage. Inflicts Bleed for 3 turns — deals bonus physical damage per turn.',
      ratioLevels: [
        { label: 'Damage (P.ATK)',     values: ['128% P.ATK','156% P.ATK','188% P.ATK','228% P.ATK'] },
        { label: 'Bleed/Turn (P.ATK)', values: ['8% P.ATK',  '11% P.ATK', '15% P.ATK', '20% P.ATK' ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002904/sk1gor_wkgpaz.png' },
    sk2: { name: 'Terrifying Roar',
      description: "Gorr unleashes a primal roar, terrorising the enemy with the highest P.ATK. Deals moderate damage and reduces that target's P.ATK and Speed for 2 turns.",
      ratioLevels: [
        { label: 'Damage (P.ATK)',     values: ['100% P.ATK','122% P.ATK','148% P.ATK','180% P.ATK'] },
        { label: 'P.ATK Shred (2T)',   values: ['−15%','−19%','−24%','−30%'] },
        { label: 'Speed Shred (2T)',   values: ['−12%','−15%','−19%','−24%'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002911/sk2gor_grkelh.png' },
    sk3: { name: 'Blood Feast',
      description: 'Passive (self). After each Bleed tick, Gorr regains HP equal to a portion of his P.ATK (lifesteal from his own bleed).',
      ratioLevels: [
        { label: 'Heal / Bleed Tick (P.ATK)', values: ['30% P.ATK','38% P.ATK','48% P.ATK','60% P.ATK'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002917/sk3gor_ppjc9j.png' },
    ult: { name: 'Bloodlust',
      description: 'Gorr enters a frenzy, striking all enemies with brutal force. Applies Bleed to all hit enemies for 3 turns.',
      ratioLevels: [
        { label: 'Damage All (P.ATK)', values: ['90% P.ATK','110% P.ATK','135% P.ATK','165% P.ATK'] },
        { label: 'Bleed/Turn (P.ATK)', values: ['8% P.ATK',  '11% P.ATK', '15% P.ATK', '20% P.ATK' ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002925/sk4gor_axfkc2.png' },
  },

  // ── C Rarity — Craw (Ranged / Archer) ──────────────────────────────────────
  Craw: {
    sk1: { name: 'Crude Shot',
      description: 'Fires at a random enemy target for physical damage. 30–60% chance to inflict Wound for 2 turns — increases all damage the target receives.',
      ratioLevels: [
        { label: 'Damage (P.ATK)',    values: ['115% P.ATK','138% P.ATK','166% P.ATK','200% P.ATK'] },
        { label: 'Wound Chance',      values: ['30%','38%','48%','60%'] },
        { label: 'Wound Bonus Dmg',   values: ['+10%','+13%','+17%','+22%'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002931/sk1craw_cgwnc7.png' },
    sk2: { name: 'Blind Arrow',
      description: "Targets the enemy with the highest P.ATK. Fires a poison-tipped blinding bolt — deals damage and applies Blind for 2 turns: that enemy has a high chance to miss its attacks.",
      ratioLevels: [
        { label: 'Damage (P.ATK)',    values: ['130% P.ATK','158% P.ATK','190% P.ATK','230% P.ATK'] },
        { label: 'Blind Miss Chance', values: ['35%','45%','55%','65%'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002935/sk2craw_hmjjoz.png' },
    sk3: { name: 'Cornered Rat',
      description: "Passive (self). When Craw's HP falls below 40%, it enters survival mode — permanently boosting P.ATK and Speed (once per battle).",
      ratioLevels: [
        { label: 'P.ATK Bonus',  values: ['+25%','+36%','+44%','+54%'] },
        { label: 'Speed Bonus',  values: ['+12%','+15%','+18%','+22%'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002946/sk3craw_f6s5e5.png' },
    ult: { name: 'Skypiercer Volley',
      description: 'Rains arrows on ALL enemies simultaneously. Each arrow deals physical damage independently. Wound applied by SK1 amplifies every arrow.',
      ratioLevels: [
        { label: 'Damage All (P.ATK)', values: ['72% P.ATK','88% P.ATK','108% P.ATK','132% P.ATK'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002939/sk4craw_zg73ez.png' },
  },

  // ── C Rarity — Myko (Tank / Shield) ────────────────────────────────────────
  Myko: {
    sk1: { name: 'Iron Casing',
      description: "Myko hunches behind its shield and channels fungal chitin through its body, hardening its outer casing. Instantly generates a protective HP Shield equal to a portion of Myko's maximum HP — absorbing incoming damage before health is lost.",
      ratioLevels: [
        { label: 'HP Shield (Max HP)', values: ['12%','16%','20%','25%'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009427/sk1myk_nr36fc.png' },
    sk2: { name: 'Spore Slam',
      description: "Myko drives its shield into the ground with tremendous force, releasing a fungal shockwave through the front row of enemies. Damage scales with Myko's P.DEF. Enemies struck are infected with Spore Rot for 2 turns — their P.ATK is weakened.",
      ratioLevels: [
        { label: 'Damage (P.DEF)',         values: ['90% P.DEF','110% P.DEF','135% P.DEF','165% P.DEF'] },
        { label: 'Spore Rot P.ATK − (2T)', values: ['−15%','−18%','−22%','−28%'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009434/sk2myk_nry1oe.png' },
    sk3: { name: 'Fungal Resilience',
      description: "Passive (self, permanent). Each time Myko receives a direct attack, it immediately regenerates HP equal to a percentage of its own P.DEF. Higher P.DEF means greater recovery per hit — making a heavily-armored Myko nearly impossible to chip down.",
      ratioLevels: [
        { label: 'Heal per Hit (P.DEF)', values: ['18% P.DEF','25% P.DEF','32% P.DEF','40% P.DEF'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009440/sk3myk_oc94bf.png' },
    ult: { name: 'Spore Eruption',
      description: "Myko erupts spores across ALL enemies. Deals magic damage based on Myko's P.DEF and applies Spore Toxin for 3 turns — each turn, infected enemies lose HP equal to a portion of Myko's P.DEF.",
      ratioLevels: [
        { label: 'Damage All (P.DEF)',       values: ['85% P.DEF','105% P.DEF','130% P.DEF','160% P.DEF'] },
        { label: 'Spore Toxin/Turn (P.DEF)', values: ['15% P.DEF','20% P.DEF','26% P.DEF','34% P.DEF'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009488/sk4myk_egyexz.png' },
  },

  // ── C Rarity — Fang (Assassin / Dual Daggers) ──────────────────────────────
  Fang: {
    sk1: { name: 'Twin Slash',
      description: 'Fang lunges at one enemy and unleashes two rapid dagger strikes in quick succession. The second hit targets a gap in the enemy\'s guard — harder to mitigate.',
      ratioLevels: [
        { label: 'Dmg per Hit (P.ATK)', values: ['90%', '110%', '135%', '165%'] },
        { label: 'Hits',                values: ['×2',  '×2',   '×2',   '×2'  ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png' },
    sk2: { name: 'Shadow Sprint',
      description: 'Fang blurs through the entire front row in a single pass, slashing every enemy simultaneously. Fast, wide, and unpredictable.',
      ratioLevels: [
        { label: 'Dmg per Enemy (P.ATK)', values: ['75%', '92%', '112%', '138%'] },
        { label: 'Targets',               values: ['Front Row', 'Front Row', 'Front Row', 'Front Row'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002935/sk2craw_hmjjoz.png' },
    sk3: { name: "Hunter's Mark",
      description: "Passive (self). Whenever Fang lands the killing blow on any enemy, Fang gains a permanent P.ATK stack. Stacks up to 3 times — rewarding aggressive play.",
      ratioLevels: [
        { label: 'P.ATK Bonus/Stack', values: ['+28%', '+36%', '+46%', '+58%'] },
        { label: 'Max Stacks',        values: ['3',    '3',    '3',    '3'   ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002946/sk3craw_f6s5e5.png' },
    ult: { name: 'Death Bound',
      description: "Targets the enemy with the lowest remaining HP. If that target is below 35% HP, this attack's damage is tripled — a near-certain kill.",
      ratioLevels: [
        { label: 'Damage (P.ATK)',             values: ['260%', '320%', '395%', '480%'] },
        { label: 'Bonus × if target < 35% HP', values: ['×3',   '×3',   '×3',   '×3'  ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002939/sk4craw_zg73ez.png' },
  },

  // ── C Rarity — Clover (Support / Bunny Mage) ────────────────────────────────
  Clover: {
    sk1: { name: 'Healing Herb',
      description: 'Channels nature magic to heal the ally with the lowest current HP. Quick and efficient — prioritises whoever needs it most.',
      ratioLevels: [
        { label: 'Heal (M.ATK)', values: ['130%', '160%', '195%', '240%'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png' },
    sk2: { name: 'Lucky Toss',
      description: 'Tosses a clover charm at a random ally. The target recovers HP each turn for 3 turns. Works even during enemy turns — keeps allies alive through sustained punishment.',
      ratioLevels: [
        { label: 'Regen/Turn (M.ATK)', values: ['55%', '68%', '83%', '100%'] },
        { label: 'Duration',           values: ['3T',  '3T',  '3T',  '3T'  ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png' },
    sk3: { name: 'Life Bloom',
      description: "Passive (team). Each time any ally takes a direct hit, 35% chance Clover automatically heals that ally instantly at no cost. A reliable safety net against rapid multi-hit attackers.",
      ratioLevels: [
        { label: 'Passive Heal/Proc (M.ATK)', values: ['40%', '52%', '66%', '82%'] },
        { label: 'Trigger Chance',            values: ['35%', '35%', '35%', '35%'] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png' },
    ult: { name: 'Bloom Cascade',
      description: "Heals ALL allies simultaneously, then applies Lucky Toss regen to every ally for 3 turns. Burst healing + sustained regeneration combined — use when the whole team is hurting.",
      ratioLevels: [
        { label: 'Burst Heal/Ally (M.ATK)',  values: ['90%',  '112%', '138%', '168%'] },
        { label: 'Regen/Ally/Turn (M.ATK)',  values: ['38%',  '46%',  '56%',  '68%' ] },
        { label: 'Regen Duration',           values: ['3T',   '3T',   '3T',   '3T'  ] },
      ],
      iconUrl: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png' },
  },
};

const GENERIC_NAMES: Record<string, string> = {
  sk1: 'Active Skill I', sk2: 'Active Skill II', sk3: 'Passive Skill', ult: 'Ultimate',
};

// ─── Skill slot (icon + badge above, tap to open popup) ───────────────────────
function SkillSlot({ slotKey, heroName, skillLv, locked, onTap, onRelease }: {
  slotKey: string; heroName: string; skillLv: number; locked: boolean;
  onTap: () => void; onRelease: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const info   = SD[heroName]?.[slotKey];
  const hasImg = Boolean(info?.iconUrl);
  const isMax  = skillLv >= 4;
  const label  = slotKey === 'ult' ? 'Ultimate' : slotKey === 'sk3' ? 'Passive' : `Skill ${slotKey.slice(-1)}`;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', userSelect: 'none' }}
      onPointerDown={() => { setPressed(true); onTap(); }}
      onPointerUp={() => { setPressed(false); onRelease(); }}
      onPointerLeave={() => { setPressed(false); onRelease(); }}
      onPointerCancel={() => { setPressed(false); onRelease(); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transform: pressed ? 'scale(0.83) translateY(2px)' : 'scale(1)', filter: pressed ? 'brightness(0.7)' : 'none', transition: pressed ? 'transform 0.07s ease-out' : 'transform 0.26s cubic-bezier(0.34,1.56,0.64,1)' }}>
        {/* Badge above frame */}
        <div style={{ height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {locked
            ? <svg width="10" height="11" viewBox="0 0 20 22" fill="none"><rect x="2" y="10" width="16" height="11" rx="2.5" fill="rgba(150,150,200,0.6)"/><path d="M5 10V7a5 5 0 0 1 10 0v3" stroke="rgba(180,180,230,0.8)" strokeWidth="2.5" strokeLinecap="round"/></svg>
            : <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 8, fontWeight: 700, color: isMax ? '#F97316' : '#FFD700', background: isMax ? 'rgba(249,115,22,0.18)' : 'rgba(255,215,0,0.15)', borderRadius: 3, padding: '1px 4px', border: `1px solid ${isMax ? 'rgba(249,115,22,0.5)' : 'rgba(255,215,0,0.4)'}` }}>{isMax ? 'MAX' : `Lv.${skillLv}`}</span>
          }
        </div>

        {/* Icon frame */}
        <div style={{ width: 44, height: 44, borderRadius: 8, border: `1.5px solid ${locked ? 'rgba(150,150,200,0.35)' : 'rgba(255,215,0,0.55)'}`, background: 'rgba(0,0,0,0.75)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
          {hasImg ? (
            <>
              <SkillIconCanvas src={info!.iconUrl} size={44} />
              {locked && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,20,0.62)' }}/>}
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,5,30,0.9)' }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="9" fill="none" stroke={locked ? 'rgba(150,150,200,0.35)' : 'rgba(255,215,0,0.35)'} strokeWidth="1.5"/>
                <text x="11" y="15" textAnchor="middle" fontSize="12" fontFamily="serif" fill={locked ? 'rgba(180,180,220,0.5)' : 'rgba(255,215,0,0.6)'}>{locked ? '?' : '✦'}</text>
              </svg>
            </div>
          )}
        </div>

        <span style={{ color: locked ? 'rgba(180,180,220,0.4)' : 'rgba(255,215,0,0.8)', fontFamily: "'Roboto Condensed',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
    </div>
  );
}

// ─── Skill popup (hold to reveal) ────────────────────────────────────────────
interface PopupData {
  info: PSI | null; skillLv: number; locked: boolean;
  unlockLv: number; genericName: string; genericDesc: string;
}
function SkillPopup({ d }: { d: PopupData }) {
  const { info, skillLv, locked, unlockLv, genericName, genericDesc } = d;
  const isMax = skillLv >= 4;
  const lv    = Math.max(1, skillLv);
  const hasImg = Boolean(info?.iconUrl);
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 95, background: 'linear-gradient(160deg,#06001a,#0d0030)', border: `2px solid ${locked ? 'rgba(150,150,220,0.65)' : '#F97316'}`, borderRadius: 12, padding: '14px 16px', minWidth: 200, maxWidth: 'min(310px,56vw)', boxShadow: locked ? '0 0 24px rgba(120,100,255,0.3),0 8px 32px rgba(0,0,0,0.95)' : '0 0 28px rgba(249,115,22,0.35),0 8px 32px rgba(0,0,0,0.95)', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 7, overflow: 'hidden', border: `1px solid ${locked ? 'rgba(150,150,200,0.4)' : 'rgba(255,215,0,0.5)'}`, background: 'rgba(0,0,0,0.6)' }}>
          {hasImg
            ? <SkillIconCanvas src={info!.iconUrl} size={40} />
            : <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="18" height="20" viewBox="0 0 20 22" fill="none"><rect x="2" y="10" width="16" height="11" rx="2.5" fill="rgba(150,150,200,0.5)"/><path d="M5 10V7a5 5 0 0 1 10 0v3" stroke="rgba(180,180,230,0.7)" strokeWidth="2" strokeLinecap="round"/></svg></div>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 'clamp(12px,2vw,15px)', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info ? info.name : genericName}</span>
            <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap', color: locked ? 'rgba(180,180,220,0.85)' : isMax ? '#F97316' : '#FFD700', border: `1px solid ${locked ? 'rgba(150,150,200,0.5)' : isMax ? '#F97316' : 'rgba(255,215,0,0.5)'}`, borderRadius: 4, padding: '2px 5px', flexShrink: 0 }}>
              {locked ? `Unlocks Lv.${unlockLv}` : isMax ? 'MAX' : `Lv.${lv}`}
            </span>
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: locked ? 'rgba(150,150,220,0.3)' : 'rgba(249,115,22,0.45)', marginBottom: 10 }}/>
      <div style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 'clamp(9px,1.4vw,11px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, marginBottom: info && info.ratioLevels.length ? 10 : 0 }}>
        {info ? info.description : genericDesc}
      </div>
      {info && info.ratioLevels.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
          {info.ratioLevels.map(r => {
            const cur = r.values[lv - 1] ?? r.values[0];
            return (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 'clamp(9px,1.3vw,11px)', color: locked ? 'rgba(180,180,220,0.7)' : '#F97316' }}>{r.label}</span>
                <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 'clamp(9px,1.3vw,11px)', fontWeight: 700, color: locked ? 'rgba(200,200,240,0.8)' : '#FFD700', whiteSpace: 'nowrap' }}>
                  {cur}{locked && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85em' }}> preview</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {locked && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(150,150,200,0.15)', fontFamily: "'Roboto Condensed',sans-serif", fontSize: 9, color: 'rgba(180,180,220,0.5)' }}>
          Full ratios visible after obtaining this hero.
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface HeroPreviewViewProps {
  name: string; rarity: string; heroType: string; ilust?: string; onClose: () => void;
}

export function HeroPreviewView({ name, rarity, heroType, ilust, onClose }: HeroPreviewViewProps) {
  const minStars = STAR_MIN[rarity] ?? 1;
  const [previewLv, setPreviewLv] = useState(1);
  const [stars, setStars]         = useState(minStars);
  const [popup, setPopup]         = useState<PopupData | null>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  const cfg      = RARITY_CFG[rarity] ?? RARITY_CFG.common;
  const statRole = HERO_TYPE_TO_STAT_ROLE[heroType] ?? 'Fighter';
  const clampLv  = (v: number) => Math.max(1, Math.min(240, v));

  // Engine-derived stats: rarity + role + level → then star bonus on top
  // heroId for gallery preview = hero name lowercased with spaces→underscores
  const heroId   = name.toLowerCase().replace(/\s+/g, '_');
  const rawStats = computeEngineStats(heroId, statRole, rarity, previewLv);
  const starMult = computeStarBonus(rarity, stars);
  const stats = {
    hp:    Math.round(rawStats.hp    * starMult),
    pAtk:  Math.round(rawStats.pAtk  * starMult),
    mAtk:  Math.round(rawStats.mAtk  * starMult),
    pDef:  Math.round(rawStats.pDef  * starMult),
    mDef:  Math.round(rawStats.mDef  * starMult),
    speed: Math.round(rawStats.speed * starMult),
  };
  const power = stats
    ? Math.round(stats.hp / 15 + stats.pAtk * 2 + stats.mAtk * 2 + stats.pDef * 2 + stats.mDef * 2 + stats.speed * 121)
    : 0;

  const sk1 = computeSkillState(previewLv, 'sk1');
  const sk2 = computeSkillState(previewLv, 'sk2');
  const sk3 = computeSkillState(previewLv, 'sk3');
  const ult  = computeSkillState(previewLv, 'ult');

  const CARD_W = 148;
  const CARD_H = Math.round(CARD_W * 400 / 250);

  const starTier  = stars >= 16 ? 'rainbow' : stars > 10 ? 'white' : stars > 5 ? 'red' : 'yellow';
  const tierColor = ({ yellow: '#FFD700', red: '#EE3333', white: '#D8D8FF', rainbow: '#DD00FF' } as Record<string, string>)[starTier];
  const tierLabel = ({ yellow: 'Gold', red: 'Crimson', white: 'Platinum', rainbow: '✦ Rainbow MAX' } as Record<string, string>)[starTier];

  function buildPopup(key: string): PopupData {
    const state    = { sk1, sk2, sk3, ult }[key]!;
    const info     = SD[name]?.[key] ?? null;
    const unlockLv = SKILL_UNLOCK[key][0];
    return {
      info,
      skillLv: state.locked ? 1 : state.level,
      locked:  state.locked,
      unlockLv,
      genericName: GENERIC_NAMES[key] ?? 'Skill',
      genericDesc: state.locked
        ? `This skill unlocks when ${name} reaches level ${unlockLv}.`
        : `Obtain ${name} to view detailed skill information.`,
    };
  }

  const handleBackdrop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === bgRef.current) onClose();
  };

  const starBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "'Roboto Condensed',sans-serif", fontSize: 11, fontWeight: 700,
    padding: '4px 0', width: '100%', borderRadius: 7,
    border: `1px solid ${active ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
    background: active ? 'rgba(255,215,0,0.12)' : 'rgba(0,0,0,0.45)',
    color: active ? '#FFD700' : 'rgba(255,255,255,0.25)',
    cursor: active ? 'pointer' : 'default',
  });

  return (
    <div ref={bgRef} onPointerDown={handleBackdrop}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'relative', width: 'min(92vw, 460px)', maxHeight: '96dvh',
        background: 'linear-gradient(160deg, #0a0018 0%, #100030 60%, #050014 100%)',
        border: `1.5px solid ${cfg.color}55`, borderRadius: 14,
        boxShadow: `0 0 40px ${cfg.color}33, 0 12px 48px rgba(0,0,0,0.9)`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '11px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${cfg.color}33`, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 'clamp(11px,2vw,14px)', fontWeight: 700, color: 'rgba(255,215,0,0.75)', letterSpacing: '0.18em' }}>PREVIEW MODE</span>
          <button onClick={() => { playBackSound(); onClose(); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', gap: 12, padding: '12px 16px 10px', flexShrink: 0 }}>

          {/* LEFT: card + star controls */}
          <div style={{ width: CARD_W, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ width: CARD_W, height: CARD_H }}>
              <HeroCardAnimated rarityColor={cfg.color}>
                {ilust
                  ? <HeroCard name={name} rarity={rarity} level={previewLv} ilust={ilust} heroType={heroType} stars={stars} />
                  : <LockedHeroCard name={name} rarity={rarity} heroType={heroType} />
                }
              </HeroCardAnimated>
            </div>

            {/* Star buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={starBtnStyle(stars > minStars)} onClick={() => setStars(s => Math.max(minStars, s - 1))}>▼ Stars</button>
                <button style={starBtnStyle(stars < STAR_MAX)}  onClick={() => setStars(s => Math.min(STAR_MAX, s + 1))}>▲ Stars</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 2, paddingRight: 2 }}>
                <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 9, color: tierColor, letterSpacing: '0.1em' }}>{tierLabel}</span>
                <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 9, color: 'rgba(255,215,0,0.5)' }}>{stars} ★</span>
              </div>
            </div>
          </div>

          {/* RIGHT: level stepper + stats */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 10, color: 'rgba(255,215,0,0.55)', letterSpacing: '0.1em', marginBottom: 6 }}>PREVIEW LEVEL</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <LvBtn delta={-10} onClick={() => setPreviewLv(v => clampLv(v - 10))} disabled={previewLv <= 1}/>
                <LvBtn delta={-1}  onClick={() => setPreviewLv(v => clampLv(v - 1))}  disabled={previewLv <= 1}/>
                <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 900, color: '#FFD700', minWidth: 42, textAlign: 'center' }}>{previewLv}</span>
                <LvBtn delta={+1}  onClick={() => setPreviewLv(v => clampLv(v + 1))}  disabled={previewLv >= 240}/>
                <LvBtn delta={+10} onClick={() => setPreviewLv(v => clampLv(v + 10))} disabled={previewLv >= 240}/>
              </div>
            </div>

            {stats && (
              <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 10px' }}>
                <StatRow icon={<svg viewBox="0 0 18 18" fill="none"><rect x="6.5" y="1.5" width="5" height="15" rx="2" fill="white"/><rect x="1.5" y="6.5" width="15" height="5" rx="2" fill="white"/></svg>} label="HP" value={stats.hp} />
                <StatRow icon={<svg viewBox="0 0 18 18" fill="none"><line x1="13.5" y1="4.5" x2="4.5" y2="13.5" stroke="white" strokeWidth="2.2" strokeLinecap="round"/><polygon points="13.5,2.5 15.5,4.5 11.5,4.5" fill="white"/><polygon points="13.5,2.5 15.5,4.5 15.5,6.5" fill="white"/><line x1="8" y1="10" x2="10" y2="8" stroke="white" strokeWidth="3" strokeLinecap="round"/><circle cx="4" cy="14" r="2" fill="white"/></svg>} label="P.ATK" value={stats.pAtk} />
                <StatRow icon={<svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="5" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5"/><circle cx="9" cy="9" r="2.5" fill="white"/><line x1="9" y1="2" x2="9" y2="0.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/><line x1="9" y1="16" x2="9" y2="17.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>} label="M.ATK" value={stats.mAtk} />
                <StatRow icon={<svg viewBox="0 0 18 18" fill="none"><rect x="2" y="6" width="14" height="10" rx="2" fill="none" stroke="white" strokeWidth="1.6"/><path d="M5 6V5a4 4 0 0 1 8 0v1" stroke="white" strokeWidth="1.6" strokeLinecap="round"/></svg>} label="P.DEF" value={stats.pDef} />
                <StatRow icon={<svg viewBox="0 0 18 18" fill="none"><path d="M9 2 L16 5 L16 9 Q16 14 9 17 Q2 14 2 9 L2 5 Z" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/><path d="M6 9 L8 11 L12 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>} label="M.DEF" value={stats.mDef} />
                <StatRow icon={<svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" fill="none" stroke="white" strokeWidth="1.5"/><path d="M9 5 L9 9 L12 11" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>} label="Speed" value={stats.speed} />
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 10, color: 'rgba(255,215,0,0.55)', letterSpacing: '0.1em' }}>POWER</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {stars > minStars && <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 9, color: 'rgba(255,215,0,0.5)' }}>★ +{Math.round((starMult - 1) * 100)}%</span>}
                    <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 14, fontWeight: 900, color: '#FFD700' }}>{fmtNum(power)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Skills */}
        <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: 10, color: 'rgba(255,215,0,0.6)', letterSpacing: '0.18em' }}>SKILLS</span>
          </div>
          <div style={{ height: 1, background: 'rgba(255,140,0,0.7)', marginBottom: 12 }}/>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-around' }}>
            {(['sk1','sk2','sk3','ult'] as const).map(key => {
              const state = { sk1, sk2, sk3, ult }[key];
              return (
                <SkillSlot key={key} slotKey={key} heroName={name}
                  skillLv={state.level} locked={state.locked}
                  onTap={() => setPopup(buildPopup(key))}
                  onRelease={() => setPopup(null)}
                />
              );
            })}
          </div>
        </div>

        {popup && <SkillPopup d={popup} />}
      </div>
    </div>
  );
}