<template>
  <div class="add-view">
    <div class="form-card">
      <h2 class="form-section-title">
        {{ isEdit ? $t('addPlatform.editTitle') : (form.type === 'network' ? $t('addPlatform.addWifiTitle') : $t('addPlatform.addWebTitle')) }}
      </h2>

      <div class="form-group" v-if="form.type !== 'network'">
        <label class="form-label">{{ $t('addPlatform.platformName') }}</label>
        <input
          v-model="form.name"
          type="text"
          class="form-input"
          :placeholder="$t('addPlatform.platformNamePlaceholder')"
          ref="nameInput"
        />
      </div>

      <div class="form-group" v-if="form.type === 'network'">
        <label class="form-label">{{ $t('addPlatform.wifiName') }}</label>
        <input
          v-model="form.wifiName"
          type="text"
          class="form-input"
          :placeholder="$t('addPlatform.wifiNamePlaceholder')"
        />
        <span class="form-hint">{{ $t('addPlatform.wifiHint') }}</span>
      </div>

      <label class="auth-option">
        <input v-model="form.requiresAuth" type="checkbox" />
        <span>{{ $t('addPlatform.requiresAuth') }}</span>
      </label>
      <p class="form-hint auth-hint">
        {{ form.type === 'network'
          ? $t('addPlatform.authHintNetwork')
          : $t('addPlatform.authHintWeb') }}
      </p>

      <div class="form-group" v-if="form.type === 'web' || form.requiresAuth">
        <label class="form-label">
          {{ form.type === 'network' ? $t('addPlatform.authUrlNetwork') : $t('addPlatform.authUrlWeb') }}
        </label>
        <input
          v-model="form.url"
          type="text"
          class="form-input"
          :placeholder="form.type === 'network' ? $t('addPlatform.authUrlPlaceholderNetwork') : $t('addPlatform.authUrlPlaceholderWeb')"
        />
        <span class="form-hint" v-if="form.type === 'network'">
          {{ $t('addPlatform.authUrlHintNetwork') }}
        </span>
        <span class="form-hint" v-else>
          {{ $t('addPlatform.authUrlHintWeb') }}
        </span>
      </div>

      <div class="form-group">
        <label class="form-label">{{ $t('addPlatform.groupLabel') }}</label>
        <select v-model="groupChoice" class="form-select" @change="handleGroupChoiceChange">
          <option value="">{{ $t('common.noGroup') }}</option>
          <option v-for="group in store.groups" :key="group.id" :value="group.id">{{ group.name }}</option>
          <option value="__create_group__">{{ $t('common.createNewGroup') }}</option>
        </select>
      </div>

      <div v-if="groupChoice === '__create_group__'" class="inline-group-create">
        <h3>{{ $t('common.createGroup') }}</h3>
        <div class="form-group">
          <label class="form-label">{{ $t('common.groupNameRequired') }}</label>
          <input v-model="newGroupName" class="form-input" type="text" autocomplete="off" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">{{ $t('common.sharedAccountOptional') }}</label>
            <input v-model="newGroupSharedAccount" class="form-input" type="text" autocomplete="off" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('common.sharedPasswordOptional') }}</label>
            <input v-model="newGroupSharedPassword" class="form-input" type="password" autocomplete="new-password" />
          </div>
        </div>
        <div class="group-actions">
          <button class="btn btn-secondary" type="button" @click="createGroup" :disabled="groupSaving">
            {{ groupSaving ? $t('common.saving') : $t('common.createGroup') }}
          </button>
          <p v-if="groupMessage" class="form-hint" :class="groupMessageType">{{ groupMessage }}</p>
        </div>
      </div>

      <div v-if="form.type === 'web' && form.requiresAuth" class="form-group">
        <label class="form-label">{{ $t('addPlatform.loginSystemOptional') }}</label>
        <select v-model="form.loginSystemId" class="form-select">
          <option value="">{{ $t('addPlatform.noLoginSystem') }}</option>
          <option v-for="system in availableLoginSystems" :key="system.id" :value="system.id">
            {{ system.name }}
          </option>
        </select>
        <span v-if="form.loginSystemId" class="form-hint">{{ $t('addPlatform.loginSystemHint') }}</span>
      </div>
      <div v-if="form.requiresAuth && selectedLoginSystem?.destinations?.length" class="form-group">
        <label class="form-label">{{ $t('addPlatform.destinationLabel') }}</label>
        <select :value="form.url" class="form-select" @change="form.url = $event.target.value">
          <option value="">{{ $t('addPlatform.keepManualUrl') }}</option>
          <option v-for="destination in selectedLoginSystem.destinations" :key="destination.id" :value="destination.url">
            {{ destination.name }}
          </option>
        </select>
      </div>

      <div v-if="form.requiresAuth && !form.loginSystemId" class="form-group">
        <label class="form-label">{{ $t('addPlatform.accountSource') }}</label>
        <select v-model="form.accountSource" class="form-select">
          <option value="custom">{{ $t('addPlatform.accountSourceCustom') }}</option>
          <option value="inherit">{{ $t('addPlatform.accountSourceInherit') }}</option>
        </select>
      </div>

      <span class="form-hint" v-if="form.requiresAuth && !form.loginSystemId && form.accountSource === 'inherit' && !selectedGroupHasCredentials">
        {{ $t('addPlatform.noGroupCredentials') }}
      </span>

      <div class="form-row" v-if="form.requiresAuth && !form.loginSystemId && form.accountSource === 'custom'">
        <div class="form-group">
          <label class="form-label">{{ $t('addPlatform.account') }}</label>
          <input
            v-model="form.account"
            type="text"
            class="form-input"
            :placeholder="$t('addPlatform.accountPlaceholder')"
            autocomplete="off"
          />
        </div>

        <div class="form-group">
          <label class="form-label">{{ $t('addPlatform.password') }}</label>
          <input
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            class="form-input"
            :placeholder="$t('addPlatform.passwordPlaceholder')"
            autocomplete="new-password"
          />
          <button class="toggle-pwd" @click="showPassword = !showPassword" type="button">
            {{ showPassword ? $t('addPlatform.hidePassword') : $t('addPlatform.showPassword') }}
          </button>
        </div>
      </div>

      <details class="advanced-section">
        <summary class="advanced-summary">{{ $t('addPlatform.advancedTitle') }}</summary>
        <div class="advanced-body">
          <div class="form-group">
            <label class="form-label">{{ $t('addPlatform.scheduleDays') }}</label>
            <div class="day-options">
              <label v-for="day in allDays" :key="day.value" class="day-chip">
                <input type="checkbox" :value="day.value" v-model="form.scheduleDays" />
                <span>{{ day.label }}</span>
              </label>
            </div>
          </div>

          <div class="switch-row">
            <div class="switch-info">
              <span class="switch-title">{{ $t('addPlatform.autoConnectTitle') }}</span>
              <span class="switch-sub">{{ $t('addPlatform.autoConnectSub') }}</span>
            </div>
            <label class="switch">
              <input type="checkbox" v-model="form.autoConnect" />
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="switch-row" v-if="store.groups.length > 0">
            <div class="switch-info">
              <span class="switch-title">{{ $t('addPlatform.skipGroupLoginTitle') }}</span>
              <span class="switch-sub">{{ $t('addPlatform.skipGroupLoginSub') }}</span>
            </div>
            <label class="switch">
              <input type="checkbox" v-model="form.skipGroupLogin" />
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="form-group">
            <label class="form-label">{{ $t('addPlatform.accountSelector') }}</label>
            <input v-model="form.accountSelector" type="text" class="form-input" :placeholder="$t('addPlatform.accountSelectorPlaceholder')" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('addPlatform.passwordSelector') }}</label>
            <input v-model="form.passwordSelector" type="text" class="form-input" :placeholder="$t('addPlatform.passwordSelectorPlaceholder')" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('addPlatform.submitSelector') }}</label>
            <input v-model="form.submitSelector" type="text" class="form-input" :placeholder="$t('addPlatform.submitSelectorPlaceholder')" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('addPlatform.successUrl') }}</label>
            <input v-model="form.successUrl" type="text" class="form-input" :placeholder="$t('addPlatform.successUrlPlaceholder')" />
          </div>
          <div class="form-group" v-if="form.type === 'web'">
            <label class="form-label">{{ $t('addPlatform.logoutUrl') }}</label>
            <input v-model="form.logoutUrl" type="text" class="form-input" :placeholder="$t('addPlatform.logoutUrlPlaceholder')" />
          </div>
        </div>
      </details>

      <div class="form-actions">
        <button
          class="btn btn-secondary"
          @click="handleTest"
          :disabled="testing || !canSubmit"
        >
          <span v-if="testing" class="spinner"></span>
          {{ testing ? $t('common.testing') : $t('addPlatform.testLogin') }}
        </button>
        <button
          class="btn btn-primary"
          @click="handleSave"
          :disabled="saving || !canSubmit"
        >
          <span v-if="saving" class="spinner"></span>
          {{ saving ? $t('common.saving') : (isEdit ? $t('addPlatform.saveChanges') : $t('common.save')) }}
        </button>
      </div>

      <div v-if="testResult" class="test-result" :class="testResult.pending ? 'pending' : testResult.success ? 'success' : 'failed'">
        <span class="result-icon">{{ testResult.pending ? '…' : testResult.success ? '✅' : '❌' }}</span>
        <span class="result-text">{{ testResult.message }}</span>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useStore } from '../store'
