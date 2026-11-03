const crypto = require('crypto')
const os = require('os')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getMacAddress() {
  try {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          return iface.mac
        }
      }
    }
  } catch (_) {}
  return '00:00:00:00:00:00'
}

function getMachineKey() {
  let username = 'unknown'
  try { username = os.userInfo().username } catch (_) {}
  const fingerprint = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.release(),
    username,
    getMacAddress()
  ].join('|')
  const seed = `${fingerprint}|AutoMate::v1::KeySeed`
  return crypto.scryptSync(seed, 'AutoMate-Fixed-Salt', 32)
}

function encrypt(text, key) {
  const derivedKey = key || getMachineKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv)
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function decrypt(encrypted, key) {
  try {
    const derivedKey = key || getMachineKey()
    const data = Buffer.from(encrypted, 'base64')
    const iv = data.subarray(0, IV_LENGTH)
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH)
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch (err) {
    throw new Error('解密失败：数据可能已损坏或在其他设备上加密')
  }
}

function encryptCredentials(account, password, key) {
  return {
    account: encrypt(account, key),
    password: encrypt(password, key)
  }
}

function decryptCredentials(encryptedAccount, encryptedPassword, key) {
  return {
    account: decrypt(encryptedAccount, key),
    password: decrypt(encryptedPassword, key)
  }
}

function wipeString(str) {
  if (typeof str !== 'string') return
  try {
    const len = Buffer.byteLength(str, 'utf8')
    const buf = Buffer.alloc(len)
    buf.fill(0)
  } catch (_) {}
}

module.exports = {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  getMachineKey,
  wipeString
}
