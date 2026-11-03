<template>
  <div class="settings-view">
    <div class="settings-card">
      <h2 class="settings-section-title">{{ $t('settings.generalTitle') }}</h2>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ $t('settings.autoStart') }}</span>
          <span class="setting-desc">{{ $t('settings.autoStartDesc') }}</span>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="autoStart" @change="handleAutoStart" />
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ $t('settings.defaultLoginType') }}</span>
          <span class="setting-desc">{{ $t('settings.defaultLoginTypeDesc') }}</span>
        </div>
        <select v-model="defaultLoginType" class="form-select" @change="handleDefaultLoginType">
          <option value="network">{{ $t('settings.loginTypeNetwork') }}</option>
          <option value="web">{{ $t('settings.loginTypeWeb') }}</option>
        </select>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ $t('settings.checkInterval') }}</span>
          <span class="setting-desc">{{ $t('settings.checkIntervalDesc') }}</span>
        </div>
        <select v-model="checkInterval" class="form-select" @change="handleCheckInterval">
          <option :value="15">{{ $t('settings.interval15') }}</option>
          <option :value="30">{{ $t('settings.interval30') }}</option>
          <option :value="60">{{ $t('settings.interval60') }}</option>
        </select>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ $t('settings.languageLabel') }}</span>
          <span class="setting-desc">{{ $t('settings.languageDesc') }}</span>
        </div>
        <select v-model="language" class="form-select" @change="handleLanguageChange">
          <option value="zh">{{ $t('settings.languageZh') }}</option>
          <option value="en">{{ $t('settings.languageEn') }}</option>
        </select>
      </div>
    </div>

    <div class="settings-card">
      <h2 class="settings-section-title">{{ $t('settings.extensionTitle') }}</h2>
      <div class="extension-status" :class="extensionSetup?.bridgeAvailable && extensionSetup?.paired ? 'connected' : 'disconnected'">
        <span class="status-dot" :class="extensionSetup?.bridgeAvailable && extensionSetup?.paired ? 'success' : 'idle'"></span>
        {{ !extensionSetup?.bridgeAvailable ? $t('settings.extNotRunning') : extensionSetup?.paired ? $t('settings.extPaired') : $t('settings.extWaiting') }}
      </div>
      <p v-if="extensionSetup?.bridgeError" class="data-msg error">{{ $t('settings.extBridgeError', { error: extensionSetup.bridgeError }) }}</p>
      <ExtensionSetupWizard @paired="refreshExtensionSetup" @finished="refreshExtensionSetup" />
    </div>

    <div class="settings-card">
      <h2 class="settings-section-title">{{ $t('settings.dataManagementTitle') }}</h2>
      <p class="card-desc">{{ $t('settings.dataManagementDesc') }}</p>

      <div class="data-actions">
        <button class="btn btn-secondary" @click="handleExport" :disabled="exporting">
          <span v-if="exporting" class="spinner"></span>
          {{ exporting ? $t('settings.exporting') : $t('settings.exportConfig') }}
        </button>
        <button class="btn btn-secondary" @click="triggerImport" :disabled="importing">
          <span v-if="importing" class="spinner"></span>
          {{ importing ? $t('settings.importing') : $t('settings.importConfig') }}
        </button>
        <input ref="fileInput" type="file" accept=".json" class="hidden-file" @change="handleImport" />
      </div>

      <div v-if="dataMsg" class="data-msg" :class="dataMsgType">{{ dataMsg }}</div>
    </div>

    <div class="settings-card">
      <h2 class="settings-section-title">{{ $t('settings.aboutTitle') }}</h2>
      <div class="about-info">
        <div class="about-row">
          <span class="about-label">{{ $t('settings.aboutAppName') }}</span>
          <span class="about-value">{{ $t('settings.aboutAppValue') }}</span>
        </div>
        <div class="about-row">
          <span class="about-label">{{ $t('settings.aboutVersion') }}</span>
          <span class="about-value">1.0.0</span>
        </div>
        <div class="about-row">
          <span class="about-label">{{ $t('settings.aboutLicense') }}</span>
          <span class="about-value">MIT</span>
        </div>
        <div class="about-row">
          <span class="about-label">{{ $t('settings.aboutSecurity') }}</span>
          <span class="about-value">{{ $t('settings.aboutSecurityValue') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStore } from '../store'
import ExtensionSetupWizard from '../components/ExtensionSetupWizard.vue'

const { t, locale } = useI18n()
const store = useStore()

const autoStart = ref(false)
const defaultLoginType = ref('web')
const checkInterval = ref(30)
const language = ref('zh')
const exporting = ref(false)
const importing = ref(false)
const dataMsg = ref('')
const dataMsgType = ref('')
const fileInput = ref(null)
const extensionSetup = ref(null)
onMounted(async () => {
  await store.loadSettings()
  autoStart.value = store.settings.autoStart || false
  defaultLoginType.value = store.settings.defaultLoginType || 'web'
  checkInterval.value = store.settings.checkInterval || 30
  language.value = store.settings.language || locale.value
  await refreshExtensionSetup()
})

async function refreshExtensionSetup() {
  extensionSetup.value = await window.autoMate.getBrowserExtensionSetup()
}

async function handleAutoStart() {
  const result = await store.setAutoStart(autoStart.value)
  if (!result.success) {
    autoStart.value = !autoStart.value
    showDataMsg(result.error || t('settings.settingFailed'), 'error')
  }
}

async function handleDefaultLoginType() {
  const result = await store.updateSettings({ defaultLoginType: defaultLoginType.value })
  if (!result.success) {
    showDataMsg(result.error || t('settings.settingFailed'), 'error')
  } else {
    showDataMsg(t('settings.defaultLoginTypeUpdated'), 'success')
  }
}

async function handleCheckInterval() {
  const result = await store.updateSettings({ checkInterval: Number(checkInterval.value) })
  if (!result.success) {
    showDataMsg(result.error || t('settings.settingFailed'), 'error')
  } else {
    showDataMsg(t('settings.checkIntervalUpdated'), 'success')
  }
}

function handleLanguageChange() {
  locale.value = language.value
  localStorage.setItem('automate-language', language.value)
  store.updateSettings({ language: language.value })
}

async function handleExport() {
  exporting.value = true
  dataMsg.value = ''
  try {
    const result = await store.exportData()
    if (result.success) {
      const json = JSON.stringify(result.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `automate-config-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showDataMsg(t('settings.configExported'), 'success')
    } else {
      showDataMsg(result.error || t('settings.exportFailed'), 'error')
    }
  } catch (err) {
    showDataMsg(err.message, 'error')
  } finally {
    exporting.value = false
  }
}

function triggerImport() {
  fileInput.value?.click()
}

async function handleImport(event) {
  const file = event.target.files[0]
  if (!file) return

  importing.value = true
  dataMsg.value = ''
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!confirm(t('settings.importConfirm'))) {
      importing.value = false
      event.target.value = ''
      return
    }
    const result = await store.importData(data)
    if (result.success) {
      showDataMsg(t('settings.configImported'), 'success')
    } else {
      showDataMsg(result.error || t('settings.importFailed'), 'error')
    }
  } catch (err) {
    showDataMsg(t('settings.fileParseFailed', { error: err.message }), 'error')
  } finally {
    importing.value = false
    event.target.value = ''
  }
}

function showDataMsg(msg, type) {
  dataMsg.value = msg
  dataMsgType.value = type
  setTimeout(() => { dataMsg.value = '' }, 4000)
}
</script>

<style scoped>
.settings-view {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.settings-section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--color-text);
}

.card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.5;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.setting-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #cbd2d9;
  border-radius: 24px;
  transition: 0.2s;
}

.switch-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}

.switch input:checked + .switch-slider {
  background: var(--color-primary);
}

.switch input:checked + .switch-slider:before {
  transform: translateX(20px);
}

.form-select {
  padding: 7px 28px 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface) url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239aa5b1' d='M6 8L2 4h8z'/%3E%3C/svg%3E") no-repeat right 8px center;
  appearance: none;
  cursor: pointer;
}

.data-actions {
  display: flex;
  gap: 12px;
}

.extension-status { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }
.extension-status.connected { color: var(--status-success); }
.extension-status.disconnected { color: var(--text-secondary); }
.extension-verify-note { margin: -8px 0 14px; font-size: 12px; color: var(--text-tertiary); line-height: 1.5; }
.extension-instructions { display: grid; gap: 7px; padding-left: 22px; margin: 0 0 15px; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.extension-permission-note { padding: 10px 12px; color: var(--status-logging); background: var(--status-warning-bg); border-left: 3px solid var(--status-logging); font-size: 12px; line-height: 1.5; }
.pairing-label { display: block; margin: 15px 0 6px; font-size: 12px; font-weight: 600; }
.pairing-code { display: block; overflow-wrap: anywhere; padding: 10px 12px; background: var(--color-surface-muted); border: 1px solid var(--color-border); border-radius: 5px; font-size: 12px; user-select: all; }
.extension-actions { flex-wrap: wrap; margin-top: 14px; }

.hidden-file {
  display: none;
}

.data-msg {
  margin-top: 14px;
  padding: 8px 12px;
  border-radius: var(--radius);
  font-size: 13px;
}

.data-msg.success {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.data-msg.error {
  background: var(--status-failed-bg);
  color: var(--status-failed);
}

.about-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.about-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.about-label {
  color: var(--text-tertiary);
}

.about-value {
  color: var(--text-secondary);
  text-align: right;
}
</style>