/**
 * BattlePlayback.tsx
 *
 * Pure client-side PLAYBACK ENGINE.
 * Receives a SimBattleResult (full battle log) from the server.
 * Does ZERO damage calculation — every HP value, rage value, and death
 * flag comes directly from the server log.
 *
 * Flow:
 *   1. Server simulates entire battle → returns events[]
 *   2. This component iterates events[] one by one with await delay()
 *   3. Animations: flip-windup → dash → attacking → apply results → flip-revert → idle
 *   4. After last event, show VictoryOverlay or FailedOverlay
 */

import { useState, useEffect, useRef } from 'react';
import {
  playLucasAttackSfx, playBulletSfx, playHealSfx, playWaterSfx, playShieldSfx, playPunchSfx,
  startBattleBgm, stopBattleBgm, playVictorySound, playDefeatSound,
} from '../../utils/buttonSound';
import { useChromaKeyDataUrl } from '../../utils/chromaKey';
import type { SimBattleResult, SimBattleEvent, SimBattleTarget } from '/utils/supabase/battle-service';
import { LucasVFX } from './LucasVFX';
import type { VFXTrigger } from './LucasVFX';
import { EmmaVFX } from './EmmaVFX';
import type { EmmaVFXTrigger } from './EmmaVFX';
import { SlimeVFX } from './SlimeVFX';
import type { SlimeVFXTrigger } from './SlimeVFX';
import { GorrVFX } from './GorrVFX';
import type { GorrVFXTrigger } from './GorrVFX';
import { CrawVFX } from './CrawVFX';
import type { CrawVFXTrigger } from './CrawVFX';

// ─── Hero ID → Sprite name mapping ───────────────────────────────────────────
const HERO_ID_TO_NAME: Record<string, string> = {
  lucas:       'Lucas',
  emma:        'Emma',
  rock_slime:  'RockSlime',
  acid_slime:  'AcidSlime',
  water_slime: 'WaterSlime',
};

// Case-insensitive: DB may return 'Tank' or 'tank', 'Fighter' or 'fighter'
const MELEE_IDS = ['fighter', 'tank'];

// ─── Per-hero-per-slot action definitions (AUTHORITATIVE ENGINE) ──────────────
// When a new hero is added: fill in their heroId entry here.
// sfx:  'lucas'=heavy sword | 'punch'=slam | 'bullet'=arrow/proj | 'water'=splash | 'heal'=magic | 'shield'=guard | 'none'=silent
// move: 'melee_dash'=charge to target | 'melee_aoe_center'=lunge to enemy-col centre + hit all |
//       'ranged_place'=stationary ranged | 'self_only'=no movement, self-buff/shield | 'passive'=passive event, no motion
type SfxKey   = 'lucas'|'punch'|'bullet'|'water'|'heal'|'shield'|'none';
type MoveType = 'melee_dash'|'melee_aoe_center'|'ranged_place'|'self_only'|'passive';
interface SkillAction { move: MoveType; sfx: SfxKey; }
const HERO_SKILL_ACTIONS: Record<string, Record<number, SkillAction>> = {
  // slot: 0=basic | 1=SK1 | 2=SK2 | 3=passive | 4=ULT
  lucas:      { 0:{move:'melee_dash',        sfx:'lucas'}, 1:{move:'melee_dash',        sfx:'lucas'}, 2:{move:'melee_dash',  sfx:'lucas'}, 3:{move:'passive',  sfx:'none'},   4:{move:'melee_aoe_center',sfx:'lucas'} },
  emma:       { 0:{move:'ranged_place',       sfx:'bullet'},1:{move:'ranged_place',       sfx:'heal'},  2:{move:'self_only',   sfx:'shield'},3:{move:'passive',  sfx:'shield'}, 4:{move:'ranged_place',    sfx:'heal'}  },
  rock_slime: { 0:{move:'melee_dash',         sfx:'punch'}, 1:{move:'melee_dash',         sfx:'punch'}, 2:{move:'self_only',   sfx:'shield'},3:{move:'passive',  sfx:'none'},   4:{move:'melee_aoe_center',sfx:'shield'} },
  // AcidSlime ALL skills use water-splash SFX (basic now matches SK1 per user request)
  acid_slime: { 0:{move:'ranged_place',       sfx:'water'}, 1:{move:'ranged_place',       sfx:'water'}, 2:{move:'ranged_place',sfx:'water'}, 3:{move:'passive',  sfx:'none'},   4:{move:'ranged_place',    sfx:'water'} },
  // WaterSlime ALL skills use water-splash SFX (basic now matches SK1 per user request)
  water_slime:{ 0:{move:'ranged_place',       sfx:'water'}, 1:{move:'ranged_place',       sfx:'water'}, 2:{move:'ranged_place',sfx:'water'}, 3:{move:'passive',  sfx:'none'},   4:{move:'ranged_place',    sfx:'water'} },
  // Gorr: heavy Fighter — all attacks dash. ULT lunges to centre of enemy column. SFX = Lucas sword (same heavy-blade feel)
  gorr:       { 0:{move:'melee_dash',         sfx:'lucas'}, 1:{move:'melee_dash',         sfx:'lucas'}, 2:{move:'melee_dash',  sfx:'lucas'}, 3:{move:'passive',  sfx:'none'},   4:{move:'melee_aoe_center',sfx:'lucas'} },
  // Craw: Ranged archer — always stays in place. ULT = volley (still ranged)
  craw:       { 0:{move:'ranged_place',        sfx:'bullet'},1:{move:'ranged_place',        sfx:'bullet'},2:{move:'ranged_place',sfx:'bullet'},3:{move:'passive',  sfx:'none'},   4:{move:'ranged_place',    sfx:'bullet'} },
  // Myko: shield Tank mushroom — melee bash. SK1 = self buff. SK2/ULT = AoE lunge.
  myko:       { 0:{move:'melee_dash',          sfx:'punch'}, 1:{move:'self_only',           sfx:'shield'},2:{move:'melee_aoe_center',sfx:'punch'},3:{move:'passive',sfx:'none'},   4:{move:'melee_aoe_center',sfx:'punch'} },
};

// ─── Formation layout ��────────────────────────────────────────────────────────
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
// ─── Enemy / team slime sprites ───────────────────────────────────────────────
// Rock/Water = green screen → chroma key client-side (chromaKey: true)
// Acid       = white background → Cloudinary bg-removal (chromaKey: false)
const ENEMY_IDLE: Record<string, string> = {
  RockSlime:  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777634810/Gemini_Generated_Image_c7qsl1c7qsl1c7qs_mekkjz.png',
  AcidSlime:  'https://res.cloudinary.com/dhkethrmc/image/upload/e_background_removal/f_png,q_auto/v1777634782/ChatGPT_Image_May_1_2026_06_25_59_PM_dsoxsd.png',
  WaterSlime: 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777907811/7d3947a5-76a6-4422-9dc6-1eb5fd4d29bd.png',
};
// Team-side slime sprites (same assets — they face RIGHT, so no flip for hero side)
const TEAM_SLIME_IDLE = ENEMY_IDLE; // same source; direction handled by render
// Slimes that use Cloudinary bg-removal (skip chroma key for these)
const BP_BGREMOVE_SLIMES = new Set(['AcidSlime']);
// All new slime images face RIGHT — enemy side flips scaleX(-1) to face LEFT.
const ENEMY_COUNTERFLIP = new Set<string>([]);
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

// ─── Melee dash trail (faded black, direction-aware) ──────────────────────────
// Hero  side moves RIGHT → shadow trails to the LEFT  (negative X offsets)
// Enemy side moves LEFT  → shadow trails to the RIGHT (positive X offsets)
// Both use identical faded-black color so they look consistent.
const MELEE_TRAIL_HERO  =
  'drop-shadow(-26px 2px 7px rgba(0,0,0,0.68)) ' +
  'drop-shadow(-54px 3px 13px rgba(0,0,0,0.40)) ' +
  'drop-shadow(-82px 5px 17px rgba(0,0,0,0.22))';
const MELEE_TRAIL_ENEMY =
  'drop-shadow(26px 2px 7px rgba(0,0,0,0.68)) ' +
  'drop-shadow(54px 3px 13px rgba(0,0,0,0.40)) ' +
  'drop-shadow(82px 5px 17px rgba(0,0,0,0.22))';

