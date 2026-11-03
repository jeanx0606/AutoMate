const { BrowserView } = require('electron')
const netUtils = require('./netUtils')
const { checkInternetConnection } = require('./network')

const DEFAULT_TIMEOUT = 30000
const MAX_RETRIES = 2

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function executeInPage(view, script) {
  return new Promise((resolve, reject) => {
    view.webContents.executeJavaScript(script, true)
      .then(resolve)
      .catch(reject)
  })
}

function fillFormScript(platform, account, password) {
  const accountSelectors = platform.accountSelector
    ? [platform.accountSelector]
    : [
        'input[name="username"]',
        'input[name="account"]',
        'input[name="user"]',
        'input[name="userid"]',
        'input[name="loginname"]',
        'input[name="cardno"]',
        'input[type="text"][name*="user"]',
        'input[type="text"][name*="account"]',
        'input[type="tel"]',
        'input[type="text"]:not([name*="pass"]):not([name*="code"])'
      ]
  const passwordSelectors = platform.passwordSelector
    ? [platform.passwordSelector]
    : [
        'input[name="password"]',
        'input[name="passwd"]',
        'input[name="pass"]',
        'input[name="pwd"]',
        'input[type="password"]'
      ]

  return `(function() {
    const accountSelectors = ${JSON.stringify(accountSelectors)};
    const passwordSelectors = ${JSON.stringify(passwordSelectors)};
    let accountFilled = false;
    let passwordFilled = false;
    for (const sel of accountSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        try {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(el, ${JSON.stringify(account)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          accountFilled = true;
          break;
        } catch(_) {}
      }
    }
    for (const sel of passwordSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        try {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(el, ${JSON.stringify(password)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          passwordFilled = true;
          break;
        } catch(_) {}
      }
    }
    return accountFilled && passwordFilled;
  })()`
}

function submitScript(platform) {
  const submitSelectors = platform.submitSelector
    ? [platform.submitSelector]
    : [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[name="submit"]',
        'button[name="login"]',
        'a[href*="login"]',
        'button[class*="login"]',
        'button[class*="submit"]',
        'input[class*="login"]',
        '#login',
        '#submit',
        '.login-btn',
        '.submit-btn'
      ]

  return `(function() {
    const selectors = ${JSON.stringify(submitSelectors)};
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        try { el.click(); return true; } catch(_) {}
      }
    }
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) {
      try { forms[0].submit(); return true; } catch(_) {}
    }
    return false;
  })()`
}

function checkResultScript() {
  return `(function() {
    const body = document.body ? document.body.innerText : ''
    const lowerBody = body.toLowerCase()
    const captchaTerms = ['captcha', '验证码', '请输入验证码', '安全验证', '人机验证', '滑块验证', 'geetest', 'recaptcha', 'hcaptcha']
    const captchaSelectors = ['iframe[src*="captcha"]', 'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', '.captcha', '#captcha', '.geetest', '.recaptcha', '.hcaptcha']
    for (const sel of captchaSelectors) {
      if (document.querySelector(sel)) return 'captcha'
    }
    for (const kw of captchaTerms) {
      if (lowerBody.includes(kw.toLowerCase())) return 'captcha'
    }
    const failKeywords = ['密码错误', '账号错误', '登录失败', '用户名或密码', 'login failed', 'incorrect', 'invalid', '认证失败', '认证出错']
    for (const kw of failKeywords) {
      if (lowerBody.includes(kw.toLowerCase())) return 'wrong-credentials'
    }
    const successKeywords = ['登录成功', '欢迎', '退出', '注销', 'logout', 'sign out', 'welcome', '已登录', '成功']
    for (const kw of successKeywords) {
      if (lowerBody.includes(kw.toLowerCase())) return 'success'
    }
    return 'unknown'
  })()`
}

async function checkAuthResult(view, platform) {
  try {
    const result = await executeInPage(view, checkResultScript())
    if (result === 'captcha') return { success: false, code: 'captcha-required' }
    if (result === 'wrong-credentials') return { success: false, code: 'wrong-credentials' }
    if (result === 'success') return { success: true }
    const currentUrl = view.webContents.getURL()
    if (platform.successUrl && currentUrl.includes(platform.successUrl)) return { success: true }
    if (platform.url && !currentUrl.includes('login') && currentUrl !== platform.url) return { success: true }
    return { success: false, code: '' }
  } catch (_) {
    return { success: false, code: '' }
  }
}