import { canSavePlatformForm } from '../lib/platformForm.mjs'

const route = useRoute()
const router = useRouter()
const store = useStore()
const { t } = useI18n()

const isEdit = computed(() => !!route.params.id)

const allDays = computed(() => [
  { value: 'mon', label: t('common.mon') },
  { value: 'tue', label: t('common.tue') },
  { value: 'wed', label: t('common.wed') },
  { value: 'thu', label: t('common.thu') },
  { value: 'fri', label: t('common.fri') },
  { value: 'sat', label: t('common.sat') },
  { value: 'sun', label: t('common.sun') }
])

const form = reactive({
  id: null,
  name: '',
  type: 'web',
  url: '',
  loginSystemId: null,
  accountSource: 'custom',
  account: '',
  password: '',
  wifiName: '',
  requiresAuth: true,
  groupId: null,
  skipGroupLogin: false,
  scheduleDays: [],
  autoConnect: false,
  accountSelector: '',
  passwordSelector: '',
  submitSelector: '',
  successUrl: '',
  logoutUrl: '',
  statusUrl: '',
  createdAt: null
})

const showPassword = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref(null)
const errorMsg = ref('')
const nameInput = ref(null)
const loginSystems = ref([])
const groupSaving = ref(false)
const groupMessage = ref('')
const groupMessageType = ref('')
const groupChoice = ref('')
const newGroupName = ref('')
const newGroupSharedAccount = ref('')
const newGroupSharedPassword = ref('')
const sharedCredentialGroups = computed(() => store.groups.filter(group => group.hasSharedCredentials))
const availableLoginSystems = computed(() => loginSystems.value.filter(system =>
  system.hasCredentials && (system.groupId || '') === (form.groupId || '')
))
const selectedLoginSystem = computed(() => availableLoginSystems.value.find(system => system.id === form.loginSystemId) || null)
const selectedGroupHasCredentials = computed(() => sharedCredentialGroups.value.some(group => group.id === form.groupId))

