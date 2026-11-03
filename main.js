const { app, BrowserWindow, ipcMain, powerMonitor, shell, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')
const { exec, execFile } = require('child_process')
const Store = require('electron-store')
const crypto = require('./electron/crypto')
const { resolvePlatformCredentials } = require('./electron/platformCredentials')
const { createLoginIntentQueue } = require('./electron/loginIntentQueue')
const autoLogin = require('./electron/autoLogin')
const netUtils = require('./electron/netUtils')
const networkLogin = require('./electron/networkLogin')
const { checkInternetConnection, measureInternetLatency, measureDownloadSpeed } = require('./electron/network')
const { createBrowserBridge } = require('./electron/browserBridge')
const { createTray, updateTrayStatus, destroyTray, createIconPng, setTrayLanguage } = require('./electron/tray')

const isDev = process.env.NODE_ENV === 'development'

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const store = new Store({
  name: 'automate-config',
  defaults: {
    platforms: [],
    groups: [],
    loginSystems: [],
    settings: {
      autoStart: false,
      defaultLoginType: 'web',
      checkInterval: 30,
      lastCheck: null
    },
    statuses: {}
  }
})

const LOGIN_CONFIRM_TIMEOUT_MS = 60000
const pendingLoginTimers = new Map()
const loginIntentQueue = createLoginIntentQueue()
let mainWindow = null
let tray = null
let statusCheckTimer = null

function toSerializableCloneable(value) {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(item => toSerializableCloneable(item))
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return { name: value.name, message: value.message, stack: String(value.stack || '') }
  if (typeof value === 'object') {
    const plain = {}
    for (const [key, child] of Object.entries(value)) {
      plain[key] = toSerializableCloneable(child)
    }
    return plain
  }
  return value
}

function safeIpcResult(value) {
  try {
    return JSON.parse(JSON.stringify(toSerializableCloneable(value)))
  } catch (_) {
    return toSerializableCloneable(value)
  }
}

function setPlatformLoginStatus(platformId, status, lastAttempt = Date.now(), message = '') {
  const existingTimer = pendingLoginTimers.get(platformId)
  if (existingTimer) clearTimeout(existingTimer)
  pendingLoginTimers.delete(platformId)

  const statuses = store.get('statuses', {})
  statuses[platformId] = { status, lastAttempt, message }
  store.set('statuses', statuses)

  if (mainWindow) {
    mainWindow.webContents.send('platform-status-update', { platformId, status, lastAttempt, message })
  }

  const platformStatuses = store.get('platforms', []).map(platform => statuses[platform.id]?.status || 'idle')
  if (platformStatuses.includes('logging-in')) updateTrayStatus('logging-in')
  else if (platformStatuses.includes('pending')) updateTrayStatus('pending')
  else if (platformStatuses.length && platformStatuses.every(value => value === 'success')) updateTrayStatus('success')
  else if (platformStatuses.includes('success')) updateTrayStatus('partial')
  else if (platformStatuses.some(value => value === 'failed' || value === 'unconfirmed')) updateTrayStatus('failed')
  else updateTrayStatus('idle')

  if (status === 'pending') {
    const timer = setTimeout(() => {
      const currentStatuses = store.get('statuses', {})
      if (currentStatuses[platformId]?.status !== 'pending') return
      const updatedAt = Date.now()
      currentStatuses[platformId] = { status: 'unconfirmed', lastAttempt: updatedAt }
      store.set('statuses', currentStatuses)
      if (mainWindow) {
        mainWindow.webContents.send('platform-status-update', {
          platformId,
          status: 'unconfirmed',
          lastAttempt: updatedAt
        })
      }
      pendingLoginTimers.delete(platformId)
    }, LOGIN_CONFIRM_TIMEOUT_MS)
    timer.unref?.()
    pendingLoginTimers.set(platformId, timer)
  }
}

function recoverPendingLoginStatuses() {
  const statuses = store.get('statuses', {})
  let changed = false
  for (const [platformId, value] of Object.entries(statuses)) {
    if (value.status === 'pending' || value.status === 'logging-in') {
      statuses[platformId] = { ...value, status: 'unconfirmed' }
      changed = true
    }
  }
  if (changed) store.set('statuses', statuses)
}

function normalizePlatform(p) {
  const type = p.type === 'network' ? 'network' : 'web'
  return {
    ...p,
    type,
    wifiName: p.wifiName || p.wifi || '',
    groupId: p.groupId != null ? p.groupId : null,
    loginSystemId: p.requiresAuth === false ? null : p.loginSystemId || null,
    requiresAuth: p.requiresAuth !== false,
    accountSource: p.accountSource === 'inherit' ? 'inherit' : 'custom',
    skipGroupLogin: !!p.skipGroupLogin,
    scheduleDays: Array.isArray(p.scheduleDays) ? p.scheduleDays : ALL_DAYS,
    autoConnect: p.autoConnect !== false
  }
}

function getBrowserExtensionFolder() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'browser-extension')
    : path.join(__dirname, 'browser-extension')
}

