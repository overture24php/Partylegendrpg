/**
 * battle-service.ts — v12 (stage seeding + clean RPC call)
 *
 * simulateBattle:
 *   - Calls rpc_simulate_battle(p_stage_id, p_hero_entries) — original 2-param signature.
 *   - Enemy data is served from the `stage_enemies` DB table (seeded by seedStageData).
 *   - Stage definitions (rewards + chapter1_progress update) from `stage_definitions`.
 */

import { getSupabase } from '../../src/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BattleHeroEntry {
  hero_id:    string;
  slot_index: number;
}

export interface SimBattleTarget {
  uid:          string;
  dmg?:         number;
  heal?:        number;
  shield?:      number;
  shield_after: number;
  hp_after:     number;
  died:         boolean;
  rage_after:   number;
  hot_turns?:   number;
  stun_applied?: boolean;
}

export interface SimBattleEvent {
  t:            number;
  type:         'atk' | 'skill' | 'ult' | 'passive_init' | 'stun_skip';
  actor?:       string;
  hero_id?:     string;
  skill_slot?:  number;
  skill_name?:  string;
  skill_type?:  string;
  skill_dtype?: string;
  targets?:     SimBattleTarget[];
  rage_after?:  number;
  shields?:     Record<string, number>;
  lucas_stacks?: number | null;
}

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

export interface SimBattleResult {
  winner:        'hero' | 'enemy';
  rewards:       { gold: number; gems: number; exp: number; hero_exp: number } | null;
  events:        SimBattleEvent[];
  combatants:    SimBattleCombatant[];
  initial_hp:    Record<string, number>;
  initial_maxhp: Record<string, number>;
}

// ─── simulateBattle ───────────────────────────────────────────────────────────
// Original 2-param RPC call — enemies come from `stage_enemies` DB table.
// Call seedStageData() before first battle so the table is populated.

export async function simulateBattle(
  stageId:     string,
  heroEntries: BattleHeroEntry[],
): Promise<{ data?: SimBattleResult; error?: string }> {
  try {
    const sb = getSupabase();
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return { error: 'Sesi tidak valid. Silakan login ulang.' };

    const { data, error } = await sb.rpc('rpc_simulate_battle', {
      p_stage_id:     stageId,
      p_hero_entries: heroEntries,
    });
    if (error) return { error: `Server error: ${error.message}` };
    if (!data)  return { error: 'Server tidak mengembalikan data battle.' };

    const result = data as Record<string, unknown>;
    if (result['error']) return { error: result['error'] as string };

    return { data: data as SimBattleResult };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
