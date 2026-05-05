/**
 * BattleScreen — ATB battle engine + renderer
 *
 * Performance architecture:
 *   • AP gauge lives ONLY in apGaugeRef (plain JS object, zero React state).
 *   • A dedicated useEffect runs a requestAnimationFrame loop that reads the
 *     ref and paints the action bar canvas at 60 fps — completely outside React.
 *   • React re-renders happen ONLY on real game events (HP change, death, etc.).
 *   → Eliminates the 10-renders/second frame-drop caused by the old approach.
 *
 * ATB: finish line = 1 000. Every 100 ms each alive unit gains `speed` AP.
 *   First to reach 1 000 acts; AP resets to overflow (ap − 1 000).
 *   Super-fast units (speed > 1 000) still carry overflow to the next turn.
 *
 * Cinematic: non-basic skill → 1 s spotlight pause.
 *   Overlay + skill card rendered OUTSIDE the transform:scale() wrapper
 *   so position:fixed stays viewport-relative (no containing-block issue).
 */

import { useState, useEffect, useRef } from 'react';
import { useChromaKeyDataUrl } from '../../utils/chromaKey';
import { resolveTurn, completeBattle } from '/utils/supabase/battle-service';
import type { ResolveTurnResult } from '/utils/supabase/battle-service';
import { LucasVFX } from './LucasVFX';
import type { VFXTrigger } from './LucasVFX';
// Note: LucasVFX no longer needs sceneRef — uses window dimensions directly

const MELEE_TYPES = new Set(['Fighter', 'Tank']);

// ─── ATB ─────────────────────────────────────────────────────────────────
const ATB_FINISH  = 1_000;   // finish line
const ATB_TICK_MS = 100;     // ms between ticks

// ─── Formation layout ─────────────────────────────────────────────────────────
const GRID_W = 368;
const GRID_H = 310;
const ROW_DATA = [
  { slotW: 60,  slotH: 60,  col0X: 30,  col1X: 278, y: 8   },
  { slotW: 86,  slotH: 86,  col0X: 17,  col1X: 265, y: 82  },
  { slotW: 120, slotH: 120, col0X: 0,   col1X: 248, y: 190 },
] as const;

// ─── Asset maps ───────────────────────────────────────────────────────────────
const IDLE_SPRITES: Record<string, string> = {
  Lucas: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630336/idle_luk_mobysy.png',
  Emma:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630434/idle_em_p8uxjs.png',
  Gorr:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919607/ChatGPT_Image_May_5_2026_01_23_54_AM_nhkzmq.png',
  Craw:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919783/ChatGPT_Image_May_5_2026_01_26_59_AM_zfdewm.png',
  Myko:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005026/ChatGPT_Image_May_6_2026_01_01_00_AM_bhjzhr.png',
};
const ACTION_BGREMOVE: Record<string, string> = {
  Lucas: 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777631550/act_luc_mhmivj.png',
};
const ACTION_CHROMA: Record<string, string> = {
  Emma: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777630357/act_em_fnrl1t.png',
  Gorr: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919615/ChatGPT_Image_May_5_2026_01_31_48_AM_m65s2g.png',
  Craw: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777919799/ChatGPT_Image_May_5_2026_01_27_08_AM_p8yjub.png',
  Myko: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778005040/ChatGPT_Image_May_6_2026_01_03_49_AM_sirb54.png',
};
const ENEMY_IDLE: Record<string, string> = {
  RockSlime: 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634810/Gemini_Generated_Image_c7qsl1c7qsl1c7qs_mekkjz.png',
  AcidSlime: 'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634782/ChatGPT_Image_May_1_2026_06_25_59_PM_dsoxsd.png',
  WaterSlime:'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777545810/ChatGPT_Image_Apr_30_2026_05_40_35_PM_w370l3.png',
};
const SKILL_ICONS: Record<string, Partial<Record<string, string>>> = {
  Lucas: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550813/s1lukas_wrrnuo.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550848/ChatGPT_Image_Apr_30_2026_07_02_57_PM_kbtfs3.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550841/psvluk_b0quhw.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550833/ultlukas_jcehyx.png',
  },
  Emma: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550127/s1emma_1d4245.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550505/ChatGPT_Image_Apr_30_2026_06_53_05_PM_s9ssbz.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550512/ChatGPT_Image_Apr_30_2026_ffPM_m405s1.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550533/ultema_vshlxt.png',
  },
  RockSlime: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565812/s1rlime_hfstrz.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565820/s2rslime_shjl5b.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565826/s3rslime_vip7sb.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777565833/s4rslime_duuc2g.png',
  },
  AcidSlime: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806549/sk1acd_nqz0x5.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806563/sk2acd_x4d8qu.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806571/sk3acd_gh45ki.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777806578/sk4acd_mcmpzu.png',
  },
  WaterSlime: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807420/sk1wtr.pg_fbx8a0.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807428/sk2wtr_vmi777.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807444/sk3wtr_fedwpe.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777807456/sk4wtr_fbixax.png',
  },
  Gorr: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002904/sk1gor_wkgpaz.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002911/sk2gor_grkelh.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002917/sk3gor_ppjc9j.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002925/sk4gor_axfkc2.png',
  },
  Craw: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002931/sk1craw_cgwnc7.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002935/sk2craw_hmjjoz.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002946/sk3craw_f6s5e5.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778002939/sk4craw_zg73ez.png',
  },
  Myko: {
    sk1: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009427/sk1myk_nr36fc.png',
    sk2: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009434/sk2myk_nry1oe.png',
    sk3: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009440/sk3myk_oc94bf.png',
    ult: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1778009488/sk4myk_egyexz.png',
  },
};

// ─── Trail colors ─────────────────────────────────────────────────────────────
type TrailRgb = readonly [string, string, string];
const HERO_TRAIL: Record<string, TrailRgb> = {
  Lucas: ['rgba(205,155,82,0.76)','rgba(178,128,62,0.47)','rgba(150,102,45,0.24)'],
  Gorr:  ['rgba(180,40,40,0.78)', 'rgba(140,28,28,0.48)', 'rgba(100,18,18,0.24)'],
  Craw:  ['rgba(160,130,80,0.74)','rgba(120,100,55,0.46)','rgba(85,68,32,0.22)'],
};
const HERO_TRAIL_DEF: TrailRgb = ['rgba(140,210,255,0.72)','rgba(100,170,255,0.44)','rgba(70,130,255,0.22)'];
const ENEMY_TRAIL: Record<string, TrailRgb> = {
  RockSlime: ['rgba(98,65,30,0.80)','rgba(78,50,22,0.50)','rgba(60,38,15,0.26)'],
  AcidSlime: ['rgba(88,195,50,0.74)','rgba(64,162,38,0.46)','rgba(44,132,26,0.23)'],
  WaterSlime:['rgba(50,170,240,0.78)','rgba(30,130,200,0.48)','rgba(15,90,170,0.24)'],
};
const trail = (map: Record<string, TrailRgb>, def: TrailRgb) => (n: string) => {
  const [c1,c2,c3] = map[n] ?? def;
  return `drop-shadow(-26px 2px 7px ${c1}) drop-shadow(-54px 3px 13px ${c2}) drop-shadow(-82px 5px 17px ${c3})`;
};
const heroTrail  = trail(HERO_TRAIL,  HERO_TRAIL_DEF);
const enemyTrail = trail(ENEMY_TRAIL, ENEMY_TRAIL.RockSlime);
// Enemies whose sprite image natively faces LEFT — outer scaleX(-1) would flip them
// to face RIGHT, so we apply a counterflip scaleX(-1) on the img to restore LEFT facing.
const ENEMY_COUNTERFLIP = new Set(['WaterSlime']);

// ─── Cinematic helpers ──────────────────────────────────────────────────────
function calcSpotlightPos(side: 'hero'|'enemy', si: number) {
  const col=si%2, ri=Math.floor(si/2), row=ROW_DATA[ri];
  const slotX = col===0 ? row.col0X : row.col1X;
  const W=window.innerWidth, H=window.innerHeight;
  const gl = side==='hero' ? 12 : W-12-GRID_W;
  const cx = gl+slotX+row.slotW/2;
  const sb = H-(GRID_H-row.y-row.slotH);
  return { x:cx, y: side==='hero' ? (sb+4)-338*0.45 : (sb-4)-180*0.45 };
}
function calcZoomOrigin(side: 'hero'|'enemy', si: number) {
  const col=si%2, ri=Math.floor(si/2), row=ROW_DATA[ri];
  const slotX = col===0 ? row.col0X : row.col1X;
  const W=window.innerWidth, wH=Math.max(200,window.innerHeight-128);
  const gl = side==='hero' ? 12 : W-12-GRID_W;
  const cx = gl+slotX+row.slotW/2;
  const sb = wH-(GRID_H-row.y-row.slotH);
  const cy = side==='hero' ? (sb+4)-338*0.45 : (sb-4)-180*0.45;
  return `${Math.round(cx)}px ${Math.round(Math.max(0,cy))}px`;
}
function calcDashVec(aS: 'hero'|'enemy', aSlot: number, tSlot: number) {
  const W=window.innerWidth;
  const cx=(s: 'hero'|'enemy', sl: number) => {
    const c=sl%2, r=ROW_DATA[Math.floor(sl/2)];
    return (s==='hero'?12:W-12-GRID_W)+(c===0?r.col0X:r.col1X)+r.slotW/2;
  };
  const ax=cx(aS,aSlot), tS=aS==='hero'?'enemy':'hero', tx=cx(tS,tSlot);
  const stopX=aS==='hero'?tx-98:tx+98;
  const x=aS==='hero'?Math.max(0,stopX-ax):Math.min(0,stopX-ax);
  const ar=ROW_DATA[Math.floor(aSlot/2)], tr=ROW_DATA[Math.floor(tSlot/2)];
  return {x, y:(tr.y+tr.slotH)-(ar.y+ar.slotH)};
}

