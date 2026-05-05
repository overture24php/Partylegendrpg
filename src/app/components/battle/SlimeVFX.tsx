/**
 * SlimeVFX — HTML5 Canvas VFX for Rock Slime and Acid Slime skills.
 *
 *  rockslime_sk2    → Brown stone-shield drops onto self (same design as Emma's,
 *                     recoloured earthy brown).
 *  rockslime_ult    → Cluster of jagged stone spikes erupt from the ground below
 *                     each damage target, hold, then retract back underground.
 *
 *  acidslime_basic  → Green teardrop/dewdrop projectile (round end toward enemy,
 *  acidslime_sk1      pointed tail toward actor) flies fast actor → target.
 *  acidslime_sk2    → Green vertical slash (same shape & timing as Lucas ULT
 *                     vertical, recoloured bright green).
 *  acidslime_ult    → Animated green acid-flood expands from the centre of the
 *                     target formation outward, undulating wave top, then fades.
 *
 *  waterslime_basic → Blue teardrop/dewdrop projectile (round end toward enemy,
 *  waterslime_sk1     pointed tail toward actor) flies fast actor → target.
 *  waterslime_sk2   → Small blue flood wave (tidal wave) expands from the centre
 *                     of the target formation outward, undulating wave top, then
 *                     fades.
 *  waterslime_ult   → Large blue flood wave (tsunami) expands from the centre
 *                     of the target formation outward, undulating wave top, then
 *                     fades.
 */

import { useEffect, useRef } from 'react';

// ── Layout constants (mirror BattlePlayback) ──────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW:  60, slotH:  60, col0X:  30, col1X: 278, y:   8 },
  { slotW:  86, slotH:  86, col0X:  17, col1X: 265, y:  82 },
  { slotW: 120, slotH: 120, col0X:   0, col1X: 248, y: 190 },
] as const;

// ── Public trigger type ───────────────────────────────────────────────────────
export type SlimeVFXTrigger = {
  type:
    | 'rockslime_sk2'    | 'rockslime_ult'
    | 'acidslime_basic'  | 'acidslime_sk1' | 'acidslime_sk2' | 'acidslime_ult'
    | 'waterslime_basic' | 'waterslime_sk1'| 'waterslime_sk2'| 'waterslime_ult';
  actorSlot:   number;
  actorSide:   'hero' | 'enemy';
  targetSlots: number[];
  targetSide:  'hero' | 'enemy';
};

// ── Slot → screen position ───────────────────────────────────────────────────
function slotPos(side: 'hero' | 'enemy', slot: number) {
  const col = slot % 2;
  const ri  = Math.min(2, Math.floor(slot / 2));
  const row = ROW_DATA[ri];
  const gl  = side === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  return {
    x:     gl + (col === 0 ? row.col0X : row.col1X) + row.slotW / 2,
    y:     window.innerHeight - GRID_H + row.y + row.slotH / 2,
    slotH: row.slotH,
  };
}

const c01  = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ─────────────────────────────────────────────────────────────────────────────
// Pool types
// ─────────────────────────────────────────────────────────────────────────────

/** Rock Slime SK2 — brown heater shield */
type BrownShield = {
  cx: number; anchorY: number;
  w: number;  h: number;
  spawnMs: number; delay: number;
  dropMs: number; holdMs: number; fadeMs: number;
};

/** Rock Slime ULT — spike cluster at one target */
type SpikeGroup = {
  cx: number; groundY: number;
  spikes: Array<{ ox: number; maxH: number; baseW: number }>;
  spawnMs:   number;
  growMs:    number;
  holdMs:    number;
  retractMs: number;
};

/** Acid Slime Basic / SK1 — green teardrop projectile */
type Dewdrop = {
  sx: number; sy: number;
  ex: number; ey: number;
  spawnMs:  number;
  travelMs: number; holdMs: number; fadeMs: number;
  size:  number;
  angle: number;   // direction of travel in radians
};

/** Acid Slime SK2 — green vertical slash (Lucas ULT scale) */
type GreenSlash = {
  ax: number; ay: number;
  bx: number; by: number;
  maxW:    number;
  spawnMs: number;
  drawMs: number; holdMs: number; fadeMs: number;
};

/** Acid Slime ULT — expanding acid flood at formation bottom */
type AcidFlood = {
  centerX: number; groundY: number;
  maxW: number; maxH: number;
  spawnMs:   number;
  expandMs:  number;
  holdMs:    number;
  fadeMs:    number;
};

