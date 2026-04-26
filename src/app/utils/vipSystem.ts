/**
 * vipSystem.ts
 * VIP Level & VIP EXP engine
 *
 * VIP EXP required per level (n = current vip level):
 *   exp_required(n) = 60 * 2^n
 *
 *   VIP 0 → 1 :        60
 *   VIP 1 → 2 :       120
 *   VIP 2 → 3 :       240
 *   VIP 3 → 4 :       480
 *   VIP 4 → 5 :       960
 *   VIP 5 → 6 :     1,920
 *   VIP 6 → 7 :     3,840
 *   VIP 7 → 8 :     7,680
 *   VIP 8 → 9 :    15,360
 *   VIP 9 → 10:    30,720
 *   VIP 10→ 11:    61,440
 *   VIP 11→ 12:   122,880
 *   VIP 12→ 13:   245,760
 *   VIP 13→ 14:   491,520
 *   VIP 14→ 15:   983,040
 *   VIP 15→ 16: 1,966,080
 *   VIP 16→ 17: 3,932,160
 *   VIP 17→ 18: 7,864,320
 *   VIP 18→ 19:15,728,640
 *   VIP 19→ 20:31,457,280
 *   (MAX VIP = 20)
 */

export const MAX_VIP_LEVEL = 20;

/** VIP EXP required to advance FROM `vipLevel` to `vipLevel + 1` */
export function getVipExpRequired(vipLevel: number): number {
  const lv = Math.max(0, Math.min(vipLevel, MAX_VIP_LEVEL - 1));
  return 60 * Math.pow(2, lv);
}

export interface VipState {
  vip_level: number;
  vip_exp: number;
  /** VIP EXP needed to reach next level (0 if max) */
  vip_exp_required: number;
  /** 0–100 progress percentage */
  vip_exp_percentage: number;
}

/** Build VipState from stored vip_level + vip_exp values */
export function hydrateVipState(vip_level: number, vip_exp: number): VipState {
  const lv  = Math.max(0, Math.min(Math.round(vip_level), MAX_VIP_LEVEL));
  const req = lv >= MAX_VIP_LEVEL ? 0 : getVipExpRequired(lv);
  const exp = lv >= MAX_VIP_LEVEL ? 0 : Math.max(0, Math.min(Math.round(vip_exp), req - 1));
  const pct = lv >= MAX_VIP_LEVEL
    ? 100
    : req > 0 ? Math.min(100, Math.floor((exp / req) * 100)) : 0;
  return { vip_level: lv, vip_exp: exp, vip_exp_required: req, vip_exp_percentage: pct };
}

/**
 * Add `gained` VIP EXP to current state.
 * Returns new VipState (handles multi-level-up cascade).
 */
export function addVipExp(current: VipState, gained: number): VipState {
  if (gained <= 0) return current;
  let { vip_level } = current;
  let vip_exp = current.vip_exp + Math.round(gained);

  while (vip_level < MAX_VIP_LEVEL) {
    const req = getVipExpRequired(vip_level);
    if (vip_exp < req) break;
    vip_exp -= req;
    vip_level++;
  }

  if (vip_level >= MAX_VIP_LEVEL) {
    vip_level = MAX_VIP_LEVEL;
    vip_exp   = 0;
  }

  const vip_exp_required = vip_level >= MAX_VIP_LEVEL ? 0 : getVipExpRequired(vip_level);
  const vip_exp_percentage = vip_level >= MAX_VIP_LEVEL
    ? 100
    : vip_exp_required > 0 ? Math.min(100, Math.floor((vip_exp / vip_exp_required) * 100)) : 0;

  return { vip_level, vip_exp, vip_exp_required, vip_exp_percentage };
}

/** Fresh VIP state for a new profile */
export function freshVipState(): VipState {
  return hydrateVipState(0, 0);
}
