import { describe, expect, it } from 'vitest'
import { assignSlots, spreadLabels } from './chartData'

describe('assignSlots', () => {
  it('keeps the slot of every series that stays, newcomers take the lowest free one', () => {
    const first = assignSlots(['sql', 'python', 'excel'], new Map())
    expect([...first]).toEqual([
      ['sql', 0],
      ['python', 1],
      ['excel', 2],
    ])
    // Python leaves and Power BI arrives (and SQL drops in rank): nobody is repainted.
    const next = assignSlots(['excel', 'power-bi', 'sql'], first)
    expect(next.get('sql')).toBe(0)
    expect(next.get('excel')).toBe(2)
    expect(next.get('power-bi')).toBe(1)
  })
})

describe('spreadLabels', () => {
  it('leaves labels that do not collide where they are', () => {
    expect(spreadLabels([10, 50, 90], 16, 200)).toEqual([10, 50, 90])
  })

  it('pushes colliding labels apart, keeping their order', () => {
    const [a, b, c] = spreadLabels([100, 102, 104], 16, 200)
    expect(a).toBe(100)
    expect(b).toBe(116)
    expect(c).toBe(132)
  })

  it('stays inside the chart, walking back up from the bottom', () => {
    const placed = spreadLabels([195, 198, 199], 16, 200)
    expect(placed).toEqual([168, 184, 200])
  })
})
