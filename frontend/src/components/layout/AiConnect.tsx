import { Bot, Check, Copy, X } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cursorInstallLink, MCP_SERVER_NAME as SERVER_NAME } from '../../lib/cursorInstall'
import { AiLogo, type AiApp } from './AiLogo'

/** The API's MCP server (POST only, no login): see the README's "Use com IA". */
const MCP_PATH = '/mcp'

/** Header buttons and the box's tabs, in this order. */
const APPS: readonly { id: AiApp; name: string }[] = [
  { id: 'chatgpt', name: 'ChatGPT' },
  { id: 'claude', name: 'Claude' },
  { id: 'cursor', name: 'Cursor' },
]

const EXAMPLES = [
  'Sei Python, SQL e Excel. Quais vagas de estágio em Dados no RJ combinam comigo?',
  'Vou colar meu currículo: para quais vagas eu já posso me candidatar?',
  'O que muda entre estágio e júnior em Desenvolvimento?',
] as const

const HEADER_ITEM =
  'text-header-ink hover:bg-header-line focus-visible:outline-header-eyebrow inline-flex items-center rounded-md transition-colors'

/**
 * Shows how to connect an AI assistant (ChatGPT, Claude, Cursor or any MCP client) to this
 * dashboard's data, so visitors can ask about the jobs in their own words. The header offers one
 * button per assistant, each opening the box on its steps. Nothing here talks to the assistant.
 */
export function AiConnect({ apiBaseUrl }: { apiBaseUrl: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [app, setApp] = useState<AiApp>('claude')
  const url = `${apiBaseUrl}${MCP_PATH}`

  const open = (next?: AiApp) => {
    if (next) setApp(next)
    dialog.current?.showModal()
  }

  return (
    <>
      <div className="border-header-line inline-flex items-center gap-0.5 rounded-lg border p-0.5">
        <button
          type="button"
          className={`${HEADER_ITEM} gap-1.5 px-2.5 py-1 text-sm font-medium whitespace-nowrap`}
          aria-haspopup="dialog"
          onClick={() => open()}
        >
          <Bot aria-hidden className="text-header-eyebrow size-4" />
          Usar com IA
        </button>
        <span aria-hidden className="bg-header-line mx-0.5 h-4 w-px" />
        {APPS.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            className={`${HEADER_ITEM} p-1.5`}
            aria-haspopup="dialog"
            aria-label={`Usar com ${name}`}
            title={name}
            onClick={() => open(id)}
          >
            <AiLogo app={id} className="size-4" />
          </button>
        ))}
      </div>

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
                Conecte seu assistente a estas vagas e pergunte do seu jeito. Ele consulta os mesmos
                dados deste painel, atualizados todo dia, e responde com os links das vagas.
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

          <AppTabs app={app} onChange={setApp} url={url} />

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

          <p className="text-muted text-xs">
            Outros apps que aceitam servidores MCP remotos por HTTP funcionam com o mesmo endereço.
            Sem cadastro aqui: a IA é a da sua própria conta. O servidor só lê as vagas públicas
            deste painel e recebe apenas o que a IA pede (competências, nível, estado…); a conversa
            fica entre você e a IA.
          </p>
        </div>
      </dialog>
    </>
  )
}

/**
 * WAI-ARIA tabs, one per assistant: one tab stop, arrow keys / Home / End move between tabs (and
 * activate them).
 */
