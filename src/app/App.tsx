import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';


// ─── Game-wide drag & selection lock ─────────────────────────────────────────
function useNoDrag() {
  useEffect(() => {
    const prevent = (e: Event) => {
      const t = e.target as HTMLElement;
      // Allow drag on text inputs / textareas (copy-paste UX)
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      e.preventDefault();
    };
    document.addEventListener('dragstart',    prevent, { capture: true });
    document.addEventListener('selectstart',  prevent, { capture: true });
    document.addEventListener('contextmenu',  prevent, { capture: true });
    return () => {
      document.removeEventListener('dragstart',   prevent, { capture: true });
      document.removeEventListener('selectstart', prevent, { capture: true });
      document.removeEventListener('contextmenu', prevent, { capture: true });
    };
  }, []);
}

export default function App() {
  useNoDrag();
  return <RouterProvider router={router} />;
}