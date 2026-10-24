import { describe, expect, it } from 'vitest'
import { parseProfileParam, profileLink, withoutProfileParam } from './profileLink'

describe('profile links', () => {
  it('reads the skills of a shared profile, dropping invalid values and duplicates', () => {
    expect(parseProfileParam('?perfil=python,sql,python')).toEqual(['python', 'sql'])
    expect(parseProfileParam('?perfil=Python,%3Cscript%3E')).toEqual(['python'])
    expect(parseProfileParam('?perfil=')).toBeNull()
    expect(parseProfileParam('?level=estagio')).toBeNull()
  })

  it('keeps the filters and the tab of the page in the link', () => {
    expect(profileLink('https://site.example/?level=estagio#x', ['sql', 'power-bi'])).toBe(
      'https://site.example/?level=estagio&perfil=sql%2Cpower-bi',
    )
  })

  it('removes only the profile from the address', () => {
    expect(withoutProfileParam('?level=estagio&perfil=sql')).toBe('?level=estagio')
    expect(withoutProfileParam('?perfil=sql')).toBe('')
  })
})