function AppTabs({
  app,
  onChange,
  url,
}: {
  app: AiApp
  onChange: (app: AiApp) => void
  url: string
}) {
  const baseId = useId()
  const tabId = (id: AiApp) => `${baseId}-tab-${id}`
  const panelId = `${baseId}-panel`
  const refs = useRef<Partial<Record<AiApp, HTMLButtonElement | null>>>({})

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = APPS.findIndex(({ id }) => id === app)
    const moves: Partial<Record<string, number>> = {
      ArrowRight: (index + 1) % APPS.length,
      ArrowLeft: (index - 1 + APPS.length) % APPS.length,
      Home: 0,
      End: APPS.length - 1,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    const next = APPS[target]
    if (!next) return
    onChange(next.id)
    refs.current[next.id]?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Assistente"
        // Inset baseline and hidden sideways scroll, like the dashboard's tabs: on the narrowest
        // screens the tabs scroll instead of widening the box.
        className="flex overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none]"
      >
        {APPS.map(({ id, name }) => {
          const active = id === app
          return (
            <button
              key={id}
              ref={(element) => {
                refs.current[id] = element
              }}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={onKeyDown}
              // Phones split the width in three; wider screens keep the tabs to the left.
              className={`inline-flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-2 sm:gap-1.5 text-sm whitespace-nowrap transition-colors sm:flex-none sm:px-4 ${
                active
                  ? 'border-accent text-ink font-semibold'
                  : 'text-ink-2 hover:text-ink hover:border-line border-transparent'
              }`}
            >
              <AiLogo app={id} className="size-4 shrink-0" />
              {name}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(app)}>
        {app === 'chatgpt' ? (
          <ChatGptSteps url={url} />
        ) : app === 'claude' ? (
          <ClaudeSteps url={url} />
        ) : (
          <CursorSteps url={url} />
        )}
      </div>
    </div>
  )
}

function ChatGptSteps({ url }: { url: string }) {
  // ChatGPT keeps moving and renaming these menus, so the steps name what to look for.
  return (
    <div className="flex flex-col gap-3">
      <Steps>
        <li>
          No site <Term>chatgpt.com</Term>, ative o <Term>Modo de desenvolvedor</Term> nas
          Configurações.
        </li>
        <li>
          Na página de <Term>Plugins</Term> (em algumas versões, <Term>Apps</Term> ou{' '}
          <Term>Conectores</Term>), clique em <Term>+</Term> para adicionar um servidor MCP
          personalizado.
        </li>
        <li>
          Dê um nome (por exemplo, Empregos), cole o endereço abaixo, escolha{' '}
          <Term>sem autenticação</Term> e confirme o aviso.
          <CopyField label="Endereço do conector" value={url} />
        </li>
        <li>
          Numa conversa nova, ative o Empregos (digite <Term>@</Term> ou use o menu <Term>+</Term>)
          e pergunte.
        </li>
      </Steps>
      <Note>Precisa de um plano pago e funciona no site, não no app de celular.</Note>
    </div>
  )
}

function ClaudeSteps({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Steps>
        <li>
          No site ou no app do Claude, abra <Term>Configurações → Conectores</Term> e clique em{' '}
          <Term>Adicionar conector personalizado</Term>.
        </li>
        <li>
          Dê um nome (por exemplo, Empregos), cole o endereço abaixo e adicione, sem login.
          <CopyField label="Endereço do conector" value={url} />
        </li>
        <li>Numa conversa, ative o conector no menu de ferramentas e pergunte.</li>
      </Steps>
      <Note>Funciona também no plano gratuito, que aceita um conector personalizado.</Note>
      <details>
        <summary className="text-ink-2 hover:text-ink w-fit cursor-pointer text-sm font-medium transition-colors">
          No Claude Code (terminal)
        </summary>
        <CopyField
          label="Comando do Claude Code"
          value={`claude mcp add --transport http ${SERVER_NAME} ${url}`}
        />
      </details>
    </div>
  )
}

function CursorSteps({ url }: { url: string }) {
  const installLink = cursorInstallLink(url)
  const mcpJson = JSON.stringify({ mcpServers: { [SERVER_NAME]: { url } } }, null, 2)

  return (
    <Steps>
      <li>
        Com o Cursor instalado, clique abaixo: ele abre e pede para confirmar o servidor.
        {/* A button, not a link: the browser does not preview the cursor:// address. A mouse
            click lets go of the focus, so the ring does not stay on when the browser comes back
            from Cursor's prompt (the keyboard keeps it). */}
        <button
          type="button"
          className="btn mt-2 flex w-fit"
          onClick={(event) => {
            if (event.detail > 0) event.currentTarget.blur()
            window.location.href = installLink
          }}
        >
          <AiLogo app="cursor" className="size-4" />
          Adicionar ao Cursor
        </button>
      </li>
      <li>
        Se o botão não abrir o Cursor, adicione à mão no arquivo <Term>~/.cursor/mcp.json</Term>:
        <CopyField label="Configuração do Cursor" value={mcpJson} block />
      </li>
      <li>No chat do Cursor, pergunte: o agente usa as ferramentas do Empregos sozinho.</li>
    </Steps>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="text-ink-2 flex list-decimal flex-col gap-2 pl-5 text-sm">{children}</ol>
}

/** A menu, button or file name the reader looks for on screen. */
function Term({ children }: { children: ReactNode }) {
  return <span className="text-ink font-medium">{children}</span>
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-muted text-xs">{children}</p>
}

function CopyField({
  label,
  value,
  block = false,
}: {
  label: string
  value: string
  /** Multi-line code: the button moves up beside the label, so the code gets the full width. */
  block?: boolean
}) {
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

  const button = (
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
  )

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-end justify-between gap-2">
        <p className="text-ink-2 text-xs font-medium">{label}</p>
        {block && button}
      </div>
      <div
        className={`bg-surface-2 border-line flex items-start gap-2 rounded-lg border py-1.5 pl-3 ${block ? 'pr-3' : 'pr-1.5'}`}
      >
        <code
          ref={text}
          className="text-ink min-w-0 flex-1 py-1 font-mono text-sm break-all whitespace-pre-wrap"
        >
          {value}
        </code>
        {!block && button}
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
