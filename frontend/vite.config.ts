/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Origin of a configured URL, or '' when it is missing or invalid. */
function originOf(url: string | undefined): string {
  try {
    return url ? new URL(url).origin : ''
  } catch {
    return ''
  }
}

/**
 * Injects a strict Content-Security-Policy into the production build only
 * (the dev server needs inline scripts for React Fast Refresh).
 * connect-src is limited to this origin plus the configured API origin.
 */
function contentSecurityPolicy(apiBaseUrl: string | undefined): Plugin {
  const apiOrigin = originOf(apiBaseUrl) // invalid URL: the app shows a configuration error
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

/**
 * Link-preview crawlers need absolute URLs, so og:url and og:image are only emitted when the
 * site's address is known: VITE_SITE_URL, or the production domain Vercel sets at build time.
 */
function socialPreview(siteUrl: string | undefined): Plugin {
  const origin = originOf(siteUrl) // invalid URL: previews fall back to title and description
  const tags = origin
    ? [
        { property: 'og:url', content: `${origin}/` },
        { property: 'og:image', content: `${origin}/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        {
          property: 'og:image:alt',
          content: 'Skill Gap Analyzer: competências mais pedidas em vagas de Estágio e Júnior',
        },
      ]
    : []

  return {
    name: 'social-preview',
    apply: 'build',
    transformIndexHtml: () => tags.map((attrs) => ({ tag: 'meta', attrs, injectTo: 'head' })),
  }
}

/**
 * Opens the API connection (DNS, TCP, TLS) while the scripts download, not after they run.
 * crossorigin: the dashboard's fetches are CORS requests without credentials.
 */
function apiPreconnect(apiBaseUrl: string | undefined): Plugin {
  const apiOrigin = originOf(apiBaseUrl)
  return {
    name: 'api-preconnect',
    apply: 'build',
    transformIndexHtml: () =>
      apiOrigin
        ? [
            {
              tag: 'link',
              attrs: { rel: 'preconnect', href: apiOrigin, crossorigin: true },
              injectTo: 'head',
            },
          ]
        : [],
  }
}

/**
 * Preloads the Latin subset of Geist, which every page is set in. Otherwise the font is only
 * requested once the stylesheet is parsed, and its late swap shifts the layout.
 */
function fontPreload(): Plugin {
  let base = '/'
  return {
    name: 'font-preload',
    apply: 'build',
    configResolved: (config) => {
      base = config.base
    },
    transformIndexHtml: (_, ctx) =>
      Object.keys(ctx.bundle ?? {})
        .filter((fileName) => /geist-latin-wght-normal-[\w-]+\.woff2$/.test(fileName))
        .map((fileName) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: `${base}${fileName}`,
            as: 'font',
            type: 'font/woff2',
            crossorigin: true, // fonts are always fetched in CORS mode
          },
          injectTo: 'head',
        })),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const siteUrl = env.VITE_SITE_URL || (vercelDomain ? `https://${vercelDomain}` : undefined)

  return {
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicy(env.VITE_API_BASE_URL),
      socialPreview(siteUrl),
      apiPreconnect(env.VITE_API_BASE_URL),
      fontPreload(),
    ],
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
                // Only the lazy-loaded market tab imports it, so it is not fetched on first load.
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
