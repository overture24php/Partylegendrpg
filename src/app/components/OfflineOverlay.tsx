import { useState, useEffect } from 'react';

const DOT_DUR = 900;

export function OfflineOverlay() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const onOnline  = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.40)',
      zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'all',
    }}>
      <style>{`
        @keyframes rcDot {
          0%, 100% { transform: translateY(-10px); }
          50%      { transform: translateY(10px);  }
        }
      `}</style>

      <div style={{
        display: 'flex', alignItems: 'center',
        gap: 'clamp(8px, 1.5vw, 20px)',
        lineHeight: 1,
        userSelect: 'none',
      }}>
        {/* "Re-Connecting" text */}
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(36px, min(10vw, 14vh), 14vh)',
          fontWeight: 900,
          color: '#ffffff',
          WebkitTextStroke: '7px #000000',
          paintOrder: 'stroke fill',
          letterSpacing: '0.03em',
          display: 'block',
          lineHeight: 1,
        }}>Re-Connecting</span>

        {/* 4 bouncing dots — identical timing to LoadingPage */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 'clamp(5px, 1vw, 14px)',
          paddingBottom: 'clamp(2px, 0.4vh, 6px)',
          alignSelf: 'flex-end',
        }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width:  'clamp(8px, 1.4vw, 18px)',
              height: 'clamp(8px, 1.4vw, 18px)',
              borderRadius: '50%',
              background: '#ffffff',
              outline: '2.5px solid #000000',
              outlineOffset: '2px',
              boxSizing: 'border-box',
              animation: `rcDot ${DOT_DUR}ms ease-in-out infinite`,
              animationDelay: i % 2 === 0 ? `-${DOT_DUR / 2}ms` : '0ms',
            }}/>
          ))}
        </div>
      </div>
    </div>
  );
}
