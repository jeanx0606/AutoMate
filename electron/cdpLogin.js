const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const WebSocketClient = require('./wsClient')

const DEFAULT_TIMEOUT = 30000
const MAX_RETRIES = 2
const LAUNCH_TIMEOUT = 10000

const BROWSER_PATHS = {
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ],
  edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ]
}

const PROFILE_DIRS = {
  chrome: path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
  edge: path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function detectDefaultBrowser() {
  for (const name of ['chrome', 'edge']) {
    for (const p of BROWSER_PATHS[name]) {
      try {
        if (fs.existsSync(p)) {
          return { name, path: p }
        }
      } catch (_) {}
    }
  }
  return null
}

function httpJson(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(new Error('无法解析调试端口响应'))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(5000, () => {
      req.destroy(new Error('调试端口请求超时'))
    })
    req.end()
  })
}

function pollPortFile(portFile, child, timeout = LAUNCH_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(() => {
      if (child.exitCode !== null) {
        clearInterval(timer)
        reject(new Error('浏览器启动后立即退出'))
        return
      }
      try {
        const content = fs.readFileSync(portFile, 'utf8')
        const port = parseInt(content.split(/\r?\n/)[0], 10)
        if (!isNaN(port) && port > 0) {
          clearInterval(timer)
          resolve({ port, browserWsUrl: content.split(/\r?\n/)[1] || '' })
        }
      } catch (_) {}
      if (Date.now() - start > timeout) {
        clearInterval(timer)
        reject(new Error('等待浏览器调试端口超时'))
      }
    }, 250)
  })
}

function launchBrowser(browser, profileDir, url) {
  const args = [
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    url
  ]
  if (profileDir) args.push(`--user-data-dir=${profileDir}`)
  const child = spawn(browser.path, args, { stdio: 'ignore', windowsHide: true })
  const portFile = path.join(profileDir || PROFILE_DIRS[browser.name], 'DevToolsActivePort')
  return pollPortFile(portFile, child)
    .then((info) => ({ child, ...info, profileDir, browser }))
    .catch((err) => {
      try { child.kill() } catch (_) {}
      throw err
    })
}

async function openPage(port, url) {
  const startTime = Date.now()
  while (Date.now() - startTime < 5000) {
    const targets = await httpJson('GET', `http://127.0.0.1:${port}/json/list`)
    const page = targets.find(t => t.type === 'page') || null
    if (page && page.webSocketDebuggerUrl) {
      return page
    }
    await sleep(200)
  }
  throw new Error('无法获取浏览器页面调试地址')
}