const canSubmit = computed(() => canSavePlatformForm(form, {
  hasLoginSystem: availableLoginSystems.value.some(system => system.id === form.loginSystemId),
  hasGroupCredentials: sharedCredentialGroups.value.some(group => group.id === form.groupId)
}))

onMounted(async () => {
  if (!store.loaded) {
    await store.loadPlatforms()
  }
  await store.loadSettings()
  await store.loadGroups()
  loginSystems.value = await window.autoMate.getLoginSystems()
  if (isEdit.value) {
    const platform = store.getPlatformById(route.params.id)
    if (platform) {
      form.id = platform.id
      form.type = platform.type || 'web'
      form.name = form.type === 'network'
        ? platform.wifiName || platform.wifi || platform.name
        : platform.name
      form.url = platform.url || ''
      form.requiresAuth = platform.requiresAuth !== false
      form.loginSystemId = platform.loginSystemId || null
      form.accountSource = platform.accountSource || 'custom'
      form.wifiName = platform.wifiName || platform.wifi || ''
      form.groupId = platform.groupId ?? null
      groupChoice.value = form.groupId || ''
      form.skipGroupLogin = !!platform.skipGroupLogin
      form.scheduleDays = Array.isArray(platform.scheduleDays)
        ? [...platform.scheduleDays]
        : allDays.map(d => d.value)
      form.autoConnect = platform.autoConnect !== false
      form.accountSelector = platform.accountSelector || ''
      form.passwordSelector = platform.passwordSelector || ''
      form.submitSelector = platform.submitSelector || ''
      form.successUrl = platform.successUrl || ''
      form.logoutUrl = platform.logoutUrl || ''
      form.statusUrl = platform.statusUrl || ''
      form.createdAt = platform.createdAt
    } else {
      errorMsg.value = t('addPlatform.notFound')
    }
  } else {
    const routeType = route.query.type
    form.type = routeType === 'network' || routeType === 'web'
      ? routeType
      : store.settings.defaultLoginType === 'network' ? 'network' : 'web'
    nameInput.value?.focus()
  }
})

