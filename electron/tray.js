const { Tray, Menu, nativeImage, app } = require('electron')
const zlib = require('zlib')
const path = require('path')

let tray = null
let currentStatus = 'idle'
let currentLang = 'zh'

const TRAY_STRINGS = {
  zh: {
    tooltip: 'AutoMate - 自动登录助手',
    showWindow: '显示主窗口',
    loginAll: '立即执行所有登录',
    hideToTray: '隐藏到托盘',
    quit: '退出',
    statusIdle: 'AutoMate - 自动登录助手',
    statusLoggingIn: 'AutoMate - 正在登录中...',
    statusSuccess: 'AutoMate - 全部登录成功',
    statusFailed: 'AutoMate - 登录失败',
    statusPartial: 'AutoMate - 部分登录成功',
    statusPending: 'AutoMate - 等待浏览器确认登录',
    statusUnconfirmed: 'AutoMate - 登录结果未确认，可重试'
  },
  en: {
    tooltip: 'AutoMate - Auto-Login Assistant',
    showWindow: 'Show Main Window',
    loginAll: 'Run All Logins Now',
    hideToTray: 'Hide to Tray',
    quit: 'Quit',
    statusIdle: 'AutoMate - Auto-Login Assistant',
    statusLoggingIn: 'AutoMate - Logging in...',
    statusSuccess: 'AutoMate - All logins successful',
    statusFailed: 'AutoMate - Login failed',
    statusPartial: 'AutoMate - Some logins successful',
    statusPending: 'AutoMate - Waiting for browser confirmation',
    statusUnconfirmed: 'AutoMate - Login result unconfirmed, can retry'
  }
}

function getStrings() {
  return TRAY_STRINGS[currentLang] || TRAY_STRINGS.zh
}

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function createIconPng(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const rowLen = size * 4 + 1
  const raw = Buffer.alloc(rowLen * size)
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0
    for (let x = 0; x < size; x++) {
      const off = y * rowLen + 1 + x * 4
      const cx = size / 2
      const cy = size / 2
      const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2)
      if (dist <= size / 2 - 1) {
        raw[off] = r
        raw[off + 1] = g
        raw[off + 2] = b
        raw[off + 3] = 255
      } else if (dist <= size / 2) {
        raw[off] = r
        raw[off + 1] = g
        raw[off + 2] = b
        raw[off + 3] = 128
      } else {
        raw[off] = 0
        raw[off + 1] = 0
        raw[off + 2] = 0
        raw[off + 3] = 0
      }
    }
  }
  const compressed = zlib.deflateSync(raw)
  const idat = compressed

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ])
}

const STATUS_COLORS = {
  idle: [150, 150, 150],
  'logging-in': [240, 180, 0],
  success: [60, 180, 75],
  failed: [220, 60, 60],
  partial: [240, 180, 0],
  pending: [240, 180, 0],
  unconfirmed: [240, 180, 0]
}

function createTray(mainWindow, callbacks = {}) {
  mainWindowRef = mainWindow
  callbacksRef = callbacks
  const colors = STATUS_COLORS[currentStatus] || STATUS_COLORS.idle
  const iconBuf = createIconPng(16, colors[0], colors[1], colors[2])
  const image = nativeImage.createFromBuffer(iconBuf)
  image.setTemplateImage(false)

  tray = new Tray(image)
  tray.setToolTip(getStrings().tooltip)

  function buildMenu() {
    const s = getStrings()
    const menuTemplate = [
      {
        label: s.showWindow,
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      {
        label: s.loginAll,
        click: () => {
          if (callbacks.onLoginAll) callbacks.onLoginAll()
        }
      },
      { type: 'separator' },
      {
        label: s.hideToTray,
        click: () => {
          if (mainWindow) mainWindow.hide()
        }
      },
      {
        label: s.quit,
        click: () => {
          app.isQuiting = true
          app.quit()
        }
      }
    ]
    const menu = Menu.buildFromTemplate(menuTemplate)
    tray.setContextMenu(menu)
  }

  buildMenu()

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  return tray
}

function updateTrayStatus(status) {
  currentStatus = status
  if (!tray) return
  const colors = STATUS_COLORS[status] || STATUS_COLORS.idle
  const iconBuf = createIconPng(16, colors[0], colors[1], colors[2])
  const image = nativeImage.createFromBuffer(iconBuf)
  image.setTemplateImage(false)
  tray.setImage(image)

  const tooltips = getStrings()
  tray.setToolTip(tooltips[status] || tooltips.statusIdle)
}

function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

function setTrayLanguage(lang) {
  currentLang = lang === 'en' ? 'en' : 'zh'
  if (tray) {
    const s = getStrings()
    tray.setToolTip(s[currentStatus] || s.statusIdle)
    const menuTemplate = [
      { label: s.showWindow, click: () => { if (mainWindowRef) { if (mainWindowRef.isMinimized()) mainWindowRef.restore(); mainWindowRef.show(); mainWindowRef.focus() } } },
      { label: s.loginAll, click: () => { if (callbacksRef.onLoginAll) callbacksRef.onLoginAll() } },
      { type: 'separator' },
      { label: s.hideToTray, click: () => { if (mainWindowRef) mainWindowRef.hide() } },
      { label: s.quit, click: () => { app.isQuiting = true; app.quit() } }
    ]
    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate))
  }
}

let mainWindowRef = null
let callbacksRef = {}

module.exports = {
  createTray,
  updateTrayStatus,
  destroyTray,
  createIconPng,
  setTrayLanguage
}