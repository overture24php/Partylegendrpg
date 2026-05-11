/**
 * Game SFX utilities — singleton audio players per sound type.
 */

// ── Button / Nav generic click — new select SFX ───────────────────────────────
const BTN_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777874441/emilianodleon-select-button-ui-395763_zildua.mp3';

// ── Card deploy / Chapter select ─────────────────────────────────────────────
const CARD_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777817847/freesound_community-card-sounds-35956_xd0rrn.mp3';

// ── Back / close buttons — now uses old button-press SFX ─────────────────────
const BACK_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777817753/dragon-studio-button-press-382713_rd1cyr.mp3';

// ── Start Battle (sword slice) ────────────────────────────────────────────────
const START_BATTLE_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777824497/dragon-studio-sword-slice-2-393845_xq3npe.mp3';

// ── Lucas attack (basic/sk1/sk2/ult per-hit) ─────────────────��───────────────
const LUCAS_ATTACK_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/v1777817667/freesound_community-hit-swing-sword-small-2-95566_ewoib0.mp3';

// ── Skill SFX: bullet (ranged basic) ─────────────────────────────────────────
const BULLET_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777825985/u_xpdo8dyg08-bullet-382829_kgh16n.mp3';

// ── Skill SFX: heal magic (Emma SK1 / ULT) ───────────────────────────────────
const HEAL_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826228/yodguard-healing-magic-3-378664_o03eoj.mp3';

// ── Skill SFX: water splash (Acid/Water Slime skills) ────────────────────────
const WATER_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826345/freesound_community-water-splash-46402_v24mak.mp3';

// ── Skill SFX: shield guard (Emma SK2 / passive, RockSlime SK2 / ULT) ────────
const SHIELD_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777826444/freesound_community-shield-guard-6963_xywxza.mp3';

// ── Skill SFX: punch (RockSlime basic / SK1) ─────────────────────────────────
const PUNCH_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872406/soraatwod-punch-416719_al8u2e.mp3';

// ── Battle BGM (loops while battle is active) ─────────────────────────────────
const BATTLE_BGM_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872315/backgroundmusicforvideos-epic-background-music-484342_qc73ue.mp3';

// ── Victory jingle ────────────────────────────────────────────────────────────
const VICTORY_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872713/universfield-open-new-level-143027_d9hese.mp3';

// ── Defeat jingle ─────────────────────────────────────────────────────────────
const DEFEAT_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777872778/universfield-marimba-lose-250960_s2ocax.mp3';

// ── Craw arrow swish ─────────────────────────────────────────────────────────
const CRAW_ARROW_URL = 'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1778004343/djartmusic-arrow-swish_03-306040_l1k0lo.mp3';

// ── Singleton refs ────────────────────────────────────────────────────────────
const _btnRef        = { current: null as HTMLAudioElement | null };
const _cardRef       = { current: null as HTMLAudioElement | null };
const _backRef       = { current: null as HTMLAudioElement | null };
const _startBatRef   = { current: null as HTMLAudioElement | null };
const _lucasAtkRef   = { current: null as HTMLAudioElement | null };
const _bulletRef     = { current: null as HTMLAudioElement | null };
const _healRef       = { current: null as HTMLAudioElement | null };
const _waterRef      = { current: null as HTMLAudioElement | null };
const _shieldRef     = { current: null as HTMLAudioElement | null };
const _punchRef      = { current: null as HTMLAudioElement | null };
const _battleBgmRef  = { current: null as HTMLAudioElement | null };
const _victoryRef    = { current: null as HTMLAudioElement | null };
const _defeatRef     = { current: null as HTMLAudioElement | null };
const _crawArrowRef  = { current: null as HTMLAudioElement | null };

// ── Helpers ──────────────────────���────────────────────────────────────────────
function _play(ref: { current: HTMLAudioElement | null }, url: string, vol = 0.62) {
  try {
    if (!ref.current) { ref.current = new Audio(url); ref.current.volume = vol; }
    ref.current.currentTime = 0;
    ref.current.play().catch(() => {});
  } catch (_) {}
}

/** Clone-play: allows rapid overlapping hits on the same sound. */
function _clonePlay(ref: { current: HTMLAudioElement | null }, url: string, vol = 0.60) {
  try {
    if (!ref.current) { ref.current = new Audio(url); ref.current.volume = vol; }
    const clone = ref.current.cloneNode() as HTMLAudioElement;
    clone.volume = vol;
    clone.play().catch(() => {});
  } catch (_) {}
}

// ── Public API ────────────────────────────────────────────────────────────────
export function playBtnSound():         void { _play(_btnRef,      BTN_URL,          0.62); }
export function playCardSound():        void { _play(_cardRef,     CARD_URL,         0.65); }
export function playBackSound():        void { _play(_backRef,     BACK_URL,         0.58); }
export function playStartBattleSound(): void { _play(_startBatRef, START_BATTLE_URL, 0.72); }

/** Lucas attack SFX — cloned so 3× ULT hits can overlap. */
export function playLucasAttackSfx(): void { _clonePlay(_lucasAtkRef, LUCAS_ATTACK_URL, 0.55); }

/** Ranged basic attack (Emma, Acid Slime, Water Slime). */
export function playBulletSfx():  void { _clonePlay(_bulletRef, BULLET_URL, 0.60); }
/** Emma SK1 / ULT heal magic. */
export function playHealSfx():    void { _play(_healRef,   HEAL_URL,   0.65); }
/** Acid/Water Slime skills (SK1/SK2/ULT). */
export function playWaterSfx():   void { _clonePlay(_waterRef, WATER_URL, 0.60); }
/** Emma SK2 + passive, RockSlime SK2 + ULT. */
export function playShieldSfx():  void { _play(_shieldRef, SHIELD_URL, 0.62); }
/** RockSlime basic + SK1. */
export function playPunchSfx():   void { _clonePlay(_punchRef, PUNCH_URL, 0.65); }

/** Craw arrow swish — cloned so rapid multi-shots can overlap. */
export function playCrawArrowSfx(): void { _clonePlay(_crawArrowRef, CRAW_ARROW_URL, 0.62); }

// ── Battle BGM ────────────────────────────────────────────────────────────────
const BGM_VOL = 0.38;

/** Start looping battle BGM from the beginning. */
export function startBattleBgm(): void {
  try {
    if (!_battleBgmRef.current) {
      _battleBgmRef.current = new Audio(BATTLE_BGM_URL);
      _battleBgmRef.current.loop   = true;
      _battleBgmRef.current.volume = BGM_VOL;
    }
    const a = _battleBgmRef.current;
    a.volume      = BGM_VOL;
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch (_) {}
}

/** Fade out and stop battle BGM over `fadeMs` milliseconds. */
export function stopBattleBgm(fadeMs = 400): void {
  const a = _battleBgmRef.current;
  if (!a || a.paused) return;
  if (fadeMs <= 0) {
    a.pause();
    a.currentTime = 0;
    return;
  }
  const startVol  = a.volume;
  const startTime = performance.now();
  const tick = () => {
    const t = Math.min((performance.now() - startTime) / fadeMs, 1);
    a.volume = startVol * (1 - t);
    if (t < 1) { requestAnimationFrame(tick); }
    else { a.pause(); a.currentTime = 0; a.volume = BGM_VOL; }
  };
  requestAnimationFrame(tick);
}

/** Victory jingle — plays once. */
export function playVictorySound(): void { _play(_victoryRef, VICTORY_URL, 0.70); }

/** Defeat jingle — plays once. */
export function playDefeatSound():  void { _play(_defeatRef,  DEFEAT_URL,  0.62); }