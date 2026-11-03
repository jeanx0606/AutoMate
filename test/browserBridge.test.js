const assert = require('node:assert/strict')
const test = require('node:test')
const { createBrowserBridge } = require('../electron/browserBridge')

test('browser bridge self-unpairs when a paired origin sends an invalid token', async () => {
  const data = new Map()
  const store = {
    get: (key, fallback) => data.has(key) ? data.get(key) : fallback,
    set: (key, value) => data.set(key, value),
    delete: key => data.delete(key)
  }
  const origin = `chrome-extension://${'a'.repeat(32)}`
  const bridge = createBrowserBridge({ store, getPlatforms: () => [], port: 0 })

  await bridge.listen()
  try {
    const pairRes = await fetch(`http://127.0.0.1:${bridge.port}/pair`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: store.get('browserExtensionPairToken') })
    })
    const pairBody = await pairRes.json()
    assert.equal(pairRes.status, 200)
    assert.equal(store.get('browserExtensionOrigin'), origin)

    const staleRes = await fetch(`http://127.0.0.1:${bridge.port}/status`, {
      method: 'GET',
      headers: { Origin: origin, 'X-AutoMate-Token': 'stale-token' }
    })
    assert.equal(staleRes.status, 403)

    assert.equal(store.get('browserExtensionOrigin', ''), '')
    assert.equal(store.get('browserExtensionLastVerified', ''), '')
    assert.match(bridge.getPairingStatus().error, /扩展会话已失效/)
  } finally {
    bridge.close()
  }
})

test('browser bridge does not self-unpair for an unknown origin', async () => {
  const data = new Map()
  const store = {
    get: (key, fallback) => data.has(key) ? data.get(key) : fallback,
    set: (key, value) => data.set(key, value),
    delete: key => data.delete(key)
  }
  const pairedOrigin = `chrome-extension://${'a'.repeat(32)}`
  const unknownOrigin = `chrome-extension://${'b'.repeat(32)}`
  const bridge = createBrowserBridge({ store, getPlatforms: () => [], port: 0 })

  await bridge.listen()
  try {
    await fetch(`http://127.0.0.1:${bridge.port}/pair`, {
      method: 'POST',
      headers: { Origin: pairedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: store.get('browserExtensionPairToken') })
    })
    assert.equal(store.get('browserExtensionOrigin'), pairedOrigin)

    const res = await fetch(`http://127.0.0.1:${bridge.port}/status`, {
      method: 'GET',
      headers: { Origin: unknownOrigin, 'X-AutoMate-Token': 'whatever' }
    })
    assert.equal(res.status, 403)
    assert.equal(store.get('browserExtensionOrigin'), pairedOrigin)
  } finally {
    bridge.close()
  }
})