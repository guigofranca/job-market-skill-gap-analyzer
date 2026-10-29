import './config/zod'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Analytics } from '@vercel/analytics/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApiError } from './api/client'
import App from './App'
import { ErrorBoundary } from './components/feedback/ErrorBoundary'
import { AppFallback } from './components/feedback/Fallbacks'
import { withoutProfile } from './lib/analytics'
import '@fontsource-variable/geist'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // Retry only transient failures (network/timeout/5xx); never 4xx or contract errors.
      retry: (failureCount, error) =>
        error instanceof ApiError && error.retryable && failureCount < 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado em index.html')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary fallback={(error, reset) => <AppFallback error={error} reset={reset} />}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
    {/* Production only: in development it would load a debug script from Vercel's CDN. */}
    {import.meta.env.PROD && <Analytics beforeSend={withoutProfile} />}
  </StrictMode>,
)
