import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { CurrencyDebug } from '../components/CurrencyDebug';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { GamePageLayout } from '../components/GamePageLayout';

const BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777396811/ChatGPT_Image_Apr_29_2026_12_19_32_AM_squmiv.png';

const COLS = 8;
const ROWS = 12;
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const GRID_COLS = 20;
const GRID_ROWS = 20;

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
  const [selectedCells,  setSelectedCells]  = useState<Set<string>>(new Set());
  const [gridSelectMode, setGridSelectMode] = useState(false);
  const [gridCopied,     setGridCopied]     = useState(false);
  const [bucketMode,     setBucketMode]     = useState(false);

  // ── Grid zoom / pan — declared BEFORE grid-canvas useEffect ───────────────
  const gridViewRef  = useRef({ zoom: 1, panX: 0, panY: 0 });
  const [gridViewVer, setGridViewVer] = useState(0);
  const isPanningRef = useRef(false);
  const panStartRef  = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // ── Coordinate tracking — declared early so draw helpers can close over them
  type CoordInfo = { bbox: { x: number; y: number; w: number; h: number }; polygon: string; };
  const [coordInfo, setCoordInfo] = useState<CoordInfo | null>(null);
  const [copied,    setCopied]    = useState(false);
  const allPoints       = useRef<{ px: number; py: number }[]>([]);
  const isDrawing       = useRef(false);
  const lastPos         = useRef<{ x: number; y: number } | null>(null);
  const isGridSelecting = useRef(false);
  const gridDragMode    = useRef<'add' | 'remove'>('add');
  const lastGridKey     = useRef<string | null>(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshProfile, user]);

  // ── Resize canvas to match container ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
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

  // ── Grid canvas: draw grid + selected cells ──────────────────────────────
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
      selectedCells.forEach(key => {
        const [cx, cy] = key.split(',').map(Number);
        ctx.fillStyle = 'rgba(255, 140, 0, 0.65)';
        ctx.fillRect(cx * cW, cy * cH, cW, cH);
        ctx.strokeStyle = 'rgba(255, 215, 50, 0.95)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(cx * cW + 0.5, cy * cH + 0.5, cW - 1, cH - 1);
      });
      ctx.strokeStyle = 'rgba(255, 220, 80, 1)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      for (let i = 0; i <= GRID_COLS; i++) { const x = i * cW; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let i = 0; i <= GRID_ROWS; i++) { const y = i * cH; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      const COL_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'];
      const labelSize   = Math.max(9, Math.floor(Math.min(cW, cH) * 0.22));
      ctx.shadowColor   = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur    = 4;
      ctx.fillStyle     = 'rgba(255, 220, 80, 1)';
      ctx.font          = `bold ${labelSize}px 'Roboto Condensed'`;
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
        ctx.font         = "bold 9px 'Roboto Condensed'";
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

  // ── Copy selected cells ──────────────────────────────────────────────────
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

  // ── Flood fill ────────────────────────────────────────────────────────────
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

  // ── Grid zoom / pan helpers ───────────────────────────────────────────────
  const applyGridZoom = useCallback((
    newZoom: number,
    pivotX: number,
    pivotY: number,
    containerW: number,
    containerH: number,
  ) => {
    const { zoom, panX, panY } = gridViewRef.current;
    const clamped = Math.min(12, Math.max(1, newZoom));
    const scale   = clamped / zoom;
    const rawPanX = pivotX - (pivotX - panX) * scale;
    const rawPanY = pivotY - (pivotY - panY) * scale;
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

  // ── Adventure button handlers ─────────────────────────────────────────────
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

  // ── Building press / release / cancel ────────────────────────────────────
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

  // ── Canvas draw helpers ───────────────────────────────────────────────────
  const getCanvasPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const getGridCell = (clientX: number, clientY: number): { cx: number; cy: number; key: string } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const { zoom, panX, panY } = gridViewRef.current;
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
    const step = Math.max(1, Math.floor(pts.length / 30));
    const sampled = pts.filter((_, i) => i % step === 0);
    const polygon = sampled.map(p => `${p.px.toFixed(1)}% ${p.py.toFixed(1)}%`).join(', ');
    setCoordInfo({ bbox, polygon: `polygon(${polygon})` });
  };

  const recordPoint = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const px = parseFloat(((x / canvas.width)  * 100).toFixed(2));
    const py = parseFloat(((y / canvas.height) * 100).toFixed(2));
    allPoints.current.push({ px, py });
  };

  // ── Asset hit detection ───────────────────────────────────────────────────
  const getHitAssetId = useCallback((clientX: number, clientY: number): string | null => {
    const container = containerRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const relX = ((clientX - containerRect.left) / containerRect.width) * 100;
    const relY = ((clientY - containerRect.top) / containerRect.height) * 100;
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
    for (const asset of ASSETS) {
      const imgEl = imgRefs.current.get(asset.id);
      if (!imgEl || !(imgEl instanceof HTMLImageElement)) continue;
      const alpha = getPixelAlpha(imgEl, clientX, clientY);
      if (alpha > 15) return asset.id;
    }
    return null;
  }, []);

  // ── Mouse events ──────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (drawMode) {
      isDrawing.current = true;
      const pos = getCanvasPos(e.clientX, e.clientY);
      lastPos.current = pos;
      drawDot(pos.x, pos.y);
      recordPoint(pos.x, pos.y);
      return;
    }
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

  // ─────────────────────────────────────────────────────────────────────────
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

      {/* ── Background ── */}
      <ImageWithFallback
        src={BG}
        alt=""
        className="absolute inset-0 size-full object-cover"
        draggable={false}
        style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
      />

      {/* ── ADVENTURE Button ── */}
      <div
        ref={adventureBtnRef}
        onMouseDown={(e) => { e.stopPropagation(); onAdventurePress(); }}
        onMouseUp={(e)   => { e.stopPropagation(); onAdventureRelease(true); }}
        onMouseLeave={onAdventureCancel}
        onTouchStart={(e) => { e.stopPropagation(); onAdventurePress(); }}
        onTouchEnd={(e)   => { e.stopPropagation(); onAdventureRelease(true); }}
        onTouchCancel={(e) => { e.stopPropagation(); onAdventureCancel(); }}
        style={{
          position:      'absolute',
          left:          `${(6 / COLS) * 100}%`,
          top:           `${((10 + 0.5) / ROWS) * 100}%`,
          width:         `${(2 / COLS) * 100}%`,
          height:        `${(0.72 / ROWS) * 100}%`,
          transform:     'translateY(-50%)',
          zIndex:        8,
          cursor:        'pointer',
          borderRadius:  '9999px',
          background:    '#FF7000',
          border:        '2.5px solid #ffffff',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'center',
          boxShadow:     '0 2px 12px rgba(255,112,0,0.65), 0 1px 4px rgba(0,0,0,0.5)',
        }}
      >
        <span style={{
          color:         '#ffffff',
          fontFamily:    "'Playfair Display', serif",
          fontSize:      'clamp(7px, 1.6vw, 12px)',
          fontWeight:    800,
          letterSpacing: '0.18em',
          textShadow:    '0 1px 4px rgba(0,0,0,0.5)',
          lineHeight:    1,
          whiteSpace:    'nowrap',
          userSelect:    'none',
        }}>
          ADVENTURE
        </span>
      </div>

      {/* ── Grid dim overlay ── */}
      {showGrid && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 14, background: 'rgba(0,0,0,0.52)', pointerEvents: 'none', transition: 'opacity 0.25s ease' }} />
      )}

      {/* ── Grid canvas ── */}
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

      {/* ── Grid select transparent overlay ── */}
      {gridSelectMode && showGrid && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 35, pointerEvents: 'auto', cursor: bucketMode ? 'cell' : 'crosshair', background: 'transparent' }} />
      )}

      {/* ── Selected cells panel ── */}
      {showGrid && selectedCells.size > 0 && (
        <div
          style={{ position: 'absolute', top: '50px', right: '16px', zIndex: 50, background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(255,220,80,0.45)', borderRadius: '8px', padding: '8px 12px', backdropFilter: 'blur(10px)', maxWidth: '220px', display: 'flex', flexDirection: 'column', gap: '6px' }}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <div style={{ color: 'rgba(255,220,80,0.9)', fontSize: '9px', fontFamily: "'Playfair Display', serif", fontWeight: 700, letterSpacing: '0.1em' }}>
            Selected: {selectedCells.size} cells
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={copySelectedCells}
              style={{ flex: 1, background: gridCopied ? 'rgba(80,200,80,0.2)' : 'rgba(255,220,80,0.15)', border: `1px solid ${gridCopied ? 'rgba(80,200,80,0.5)' : 'rgba(255,220,80,0.4)'}`, color: gridCopied ? '#88ff88' : 'rgba(255,220,80,0.9)', fontSize: '8px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.1em', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
            >{gridCopied ? 'COPIED ✓' : 'COPY'}</button>
            <button
              onClick={() => setSelectedCells(new Set())}
              style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,80,80,0.35)', color: 'rgba(255,100,100,0.8)', fontSize: '8px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.1em', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer' }}
            >CLEAR</button>
          </div>
        </div>
      )}

      {/* ── Building Assets ── */}
      {ASSETS.map(({ id, left, top, labelKey, img, interactive, widthCells, heightCells, labelCenter } : any) => {
        const label = labelKey ? t(labelKey) : undefined;
        return (
          <div
            key={id}
            style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: `${CW * (widthCells ?? 1)}%`, height: `${CH * (heightCells ?? 1)}%`, transform: 'translate(-50%, -50%)', zIndex: 5, pointerEvents: 'none' }}
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
              style={{ width: '100%', height: '100%', position: 'relative' }}
            >
              {img ? (
                <img
                  ref={(el) => { if (el) imgRefs.current.set(id, el); else imgRefs.current.delete(id); }}
                  src={img}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }}
                />
              ) : (
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`fade-${id}`} x1="100%" y1="0%" x2="0%" y2="0%">
                      <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
                      <stop offset="15%"  stopColor="rgba(0,0,0,0.6)" />
                      <stop offset="85%"  stopColor="rgba(0,0,0,0.6)" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                    </linearGradient>
                    <linearGradient id={`border-fade-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor="rgba(255,215,0,0)" />
                      <stop offset="12%"  stopColor="rgba(255,215,0,1)" />
                      <stop offset="88%"  stopColor="rgba(255,215,0,1)" />
                      <stop offset="100%" stopColor="rgba(255,215,0,0)" />
                    </linearGradient>
                    <linearGradient id={`border-black-fade-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
                      <stop offset="12%"  stopColor="rgba(0,0,0,1)" />
                      <stop offset="88%"  stopColor="rgba(0,0,0,1)" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="100" height="100" fill={`url(#fade-${id})`} />
                  <rect x="0" y="0"    width="100" height="2"   fill={`url(#border-black-fade-${id})`} />
                  <rect x="0" y="1.2"  width="100" height="1.5" fill={`url(#border-fade-${id})`} />
                  <rect x="0" y="2.7"  width="100" height="1"   fill={`url(#border-black-fade-${id})`} />
                  <rect x="0" y="96.3" width="100" height="1"   fill={`url(#border-black-fade-${id})`} />
                  <rect x="0" y="97.3" width="100" height="1.5" fill={`url(#border-fade-${id})`} />
                  <rect x="0" y="98"   width="100" height="2"   fill={`url(#border-black-fade-${id})`} />
                </svg>
              )}
              {label && !labelCenter && (
                <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', color: '#ffffff', fontSize: '11px', fontFamily: "'Playfair Display', serif", fontWeight: 600, letterSpacing: '0.15em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)', pointerEvents: 'none', zIndex: 1 }}>
                  {label}
                </span>
              )}
              {label && labelCenter && (
                <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', color: '#ffffff', fontSize: '10px', fontFamily: "'Playfair Display', serif", fontWeight: 600, letterSpacing: '0.18em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.8)', pointerEvents: 'none', zIndex: 10 }}>
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
          style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '8px', padding: '10px 14px', backdropFilter: 'blur(10px)', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '6px' }}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {(['x','y','w','h'] as const).map(k => (
              <span key={k} style={{ color: '#aaa', fontSize: '10px', fontFamily: "'Playfair Display', serif" }}>
                <span style={{ color: '#ffcc44' }}>{k}</span>
                {': '}
                <span style={{ color: '#fff' }}>{coordInfo.bbox[k === 'w' ? 'w' : k === 'h' ? 'h' : k]}%</span>
              </span>
            ))}
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '9px', color: '#88ddff', maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {coordInfo.polygon}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
            <button
              onClick={() => {
                const text = `bbox: left:${coordInfo.bbox.x}% top:${coordInfo.bbox.y}% width:${coordInfo.bbox.w}% height:${coordInfo.bbox.h}%\nclipPath: ${coordInfo.polygon}`;
                const ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.focus(); ta.select();
                try { document.execCommand('copy'); } catch (_) {}
                document.body.removeChild(ta);
                setCopied(true); setTimeout(() => setCopied(false), 1800);
              }}
              style={{ background: copied ? 'rgba(80,200,80,0.2)' : 'rgba(255,255,255,0.1)', border: `1px solid ${copied ? 'rgba(80,200,80,0.5)' : 'rgba(255,255,255,0.25)'}`, color: copied ? '#88ff88' : '#fff', fontSize: '9px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.1em', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
            >{copied ? 'COPIED ✓' : 'COPY'}</button>
            <button
              onClick={() => clearCanvas()}
              style={{ background: 'transparent', border: '1px solid rgba(255,80,80,0.35)', color: 'rgba(255,100,100,0.8)', fontSize: '9px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.1em', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer' }}
            >CLEAR</button>
          </div>
        </div>
      )}

      {/* ── Draw canvas ── */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none', opacity: 1 }}
      />

      {/* ── Draw toolbar ── */}
      {drawMode && (
        <div
          style={{ position: 'absolute', bottom: '60px', left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 14px', backdropFilter: 'blur(10px)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {COLORS.map(c => (
            <button key={c} onClick={(e) => { e.stopPropagation(); setColor(c); }}
              style={{ width: '20px', height: '20px', borderRadius: '50%', background: c, border: color === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0, boxShadow: color === c ? '0 0 6px rgba(255,255,255,0.6)' : 'none', transition: 'box-shadow 0.15s, border 0.15s' }}
            />
          ))}
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          {[2, 4, 8, 16].map(w => (
            <button key={w} onClick={(e) => { e.stopPropagation(); setLineWidth(w); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: lineWidth === w ? 'rgba(255,255,255,0.2)' : 'transparent', border: lineWidth === w ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent', cursor: 'pointer', padding: 0, transition: 'background 0.15s' }}
            >
              <div style={{ width: `${Math.min(w * 1.4, 22)}px`, height: `${Math.max(w * 0.5, 2)}px`, borderRadius: '2px', background: color }} />
            </button>
          ))}
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          <button onClick={(e) => { e.stopPropagation(); clearCanvas(); }}
            style={{ background: 'transparent', border: '1px solid rgba(255,80,80,0.5)', color: 'rgba(255,100,100,0.9)', fontSize: '10px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.1em', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >CLEAR</button>
        </div>
      )}

      {/* ── Toggle draw mode ── */}
      <button
        onClick={(e) => { e.stopPropagation(); setDrawMode(v => !v); if (gridSelectMode) setGridSelectMode(false); }}
        style={{ position: 'absolute', bottom: `calc(${(2 / ROWS) * 100}% + 16px)`, right: '16px', zIndex: 40, display: 'flex', alignItems: 'center', gap: '6px', background: drawMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.5)', border: drawMode ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: '10px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.12em', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', backdropFilter: 'blur(6px)', boxShadow: drawMode ? '0 0 10px rgba(255,255,255,0.15)' : 'none', transition: 'all 0.2s' }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
        {drawMode ? 'EXIT DRAW' : 'DRAW'}
      </button>

      {/* ── Toggle grid ── */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowGrid(v => { if (v) setGridSelectMode(false); return !v; }); }}
        style={{ position: 'absolute', bottom: `calc(${(2 / ROWS) * 100}% + 16px)`, right: '112px', zIndex: 40, display: 'flex', alignItems: 'center', gap: '6px', background: showGrid ? 'rgba(255,220,80,0.18)' : 'rgba(0,0,0,0.5)', border: showGrid ? '1px solid rgba(255,220,80,0.6)' : '1px solid rgba(255,255,255,0.25)', color: showGrid ? 'rgba(255,220,80,1)' : '#fff', fontSize: '10px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.12em', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', backdropFilter: 'blur(6px)', boxShadow: showGrid ? '0 0 10px rgba(255,220,80,0.2)' : 'none', transition: 'all 0.2s' }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        {showGrid ? 'HIDE GRID' : 'GRID'}
      </button>

      {/* ── Toggle grid SELECT ── */}
      {showGrid && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setGridSelectMode(v => {
              if (v) { setBucketMode(false); gridViewRef.current = { zoom: 1, panX: 0, panY: 0 }; setGridViewVer(vv => vv + 1); }
              return !v;
            });
            if (drawMode) setDrawMode(false);
          }}
          style={{ position: 'absolute', bottom: `calc(${(2 / ROWS) * 100}% + 16px)`, right: '208px', zIndex: 40, display: 'flex', alignItems: 'center', gap: '6px', background: gridSelectMode ? 'rgba(255,120,0,0.25)' : 'rgba(0,0,0,0.5)', border: gridSelectMode ? '1px solid rgba(255,120,0,0.7)' : '1px solid rgba(255,255,255,0.25)', color: gridSelectMode ? 'rgba(255,180,80,1)' : '#fff', fontSize: '10px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.12em', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', backdropFilter: 'blur(6px)', boxShadow: gridSelectMode ? '0 0 10px rgba(255,120,0,0.25)' : 'none', transition: 'all 0.2s' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3l14 9-7 1-4 6z"/>
          </svg>
          {gridSelectMode ? 'EXIT SELECT' : 'SELECT'}
        </button>
      )}

      {/* ── Bucket tool ── */}
      {showGrid && gridSelectMode && (
        <button
          onClick={(e) => { e.stopPropagation(); setBucketMode(v => !v); }}
          style={{ position: 'absolute', bottom: `calc(${(2 / ROWS) * 100}% + 16px)`, right: '316px', zIndex: 40, display: 'flex', alignItems: 'center', gap: '6px', background: bucketMode ? 'rgba(80,180,255,0.25)' : 'rgba(0,0,0,0.5)', border: bucketMode ? '1px solid rgba(80,180,255,0.7)' : '1px solid rgba(255,255,255,0.25)', color: bucketMode ? 'rgba(140,210,255,1)' : '#fff', fontSize: '10px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.12em', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', backdropFilter: 'blur(6px)', boxShadow: bucketMode ? '0 0 10px rgba(80,180,255,0.3)' : 'none', transition: 'all 0.2s' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
          {bucketMode ? 'FILL ON' : 'FILL'}
        </button>
      )}

      {/* ── Grid zoom controls ── */}
      {showGrid && gridSelectMode && (
        <div
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          style={{ position: 'absolute', bottom: `calc(${(2 / ROWS) * 100}% + 16px)`, right: '424px', zIndex: 40, display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '3px 8px', backdropFilter: 'blur(6px)' }}
        >
          <button onClick={() => { const container = containerRef.current; if (!container) return; const rect = container.getBoundingClientRect(); applyGridZoom(gridViewRef.current.zoom * 0.8, rect.width / 2, rect.height / 2, rect.width, rect.height); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>−</button>
          <span style={{ color: gridViewRef.current.zoom > 1 ? 'rgba(140,210,255,1)' : 'rgba(255,255,255,0.6)', fontSize: '9px', fontFamily: "'Playfair Display', serif", minWidth: '30px', textAlign: 'center', letterSpacing: '0.08em' }}>{gridViewRef.current.zoom.toFixed(1)}×</span>
          <button onClick={() => { const container = containerRef.current; if (!container) return; const rect = container.getBoundingClientRect(); applyGridZoom(gridViewRef.current.zoom * 1.25, rect.width / 2, rect.height / 2, rect.width, rect.height); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>+</button>
          {gridViewRef.current.zoom > 1 && (
            <button onClick={resetGridView} style={{ background: 'none', border: 'none', color: 'rgba(255,160,80,0.9)', fontSize: '8px', fontFamily: "'Playfair Display', serif", cursor: 'pointer', padding: '0 2px', letterSpacing: '0.08em' }}>RESET</button>
          )}
        </div>
      )}

      {/* ── Grid zoom hint ── */}
      {showGrid && gridSelectMode && gridViewRef.current.zoom === 1 && (
        <div style={{ position: 'absolute', bottom: `calc(${(2 / ROWS) * 100}% + 50px)`, right: '208px', zIndex: 40, color: 'rgba(255,255,255,0.45)', fontSize: '8px', fontFamily: "'Playfair Display', serif", letterSpacing: '0.08em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          Scroll wheel: zoom · Right-click drag: pan
        </div>
      )}

      <CurrencyDebug />

      {/* ── Shared game UI overlay — single source of truth ── */}
      <GamePageLayout activeTab="city" />
    </div>
  );
}