// ─── CSS injection ───────────────────────────────────────���────────────────────
;(() => {
  if (typeof document === 'undefined') return;
  let s = document.getElementById('bp-css') as HTMLStyleElement | null;
  if (!s) { s = document.createElement('style'); s.id = 'bp-css'; document.head.appendChild(s); }
  s.textContent = `
@keyframes battle-idle-b{0%,100%{transform:scaleY(1)scaleX(1)}40%,60%{transform:scaleY(1.022)scaleX(0.991)}}
.bp-idle{animation:battle-idle-b 3.8s ease-in-out infinite;transform-origin:center bottom}
@keyframes bp-slime{0%,100%{transform:translateY(0)scaleX(1)scaleY(1)}40%{transform:translateY(-14px)scaleX(.91)scaleY(1.09)}55%{transform:translateY(-16px)scaleX(.90)scaleY(1.10)}80%{transform:translateY(2px)scaleX(1.05)scaleY(.95)}}
.bp-slime{animation:bp-slime 1.7s ease-in-out infinite;transform-origin:center bottom}
@keyframes bp-slime-e{0%,100%{transform:translateY(0)scaleX(-1)scaleY(1)}40%{transform:translateY(-14px)scaleX(-.91)scaleY(1.09)}55%{transform:translateY(-16px)scaleX(-.90)scaleY(1.10)}80%{transform:translateY(2px)scaleX(-1.05)scaleY(.95)}}
.bp-slime-e{animation:bp-slime-e 1.7s ease-in-out infinite;transform-origin:center bottom}
@keyframes bp-slime-cfl{0%,100%{transform:translateY(0)scaleX(1)scaleY(1)}40%{transform:translateY(-14px)scaleX(.91)scaleY(1.09)}55%{transform:translateY(-16px)scaleX(.90)scaleY(1.10)}80%{transform:translateY(2px)scaleX(1.05)scaleY(.95)}}
.bp-slime-cfl{animation:bp-slime-cfl 1.7s ease-in-out infinite;transform-origin:center bottom}
@keyframes bp-fw{0%{transform:scaleX(1)}100%{transform:scaleX(-1)}}
.bp-flip-wind{animation:bp-fw .13s ease-in forwards;transform-origin:center;display:block}
@keyframes bp-fr{0%{transform:scaleX(-1)}100%{transform:scaleX(1)}}
.bp-flip-rev{animation:bp-fr .13s ease-out forwards;transform-origin:center;display:block}
@keyframes bp-hurt{0%{opacity:1;filter:brightness(1)saturate(1)}15%{opacity:.35;filter:brightness(4.5)saturate(0)}35%{opacity:.9;filter:brightness(2)saturate(.3)}65%{opacity:1;filter:brightness(1.3)saturate(.7)}100%{opacity:1;filter:brightness(1)saturate(1)}}
.bp-hurt{animation:bp-hurt .44s ease-out forwards}
@keyframes bp-die{0%{opacity:1}8%{opacity:.04}18%{opacity:1}28%{opacity:.04}40%{opacity:1}100%{opacity:0}}
.bp-dying{animation:bp-die 1.6s ease-in forwards;pointer-events:none}
@keyframes bp-float-up{0%{transform:translateX(-50%)translateY(0) scale(1.15);opacity:1}55%{transform:translateX(-50%)translateY(-80px) scale(1);opacity:.92}100%{transform:translateX(-50%)translateY(-140px) scale(.85);opacity:0}}
.bp-float-num{position:absolute;top:-10px;pointer-events:none;z-index:30;animation:bp-float-up 1.25s ease-out forwards;font-family:'Roboto Condensed',sans-serif;font-weight:900;font-size:52px;letter-spacing:.02em;text-shadow:0 2px 8px rgba(0,0,0,1),0 0 24px rgba(0,0,0,.95),0 0 2px rgba(0,0,0,1);white-space:nowrap}
@keyframes bp-cine-ov{0%{opacity:0}16%{opacity:1}84%{opacity:1}100%{opacity:0}}
.bp-cine-ov{animation:bp-cine-ov 1s ease-out forwards}
@keyframes bp-cl{0%{transform:translate(calc(-50% - 110vw),-50%);opacity:0}20%{transform:translate(-50%,-50%);opacity:1}78%{transform:translate(-50%,-50%);opacity:1}100%{transform:translate(calc(-50% - 110vw),-50%);opacity:0}}
@keyframes bp-cr{0%{transform:translate(calc(-50% + 110vw),-50%);opacity:0}20%{transform:translate(-50%,-50%);opacity:1}78%{transform:translate(-50%,-50%);opacity:1}100%{transform:translate(calc(-50% + 110vw),-50%);opacity:0}}
.bp-cine-card-l{animation:bp-cl 1s cubic-bezier(.25,.46,.45,.94) forwards}
.bp-cine-card-r{animation:bp-cr 1s cubic-bezier(.25,.46,.45,.94) forwards}
.bp-paused .bp-idle,.bp-paused .bp-slime,.bp-paused .bp-slime-e,.bp-paused .bp-slime-cfl,.bp-paused .bp-hurt,.bp-paused .bp-flip-wind,.bp-paused .bp-flip-rev{animation-play-state:paused!important}
@keyframes bp-victory-in{0%{opacity:0;transform:scale(0.93)}100%{opacity:1;transform:scale(1)}}
.bp-victory{animation:bp-victory-in .52s cubic-bezier(.34,1.56,.64,1) forwards}
@keyframes bp-defeat-in{0%{opacity:0;transform:translateY(28px)}100%{opacity:1;transform:translateY(0)}}
.bp-defeat{animation:bp-defeat-in .4s ease-out forwards}
@keyframes bp-tap-pulse{0%,100%{opacity:0.3}50%{opacity:0.85}}
.bp-tap-pulse{animation:bp-tap-pulse 2s ease-in-out infinite}
@keyframes bp-reward-row{0%{opacity:0;transform:translateX(-18px)}100%{opacity:1;transform:translateX(0)}}
@keyframes bp-stack-pop{0%{transform:scale(1)}28%{transform:scale(1.42)}60%{transform:scale(0.90)}100%{transform:scale(1)}}
.bp-stack-pop{animation:bp-stack-pop .38s cubic-bezier(.34,1.56,.64,1) forwards}
@keyframes bp-stack-max-glow{0%,100%{box-shadow:0 0 3px rgba(245,158,11,0.3),inset 0 0 0 rgba(245,158,11,0)}50%{box-shadow:0 0 9px rgba(245,158,11,0.9),inset 0 0 4px rgba(245,158,11,0.15)}}
.bp-stack-max{animation:bp-stack-max-glow 1.4s ease-in-out infinite}
@keyframes bp-zzz{0%,100%{opacity:.95;transform:translateY(0) scale(1)}50%{opacity:.5;transform:translateY(-4px) scale(.86)}}
.bp-zzz{animation:bp-zzz 1.1s ease-in-out infinite;display:inline-block}
@keyframes bp-efx-in{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
.bp-efx-in{animation:bp-efx-in .22s cubic-bezier(.34,1.56,.64,1) both}
`;
})();

// ─── Types ────────────────────────────────────────────────────────────────────
type AnimPhase = 'idle'|'flip-windup'|'dashing'|'attacking'|'dash-return'|'flip-revert'|'hurt'|'dying'|'dead';
type FloatNum  = { id: number; uid: string; value: number; type: 'dmg'|'heal'|'magic'|'wpassive'|'bleed'; ox: number };
type CineInfo  = { uid: string; side: 'hero'|'enemy'; slotIndex: number; skillName: string; skillSlot: string; heroName: string; key: number };
type BattleRewards = { gold: number; gems: number; exp: number; hero_exp: number } | null;
type BattleResultData = { winner: 'hero'|'enemy'; rewards: BattleRewards };

// ─── Status effects ───────────────────────────────────────────────────────────
type StatusEffect = {
  id:        string;   // unique effect key (non-stackable effects use a fixed id)
  iconUrl:   string;   // skill icon to display in the pill
  turnsLeft: number;   // decrements when the BEARER acts; 0 = expired
  color:     string;   // accent hex for pill border & text
  isBuff:    boolean;  // true = buff on caster; false = debuff on target
  isStun:    boolean;  // true = also renders ZZZ indicator
};
/**
 * EFX — canonical effect registry.
 * Non-stackable (all turn-based): re-applying same id REFRESHES duration.
 * To add a stackable effect: give each application a unique id suffix.
 */
const EFX: Record<string, Omit<StatusEffect,'turnsLeft'> & { defaultTurns:number }> = {
  // Water Slime debuffs
  wslime_slow:  { id:'wslime_slow',  iconUrl:SKILL_ICONS.WaterSlime?.sk1 ?? '', color:'#60a5fa', isBuff:false, isStun:false, defaultTurns:2 },
  wslime_mdef:  { id:'wslime_mdef',  iconUrl:SKILL_ICONS.WaterSlime?.sk2 ?? '', color:'#38bdf8', isBuff:false, isStun:false, defaultTurns:2 },
  wslime_ult:   { id:'wslime_ult',   iconUrl:SKILL_ICONS.WaterSlime?.ult ?? '', color:'#0ea5e9', isBuff:false, isStun:false, defaultTurns:2 },
  // Acid Slime debuffs
  aslime_pdef:  { id:'aslime_pdef',  iconUrl:SKILL_ICONS.AcidSlime?.sk1  ?? '', color:'#a3e635', isBuff:false, isStun:false, defaultTurns:2 },
  aslime_stun:  { id:'aslime_stun',  iconUrl:SKILL_ICONS.AcidSlime?.sk2  ?? '', color:'#facc15', isBuff:false, isStun:true,  defaultTurns:1 },
  aslime_pdef4: { id:'aslime_pdef4', iconUrl:SKILL_ICONS.AcidSlime?.ult  ?? '', color:'#84cc16', isBuff:false, isStun:false, defaultTurns:2 },
  // Rock Slime self-buffs
  rslime_pdef1: { id:'rslime_pdef1', iconUrl:SKILL_ICONS.RockSlime?.sk1  ?? '', color:'#f59e0b', isBuff:true,  isStun:false, defaultTurns:2 },
  rslime_ult_b: { id:'rslime_ult_b', iconUrl:SKILL_ICONS.RockSlime?.ult  ?? '', color:'#d97706', isBuff:true,  isStun:false, defaultTurns:2 },
  // ── Gorr debuffs ──────────────────────────────────────────────────────────
  // gorr_bleed   : SK1 proc — Bleed DoT (red), ticks 3 turns via slot-3 passive events
  // gorr_terrify : SK2 proc — Terrify debuff (purple), reduces ATK/SPD for 2 turns
  gorr_bleed:   { id:'gorr_bleed',   iconUrl:SKILL_ICONS.Gorr?.sk1       ?? '', color:'#ef4444', isBuff:false, isStun:false, defaultTurns:3 },
  gorr_terrify: { id:'gorr_terrify', iconUrl:SKILL_ICONS.Gorr?.sk2       ?? '', color:'#a855f7', isBuff:false, isStun:false, defaultTurns:2 },
  // ── Craw debuffs & self-buff ──────────────────────────────────────────────
  craw_wound:   { id:'craw_wound',   iconUrl:SKILL_ICONS.Craw?.sk1       ?? '', color:'#f97316', isBuff:false, isStun:false, defaultTurns:2 },
  craw_blind:   { id:'craw_blind',   iconUrl:SKILL_ICONS.Craw?.sk2       ?? '', color:'#a855f7', isBuff:false, isStun:false, defaultTurns:2 },
  craw_cr:      { id:'craw_cr',      iconUrl:SKILL_ICONS.Craw?.sk3       ?? '', color:'#f59e0b', isBuff:true,  isStun:false, defaultTurns:99 },
  // ── Myko debuffs / self-buffs ─────────────────────────────────────────────
  myko_spore_rot:   { id:'myko_spore_rot',   iconUrl:SKILL_ICONS.Myko?.sk2 ?? '', color:'#84cc16', isBuff:false, isStun:false, defaultTurns:2 },
  myko_spore_toxin: { id:'myko_spore_toxin', iconUrl:SKILL_ICONS.Myko?.ult ?? '', color:'#65a30d', isBuff:false, isStun:false, defaultTurns:3 },
  myko_iron_casing: { id:'myko_iron_casing', iconUrl:SKILL_ICONS.Myko?.sk1 ?? '', color:'#22d3ee', isBuff:true,  isStun:false, defaultTurns:2 },
};
/** IDs of Water Slime debuffs — Soaking Field passive proc condition */
const WS_DEBUFF_IDS = new Set(['wslime_slow','wslime_mdef','wslime_ult']);

// Lucas passive icon (sk3)
const LUCAS_SK3_ICON = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777550841/psvluk_b0quhw.png';

type UnitState = {
  uid:         string;
  heroId:      string;       // DB hero_id (e.g. 'lucas')
  name:        string;       // sprite name (e.g. 'Lucas')
  side:        'hero'|'enemy';
  slotIndex:   number;
  heroType:    string;
  maxHp:       number;
  currentHp:   number;
  shield:      number;
  rage:        number;       // 0–100, always from server
  animPhase:   AnimPhase;
  dashOffsetX: number;
  dashOffsetY: number;
  skillLabel:  string;
  skillLabelKey: number;
  lucasStacks: number;       // Warlord's Edge stacks 0-5, only used for Lucas
  mAtk:        number;       // for Water Slime Soaking Field passive bonus calc
  statusEffects: StatusEffect[]; // active buff/debuff indicators
};

