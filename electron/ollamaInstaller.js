const fs = require('fs')
const https = require('https')
const { EventEmitter } = require('events')
const os = require('os')
const path = require('path')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')

const OFFICIAL_INSTALLER_URL = 'https://ollama.com/download/OllamaSetup.exe'
const MIRROR_INSTALLER_URL = 'https://gh-proxy.com/https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe'
const ALLOWED_MIRROR_HOSTS = new Set(['gh-proxy.com'])
const MIRROR_PATH_MARKER = 'github.com/ollama/ollama/releases/'
const MAX_INSTALLER_BYTES = 2 * 1024 ** 3
const MAX_REDIRECTS = 5
const MAX_DOWNLOAD_RETRIES = 3
const DOWNLOAD_IDLE_TIMEOUT_MS = 120000
const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ERETRYABLE_HTTP'])
const execFileAsync = promisify(execFile)

function isAllowedInstallerUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (
      url.hostname === 'ollama.com' ||
      url.hostname.endsWith('.ollama.com') ||
      (url.hostname === 'github.com' && (
        url.pathname === '/ollama/ollama/releases/latest/download/OllamaSetup.exe' ||
        url.pathname.startsWith('/ollama/ollama/releases/download/')
      )) ||
      [
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
        'releaseassetproduction.blob.core.windows.net'
      ].includes(url.hostname) ||
      (ALLOWED_MIRROR_HOSTS.has(url.hostname) && url.href.includes(MIRROR_PATH_MARKER))
    )
  } catch (_) {
    return false
  }
}

function detectChinaRegion() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (/^Asia\/(Shanghai|Urumqi)$/.test(timeZone)) return true
  } catch (_) {}
  const locale = String(process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '').toLowerCase()
  return locale.includes('zh_cn') || locale.includes('zh-cn') || locale === 'cn' || locale.startsWith('cn.')
}

function getInstallerSourceUrls(china = detectChinaRegion()) {
  return china
    ? [MIRROR_INSTALLER_URL, OFFICIAL_INSTALLER_URL]
    : [OFFICIAL_INSTALLER_URL, MIRROR_INSTALLER_URL]
}

function cleanupInstallerDirectory(directory) {
  return fs.promises.rm(directory, { recursive: true, force: true })
}

function isRetryableDownloadError(error) {
  return RETRYABLE_ERROR_CODES.has(error?.code)
}

function getPartialResponseStart(value) {
  const match = String(value || '').match(/^bytes\s+(\d+)-\d+\/(?:\d+|\*)$/i)
  return match ? Number(match[1]) : null
}

function createDownloadCancelledError() {
  return Object.assign(new Error('下载已取消'), { code: 'ECANCELED' })
}

function createElectronNetGet(net) {
  return (url, options, callback) => {
    const request = net.request({ url: url.href, method: 'GET', headers: options.headers })
    const adapter = new EventEmitter()
    let timeoutDuration = 0
    let timeoutHandler = null
    let timeout = null

    const clearIdleTimeout = () => {
      clearTimeout(timeout)
      timeout = null
    }
    const resetIdleTimeout = () => {
      if (!timeoutHandler) return
      clearIdleTimeout()
      timeout = setTimeout(timeoutHandler, timeoutDuration)
    }

    request.on('response', response => {
      response.on('data', resetIdleTimeout)
      response.once('end', clearIdleTimeout)
      callback(response)
    })
    request.on('error', error => {
      clearIdleTimeout()
      adapter.emit('error', error)
    })
    adapter.setTimeout = (duration, handler) => {
      timeoutDuration = duration
      timeoutHandler = handler
      resetIdleTimeout()
    }
    adapter.destroy = error => {
      clearIdleTimeout()
      request.abort()
      if (error) process.nextTick(() => adapter.emit('error', error))
    }
    request.end()
    return adapter
  }
}

