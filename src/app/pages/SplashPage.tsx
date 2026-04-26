import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';

const IMG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1776874245/Splash_screen_aygb5n.png';

// Timing (ms)
const FADE_IN  = 1200;
const HOLD     = 1800;
const FADE_OUT = 900;

export default function SplashPage() {
  const navigate  = useNavigate();
  const [opacity, setOpacity] = useState(0);
  const skippedRef = useRef(false);

  const goNext = () => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    setOpacity(0);
    setTimeout(() => navigate('/intro', { replace: true }), FADE_OUT);
  };

  useEffect(() => {
    // Fade in
    const t1 = setTimeout(() => setOpacity(1), 60);

    // After hold, fade out then navigate
    const t2 = setTimeout(() => {
      if (!skippedRef.current) setOpacity(0);
    }, FADE_IN + HOLD);

    const t3 = setTimeout(() => {
      if (!skippedRef.current) navigate('/intro', { replace: true });
    }, FADE_IN + HOLD + FADE_OUT);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      onClick={goNext}
      style={{
        width: '100%', height: '100%',
        background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <img
        src={IMG}
        alt="Splash"
        style={{
          opacity,
          transition: `opacity ${opacity === 1 ? FADE_IN : FADE_OUT}ms ease`,
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
        draggable={false}
      />
    </div>
  );
}
