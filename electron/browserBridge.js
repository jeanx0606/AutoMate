const http = require('http')
const crypto = require('crypto')

const PORT = 32147
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/

function sendJson(response, statusCode, payload, origin) {
  if (origin && EXTENSION_ORIGIN_PATTERN.test(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.writeHead(statusCode)
  response.end(JSON.stringify(payload))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', chunk => {
      body += chunk
      if (body.length > 16384) {
        reject(new Error('Request too large'))
        request.destroy()
      }
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch (_) {
        reject(new Error('Invalid JSON'))
      }
    })
    request.on('error', reject)
  })
}

function getPairToken(store) {
  const existingToken = store.get('browserExtensionPairToken', '')
  if (existingToken) return existingToken
  const token = crypto.randomBytes(32).toString('hex')
  store.set('browserExtensionPairToken', token)
  return token
}

function regeneratePairToken(store) {
  const token = crypto.randomBytes(32).toString('hex')
  store.set('browserExtensionPairToken', token)
  return token
}

function createBrowserBridge({ store, getPlatforms, getPlatformForUrl, decrypt, getCredentials, onLoginResult, port = PORT }) {
  getPairToken(store)
  const extensionSessions = new Map(Object.entries(store.get('browserExtensionSessions', {})))
  let lastPairingError = ''
  let lastPairingAttempt = null

  function persistExtensionSessions() {
    store.set('browserExtensionSessions', Object.fromEntries(extensionSessions))
  }

  function getCurrentPairToken() {
    return store.get('browserExtensionPairToken', '') || getPairToken(store)
  }

  function unpair() {
    store.delete('browserExtensionOrigin')
    store.delete('browserExtensionLastVerified')
    lastPairingError = ''
    lastPairingAttempt = null
    extensionSessions.clear()
    persistExtensionSessions()
    return regeneratePairToken(store)
  }

  function touchVerified() {
    store.set('browserExtensionLastVerified', Date.now())
  }

  function getPairedOrigin() {
    return store.get('browserExtensionOrigin', '')
  }

  /*
  function hasValidPair(request, origin) {
    return EXTENSION_ORIGIN_PATTERN.test(origin) &&
      extensionSessions.get(origin) === request.headers['x-automate-token']
  }
*/

function hasValidPair(request, origin) {
  const receivedToken = request.headers['x-automate-token']

  if (!receivedToken) {
    return false
  }

  // If Origin is present, verify that this token belongs to that origin.
  if (origin) {
    const storedToken = extensionSessions.get(origin)
    return EXTENSION_ORIGIN_PATTERN.test(origin) &&
      storedToken === receivedToken
  }

  // Origin may be omitted on some extension GET requests.
  // Check whether the token belongs to any paired extension.
  for (const storedToken of extensionSessions.values()) {
    if (storedToken === receivedToken) {
      return true
    }
  }

  return false
}

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin || ''

    if (request.method === 'OPTIONS') {
      if (!EXTENSION_ORIGIN_PATTERN.test(origin)) {
        response.writeHead(403)
        response.end()
        return
      }
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AutoMate-Token')
      response.setHeader('Vary', 'Origin')
      response.writeHead(204)
      response.end()
      return
    }
/*
    if (request.method === 'POST' && request.url === '/pair') {
      console.log('PAIR REQUEST')
      console.log('Origin:', origin)
      try {
        if (!EXTENSION_ORIGIN_PATTERN.test(origin)) throw new Error('Invalid extension origin')
        const body = await readJson(request)
        const submitted = Buffer.from(String(body.token || ''))
        const expected = Buffer.from(getCurrentPairToken())
        if (submitted.length !== expected.length || !crypto.timingSafeEqual(submitted, expected)) {
          sendJson(response, 401, { error: 'Pairing code is incorrect' }, origin)
          return
        }
        const sessionToken = crypto.randomBytes(32).toString('hex')
        extensionSessions.set(origin, sessionToken)
        persistExtensionSessions()
        store.set('browserExtensionOrigin', origin)
        touchVerified()
        sendJson(response, 200, { success: true, sessionToken }, origin)
      } catch (err) {
        sendJson(response, 400, { error: err.message }, origin)
      }
      return
    }
*/
if (request.method === 'POST' && request.url === '/pair') {
  lastPairingAttempt = Date.now()
  lastPairingError = ''
  console.log('PAIR REQUEST')
  console.log('Origin:', origin)

  try {
    if (!EXTENSION_ORIGIN_PATTERN.test(origin)) {
      throw new Error('Invalid extension origin')
    }

    const body = await readJson(request)

    const submitted = Buffer.from(String(body.token || ''))
    const expected = Buffer.from(getCurrentPairToken())

    if (
      submitted.length !== expected.length ||
      !crypto.timingSafeEqual(submitted, expected)
    ) {
      lastPairingError = '配对码不正确。请重新复制 AutoMate 设置页当前显示的配对码。'
      sendJson(response, 401, {
        error: lastPairingError
      }, origin)
      return
    }

    const sessionToken = crypto.randomBytes(32).toString('hex')

    extensionSessions.set(origin, sessionToken)
    persistExtensionSessions()

    store.set('browserExtensionOrigin', origin)
    touchVerified()
    lastPairingError = ''

    console.log('[1] PAIR SUCCESS')
    console.log('[1] Stored session for:', origin)

    sendJson(response, 200, {
      success: true,
      sessionToken
    }, origin)
  } catch (err) {
    lastPairingError = EXTENSION_ORIGIN_PATTERN.test(origin)
      ? `配对请求无效：${err.message}`
      : '请求来自无效的浏览器扩展。请从已加载的 AutoMate 扩展选项页发起配对。'
    console.log('[1] PAIR ERROR:', err.message)

    sendJson(response, 400, {
      error: lastPairingError
    }, origin)
  }

  return
}

    if (!hasValidPair(request, origin)) {
      if (origin && getPairedOrigin() === origin) {
        store.delete('browserExtensionOrigin')
        store.delete('browserExtensionLastVerified')
        extensionSessions.delete(origin)
        persistExtensionSessions()
        lastPairingError = '扩展会话已失效，请重新配对。'
      }
      sendJson(response, 403, { error: '扩展会话已失效，请在 AutoMate 设置页重新配对。' }, origin)
      return
    }

    if (request.method === 'POST' && request.url === '/unpair') {
      extensionSessions.delete(origin)
      persistExtensionSessions()
      if (getPairedOrigin() === origin) {
        store.delete('browserExtensionOrigin')
        store.delete('browserExtensionLastVerified')
      }
      sendJson(response, 200, { success: true }, origin)
      return
    }

    if (request.method === 'GET' && request.url === '/status') {
      touchVerified()
      sendJson(response, 200, { paired: true, lastVerified: Date.now() }, origin)
      return
    }

    if (request.method === 'GET' && request.url === '/platforms') {
      const platforms = getPlatforms()
        .filter(platform => platform.url)
        .map(platform => {
          try {
            const url = new URL(platform.loginUrl || platform.url)
            if (!['http:', 'https:'].includes(url.protocol)) return null
            return { id: platform.id, name: platform.name, origin: url.origin, url: url.href }
          } catch (_) {
            return null
          }
        })
        .filter(Boolean)
      sendJson(response, 200, { platforms }, origin)
      return
    }

    if (request.method === 'POST' && request.url === '/autofill') {
      try {
        const body = await readJson(request)
        const requestedUrl = new URL(body.url)
        if (!['http:', 'https:'].includes(requestedUrl.protocol)) throw new Error('Unsupported URL')
        const matchingPlatforms = getPlatforms().filter(candidate => {
          try {
            const configuredUrl = new URL(candidate.loginUrl || candidate.url)
            const configuredPath = configuredUrl.pathname.replace(/\/$/, '') || '/'
            const requestedPath = requestedUrl.pathname.replace(/\/$/, '') || '/'
            return configuredUrl.origin === requestedUrl.origin &&
              (configuredPath === '/' || requestedPath === configuredPath || requestedPath.startsWith(`${configuredPath}/`))
          } catch (_) {
            return false
          }
        })
        const selection = getPlatformForUrl?.(requestedUrl.href, matchingPlatforms)
        const platform = selection?.platform || matchingPlatforms[0]
        if (!platform) {
          sendJson(response, 404, { error: '没有匹配此网站的平台配置' }, origin)
          return
        }
        const credentials = getCredentials
          ? getCredentials(platform)
          : {
              account: decrypt(platform.encryptedAccount),
              password: decrypt(platform.encryptedPassword)
            }
        sendJson(response, 200, {
          platformId: platform.id,
          loginRequestId: selection?.requestId || '',
          account: credentials.account,
          password: credentials.password,
          accountSelector: platform.accountSelector || '',
          passwordSelector: platform.passwordSelector || '',
          submitSelector: platform.submitSelector || '',
          successUrl: platform.successUrl || ''
        }, origin)
      } catch (err) {
        sendJson(response, 400, { error: err.message }, origin)
      }
      return
    }

    if (request.method === 'POST' && request.url === '/result') {
      try {
        const body = await readJson(request)
        const platform = getPlatforms().find(candidate => candidate.id === body.platformId)
        if (!platform) throw new Error('Configured platform no longer exists')
        if (typeof onLoginResult === 'function') {
          const validCodes = ['password-mutated', 'wrong-credentials', 'captcha-required', 'network-unreachable']
          onLoginResult(platform, {
            status: ['success', 'failed', 'pending'].includes(body.status) ? body.status : 'pending',
            code: validCodes.includes(body.code) ? body.code : '',
            message: body.message || ''
          })
        }
        sendJson(response, 200, { success: true }, origin)
      } catch (err) {
        sendJson(response, 400, { error: err.message }, origin)
      }
      return
    }

    sendJson(response, 404, { error: '未找到' }, origin)
  })

  return {
    get pairToken() {
      return getCurrentPairToken()
    },
    unpair,
    getPairingStatus() {
      return { error: lastPairingError, attemptedAt: lastPairingAttempt }
    },
    get port() {
      return server.address()?.port || port
    },
    get isListening() {
      return server.listening
    },
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject)
          resolve()
        })
      })
    },
    close() {
      if (server.listening) server.close()
    }
  }
}

module.exports = { createBrowserBridge, PORT }