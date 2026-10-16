import { ExternalLink } from 'lucide-react'
import { learningLink } from '../../lib/learning'

/** "Aprender grátis: Microsoft Learn" for one skill (opens a new tab); nothing without a course. */
export function LearnLink({ slug, name }: { slug: string; name: string }) {
  const course = learningLink(slug)
  if (!course) return null
  return (
    <span className="text-muted text-xs">
      Aprender <span className="sr-only">{name} </span>grátis:{' '}
      <a
        href={course.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-accent inline-flex items-center gap-0.5 whitespace-nowrap hover:underline"
      >
        {course.provider}
        <ExternalLink aria-hidden className="size-3" />
        <span className="sr-only">(abre em nova aba)</span>
      </a>
    </span>
  )
}
