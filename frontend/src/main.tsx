/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth-store';
import { useApiErrorInterceptor } from '@/hooks/use-api-error-interceptor';
import { runLoginKeyInitializer } from '@/lib/initializers/login-key';
import { routes } from '@/routes/index';
import '@/lib/i18n';
// 移植元の <mat-icon> は fontSet: material-symbols-outlined のため outlined だけ読み込む
import 'material-symbols/outlined.css';
import './index.css';

const queryClient = new QueryClient();

function App() {
  const [isReady, setIsReady] = React.useState(false);
  const { ensureInitialized, loginWithKey } = useAuthStore();
  useApiErrorInterceptor();

  React.useEffect(() => {
    // URL の loginkey での認証を、セッション確認より前に済ませる（移植元 login-key.initializer）
    runLoginKeyInitializer({ loginWithKey })
      .then(() => ensureInitialized())
      .finally(() => {
        setIsReady(true);
      });
  }, [ensureInitialized, loginWithKey]);

  const element = useRoutes(routes);

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  return <>{element}</>;
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
