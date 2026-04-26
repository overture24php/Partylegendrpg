import { useState } from 'react';

const SQL = `-- JALANKAN INI DI: Supabase Dashboard → SQL Editor → New Query → Run
-- Cukup sekali saja!

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nickname       TEXT    DEFAULT 'New Player',
  ADD COLUMN IF NOT EXISTS power          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hero_exp       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exp_percentage INTEGER DEFAULT 0;

-- Update trigger agar kolom baru ikut auto-update
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, username, nickname,
    level, xp, max_xp, exp_percentage,
    gold, gems, power, hero_exp
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    'New Player',
    0, 0, 100, 0, 500, 30, 0, 0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`;

export default function SqlHelperPage() {
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(0);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* fallback */
      const el = document.createElement('textarea');
      el.value = SQL;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const steps = [
    {
      num: '1',
      title: 'Buka Supabase Dashboard',
      desc: 'Pergi ke supabase.com → buka project kamu',
      link: 'https://supabase.com/dashboard',
      linkText: '→ Buka Supabase',
    },
    {
      num: '2',
      title: 'Klik "SQL Editor"',
      desc: 'Ada di sidebar kiri, icon seperti terminal/kode',
    },
    {
      num: '3',
      title: 'Klik "New Query"',
      desc: 'Tombol di pojok kanan atas SQL Editor',
    },
    {
      num: '4',
      title: 'Paste SQL di bawah ini',
      desc: 'Klik tombol SALIN SQL → paste di kotak query',
    },
    {
      num: '5',
      title: 'Klik tombol "Run"',
      desc: 'Tombol hijau di kanan bawah editor. Selesai!',
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a0a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'monospace',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>🗄️</div>
        <h1
          style={{
            color: '#f5c842',
            fontSize: '24px',
            fontWeight: 'bold',
            margin: '0 0 8px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          Setup Database
        </h1>
        <p style={{ color: '#aaa', margin: 0, fontSize: '14px' }}>
          Tambah kolom <span style={{ color: '#f5c842' }}>nickname</span>,{' '}
          <span style={{ color: '#4ade80' }}>power</span>, dan{' '}
          <span style={{ color: '#60a5fa' }}>hero_exp</span> ke Supabase
        </p>
      </div>

      {/* Steps */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '560px',
          width: '100%',
          marginBottom: '24px',
        }}
      >
        {steps.map((s, i) => (
          <div
            key={i}
            onClick={() => setStep(i)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              background: step === i ? 'rgba(245,200,66,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${step === i ? '#f5c842' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '10px',
              padding: '12px 16px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: step === i ? '#f5c842' : 'rgba(255,255,255,0.1)',
                color: step === i ? '#000' : '#888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '13px',
                flexShrink: 0,
              }}
            >
              {s.num}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: step === i ? '#f5c842' : '#fff', fontWeight: 'bold', fontSize: '14px' }}>
                {s.title}
              </div>
              <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
                {s.desc}
              </div>
              {s.link && (
                <a
                  href={s.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#60a5fa',
                    fontSize: '12px',
                    textDecoration: 'none',
                    marginTop: '4px',
                    display: 'inline-block',
                  }}
                >
                  {s.linkText}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* SQL Box */}
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(245,200,66,0.4)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {/* Box header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'rgba(245,200,66,0.1)',
            borderBottom: '1px solid rgba(245,200,66,0.2)',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28c840' }} />
          </div>
          <span style={{ color: '#888', fontSize: '12px' }}>migration.sql</span>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#22c55e' : '#f5c842',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 14px',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.5px',
            }}
          >
            {copied ? '✓ TERSALIN!' : '📋 SALIN SQL'}
          </button>
        </div>

        {/* SQL Code */}
        <pre
          style={{
            margin: 0,
            padding: '16px',
            color: '#e2e8f0',
            fontSize: '11px',
            lineHeight: '1.6',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}
        >
          {SQL.split('\n').map((line, i) => {
            let color = '#e2e8f0';
            if (line.trim().startsWith('--')) color = '#6b7280';
            else if (line.trim().startsWith('ALTER') || line.trim().startsWith('CREATE') || line.trim().startsWith('DROP')) color = '#f5c842';
            else if (line.includes('ADD COLUMN') || line.includes('DEFAULT')) color = '#60a5fa';
            else if (line.includes("'") || line.includes('"')) color = '#4ade80';
            return (
              <span key={i} style={{ display: 'block', color }}>
                {line || '\n'}
              </span>
            );
          })}
        </pre>
      </div>

      {/* Footer note */}
      <div
        style={{
          marginTop: '24px',
          padding: '12px 20px',
          background: 'rgba(74,222,128,0.1)',
          border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: '8px',
          maxWidth: '560px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#4ade80', margin: 0, fontSize: '13px' }}>
          ✅ Setelah klik <strong>Run</strong> di Supabase, kembali ke game dan login ulang.
          <br />
          <span style={{ color: '#888', fontSize: '11px' }}>
            Halaman ini ada di: <code style={{ color: '#f5c842' }}>/db-setup</code>
          </span>
        </p>
      </div>

      {/* Back to game */}
      <a
        href="/login"
        style={{
          marginTop: '16px',
          color: '#888',
          fontSize: '12px',
          textDecoration: 'none',
        }}
      >
        ← Kembali ke Login
      </a>
    </div>
  );
}