async function handleSave() {
  errorMsg.value = ''
  if (!canSubmit.value) {
    if (form.type === 'network') {
      errorMsg.value = !form.wifiName.trim()
        ? t('addPlatform.pleaseFillWifiName')
        : form.requiresAuth && !form.url.trim()
          ? t('addPlatform.pleaseFillAuthUrl')
          : t('addPlatform.pleaseCheckCredentials')
    } else {
      errorMsg.value = !form.name.trim()
        ? t('addPlatform.pleaseFillWebName')
        : !form.url.trim()
          ? t('addPlatform.pleaseFillWebUrl')
          : t('addPlatform.pleaseCheckCredentials')
    }
    return
  }

  let url = form.url.trim()
  if (url && !/^https?:\/\//i.test(url)) {
    url = 'http://' + url
  }

  saving.value = true
  try {
    const result = await store.savePlatform({
      id: form.id,
      name: (form.type === 'network' ? form.wifiName : form.name).trim(),
      type: form.type,
      url,
      requiresAuth: form.requiresAuth,
      accountSource: form.requiresAuth ? form.accountSource : 'custom',
      loginSystemId: form.requiresAuth ? form.loginSystemId : null,
      account: form.requiresAuth ? form.account : '',
      password: form.requiresAuth ? form.password : '',
      wifi: form.wifiName.trim(),
      wifiName: form.wifiName.trim(),
      groupId: form.groupId,
      skipGroupLogin: !!form.skipGroupLogin,
      scheduleDays: [...form.scheduleDays],
      autoConnect: !!form.autoConnect,
      accountSelector: form.accountSelector.trim(),
      passwordSelector: form.passwordSelector.trim(),
      submitSelector: form.submitSelector.trim(),
      successUrl: form.successUrl.trim(),
      logoutUrl: form.logoutUrl.trim(),
      statusUrl: form.statusUrl.trim(),
      createdAt: form.createdAt
    })

    if (result.success) {
      form.account = ''
      form.password = ''
      router.push('/')
    } else {
      errorMsg.value = result.error || t('addPlatform.saveFailed')
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  errorMsg.value = ''
  testResult.value = null
  if (!canSubmit.value) {
    errorMsg.value = t('addPlatform.pleaseFillAllRequired')
    return
  }

  let url = form.url.trim()
  if (url && !/^https?:\/\//i.test(url)) {
    url = 'http://' + url
  }

  testing.value = true
  try {
    let account = form.account
    let password = form.password
    if (!form.requiresAuth) {
      account = ''
      password = ''
    } else if (form.loginSystemId) {
      const system = availableLoginSystems.value.find(item => item.id === form.loginSystemId)
      if (!system) throw new Error(t('addPlatform.loginSystemUnavailable'))
      const credentials = await window.autoMate.getLoginSystemCredentials(form.loginSystemId)
      if (!credentials.success) throw new Error(credentials.error || t('addPlatform.cannotReadSystemCredentials'))
      account = credentials.account
      password = credentials.password
      url = system.loginUrl
    } else if (form.accountSource === 'inherit') {
      const credentials = await window.autoMate.getGroupCredentials(form.groupId)
      if (!credentials.success) throw new Error(credentials.error || t('addPlatform.cannotReadGroupCredentials'))
      account = credentials.account
      password = credentials.password
    }
    const result = await window.autoMate.testLogin({
      name: form.name.trim(),
      type: form.type,
      requiresAuth: form.requiresAuth,
      url: url,
      wifiName: form.wifiName.trim(),
      account,
      password,
      accountSelector: form.accountSelector.trim(),
      passwordSelector: form.passwordSelector.trim(),
      submitSelector: form.submitSelector.trim(),
      successUrl: form.successUrl.trim(),
      logoutUrl: form.logoutUrl.trim()
    })
    if (result.pending) {
      result.message = form.requiresAuth
        ? t('addPlatform.testPendingAuth')
        : t('addPlatform.testPendingNoAuth')
    }
    testResult.value = result
  } catch (err) {
    testResult.value = { success: false, message: err.message }
  } finally {
    testing.value = false
  }
}

function handleGroupChoiceChange() {
  if (groupChoice.value === '__create_group__') {
    form.groupId = null
    form.loginSystemId = null
    if (form.accountSource === 'inherit') form.accountSource = 'custom'
    return
  }
  form.groupId = groupChoice.value || null
  if (!availableLoginSystems.value.some(system => system.id === form.loginSystemId)) {
    form.loginSystemId = null
  }
}

async function createGroup() {
  groupMessage.value = ''
  if (!newGroupName.value.trim()) {
    groupMessage.value = t('common.pleaseFillGroupName')
    groupMessageType.value = 'error'
    return
  }
  if (Boolean(newGroupSharedAccount.value.trim()) !== Boolean(newGroupSharedPassword.value)) {
    groupMessage.value = t('common.accountAndPasswordBothOrNeither')
    groupMessageType.value = 'error'
    return
  }

  groupSaving.value = true
  try {
    const name = newGroupName.value.trim()
    const result = await store.saveGroup({
      name,
      sharedAccount: newGroupSharedAccount.value,
      sharedPassword: newGroupSharedPassword.value
    })
    if (!result.success) throw new Error(result.error || t('addPlatform.groupCreateFailed'))
    const created = store.groups.find(group => group.name === name)
    if (!created) throw new Error(t('addPlatform.groupSavedButNotFound'))
    groupChoice.value = created.id
    form.groupId = created.id
    newGroupName.value = ''
    newGroupSharedAccount.value = ''
    newGroupSharedPassword.value = ''
    groupMessage.value = t('addPlatform.groupCreated')
    groupMessageType.value = 'success'
  } catch (err) {
    groupMessage.value = err.message
    groupMessageType.value = 'error'
  } finally {
    groupSaving.value = false
  }
}

</script>

<style scoped>
.add-view {
  max-width: 640px;
  margin: 0 auto;
}

.form-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.group-manager {
  margin: 20px 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  padding: 14px 0;
}

.group-manager summary {
  color: var(--color-text);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.managed-groups {
  margin-top: 12px;
}

.managed-group,
.managed-group-actions,
.group-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.managed-group {
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}

.managed-group-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.managed-group-info strong { font-size: 13px; }
.managed-group-info span { color: var(--text-tertiary); font-size: 12px; }
.group-editor { padding-top: 14px; }
.group-editor h3 { margin-bottom: 12px; font-size: 14px; }
.group-actions { justify-content: flex-start; }
.group-manager .error-msg.success { color: var(--status-success); }

.form-section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--color-text);
}

.form-group {
  margin-bottom: 16px;
  position: relative;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 6px;
}

.required {
  color: var(--status-failed);
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface);
  transition: border-color 0.15s ease;
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.auth-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
}

