/**
 * Session alert list helpers: append + trim with lifecycle-preserving pins.
 */

/** Max non-pinned alerts retained in the session feed. */
export const ALERTS_MAX = 150

export type AlertLike = {
  id?: string
  instanceId?: string
  stage?: string
  [key: string]: unknown
}

/** True when stage is expired (terminal session/max-duration outcome). */
export function isExpiredAlert(alert: AlertLike | null | undefined): boolean {
  return String(alert?.stage ?? '').toLowerCase() === 'expired'
}

/**
 * Alerts shown in the feed. Expired stages are kept (muted in UI).
 * Reserved for future filters (e.g. hide noise types) — currently identity.
 */
export function filterVisibleAlerts<T extends AlertLike>(
  list: T[] | null | undefined,
): T[] {
  if (!list?.length) return []
  return list
}

export type OverlayMemoryEntry = {
  instanceId?: string
  [key: string]: unknown
}

/**
 * Instance IDs that must never drop stages while the session is alive:
 * focused instance + any remembered per-series overlays.
 */
export function collectPinnedInstanceIds(
  focusedInstanceId: string | null | undefined,
  overlayMemory: Map<string, OverlayMemoryEntry> | null | undefined,
): string[] {
  const pinned = new Set<string>()
  if (focusedInstanceId) pinned.add(focusedInstanceId)
  if (overlayMemory) {
    for (const mem of overlayMemory.values()) {
      if (mem?.instanceId) pinned.add(mem.instanceId)
    }
  }
  return [...pinned]
}

/**
 * Keep list newest-first. Always retain every event for pinned instances;
 * fill remaining budget with other alerts up to max (pinned may exceed max).
 */
export function compactAlerts<T extends AlertLike>(
  list: T[] | null | undefined,
  { max = 150, pinnedInstanceIds = [] }: { max?: number; pinnedInstanceIds?: string[] } = {},
): T[] {
  if (!list?.length) return []
  const pinned = new Set(pinnedInstanceIds.filter(Boolean))
  const pinnedCount = list.reduce(
    (n, a) => n + (a.instanceId && pinned.has(a.instanceId) ? 1 : 0),
    0,
  )
  const budgetOthers = Math.max(0, max - pinnedCount)
  let others = 0
  const out: T[] = []
  for (const a of list) {
    if (a.instanceId && pinned.has(a.instanceId)) {
      out.push(a)
    } else if (others < budgetOthers) {
      out.push(a)
      others += 1
    }
  }
  return out
}

/** Prepend a new alert and compact. Dedupes by id. Keeps expired stages. */
export function appendAlert<T extends AlertLike>(
  prev: T[] | null | undefined,
  alert: T | null | undefined,
  opts: { max?: number; pinnedInstanceIds?: string[] } = {},
): T[] {
  if (!alert) return prev || []
  const prevList = prev || []
  const list = filterVisibleAlerts(prevList)
  if (list.some((a) => a.id === alert.id)) {
    return list.length === prevList.length ? prevList : list
  }
  return compactAlerts([alert, ...list], opts)
}
