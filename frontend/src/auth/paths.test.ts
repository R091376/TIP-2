import { describe, expect, it } from 'vitest'
import {
  isPrivatePath,
  loginUrl,
  logoutTarget,
  resolveLoginNext,
  safeNextPath,
} from './paths'

describe('isPrivatePath', () => {
  it('matches paper and admin prefixes, not public desk', () => {
    expect(isPrivatePath('/paper')).toBe(true)
    expect(isPrivatePath('/paper/orders')).toBe(true)
    expect(isPrivatePath('/admin/users')).toBe(true)
    expect(isPrivatePath('/')).toBe(false)
    expect(isPrivatePath('/patterns/stats')).toBe(false)
    expect(isPrivatePath('/learn/x')).toBe(false)
    expect(isPrivatePath('/paperxyz')).toBe(false)
    expect(isPrivatePath('/administration')).toBe(false)
  })
})

describe('safeNextPath', () => {
  it('keeps allowlisted in-app paths and query', () => {
    expect(safeNextPath('/paper')).toBe('/paper')
    expect(safeNextPath('/paper/orders?x=1')).toBe('/paper/orders?x=1')
    expect(safeNextPath('/')).toBe('/')
    expect(safeNextPath('/patterns/stats')).toBe('/patterns/stats')
    expect(safeNextPath('/learn')).toBe('/learn')
  })

  it('rejects open redirects and lookalike prefixes', () => {
    expect(safeNextPath('/paperxyz')).toBe('/')
    expect(safeNextPath('/administration')).toBe('/')
    expect(safeNextPath('https://evil.com')).toBe('/')
    expect(safeNextPath('//evil.com')).toBe('/')
    expect(safeNextPath('/login')).toBe('/')
    expect(safeNextPath('/login?next=/paper')).toBe('/')
    expect(safeNextPath({ pathname: '/paper' })).toBe('/')
  })
})

describe('resolveLoginNext', () => {
  it('query wins; location object is a fallback only', () => {
    expect(resolveLoginNext('/paper', { pathname: '/' })).toBe('/paper')
    expect(resolveLoginNext(null, { pathname: '/paper', search: '' })).toBe('/paper')
    expect(resolveLoginNext(null, { pathname: '/paper', search: '?x=1' })).toBe('/paper?x=1')
    expect(resolveLoginNext(undefined, '/learn')).toBe('/learn')
  })
})

describe('loginUrl / logoutTarget', () => {
  it('encodes next and omits it for charts', () => {
    expect(loginUrl('/paper')).toBe('/login?next=%2Fpaper')
    expect(loginUrl('/')).toBe('/login')
  })

  it('logout from private goes home; public stays', () => {
    expect(logoutTarget('/paper')).toBe('/')
    expect(logoutTarget('/')).toBe('')
  })
})
