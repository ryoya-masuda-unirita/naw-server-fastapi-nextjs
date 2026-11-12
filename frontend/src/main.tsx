/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth-store';
import { routes } from '@/routes/index';
import { DropdownBackdrop } from '@/components/shared/dropdown-backdrop';
import { ToastContainer } from '@/components/shared/toast-container';
import '@/lib/i18n';
// フォントは index.css の @import ではなくここで読み込む（Tailwind の @import 展開では url() が解決できないため）。
// 移植元 styles.css の先頭の @import と同じ並び。material-symbols は mat-icon が使う outlined だけ読み込む
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/600.css';
import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/600.css';
import 'material-symbols/outlined.css';
import './index.css';

const queryClient = new QueryClient();

function App() {
  const [isReady, setIsReady] = React.useState(false);
  const { ensureInitialized } = useAuthStore();

  React.useEffect(() => {
    ensureInitialized().finally(() => {
      setIsReady(true);
    });
  }, [ensureInitialized]);

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