// ─── Cinematic helpers ────────────────────────────────────────────────────────
function calcSpotlightPos(side: 'hero'|'enemy', si: number) {
  const col = si % 2, ri = Math.floor(si / 2), row = ROW_DATA[ri];
  const slotX = col === 0 ? row.col0X : row.col1X;
  const W = window.innerWidth, H = window.innerHeight;
  const gl = side === 'hero' ? 12 : W - 12 - GRID_W;
  const cx = gl + slotX + row.slotW / 2;
  const sb = H - (GRID_H - row.y - row.slotH);
  return { x: cx, y: side === 'hero' ? (sb + 4) - 338 * 0.45 : (sb - 4) - 180 * 0.45 };
}
function calcZoomOrigin(side: 'hero'|'enemy', si: number) {
  const col = si % 2, ri = Math.floor(si / 2), row = ROW_DATA[ri];
  const slotX = col === 0 ? row.col0X : row.col1X;
  const W = window.innerWidth, wH = Math.max(200, window.innerHeight - 128);
  const gl = side === 'hero' ? 12 : W - 12 - GRID_W;
  const cx = gl + slotX + row.slotW / 2;
  const sb = wH - (GRID_H - row.y - row.slotH);
  const cy = side === 'hero' ? (sb + 4) - 338 * 0.45 : (sb - 4) - 180 * 0.45;
  return `${Math.round(cx)}px ${Math.round(Math.max(0, cy))}px`;
}
function calcDashVec(aS: 'hero'|'enemy', aSlot: number, tSlot: number) {
  const W = window.innerWidth;
  const cx = (s: 'hero'|'enemy', sl: number) => {
    const c = sl % 2, r = ROW_DATA[Math.floor(sl / 2)];
    return (s === 'hero' ? 12 : W - 12 - GRID_W) + (c === 0 ? r.col0X : r.col1X) + r.slotW / 2;
  };
  const ax = cx(aS, aSlot), tS = aS === 'hero' ? 'enemy' : 'hero', tx = cx(tS, tSlot);
  const stopX = aS === 'hero' ? tx - 98 : tx + 98;
  const x = aS === 'hero' ? Math.max(0, stopX - ax) : Math.min(0, stopX - ax);
  const ar = ROW_DATA[Math.floor(aSlot / 2)], tr = ROW_DATA[Math.floor(tSlot / 2)];
  return { x, y: (tr.y + tr.slotH) - (ar.y + ar.slotH) };
}