// ── Module-level pools ────────────────────────────────────────────────────────
const brownShields: BrownShield[] = [];
const spikeGroups:  SpikeGroup[]  = [];
const dewdrops:     Dewdrop[]     = [];
const greenSlashes: GreenSlash[]  = [];
const acidFloods:   AcidFlood[]   = [];
// Water Slime pools — same types as acid counterparts, drawn with blue palette
const waterDrops:  Dewdrop[]   = [];   // basic + sk1
const waterFloods: AcidFlood[] = [];   // sk2 (small) + ult (large)

// ─────────────────────────────────────────────────────────────────────────────
// Spawners
// ─────────────────────────────────────────────────────────────────────────────

function spawnBrownShield(cx: number, anchorY: number, slotH: number, delay = 0) {
  brownShields.push({
    cx,
    anchorY: anchorY - slotH * 0.12,
    w:       slotH * 1.80,
    h:       slotH * 2.88,
    spawnMs: performance.now(),
    delay,
    dropMs:  270, holdMs: 310, fadeMs: 430,
  });
}

function spawnSpikeGroup(cx: number, groundY: number, slotH: number) {
  const count = 4;
  const spikes: SpikeGroup['spikes'] = [];
  for (let i = 0; i < count; i++) {
    const maxH  = slotH * 0.95 + Math.random() * slotH * 0.65;
    const baseW = 13 + Math.random() * 18;
    const spread = slotH * 0.26;
    const ox    = (i - (count - 1) / 2) * spread + (Math.random() - 0.5) * 8;
    spikes.push({ ox, maxH, baseW });
  }
  spikeGroups.push({
    cx, groundY, spikes,
    spawnMs:   performance.now(),
    growMs:    230, holdMs: 270, retractMs: 210,
  });
}

function spawnDewdrop(
  actorSlot: number, actorSide: 'hero' | 'enemy',
  tSlot:     number, tSide:     'hero' | 'enemy',
) {
  const from = slotPos(actorSide, actorSlot);
  const to   = slotPos(tSide, tSlot);
  const sy   = from.y - from.slotH * 0.25;
  const ey   = to.y   - to.slotH   * 0.25;
  dewdrops.push({
    sx: from.x, sy,
    ex: to.x,   ey,
    spawnMs:  performance.now(),
    travelMs: 155, holdMs: 20, fadeMs: 75,
    size:  24,
    angle: Math.atan2(ey - sy, to.x - from.x),
  });
}

function spawnGreenSlash(tSlot: number, tSide: 'hero' | 'enemy') {
  const { x, y } = slotPos(tSide, tSlot);
  const h = window.innerHeight * 0.5;   // same half-length as Lucas ULT vertical
  greenSlashes.push({
    ax: x, ay: y - h,
    bx: x, by: y + h,
    maxW:    32,
    spawnMs: performance.now(),
    drawMs: 170, holdMs: 28, fadeMs: 190,
  });
}

function spawnAcidFlood(targetSide: 'hero' | 'enemy') {
  const gl      = targetSide === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  const centerX = gl + GRID_W / 2;
  acidFloods.push({
    centerX,
    groundY:  window.innerHeight,
    maxW:     GRID_W * 1.12,
    maxH:     128,
    spawnMs:  performance.now(),
    expandMs: 580, holdMs: 500, fadeMs: 390,
  });
}

/** Water Slime Basic / SK1 — blue teardrop projectile. */
function spawnWaterDrop(
  actorSlot: number, actorSide: 'hero' | 'enemy',
  tSlot: number,     tSide:     'hero' | 'enemy',
) {
  const from = slotPos(actorSide, actorSlot);
  const to   = slotPos(tSide, tSlot);
  const sy   = from.y - from.slotH * 0.25;
  const ey   = to.y   - to.slotH   * 0.25;
  waterDrops.push({
    sx: from.x, sy,
    ex: to.x,   ey,
    spawnMs:  performance.now(),
    travelMs: 155, holdMs: 20, fadeMs: 75,
    size:  24,
    angle: Math.atan2(ey - sy, to.x - from.x),
  });
}

/** Water Slime SK2 (tidal wave) — small blue flood; ULT (tsunami) — large flood. */
function spawnWaterFlood(targetSide: 'hero' | 'enemy', large: boolean) {
  const gl      = targetSide === 'hero' ? 12 : window.innerWidth - 12 - GRID_W;
  const centerX = gl + GRID_W / 2;
  waterFloods.push({
    centerX,
    groundY:  window.innerHeight,
    maxW:     GRID_W * (large ? 1.28 : 1.05),
    maxH:     large ? 192 : 110,
    spawnMs:  performance.now(),
    expandMs: large ? 720 : 520,
    holdMs:   large ? 600 : 400,
    fadeMs:   large ? 480 : 340,
  });
}

