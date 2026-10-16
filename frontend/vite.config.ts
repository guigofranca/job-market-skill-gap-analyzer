/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Injects a strict Content-Security-Policy into the production build only
 * (the dev server needs inline scripts for React Fast Refresh).
 * connect-src is limited to this origin plus the configured API origin.
 */
function contentSecurityPolicy(apiBaseUrl: string | undefined): Plugin {
  let apiOrigin = ''
  try {
    apiOrigin = apiBaseUrl ? new URL(apiBaseUrl).origin : ''
  } catch {
    apiOrigin = '' // invalid URL: the app shows a configuration error at runtime
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // chart libraries set inline style attributes
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')

  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_API_BASE_URL)],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      sourcemap: false,
      target: 'es2023',
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks: app deploys don't invalidate the cached libraries.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 3,
              },
              {
                name: 'charts',
                test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/,
                priority: 2,
              },
              // pdf.js stays out: it is only loaded when a visitor picks a CV file (dynamic import).
              { name: 'vendor', test: /node_modules[\\/](?!pdfjs-dist[\\/])/, priority: 1 },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'], // e2e/ runs under Playwright
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
    },
  }
})