async function createBrowserView(parentWindow, url) {
  const view = new BrowserView({
    webPreferences: {
      partition: 'persist:automate-browser',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  parentWindow.addBrowserView(view)
  const [width, height] = parentWindow.getContentSize()
  view.setBounds({ x: 0, y: 0, width: Math.max(width, 100), height: Math.max(height, 100) })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('页面加载超时')), DEFAULT_TIMEOUT)
    view.webContents.once('did-finish-load', () => {
      clearTimeout(timer)
      resolve()
    })
    view.webContents.once('did-fail-load', (_event, code, desc) => {
      if (code === -3) return // ERR_ABORTED: navigation superseded, ignore
      clearTimeout(timer)
      reject(new Error(`页面加载失败: ${desc || code}`))
    })
    view.webContents.loadURL(url).catch(err => {
      clearTimeout(timer)
      reject(err)
    })
  })
  await sleep(1500)
  return view
}

function removeBrowserView(parentWindow, view) {
  try {
    if (parentWindow && !parentWindow.isDestroyed()) {
      parentWindow.removeBrowserView(view)
    }
  } catch (_) {}
  try {
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.destroy()
    }
  } catch (_) {}
}

async function networkLogin(parentWindow, platform, credentials) {
  const { wifiName, url } = platform
  const account = credentials.account
  const password = credentials.password

  if (wifiName) {
    const wifiResult = await netUtils.connectWiFi(wifiName)
    if (!wifiResult.success) {
      return { success: false, code: 'network-unreachable', message: `WiFi 连接失败: ${wifiResult.message}`, attempt: 1, timestamp: Date.now() }
    }
    await sleep(3000)
  }

  if (platform.requiresAuth === false) {
    return { success: true, message: `已连接到 ${wifiName || 'WiFi'}`, attempt: 1, timestamp: Date.now() }
  }

  const beforeLogin = await checkInternetConnection()
  if (beforeLogin) {
    return { success: true, message: '网络已连接，无需认证', attempt: 1, timestamp: Date.now() }
  }

  let view = null
  try {
    view = await createBrowserView(parentWindow, url)

    const filled = await executeInPage(view, fillFormScript(platform, account, password))
    if (!filled) throw new Error('未找到登录表单输入框')
    await sleep(500)

    const submitted = await executeInPage(view, submitScript(platform))
    if (!submitted) throw new Error('未找到提交按钮')
    await sleep(3000)

    const authResult = await checkAuthResult(view, platform)
    if (!authResult.success) {
      if (authResult.code === 'captcha-required') {
        return { success: false, code: 'captcha-required', message: '页面出现验证码，AutoMate 无法自动完成登录。请手动输入验证码后提交。', attempt: 1, timestamp: Date.now() }
      }
      if (authResult.code === 'wrong-credentials') {
        return { success: false, code: 'wrong-credentials', message: '账号或密码错误，请检查凭据是否正确。', attempt: 1, timestamp: Date.now() }
      }
      throw new Error('登录可能失败，请检查页面')
    }
    await sleep(2000)

    const afterLogin = await checkInternetConnection()
    if (afterLogin) {
      return { success: true, message: '网络认证成功', attempt: 1, timestamp: Date.now() }
    }
    return {
      success: false,
      message: '已提交认证，但网络尚未连通。请稍后重试或检查门户提示。',
      attempt: 1,
      timestamp: Date.now()
    }
  } catch (err) {
    const code = err.message.includes('超时') || err.message.includes('加载失败') ? 'network-unreachable' : ''
    return { success: false, code, message: err.message, attempt: 1, timestamp: Date.now() }
  } finally {
    if (view) removeBrowserView(parentWindow, view)
  }
}

module.exports = {
  networkLogin,
  DEFAULT_TIMEOUT,
  MAX_RETRIES
}