// ── Entry dispatcher ──────────────────────────────────────────────────────────
function onTrigger(e: SlimeVFXTrigger) {
  switch (e.type) {
    case 'rockslime_sk2':
      for (const s of e.targetSlots) {
        const p = slotPos(e.targetSide, s);
        spawnBrownShield(p.x, p.y, p.slotH);
      }
      break;
    case 'rockslime_ult':
      for (const s of e.targetSlots) {
        const p = slotPos(e.targetSide, s);
        spawnSpikeGroup(p.x, p.y + p.slotH * 0.46, p.slotH);
      }
      break;
    case 'acidslime_basic':
    case 'acidslime_sk1':
      for (const s of e.targetSlots) {
        spawnDewdrop(e.actorSlot, e.actorSide, s, e.targetSide);
      }
      break;
    case 'acidslime_sk2':
      for (const s of e.targetSlots) {
        spawnGreenSlash(s, e.targetSide);
      }
      break;
    case 'acidslime_ult':
      spawnAcidFlood(e.targetSide);
      break;
    // ── Water Slime ────────────────────────────────────────────────────────
    case 'waterslime_basic':
    case 'waterslime_sk1':
      for (const s of e.targetSlots) {
        spawnWaterDrop(e.actorSlot, e.actorSide, s, e.targetSide);
      }
      break;
    case 'waterslime_sk2':
      spawnWaterFlood(e.targetSide, false);
      break;
    case 'waterslime_ult':
      spawnWaterFlood(e.targetSide, true);
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Heater-shield path — same geometry as Emma, recoloured brown. */
function drawBrownShield(
  ctx: CanvasRenderingContext2D,
  cx: number, topY: number, w: number, h: number, alpha: number,
) {
  const left  = cx - w / 2;
  const right = cx + w / 2;
  const botY  = topY + h;
  const r     = w * 0.13;

  ctx.save();

  // ── Fill ──────────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(left + r, topY);
  ctx.lineTo(right - r, topY);
  ctx.quadraticCurveTo(right, topY,           right, topY + r * 1.6);
  ctx.quadraticCurveTo(right, topY + h * 0.64, cx,   botY);
  ctx.quadraticCurveTo(left,  topY + h * 0.64, left, topY + r * 1.6);
  ctx.quadraticCurveTo(left,  topY,            left + r, topY);
  ctx.closePath();

  const fill = ctx.createLinearGradient(cx, topY, cx, botY);
  fill.addColorStop(0,    `rgba(180,130, 70,${alpha * 0.42})`);
  fill.addColorStop(0.45, `rgba(139, 90, 43,${alpha * 0.30})`);
  fill.addColorStop(1,    `rgba( 80, 50, 20,${alpha * 0.14})`);
  ctx.fillStyle   = fill;
  ctx.shadowColor = `rgba(160,110,50,${alpha * 0.55})`;
  ctx.shadowBlur  = 22;
  ctx.fill();

  // ── Rim stroke ────────────────────────────────────────────────────────────
  ctx.strokeStyle = `rgba(185,125,60,${alpha * 0.90})`;
  ctx.lineWidth   = 2.4;
  ctx.shadowBlur  = 16;
  ctx.stroke();

  // ── Top highlight bar ─────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(left + r + 5, topY + 5);
  ctx.lineTo(right - r - 5, topY + 5);
  ctx.strokeStyle = `rgba(225,175,105,${alpha * 0.48})`;
  ctx.lineWidth   = 1.2;
  ctx.shadowBlur  = 4;
  ctx.stroke();

  // ── Stone cross emblem ────────────────────────────────────────────────────
  const emY = topY + h * 0.38;
  const ew  = w * 0.22;
  const et  = Math.max(2, w * 0.045);
  ctx.fillStyle = `rgba(205,155,85,${alpha * 0.30})`;
  ctx.shadowBlur = 0;
  ctx.fillRect(cx - et / 2, emY - ew,     et,     ew * 2);
  ctx.fillRect(cx - ew,     emY - et / 2, ew * 2, et);

  ctx.restore();
}

/** Stone spike cluster. */
function drawSpikeGroup(ctx: CanvasRenderingContext2D, g: SpikeGroup, now: number) {
  const elapsed = now - g.spawnMs;
  const total   = g.growMs + g.holdMs + g.retractMs;
  if (elapsed < 0 || elapsed >= total) return;

  // height fraction: 0→1 (grow), 1 (hold), 1→0 (retract)
  let growFrac: number;
  if (elapsed < g.growMs) {
    const t = elapsed / g.growMs;
    growFrac = 1 - (1 - t) * (1 - t);   // ease-out
  } else if (elapsed < g.growMs + g.holdMs) {
    growFrac = 1;
  } else {
    const t  = (elapsed - g.growMs - g.holdMs) / g.retractMs;
    growFrac = 1 - t * t;               // ease-in retract
  }

  const alpha = elapsed < g.growMs * 0.28 ? elapsed / (g.growMs * 0.28) : 1;

  for (const sp of g.spikes) {
    const cx   = g.cx + sp.ox;
    const tipY = g.groundY - sp.maxH * growFrac;
    const bW   = sp.baseW;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx - bW / 2, g.groundY);
    ctx.lineTo(cx + bW / 2, g.groundY);
    ctx.closePath();

    const grad = ctx.createLinearGradient(cx, tipY, cx, g.groundY);
    grad.addColorStop(0,    `rgba(215,195,162,${alpha})`);
    grad.addColorStop(0.35, `rgba(152,122, 88,${alpha * 0.92})`);
    grad.addColorStop(1,    `rgba( 82, 62, 40,${alpha * 0.62})`);
    ctx.fillStyle   = grad;
    ctx.shadowColor = `rgba(100,76,46,${alpha * 0.55})`;
    ctx.shadowBlur  = 9;
    ctx.fill();

    // Left-face highlight
    ctx.beginPath();
    ctx.moveTo(cx, tipY + (g.groundY - tipY) * 0.14);
    ctx.lineTo(cx - bW * 0.3, g.groundY);
    ctx.strokeStyle = `rgba(232,205,165,${alpha * 0.34})`;
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 0;
    ctx.stroke();

    ctx.restore();
  }
}

/** Green teardrop projectile — round end leads toward target. */
function drawDewdrop(ctx: CanvasRenderingContext2D, d: Dewdrop, now: number) {
  const elapsed = now - d.spawnMs;
  const total   = d.travelMs + d.holdMs + d.fadeMs;
  if (elapsed < 0 || elapsed >= total) return;

  let t: number, alpha: number;
  if (elapsed < d.travelMs) {
    t = elapsed / d.travelMs; alpha = 1;
  } else if (elapsed < d.travelMs + d.holdMs) {
    t = 1; alpha = 1;
  } else {
    t = 1; alpha = 1 - (elapsed - d.travelMs - d.holdMs) / d.fadeMs;
  }
  alpha = c01(alpha);

  const ease = 1 - (1 - t) * (1 - t);
  const cx   = lerp(d.sx, d.ex, ease);
  const cy   = lerp(d.sy, d.ey, ease);
  const r    = d.size * 0.52;
  const tail = d.size * 1.35;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(d.angle);

  // Teardrop path: semicircle at +x (leading = toward enemy), tapered tail at -x
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);    // right-side arc (round end)
  ctx.quadraticCurveTo(-tail * 0.52, r * 0.64, -tail, 0);   // lower tail edge
  ctx.quadraticCurveTo(-tail * 0.52, -r * 0.64, 0, -r);     // upper tail edge
  ctx.closePath();

  const grad = ctx.createLinearGradient(r * 0.5, 0, -tail, 0);
  grad.addColorStop(0,    `rgba(187,247,208,${alpha})`);
  grad.addColorStop(0.35, `rgba( 74,222,128,${alpha})`);
  grad.addColorStop(1,    `rgba( 21,128, 61,${alpha * 0.28})`);
  ctx.fillStyle   = grad;
  ctx.shadowColor = `rgba(74,222,128,${alpha * 0.75})`;
  ctx.shadowBlur  = 14;
  ctx.fill();

  // Specular dot on round face
  ctx.beginPath();
  ctx.arc(r * 0.32, -r * 0.24, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.42})`;
  ctx.shadowBlur = 0;
  ctx.fill();

  ctx.restore();
}

// ── Blade helpers (subset of LucasVFX logic, green tint) ─────────────────────
function buildBlade(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  maxW: number, drawT: number,
) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const nx = -dy / len, ny = dx / len;
  const bend = 0.03;
  const midX = (ax + bx) / 2 + nx * len * bend;
  const midY = (ay + by) / 2 + ny * len * bend;
  const ctTx = midX + nx * maxW, ctTy = midY + ny * maxW;
  const ctBx = midX - nx * maxW, ctBy = midY - ny * maxW;

  if (drawT >= 1) {
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(ctTx, ctTy, bx, by);
    ctx.quadraticCurveTo(ctBx, ctBy, ax, ay);
    ctx.closePath();
    return;
  }
  const tc    = c01(drawT);
  const tm1Tx = lerp(ax, ctTx, tc), tm1Ty = lerp(ay, ctTy, tc);
  const tm2Tx = lerp(ctTx, bx, tc), tm2Ty = lerp(ctTy, by, tc);
  const ptTx  = lerp(tm1Tx, tm2Tx, tc), ptTy = lerp(tm1Ty, tm2Ty, tc);
  const bm1Bx = lerp(ax, ctBx, tc), bm1By = lerp(ay, ctBy, tc);
  const bm2Bx = lerp(ctBx, bx, tc), bm2By = lerp(ctBy, by, tc);
  const ptBx  = lerp(bm1Bx, bm2Bx, tc), ptBy = lerp(bm1By, bm2By, tc);
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(tm1Tx, tm1Ty, ptTx, ptTy);
  ctx.lineTo(ptBx, ptBy);
  ctx.quadraticCurveTo(bm1Bx, bm1By, ax, ay);
  ctx.closePath();
}

function makeGreenGrad(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number, maxW: number,
): CanvasGradient {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx  = len > 0 ? -dy / len : 0;
  const ny  = len > 0 ?  dx / len : 1;
  const hw  = maxW / 2;
  const bend = 0.03;
  const cx2 = (ax + bx) / 2 + nx * len * bend;
  const cy2 = (ay + by) / 2 + ny * len * bend;
  const g   = ctx.createLinearGradient(
    cx2 - nx * hw, cy2 - ny * hw,
    cx2 + nx * hw, cy2 + ny * hw,
  );
  g.addColorStop(0.00, 'rgba(74,222,128,0.00)');
  g.addColorStop(0.18, 'rgba(74,222,128,0.40)');
  g.addColorStop(0.42, 'rgba(134,239,172,0.88)');
  g.addColorStop(0.50, 'rgba(187,247,208,1.00)');
  g.addColorStop(0.58, 'rgba(134,239,172,0.88)');
  g.addColorStop(0.82, 'rgba(74,222,128,0.40)');
  g.addColorStop(1.00, 'rgba(74,222,128,0.00)');
  return g;
}

function drawGreenSlash(ctx: CanvasRenderingContext2D, s: GreenSlash, now: number) {
  const elapsed = now - s.spawnMs;
  const total   = s.drawMs + s.holdMs + s.fadeMs;
  if (elapsed < 0 || elapsed >= total) return;

  let drawT: number, alpha: number;
  if (elapsed < s.drawMs) {
    drawT = elapsed / s.drawMs; alpha = 1;
  } else if (elapsed < s.drawMs + s.holdMs) {
    drawT = 1; alpha = 1;
  } else {
    drawT = 1; alpha = 1 - (elapsed - s.drawMs - s.holdMs) / s.fadeMs;
  }

  ctx.save();
  ctx.globalAlpha = c01(alpha);
  ctx.shadowColor = 'rgba(74,222,128,0.65)';
  ctx.shadowBlur  = 16;
  ctx.fillStyle   = makeGreenGrad(ctx, s.ax, s.ay, s.bx, s.by, s.maxW);
  ctx.beginPath();
  buildBlade(ctx, s.ax, s.ay, s.bx, s.by, s.maxW, drawT);
  ctx.fill();
  ctx.restore();
}

/**
 * Acid flood: three overlapping translucent green liquid layers with
 * animated sine-wave top surface, expanding from formation centre outward.
 */
function drawAcidFlood(ctx: CanvasRenderingContext2D, f: AcidFlood, now: number) {
  const elapsed = now - f.spawnMs;
  const total   = f.expandMs + f.holdMs + f.fadeMs;
  if (elapsed < 0 || elapsed >= total) return;

  const expandT  = c01(elapsed / f.expandMs);
  const easeW    = 1 - (1 - expandT) * (1 - expandT);
  const currentW = f.maxW * easeW;

  let alpha: number;
  if (elapsed < f.expandMs + f.holdMs) {
    alpha = Math.min(1, elapsed / (f.expandMs * 0.22));
  } else {
    alpha = 1 - (elapsed - f.expandMs - f.holdMs) / f.fadeMs;
  }
  alpha = c01(alpha);

  const left  = f.centerX - currentW / 2;
  const right = f.centerX + currentW / 2;
  const wAmp  = 12;
  const wFreq = 0.036;
  const wSpd  = 0.0028;

  // ── Liquid layers (drawn back to front) ───────────────────────────────────
  const layers = [
    { hFrac: 1.00, aScale: 0.34, phase: 0.0 },
    { hFrac: 0.68, aScale: 0.26, phase: 1.4 },
    { hFrac: 0.40, aScale: 0.18, phase: 2.8 },
  ];

  for (const lyr of layers) {
    const lh     = f.maxH * lyr.hFrac;
    const lAlpha = alpha * lyr.aScale;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left, f.groundY);

    // Wave top surface across current width
    for (let x = left; x <= right + 6; x += 5) {
      const clampedX = Math.min(x, right);
      const wy = Math.sin(clampedX * wFreq + now * wSpd + lyr.phase) * wAmp;
      ctx.lineTo(clampedX, f.groundY - lh + wy);
    }
    ctx.lineTo(right, f.groundY);
    ctx.closePath();

    const grad = ctx.createLinearGradient(f.centerX, f.groundY - lh, f.centerX, f.groundY);
    grad.addColorStop(0,   `rgba(74,222,128,${lAlpha})`);
    grad.addColorStop(0.5, `rgba(34,197, 94,${lAlpha * 0.85})`);
    grad.addColorStop(1,   `rgba(21,128, 61,${lAlpha * 0.60})`);
    ctx.fillStyle   = grad;
    ctx.shadowColor = `rgba(74,222,128,${alpha * 0.35})`;
    ctx.shadowBlur  = 14;
    ctx.fill();
    ctx.restore();
  }

  // ── Wave crest rim line ───────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left, f.groundY - f.maxH * 0.40);
  for (let x = left; x <= right + 6; x += 5) {
    const clampedX = Math.min(x, right);
    const wy = Math.sin(clampedX * wFreq + now * wSpd) * wAmp;
    ctx.lineTo(clampedX, f.groundY - f.maxH * 0.40 + wy);
  }
  ctx.strokeStyle = `rgba(134,239,172,${alpha * 0.92})`;
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = `rgba(74,222,128,${alpha * 0.72})`;
  ctx.shadowBlur  = 13;
  ctx.stroke();

  // ── Animated spray droplets above the crest ───────────────────────────────
  for (let i = 0; i < 6; i++) {
    const t    = (Math.sin(now * 0.0018 + i * 1.62) + 1) / 2;
    const dropX = left + (right - left) * t;
    const baseY = f.groundY - f.maxH * 0.40 + Math.sin(dropX * wFreq + now * wSpd) * wAmp;
    const dropY = baseY - 5 - Math.abs(Math.sin(now * 0.004 + i * 0.9)) * 14;
    ctx.beginPath();
    ctx.arc(dropX, dropY, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(187,247,208,${alpha * 0.68})`;
    ctx.shadowBlur  = 7;
    ctx.shadowColor = `rgba(74,222,128,0.65)`;
    ctx.fill();
  }
  ctx.restore();
}

