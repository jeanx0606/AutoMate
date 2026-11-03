<template>
  <section class="extension-wizard" aria-live="polite">
    <div class="wizard-heading">
      <div>
        <p class="wizard-eyebrow">{{ $t('extension.eyebrow') }}</p>
        <h3>{{ setup?.paired ? $t('extension.connected') : stepTitle }}</h3>
      </div>
      <span v-if="!setup?.paired" class="wizard-count">{{ currentStep }} / 3</span>
    </div>

    <div v-if="setup?.paired" class="wizard-success">
      <p>{{ $t('extension.pairedSuccess') }}</p>
      <p v-if="setup.lastVerified" class="wizard-note">{{ $t('extension.lastConnected', { time: formatVerified(setup.lastVerified) }) }}</p>
      <button class="btn btn-danger" type="button" :disabled="busy" @click="unpairExtension">
        {{ busy ? $t('common.unpairing') : $t('extension.unpair') }}
      </button>
    </div>

    <template v-else>
      <div v-if="currentStep === 1" class="wizard-step">
        <p>{{ $t('extension.step1Desc') }}</p>
        <div class="browser-choices">
          <div class="browser-choice chrome-choice" @click="selectBrowser('chrome')">
            <span class="browser-mark" aria-hidden="true">C</span>
            <div class="browser-content">
              <strong>Google Chrome</strong>
              <div class="browser-bottom">
                <code class="ext-url">chrome://extensions</code>
                <button class="copy-url-btn" type="button" @click.stop.prevent="copyExtUrl('chrome://extensions')">{{ $t('extension.copyUrl') }}</button>
              </div>
            </div>
          </div>
          <div class="browser-choice edge-choice" @click="selectBrowser('edge')">
            <span class="browser-mark" aria-hidden="true">E</span>
            <div class="browser-content">
              <strong>Microsoft Edge</strong>
              <div class="browser-bottom">
                <code class="ext-url">edge://extensions</code>
                <button class="copy-url-btn" type="button" @click.stop.prevent="copyExtUrl('edge://extensions')">{{ $t('extension.copyUrl') }}</button>
              </div>
            </div>
          </div>
        </div>
        <p v-if="selectedBrowser" class="wizard-hint">{{ $t('extension.step1Hint') }}</p>
      </div>

      <div v-else-if="currentStep === 2" class="wizard-step">
        <p>{{ $t('extension.step2Desc') }}</p>
        <code class="copy-field">{{ setup?.extensionFolder || $t('extension.readingFolder') }}</code>
        <div class="wizard-actions">
          <button class="btn btn-secondary" type="button" :disabled="!setup?.extensionFolder" @click="copyFolder">
            {{ copiedFolder ? $t('extension.copiedFolderPath') : $t('extension.copyFolderPath') }}
          </button>
          <button class="btn btn-secondary" type="button" @click="openFolder">{{ $t('extension.openFolder') }}</button>
        </div>
        <label class="wizard-check"><input v-model="folderLoaded" type="checkbox" /> {{ $t('extension.loadedCheck') }}</label>
        <p class="wizard-note">{{ $t('extension.permissionNote') }}</p>
      </div>

      <div v-else class="wizard-step">
        <p>{{ $t('extension.step3Desc') }}</p>
        <div class="pairing-row">
          <code class="copy-field pairing-value">{{ setup?.pairingCode || $t('extension.pairingUnavailable') }}</code>
          <button class="btn btn-secondary" type="button" :disabled="!setup?.pairingCode" @click="copyPairingCode">
            {{ copiedCode ? $t('extension.copied') : $t('extension.copyPairingCode') }}
          </button>
        </div>
        <p v-if="!setup?.bridgeAvailable" class="wizard-error">{{ setup?.bridgeError || $t('extension.bridgeNotRunning') }}</p>
      </div>

      <p v-if="errorMessage" class="wizard-error" role="alert">{{ errorMessage }}</p>

      <div v-if="!setup?.paired" class="wizard-footer">
        <button v-if="currentStep > 1" class="btn btn-secondary" type="button" :disabled="busy" @click="currentStep--">{{ $t('extension.prevStep') }}</button>
        <button
          v-if="currentStep < 3"
          class="btn btn-primary"
          type="button"
          :disabled="busy || (currentStep === 1 && !managerOpened) || (currentStep === 2 && !folderLoaded)"
          @click="currentStep++"
        >{{ $t('extension.nextStep') }}</button>
        <button v-else class="btn btn-primary" type="button" :disabled="busy" @click="checkPairing">
          {{ busy ? $t('common.checking') : $t('extension.checkPairing') }}
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits(['paired', 'finished'])
const setup = ref(null)
const currentStep = ref(1)
const selectedBrowser = ref('')
const managerOpened = ref(false)
const folderLoaded = ref(false)
const copiedFolder = ref(false)
const copiedCode = ref(false)
const copiedUrl = ref('')
const busy = ref(false)
const errorMessage = ref('')

const stepTitle = computed(() => [
  t('extension.step1Title'),
  t('extension.step2Title'),
  t('extension.step3Title')
][currentStep.value - 1])

onMounted(refreshSetup)

async function refreshSetup() {
  try {
    setup.value = await window.autoMate.getBrowserExtensionSetup()
    if (setup.value.paired) {
      currentStep.value = 3
      emit('paired')
    }
  } catch (error) {
    errorMessage.value = t('extension.cannotReadState', { error: error.message })
  }
}

