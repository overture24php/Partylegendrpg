/**
 * HeroDbSetupNotice.tsx
 * Shown only when hero tables are confirmed missing AND auto-create failed.
 * Disappears automatically once tables are detected via RE-CHECK.
 */

import { useState, useEffect } from 'react';
import { projectId, serviceRoleKey } from '/utils/supabase/info';
import { HERO_SQL_SCHEMA } from '/utils/supabase/hero-db';

const F  = "'Roboto Condensed', sans-serif";
const FP = "'Playfair Display', serif";

async function heroTablesExist(): Promise<boolean> {
  const REST  = `https://${projectId}.supabase.co/rest/v1`;
  const ADMIN = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Accept: 'application/json' };
  try {
    const r = await fetch(`${REST}/hero_definitions?select=hero_id&limit=1`, { headers: ADMIN });
    return r.ok;
  } catch { return false; }
}

export function HeroDbSetupNotice() {
  const sqlSchema = HERO_SQL_SCHEMA;
  const [visible,  setVisible]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Give the app 500ms to mount, then check tables once
    const id = setTimeout(async () => {
      const ok = await heroTablesExist();
      if (!ok) setVisible(true);
    }, 500);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;

  const handleCopy = () => {
    // Clipboard API blocked in sandboxed iframes — use execCommand fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = sqlSchema;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Last resort: open in a new tab so user can Ctrl+A / Ctrl+C manually
      const blob = new Blob([sqlSchema], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  };

  const handleRecheck = async () => {
    setChecking(true);
    const ok = await heroTablesExist();
    setChecking(false);
    if (ok) setVisible(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      display: 'flex', justifyContent: 'center', padding: '10px 12px 0',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(10,4,24,0.97)',
        border: '1.5px solid rgba(255,160,0,0.7)',
        borderRadius: 10,
        padding: '10px 14px',
        maxWidth: 540,
        width: '100%',
        boxShadow: '0 0 28px rgba(255,120,0,0.28), 0 6px 24px rgba(0,0,0,0.9)',
        pointerEvents: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#FF8C00" strokeWidth="2"/>
            <path d="M12 8v4m0 4h.01" stroke="#FF8C00" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: FP, fontSize: 11, fontWeight: 800, color: '#FF8C00', letterSpacing: '0.12em', flex: 1 }}>
            HERO DB SETUP REQUIRED
          </span>
          <button
            onClick={() => setVisible(false)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 0 }}
          >×</button>
        </div>

        <p style={{ fontFamily: F, fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: '0 0 8px', lineHeight: 1.5 }}>
          Auto-create failed. Copy the SQL and run it in{' '}
          <strong style={{ color: '#FFD700' }}>Supabase → SQL Editor</strong>.
          Tables will be created with all seed data (heroes, skills, stages).
        </p>

        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontFamily: F, fontSize: 10,
            fontWeight: 700, padding: '4px 10px', cursor: 'pointer', marginBottom: 6,
            letterSpacing: '0.06em', display: 'block',
          }}
        >
          {expanded ? '▲ Hide SQL' : '▼ Show SQL'}
        </button>

        {expanded && (
          <pre style={{
            background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 6, padding: '8px', fontSize: 7.5, color: 'rgba(200,220,255,0.85)',
            overflowY: 'auto', maxHeight: 200, margin: '0 0 8px', fontFamily: 'monospace',
            whiteSpace: 'pre-wrap', lineHeight: 1.4,
          }}>
            {sqlSchema}
          </pre>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1, height: 34,
              background: copied
                ? 'linear-gradient(90deg, rgba(26,122,26,0.55) 0%, rgba(15,77,15,0.55) 100%)'
                : 'linear-gradient(90deg, rgba(255,140,0,0.22) 0%, rgba(255,140,0,0.10) 100%)',
              border: `1.5px solid ${copied ? '#22C55E88' : 'rgba(255,140,0,0.55)'}`,
              borderRadius: 7, cursor: 'pointer',
              color: copied ? '#86EFAC' : '#FFD700',
              fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              transition: 'all 0.2s',
            }}
          >
            {copied ? '✓ COPIED!' : '📋 COPY SQL'}
          </button>
          <button
            onClick={handleRecheck}
            disabled={checking}
            style={{
              flex: 1, height: 34,
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(255,255,255,0.18)',
              borderRadius: 7, cursor: checking ? 'default' : 'pointer',
              color: checking ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.7)',
              fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              opacity: checking ? 0.6 : 1,
            }}
          >
            {checking ? 'Checking…' : '↻ RE-CHECK'}
          </button>
        </div>
      </div>
    </div>
  );
}