// ── Draw helpers for Water Slime ────────────────────────────────────────────

/** Blue teardrop projectile — Water Slime basic / SK1. */
function drawWaterDrop(ctx: CanvasRenderingContext2D, d: Dewdrop, now: number) {
  const elapsed = now - d.spawnMs;
  const total   = d.travelMs + d.holdMs + d.fadeMs;
  if (elapsed < 0 || elapsed >= total) return;

  let t: number, alpha: number;
  if (elapsed < d.travelMs) {
    t = elapsed / d.travelMs; alpha = 1;
  } else if (elapsed < d.travelMs + d.holdMs) {
    t = 1; alpha = 1;
  } else {
    t = 1; alpha = 1 - (elapsed - d.travelMs - d.holdMs) / d.fadeMs;
  }
  alpha = c01(alpha);

  const ease = 1 - (1 - t) * (1 - t);
  const cx   = lerp(d.sx, d.ex, ease);
  const cy   = lerp(d.sy, d.ey, ease);
  const r    = d.size * 0.52;
  const tail = d.size * 1.35;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(d.angle);

  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.quadraticCurveTo(-tail * 0.52, r * 0.64, -tail, 0);
  ctx.quadraticCurveTo(-tail * 0.52, -r * 0.64, 0, -r);
  ctx.closePath();

  const grad = ctx.createLinearGradient(r * 0.5, 0, -tail, 0);
  grad.addColorStop(0,    `rgba(224,242,254,${alpha})`);   // sky-100
  grad.addColorStop(0.35, `rgba( 56,189,248,${alpha})`);   // sky-400
  grad.addColorStop(1,    `rgba(  2,132,199,${alpha * 0.28})`); // sky-600
  ctx.fillStyle   = grad;
  ctx.shadowColor = `rgba(56,189,248,${alpha * 0.75})`;
  ctx.shadowBlur  = 14;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(r * 0.32, -r * 0.24, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.50})`;
  ctx.shadowBlur = 0;
  ctx.fill();

  ctx.restore();
}

/**
 * Blue water flood — Water Slime SK2 (tidal wave) and ULT (tsunami).
 * Same structure as drawAcidFlood but with sky-blue palette.
 */
function drawWaterFlood(ctx: CanvasRenderingContext2D, f: AcidFlood, now: number) {
  const elapsed = now - f.spawnMs;
  const total   = f.expandMs + f.holdMs + f.fadeMs;
  if (elapsed < 0 || elapsed >= total) return;

  const expandT  = c01(elapsed / f.expandMs);
  const easeW    = 1 - (1 - expandT) * (1 - expandT);
  const currentW = f.maxW * easeW;

  let alpha: number;
  if (elapsed < f.expandMs + f.holdMs) {
    alpha = Math.min(1, elapsed / (f.expandMs * 0.22));
  } else {
    alpha = 1 - (elapsed - f.expandMs - f.holdMs) / f.fadeMs;
  }
  alpha = c01(alpha);

  const left  = f.centerX - currentW / 2;
  const right = f.centerX + currentW / 2;
  const wAmp  = 14;
  const wFreq = 0.030;
  const wSpd  = 0.0032;

  const layers = [
    { hFrac: 1.00, aScale: 0.32, phase: 0.0 },
    { hFrac: 0.66, aScale: 0.24, phase: 1.5 },
    { hFrac: 0.38, aScale: 0.16, phase: 2.9 },
  ];

  for (const lyr of layers) {
    const lh     = f.maxH * lyr.hFrac;
    const lAlpha = alpha * lyr.aScale;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left, f.groundY);
    for (let x = left; x <= right + 6; x += 5) {
      const clampedX = Math.min(x, right);
      const wy = Math.sin(clampedX * wFreq + now * wSpd + lyr.phase) * wAmp;
      ctx.lineTo(clampedX, f.groundY - lh + wy);
    }
    ctx.lineTo(right, f.groundY);
    ctx.closePath();

    const grad = ctx.createLinearGradient(f.centerX, f.groundY - lh, f.centerX, f.groundY);
    grad.addColorStop(0,   `rgba( 56,189,248,${lAlpha})`);  // sky-400
    grad.addColorStop(0.5, `rgba( 14,165,233,${lAlpha * 0.85})`); // sky-500
    grad.addColorStop(1,   `rgba(  2,132,199,${lAlpha * 0.60})`); // sky-600
    ctx.fillStyle   = grad;
    ctx.shadowColor = `rgba(56,189,248,${alpha * 0.35})`;
    ctx.shadowBlur  = 16;
    ctx.fill();
    ctx.restore();
  }

  // Wave crest rim
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left, f.groundY - f.maxH * 0.38);
  for (let x = left; x <= right + 6; x += 5) {
    const clampedX = Math.min(x, right);
    const wy = Math.sin(clampedX * wFreq + now * wSpd) * wAmp;
    ctx.lineTo(clampedX, f.groundY - f.maxH * 0.38 + wy);
  }
  ctx.strokeStyle = `rgba(125,211,252,${alpha * 0.95})`; // sky-300
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = `rgba(56,189,248,${alpha * 0.75})`;
  ctx.shadowBlur  = 14;
  ctx.stroke();

  // Spray droplets
  for (let i = 0; i < 7; i++) {
    const t    = (Math.sin(now * 0.0018 + i * 1.62) + 1) / 2;
    const dropX = left + (right - left) * t;
    const baseY = f.groundY - f.maxH * 0.38 + Math.sin(dropX * wFreq + now * wSpd) * wAmp;
    const dropY = baseY - 5 - Math.abs(Math.sin(now * 0.004 + i * 0.9)) * 16;
    ctx.beginPath();
    ctx.arc(dropX, dropY, 3.0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(186,230,253,${alpha * 0.72})`; // sky-200
    ctx.shadowBlur  = 8;
    ctx.shadowColor = `rgba(56,189,248,0.65)`;
    ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Master draw tick