.auth-option input { width: 16px; height: 16px; accent-color: var(--accent-mint-ink); }
.auth-hint { margin: 0 0 16px; }

.toggle-pwd {
  position: absolute;
  right: 8px;
  bottom: 8px;
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: 12px;
  padding: 2px 6px;
  cursor: pointer;
}

.toggle-pwd:hover {
  color: var(--color-primary);
}

.advanced-section {
  margin-bottom: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
}

.advanced-summary {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--color-surface-muted);
  user-select: none;
}

.advanced-summary:hover {
  background: var(--color-surface-hover);
}

.advanced-body {
  padding: 14px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.form-actions .btn {
  min-width: 120px;
}

.test-result {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.test-result.success {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.test-result.pending {
  background: var(--status-warning-bg);
  color: var(--status-logging);
}

.test-result.failed {
  background: var(--status-failed-bg);
  color: var(--status-failed);
}

.error-msg {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--status-failed-bg);
  color: var(--status-failed);
  font-size: 14px;
}

.type-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.type-option {
  position: relative;
  cursor: pointer;
}

.type-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.type-box {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.15s ease;
  background: var(--color-surface);
}

.type-option.active .type-box {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.type-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.type-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.form-select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
}

.day-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.day-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  background: var(--color-surface);
  transition: all 0.15s ease;
}

.day-chip:has(input:checked) {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px dashed var(--color-border);
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switch-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.switch-sub {
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
</style>