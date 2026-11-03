export function canSavePlatformForm(form, { hasLoginSystem = false, hasGroupCredentials = false } = {}) {
  const requiresAuth = form.requiresAuth !== false

  if (form.type === 'network') {
    if (!String(form.wifiName || '').trim()) return false
    if (!requiresAuth) return true
    if (!String(form.url || '').trim()) return false
  } else {
    if (!String(form.name || '').trim() || !String(form.url || '').trim()) return false
    if (!requiresAuth) return true
  }

  if (form.loginSystemId) return hasLoginSystem
  if (form.accountSource === 'inherit') return !!form.groupId && hasGroupCredentials
  return !!String(form.account || '').trim() && !!String(form.password || '').trim()
}