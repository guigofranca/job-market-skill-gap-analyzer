import { Moon, Sun } from 'lucide-react'
import type { Meta } from '../../api/schemas'
import { AUTHOR } from '../../config/author'
import { getConfig } from '../../config/env'
import type { Theme } from '../../hooks/useTheme'
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  isStale,
} from '../../lib/format'
import { AiConnect } from './AiConnect'

/** The favicon's bar chart, in the brand color. */
function LogoMark() {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-5 shrink-0">
      <rect width="32" height="32" rx="7" className="fill-logo" />
      <rect x="7" y="17" width="4" height="8" rx="1.5" className="fill-on-logo" />
      <rect x="14" y="11" width="4" height="14" rx="1.5" className="fill-on-logo" />
      <rect x="21" y="7" width="4" height="18" rx="1.5" className="fill-on-logo" />
    </svg>
  )
}

const HEADER_BUTTON =
  'border-header-line text-header-ink hover:border-header-eyebrow focus-visible:outline-header-eyebrow inline-flex items-center gap-1.5 rounded-lg border transition-colors'

export function Header({
  meta,
  loading,
  theme,
  onToggleTheme,
}: {
  meta: Meta | undefined
  loading: boolean
  theme: Theme
  onToggleTheme: () => void
}) {
  return (
    <header className="border-header-line bg-header border-b">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="min-w-0">
          <p className="text-header-eyebrow flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
            <LogoMark />
            Empregos e Tendências
          </p>
          <h1 className="text-header-ink mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            O que o mercado pede em vagas de Estágio e Júnior
          </h1>
          <p className="text-header-muted mt-1 text-sm">
            Dados, Automação, Desenvolvimento e Infraestrutura ·{' '}
            {meta ? (
              <>
                {formatNumber(meta.total_jobs)} vagas reais
                {meta.period_start && meta.period_end && (
                  <>
                    {' '}
                    publicadas entre {formatDate(meta.period_start)} e {formatDate(meta.period_end)}
                  </>
                )}{' '}
                ·{' '}
                <time dateTime={meta.generated_at} title={formatDateTime(meta.generated_at)}>
                  atualizado {formatRelativeTime(meta.generated_at)}
                </time>
                {isStale(meta.generated_at) && (
                  <span className="text-header-danger font-medium">
                    {' '}
                    · dados desatualizados: algumas vagas podem ter encerrado
                  </span>
                )}
              </>
            ) : loading ? (
              <>
                carregando dados…
                {/* Reserves the loaded line's wrapping, so the page does not jump when it arrives. */}
                <span className="invisible">
                  {' '}
                  publicadas entre 00/00/0000 e 00/00/0000 · atualizado há 00 horas
                </span>
              </>
            ) : (
              'dados indisponíveis no momento'
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <AiConnect apiBaseUrl={getConfig().apiBaseUrl} />
            <span className="text-header-muted text-xs max-sm:hidden">
              Pergunte à sua IA sobre estas vagas
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className={`${HEADER_BUTTON} p-2`}
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          >
            {theme === 'dark' ? (
              <Sun aria-hidden className="size-4" />
            ) : (
              <Moon aria-hidden className="size-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="border-line text-muted mt-8 border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-xs sm:px-6">
        <p className="text-ink-2 text-sm">
          Feito por{' '}
          <a
            className="text-ink hover:text-accent font-medium underline-offset-2 hover:underline"
            href={AUTHOR.linkedin}
            target="_blank"
            rel="me noopener noreferrer"
          >
            {AUTHOR.handle}
          </a>{' '}
          ·{' '}
          <a
            className="hover:text-ink underline"
            href={AUTHOR.repo}
            target="_blank"
            rel="noopener noreferrer"
          >
            código aberto no GitHub
          </a>
        </p>
        <p>
          Fontes: vagas públicas publicadas no Brasil pela{' '}
          <a
            className="hover:text-ink underline"
            href="https://portal.gupy.io"
            target="_blank"
            rel="noopener noreferrer"
          >
            Gupy
          </a>{' '}
          e{' '}
          <a
            className="hover:text-ink underline"
            href="https://vagas.solides.com.br"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sólides
          </a>
          . Cada vaga aponta para o anúncio original.
        </p>
        <p>
          Projeto educacional e de portfólio. Competências extraídas por palavras-chave: os números
          indicam tendência, não verdade absoluta.
        </p>
        <p>
          Sugestões, erros ou pedido de remoção de dados:{' '}
          <a
            className="hover:text-ink underline"
            href={`${AUTHOR.repo}/issues/new`}
            target="_blank"
            rel="noopener noreferrer"
          >
            abra uma issue no GitHub
          </a>
          .
        </p>
      </div>
    </footer>
  )
}
