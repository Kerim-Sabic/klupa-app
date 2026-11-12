import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { RouterProvider } from 'react-router';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../ui';
import { router } from './router';
import { SessionCache } from './SessionCache';

const queryClient = new QueryClient({
  defaultOptions: {
    // Pitch-side connections are poor: retry reads a little, never auto-retry a write.
    queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

/** Providers in dependency order: motion preference, server cache, session, toasts, routes. */
export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SessionCache />
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
