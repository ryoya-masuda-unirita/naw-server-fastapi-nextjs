import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth-store';
import './index.css';

const queryClient = new QueryClient();

function App() {
  const [isReady, setIsReady] = React.useState(false);
  const authStore = useAuthStore();

  React.useEffect(() => {
    authStore.ensureInitialized().then(() => {
      setIsReady(true);
    });
  }, [authStore]);

  if (!isReady) {
    return <div>Loading...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div>App</div>
    </QueryClientProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
