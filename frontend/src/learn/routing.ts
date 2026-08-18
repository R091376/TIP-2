import type { LearnKind } from './types'

/** URL segment → internal kind. Only indicators | patterns | concepts are valid. */
export function parseLearnKind(param: string): LearnKind | null {
  if (param === 'indicators') return 'indicator'
  if (param === 'patterns') return 'pattern'
  if (param === 'concepts') return 'concept'
  return null
}

export function learnKindToPath(kind: LearnKind): 'indicators' | 'patterns' | 'concepts' {
  if (kind === 'indicator') return 'indicators'
  if (kind === 'concept') return 'concepts'
  return 'patterns'
}

export function learnTopicPath(kind: LearnKind, slug: string): string {
  return `/learn/${learnKindToPath(kind)}/${slug}`
}

/** Index path for the standalone Learn desk (public; no login required). */
export const LEARN_INDEX_PATH = '/learn'

/**
 * Map pre-standalone Learn URLs under /admin/learn → /learn, preserving topic.
 * Unknown trailing segments fall back to the Learn index.
 */
export function legacyAdminLearnToStandalone(pathname: string): string {
  const path = (pathname || '').split('?')[0] || ''
  if (path === '/admin/learn' || path === '/admin/learn/') {
    return LEARN_INDEX_PATH
  }
  const m = path.match(/^\/admin\/learn\/([^/]+)\/([^/]+)\/?$/)
  if (m) {
    return `/learn/${m[1]}/${m[2]}`
  }
  // e.g. /admin/learn/foo (incomplete) → index rather than chart catch-all
  if (path.startsWith('/admin/learn')) {
    return LEARN_INDEX_PATH
  }
  return path
}
