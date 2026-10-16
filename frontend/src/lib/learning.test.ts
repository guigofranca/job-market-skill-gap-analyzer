import { describe, expect, it } from 'vitest'
import { learningLink } from './learning'

describe('learningLink', () => {
  it('returns the curated free course', () => {
    expect(learningLink('python')).toEqual({
      provider: 'Tutorial oficial (pt-BR)',
      url: 'https://docs.python.org/pt-br/3/tutorial/',
    })
  })

  it('returns nothing for skills without a course or for Object.prototype names', () => {
    expect(learningLink('plc')).toBeUndefined()
    expect(learningLink('constructor')).toBeUndefined()
  })
})
