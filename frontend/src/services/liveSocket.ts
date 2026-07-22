/**
 * Live candle WebSocket client with auto-reconnect.
 * Always sends both symbolId and timeframe on subscribe.
 */

export type LiveSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type LiveSocketHandlers = {
  symbolId: string
  timeframe: string
  onMessage: (message: Record<string, unknown>) => void
  onStatus: (status: LiveSocketStatus, message?: string) => void
}

export type LiveSocketHandle = {
  subscribe: (nextSymbolId: string, nextTimeframe: string) => void
  close: () => void
}

export function createLiveSocket({
  symbolId,
  timeframe,
  onMessage,
  onStatus,
}: LiveSocketHandlers): LiveSocketHandle {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${window.location.host}/ws/live`

  let currentSymbolId = symbolId
  let currentTimeframe = timeframe
  let ws: WebSocket | null = null
  let closedIntentionally = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  const BASE_DELAY_MS = 1000
  const MAX_DELAY_MS = 30000

  function clearReconnectTimer() {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function sendSubscribe(nextSymbolId: string, nextTimeframe: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!nextSymbolId) return
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        symbolId: nextSymbolId,
        timeframe: nextTimeframe,
      }),
    )
  }

  function scheduleReconnect() {
    if (closedIntentionally) return
    clearReconnectTimer()
    const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
    attempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function connect() {
    if (closedIntentionally) return

    clearReconnectTimer()
    try {
      ws = new WebSocket(url)
    } catch {
      onStatus('error')
      scheduleReconnect()
      return
    }

    onStatus('connecting')

    ws.onopen = () => {
      attempt = 0
      onStatus('connected')
      sendSubscribe(currentSymbolId, currentTimeframe)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>
        if (message.type === 'error') {
          onStatus('error', String(message.message ?? ''))
          return
        }
        onMessage(message)
      } catch {
        onStatus('error')
      }
    }

    ws.onerror = () => {
      onStatus('error')
    }

    ws.onclose = () => {
      ws = null
      if (closedIntentionally) {
        onStatus('disconnected')
        return
      }
      onStatus('disconnected')
      scheduleReconnect()
    }
  }

  connect()

  return {
    subscribe(nextSymbolId: string, nextTimeframe: string) {
      currentSymbolId = nextSymbolId
      currentTimeframe = nextTimeframe
      sendSubscribe(currentSymbolId, currentTimeframe)
    },
    close() {
      closedIntentionally = true
      clearReconnectTimer()
      if (ws) {
        try {
          ws.close()
        } catch {
          // ignore
        }
        ws = null
      }
    },
  }
}
