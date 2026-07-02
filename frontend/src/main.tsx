import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth-store';
import { routes } from '@/routes/index';
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