function openBrowserExtensionManager(browser) {
  const candidatesByBrowser = {
    chrome: [
      path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ],
    edge: [
      path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ]
  }
  const executable = candidatesByBrowser[browser]?.find(candidate => fs.existsSync(candidate))
  if (!executable) return Promise.resolve({ success: false, error: `未找到${browser === 'chrome' ? ' Google Chrome' : ' Microsoft Edge'}。请先安装该浏览器。` })

  const url = browser === 'chrome' ? 'chrome://extensions' : 'edge://extensions'
  return new Promise(resolve => {
    execFile(executable, ['--new-window', url], error => {
      if (error) {
        shell.openExternal(url).catch(() => {})
        resolve({ success: true })
      } else {
        resolve({ success: true })
      }
    })
  })
}

const browserBridge = createBrowserBridge({
  store,
  getPlatforms: () => {
    const systems = store.get('loginSystems', [])
    const platforms = store.get('platforms', []).map(normalizePlatform).filter(platform => platform.requiresAuth).map(platform => ({
      ...platform,
      loginUrl: systems.find(system => system.id === platform.loginSystemId)?.loginUrl || ''
    }))
    return [
      ...platforms,
      ...systems.map(system => ({
        ...system,
        type: 'web',
        url: system.loginUrl,
        accountSource: 'custom'
      }))
    ]
  },
  getPlatformForUrl: (url, candidates) => loginIntentQueue.claim(url, candidates),
  decrypt: crypto.decrypt,
  getCredentials: platform => resolvePlatformCredentials(
    normalizePlatform(platform),
    store.get('groups', []),
    crypto.decryptCredentials,
    store.get('loginSystems', [])
  ),
  onLoginResult: (platform, result) => {
    const status = result.status === 'success' ? 'success' : result.status === 'failed' ? 'failed' : 'pending'
    const codeMessages = {
      'password-mutated': '网页修改了自动填入的密码大小写，AutoMate 已停止提交。请检查凭据来源或网页输入框规则。',
      'wrong-credentials': '账号或密码错误，请检查凭据是否正确。',
      'captcha-required': '页面出现验证码，AutoMate 无法自动完成登录。请手动输入验证码后提交。',
      'network-unreachable': '无法访问登录页面，请检查网络连接是否正常。'
    }
    const message = result.message || codeMessages[result.code] || ''
    setPlatformLoginStatus(platform.id, status, Date.now(), message)
    if (status === 'success' && platform.loginSystemId && platform.url) {
      shell.openExternal(platform.url).catch(err => console.error('打开登录目标失败:', err.message))
    }
  }
})
let browserBridgeError = ''

function getPlatform(platformId) {
  const platforms = store.get('platforms', [])
  const raw = platforms.find(p => p.id === platformId)
  return raw ? normalizePlatform(raw) : null
}

function isScheduledToday(platform) {
  const days = Array.isArray(platform.scheduleDays) && platform.scheduleDays.length
    ? platform.scheduleDays
    : Array.isArray(platform.scheduleDays) ? [] : ALL_DAYS
  const map = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 0: 'sun' }
  return days.includes(map[new Date().getDay()])
}

