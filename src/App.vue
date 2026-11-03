<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <span class="logo-icon" aria-hidden="true">AM</span>
          <span class="logo-text">AutoMate</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <router-link to="/" class="nav-item" exact-active-class="active">
          <span class="nav-icon">🏠</span>
          <span class="nav-label">{{ $t('app.navHome') }}</span>
        </router-link>
        <router-link to="/wifi" class="nav-item" active-class="active">
          <span class="nav-icon">📶</span>
          <span class="nav-label">{{ $t('app.navWifi') }}</span>
        </router-link>
        <router-link to="/web-management" class="nav-item" active-class="active">
          <span class="nav-icon">🌐</span>
          <span class="nav-label">{{ $t('app.navWeb') }}</span>
        </router-link>
        <router-link to="/settings" class="nav-item" active-class="active">
          <span class="nav-icon">⚙️</span>
          <span class="nav-label">{{ $t('app.navSettings') }}</span>
        </router-link>
        <router-link to="/help" class="nav-item" active-class="active">
          <span class="nav-icon">?</span>
          <span class="nav-label">{{ $t('app.navHelp') }}</span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div class="platform-count">
          <span class="count-number">{{ store.platformCount }}</span>
          <span class="count-label">{{ $t('app.platformCount') }}</span>
        </div>
        <button class="btn btn-primary btn-sm login-all-btn" @click="handleLoginAll" :disabled="store.isLoggingIn || store.platformCount === 0">
          <span v-if="store.isLoggingIn" class="spinner"></span>
          {{ store.isLoggingIn ? $t('app.loggingIn') : $t('app.loginAll') }}
        </button>
      </div>
    </aside>

    <main class="main-content">
      <header class="top-bar">
        <div class="top-bar-left">
          <h1 class="page-title">{{ currentTitle }}</h1>
        </div>
        <div class="top-bar-right">
          <div class="status-indicator" :title="$t('app.statusTitle')" :aria-label="$t('app.statusTitle')">
            <span class="status-dot" :class="globalStatusClass"></span>
            <span class="status-text">{{ globalStatusText }}</span>
          </div>
        </div>
      </header>

      <div class="content-area">
        <router-view />
      </div>
    </main>

    <div v-if="showExtensionPrompt" class="extension-overlay" role="presentation" @click.self="dismissExtensionPrompt">
      <section class="extension-dialog" role="dialog" aria-modal="true" aria-labelledby="extension-title">
        <button class="extension-close" type="button" :aria-label="$t('app.extClose')" @click="dismissExtensionPrompt">×</button>
        <p class="extension-eyebrow">{{ $t('app.extEyebrow') }}</p>
        <h2 id="extension-title">{{ $t('app.extTitle') }}</h2>
        <ExtensionSetupWizard @paired="completeExtensionSetup" />
        <div class="extension-actions">
          <button class="btn btn-secondary" type="button" @click="dismissExtensionPrompt">{{ $t('app.extLater') }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useStore } from './store'
import ExtensionSetupWizard from './components/ExtensionSetupWizard.vue'

const route = useRoute()
const store = useStore()
const { t, locale } = useI18n()
const showExtensionPrompt = ref(false)
const extensionSetup = ref(null)

const currentTitle = computed(() => route.meta.titleKey ? t(route.meta.titleKey) : 'AutoMate')

const globalStatusClass = computed(() => {
  if (store.isLoggingIn) return 'logging-in'
  return store.globalStatus || 'idle'
})

const globalStatusText = computed(() => {
  if (store.isLoggingIn) return t('app.statusLoggingIn')
  const map = {
    idle: t('app.statusIdle'),
    success: t('app.statusSuccess'),
    failed: t('app.statusFailed'),
    partial: t('app.statusPartial'),
    pending: t('app.statusPending'),
    unconfirmed: t('app.statusUnconfirmed')
  }
  return map[store.globalStatus] || t('app.statusIdle')
})

async function handleLoginAll() {
  await store.loginAll()
}

