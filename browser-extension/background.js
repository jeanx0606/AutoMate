const BRIDGE = 'http://127.0.0.1:32147'
const activeRequests = new Set()

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url || !/^https?:\/\//i.test(tab.url)) return
  fillConfiguredPage(tabId, tab.url)
})

async function fillConfiguredPage(tabId, url, retry = 0) {
  const requestKey = `${tabId}:${url}`
  if (activeRequests.has(requestKey)) return
  activeRequests.add(requestKey)

  try {
    const { token } = await chrome.storage.local.get(['token'])
    if (!token) return

    const platformResponse = await fetch(`${BRIDGE}/platforms`, {
      headers: { 'X-AutoMate-Token': token }
    })
    if (!platformResponse.ok) {
      await logBridgeFailure(platformResponse, '/platforms')
      return
    }
    const { platforms } = await platformResponse.json()
    const currentUrl = new URL(url)
    const matchesPlatform = platforms.some(platform => {
      const configuredUrl = new URL(platform.url)
      const configuredPath = configuredUrl.pathname.replace(/\/$/, '') || '/'
      const currentPath = currentUrl.pathname.replace(/\/$/, '') || '/'
      return configuredUrl.origin === currentUrl.origin &&
        (configuredPath === '/' || currentPath === configuredPath || currentPath.startsWith(`${configuredPath}/`))
    })
    if (!matchesPlatform) return

    const response = await fetch(`${BRIDGE}/autofill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AutoMate-Token': token
      },
      body: JSON.stringify({ url })
    })

    if (!response.ok) {
      await logBridgeFailure(response, '/autofill')
      return
    }
    const credentials = await response.json()
    const attemptKey = `submitted:${tabId}:${credentials.platformId}:${credentials.loginRequestId || 'browser'}`
    const priorAttempt = await chrome.storage.session.get([attemptKey])
    if (priorAttempt[attemptKey]) return

    await chrome.tabs.update(tabId, { active: true })
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: fillLoginForm,
      args: [credentials]
    })
    const frameResults = results.map(frame => frame.result).filter(Boolean)
    const result = frameResults.find(frame => frame.filled) || frameResults[0]
    let status = result?.filled ? 'pending' : 'failed'
    let message = result?.message || '未检测到登录表单'
    let code = result?.code || ''
    if (result?.submitted) {
      await chrome.storage.session.set({ [attemptKey]: Date.now() })
      await new Promise(resolve => setTimeout(resolve, 2500))
      try {
        const inspected = await chrome.scripting.executeScript({
          target: { tabId },
          func: inspectLoginResult,
          args: [credentials.successUrl]
        })
        status = inspected[0]?.result?.status || 'pending'
        message = inspected[0]?.result?.message || '登录已提交，结果未确认'
        code = inspected[0]?.result?.code || ''
      } catch (_) {
        message = '登录已提交，页面在结果检查前已导航离开'
        code = ''
      }
    } else if (result?.filled) {
      message = '凭据已填写，未检测到提交按钮'
    }
    const resultResponse = await fetch(`${BRIDGE}/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AutoMate-Token': token
      },
      body: JSON.stringify({
        platformId: credentials.platformId,
        status,
        message,
        code
      })
    })
    if (!resultResponse.ok) await logBridgeFailure(resultResponse, '/result')
    if (result?.filled && !result.submitted) {
      console.info('AutoMate filled the login form; no submit control was detected.')
    }
  } catch (error) {
    if (retry < 2) {
      setTimeout(() => {
        activeRequests.delete(requestKey)
        fillConfiguredPage(tabId, url, retry + 1)
      }, 1500 * (retry + 1))
    }
  } finally {
    activeRequests.delete(requestKey)
  }
}

