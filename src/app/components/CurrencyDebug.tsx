import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function CurrencyDebug() {
  const { user, refreshProfile } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setShow(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-slate-900/95 border border-amber-500/50 rounded-lg p-4 max-w-sm text-xs font-mono shadow-2xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-amber-400 font-bold">Currency Debug</h3>
        <button
          onClick={() => setShow(false)}
          className="text-slate-400 hover:text-white"
        >✕</button>
      </div>

      <div className="space-y-1 text-slate-300">
        <div><span className="text-amber-300">User ID:</span> {user?.id?.slice(0, 8)}...</div>
        <div><span className="text-amber-300">Username:</span> {user?.username}</div>
        <div className="pt-2 border-t border-slate-700">
          <div><span className="text-yellow-400">Gold:</span> {user?.gold?.toLocaleString()}</div>
          <div><span className="text-cyan-400">Gems:</span> {user?.gems?.toLocaleString()}</div>
        </div>
        <div className="pt-2 border-t border-slate-700">
          <div className="text-slate-400 text-[10px]">
            localStorage: {localStorage.getItem('rp_profile:' + user?.id) ? '✓' : '✗'}
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          console.log('[Debug] Manual refresh...');
          refreshProfile();
        }}
        className="mt-3 w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold"
      >
        🔄 Refresh from DB
      </button>

      <div className="mt-2 text-[10px] text-slate-500 text-center">
        Press Ctrl+D to toggle
      </div>
    </div>
  );
}
