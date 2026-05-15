/**
 * spriteConfig.ts — Central size config for all battle sprites & VFX effects.
 *
 * RUNTIME: Components read from this module; overrides live in localStorage.
 * EDITOR:  /sprite-editor page writes overrides via setSpriteSize().
 *
 * Key format:
 *   sprite_{heroId}_idle    → hero idle sprite container size (w × h)
 *   sprite_{heroId}_action  → hero action sprite container size (w × h)
 *   vfx_{name}              → VFX effect draw size (w × h) on canvas
 */

export interface SpriteSize { w: number; h: number; }

const LS_KEY = 'rpg_sprite_config_v1';

// ── Hardcoded baseline defaults ────────────────────────────────────────────────
// These are the "production" values baked into source. Overrides in localStorage
// layer on top and take priority. Use the editor to tune, then paste finals here.
export const SPRITE_DEFAULTS: Record<string, SpriteSize> = {
  // ── Human heroes — idle (objectFit: contain, objectPosition: center bottom) ──
  'sprite_lucas_idle':       { w: 90,  h: 136 },
  'sprite_emma_idle':        { w: 90,  h: 136 },
  'sprite_gorr_idle':        { w: 90,  h: 116 },
  'sprite_craw_idle':        { w: 90,  h: 122 },
  // Myko-tier small heroes
  'sprite_myko_idle':        { w: 68,  h: 85  },
  'sprite_fang_idle':        { w: 61,  h: 70  },
  'sprite_clover_idle':      { w: 68,  h: 85  },
  // Bolo
  'sprite_bolo_idle':        { w: 152, h: 116 },
  'sprite_bolo_action':      { w: 154, h: 116 },
  // Quill — hedgehog Assassin (compact, Myko-tier)
  'sprite_quill_idle':       { w: 68,  h: 85  },
  'sprite_quill_action':     { w: 89,  h: 83  },
  // Brennan — burly Guardian (tall, wide shield)
  'sprite_brennan_idle':     { w: 90,  h: 136 },
  'sprite_brennan_action':   { w: 110, h: 151 },
  // Sylvie — acrobatic Ranged crossbow (lean, dynamic pose)
  'sprite_sylvie_idle':      { w: 90,  h: 136 },
  'sprite_sylvie_action':    { w: 100, h: 130 },
  // Vrak — stocky dwarf fighter (wide stance, compact)
  'sprite_vrak_idle':        { w: 80,  h: 116 },
  'sprite_vrak_action':      { w: 96,  h: 110 },
  // Crael — turtle-folk tank (wide shell, bipedal)
  'sprite_crael_idle':       { w: 100, h: 125 },
  'sprite_crael_action':     { w: 116, h: 120 },
  // Lyss — dark fairy (small, winged, fragile silhouette)
  'sprite_lyss_idle':        { w: 73,  h: 99  },
  'sprite_lyss_action':      { w: 83,  h: 95  },
  // Szara — naga (wide coiled lower body, tall humanoid top)
  'sprite_szara_idle':       { w: 106, h: 146 },
  'sprite_szara_action':     { w: 120, h: 140 },
  // Vex — dark elf mage (tall, lean, robes)
  'sprite_vex_idle':         { w: 90,  h: 139 },
  'sprite_vex_action':       { w: 100, h: 134 },
  // Naris — phantasm (ethereal silhouette, slightly larger than human)
  'sprite_naris_idle':       { w: 89,  h: 130 },
  'sprite_naris_action':     { w: 100, h: 129 },
  // Arix — arachne (wide spider lower body, humanoid top)
  'sprite_arix_idle':        { w: 106, h: 125 },
  'sprite_arix_action':      { w: 119, h: 120 },
  // Zyl — chameleon assassin (lean, athletic, long limbs)
  'sprite_zyl_idle':         { w: 86,  h: 125 },
  'sprite_zyl_action':       { w: 99,  h: 120 },
  // Slimes (square)
  'sprite_rock_slime_idle':  { w: 90,  h: 90  },
  'sprite_acid_slime_idle':  { w: 90,  h: 90  },
  'sprite_water_slime_idle': { w: 90,  h: 90  },

  // ── Human heroes — action ─────────────────────────────────────────────────────
  'sprite_lucas_action':     { w: 154, h: 116 },
  'sprite_emma_action':      { w: 90,  h: 136 },
  'sprite_gorr_action':      { w: 90,  h: 114 },
  'sprite_craw_action':      { w: 90,  h: 122 },
  'sprite_myko_action':      { w: 68,  h: 85  },
  'sprite_fang_action':      { w: 81,  h: 61  },
  'sprite_clover_action':    { w: 68,  h: 85  },
  // Slimes reuse idle size for action (no action sprite)
  'sprite_rock_slime_action':  { w: 90, h: 90 },
  'sprite_acid_slime_action':  { w: 90, h: 90 },
  'sprite_water_slime_action': { w: 90, h: 90 },

  // ── VFX effects (canvas draw size, independent W × H) ────────────────────────
  //
  // Sizing rationale (all values are the FULL size reached at impact):
  //   Slash effects  : ~1.35× target height, 4:3 wide ratio (dramatic weapon swing)
  //   Bullet/bolt    : 62×62 px (small fast projectile, stays readable)
  //   Overlay (cover): character_w × 1.2–1.4 wide,  character_h × 1.2–1.4 tall
  //   Area effects   : GRID_W(368) + margin ≈ 430 wide; heights by effect type
  //   Spike per-tgt  : slightly wider than slime (90px), taller burst above

  // Slash — wide 4:3 swing, scales with attacker's target height
  'vfx_lucas_slash':   { w: 185, h: 145 }, // targets ~136px human heroes
  'vfx_fang_slash':    { w: 120, h: 94  }, // Fang is 61×70; targets are similarly compact
  'vfx_gorr_slash':    { w: 172, h: 135 }, // Gorr targets ~116–122px enemies

  // Projectiles (small fast objects — stay visible but proportional)
  'vfx_craw_slash':    { w: 62,  h: 62  }, // Craw crossbow bolt
  'vfx_sylvie_bolt':   { w: 62,  h: 62  }, // Sylvie bolt  (same asset type)

  // Overlays — envelop the character with ~20–40% margin
  // Emma / Brennan / Sylvie hero body: 90×136 px
  'vfx_emma_heal':     { w: 112, h: 112 }, // Heal orb landing on ally (~80% hero width)
  'vfx_emma_shield':   { w: 128, h: 160 }, // Shield bubble: 90×1.42 = 128 w, 136×1.18 = 160 h
  'vfx_brennan_shield':{ w: 128, h: 160 }, // Same body size as Emma

  // Clover body: 68×85 px — orb sized for healed allies (human scale)
  'vfx_clover_heal':   { w: 80,  h: 80  }, // Flying herb orb (~90% hero width)

  // Myko body: 68×85 px
  'vfx_myko_shield':   { w: 96,  h: 116 }, // 68×1.41 = 96 w, 85×1.37 = 116 h
  'vfx_myko_ult':      { w: 110, h: 110 }, // Mushroom overlay, square

  // Area effects — span the full enemy/ally formation (GRID_W = 368 px + margin)
  'vfx_wslime_wave':   { w: 430, h: 168 }, // Wave crests above slime height (90px)
  'vfx_aslime_flood':  { w: 430, h: 118 }, // Flat acid pool, lower profile
  'vfx_rslime_spike':  { w: 110, h: 148 }, // Spike cluster per target: wider than slime (90px), tall burst
};