async function logBridgeFailure(response, endpoint) {
  let detail = ''
  try {
    const payload = await response.clone().json()
    detail = payload.error || ''
  } catch (_) {}
  console.error(`AutoMate bridge ${endpoint} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
}

function inspectLoginResult(successUrl) {
  const pageText = document.body?.innerText || ''
  const body = pageText.toLowerCase()
  try {
    const payload = JSON.parse(pageText)
    if (payload && payload.error) {
      return { status: 'failed', code: 'wrong-credentials', message: `网站返回错误: ${String(payload.error)}` }
    }
  } catch (_) {}

  const credentialTerms = ['incorrect', 'invalid password', 'wrong password', 'login failed', '登录失败', '密码错误', '账号错误', '用户名或密码', '认证失败', '认证出错']
  const captchaTerms = ['captcha', '验证码', '请输入验证码', '安全验证', '人机验证', '滑块验证', 'geetest', 'recaptcha', 'hcaptcha']
  const successTerms = ['welcome', 'logout', 'sign out', '登录成功', '退出登录', '注销', '认证成功']

  if (captchaTerms.some(term => body.includes(term.toLowerCase()))) {
    return { status: 'failed', code: 'captcha-required', message: '页面出现验证码，AutoMate 无法自动完成登录。请手动输入验证码后提交。' }
  }
  if (credentialTerms.some(term => body.includes(term.toLowerCase()))) {
    return { status: 'failed', code: 'wrong-credentials', message: '账号或密码错误，请检查凭据是否正确。' }
  }
  if ((successUrl && location.href.includes(successUrl)) || successTerms.some(term => body.includes(term.toLowerCase()))) {
    return { status: 'success', code: '', message: '登录成功' }
  }
  return { status: 'pending', code: '', message: '登录已提交，结果未确认' }
}
async function fillLoginForm(credentials) {

  const accountSelectors = credentials.accountSelector
    ? [credentials.accountSelector]
    : [
        'input[autocomplete="username"]',
        'input[name="username"]',
        'input[name="account"]',
        'input[name="user"]',
        'input[name="userid"]',
        'input[name="loginname"]',
        'input[name="cardno"]',
        'input[name*="user" i]',
        'input[id*="user" i]',
        'input[name*="account" i]',
        'input[id*="account" i]',
        'input[type="text"][name*="user"]',
        'input[type="text"][name*="account"]',
        'input[type="email"]',
        'input[type="tel"]',
        'input[type="text"]:not([name*="pass"]):not([name*="code"]):not([autocomplete="one-time-code"])'
      ]

  const passwordSelectors = credentials.passwordSelector
    ? [credentials.passwordSelector]
    : [
        'input[name="password"]',
        'input[name="passwd"]',
        'input[name="pass"]',
        'input[name="pwd"]',
        'input[type="password"]'
      ]

  function findInput(selectors) {
    for (const selector of selectors) {
      try {
        const inputs = document.querySelectorAll(selector)
        for (const input of inputs) {
          const style = getComputedStyle(input)
          if (input instanceof HTMLInputElement && !input.disabled && !input.readOnly &&
              input.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
            return input
          }
        }
      } catch (_) {}
    }

    return null
  }

  // Try to activate/focus the page.
  function activatePage() {
    try {
      window.focus()
    } catch (_) {}

    try {
      document.body?.focus({ preventScroll: true })
    } catch (_) {}

    try {
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2
      }))
    } catch (_) {}
  }

  // Simulate interaction with an element.
  function activateElement(element) {
    try {
      element.scrollIntoView({
        behavior: 'instant',
        block: 'center'
      })
    } catch (_) {}

    try {
      element.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
      }))

      element.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      }))

      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }))
    } catch (_) {}

    try {
      element.focus()
    } catch (_) {}
  }

  // Activate page before doing anything.
  activatePage()

  // Detect captcha before attempting to fill.
  const captchaSelectors = [
    'iframe[src*="captcha"]', 'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]',
    'iframe[src*="geetest"]', '.captcha', '#captcha', '.geetest', '#geetest',
    '.recaptcha', '#recaptcha', '.hcaptcha', '#hcaptcha',
    'canvas[class*="captcha"]', 'img[class*="captcha"]', 'img[id*="captcha"]'
  ]
  for (const sel of captchaSelectors) {
    try {
      if (document.querySelector(sel)) {
        return {
          filled: false,
          submitted: false,
          code: 'captcha-required',
          message: '页面出现验证码，AutoMate 无法自动完成登录。请手动输入验证码后提交。'
        }
      }
    } catch (_) {}
  }

  // Find inputs.
  const deadline = Date.now() + 5000

  let accountInput = findInput(accountSelectors)
  let passwordInput = findInput(passwordSelectors)

  while ((!accountInput || !passwordInput) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100))

    accountInput = findInput(accountSelectors)
    passwordInput = findInput(passwordSelectors)
  }

  if (!accountInput || !passwordInput) {
    return {
      filled: false,
      submitted: false,
      message: '未检测到登录输入框'
    }
  }

  // Set input value immediately.
  function setValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set

    if (setter) {
      setter.call(input, String(value))
    } else {
      input.value = String(value)
    }

    input.dispatchEvent(new Event('input', {
      bubbles: true,
      cancelable: true
    }))

    input.dispatchEvent(new Event('change', {
      bubbles: true,
      cancelable: true
    }))
  }

  // Simulate normal user interaction with username.
  activateElement(accountInput)

  setValue(accountInput, credentials.account)

  // Simulate normal user interaction with password.
  activateElement(passwordInput)

  setValue(passwordInput, credentials.password)

  // Let the site's own event handlers process the final input.
  await new Promise(resolve => setTimeout(resolve, 100))

  if (passwordInput.value !== String(credentials.password)) {
    return {
      filled: false,
      submitted: false,
      code: 'password-mutated',
      message: '网页修改了自动填入的密码，AutoMate 已停止提交。'
    }
  }

  // Find login button.
  const submitSelectors = credentials.submitSelector
    ? [credentials.submitSelector]
    : [
        '.login-button',
        'button[type="submit"]',
        'input[type="submit"]',
        'button[name="login"]',
        'button[class*="login"]',
        '#login',
        '.login-btn',
        '.submit-btn'
      ]

  let button = null
  for (const selector of submitSelectors) {
    try {
      const found = document.querySelector(selector)
      if (found) {
        button = found
        console.log('AutoMate found login button:', {
          selector,
          className: button.className,
          disabled: button.disabled
        })
        break
      }
    } catch (_) {}
  }

  if (!button) {
    return {
      filled: true,
      submitted: false,
      message: '未检测到登录按钮'
    }
  }

  // Check whether the WEBSITE has enabled the button.
  function isReady(button) {
    if (!(button instanceof HTMLElement)) {
      return false
    }
    if (button.disabled === true) {
      return false
    }
    if (button.getAttribute('aria-disabled') === 'true') {
      return false
    }
    if (button.classList.contains('disabled')) {
      return false
    }
    if (button.classList.contains('ant-btn-disabled')) {
      return false
    }
    return true
  }

  // Wait for the website to enable the button.
  // We check frequently so we click immediately when it becomes ready.
  const buttonDeadline = Date.now() + 10000
  while (Date.now() < buttonDeadline) {
    if (isReady(button)) {
      console.log('AutoMate: login button is ready:', {
        className: button.className,
        disabled: button.disabled
      })

      if (passwordInput.value !== String(credentials.password)) {
        return {
          filled: false,
          submitted: false,
          code: 'password-mutated',
          message: '网页修改了自动填入的密码，AutoMate 已停止提交。'
        }
      }

      // Simulate interaction, then perform the actual click.
      activateElement(button)
      button.click()
      return { filled: true, submitted: true }
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  console.log('AutoMate: login button never became ready:', {
    className: button.className,
    disabled: button.disabled
  })

  return {
    filled: true,
    submitted: false,
    message: '登录按钮未变为可点击状态'
  }
}

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.get(null).then(items => {
    const updates = {}
    for (const key of Object.keys(items)) {
      if (key.startsWith(`submitted:${tabId}:`)) updates[key] = undefined
    }
    return chrome.storage.session.remove(Object.keys(updates))
  }).catch(() => {})
})
// Heartbeat: on browser startup and (re)install, verify our token against the app.
// If the pairing is stale, clear our token so the extension and app stay in sync.
chrome.runtime.onStartup.addListener(verifyToken)
chrome.runtime.onInstalled.addListener(verifyToken)

async function verifyToken() {
  try {
    const { token } = await chrome.storage.local.get(['token'])
    if (!token) return
    const response = await fetch(`${BRIDGE}/status`, {
      headers: { 'X-AutoMate-Token': token }
    })
    if (!response.ok) {
      await chrome.storage.local.remove(['token'])
    }
  } catch (_) {}
}