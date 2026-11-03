const { exec, execFile, execSync } = require('child_process')
const os = require('os')

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message))
      else resolve(stdout)
    })
  })
}

function execElevatedPromise(file, args) {
  const powershellArgs = args
    .map(arg => `'${String(arg).replace(/'/g, "''")}'`)
    .join(', ')
  const script = [
    `$process = Start-Process -FilePath '${file}' -ArgumentList @(${powershellArgs}) -Verb RunAs -Wait -PassThru`,
    'exit $process.ExitCode'
  ].join('; ')

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script
    ], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message))
      else resolve(stdout)
    })
  })
}

function isWindows() {
  return os.platform() === 'win32'
}

function parseWifiDetails(output) {
  const blocks = String(output).split(/(?=^\s*(?:Name|名称)\s*:)/im)
  const interfaces = blocks.map(block => {
    const field = pattern => block.match(pattern)?.[1]?.trim() || null
    const state = field(/^\s*(?:State|状态)\s*:\s*(.+)$/im)
    const signal = field(/^\s*(?:Signal|信号)\s*:\s*(\d+)\s*%/im)
    const numeric = pattern => {
      const raw = block.match(pattern)?.[1]?.trim() || null
      return raw === null ? null : Number(raw)
    }
    return {
      name: field(/^\s*(?:Name|名称)\s*:\s*(.+)$/im),
      ssid: field(/^\s*SSID\s*:\s*(.+)$/im),
      connected: /^(?:connected|已连接)$/i.test(state || ''),
      signalPercent: signal === null ? null : Number(signal),
      receiveRateMbps: numeric(/(?:Receive rate|接收速率)\s*\(?Mbps\)?\s*:\s*(\d+(?:\.\d+)?)/im),
      transmitRateMbps: numeric(/(?:Transmit rate|传输速率)\s*\(?Mbps\)?\s*:\s*(\d+(?:\.\d+)?)/im),
      radioType: field(/^\s*(?:Radio type|无线电类型)\s*:\s*(.+)$/im),
      channel: numeric(/^\s*(?:Channel|信道)\s*:\s*(\d+)/im),
      band: field(/^\s*(?:Band|频带)\s*:\s*(.+)$/im)
    }
  }).filter(iface => iface.name || iface.ssid || iface.connected || iface.signalPercent !== null)

  return interfaces.find(iface => iface.connected) || interfaces.find(iface => iface.ssid) || interfaces[0] || {
    name: null,
    ssid: null,
    connected: false,
    signalPercent: null,
    receiveRateMbps: null,
    transmitRateMbps: null,
    radioType: null,
    channel: null,
    band: null
  }
}

async function getWifiDetails() {
  if (!isWindows()) {
    return { supported: false, name: null, ssid: null, connected: false, signalPercent: null, message: '仅支持 Windows' }
  }
  try {
    const details = parseWifiDetails(await execPromise('netsh wlan show interfaces'))
    return { supported: true, ...details }
  } catch (err) {
    return {
      supported: true,
      name: null,
      ssid: null,
      connected: false,
      signalPercent: null,
      message: err.message
    }
  }
}

function getWifiInterfaceName() {
  if (!isWindows()) return null
  try {
    const output = execSync('netsh interface show interface', { encoding: 'utf8' })
    const lines = output.split('\n')
    for (const line of lines) {
      if (line.includes('WiFi') || line.includes('Wi-Fi') || line.includes('无线') || line.includes('WLAN')) {
        const parts = line.trim().split(/\s{2,}/)
        if (parts.length >= 4) return parts.slice(3).join(' ')
      }
    }
  } catch (_) {}
  return null
}

async function checkWiFiStatus() {
  if (!isWindows()) {
    return { enabled: false, connected: false, message: '仅支持 Windows' }
  }
  const candidates = []
  const iface = getWifiInterfaceName()
  if (iface) candidates.push(iface)
  candidates.push('Wi-Fi', 'WLAN', 'Wireless Network Connection', '无线网络连接')
  const unique = [...new Set(candidates)]
  for (const name of unique) {
    try {
      const output = await execPromise(`netsh interface show interface name="${name}"`)
      const enabled = output.includes('已启用') || output.includes('Enabled')
      const connected = output.includes('已连接') || output.includes('Connected')
      return { enabled, connected, message: enabled ? (connected ? '已连接' : '已启用但未连接') : '未启用' }
    } catch (err) {
      if (err.message && (err.message.includes('Access is denied') || err.message.includes('拒绝访问'))) {
        return { enabled: false, connected: false, message: '读取 WiFi 状态需要管理员权限' }
      }
    }
  }
  return { enabled: false, connected: false, message: '无法获取 WiFi 状态' }
}