// ─────────────────────────────────────────────────────────────────────────────
function drawAll(ctx: CanvasRenderingContext2D, now: number) {
  // Brown shields
  for (let i = brownShields.length - 1; i >= 0; i--) {
    const s       = brownShields[i];
    const elapsed = now - s.spawnMs - s.delay;
    if (elapsed < 0) continue;
    const total   = s.dropMs + s.holdMs + s.fadeMs;
    if (elapsed >= total) { brownShields.splice(i, 1); continue; }

    const dropStartY = s.anchorY - s.h * 0.5 - 88;
    let alpha: number, topY: number;
    if (elapsed < s.dropMs) {
      const ease = 1 - Math.pow(1 - elapsed / s.dropMs, 3);
      topY  = dropStartY + (s.anchorY - s.h * 0.5 - dropStartY) * ease;
      alpha = Math.min(1, elapsed / (s.dropMs * 0.34));
    } else if (elapsed < s.dropMs + s.holdMs) {
      topY = s.anchorY - s.h * 0.5; alpha = 1;
    } else {
      topY  = s.anchorY - s.h * 0.5;
      alpha = 1 - (elapsed - s.dropMs - s.holdMs) / s.fadeMs;
    }
    drawBrownShield(ctx, s.cx, topY, s.w, s.h, c01(alpha));
  }

  // Stone spike groups
  for (let i = spikeGroups.length - 1; i >= 0; i--) {
    const g       = spikeGroups[i];
    const elapsed = now - g.spawnMs;
    if (elapsed >= g.growMs + g.holdMs + g.retractMs) {
      spikeGroups.splice(i, 1); continue;
    }
    drawSpikeGroup(ctx, g, now);
  }

  // Dewdrop projectiles
  for (let i = dewdrops.length - 1; i >= 0; i--) {
    const d       = dewdrops[i];
    const elapsed = now - d.spawnMs;
    if (elapsed >= d.travelMs + d.holdMs + d.fadeMs) {
      dewdrops.splice(i, 1); continue;
    }
    drawDewdrop(ctx, d, now);
  }

  // Green slashes
  for (let i = greenSlashes.length - 1; i >= 0; i--) {
    const s       = greenSlashes[i];
    const elapsed = now - s.spawnMs;
    if (elapsed >= s.drawMs + s.holdMs + s.fadeMs) {
      greenSlashes.splice(i, 1); continue;
    }
    drawGreenSlash(ctx, s, now);
  }

  // Acid floods
  for (let i = acidFloods.length - 1; i >= 0; i--) {
    const f       = acidFloods[i];
    const elapsed = now - f.spawnMs;
    if (elapsed >= f.expandMs + f.holdMs + f.fadeMs) {
      acidFloods.splice(i, 1); continue;
    }
    drawAcidFlood(ctx, f, now);
  }

  // Water drops (blue teardrop — Water Slime basic / SK1)
  for (let i = waterDrops.length - 1; i >= 0; i--) {
    const d       = waterDrops[i];
    const elapsed = now - d.spawnMs;
    if (elapsed >= d.travelMs + d.holdMs + d.fadeMs) {
      waterDrops.splice(i, 1); continue;
    }
    drawWaterDrop(ctx, d, now);
  }

  // Water floods (blue wave — Water Slime SK2 / ULT)
  for (let i = waterFloods.length - 1; i >= 0; i--) {
    const f       = waterFloods[i];
    const elapsed = now - f.spawnMs;
    if (elapsed >= f.expandMs + f.holdMs + f.fadeMs) {
      waterFloods.splice(i, 1); continue;
    }
    drawWaterFlood(ctx, f, now);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function SlimeVFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  useEffect(() => {
    const onVFX = (ev: Event) =>
      onTrigger((ev as CustomEvent<SlimeVFXTrigger>).detail);
    window.addEventListener('slime-vfx', onVFX);
    return () => window.removeEventListener('slime-vfx', onVFX);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hasParticles = () =>
      brownShields.length > 0 || spikeGroups.length > 0 ||
      dewdrops.length > 0 || greenSlashes.length > 0 || acidFloods.length > 0 ||
      waterDrops.length > 0 || waterFloods.length > 0;

    const loop = () => {
      const dpr = window.devicePixelRatio || 1;
      const pw  = Math.round(window.innerWidth  * dpr);
      const ph  = Math.round(window.innerHeight * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw; canvas.height = ph;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, pw, ph);
        if (hasParticles()) {
          ctx.save();
          ctx.scale(dpr, dpr);
          drawAll(ctx, performance.now());
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      brownShields.length = 0;
      spikeGroups.length  = 0;
      dewdrops.length     = 0;
      greenSlashes.length = 0;
      acidFloods.length   = 0;
      waterDrops.length   = 0;
      waterFloods.length  = 0;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        inset:         0,
        width:         '100vw',
        height:        '100vh',
        zIndex:        300,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  );
}