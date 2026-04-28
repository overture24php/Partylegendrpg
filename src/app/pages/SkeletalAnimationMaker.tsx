/**
 * SkeletalAnimationMaker — 2D skeletal animation tool.
 * - Load 6 body parts via Cloudinary URL (chroma key auto-applied)
 * - Drag parts on canvas, set pivot/rotation/scale
 * - Keyframe timeline with linear interpolation
 * - Play / loop / export JSON
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { applyChromaKey } from '../utils/chromaKey';

// ─── Constants ────────────────────────────────────────────────────────────────
const CANVAS_W = 420;
const CANVAS_H = 600;

const PART_IDS = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'] as const;
type PartId = typeof PART_IDS[number];

const PART_META: Record<PartId, {
  label: string; color: string;
  defaultX: number; defaultY: number; defaultZ: number;
  defaultPivotX: number; defaultPivotY: number;
  phW: number; phH: number;
}> = {
  head:     { label: 'Head',      color: '#60a5fa', defaultX: 210, defaultY: 90,  defaultZ: 5, defaultPivotX: 0.5, defaultPivotY: 0.5, phW: 70,  phH: 80  },
  body:     { label: 'Body',      color: '#4ade80', defaultX: 210, defaultY: 250, defaultZ: 4, defaultPivotX: 0.5, defaultPivotY: 0.2, phW: 90,  phH: 120 },
  rightArm: { label: 'Right Arm', color: '#fb923c', defaultX: 130, defaultY: 200, defaultZ: 3, defaultPivotX: 0.5, defaultPivotY: 0.05, phW: 50, phH: 100 },
  leftArm:  { label: 'Left Arm',  color: '#f472b6', defaultX: 290, defaultY: 200, defaultZ: 6, defaultPivotX: 0.5, defaultPivotY: 0.05, phW: 50, phH: 100 },
  rightLeg: { label: 'Right Leg', color: '#a78bfa', defaultX: 180, defaultY: 400, defaultZ: 2, defaultPivotX: 0.5, defaultPivotY: 0.05, phW: 50, phH: 110 },
  leftLeg:  { label: 'Left Leg',  color: '#38bdf8', defaultX: 240, defaultY: 400, defaultZ: 1, defaultPivotX: 0.5, defaultPivotY: 0.05, phW: 50, phH: 110 },
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface PartTransform {
  x: number; y: number;
  rotation: number;
  scaleX: number; scaleY: number;
  pivotX: number; pivotY: number;
  visible: boolean; zOrder: number;
}

interface Keyframe {
  id: string;
  time: number; // ms
  transforms: Record<PartId, PartTransform>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function defaultTransforms(): Record<PartId, PartTransform> {
  const r = {} as Record<PartId, PartTransform>;
  for (const id of PART_IDS) {
    const m = PART_META[id];
    r[id] = {
      x: m.defaultX, y: m.defaultY,
      rotation: 0, scaleX: 1, scaleY: 1,
      pivotX: m.defaultPivotX, pivotY: m.defaultPivotY,
      visible: true, zOrder: m.defaultZ,
    };
  }
  return r;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * t;
}

function lerpTransform(a: PartTransform, b: PartTransform, t: number): PartTransform {
  return {
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
    rotation: lerpAngle(a.rotation, b.rotation, t),
    scaleX: lerp(a.scaleX, b.scaleX, t), scaleY: lerp(a.scaleY, b.scaleY, t),
    pivotX: a.pivotX, pivotY: a.pivotY,
    visible: t < 0.5 ? a.visible : b.visible, zOrder: a.zOrder,
  };
}

function getTransformsAtTime(
  kfs: Keyframe[], time: number,
  fallback: Record<PartId, PartTransform>,
): Record<PartId, PartTransform> {
  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  if (!sorted.length) return fallback;
  if (time <= sorted[0].time) return sorted[0].transforms;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.transforms;
  for (let i = 0; i < sorted.length - 1; i++) {
    const k0 = sorted[i], k1 = sorted[i + 1];
    if (time >= k0.time && time <= k1.time) {
      const t = (time - k0.time) / (k1.time - k0.time);
      const res = {} as Record<PartId, PartTransform>;
      for (const pid of PART_IDS) res[pid] = lerpTransform(k0.transforms[pid], k1.transforms[pid], t);
      return res;
    }
  }
  return fallback;
}

function normalizeCloudinaryUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  if (/\/upload\/(f_|e_|c_)/.test(url)) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}

async function loadPartImage(url: string, useChroma: boolean): Promise<HTMLCanvasElement | null> {
  const src = normalizeCloudinaryUrl(url.trim());
  if (!src) return null;
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = img.naturalWidth; off.height = img.naturalHeight;
      const ctx = off.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      if (useChroma) {
        const id = ctx.getImageData(0, 0, off.width, off.height);
        applyChromaKey(id.data);
        ctx.putImageData(id, 0, 0);
      }
      resolve(off);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function hitTest(cx: number, cy: number, t: PartTransform, W: number, H: number): boolean {
  const dx = cx - t.x, dy = cy - t.y;
  const ang = -t.rotation * Math.PI / 180;
  const lx = (dx * Math.cos(ang) - dy * Math.sin(ang)) / (t.scaleX || 1);
  const ly = (dx * Math.sin(ang) + dy * Math.cos(ang)) / (t.scaleY || 1);
  const px = W * t.pivotX, py = H * t.pivotY;
  return lx >= -px && lx <= W - px && ly >= -py && ly <= H - py;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.round(ms % 1000);
  return `${s.toString().padStart(2, '0')}:${m.toString().padStart(3, '0')}`;
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const sz = 16;
  for (let y = 0; y < H; y += sz) {
    for (let x = 0; x < W; x += sz) {
      ctx.fillStyle = (Math.floor(x / sz) + Math.floor(y / sz)) % 2 === 0 ? '#3a3a3a' : '#2a2a2a';
      ctx.fillRect(x, y, Math.min(sz, W - x), Math.min(sz, H - y));
    }
  }
}

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

// ─── Slider Row ───────────────────────────────────────────────────────────────
function SliderRow({
  label, value, min, max, step, color, fmt,
  onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  color: string; fmt: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: '8px', letterSpacing: '0.14em', fontFamily: "'Cinzel',serif" }}>{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '9px', fontFamily: 'monospace' }}>{fmt(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SkeletalAnimationMaker() {

  // Part state
  const [urls, setUrls]             = useState<Record<PartId, string>>(PART_IDS.reduce((a, id) => ({ ...a, [id]: '' }), {} as Record<PartId, string>));
  const [partImages, setPartImages] = useState<Record<PartId, HTMLCanvasElement | null>>(PART_IDS.reduce((a, id) => ({ ...a, [id]: null }), {} as Record<PartId, HTMLCanvasElement | null>));
  const [loadingPart, setLoadingPart] = useState<Partial<Record<PartId, boolean>>>({});
  const [loadError, setLoadError]     = useState<Partial<Record<PartId, boolean>>>({});
  const [chromaEnabled, setChromaEnabled] = useState(true);

  // Pose state
  const [transforms, setTransforms]     = useState<Record<PartId, PartTransform>>(defaultTransforms);
  const [selectedPartId, setSelectedPartId] = useState<PartId | null>(null);

  // Keyframe state
  const [keyframes, setKeyframes]     = useState<Keyframe[]>([]);
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(3000);
  const [isLooping, setIsLooping]     = useState(true);

  // View state
  const [bgMode, setBgMode]       = useState<'checker' | 'dark' | 'black' | 'white'>('dark');
  const [showGrid, setShowGrid]   = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Refs — kept in sync so RAF loop doesn't capture stale closures
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const dragRef             = useRef<{ partId: PartId; ox: number; oy: number } | null>(null);
  const rafRef              = useRef<number | null>(null);
  const isPlayingRef        = useRef(false);
  const keyframesRef        = useRef(keyframes);
  const durationRef         = useRef(duration);
  const isLoopingRef        = useRef(isLooping);
  const transformsRef       = useRef(transforms);
  const partImagesRef       = useRef(partImages);
  const selectedPartIdRef   = useRef(selectedPartId);
  const bgModeRef           = useRef(bgMode);
  const showGridRef         = useRef(showGrid);

  useEffect(() => { keyframesRef.current    = keyframes;     }, [keyframes]);
  useEffect(() => { durationRef.current     = duration;      }, [duration]);
  useEffect(() => { isLoopingRef.current    = isLooping;     }, [isLooping]);
  useEffect(() => { transformsRef.current   = transforms;    }, [transforms]);
  useEffect(() => { partImagesRef.current   = partImages;    }, [partImages]);
  useEffect(() => { selectedPartIdRef.current = selectedPartId; }, [selectedPartId]);
  useEffect(() => { bgModeRef.current       = bgMode;        }, [bgMode]);
  useEffect(() => { showGridRef.current     = showGrid;      }, [showGrid]);

  // ── Canvas rendering ────────────────────────────────────────────────────────
  const renderFrame = useCallback((t: Record<PartId, PartTransform>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = CANVAS_W, H = CANVAS_H;

    // Background
    const bg = bgModeRef.current;
    if (bg === 'checker') drawCheckerboard(ctx, W, H);
    else {
      ctx.fillStyle = bg === 'dark' ? '#111827' : bg === 'black' ? '#000' : '#fff';
      ctx.fillRect(0, 0, W, H);
    }

    // Grid
    if (showGridRef.current) {
      const gStep = 40;
      ctx.strokeStyle = 'rgba(255,220,80,0.15)';
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += gStep) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y <= H; y += gStep) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      // Center cross
      ctx.strokeStyle = 'rgba(239,68,68,0.35)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
      ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const imgs  = partImagesRef.current;
    const selId = selectedPartIdRef.current;
    const sorted = [...PART_IDS].sort((a, b) => t[a].zOrder - t[b].zOrder);

    for (const pid of sorted) {
      const tf   = t[pid];
      if (!tf.visible) continue;
      const img  = imgs[pid];
      const meta = PART_META[pid];
      const iW   = img ? img.width  : meta.phW;
      const iH   = img ? img.height : meta.phH;
      const pX   = iW * tf.pivotX;
      const pY   = iH * tf.pivotY;

      ctx.save();
      ctx.translate(tf.x, tf.y);
      ctx.rotate(tf.rotation * Math.PI / 180);
      ctx.scale(tf.scaleX, tf.scaleY);

      if (img) {
        ctx.drawImage(img, -pX, -pY, iW, iH);
      } else {
        // Placeholder rect
        ctx.fillStyle   = meta.color + '1a';
        ctx.strokeStyle = meta.color + '88';
        ctx.lineWidth   = 1.5 / Math.abs(tf.scaleX);
        ctx.setLineDash([5, 3]);
        ctx.fillRect(-pX, -pY, iW, iH);
        ctx.strokeRect(-pX, -pY, iW, iH);
        ctx.setLineDash([]);
        ctx.fillStyle     = meta.color + 'cc';
        ctx.font          = `${Math.round(9 / Math.abs(tf.scaleX))}px monospace`;
        ctx.textAlign     = 'center';
        ctx.textBaseline  = 'middle';
        ctx.fillText(meta.label, -pX + iW / 2, -pY + iH / 2);
      }

      // Selection highlight
      if (pid === selId) {
        const invSx = 1 / Math.abs(tf.scaleX);
        const invSy = 1 / Math.abs(tf.scaleY);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth   = 2 * invSx;
        ctx.setLineDash([6 * invSx, 3 * invSx]);
        ctx.strokeRect(-pX - 4 * invSx, -pY - 4 * invSy, iW + 8 * invSx, iH + 8 * invSy);
        ctx.setLineDash([]);
        // Pivot indicator
        ctx.beginPath();
        ctx.arc(0, 0, 5 * invSx, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = invSx;
        ctx.stroke();
      }

      ctx.restore();
    }
  }, []);

  // Redraw whenever edit state changes
  useEffect(() => {
    if (!isPlaying) renderFrame(transforms);
  }, [transforms, partImages, selectedPartId, bgMode, showGrid, isPlaying, renderFrame]);

  // Initial render on mount
  useEffect(() => { renderFrame(defaultTransforms()); }, []); // eslint-disable-line

  // ── Animation RAF loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    let localTime = currentTime;
    let prevTs    = performance.now();
    isPlayingRef.current = true;

    const loop = (ts: number) => {
      const delta = ts - prevTs;
      prevTs = ts;
      localTime += delta;

      const dur = durationRef.current;
      const kfs = keyframesRef.current;

      if (localTime >= dur) {
        if (isLoopingRef.current) {
          localTime = localTime % dur;
        } else {
          localTime = dur;
          isPlayingRef.current = false;
          setIsPlaying(false);
          setCurrentTime(dur);
          renderFrame(getTransformsAtTime(kfs, dur, transformsRef.current));
          return;
        }
      }

      setCurrentTime(localTime);
      renderFrame(getTransformsAtTime(kfs, localTime, transformsRef.current));

      if (isPlayingRef.current) rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      isPlayingRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, renderFrame]);

  // ── Part loading ────────────────────────────────────────────────────────────
  const handleLoad = useCallback(async (pid: PartId) => {
    const url = urls[pid];
    if (!url.trim()) return;
    setLoadingPart(p => ({ ...p, [pid]: true }));
    setLoadError(p => ({ ...p, [pid]: false }));
    const img = await loadPartImage(url, chromaEnabled);
    setLoadingPart(p => ({ ...p, [pid]: false }));
    if (!img) { setLoadError(p => ({ ...p, [pid]: true })); return; }
    setPartImages(p => ({ ...p, [pid]: img }));
  }, [urls, chromaEnabled]);

  const handleLoadAll = useCallback(() => {
    PART_IDS.forEach(pid => { if (urls[pid].trim()) handleLoad(pid); });
  }, [urls, handleLoad]);

  // ── Canvas mouse events ─────────────────────────────────────────────────────
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top)  * (CANVAS_H / rect.height),
    };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    const { x, y } = getCanvasCoords(e);
    const sorted = [...PART_IDS].sort((a, b) => transforms[b].zOrder - transforms[a].zOrder);
    for (const pid of sorted) {
      const tf = transforms[pid];
      if (!tf.visible) continue;
      const img = partImages[pid];
      const iW = img ? img.width  : PART_META[pid].phW;
      const iH = img ? img.height : PART_META[pid].phH;
      if (hitTest(x, y, tf, iW, iH)) {
        setSelectedPartId(pid);
        dragRef.current = { partId: pid, ox: x - tf.x, oy: y - tf.y };
        e.preventDefault();
        return;
      }
    }
    setSelectedPartId(null);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || isPlaying) return;
    const { x, y } = getCanvasCoords(e);
    const { partId, ox, oy } = dragRef.current;
    setTransforms(prev => ({ ...prev, [partId]: { ...prev[partId], x: Math.round(x - ox), y: Math.round(y - oy) } }));
  };

  const onMouseUp = () => { dragRef.current = null; };

  // ── Keyframe operations ─────────────────────────────────────────────────────
  const addKeyframe = () => {
    const id  = `kf_${Date.now()}`;
    const kf: Keyframe = { id, time: Math.round(currentTime), transforms: deepClone(transforms) };
    setKeyframes(prev => [...prev.filter(k => Math.abs(k.time - currentTime) > 5), kf].sort((a, b) => a.time - b.time));
    setSelectedKfId(id);
  };

  const deleteKeyframe = () => {
    if (!selectedKfId) return;
    setKeyframes(prev => prev.filter(k => k.id !== selectedKfId));
    setSelectedKfId(null);
  };

  const selectKeyframe = (kf: Keyframe) => {
    if (isPlaying) return;
    setSelectedKfId(kf.id);
    setCurrentTime(kf.time);
    setTransforms(deepClone(kf.transforms));
  };

  const updateSelectedKf = () => {
    if (!selectedKfId) return;
    setKeyframes(prev => prev.map(k => k.id === selectedKfId ? { ...k, transforms: deepClone(transforms) } : k));
  };

  // ── Transform update helpers ────────────────────────────────────────────────
  const updT = (pid: PartId, key: keyof PartTransform, val: number | boolean) =>
    setTransforms(prev => ({ ...prev, [pid]: { ...prev[pid], [key]: val } }));

  const moveZ = (pid: PartId, dir: 1 | -1) =>
    setTransforms(prev => ({ ...prev, [pid]: { ...prev[pid], zOrder: Math.max(1, Math.min(6, prev[pid].zOrder + dir)) } }));

  // ── Timeline scrubber ───────────────────────────────────────────────────────
  const onTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t    = Math.round(pct * duration);
    setCurrentTime(t);
    if (keyframes.length > 0) setTransforms(getTransformsAtTime(keyframes, t, transforms));
  };

  // ── Playback ────────────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (keyframes.length === 0) return;
    if (!isPlaying && currentTime >= duration) setCurrentTime(0);
    setIsPlaying(v => !v);
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (keyframes.length > 0) setTransforms(getTransformsAtTime(keyframes, 0, transforms));
  };

  // ── Export JSON ─────────────────────────────────────────────────────────────
  const exportJson = () => {
    const data = JSON.stringify({ duration, keyframes: [...keyframes].sort((a, b) => a.time - b.time) }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'skeletal_animation.json';
    a.click();
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const sel  = selectedPartId;
  const selT = sel ? transforms[sel] : null;

  const BG_BTN = (mode: typeof bgMode, label: string) => (
    <button key={mode} onClick={() => setBgMode(mode)} style={{
      flex: '1 1 40%', background: bgMode === mode ? 'rgba(255,215,0,0.18)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${bgMode === mode ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '4px', padding: '4px 2px', color: bgMode === mode ? '#FFD700' : 'rgba(255,255,255,0.35)',
      cursor: 'pointer', fontSize: '8px', letterSpacing: '0.1em', fontFamily: "'Cinzel',serif",
    }}>{label}</button>
  );

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#08080f', overflow: 'hidden', fontFamily: "'Cinzel', serif" }}>

      {/* ══════════ HEADER ══════════ */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '50px', zIndex: 100,
        background: 'rgba(0,0,0,0.75)', borderBottom: '1px solid rgba(255,215,0,0.18)',
        backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 14px',
      }}>
        <button onClick={() => window.history.back()} style={{
          background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.28)',
          borderRadius: '5px', padding: '4px 11px', color: '#FFD700', cursor: 'pointer',
          fontSize: '10px', letterSpacing: '0.1em', flexShrink: 0,
        }}>← BACK</button>

        <span style={{ flex: 1, textAlign: 'center', color: '#FFD700', fontSize: 'clamp(10px,1.3vw,17px)', fontWeight: 800, letterSpacing: '0.22em', textShadow: '0 0 18px rgba(255,215,0,0.45)' }}>
          SKELETAL ANIMATION MAKER
        </span>

        {[
          { label: `CHROMA ${chromaEnabled ? 'ON' : 'OFF'}`,  active: chromaEnabled, color: '#4ade80', onClick: () => setChromaEnabled(v => !v) },
          { label: 'GRID',   active: showGrid,    color: '#FFD700', onClick: () => setShowGrid(v => !v) },
        ].map(({ label, active, color, onClick }) => (
          <button key={label} onClick={onClick} style={{
            background: active ? color + '1a' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${active ? color + '55' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: '5px', padding: '4px 10px', color: active ? color : 'rgba(255,255,255,0.35)',
            cursor: 'pointer', fontSize: '9px', letterSpacing: '0.1em', flexShrink: 0,
          }}>{label}</button>
        ))}

        <button onClick={exportJson} style={{
          background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.35)',
          borderRadius: '5px', padding: '4px 12px', color: '#FFD700', cursor: 'pointer',
          fontSize: '9px', letterSpacing: '0.12em', flexShrink: 0,
        }}>↓ EXPORT JSON</button>

        <button onClick={() => setShowTutorial(true)} style={{
          background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.35)',
          borderRadius: '5px', padding: '4px 12px', color: '#60a5fa', cursor: 'pointer',
          fontSize: '9px', letterSpacing: '0.12em', flexShrink: 0,
        }}>? TUTORIAL</button>
      </div>

      {/* ══════════ LEFT PANEL — Part Assets ══════════ */}
      <div style={{
        position: 'absolute', top: '50px', left: 0, bottom: '185px', width: '256px', zIndex: 10,
        background: 'rgba(0,0,0,0.55)', borderRight: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,215,0,0.65)', fontSize: '8px', letterSpacing: '0.22em', fontWeight: 700 }}>PART ASSETS</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {PART_IDS.map(pid => {
            const meta     = PART_META[pid];
            const isLoaded = !!partImages[pid];
            const isLoad   = !!loadingPart[pid];
            const hasErr   = !!loadError[pid];
            return (
              <div key={pid} style={{
                marginBottom: '8px', background: 'rgba(255,255,255,0.02)',
                borderRadius: '6px', padding: '7px 8px',
                border: `1px solid ${isLoaded ? meta.color + '33' : hasErr ? '#ef444433' : 'rgba(255,255,255,0.05)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: isLoaded ? meta.color : 'rgba(255,255,255,0.15)', flexShrink: 0, boxShadow: isLoaded ? `0 0 6px ${meta.color}` : 'none' }}/>
                  <span style={{ color: isLoaded ? meta.color : 'rgba(255,255,255,0.4)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', flex: 1 }}>{meta.label.toUpperCase()}</span>
                  <button onClick={() => updT(pid, 'visible', !transforms[pid].visible)} title="Toggle visibility"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '11px', opacity: transforms[pid].visible ? 1 : 0.35 }}>
                    {transforms[pid].visible ? '◉' : '○'}
                  </button>
                  <button onClick={() => setSelectedPartId(pid === selectedPartId ? null : pid)}
                    style={{ background: pid === selectedPartId ? meta.color + '22' : 'none', border: `1px solid ${pid === selectedPartId ? meta.color + '55' : 'transparent'}`, borderRadius: '3px', color: meta.color, cursor: 'pointer', padding: '1px 5px', fontSize: '8px', letterSpacing: '0.06em' }}>
                    SEL
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    value={urls[pid]}
                    onChange={e => setUrls(p => ({ ...p, [pid]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleLoad(pid)}
                    placeholder="Paste Cloudinary URL…"
                    style={{
                      flex: 1, background: 'rgba(0,0,0,0.45)', borderRadius: '4px', padding: '4px 6px',
                      color: '#fff', fontSize: '7.5px', fontFamily: 'monospace', outline: 'none',
                      border: `1px solid ${hasErr ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  />
                  <button onClick={() => handleLoad(pid)} disabled={!urls[pid].trim() || isLoad}
                    style={{
                      background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.28)',
                      borderRadius: '4px', padding: '4px 7px', color: '#FFD700', cursor: 'pointer',
                      fontSize: '8px', letterSpacing: '0.06em', opacity: (!urls[pid].trim() || isLoad) ? 0.35 : 1,
                    }}>{isLoad ? '…' : 'LOAD'}</button>
                </div>
                {hasErr && <div style={{ marginTop: '3px', color: '#ef4444', fontSize: '7px', fontFamily: 'monospace' }}>⚠ Load failed — check URL / CORS</div>}
              </div>
            );
          })}
        </div>

        {/* Footer — Load All + BG mode */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <button onClick={handleLoadAll} style={{
            width: '100%', background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.35)',
            borderRadius: '6px', padding: '7px', color: '#FFD700', cursor: 'pointer',
            fontSize: '9px', letterSpacing: '0.16em', fontFamily: "'Cinzel',serif", fontWeight: 700, marginBottom: '8px',
          }}>⚡ LOAD ALL PARTS</button>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {BG_BTN('dark',    'DARK')}
            {BG_BTN('checker', 'CHECKER')}
            {BG_BTN('black',   'BLACK')}
            {BG_BTN('white',   'WHITE')}
          </div>
          <div style={{ marginTop: '6px', display: 'flex', gap: '4px' }}>
            <button onClick={() => { setTransforms(defaultTransforms()); setSelectedPartId(null); }} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px', padding: '5px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '8px', letterSpacing: '0.08em',
            }}>RESET POSE</button>
          </div>
        </div>
      </div>

      {/* ══════════ CENTER — Canvas ══════════ */}
      <div style={{
        position: 'absolute', top: '50px', left: '256px', right: '256px', bottom: '185px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.25)', padding: '8px',
      }}>
        <div style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}`, maxWidth: '100%', maxHeight: '100%', position: 'relative', flexShrink: 0 }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W} height={CANVAS_H}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{
              display: 'block', width: '100%', height: '100%',
              cursor: isPlaying ? 'default' : dragRef.current ? 'grabbing' : 'crosshair',
              border: '1px solid rgba(255,215,0,0.18)',
              boxShadow: '0 0 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)',
            }}
          />
          {/* Canvas size label */}
          <div style={{
            position: 'absolute', bottom: '-20px', left: '50%', transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.2)', fontSize: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap',
          }}>{CANVAS_W} × {CANVAS_H} px</div>
        </div>
      </div>

      {/* ══════════ RIGHT PANEL — Transform Controls ══════════ */}
      <div style={{
        position: 'absolute', top: '50px', right: 0, bottom: '185px', width: '256px', zIndex: 10,
        background: 'rgba(0,0,0,0.55)', borderLeft: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,215,0,0.65)', fontSize: '8px', letterSpacing: '0.22em', fontWeight: 700 }}>TRANSFORM</span>
          {sel && <span style={{ color: PART_META[sel].color, fontSize: '8px', letterSpacing: '0.12em' }}>{PART_META[sel].label.toUpperCase()}</span>}
        </div>

        {!sel ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '20px' }}>
            <svg viewBox="0 0 48 48" style={{ width: '40px', height: '40px', opacity: 0.15 }}>
              <circle cx="24" cy="24" r="20" stroke="#FFD700" strokeWidth="2" fill="none"/>
              <path d="M16 24 L32 24 M24 16 L24 32" stroke="#FFD700" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px', letterSpacing: '0.12em', textAlign: 'center' }}>Click a part on<br/>the canvas to select</span>
          </div>
        ) : selT ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {/* Quick part selector */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '12px' }}>
              {PART_IDS.map(pid => (
                <button key={pid} onClick={() => setSelectedPartId(pid)} style={{
                  background: sel === pid ? PART_META[pid].color + '22' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${sel === pid ? PART_META[pid].color + '66' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '4px', padding: '3px 5px', color: sel === pid ? PART_META[pid].color : 'rgba(255,255,255,0.3)',
                  cursor: 'pointer', fontSize: '7px', letterSpacing: '0.07em',
                }}>{PART_META[pid].label.split(' ').map(w => w[0]).join('.')}</button>
              ))}
            </div>

            <SliderRow label="POS X"    value={selT.x}        min={-50} max={CANVAS_W + 50} step={1}    color={PART_META[sel].color} fmt={v => `${v.toFixed(0)}px`}  onChange={v => updT(sel, 'x', v)} />
            <SliderRow label="POS Y"    value={selT.y}        min={-50} max={CANVAS_H + 50} step={1}    color={PART_META[sel].color} fmt={v => `${v.toFixed(0)}px`}  onChange={v => updT(sel, 'y', v)} />
            <SliderRow label="ROTATION" value={selT.rotation} min={-180} max={180}          step={0.5}  color={PART_META[sel].color} fmt={v => `${v.toFixed(1)}°`}   onChange={v => updT(sel, 'rotation', v)} />
            <SliderRow label="SCALE X"  value={selT.scaleX}   min={-3}   max={3}            step={0.01} color={PART_META[sel].color} fmt={v => v.toFixed(2)}         onChange={v => updT(sel, 'scaleX', v)} />
            <SliderRow label="SCALE Y"  value={selT.scaleY}   min={-3}   max={3}            step={0.01} color={PART_META[sel].color} fmt={v => v.toFixed(2)}         onChange={v => updT(sel, 'scaleY', v)} />

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '8px 0' }}/>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '7px', letterSpacing: '0.2em', marginBottom: '6px' }}>PIVOT (rotation origin)</div>
            <SliderRow label="PIVOT X"  value={selT.pivotX}   min={0}    max={1}            step={0.01} color="#a78bfa" fmt={v => `${(v * 100).toFixed(0)}%`}       onChange={v => updT(sel, 'pivotX', v)} />
            <SliderRow label="PIVOT Y"  value={selT.pivotY}   min={0}    max={1}            step={0.01} color="#a78bfa" fmt={v => `${(v * 100).toFixed(0)}%`}       onChange={v => updT(sel, 'pivotY', v)} />

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '8px 0' }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '8px', letterSpacing: '0.14em', flex: 1 }}>Z-ORDER</span>
              <button onClick={() => moveZ(sel, -1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', padding: '2px 9px', color: '#fff', cursor: 'pointer', fontSize: '13px' }}>↓</button>
              <span style={{ color: '#FFD700', fontSize: '12px', fontFamily: 'monospace', minWidth: '18px', textAlign: 'center' }}>{selT.zOrder}</span>
              <button onClick={() => moveZ(sel, 1)}  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', padding: '2px 9px', color: '#fff', cursor: 'pointer', fontSize: '13px' }}>↑</button>
            </div>

            {selectedKfId && (
              <button onClick={updateSelectedKf} style={{
                width: '100%', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.28)',
                borderRadius: '5px', padding: '6px', color: '#FFD700', cursor: 'pointer',
                fontSize: '8px', letterSpacing: '0.14em', marginBottom: '5px',
              }}>↺ UPDATE KEYFRAME POSE</button>
            )}

            <button onClick={() => setTransforms(p => ({ ...p, [sel]: deepClone(defaultTransforms()[sel]) }))} style={{
              width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '5px', padding: '6px', color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
              fontSize: '8px', letterSpacing: '0.12em',
            }}>RESET PART TO DEFAULT</button>
          </div>
        ) : null}
      </div>

      {/* ══════════ BOTTOM — Timeline ══════════ */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '185px', zIndex: 10,
        background: 'rgba(0,0,0,0.7)', borderTop: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Controls row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          <button onClick={addKeyframe} style={{
            background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)',
            borderRadius: '5px', padding: '4px 10px', color: '#4ade80', cursor: 'pointer',
            fontSize: '9px', letterSpacing: '0.1em', whiteSpace: 'nowrap',
          }}>+ ADD KF</button>

          <button onClick={deleteKeyframe} disabled={!selectedKfId} style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)',
            borderRadius: '5px', padding: '4px 10px', color: '#ef4444', cursor: 'pointer',
            fontSize: '9px', letterSpacing: '0.1em', opacity: selectedKfId ? 1 : 0.35, whiteSpace: 'nowrap',
          }}>✕ DEL KF</button>

          <div style={{ width: '1px', height: '26px', background: 'rgba(255,255,255,0.1)' }}/>

          <button onClick={stopPlayback} style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '5px', padding: '4px 12px', color: '#fff', cursor: 'pointer', fontSize: '13px',
          }}>■</button>

          <button onClick={togglePlay} disabled={keyframes.length === 0} style={{
            background: isPlaying ? 'rgba(255,215,0,0.18)' : 'rgba(255,215,0,0.1)',
            border: `1px solid ${isPlaying ? 'rgba(255,215,0,0.55)' : 'rgba(255,215,0,0.28)'}`,
            borderRadius: '5px', padding: '4px 16px', color: '#FFD700', cursor: 'pointer',
            fontSize: '13px', opacity: keyframes.length === 0 ? 0.35 : 1,
          }}>{isPlaying ? '⏸' : '▶'}</button>

          <button onClick={() => setIsLooping(v => !v)} style={{
            background: isLooping ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isLooping ? 'rgba(96,165,250,0.45)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '5px', padding: '4px 10px', color: isLooping ? '#60a5fa' : 'rgba(255,255,255,0.3)',
            cursor: 'pointer', fontSize: '9px', letterSpacing: '0.1em',
          }}>↺ LOOP</button>

          <div style={{ width: '1px', height: '26px', background: 'rgba(255,255,255,0.1)' }}/>

          <span style={{ color: '#FFD700', fontFamily: 'monospace', fontSize: '12px', letterSpacing: '0.06em', minWidth: '112px' }}>
            {fmtTime(Math.round(currentTime))} / {fmtTime(duration)}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }}>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '8px', letterSpacing: '0.1em' }}>DURATION</span>
            <input type="number" min={500} max={30000} step={500} value={duration}
              onChange={e => setDuration(Math.max(500, parseInt(e.target.value) || 3000))}
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', padding: '3px 6px', color: '#fff', fontSize: '10px', fontFamily: 'monospace', width: '68px', outline: 'none', textAlign: 'center' }}
            />
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '8px' }}>ms</span>
          </div>

          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '8px', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
            {keyframes.length} KF{keyframes.length !== 1 ? 'S' : ''}
          </span>
        </div>

        {/* Scrubber track */}
        <div style={{ flex: 1, padding: '8px 14px 4px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {/* Part color strip */}
          <div style={{ display: 'flex', gap: '3px', height: '4px' }}>
            {PART_IDS.map(pid => (
              <div key={pid} style={{ flex: 1, borderRadius: '2px', background: partImages[pid] ? PART_META[pid].color + '70' : 'rgba(255,255,255,0.06)' }}/>
            ))}
          </div>

          {/* Main scrubber */}
          <div
            onClick={onTimelineClick}
            style={{
              position: 'relative', height: '44px', background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '5px', cursor: 'pointer', overflow: 'hidden',
            }}
          >
            {/* Tick marks every 500ms */}
            {Array.from({ length: Math.floor(duration / 500) + 1 }, (_, i) => {
              const t = i * 500;
              if (t > duration) return null;
              const pct = (t / duration) * 100;
              const isMajor = i % 2 === 0;
              return (
                <div key={i} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, width: '1px', background: isMajor ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', pointerEvents: 'none' }}>
                  {isMajor && <span style={{ position: 'absolute', top: '3px', left: '2px', color: 'rgba(255,255,255,0.2)', fontSize: '7px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{(t / 1000).toFixed(1)}s</span>}
                </div>
              );
            })}

            {/* Keyframe diamonds */}
            {keyframes.map(kf => {
              const pct   = (kf.time / duration) * 100;
              const isSel = kf.id === selectedKfId;
              return (
                <div key={kf.id}
                  onClick={e => { e.stopPropagation(); selectKeyframe(kf); }}
                  title={`KF @ ${(kf.time / 1000).toFixed(2)}s — click to select`}
                  style={{
                    position: 'absolute', left: `${pct}%`, top: '50%',
                    width: isSel ? '13px' : '9px', height: isSel ? '13px' : '9px',
                    background: isSel ? '#FFD700' : '#b45309',
                    border: `2px solid ${isSel ? '#fff' : '#FFD700'}`,
                    transform: 'translate(-50%, -50%) rotate(45deg)',
                    cursor: 'pointer', zIndex: 5, transition: 'all 0.12s',
                    boxShadow: isSel ? '0 0 10px rgba(255,215,0,0.9)' : '0 0 4px rgba(180,83,9,0.6)',
                  }}
                />
              );
            })}

            {/* Playhead */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: `${(currentTime / duration) * 100}%`,
              width: '2px', background: '#FFD700', transform: 'translateX(-50%)',
              boxShadow: '0 0 8px rgba(255,215,0,0.8)', pointerEvents: 'none', zIndex: 10,
            }}>
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #FFD700' }}/>
            </div>
          </div>

          {/* Keyframe chips */}
          <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '2px' }}>
            {[...keyframes].sort((a, b) => a.time - b.time).map((kf, i) => (
              <button key={kf.id} onClick={() => selectKeyframe(kf)} style={{
                background: kf.id === selectedKfId ? 'rgba(255,215,0,0.16)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${kf.id === selectedKfId ? 'rgba(255,215,0,0.55)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '4px', padding: '3px 9px', cursor: 'pointer', flexShrink: 0,
              }}>
                <span style={{ color: kf.id === selectedKfId ? '#FFD700' : 'rgba(255,255,255,0.35)', fontSize: '8px', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                  KF{i} · {(kf.time / 1000).toFixed(2)}s
                </span>
              </button>
            ))}
            {keyframes.length === 0 && (
              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '8px', letterSpacing: '0.1em', alignSelf: 'center' }}>
                No keyframes yet — pose the character then click + ADD KF
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ TUTORIAL MODAL ══════════ */}
      {showTutorial && (
        <div
          onClick={() => setShowTutorial(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0c0c1e', border: '1px solid rgba(255,215,0,0.22)', borderRadius: '12px',
              padding: '26px 28px', maxWidth: '740px', width: '100%', maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 0 80px rgba(0,0,0,0.9)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <h2 style={{ margin: 0, color: '#FFD700', fontSize: '14px', letterSpacing: '0.22em', fontWeight: 800 }}>
                ◈ SKELETAL ANIMATION MAKER — TUTORIAL
              </h2>
              <button onClick={() => setShowTutorial(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
            </div>

            {([
              {
                step: '01', title: 'LOADING PART IMAGES', color: '#60a5fa',
                body: [
                  'Paste a Cloudinary URL into each body part input on the left panel.',
                  'Click LOAD (or press Enter) to fetch and process the image.',
                  'Use ⚡ LOAD ALL PARTS to load every filled URL at once.',
                  'CHROMA KEY (top bar): when ON, green-screen backgrounds are removed automatically using pixel-level HSV analysis.',
                  'URL auto-fix: if your URL has /upload/ without a transformation chain, f_auto,q_auto is injected automatically.',
                  'On error, check: (1) the URL is correct, (2) your Cloudinary account allows anonymous CORS (it does by default).',
                ],
              },
              {
                step: '02', title: 'CANVAS & PART POSITIONING', color: '#4ade80',
                body: [
                  'Click any part on the canvas to select it — a gold dashed border and a red pivot dot will appear.',
                  'Drag the selected part to reposition it freely on the canvas.',
                  'Parts without an image show colored placeholder outlines so you can still layout the rig.',
                  'Use POS X / POS Y sliders in the right Transform panel for pixel-precise positioning.',
                  'Click GRID (top bar) to show a 40px reference grid and center cross.',
                  'The canvas is 420×600 px — portrait proportions optimized for RPG characters.',
                ],
              },
              {
                step: '03', title: 'ROTATION, SCALE & PIVOT', color: '#fb923c',
                body: [
                  'ROTATION (−180° to +180°): rotates the part around its pivot point (red dot on canvas).',
                  'SCALE X / SCALE Y: resizes the part. Use negative values to mirror/flip.',
                  'PIVOT X / Y: sets where rotation and scaling originate (0% = top-left edge, 50% = center, 100% = bottom-right edge).',
                  'Recommended pivots — Arms: PivotY ≈ 5% (shoulder joint); Legs: PivotY ≈ 5% (hip joint); Head/Body: 50% center.',
                  'The red pivot dot on canvas shows the current rotation origin.',
                ],
              },
              {
                step: '04', title: 'Z-ORDER (LAYER DEPTH)', color: '#a78bfa',
                body: [
                  'Z-Order controls the render layer — higher Z = drawn on top.',
                  'Use ↑ ↓ buttons in the Transform panel to move the selected part up or down in the stack.',
                  'Default order: Left Arm (6) > Head (5) > Body (4) > Right Arm (3) > Right Leg (2) > Left Leg (1).',
                  'For side-facing characters: front limbs should have higher Z than back limbs.',
                  'Tip: body is Z=4, so right arm (Z=3) draws behind the body and left arm (Z=6) draws in front.',
                ],
              },
              {
                step: '05', title: 'CREATING KEYFRAMES', color: '#f472b6',
                body: [
                  'Arrange all parts into the desired pose using the canvas + Transform panel.',
                  'Click + ADD KF in the timeline bar — the current pose is saved at the current time.',
                  'Click on the timeline track to move to a different time (or type a duration and scrub).',
                  'Adjust your pose and click + ADD KF again to add a second keyframe — this defines the animation.',
                  'Click a keyframe diamond (◆) or chip in the timeline to jump to that pose and load it for editing.',
                  'After editing, click ↺ UPDATE KEYFRAME POSE (right panel) to save changes into that keyframe.',
                  'DELETE (DEL KF) removes the currently selected keyframe.',
                ],
              },
              {
                step: '06', title: 'PLAYBACK & PREVIEW', color: '#FFD700',
                body: [
                  'Click ▶ PLAY to preview the animation (requires at least 1 keyframe).',
                  'All transforms between keyframes are linearly interpolated — smooth tweens are automatic.',
                  'Toggle ↺ LOOP to repeat continuously; click ■ STOP to reset to time 0.',
                  'Editing is disabled while playing — pause first to reposition parts.',
                  'DURATION (ms): total length of the animation. Default 3000ms = 3 seconds.',
                  'Click anywhere on the timeline track while paused to jump to any point and preview the interpolated pose.',
                ],
              },
              {
                step: '07', title: 'EXPORTING THE ANIMATION', color: '#38bdf8',
                body: [
                  'Click ↓ EXPORT JSON (top bar) to download skeletal_animation.json.',
                  'JSON structure: { duration: number (ms), keyframes: Keyframe[] }',
                  'Each Keyframe: { id, time (ms), transforms: { head, body, rightArm, leftArm, rightLeg, leftLeg } }',
                  'Each transform: { x, y, rotation, scaleX, scaleY, pivotX, pivotY, visible, zOrder }',
                  'To replay in your game engine: interpolate transforms between keyframes using lerp() for x/y/scale and lerpAngle() for rotation.',
                  'Tip: wrap the diff in [−180, +180] before lerping rotation to prevent 360° spin artifacts.',
                ],
              },
            ] as { step: string; title: string; color: string; body: string[] }[]).map(({ step, title, color, body }) => (
              <div key={step} style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '9px' }}>
                  <span style={{ background: color + '1a', border: `1px solid ${color}44`, borderRadius: '4px', padding: '2px 8px', color, fontSize: '9px', fontWeight: 800, letterSpacing: '0.18em', flexShrink: 0 }}>{step}</span>
                  <span style={{ color, fontSize: '11px', fontWeight: 700, letterSpacing: '0.16em' }}>{title}</span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {body.map((line, i) => (
                    <li key={i} style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', lineHeight: '1.75', marginBottom: '2px', paddingLeft: '14px', position: 'relative', fontFamily: 'system-ui, sans-serif' }}>
                      <span style={{ position: 'absolute', left: 0, color: color + 'bb', fontSize: '10px' }}>›</span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div style={{ marginTop: '10px', padding: '11px 14px', background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.18)', borderRadius: '6px' }}>
              <span style={{ color: 'rgba(255,215,0,0.65)', fontSize: '10px', letterSpacing: '0.1em', fontFamily: 'system-ui, sans-serif' }}>
                💡 Click anywhere outside this panel to close · All transforms persist in browser session · Export JSON to save your work.
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
