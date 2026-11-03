const { BrowserView, shell } = require('electron')
const { checkInternetConnection } = require('./network')
const netUtils = require('./netUtils')
const networkLogin = require('./networkLogin')

const DEFAULT_TIMEOUT = 30000
const MAX_RETRIES = 2

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForCondition(fn, timeout = DEFAULT_TIMEOUT, interval = 500) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const result = await fn()
      if (result) return result
    } catch (_) {}
    await sleep(interval)
  }
  throw new Error('操作超时')
}

async function executeInPage(view, script) {
  return new Promise((resolve, reject) => {
    view.webContents.executeJavaScript(script, true)
      .then(resolve)
      .catch(reject)
  })
}

function getPlatformType(platform) {
  return platform.type === 'network' ? 'network' : 'web'
}

async function openAndLogin(parentWindow, platform, credentials) {
  if (getPlatformType(platform) === 'network') {
    return networkLogin.networkLogin(parentWindow, platform, credentials)
  }
  return openWebLogin(platform, credentials)
}

async function openWebLogin(platform) {
  try {
    const url = new URL(platform.url)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 登录网址')
    await shell.openExternal(url.href)
    return { success: false, pending: true, message: '已在默认浏览器打开。配对的 AutoMate 扩展会自动填写并提交登录表单。', attempt: 1, timestamp: Date.now() }
  } catch (err) {
    return { success: false, message: `无法打开默认浏览器: ${err.message}`, attempt: 1, timestamp: Date.now() }
  }
}


async function checkLoginStatus(parentWindow, platform) {
  if (getPlatformType(platform) === 'network') {
    const expectedSsid = (platform.wifiName || platform.wifi || '').trim()
    const currentSsid = await netUtils.getCurrentSSID()
    const connected = await checkInternetConnection()
    return {
      loggedIn: connected && (!expectedSsid || currentSsid === expectedSsid),
      timestamp: Date.now()
    }
  }

  let view = null
  try {
    view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })
    parentWindow.addBrowserView(view)
    const [width, height] = parentWindow.getContentSize()
    view.setBounds({ x: 0, y: 0, width: Math.max(width, 100), height: Math.max(height, 100) })

    const checkUrl = platform.statusUrl || platform.url
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('状态检查超时')), 15000)
      view.webContents.on('did-finish-load', () => {
        clearTimeout(timer)
        resolve()
      })
      view.webContents.loadURL(checkUrl).catch(err => {
        clearTimeout(timer)
        reject(err)
      })
    })

    await sleep(1500)
    const isLoggedIn = await executeInPage(view, `(function() {
      const body = document.body ? document.body.innerText : '';
      const loginKeywords = ['登录', 'login', '请输入', '账号', '密码'];
      const lowerBody = body.toLowerCase();
      for (const kw of loginKeywords) {
        if (lowerBody.includes(kw.toLowerCase())) return false;
      }
      return true;
    })()`)

    parentWindow.removeBrowserView(view)
    view.webContents.destroy()

    return { loggedIn: !!isLoggedIn, timestamp: Date.now() }
  } catch (err) {
    if (view) {
      try {
        parentWindow.removeBrowserView(view)
        view.webContents.destroy()
      } catch (_) {}
    }
    return { loggedIn: false, error: err.message, timestamp: Date.now() }
  }
}

async function loginAll(parentWindow, platforms, credentialsMap, onProgress) {
  const results = []
  for (const platform of platforms) {
    const creds = credentialsMap[platform.id]
    if (!creds) {
      results.push({ platformId: platform.id, success: false, message: '未找到凭据' })
      continue
    }
    if (onProgress) onProgress(platform.id, 'logging-in')
    const result = await openAndLogin(parentWindow, platform, creds)
    results.push({ platformId: platform.id, ...result })
    if (onProgress) onProgress(platform.id, result.pending ? 'pending' : result.success ? 'success' : 'failed')
  }
  return results
}

async function logoutPlatform(platform) {
  if (getPlatformType(platform) === 'web') {
    try {
      await shell.openExternal(platform.logoutUrl || platform.url)
      return { success: true, message: '已在默认浏览器打开退出登录页面' }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }
  return { success: true, message: '网络登录平台无需退出' }
}

module.exports = {
  openAndLogin,
  checkLoginStatus,
  loginAll,
  logoutPlatform,
  DEFAULT_TIMEOUT,
  MAX_RETRIES
}