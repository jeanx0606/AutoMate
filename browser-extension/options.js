const BRIDGE = 'http://127.0.0.1:32147'
const codeInput = document.querySelector('#pairing-code')
const pairButton = document.querySelector('#pair-button')
const pairStatus = document.querySelector('#pair-status')
const refreshButton = document.querySelector('#refresh-button')
const siteList = document.querySelector('#site-list')
const unpairButton = document.querySelector('#unpair-button')
let pairingRevision = 0

pairButton.addEventListener('click', pairWithApp)
refreshButton.addEventListener('click', loadSites)
unpairButton.addEventListener('click', unpairFromApp)

chrome.storage.local.get(['token'], ({ token }) => {
  if (token && pairingRevision === 0) {
    codeInput.value = token
    verifyPairing(token, pairingRevision)
  }
})

async function verifyPairing(token, revision) {
  try {
    const response = await fetch(`${BRIDGE}/status`, {
      headers: { 'X-AutoMate-Token': token }
    })
    const result = await response.json()
    if (revision !== pairingRevision) return
    if (response.ok) {
      setStatus('此扩展已与 AutoMate 配对。', 'success')
      unpairButton.hidden = false
      await loadSites(token, revision)
    } else if (response.status === 403) {
      const renewedToken = await renewSession(revision)
      if (revision !== pairingRevision) return
      if (renewedToken) {
        await loadSites(renewedToken, revision, false)
      } else {
        const current = await chrome.storage.local.get(['token'])
        if (revision !== pairingRevision || current.token !== token) return
        await chrome.storage.local.remove(['token', 'pairingCode'])
        codeInput.value = ''
        unpairButton.hidden = true
        siteList.replaceChildren()
        setStatus(`此扩展未与当前 AutoMate 配对：${result.error || '会话失效'}。请粘贴当前配对码重新配对。`, 'error')
      }
    } else {
      const current = await chrome.storage.local.get(['token'])
      if (revision !== pairingRevision || current.token !== token) return
      await chrome.storage.local.remove(['token'])
      codeInput.value = ''
      unpairButton.hidden = true
      siteList.replaceChildren()
      setStatus(`此扩展未与当前 AutoMate 配对：${result.error || '配对码无效'}。请确认只有一个 AutoMate 实例运行，再粘贴该实例设置页中的配对码。`, 'error')
    }
  } catch (error) {
    setStatus(`无法连接 AutoMate：${error.message}`, 'error')
  }
}

async function pairWithApp() {
  const revision = ++pairingRevision
  const pairingCode = codeInput.value.trim()
  if (!pairingCode) {
    setStatus('请先粘贴 AutoMate 配对码。', 'error')
    return
  }

  pairButton.disabled = true
  setStatus('正在连接 AutoMate…')
  try {
    const response = await fetch(`${BRIDGE}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: pairingCode })
    })
    const result = await response.json()
    if (revision !== pairingRevision) return
    if (!response.ok) {
      const detail = response.status === 401
        ? '配对码与当前正在运行的 AutoMate 不一致。请确认只有一个 AutoMate 实例运行，再复制其设置页中的配对码。'
        : result.error || '配对失败'
      throw new Error(detail)
    }
    if (!result.sessionToken) throw new Error('AutoMate did not return an extension session. Reload AutoMate and try pairing again.')
    const token = result.sessionToken
    await chrome.storage.local.set({ token, pairingCode })
    if (revision !== pairingRevision) return
    setStatus('已配对。之后访问已配置网站时会自动填充。', 'success')
    unpairButton.hidden = false
    codeInput.value = ''
    await loadSites(token, revision)
  } catch (error) {
    if (revision === pairingRevision) setStatus(`无法连接 AutoMate：${error.message}`, 'error')
  } finally {
    if (revision === pairingRevision) pairButton.disabled = false
  }
}

async function unpairFromApp() {
  pairingRevision += 1
  const { token } = await chrome.storage.local.get(['token'])
  if (token) {
    try {
      await fetch(`${BRIDGE}/unpair`, {
        method: 'POST',
        headers: { 'X-AutoMate-Token': token }
      })
    } catch (_) {}
  }
  await chrome.storage.local.remove(['token', 'pairingCode'])
  codeInput.value = ''
  unpairButton.hidden = true
  siteList.replaceChildren()
  setStatus('已解除配对。将 AutoMate 设置页当前显示的配对码粘贴到上方，重新配对。', '')
}

async function loadSites(token = null, revision = pairingRevision, allowSessionRenewal = true) {
  if (token === null) {
    const stored = await chrome.storage.local.get(['token'])
    token = stored.token
  }
  if (revision !== pairingRevision) return
  if (!token) {
    siteList.replaceChildren()
    unpairButton.hidden = true
    return
  }
  try {
    let response = await fetch(`${BRIDGE}/platforms`, {
      headers: { 'X-AutoMate-Token': token }
    })
    let result = await response.json()
    if (revision !== pairingRevision) return
    if (response.status === 403) {
      const current = await chrome.storage.local.get(['token'])
      if (revision !== pairingRevision || current.token !== token) return
      if (allowSessionRenewal) {
        const renewedToken = await renewSession(revision)
        if (revision !== pairingRevision) return
        if (renewedToken) {
          await loadSites(renewedToken, revision, false)
          return
        }
      }
      await chrome.storage.local.remove(['token', 'pairingCode'])
      codeInput.value = ''
      unpairButton.hidden = true
      setStatus(`AutoMate 拒绝当前扩展会话：${result.error || 'HTTP 403'}。请粘贴设置页当前配对码重新配对。`, 'error')
      return
    }
    if (!response.ok) throw new Error(result.error || '读取失败')
    siteList.replaceChildren()
    if (!result.platforms.length) {
      appendMessage('AutoMate 中还没有配置网页登录平台。')
      return
    }
    for (const platform of result.platforms) {
      const item = document.createElement('li')
      const name = document.createElement('strong')
      const origin = document.createElement('span')
      name.textContent = platform.name
      origin.textContent = platform.origin
      item.append(name, origin)
      siteList.append(item)
    }
  } catch (error) {
    setStatus(`无法读取网站列表：${error.message}`, 'error')
  }
}

function appendMessage(message) {
  const item = document.createElement('li')
  item.textContent = message
  item.className = 'empty'
  siteList.append(item)
}

function setStatus(message, type = '') {
  pairStatus.textContent = message
  pairStatus.className = `status ${type}`
}

async function renewSession(revision) {
  const { pairingCode } = await chrome.storage.local.get(['pairingCode'])
  if (!pairingCode || revision !== pairingRevision) return null
  const response = await fetch(`${BRIDGE}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: pairingCode })
  })
  const result = await response.json()
  if (revision !== pairingRevision) return null
  if (!response.ok || !result.sessionToken) {
    setStatus(`无法续期扩展会话：${result.error || `HTTP ${response.status}`}。请确认配对码仍是 AutoMate 设置页当前显示的值。`, 'error')
    return null
  }
  await chrome.storage.local.set({ token: result.sessionToken })
  return result.sessionToken
}