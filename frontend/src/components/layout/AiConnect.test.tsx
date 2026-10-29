import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AiConnect } from './AiConnect'

const MCP_URL = 'https://api.test/mcp'

function openBox(button = 'Usar com IA') {
  render(<AiConnect apiBaseUrl="https://api.test" />)
  fireEvent.click(screen.getByRole('button', { name: button }))
  return screen.getByRole('dialog', { name: 'Use com IA' })
}

describe('AiConnect', () => {
  it('opens a box with the MCP address and how to connect Claude', () => {
    const box = openBox()
    expect(box).toHaveAttribute('open')
    expect(within(box).getByRole('tab', { name: 'Claude' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(box).getByText(MCP_URL)).toBeInTheDocument()
    expect(
      within(box).getByText(`claude mcp add --transport http empregos ${MCP_URL}`),
    ).toBeInTheDocument()
    expect(within(box).getByText(/Adicionar conector personalizado/)).toBeInTheDocument()

    fireEvent.click(within(box).getByRole('button', { name: 'Fechar' }))
    expect(box).not.toHaveAttribute('open')
  })

  it('opens on the steps of the assistant whose logo was clicked', () => {
    const box = openBox('Usar com ChatGPT')
    const tab = within(box).getByRole('tab', { name: 'ChatGPT' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(within(box).getByRole('tabpanel', { name: 'ChatGPT' })).toHaveTextContent(
      /Modo de desenvolvedor/,
    )
    expect(within(box).getByText(MCP_URL)).toBeInTheDocument()
  })

  it('moves between assistants with the arrow keys', () => {
    const box = openBox()
    fireEvent.keyDown(within(box).getByRole('tab', { name: 'Claude' }), { key: 'ArrowRight' })
    const cursor = within(box).getByRole('tab', { name: 'Cursor' })
    expect(cursor).toHaveAttribute('aria-selected', 'true')
    expect(cursor).toHaveFocus()
    fireEvent.keyDown(cursor, { key: 'ArrowRight' })
    expect(within(box).getByRole('tab', { name: 'ChatGPT' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('gives Cursor an install button and the mcp.json entry for the same address', () => {
    // The link itself is covered by cursorInstall.test.ts (clicking would navigate away).
    const box = openBox('Usar com Cursor')
    expect(within(box).getByRole('button', { name: 'Adicionar ao Cursor' })).toBeInTheDocument()

    const config = within(box).getByText(/mcpServers/)
    expect(JSON.parse(config.textContent ?? '')).toEqual({
      mcpServers: { empregos: { url: MCP_URL } },
    })
  })

  it('copies the address', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    const box = openBox()
    fireEvent.click(within(box).getByRole('button', { name: 'Copiar endereço do conector' }))
    expect(await within(box).findByText('Copiado!')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(MCP_URL)
  })

  it('selects the address to copy by hand when the clipboard is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined })
    const box = openBox()
    fireEvent.click(within(box).getByRole('button', { name: 'Copiar endereço do conector' }))
    expect(await within(box).findByText(/Texto selecionado/)).toBeInTheDocument()
    expect(window.getSelection()?.toString()).toBe(MCP_URL)
  })
})
