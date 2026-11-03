const assert = require('node:assert/strict')
const test = require('node:test')
const { resolvePlatformCredentials } = require('../electron/platformCredentials')

const decryptCredentials = (account, password) => ({ account, password })

test('platforms without a source use their own encrypted credentials', () => {
  const platform = {
    encryptedAccount: 'platform-account',
    encryptedPassword: 'platform-password'
  }

  assert.deepEqual(resolvePlatformCredentials(platform, [], decryptCredentials), {
    account: 'platform-account',
    password: 'platform-password'
  })
})

test('platforms configured without authentication resolve empty credentials', () => {
  assert.deepEqual(resolvePlatformCredentials({ requiresAuth: false }, [], decryptCredentials), {
    account: '',
    password: ''
  })
})

test('inherited platforms resolve credentials from their assigned group', () => {
  const platform = { accountSource: 'inherit', groupId: 'group-1' }
  const groups = [{
    id: 'group-1',
    encryptedAccount: 'group-account',
    encryptedPassword: 'group-password'
  }]

  assert.deepEqual(resolvePlatformCredentials(platform, groups, decryptCredentials), {
    account: 'group-account',
    password: 'group-password'
  })
})

test('a linked login system takes precedence over platform and group credentials', () => {
  const platform = {
    accountSource: 'inherit',
    groupId: 'group-1',
    loginSystemId: 'system-1',
    encryptedAccount: 'platform-account',
    encryptedPassword: 'platform-password'
  }
  const groups = [{
    id: 'group-1',
    encryptedAccount: 'group-account',
    encryptedPassword: 'group-password'
  }]
  const systems = [{
    id: 'system-1',
    encryptedAccount: 'system-account',
    encryptedPassword: 'system-password'
  }]

  assert.deepEqual(resolvePlatformCredentials(platform, groups, decryptCredentials, systems), {
    account: 'system-account',
    password: 'system-password'
  })
})

test('inheritance without a configured group secret fails explicitly', () => {
  assert.throws(
    () => resolvePlatformCredentials({ accountSource: 'inherit', groupId: 'group-1' }, [{ id: 'group-1' }], decryptCredentials),
    /尚未设置共享账号和密码/
  )
})
