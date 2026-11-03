function resolvePlatformCredentials(platform, groups, decryptCredentials, loginSystems = []) {
  if (platform.requiresAuth === false) {
    return { account: '', password: '' }
  }

  if (platform.loginSystemId) {
    const system = loginSystems.find(candidate => candidate.id === platform.loginSystemId)
    if (!system || !system.encryptedAccount || !system.encryptedPassword) {
      throw new Error('所选登录系统尚未设置账号和密码')
    }
    return decryptCredentials(system.encryptedAccount, system.encryptedPassword)
  }

  if (platform.accountSource === 'inherit') {
    const group = groups.find(candidate => candidate.id === platform.groupId)
    if (!group || !group.encryptedAccount || !group.encryptedPassword) {
      throw new Error('所选分组尚未设置共享账号和密码')
    }
    return decryptCredentials(group.encryptedAccount, group.encryptedPassword)
  }

  if (!platform.encryptedAccount || !platform.encryptedPassword) {
    throw new Error('平台账号或密码尚未设置')
  }
  return decryptCredentials(platform.encryptedAccount, platform.encryptedPassword)
}

module.exports = { resolvePlatformCredentials }