async function navigateToUrl(session, url) {
  await session.send('Page.navigate', { url })
  await sleep(500)
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocketClient(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.listener = null
  }

  async connect() {
    this.ws.on('message', (buf) => {
      let msg
      try {
        msg = JSON.parse(buf.toString())
      } catch (_) {
        return
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      } else if (msg.method && this.listener) {
        this.listener(msg.method, msg.params)
      }
    })
    this.ws.on('close', () => {
      const err = new Error('浏览器调试连接已断开')
      for (const { reject } of this.pending.values()) reject(err)
      this.pending.clear()
    })
    await this.ws.connect()
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 命令超时: ${method}`))
        }
      }, DEFAULT_TIMEOUT)
    })
  }

  evaluate(expression) {
    return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      .then((res) => {
        if (res.exceptionDetails) {
          throw new Error('页面脚本执行异常')
        }
        return res.result && res.result.value
      })
  }

  close() {
    try { this.ws.close() } catch (_) {}
  }
}

async function waitPageReady(session, timeout = DEFAULT_TIMEOUT) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const state = await session.evaluate('document.readyState')
      if (state === 'complete') return true
    } catch (_) {}
    await sleep(500)
  }
  throw new Error('页面加载超时')
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
      const els = document.querySelectorAll(sel);
      if (els.length) {
        try {
          const el = els[els.length - 1];
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
      const els = document.querySelectorAll(sel);
      if (els.length) {
        try {
          const el = els[els.length - 1];
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

function checkScript(platform) {
  return `(function() {
    const body = document.body ? document.body.innerText : '';
    const lowerBody = body.toLowerCase();
    const captchaTerms = ['captcha', '验证码', '请输入验证码', '安全验证', '人机验证', '滑块验证', 'geetest', 'recaptcha', 'hcaptcha'];
    const captchaSelectors = ['iframe[src*="captcha"]', 'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', '.captcha', '#captcha', '.geetest', '.recaptcha', '.hcaptcha'];
    for (const sel of captchaSelectors) {
      if (document.querySelector(sel)) return 'captcha';
    }
    for (const kw of captchaTerms) {
      if (lowerBody.includes(kw.toLowerCase())) return 'captcha';
    }
    const credentialTerms = ['密码错误', '账号错误', '登录失败', '用户名或密码', 'login failed', 'incorrect', 'invalid', '认证失败', '认证出错'];
    for (const kw of credentialTerms) {
      if (lowerBody.includes(kw.toLowerCase())) return 'wrong-credentials';
    }
    const successKeywords = ['登录成功', '欢迎', '退出', '注销', 'logout', 'sign out', 'welcome', '已登录', '成功'];
    for (const kw of successKeywords) {
      if (lowerBody.includes(kw.toLowerCase())) return 'success';
    }
    return 'unknown';
  })()`
}

async function checkLoginResult(session, platform, url) {
  const mark = await session.evaluate(checkScript(platform))
  if (mark === 'captcha') return { success: false, code: 'captcha-required' }
  if (mark === 'wrong-credentials') return { success: false, code: 'wrong-credentials' }
  if (mark === 'success') return { success: true }
  if (platform.successUrl && url && url.includes(platform.successUrl)) return { success: true }
  if (platform.url && url && !url.includes('login') && url !== platform.url) return { success: true }
  try {
    const cookies = await session.send('Network.getCookies').catch(() => null)
    if (cookies && Array.isArray(cookies.cookies) && cookies.cookies.length > 0) return { success: true }
  } catch (_) {}
  return { success: false, code: '' }
}

async function closeBrowser(launched) {
  for (const attempt of [0, 1]) {
    try {
      if (attempt === 0 && launched.browserWsUrl) {
        const bs = new CdpSession(launched.browserWsUrl)
        await bs.connect()
        await bs.send('Browser.close')
        bs.close()
      } else {
        await new Promise((resolve) => {
          try { launched.child.kill() } catch (_) {}
          resolve()
        })
      }
      break
    } catch (_) {}
  }
  if (launched.profileDir && launched.isTempProfile) {
    setTimeout(() => {
      try { fs.rmSync(launched.profileDir, { recursive: true, force: true }) } catch (_) {}
    }, 2000)
  }
}

async function openAndLogin(platform, credentials) {
  const browser = detectDefaultBrowser()
  if (!browser) {
    return { success: false, message: '未检测到 Chrome/Edge 浏览器，将使用系统打开登录页', manualFallback: true, attempt: 0, timestamp: Date.now() }
  }

  let launched = null
  try {
    launched = await launchBrowser(browser, null, platform.url)
  } catch (_) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automate-web-'))
    try {
      launched = await launchBrowser(browser, tempDir, platform.url)
      launched.isTempProfile = true
    } catch (err) {
      return { success: false, message: `无法启动浏览器自动登录: ${err.message}`, manualFallback: true, attempt: 0, timestamp: Date.now() }
    }
  }

  let page = null
  let session = null
  let lastError = null
  let lastCode = ''
  try {
    page = await openPage(launched.port, platform.url)
    session = new CdpSession(page.webSocketDebuggerUrl)
    await session.connect()

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await waitPageReady(session)
        const filled = await session.evaluate(fillFormScript(platform, credentials.account, credentials.password))
        if (!filled) throw new Error('未找到登录表单输入框')
        await sleep(500)
        const submitted = await session.evaluate(submitScript(platform))
        if (!submitted) throw new Error('未找到提交按钮')
        await sleep(3000)

        const url = await session.evaluate('location.href')
        const result = await checkLoginResult(session, platform, url)
        if (result.success) {
          await closeBrowser(launched)
          session.close()
          return { success: true, message: '登录成功', attempt: attempt + 1, timestamp: Date.now() }
        }
        lastCode = result.code || ''
        if (lastCode === 'captcha-required') {
          await closeBrowser(launched)
          session.close()
          return { success: false, code: 'captcha-required', message: '页面出现验证码，AutoMate 无法自动完成登录。请手动输入验证码后提交。', attempt: attempt + 1, timestamp: Date.now() }
        }
        if (lastCode === 'wrong-credentials') {
          lastError = new Error('账号或密码错误，请检查凭据是否正确。')
        } else {
          lastError = new Error('登录可能失败，请检查页面')
        }
      } catch (err) {
        lastError = err
        if (err.message.includes('超时') || err.message.includes('timeout')) {
          lastCode = 'network-unreachable'
        }
      }
      if (attempt < MAX_RETRIES) {
        try {
          await session.send('Page.navigate', { url: platform.url })
          await waitPageReady(session)
        } catch (_) {}
        await sleep(2000)
      }
    }

    session.close()
    await closeBrowser(launched)
    const code = lastCode || (lastError?.message.includes('超时') ? 'network-unreachable' : '')
    return {
      success: false,
      code,
      message: lastError ? lastError.message : '登录失败',
      attempt: MAX_RETRIES + 1,
      timestamp: Date.now()
    }
  } catch (err) {
    if (session) session.close()
    await closeBrowser(launched)
    const code = err.message.includes('超时') || err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND') ? 'network-unreachable' : ''
    return { success: false, code, message: err.message, attempt: MAX_RETRIES + 1, timestamp: Date.now() }
  }
}


async function logout(platform) {
  const browser = detectDefaultBrowser()
  if (!browser) {
    return { success: false, message: '未检测到浏览器，无法执行退出登录' }
  }
  let launched = null
  try {
    launched = await launchBrowser(browser, null, platform.logoutUrl || platform.url)
  } catch (_) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automate-web-'))
    try {
      launched = await launchBrowser(browser, tempDir, platform.logoutUrl || platform.url)
      launched.isTempProfile = true
    } catch (err) {
      return { success: false, message: `无法启动浏览器: ${err.message}` }
    }
  }
  let session = null
  try {
    const page = await openPage(launched.port, platform.logoutUrl || platform.url)
    session = new CdpSession(page.webSocketDebuggerUrl)
    await session.connect()

    await waitPageReady(session)
    session.close()
    await closeBrowser(launched)
    return { success: true, message: '已打开退出登录页面' }
  } catch (err) {
    if (session) session.close()
    await closeBrowser(launched)
    return { success: false, message: err.message }
  }
}

module.exports = {
  openAndLogin,
  logout,
  detectDefaultBrowser,
  MAX_RETRIES
}