import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { CurrencyDebug } from '../components/CurrencyDebug';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getMaxXpForLevel } from '../utils/expSystem';
import type { TranslationKey } from '../i18n/translations';
import { getBgmEnabled, setBgmEnabled, getBgmVolume, setBgmVolume } from '../components/BgmController';

const BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777396811/ChatGPT_Image_Apr_29_2026_12_19_32_AM_squmiv.png';

const COLS = 8;
const ROWS = 12;
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const GRID_COLS = 20;
const GRID_ROWS = 20;

function fmtCurrency(n: number): string {
  if (n >= 2_000_000_000) return '2B+';
  if (n >= 1_000_000_000) {
    const d = Math.floor((n % 1_000_000_000) / 100_000_000);
    return d > 0 ? `1,${d}B` : '1B';
  }
  if (n >= 100_000_000) return `${Math.floor(n / 1_000_000)}M`;
  if (n >= 10_000_000) {
    const major = Math.floor(n / 1_000_000);
    const minor = Math.floor((n % 1_000_000) / 100_000);
    return minor > 0 ? `${major},${minor}M` : `${major}M`;
  }
  if (n >= 1_000_000) {
    const major = Math.floor(n / 1_000_000);
    const minor = Math.floor((n % 1_000_000) / 100_000);
    return minor > 0 ? `${major},${minor}M` : `${major}M`;
  }
  if (n >= 100_000) return `${Math.floor(n / 1_000)}k`;
  if (n >= 10_000) return `${Math.floor(n / 1_000)}k`;
  return n.toLocaleString();
}

function cellCenter(col: string, row: number) {
  const c = COL_LABELS.indexOf(col);
  const r = row - 1;
  return {
    left: ((c + 0.5) / COLS) * 100,
    top:  ((r + 0.5) / ROWS) * 100,
  };
}

const CW = (1 / COLS) * 100;
const CH = (1 / ROWS) * 100;

