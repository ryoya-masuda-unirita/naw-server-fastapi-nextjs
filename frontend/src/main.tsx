/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth-store';
import { useApiErrorInterceptor } from '@/hooks/use-api-error-interceptor';
import { runLoginKeyInitializer } from '@/lib/initializers/login-key';
import { routes } from '@/routes/index';
import { DropdownBackdrop } from '@/components/shared/dropdown-backdrop';
import { ToastContainer } from '@/components/shared/toast-container';
import { showErrorToast } from '@/components/shared/toast-store';
import '@/lib/i18n';
// フォントは index.css の @import ではなくここで読み込む（Tailwind の @import 展開では url() が解決できないため）。
// 移植元 styles.css の先頭の @import と同じ並び
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/600.css';
import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/600.css';
// 移植元の <mat-icon> は fontSet: material-symbols-outlined のため outlined だけ読み込む
import 'material-symbols/outlined.css';
import './index.css';

const queryClient = new QueryClient();

function App() {
  const [isReady, setIsReady] = React.useState(false);
  const { ensureInitialized, loginWithKey } = useAuthStore();
  // 移植元 errorInterceptor と同じく、共通のエラートーストを出す（#279 の申し送り）
  useApiErrorInterceptor({ showErrorToast });

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

  // 移植元 app.ts と同じく、トーストとドロップダウンの暗幕はルートに 1 つだけ置く
  return (
    <>
      {element}
      <ToastContainer />
      <DropdownBackdrop />
    </>
  );
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
