import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearTrialAccess,
  getAccessToken,
  getTrialAccess,
  storeTrialAccess,
} from '../src/utils/accessToken.js'

class LocalStorageMock {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }

  removeItem(key) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

globalThis.localStorage = new LocalStorageMock()

test.beforeEach(() => {
  localStorage.clear()
})

test('stores and returns a valid anonymous trial pass', () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString()
  storeTrialAccess({
    accessToken: 'trial-token',
    expiresAt,
    durationLabel: '3-day trial',
  })

  assert.equal(getAccessToken(), 'trial-token')
  assert.deepEqual(getTrialAccess(), {
    token: 'trial-token',
    expiresAt,
    durationLabel: '3-day trial',
  })
})

test('removes an expired trial pass', () => {
  storeTrialAccess({
    accessToken: 'expired-token',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    durationLabel: 'expired',
  })

  assert.equal(getTrialAccess(), null)
  assert.equal(getAccessToken(), null)
})

test('uses an administrator token instead of a trial pass', () => {
  storeTrialAccess({
    accessToken: 'trial-token',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    durationLabel: 'trial',
  })
  localStorage.setItem('token', 'admin-token')
  localStorage.setItem('user', JSON.stringify({ role: 'admin' }))

  assert.equal(getAccessToken(), 'admin-token')

  clearTrialAccess()
  assert.equal(getAccessToken(), 'admin-token')
})
