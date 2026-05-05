import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

// Cloudinary audio URL with f_auto,q_auto optimisation
const BGM_URL =
  'https://res.cloudinary.com/dhkethrmc/video/upload/f_auto,q_auto/v1777048768/tunetank-medieval-happy-music-412790_egkmpv.mp3';

// Routes on which BGM must be silent
const SILENT_PREFIXES = ['/login', '/register', '/loading', '/splash', '/intro'];

// ── Singleton Audio instance ──────────────────────────────────────────────────
let _audio: HTMLAudioElement | null = null;
let _bgmAllowed  = false;
let _bgmEnabled  = true;
let _bgmVolume   = 45; // 0–100 integer, step 10

function getAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio(BGM_URL);
    _audio.loop    = true;
    _audio.volume  = _bgmVolume / 100;
    _audio.preload = 'auto';
  }
  return _audio;
}

// ── Preload only (call from LoadingPage) ──────────────────────────────────────
export function preloadBgm(): void {
  getAudio().load();
}

// ── Fade helpers ────────────────────────────────────────────────────���─────────
const FADE_STEPS = 30;
const FADE_MS    = 800;

function fadeIn(audio: HTMLAudioElement) {
  const targetVol = _bgmVolume / 100;
  audio.volume = 0;
  audio.play().catch(() => {/* blocked */});
  const step     = targetVol / FADE_STEPS;
  const interval = FADE_MS / FADE_STEPS;
  let count = 0;
  const id = setInterval(() => {
    count++;
    audio.volume = Math.min(audio.volume + step, targetVol);
    if (count >= FADE_STEPS) clearInterval(id);
  }, interval);
}

function fadeOut(audio: HTMLAudioElement, cb?: () => void) {
  const startVol = audio.volume;
  const step     = startVol / FADE_STEPS;
  const interval = FADE_MS / FADE_STEPS;
  let count = 0;
  const id = setInterval(() => {
    count++; 
    audio.volume = Math.max(audio.volume - step, 0);
    if (count >= FADE_STEPS) {
      clearInterval(id);
      audio.pause();
      audio.volume = startVol;
      cb?.();
    }
  }, interval);
}

// ── Public: called by IntroPage when user taps ────────────────────────────────
export function startBgm(): void {
  _bgmAllowed = true;
  const audio = getAudio();
  if (audio.paused && _bgmEnabled) fadeIn(audio);
}

/** Pause main BGM (e.g. during battle) */
export function pauseMainBgm(): void {
  const audio = getAudio();
  if (!audio.paused) fadeOut(audio);
}

/** Resume main BGM after battle ends */
export function resumeMainBgm(): void {
  const audio = getAudio();
  if (_bgmAllowed && _bgmEnabled && audio.paused) fadeIn(audio);
}

// ── BGM enabled toggle ────────────────────────────────────────────────────────
export function getBgmEnabled(): boolean {
  return _bgmEnabled;
}
export function setBgmEnabled(v: boolean): void {
  _bgmEnabled = v;
  const audio = getAudio();
  if (v) {
    // Restore: play if allowed and paused
    if (_bgmAllowed && audio.paused) fadeIn(audio);
  } else {
    // Mute: fade out
    if (!audio.paused) fadeOut(audio);
  }
}

// ── BGM volume (0–100, step 10) ───────────────────────────────────────────────
export function getBgmVolume(): number {
  return _bgmVolume;
}
export function setBgmVolume(v: number): void {
  _bgmVolume = Math.max(0, Math.min(100, Math.round(v / 10) * 10));
  const audio = getAudio();
  if (!audio.paused) {
    audio.volume = _bgmVolume / 100;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function BgmController() {
  const { pathname } = useLocation();
  const prevSilentRef = useRef<boolean | null>(null);

  useEffect(() => {
    const audio    = getAudio();
    const isSilent = SILENT_PREFIXES.some(p => pathname.startsWith(p));

    if (prevSilentRef.current === isSilent) return;
    prevSilentRef.current = isSilent;

    if (isSilent) {
      if (!audio.paused) fadeOut(audio);
      if (pathname.startsWith('/loading') || pathname.startsWith('/login') || pathname.startsWith('/register')) {
        _bgmAllowed = false;
      }
    } else {
      if (_bgmAllowed && _bgmEnabled && audio.paused) {
        fadeIn(audio);
      }
    }
  }, [pathname]);

  return null;
}