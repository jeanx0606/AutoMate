import assert from 'node:assert/strict'
import test from 'node:test'
import { canSavePlatformForm } from '../src/lib/platformForm.mjs'

test('no-auth Wi-Fi only needs a network name', () => {
  assert.equal(canSavePlatformForm({ type: 'network', wifiName: 'Campus', requiresAuth: false }), true)
  assert.equal(canSavePlatformForm({ type: 'network', wifiName: '', requiresAuth: false }), false)
})

test('no-auth webpage needs a name and URL but no credentials', () => {
  assert.equal(canSavePlatformForm({ type: 'web', name: 'Portal', url: 'https://example.com', requiresAuth: false }), true)
  assert.equal(canSavePlatformForm({ type: 'web', name: 'Portal', url: '', requiresAuth: false }), false)
})

test('authenticated platforms continue to require a valid credential source', () => {
  assert.equal(canSavePlatformForm({ type: 'web', name: 'Portal', url: 'https://example.com', account: '', password: '' }), false)
  assert.equal(canSavePlatformForm({ type: 'web', name: 'Portal', url: 'https://example.com', account: 'user', password: 'pass' }), true)
})