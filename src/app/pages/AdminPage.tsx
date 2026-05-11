/**
 * AdminPage — Player Management Panel
 * URL: /admin  (tidak dilink dari dalam game)
 * Dilindungi PIN lokal. Semua operasi pakai service_role key.
 *
 * Fitur:
 *   • Lihat semua pemain (search, paginate)
 *   • Ban pemain (block login via Supabase Auth + flag di profiles)
 *   • Unban pemain
 *   • Hapus akun total (cascade: heroes, skills, shards, battles — semuanya ikut)
 */

import { useState, useEffect, useCallback } from 'react';
import { projectId, serviceRoleKey } from '/utils/supabase/info';
import { Shield, Trash2, UserX, UserCheck, Search, RefreshCw,
         ChevronLeft, ChevronRight, LogOut, AlertTriangle, X, Users } from 'lucide-react';

// ── Admin PIN gate (ganti sesuai keinginan) ──────────────────────────────────
const ADMIN_PIN = '1234admin';

// ── Supabase endpoints ────────────────────────────────────────────────────────
const REST  = `https://${projectId}.supabase.co/rest/v1`;
const AUTH  = `https://${projectId}.supabase.co/auth/v1/admin/users`;

const ADMIN_HEADERS: Record<string, string> = {
  apikey:          serviceRoleKey,
  Authorization:   `Bearer ${serviceRoleKey}`,
  'Content-Type':  'application/json',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Player {
  id:          string;
  email:       string;
  username:    string;
  nickname:    string;
  level:       number;
  gold:        number;
  gems:        number;
  hero_exp:    number;
  power:       number;
  vip_level:   number;
  is_banned:   boolean;
  ban_reason:  string | null;
  banned_at:   string | null;
  created_at:  string;
  hero_count:  number;
  battles_won: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ── Confirm modal ──────────────────────────────────────────────────────────────
function ConfirmModal({
  title, message, danger, onConfirm, onCancel,
  extraInput, extraLabel,
}: {
  title:       string;
  message:     string;
  danger?:     boolean;
  onConfirm:   (extra?: string) => void;
  onCancel:    () => void;
  extraInput?: boolean;
  extraLabel?: string;
}) {
  const [val, setVal] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a1a2e', border: `1px solid ${danger ? '#ef4444' : '#334155'}`,
        borderRadius: 12, padding: 28, maxWidth: 400, width: '90%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={20} color={danger ? '#ef4444' : '#f59e0b'} />
          <span style={{ color: '#f1f5f9', fontFamily: 'monospace', fontWeight: 700, fontSize: 16 }}>
            {title}
          </span>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
          {message}
        </p>
        {extraInput && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>
              {extraLabel ?? 'Alasan'}
            </label>
            <input
              value={val} onChange={e => setVal(e.target.value)}
              placeholder="Tulis alasan..."
              style={{
                width: '100%', background: '#0f172a', border: '1px solid #334155',
                borderRadius: 6, padding: '8px 12px', color: '#f1f5f9',
                fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box',
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 18px', borderRadius: 6, border: '1px solid #334155',
            background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13,
          }}>Batal</button>
          <button onClick={() => onConfirm(extraInput ? val : undefined)} style={{
            padding: '8px 18px', borderRadius: 6, border: 'none',
            background: danger ? '#ef4444' : '#3b82f6',
            color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          }}>Konfirmasi</button>
        </div>
      </div>
    </div>
  );
}

// ── Player row ─────────────────────────────────────────────────────────────────
function PlayerRow({
  player, onBan, onUnban, onDelete,
}: {
  player:   Player;
  onBan:    (p: Player) => void;
  onUnban:  (p: Player) => void;
  onDelete: (p: Player) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{
          background: player.is_banned ? 'rgba(239,68,68,0.08)' : 'transparent',
          cursor: 'pointer',
          borderBottom: '1px solid #1e293b',
        }}
      >
        {/* Username + badge */}
        <td style={{ padding: '10px 14px', color: '#f1f5f9', fontSize: 13, fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {player.is_banned && (
              <span style={{
                background: '#ef4444', color: '#fff', fontSize: 9, padding: '1px 5px',
                borderRadius: 3, fontWeight: 700, letterSpacing: 1,
              }}>BAN</span>
            )}
            {player.username}
          </div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{player.email}</div>
        </td>

        {/* Level */}
        <td style={{ padding: '10px 8px', textAlign: 'center', color: '#fbbf24', fontSize: 13, fontFamily: 'monospace' }}>
          {player.level}
        </td>

        {/* Heroes */}
        <td style={{ padding: '10px 8px', textAlign: 'center', color: '#a78bfa', fontSize: 13, fontFamily: 'monospace' }}>
          {player.hero_count}
        </td>

        {/* Gold */}
        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#f59e0b', fontSize: 12, fontFamily: 'monospace' }}>
          {fmtNum(player.gold)}
        </td>

        {/* Power */}
        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#38bdf8', fontSize: 12, fontFamily: 'monospace' }}>
          {fmtNum(player.power)}
        </td>

        {/* Joined */}
        <td style={{ padding: '10px 8px', textAlign: 'center', color: '#64748b', fontSize: 11 }}>
          {new Date(player.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
        </td>

        {/* Actions */}
        <td style={{ padding: '10px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            {player.is_banned ? (
              <button
                onClick={() => onUnban(player)}
                title="Unban"
                style={{
                  background: '#16a34a', border: 'none', borderRadius: 6,
                  padding: '5px 10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#fff', fontSize: 11,
                }}
              >
                <UserCheck size={13} /> Unban
              </button>
            ) : (
              <button
                onClick={() => onBan(player)}
                title="Ban"
                style={{
                  background: '#b45309', border: 'none', borderRadius: 6,
                  padding: '5px 10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#fff', fontSize: 11,
                }}
              >
                <UserX size={13} /> Ban
              </button>
            )}
            <button
              onClick={() => onDelete(player)}
              title="Hapus total"
              style={{
                background: '#7f1d1d', border: 'none', borderRadius: 6,
                padding: '5px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                color: '#fca5a5', fontSize: 11,
              }}
            >
              <Trash2 size={13} /> Hapus
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
          <td colSpan={7} style={{ padding: '12px 18px' }}>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 12, fontFamily: 'monospace' }}>
              <div>
                <span style={{ color: '#64748b' }}>ID: </span>
                <span style={{ color: '#94a3b8' }}>{player.id}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Nickname: </span>
                <span style={{ color: '#94a3b8' }}>{player.nickname}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>VIP: </span>
                <span style={{ color: '#fbbf24' }}>Lv {player.vip_level}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Gems: </span>
                <span style={{ color: '#818cf8' }}>{fmtNum(player.gems)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Hero EXP: </span>
                <span style={{ color: '#34d399' }}>{fmtNum(player.hero_exp)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Battles won: </span>
                <span style={{ color: '#f1f5f9' }}>{player.battles_won}</span>
              </div>
              {player.is_banned && (
                <div>
                  <span style={{ color: '#ef4444' }}>Alasan ban: </span>
                  <span style={{ color: '#fca5a5' }}>{player.ban_reason ?? '—'}</span>
                  <span style={{ color: '#64748b', marginLeft: 8 }}>({fmtDate(player.banned_at)})</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [pinInput, setPinInput]   = useState('');
  const [unlocked, setUnlocked]   = useState(false);
  const [pinError, setPinError]   = useState(false);

  const [players,   setPlayers]   = useState<Player[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState('');
  const [page,      setPage]      = useState(0);
  const PAGE_SIZE = 20;

  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirm,   setConfirm]   = useState<null | {
    type:    'ban' | 'unban' | 'delete';
    player:  Player;
  }>(null);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Fetch players ────────────────────────────────────────────────────────────
  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetch(
        `${REST}/rpc/rpc_admin_list_players`,
        {
          method:  'POST',
          headers: ADMIN_HEADERS,
          body:    JSON.stringify({
            p_limit:  PAGE_SIZE,
            p_offset: page * PAGE_SIZE,
            p_search: search.trim() || null,
          }),
        }
      ).then(r => r.json());

      setPlayers((body?.players ?? []) as Player[]);
      setTotal(body?.total ?? 0);
    } catch {
      showToast('Gagal memuat data pemain', false);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { if (unlocked) fetchPlayers(); }, [unlocked, fetchPlayers]);

  // ── Ban ──────────────────────────────────────────────────────────────────────
  const executeBan = async (player: Player, reason?: string) => {
    setConfirm(null);
    try {
      // 1. Flag in profiles
      const r1 = await fetch(`${REST}/rpc/rpc_admin_ban_player`, {
        method: 'POST', headers: ADMIN_HEADERS,
        body: JSON.stringify({
          p_user_id:    player.id,
          p_reason:     reason || 'Banned by admin',
          p_admin_email: 'admin',
        }),
      });
      const d1 = await r1.json();
      if (d1?.error) throw new Error(d1.error);

      // 2. Block login via Supabase Auth (ban for 100 years)
      await fetch(`${AUTH}/${player.id}`, {
        method: 'PUT', headers: ADMIN_HEADERS,
        body: JSON.stringify({ ban_duration: '876600h' }),
      });

      showToast(`✓ ${player.username} berhasil di-ban`);
      fetchPlayers();
    } catch (e) {
      showToast(`Gagal ban: ${e}`, false);
    }
  };

  // ── Unban ────────────────────────────────────────────────────────────────────
  const executeUnban = async (player: Player) => {
    setConfirm(null);
    try {
      // 1. Clear flag
      const r1 = await fetch(`${REST}/rpc/rpc_admin_unban_player`, {
        method: 'POST', headers: ADMIN_HEADERS,
        body: JSON.stringify({ p_user_id: player.id }),
      });
      const d1 = await r1.json();
      if (d1?.error) throw new Error(d1.error);

      // 2. Remove auth ban
      await fetch(`${AUTH}/${player.id}`, {
        method: 'PUT', headers: ADMIN_HEADERS,
        body: JSON.stringify({ ban_duration: 'none' }),
      });

      showToast(`✓ ${player.username} berhasil di-unban`);
      fetchPlayers();
    } catch (e) {
      showToast(`Gagal unban: ${e}`, false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const executeDelete = async (player: Player) => {
    setConfirm(null);
    try {
      // Deleting from auth.users cascades to:
      //   profiles → hero_shards
      //   player_heroes, player_hero_skills, battle_sessions
      // ALL wiped automatically — no manual loop needed.
      const r = await fetch(`${AUTH}/${player.id}`, {
        method: 'DELETE', headers: ADMIN_HEADERS,
      });
      if (!r.ok && r.status !== 404) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.message ?? `HTTP ${r.status}`);
      }
      showToast(`✓ Akun ${player.username} dihapus total`);
      fetchPlayers();
    } catch (e) {
      showToast(`Gagal hapus: ${e}`, false);
    }
  };

  // ── PIN gate ─────────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div style={{
        minHeight: '100vh', background: '#020617',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: '#0f172a', border: '1px solid #1e293b',
          borderRadius: 16, padding: 40, width: 320,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        }}>
          <Shield size={40} color="#3b82f6" />
          <div style={{ color: '#f1f5f9', fontFamily: 'monospace', fontSize: 18, fontWeight: 700 }}>
            Admin Panel
          </div>
          <input
            type="password"
            value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (pinInput === ADMIN_PIN) setUnlocked(true);
                else setPinError(true);
              }
            }}
            placeholder="Masukkan PIN admin..."
            style={{
              width: '100%', background: '#1e293b',
              border: `1px solid ${pinError ? '#ef4444' : '#334155'}`,
              borderRadius: 8, padding: '10px 14px', color: '#f1f5f9',
              fontFamily: 'monospace', fontSize: 14, boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {pinError && (
            <div style={{ color: '#ef4444', fontSize: 12, marginTop: -12 }}>PIN salah.</div>
          )}
          <button
            onClick={() => {
              if (pinInput === ADMIN_PIN) setUnlocked(true);
              else setPinError(true);
            }}
            style={{
              width: '100%', background: '#3b82f6', border: 'none', borderRadius: 8,
              padding: '11px', color: '#fff', fontFamily: 'monospace',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Masuk
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#f1f5f9', fontFamily: 'monospace' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? '#14532d' : '#7f1d1d',
          border: `1px solid ${toast.ok ? '#16a34a' : '#ef4444'}`,
          borderRadius: 8, padding: '10px 18px',
          color: '#fff', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {toast.msg}
          <X size={14} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setToast(null)} />
        </div>
      )}

      {/* Confirm modal */}
      {confirm && confirm.type === 'ban' && (
        <ConfirmModal
          title={`Ban ${confirm.player.username}?`}
          message={`Pemain ini tidak bisa login lagi. Semua data tetap ada. Bisa di-unban kapan saja.`}
          danger
          extraInput
          extraLabel="Alasan ban"
          onConfirm={reason => executeBan(confirm.player, reason)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm && confirm.type === 'unban' && (
        <ConfirmModal
          title={`Unban ${confirm.player.username}?`}
          message={`Pemain ini bisa login kembali.`}
          onConfirm={() => executeUnban(confirm.player)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm && confirm.type === 'delete' && (
        <ConfirmModal
          title={`Hapus TOTAL akun ${confirm.player.username}?`}
          message={`Tindakan ini PERMANEN dan tidak bisa dibatalkan.\n\nYang ikut terhapus otomatis:\n• Profil & resource\n• Semua hero + skill\n• Hero shards\n• Battle history\n\nTidak perlu hapus satu per satu — CASCADE otomatis.`}
          danger
          onConfirm={() => executeDelete(confirm.player)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Header */}
      <div style={{
        background: '#0f172a', borderBottom: '1px solid #1e293b',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Shield size={22} color="#3b82f6" />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Admin Panel</span>
          <span style={{
            background: '#1e3a5f', color: '#93c5fd', fontSize: 10,
            padding: '2px 8px', borderRadius: 4, letterSpacing: 1,
          }}>MANAGEMENT</span>
        </div>
        <button
          onClick={() => setUnlocked(false)}
          style={{
            background: 'transparent', border: '1px solid #334155',
            borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
            color: '#64748b', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <LogOut size={13} /> Keluar
        </button>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 16, padding: '16px 24px',
        borderBottom: '1px solid #1e293b',
      }}>
        {[
          { label: 'Total Pemain',  value: total,
            sub: `${players.filter(p => p.is_banned).length} banned`, color: '#60a5fa' },
          { label: 'Halaman',
            value: `${page + 1} / ${Math.max(1, totalPages)}`,
            sub: `${PAGE_SIZE} per halaman`, color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#0f172a', border: '1px solid #1e293b',
            borderRadius: 8, padding: '12px 18px', minWidth: 140,
          }}>
            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: 20, fontWeight: 700 }}>{s.value}</div>
            <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        padding: '14px 24px',
        display: 'flex', gap: 12, alignItems: 'center',
        borderBottom: '1px solid #1e293b',
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={15} color="#475569" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Cari username atau email..."
            style={{
              width: '100%', background: '#0f172a', border: '1px solid #1e293b',
              borderRadius: 8, padding: '8px 12px 8px 34px',
              color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>
        <button
          onClick={fetchPlayers}
          disabled={loading}
          style={{
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
            color: '#94a3b8', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div style={{ padding: '0 24px 24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div>Memuat data...</div>
          </div>
        ) : players.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
            <Users size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>Tidak ada pemain ditemukan</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1e293b' }}>
                {['Pemain', 'Lv', 'Hero', 'Gold', 'Power', 'Bergabung', 'Aksi'].map(h => (
                  <th key={h} style={{
                    padding: '10px 8px', textAlign: h === 'Pemain' ? 'left' : h === 'Aksi' ? 'right' : 'center',
                    color: '#475569', fontSize: 11, letterSpacing: 1,
                    fontWeight: 700, textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  onBan={pl   => setConfirm({ type: 'ban',    player: pl })}
                  onUnban={pl => setConfirm({ type: 'unban',  player: pl })}
                  onDelete={pl => setConfirm({ type: 'delete', player: pl })}
                />
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 10,
            marginTop: 20, alignItems: 'center',
          }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: '#1e293b', border: '1px solid #334155',
                borderRadius: 6, padding: '6px 12px', cursor: page === 0 ? 'not-allowed' : 'pointer',
                color: page === 0 ? '#334155' : '#94a3b8',
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 13,
              }}
            >
              <ChevronLeft size={14} /> Sebelumnya
            </button>
            <span style={{ color: '#64748b', fontSize: 13 }}>
              Halaman {page + 1} dari {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                background: '#1e293b', border: '1px solid #334155',
                borderRadius: 6, padding: '6px 12px',
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                color: page >= totalPages - 1 ? '#334155' : '#94a3b8',
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 13,
              }}
            >
              Berikutnya <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
