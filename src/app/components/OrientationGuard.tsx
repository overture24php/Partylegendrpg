/**
 * OrientationGuard
 *
 * Two jobs:
 *  1. Block portrait mode on mobile with a full-screen overlay.
 *  2. On mobile landscape, inject <meta viewport content="width=1280">
 *     so the browser auto-scales the game to match the desktop design
 *     (all vw / % / px units become identical to the 1280-px design width).
 *
 * Viewport switching:
 *   portrait  → width=device-width   (overlay text stays readable)
 *   landscape → width=1280,user-scalable=no  (game pixel-perfect match)
 */

import { useState, useEffect, useRef } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────
/** CSS design width the game was built for (matches typical desktop preview). */
const DESIGN_W = 1280;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function detectMobile(): boolean {
  const ua = navigator.userAgent || '';
  const mobileUA = /android|iphone|ipad|ipod|blackberry|windows phone|opera mini|mobile/i.test(ua);
  // Treat narrow physical screens as mobile too
  const narrowScreen = Math.min(window.screen.width, window.screen.height) <= 768;
  return mobileUA || narrowScreen;
}

function isPortraitNow(): boolean {
  if (screen?.orientation?.type) return screen.orientation.type.startsWith('portrait');
  return window.innerHeight > window.innerWidth;
}

/** Find or create <meta name="viewport"> and return it. */
function getOrCreateViewportMeta(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.prepend(meta);
  }
  return meta;
}

function setViewportLandscape(): void {
  const meta = getOrCreateViewportMeta();
  meta.setAttribute(
    'content',
    `width=${DESIGN_W}, initial-scale=1, user-scalable=no`
  );
}

function setViewportDefault(): void {
  const meta = getOrCreateViewportMeta();
  meta.setAttribute(
    'content',
    'width=device-width, initial-scale=1, user-scalable=no'
  );
}

// ─── Rotate-phone SVG ─────────────────────────────────────────────────────────
function RotateIcon() {
  return (
    <svg
      viewBox="0 0 80 80"
      style={{ width: '72px', height: '72px', marginBottom: '24px' }}
      fill="none"
    >
      {/* Phone body (portrait) */}
      <rect x="26" y="10" width="28" height="48" rx="5" ry="5"
        stroke="white" strokeWidth="3" fill="none" strokeOpacity="0.9" />
      <circle cx="40" cy="52" r="2.8" fill="white" fillOpacity="0.85" />
      <circle cx="40" cy="16" r="1.8" fill="white" fillOpacity="0.55" />
      {/* Rotation arc */}
      <path d="M 16,24 A 26,26 0 0,1 64,24"
        stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" strokeOpacity="0.75" />
      <polyline points="58,16 64,24 72,20"
        stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        fill="none" strokeOpacity="0.75" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export function OrientationGuard({ children }: { children: React.ReactNode }) {
  const isMobile  = useRef<boolean>(typeof window !== 'undefined' ? detectMobile() : false);
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? isPortraitNow() : false
  );

  // ── Initial viewport injection (runs once on mount) ────────────────────────
  useEffect(() => {
    if (!isMobile.current) return;
    // Apply correct viewport immediately based on current orientation
    if (isPortraitNow()) {
      setViewportDefault();
    } else {
      setViewportLandscape();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Orientation change listener ───────────────────────────────────────────
  useEffect(() => {
    if (!isMobile.current) return;

    const update = () => {
      const portrait = isPortraitNow();
      setIsPortrait(portrait);
      // Swap viewport meta IMMEDIATELY on rotation
      if (portrait) {
        setViewportDefault();
      } else {
        setViewportLandscape();
      }
    };

    window.addEventListener('resize',            update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    screen?.orientation?.addEventListener?.('change', update);

    return () => {
      window.removeEventListener('resize',            update);
      window.removeEventListener('orientationchange', update);
      screen?.orientation?.removeEventListener?.('change', update);
    };
  }, []);

  const showOverlay = isMobile.current && isPortrait;

  return (
    <>
      {children}

      {showOverlay && (
        <div
          style={{
            position:       'fixed',
            inset:          0,
            zIndex:         99999,
            background:     '#3a3a3a',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            padding:        '32px',
            userSelect:     'none',
            pointerEvents:  'all',
          }}
        >
          {/* Animated phone-rotate icon */}
          <div style={{ animation: 'og-spin 2.4s ease-in-out infinite' }}>
            <RotateIcon />
          </div>

          {/* Heading */}
          <p style={{
            color:         'rgba(255,255,255,0.95)',
            fontFamily:    "'Cinzel', serif",
            fontSize:      'clamp(18px, 5vw, 26px)',
            fontWeight:    800,
            letterSpacing: '0.12em',
            textAlign:     'center',
            margin:        '0 0 14px 0',
            textShadow:    '0 2px 12px rgba(0,0,0,0.6)',
          }}>
            ROTATE YOUR DEVICE
          </p>

          {/* Sub-text */}
          <p style={{
            color:         'rgba(255,255,255,0.60)',
            fontFamily:    "'Cinzel', serif",
            fontSize:      'clamp(11px, 3vw, 15px)',
            fontWeight:    500,
            letterSpacing: '0.08em',
            textAlign:     'center',
            margin:        '0 0 32px 0',
            lineHeight:    1.7,
            maxWidth:      '280px',
          }}>
            This game requires{' '}
            <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Landscape Mode</strong>
            {' '}to play.
            <br />
            Please rotate your phone sideways to continue.
          </p>

          {/* Portrait ✗ → Landscape ✓ diagram */}
          <div style={{ display:'flex', alignItems:'center', gap:'16px', opacity:0.5 }}>
            {/* Portrait (red cross) */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'5px' }}>
              <svg viewBox="0 0 30 48" style={{ width:'22px', height:'36px' }} fill="none">
                <rect x="2" y="2" width="26" height="44" rx="4"
                  stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
              </svg>
              <svg viewBox="0 0 16 16" style={{ width:'14px', height:'14px' }} fill="none">
                <line x1="2" y1="2" x2="14" y2="14" stroke="rgba(255,80,80,0.9)" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="14" y1="2" x2="2"  y2="14" stroke="rgba(255,80,80,0.9)" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>

            {/* Arrow */}
            <svg viewBox="0 0 24 24" style={{ width:'20px', height:'20px', opacity:0.5 }} fill="none">
              <path d="M5 12 L19 12 M14 7 L19 12 L14 17"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>

            {/* Landscape (green check) */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'5px' }}>
              <svg viewBox="0 0 48 30" style={{ width:'36px', height:'22px' }} fill="none">
                <rect x="2" y="2" width="44" height="26" rx="4"
                  stroke="rgba(100,255,120,0.85)" strokeWidth="2"/>
              </svg>
              <svg viewBox="0 0 16 16" style={{ width:'14px', height:'14px' }} fill="none">
                <path d="M2 8 L6 12 L14 4"
                  stroke="rgba(100,255,120,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <style>{`
            @keyframes og-spin {
              0%   { transform: rotate(0deg);  }
              30%  { transform: rotate(0deg);  }
              55%  { transform: rotate(90deg); }
              80%  { transform: rotate(90deg); }
              100% { transform: rotate(0deg);  }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
