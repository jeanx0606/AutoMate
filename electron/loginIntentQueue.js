const { randomUUID } = require('crypto')

const DEFAULT_TTL_MS = 30000

function loginUrlKey(value) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname.replace(/\/$/, '') || '/'}`
  } catch (_) {
    return null
  }
}

function createLoginIntentQueue({ ttlMs = DEFAULT_TTL_MS, createId = randomUUID } = {}) {
  const pending = new Map()

  function enqueue(platformId, url, now = Date.now()) {
    const key = loginUrlKey(url)
    if (!key) return null
    const queue = (pending.get(key) || []).filter(intent => intent.expiresAt > now)
    const intent = { platformId, requestId: createId(), expiresAt: now + ttlMs }
    queue.push(intent)
    pending.set(key, queue)
    return { key, requestId: intent.requestId }
  }

  function cancel(token) {
    if (!token) return
    const queue = pending.get(token.key) || []
    const remaining = queue.filter(intent => intent.requestId !== token.requestId)
    if (remaining.length) pending.set(token.key, remaining)
    else pending.delete(token.key)
  }

  function claim(url, candidates, now = Date.now()) {
    const key = loginUrlKey(url)
    if (!key) return null
    const candidateIds = new Set(candidates.map(candidate => candidate.id))
    const queue = (pending.get(key) || []).filter(intent =>
      intent.expiresAt > now && candidateIds.has(intent.platformId)
    )
    const intent = queue.shift()
    if (queue.length) pending.set(key, queue)
    else pending.delete(key)
    if (!intent) return null
    return {
      platform: candidates.find(candidate => candidate.id === intent.platformId),
      requestId: intent.requestId
    }
  }

  return { enqueue, cancel, claim }
}

module.exports = { createLoginIntentQueue, loginUrlKey }
