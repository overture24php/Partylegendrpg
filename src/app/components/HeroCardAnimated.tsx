/**
 * HeroCardAnimated — wraps a hero card with visual effects:
 *   • Card overlays: diagonal sweep shine, holographic foil (color-burn), ambient particles
 *   • Character illustration (inside SVG): float+breath via .hca-ilust-anim CSS class,
 *     smooth 2D parallax displacement via --hci-x / --hci-y CSS vars (RAF lerp, no re-renders)
 *
 * Performance optimisations (mobile):
 *   • IntersectionObserver pauses ALL CSS animations + cancels RAF when off-screen.
 *   • RAF is lazy: only starts on mouse-enter, self-terminates when back at neutral.
 *   • On pure-touch devices the RAF never fires at all.
 *   • `will-change: transform` on the card promotes it to its own compositor layer.
 *   • `contain: layout style paint` isolates each card's layout calculations.
 */

import { useRef, useCallback, useMemo, useEffect } from 'react';

// ── Inject keyframes + illustration animation class ───────────────────────────
const STYLE_ID = 'hca-keyframes';
function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    /* Applied to the inner <g> wrapping the <image> in each card SVG */
    .hca-ilust-anim {
      transform-box:    fill-box;
      transform-origin: 50% 75%;
      animation: hcaIlustFloat 3.7s ease-in-out infinite;
    }
    @keyframes hcaIlustFloat {
      0%,100% { transform: translateY(0px)   scale(1);     }
      50%     { transform: translateY(-10px) scale(1.018); }
    }

    /* Sweep: uses transform:translateX only — GPU composited, zero layout cost */
    @keyframes hcaSweep {
      0%   { transform: translateX(-220%); }
      38%  { transform: translateX(280%);  }
      100% { transform: translateX(280%);  }
    }
    /* Holo: animate opacity on a fixed gradient — GPU composited, no hue-rotate */
    @keyframes hcaHolo {
      0%,100% { opacity: 0.08; }
      50%     { opacity: 0.22; }
    }
    @keyframes hcaParticle {
      0%   { opacity: 0;   transform: translateY(0px)       translateX(0px)       scale(1.0);  }
      15%  { opacity: 1;   }
      80%  { opacity: 0.5; }
      100% { opacity: 0;   transform: translateY(var(--vy)) translateX(var(--vx)) scale(0.15); }
    }
  `;
  document.head.appendChild(s);
}

// ── Particle data ─────────────────────────────────────────────────────────────
interface Particle {
  id: number; x: number; y: number; size: number;
  color: string; duration: number; delay: number;
  vx: string; vy: string;
}
function genParticles(n: number, rarityColor: string): Particle[] {
  const palette = [rarityColor, '#ffffff', '#FFD700', '#aaddff', '#ffaaff'];
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: 4  + Math.random() * 92,
    y: 2  + Math.random() * 65,
    size: 1.8 + Math.random() * 3.8,
    color: palette[Math.floor(Math.random() * palette.length)],
    duration: 2.4 + Math.random() * 2.8,
    delay:    Math.random() * 5,
    vx: `${((Math.random() - 0.5) * 36).toFixed(1)}px`,
    vy: `${-(48 + Math.random() * 55).toFixed(1)}px`,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────
interface HeroCardAnimatedProps {
  children:    React.ReactNode;
  rarityColor: string;
  /** Max 2-D parallax amplitude in px (default 6) */
  maxParallax?: number;
}

export function HeroCardAnimated({
  children, rarityColor, maxParallax = 6,
}: HeroCardAnimatedProps) {
  injectStyles();

  const containerRef = useRef<HTMLDivElement>(null);
  const target       = useRef({ x: 0, y: 0 });
  const current      = useRef({ x: 0, y: 0 });
  const rafId        = useRef(0);
  const isHovered    = useRef(false);
  const particles    = useMemo(() => genParticles(7, rarityColor), [rarityColor]);

  // ── IntersectionObserver: pause every animated child when off-screen ────────
  // This is pure DOM mutation — zero React re-renders.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(([entry]) => {
      const play = entry.isIntersecting ? 'running' : 'paused';

      // Pause/resume all tagged HTML animation elements
      el.querySelectorAll<HTMLElement>('[data-hca-anim]').forEach(ae => {
        ae.style.animationPlayState = play;
      });

      // Pause/resume the SVG float animation on the illustration group
      const svgG = el.querySelector('.hca-ilust-anim') as HTMLElement | null;
      if (svgG) svgG.style.animationPlayState = play;

      // Cancel RAF when going off-screen
      if (!entry.isIntersecting && rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
    }, {
      // Start pausing slightly before the card fully leaves, resume a bit before it enters
      rootMargin: '120px',
      threshold:  0,
    });

    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── Lazy RAF: self-starts on hover, self-terminates when at neutral ─────────
  const startRaf = useCallback(() => {
    if (rafId.current) return; // already running

    const tick = () => {
      const c  = current.current;
      const t  = target.current;
      c.x += (t.x - c.x) * 0.1;
      c.y += (t.y - c.y) * 0.1;

      const el = containerRef.current;
      if (el) {
        el.style.setProperty('--hci-x', `${c.x.toFixed(2)}px`);
        el.style.setProperty('--hci-y', `${c.y.toFixed(2)}px`);
      }

      // Self-terminate once close enough to 0,0 and no longer hovered
      if (!isHovered.current && Math.abs(c.x) < 0.05 && Math.abs(c.y) < 0.05) {
        el?.style.setProperty('--hci-x', '0px');
        el?.style.setProperty('--hci-y', '0px');
        rafId.current = 0;
        return;
      }

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
  }, []);

  const handleMouseEnter = useCallback(() => {
    isHovered.current = true;
    startRaf();
  }, [startRaf]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width  / 2)) / (rect.width  / 2); // -1..+1
    const dy = (e.clientY - (rect.top  + rect.height / 2)) / (rect.height / 2); // -1..+1
    target.current = { x: dx * maxParallax, y: dy * maxParallax * 0.7 };
  }, [maxParallax]);

  const handleMouseLeave = useCallback(() => {
    isHovered.current = false;
    target.current    = { x: 0, y: 0 };
    startRaf(); // let RAF wind down naturally to 0,0 then self-terminate
  }, [startRaf]);

  // Cleanup on unmount
  useEffect(() => () => { cancelAnimationFrame(rafId.current); }, []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // GPU layer hint — prevents card from being re-composited on each scroll tick
        willChange: 'transform',
        // Isolate layout/style/paint from sibling cards — reduces reflow scope
        contain: 'layout style paint',
      }}
    >
      {/* Card content (SVG) — card frame stays static */}
      {children}

      {/* ── Diagonal sweep shine ── */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: '12px', overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <div
          data-hca-anim
          style={{
            position: 'absolute',
            left: 0,
            top: '-60%', height: '220%', width: '52%',
            background: 'linear-gradient(102deg, transparent 30%, rgba(255,255,255,0.28) 50%, transparent 70%)',
            animation: 'hcaSweep 4.8s ease-in-out infinite',
            willChange: 'transform',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ── Holographic foil overlay (color-burn rainbow) ── */}
      <div
        data-hca-anim
        style={{
          position: 'absolute', inset: 0,
          borderRadius: '10px',
          background: 'linear-gradient(125deg, #ff006655, #ff990055, #00ff8855, #0099ff55, #cc00ff55, #ff006655)',
          mixBlendMode: 'color-burn',
          opacity: 0.15,
          animation: 'hcaHolo 8s linear infinite',
          willChange: 'opacity',
          pointerEvents: 'none',
        }}
      />

      {/* ── Ambient bokeh particles ── */}
      {particles.map(p => (
        <div
          key={p.id}
          data-hca-anim
          style={{
            position: 'absolute',
            left:   `${p.x}%`,
            bottom: `${p.y}%`,
            width:  `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: '50%',
            background: p.color,
            boxShadow: `0 0 ${(p.size * 2.8).toFixed(1)}px ${p.color}, 0 0 ${(p.size * 1.4).toFixed(1)}px rgba(255,255,255,0.4)`,
            animation: `hcaParticle ${p.duration}s ${p.delay}s ease-out infinite`,
            ['--vx' as string]: p.vx,
            ['--vy' as string]: p.vy,
            pointerEvents: 'none',
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}