function copyExtUrl(url) {
  navigator.clipboard.writeText(url).catch(() => {})
  copiedUrl.value = url
  setTimeout(() => { copiedUrl.value = '' }, 1800)
}

function selectBrowser(browser) {
  selectedBrowser.value = browser
  managerOpened.value = true
}

async function copyText(value, onSuccess) {
  try {
    await navigator.clipboard.writeText(value)
    onSuccess.value = true
    setTimeout(() => { onSuccess.value = false }, 1800)
  } catch (error) {
    errorMessage.value = t('extension.cannotCopy', { error: error.message })
  }
}

function copyFolder() {
  if (setup.value?.extensionFolder) copyText(setup.value.extensionFolder, copiedFolder)
}

function copyPairingCode() {
  if (setup.value?.pairingCode) copyText(setup.value.pairingCode, copiedCode)
}

async function openFolder() {
  try {
    const result = await window.autoMate.openBrowserExtensionFolder()
    if (!result.success) throw new Error(result.error || t('extension.cannotOpenFolder'))
  } catch (error) {
    errorMessage.value = error.message
  }
}

function openBrowserOptions() {
  if (!selectedBrowser.value) return
  selectBrowser(selectedBrowser.value)
}

async function checkPairing() {
  busy.value = true
  errorMessage.value = ''
  try {
    await refreshSetup()
    if (setup.value?.paired) {
      emit('paired')
      return
    }
    if (!setup.value?.bridgeAvailable) {
      errorMessage.value = setup.value?.bridgeError || t('extension.bridgeNotRunningRestart')
    } else if (setup.value?.pairingError) {
      errorMessage.value = setup.value.pairingError
    } else {
      errorMessage.value = t('extension.notPairedYet')
    }
  } finally {
    busy.value = false
  }
}

async function unpairExtension() {
  if (!confirm(t('extension.unpairConfirm'))) return
  busy.value = true
  errorMessage.value = ''
  try {
    const result = await window.autoMate.unpairBrowserExtension()
    if (!result.success) throw new Error(result.error || t('extension.unpairFailed'))
    await refreshSetup()
    currentStep.value = 1
    selectedBrowser.value = ''
    managerOpened.value = false
    emit('finished')
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    busy.value = false
  }
}

function formatVerified(timestamp) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}
</script>

<style scoped>
.extension-wizard { display: grid; gap: 16px; padding: 18px; border: 1px solid var(--color-border); border-radius: var(--radius); background: linear-gradient(135deg, var(--accent-sky) 0%, var(--accent-lavender) 100%); }
.wizard-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.wizard-eyebrow { margin-bottom: 4px; color: var(--accent-sky-ink); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.wizard-heading h3 { color: var(--color-text); font-size: 17px; }
.wizard-count { padding: 4px 9px; border-radius: 99px; background: var(--color-surface); color: var(--accent-lavender-ink); font-size: 12px; font-weight: 700; }
.wizard-step { display: grid; gap: 12px; color: var(--color-text); font-size: 13px; line-height: 1.55; }
.browser-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.browser-choice { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-surface); color: var(--color-text); text-align: left; cursor: pointer; }
.browser-choice:hover:not(:disabled) { border-color: var(--accent-sky-ink); transform: translateY(-1px); }
.browser-mark { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%; background: var(--accent-sky); color: var(--accent-sky-ink); font-size: 16px; font-weight: 700; }
.edge-choice .browser-mark { background: var(--accent-mint); color: var(--accent-mint-ink); }
.wizard-hint { padding: 10px 12px; border-left: 3px solid var(--accent-sky-ink); background: var(--accent-sky); color: var(--accent-sky-ink); }
.copy-field { display: block; min-width: 0; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 5px; background: var(--color-surface); color: var(--color-text); font-size: 12px; overflow-wrap: anywhere; user-select: all; }
.wizard-actions, .wizard-footer, .pairing-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.wizard-footer { justify-content: flex-end; padding-top: 12px; border-top: 1px solid rgba(86, 69, 112, 0.18); }
.wizard-check { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); }
.pairing-row .copy-field { flex: 1 1 260px; }
.wizard-error { padding: 10px 12px; border-left: 3px solid var(--accent-rose-ink); background: var(--accent-rose); color: var(--accent-rose-ink); font-size: 12px; line-height: 1.5; }
.wizard-success { display: grid; justify-items: start; gap: 12px; color: var(--accent-mint-ink); }
.wizard-note { color: var(--text-secondary); font-size: 12px; }
.ext-url { padding: 3px 8px; border-radius: 4px; background: var(--color-surface); color: var(--accent-sky-ink); font-size: 12px; user-select: all; }
.copy-url-btn { flex: 0 0 auto; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-surface); color: var(--accent-sky-ink); font-size: 14px; cursor: pointer; line-height: 1; }
.copy-url-btn:hover { background: var(--accent-sky); border-color: var(--accent-sky-ink); }
.browser-content { display: grid; gap: 6px; flex: 1 1 auto; min-width: 0; }
.browser-bottom { display: flex; align-items: center; gap: 8px; }
@media (max-width: 560px) { .browser-choices { grid-template-columns: 1fr; } }
</style>