// ── In-memory cache of localStorage overrides ─────────────────────────────────
let _overrideCache: Record<string, SpriteSize> | null = null;

function getOverrides(): Record<string, SpriteSize> {
  if (_overrideCache !== null) return _overrideCache;
  try {
    const raw = localStorage.getItem(LS_KEY);
    _overrideCache = raw ? (JSON.parse(raw) as Record<string, SpriteSize>) : {};
  } catch {
    _overrideCache = {};
  }
  return _overrideCache;
}

/** Read size for a key. localStorage override wins; falls back to SPRITE_DEFAULTS. */
export function getSpriteSize(key: string): SpriteSize {
  const ov = getOverrides();
  return ov[key] ?? SPRITE_DEFAULTS[key] ?? { w: 180, h: 338 };
}

/** Write (or update) an override. Persists to localStorage immediately. */
export function setSpriteSize(key: string, size: SpriteSize): void {
  const ov = getOverrides();
  ov[key] = { w: Math.round(size.w), h: Math.round(size.h) };
  try { localStorage.setItem(LS_KEY, JSON.stringify(ov)); } catch { /* quota */ }
}

/** Remove a single override (reverts to SPRITE_DEFAULTS). */
export function resetSpriteSize(key: string): void {
  const ov = getOverrides();
  delete ov[key];
  try { localStorage.setItem(LS_KEY, JSON.stringify(ov)); } catch { /* quota */ }
}

/** True if this key has a localStorage override different from its default. */
export function hasOverride(key: string): boolean {
  const ov = getOverrides();
  return key in ov;
}

/** Return the hardcoded baseline default (ignores overrides). */
export function getDefaultSize(key: string): SpriteSize {
  return SPRITE_DEFAULTS[key] ?? { w: 180, h: 338 };
}

/** All current overrides (for Export Code UI). */
export function getAllOverrides(): Record<string, SpriteSize> {
  return { ...getOverrides() };
}

/** Nuke all localStorage overrides (reset everything to SPRITE_DEFAULTS). */
export function clearAllOverrides(): void {
  _overrideCache = {};
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

// ─── VFX Position Config ──────────────────────────────────────────────────────
// Stores per-hero+skill origin & destination offsets for projectile/effect positioning.
// Key = `${heroId}_${skillKey}` (e.g. "lucas_bsc", "emma_sk1")
//
//   startX / startY : offset from the HERO slot's centre-bottom (px).
//                     startY is typically negative (upward), e.g. -50 = 50 px above ground.
//   endX   / endY   : offset from the TARGET (enemy) slot's centre-bottom (px).

export interface VfxPosConfig {
  startX: number;
  startY: number;
  endX:   number;
  endY:   number;
}

const VFX_POS_LS_KEY = 'rpg_vfx_pos_v1';
let _vfxPosCache: Record<string, VfxPosConfig> | null = null;

function getVfxPosCache(): Record<string, VfxPosConfig> {
  if (_vfxPosCache !== null) return _vfxPosCache;
  try {
    const raw = localStorage.getItem(VFX_POS_LS_KEY);
    _vfxPosCache = raw ? (JSON.parse(raw) as Record<string, VfxPosConfig>) : {};
  } catch { _vfxPosCache = {}; }
  return _vfxPosCache;
}

export function getVfxPos(key: string): VfxPosConfig {
  return getVfxPosCache()[key] ?? { startX: 0, startY: -43, endX: 0, endY: -43 };
}

export function setVfxPos(key: string, pos: VfxPosConfig): void {
  const c = getVfxPosCache();
  c[key] = pos;
  try { localStorage.setItem(VFX_POS_LS_KEY, JSON.stringify(c)); } catch {}
}

export function resetVfxPos(key: string): void {
  const c = getVfxPosCache();
  delete c[key];
  try { localStorage.setItem(VFX_POS_LS_KEY, JSON.stringify(c)); } catch {}
}

export function getAllVfxPos(): Record<string, VfxPosConfig> {
  return { ...getVfxPosCache() };
}