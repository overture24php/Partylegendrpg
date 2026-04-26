import { RouterProvider } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { DatabaseSetupNotice } from './components/DatabaseSetupNotice';
import { OrientationGuard } from './components/OrientationGuard';
import { router } from './routes';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <OrientationGuard>
          <DatabaseSetupNotice />
          <RouterProvider router={router} />
        </OrientationGuard>
      </AuthProvider>
    </LanguageProvider>
  );
}