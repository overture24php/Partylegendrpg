/**
 * battle-service.ts  —  v7 Server-Authoritative Battle
 *
 * SECURITY MODEL:
 *   • Client calls simulateBattle() → single RPC to Supabase.
 *   • Server (PostgreSQL SECURITY DEFINER function) runs 100% of:
 *       - Stat loading   (player_heroes, hero_definitions, stage_enemies)
 *       - Skill loading  (hero_skills)
 *       - ATB simulation (full battle loop)
 *       - Damage formula (def mitigation, shield, Lucas passives)
 *       - Reward granting (gold, gems, xp, hero_exp, chapter_progress)
 *   • Client receives a READ-ONLY battle log and plays it back as animation.
 *   • There is NO client-side fallback engine.
 *     If the RPC fails, the battle fails — no bypass, no cheating.
 *
 * Prerequisites:
 *   Run /utils/supabase/patch_v7_server_battle.sql in Supabase SQL Editor.
 */

import { getSupabase } from '../../src/lib/supabase';

// ─── Public types used by BattlePlayback ─────────────────────────────────────

export interface BattleHeroEntry {
  hero_id:    string;
  slot_index: number;
}

/**
 * One hit / heal / shield result inside a SimBattleEvent.
 * Every number here is authoritative — produced by the server.
 */
export interface SimBattleTarget {
  uid:           string;
  dmg?:          number;
  heal?:         number;
  shield?:       number;   // shield GRANTED (buff events)
  shield_after:  number;   // remaining shield after this event (authoritative)
  hp_after:      number;
  died:          boolean;
  rage_after:    number;
}

/**
 * One action event in the battle log returned by rpc_simulate_battle.
 * 't' is the sequential event index (0, 1, 2, …).
 * Special type 'passive_init' (t=-1) carries initial shield values for all units —
 * emitted before the first combat event so the client can init shield bars.
 */
export interface SimBattleEvent {
  t:           number;
  type:        'atk' | 'skill' | 'ult' | 'passive_init';
  actor?:      string;          // undefined for passive_init
  hero_id?:    string;
  skill_slot?: number;
  skill_name?: string;
  skill_type?: string;
  skill_dtype?: string;
  targets?:    SimBattleTarget[];
  rage_after?: number;
  shields?:    Record<string, number>; // only on passive_init: uid → initial shield
  lucas_stacks?: number | null;        // only on Lucas actor events: stacks AFTER this turn (null = non-Lucas)
}

/**
 * Combatant state at END of simulation (for rendering final positions / HP).
 */
export interface SimBattleCombatant {
  uid:        string;
  hero_id:    string;
  name:       string;
  side:       'hero' | 'enemy';
  slot_index: number;
  level:      number;
  hero_type:  string;
  max_hp:     number;
  current_hp: number;
  p_atk:      number;
  m_atk:      number;
  p_def:      number;
  m_def:      number;
  speed:      number;
  is_alive:   boolean;
}

/**
 * Full response from rpc_simulate_battle.
 *
 * Client uses `events[]` purely for animation.
 * Client uses `initial_hp` / `initial_maxhp` for HP bar starting states.
 * Client NEVER recomputes damage or modifies any value.
 */
export interface SimBattleResult {
  winner:         'hero' | 'enemy';
  rewards:        {
    gold:     number;
    gems:     number;
    exp:      number;
    hero_exp: number;
  } | null;
  events:         SimBattleEvent[];
  combatants:     SimBattleCombatant[];
  initial_hp:     Record<string, number>;
  initial_maxhp:  Record<string, number>;
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * simulateBattle — runs the ENTIRE battle on the Supabase server.
 *
 * One round trip: client sends hero lineup → server returns full battle log.
 * No client computation, no cheating possible.
 *
 * If the RPC errors (function not deployed, DB unavailable, auth failure),
 * the error is returned to the caller and the battle does NOT proceed.
 * There is intentionally NO fallback.
 */
export async function simulateBattle(
  stageId:     string,
  heroEntries: BattleHeroEntry[],
): Promise<{ data?: SimBattleResult; error?: string }> {
  try {
    const sb = getSupabase();

    // Verify session before calling RPC
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return { error: 'Sesi tidak valid. Silakan login ulang.' };
    }

    const { data, error } = await sb.rpc('rpc_simulate_battle', {
      p_stage_id:     stageId,
      // Pass the array directly — PostgREST serialises JavaScript arrays
      // to JSONB natively. JSON.stringify() would double-encode it into a
      // JSONB "string" scalar, causing "cannot get array length of a scalar".
      p_hero_entries: heroEntries,
    });

    if (error) {
      console.error('[Battle] RPC error:', error);
      return { error: `Server error: ${error.message}` };
    }

    if (!data) {
      return { error: 'Server tidak mengembalikan data battle.' };
    }

    // Server may embed an error inside the JSONB response
    const result = data as Record<string, unknown>;
    if (result['error']) {
      const msg = result['error'] as string;
      console.error('[Battle] Server returned error:', msg);
      return { error: msg };
    }

    return { data: data as SimBattleResult };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Battle] Unexpected error:', msg);
    return { error: `Unexpected error: ${msg}` };
  }
}