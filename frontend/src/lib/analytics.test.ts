import { describe, expect, it } from 'vitest'
import { withoutProfile } from './analytics'

describe('withoutProfile', () => {
  it('drops the profile of a shared link and keeps the rest of the address', () => {
    const event = withoutProfile({
      type: 'pageview',
      url: 'https://site.test/?aba=mercado&perfil=python,sql&area=dados',
    })
    expect(event).toEqual({ type: 'pageview', url: 'https://site.test/?aba=mercado&area=dados' })
  })

  it('leaves addresses without a profile alone', () => {
    const event = { type: 'pageview', url: 'https://site.test/?level=estagio' } as const
    expect(withoutProfile(event)).toEqual(event)
  })
})
