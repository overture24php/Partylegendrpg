import { useEffect, useState, useCallback } from 'react';
import { setupDatabase } from '/utils/supabase/setup-db';

type Phase = 'checking' | 'ok' | 'needs-setup' | 'retrying';

export function DatabaseSetupNotice() {
  const [phase, setPhase]     = useState<Phase>('checking');
  const [sqlCode, setSqlCode] = useState('');
  const [copied, setCopied]   = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const check = useCallback(async () => {
    setPhase('checking');
    const res = await setupDatabase();
    if (res.ok) {
      setPhase('ok');
    } else {
      setSqlCode(res.needsManualSQL ?? '');
      setPhase('needs-setup');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Auto-retry every 8 seconds while in needs-setup phase
  useEffect(() => {
    if (phase !== 'needs-setup') return;
    const t = setTimeout(async () => {
      setRetryCount(c => c + 1);
      setPhase('retrying');
      const res = await setupDatabase();
      if (res.ok) {
        setPhase('ok');
        window.location.reload(); // refresh to re-init app with DB ready
      } else {
        setPhase('needs-setup');
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [phase, retryCount]);

  if (phase === 'ok' || phase === 'checking') return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const dashboardUrl = `https://supabase.com/dashboard/project/cyecgzghfxtruzrzbfif/sql/new`;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        fontFamily: 'monospace',
      }}
    >
      <div
        style={{
          maxWidth: 680, width: '100%',
          background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
          border: '1px solid rgba(251,191,36,0.4)',
          borderRadius: 12,
          boxShadow: '0 0 60px rgba(251,191,36,0.15)',
          padding: 28,
          maxHeight: '92vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 36, lineHeight: 1 }}>🗄️</div>
          <div style={{ flex: 1 }}>
            <h2
              style={{
                margin: 0, marginBottom: 6,
                fontSize: 18, color: '#fbbf24',
                fontFamily: 'Cinzel, serif',
                letterSpacing: 1,
              }}
            >
              DATABASE SETUP REQUIRED
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
              Tabel{' '}
              <code style={{ background: '#0f172a', padding: '1px 6px', borderRadius: 4, color: '#86efac', border: '1px solid #374151' }}>
                public.profiles
              </code>{' '}
              belum ada di database. Jalankan SQL di bawah di{' '}
              <a
                href={dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#60a5fa', textDecoration: 'underline' }}
              >
                Supabase SQL Editor
              </a>
              , lalu halaman ini akan otomatis refresh.
            </p>
          </div>
        </div>

        {/* Auto-retry status */}
        <div
          style={{
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 14,
            fontSize: 12,
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ animation: phase === 'retrying' ? 'spin 1s linear infinite' : 'none' }}>
            {phase === 'retrying' ? '🔄' : '⏳'}
          </span>
          {phase === 'retrying'
            ? 'Checking database...'
            : `Auto-retry aktif — akan cek ulang dalam beberapa detik (attempt #${retryCount + 1})`}
        </div>

        {/* SQL Block */}
        {sqlCode && (
          <div
            style={{
              background: '#020617',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '14px 16px',
              marginBottom: 14,
              maxHeight: 340,
              overflow: 'auto',
            }}
          >
            <pre
              style={{
                margin: 0, fontSize: 11,
                color: '#86efac',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {sqlCode}
            </pre>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={handleCopy}
            style={{
              padding: '9px 18px',
              background: copied ? '#16a34a' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              transition: 'background .2s',
            }}
          >
            {copied ? '✅ Copied!' : '📋 Copy SQL'}
          </button>
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '9px 18px',
              background: '#d97706',
              color: '#fff',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🚀 Open SQL Editor
          </a>
          <button
            onClick={check}
            style={{
              padding: '9px 18px',
              background: '#374151',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            🔁 Retry Now
          </button>
        </div>

        <p style={{ margin: 0, marginTop: 14, fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          💡 <strong style={{ color: '#64748b' }}>Cara:</strong> Copy SQL → buka SQL Editor → paste → klik Run → tunggu halaman auto-refresh.
          Setup hanya perlu dilakukan <strong style={{ color: '#64748b' }}>1×</strong>.
        </p>
      </div>
    </div>
  );
}
