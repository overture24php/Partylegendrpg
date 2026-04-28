import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useLanguage } from '../context/LanguageContext';
import { startBgm } from '../components/BgmController';

const BG = 'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777395784/ChatGPT_Image_Apr_29_2026_12_02_36_AM_p3z4gf.png';

export default function IntroPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const handleStart = () => {
    startBgm(); // user gesture → unlock & play BGM
    setVisible(false);
    setTimeout(() => {
      navigate('/game', { replace: true });
    }, 500);
  };

  return (
    <div
      className="size-full relative overflow-hidden flex flex-col select-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
        cursor: 'pointer',
      }}
      onClick={handleStart}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Background — gambar baru, brightness asli */}
      <ImageWithFallback
        src={BG}
        alt="Background"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
        style={{ filter: 'none', WebkitUserDrag: 'none' } as React.CSSProperties}
      />

      {/* Bottom gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)',
        }}
      />

      {/* Tap-to-start text */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-10 pointer-events-none">
        <motion.span
          animate={{ opacity: [1, 0.15, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="text-white tracking-widest"
          style={{ fontSize: '12px', letterSpacing: '0.25em' }}
        >
          {t('intro.tap_to_start')}
        </motion.span>
      </div>
    </div>
  );
}