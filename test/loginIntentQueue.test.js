const assert = require('node:assert/strict')
const test = require('node:test')
const { createLoginIntentQueue } = require('../electron/loginIntentQueue')

function makeQueue(ttlMs = 30000) {
  let nextId = 0
  return createLoginIntentQueue({ ttlMs, createId: () => `request-${++nextId}` })
}

test('selects the explicitly launched platform when auth URLs are identical', () => {
  const queue = makeQueue()
  const url = 'https://sso.example.edu/login'
  queue.enqueue('old-platform', url, 1000)
  queue.enqueue('new-platform', url, 1001)
  const candidates = [
    { id: 'old-platform', encryptedAccount: 'old' },
    { id: 'new-platform', encryptedAccount: 'new' }
  ]

  const first = queue.claim(url, candidates, 1002)
  const second = queue.claim(url, candidates, 1003)

  assert.deepEqual(first, { platform: candidates[0], requestId: 'request-1' })
  assert.deepEqual(second, { platform: candidates[1], requestId: 'request-2' })
})

test('expires stale intents and skips platforms that are not candidates', () => {
  const queue = makeQueue(100)
  const url = 'https://sso.example.edu/login'
  queue.enqueue('stale-platform', url, 1000)
  queue.enqueue('other-platform', url, 1100)

  const claimed = queue.claim(url, [{ id: 'other-platform' }], 1101)

  assert.equal(claimed.platform.id, 'other-platform')
  assert.equal(queue.claim(url, [{ id: 'stale-platform' }], 1102), null)
})

test('cancel removes only the matching launch intent', () => {
  const queue = makeQueue()
  const url = 'https://sso.example.edu/login'
  const first = queue.enqueue('same-platform', url, 1000)
  queue.enqueue('same-platform', url, 1001)
  queue.cancel(first)

  const claimed = queue.claim(url, [{ id: 'same-platform' }], 1002)
  assert.equal(claimed.requestId, 'request-2')
})
