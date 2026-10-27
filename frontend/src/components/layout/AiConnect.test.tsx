import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AiConnect } from './AiConnect'

const MCP_URL = 'https://api.test/mcp'

function openBox() {
  render(<AiConnect apiBaseUrl="https://api.test" buttonClassName="" />)
  fireEvent.click(screen.getByRole('button', { name: 'Usar com IA' }))
  return screen.getByRole('dialog', { name: 'Use com IA' })
}

describe('AiConnect', () => {
  it('opens a box with the MCP address and how to connect', () => {
    const box = openBox()
    expect(box).toHaveAttribute('open')
    expect(within(box).getByText(MCP_URL)).toBeInTheDocument()
    expect(
      within(box).getByText(`claude mcp add --transport http empregos ${MCP_URL}`),
    ).toBeInTheDocument()
    expect(within(box).getByText(/Adicionar conector personalizado/)).toBeInTheDocument()

    fireEvent.click(within(box).getByRole('button', { name: 'Fechar' }))
    expect(box).not.toHaveAttribute('open')
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