const ASSETS = [
  { id: 'btn-B8',  left: cellCenter('B',  8).left, top: cellCenter('B',  8).top, labelKey: 'city.arena'       as TranslationKey, route: '/game/arena',   interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-GH5', left: 70,                         top: 45,                       labelKey: 'city.castle'      as TranslationKey, route: '/game/castle',  interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-D10', left: cellCenter('D', 10).left,  top: cellCenter('D', 10).top, labelKey: 'city.guild'       as TranslationKey, route: '/game/guild',   interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-C11', left: 25,                         top: cellCenter('C', 11).top, labelKey: 'city.tavern'      as TranslationKey, route: '/game/tavern',  interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-F10', left: cellCenter('F', 10).left,  top: cellCenter('F', 10).top, labelKey: 'city.market'      as TranslationKey, route: '/game/market',  interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-D5',  left: 45.0,                       top: cellCenter('D',  5).top, labelKey: 'city.tower'       as TranslationKey, route: '/game/tower',   interactive: true, widthCells: 1, heightCells: 0.5 },
  { id: 'btn-A7',  left: 5.0,                         top: 32.5,                     labelKey: 'city.exploration' as TranslationKey, route: '/game/event',   interactive: true, widthCells: 1, heightCells: 0.5 },
];

function getPixelAlpha(imgEl: HTMLImageElement, clientX: number, clientY: number): number {
  try {
    const rect  = imgEl.getBoundingClientRect();
    const natW  = imgEl.naturalWidth;
    const natH  = imgEl.naturalHeight;
    if (!natW || !natH) return 255;
    const scale = Math.min(rect.width / natW, rect.height / natH);
    const rendW = natW * scale;
    const rendH = natH * scale;
    const offX  = (rect.width  - rendW) / 2;
    const offY  = (rect.height - rendH) / 2;
    const imgX  = Math.floor((clientX - rect.left - offX) / scale);
    const imgY  = Math.floor((clientY - rect.top  - offY) / scale);
    if (imgX < 0 || imgX >= natW || imgY < 0 || imgY >= natH) return 0;
    const canvas = document.createElement('canvas');
    canvas.width  = natW;
    canvas.height = natH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 255;
    ctx.drawImage(imgEl, 0, 0);
    return ctx.getImageData(imgX, imgY, 1, 1).data[3];
  } catch {
    return 255;
  }
}

// Draw colours
const COLORS = ['#ff4444', '#ffcc00', '#44ff88', '#44ccff', '#cc44ff', '#ffffff'];


export default function GameStartPage() {
  const containerRef           = useRef<HTMLDivElement>(null);
  const canvasRef              = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef          = useRef<HTMLCanvasElement>(null);
  const adventureBtnRef        = useRef<HTMLDivElement>(null);
  const adventureRafRef        = useRef<number | null>(null);
  const adventurePressStartRef = useRef<number>(0);
  const adventureHoldingRef    = useRef<boolean>(false);
  const imgRefs       = useRef<Map<string, HTMLImageElement>>(new Map());

  const btnDivRefs     = useRef<Map<string, HTMLDivElement>>(new Map());
  const bldgRafRef     = useRef<number | null>(null);
  const bldgPressStart = useRef<number>(0);
  const bldgHolding    = useRef<boolean>(false);
  const bldgPressedId  = useRef<string | null>(null);
  const [drawMode,       setDrawMode]       = useState(false);
  const [showGrid,       setShowGrid]       = useState(false);
  const [color,          setColor]          = useState(COLORS[0]);
  const [lineWidth,      setLineWidth]      = useState(3);
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [bgmEnabled,     setBgmEnabledUI]   = useState(() => getBgmEnabled());
  const [bgmVol,         setBgmVolUI]       = useState(() => getBgmVolume());
  const [selectedCells,  setSelectedCells]  = useState<Set<string>>(new Set());
  const [gridSelectMode, setGridSelectMode] = useState(false);
  const [gridCopied,     setGridCopied]     = useState(false);
  const [bucketMode,     setBucketMode]     = useState(false);

  // ── Server Time (Singapore / Asia/Singapore = UTC+8) ─────────────────────
  const getSGT = () => {
    const now = new Date();
    const sgt = { timeZone: 'Asia/Singapore' } as const;
    const day   = new Intl.DateTimeFormat('en', { ...sgt, day:   '2-digit' }).format(now);
    const month = new Intl.DateTimeFormat('en', { ...sgt, month: 'short'   }).format(now);
    const year  = new Intl.DateTimeFormat('en', { ...sgt, year:  'numeric' }).format(now);
    const time  = new Intl.DateTimeFormat('en', { ...sgt, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    return { date: `${day} ${month} ${year}`, time };
  };
  const [serverTime, setServerTime] = useState(getSGT);
  useEffect(() => {
    const tick = () => setServerTime(getSGT());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Coordinate tracking ──────────────────────────────────────────────────
  type CoordInfo = {
    bbox:    { x: number; y: number; w: number; h: number };
    polygon: string;
  };
  const [coordInfo,   setCoordInfo]   = useState<CoordInfo | null>(null);
  const [copied,      setCopied]      = useState(false);
  const allPoints = useRef<{ px: number; py: number }[]>([]); // % values

  const isDrawing       = useRef(false);
  const lastPos         = useRef<{ x: number; y: number } | null>(null);
  const isGridSelecting = useRef(false);
  const gridDragMode    = useRef<'add' | 'remove'>('add');
  const lastGridKey     = useRef<string | null>(null);

  // ── Grid zoom / pan (stale-closure-safe refs) ─────────────────────────────
  const gridViewRef  = useRef({ zoom: 1, panX: 0, panY: 0 });
  const [gridViewVer, setGridViewVer] = useState(0); // bump → force re-render
  const isPanningRef = useRef(false);
  const panStartRef  = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { t } = useLanguage();

  // ── Fetch real currency on mount + poll every 30s as safety net ──────────
  useEffect(() => {
    console.log('[GameStart] Initial user:', user);
    refreshProfile();
    const id = setInterval(() => {
      console.log('[GameStart] Auto-refresh currency...');
      refreshProfile();
    }, 30_000);
    return () => clearInterval(id);
  }, [refreshProfile, user]);

  // ── Resize canvas to match container ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      // Preserve existing drawing
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width  = canvas.width;
      tmpCanvas.height = canvas.height;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (tmpCtx && canvas.width > 0 && canvas.height > 0) {
        tmpCtx.drawImage(canvas, 0, 0);
      }

      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;

      const ctx = canvas.getContext('2d');
      if (ctx && tmpCanvas.width > 0 && tmpCanvas.height > 0) {
        ctx.drawImage(tmpCanvas, 0, 0);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Grid canvas: draw 100×100 grid + selected cells ──────────────────────
  useEffect(() => {
    const drawGrid = () => {
      const canvas = gridCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      if (!showGrid) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      const cW = W / GRID_COLS;
      const cH = H / GRID_ROWS;
      // Selected cells — brighter fill + golden border per cell
      selectedCells.forEach(key => {
        const [cx, cy] = key.split(',').map(Number);
        ctx.fillStyle = 'rgba(255, 140, 0, 0.65)';
        ctx.fillRect(cx * cW, cy * cH, cW, cH);
        ctx.strokeStyle = 'rgba(255, 215, 50, 0.95)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(cx * cW + 0.5, cy * cH + 0.5, cW - 1, cH - 1);
      });
      // Grid lines — solid, thick, fully visible
      ctx.strokeStyle = 'rgba(255, 220, 80, 1)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      for (let i = 0; i <= GRID_COLS; i++) { const x = i * cW; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let i = 0; i <= GRID_ROWS; i++) { const y = i * cH; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      // Cell labels: column A–T top-center, row 1–20 left-middle
      const COL_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'];
      const labelSize   = Math.max(9, Math.floor(Math.min(cW, cH) * 0.22));
      ctx.shadowColor   = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur    = 4;
      ctx.fillStyle     = 'rgba(255, 220, 80, 1)';
      ctx.font          = `bold ${labelSize}px 'Playfair Display'`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i < GRID_COLS; i++) {
        ctx.fillText(COL_LETTERS[i] ?? `${i}`, (i + 0.5) * cW, 4);
      }
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < GRID_ROWS; j++) {
        ctx.fillText(`${j + 1}`, 4, (j + 0.5) * cH);
      }
      ctx.shadowBlur = 0;
      if (gridSelectMode) {
        ctx.fillStyle    = 'rgba(255,200,80,0.7)';
        ctx.font         = "bold 9px 'Playfair Display'";
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('CLICK TO SELECT CELLS', W / 2, H - 4);
      }
    };
    drawGrid();
    const ro = new ResizeObserver(drawGrid);
    const container = containerRef.current;
    if (container) ro.observe(container);
    return () => ro.disconnect();
  }, [showGrid, selectedCells, gridSelectMode, gridViewVer]);



  // ── Copy selected cells ──────────────────────────────���────────────────────
  const copySelectedCells = useCallback(() => {
    const sorted = Array.from(selectedCells).sort((a, b) => {
      const [ax, ay] = a.split(',').map(Number);
      const [bx, by] = b.split(',').map(Number);
      return ay !== by ? ay - by : ax - bx;
    });
    const text = sorted.map(k => { const [x, y] = k.split(','); return `X${x}Y${y}`; }).join(', ');
    const ta = document.createElement('textarea');
    ta.value = `selectedCells: [${text}]`;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (_) { /* ignore */ }
    document.body.removeChild(ta);
    setGridCopied(true);
    setTimeout(() => setGridCopied(false), 1800);
  }, [selectedCells]);

  // ── Flood fill (bucket tool) ──────────────────────────────────────────────
  const floodFill = useCallback((startCx: number, startCy: number, currentSelected: Set<string>) => {
    if (currentSelected.has(`${startCx},${startCy}`)) return;
    const queue: Array<[number, number]> = [[startCx, startCy]];
    const visited = new Set<string>();
    const toAdd: string[] = [];
    let hitBorder = false;
    const MAX_FILL = 100_000;

    outer: while (queue.length > 0) {
      const item = queue.shift()!;
      const cx = item[0], cy = item[1];
      const key = `${cx},${cy}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (currentSelected.has(key)) continue;
      toAdd.push(key);
      if (toAdd.length > MAX_FILL) { hitBorder = true; break outer; }
      if (cx === 0 || cy === 0 || cx === GRID_COLS - 1 || cy === GRID_ROWS - 1) {
        hitBorder = true; break outer;
      }
      const dirs: Array<[number, number]> = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < GRID_COLS && ny < GRID_ROWS) {
          const nk = `${nx},${ny}`;
          if (!visited.has(nk) && !currentSelected.has(nk)) queue.push([nx, ny]);
        }
      }
    }

    if (!hitBorder && toAdd.length > 0) {
      setSelectedCells(prev => {
        const n = new Set(prev);
        toAdd.forEach(k => n.add(k));
        return n;
      });
    }
  }, []);

  // ── Grid zoom helpers ─────────────────────────────────────────────────────
  const applyGridZoom = useCallback((
    newZoom: number,
    pivotX: number, // screen-space pivot (relative to container)
    pivotY: number,
    containerW: number,
    containerH: number,
  ) => {
    const { zoom, panX, panY } = gridViewRef.current;
    const clamped = Math.min(12, Math.max(1, newZoom));
    const scale   = clamped / zoom;
    const rawPanX = pivotX - (pivotX - panX) * scale;
    const rawPanY = pivotY - (pivotY - panY) * scale;
    // Clamp: prevent panning beyond content edges
    const cpX = Math.min(0, Math.max(containerW  * (1 - clamped), rawPanX));
    const cpY = Math.min(0, Math.max(containerH * (1 - clamped), rawPanY));
    gridViewRef.current = { zoom: clamped, panX: cpX, panY: cpY };
    setGridViewVer(v => v + 1);
  }, []);

  const resetGridView = useCallback(() => {
    gridViewRef.current = { zoom: 1, panX: 0, panY: 0 };
    setGridViewVer(v => v + 1);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!gridSelectMode || !showGrid) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    applyGridZoom(
      gridViewRef.current.zoom * factor,
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
    );
  }, [gridSelectMode, showGrid, applyGridZoom]);

  // ── Adventure button press / release helpers ─────────────────────────────
  const onAdventurePress = () => {
    adventureHoldingRef.current    = true;
    adventurePressStartRef.current = Date.now();
    const btn = adventureBtnRef.current;
    if (btn) {
      btn.style.animation  = 'none';
      btn.style.transition = 'transform 0.08s ease';
      btn.style.transform  = 'translateY(-50%) scale(0.92)';
    }
  };

  const onAdventureRelease = (doNavigate: boolean) => {
    if (adventureRafRef.current) { cancelAnimationFrame(adventureRafRef.current); adventureRafRef.current = null; }
    adventureHoldingRef.current = false;
    const btn    = adventureBtnRef.current;
    const holdMs = Date.now() - adventurePressStartRef.current;

    if (holdMs < 220) {
      if (btn) {
        btn.style.transform  = 'translateY(-50%)';
        btn.style.transition = 'none';
        btn.style.animation  = 'adventurePress 0.4s ease forwards';
      }
      setTimeout(() => {
        if (btn) { btn.style.animation = 'none'; btn.style.transform = 'translateY(-50%)'; }
        if (doNavigate) navigate('/game/adventure');
      }, 420);
    } else {
      if (btn) {
        btn.style.transition = 'transform 0.22s ease';
        btn.style.transform  = 'translateY(-50%) scale(1)';
        btn.style.animation  = 'none';
      }
      if (doNavigate) navigate('/game/adventure');
    }
  };

  const onAdventureCancel = () => {
    if (adventureRafRef.current) { cancelAnimationFrame(adventureRafRef.current); adventureRafRef.current = null; }
    adventureHoldingRef.current = false;
    const btn = adventureBtnRef.current;
    if (btn) { btn.style.transition = 'transform 0.22s ease'; btn.style.transform = 'translateY(-50%) scale(1)'; btn.style.animation = 'none'; }
  };

  // ── Building press / release / cancel helpers ────────────────────────────
  const onBuildingPress = useCallback((id: string) => {
    bldgPressedId.current  = id;
    bldgHolding.current    = true;
    bldgPressStart.current = Date.now();
    const btn  = btnDivRefs.current.get(id);
    if (btn)  { btn.style.animation  = 'none'; btn.style.transition = 'transform 0.08s ease'; btn.style.transform  = 'scale(0.92)'; }
  }, []);

  const onBuildingRelease = useCallback((id: string, doNav: boolean) => {
    if (bldgRafRef.current) { cancelAnimationFrame(bldgRafRef.current); bldgRafRef.current = null; }
    bldgHolding.current   = false;
    bldgPressedId.current = null;
    const btn     = btnDivRefs.current.get(id);
    const holdMs  = Date.now() - bldgPressStart.current;
    const route   = ASSETS.find(a => a.id === id)?.route ?? '';

    if (holdMs < 220) {
      if (btn)  { btn.style.transform  = 'scale(1)'; btn.style.transition = 'none'; btn.style.animation = 'uiPress 0.4s ease forwards'; }
      setTimeout(() => {
        if (btn)  { btn.style.animation = 'none'; btn.style.transform = 'scale(1)'; }
        if (doNav) navigate(route);
      }, 400);
    } else {
      if (btn)  { btn.style.transition = 'transform 0.22s ease'; btn.style.transform  = 'scale(1)'; btn.style.animation = 'none'; }
      if (doNav) navigate(route);
    }
  }, [navigate]);

  const onBuildingCancel = useCallback(() => {
    if (bldgRafRef.current) { cancelAnimationFrame(bldgRafRef.current); bldgRafRef.current = null; }
    const id = bldgPressedId.current;
    bldgHolding.current   = false;
    bldgPressedId.current = null;
    if (!id) return;
    const btn  = btnDivRefs.current.get(id);
    if (btn)  { btn.style.transition = 'transform 0.22s ease'; btn.style.transform  = 'scale(1)'; btn.style.animation = 'none'; }
  }, []);

  // ── Canvas draw helpers ───────────────��──────────────────────────────────
  const getCanvasPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const getGridCell = (clientX: number, clientY: number): { cx: number; cy: number; key: string } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const { zoom, panX, panY } = gridViewRef.current;
    // Inverse transform: screen → content space
    const contentX = (clientX - rect.left - panX) / zoom;
    const contentY = (clientY - rect.top  - panY) / zoom;
    const relX = contentX / rect.width;
    const relY = contentY / rect.height;
    const cx = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(relX * GRID_COLS)));
    const cy = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(relY * GRID_ROWS)));
    return { cx, cy, key: `${cx},${cy}` };
  };

  const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    recordPoint(x1, y1);
  };

  const drawDot = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allPoints.current = [];
    setCoordInfo(null);
  };

  // ── Compute bounding box + simplified polygon from drawn points ───────────
  const computeCoords = () => {
    const pts = allPoints.current;
    if (pts.length < 2) return;

    const xs = pts.map(p => p.px);
    const ys = pts.map(p => p.py);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const bbox = {
      x: parseFloat(minX.toFixed(1)),
      y: parseFloat(minY.toFixed(1)),
      w: parseFloat((maxX - minX).toFixed(1)),
      h: parseFloat((maxY - minY).toFixed(1)),
    };

    // Simplify: pick ~30 evenly spaced points from the drawn path
    const step = Math.max(1, Math.floor(pts.length / 30));
    const sampled = pts.filter((_, i) => i % step === 0);
    const polygon = sampled
      .map(p => `${p.px.toFixed(1)}% ${p.py.toFixed(1)}%`)
      .join(', ');

    setCoordInfo({ bbox, polygon: `polygon(${polygon})` });
  };

  // Record a point in % units
  const recordPoint = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const px = parseFloat(((x / canvas.width)  * 100).toFixed(2));
    const py = parseFloat(((y / canvas.height) * 100).toFixed(2));
    allPoints.current.push({ px, py });
  };

  // ─ Asset hit detection ───────────────────────────────────────────────────
  const getHitAssetId = useCallback((clientX: number, clientY: number): string | null => {
    const container = containerRef.current;
    if (!container) return null;

    const containerRect = container.getBoundingClientRect();
    const relX = ((clientX - containerRect.left) / containerRect.width) * 100;
    const relY = ((clientY - containerRect.top) / containerRect.height) * 100;

    // Check assets in reverse order (top to bottom in rendering)
    for (let i = ASSETS.length - 1; i >= 0; i--) {
      const asset = ASSETS[i];
      if (!asset.interactive) continue;

      const w = CW * (asset.widthCells ?? 1);
      const h = CH * (asset.heightCells ?? 1);
      const minX = asset.left - w / 2;
      const maxX = asset.left + w / 2;
      const minY = asset.top - h / 2;
      const maxY = asset.top + h / 2;

      if (relX >= minX && relX <= maxX && relY >= minY && relY <= maxY) {
        return asset.id;
      }
    }

    // Fallback to image-based detection for non-SVG assets
    for (const asset of ASSETS) {
      const imgEl = imgRefs.current.get(asset.id);
      if (!imgEl || !(imgEl instanceof HTMLImageElement)) continue;
      const alpha = getPixelAlpha(imgEl, clientX, clientY);
      if (alpha > 15) return asset.id;
    }

    return null;
  }, []);

  // ── Mouse events ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (drawMode) {
      isDrawing.current = true;
      const pos = getCanvasPos(e.clientX, e.clientY);
      lastPos.current = pos;
      drawDot(pos.x, pos.y);
      recordPoint(pos.x, pos.y);
      return;
    }
    // Right-click drag → pan the grid view
    if (e.button === 2 && gridSelectMode && showGrid) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current  = { mx: e.clientX, my: e.clientY, px: gridViewRef.current.panX, py: gridViewRef.current.panY };
      return;
    }
    if (gridSelectMode && showGrid && bucketMode) {
      const cell = getGridCell(e.clientX, e.clientY);
      if (!cell) return;
      floodFill(cell.cx, cell.cy, selectedCells);
      return;
    }
    if (gridSelectMode && showGrid) {
      const cell = getGridCell(e.clientX, e.clientY);
      if (!cell) return;
      isGridSelecting.current = true;
      lastGridKey.current     = cell.key;
      setSelectedCells(prev => {
        const wasSelected = prev.has(cell.key);
        gridDragMode.current = wasSelected ? 'remove' : 'add';
        const n = new Set(prev);
        if (wasSelected) n.delete(cell.key); else n.add(cell.key);
        return n;
      });
      return;
    }
    const id = getHitAssetId(e.clientX, e.clientY);
    if (id) onBuildingPress(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, gridSelectMode, showGrid, color, lineWidth, getHitAssetId, onBuildingPress, bucketMode, floodFill, selectedCells]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (drawMode) {
      if (!isDrawing.current || !lastPos.current) return;
      const pos = getCanvasPos(e.clientX, e.clientY);
      drawLine(lastPos.current.x, lastPos.current.y, pos.x, pos.y);
      lastPos.current = pos;
      return;
    }
    // Pan grid view via right-click drag
    if (isPanningRef.current && panStartRef.current && gridSelectMode && showGrid) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const { zoom } = gridViewRef.current;
      const dx = e.clientX - panStartRef.current.mx;
      const dy = e.clientY - panStartRef.current.my;
      const rawPanX = panStartRef.current.px + dx;
      const rawPanY = panStartRef.current.py + dy;
      const cpX = Math.min(0, Math.max(rect.width  * (1 - zoom), rawPanX));
      const cpY = Math.min(0, Math.max(rect.height * (1 - zoom), rawPanY));
      gridViewRef.current = { zoom, panX: cpX, panY: cpY };
      setGridViewVer(v => v + 1);
      return;
    }
    if (gridSelectMode && showGrid && isGridSelecting.current && !bucketMode) {
      const cell = getGridCell(e.clientX, e.clientY);
      if (!cell || cell.key === lastGridKey.current) return;
      lastGridKey.current = cell.key;
      setSelectedCells(prev => {
        const n = new Set(prev);
        if (gridDragMode.current === 'add') n.add(cell.key);
        else n.delete(cell.key);
        return n;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, gridSelectMode, showGrid, color, lineWidth, bucketMode]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (drawMode) {
      isDrawing.current = false;
      lastPos.current   = null;
      computeCoords();
      return;
    }
    if (gridSelectMode && showGrid) {
      isPanningRef.current    = false;
      panStartRef.current     = null;
      isGridSelecting.current = false;
      lastGridKey.current     = null;
      return;
    }
    const pressId = bldgPressedId.current;
    if (pressId) {
      const hitId = getHitAssetId(e.clientX, e.clientY);
      onBuildingRelease(pressId, hitId === pressId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, gridSelectMode, showGrid, getHitAssetId, onBuildingRelease]);

  const handleMouseLeave = useCallback(() => {
    isDrawing.current       = false;
    lastPos.current         = null;
    isGridSelecting.current = false;
    lastGridKey.current     = null;
    isPanningRef.current    = false;
    panStartRef.current     = null;
    onBuildingCancel();
    // Adventure: cancel via DOM (no state)
    if (adventureRafRef.current) { cancelAnimationFrame(adventureRafRef.current); adventureRafRef.current = null; }
    adventureHoldingRef.current = false;
    const btn = adventureBtnRef.current;
    if (btn) { btn.style.transition = 'transform 0.22s ease'; btn.style.transform = 'translateY(-50%) scale(1)'; btn.style.animation = 'none'; }
  }, [onBuildingCancel]);

  // ── Touch events ──────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    if (drawMode) {
      e.preventDefault();
      isDrawing.current = true;
      const pos = getCanvasPos(touch.clientX, touch.clientY);
      lastPos.current = pos;
      drawDot(pos.x, pos.y);
      recordPoint(pos.x, pos.y);
      return;
    }
    if (gridSelectMode && showGrid && bucketMode) {
      e.preventDefault();
      const cell = getGridCell(touch.clientX, touch.clientY);
      if (!cell) return;
      floodFill(cell.cx, cell.cy, selectedCells);
      return;
    }
    if (gridSelectMode && showGrid) {
      e.preventDefault();
      const cell = getGridCell(touch.clientX, touch.clientY);
      if (!cell) return;
      isGridSelecting.current = true;
      lastGridKey.current     = cell.key;
      setSelectedCells(prev => {
        const wasSelected = prev.has(cell.key);
        gridDragMode.current = wasSelected ? 'remove' : 'add';
        const n = new Set(prev);
        if (wasSelected) n.delete(cell.key); else n.add(cell.key);
        return n;
      });
      return;
    }
    const id = getHitAssetId(touch.clientX, touch.clientY);
    if (id) onBuildingPress(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, gridSelectMode, showGrid, color, lineWidth, getHitAssetId, onBuildingPress, bucketMode, floodFill, selectedCells]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    if (drawMode) {
      if (!isDrawing.current || !lastPos.current) return;
      e.preventDefault();
      const pos = getCanvasPos(touch.clientX, touch.clientY);
      drawLine(lastPos.current.x, lastPos.current.y, pos.x, pos.y);
      lastPos.current = pos;
      return;
    }
    if (gridSelectMode && showGrid && isGridSelecting.current) {
      e.preventDefault();
      const cell = getGridCell(touch.clientX, touch.clientY);
      if (!cell || cell.key === lastGridKey.current) return;
      lastGridKey.current = cell.key;
      setSelectedCells(prev => {
        const n = new Set(prev);
        if (gridDragMode.current === 'add') n.add(cell.key);
        else n.delete(cell.key);
        return n;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, gridSelectMode, showGrid, color, lineWidth]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (drawMode) {
      isDrawing.current = false;
      lastPos.current   = null;
      computeCoords();
      return;
    }
    if (gridSelectMode && showGrid) {
      isGridSelecting.current = false;
      lastGridKey.current     = null;
      return;
    }
    const pressId = bldgPressedId.current;
    if (pressId) {
      const touch = e.changedTouches[0];
      let doNav = true;
      if (touch) {
        const imgEl = imgRefs.current.get(pressId);
        doNav = imgEl ? getPixelAlpha(imgEl, touch.clientX, touch.clientY) > 15 : true;
      }
      onBuildingRelease(pressId, doNav);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, gridSelectMode, showGrid, onBuildingRelease]);

  return (
    <div
      ref={containerRef}
      className="size-full relative overflow-hidden select-none"
      style={{ cursor: drawMode ? 'crosshair' : (gridSelectMode && bucketMode) ? 'cell' : gridSelectMode ? 'crosshair' : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDragStart={(e) => e.preventDefault()}
      onWheel={handleWheel}
      onContextMenu={(e) => { if (gridSelectMode && showGrid) e.preventDefault(); }}
    >
      <style>{`
        @keyframes uiPress {
          0%   { transform: scale(1); }
          40%  { transform: scale(0.88); }
          70%  { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        @keyframes adventurePress {
          0%   { transform: translateY(-50%) scale(1); }
          35%  { transform: translateY(-50%) scale(0.88); }
          68%  { transform: translateY(-50%) scale(1.06); }
          100% { transform: translateY(-50%) scale(1); }
        }
        img {
          -webkit-user-drag: none;
          user-drag: none;
        }
      `}</style>

      {/* Background */}
      <ImageWithFallback
        src={BG}
        alt=""
        className="absolute inset-0 size-full object-cover"
        draggable={false}
        style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
      />

      {/* ── Server Time — cell A3, flush top-left corner of that cell ── */}
      {/* A3 in 20×20 grid: left=0%, top=(2/20)*100%=10%              */}
      <div
        style={{
          position:      'absolute',
          left:          '0.5%',
          top:           'calc(10% + 3px)',
          zIndex:        7,
          pointerEvents: 'none',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'flex-start',
          gap:           '0px',
          lineHeight:    1,
        }}
      >
        {/* label */}
        <span style={{
          fontFamily:    "'Playfair Display', serif",
          fontSize:      'clamp(5px, 1vh, 8px)',
          fontWeight:    600,
          letterSpacing: '0.22em',
          color:         'rgba(255,255,255,0.45)',
          textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
          whiteSpace:    'nowrap',
          lineHeight:    1,
        }}>
          Server Time
        </span>
        {/* date */}
        <span style={{
          fontFamily:    "'Playfair Display', serif",
          fontSize:      'clamp(7px, 2.5vh, 15px)',
          fontWeight:    700,
          letterSpacing: '0.14em',
          color:         '#ffffff',
          textShadow:    '0 1px 6px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.6)',
          whiteSpace:    'nowrap',
          lineHeight:    1.1,
        }}>
          {serverTime.date}
        </span>
        {/* time */}
        <span style={{
          fontFamily:    "'Playfair Display', serif",
          fontSize:      'clamp(7px, 2.5vh, 15px)',
          fontWeight:    700,
          letterSpacing: '0.14em',
          color:         '#ffffff',
          textShadow:    '0 1px 6px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.6)',
          whiteSpace:    'nowrap',
          lineHeight:    1.1,
        }}>
          {serverTime.time}
        </span>
      </div>

      {/* ── VIP Badge — conical drop, orange, label+level inside ── */}
      <div
        style={{
          position: 'absolute',
          left: `${(2.1 / COLS) * 100}%`,
          top: `${(0.25 / ROWS) * 100}%`,
          width: `${(0.25 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          zIndex: 6,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        {/* Shape — solid orange with white frame */}
        <svg
          viewBox="0 0 50 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <path
            d="M 10,0 L 40,0 Q 50,0 50,10 L 50,76 L 25,100 L 0,76 L 0,10 Q 0,0 10,0 Z"
            fill="#FF7000"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
        {/* VIP label — top, just inside white frame */}
        <div
          style={{
            position: 'absolute',
            top: '9%',
            left: 0,
            right: 0,
            textAlign: 'center',
            color: '#ffffff',
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(5px, 1vw, 10px)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            pointerEvents: 'none',
            lineHeight: 1,
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          VIP
        </div>
        {/* VIP level number — center of body */}
        <div
          style={{
            position: 'absolute',
            top: '38%',
            left: 0,
            right: 0,
            textAlign: 'center',
            color: '#ffffff',
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(6px, 1.3vw, 13px)',
            fontWeight: 800,
            pointerEvents: 'none',
            lineHeight: 1,
            textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          }}
        >
          {user?.vip_level ?? 0}
        </div>
      </div>

      {/* ── Customer Service Button — circle ── */}
      {/* CS left = 2.35+0.125=2.475/COLS (right 1/8 grid); gap from VIP = 0.125 */}
      <div
        style={{
          position: 'absolute',
          left: `${(2.475 / COLS) * 100}%`,
          top: `calc(${(0.5 / ROWS) * 100}% - 1.5625vw)`,
          width: '3.125vw',
          height: '3.125vw',
          zIndex: 6,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <svg
          viewBox="0 0 100 100"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <circle cx="50" cy="50" r="47" fill="#29B6F6" stroke="#ffffff" strokeWidth="4" />
          <g transform="translate(50,50) scale(0.75) translate(-50,-50)">
            <path d="M 18,54 C 18,16 82,16 82,54" stroke="white" strokeWidth="9" fill="none" strokeLinecap="round" />
            <rect x="6" y="47" width="18" height="24" rx="6" fill="white" />
            <rect x="76" y="47" width="18" height="24" rx="6" fill="white" />
            <path d="M 24,69 Q 24,86 44,86" stroke="white" strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="44" cy="86" r="6" fill="white" />
          </g>
        </svg>
      </div>

      {/* ── Discord Button — same style; gap=0.125 from CS right edge ── */}
      {/* CS right = 2.475+0.25=2.725; gap=0.125 → Discord left=2.85/COLS */}
      <div
        style={{
          position: 'absolute',
          left: `${(2.85 / COLS) * 100}%`,
          top: `calc(${(0.5 / ROWS) * 100}% - 1.5625vw)`,
          width: '3.125vw',
          height: '3.125vw',
          zIndex: 6,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <svg
          viewBox="0 0 100 100"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* Background — same light blue, white frame */}
          <circle cx="50" cy="50" r="47" fill="#29B6F6" stroke="#ffffff" strokeWidth="4" />
          {/* Discord Clyde — scaled 75%, centered */}
          <g transform="translate(50,50) scale(0.75) translate(-50,-50)">
            {/* Body */}
            <path
              d="M 20,32 C 20,17 30,10 40,10 C 43,10 46,11 48,13 C 49,13 50,14 50,14 C 50,14 51,13 52,13 C 54,11 57,10 60,10 C 70,10 80,17 80,32 L 80,63 C 80,75 71,83 62,85 L 62,93 L 50,84 L 38,93 L 38,85 C 29,83 20,75 20,63 Z"
              fill="white"
            />
            {/* Left eye punched with bg color */}
            <ellipse cx="38" cy="48" rx="8" ry="9" fill="#29B6F6" />
            {/* Right eye punched with bg color */}
            <ellipse cx="62" cy="48" rx="8" ry="9" fill="#29B6F6" />
          </g>
        </svg>
      </div>

      {/* ── Facebook Button — Discord right=3.1; gap=0.125 → FB left=3.225/COLS ── */}
      <div
        style={{
          position: 'absolute',
          left: `${(3.225 / COLS) * 100}%`,
          top: `calc(${(0.5 / ROWS) * 100}% - 1.5625vw)`,
          width: '3.125vw',
          height: '3.125vw',
          zIndex: 6,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <svg
          viewBox="0 0 100 100"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <circle cx="50" cy="50" r="47" fill="#1877F2" stroke="#ffffff" strokeWidth="4" />
          <g transform="translate(50,50) scale(-0.75,0.75) translate(-50,-50)">
            <path
              fill="white"
              d="M 57,30 C 45,30 37,22 39,12 C 41,4 62,4 72,14 L 72,30 L 72,90 L 57,90 L 57,62 L 35,62 L 35,50 L 57,50 Z"
            />
          </g>
        </svg>
      </div>

      {/* UI Container - Top Left (Profile) */}
      <div
        style={{
          position: 'absolute',
          top: `${(0.25 / ROWS) * 100}%`,
          left: 0,
          width: `${(2.5 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
          viewBox="0 0 250 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="fadeRight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(0, 0, 0, 0.4)" />
              <stop offset="70%" stopColor="rgba(0, 0, 0, 0.25)" />
              <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
            </linearGradient>
            <linearGradient id="profile-border-fade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255, 215, 0, 1)" />
              <stop offset="70%" stopColor="rgba(255, 215, 0, 0.3)" />
              <stop offset="100%" stopColor="rgba(255, 215, 0, 0)" />
            </linearGradient>
            <linearGradient id="profile-border-black-fade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(0, 0, 0, 1)" />
              <stop offset="70%" stopColor="rgba(0, 0, 0, 0.3)" />
              <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
            </linearGradient>
          </defs>
          {/* Background */}
          <path
            d="M 0,0 L 250,0 L 250,100 L 0,100 Z"
            fill="url(#fadeRight)"
          />

          {/* Top border - black outline top */}
          <rect x="0" y="0" width="250" height="2" fill="url(#profile-border-black-fade)" />
          {/* Top border - gold center */}
          <rect x="0" y="1.2" width="250" height="1.5" fill="url(#profile-border-fade)" />
          {/* Top border - black outline bottom */}
          <rect x="0" y="2.7" width="250" height="1" fill="url(#profile-border-black-fade)" />

          {/* Bottom border - black outline top */}
          <rect x="0" y="96.3" width="250" height="1" fill="url(#profile-border-black-fade)" />
          {/* Bottom border - gold center */}
          <rect x="0" y="97.3" width="250" height="1.5" fill="url(#profile-border-fade)" />
          {/* Bottom border - black outline bottom */}
          <rect x="0" y="98" width="250" height="2" fill="url(#profile-border-black-fade)" />
        </svg>

        {/* Content inside container */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            paddingLeft: `${(0.5 / 2.5) * 100}%`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-evenly',
            transform: `translateY(-${(0.5 / ROWS) * 100}%)`,
          }}
        >
          {/* Nickname */}
          <div
            style={{
              color: '#ffffff',
              fontFamily: "'Playfair Display', serif",
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            }}
          >
            {user?.nickname ?? 'New Player'}
          </div>

          {/* Level + EXP Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                color: '#ffdd88',
                fontFamily: "'Playfair Display', serif",
                fontSize: '9px',
                fontWeight: 600,
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                whiteSpace: 'nowrap',
              }}
            >
              Lv. {user?.level ?? 0}
            </span>
            {/* EXP Progress Bar — computed directly from xp/maxXp */}
            {(() => {
              const curXp = user?.xp ?? 0;
              const maxXp = (user?.maxXp && user.maxXp > 0)
                ? user.maxXp
                : getMaxXpForLevel(user?.level ?? 0);
              const fillW = Math.min(100, maxXp > 0 ? (curXp / maxXp) * 100 : 0);
              return (
                <>
                  <div style={{ position: 'relative', flexGrow: 1, maxWidth: '60%' }}>
                    <svg width="100%" height="8" viewBox="0 0 100 8" preserveAspectRatio="none">
                      {/* background track */}
                      <rect x="0" y="0" width="100" height="8" fill="rgba(0,0,0,0.55)" rx="2" />
                      {/* blue progress fill */}
                      {fillW > 0 && (
                        <rect x="0" y="0" width={fillW} height="8" fill="#56b4f5" rx="2" />
                      )}
                      {/* shine overlay */}
                      {fillW > 0 && (
                        <rect x="0" y="0" width={fillW} height="4" fill="rgba(255,255,255,0.18)" rx="2" />
                      )}
                    </svg>
                  </div>
                  <span
                    style={{
                      color: '#7dd3fc',
                      fontFamily: "'Playfair Display', serif",
                      fontSize: '8px',
                      fontWeight: 600,
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {Math.round(fillW)}%
                  </span>
                </>
              );
            })()}
          </div>

          {/* Power */}
          <div
            style={{
              color: '#ffaa44',
              fontFamily: "'Playfair Display', serif",
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.03em',
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            }}
          >
            {(user?.power ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* UI Container - Hero EXP (F1) */}
      <div
        style={{
          position: 'absolute',
          left: `${(4.5 / COLS) * 100}%`,
          top: 0,
          width: `${(1 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <rect x="20" y="20" width="60" height="60" fill="rgba(0, 0, 0, 0.4)" />
          <path
            d="M 20,20 Q 0,20 0,50 Q 0,80 20,80 Z"
            fill="rgba(0, 0, 0, 0.4)"
          />
          <path
            d="M 80,20 Q 100,20 100,50 Q 100,80 80,80 Z"
            fill="rgba(0, 0, 0, 0.4)"
          />
        </svg>
        {/* Hero EXP Content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: '8%',
            paddingRight: '8%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Potion bottle SVG */}
            <div style={{ position: 'relative', width: '16px', height: '20px', flexShrink: 0 }}>
              <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                {/* Bottle body */}
                <path d="M 5,6 L 5,14 Q 5,17 8,17 Q 11,17 11,14 L 11,6 Z" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/>
                {/* Blue liquid */}
                <path d="M 5.5,10 L 5.5,13.5 Q 5.5,16 8,16 Q 10.5,16 10.5,13.5 L 10.5,10 Z" fill="#4488ff"/>
                {/* Bottle neck */}
                <rect x="6" y="3" width="4" height="3" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/>
                {/* Wooden cork */}
                <ellipse cx="8" cy="3" rx="2.5" ry="1.2" fill="#8B4513"/>
                <ellipse cx="8" cy="2.2" rx="2.5" ry="1" fill="#A0522D"/>
              </svg>
            </div>
            <span style={{
              color:         '#88ccff',
              fontFamily:    "'Playfair Display', serif",
              fontSize:      '14px',
              fontWeight:    600,
              letterSpacing: '0.06em',
              textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
              whiteSpace:    'nowrap',
            }}>
              {fmtCurrency(user?.hero_exp ?? 0)}
            </span>
          </div>
          {/* Plus icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </div>

      {/* UI Container - Gold (G1) */}
      <div
        style={{
          position: 'absolute',
          left: `${(5.5 / COLS) * 100}%`,
          top: 0,
          width: `${(1 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <rect x="20" y="20" width="60" height="60" fill="rgba(0, 0, 0, 0.4)" />
          <path
            d="M 20,20 Q 0,20 0,50 Q 0,80 20,80 Z"
            fill="rgba(0, 0, 0, 0.4)"
          />
          <path
            d="M 80,20 Q 100,20 100,50 Q 100,80 80,80 Z"
            fill="rgba(0, 0, 0, 0.4)"
          />
        </svg>
        {/* Gold Currency Content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: '8%',
            paddingRight: '8%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Gold coin SVG */}
            <div style={{ position: 'relative', width: '20px', height: '20px', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#D4A017" />
                <circle cx="12" cy="12" r="8"  fill="#F5C842" />
                <text
                  x="12" y="16"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#8B6000"
                  fontFamily="'Playfair Display',serif"
                >G</text>
              </svg>
            </div>
            <span style={{
              color:         '#F5C842',
              fontFamily:    "'Playfair Display', serif",
              fontSize:      '14px',
              fontWeight:    600,
              letterSpacing: '0.06em',
              textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
              whiteSpace:    'nowrap',
            }}>
              {fmtCurrency(user?.gold ?? 0)}
            </span>
          </div>
          {/* Plus icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </div>

      {/* UI Container - Gems (H1) */}
      <div
        style={{
          position: 'absolute',
          left: `${(6.5 / COLS) * 100}%`,
          top: 0,
          width: `${(1 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <rect x="20" y="20" width="60" height="60" fill="rgba(0, 0, 0, 0.4)" />
          <path
            d="M 20,20 Q 0,20 0,50 Q 0,80 20,80 Z"
            fill="rgba(0, 0, 0, 0.4)"
          />
          <path
            d="M 80,20 Q 100,20 100,50 Q 100,80 80,80 Z"
            fill="rgba(0, 0, 0, 0.4)"
          />
        </svg>
        {/* Gems Currency Content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: '8%',
            paddingRight: '8%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Diamond SVG */}
            <div style={{ position: 'relative', width: '18px', height: '20px', flexShrink: 0 }}>
              <svg width="18" height="20" viewBox="0 0 14 16" fill="none">
                <polygon points="7,0 14,5 7,16 0,5" fill="#1AADEE" />
                <polygon points="7,0 14,5 7,7 0,5" fill="#5BCFFF" />
                <polygon points="7,0 10,5 7,7 4,5" fill="#A8EEFF" />
              </svg>
            </div>
            <span style={{
              color:         '#5BCFFF',
              fontFamily:    "'Playfair Display', serif",
              fontSize:      '14px',
              fontWeight:    600,
              letterSpacing: '0.06em',
              textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
              whiteSpace:    'nowrap',
            }}>
              {fmtCurrency(user?.gems ?? 0)}
            </span>
          </div>
          {/* Plus icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </div>

      {/* ── Dropdown Menu — right half of column H ── */}
      <div style={{
        position: 'absolute',
        left: `${(7.5 / COLS) * 100}%`,
        top: 0,
        width: `${(0.5 / COLS) * 100}%`,
        height: menuOpen ? `${(5 / ROWS) * 100}%` : `${(1 / ROWS) * 100}%`,
        zIndex: 10,
        pointerEvents: 'none',
      }}>

        {/* ── CLOSED STATE ── */}
        {!menuOpen && (
          <div
            onClick={() => setMenuOpen(true)}
            style={{ position: 'absolute', inset: 0, cursor: 'pointer', pointerEvents: 'auto' }}
          >
            <svg
              viewBox="0 0 50 100"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            >
              <defs>
                <linearGradient id="dm-pill-bg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(25,12,4,0.78)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
                </linearGradient>
              </defs>
              {/* Capsule body + conical bottom */}
              <path
                d="M 10,0 L 40,0 Q 50,0 50,10 L 50,76 L 25,100 L 0,76 L 0,10 Q 0,0 10,0 Z"
                fill="url(#dm-pill-bg)"
                stroke="rgba(255,215,0,0.88)"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              {/* Horizontal gold accent line above arrow */}
              <line x1="16" y1="36" x2="34" y2="36" stroke="rgba(255,215,0,0.5)" strokeWidth="1.2" strokeLinecap="round" />
              {/* Down chevron arrow */}
              <polyline
                points="15,44 25,57 35,44"
                fill="none"
                stroke="rgba(255,255,255,0.92)"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        {/* ── OPEN STATE — 5 rows + cone ── */}
        {menuOpen && (
          <>
            {/* Background SVG — 5 rows + conical bottom */}
            <svg
              viewBox="0 0 50 500"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            >
              <defs>
                <linearGradient id="dm-open-bg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(25,12,4,0.82)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.62)" />
                </linearGradient>
              </defs>
              {/* Outer shape: rounded top + cone bottom */}
              <path
                d="M 10,0 L 40,0 Q 50,0 50,10 L 50,476 L 25,500 L 0,476 L 0,10 Q 0,0 10,0 Z"
                fill="url(#dm-open-bg)"
                stroke="rgba(255,215,0,0.88)"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              {/* Row dividers */}
              <line x1="5" y1="100" x2="45" y2="100" stroke="rgba(255,215,0,0.35)" strokeWidth="1.4" />
              <line x1="5" y1="200" x2="45" y2="200" stroke="rgba(255,215,0,0.35)" strokeWidth="1.4" />
              <line x1="5" y1="300" x2="45" y2="300" stroke="rgba(255,215,0,0.35)" strokeWidth="1.4" />
              <line x1="5" y1="400" x2="45" y2="400" stroke="rgba(255,215,0,0.35)" strokeWidth="1.4" />
              {/* Cone entry accent */}
              <line x1="8" y1="476" x2="42" y2="476" stroke="rgba(255,215,0,0.35)" strokeWidth="1" />
              {/* Down chevron in cone */}
              <polyline
                points="15,480 25,494 35,480"
                fill="none"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* ── Quest — row 1 (0–20%) ── */}
            <div style={{
              position: 'absolute', top: '0%', height: '20%',
              left: 0, right: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer', pointerEvents: 'auto', zIndex: 1,
            }}>
              {/* Parchment scroll — solid white */}
              <svg width="16" height="18" viewBox="0 0 22 26" fill="none">
                <path d="M 5,3 L 17,3 Q 19,3 19,5 L 19,23 Q 19,25 17,25 L 5,25 Q 3,25 3,23 L 3,5 Q 3,3 5,3 Z" fill="white" />
                <path d="M 3,5 Q 3,1 5,1 L 17,1 Q 19,1 19,3" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M 3,23 Q 3,27 5,27 L 17,27 Q 19,27 19,25" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="6" y1="9"  x2="16" y2="9"  stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
                <line x1="6" y1="13" x2="16" y2="13" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
                <line x1="6" y1="17" x2="12" y2="17" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
              </svg>
              <span style={{
                color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '7px',
                fontWeight: 700, letterSpacing: '0.08em',
                textShadow: '0 1px 3px rgba(0,0,0,0.95)', lineHeight: 1,
              }}>Quest</span>
            </div>

            {/* ── Bag (Backpack/Ransel) — row 2 (20–40%) ── */}
            <div style={{
              position: 'absolute', top: '20%', height: '20%',
              left: 0, right: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer', pointerEvents: 'auto', zIndex: 1,
            }}>
              {/* Backpack / ransel — solid white */}
              <svg width="16" height="18" viewBox="0 0 22 26" fill="none">
                {/* Shoulder strap arch */}
                <path d="M 8,5 Q 8,1 11,1 Q 14,1 14,5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                {/* Left strap side */}
                <path d="M 5,7 Q 3,8 3,12 L 3,20 Q 3,21 5,21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                {/* Right strap side */}
                <path d="M 17,7 Q 19,8 19,12 L 19,20 Q 19,21 17,21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                {/* Main body */}
                <path d="M 5,6 L 17,6 Q 19,6 19,8 L 19,22 Q 19,25 17,25 L 5,25 Q 3,25 3,22 L 3,8 Q 3,6 5,6 Z" fill="white" />
                {/* Top handle */}
                <path d="M 9,6 Q 9,4 11,4 Q 13,4 13,6" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                {/* Front pocket */}
                <rect x="6" y="15" width="10" height="8" rx="1.5" fill="rgba(0,0,0,0.15)" />
                {/* Pocket zipper */}
                <line x1="6" y1="18" x2="16" y2="18" stroke="rgba(0,0,0,0.2)" strokeWidth="1.2" />
              </svg>
              <span style={{
                color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '7px',
                fontWeight: 700, letterSpacing: '0.08em',
                textShadow: '0 1px 3px rgba(0,0,0,0.95)', lineHeight: 1,
              }}>Bag</span>
            </div>

            {/* ── Friend — row 3 (40–60%) ── */}
            <div style={{
              position: 'absolute', top: '40%', height: '20%',
              left: 0, right: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer', pointerEvents: 'auto', zIndex: 1,
            }}>
              {/* Two-person friend — solid white */}
              <svg width="18" height="16" viewBox="0 0 26 22" fill="none">
                <circle cx="7.5" cy="6" r="3.5" fill="white" />
                <path d="M 1,21 Q 1,14 7.5,14 Q 10,14 11.5,15.5 L 11.5,21 Z" fill="white" />
                <circle cx="18.5" cy="6" r="3.5" fill="white" />
                <path d="M 25,21 Q 25,14 18.5,14 Q 16,14 14.5,15.5 L 14.5,21 Z" fill="white" />
                <path d="M 11.5,15.5 Q 13,13 14.5,15.5 L 14.5,21 L 11.5,21 Z" fill="white" />
              </svg>
              <span style={{
                color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '7px',
                fontWeight: 700, letterSpacing: '0.08em',
                textShadow: '0 1px 3px rgba(0,0,0,0.95)', lineHeight: 1,
              }}>Friend</span>
            </div>

            {/* ── Mail — row 4 (60–80%) ── */}
            <div style={{
              position: 'absolute', top: '60%', height: '20%',
              left: 0, right: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer', pointerEvents: 'auto', zIndex: 1,
            }}>
              {/* Envelope — solid white */}
              <svg width="18" height="14" viewBox="0 0 26 20" fill="none">
                <path d="M 2,3 L 24,3 Q 25,3 25,4 L 25,18 Q 25,19 24,19 L 2,19 Q 1,19 1,18 L 1,4 Q 1,3 2,3 Z" fill="white" />
                <path d="M 1,4 L 13,12 L 25,4" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1.8" strokeLinejoin="round" />
                <line x1="1"  y1="19" x2="9"  y2="12" stroke="rgba(0,0,0,0.12)" strokeWidth="1.2" />
                <line x1="25" y1="19" x2="17" y2="12" stroke="rgba(0,0,0,0.12)" strokeWidth="1.2" />
              </svg>
              <span style={{
                color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '7px',
                fontWeight: 700, letterSpacing: '0.08em',
                textShadow: '0 1px 3px rgba(0,0,0,0.95)', lineHeight: 1,
              }}>Mail</span>
            </div>

            {/* ── Settings — row 5 (80–91%, above cone) ── */}
            <div
              onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}
              style={{
              position: 'absolute', top: '80%', height: '15%',
              left: 0, right: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer', pointerEvents: 'auto', zIndex: 1,
            }}>
              {/* Gear cog — solid white */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M 12,2 L 13.8,5.8 L 17.5,4.2 L 17.8,8.2 L 21.8,9.5 L 19.8,13 L 22,16 L 18.8,17.8 L 19.8,21.8 L 15.8,21.5 L 14,24.5 L 12,22 L 10,24.5 L 8.2,21.5 L 4.2,21.8 L 5.2,17.8 L 2,16 L 4.2,13 L 2.2,9.5 L 6.2,8.2 L 6.5,4.2 L 10.2,5.8 Z" fill="white" />
                <circle cx="12" cy="13" r="3.5" fill="rgba(0,0,0,0.6)" />
              </svg>
              <span style={{
                color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '7px',
                fontWeight: 700, letterSpacing: '0.08em',
                textShadow: '0 1px 3px rgba(0,0,0,0.95)', lineHeight: 1,
              }}>Set</span>
            </div>

            {/* ── Cone click zone (close trigger) ── */}
            <div
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: '5%',
                cursor: 'pointer', pointerEvents: 'auto', zIndex: 2,
              }}
            />
          </>
        )}
      </div>

      {/* ── ADVENTURE Button — G11 to H11 ── */}
      <div
        ref={adventureBtnRef}
        onMouseDown={(e) => { e.stopPropagation(); onAdventurePress(); }}
        onMouseUp={(e)   => { e.stopPropagation(); onAdventureRelease(true); }}
        onMouseLeave={onAdventureCancel}
        onTouchStart={(e) => { e.stopPropagation(); onAdventurePress(); }}
        onTouchEnd={(e)   => { e.stopPropagation(); onAdventureRelease(true); }}
        onTouchCancel={(e) => { e.stopPropagation(); onAdventureCancel(); }}
        style={{
          position: 'absolute',
          left: `${(6 / COLS) * 100}%`,
          top: `${((10 + 0.5) / ROWS) * 100}%`,
          width: `${(2 / COLS) * 100}%`,
          height: `${(0.72 / ROWS) * 100}%`,
          transform: 'translateY(-50%)',
          zIndex: 8,
          cursor: 'pointer',
          borderRadius: '9999px',
          background: '#FF7000',
          border: '2.5px solid #ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(255,112,0,0.65), 0 1px 4px rgba(0,0,0,0.5)',
        }}
      >
        <span style={{
          color: '#ffffff',
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(7px, 1.6vw, 12px)',
          fontWeight: 800,
          letterSpacing: '0.18em',
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}>
          ADVENTURE
        </span>
      </div>

      {/* Bottom Navigation - CITY */}
      <div
        style={{
          position: 'absolute',
          left: `${(0.8 / COLS) * 100}%`,
          top: `${cellCenter('A', 12).top}%`,
          width: `${(1.6 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="border-fade-h" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255, 215, 0, 0)" />
              <stop offset="12%" stopColor="rgba(255, 215, 0, 1)" />
              <stop offset="88%" stopColor="rgba(255, 215, 0, 1)" />
              <stop offset="100%" stopColor="rgba(255, 215, 0, 0)" />
            </linearGradient>
            <linearGradient id="border-black-fade-h" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(0, 0, 0, 0)" />
              <stop offset="12%" stopColor="rgba(0, 0, 0, 1)" />
              <stop offset="88%" stopColor="rgba(0, 0, 0, 1)" />
              <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
            </linearGradient>
            <linearGradient id="border-fade-v" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="rgba(255, 215, 0, 0)" />
              <stop offset="100%" stopColor="rgba(255, 215, 0, 1)" />
            </linearGradient>
            <linearGradient id="border-black-fade-v" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="rgba(0, 0, 0, 0)" />
              <stop offset="100%" stopColor="rgba(0, 0, 0, 1)" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="rgba(0, 0, 0, 0.4)" />
          <rect x="0" y="0" width="100" height="2" fill="url(#border-black-fade-h)" />
          <rect x="0" y="1.2" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="2.7" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="96.3" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="97.3" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="98" width="100" height="2" fill="url(#border-black-fade-h)" />
        </svg>
        {/* City Skyline icon + CITY label — strict flex ROW so icon is LEFT of text */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px',
          pointerEvents: 'none', zIndex: 1,
        }}>
          {/*
            City Skyline SVG — solid white silhouette, viewBox 0 0 32 24
            • Left building  x=0-8,  top y=15, chimney x=2-3 y=12
            • Center building x=8-22, sharp gable peak x=15 y=2 (tallest)
            • Right building x=22-32, top y=11, small chimney x=29-30 y=9
            • Evenodd cutouts:
                arch window left  x=4-6   y=18-21
                twin rect windows x=11-13 & x=17-19  y=11-15
                arched door base  x=13-17 y=20-24
                wide rect window right x=25-28 y=14-18
          */}
          <svg
            viewBox="0 0 32 24"
            width="28"
            height="22"
            fill="white"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}
          >
            <path
              fillRule="evenodd"
              d="
                M 0,24 L 0,15
                L 2,15 L 2,12 L 3,12 L 3,15
                L 8,15 L 8,7 L 15,2 L 22,7 L 22,11
                L 29,11 L 29,9 L 30,9 L 30,11 L 32,11 L 32,24 Z
                M 4,21 L 4,18 Q 5,16 6,18 L 6,21 Z
                M 11,11 L 13,11 L 13,15 L 11,15 Z
                M 17,11 L 19,11 L 19,15 L 17,15 Z
                M 13,24 L 13,20 Q 15,18 17,20 L 17,24 Z
                M 25,14 L 28,14 L 28,18 L 25,18 Z
              "
            />
          </svg>
          <span style={{
            color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.15em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)',
            transform: `translateY(${(1 / ROWS) * 100 / 5}%)`,
          }}>City</span>
        </div>
      </div>

      {/* Bottom Navigation - HERO */}
      <div
        style={{
          position: 'absolute',
          left: `${(2.4 / COLS) * 100}%`,
          top: `${cellCenter('A', 12).top}%`,
          width: `${(1.6 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          pointerEvents: 'auto',
          cursor: 'pointer',
        }}
        onClick={() => navigate('/game/hero')}
      >
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="100" height="100" fill="rgba(0, 0, 0, 0.4)" />
          <rect x="0" y="0" width="100" height="2" fill="url(#border-black-fade-h)" />
          <rect x="0" y="1.2" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="2.7" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="96.3" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="97.3" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="98" width="100" height="2" fill="url(#border-black-fade-h)" />
        </svg>
        {/* Knight Helm icon + HERO label */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, calc(-50% + ${(1 / ROWS) * 100 / 5}%))`,
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px',
          pointerEvents: 'none', zIndex: 1,
        }}>
          {/*
            Knight Helm — solid white silhouette, viewBox 0 0 24 26
            • Dome: curves from apex y=2 down to shoulder flanges y=21
            • Neck guards: left x=7-10, right x=14-17, height y=21-24
            • T-visor (evenodd cutout):
                eye slit  y=13-15, x=7-17
                nose bar  y=15-19, x=11-13
          */}
          <svg
            viewBox="0 0 24 26"
            width="20"
            height="22"
            fill="white"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}
          >
            <path
              fillRule="evenodd"
              d="
                M 12,2
                C 7,2 5,7 5,12
                L 5,18
                Q 5,20 7,21
                L 7,24 L 10,24 L 10,21
                L 14,21
                L 14,24 L 17,24 L 17,21
                Q 19,20 19,18
                L 19,12
                C 19,7 17,2 12,2 Z
                M 7,13 L 17,13 L 17,15 L 7,15 Z
                M 11,15 L 13,15 L 13,19 L 11,19 Z
              "
            />
          </svg>
          <span style={{
            color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.15em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          }}>Hero</span>
        </div>
      </div>

      {/* Vertical Divider - CITY/HERO */}
      <div style={{
        position: 'absolute',
        left: `${(1.6 / COLS) * 100}%`,
        top: `${cellCenter('A', 12).top}%`,
        width: '3px',
        height: `${(0.5 / ROWS) * 100}%`,
        transform: 'translate(-50%, 0%)',
        zIndex: 6,
        pointerEvents: 'none',
      }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 3 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="1" height="100" fill="url(#border-black-fade-v)" />
          <rect x="1" y="0" width="1.5" height="100" fill="url(#border-fade-v)" />
          <rect x="2.5" y="0" width="0.5" height="100" fill="url(#border-black-fade-v)" />
        </svg>
      </div>

      {/* Vertical Divider - HERO/EQUIPMENT */}
      <div style={{
        position: 'absolute',
        left: `${(3.2 / COLS) * 100}%`,
        top: `${cellCenter('A', 12).top}%`,
        width: '3px',
        height: `${(0.5 / ROWS) * 100}%`,
        transform: 'translate(-50%, 0%)',
        zIndex: 6,
        pointerEvents: 'none',
      }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 3 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="1" height="100" fill="url(#border-black-fade-v)" />
          <rect x="1" y="0" width="1.5" height="100" fill="url(#border-fade-v)" />
          <rect x="2.5" y="0" width="0.5" height="100" fill="url(#border-black-fade-v)" />
        </svg>
      </div>

      {/* Bottom Navigation - EQUIPMENT */}
      <div
        style={{
          position: 'absolute',
          left: `${(4.0 / COLS) * 100}%`,
          top: `${cellCenter('A', 12).top}%`,
          width: `${(1.6 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="100" height="100" fill="rgba(0, 0, 0, 0.4)" />
          <rect x="0" y="0" width="100" height="2" fill="url(#border-black-fade-h)" />
          <rect x="0" y="1.2" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="2.7" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="96.3" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="97.3" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="98" width="100" height="2" fill="url(#border-black-fade-h)" />
        </svg>
        {/* Crossed Swords icon + EQUIPMENT label */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, calc(-50% + ${(1 / ROWS) * 100 / 5}%))`,
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '3px',
          pointerEvents: 'none', zIndex: 1,
        }}>
          {/*
            Crossed Swords — solid white X silhouette, viewBox 0 0 24 24
            • Sword 1 (\): NW→SE parallelogram blade + pommel cap
            • Sword 2 (/): NE→SW parallelogram blade + pommel cap
            • Crossguard bumps at each handle (perpendicular stubs)
          */}
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="white"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}
          >
            {/* Sword 1: \ direction */}
            <path d="M 1,2 L 4,1 L 23,20 L 22,23 L 19,22 L 0,3 Z" />
            {/* Sword 2: / direction */}
            <path d="M 20,1 L 23,2 L 4,23 L 1,22 L 2,19 L 21,0 Z" />
            {/* Crossguard 1 (near NW handle, / orientation) */}
            <path d="M 1,7 L 3,5 L 7,9 L 5,11 Z" />
            {/* Crossguard 2 (near NE handle, \ orientation) */}
            <path d="M 17,5 L 19,3 L 23,7 L 21,9 Z" />
          </svg>
          <span style={{
            color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '9px', fontWeight: 600,
            letterSpacing: '0.12em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          }}>Equipment</span>
        </div>
      </div>

      {/* Vertical Divider - EQUIPMENT/PET */}
      <div style={{
        position: 'absolute',
        left: `${(4.8 / COLS) * 100}%`,
        top: `${cellCenter('A', 12).top}%`,
        width: '3px',
        height: `${(0.5 / ROWS) * 100}%`,
        transform: 'translate(-50%, 0%)',
        zIndex: 6,
        pointerEvents: 'none',
      }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 3 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="1" height="100" fill="url(#border-black-fade-v)" />
          <rect x="1" y="0" width="1.5" height="100" fill="url(#border-fade-v)" />
          <rect x="2.5" y="0" width="0.5" height="100" fill="url(#border-black-fade-v)" />
        </svg>
      </div>

      {/* Bottom Navigation - PET */}
      <div
        style={{
          position: 'absolute',
          left: `${(5.6 / COLS) * 100}%`,
          top: `${cellCenter('A', 12).top}%`,
          width: `${(1.6 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="100" height="100" fill="rgba(0, 0, 0, 0.4)" />
          <rect x="0" y="0" width="100" height="2" fill="url(#border-black-fade-h)" />
          <rect x="0" y="1.2" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="2.7" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="96.3" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="97.3" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="98" width="100" height="2" fill="url(#border-black-fade-h)" />
        </svg>
        {/* Paw Print icon + PET label */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, calc(-50% + ${(1 / ROWS) * 100 / 5}%))`,
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px',
          pointerEvents: 'none', zIndex: 1,
        }}>
          {/*
            Paw Print — solid white silhouette, viewBox 0 0 24 26
            • 4 toe-bean ovals arched above the main pad
            • Main central pad: rounded oval
          */}
          <svg
            viewBox="0 0 24 26"
            width="20"
            height="22"
            fill="white"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}
          >
            {/* Main pad */}
            <ellipse cx="12" cy="19" rx="7" ry="6" />
            {/* Toe 1 — far left */}
            <ellipse cx="5" cy="9" rx="2.8" ry="3.5" transform="rotate(-15 5 9)" />
            {/* Toe 2 — center-left */}
            <ellipse cx="9.5" cy="6" rx="2.8" ry="3.5" transform="rotate(-5 9.5 6)" />
            {/* Toe 3 — center-right */}
            <ellipse cx="14.5" cy="6" rx="2.8" ry="3.5" transform="rotate(5 14.5 6)" />
            {/* Toe 4 — far right */}
            <ellipse cx="19" cy="9" rx="2.8" ry="3.5" transform="rotate(15 19 9)" />
          </svg>
          <span style={{
            color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.15em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          }}>Pet</span>
        </div>
      </div>

      {/* Vertical Divider - PET/ARTIFACT */}
      <div style={{
        position: 'absolute',
        left: `${(6.4 / COLS) * 100}%`,
        top: `${cellCenter('A', 12).top}%`,
        width: '3px',
        height: `${(0.5 / ROWS) * 100}%`,
        transform: 'translate(-50%, 0%)',
        zIndex: 6,
        pointerEvents: 'none',
      }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 3 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="1" height="100" fill="url(#border-black-fade-v)" />
          <rect x="1" y="0" width="1.5" height="100" fill="url(#border-fade-v)" />
          <rect x="2.5" y="0" width="0.5" height="100" fill="url(#border-black-fade-v)" />
        </svg>
      </div>

      {/* Bottom Navigation - ARTIFACT */}
      <div
        style={{
          position: 'absolute',
          left: `${(7.2 / COLS) * 100}%`,
          top: `${cellCenter('A', 12).top}%`,
          width: `${(1.6 / COLS) * 100}%`,
          height: `${(1 / ROWS) * 100}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="100" height="100" fill="rgba(0, 0, 0, 0.4)" />
          <rect x="0" y="0" width="100" height="2" fill="url(#border-black-fade-h)" />
          <rect x="0" y="1.2" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="2.7" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="96.3" width="100" height="1" fill="url(#border-black-fade-h)" />
          <rect x="0" y="97.3" width="100" height="1.5" fill="url(#border-fade-h)" />
          <rect x="0" y="98" width="100" height="2" fill="url(#border-black-fade-h)" />
        </svg>
        {/* Magic Orb icon + ARTIFACT label */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, calc(-50% + ${(1 / ROWS) * 100 / 5}%))`,
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '3px',
          pointerEvents: 'none', zIndex: 1,
        }}>
          {/*
            Magic Orb on Stand — solid white silhouette, viewBox 0 0 22 28
            • Orb: circle cx=11 cy=11 r=9
            • Rune cross cutout (evenodd): vertical + horizontal bars inside orb
            • Neck: tapered trapezoid below orb
            • Base: wider platform at bottom
          */}
          <svg
            viewBox="0 0 22 28"
            width="17"
            height="22"
            fill="white"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.95))' }}
          >
            {/* Orb with rune cross cutout */}
            <path
              fillRule="evenodd"
              d="
                M 11,1
                C 5.5,1 1,5.5 1,11
                C 1,16.5 5.5,21 11,21
                C 16.5,21 21,16.5 21,11
                C 21,5.5 16.5,1 11,1 Z
                M 10,5 L 12,5 L 12,17 L 10,17 Z
                M 4,10 L 18,10 L 18,12 L 4,12 Z
              "
            />
            {/* Stand neck */}
            <path d="M 10,21 L 12,21 L 13.5,24 L 8.5,24 Z" />
            {/* Stand base */}
            <path d="M 6,24 L 16,24 L 17,27 L 5,27 Z" />
          </svg>
          <span style={{
            color: '#ffffff', fontFamily: "'Playfair Display', serif", fontSize: '10px', fontWeight: 600,
            letterSpacing: '0.12em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          }}>Artifact</span>
        </div>
      </div>



      {/* ── Grid open: dim overlay behind grid ── */}
      {showGrid && (
        <div
          style={{
            position:      'absolute',
            inset:         0,
            zIndex:        14,
            background:    'rgba(0, 0, 0, 0.52)',
            pointerEvents: 'none',
            transition:    'opacity 0.25s ease',
          }}
        />
      )}

      {/* ── Grid overlay — canvas-based 10×10 (rendered via gridCanvasRef useEffect) ── */}
      <canvas
        ref={gridCanvasRef}
        style={{
          position:        'absolute',
          inset:           0,
          zIndex:          15,
          pointerEvents:   'none',
          transformOrigin: '0 0',
          transform:       `translate(${gridViewRef.current.panX}px,${gridViewRef.current.panY}px) scale(${gridViewRef.current.zoom})`,
          transition:      gridSelectMode ? 'none' : 'transform 0.45s cubic-bezier(0.25,0.8,0.25,1)',
        }}
      />

      {/* ── Grid select mode: transparent blocking overlay ── */}
      {/* Sits above all interactive UI buttons (z≤10) but below dev toolbar (z=40) */}
      {/* Lets mouse events bubble up to container → handleMouseUp handles grid cell toggle */}
      {gridSelectMode && showGrid && (
        <div
          style={{
            position:      'absolute',
            inset:         0,
            zIndex:        35,
            pointerEvents: 'auto',
            cursor:        bucketMode ? 'cell' : 'crosshair',
            background:    'transparent',
          }}
        />
      )}

      {/* ── Selected cells panel ── */}
      {showGrid && selectedCells.size > 0 && (
        <div
          style={{
            position:       'absolute',
            top:            '50px',
            right:          '16px',
            zIndex:         50,
            background:     'rgba(0,0,0,0.88)',
            border:         '1px solid rgba(255,220,80,0.45)',
            borderRadius:   '8px',
            padding:        '8px 12px',
            backdropFilter: 'blur(10px)',
            maxWidth:       '220px',
            display:        'flex',
            flexDirection:  'column',
            gap:            '6px',
          }}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <div style={{ color: 'rgba(255,220,80,0.9)', fontSize: '9px', fontFamily: "'Playfair Display', serif", fontWeight: 700, letterSpacing: '0.1em' }}>
            Selected: {selectedCells.size} cells
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={copySelectedCells}
              style={{
                flex: 1, background: gridCopied ? 'rgba(80,200,80,0.2)' : 'rgba(255,220,80,0.15)',
                border: `1px solid ${gridCopied ? 'rgba(80,200,80,0.5)' : 'rgba(255,220,80,0.4)'}`,
                color: gridCopied ? '#88ff88' : 'rgba(255,220,80,0.9)', fontSize: '8px',
                fontFamily: "'Playfair Display', serif", letterSpacing: '0.1em', padding: '3px 8px',
                borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s',
              }}
            >{gridCopied ? 'COPIED ✓' : 'COPY'}</button>
            <button
              onClick={() => setSelectedCells(new Set())}
              style={{
                flex: 1, background: 'transparent', border: '1px solid rgba(255,80,80,0.35)',
                color: 'rgba(255,100,100,0.8)', fontSize: '8px', fontFamily: "'Playfair Display', serif",
                letterSpacing: '0.1em', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
              }}
            >CLEAR</button>
          </div>
        </div>
      )}

      {/* ─ UI Assets ── */}
      {ASSETS.map(({ id, left, top, labelKey, img, interactive, widthCells, heightCells, labelCenter } : any) => {
        const label = labelKey ? t(labelKey) : undefined;
        return (
          <div
            key={id}
            style={{
              position:      'absolute',
              left:          `${left}%`,
              top:           `${top}%`,
              width:         `${CW * (widthCells ?? 1)}%`,
              height:        `${CH * (heightCells ?? 1)}%`,
              transform:     'translate(-50%, -50%)',
              zIndex:        5,
              pointerEvents: 'none',
            }}
          >
            <div
              ref={(el) => {
                if (el && interactive) {
                  btnDivRefs.current.set(id, el);
                  if (!imgRefs.current.has(id)) {
                    const hitDiv = document.createElement('div');
                    hitDiv.style.position = 'absolute';
                    hitDiv.style.inset = '0';
                    hitDiv.style.opacity = '0';
                    imgRefs.current.set(id, hitDiv as any);
                  }
                } else if (!el) {
                  btnDivRefs.current.delete(id);
                }
              }}
              style={{
                width:    '100%',
                height:   '100%',
                position: 'relative',
              }}
            >
              {img ? (
                <img
                  ref={(el) => {
                    if (el) imgRefs.current.set(id, el);
                    else imgRefs.current.delete(id);
                  }}
                  src={img}
                  alt=""
                  crossOrigin="anonymous"
                  style={{
                    width:         '100%',
                    height:        '100%',
                    objectFit:     'fill',
                    display:       'block',
                    pointerEvents: 'none',
                  }}
                />
              ) : (
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                  }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id={`fade-${id}`} x1="100%" y1="0%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="rgba(0, 0, 0, 0)" />
                      <stop offset="15%" stopColor="rgba(0, 0, 0, 0.6)" />
                      <stop offset="85%" stopColor="rgba(0, 0, 0, 0.6)" />
                      <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
                    </linearGradient>
                    <linearGradient id={`border-fade-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(255, 215, 0, 0)" />
                      <stop offset="12%" stopColor="rgba(255, 215, 0, 1)" />
                      <stop offset="88%" stopColor="rgba(255, 215, 0, 1)" />
                      <stop offset="100%" stopColor="rgba(255, 215, 0, 0)" />
                    </linearGradient>
                    <linearGradient id={`border-black-fade-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(0, 0, 0, 0)" />
                      <stop offset="12%" stopColor="rgba(0, 0, 0, 1)" />
                      <stop offset="88%" stopColor="rgba(0, 0, 0, 1)" />
                      <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
                    </linearGradient>
                  </defs>
                  {/* Background */}
                  <rect x="0" y="0" width="100" height="100" fill={`url(#fade-${id})`} />

                  {/* Top border - black outline top */}
                  <rect x="0" y="0" width="100" height="2" fill={`url(#border-black-fade-${id})`} />
                  {/* Top border - gold center */}
                  <rect x="0" y="1.2" width="100" height="1.5" fill={`url(#border-fade-${id})`} />
                  {/* Top border - black outline bottom */}
                  <rect x="0" y="2.7" width="100" height="1" fill={`url(#border-black-fade-${id})`} />

                  {/* Bottom border - black outline top */}
                  <rect x="0" y="96.3" width="100" height="1" fill={`url(#border-black-fade-${id})`} />
                  {/* Bottom border - gold center */}
                  <rect x="0" y="97.3" width="100" height="1.5" fill={`url(#border-fade-${id})`} />
                  {/* Bottom border - black outline bottom */}
                  <rect x="0" y="98" width="100" height="2" fill={`url(#border-black-fade-${id})`} />
                </svg>
              )}
              {label && !labelCenter && (
                <span
                  style={{
                    position:      'absolute',
                    left:          '50%',
                    top:           '50%',
                    transform:     'translate(-50%, -50%)',
                    color:         '#ffffff',
                    fontSize:      '11px',
                    fontFamily:    "'Playfair Display', serif",
                    fontWeight:    600,
                    letterSpacing: '0.15em',
                    whiteSpace:    'nowrap',
                    textShadow:    '0 1px 6px rgba(0,0,0,0.8)',
                    pointerEvents: 'none',
                    zIndex:        1,
                  }}
                >
                  {label}
                </span>
              )}
              {label && labelCenter && (
                <span
                  style={{
                    position:      'absolute',
                    left:          '50%',
                    top:           '50%',
                    transform:     'translate(-50%, -50%)',
                    color:         '#ffffff',
                    fontSize:      '10px',
                    fontFamily:    "'Playfair Display', serif",
                    fontWeight:    600,
                    letterSpacing: '0.18em',
                    whiteSpace:    'nowrap',
                    textShadow:    '0 1px 6px rgba(0,0,0,0.8)',
                    pointerEvents: 'none',
                    zIndex:        10,
                  }}
                >
                  {label}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Coordinate info panel ── */}
      {drawMode && coordInfo && (
        <div
          style={{
            position:       'absolute',
            top:            '12px',
            left:           '50%',
            transform:      'translateX(-50%)',
            zIndex:         50,
            background:     'rgba(0,0,0,0.82)',
            border:         '1px solid rgba(255,255,255,0.18)',
            borderRadius:   '8px',
            padding:        '10px 14px',
            backdropFilter: 'blur(10px)',
            maxWidth:       '90vw',
            display:        'flex',
            flexDirection:  'column',
            gap:            '6px',
          }}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          {/* Bounding box */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {(['x','y','w','h'] as const).map(k => (
              <span key={k} style={{ color: '#aaa', fontSize: '10px', fontFamily: "'Playfair Display', serif" }}>
                <span style={{ color: '#ffcc44' }}>{k}</span>
                {': '}
                <span style={{ color: '#fff' }}>{coordInfo.bbox[k === 'w' ? 'w' : k === 'h' ? 'h' : k]}%</span>
              </span>
            ))}
          </div>

          {/* Polygon string (truncated) */}
          <div
            style={{
              fontFamily:   "'Playfair Display', serif",
              fontSize:     '9px',
              color:        '#88ddff',
              maxWidth:     '320px',
              whiteSpace:   'nowrap',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {coordInfo.polygon}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
            <button
              onClick={() => {
                const text =
                  `bbox: left:${coordInfo.bbox.x}% top:${coordInfo.bbox.y}% width:${coordInfo.bbox.w}% height:${coordInfo.bbox.h}%\n` +
                  `clipPath: ${coordInfo.polygon}`;
                // Fallback copy — works even when Clipboard API is blocked by permissions policy
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity  = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                try { document.execCommand('copy'); } catch (_) { /* ignore */ }
                document.body.removeChild(ta);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              style={{
                background:    copied ? 'rgba(80,200,80,0.2)' : 'rgba(255,255,255,0.1)',
                border:        `1px solid ${copied ? 'rgba(80,200,80,0.5)' : 'rgba(255,255,255,0.25)'}`,
                color:         copied ? '#88ff88' : '#fff',
                fontSize:      '9px',
                fontFamily:    "'Playfair Display', serif",
                letterSpacing: '0.1em',
                padding:       '3px 10px',
                borderRadius:  '4px',
                cursor:        'pointer',
                transition:    'all 0.2s',
              }}
            >
              {copied ? 'COPIED ✓' : 'COPY'}
            </button>
            <button
              onClick={() => { clearCanvas(); }}
              style={{
                background:    'transparent',
                border:        '1px solid rgba(255,80,80,0.35)',
                color:         'rgba(255,100,100,0.8)',
                fontSize:      '9px',
                fontFamily:    "'Playfair Display', serif",
                letterSpacing: '0.1em',
                padding:       '3px 10px',
                borderRadius:  '4px',
                cursor:        'pointer',
              }}
            >
              CLEAR
            </button>
          </div>
        </div>
      )}

      {/* ── Draw canvas overlay ── */}
      <canvas
        ref={canvasRef}
        style={{
          position:      'absolute',
          inset:         0,
          zIndex:        20,
          pointerEvents: 'none', // container handles all events
          opacity:       1,
        }}
      />

      {/* ── Draw toolbar ── */}
      {drawMode && (
        <div
          style={{
            position:       'absolute',
            bottom:         '60px',
            left:           '50%',
            transform:      'translateX(-50%)',
            zIndex:         40,
            display:        'flex',
            alignItems:     'center',
            gap:            '10px',
            background:     'rgba(0,0,0,0.65)',
            border:         '1px solid rgba(255,255,255,0.15)',
            borderRadius:   '10px',
            padding:        '8px 14px',
            backdropFilter: 'blur(10px)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Colour swatches */}
          {COLORS.map(c => (
            <button
              key={c}
              onClick={(e) => { e.stopPropagation(); setColor(c); }}
              style={{
                width:        '20px',
                height:       '20px',
                borderRadius: '50%',
                background:   c,
                border:       color === c ? '2px solid #fff' : '2px solid transparent',
                cursor:       'pointer',
                padding:      0,
                flexShrink:   0,
                boxShadow:    color === c ? '0 0 6px rgba(255,255,255,0.6)' : 'none',
                transition:   'box-shadow 0.15s, border 0.15s',
              }}
            />
          ))}

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />

          {/* Line width */}
          {[2, 4, 8, 16].map(w => (
            <button
              key={w}
              onClick={(e) => { e.stopPropagation(); setLineWidth(w); }}
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                width:          '28px',
                height:         '28px',
                borderRadius:   '6px',
                background:     lineWidth === w ? 'rgba(255,255,255,0.2)' : 'transparent',
                border:         lineWidth === w ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent',
                cursor:         'pointer',
                padding:        0,
                transition:     'background 0.15s',
              }}
            >
              <div
                style={{
                  width:        `${Math.min(w * 1.4, 22)}px`,
                  height:       `${Math.max(w * 0.5, 2)}px`,
                  borderRadius: '2px',
                  background:   color,
                }}
              />
            </button>
          ))}

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />

          {/* Clear */}
          <button
            onClick={(e) => { e.stopPropagation(); clearCanvas(); }}
            style={{
              background:    'transparent',
              border:        '1px solid rgba(255,80,80,0.5)',
              color:         'rgba(255,100,100,0.9)',
              fontSize:      '10px',
              fontFamily:    "'Playfair Display', serif",
              letterSpacing: '0.1em',
              padding:       '4px 10px',
              borderRadius:  '5px',
              cursor:        'pointer',
              whiteSpace:    'nowrap',
            }}
          >
            CLEAR
          </button>
        </div>
      )}

      {/* ── Toggle draw mode button ── */}
      <button
        onClick={(e) => { e.stopPropagation(); setDrawMode(v => !v); if (gridSelectMode) setGridSelectMode(false); }}
        style={{
          position:       'absolute',
          bottom:         `calc(${(2 / ROWS) * 100}% + 16px)`,
          right:          '16px',
          zIndex:         40,
          display:        'flex',
          alignItems:     'center',
          gap:            '6px',
          background:     drawMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.5)',
          border:         drawMode
            ? '1px solid rgba(255,255,255,0.5)'
            : '1px solid rgba(255,255,255,0.25)',
          color:          '#fff',
          fontSize:       '10px',
          fontFamily:     "'Playfair Display', serif",
          letterSpacing:  '0.12em',
          padding:        '6px 14px',
          borderRadius:   '6px',
          cursor:         'pointer',
          backdropFilter: 'blur(6px)',
          boxShadow:      drawMode ? '0 0 10px rgba(255,255,255,0.15)' : 'none',
          transition:     'all 0.2s',
        }}
      >
        {/* Pencil icon (inline SVG, no lib dependency) */}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
        {drawMode ? 'EXIT DRAW' : 'DRAW'}
      </button>

      {/* ── Toggle grid button ── */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowGrid(v => { if (v) setGridSelectMode(false); return !v; }); }}
        style={{
          position:       'absolute',
          bottom:         `calc(${(2 / ROWS) * 100}% + 16px)`,
          right:          '112px',
          zIndex:         40,
          display:        'flex',
          alignItems:     'center',
          gap:            '6px',
          background:     showGrid ? 'rgba(255,220,80,0.18)' : 'rgba(0,0,0,0.5)',
          border:         showGrid
            ? '1px solid rgba(255,220,80,0.6)'
            : '1px solid rgba(255,255,255,0.25)',
          color:          showGrid ? 'rgba(255,220,80,1)' : '#fff',
          fontSize:       '10px',
          fontFamily:     "'Playfair Display', serif",
          letterSpacing:  '0.12em',
          padding:        '6px 14px',
          borderRadius:   '6px',
          cursor:         'pointer',
          backdropFilter: 'blur(6px)',
          boxShadow:      showGrid ? '0 0 10px rgba(255,220,80,0.2)' : 'none',
          transition:     'all 0.2s',
        }}
      >
        {/* Grid icon */}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        {showGrid ? 'HIDE GRID' : 'GRID'}
      </button>

      {/* ── Toggle grid SELECT mode button ── */}
      {showGrid && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setGridSelectMode(v => {
              if (v) {
                setBucketMode(false);
                gridViewRef.current = { zoom: 1, panX: 0, panY: 0 };
                setGridViewVer(vv => vv + 1);
              }
              return !v;
            });
            if (drawMode) setDrawMode(false);
          }}
          style={{
            position:       'absolute',
            bottom:         `calc(${(2 / ROWS) * 100}% + 16px)`,
            right:          '208px',
            zIndex:         40,
            display:        'flex',
            alignItems:     'center',
            gap:            '6px',
            background:     gridSelectMode ? 'rgba(255,120,0,0.25)' : 'rgba(0,0,0,0.5)',
            border:         gridSelectMode ? '1px solid rgba(255,120,0,0.7)' : '1px solid rgba(255,255,255,0.25)',
            color:          gridSelectMode ? 'rgba(255,180,80,1)' : '#fff',
            fontSize:       '10px',
            fontFamily:     "'Playfair Display', serif",
            letterSpacing:  '0.12em',
            padding:        '6px 14px',
            borderRadius:   '6px',
            cursor:         'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow:      gridSelectMode ? '0 0 10px rgba(255,120,0,0.25)' : 'none',
            transition:     'all 0.2s',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3l14 9-7 1-4 6z"/>
          </svg>
          {gridSelectMode ? 'EXIT SELECT' : 'SELECT'}
        </button>
      )}

      {/* ── Bucket (flood fill) tool button ── */}
      {showGrid && gridSelectMode && (
        <button
          onClick={(e) => { e.stopPropagation(); setBucketMode(v => !v); }}
          style={{
            position:       'absolute',
            bottom:         `calc(${(2 / ROWS) * 100}% + 16px)`,
            right:          '316px',
            zIndex:         40,
            display:        'flex',
            alignItems:     'center',
            gap:            '6px',
            background:     bucketMode ? 'rgba(80,180,255,0.25)' : 'rgba(0,0,0,0.5)',
            border:         bucketMode ? '1px solid rgba(80,180,255,0.7)' : '1px solid rgba(255,255,255,0.25)',
            color:          bucketMode ? 'rgba(140,210,255,1)' : '#fff',
            fontSize:       '10px',
            fontFamily:     "'Playfair Display', serif",
            letterSpacing:  '0.12em',
            padding:        '6px 14px',
            borderRadius:   '6px',
            cursor:         'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow:      bucketMode ? '0 0 10px rgba(80,180,255,0.3)' : 'none',
            transition:     'all 0.2s',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
          {bucketMode ? 'FILL ON' : 'FILL'}
        </button>
      )}

      {/* ── Grid zoom indicator + controls ── */}
      {showGrid && gridSelectMode && (
        <div
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          style={{
            position:       'absolute',
            bottom:         `calc(${(2 / ROWS) * 100}% + 16px)`,
            right:          '424px',
            zIndex:         40,
            display:        'flex',
            alignItems:     'center',
            gap:            '4px',
            background:     'rgba(0,0,0,0.55)',
            border:         '1px solid rgba(255,255,255,0.2)',
            borderRadius:   '6px',
            padding:        '3px 8px',
            backdropFilter: 'blur(6px)',
          }}
        >
          {/* Zoom out */}
          <button
            onClick={() => {
              const container = containerRef.current;
              if (!container) return;
              const rect = container.getBoundingClientRect();
              applyGridZoom(gridViewRef.current.zoom * 0.8, rect.width / 2, rect.height / 2, rect.width, rect.height);
            }}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
          >−</button>
          {/* Zoom level display */}
          <span style={{ color: gridViewRef.current.zoom > 1 ? 'rgba(140,210,255,1)' : 'rgba(255,255,255,0.6)', fontSize: '9px', fontFamily: "'Playfair Display', serif", minWidth: '30px', textAlign: 'center', letterSpacing: '0.08em' }}>
            {gridViewRef.current.zoom.toFixed(1)}×
          </span>
          {/* Zoom in */}
          <button
            onClick={() => {
              const container = containerRef.current;
              if (!container) return;
              const rect = container.getBoundingClientRect();
              applyGridZoom(gridViewRef.current.zoom * 1.25, rect.width / 2, rect.height / 2, rect.width, rect.height);
            }}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
          >+</button>
          {/* Reset */}
          {gridViewRef.current.zoom > 1 && (
            <button
              onClick={resetGridView}
              style={{ background: 'none', border: 'none', color: 'rgba(255,160,80,0.9)', fontSize: '8px', fontFamily: "'Playfair Display', serif", cursor: 'pointer', padding: '0 2px', letterSpacing: '0.08em' }}
            >RESET</button>
          )}
        </div>
      )}

      {/* Zoom hint when SELECT mode first enabled */}
      {showGrid && gridSelectMode && gridViewRef.current.zoom === 1 && (
        <div
          style={{
            position:   'absolute',
            bottom:     `calc(${(2 / ROWS) * 100}% + 50px)`,
            right:      '208px',
            zIndex:     40,
            color:      'rgba(255,255,255,0.45)',
            fontSize:   '8px',
            fontFamily: "'Playfair Display', serif",
            letterSpacing: '0.08em',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Scroll wheel: zoom · Right-click drag: pan
        </div>
      )}

      <CurrencyDebug />

      {/* ── Settings dim overlay ── */}
      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{
            position:   'absolute',
            inset:      0,
            background: 'rgba(0,0,0,0.42)',
            zIndex:     60,
            cursor:     'default',
          }}
        />
      )}

      {/* ── Settings popup ── */}
      {settingsOpen && (
        <div
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            left:     '30%',
            top:      '30%',
            width:    '40%',
            height:   '40%',
            zIndex:   61,
          }}
        >
          {/* ── SVG frame + background ── */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            <defs>
              {/* Horizontal fade: transparent → black 40% → transparent */}
              <linearGradient id="settings-bg-h" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
                <stop offset="14%"  stopColor="rgba(0,0,0,0.40)" />
                <stop offset="86%"  stopColor="rgba(0,0,0,0.40)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </linearGradient>
              {/* Symmetric gold border gradient */}
              <linearGradient id="settings-gold-h" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="rgba(255,215,0,0)" />
                <stop offset="14%"  stopColor="rgba(255,215,0,0.85)" />
                <stop offset="50%"  stopColor="rgba(255,215,0,1)" />
                <stop offset="86%"  stopColor="rgba(255,215,0,0.85)" />
                <stop offset="100%" stopColor="rgba(255,215,0,0)" />
              </linearGradient>
              {/* Symmetric black border gradient */}
              <linearGradient id="settings-blk-h" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
                <stop offset="14%"  stopColor="rgba(0,0,0,0.80)" />
                <stop offset="50%"  stopColor="rgba(0,0,0,1)" />
                <stop offset="86%"  stopColor="rgba(0,0,0,0.80)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </linearGradient>
            </defs>

            {/* ── Solid black 40% base ── */}
            <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.40)" />

            {/* ── Left fade overlay ── */}
            <defs>
              <linearGradient id="settings-fade-l" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="rgba(0,0,0,0.62)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </linearGradient>
              <linearGradient id="settings-fade-r" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.62)" />
              </linearGradient>
            </defs>
            <rect x="0"  y="0" width="14" height="100" fill="url(#settings-fade-l)" />
            <rect x="86" y="0" width="14" height="100" fill="url(#settings-fade-r)" />

            {/* ── Top frame — triple line (black / gold / black) ── */}
            <rect x="0" y="0"   width="100" height="2"   fill="url(#settings-blk-h)" />
            <rect x="0" y="1.2" width="100" height="1.5" fill="url(#settings-gold-h)" />
            <rect x="0" y="2.7" width="100" height="1"   fill="url(#settings-blk-h)" />

            {/* ── Bottom frame — triple line (black / gold / black) ── */}
            <rect x="0" y="96.3" width="100" height="1"   fill="url(#settings-blk-h)" />
            <rect x="0" y="97.3" width="100" height="1.5" fill="url(#settings-gold-h)" />
            <rect x="0" y="98"   width="100" height="2"   fill="url(#settings-blk-h)" />
          </svg>

          {/* ── Title ── */}
          <div style={{
            position:   'absolute',
            top:        '10%',
            left:       '50%',
            transform:  'translateX(-50%)',
            color:      'rgba(255,215,0,0.92)',
            fontFamily: "'Playfair Display', serif",
            fontSize:   'clamp(7px, 1.4vw, 13px)',
            fontWeight: 700,
            letterSpacing: '0.22em',
            textShadow: '0 1px 6px rgba(0,0,0,0.9)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            SETTINGS
          </div>

          {/* ── Decorative gold divider under title ── */}
          <svg
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
            style={{
              position:      'absolute',
              top:           '22%',
              left:          '10%',
              width:         '80%',
              height:        '3px',
              pointerEvents: 'none',
            }}
          >
            <defs>
              <linearGradient id="settings-divider" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="rgba(255,215,0,0)" />
                <stop offset="30%"  stopColor="rgba(255,215,0,0.7)" />
                <stop offset="50%"  stopColor="rgba(255,215,0,1)" />
                <stop offset="70%"  stopColor="rgba(255,215,0,0.7)" />
                <stop offset="100%" stopColor="rgba(255,215,0,0)" />
              </linearGradient>
            </defs>
            <rect x="0" y="1" width="100" height="1.5" fill="url(#settings-divider)" />
          </svg>

          {/* ── BGM label + toggle row ── */}
          <div style={{
            position:       'absolute',
            top:            '30%',
            left:           '16%',
            right:          '16%',
            display:        'flex',
            alignItems:     'center',
            gap:            '7px',
            pointerEvents:  'auto',
          }}>
            {/* Speaker icon */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }}>
              <path d="M11 5L6 9H2v6h4l5 4V5z"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
            </svg>
            <span style={{
              color:         '#ffffff',
              fontFamily:    "'Playfair Display', serif",
              fontSize:      'clamp(6px, 1.1vw, 10px)',
              fontWeight:    600,
              letterSpacing: '0.12em',
              whiteSpace:    'nowrap',
              textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
              flex:          1,
            }}>BGM</span>
            {/* ON/OFF toggle pill */}
            <div
              onClick={() => {
                const next = !bgmEnabled;
                setBgmEnabledUI(next);
                setBgmEnabled(next);
              }}
              style={{
                position:       'relative',
                width:          'clamp(28px, 5vw, 44px)',
                height:         'clamp(14px, 2.4vw, 22px)',
                borderRadius:   '999px',
                background:     bgmEnabled ? '#FF7000' : 'rgba(255,255,255,0.18)',
                border:         bgmEnabled ? '1px solid rgba(255,180,80,0.7)' : '1px solid rgba(255,255,255,0.25)',
                cursor:         'pointer',
                transition:     'background 0.22s, border 0.22s',
                flexShrink:     0,
                boxShadow:      bgmEnabled ? '0 0 6px rgba(255,140,0,0.5)' : 'none',
              }}
            >
              {/* Thumb */}
              <div style={{
                position:   'absolute',
                top:        '50%',
                left:       bgmEnabled ? 'calc(100% - clamp(12px, 2.1vw, 19px) - 1px)' : '1px',
                transform:  'translateY(-50%)',
                width:      'clamp(12px, 2.1vw, 19px)',
                height:     'clamp(12px, 2.1vw, 19px)',
                borderRadius: '50%',
                background: '#ffffff',
                boxShadow:  '0 1px 4px rgba(0,0,0,0.5)',
                transition: 'left 0.22s',
              }} />
              {/* ON/OFF label */}
              <span style={{
                position:   'absolute',
                top:        '50%',
                left:       bgmEnabled ? '4px' : 'auto',
                right:      bgmEnabled ? 'auto' : '3px',
                transform:  'translateY(-50%)',
                fontSize:   'clamp(4px, 0.7vw, 7px)',
                fontFamily: "'Playfair Display', serif",
                fontWeight: 700,
                color:      bgmEnabled ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                letterSpacing: '0.05em',
                pointerEvents: 'none',
              }}>{bgmEnabled ? 'ON' : 'OFF'}</span>
            </div>
          </div>

          {/* ── BGM volume slider row: [-] [bar] [+] [%] ── */}
          <div style={{
            position:       'absolute',
            top:            '52%',
            left:           '16%',
            right:          '16%',
            display:        'flex',
            alignItems:     'center',
            gap:            '6px',
            pointerEvents:  'auto',
            opacity:        bgmEnabled ? 1 : 0.4,
            transition:     'opacity 0.2s',
          }}>
            {/* [-] button */}
            <div
              onClick={() => {
                if (!bgmEnabled) return;
                const next = Math.max(0, bgmVol - 10);
                setBgmVolUI(next);
                setBgmVolume(next);
              }}
              style={{
                width:           'clamp(14px, 2.4vw, 20px)',
                height:          'clamp(14px, 2.4vw, 20px)',
                borderRadius:    '50%',
                background:      'rgba(0,0,0,0.55)',
                border:          '1px solid rgba(255,215,0,0.55)',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                cursor:          bgmEnabled ? 'pointer' : 'default',
                flexShrink:      0,
                color:           'rgba(255,215,0,1)',
                fontSize:        'clamp(8px, 1.4vw, 13px)',
                fontWeight:      700,
                lineHeight:      1,
                userSelect:      'none',
                transition:      'background 0.15s',
              }}
            >−</div>

            {/* Volume bar track */}
            <div style={{ position: 'relative', flex: 1, height: 'clamp(8px, 1.4vw, 12px)', borderRadius: '4px', overflow: 'hidden', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,215,0,0.25)' }}>
              {/* Fill */}
              <div style={{
                position:     'absolute',
                left:         0,
                top:          0,
                bottom:       0,
                width:        `${bgmVol}%`,
                background:   bgmEnabled ? 'linear-gradient(90deg, #ff9500 0%, #ffcc44 100%)' : 'rgba(255,255,255,0.25)',
                borderRadius: '4px',
                transition:   'width 0.15s',
              }} />
              {/* Shine */}
              <div style={{
                position:     'absolute',
                left:         0,
                top:          0,
                width:        `${bgmVol}%`,
                height:       '45%',
                background:   'rgba(255,255,255,0.18)',
                borderRadius: '4px 4px 0 0',
                pointerEvents:'none',
                transition:   'width 0.15s',
              }} />
            </div>

            {/* [+] button */}
            <div
              onClick={() => {
                if (!bgmEnabled) return;
                const next = Math.min(100, bgmVol + 10);
                setBgmVolUI(next);
                setBgmVolume(next);
              }}
              style={{
                width:           'clamp(14px, 2.4vw, 20px)',
                height:          'clamp(14px, 2.4vw, 20px)',
                borderRadius:    '50%',
                background:      'rgba(0,0,0,0.55)',
                border:          '1px solid rgba(255,215,0,0.55)',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                cursor:          bgmEnabled ? 'pointer' : 'default',
                flexShrink:      0,
                color:           'rgba(255,215,0,1)',
                fontSize:        'clamp(8px, 1.4vw, 13px)',
                fontWeight:      700,
                lineHeight:      1,
                userSelect:      'none',
                transition:      'background 0.15s',
              }}
            >+</div>

            {/* % label */}
            <span style={{
              color:         bgmEnabled ? 'rgba(255,215,0,1)' : 'rgba(255,255,255,0.4)',
              fontFamily:    "'Playfair Display', serif",
              fontSize:      'clamp(6px, 1vw, 9px)',
              fontWeight:    700,
              whiteSpace:    'nowrap',
              minWidth:      'clamp(18px, 3vw, 26px)',
              textAlign:     'right',
              textShadow:    '0 1px 3px rgba(0,0,0,0.8)',
              transition:    'color 0.2s',
            }}>{bgmVol}%</span>
          </div>

          {/* ── SFX volume row (static) ── */}
          <div style={{
            position:   'absolute',
            top:        '68%',
            left:       '16%',
            right:      '16%',
            display:    'flex',
            alignItems: 'center',
            gap:        '8px',
            pointerEvents: 'auto',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
            </svg>
            <span style={{
              color:         'rgba(255,255,255,0.5)',
              fontFamily:    "'Playfair Display', serif",
              fontSize:      'clamp(6px, 1.1vw, 10px)',
              fontWeight:    600,
              letterSpacing: '0.12em',
              whiteSpace:    'nowrap',
              textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
              flex:          1,
            }}>SFX</span>
            <span style={{
              color:         'rgba(255,255,255,0.3)',
              fontFamily:    "'Playfair Display', serif",
              fontSize:      'clamp(5px, 0.85vw, 8px)',
              fontStyle:     'italic',
              letterSpacing: '0.08em',
            }}>coming soon</span>
          </div>

          {/* ── Close button — round orange, white border, white X ── */}
          <div
            onClick={() => setSettingsOpen(false)}
            style={{
              position:  'absolute',
              top:       0,
              right:     0,
              transform: 'translate(38%, -38%)',
              width:     'clamp(16px, 3.2vw, 28px)',
              aspectRatio: '1 / 1',
              cursor:    'pointer',
              zIndex:    3,
            }}
          >
            <svg viewBox="0 0 40 40" width="100%" height="100%">
              {/* Orange circle */}
              <circle cx="20" cy="20" r="18" fill="#FF7000" />
              {/* White border ring */}
              <circle cx="20" cy="20" r="18" fill="none" stroke="white" strokeWidth="2.8" />
              {/* Inner subtle ring */}
              <circle cx="20" cy="20" r="13.5" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.2" />
              {/* White X */}
              <line x1="13" y1="13" x2="27" y2="27" stroke="white" strokeWidth="3.8" strokeLinecap="round" />
              <line x1="27" y1="13" x2="13" y2="27" stroke="white" strokeWidth="3.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}