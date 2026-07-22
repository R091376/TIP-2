import { describe, expect, it } from 'vitest'
import { apiUrl, getApiBaseUrl, wsUrl } from './config'

describe('config (default empty base — local/Vite proxy)', () => {
  it('getApiBaseUrl is empty without VITE_API_BASE_URL', () => {
    // vitest does not set VITE_API_BASE_URL by default
    expect(getApiBaseUrl()).toBe('')
  })

  it('apiUrl keeps relative paths', () => {
    expect(apiUrl('/api/health')).toBe('/api/health')
    expect(apiUrl('api/health')).toBe('/api/health')
  })

  it('wsUrl ends with /ws/live', () => {
    expect(wsUrl('/ws/live').endsWith('/ws/live')).toBe(true)
  })
})
