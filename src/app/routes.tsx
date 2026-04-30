import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { useAuth } from './context/AuthContext';
import { BgmController } from './components/BgmController';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LoadingPage from './pages/LoadingPage';
import SplashPage from './pages/SplashPage';
import IntroPage from './pages/IntroPage';
import GameStartPage from './pages/GameStartPage';
import ArenaPage from './pages/ArenaPage';
import TavernPage from './pages/TavernPage';
import GuildPage from './pages/GuildPage';
import TowerPage from './pages/TowerPage';
import MarketPage from './pages/MarketPage';
import CastlePage from './pages/CastlePage';
import AdventurePage from './pages/AdventurePage';
import EventPage from './pages/EventPage';
import SvgLibraryPage from './pages/SvgLibraryPage';
import HeroPage from './pages/HeroPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="size-full flex items-center justify-center" style={{ background: '#000' }}>
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: '3px', background: '#000' }}
        >
          <div className="h-full w-1/3 animate-pulse" style={{ background: '#fff', opacity: 0.3 }} />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="size-full flex items-center justify-center" style={{ background: '#000' }}>
      <div className="absolute bottom-0 left-0 right-0" style={{ height: '3px', background: '#000' }}>
        <div className="h-full w-1/3 animate-pulse" style={{ background: '#fff', opacity: 0.3 }} />
      </div>
    </div>
  );
  if (user) return <Navigate to="/loading" replace />;
  return <>{children}</>;
}

// ── Persistent hidden images — keep browser decode cache warm across navigations
// These <img> elements NEVER unmount, so the browser cannot evict their decoded
// bitmaps. Any page that mounts an <img> with the same src gets instant paint.
const BG_KEEPER_SRCS = [
  // City / GameStartPage background
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777396811/ChatGPT_Image_Apr_29_2026_12_19_32_AM_squmiv.png',
  // Hero detail overlay background
  'https://res.cloudinary.com/dhkethrmc/image/upload/v1777381178/ChatGPT_Image_Apr_28_2026_07_59_00_PM_ud1ln3.png',
  // Intro background
  'https://res.cloudinary.com/dhkethrmc/image/upload/f_auto,q_auto/v1777395784/ChatGPT_Image_Apr_29_2026_12_02_36_AM_p3z4gf.png',
];

function PersistentBgKeeper() {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '1px', height: '1px', overflow: 'hidden', opacity: 0, pointerEvents: 'none', zIndex: -9999 }}>
      {BG_KEEPER_SRCS.map(src => (
        <img key={src} src={src} alt="" decoding="async"
          style={{ position: 'absolute', width: '1px', height: '1px' }} />
      ))}
    </div>
  );
}

function RootLayout() {
  return (
    <>
      <BgmController />
      <PersistentBgKeeper />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <Navigate to="/login" replace />,
      },
      {
        path: '/login',
        element: (
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        ),
      },
      {
        path: '/register',
        element: (
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        ),
      },
      {
        path: '/loading',
        element: (
          <ProtectedRoute>
            <LoadingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/splash',
        element: (
          <ProtectedRoute>
            <SplashPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/intro',
        element: (
          <ProtectedRoute>
            <IntroPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/game',
        element: (
          <ProtectedRoute>
            <GameStartPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/game/arena',
        element: <ProtectedRoute><ArenaPage /></ProtectedRoute>,
      },
      {
        path: '/game/tavern',
        element: <ProtectedRoute><TavernPage /></ProtectedRoute>,
      },
      {
        path: '/game/guild',
        element: <ProtectedRoute><GuildPage /></ProtectedRoute>,
      },
      {
        path: '/game/tower',
        element: <ProtectedRoute><TowerPage /></ProtectedRoute>,
      },
      {
        path: '/game/market',
        element: <ProtectedRoute><MarketPage /></ProtectedRoute>,
      },
      {
        path: '/game/castle',
        element: <ProtectedRoute><CastlePage /></ProtectedRoute>,
      },
      {
        path: '/game/adventure',
        element: <ProtectedRoute><AdventurePage /></ProtectedRoute>,
      },
      {
        path: '/game/hero',
        element: <ProtectedRoute><HeroPage /></ProtectedRoute>,
      },
      {
        path: '/game/event',
        element: <ProtectedRoute><EventPage /></ProtectedRoute>,
      },
      {
        path: '/svg-library',
        element: <SvgLibraryPage />,
      },
      {
        path: '*',
        element: <Navigate to="/login" replace />,
      },
    ],
  },
]);