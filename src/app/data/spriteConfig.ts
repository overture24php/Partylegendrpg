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
  'sprite_lucas_idle':       { w: 180, h: 270 },
  'sprite_emma_idle':        { w: 180, h: 270 },
  'sprite_gorr_idle':        { w: 180, h: 231 },
  'sprite_craw_idle':        { w: 180, h: 241 },
  // Myko-tier small heroes
  'sprite_myko_idle':        { w: 135, h: 169 },
  'sprite_fang_idle':        { w: 119, h: 138 },
  'sprite_clover_idle':      { w: 135, h: 169 },
  // Bolo
  'sprite_bolo_idle':        { w: 302, h: 230 },
  'sprite_bolo_action':      { w: 308, h: 231 },
  // Quill — hedgehog Assassin (compact, Myko-tier)
  'sprite_quill_idle':       { w: 135, h: 169 },
  'sprite_quill_action':     { w: 175, h: 165 },
  // Brennan — burly Guardian (tall, wide shield)
  'sprite_brennan_idle':     { w: 180, h: 270 },
  'sprite_brennan_action':   { w: 220, h: 300 },
  // Sylvie — acrobatic Ranged crossbow (lean, dynamic pose)
  'sprite_sylvie_idle':      { w: 180, h: 270 },
  'sprite_sylvie_action':    { w: 200, h: 260 },
  // Vrak — stocky dwarf fighter (wide stance, compact)
  'sprite_vrak_idle':        { w: 160, h: 230 },
  'sprite_vrak_action':      { w: 190, h: 220 },
  // Crael — turtle-folk tank (wide shell, bipedal)
  'sprite_crael_idle':       { w: 200, h: 250 },
  'sprite_crael_action':     { w: 230, h: 240 },
  // Lyss — dark fairy (small, winged, fragile silhouette)
  'sprite_lyss_idle':        { w: 145, h: 195 },
  'sprite_lyss_action':      { w: 165, h: 188 },
  // Szara — naga (wide coiled lower body, tall humanoid top)
  'sprite_szara_idle':       { w: 210, h: 290 },
  'sprite_szara_action':     { w: 240, h: 280 },
  // Vex — dark elf mage (tall, lean, robes)
  'sprite_vex_idle':         { w: 180, h: 275 },
  'sprite_vex_action':       { w: 200, h: 268 },
  // Naris — phantasm (ethereal silhouette, slightly larger than human)
  'sprite_naris_idle':       { w: 175, h: 260 },
  'sprite_naris_action':     { w: 200, h: 255 },
  // Arix — arachne (wide spider lower body, humanoid top)
  'sprite_arix_idle':        { w: 210, h: 250 },
  'sprite_arix_action':      { w: 235, h: 240 },
  // Zyl — chameleon assassin (lean, athletic, long limbs)
  'sprite_zyl_idle':         { w: 170, h: 250 },
  'sprite_zyl_action':       { w: 195, h: 240 },
  // Slimes (square)
  'sprite_rock_slime_idle':  { w: 180, h: 180 },
  'sprite_acid_slime_idle':  { w: 180, h: 180 },
  'sprite_water_slime_idle': { w: 180, h: 180 },

  // ── Human heroes — action ─────────────────────────────────────────────────────
  'sprite_lucas_action':     { w: 307, h: 230 },   // +60% over 440 from sprint 2
  'sprite_emma_action':      { w: 180, h: 270 },
  'sprite_gorr_action':      { w: 180, h: 227 },
  'sprite_craw_action':      { w: 180, h: 241 },
  'sprite_myko_action':      { w: 135, h: 169 },
  'sprite_fang_action':      { w: 161, h: 118 },
  'sprite_clover_action':    { w: 135, h: 169 },
  // Slimes reuse idle size for action (no action sprite)
  'sprite_rock_slime_action':  { w: 180, h: 180 },
  'sprite_acid_slime_action':  { w: 180, h: 180 },
  'sprite_water_slime_action': { w: 180, h: 180 },

  // ── VFX effects (canvas draw size, independent W × H) ─────────────────────────
  'vfx_lucas_slash':   { w: 200, h: 200 },
  'vfx_fang_slash':    { w: 200, h: 200 },  // Fang basic/sk1/sk2 slash
  'vfx_gorr_slash':    { w: 200, h: 200 },  // Gorr same asset as Fang
  'vfx_craw_slash':    { w: 180, h: 180 },  // Craw arrow projectile
  'vfx_sylvie_bolt':   { w: 180, h: 180 },  // Sylvie crossbow bolt projectile (shared asset with Craw)
  'vfx_emma_heal':     { w: 300, h: 280 },
  'vfx_emma_shield':   { w: 225, h: 300 },
  'vfx_clover_heal':   { w: 220, h: 220 },  // Clover SK1/SK2/ULT flying heal orb
  'vfx_myko_shield':   { w: 225, h: 270 },  // Myko SK1 shield overlay
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