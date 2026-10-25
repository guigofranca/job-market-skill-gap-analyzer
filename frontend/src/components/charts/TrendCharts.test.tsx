import { render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Trends } from '../../api/schemas'
import { useSkillColors } from '../../hooks/useSkillColors'
import { SkillTrendChart } from './TrendCharts'

const data: Trends = {
  days: [
    { day: '2026-10-15', jobs: 100 },
    { day: '2026-10-16', jobs: 100 },
  ],
  skills: [
    {
      slug: 'sql',
      name: 'SQL',
      category: 'linguagens',
      change: 0.02,
      points: [
        { day: '2026-10-15', count: 25, share: 0.25 },
        { day: '2026-10-16', count: 27, share: 0.27 },
      ],
    },
    {
      slug: 'python',
      name: 'Python',
      category: 'linguagens',
      change: -0.01,
      points: [
        { day: '2026-10-15', count: 20, share: 0.2 },
        { day: '2026-10-16', count: 19, share: 0.19 },
      ],
    },
  ],
  rising: [],
  falling: [],
}

describe('SkillTrendChart', () => {
  it('labels each line at its end with the latest share', () => {
    const colors = new Map([
      ['sql', 'var(--series-1)'],
      ['python', 'var(--series-2)'],
    ])
    render(<SkillTrendChart data={data} colors={colors} />)
    expect(screen.getByText('SQL').parentElement).toHaveTextContent('SQL27%')
    expect(screen.getByText('Python').parentElement).toHaveTextContent('Python19%')
  })
})

describe('useSkillColors', () => {
  it('keeps a skill’s color while it stays on the chart', () => {
    const { result, rerender } = renderHook(({ slugs }) => useSkillColors(slugs), {
      initialProps: { slugs: ['sql', 'python'] },
    })
    expect(result.current.get('python')).toBe('var(--series-2)')
    rerender({ slugs: ['excel', 'python'] })
    expect(result.current.get('python')).toBe('var(--series-2)')
    expect(result.current.get('excel')).toBe('var(--series-1)')
  })
})