// ─── Skill system ─────────────────────────────────────────────────────────────
const SK_UNLOCK: Record<string,number[]> = {
  ult:[ 1,141,221,240], // Lv1 unlock → Lv2@141 → Lv3@221 → Lv4@240
  sk1:[21, 81,161,240], // Lv1 unlock@21 → Lv2@81 → Lv3@161 → Lv4@240
  sk2:[41,101,181,240], // Lv1 unlock@41 → Lv2@101 → Lv3@181 → Lv4@240
  sk3:[61,121,201,240], // passive — Lv1@61 → Lv2@121 → Lv3@201 → Lv4@240
};
function getSkillLv(lv:number,key:string) {
  const t=SK_UNLOCK[key]??[]; if(!t.length||lv<t[0])return 0;
  let sl=1; for(let i=1;i<t.length;i++){if(lv>=t[i])sl=i+1;else break;} return sl;
}
const SKILL_MULT: Record<string,Partial<Record<string,number[]>>> = {
  // Lucas ult: PER-HIT ratio (×3 hits in local fallback)
  Lucas:     {sk1:[1.65,2.00,2.40,2.90], sk2:[1.80,2.15,2.58,3.10], ult:[1.00,1.25,1.55,1.95]},
  Emma:      {sk1:[1.70,2.10,2.60,3.20], sk2:[1.40,1.75,2.15,2.65], ult:[1.20,1.50,1.88,2.35]},
  // Rock Shell (sk2): ratio applied to own MaxHP; Spike Eruption (ult): front_aoe
  RockSlime: {sk1:[1.00,1.22,1.48,1.80], sk2:[0.12,0.15,0.19,0.24], ult:[0.55,0.70,0.88,1.10]},
  // Corrosive Splash (sk2): 2 random front-row; Acid Flood (ult): all enemies
  AcidSlime: {sk1:[1.05,1.28,1.55,1.88], sk2:[0.68,0.84,1.02,1.24], ult:[0.78,0.96,1.18,1.44]},
  // Water Jet (sk1): fastest enemy; Tidal Surge (sk2): 2 front-row highest MaxHP; Deluge Wave (ult): all enemies
  WaterSlime:{sk1:[0.82,1.00,1.22,1.48], sk2:[0.58,0.72,0.88,1.08], ult:[0.72,0.88,1.08,1.32]},
};
const getMult=(n:string,s:string,lv:number)=>SKILL_MULT[n]?.[s]?.[Math.max(0,Math.min(3,lv-1))]??1.0;
const HEAL_SKILLS          = new Set(['Emma:sk1','Emma:ult']);
const SHIELD_SKILLS        = new Set(['Emma:sk2','RockSlime:sk2']); // Emma=mAtk×ratio; Rock Shell=MaxHP×ratio
const ROCK_SHELL_KEY       = 'RockSlime:sk2';                      // shield value uses own MaxHP, not mAtk
const FRONT_AOE_SKILLS     = new Set(['Lucas:ult','RockSlime:ult']); // all front-row enemies
const ALL_ENEMY_AOE_SKILLS = new Set(['AcidSlime:ult','WaterSlime:ult']); // every alive enemy
const BACK_SINGLE_SKILLS   = new Set(['AcidSlime:sk1']); // back-row single — skill only; basic attacks always front-row
const TWO_FRONT_RND_SKILLS = new Set(['AcidSlime:sk2']);               // 2 random front-row enemies
const HIGHEST_SPD_SKILLS   = new Set(['WaterSlime:sk1']);              // enemy with highest speed
const TWO_FRONT_HP_SKILLS  = new Set(['WaterSlime:sk2']);              // 2 front-row enemies by MaxHP desc
const MAGIC_DMG_HEROES     = new Set(['WaterSlime']);                  // use mAtk for damage (not atk)
const PDEF_SHRED_SKILLS    = new Set(['Lucas:sk2']);                   // apply P.DEF shred before damage
const PDEF_SHRED_VALS      = [80,100,125,150];                        // shred amount per skill Lv 1-4
const WARLORDS_EDGE_BONUS  = [0.08,0.14,0.20,0.28];                  // Lucas sk3 passive P.ATK bonus per Lv 1-4
const PDEF_K = 500; // P.DEF mitigation constant: dmg × 500/(pDef+500)
const SKILL_NAMES: Record<string,Partial<Record<string,string>>> = {
  Lucas:     {sk1:'Iron Cleave',   sk2:'Armor Rend',       ult:'Rampage Surge'},
  Emma:      {sk1:'Mending Touch', sk2:'Bulwark Veil',     ult:'Sacred Bloom'},
  RockSlime: {sk1:'Boulder Dash',  sk2:'Rock Shell',       ult:'Spike Eruption'},
  AcidSlime: {sk1:'Acid Spit',     sk2:'Corrosive Splash', ult:'Acid Flood'},
  WaterSlime:{sk1:'Water Jet',     sk2:'Tidal Surge',      ult:'Deluge Wave'},
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
;(() => {
  if(typeof document==='undefined')return;
  let s=document.getElementById('bs-css') as HTMLStyleElement|null;
  if(!s){s=document.createElement('style');s.id='bs-css';document.head.appendChild(s);}
  s.textContent=`
@keyframes battle-idle-b{0%,100%{transform:scaleY(1)scaleX(1)}40%,60%{transform:scaleY(1.022)scaleX(0.991)}}
.bs-idle{animation:battle-idle-b 3.8s ease-in-out infinite;transform-origin:center bottom}
@keyframes bs-slime{0%,100%{transform:translateY(0)scaleX(1)scaleY(1)}40%{transform:translateY(-14px)scaleX(.91)scaleY(1.09)}55%{transform:translateY(-16px)scaleX(.90)scaleY(1.10)}80%{transform:translateY(2px)scaleX(1.05)scaleY(.95)}}
.bs-slime{animation:bs-slime 1.7s ease-in-out infinite;transform-origin:center bottom}
@keyframes bs-slime-cfl{0%,100%{transform:translateY(0)scaleX(-1)scaleY(1)}40%{transform:translateY(-14px)scaleX(-.91)scaleY(1.09)}55%{transform:translateY(-16px)scaleX(-.90)scaleY(1.10)}80%{transform:translateY(2px)scaleX(-1.05)scaleY(.95)}}
.bs-slime-cfl{animation:bs-slime-cfl 1.7s ease-in-out infinite;transform-origin:center bottom}
@keyframes bs-fw{0%{transform:scaleX(1)}100%{transform:scaleX(-1)}}
.bs-flip-wind{animation:bs-fw .13s ease-in forwards;transform-origin:center;display:block}
@keyframes bs-fr{0%{transform:scaleX(-1)}100%{transform:scaleX(1)}}
.bs-flip-rev{animation:bs-fr .13s ease-out forwards;transform-origin:center;display:block}
@keyframes bs-hurt{0%{opacity:1;filter:brightness(1)saturate(1)}15%{opacity:.35;filter:brightness(4.5)saturate(0)}35%{opacity:.9;filter:brightness(2)saturate(.3)}65%{opacity:1;filter:brightness(1.3)saturate(.7)}100%{opacity:1;filter:brightness(1)saturate(1)}}
.bs-hurt{animation:bs-hurt .44s ease-out forwards}
@keyframes bs-die{0%{opacity:1}8%{opacity:.04}18%{opacity:1}28%{opacity:.04}40%{opacity:1}100%{opacity:0}}
.bs-dying{animation:bs-die 1.6s ease-in forwards;pointer-events:none}
@keyframes bs-skill-pop{0%{opacity:0;transform:translateX(-50%)translateY(4px)}14%{opacity:1;transform:translateX(-50%)translateY(0)}74%{opacity:1;transform:translateX(-50%)translateY(0)}100%{opacity:0;transform:translateX(-50%)translateY(-8px)}}
.bs-skill-lbl{animation:bs-skill-pop 1.1s ease-out forwards;pointer-events:none}
@keyframes bs-float-up{0%{transform:translateX(-50%)translateY(0);opacity:1}65%{transform:translateX(-50%)translateY(-40px);opacity:.9}100%{transform:translateX(-50%)translateY(-66px);opacity:0}}
.bs-float-num{position:absolute;top:22px;pointer-events:none;z-index:30;animation:bs-float-up 1.15s ease-out forwards;font-family:'Roboto Condensed',sans-serif;font-weight:900;font-size:13px;letter-spacing:.03em;text-shadow:0 1px 5px rgba(0,0,0,1),0 0 14px rgba(0,0,0,.9);white-space:nowrap}
@keyframes bs-cine-ov{0%{opacity:0}16%{opacity:1}84%{opacity:1}100%{opacity:0}}
.bs-cine-ov{animation:bs-cine-ov 1s ease-out forwards}
@keyframes bs-cl{0%{transform:translate(calc(-50% - 110vw),-50%);opacity:0}20%{transform:translate(-50%,-50%);opacity:1}78%{transform:translate(-50%,-50%);opacity:1}100%{transform:translate(calc(-50% - 110vw),-50%);opacity:0}}
@keyframes bs-cr{0%{transform:translate(calc(-50% + 110vw),-50%);opacity:0}20%{transform:translate(-50%,-50%);opacity:1}78%{transform:translate(-50%,-50%);opacity:1}100%{transform:translate(calc(-50% + 110vw),-50%);opacity:0}}
.bs-cine-card-l{animation:bs-cl 1s cubic-bezier(.25,.46,.45,.94) forwards}
.bs-cine-card-r{animation:bs-cr 1s cubic-bezier(.25,.46,.45,.94) forwards}
.bs-paused .bs-idle,.bs-paused .bs-slime,.bs-paused .bs-slime-cfl,.bs-paused .bs-hurt,.bs-paused .bs-flip-wind,.bs-paused .bs-flip-rev{animation-play-state:paused!important}
@keyframes bs-victory-in{0%{opacity:0;transform:scale(0.93)}100%{opacity:1;transform:scale(1)}}
.bs-victory{animation:bs-victory-in .52s cubic-bezier(.34,1.56,.64,1) forwards}
@keyframes bs-defeat-in{0%{opacity:0;transform:translateY(28px)}100%{opacity:1;transform:translateY(0)}}
.bs-defeat{animation:bs-defeat-in .4s ease-out forwards}
@keyframes bs-tap-pulse{0%,100%{opacity:0.3}50%{opacity:0.85}}
.bs-tap-pulse{animation:bs-tap-pulse 2s ease-in-out infinite}
@keyframes bs-reward-row{0%{opacity:0;transform:translateX(-18px)}100%{opacity:1;transform:translateX(0)}}
`;
})();

// ─── Types ────────────────────────────────────────────────────────────────────
export type BattleUnitDef = {
  uid:string; side:'hero'|'enemy'; name:string; heroType:string; slotIndex:number;
  hp:number; atk:number; mAtk:number; speed:number; level:number;
  pDef?:number; // physical defence — P.DEF mitigation + Armor Rend shred
};
type AnimPhase = 'idle'|'flip-windup'|'dashing'|'attacking'|'dash-return'|'flip-revert'|'hurt'|'dying'|'dead';
type FloatNum  = {id:number; uid:string; value:number; type:'dmg'|'heal'|'magic'; ox:number};
type CineInfo  = {uid:string; side:'hero'|'enemy'; slotIndex:number; skillName:string; skillSlot:string; heroName:string; key:number};
// ap intentionally NOT in UnitState — lives in apGaugeRef only
type UnitState = BattleUnitDef & {
  currentHp:number; animPhase:AnimPhase;
  dashOffsetX:number; dashOffsetY:number;
  personalTurn:number; shield:number;
  skillLabel:string; skillLabelKey:number;
  rage:number;      // 0–100 rage points
  sk1Used:boolean;  // skill 1 used this rage cycle
  sk2Used:boolean;  // skill 2 used this rage cycle
  pDefShred:number; // accumulated P.DEF reduction (Lucas sk2 Armor Rend)
};
// Lightweight record shared with the canvas rAF loop
type LiveEntry = {uid:string; name:string; side:'hero'|'enemy'};

// ─── Battle result overlay types ──────────────────────────────────────────────
type BattleRewards = { gold:number; gems:number; exp:number; hero_exp:number } | null;
type BattleResultData = { winner:'hero'|'enemy'; rewards:BattleRewards };

// ─── VictoryOverlay ───────────────────────────────────────────────────────────
function VictoryOverlay({rewards,onContinue}:{rewards:BattleRewards;onContinue:()=>void}){
  const F="'Roboto Condensed',sans-serif";
  const rows=rewards?[
    {label:'Gold',     value:`+${rewards.gold.toLocaleString()}`,     color:'#fcd34d',
      icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#D4A017"/><circle cx="12" cy="12" r="8" fill="#F5C842"/><text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#8B6000" fontFamily="serif">G</text></svg>},
    {label:'Gems',     value:`+${rewards.gems.toLocaleString()}`,     color:'#67e8f9',
      icon:<svg width="18" height="18" viewBox="0 0 14 16" fill="none"><polygon points="7,0 14,5 7,16 0,5" fill="#1AADEE"/><polygon points="7,0 14,5 7,7 0,5" fill="#5BCFFF"/><polygon points="7,0 10,5 7,7 4,5" fill="#A8EEFF"/></svg>},
    {label:'Acct EXP', value:`+${rewards.exp.toLocaleString()}`,      color:'#86efac',
      icon:<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><polygon points="10,1 14,7 19,8 15,13 16,19 10,16 4,19 5,13 1,8 6,7" stroke="#86efac" strokeWidth="1.3"/><polygon points="10,4 13,8 17,9 14,13 15,17 10,15 5,17 6,13 3,9 7,8" fill="#86efac" opacity="0.75"/></svg>},
    {label:'Hero EXP', value:`+${rewards.hero_exp.toLocaleString()}`, color:'#c4b5fd',
      icon:<svg width="18" height="18" viewBox="0 0 16 20" fill="none"><path d="M 5,6 L 5,14 Q 5,17 8,17 Q 11,17 11,14 L 11,6 Z" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/><path d="M 5.5,10 L 5.5,13.5 Q 5.5,16 8,16 Q 10.5,16 10.5,13.5 L 10.5,10 Z" fill="#c4b5fd"/><rect x="6" y="3" width="4" height="3" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/><ellipse cx="8" cy="3" rx="2.5" ry="1.2" fill="#8B4513"/><ellipse cx="8" cy="2.2" rx="2.5" ry="1" fill="#A0522D"/></svg>},
  ]:[];
  return(
    <div className="bs-victory" onClick={onContinue} style={{
      position:'fixed',inset:0,zIndex:10000,cursor:'pointer',
      background:'radial-gradient(ellipse at 50% 40%,rgba(28,18,4,0.97) 0%,rgba(0,0,0,0.98) 100%)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      gap:0,
    }}>
      {/* Light rays behind title */}
      <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
        width:'100%',height:'55%',pointerEvents:'none',
        background:'radial-gradient(ellipse at top,rgba(251,191,36,0.10) 0%,transparent 68%)'}}/>
      {/* VICTORY */}
      <div style={{fontFamily:F,fontSize:'clamp(40px,11vw,68px)',fontWeight:900,color:'#fbbf24',
        letterSpacing:'.22em',textTransform:'uppercase',
        textShadow:'0 0 36px rgba(251,191,36,0.9),0 0 72px rgba(251,191,36,0.45),0 2px 6px rgba(0,0,0,1)',
        marginBottom:12,lineHeight:1}}>
        VICTORY
      </div>
      {/* Divider */}
      <div style={{width:'clamp(180px,58vw,340px)',height:1,
        background:'linear-gradient(90deg,transparent,rgba(251,191,36,0.65),transparent)',
        marginBottom:rewards&&rows.length?26:40}}/>
      {/* Rewards */}
      {rows.length>0&&(
        <div style={{display:'flex',flexDirection:'column',gap:8,
          width:'clamp(210px,56vw,340px)',marginBottom:34}}>
          {rows.map((r,i)=>(
            <div key={r.label} style={{
              display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'9px 14px',borderRadius:8,
              background:'rgba(255,255,255,0.04)',
              border:'1px solid rgba(255,255,255,0.07)',
              animation:`bs-reward-row .36s ease-out ${i*0.09}s both`,
            }}>
              <div style={{display:'flex',alignItems:'center',gap:9}}>
                <div style={{width:20,height:20,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{r.icon}</div>
                <span style={{fontFamily:F,fontSize:13,fontWeight:600,
                  color:'rgba(255,255,255,0.65)',letterSpacing:'.04em'}}>{r.label}</span>
              </div>
              <span style={{fontFamily:F,fontSize:15,fontWeight:800,
                color:r.color,letterSpacing:'.04em'}}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {/* Tap hint */}
      <div className="bs-tap-pulse" style={{fontFamily:F,fontSize:'clamp(10px,2.8vw,13px)',
        fontWeight:600,color:'rgba(255,255,255,0.42)',letterSpacing:'.14em',
        textTransform:'uppercase'}}>
        TAP ANYWHERE TO CONTINUE
      </div>
    </div>
  );
}

// ─── FailedOverlay ────────────────────────────────────────────────────────────
function FailedOverlay({onContinue}:{onContinue:()=>void}){
  const F="'Roboto Condensed',sans-serif";
  return(
    <div className="bs-defeat" onClick={onContinue} style={{
      position:'fixed',inset:0,zIndex:10000,cursor:'pointer',
      background:'radial-gradient(ellipse at 50% 40%,rgba(18,4,4,0.97) 0%,rgba(0,0,0,0.98) 100%)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
    }}>
      <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
        width:'100%',height:'55%',pointerEvents:'none',
        background:'radial-gradient(ellipse at top,rgba(239,68,68,0.08) 0%,transparent 68%)'}}/>
      {/* DEFEAT */}
      <div style={{fontFamily:F,fontSize:'clamp(40px,11vw,68px)',fontWeight:900,color:'#ef4444',
        letterSpacing:'.22em',textTransform:'uppercase',
        textShadow:'0 0 36px rgba(239,68,68,0.85),0 0 72px rgba(239,68,68,0.40),0 2px 6px rgba(0,0,0,1)',
        marginBottom:12,lineHeight:1}}>
        DEFEAT
      </div>
      {/* Divider */}
      <div style={{width:'clamp(180px,58vw,340px)',height:1,
        background:'linear-gradient(90deg,transparent,rgba(239,68,68,0.55),transparent)',
        marginBottom:20}}/>
      {/* No reward note */}
      <div style={{fontFamily:F,fontSize:'clamp(11px,3.2vw,15px)',fontWeight:600,
        color:'rgba(255,255,255,0.30)',letterSpacing:'.10em',textTransform:'uppercase',
        marginBottom:44}}>
        NO REWARDS RECEIVED
      </div>
      {/* Tap hint */}
      <div className="bs-tap-pulse" style={{fontFamily:F,fontSize:'clamp(10px,2.8vw,13px)',
        fontWeight:600,color:'rgba(255,255,255,0.42)',letterSpacing:'.14em',
        textTransform:'uppercase'}}>
        TAP ANYWHERE TO CONTINUE
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function HpBar({current,max,shield=0,width=72}:{current:number;max:number;shield?:number;width?:number}){
  const H=8,pad=2,inner=width-pad*2;
  const hpW=Math.max(0,inner*Math.max(0,Math.min(1,max>0?current/max:0)));
  const shW=max>0?Math.max(0,Math.min(inner-hpW,shield/max*inner)):0;
  return(
    <svg width={width} height={H} style={{display:'block',filter:'drop-shadow(0 1px 3px rgba(0,0,0,.9))'}}>
      <rect x={0} y={0} width={width} height={H} rx={2} fill="#0a0a0a"/>
      <rect x={pad} y={pad} width={hpW} height={H-pad*2} rx={1} fill="#e53e3e"/>
      {shW>0&&<rect x={pad+hpW} y={pad} width={shW} height={H-pad*2} rx={1} fill="#fbbf24"/>}
    </svg>
  );
}
function RageBar({rage,width=72}:{rage:number;width?:number}){
  const H=4,pad=1,inner=width-pad*2;
  const rW=Math.max(0,inner*Math.max(0,Math.min(1,rage/100)));
  const fill=rage>=100?'#f59e0b':rage>=60?'#06b6d4':rage>=30?'#3b82f6':'#1e3a8a';
  const glow=rage>=100?'drop-shadow(0 0 5px rgba(245,158,11,0.95)) drop-shadow(0 0 9px rgba(245,158,11,0.5))':'none';
  return(
    <svg width={width} height={H} style={{display:'block',filter:glow}}>
      <rect x={0} y={0} width={width} height={H} rx={1} fill="rgba(0,0,0,0.55)"/>
      {rW>0&&<rect x={pad} y={pad} width={rW} height={H-pad*2} rx={0.5} fill={fill}/>}
      <rect x={Math.round(pad+inner*0.30)} y={0} width={1} height={H} fill="rgba(255,255,255,0.20)"/>
      <rect x={Math.round(pad+inner*0.60)} y={0} width={1} height={H} fill="rgba(255,255,255,0.20)"/>
    </svg>
  );
}
function HeroBattleSprite({name,phase,dashOffsetX,dashOffsetY,currentHp,maxHp,shield,rage,skillLabel,skillLabelKey,floats}:{
  name:string;phase:AnimPhase;dashOffsetX:number;dashOffsetY:number;
  currentHp:number;maxHp:number;shield:number;rage:number;skillLabel:string;skillLabelKey:number;floats:FloatNum[];
}){
  const idleUrl=useChromaKeyDataUrl(IDLE_SPRITES[name]??'');
  const chromaActUrl=useChromaKeyDataUrl(ACTION_CHROMA[name]??'');
  const actionSrc=ACTION_BGREMOVE[name]??(chromaActUrl??undefined);
  const showAct=phase==='attacking'||phase==='dashing';
  const src=(showAct&&actionSrc)?actionSrc:(idleUrl??undefined);
  const flipCls=phase==='flip-windup'?'bs-flip-wind':phase==='flip-revert'?'bs-flip-rev':'';
  const isDash=phase==='dashing', isRet=phase==='dash-return';
  return(
    <div className={phase==='dying'?'bs-dying':''} style={{
      position:'absolute',bottom:-4,left:'50%',
      transform:`translateX(calc(-50% + ${dashOffsetX}px)) translateY(${dashOffsetY}px)`,
      transition:isDash?'transform .15s cubic-bezier(.04,0,.08,1)':isRet?'transform .22s ease-out':'none',
      width:180,height:338,pointerEvents:'none',zIndex:10,
      filter:isDash?heroTrail(name):'',willChange:'transform,filter',
    }}>
      {/* Silhouette shadow — duplicate of the character image rendered solid black
          and squished flat. scaleY(0.65) from transform-origin:bottom center means:
            • 338px element → ~220px visual height at the very bottom
            • transparent padding (e.g. 20px) compresses to 2px → effectively invisible
            • visible silhouette always contacts the element bottom → no floating gap
          Follows the character during dash because it lives inside the same
          transform wrapper.
      */}
      {src && (
        <img
          src={src} alt="" aria-hidden draggable={false}
          style={{
            position:'absolute', inset:0,
            width:'100%', height:'100%',
            objectFit:'contain', objectPosition:'center bottom',
            // scaleY(0.65): shadow is 65% of character height (~220px) — "almost same size"
            // skewX(-12deg): leans right as if sun is from the left
            // transformOrigin bottom center: shadow grows up from feet
            // mask gradient: solid at feet → transparent near head
            //   naturally hides the transparent-padding gap at the base
            transform:'scaleY(0.65) skewX(-12deg)',
            transformOrigin:'bottom center',
            filter:'brightness(0) opacity(0.16)',
            WebkitMaskImage:'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.20) 72%, transparent 92%)',
            maskImage:'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.20) 72%, transparent 92%)',
            zIndex:0, pointerEvents:'none',
          }}
        />
      )}
      <div style={{position:'absolute',top:10,left:'50%',transform:'translateX(-50%)',zIndex:20,width:72,display:'flex',flexDirection:'column',gap:2}}>
        <HpBar current={currentHp} max={maxHp} shield={shield} width={72}/>
        <RageBar rage={rage} width={72}/>
      </div>
      {floats.map(f=>(
        <div key={f.id} className="bs-float-num" style={{left:`calc(50% + ${f.ox}px)`,color:f.type==='heal'?'#4ade80':f.type==='magic'?'#60a5fa':'#fc7d7d'}}>
          {f.type==='heal'?`+${f.value}`:`-${f.value}`}
        </div>
      ))}
      <div className={flipCls} style={{width:'100%',height:'100%',transformOrigin:'center',position:'relative',zIndex:1}}>
        <img src={src} alt={name} draggable={false}
          className={phase==='idle'?'bs-idle':phase==='hurt'?'bs-hurt':''}
          style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:'center bottom',display:'block'}}/>
      </div>
    </div>
  );
}
function EnemyBattleSprite({name,phase,dashOffsetX,dashOffsetY,currentHp,maxHp,shield,rage,skillLabel,skillLabelKey,floats}:{
  name:string;phase:AnimPhase;dashOffsetX:number;dashOffsetY:number;
  currentHp:number;maxHp:number;shield:number;rage:number;skillLabel:string;skillLabelKey:number;floats:FloatNum[];
}){
  const src=ENEMY_IDLE[name]??'';
  const flipCls=phase==='flip-windup'?'bs-flip-wind':phase==='flip-revert'?'bs-flip-rev':'';
  // WaterSlime image natively faces LEFT; outer container applies scaleX(-1) which would
  // flip it to face RIGHT. counterFlip adds scaleX(-1) on the img itself so the net
  // transform = outer(-1) × img(-1) = +1, restoring the original LEFT-facing direction.
  const counterFlip=ENEMY_COUNTERFLIP.has(name);
  const isDash=phase==='dashing', isRet=phase==='dash-return';
  return(
    <div className={phase==='dying'?'bs-dying':''} style={{
      position:'absolute',bottom:4,left:'50%',
      transform:`translateX(calc(-50% + ${dashOffsetX}px)) translateY(${dashOffsetY}px) scaleX(-1)`,
      transition:isDash?'transform .15s cubic-bezier(.04,0,.08,1)':isRet?'transform .22s ease-out':'none',
      width:180,height:180,pointerEvents:'none',zIndex:10,
      filter:isDash?enemyTrail(name):'',willChange:'transform,filter',
    }}>
      {/* Silhouette shadow — same technique as hero.
          scaleY(0.65) on a 180px container → ~220px flat shadow.
          scaleX(-1) inherited from parent container flips it correctly. */}
      {src && (
        <img
          src={src} alt="" aria-hidden draggable={false}
          style={{
            position:'absolute', inset:0,
            width:'100%', height:'100%',
            objectFit:'contain', objectPosition:'center bottom',
            // skewX(+12deg) inside scaleX(-1) container → visually leans right
            // same sun direction as hero shadow
            transform:'scaleY(0.65) skewX(12deg)',
            transformOrigin:'bottom center',
            filter:'brightness(0) opacity(0.15)',
            WebkitMaskImage:'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.20) 72%, transparent 92%)',
            maskImage:'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.20) 72%, transparent 92%)',
            zIndex:0, pointerEvents:'none',
          }}
        />
      )}
      <div style={{position:'absolute',top:6,left:'50%',transform:'translateX(-50%)',zIndex:20,width:68,display:'flex',flexDirection:'column',gap:2}}>
        <HpBar current={currentHp} max={maxHp} shield={shield} width={68}/>
        <RageBar rage={rage} width={68}/>
      </div>
      <div style={{position:'absolute',inset:0,transform:'scaleX(-1)',pointerEvents:'none',zIndex:2}}>
        {floats.map(f=>(
          <div key={f.id} className="bs-float-num" style={{top:22,left:`calc(50% + ${f.ox}px)`,color:f.type==='heal'?'#4ade80':f.type==='magic'?'#60a5fa':'#fc7d7d'}}>
            {f.type==='heal'?`+${f.value}`:`-${f.value}`}
          </div>
        ))}
      </div>
      <div className={flipCls} style={{width:'100%',height:'100%',transformOrigin:'center',position:'relative',zIndex:1}}>
        <img src={src} alt={name} draggable={false}
          className={phase==='idle'?(counterFlip?'bs-slime-cfl':'bs-slime'):phase==='hurt'?'bs-hurt':''}
          style={{
            width:'100%',height:'100%',objectFit:'contain',objectPosition:'center bottom',display:'block',
            // counterFlip: scaleX(-1) on img so net = outer(-1)×img(-1) = +1 (LEFT-facing preserved).
            // bs-slime-cfl animation also has scaleX(-1) in its keyframes to override this inline
            // style during idle — they agree so the result is consistent.
            // bs-hurt only animates opacity+filter, so this inline transform is preserved during hurt.
            transform:counterFlip?'scaleX(-1)':undefined,
          }}/>
      </div>
    </div>
  );
}
function BattleFieldSide({units,side,floatNums}:{units:UnitState[];side:'hero'|'enemy';floatNums:FloatNum[]}){
  return(
    <div style={{position:'relative',width:GRID_W,height:GRID_H,overflow:'visible'}}>
      {units.filter(u=>u.side===side).map(unit=>{
        if(unit.animPhase==='dead')return null;
        const col=unit.slotIndex%2, row=ROW_DATA[Math.floor(unit.slotIndex/2)];
        const slotX=col===0?row.col0X:row.col1X;
        const front=side==='hero'?(col===1):(col===0);
        const rowZ=Math.floor(unit.slotIndex/2)*2+(front?2:1);
        const floats=floatNums.filter(f=>f.uid===unit.uid);
        return(
          <div key={unit.uid} style={{position:'absolute',left:slotX,top:row.y,width:row.slotW,height:row.slotH,overflow:'visible',zIndex:rowZ}}>
            {side==='hero'
              ?<HeroBattleSprite name={unit.name} phase={unit.animPhase} dashOffsetX={unit.dashOffsetX} dashOffsetY={unit.dashOffsetY} currentHp={unit.currentHp} maxHp={unit.hp} shield={unit.shield} rage={unit.rage??0} skillLabel={unit.skillLabel} skillLabelKey={unit.skillLabelKey} floats={floats}/>
              :<EnemyBattleSprite name={unit.name} phase={unit.animPhase} dashOffsetX={unit.dashOffsetX} dashOffsetY={unit.dashOffsetY} currentHp={unit.currentHp} maxHp={unit.hp} shield={unit.shield} rage={unit.rage??0} skillLabel={unit.skillLabel} skillLabelKey={unit.skillLabelKey} floats={floats}/>
            }
          </div>
        );
      })}
    </div>
  );
}
function CinematicOverlay({info}:{info:CineInfo}){
  const {x:cx,y:cy}=calcSpotlightPos(info.side,info.slotIndex);
  const eW=info.side==='hero'?190:155, eH=info.side==='hero'?300:165;
  return(
    <div key={info.key} className="bs-cine-ov" style={{position:'fixed',inset:0,zIndex:9990,pointerEvents:'none',
      background:`radial-gradient(ellipse ${eW}px ${eH}px at ${cx.toFixed(0)}px ${cy.toFixed(0)}px,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 28%,rgba(0,0,0,.35) 60%,rgba(0,0,0,.62) 100%)`}}/>
  );
}
function CinematicSkillCard({info}:{info:CineInfo}){
  const iconUrl=SKILL_ICONS[info.heroName]?.[info.skillSlot]??'';
  const chromaUrl=useChromaKeyDataUrl(iconUrl);
  const finalSrc=chromaUrl??iconUrl;
  const F="'Roboto Condensed',sans-serif";
  return(
    <div key={info.key} className={info.side==='hero'?'bs-cine-card-l':'bs-cine-card-r'} style={{position:'fixed',top:'50%',left:'50%',zIndex:9992,pointerEvents:'none',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <div style={{fontFamily:F,fontSize:'clamp(15px,4vw,22px)',fontWeight:900,color:'#fff',letterSpacing:'.14em',textTransform:'uppercase',textShadow:'0 2px 16px rgba(0,0,0,1)',whiteSpace:'nowrap'}}>{info.skillName}</div>
      <div style={{width:'clamp(64px,16vw,84px)',height:'clamp(64px,16vw,84px)',borderRadius:12,overflow:'hidden',border:'1.5px solid rgba(249,115,22,.55)',background:'rgba(0,0,0,.55)',boxShadow:'0 0 26px rgba(249,115,22,.24),0 4px 20px rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        {finalSrc
          ?<img src={finalSrc} alt={info.skillName} draggable={false} style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}}/>
          :<svg width="46%" height="46%" viewBox="0 0 24 24" fill="none"><polygon points="12,2 15.5,8.5 22,9.3 17,14.2 18.5,21 12,17.5 5.5,21 7,14.2 2,9.3 8.5,8.5" fill="rgba(249,115,22,.5)" stroke="rgba(249,115,22,.8)" strokeWidth="1.2" strokeLinejoin="round"/></svg>
        }
      </div>
      <div style={{width:'clamp(200px,58vw,320px)',height:2,borderRadius:1,background:'linear-gradient(90deg,transparent 0%,#F97316 22%,#F97316 78%,transparent 100%)',boxShadow:'0 0 10px rgba(249,115,22,.55)',flexShrink:0}}/>
    </div>
  );
}

// ─── BattleScreen ─────────────────────────────────────────────────────────────
export function BattleScreen({units:initUnits,onVictory,onDefeat,sessionId}:{
  units:BattleUnitDef[]; onVictory?:()=>void; onDefeat?:()=>void;
  /** Server-side session ID — all turn results come from server when provided */
  sessionId?:string;
}){
  const stateRef  = useRef<UnitState[]>(initUnits.map(u=>({...u,currentHp:u.hp,animPhase:'idle',dashOffsetX:0,dashOffsetY:0,personalTurn:0,shield:0,skillLabel:'',skillLabelKey:0,rage:0,sk1Used:false,sk2Used:false,pDefShred:0})));
  const [snapshot,  setSnapshot]  = useState<UnitState[]>(()=>[...stateRef.current]);
  const [cinematic, setCinematic] = useState<CineInfo|null>(null);
  const [floatNums, setFloatNums] = useState<FloatNum[]>([]);
  // Ref to the scene wrapper div — passed to LucasVFX for viewport coordinate mapping
  const sceneWrapperRef = useRef<HTMLDivElement>(null);

  // ── AP gauge — plain object ref, NEVER in React state ──
  const apGaugeRef  = useRef<Record<string,number>>(Object.fromEntries(initUnits.map(u=>[u.uid,0])));
  // ── Lightweight unit list for the canvas rAF — updated on game events ──
  const liveRef     = useRef<LiveEntry[]>(initUnits.map(u=>({uid:u.uid,name:u.name,side:u.side})));
  // ── Canvas ref for the action bar ──
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  // ── Tracks real elapsed time for server AP validation ──
  const lastActionAtRef = useRef<number>(Date.now());

  const running    = useRef(true);
  const cbRef      = useRef({onVictory,onDefeat}); cbRef.current={onVictory,onDefeat};
  const setCinRef  = useRef(setCinematic);         setCinRef.current=setCinematic;
  const setFltRef  = useRef(setFloatNums);         setFltRef.current=setFloatNums;
  const floatId    = useRef(0);

  // ── Battle result overlay ─────────────────────────────────────────────────
  const [battleResult, setBattleResult] = useState<BattleResultData|null>(null);
  const setBRRef = useRef(setBattleResult); setBRRef.current=setBattleResult;

  const zoomOrigin = cinematic ? calcZoomOrigin(cinematic.side,cinematic.slotIndex) : 'center center';

  // ── Canvas action-bar rAF (completely independent of React renders) ─────────
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    // Smooth display AP (lerp toward real AP each frame)
    const dispAp:Record<string,number>={};
    let raf=0;

    const draw=()=>{
      // Keep canvas resolution in sync with CSS size
      const rect=canvas.getBoundingClientRect();
      const dpr=window.devicePixelRatio||1;
      const cssW=Math.round(rect.width), cssH=Math.round(rect.height);
      if(canvas.width!==Math.round(cssW*dpr)||canvas.height!==Math.round(cssH*dpr)){
        canvas.width=Math.round(cssW*dpr);
        canvas.height=Math.round(cssH*dpr);
      }
      const ctx=canvas.getContext('2d');
      if(!ctx){raf=requestAnimationFrame(draw);return;}

      // Work in CSS pixels
      ctx.save();
      ctx.scale(dpr,dpr);
      const W=cssW, H=cssH;
      ctx.clearRect(0,0,W,H);

      // Panel background
      ctx.fillStyle='rgba(0,0,0,0.40)';
      ctx.fillRect(0,0,W,H);
      // Bottom border accent
      ctx.fillStyle='rgba(249,115,22,0.35)';
      ctx.fillRect(0,H-1,W,1);

      const PAD=18, trackY=H-11, trackW=W-PAD*2;

      // Track rail
      ctx.fillStyle='rgba(255,255,255,0.12)';
      ctx.fillRect(PAD,trackY-1,trackW,2);

      // Finish line (orange)
      ctx.fillStyle='#F97316';
      ctx.fillRect(PAD+trackW,trackY-8,2,16);
      ctx.font="700 7px 'Roboto Condensed',sans-serif";
      ctx.fillStyle='rgba(249,115,22,0.8)';
      ctx.textAlign='center';
      ctx.fillText('ACT',PAD+trackW+1,trackY-12);

      // Unit markers
      const units=liveRef.current;
      const LERP=0.18; // smoothing factor per frame ~60fps
      for(const u of units){
        const target=Math.min(apGaugeRef.current[u.uid]??0, ATB_FINISH);
        const prev=dispAp[u.uid]??target;
        const disp=prev+(target-prev)*LERP;
        dispAp[u.uid]=disp;
        const pct=disp/ATB_FINISH;
        const x=PAD+pct*trackW;
        const color=u.side==='hero'?'#fbbf24':'#f87171';

        ctx.textAlign='center';
        ctx.shadowColor='rgba(0,0,0,0.95)';
        ctx.shadowBlur=4;

        ctx.font="800 8px 'Roboto Condensed',sans-serif";
        ctx.fillStyle=color;
        ctx.fillText(u.name,x,trackY-15);

        ctx.font="600 7px 'Roboto Condensed',sans-serif";
        ctx.fillText('▼',x,trackY-3);
        ctx.shadowBlur=0;
      }

      ctx.restore();
      raf=requestAnimationFrame(draw);
    };

    raf=requestAnimationFrame(draw);
    return()=>cancelAnimationFrame(raf);
  },[]); // no deps — reads refs, never stale

  // ── Battle loop useEffect ──────────────────────────────────────────────────
  useEffect(()=>{
    running.current=true;

    const sync=()=>{
      const snap=[...stateRef.current];
      setSnapshot(snap);
      // Update live unit list for canvas (only alive, non-dead)
      liveRef.current=snap
        .filter(u=>u.currentHp>0&&u.animPhase!=='dead')
        .map(u=>({uid:u.uid,name:u.name,side:u.side}));
    };
    const patch=(uid:string,p:Partial<UnitState>)=>{
      stateRef.current=stateRef.current.map(u=>u.uid===uid?{...u,...p}:u);
      sync();
    };
    const delay=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

    const addFloat=(uid:string,value:number,type:FloatNum['type'])=>{
      const id=++floatId.current, ox=-18+Math.floor(Math.random()*36);
      setFltRef.current(p=>[...p,{id,uid,value,type,ox}]);
      setTimeout(()=>setFltRef.current(p=>p.filter(f=>f.id!==id)),1200);
    };

    const findTarget=(aS:'hero'|'enemy'):UnitState|null=>{
      const tS=aS==='hero'?'enemy':'hero';
      const alive=stateRef.current.filter(u=>u.side===tS&&u.currentHp>0);
      if(!alive.length)return null;
      const fc=tS==='enemy'?0:1;
      const front=alive.filter(u=>u.slotIndex%2===fc);
      const pool=front.length?front:alive;
      return[...pool].sort((a,b)=>Math.floor(b.slotIndex/2)-Math.floor(a.slotIndex/2))[0]??pool[0];
    };
    const findAoe=(aS:'hero'|'enemy'):UnitState[]=>{
      const tS=aS==='hero'?'enemy':'hero';
      const alive=stateRef.current.filter(u=>u.side===tS&&u.currentHp>0);
      const fc=tS==='enemy'?0:1, front=alive.filter(u=>u.slotIndex%2===fc);
      return front.length?front:alive;
    };
    // ── Back-row priority helpers (AcidSlime) ─────────────────────────────────
    // Hero panel : col1(odd)=FRONT, col0(even)=BACK
    // Enemy panel: col0(even)=FRONT, col1(odd)=BACK → backCol = opposite of frontCol
    const findTargetBack=(aS:'hero'|'enemy'):UnitState|null=>{
      const tS=aS==='hero'?'enemy':'hero';
      const alive=stateRef.current.filter(u=>u.side===tS&&u.currentHp>0);
      if(!alive.length)return null;
      const bc=tS==='enemy'?1:0; // back col for the target side
      const back=alive.filter(u=>u.slotIndex%2===bc);
      const pool=back.length?back:alive; // fallback to all if back row is empty
      return pool[Math.floor(Math.random()*pool.length)];
    };
    const findAoeBack=(aS:'hero'|'enemy'):UnitState[]=>{
      const tS=aS==='hero'?'enemy':'hero';
      const alive=stateRef.current.filter(u=>u.side===tS&&u.currentHp>0);
      const bc=tS==='enemy'?1:0;
      const back=alive.filter(u=>u.slotIndex%2===bc);
      return back.length?back:alive;
    };
    // AcidSlime:sk2 Corrosive Splash — "2 random front-row enemies" (NOT back-row)
    const findTwoFrontRandom=(aS:'hero'|'enemy'):UnitState[]=>{
      const tS=aS==='hero'?'enemy':'hero';
      const alive=stateRef.current.filter(u=>u.side===tS&&u.currentHp>0);
      const fc=tS==='enemy'?0:1, front=alive.filter(u=>u.slotIndex%2===fc);
      const pool=front.length?front:alive;
      if(pool.length<=2)return pool;
      const sh=[...pool].sort(()=>Math.random()-0.5); return sh.slice(0,2);
    };
    // WaterSlime:sk1 Water Jet — "the fastest enemy"
    const findHighestSpd=(aS:'hero'|'enemy'):UnitState|null=>{
      const tS=aS==='hero'?'enemy':'hero';
      const alive=stateRef.current.filter(u=>u.side===tS&&u.currentHp>0);
      if(!alive.length)return null;
      return alive.reduce((b,u)=>u.speed>b.speed?u:b,alive[0]);
    };
    // WaterSlime:sk2 Tidal Surge — "2 front-row enemies with the highest Max HP"
    const findTwoFrontMaxHp=(aS:'hero'|'enemy'):UnitState[]=>{
      const tS=aS==='hero'?'enemy':'hero';
      const alive=stateRef.current.filter(u=>u.side===tS&&u.currentHp>0);
      const fc=tS==='enemy'?0:1, front=alive.filter(u=>u.slotIndex%2===fc);
      const pool=front.length?front:alive;
      return [...pool].sort((a,b)=>b.hp-a.hp).slice(0,2);
    };
    const applyDmg=(att:UnitState,tUid:string,mult:number)=>{
      const tgt=stateRef.current.find(u=>u.uid===tUid);
      if(!tgt||tgt.currentHp<=0)return;
      // WaterSlime: magical damage uses mAtk; all others: physical uses atk
      let base=MAGIC_DMG_HEROES.has(att.name)?(att.mAtk??att.atk):att.atk;
      // ── Lucas passive: Warlord's Edge (sk3) — P.ATK permanently boosted ──
      if(att.name==='Lucas'){
        const sk3Lv=getSkillLv(att.level,'sk3');
        if(sk3Lv>0) base=Math.round(base*(1+(WARLORDS_EDGE_BONUS[sk3Lv-1]??0)));
      }
      // ── P.DEF mitigation: dmg × PDEF_K / (effectivePDef + PDEF_K) ────────
      // effectivePDef = base pDef − accumulated shred (Armor Rend debuff), min 0
      const effectivePDef=Math.max(0,(tgt.pDef??0)-(tgt.pDefShred??0));
      const mitFactor=PDEF_K/(effectivePDef+PDEF_K); // 1.0 when pDef=0; decreases as pDef rises
      const raw=Math.max(1,Math.round(base*mult*mitFactor));
      const sa=Math.min(tgt.shield,raw), hp=Math.max(0,tgt.currentHp-(raw-sa));
      addFloat(tUid,raw,MAGIC_DMG_HEROES.has(att.name)?'magic':'dmg');
      if(hp<=0){patch(tUid,{currentHp:0,shield:0,animPhase:'dying'});setTimeout(()=>patch(tUid,{animPhase:'dead'}),1600);}
      else{
        // +10 rage for taking a hit (local fallback only; server sends rage_state)
        const newRage=Math.min(100,(tgt.rage??0)+10);
        patch(tUid,{currentHp:hp,shield:tgt.shield-sa,animPhase:'hurt',rage:newRage});
        setTimeout(()=>patch(tUid,{animPhase:'idle'}),440);
      }
    };
    const applyHeal=(att:UnitState,tUid:string,mult:number)=>{
      const tgt=stateRef.current.find(u=>u.uid===tUid);
      if(!tgt||tgt.currentHp<=0)return;
      const h=Math.max(1,Math.round((att.mAtk??att.atk)*mult));
      addFloat(tUid,h,'heal');
      patch(tUid,{currentHp:Math.min(tgt.hp,tgt.currentHp+h)});
    };
    const applyShield=(att:UnitState,tUid:string,mult:number)=>{
      const tgt=stateRef.current.find(u=>u.uid===tUid);
      if(!tgt||tgt.currentHp<=0)return;
      patch(tUid,{shield:tgt.shield+Math.max(1,Math.round((att.mAtk??att.atk)*mult))});
    };

    const executeAttack=async(uid:string)=>{
      const att=stateRef.current.find(u=>u.uid===uid);
      if(!att||att.currentHp<=0)return;

      // ── Rage-based skill selection ─────────────────────────────────────────
      const rage=att.rage??0;
      const sk1Used=att.sk1Used??false;
      const sk2Used=att.sk2Used??false;
      const sk1Lv=getSkillLv(att.level,'sk1');
      const sk2Lv=getSkillLv(att.level,'sk2');
      const ultLv=getSkillLv(att.level,'ult');

      let slot:'basic'|'sk1'|'sk2'|'ult';
      if(rage>=100&&ultLv>0)                slot='ult';
      else if(rage>=60&&!sk2Used&&sk2Lv>0)  slot='sk2';
      else if(rage>=30&&!sk1Used&&sk1Lv>0)  slot='sk1';
      else                                   slot='basic';

      // skillLv needed by local-fallback getMult() — keep even when server is active
      const skillLv=slot==='basic'?0:getSkillLv(att.level,slot);

      const isMelee=MELEE_TYPES.has(att.heroType);
      const label=slot==='basic'?'':(SKILL_NAMES[att.name]?.[slot]??'');
      const turnKey=att.personalTurn+1;

      patch(uid,{personalTurn:turnKey,skillLabel:label,skillLabelKey:turnKey});
      if(label)setTimeout(()=>patch(uid,{skillLabel:''}),1200);

      // ── Immediate actor rage feedback (before any await / server response) ─
      // Server rage_state in applyResults() will overwrite with authoritative
      // value afterwards — this only drives the visual bar update immediately.
      {
        const cur=stateRef.current.find(u=>u.uid===uid);
        if(cur){
          if(slot==='basic')    patch(uid,{rage:Math.min(100,(cur.rage??0)+5)});
          else if(slot==='sk1') patch(uid,{sk1Used:true});
          else if(slot==='sk2') patch(uid,{sk2Used:true});
          else if(slot==='ult') patch(uid,{rage:0,sk1Used:false,sk2Used:false});
        }
      }

      // ── Elapsed time for server AP validation ────────────────────────────
      const now=Date.now();
      const elapsedMs=Math.max(50,Math.min(now-lastActionAtRef.current,2000));
      lastActionAtRef.current=now;

      // ── Fire server call IMMEDIATELY — runs in parallel with cinematic ───
      // Server receives real elapsed_ms, independently validates AP ≥ 1 000,
      // picks skill from hero_skills table, computes damage — all server-side.
      const srvPromise=sessionId
        ?resolveTurn(sessionId,uid,elapsedMs)
        :Promise.resolve({data:undefined as ResolveTurnResult|undefined,error:undefined as string|undefined});

      // Cinematic pause (skill preview for UX — server confirms after)
      if(slot!=='basic'){
        setCinRef.current({uid,side:att.side,slotIndex:att.slotIndex,skillName:label,skillSlot:slot,heroName:att.name,key:turnKey});
        await delay(980);
        setCinRef.current(null);
        await delay(50);
      }

      // ── Await server result (ready after cinematic ≥ 1 000 ms wait) ─────
      let srvResult:ResolveTurnResult|null=null;
      if(sessionId){
        const {data,error}=await srvPromise;
        if(error){
          // ── FIX 1: Don't kill the whole battle on a server error ──────────
          // Root cause of "gauge freeze": actor/ap-not-ready was thrown when
          // elapsed_ms cap (2000ms) caused server AP to lag behind client AP.
          // Solution: log the error, fall back to local damage calc for this
          // turn only, and let the battle continue.
          console.warn('[Battle] RPC warn (local fallback):',error);
          // srvResult stays null → applyResults() will use LOCAL FALLBACK path
        } else {
          srvResult=data??null;
          // ── AP sync intentionally REMOVED ────────────────────────────────
          // Syncing ANY ap_state value from server to client causes infinite
          // turns: server advances ALL units' AP on every RPC call, so a unit
          // that hasn't acted for N turns has N×elapsed_ms of accumulated AP
          // stored. When it finally acts, server returns leftover_ap >= 1000,
          // client overwrites apGaugeRef → unit immediately acts again → loop.
          // Fix: client tick-loop is the SOLE authority for AP timing.
          // Server remains authoritative for damage/heal/HP/win detection only.
        }
      }

      // Skill key — used for targeting logic and Lucas 3-hit detection
      const skillKey=`${att.name}:${slot}`;

      // Local skill flags — used ONLY for animation choice, NOT for damage
      const isHeal  =slot!=='basic'&&HEAL_SKILLS.has(skillKey);
      const isShield=slot!=='basic'&&SHIELD_SKILLS.has(skillKey);
      // ── FIX 2: Use server's chosen target_uid for dash animation ──────────
      // Before: client used findTarget() (front-row logic) for animation
      // but server used RANDOM — so dash went to unit X but damage hit unit Y.
      // Now: server picks deterministically (front-row priority, highest slot).
      // Client reads server's target_uid so dash direction always matches.
      const srvTargetUid=srvResult?.targets?.find(t=>t.type==='dmg')?.target_uid;
      const pri=(isHeal||isShield)
        ?null
        :(srvTargetUid
            ?stateRef.current.find(u=>u.uid===srvTargetUid)??findTarget(att.side)
            :findTarget(att.side));
      const dv=(isMelee&&pri)?calcDashVec(att.side,att.slotIndex,pri.slotIndex):{x:0,y:0};

      // ── Apply server result OR local fallback (dev/offline mode) ──────────
      const applyResults=()=>{
        if(srvResult){
          // SERVER PATH: all values authoritative — client cannot modify
          for(const tgt of srvResult.targets){
            const sHp   =srvResult.hp_state[tgt.target_uid]??0;
            const sAlive=srvResult.alive_state[tgt.target_uid]??false;
            if(tgt.type==='dmg'&&tgt.damage>0){
              addFloat(tgt.target_uid,tgt.damage,'dmg');
              if(!sAlive){
                patch(tgt.target_uid,{currentHp:0,shield:0,animPhase:'dying'});
                setTimeout(()=>patch(tgt.target_uid,{animPhase:'dead'}),1600);
              }else{
                patch(tgt.target_uid,{currentHp:sHp,animPhase:'hurt'});
                setTimeout(()=>patch(tgt.target_uid,{animPhase:'idle'}),440);
              }
            }else if(tgt.type==='heal'&&tgt.heal>0){
              addFloat(tgt.target_uid,tgt.heal,'heal');
              patch(tgt.target_uid,{currentHp:sHp});
            }else if(tgt.type==='shield'&&tgt.shield&&tgt.shield>0){
              // Show shield grant as green float number for visual feedback
              addFloat(tgt.target_uid,tgt.shield,'heal');
              const cur=stateRef.current.find(u=>u.uid===tgt.target_uid);
              if(cur)patch(tgt.target_uid,{shield:(cur.shield||0)+tgt.shield});
            }
          }
          // ── Sync rage + skill flags from server (single batch update) ─────
          if(srvResult.rage_state||srvResult.skill_flags){
            const rageS=srvResult.rage_state??{};
            const flagS=srvResult.skill_flags??{};
            stateRef.current=stateRef.current.map(u=>{
              const newRage=rageS[u.uid];
              const flags=flagS[u.uid];
              if(newRage!==undefined||flags){
                return{
                  ...u,
                  ...(newRage!==undefined?{rage:newRage}:{}),
                  ...(flags?.sk1_used!==undefined?{sk1Used:flags.sk1_used}:{}),
                  ...(flags?.sk2_used!==undefined?{sk2Used:flags.sk2_used}:{}),
                };
              }
              return u;
            });
            sync(); // push rage bar updates to React
          }
        }else{
          // LOCAL FALLBACK — active only when sessionId not provided (dev / offline mode)
          const mult=slot==='basic'?(0.88+Math.random()*0.24):getMult(att.name,slot,skillLv);
          // skillKey already defined in outer scope — reuse it
          if(isHeal){
            // Emma:sk1 Mending Touch → 1 ally lowest HP; Emma:ult Sacred Bloom → 3 allies
            const n=att.name==='Emma'&&slot==='ult'?3:1;
            [...stateRef.current.filter(u=>u.side===att.side&&u.currentHp>0)]
              .sort((a,b)=>(a.currentHp/a.hp)-(b.currentHp/b.hp)).slice(0,n)
              .forEach(t=>applyHeal(att,t.uid,mult));
          }else if(isShield){
            if(skillKey===ROCK_SHELL_KEY){
              // Rock Shell: shield = mult × own MaxHP (NOT mAtk)
              const self=stateRef.current.find(u=>u.uid===att.uid);
              if(self){
                const shVal=Math.max(1,Math.round(self.hp*mult));
                addFloat(att.uid,shVal,'heal');
                patch(att.uid,{shield:(self.shield||0)+shVal});
              }
            }else{
              // Emma:sk2 Bulwark Veil → ally with highest MaxHP
              const t=[...stateRef.current.filter(u=>u.side===att.side&&u.currentHp>0)].sort((a,b)=>b.hp-a.hp)[0];
              if(t)applyShield(att,t.uid,mult);
            }
          }else if(PDEF_SHRED_SKILLS.has(skillKey)){
            // Lucas:sk2 Armor Rend — rend P.DEF then deal damage to single front-row target
            if(pri){
              const shredVal=PDEF_SHRED_VALS[Math.max(0,Math.min(3,skillLv-1))]??80;
              const t=stateRef.current.find(u=>u.uid===pri.uid);
              if(t) patch(pri.uid,{pDefShred:(t.pDefShred??0)+shredVal}); // apply shred first
              applyDmg(att,pri.uid,mult); // damage uses reduced P.DEF immediately
            }
          }else if(FRONT_AOE_SKILLS.has(skillKey)){
            // RockSlime:ult Spike Eruption — all front-row (1 hit)
            // NOTE: Lucas:ult is intercepted by doApply() before applyResults()
            // and handled as 3 consecutive hits — this branch only fires for RockSlime
            findAoe(att.side).forEach(t=>applyDmg(att,t.uid,mult));
          }else if(ALL_ENEMY_AOE_SKILLS.has(skillKey)){
            // AcidSlime:ult Acid Flood + WaterSlime:ult Deluge Wave — every alive enemy
            const tS=att.side==='hero'?'enemy':'hero';
            stateRef.current.filter(u=>u.side===tS&&u.currentHp>0).forEach(t=>applyDmg(att,t.uid,mult));
          }else if(TWO_FRONT_RND_SKILLS.has(skillKey)){
            // AcidSlime:sk2 Corrosive Splash — 2 random FRONT-ROW enemies
            findTwoFrontRandom(att.side).forEach(t=>applyDmg(att,t.uid,mult));
          }else if(HIGHEST_SPD_SKILLS.has(skillKey)){
            // WaterSlime:sk1 Water Jet — fastest enemy
            const t=findHighestSpd(att.side); if(t)applyDmg(att,t.uid,mult);
          }else if(TWO_FRONT_HP_SKILLS.has(skillKey)){
            // WaterSlime:sk2 Tidal Surge — 2 front-row enemies with highest MaxHP
            findTwoFrontMaxHp(att.side).forEach(t=>applyDmg(att,t.uid,mult));
          }else if(BACK_SINGLE_SKILLS.has(skillKey)){
            // AcidSlime:sk1 Acid Spit — single back-row enemy
            const t=findTargetBack(att.side); if(t)applyDmg(att,t.uid,mult);
          }else if(pri){
            // Default: single front-row priority target
            applyDmg(att,pri.uid,mult);
          }
        }
      };

      patch(uid,{animPhase:'flip-windup'}); await delay(120);

      // ── doApply: async wrapper — handles Lucas ult 3-hit in local mode ─────
      const doApply=async()=>{
        // Lucas:ult local fallback → 3 consecutive hits on all front-row enemies
        if(!srvResult&&skillKey==='Lucas:ult'){
          const targets=findAoe(att.side);
          for(let h=0;h<3;h++){
            // VFX per hit × per front-row target
            if(att.name==='Lucas'){
              const tSlots=targets.map(t=>t.slotIndex);
              window.dispatchEvent(new CustomEvent<VFXTrigger>('lucas-vfx',{detail:{
                type:'lucas_ult_hit',
                actorSlot:att.slotIndex, actorSide:att.side,
                targetSlots:tSlots, targetSide:att.side==='hero'?'enemy':'hero',
                hitIndex:h,
              }}));
            }
            targets.forEach(t=>applyDmg(att,t.uid,getMult(att.name,'ult',skillLv)));
            if(h<2)await delay(180);
          }
        }else{
          // Server mode ULT: fire 3 staggered VFX bursts based on server targets
          if(srvResult&&skillKey==='Lucas:ult'&&att.name==='Lucas'){
            const dmgUids=[...new Set(srvResult.targets.filter(t=>t.type==='dmg').map(t=>t.target_uid))];
            const tSlots=dmgUids.map(uid=>stateRef.current.find(u=>u.uid===uid)?.slotIndex??0);
            for(let h=0;h<3;h++){
              const hIdx=h;
              setTimeout(()=>window.dispatchEvent(new CustomEvent<VFXTrigger>('lucas-vfx',{detail:{
                type:'lucas_ult_hit',
                actorSlot:att.slotIndex, actorSide:att.side,
                targetSlots:tSlots, targetSide:att.side==='hero'?'enemy':'hero',
                hitIndex:hIdx,
              }})),hIdx*185);
            }
          }
          applyResults(); // server path or any other skill
        }
      };

      // ── VFX dispatch (client-only visual, no server impact) ──────────────
      // For ULT: dispatched inside doApply() per-hit. For others: fire here.
      const fireNonUltVFX=()=>{
        if(att.name!=='Lucas'||slot==='ult')return;
        const vfxType=slot==='basic'?'lucas_basic':slot==='sk1'?'lucas_sk1':'lucas_sk2';
        const tSlots=pri?[pri.slotIndex]
          :(slot==='sk2'?findAoe(att.side).slice(0,1).map(t=>t.slotIndex):[]);
        if(!tSlots.length)return;
        window.dispatchEvent(new CustomEvent<VFXTrigger>('lucas-vfx',{detail:{
          type:vfxType,
          actorSlot:att.slotIndex, actorSide:att.side,
          targetSlots:tSlots, targetSide:att.side==='hero'?'enemy':'hero',
        }}));
      };

      if(isMelee&&pri){
        patch(uid,{animPhase:'dashing',dashOffsetX:dv.x,dashOffsetY:dv.y}); await delay(140);
        patch(uid,{animPhase:'attacking'}); fireNonUltVFX(); await delay(220);
        await doApply();
        patch(uid,{animPhase:'dash-return',dashOffsetX:0,dashOffsetY:0}); await delay(180);
      }else{
        patch(uid,{animPhase:'attacking'}); fireNonUltVFX(); await delay(350);
        await doApply();
      }
      patch(uid,{animPhase:'flip-revert'}); await delay(120);
      patch(uid,{animPhase:'idle'});

      // ── Local fallback rage update for actor (server path already synced) ──
      // (actor rage/flag already applied immediately at turn start — no duplicate block)

      // ── Server says battle ended: finalize & notify ───────────────────────
      if(srvResult?.ended&&running.current){
        running.current=false;
        let rewards:BattleRewards=null;
        if(sessionId){
          try{
            const {data}=await completeBattle(sessionId);
            rewards=data?.rewards??null;
            if(rewards)console.log('[Battle] ✓ Rewards:',rewards);
          }catch(e){console.error('[Battle] completeBattle error:',e);}
        }
        // Show result overlay — player taps to call onVictory/onDefeat
        setBRRef.current({winner:srvResult.winner??'enemy', rewards});
      }
    };

    // ── ATB tick loop — NO React state update on tick ─────────────────────────
    const battleLoop=async()=>{
      // Initialise AP gauge from ref (already zero-filled at component creation)
      await delay(400);

      while(running.current){
        // ── Tick ──────────────────────────��─────────────────────────────────
        await delay(ATB_TICK_MS);
        if(!running.current)break;

        const alive=stateRef.current.filter(u=>u.currentHp>0&&u.animPhase!=='dead');
        // Advance AP — write to ref only, zero React renders
        for(const u of alive){
          apGaugeRef.current[u.uid]=(apGaugeRef.current[u.uid]??0)+u.speed;
        }
        // ✓ NO sync() / setSnapshot here — canvas reads ref directly

        // ── Process all ready units before next tick ─────────────────────────
        let anyReady=true;
        while(anyReady&&running.current){
          const cur=stateRef.current.filter(u=>u.currentHp>0&&u.animPhase!=='dead');
          const ready=cur
            .filter(u=>(apGaugeRef.current[u.uid]??0)>=ATB_FINISH)
            .sort((a,b)=>{
              const d=(apGaugeRef.current[b.uid]??0)-(apGaugeRef.current[a.uid]??0);
              return d!==0?d:b.speed-a.speed;
            });

          if(!ready.length){anyReady=false;}
          else{
            const actor=ready[0];
            // Carry overflow to next turn
            apGaugeRef.current[actor.uid]=(apGaugeRef.current[actor.uid]??0)-ATB_FINISH;
            try{ await executeAttack(actor.uid); }
            catch(e){ console.error('[Battle] executeAttack threw:',e); }
            if(!running.current)break; // server overlay already shown — stop inner loop
            const ha=stateRef.current.filter(u=>u.side==='hero'&&u.currentHp>0);
            const ea=stateRef.current.filter(u=>u.side==='enemy'&&u.currentHp>0);
            if(!ha.length||!ea.length){
              running.current=false;
              const w:BattleResultData['winner']=ea.length===0?'hero':'enemy';
              let rewards:BattleRewards=null;
              if(sessionId){
                try{
                  const {data}=await completeBattle(sessionId);
                  rewards=data?.rewards??null;
                }catch(e){}
              }
              setBRRef.current({winner:w, rewards});
              break;
            }
            await delay(200);
          }
        }
      }
    };

    battleLoop();
    return()=>{running.current=false;};
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

  return(
    <>
      {/* Fixed cinematic — outside transform:scale() wrapper */}
      {cinematic&&<CinematicOverlay info={cinematic}/>}
      {cinematic&&<CinematicSkillCard info={cinematic}/>}

      {/*
        ── Canvas action bar ──────────────────────────────────────────────────
        position:fixed → escapes the battle-phase div (top:clamp(98px,...))
        so the bar truly sits at the top of the viewport (top:0).
        position:absolute can never reach above its containing block.
      */}
      <canvas
        ref={canvasRef}
        style={{
          position:'fixed', top:0, left:0,
          width:'100vw', height:'52px',
          zIndex:200,
          pointerEvents:'none', display:'block',
        }}
      />

      {/* VFX particle canvas — position:fixed, purely cosmetic, client-only */}
      <LucasVFX/>

      {/* Scene wrapper: cinematic zoom + global animation-pause */}
      <div
        ref={sceneWrapperRef}
        className={cinematic?'bs-paused':''}
        style={{
          position:'absolute', inset:0, overflow:'visible',
          transform:cinematic?'scale(1.07)':'scale(1)',
          transformOrigin:zoomOrigin,
          transition:cinematic
            ?'transform .28s cubic-bezier(.34,1.56,.64,1)'
            :'transform .38s cubic-bezier(.25,.46,.45,.94)',
          willChange:'transform',
        }}
      >
        <div style={{position:'absolute',left:12,bottom:0,overflow:'visible'}}>
          <BattleFieldSide units={snapshot} side="hero"  floatNums={floatNums}/>
        </div>
        <div style={{position:'absolute',right:12,bottom:0,overflow:'visible'}}>
          <BattleFieldSide units={snapshot} side="enemy" floatNums={floatNums}/>
        </div>
      </div>

      {/* Battle result overlay — position:fixed on overlay itself, no wrapper needed */}
      {battleResult && (
        battleResult.winner === 'hero'
          ? <VictoryOverlay rewards={battleResult.rewards} onContinue={()=>cbRef.current.onVictory?.()}/>
          : <FailedOverlay onContinue={()=>cbRef.current.onDefeat?.()}/>
      )}
    </>
  );
}