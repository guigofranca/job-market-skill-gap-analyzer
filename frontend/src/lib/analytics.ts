import type { BeforeSendEvent } from '@vercel/analytics'
import { PROFILE_PARAM } from './profileLink'

/**
 * Page views are counted by Vercel Web Analytics (no cookies). The skills of a shared profile link
 * (?perfil=python,sql) are taken out of the address first: the profile stays in this browser.
 */
export function withoutProfile(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url)
  url.searchParams.delete(PROFILE_PARAM)
  return { ...event, url: url.toString() }
}
