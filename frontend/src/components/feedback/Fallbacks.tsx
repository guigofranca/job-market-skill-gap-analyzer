import { AlertOctagon, RotateCw } from 'lucide-react'
import { ConfigError } from '../../config/env'

/** Whole-app fallback (root boundary). Configuration errors get actionable instructions. */
export function AppFallback({ error, reset }: { error: Error; reset: () => void }) {
  const isConfig = error instanceof ConfigError
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <AlertOctagon aria-hidden className="text-danger size-8" />
      <h1 className="text-2xl font-semibold">
        {isConfig ? 'Configuração do frontend inválida' : 'O painel encontrou um erro inesperado'}
      </h1>
      {isConfig ? (
        <>
          <p className="text-ink-2">
            Crie o arquivo <code>frontend/.env.local</code> a partir de <code>.env.example</code> e
            reinicie o servidor de desenvolvimento.
          </p>
          <ul className="text-ink-2 list-disc pl-5 text-sm">
            {error.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-ink-2">
          Tente recarregar. Se o problema continuar, verifique o console do navegador.
        </p>
      )}
      {!isConfig && (
        <button type="button" className="btn self-start" onClick={reset}>
          <RotateCw aria-hidden className="size-4" />
          Recarregar painel
        </button>
      )}
    </main>
  )
}

/** Fallback for one dashboard section: the rest of the page keeps working. */
export function SectionFallback({ title, reset }: { title: string; reset: () => void }) {
  return (
    <section className="card flex flex-col items-center gap-3 p-6 text-center" role="alert">
      <AlertOctagon aria-hidden className="text-danger size-5" />
      <p className="text-ink-2 text-sm">
        A seção <strong className="text-ink">{title}</strong> não pôde ser exibida.
      </p>
      <button type="button" className="btn" onClick={reset}>
        <RotateCw aria-hidden className="size-4" />
        Tentar novamente
      </button>
    </section>
  )
}
