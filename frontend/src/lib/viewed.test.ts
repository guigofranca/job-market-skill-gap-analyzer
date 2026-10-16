import { describe, expect, it } from 'vitest'
import { formatViewed, MAX_VIEWED, parseViewed, withViewed } from './viewed'

const now = new Date('2026-10-15T12:00:00Z')
const id = (n: number) => n.toString(16).padStart(16, '0')

describe('viewed postings', () => {
  it('drops invalid and expired entries from storage', () => {
    expect(
      parseViewed(
        {
          [id(1)]: '2026-10-15T10:00:00.000Z',
          [id(2)]: '2026-09-01T10:00:00.000Z', // older than 30 days
          'not-an-id': '2026-10-15T10:00:00.000Z',
          [id(3)]: 'ontem',
        },
        now,
      ),
    ).toEqual({ [id(1)]: '2026-10-15T10:00:00.000Z' })
    expect(parseViewed(['a'], now)).toEqual({})
    expect(parseViewed(null, now)).toEqual({})
  })

  it('records the latest opening and keeps only the most recent ones', () => {
    let viewed = {}
    for (let n = 0; n <= MAX_VIEWED; n += 1) {
      viewed = withViewed(viewed, id(n), new Date(now.getTime() + n * 1000))
    }
    expect(Object.keys(viewed)).toHaveLength(MAX_VIEWED)
    expect(viewed).not.toHaveProperty(id(0))

    const again = withViewed(viewed, id(5), new Date(now.getTime() + 999_000))
    expect(Object.keys(again)[0]).toBe(id(5))
  })

  it('says how long ago', () => {
    expect(formatViewed('2026-10-15T11:58:00Z', now)).toBe('vista agora')
    expect(formatViewed('2026-10-15T09:00:00Z', now)).toBe('vista há 3 horas')
    expect(formatViewed('2026-10-14T10:00:00Z', now)).toBe('vista ontem')
  })
})
