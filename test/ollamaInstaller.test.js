const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const { PassThrough } = require('node:stream')
const test = require('node:test')
const {
  isAllowedInstallerUrl,
  getInstallerSourceUrls,
  getPartialResponseStart,
  isRetryableDownloadError,
  createDownloadCancelledError,
  createElectronNetGet,
  DOWNLOAD_IDLE_TIMEOUT_MS,
  cleanupInstallerDirectory,
  downloadFile,
  downloadInstallerFromSources
} = require('../electron/ollamaInstaller')

test('Ollama installer downloads require HTTPS and trusted official hosts', () => {
  assert.equal(isAllowedInstallerUrl('https://ollama.com/download/OllamaSetup.exe'), true)
  assert.equal(isAllowedInstallerUrl('https://downloads.ollama.com/OllamaSetup.exe'), true)
  assert.equal(isAllowedInstallerUrl('https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe'), true)
  assert.equal(isAllowedInstallerUrl('https://github.com/ollama/ollama/releases/download/v0.0.0/OllamaSetup.exe'), true)
  assert.equal(isAllowedInstallerUrl('https://github.com/other/project/releases/download/v1/app.exe'), false)
  assert.equal(isAllowedInstallerUrl('https://release-assets.githubusercontent.com/installer.exe'), true)
  assert.equal(isAllowedInstallerUrl('https://objects.githubusercontent.com/installer.exe'), true)
  assert.equal(isAllowedInstallerUrl('https://releaseassetproduction.blob.core.windows.net/installer.exe'), true)
  assert.equal(isAllowedInstallerUrl('https://untrusted.blob.core.windows.net/installer.exe'), false)
  assert.equal(isAllowedInstallerUrl('https://gh-proxy.com/https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe'), true)
  assert.equal(isAllowedInstallerUrl('https://gh-proxy.com/https://example.com/evil.exe'), false)
  assert.equal(isAllowedInstallerUrl('https://untrusted.example/https://github.com/ollama/ollama/releases/download/v0.0.0/OllamaSetup.exe'), false)
  assert.equal(isAllowedInstallerUrl('http://ollama.com/download/OllamaSetup.exe'), false)
  assert.equal(isAllowedInstallerUrl('https://ollama.com.attacker.example/installer.exe'), false)
  assert.equal(isAllowedInstallerUrl('https://githubusercontent.com.attacker.example/installer.exe'), false)
  assert.equal(isAllowedInstallerUrl('not a url'), false)
})

test('installer download source order adapts to region with mirror fallback', () => {
  assert.deepEqual(getInstallerSourceUrls(true), [
    'https://gh-proxy.com/https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe',
    'https://ollama.com/download/OllamaSetup.exe'
  ])
  assert.deepEqual(getInstallerSourceUrls(false), [
    'https://ollama.com/download/OllamaSetup.exe',
    'https://gh-proxy.com/https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe'
  ])
})

test('installer temp files can be removed after the installer exits', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'automate-ollama-test-'))
  await fs.promises.writeFile(path.join(directory, 'OllamaSetup.exe'), 'test')

  await cleanupInstallerDirectory(directory)

  await assert.rejects(fs.promises.stat(directory), { code: 'ENOENT' })
})

test('download resumes after ECONNRESET instead of discarding downloaded bytes', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'automate-ollama-resume-test-'))
  const filename = path.join(directory, 'OllamaSetup.exe')
  const originalGet = https.get
  const requestHeaders = []
  let attempt = 0

  https.get = (_url, options, callback) => {
    const currentAttempt = attempt++
    requestHeaders.push(options.headers)
    const response = new PassThrough()
    response.statusCode = currentAttempt === 0 ? 200 : 206
    response.headers = currentAttempt === 0
      ? { 'content-length': '6' }
      : { 'content-length': '3', 'content-range': 'bytes 3-5/6' }

    const request = new EventEmitter()
    request.setTimeout = () => {}
    process.nextTick(() => {
      callback(response)
      if (currentAttempt === 0) {
        response.write('abc', () => response.destroy(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })))
      } else {
        response.end('def')
      }
    })
    return request
  }

  try {
    await downloadFile('https://ollama.com/download/OllamaSetup.exe', filename, () => {})
    assert.deepEqual(requestHeaders, [{}, { Range: 'bytes=3-' }])
    assert.equal(await fs.promises.readFile(filename, 'utf8'), 'abcdef')
  } finally {
    https.get = originalGet
    await cleanupInstallerDirectory(directory)
  }
})

test('download retry helpers recognize transient resets and valid range headers', () => {
  assert.equal(isRetryableDownloadError({ code: 'ECONNRESET' }), true)
  assert.equal(isRetryableDownloadError({ code: 'EAI_AGAIN' }), true)
  assert.equal(isRetryableDownloadError({ code: 'EINVAL' }), false)
  assert.equal(getPartialResponseStart('bytes 120-199/200'), 120)
  assert.equal(getPartialResponseStart('invalid'), null)
})

test('installer download uses Electron network requests and a longer idle timeout', () => {
  assert.equal(DOWNLOAD_IDLE_TIMEOUT_MS, 120000)

  let requestOptions
  let requestEnded = false
  const fakeRequest = new EventEmitter()
  fakeRequest.end = () => { requestEnded = true }
  fakeRequest.abort = () => {}
  const requestGet = createElectronNetGet({
    request: options => {
      requestOptions = options
      return fakeRequest
    }
  })
  const response = new PassThrough()
  response.statusCode = 200
  response.headers = { 'content-length': '3' }
  requestGet(new URL('https://ollama.com/download/OllamaSetup.exe'), { headers: {} }, received => {
    assert.equal(received, response)
  })
  fakeRequest.emit('response', response)

  assert.deepEqual(requestOptions, {
    url: 'https://ollama.com/download/OllamaSetup.exe',
    method: 'GET',
    headers: {}
  })
  assert.equal(requestEnded, true)
  response.end()
})

test('installer download can be cancelled without retrying', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'automate-ollama-cancel-test-'))
  const filename = path.join(directory, 'OllamaSetup.exe')
  const originalGet = https.get
  const controller = new AbortController()

  https.get = () => {
    const request = new EventEmitter()
    request.setTimeout = () => {}
    request.destroy = error => process.nextTick(() => request.emit('error', error))
    return request
  }

  try {
    const pendingDownload = downloadFile(
      'https://ollama.com/download/OllamaSetup.exe',
      filename,
      () => {},
      0,
      0,
      controller.signal
    )
    controller.abort()
    await assert.rejects(pendingDownload, error => {
      assert.equal(error.code, 'ECANCELED')
      assert.equal(error.message, createDownloadCancelledError().message)
      return true
    })
  } finally {
    https.get = originalGet
    await cleanupInstallerDirectory(directory)
  }
})