async function downloadFile(value, filename, onProgress, redirects = 0, retries = MAX_DOWNLOAD_RETRIES, signal, requestGet = https.get) {
  if (signal?.aborted) throw createDownloadCancelledError()
  const url = new URL(value)
  if (!isAllowedInstallerUrl(url.href)) throw new Error('安装程序下载地址不是受信任的 HTTPS 地址')
  if (redirects > MAX_REDIRECTS) throw new Error('Ollama 安装程序下载重定向次数过多')

  const partialSize = await fs.promises.stat(filename).then(file => file.size).catch(() => 0)
  try {
    await new Promise((resolve, reject) => {
      let output = null
      let settled = false
      let request
      let abortHandler

      const removeAbortHandler = () => {
        if (abortHandler) signal?.removeEventListener('abort', abortHandler)
      }

      const fail = error => {
        if (settled) return
        settled = true
        removeAbortHandler()
        if (!output) {
          reject(error)
          return
        }
        if (isRetryableDownloadError(error)) {
          output.end(() => reject(error))
          return
        }
        output.once('close', () => reject(error))
        output.destroy()
      }

      const headers = partialSize ? { Range: `bytes=${partialSize}-` } : {}
      request = requestGet(url, { headers }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          const location = response.headers.location
          response.resume()
          if (!location) {
            settled = true
            removeAbortHandler()
            reject(new Error('Ollama 安装程序下载重定向无效'))
            return
          }
          settled = true
          removeAbortHandler()
          downloadFile(new URL(location, url).href, filename, onProgress, redirects + 1, retries, signal, requestGet).then(resolve, reject)
          return
        }

        let completed = partialSize
        let total = Number(response.headers['content-length']) || 0
        let flags = 'w'
        if (response.statusCode === 206) {
          const start = getPartialResponseStart(response.headers['content-range'])
          if (!partialSize || start !== partialSize) {
            response.resume()
            settled = true
            removeAbortHandler()
            reject(new Error('Ollama 安装程序续传响应无效'))
            return
          }
          total = Number(response.headers['content-range'].split('/').pop()) || partialSize + total
          flags = 'a'
        } else if (response.statusCode !== 200) {
          response.resume()
          const error = new Error(`Ollama 安装程序下载失败：HTTP ${response.statusCode}`)
          if (response.statusCode === 408 || response.statusCode === 429 || response.statusCode >= 500) {
            error.code = 'ERETRYABLE_HTTP'
          }
          settled = true
          removeAbortHandler()
          reject(error)
          return
        } else {
          completed = 0
        }

        if (total > MAX_INSTALLER_BYTES || completed > MAX_INSTALLER_BYTES) {
          response.destroy()
          settled = true
          removeAbortHandler()
          reject(new Error('Ollama 安装程序文件过大'))
          return
        }

        output = fs.createWriteStream(filename, { flags })
        response.on('data', chunk => {
          completed += chunk.length
          if (completed > MAX_INSTALLER_BYTES) {
            const error = new Error('Ollama 安装程序文件过大')
            response.destroy()
            fail(error)
            return
          }
          onProgress({ completed, total })
        })
        response.on('error', fail)
        output.on('error', error => {
          response.destroy()
          fail(error)
        })
        output.on('finish', () => {
          if (settled) return
          settled = true
          removeAbortHandler()
          resolve()
        })
        response.pipe(output)
      })
      request.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => request.destroy(Object.assign(new Error('下载 Ollama 安装程序 2 分钟未收到数据，已停止本次下载。请检查网络或代理后重试。'), { code: 'ETIMEDOUT' })))
      request.on('error', fail)
      abortHandler = () => request.destroy(createDownloadCancelledError())
      signal?.addEventListener('abort', abortHandler, { once: true })
      if (signal?.aborted) abortHandler()
    })
  } catch (error) {
    if (!isRetryableDownloadError(error) || retries === 0) {
      if (error.code === 'ECONNRESET') {
        throw new Error('下载连接被重置（ECONNRESET）。AutoMate 已尝试续传；请检查网络或代理后重试。')
      }
      throw error
    }
    await new Promise(resolve => setTimeout(resolve, (MAX_DOWNLOAD_RETRIES - retries + 1) * 1000))
    onProgress({ retrying: true, retriesRemaining: retries - 1 })
    return downloadFile(value, filename, onProgress, redirects, retries - 1, signal, requestGet)
  }
}

async function verifyInstallerSignature(filename) {
  const escapedFilename = filename.replace(/'/g, "''")
  const command = `$signature = Get-AuthenticodeSignature -LiteralPath '${escapedFilename}'; if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Ollama') { exit 1 }`
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true })
  } catch (_) {
    throw new Error('Windows 无法验证 Ollama 安装程序签名，已停止安装')
  }
}

async function downloadInstallerFromSources(filename, onProgress, signal, requestGet) {
  const sources = getInstallerSourceUrls()
  let lastError = null
  for (let index = 0; index < sources.length; index++) {
    if (signal?.aborted) throw createDownloadCancelledError()
    onProgress({ sourceIndex: index, sourceCount: sources.length, completed: 0, total: 0 })
    try {
      await downloadFile(sources[index], filename, onProgress, 0, MAX_DOWNLOAD_RETRIES, signal, requestGet)
      return
    } catch (error) {
      if (error.code === 'ECANCELED') throw error
      lastError = error
      await fs.promises.rm(filename, { force: true }).catch(() => {})
    }
  }
  throw lastError
}

async function installOllama(onProgress = () => {}, signal, requestGet = https.get) {
  if (process.platform !== 'win32') throw new Error('自动安装 Ollama 目前仅支持 Windows')

  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'automate-ollama-'))
  const filename = path.join(directory, 'OllamaSetup.exe')
  try {
    await downloadInstallerFromSources(filename, onProgress, signal, requestGet)
    onProgress({ stage: 'verify' })
    await verifyInstallerSignature(filename)

    onProgress({ stage: 'install' })
    const installer = spawn(filename, [], { stdio: 'ignore', windowsHide: false })
    const spawned = new Promise((resolve, reject) => {
      installer.once('error', reject)
      installer.once('spawn', resolve)
    })
    const exited = new Promise((resolve, reject) => {
      installer.once('error', reject)
      installer.once('close', resolve)
    })
    await spawned
    const exitCode = await exited
    if (exitCode !== 0) throw new Error(`Ollama 安装程序已退出，代码 ${exitCode}`)
    return { success: true }
  } finally {
    await cleanupInstallerDirectory(directory).catch(() => {})
  }
}

module.exports = {
  isAllowedInstallerUrl,
  detectChinaRegion,
  getInstallerSourceUrls,
  getPartialResponseStart,
  isRetryableDownloadError,
  createDownloadCancelledError,
  createElectronNetGet,
  DOWNLOAD_IDLE_TIMEOUT_MS,
  cleanupInstallerDirectory,
  downloadFile,
  downloadInstallerFromSources,
  installOllama
}