onMounted(async () => {
  await store.loadPlatforms()
  await store.loadSettings()
  store.setupListeners()

  if (store.settings.language) {
    locale.value = store.settings.language
    localStorage.setItem('automate-language', store.settings.language)
  }

  extensionSetup.value = await window.autoMate.getBrowserExtensionSetup()
  showExtensionPrompt.value = !extensionSetup.value.paired && !extensionSetup.value.promptDismissed

  if (store.platformCount > 0) {
    const statuses = store.platforms.map(platform => platform.status || 'idle')
    if (statuses.includes('logging-in')) store.globalStatus = 'logging-in'
    else if (statuses.includes('pending')) store.globalStatus = 'pending'
    else if (statuses.every(status => status === 'success')) store.globalStatus = 'success'
    else if (statuses.includes('success')) store.globalStatus = 'partial'
    else if (statuses.includes('unconfirmed')) store.globalStatus = 'unconfirmed'
    else if (statuses.includes('failed')) store.globalStatus = 'failed'
    else store.globalStatus = 'idle'
  }
})

watch(locale, (newLocale) => {
  localStorage.setItem('automate-language', newLocale)
  store.updateSettings({ language: newLocale })
})

async function dismissExtensionPrompt() {
  showExtensionPrompt.value = false
  await window.autoMate.dismissBrowserExtensionPrompt()
}

async function completeExtensionSetup() {
  showExtensionPrompt.value = false
  await window.autoMate.dismissBrowserExtensionPrompt()
}

</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  background: linear-gradient(180deg, #d7e8f2 0%, #e3d9ed 54%, #f0ddce 100%);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 20px 18px;
  border-bottom: 1px solid var(--color-border);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  position: relative;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(77, 109, 134, 0.18);
  border-radius: 9px;
  background: linear-gradient(145deg, var(--accent-sky-ink), var(--accent-lavender-ink));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
  box-shadow: 0 2px 5px rgba(77, 109, 134, 0.18);
}

.logo-icon::after {
  content: '';
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 8px;
  height: 8px;
  border: 2px solid #eeeaf4;
  border-radius: 50%;
  background: var(--accent-mint-ink);
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.sidebar-nav {
  flex: 1;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.nav-item:hover {
  background: #e7ecef;
  color: #274c77;
}

.nav-item.active {
  background: #a3cef1;
  color: #274c77;
  font-weight: 700;
}

.nav-icon {
  font-size: 16px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  text-align: center;
  background: #e7ecef;
  color: #274c77;
}

.nav-item.active .nav-icon {
  background: #274c77;
  color: #fff;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.platform-count {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.count-number {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.count-label {
  font-size: 13px;
  color: var(--text-tertiary);
}

.login-all-btn {
  width: 100%;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-bar {
  height: 56px;
  background: linear-gradient(90deg, #d7e8f2 0%, #dcebe2 58%, #e3d9ed 100%);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.status-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.summary-item.success { color: var(--status-success); font-weight: 500; }
.summary-item.failed { color: var(--status-failed); font-weight: 500; }
.summary-item.total { color: var(--text-tertiary); }
.summary-divider { color: var(--text-tertiary); }

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: linear-gradient(135deg, #e4eff5 0%, #f3e9e7 100%);
}

.extension-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 32, 27, 0.48);
}

.extension-dialog {
  position: relative;
  width: min(560px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 30px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.extension-close {
  position: absolute;
  top: 12px;
  right: 14px;
  padding: 4px 8px;
  color: var(--text-secondary);
  background: transparent;
  font-size: 24px;
}

.extension-eyebrow {
  margin-bottom: 8px;
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}

.extension-dialog h2 { margin-bottom: 10px; font-size: 21px; }
.extension-description { color: var(--text-secondary); line-height: 1.55; }
.extension-steps { display: grid; gap: 10px; padding-left: 22px; margin: 18px 0; line-height: 1.55; }
.extension-steps code { display: block; overflow-wrap: anywhere; padding: 7px; margin-top: 5px; background: var(--color-surface-muted); border-radius: 4px; font-size: 11px; }
.extension-permission-note { padding: 10px 12px; color: var(--status-logging); background: var(--status-warning-bg); border-left: 3px solid var(--status-logging); font-size: 12px; line-height: 1.5; }
.pairing-label { display: block; margin: 17px 0 6px; font-size: 12px; font-weight: 600; }
.pairing-code { display: block; overflow-wrap: anywhere; padding: 10px 12px; color: var(--color-text); background: var(--color-surface-muted); border: 1px solid var(--color-border); border-radius: 5px; font-size: 12px; user-select: all; }
.extension-actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 18px; }

@media (max-width: 520px) {
  .extension-overlay { padding: 12px; }
  .extension-dialog { padding: 24px 18px; }
  .extension-actions { flex-direction: column; }
}
</style>