function waitForDevServer(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume()
        resolve()
      })
      request.on('error', () => {
        if (Date.now() - start >= timeout) {
          reject(new Error(`开发服务器启动超时: ${url}`))
          return
        }
        setTimeout(check, 250)
      })
      request.setTimeout(1000, () => request.destroy())
    }
    check()
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    title: 'AutoMate - 网页认证自动登录助手',
    backgroundColor: '#f5f7fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.setMenuBarVisibility(false)

  if (isDev) {
    await waitForDevServer('http://localhost:5173')
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTrayInstance() {
  tray = createTray(mainWindow, {
    onLoginAll: () => {
      handleLoginAll()
    }
  })
}

function getDecryptedPlatforms() {
  const platforms = store.get('platforms', [])
  return platforms.map(p => {
    const normalized = normalizePlatform(p)
    let account = ''
    let password = ''
    let credentialError = ''
    try {
      ({ account, password } = resolvePlatformCredentials(
        normalized,
        store.get('groups', []),
        crypto.decryptCredentials,
        store.get('loginSystems', [])
      ))
    } catch (err) {
      credentialError = err.message
    }
    return {
      ...normalized,
      account,
      password,
      credentialError
    }
  })
}

function getEligibleForAutoLogin() {
  const platforms = store.get('platforms', [])
  return platforms
    .map(normalizePlatform)
    .filter(p => p.autoConnect !== false && isScheduledToday(p))
}

async function handleScheduledAutoLogin() {
  const eligible = getEligibleForAutoLogin()
  if (!eligible.length) return
  const eligibleIds = eligible.map(p => p.id)
  const allPlatforms = store.get('platforms', [])
  const filtered = allPlatforms.filter(p => eligibleIds.includes(p.id))
  if (filtered.length) {
    await handleLoginAll(filtered)
  }
}

async function handleLoginAll(platformList) {
  const platforms = platformList || store.get('platforms', [])
  if (!platforms.length) return

  updateTrayStatus('logging-in')
  if (mainWindow) {
    mainWindow.webContents.send('login-progress', { status: 'logging-in' })
  }

  const decrypted = getDecryptedPlatforms().filter(p =>
    platforms.some(pf => pf.id === p.id)
  )
  const credentialsMap = {}
  for (const p of decrypted) {
    if (!p.credentialError) {
      credentialsMap[p.id] = { account: p.account, password: p.password }
    }
  }

  const results = await autoLogin.loginAll(mainWindow, platforms, credentialsMap, (platformId, status) => {
    setPlatformLoginStatus(platformId, status)
  })

  const successCount = results.filter(r => r.success).length
  const totalCount = results.length
  const pendingCount = results.filter(r => r.pending).length
  let overallStatus = 'failed'
  if (successCount === totalCount) overallStatus = 'success'
  else if (pendingCount > 0) overallStatus = 'pending'
  else if (successCount > 0) overallStatus = 'partial'

  updateTrayStatus(overallStatus)
  if (mainWindow) {
    mainWindow.webContents.send('login-complete', { results, overallStatus })
  }

  for (const p of decrypted) {
    crypto.wipeString(p.account)
    crypto.wipeString(p.password)
  }

  return results
}

async function refreshNetworkStatuses({ autoLoginFailed = false, skipScheduledPlatforms = false } = {}) {
  const platforms = store.get('platforms', []).map(normalizePlatform)
  for (const platform of platforms) {
    if (platform.type !== 'network') continue
    const scheduledForStartup = platform.autoConnect !== false && isScheduledToday(platform)
    if (skipScheduledPlatforms && scheduledForStartup) continue

    try {
      const result = await autoLogin.checkLoginStatus(mainWindow, platform)
      const status = result.loggedIn ? 'success' : 'failed'
      const lastCheck = Date.now()
      const statuses = store.get('statuses', {})
      statuses[platform.id] = { status, lastCheck }
      store.set('statuses', statuses)
      if (mainWindow) {
        mainWindow.webContents.send('platform-status-update', {
          platformId: platform.id,
          status,
          lastCheck
        })
      }
      if (!result.loggedIn && autoLoginFailed && scheduledForStartup) {
        await loginPlatformById(platform.id, { silent: true })
      }
    } catch (err) {
      console.error('状态检查失败:', err.message)
    }
  }
  store.set('settings.lastCheck', Date.now())
}

function startStatusCheckTimer() {
  stopStatusCheckTimer()
  const settings = store.get('settings', {})
  const intervalMinutes = settings.checkInterval || 30
  const intervalMs = intervalMinutes * 60 * 1000
  refreshNetworkStatuses({ skipScheduledPlatforms: true })
  statusCheckTimer = setInterval(() => {
    refreshNetworkStatuses({ autoLoginFailed: true })
  }, intervalMs)
}

function stopStatusCheckTimer() {
  if (statusCheckTimer) {
    clearInterval(statusCheckTimer)
    statusCheckTimer = null
  }
}

function setAutoStart(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: process.execPath
  })
}

function connectWifi(ssid) {
  return netUtils.connectWiFi(ssid)
}

async function checkInternet() {
  const connected = await checkInternetConnection()
  return { connected }
}

async function loginPlatformById(platformId, options = {}) {
  const platform = getPlatform(platformId)
  if (!platform) return { success: false, error: '平台不存在' }

  const decrypted = getDecryptedPlatforms().find(p => p.id === platformId)
  if (!decrypted) return { success: false, error: '凭据解密失败' }
  if (decrypted.credentialError) {
    setPlatformLoginStatus(platformId, 'failed')
    return { success: false, message: decrypted.credentialError }
  }

  setPlatformLoginStatus(platformId, 'logging-in')

  const loginSystem = platform.loginSystemId
    ? store.get('loginSystems', []).find(system => system.id === platform.loginSystemId)
    : null
  if (platform.loginSystemId && !loginSystem) {
    return { success: false, error: '所选登录系统不存在' }
  }
  const launchPlatform = loginSystem ? { ...platform, url: loginSystem.loginUrl } : platform
  const loginIntent = launchPlatform.type === 'web' && launchPlatform.requiresAuth !== false
    ? loginIntentQueue.enqueue(platform.id, launchPlatform.url)
    : null
  const result = await autoLogin.openAndLogin(mainWindow, launchPlatform, {
    account: decrypted.account,
    password: decrypted.password
  })
  if (!result.pending) loginIntentQueue.cancel(loginIntent)

  const codeMessages = {
    'password-mutated': '网页修改了自动填入的密码大小写，AutoMate 已停止提交。请检查凭据来源或网页输入框规则。',
    'wrong-credentials': '账号或密码错误，请检查凭据是否正确。',
    'captcha-required': '页面出现验证码，AutoMate 无法自动完成登录。请手动输入验证码后提交。',
    'network-unreachable': '无法访问登录页面，请检查网络连接是否正常。'
  }
  const statusMessage = result.message || codeMessages[result.code] || ''
  setPlatformLoginStatus(platformId, result.pending ? 'pending' : (result.success ? 'success' : 'failed'), Date.now(), statusMessage)

  crypto.wipeString(decrypted.account)
  crypto.wipeString(decrypted.password)
  return result
}

