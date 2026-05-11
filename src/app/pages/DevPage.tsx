/**
 * DevPage — Debug & Server Health Check
 * Akses via URL: /dev
 * Tidak butuh login. Aman dihapus kapan saja.
 */
import { useState, useEffect } from 'react';
import { projectId } from '/utils/supabase/info';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/server/make-server-516bfa70`;
const HEALTH_URL  = `${SERVER_BASE}/health`;

interface CheckResult {
  label: string;
  url:   string;
  status: 'idle' | 'loading' | 'ok' | 'error';
  detail: string;
}

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span style={{
        flex: 1, background: '#111', color: '#a3e635', fontFamily: 'monospace',
        fontSize: 11, padding: '6px 10px', borderRadius: 6, wordBreak: 'break-all',
        border: '1px solid #333'
      }}>
        {value}
      </span>
      <button
        onClick={copy}
        style={{
          background: copied ? '#22c55e' : '#1e40af', color: '#fff',
          border: 'none', borderRadius: 6, padding: '6px 12px',
          cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0
        }}
      >
        {copied ? '✓ Copied!' : 'Copy'}
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: CheckResult['status'] }) {
  const map: Record<string, string> = {
    idle: '#555', loading: '#f59e0b', ok: '#22c55e', error: '#ef4444'
  };
  const emoji: Record<string, string> = {
    idle: '○', loading: '⟳', ok: '✓', error: '✗'
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 24, height: 24, borderRadius: '50%',
      background: map[status], color: '#fff', fontSize: 14, fontWeight: 700,
      animation: status === 'loading' ? 'spin 1s linear infinite' : 'none',
    }}>
      {emoji[status]}
    </span>
  );
}

export default function DevPage() {
  const [checks, setChecks] = useState<CheckResult[]>([
    { label: 'Hono Server Health', url: HEALTH_URL, status: 'idle', detail: '' },
    { label: 'Battle Engine Route', url: `${SERVER_BASE}/battle/resolve-turn (POST)`, status: 'idle', detail: '' },
  ]);

  const runHealthCheck = async () => {
    // Check 1: Health endpoint
    setChecks(prev => prev.map((c, i) => i === 0 ? { ...c, status: 'loading', detail: 'Pinging...' } : c));
    try {
      const res  = await fetch(HEALTH_URL);
      const json = await res.json();
      setChecks(prev => prev.map((c, i) =>
        i === 0
          ? { ...c, status: res.ok ? 'ok' : 'error',
              detail: res.ok
                ? `✓ Server UP — ${JSON.stringify(json)}`
                : `✗ HTTP ${res.status}: ${JSON.stringify(json)}` }
          : c
      ));

      // Check 2: Battle route (expect 401 unauthenticated — proves route exists)
      setChecks(prev => prev.map((c, i) =>
        i === 1 ? { ...c, status: 'loading', detail: 'Testing route...' } : c
      ));
      const res2  = await fetch(`${SERVER_BASE}/battle/resolve-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json2 = await res2.json();
      // 401 = route exists but needs auth (expected)
      // 404 = route not registered yet
      const routeOk = res2.status !== 404;
      setChecks(prev => prev.map((c, i) =>
        i === 1
          ? { ...c,
              status: routeOk ? 'ok' : 'error',
              detail: routeOk
                ? `✓ Route terdaftar (HTTP ${res2.status} — expected 401 without auth): ${JSON.stringify(json2)}`
                : `✗ Route belum terdaftar (HTTP 404) — server belum reload file baru` }
          : c
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setChecks(prev => prev.map(c => ({ ...c, status: 'error', detail: `Network error: ${msg}` })));
    }
  };

  useEffect(() => { runHealthCheck(); }, []);

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#e5e7eb',
      fontFamily: 'system-ui, sans-serif', padding: '24px 16px'
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 28 }}>🛠️</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Dev Debug Panel</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Battle Engine Migration — Server Health Check</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a
            href="/sprite-editor"
            style={{
              background: '#4c1d95', color: '#c4b5fd',
              border: '1px solid rgba(167,139,250,0.35)', borderRadius: 8, padding: '8px 16px',
              cursor: 'pointer', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            🎨 Sprite Size Editor
          </a>
          <button
            onClick={runHealthCheck}
            style={{
              background: '#1e40af', color: '#fff',
              border: 'none', borderRadius: 8, padding: '8px 16px',
              cursor: 'pointer', fontSize: 13
            }}
          >
            🔄 Cek Ulang
          </button>
        </div>
      </div>

      {/* Server URL */}
      <section style={{ background: '#111', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid #222' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
          🌐 Server Base URL
        </div>
        <CopyBox value={SERVER_BASE} />
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Health Check URL:</div>
          <CopyBox value={HEALTH_URL} />
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Battle Resolve-Turn URL:</div>
          <CopyBox value={`${SERVER_BASE}/battle/resolve-turn`} />
        </div>
      </section>

      {/* Status checks */}
      <section style={{ background: '#111', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid #222' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 12 }}>
          📡 Status Checks
        </div>
        {checks.map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '12px 0', borderBottom: i < checks.length - 1 ? '1px solid #222' : 'none'
          }}>
            <StatusDot status={c.status} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{c.label}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{c.url}</div>
              {c.detail && (
                <div style={{
                  fontSize: 11, marginTop: 6,
                  color: c.status === 'ok' ? '#86efac' : c.status === 'error' ? '#fca5a5' : '#fcd34d',
                  background: '#0a0a0a', padding: '4px 8px', borderRadius: 4,
                  fontFamily: 'monospace', wordBreak: 'break-word'
                }}>
                  {c.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Explanation */}
      <section style={{ background: '#111', borderRadius: 10, padding: 16, border: '1px solid #222' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 10 }}>
          📖 Apa Artinya?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { icon: '✅', label: 'Health = OK + Battle Route = OK (401)', desc: 'Server sudah deploy battle engine. Siap dipakai.' },
            { icon: '⚠️', label: 'Health = OK + Battle Route = 404',     desc: 'Server jalan tapi file battle-engine.ts belum ter-load. Tunggu 1-2 menit lalu cek ulang.' },
            { icon: '❌', label: 'Health = Error',                         desc: 'Server Hono tidak jalan. Hubungi support atau check Supabase Edge Functions dashboard.' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#374151' }}>
        Halaman ini aman untuk dihapus kapan saja.
      </div>
    </div>
  );
}
