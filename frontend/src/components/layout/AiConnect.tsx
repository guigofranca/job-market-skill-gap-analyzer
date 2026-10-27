import { Bot, Check, Copy, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'

/** The API's MCP server (POST only, no login): see the README's "Use com IA". */
const MCP_PATH = '/mcp'

const EXAMPLES = [
  'Sei Python, SQL e Excel. Quais vagas de estágio em Dados no RJ combinam comigo?',
  'Vou colar meu currículo: para quais vagas eu já posso me candidatar?',
  'O que muda entre estágio e júnior em Desenvolvimento?',
] as const

/**
 * Shows how to connect an AI assistant (Claude, or any MCP client) to this dashboard's data, so
 * visitors can ask about the jobs in their own words. Nothing here talks to the assistant.
 */
export function AiConnect({
  apiBaseUrl,
  buttonClassName,
}: {
  apiBaseUrl: string
  buttonClassName: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const url = `${apiBaseUrl}${MCP_PATH}`

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Bot aria-hidden className="text-header-eyebrow size-4" />
        Usar com IA
      </button>

      {/* Native modal: it traps focus, closes with Esc and gives focus back to the button. */}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="bg-surface text-ink border-line m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overscroll-contain rounded-xl border p-0 shadow-xl backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                Use com IA
              </h2>
              <p className="text-ink-2 mt-1 text-sm">
                Conecte o Claude (ou outro assistente compatível com MCP) a estas vagas e pergunte
                do seu jeito. Ele consulta os mesmos dados deste painel, atualizados todo dia, e
                responde com os links das vagas.
              </p>
            </div>
            <button
              type="button"
              className="text-muted hover:text-ink -m-1 shrink-0 rounded-md p-1 transition-colors"
              aria-label="Fechar"
              onClick={() => dialog.current?.close()}
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <CopyField label="Endereço do conector" value={url} />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">No Claude (site ou app)</h3>
            <ol className="text-ink-2 flex list-decimal flex-col gap-1 pl-5 text-sm">
              <li>
                Em <span className="text-ink font-medium">Configurações → Conectores</span>, clique
                em <span className="text-ink font-medium">Adicionar conector personalizado</span>.
              </li>
              <li>
                Dê um nome (por exemplo, Empregos), cole o endereço acima e adicione, sem login.
              </li>
              <li>Numa conversa, ative o conector no menu de ferramentas e pergunte.</li>
            </ol>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Experimente perguntar</h3>
            <ul className="flex flex-col gap-1.5">
              {EXAMPLES.map((example) => (
                <li key={example} className="bg-surface-2 text-ink-2 rounded-lg px-3 py-2 text-sm">
                  “{example}”
                </li>
              ))}
            </ul>
          </section>

          <details>
            <summary className="text-ink-2 hover:text-ink w-fit cursor-pointer text-sm font-medium transition-colors">
              Claude Code, Cursor e outros apps
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-ink-2 text-sm">
                Qualquer app que aceite servidores MCP remotos por HTTP funciona com o mesmo
                endereço, sem autenticação. No Claude Code, rode:
              </p>
              <CopyField
                label="Comando do Claude Code"
                value={`claude mcp add --transport http empregos ${url}`}
              />
            </div>
          </details>

          <p className="text-muted text-xs">
            Sem cadastro aqui: a IA é a da sua própria conta. O servidor só lê as vagas públicas
            deste painel e recebe apenas o que a IA pede (competências, nível, estado…); a conversa
            fica entre você e a IA.
          </p>
        </div>
      </dialog>
    </>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const text = useRef<HTMLElement>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 3000)
    } catch {
      // No clipboard access (old browser, denied permission): select the text to copy by hand.
      if (text.current) window.getSelection()?.selectAllChildren(text.current)
      setStatus('manual')
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-ink-2 text-xs font-medium">{label}</p>
      <div className="bg-surface-2 border-line flex items-start gap-2 rounded-lg border py-1.5 pr-1.5 pl-3">
        <code ref={text} className="min-w-0 flex-1 py-1 font-mono text-sm break-all">
          {value}
        </code>
        <button
          type="button"
          className="btn shrink-0 px-2.5 py-1"
          aria-label={`Copiar ${label.toLowerCase()}`}
          onClick={() => void copy()}
        >
          {status === 'copied' ? (
            <Check aria-hidden className="text-success size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          Copiar
        </button>
      </div>
      <output className="text-ink-2 text-xs empty:hidden">
        {status === 'copied'
          ? 'Copiado!'
          : status === 'manual'
            ? 'Texto selecionado: copie com Ctrl+C (no celular, toque e segure).'
            : ''}
      </output>
    </div>
  )
}
