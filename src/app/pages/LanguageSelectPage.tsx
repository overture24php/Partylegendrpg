import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLanguage } from '../context/LanguageContext';
import type { Lang } from '../i18n/translations';

const DOT_DUR = 900;

export default function LanguageSelectPage() {
  const { lang, setLang } = useLanguage();
  const navigate          = useNavigate();
  // Local "pending" selection — only committed to context on Confirm
  const [pending, setPending] = useState<Lang>(lang);

  const title      = pending === 'id' ? 'Pilih Bahasa' : 'Select Language';
  const confirmLbl = pending === 'id' ? 'Konfirmasi' : 'Confirm';

  const handleConfirm = () => {
    setLang(pending);
    navigate('/login', { replace: true });
  };

  return (
    <div style={{
      width: '100%', height: '100dvh',
      background: '#ffffff',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 'clamp(24px, 5vh, 52px)',
      overflow: 'hidden',
      fontFamily: "'Playfair Display', Georgia, serif",
    }}>
      {/* Bouncing-dot keyframes (reused for decoration) */}
      <style>{`
        @keyframes lsDot {
          0%, 100% { transform: translateY(-8px); }
          50%      { transform: translateY(8px);  }
        }
        .ls-btn-seg {
          transition: background 0.18s, box-shadow 0.18s;
          cursor: pointer;
          border: none;
          outline: none;
          display: flex; align-items: center; justify-content: center;
        }
        .ls-btn-seg:active { transform: scale(0.95); }
      `}</style>

      {/* ── Title ─────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: 'clamp(8px, 1.5vw, 20px)',
        lineHeight: 1,
      }}>
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(28px, min(8vw, 12vh), 12vh)',
          fontWeight: 900,
          color: '#ffffff',
          WebkitTextStroke: '7px #000000',
          paintOrder: 'stroke fill',
          letterSpacing: '0.03em',
          userSelect: 'none',
          display: 'block',
          lineHeight: 1,
        }}>{title}</span>

        {/* 4 bouncing dots — same rhythm as Loading */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 'clamp(4px, 0.8vw, 12px)',
          paddingBottom: 'clamp(2px, 0.4vh, 6px)',
          alignSelf: 'flex-end',
        }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width:  'clamp(7px, 1.2vw, 16px)',
              height: 'clamp(7px, 1.2vw, 16px)',
              borderRadius: '50%',
              background: '#000000',
              outline: '2.5px solid #000000',
              outlineOffset: '2px',
              boxSizing: 'border-box',
              animation: `lsDot ${DOT_DUR}ms ease-in-out infinite`,
              animationDelay: i % 2 === 0 ? `-${DOT_DUR / 2}ms` : '0ms',
            }}/>
          ))}
        </div>
      </div>

      {/* ── Language toggle: [ ID ][ EN ] ────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        height: 'clamp(48px, 9vw, 80px)',
      }}>
        {/* ID — left pill half */}
        <button
          className="ls-btn-seg"
          onClick={() => setPending('id')}
          style={{
            width:  'clamp(100px, 18vw, 200px)',
            borderRadius: '9999px 0 0 9999px',
            background: pending === 'id'
              ? '#000000'
              : 'transparent',
            border: `3px solid #000000`,
            borderRight: 'none',
            color: pending === 'id' ? '#ffffff' : '#000000',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(18px, 3.5vw, 38px)',
            fontWeight: 900,
            letterSpacing: '0.12em',
            boxShadow: pending === 'id'
              ? 'inset 0 2px 8px rgba(0,0,0,0.4)'
              : 'none',
          }}
        >
          ID
        </button>

        {/* Divider line */}
        <div style={{ width: '3px', background: '#000000', flexShrink: 0 }}/>

        {/* EN — right pill half */}
        <button
          className="ls-btn-seg"
          onClick={() => setPending('en')}
          style={{
            width:  'clamp(100px, 18vw, 200px)',
            borderRadius: '0 9999px 9999px 0',
            background: pending === 'en'
              ? '#000000'
              : 'transparent',
            border: `3px solid #000000`,
            borderLeft: 'none',
            color: pending === 'en' ? '#ffffff' : '#000000',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(18px, 3.5vw, 38px)',
            fontWeight: 900,
            letterSpacing: '0.12em',
            boxShadow: pending === 'en'
              ? 'inset 0 2px 8px rgba(0,0,0,0.4)'
              : 'none',
          }}
        >
          EN
        </button>
      </div>

      {/* ── Confirm button ───────────────────────────────────────────────────── */}
      <button
        onClick={handleConfirm}
        style={{
          width:       'clamp(200px, 36vw, 400px)',
          height:      'clamp(48px, 9vw, 80px)',
          borderRadius: '9999px',
          background:  '#000000',
          border:      '3px solid #000000',
          color:       '#ffffff',
          fontFamily:  "'Playfair Display', Georgia, serif",
          fontSize:    'clamp(16px, 3vw, 32px)',
          fontWeight:  900,
          letterSpacing: '0.14em',
          cursor:      'pointer',
          outline:     'none',
          transition:  'transform 0.12s, box-shadow 0.12s',
          boxShadow:   'inset 0 2px 8px rgba(0,0,0,0.35)',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseDown={e  => (e.currentTarget.style.transform = 'scale(0.97)')}
        onMouseUp={e    => (e.currentTarget.style.transform = 'scale(1.04)')}
      >
        {confirmLbl}
      </button>
    </div>
  );
}