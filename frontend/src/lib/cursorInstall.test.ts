import { describe, expect, it } from 'vitest'
import { cursorInstallLink } from './cursorInstall'

describe('cursorInstallLink', () => {
  it('carries the server name and its address, in the format Cursor reads', () => {
    const link = new URL(cursorInstallLink('https://api.test/mcp'))
    expect(link.protocol).toBe('cursor:')
    expect(`${link.host}${link.pathname}`).toBe('anysphere.cursor-deeplink/mcp/install')
    expect(link.searchParams.get('name')).toBe('empregos')
    expect(JSON.parse(atob(link.searchParams.get('config') ?? ''))).toEqual({
      url: 'https://api.test/mcp',
    })
  })
})
