const net = require('net')
const tls = require('tls')
const { EventEmitter } = require('events')
const crypto = require('crypto')

const OP_TEXT = 0x1
const OP_CONT = 0x0
const OP_CLOSE = 0x8
const OP_PING = 0x9
const OP_PONG = 0xa

function encodeFrame(opcode, payload) {
  const mask = crypto.randomBytes(4)
  const masked = Buffer.allocUnsafe(payload.length)
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ mask[i & 3]
  }
  let head
  const len = payload.length
  if (len < 126) {
    head = Buffer.from([0x80 | opcode, 0x80 | len])
  } else if (len < 65536) {
    head = Buffer.alloc(4)
    head[0] = 0x80 | opcode
    head[1] = 0x80 | 126
    head.writeUInt16BE(len, 2)
  } else {
    head = Buffer.alloc(10)
    head[0] = 0x80 | opcode
    head[1] = 0x80 | 127
    head.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([head, mask, masked])
}

class WebSocketClient extends EventEmitter {
  constructor(url, options = {}) {
    super()
    const u = new URL(url)
    this.secure = u.protocol === 'wss:'
    this.host = u.hostname
    this.port = u.port ? parseInt(u.port, 10) : (this.secure ? 443 : 80)
    this.path = (u.pathname || '/') + (u.search || '')
    this.timeout = options.timeout || 15000
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.fragOpcode = null
    this.fragments = []
    this.closed = false
  }

  connect() {
    return new Promise((resolve, reject) => {
      const mod = this.secure ? tls : net
      const connOpts = { host: this.host, port: this.port }
      if (this.secure) connOpts.servername = this.host
      this.socket = mod.connect(connOpts, () => this.performHandshake(resolve, reject))
      this.socket.once('error', reject)
      this.socket.on('error', () => {
        this.socket.destroy()
      })
      this.socket.on('end', () => this.emitClose())
      this.socket.setTimeout(this.timeout)
      this.socket.on('timeout', () => {
        this.socket.destroy()
        this.emitClose()
      })
    })
  }

  performHandshake(resolve, reject) {
    const key = crypto.randomBytes(16).toString('base64')
    const request = [
      `GET ${this.path} HTTP/1.1`,
      `Host: ${this.host}:${this.port}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      'Origin: http://localhost',
      '',
      ''
    ].join('\r\n')

    let handshakeBuffer = Buffer.alloc(0)
    const onData = (chunk) => {
      handshakeBuffer = Buffer.concat([handshakeBuffer, chunk])
      const idx = handshakeBuffer.indexOf('\r\n\r\n')
      if (idx === -1) return
      const header = handshakeBuffer.slice(0, idx).toString('latin1')
      const rest = handshakeBuffer.slice(idx + 4)
      this.socket.removeListener('data', onData)
      if (!/^HTTP\/1\.[01] 101/i.test(header)) {
        reject(new Error('WebSocket 握手失败: ' + (header.split('\r\n')[0] || 'unknown')))
        this.socket.destroy()
        return
      }
      this.socket.on('data', (c) => this.processData(c))
      if (rest.length) this.processData(rest)
      this.emit('open')
      resolve()
    }
    this.socket.on('data', onData)
    this.socket.write(request)
  }

  processData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0]
      const b1 = this.buffer[1]
      const fin = (b0 & 0x80) !== 0
      const opcode = b0 & 0x0f
      const masked = (b1 & 0x80) !== 0
      let len = b1 & 0x7f
      let offset = 2
      if (len === 126) {
        if (this.buffer.length < 4) return
        len = this.buffer.readUInt16BE(2)
        offset = 4
      } else if (len === 127) {
        if (this.buffer.length < 10) return
        len = Number(this.buffer.readBigUInt64BE(2))
        offset = 10
      }
      let maskKey = null
      if (masked) {
        if (this.buffer.length < offset + 4) return
        maskKey = this.buffer.slice(offset, offset + 4)
        offset += 4
      }
      if (this.buffer.length < offset + len) return
      const payload = Buffer.from(this.buffer.slice(offset, offset + len))
      this.buffer = this.buffer.slice(offset + len)

      if (maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] = payload[i] ^ maskKey[i & 3]
        }
      }

      if (opcode === OP_PING) {
        this.sendRaw(OP_PONG, payload)
        continue
      }
      if (opcode === OP_PONG) continue
      if (opcode === OP_CLOSE) {
        this.socket.destroy()
        this.emitClose()
        return
      }

      if (opcode === OP_TEXT || opcode === OP_CONT) {
        if (opcode === OP_TEXT && !fin) {
          this.fragOpcode = OP_TEXT
          this.fragments = [payload]
        } else if (opcode === OP_CONT) {
          this.fragments.push(payload)
          if (fin) {
            const full = Buffer.concat(this.fragments)
            this.fragments = []
            this.fragOpcode = null
            this.emit('message', full)
          }
        } else {
          this.fragments = []
          this.fragOpcode = null
          this.emit('message', payload)
        }
      }
    }
  }

  sendRaw(opcode, payload) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(encodeFrame(opcode, payload))
    }
  }

  send(message) {
    this.sendRaw(OP_TEXT, Buffer.from(String(message)))
  }

  emitClose() {
    if (this.closed) return
    this.closed = true
    this.emit('close')
  }

  close() {
    try {
      this.sendRaw(OP_CLOSE, Buffer.alloc(2))
    } catch (_) {}
    setTimeout(() => {
      this.socket && this.socket.destroy()
      this.emitClose()
    }, 50)
  }
}

module.exports = WebSocketClient