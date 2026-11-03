const https = require('https')
const http = require('http')

const CHECK_SITES = [
  {
    url: 'http://www.msftconnecttest.com/connecttest.txt',
    expected: 200,
    expectedBody: 'Microsoft Connect Test'
  }
]

function request(site, timeout) {
  return new Promise((resolve) => {
    const mod = site.url.startsWith('https') ? https : http
    const startedAt = Date.now()
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      try { req.destroy() } catch (_) {}
      done({ connected: false, latencyMs: null })
    }, timeout)
    const req = mod.get(site.url, { timeout }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        if (body.length < 256) body += chunk.slice(0, 256 - body.length)
      })
      res.on('end', () => {
        const statusMatches = res.statusCode === site.expected
        const bodyMatches = site.expectedBody === undefined || body.trim() === site.expectedBody
        done({
          connected: statusMatches && bodyMatches,
          latencyMs: Date.now() - startedAt
        })
      })
    })
    req.on('error', () => done({ connected: false, latencyMs: null }))
    req.on('timeout', () => {
      try { req.destroy() } catch (_) {}
      done({ connected: false, latencyMs: null })
    })
  })
}

async function checkInternetConnection(timeoutMs = 8000) {
  const perRequest = Math.max(1500, Math.floor(timeoutMs / CHECK_SITES.length))
  for (const site of CHECK_SITES) {
    const result = await request(site, perRequest)
    if (result.connected) return true
  }
  return false
}

async function measureInternetLatency(timeoutMs = 8000) {
  const perRequest = Math.max(1500, Math.floor(timeoutMs / CHECK_SITES.length))
  for (const site of CHECK_SITES) {
    const result = await request(site, perRequest)
    if (result.connected) return result
  }
  return { connected: false, latencyMs: null }
}

const DOWNLOAD_SOURCES = [
  'https://speed.cloudflare.com/__down?bytes=20000000',
  'https://cachefly.cachefly.net/10mb.test'
]

function measureDownloadSpeed(timeoutMs = 20000) {
  return new Promise(async (resolve) => {
    const measureWindowMs = 5000
    for (const sourceUrl of DOWNLOAD_SOURCES) {
      const result = await measureDownloadFromSource(sourceUrl, measureWindowMs, timeoutMs)
      if (result.success) {
        resolve(result)
        return
      }
    }
    resolve({ success: false, downloadMbps: null, message: '所有测速源均不可用' })
  })
}

function measureDownloadFromSource(sourceUrl, measureWindowMs, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let receivedBytes = 0
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(measureTimer)
      try { req.destroy() } catch (_) {}
      resolve(result)
    }
    const timer = setTimeout(() => {
      finish({ success: false, downloadMbps: null, message: '测速超时' })
    }, timeoutMs)
    const measureTimer = setTimeout(() => {
      const elapsed = Date.now() - startedAt
      if (receivedBytes > 0 && elapsed > 0) {
        const downloadMbps = Number((receivedBytes * 8 / (elapsed * 1000)).toFixed(2))
        finish({ success: true, downloadMbps, bytesDownloaded: receivedBytes, durationMs: elapsed, message: '' })
      }
    }, measureWindowMs)
    const req = https.get(sourceUrl, {
      headers: { 'Accept-Encoding': 'identity' }
    }, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        finish({ success: false, downloadMbps: null, message: `测速服务返回 HTTP ${res.statusCode}` })
        return
      }
      res.on('data', chunk => {
        receivedBytes += chunk.length
      })
      res.on('end', () => {
        const elapsed = Date.now() - startedAt
        if (receivedBytes > 0 && elapsed > 0) {
          const downloadMbps = Number((receivedBytes * 8 / (elapsed * 1000)).toFixed(2))
          finish({ success: true, downloadMbps, bytesDownloaded: receivedBytes, durationMs: elapsed, message: '' })
        } else {
          finish({ success: false, downloadMbps: null, message: '测速未收到数据' })
        }
      })
    })
    req.on('error', err => {
      finish({ success: false, downloadMbps: null, message: err.message })
    })
  })
}

module.exports = {
  checkInternetConnection,
  measureInternetLatency,
  measureDownloadSpeed
}