// ── Slot key for skill icons ───────────────────��─────────────────────────────
function slotToKey(slot: number): string {
  if (slot === 0) return 'basic';
  if (slot === 1) return 'sk1';
  if (slot === 2) return 'sk2';
  if (slot === 3) return 'sk3'; // passive — fires as type='skill', skill_slot=3 in server log
  return 'ult';                 // slot 4
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function HpBar({ current, max, width = 72 }: { current: number; max: number; width?: number }) {
  const H = 8, pad = 2, inner = width - pad * 2;
  const hpW = Math.max(0, inner * Math.max(0, Math.min(1, max > 0 ? current / max : 0)));
  return (
    <svg width={width} height={H} style={{ display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.9))' }}>
      <rect x={0} y={0} width={width} height={H} rx={2} fill="#0a0a0a"/>
      <rect x={pad} y={pad} width={hpW} height={H - pad * 2} rx={1} fill="#e53e3e"/>
    </svg>
  );
}

// Shield bar — separate bar above HP, only rendered when shield > 0
// Width is proportional to (shield / max_hp), NOT current HP
// So shield=2000, max_hp=10000 → bar fills 20% of width
function ShieldBar({ shield, maxHp, width = 72 }: { shield: number; maxHp: number; width?: number }) {
  if (shield <= 0) return null;
  const H = 5, pad = 1, inner = width - pad * 2;
  const shW = maxHp > 0 ? Math.min(inner, Math.max(0, inner * (shield / maxHp))) : 0;
  // Animated shimmer via inline SVG gradient
  return (
    <svg width={width} height={H} style={{ display: 'block', filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.70)) drop-shadow(0 1px 3px rgba(0,0,0,.9))' }}>
      <defs>
        <linearGradient id="sh-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#fde68a"/>
          <stop offset="50%"  stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
      </defs>
      {/* Track */}
      <rect x={0} y={0} width={width} height={H} rx={1.5} fill="rgba(0,0,0,0.55)"/>
      {/* Shield fill */}
      {shW > 0 && <rect x={pad} y={pad} width={shW} height={H - pad * 2} rx={1} fill="url(#sh-grad)"/>}
      {/* Top highlight */}
      {shW > 0 && <rect x={pad} y={pad} width={shW} height={1} rx={0.5} fill="rgba(255,255,255,0.35)"/>}
    </svg>
  );
}
function RageBar({ rage, width = 72 }: { rage: number; width?: number }) {
  const H = 4, pad = 1, inner = width - pad * 2;
  const rW = Math.max(0, inner * Math.max(0, Math.min(1, rage / 100)));
  const fill = rage >= 100 ? '#f59e0b' : rage >= 60 ? '#06b6d4' : rage >= 30 ? '#3b82f6' : '#1e3a8a';
  const glow = rage >= 100 ? 'drop-shadow(0 0 5px rgba(245,158,11,0.95)) drop-shadow(0 0 9px rgba(245,158,11,0.5))' : 'none';
  return (
    <svg width={width} height={H} style={{ display: 'block', filter: glow }}>
      <rect x={0} y={0} width={width} height={H} rx={1} fill="rgba(0,0,0,0.55)"/>
      {rW > 0 && <rect x={pad} y={pad} width={rW} height={H - pad * 2} rx={0.5} fill={fill}/>}
      <rect x={Math.round(pad + inner * 0.30)} y={0} width={1} height={H} fill="rgba(255,255,255,0.20)"/>
      <rect x={Math.round(pad + inner * 0.60)} y={0} width={1} height={H} fill="rgba(255,255,255,0.20)"/>
    </svg>
  );
}

const HERO_SLIME_NAMES = new Set(['RockSlime', 'AcidSlime', 'WaterSlime']);

function HeroBattleSprite({ unit, floats }: { unit: UnitState; floats: FloatNum[] }) {
  const { name, heroId, animPhase, dashOffsetX, dashOffsetY, currentHp, maxHp, shield, rage, lucasStacks, statusEffects } = unit;
  const isSlime      = HERO_SLIME_NAMES.has(name);
  const slimeNeedsChroma = isSlime && !BP_BGREMOVE_SLIMES.has(name);
  // Hooks always called unconditionally
  const idleUrl      = useChromaKeyDataUrl(!isSlime ? (IDLE_SPRITES[name] ?? '') : '');
  const slimeChroma  = useChromaKeyDataUrl(slimeNeedsChroma ? (TEAM_SLIME_IDLE[name] ?? '') : '');
  const chromaActUrl = useChromaKeyDataUrl(ACTION_CHROMA[name] ?? '');
  // Resolve final src
  const slimeSrc     = isSlime
    ? (slimeNeedsChroma ? (slimeChroma ?? '') : (TEAM_SLIME_IDLE[name] ?? ''))
    : '';
  const actionSrc    = ACTION_BGREMOVE[name] ?? (chromaActUrl ?? undefined);
  const showAct      = animPhase === 'attacking' || animPhase === 'dashing';
  const src          = isSlime
    ? slimeSrc
    : ((showAct && actionSrc) ? actionSrc : (idleUrl ?? undefined));
  const flipCls      = animPhase === 'flip-windup' ? 'bp-flip-wind' : animPhase === 'flip-revert' ? 'bp-flip-rev' : '';
  const isDash       = animPhase === 'dashing', isRet = animPhase === 'dash-return';
  const spriteW      = isSlime ? 180 : 180;
  const spriteH      = isSlime ? 180 : 338;
  const spriteBottom = isSlime ? 0 : -4;
  return (
    <div className={animPhase === 'dying' ? 'bp-dying' : ''} style={{
      position: 'absolute', bottom: spriteBottom, left: '50%',
      transform: `translateX(calc(-50% + ${dashOffsetX}px)) translateY(${dashOffsetY}px)`,
      transition: isDash ? 'transform .15s cubic-bezier(.04,0,.08,1)' : isRet ? 'transform .22s ease-out' : 'none',
      width: spriteW, height: spriteH, pointerEvents: 'none', zIndex: 10,
      filter: isDash ? MELEE_TRAIL_HERO : '', willChange: 'transform,filter',
    }}>
      {src && (
        <img src={src} alt="" aria-hidden draggable={false} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'center bottom',
          transform: 'scaleY(0.65) skewX(-12deg)', transformOrigin: 'bottom center',
          filter: 'brightness(0) opacity(0.16)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.20) 72%, transparent 92%)',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.20) 72%, transparent 92%)',
          zIndex: 0, pointerEvents: 'none',
        }}/>
      )}
      <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 20, width: 76, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* ZZZ stun indicator */}
        {statusEffects.some(e => e.isStun) && (
          <div style={{ display:'flex', justifyContent:'center' }}>
            <span className="bp-zzz" style={{ fontFamily:"'Roboto Condensed',sans-serif", fontSize:11, fontWeight:900, color:'#facc15', letterSpacing:'0.1em', textShadow:'0 0 8px rgba(250,204,21,0.85),0 1px 4px rgba(0,0,0,1)' }}>zzz</span>
          </div>
        )}
        {/* Status effect pills — max 3 per row; rows stack upward */}
        {statusEffects.length > 0 && (() => {
          const chunks: StatusEffect[][] = [];
          for (let i = 0; i < statusEffects.length; i += 3) chunks.push(statusEffects.slice(i, i + 3));
          return (
            <div style={{ display:'flex', flexDirection:'column-reverse', gap:2 }}>
              {chunks.map((chunk, ci) => (
                <div key={ci} style={{ display:'flex', gap:2 }}>
                  {chunk.map(e => (
                    <div key={e.id} className="bp-efx-in" style={{ display:'flex', alignItems:'center', gap:2, background: e.isBuff ? 'rgba(20,12,0,0.82)' : 'rgba(0,0,0,0.82)', border:`1px solid ${e.color}99`, borderRadius:3, padding:'1px 3px 1px 2px', flexShrink:0 }}>
                      <img src={e.iconUrl} alt={e.id} draggable={false} style={{ width:11, height:11, objectFit:'contain', flexShrink:0 }}/>
                      <span style={{ fontFamily:"'Roboto Condensed',sans-serif", fontSize:9, fontWeight:800, color:e.color, lineHeight:1, letterSpacing:'0.02em', userSelect:'none' }}>{e.turnsLeft}T</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
        {/* Warlord's Edge stack indicator — only for Lucas, above all bars */}
        {heroId === 'lucas' && lucasStacks > 0 && (
          <div
            key={lucasStacks}
            className={`bp-stack-pop${lucasStacks >= 5 ? ' bp-stack-max' : ''}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              background: lucasStacks >= 5 ? 'rgba(20,12,0,0.82)' : 'rgba(0,0,0,0.72)',
              border: `1px solid ${lucasStacks >= 5 ? 'rgba(245,158,11,0.85)' : 'rgba(205,155,82,0.55)'}`,
              borderRadius: 4,
              padding: '1px 5px 1px 3px',
              alignSelf: 'flex-start',
              backdropFilter: 'blur(4px)',
              transition: 'border-color .2s',
            }}
          >
            <img
              src={LUCAS_SK3_ICON}
              alt="Warlord's Edge"
              draggable={false}
              style={{ width: 13, height: 13, objectFit: 'contain', display: 'block', flexShrink: 0 }}
            />
            <span style={{
              fontFamily: "'Roboto Condensed', sans-serif",
              fontSize: 10,
              fontWeight: 800,
              color: lucasStacks >= 5 ? '#fbbf24' : '#f59e0b',
              letterSpacing: '0.02em',
              lineHeight: 1,
              userSelect: 'none',
              textShadow: lucasStacks >= 5 ? '0 0 6px rgba(245,158,11,0.9)' : 'none',
            }}>
              x{lucasStacks}
            </span>
          </div>
        )}
        {/* Shield bar — only visible when unit has active shield */}
        <ShieldBar shield={shield} maxHp={maxHp} width={72}/>
        <HpBar current={currentHp} max={maxHp} width={72}/>
        <RageBar rage={rage} width={72}/>
      </div>
      {floats.map(f => (
        <div key={f.id} className="bp-float-num" style={{ left: `calc(50% + ${f.ox}px)`, color: f.type === 'heal' ? '#4ade80' : f.type === 'magic' ? '#60a5fa' : f.type === 'wpassive' ? '#38bdf8' : f.type === 'bleed' ? '#f87171' : '#fc7d7d' }}>
          {f.type === 'heal' ? `+${f.value}` : f.type === 'wpassive' ? '✦M' : f.type === 'bleed' ? `🩸-${f.value}` : `-${f.value}`}
        </div>
      ))}
      <div className={flipCls} style={{ width: '100%', height: '100%', transformOrigin: 'center', position: 'relative', zIndex: 1 }}>
        <img src={src} alt={name} draggable={false}
          className={
            isSlime
              ? (animPhase === 'idle' ? 'bp-slime' : animPhase === 'hurt' ? 'bp-hurt' : '')
              : (animPhase === 'idle' ? 'bp-idle'  : animPhase === 'hurt' ? 'bp-hurt' : '')
          }
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom', display: 'block' }}/>
      </div>
    </div>
  );
}

function EnemyBattleSprite({ unit, floats }: { unit: UnitState; floats: FloatNum[] }) {
  const { name, animPhase, dashOffsetX, dashOffsetY, currentHp, maxHp, shield, rage, statusEffects } = unit;
  const rawSrc      = ENEMY_IDLE[name] ?? '';
  const needsChroma = !BP_BGREMOVE_SLIMES.has(name);
  const chromaUrl   = useChromaKeyDataUrl(needsChroma ? rawSrc : '');
  const src         = needsChroma ? (chromaUrl ?? '') : rawSrc;
  const flipCls     = animPhase === 'flip-windup' ? 'bp-flip-wind' : animPhase === 'flip-revert' ? 'bp-flip-rev' : '';
  // WaterSlime sprite natively faces LEFT — scaleX(-1) would wrongly flip it RIGHT.
  // counterFlip=true → use scaleX(1) (no flip) + bp-slime-cfl animation (positive scaleX).
  // Net transforms (counterFlip=true):
  //   idle:   flipCls(1)  × img(1) = +1 → LEFT ✓
  //   windup: flipCls(-1) × img(1) = -1 → RIGHT ✓ (windup kick-back)
  //   revert: flipCls(1)  × img(1) = +1 → LEFT ✓
  const counterFlip = ENEMY_COUNTERFLIP.has(name);
  const isDash  = animPhase === 'dashing', isRet = animPhase === 'dash-return';
  return (
    <div className={animPhase === 'dying' ? 'bp-dying' : ''} style={{
      position: 'absolute', bottom: 4, left: '50%',
      // Outer container has NO scaleX(-1) — flip lives on the inner-flip div so browser
      // GPU compositing (will-change:transform) cannot strip it from any sprite variant
      transform: `translateX(calc(-50% + ${dashOffsetX}px)) translateY(${dashOffsetY}px)`,
      transition: isDash ? 'transform .15s cubic-bezier(.04,0,.08,1)' : isRet ? 'transform .22s ease-out' : 'none',
      width: 180, height: 180, pointerEvents: 'none', zIndex: 10,
      filter: isDash ? MELEE_TRAIL_ENEMY : '', willChange: 'transform,filter',
    }}>
      {src && (
        <img src={src} alt="" aria-hidden draggable={false} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'center bottom',
          // skewX(-12deg) consistent with hero shadow (no outer flip to compensate for)
          transform: 'scaleY(0.65) skewX(-12deg)', transformOrigin: 'bottom center',
          filter: 'brightness(0) opacity(0.15)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.20) 72%, transparent 92%)',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.20) 72%, transparent 92%)',
          zIndex: 0, pointerEvents: 'none',
        }}/>
      )}
      <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 20, width: 72, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* ZZZ stun indicator */}
        {statusEffects.some(e => e.isStun) && (
          <div style={{ display:'flex', justifyContent:'center' }}>
            <span className="bp-zzz" style={{ fontFamily:"'Roboto Condensed',sans-serif", fontSize:11, fontWeight:900, color:'#facc15', letterSpacing:'0.1em', textShadow:'0 0 8px rgba(250,204,21,0.85),0 1px 4px rgba(0,0,0,1)' }}>zzz</span>
          </div>
        )}
        {/* Status effect pills — max 3 per row; rows stack upward */}
        {statusEffects.length > 0 && (() => {
          const chunks: StatusEffect[][] = [];
          for (let i = 0; i < statusEffects.length; i += 3) chunks.push(statusEffects.slice(i, i + 3));
          return (
            <div style={{ display:'flex', flexDirection:'column-reverse', gap:2 }}>
              {chunks.map((chunk, ci) => (
                <div key={ci} style={{ display:'flex', gap:2 }}>
                  {chunk.map(e => (
                    <div key={e.id} className="bp-efx-in" style={{ display:'flex', alignItems:'center', gap:2, background: e.isBuff ? 'rgba(20,12,0,0.82)' : 'rgba(0,0,0,0.82)', border:`1px solid ${e.color}99`, borderRadius:3, padding:'1px 3px 1px 2px', flexShrink:0 }}>
                      <img src={e.iconUrl} alt={e.id} draggable={false} style={{ width:11, height:11, objectFit:'contain', flexShrink:0 }}/>
                      <span style={{ fontFamily:"'Roboto Condensed',sans-serif", fontSize:9, fontWeight:800, color:e.color, lineHeight:1, letterSpacing:'0.02em', userSelect:'none' }}>{e.turnsLeft}T</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
        <ShieldBar shield={shield} maxHp={maxHp} width={68}/>
        <HpBar current={currentHp} max={maxHp} width={68}/>
        <RageBar rage={rage} width={68}/>
      </div>
      {/* Floats sit outside the flip stack so numbers always read left-to-right */}
      {floats.map(f => (
        <div key={f.id} className="bp-float-num" style={{ left: `calc(50% + ${f.ox}px)`, color: f.type === 'heal' ? '#4ade80' : f.type === 'magic' ? '#60a5fa' : f.type === 'wpassive' ? '#38bdf8' : f.type === 'bleed' ? '#f87171' : '#fc7d7d' }}>
          {f.type === 'heal' ? `+${f.value}` : f.type === 'wpassive' ? '✦M' : f.type === 'bleed' ? `🩸-${f.value}` : `-${f.value}`}
        </div>
      ))}
      {/* flipCls div: bp-flip-wind animates scaleX 1→-1, bp-flip-rev -1→1.
          img has scaleX(-1) baked into both its inline style AND bp-slime-e keyframes.
          Net transforms:
            idle   (flipCls=identity, img=-1):      -1 → faces LEFT  ✓
            windup (flipCls=-1,       img=-1): -1×-1=1 → faces RIGHT ✓
            revert (flipCls=1,        img=-1):  1×-1=-1 → faces LEFT ✓
          bp-hurt only animates opacity/filter — scaleX(-1) inline is preserved ✓ */}
      <div className={flipCls} style={{ width: '100%', height: '100%', transformOrigin: 'center', position: 'relative', zIndex: 1 }}>
        <img src={src} alt={name} draggable={false}
          className={
            animPhase === 'idle'
              ? (counterFlip ? 'bp-slime-cfl' : 'bp-slime-e')
              : animPhase === 'hurt' ? 'bp-hurt' : ''
          }
          style={{
            width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom',
            display: 'block',
            // Normal enemy: scaleX(-1) faces LEFT (flips right-facing sprite).
            // counterFlip (WaterSlime): scaleX(1) — already LEFT-facing, no flip needed.
            // bp-hurt only animates opacity+filter — this inline transform is preserved.
            // bp-slime-e / bp-slime-cfl keyframes agree with this value so there's no conflict.
            transform: counterFlip ? 'scaleX(1)' : 'scaleX(-1)',
          }}/>
      </div>
    </div>
  );
}

function BattleFieldSide({ units, side, floatNums }: { units: UnitState[]; side: 'hero'|'enemy'; floatNums: FloatNum[] }) {
  return (
    <div style={{ position: 'relative', width: GRID_W, height: GRID_H, overflow: 'visible' }}>
      {units.filter(u => u.side === side).map(unit => {
        if (unit.animPhase === 'dead') return null;
        const col = unit.slotIndex % 2, row = ROW_DATA[Math.floor(unit.slotIndex / 2)];
        const slotX = col === 0 ? row.col0X : row.col1X;
        const front = side === 'hero' ? (col === 1) : (col === 0);
        const rowZ = Math.floor(unit.slotIndex / 2) * 2 + (front ? 2 : 1);
        const floats = floatNums.filter(f => f.uid === unit.uid);
        return (
          <div key={unit.uid} style={{ position: 'absolute', left: slotX, top: row.y, width: row.slotW, height: row.slotH, overflow: 'visible', zIndex: rowZ }}>
            {side === 'hero'
              ? <HeroBattleSprite unit={unit} floats={floats}/>
              : <EnemyBattleSprite unit={unit} floats={floats}/>
            }
          </div>
        );
      })}
    </div>
  );
}

function CinematicOverlay({ info }: { info: CineInfo }) {
  const { x: cx, y: cy } = calcSpotlightPos(info.side, info.slotIndex);
  const eW = info.side === 'hero' ? 190 : 155, eH = info.side === 'hero' ? 300 : 165;
  return (
    <div key={info.key} className="bp-cine-ov" style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none',
      background: `radial-gradient(ellipse ${eW}px ${eH}px at ${cx.toFixed(0)}px ${cy.toFixed(0)}px,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 28%,rgba(0,0,0,.35) 60%,rgba(0,0,0,.62) 100%)` }}/>
  );
}

function CinematicSkillCard({ info }: { info: CineInfo }) {
  const iconUrl = SKILL_ICONS[info.heroName]?.[info.skillSlot] ?? '';
  const chromaUrl = useChromaKeyDataUrl(iconUrl);
  const finalSrc = chromaUrl ?? iconUrl;
  const F = "'Roboto Condensed',sans-serif";
  return (
    <div key={info.key} className={info.side === 'hero' ? 'bp-cine-card-l' : 'bp-cine-card-r'} style={{ position: 'fixed', top: '50%', left: '50%', zIndex: 9992, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontFamily: F, fontSize: 'clamp(15px,4vw,22px)', fontWeight: 900, color: '#fff', letterSpacing: '.14em', textTransform: 'uppercase', textShadow: '0 2px 16px rgba(0,0,0,1)', whiteSpace: 'nowrap' }}>{info.skillName}</div>
      {finalSrc && (
        <img src={finalSrc} alt={info.skillName} draggable={false}
          style={{ width: 'clamp(64px,16vw,84px)', height: 'clamp(64px,16vw,84px)', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 0 14px rgba(249,115,22,.45))' }}/>
      )}
      <div style={{ width: 'clamp(200px,58vw,320px)', height: 2, borderRadius: 1, background: 'linear-gradient(90deg,transparent 0%,#F97316 22%,#F97316 78%,transparent 100%)', boxShadow: '0 0 10px rgba(249,115,22,.55)', flexShrink: 0 }}/>
    </div>
  );
}

// ─── Result Overlays ──────────────────────────────────────────────────────────
function VictoryOverlay({ rewards, onContinue }: { rewards: BattleRewards; onContinue: () => void }) {
  const F = "'Roboto Condensed',sans-serif";
  const rows = rewards ? [
    { label: 'Gold',     value: `+${rewards.gold.toLocaleString()}`,     color: '#fcd34d', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#D4A017"/><circle cx="12" cy="12" r="8" fill="#F5C842"/><text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#8B6000" fontFamily="serif">G</text></svg> },
    { label: 'Gems',     value: `+${rewards.gems.toLocaleString()}`,     color: '#67e8f9', icon: <svg width="18" height="18" viewBox="0 0 14 16" fill="none"><polygon points="7,0 14,5 7,16 0,5" fill="#1AADEE"/><polygon points="7,0 14,5 7,7 0,5" fill="#5BCFFF"/><polygon points="7,0 10,5 7,7 4,5" fill="#A8EEFF"/></svg> },
    { label: 'Acct EXP', value: `+${rewards.exp.toLocaleString()}`,      color: '#86efac', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><polygon points="10,1 14,7 19,8 15,13 16,19 10,16 4,19 5,13 1,8 6,7" stroke="#86efac" strokeWidth="1.3"/><polygon points="10,4 13,8 17,9 14,13 15,17 10,15 5,17 6,13 3,9 7,8" fill="#86efac" opacity="0.75"/></svg> },
    { label: 'Hero EXP', value: `+${rewards.hero_exp.toLocaleString()}`, color: '#c4b5fd', icon: <svg width="18" height="18" viewBox="0 0 16 20" fill="none"><path d="M 5,6 L 5,14 Q 5,17 8,17 Q 11,17 11,14 L 11,6 Z" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/><path d="M 5.5,10 L 5.5,13.5 Q 5.5,16 8,16 Q 10.5,16 10.5,13.5 L 10.5,10 Z" fill="#c4b5fd"/><rect x="6" y="3" width="4" height="3" fill="#ffffff" stroke="#dddddd" strokeWidth="0.5"/><ellipse cx="8" cy="3" rx="2.5" ry="1.2" fill="#8B4513"/><ellipse cx="8" cy="2.2" rx="2.5" ry="1" fill="#A0522D"/></svg> },
  ] : [];
  return (
    <div className="bp-victory" onClick={onContinue} style={{ position: 'fixed', inset: 0, zIndex: 10000, cursor: 'pointer', background: 'radial-gradient(ellipse at 50% 40%,rgba(28,18,4,0.97) 0%,rgba(0,0,0,0.98) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '55%', pointerEvents: 'none', background: 'radial-gradient(ellipse at top,rgba(251,191,36,0.10) 0%,transparent 68%)' }}/>
      <div style={{ fontFamily: F, fontSize: 'clamp(40px,11vw,68px)', fontWeight: 900, color: '#fbbf24', letterSpacing: '.22em', textTransform: 'uppercase', textShadow: '0 0 36px rgba(251,191,36,0.9),0 0 72px rgba(251,191,36,0.45),0 2px 6px rgba(0,0,0,1)', marginBottom: 12, lineHeight: 1 }}>VICTORY</div>
      <div style={{ width: 'clamp(180px,58vw,340px)', height: 1, background: 'linear-gradient(90deg,transparent,rgba(251,191,36,0.65),transparent)', marginBottom: rewards && rows.length ? 26 : 40 }}/>
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 'clamp(210px,56vw,340px)', marginBottom: 34 }}>
          {rows.map((r, i) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', animation: `bp-reward-row .36s ease-out ${i * 0.09}s both` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.icon}</div>
                <span style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: '.04em' }}>{r.label}</span>
              </div>
              <span style={{ fontFamily: F, fontSize: 15, fontWeight: 800, color: r.color, letterSpacing: '.04em' }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="bp-tap-pulse" style={{ fontFamily: F, fontSize: 'clamp(10px,2.8vw,13px)', fontWeight: 600, color: 'rgba(255,255,255,0.42)', letterSpacing: '.14em', textTransform: 'uppercase' }}>TAP ANYWHERE TO CONTINUE</div>
    </div>
  );
}

function FailedOverlay({ onContinue }: { onContinue: () => void }) {
  const F = "'Roboto Condensed',sans-serif";
  return (
    <div className="bp-defeat" onClick={onContinue} style={{ position: 'fixed', inset: 0, zIndex: 10000, cursor: 'pointer', background: 'radial-gradient(ellipse at 50% 40%,rgba(18,4,4,0.97) 0%,rgba(0,0,0,0.98) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '55%', pointerEvents: 'none', background: 'radial-gradient(ellipse at top,rgba(239,68,68,0.08) 0%,transparent 68%)' }}/>
      <div style={{ fontFamily: F, fontSize: 'clamp(40px,11vw,68px)', fontWeight: 900, color: '#ef4444', letterSpacing: '.22em', textTransform: 'uppercase', textShadow: '0 0 36px rgba(239,68,68,0.85),0 0 72px rgba(239,68,68,0.40),0 2px 6px rgba(0,0,0,1)', marginBottom: 12, lineHeight: 1 }}>DEFEAT</div>
      <div style={{ width: 'clamp(180px,58vw,340px)', height: 1, background: 'linear-gradient(90deg,transparent,rgba(239,68,68,0.55),transparent)', marginBottom: 20 }}/>
      <div style={{ fontFamily: F, fontSize: 'clamp(11px,3.2vw,15px)', fontWeight: 600, color: 'rgba(255,255,255,0.30)', letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 44 }}>NO REWARDS RECEIVED</div>
      <div className="bp-tap-pulse" style={{ fontFamily: F, fontSize: 'clamp(10px,2.8vw,13px)', fontWeight: 600, color: 'rgba(255,255,255,0.42)', letterSpacing: '.14em', textTransform: 'uppercase' }}>TAP ANYWHERE TO CONTINUE</div>
    </div>
  );
}

// �����── BattlePlayback ───────────────────────────────────────────────────────────
export interface BattlePlaybackProps {
  battleLog:  SimBattleResult;
  onVictory?: () => void;
  onDefeat?:  () => void;
}

export function BattlePlayback({ battleLog, onVictory, onDefeat }: BattlePlaybackProps) {

  // ── Build initial UnitState[] from server combatants ───────────────────────
  const initUnits = (): UnitState[] =>
    battleLog.combatants.map(c => ({
      uid:          c.uid,
      heroId:       c.hero_id,
      name:         HERO_ID_TO_NAME[c.hero_id] ?? c.name,
      side:         c.side,
      slotIndex:    c.slot_index,
      heroType:     c.hero_type,
      maxHp:        battleLog.initial_maxhp[c.uid] ?? c.max_hp,
      currentHp:    battleLog.initial_hp[c.uid]    ?? c.max_hp,
      shield:       0,
      rage:         0,
      animPhase:    'idle',
      dashOffsetX:  0,
      dashOffsetY:  0,
      skillLabel:   '',
      skillLabelKey:0,
      lucasStacks:  0,
      mAtk:         c.m_atk ?? 0,
      statusEffects:[],
    }));

  // ── Mutable ref — zero React renders during playback ──────────────────────
  const stateRef = useRef<UnitState[]>(initUnits());
  const [snapshot,   setSnapshot]   = useState<UnitState[]>(() => [...stateRef.current]);
  const [cinematic,  setCinematic]  = useState<CineInfo | null>(null);
  const [floatNums,  setFloatNums]  = useState<FloatNum[]>([]);
  const [battleResult, setBattleResult] = useState<BattleResultData | null>(null);

  // Canvas ref for replay progress bar
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Progress: [currentEventIdx, totalEvents]
  const progressRef = useRef<[number, number]>([0, battleLog.events.length]);

  const running   = useRef(true);
  const floatId   = useRef(0);
  const cbRef     = useRef({ onVictory, onDefeat }); cbRef.current = { onVictory, onDefeat };

  // ── Skip battle ────────────────────────────────────────────────────────────
  const handleSkip = () => {
    if (battleResult) return;          // already showing result
    stopBattleBgm(150);                // fade BGM out fast
    running.current = false;           // abort playback loop
    setCinematic(null);                // dismiss any cinematic overlay
    setFloatNums([]);                  // clear floating numbers
    progressRef.current = [battleLog.events.length, battleLog.events.length];
    // Jump straight to final HP state from server log
    stateRef.current = stateRef.current.map(u => {
      const final = battleLog.combatants.find(c => c.uid === u.uid);
      if (!final) return u;
      return {
        ...u,
        currentHp: final.current_hp,
        animPhase: final.is_alive ? 'idle' : 'dead',
        rage: 0,
        shield: 0,
        lucasStacks:   u.lucasStacks,
        statusEffects: [],           // clear effects on skip
      };
    });
    setSnapshot([...stateRef.current]);
    // Small delay so HP bars update visually before overlay appears
    setTimeout(() => {
      if (battleLog.winner === 'hero') playVictorySound();
      else playDefeatSound();
      setBattleResult({
        winner:  battleLog.winner,
        rewards: battleLog.rewards ?? null,
      });
    }, 180);
  };

  // ── Ref shortcuts for async closures ───────────────────────────────────────
  const setCinRef = useRef(setCinematic); setCinRef.current = setCinematic;
  const setFltRef = useRef(setFloatNums); setFltRef.current = setFloatNums;
  const setBRRef  = useRef(setBattleResult); setBRRef.current = setBattleResult;

  const zoomOrigin = cinematic ? calcZoomOrigin(cinematic.side, cinematic.slotIndex) : 'center center';

  // ── Canvas replay-progress bar rAF ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.round(rect.width), cssH = Math.round(rect.height);
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(draw); return; }
      ctx.save();
      ctx.scale(dpr, dpr);
      const W = cssW, H = cssH;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.40)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(249,115,22,0.35)';
      ctx.fillRect(0, H - 1, W, 1);

      const PAD = 18;
      const trackY = H - 11;
      const trackW = W - PAD * 2;

      // Track rail
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(PAD, trackY - 1, trackW, 2);

      // Replay label
      ctx.font = "700 8px 'Roboto Condensed',sans-serif";
      ctx.fillStyle = 'rgba(249,115,22,0.75)';
      ctx.textAlign = 'left';
      ctx.fillText('BATTLE ON ACTION', PAD, trackY - 14);

      // Progress fill
      const [cur, total] = progressRef.current;
      const pct = total > 0 ? Math.min(1, cur / total) : 0;
      if (pct > 0) {
        ctx.fillStyle = '#F97316';
        ctx.fillRect(PAD, trackY - 1, Math.round(trackW * pct), 2);
      }

      // Event counter
      const label = `${cur} / ${total}`;
      ctx.font = "700 8px 'Roboto Condensed',sans-serif";
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'right';
      ctx.fillText(label, W - PAD, trackY - 14);

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    running.current = true;

    const sync = () => setSnapshot([...stateRef.current]);

    const patch = (uid: string, p: Partial<UnitState>) => {
      stateRef.current = stateRef.current.map(u => u.uid === uid ? { ...u, ...p } : u);
      sync();
    };

    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    const addFloat = (uid: string, value: number, type: FloatNum['type']) => {
      const id = ++floatId.current;
      const ox = -26 + Math.floor(Math.random() * 52); // wider scatter for 52px numbers
      setFltRef.current(p => [...p, { id, uid, value, type, ox }]);
      setTimeout(() => setFltRef.current(p => p.filter(f => f.id !== id)), 1200);
    };

    // Find UnitState by uid
    const getUnit = (uid: string) => stateRef.current.find(u => u.uid === uid);

    // ── Status effect helpers ─────────────────────────────────────────────────
    /** Apply or REFRESH an effect on a unit. Non-stackable: same id → refresh only. */
    const applyEffect = (uid: string, key: string) => {
      const def = EFX[key];
      if (!def) return;
      const unit = getUnit(uid);
      if (!unit || unit.animPhase === 'dead') return;
      const idx = unit.statusEffects.findIndex(e => e.id === def.id);
      if (idx >= 0) {
        // Refresh duration
        patch(uid, { statusEffects: unit.statusEffects.map((e, i) =>
          i === idx ? { ...e, turnsLeft: def.defaultTurns } : e
        )});
      } else {
        patch(uid, { statusEffects: [...unit.statusEffects, {
          id: def.id, iconUrl: def.iconUrl, turnsLeft: def.defaultTurns,
          color: def.color, isBuff: def.isBuff, isStun: def.isStun,
        }]});
      }
    };
    /** Tick all effects on a unit by 1 (called when THAT unit acts). Remove expired. */
    const tickEffects = (uid: string) => {
      const unit = getUnit(uid);
      if (!unit || unit.statusEffects.length === 0) return;
      const updated = unit.statusEffects
        .map(e => ({ ...e, turnsLeft: e.turnsLeft - 1 }))
        .filter(e => e.turnsLeft > 0);
      patch(uid, { statusEffects: updated });
    };
    /** True if target has any Water Slime debuff (Soaking Field passive trigger). */
    const hasWsDebuff = (uid: string) =>
      getUnit(uid)?.statusEffects.some(e => WS_DEBUFF_IDS.has(e.id)) ?? false;

    // ── Apply one target result from the server log ─────────────────────────
    const applyTarget = (tgt: SimBattleTarget, skillDtype: string) => {
      const unit = getUnit(tgt.uid);
      if (!unit || unit.animPhase === 'dead') return;

      // BUG FIX: SQL sends dmg = post-shield remaining damage.
      // When shield fully absorbs a hit, dmg = 0 — old code missed this branch entirely,
      // making shielded units completely invincible. Detect hits via shield reduction.
      const dmgAfterShield = tgt.dmg ?? 0;
      const shieldAfter    = tgt.shield_after ?? unit.shield;
      const shieldAbsorbed = Math.max(0, unit.shield - shieldAfter); // shield consumed this hit
      const wasHit         = dmgAfterShield > 0 || shieldAbsorbed > 0;
      const displayDmg     = dmgAfterShield + shieldAbsorbed; // total incoming, for float

      if (tgt.died) {
        addFloat(tgt.uid, displayDmg || tgt.dmg || 0, skillDtype === 'magical' ? 'magic' : 'dmg');
        patch(tgt.uid, { currentHp: 0, shield: 0, animPhase: 'dying', rage: 0 });
        setTimeout(() => patch(tgt.uid, { animPhase: 'dead' }), 1600);

      } else if (wasHit) {
        // Hit — shield absorbed some/all, hp_after + shield_after are authoritative
        addFloat(tgt.uid, displayDmg, skillDtype === 'magical' ? 'magic' : 'dmg');
        patch(tgt.uid, {
          currentHp: tgt.hp_after,
          shield:    shieldAfter,
          animPhase: 'hurt',
          rage:      tgt.rage_after,
        });
        setTimeout(() => {
          if (getUnit(tgt.uid)?.animPhase === 'hurt') patch(tgt.uid, { animPhase: 'idle' });
        }, 440);

      } else if ((tgt.heal ?? 0) > 0) {
        addFloat(tgt.uid, tgt.heal!, 'heal');
        patch(tgt.uid, { currentHp: tgt.hp_after, rage: tgt.rage_after });

      } else if ((tgt.shield ?? 0) > 0) {
        // Shield grant — shield_after is total after grant (avoids additive drift)
        addFloat(tgt.uid, tgt.shield!, 'heal');
        patch(tgt.uid, {
          shield: tgt.shield_after ?? (unit.shield + tgt.shield!),
        });
      }
    };

    // ── Play a single event from the battle log ─────────────────────────────
    const playEvent = async (ev: SimBattleEvent) => {
      // ── passive_init: init shield bars dari pre-battle passive (Emma, dll) ──
      if (ev.type === 'passive_init') {
        if (ev.shields) {
          stateRef.current = stateRef.current.map(u => ({
            ...u,
            shield: ev.shields![u.uid] ?? 0,
          }));
          sync();
          // Emma passive VFX — shield drops onto every hero that received a shield
          const shielded = stateRef.current.filter(
            u => u.side === 'hero' && (ev.shields![u.uid] ?? 0) > 0
          );
          if (shielded.length > 0) {
            window.dispatchEvent(new CustomEvent('emma-vfx', {
              detail: {
                type:        'emma_passive',
                actorSlot:   0,
                actorSide:   'hero',
                targetSlots: shielded.map(u => u.slotIndex),
                targetSide:  'hero',
              } as EmmaVFXTrigger,
            }));
          }
        }
        return;
      }

      const actor = getUnit(ev.actor!);
      if (!actor || actor.animPhase === 'dead') return;

      const isMelee  = MELEE_IDS.includes((actor.heroType ?? '').toLowerCase());
      // ── slot: hoisted first — used by ALL branches including passive check ─
      const slot     = ev.skill_slot ?? 0;
      // slot 3 = passive proc — no cinematic, no actor flip animations
      const isPassiveProc = slot === 3;
      const isSkill  = (ev.type === 'skill' || ev.type === 'ult') && !isPassiveProc;
      const skillKey = slotToKey(slot);
      const targets  = ev.targets ?? [];
      // ── HERO_SKILL_ACTIONS lookup — overrides generic melee/ranged behavior ─
      const actionDef  = HERO_SKILL_ACTIONS[actor.heroId]?.[slot];
      const moveType   = actionDef?.move ?? (isMelee ? 'melee_dash' : 'ranged_place');
      const useMelee   = moveType === 'melee_dash' || moveType === 'melee_aoe_center';

      // Find first damage target for dash direction
      const firstDmgTarget = targets.find(t => (t.dmg ?? 0) > 0 && !stateRef.current.find(u => u.uid === t.uid && u.animPhase === 'dead'));
      const dashTarget     = firstDmgTarget ? getUnit(firstDmgTarget.uid) : null;
      let   dv             = (useMelee && dashTarget) ? calcDashVec(actor.side, actor.slotIndex, dashTarget.slotIndex) : { x: 0, y: 0 };

      // ── AoE-centre ULT: any hero with moveType='melee_aoe_center' dashes ──────
      // Gorr ULT: always dash to BACK col centre (slot 3) regardless of targets.���────
      // to the visual centre of the enemy column (middle row) so the AoE cleave
      // looks like it originates from the centre of the formation.
      // Front col=0 → centerSlot=2 ;  back col=1 → centerSlot=3.
      if (moveType === 'melee_aoe_center' && dashTarget) {
        // Gorr always lunges to back-col centre (col=1 → centerSlot=3)
        const targetCol  = actor.heroId === 'gorr' ? 1 : (dashTarget.slotIndex % 2);
        const centerSlot = 2 + targetCol;
        dv = calcDashVec(actor.side, actor.slotIndex, centerSlot);
      }

      // ── Cinematic for skill / ult ─────────────────────────────────────────
      if (isSkill) {
        const cineKey = ev.t * 100 + ev.skill_slot;
        setCinRef.current({
          uid:      ev.actor,
          side:     actor.side,
          slotIndex:actor.slotIndex,
          skillName:ev.skill_name,
          skillSlot:skillKey,
          heroName: actor.name,
          key:      cineKey,
        });
        await delay(980);
        setCinRef.current(null);
        await delay(50);
      }

      // ── PASSIVE PROC (slot 3) ─────────────────────────────────────────────
      // Bleed ticks, lifesteal, on-hit passives: NO actor animation, NO cinematic.
      // Server puts Bleed-tick dmg in targets[] (dtype='bleed') and
      // lifesteal heal as a heal target for the actor.
      // Special float type 'bleed' renders as 🩸-N in bright red.
      if (isPassiveProc) {
        // Bleed tick or other passive proc: use 'bleed' float type when dtype='bleed'
        const passiveDtype: FloatNum['type'] =
          ev.skill_dtype === 'bleed' ? 'bleed' :
          ev.skill_dtype === 'magical' ? 'magic' : 'dmg';
        for (const tgt of targets) {
          const unit = getUnit(tgt.uid);
          if (!unit || unit.animPhase === 'dead') continue;
          const shieldAbsorbed = Math.max(0, unit.shield - (tgt.shield_after ?? unit.shield));
          const wasHit = (tgt.dmg ?? 0) > 0 || shieldAbsorbed > 0;
          if (wasHit) {
            const displayDmg = (tgt.dmg ?? 0) + shieldAbsorbed;
            if (displayDmg > 0) addFloat(tgt.uid, displayDmg, passiveDtype);
            if (tgt.died) {
              patch(tgt.uid, { currentHp: 0, shield: 0, animPhase: 'dying', rage: 0 });
              setTimeout(() => patch(tgt.uid, { animPhase: 'dead' }), 1600);
            } else {
              patch(tgt.uid, { currentHp: tgt.hp_after, shield: tgt.shield_after ?? unit.shield, animPhase: 'hurt', rage: tgt.rage_after });
              setTimeout(() => { if (getUnit(tgt.uid)?.animPhase === 'hurt') patch(tgt.uid, { animPhase: 'idle' }); }, 440);
            }
          } else if ((tgt.heal ?? 0) > 0) {
            // Lifesteal heal — show green float on Gorr (or whoever heals)
            addFloat(tgt.uid, tgt.heal!, 'heal');
            patch(tgt.uid, { currentHp: tgt.hp_after, rage: tgt.rage_after });
          }
        }
        tickEffects(ev.actor!);
        patch(ev.actor!, { rage: ev.rage_after ?? (getUnit(ev.actor!)?.rage ?? 0) });
        return; // skip all actor animations
      }

      // ── Flip windup ───────────────────────────────────────────────────────
      patch(ev.actor!, { animPhase: 'flip-windup' });
      await delay(120);

      // ── VFX helpers (client-only visuals, zero server impact) ────────────
      const oppSide: 'hero' | 'enemy' = actor.side === 'hero' ? 'enemy' : 'hero';

      const fireVFX = (type: VFXTrigger['type'], tSlots: number[], hitIndex?: number) => {
        if (actor.name !== 'Lucas' || !tSlots.length) return;
        window.dispatchEvent(new CustomEvent('lucas-vfx', { detail: {
          type, hitIndex,
          actorSlot:  actor.slotIndex,
          actorSide:  actor.side,
          targetSlots: tSlots,
          targetSide: oppSide,
        } as VFXTrigger }));
      };

      const fireSlimeVFX = (
        type: SlimeVFXTrigger['type'],
        tSlots: number[],
        tSide: 'hero' | 'enemy',
      ) => {
        if (!tSlots.length) return;
        window.dispatchEvent(new CustomEvent('slime-vfx', { detail: {
          type,
          actorSlot:   actor.slotIndex,
          actorSide:   actor.side,
          targetSlots: tSlots,
          targetSide:  tSide,
        } as SlimeVFXTrigger }));
      };

      const fireGorrVFX = (
        type: GorrVFXTrigger['type'],
        tSlots: number[],
        tSide: 'hero' | 'enemy',
      ) => {
        if (actor.heroId !== 'gorr') return;
        window.dispatchEvent(new CustomEvent('gorr-vfx', { detail: {
          type,
          actorSlot:   actor.slotIndex,
          actorSide:   actor.side,
          targetSlots: tSlots,
          targetSide:  tSide,
        } as GorrVFXTrigger }));
      };

      const fireCrawVFX = (
        type: CrawVFXTrigger['type'],
        tSlots: number[],
        tSide: 'hero' | 'enemy',
      ) => {
        if (actor.heroId !== 'craw' || !tSlots.length) return;
        window.dispatchEvent(new CustomEvent('craw-vfx', { detail: {
          type,
          actorSlot:   actor.slotIndex,
          actorSide:   actor.side,
          targetSlots: tSlots,
          targetSide:  tSide,
        } as CrawVFXTrigger }));
      };

      // Non-ULT type mapping
      const nonUltType: VFXTrigger['type'] | null =
        ev.skill_slot === 0 ? 'lucas_basic' :
        ev.skill_slot === 1 ? 'lucas_sk1'   :
        ev.skill_slot === 2 ? 'lucas_sk2'   : null;

      if (useMelee && dashTarget) {
        // ── Melee: dash → attacking → apply → return ──────────────────────
        patch(ev.actor, { animPhase: 'dashing', dashOffsetX: dv.x, dashOffsetY: dv.y });
        await delay(140);
        patch(ev.actor, { animPhase: 'attacking' });
        // Fire non-ULT VFX at attack moment
        if (nonUltType) {
          const tSlots = [...new Set(targets.filter(t => (t.dmg ?? 0) > 0).map(t => getUnit(t.uid)?.slotIndex ?? -1).filter(s => s >= 0))];
          fireVFX(nonUltType, tSlots.length ? tSlots : [dashTarget.slotIndex]);
        }
        // ── Gorr VFX — dark-brown vertical slash ─────────────────────────
        if (actor.heroId === 'gorr') {
          if (nonUltType) {
            // basic / sk1 / sk2: vertical slash on each hit target
            const tSlots = [...new Set(targets.filter(t => (t.dmg ?? 0) > 0).map(t => getUnit(t.uid)?.slotIndex ?? -1).filter(s => s >= 0))];
            fireGorrVFX('gorr_basic', tSlots.length ? tSlots : [dashTarget.slotIndex], oppSide);
          } else if (slot === 4) {
            // ULT: 2 full-height slashes across front + back enemy columns
            fireGorrVFX('gorr_ult', [], oppSide);
          }
        }
        // ── SFX at attack moment — driven by HERO_SKILL_ACTIONS ─────────
        { const sfx = actionDef?.sfx;
          if      (sfx === 'lucas')  playLucasAttackSfx();
          else if (sfx === 'punch')  playPunchSfx();
          else if (sfx === 'shield') playShieldSfx();
          else if (sfx === 'water')  playWaterSfx();
          else if (sfx === 'heal')   playHealSfx();
          // 'bullet' is ranged-only; 'none'/'passive' = silent
        }
        // ── Rock Slime ULT — stone spikes at each hit target ─────────────
        if (actor.name === 'RockSlime' && slot === 4) {
          const ts = [...new Set(
            targets.filter(t => (t.dmg ?? 0) > 0)
                   .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                   .filter(s => s >= 0)
          )];
          fireSlimeVFX('rockslime_ult', ts, oppSide);
        }
        await delay(180);

        // Apply hits
        // ULT: stagger sickle VFX waves by 200ms each (top→bot, bot→top, top→bot).
        // Non-ULT multi-hit: 160ms between repeated hits on the same target.
        const seenUids = new Map<string, number>(); // uid → hit count
        let ultWave    = 0; // highest wave index seen; delay fires once per new wave
        for (const tgt of targets) {
          const prevHit = seenUids.get(tgt.uid) ?? 0;
          // Delay 200ms before each new ULT wave (so sickles appear staggered)
          if (slot === 4 && prevHit > ultWave) {
            ultWave = prevHit;
            await delay(200);
            // Play SFX at start of each subsequent hit wave (wave 2 & 3)
            { const sfx = actionDef?.sfx;
              if      (sfx === 'lucas')  playLucasAttackSfx();
              else if (sfx === 'punch')  playPunchSfx();
              else if (sfx === 'shield') playShieldSfx();
            }
          }
          // Fire ULT sickle VFX before damage flash
          if (slot === 4) {
            const tgtUnit = getUnit(tgt.uid);
            if (tgtUnit) fireVFX('lucas_ult_hit', [tgtUnit.slotIndex], prevHit);
          }
          applyTarget(tgt, ev.skill_dtype ?? 'physical');
          const hitN = prevHit + 1;
          seenUids.set(tgt.uid, hitN);
          if (hitN > 1 && slot !== 4) await delay(160);
        }

        await delay(80);
        patch(ev.actor, { animPhase: 'dash-return', dashOffsetX: 0, dashOffsetY: 0 });
        await delay(180);
      } else {
        // ── Ranged / support: attacking in place ──────────────────────────
        patch(ev.actor, { animPhase: 'attacking' });
        if (nonUltType) {
          const tSlots = [...new Set(targets.filter(t => (t.dmg ?? 0) > 0).map(t => getUnit(t.uid)?.slotIndex ?? -1).filter(s => s >= 0))];
          fireVFX(nonUltType, tSlots);
        }

        // slot is hoisted above — all VFX/SFX blocks below read it directly.

        // ── Emma VFX ──────────────────────────────────────────────────────
        if (actor.name === 'Emma') {

          if (slot === 0) {
            // Basic attack: silver Gemini-star projectile to each damage target
            const ts = [...new Set(
              targets.filter(t => (t.dmg ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            if (ts.length) window.dispatchEvent(new CustomEvent('emma-vfx', {
              detail: { type: 'emma_basic', actorSlot: actor.slotIndex, actorSide: actor.side,
                        targetSlots: ts, targetSide: oppSide } as EmmaVFXTrigger,
            }));

          } else if (slot === 1) {
            // Skill 1 — Mending Touch: rising green plus signs at heal target
            const ts = [...new Set(
              targets.filter(t => (t.heal ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            if (ts.length) window.dispatchEvent(new CustomEvent('emma-vfx', {
              detail: { type: 'emma_sk1', actorSlot: actor.slotIndex, actorSide: actor.side,
                        targetSlots: ts, targetSide: actor.side } as EmmaVFXTrigger,
            }));

          } else if (slot === 2) {
            // Skill 2 — Bulwark Veil: sky-blue shield descends on shield target
            const ts = [...new Set(
              targets.filter(t => (t.shield ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            if (ts.length) window.dispatchEvent(new CustomEvent('emma-vfx', {
              detail: { type: 'emma_sk2', actorSlot: actor.slotIndex, actorSide: actor.side,
                        targetSlots: ts, targetSide: actor.side } as EmmaVFXTrigger,
            }));

          } else if (slot === 4) {
            // ULT — Sacred Bloom: rising green plus signs on 3 heal targets
            const ts = [...new Set(
              targets.filter(t => (t.heal ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            if (ts.length) window.dispatchEvent(new CustomEvent('emma-vfx', {
              detail: { type: 'emma_ult', actorSlot: actor.slotIndex, actorSide: actor.side,
                        targetSlots: ts, targetSide: actor.side } as EmmaVFXTrigger,
            }));
          }
        }
        // ── End Emma VFX ──────────────────────────────────────────────────

        // ── Rock Slime VFX ────────────────────────────────────────────────
        // Only SK2 (self-shield, no dmg target) reaches the ranged branch.
        // Basic/SK1/ULT → isMelee branch. Passive (slot 3) → no targets.
        if (actor.name === 'RockSlime') {
          if (slot === 2) {
            // SK2 — Rock Shell: brown stone shield drops on self
            const ts = [...new Set(
              targets.filter(t => (t.shield ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            fireSlimeVFX('rockslime_sk2', ts.length ? ts : [actor.slotIndex], actor.side);
          }
        }

        // ── Acid Slime VFX ────────────────────────────────────────────────
        if (actor.name === 'AcidSlime') {
          if (slot === 0) {
            // Basic attack: green dewdrop to damage target
            const ts = [...new Set(
              targets.filter(t => (t.dmg ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            fireSlimeVFX('acidslime_basic', ts, oppSide);
          } else if (slot === 1) {
            // SK1 — Acid Spit: same dewdrop, back-row target
            const ts = [...new Set(
              targets.filter(t => (t.dmg ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            fireSlimeVFX('acidslime_sk1', ts, oppSide);
          } else if (slot === 2) {
            // SK2 — Corrosive Splash: green vertical slash on each target
            const ts = [...new Set(
              targets.filter(t => (t.dmg ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            fireSlimeVFX('acidslime_sk2', ts, oppSide);
          } else if (slot === 4) {
            // ULT — Acid Flood: expanding green flood on target formation
            fireSlimeVFX('acidslime_ult', [0], oppSide);  // targetSide used for position; slots unused
          }
        }
        // ── Water Slime VFX ───────────────────────────────────────────────
        if (actor.name === 'WaterSlime') {
          if (slot === 0) {
            // Basic — blue teardrop to single damage target
            const ts = [...new Set(
              targets.filter(t => (t.dmg ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            fireSlimeVFX('waterslime_basic', ts, oppSide);
          } else if (slot === 1) {
            // SK1 — Bubble Heal: blue teardrop to lowest-HP ally
            const ts = [...new Set(
              targets.filter(t => (t.heal ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            if (ts.length) fireSlimeVFX('waterslime_sk1', ts, actor.side);
          } else if (slot === 2) {
            // SK2 — Tidal Wave: small blue flood over enemies
            fireSlimeVFX('waterslime_sk2', [0], oppSide);
          } else if (slot === 4) {
            // ULT — Tsunami: large blue flood over enemies
            fireSlimeVFX('waterslime_ult', [0], oppSide);
          }
        }
        // ── End Slime VFX ─────────────────────────────────────────────────

        // ── Craw VFX — white arrow projectile ────────────────────────────
        if (actor.heroId === 'craw') {
          if (slot === 0 || slot === 1 || slot === 2) {
            // basic/SK1/SK2: arrow flies to each hit target
            const ts = [...new Set(
              targets.filter(t => (t.dmg ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            fireCrawVFX('craw_arrow', ts.length ? ts : [], oppSide);
          } else if (slot === 4) {
            // ULT: 5 arrows rain down on all living enemies
            const ts = [...new Set(
              targets.filter(t => (t.dmg ?? 0) > 0)
                     .map(t => getUnit(t.uid)?.slotIndex ?? -1)
                     .filter(s => s >= 0)
            )];
            fireCrawVFX('craw_ult', ts, oppSide);
          }
        }
        // ── End Craw VFX ──────────────────────────────────────────────────

        // ── Myko VFX — SK1 Iron Casing: shield drops onto Myko (reuse Emma shield) ─
        if (actor.heroId === 'myko' && slot === 1) {
          window.dispatchEvent(new CustomEvent('emma-vfx', {
            detail: {
              type:        'emma_sk2',
              actorSlot:   actor.slotIndex,
              actorSide:   actor.side,
              targetSlots: [actor.slotIndex],  // shield lands on Myko itself
              targetSide:  actor.side,
            } as EmmaVFXTrigger,
          }));
        }
        // ── End Myko VFX ──────────────────────────────────────────────────

        // ── Skill SFX — ranged/support branch — driven by HERO_SKILL_ACTIONS ──
        // Adding a new hero? Set their sfx key in HERO_SKILL_ACTIONS above.
        // No more per-hero if/else chains needed here.
        { const sfx = actionDef?.sfx;
          if      (sfx === 'bullet') playBulletSfx();
          else if (sfx === 'water')  playWaterSfx();
          else if (sfx === 'heal')   playHealSfx();
          else if (sfx === 'shield') playShieldSfx();
          else if (sfx === 'lucas')  playLucasAttackSfx();
          else if (sfx === 'punch')  playPunchSfx();
          // 'none' / 'passive' / undefined = silent
        }
        // ── End Skill SFX ─────────────────────────────────────────────────

        await delay(300);

        const seenUids2 = new Map<string, number>();
        let ultWave2 = 0;
        for (const tgt of targets) {
          const prevHit = seenUids2.get(tgt.uid) ?? 0;
          if (slot === 4 && prevHit > ultWave2) {
            ultWave2 = prevHit;
            await delay(200);
          }
          if (slot === 4) {
            const tgtUnit = getUnit(tgt.uid);
            if (tgtUnit) fireVFX('lucas_ult_hit', [tgtUnit.slotIndex], prevHit);
          }
          applyTarget(tgt, ev.skill_dtype ?? 'physical');
          const hitN = prevHit + 1;
          seenUids2.set(tgt.uid, hitN);
          if (hitN > 1 && slot !== 4) await delay(160);
        }
      }

      // ── Apply status effects based on actor & skill ───────────────────────
      // Rules: non-stackable (fixed id) → applyEffect refreshes; stackable → new id per hit.
      // Only apply to living targets that were actually hit.
      const hitTargets = targets.filter(t => (t.dmg ?? 0) > 0);
      if (actor.name === 'WaterSlime') {
        for (const tgt of hitTargets) {
          if (slot === 1) applyEffect(tgt.uid, 'wslime_slow');     // Water Jet → speed slow 2T
          else if (slot === 2) applyEffect(tgt.uid, 'wslime_mdef');// Tidal Surge → M.DEF shred 2T
          else if (slot === 4) applyEffect(tgt.uid, 'wslime_ult'); // Deluge Wave → P/M.DEF shred 2T
        }
      }
      if (actor.name === 'AcidSlime') {
        for (const tgt of hitTargets) {
          if (slot === 1) applyEffect(tgt.uid, 'aslime_pdef');     // Acid Spit → P.DEF shred 2T
          else if (slot === 2) applyEffect(tgt.uid, 'aslime_stun');// Corrosive Splash → stun chance 1T
          else if (slot === 4) applyEffect(tgt.uid, 'aslime_pdef4');// Acid Flood → P.DEF shred 2T
        }
      }
      if (actor.name === 'RockSlime') {
        // Self-buffs — actor is the bearer
        if (slot === 1) applyEffect(actor.uid, 'rslime_pdef1');    // Boulder Dash → P.DEF buff 2T
        if (slot === 4) applyEffect(actor.uid, 'rslime_ult_b');    // Spike Eruption → P.DEF + reflect 2T
      }
      // ── Gorr — Bleed (SK1) & Terrify (SK2) debuffs on hit ───────────────
      if (actor.name === 'Gorr') {
        for (const tgt of hitTargets) {
          if      (slot === 1) applyEffect(tgt.uid, 'gorr_bleed');
          else if (slot === 2) applyEffect(tgt.uid, 'gorr_terrify');
        }
      }
      // ── Craw — Wound (SK1/ULT), Blind (SK2) ─────────────────────────────
      if (actor.heroId === 'craw') {
        for (const tgt of hitTargets) {
          if      (slot === 1) applyEffect(tgt.uid, 'craw_wound');
          else if (slot === 2) applyEffect(tgt.uid, 'craw_blind');
          else if (slot === 4) applyEffect(tgt.uid, 'craw_wound');
        }
      }
      // ── Myko — Spore Rot (SK2), Spore Toxin (ULT), Iron Casing self (SK1) ─
      if (actor.heroId === 'myko') {
        for (const tgt of hitTargets) {
          if      (slot === 2) applyEffect(tgt.uid, 'myko_spore_rot');
          else if (slot === 4) applyEffect(tgt.uid, 'myko_spore_toxin');
        }
        if (slot === 1) applyEffect(actor.uid, 'myko_iron_casing');
      }

      // ── Water Slime Soaking Field passive proc visual ─────────────────────
      // When any hero attacks an enemy that carries a Water Slime debuff,
      // show ✦M float to signal the 8% M.ATK bonus damage was applied.
      // (Actual damage already included in server total — this is visual only.)
      if (actor.side === 'hero') {
        for (const tgt of hitTargets) {
          if (hasWsDebuff(tgt.uid)) {
            addFloat(tgt.uid, 0, 'wpassive');
          }
        }
      }

      // ── Passive proc (slot 3): Cornered Rat one-time self-buff pill ──────
      if (isPassiveProc && ev.hero_id === 'craw' && ev.skill_name === 'Cornered Rat') {
        applyEffect(ev.actor!, 'craw_cr');
      }
      // ── Passive proc (slot 3): Spore Toxin tick — keep effect pill alive ──
      // (damage float already handled by passiveDtype='magic' above; no pill refresh needed)

      // ── Tick this actor's own effects (one turn consumed) ─────────────────
      // Effects on the BEARER tick down when the bearer acts.
      tickEffects(ev.actor!);

      // ── Flip revert → idle ────────────────────────────────────────────────
      patch(ev.actor!, { animPhase: 'flip-revert' });
      await delay(120);
      // Update lucasStacks from server if this was a Lucas action
      const stacksUpdate = ev.lucas_stacks != null
        ? { lucasStacks: ev.lucas_stacks }
        : {};
      patch(ev.actor!, { animPhase: 'idle', rage: ev.rage_after ?? 0, ...stacksUpdate });
    };

    // ── Main playback sequence ─────────────────────────────────────────────
    const playbackLoop = async () => {
      await delay(600); // intro pause

      const events = battleLog.events;
      progressRef.current = [0, events.length];

      for (let i = 0; i < events.length; i++) {
        if (!running.current) break;
        progressRef.current = [i, events.length];
        await playEvent(events[i]);
        if (!running.current) break;
        await delay(300); // between-event pause
      }

      if (!running.current) return;
      progressRef.current = [events.length, events.length];

      // Small final pause before overlay
      await delay(600);
      if (!running.current) return;

      stopBattleBgm(350);   // fade out BGM before result screen
      await delay(150);
      if (!running.current) return;

      if (battleLog.winner === 'hero') playVictorySound();
      else playDefeatSound();

      setBRRef.current({
        winner:  battleLog.winner,
        rewards: battleLog.rewards ?? null,
      });
    };

    startBattleBgm();   // loop BGM from battle start
    playbackLoop();
    return () => { running.current = false; stopBattleBgm(0); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Fixed cinematic — outside transform:scale() wrapper */}
      {cinematic && <CinematicOverlay info={cinematic}/>}
      {cinematic && <CinematicSkillCard info={cinematic}/>}

      {/* Replay progress canvas — fixed at top of viewport */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: '100vw', height: '52px',
          zIndex: 200,
          pointerEvents: 'none', display: 'block',
        }}
      />

      {/* Skip Battle button — fixed below replay bar, top-left */}
      {!battleResult && (
        <button
          onClick={handleSkip}
          style={{
            position:     'fixed',
            top:          58,
            left:         14,
            zIndex:       210,
            display:      'flex',
            alignItems:   'center',
            gap:          5,
            padding:      '5px 11px 5px 9px',
            borderRadius: 6,
            border:       '1px solid rgba(249,115,22,0.38)',
            background:   'rgba(0,0,0,0.68)',
            backdropFilter: 'blur(6px)',
            cursor:       'pointer',
            outline:      'none',
            boxShadow:    '0 2px 12px rgba(0,0,0,0.55)',
            transition:   'background .15s, border-color .15s, transform .10s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(249,115,22,0.18)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(249,115,22,0.72)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.68)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(249,115,22,0.38)';
          }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)'; }}
          onMouseUp={e =>   { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)'; }}
          onTouchEnd={e =>   {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            handleSkip();
          }}
        >
          {/* Fast-forward icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <polygon points="5,4 13,12 5,20" fill="rgba(249,115,22,0.90)"/>
            <polygon points="13,4 21,12 13,20" fill="rgba(249,115,22,0.90)"/>
          </svg>
          <span style={{
            fontFamily:    "'Roboto Condensed', sans-serif",
            fontSize:      11,
            fontWeight:    700,
            color:         'rgba(249,115,22,0.90)',
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            lineHeight:    1,
            userSelect:    'none',
          }}>
            Skip
          </span>
        </button>
      )}

      {/* VFX particle canvases — position:fixed, client-only visual, no server impact */}
      <LucasVFX/>
      <EmmaVFX/>
      <SlimeVFX/>
      <GorrVFX/>
      <CrawVFX/>

      {/* Scene wrapper: cinematic zoom + global animation-pause */}
      <div
        className={cinematic ? 'bp-paused' : ''}
        style={{
          position: 'absolute', inset: 0, overflow: 'visible',
          transform: cinematic ? 'scale(1.07)' : 'scale(1)',
          transformOrigin: zoomOrigin,
          transition: cinematic
            ? 'transform .28s cubic-bezier(.34,1.56,.64,1)'
            : 'transform .38s cubic-bezier(.25,.46,.45,.94)',
          willChange: 'transform',
        }}
      >
        <div style={{ position: 'absolute', left: 12, bottom: 0, overflow: 'visible' }}>
          <BattleFieldSide units={snapshot} side="hero"  floatNums={floatNums}/>
        </div>
        <div style={{ position: 'absolute', right: 12, bottom: 0, overflow: 'visible' }}>
          <BattleFieldSide units={snapshot} side="enemy" floatNums={floatNums}/>
        </div>
      </div>

      {/* Battle result overlay */}
      {battleResult && (
        battleResult.winner === 'hero'
          ? <VictoryOverlay rewards={battleResult.rewards} onContinue={() => cbRef.current.onVictory?.()}/>
          : <FailedOverlay onContinue={() => cbRef.current.onDefeat?.()}/>
      )}
    </>
  );
}