async function enableWiFi() {
  if (!isWindows()) {
    return { success: false, message: '仅支持 Windows' }
  }
  const candidates = []
  const iface = getWifiInterfaceName()
  if (iface) candidates.push(iface)
  candidates.push('Wi-Fi', 'WLAN', 'Wireless Network Connection', '无线网络连接')
  const unique = [...new Set(candidates)]
  for (const name of unique) {
    try {
      try {
        await execPromise(`netsh interface set interface name="${name}" admin=enabled`)
      } catch (err) {
        const msg = err.message || ''
        if (!(msg.includes('Access is denied') || msg.includes('拒绝访问') || msg.includes('requires elevation') || msg.includes('需要提升'))) {
          throw err
        }
        await execElevatedPromise('netsh.exe', [
          'interface',
          'set',
          'interface',
          `name="${name}"`,
          'admin=enabled'
        ])
      }
      await new Promise(r => setTimeout(r, 3000))
      return { success: true, message: `WiFi (${name}) 已开启` }
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('canceled') || msg.includes('cancelled') || msg.includes('取消')) {
        return { success: false, message: '开启 WiFi 已取消，请在 Windows 权限提示中选择“是”' }
      }
      if (msg.includes('Access is denied') || msg.includes('拒绝访问') || msg.includes('requires elevation') || msg.includes('需要提升')) {
        return { success: false, message: '开启 WiFi 需要管理员权限，请在 Windows 权限提示中选择“是”' }
      }
      if (msg.includes('接口') || msg.includes('interface')) {
        continue
      }
      return { success: false, message: `开启 WiFi 失败: ${msg}` }
    }
  }
  return { success: false, message: '无法找到 WiFi 接口，请手动检查网络设置' }
}

async function ensureWiFiOn() {
  try {
    const status = await checkWiFiStatus()
    if (status.enabled) return { success: true, message: 'WiFi 已开启', wasOn: true }
  } catch (_) {}
  const result = await enableWiFi()
  if (!result.success) {
    return { success: false, message: `无法开启 WiFi: ${result.message}`, wasOn: false }
  }
  await new Promise(r => setTimeout(r, 3000))
  try {
    const status = await checkWiFiStatus()
    if (status.enabled) {
      return { success: true, message: 'WiFi 已开启', wasOn: false }
    }
    return { success: false, message: 'WiFi 开启后仍无法检测，请手动检查', wasOn: false }
  } catch (_) {
    return { success: true, message: 'WiFi 已开启（状态无法确认）', wasOn: false }
  }
}

async function getCurrentSSID() {
  if (!isWindows()) return null
  try {
    const output = await execPromise('netsh wlan show interfaces')
    const lines = output.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('SSID') && trimmed.includes(':')) {
        const match = trimmed.match(/SSID\s*:\s*(.+)/i)
        if (match) return match[1].trim()
      }
    }
  } catch (_) {}
  return null
}

async function connectWiFi(ssid) {
  if (!isWindows()) {
    return { success: false, message: '仅支持 Windows' }
  }
  const current = await getCurrentSSID()
  if (current && current === ssid) {
    const status = await checkWiFiStatus()
    if (status.connected) {
      return { success: true, message: `已连接到 ${ssid}`, ssid, alreadyConnected: true }
    }
  }
  const ensure = await ensureWiFiOn()
  if (!ensure.success) return ensure
  try {
    await execPromise(`netsh wlan connect name="${ssid}" ssid="${ssid}"`)
    await new Promise(r => setTimeout(r, 5000))
    const status = await checkWiFiStatus()
    if (status.connected) {
      return { success: true, message: `已连接到 ${ssid}`, ssid }
    }
    return { success: false, message: `连接 ${ssid} 失败，请检查密码和信号` }
  } catch (err) {
    return { success: false, message: `连接 WiFi 失败: ${err.message}` }
  }
}

function parseScannedWifi(output) {
  const networks = new Map()
  let current = null
  for (const line of String(output).split(/\r?\n/)) {
    const ssid = line.match(/^\s*SSID\s+\d+\s*:\s*(.*)$/i)
    if (ssid) {
      const name = ssid[1].trim()
      current = name ? (networks.get(name) || { ssid: name, signalPercent: null }) : null
      if (current) networks.set(name, current)
      continue
    }
    if (!current) continue
    const signal = line.match(/^\s*(?:Signal|信号)\s*:\s*(\d+)\s*%/i)
    if (signal) {
      const strength = Number(signal[1])
      current.signalPercent = current.signalPercent === null
        ? strength
        : Math.max(current.signalPercent, strength)
    }
  }
  return [...networks.values()]
}

async function scanWiFi() {
  if (!isWindows()) {
    return { success: false, message: '仅支持 Windows', networks: [] }
  }
  try {
    const output = await execPromise('netsh wlan show networks mode=bssid')
    const networks = parseScannedWifi(output)
    return { success: true, networks, message: `发现 ${networks.length} 个 WiFi` }
  } catch (err) {
    return { success: false, message: `扫描 WiFi 失败: ${err.message}`, networks: [] }
  }
}

async function disconnectWiFi() {
  if (!isWindows()) {
    return { success: false, message: '仅支持 Windows' }
  }
  try {
    await execPromise('netsh wlan disconnect')
    return { success: true, message: '已断开 WiFi 连接' }
  } catch (err) {
    return { success: false, message: `断开 WiFi 失败: ${err.message}` }
  }
}

module.exports = {
  checkWiFiStatus,
  enableWiFi,
  ensureWiFiOn,
  connectWiFi,
  getCurrentSSID,
  getWifiDetails,
  parseWifiDetails,
  parseScannedWifi,
  scanWiFi,
  disconnectWiFi,
  isWindows
}