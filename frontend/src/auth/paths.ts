const PRIVATE_PREFIXES = ['/paper', '/admin'] as const
const PUBLIC_DESK_PREFIXES = ['/patterns', '/learn'] as const

export function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isPrivatePath(pathname: string): boolean {
  const p = pathname || '/'
  return PRIVATE_PREFIXES.some((pre) => pathMatchesPrefix(p, pre))
}

/** Allowlisted in-app next; default "/". Strings only — objects are invalid. */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  const path = raw.trim()
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  if (path.startsWith('/login')) return '/'
  const pathname = path.split('?')[0].split('#')[0]
  const allowed =
    pathname === '/' ||
    isPrivatePath(pathname) ||
    PUBLIC_DESK_PREFIXES.some((pre) => pathMatchesPrefix(pathname, pre))
  return allowed ? path : '/'
}

/**
 * Query `next` wins. `state.from` may be a string (this design) or a
 * location object (legacy RequireAuth). Never pass the object to safeNextPath.
 */
export function resolveLoginNext(
  searchNext: string | null | undefined,
  stateFrom: unknown,
): string {
  if (searchNext) return safeNextPath(searchNext)
  if (typeof stateFrom === 'string') return safeNextPath(stateFrom)
  if (stateFrom && typeof stateFrom === 'object' && 'pathname' in (stateFrom as object)) {
    const loc = stateFrom as { pathname?: unknown; search?: unknown }
    const pathname = typeof loc.pathname === 'string' ? loc.pathname : ''
    const search = typeof loc.search === 'string' ? loc.search : ''
    return safeNextPath(`${pathname}${search}`)
  }
  return '/'
}

export function loginUrl(nextPathAndSearch: string): string {
  const next = safeNextPath(nextPathAndSearch)
  if (next === '/') return '/login'
  return `/login?next=${encodeURIComponent(next)}`
}

export function logoutTarget(pathname: string): string {
  return isPrivatePath(pathname) ? '/' : ''
}