function registerIpcHandlers() {
  ipcMain.handle('save-platform', (_event, platform) => {
    try {
      const platforms = store.get('platforms', [])
      const { account, password, ...rest } = platform
      const normalized = normalizePlatform(rest)
      const existingIndex = platforms.findIndex(p => p.id === normalized.id)
      const existing = existingIndex >= 0 ? platforms[existingIndex] : null
      const loginSystem = normalized.loginSystemId
        ? store.get('loginSystems', []).find(item => item.id === normalized.loginSystemId)
        : null
      if (normalized.loginSystemId && (!loginSystem || normalized.type !== 'web')) {
        return { success: false, error: '所选登录系统不可用于此平台' }
      }
      let encrypted = null
      if (!normalized.requiresAuth) {
        encrypted = null
      } else if (normalized.loginSystemId) {
        if (account && password) encrypted = crypto.encryptCredentials(account, password)
      } else if (normalized.accountSource === 'inherit') {
        const group = store.get('groups', []).find(item => item.id === normalized.groupId)
        if (!group?.encryptedAccount || !group?.encryptedPassword) {
          return { success: false, error: '所选分组尚未设置共享账号和密码' }
        }
      } else {
        if (account && password) encrypted = crypto.encryptCredentials(account, password)
        else if (!existing?.encryptedAccount || !existing?.encryptedPassword) {
          return { success: false, error: '请输入平台账号和密码' }
        }
      }
      const platformData = {
        ...normalized,
        id: rest.id || `pf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: rest.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      if (encrypted) {
        platformData.encryptedAccount = encrypted.account
        platformData.encryptedPassword = encrypted.password
      } else if (normalized.requiresAuth && existing?.encryptedAccount && existing?.encryptedPassword) {
        platformData.encryptedAccount = existing.encryptedAccount
        platformData.encryptedPassword = existing.encryptedPassword
      }
      if (existingIndex >= 0) {
        platforms[existingIndex] = platformData
      } else {
        platforms.push(platformData)
      }
      store.set('platforms', platforms)
      crypto.wipeString(account)
      crypto.wipeString(password)
      return { success: true, id: platformData.id }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('get-platforms', () => {
    try {
      const platforms = store.get('platforms', [])
      const statuses = store.get('statuses', {})
      return platforms.map(p => {
        const n = normalizePlatform(p)
        return {
          id: n.id,
          name: n.name,
          type: n.type,
          url: n.url,
          wifi: n.wifi || '',
          wifiName: n.wifiName || '',
          groupId: n.groupId,
          loginSystemId: n.loginSystemId,
          requiresAuth: n.requiresAuth,
          sortOrder: n.sortOrder,
          accountSource: n.accountSource,
          skipGroupLogin: n.skipGroupLogin,
          scheduleDays: Array.isArray(n.scheduleDays) ? n.scheduleDays : ALL_DAYS,
          autoConnect: n.autoConnect !== false,
          accountSelector: n.accountSelector || '',
          passwordSelector: n.passwordSelector || '',
          submitSelector: n.submitSelector || '',
          successUrl: n.successUrl || '',
          logoutUrl: n.logoutUrl || '',
          statusUrl: n.statusUrl || '',
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          status: statuses[p.id]?.status || 'idle',
          statusMessage: statuses[p.id]?.message || '',
          lastAttempt: statuses[p.id]?.lastAttempt || null,
          lastCheck: statuses[p.id]?.lastCheck || null
        }
      })
    } catch (err) {
      return []
    }
  })

  ipcMain.handle('delete-platform', (_event, platformId) => {
    try {
      const platforms = store.get('platforms', [])
      const filtered = platforms.filter(p => p.id !== platformId)
      store.set('platforms', filtered)
      const statuses = store.get('statuses', {})
      delete statuses[platformId]
      store.set('statuses', statuses)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('get-groups', () => {
    try {
      return store.get('groups', [])
        .map((group, index) => ({ ...group, sortOrder: Number.isFinite(group.sortOrder) ? group.sortOrder : index }))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ encryptedAccount, encryptedPassword, ...group }) => ({
          ...group,
          hasSharedCredentials: !!(encryptedAccount && encryptedPassword)
        }))
    } catch (err) {
      return []
    }
  })

  ipcMain.handle('get-login-systems', () => {
    try {
      const statuses = store.get('statuses', {})
      return store.get('loginSystems', [])
        .map((system, index) => ({ ...system, sortOrder: Number.isFinite(system.sortOrder) ? system.sortOrder : index }))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ encryptedAccount, encryptedPassword, ...system }) => ({
          ...system,
          hasCredentials: !!(encryptedAccount && encryptedPassword),
          status: statuses[system.id]?.status || 'idle',
          lastAttempt: statuses[system.id]?.lastAttempt || null
        }))
    } catch (_) {
      return []
    }
  })

  ipcMain.handle('get-login-system-credentials', (_event, systemId) => {
    try {
      const system = store.get('loginSystems', []).find(item => item.id === systemId)
      if (!system) return { success: false, error: '登录系统不存在' }
      if (!system.encryptedAccount || !system.encryptedPassword) {
        return { success: true, account: '', password: '' }
      }
      return { success: true, ...crypto.decryptCredentials(system.encryptedAccount, system.encryptedPassword) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('save-login-system', (_event, input) => {
    try {
      const name = String(input.name || '').trim()
      let loginUrl
      try {
        loginUrl = new URL(input.loginUrl).href
      } catch (_) {
        return { success: false, error: '请输入有效的统一登录网址' }
      }
      if (!['http:', 'https:'].includes(new URL(loginUrl).protocol)) {
        return { success: false, error: '登录系统仅支持 HTTP 或 HTTPS 网址' }
      }
      if (!name) return { success: false, error: '登录系统名称不能为空' }
      const groupId = input.groupId ? String(input.groupId) : null
      if (groupId && !store.get('groups', []).some(group => group.id === groupId)) {
        return { success: false, error: '所选分组不存在' }
      }
      const systems = store.get('loginSystems', [])
      const existingIndex = systems.findIndex(system => system.id === input.id)
      const existing = existingIndex >= 0 ? systems[existingIndex] : null
      const previousGroupId = existing?.groupId || null
      const account = String(input.account || '').trim()
      const password = String(input.password || '')
      let encrypted = null
      if (account && password) {
        encrypted = crypto.encryptCredentials(account, password)
      } else if (!existing?.encryptedAccount || !existing?.encryptedPassword) {
        return { success: false, error: '请填写统一登录账号和密码' }
      }
      const system = {
        ...(existing || {}),
        id: existing?.id || `ls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        loginUrl,
        groupId,
        iconShape: ['circle', 'square', 'triangle', 'star'].includes(input.iconShape) ? input.iconShape : existing?.iconShape || 'circle',
        iconColor: /^#[0-9a-f]{6}$/i.test(input.iconColor || '') ? input.iconColor : existing?.iconColor || '#587895',
        sortOrder: existing?.groupId === groupId && Number.isFinite(existing?.sortOrder)
          ? existing.sortOrder
          : systems.filter(item => (item.groupId || null) === groupId).length,
        destinations: existing?.destinations || [],
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      if (encrypted) {
        system.encryptedAccount = encrypted.account
        system.encryptedPassword = encrypted.password
      }
      if (existingIndex >= 0) systems[existingIndex] = system
      else systems.push(system)
      store.set('loginSystems', systems)
      if (existing && previousGroupId !== groupId) {
        const platforms = store.get('platforms', [])
        let nextOrder = platforms.filter(platform => platform.loginSystemId !== system.id &&
          platform.type !== 'network' && (platform.groupId || null) === groupId).length
        store.set('platforms', platforms.map(platform => {
          if (platform.loginSystemId !== system.id) return platform
          return { ...platform, groupId, sortOrder: nextOrder++ }
        }))
      }
      crypto.wipeString(input.account)
      crypto.wipeString(input.password)
      return { success: true, id: system.id }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('delete-login-system', (_event, systemId) => {
    const systems = store.get('loginSystems', [])
    const isInUse = store.get('platforms', []).some(platform => platform.loginSystemId === systemId)
    if (isInUse) return { success: false, error: '仍有网页使用此登录系统，请先在网页编辑页解除关联' }
    store.set('loginSystems', systems.filter(system => system.id !== systemId))
    const statuses = store.get('statuses', {})
    delete statuses[systemId]
    store.set('statuses', statuses)
    return { success: true }
  })

  ipcMain.handle('add-destination', (_event, { systemId, destination }) => {
    try {
      const systems = store.get('loginSystems', [])
      const system = systems.find(item => item.id === systemId)
      if (!system) return { success: false, error: '登录系统不存在' }
      const name = String(destination.name || '').trim()
      let url
      try {
        url = new URL(destination.url).href
      } catch (_) {
        return { success: false, error: '请输入有效的目标网址' }
      }
      if (!['http:', 'https:'].includes(new URL(url).protocol)) {
        return { success: false, error: '目标网址仅支持 HTTP 或 HTTPS' }
      }
      if (!name) return { success: false, error: '目标名称不能为空' }
      const destinations = Array.isArray(system.destinations) ? system.destinations : []
      const destinationId = destination.id || `dst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const savedDestination = {
        id: destinationId,
        name,
        url,
        icon: String(destination.icon || '↗').slice(0, 8),
        color: /^#[0-9a-f]{6}$/i.test(destination.color) ? destination.color : '#2f6fed'
      }
      const index = destinations.findIndex(item => item.id === destinationId)
      if (index >= 0) destinations[index] = savedDestination
      else destinations.push(savedDestination)
      system.destinations = destinations
      system.updatedAt = Date.now()
      store.set('loginSystems', systems)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('delete-destination', (_event, { systemId, destinationId }) => {
    const systems = store.get('loginSystems', [])
    const system = systems.find(item => item.id === systemId)
    if (!system) return { success: false, error: '登录系统不存在' }
    system.destinations = (system.destinations || []).filter(item => item.id !== destinationId)
    system.updatedAt = Date.now()
    store.set('loginSystems', systems)
    return { success: true }
  })

  ipcMain.handle('login-system', async (_event, systemId) => {
    const system = store.get('loginSystems', []).find(item => item.id === systemId)
    if (!system) return { success: false, error: '登录系统不存在' }
    const loginIntent = loginIntentQueue.enqueue(system.id, system.loginUrl)
    try {
      await shell.openExternal(system.loginUrl)
      setPlatformLoginStatus(system.id, 'pending')
      return { success: false, pending: true, message: '统一登录页已在默认浏览器打开，等待扩展自动填写并提交。' }
    } catch (err) {
      loginIntentQueue.cancel(loginIntent)
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('open-destination', async (_event, { systemId, destinationId }) => {
    const system = store.get('loginSystems', []).find(item => item.id === systemId)
    const destination = system?.destinations?.find(item => item.id === destinationId)
    if (!destination) return { success: false, error: '目标页面不存在' }
    try {
      await shell.openExternal(destination.url)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('get-group-credentials', (_event, groupId) => {
    try {
      const group = store.get('groups', []).find(item => item.id === groupId)
      if (!group) return { success: false, error: '分组不存在' }
      if (!group.encryptedAccount || !group.encryptedPassword) {
        return { success: true, account: '', password: '' }
      }
      return { success: true, ...crypto.decryptCredentials(group.encryptedAccount, group.encryptedPassword) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('save-group', (_event, group) => {
    try {
      const groups = store.get('groups', [])
      const name = (group.name || '').trim()
      if (!name) return { success: false, error: '分组名称不能为空' }
      const existing = groups.find(g => g.name === name && g.id !== group.id)
      if (existing) return { success: false, error: '分组名称已存在' }
      const hasSharedFields = Object.hasOwn(group, 'sharedAccount') || Object.hasOwn(group, 'sharedPassword')
      const sharedAccount = String(group.sharedAccount || '').trim()
      const sharedPassword = String(group.sharedPassword || '')
      if (hasSharedFields && Boolean(sharedAccount) !== Boolean(sharedPassword)) {
        return { success: false, error: '共享账号和密码必须同时填写，或同时留空' }
      }
      const sharedCredentials = hasSharedFields && sharedAccount
        ? crypto.encryptCredentials(sharedAccount, sharedPassword)
        : null
      if (group.id) {
        const idx = groups.findIndex(g => g.id === group.id)
        if (idx >= 0) {
          const updatedGroup = { ...groups[idx], name, updatedAt: Date.now() }
          if (hasSharedFields && sharedCredentials) {
            updatedGroup.encryptedAccount = sharedCredentials.account
            updatedGroup.encryptedPassword = sharedCredentials.password
          } else if (hasSharedFields) {
            const hasInheritedPlatforms = store.get('platforms', []).some(platform =>
              platform.groupId === group.id && platform.accountSource === 'inherit'
            )
            if (hasInheritedPlatforms) {
              return { success: false, error: '仍有平台继承此分组账号，请先切换为自定义账号' }
            }
            delete updatedGroup.encryptedAccount
            delete updatedGroup.encryptedPassword
          }
          groups[idx] = updatedGroup
        } else {
          return { success: false, error: '分组不存在' }
        }
      } else {
        const newGroup = {
          id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
          sortOrder: groups.length,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        if (sharedCredentials) {
          newGroup.encryptedAccount = sharedCredentials.account
          newGroup.encryptedPassword = sharedCredentials.password
        }
        groups.push(newGroup)
      }
      store.set('groups', groups)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('reorder-groups', (_event, orderedIds) => {
    try {
      if (!Array.isArray(orderedIds)) return { success: false, error: '分组顺序无效' }
      const rank = new Map(orderedIds.map((id, index) => [id, index]))
      const groups = store.get('groups', []).map((group, index) => ({
        ...group,
        sortOrder: rank.has(group.id) ? rank.get(group.id) : orderedIds.length + index
      }))
      store.set('groups', groups)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('reorder-group-content', (_event, { groupId = null, platformIds = [], loginSystemIds = [] } = {}) => {
    try {
      if (!Array.isArray(platformIds) || !Array.isArray(loginSystemIds)) {
        return { success: false, error: '内容顺序无效' }
      }
      const groups = store.get('groups', [])
      const isInGroup = item => groupId
        ? item.groupId === groupId
        : !item.groupId || !groups.some(group => group.id === item.groupId)
      const platformRank = new Map(platformIds.map((id, index) => [id, index]))
      const platforms = store.get('platforms', []).map(platform => {
        const index = platformRank.get(platform.id)
        return index >= 0 && isInGroup(platform) ? { ...platform, sortOrder: index } : platform
      })
      const systemRank = new Map(loginSystemIds.map((id, index) => [id, index]))
      const systems = store.get('loginSystems', []).map(system => {
        const index = systemRank.get(system.id)
        return index >= 0 && isInGroup(system) ? { ...system, sortOrder: index } : system
      })
      store.set('platforms', platforms)
      store.set('loginSystems', systems)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('delete-group', (_event, groupId) => {
    try {
      const groups = store.get('groups', [])
      const hasInheritedPlatforms = store.get('platforms', []).some(platform =>
        platform.groupId === groupId && platform.accountSource === 'inherit'
      )
      if (hasInheritedPlatforms) {
        return { success: false, error: '请先将继承此分组账号的平台切换为自定义账号' }
      }
      store.set('groups', groups.filter(g => g.id !== groupId))
      const platforms = store.get('platforms', [])
      store.set('platforms', platforms.map(p => (
        p.groupId === groupId ? { ...p, groupId: null } : p
      )))
      const loginSystems = store.get('loginSystems', [])
      store.set('loginSystems', loginSystems.map(system => (
        system.groupId === groupId ? { ...system, groupId: null } : system
      )))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('move-group-item', (_event, { kind, id, groupId = null, beforeId = null } = {}) => {
    try {
      const groups = store.get('groups', [])
      const targetGroupId = groupId ? String(groupId) : null
      if (targetGroupId && !groups.some(group => group.id === targetGroupId)) {
        return { success: false, error: '目标分组不存在' }
      }
      const systems = store.get('loginSystems', [])
      const platforms = store.get('platforms', [])
      const orderedInsert = (items, moved, matchesGroup, targetId) => {
        const ordered = items.filter(item => item.id !== moved.id && matchesGroup(item))
          .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        const insertAt = targetId ? ordered.findIndex(item => item.id === targetId) : -1
        ordered.splice(insertAt < 0 ? ordered.length : insertAt, 0, moved)
        ordered.forEach((item, index) => { item.sortOrder = index })
      }

      if (kind === 'system') {
        const system = systems.find(item => item.id === id)
        if (!system) return { success: false, error: '登录系统不存在' }
        system.groupId = targetGroupId
        orderedInsert(systems, system, item => (item.groupId || null) === targetGroupId, beforeId)
        const linkedPlatforms = platforms.filter(item => item.loginSystemId === system.id)
        let pageOrder = platforms.filter(item => item.type !== 'network' && item.loginSystemId !== system.id &&
          (item.groupId || null) === targetGroupId).length
        for (const platform of linkedPlatforms) {
          platform.groupId = targetGroupId
          platform.sortOrder = pageOrder++
        }
        store.set('loginSystems', systems)
        store.set('platforms', platforms)
        return { success: true }
      }

      if (kind === 'platform') {
        const platform = platforms.find(item => item.id === id)
        if (!platform || platform.type === 'network') return { success: false, error: '网页不存在' }
        const linkedSystem = systems.find(item => item.id === platform.loginSystemId)
        if (linkedSystem && (linkedSystem.groupId || null) !== targetGroupId) {
          return { success: false, error: '请先将关联的登录系统移动到目标分组' }
        }
        platform.groupId = targetGroupId
        orderedInsert(platforms, platform, item => item.type !== 'network' && (item.groupId || null) === targetGroupId, beforeId)
        store.set('platforms', platforms)
        return { success: true }
      }
      return { success: false, error: '不支持的项目类型' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('start-group-login', async (_event, groupId, platformType) => {
    try {
      const platforms = store.get('platforms', [])
        .map(normalizePlatform)
        .filter(p => p.groupId === groupId && !p.skipGroupLogin && (!platformType || p.type === platformType))
      const results = []
      for (const platform of platforms) {
        const result = await loginPlatformById(platform.id)
        results.push({ platformId: platform.id, ...result })
      }
      return { success: true, results }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('logout-platform', async (_event, platformId) => {
    try {
      const platform = getPlatform(platformId)
      if (!platform) return { success: false, error: '平台不存在' }
      const result = await autoLogin.logoutPlatform(platform)
      if (result.success) {
        const statuses = store.get('statuses', {})
        statuses[platformId] = { status: 'idle', lastAttempt: Date.now() }
        store.set('statuses', statuses)
        if (mainWindow) {
          mainWindow.webContents.send('platform-status-update', {
            platformId,
            status: 'idle',
            lastAttempt: Date.now()
          })
        }
      }
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('start-auto-login', async (_event, platformId) => {
    try {
      if (platformId) {
        return await loginPlatformById(platformId)
      } else {
        return await handleLoginAll()
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('connect-wifi', async (_event, ssid) => {
    try {
      const result = await netUtils.connectWiFi(ssid)
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('get-wifi-status', async () => {
    try {
      const result = await netUtils.checkWiFiStatus()
      return result
    } catch (err) {
      return { enabled: false, connected: false, message: err.message }
    }
  })

  ipcMain.handle('enable-wifi', async () => {
    try {
      const result = await netUtils.enableWiFi()
      return result
    } catch (err) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('scan-wifi', async () => {
    try {
      const result = await netUtils.scanWiFi()
      return result
    } catch (err) {
      return { success: false, message: err.message, networks: [] }
    }
  })

  ipcMain.handle('check-internet', async () => {
    try {
      const connected = await checkInternetConnection()
      return { connected }
    } catch (err) {
      return { connected: false, error: err.message }
    }
  })

  ipcMain.handle('get-network-diagnostics', async () => {
    try {
      const [wifi, internet, adapter] = await Promise.all([
        netUtils.getWifiDetails(),
        measureInternetLatency(),
        netUtils.checkWiFiStatus()
      ])
      return {
        ...wifi,
        enabled: adapter.enabled,
        internetConnected: internet.connected,
        latencyMs: internet.latencyMs
      }
    } catch (err) {
      return { supported: false, internetConnected: false, latencyMs: null, message: err.message }
    }
  })

  ipcMain.handle('test-download-speed', async () => {
    try {
      const result = await measureDownloadSpeed()
      return result
    } catch (err) {
      return { success: false, downloadMbps: null, message: err.message }
    }
  })

  ipcMain.handle('network-login', async (_event, platform) => {
    try {
      if (!mainWindow) return { success: false, error: '主窗口未就绪' }
      const result = await networkLogin.networkLogin(mainWindow, platform, {
        account: platform.account,
        password: platform.password
      })
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('set-auto-start', (_event, enable) => {
    try {
      setAutoStart(enable)
      const settings = store.get('settings', {})
      settings.autoStart = enable
      store.set('settings', settings)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('get-settings', () => {
    return store.get('settings', {})
  })

  ipcMain.handle('get-browser-extension-setup', () => {
    const settings = store.get('settings', {})
    const pairingStatus = browserBridge.getPairingStatus()
    const paired = browserBridge.isListening && !!store.get('browserExtensionOrigin', '')
    return {
      pairingCode: browserBridge.isListening ? browserBridge.pairToken : '',
      extensionFolder: getBrowserExtensionFolder(),
      paired,
      pairingError: paired ? '' : pairingStatus.error,
      pairingAttemptedAt: pairingStatus.attemptedAt,
      lastVerified: store.get('browserExtensionLastVerified', 0) || null,
      promptDismissed: !!settings.browserExtensionPromptDismissed,
      bridgeAvailable: !browserBridgeError,
      bridgeError: browserBridgeError
    }
  })

  ipcMain.handle('open-browser-extension-folder', async () => {
    const error = await shell.openPath(getBrowserExtensionFolder())
    return error ? { success: false, error } : { success: true }
  })

  ipcMain.handle('open-browser-extension-manager', (_event, browser) => {
    if (browser !== 'chrome' && browser !== 'edge') {
      return { success: false, error: '请选择 Chrome 或 Edge。' }
    }
    return openBrowserExtensionManager(browser)
  })

  ipcMain.handle('dismiss-browser-extension-prompt', () => {
    const settings = store.get('settings', {})
    store.set('settings', { ...settings, browserExtensionPromptDismissed: true })
    return { success: true }
  })

  ipcMain.handle('unpair-browser-extension', () => {
    try {
      const pairingCode = browserBridge.unpair()
      return { success: true, pairingCode }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('set-settings', (_event, newSettings) => {
    try {
      const settings = store.get('settings', {})
      const merged = { ...settings, ...newSettings }
      store.set('settings', merged)
      if (newSettings.checkInterval !== undefined) {
        startStatusCheckTimer()
      }
      if (newSettings.language !== undefined) {
        setTrayLanguage(newSettings.language)
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('export-data', () => {
    try {
      const data = {
        platforms: store.get('platforms', []).map(normalizePlatform),
        groups: store.get('groups', []),
        loginSystems: store.get('loginSystems', []),
        settings: store.get('settings', {}),
        version: app.getVersion(),
        exportedAt: Date.now()
      }
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('import-data', (_event, data) => {
    try {
      if (!data || !data.platforms) {
        return { success: false, error: '数据格式无效' }
      }
      store.set('platforms', (data.platforms || []).map(normalizePlatform))
      if (Array.isArray(data.groups)) {
        store.set('groups', data.groups)
      }
      if (Array.isArray(data.loginSystems)) {
        store.set('loginSystems', data.loginSystems)
      }
      if (data.settings) {
        store.set('settings', data.settings)
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('test-login', async (_event, platform) => {
    try {
      const testPlatform = {
        ...platform,
        id: 'test_temp'
      }
      const result = await autoLogin.openAndLogin(mainWindow, testPlatform, {
        account: platform.account || '',
        password: platform.password || ''
      })
      crypto.wipeString(platform.account)
      crypto.wipeString(platform.password)
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  recoverPendingLoginStatuses()
  try {
    await browserBridge.listen()
  } catch (err) {
    browserBridgeError = err.message
    await dialog.showMessageBox({
      type: 'error',
      title: 'AutoMate 浏览器扩展连接失败',
      message: '浏览器扩展连接服务无法启动。',
      detail: `本机端口 ${browserBridge.port} 可能已被其他程序或旧版 AutoMate 占用。请关闭其他 AutoMate 进程后重新启动。\n\n${err.message}`
    })
  }
  createWindow().catch(err => console.error('创建主窗口失败:', err.message))
  createTrayInstance()
  setTrayLanguage(store.get('settings', {}).language || 'zh')
  registerIpcHandlers()

  startStatusCheckTimer()

  setTimeout(() => {
    handleScheduledAutoLogin()
  }, 3000)

  powerMonitor.on('resume', () => {
    handleScheduledAutoLogin()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  browserBridge.close()
  stopStatusCheckTimer()
  destroyTray()
})

app.on('quit', () => {
  stopStatusCheckTimer()
})