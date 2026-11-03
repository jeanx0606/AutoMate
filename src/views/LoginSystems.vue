<template>
  <div class="systems-view">
    <section class="systems-section">
      <div v-if="!editorOnly && visibleSystems.length" class="system-list">
        <article
          v-for="system in visibleSystems"
          :key="system.id"
          class="system-row"
          draggable="true"
          @dragstart="startDrag($event, system.id)"
          @dragover.prevent
          @drop.stop.prevent="dropOnSystem($event, system)"
        >
          <div class="system-main">
            <div class="system-symbol" :style="{ '--system-color': system.iconColor || '#587895' }">
              <span class="shape-mark" :class="`shape-${system.iconShape || 'circle'}`" aria-hidden="true"></span>
            </div>
            <div class="system-copy">
              <strong>{{ system.name }}</strong>
              <span>{{ system.loginUrl }}</span>
            </div>
          </div>
          <div class="system-actions">
            <button class="btn btn-primary btn-sm" type="button" @click="login(system)">{{ $t('loginSystems.loginBtn') }}</button>
            <button class="btn btn-secondary btn-sm" type="button" @click="editSystem(system)">{{ $t('loginSystems.editBtn') }}</button>
            <button class="btn btn-danger btn-sm" type="button" @click="removeSystem(system)">{{ $t('loginSystems.deleteBtn') }}</button>
          </div>
          <div class="destinations" v-if="system.destinations?.length">
            <div v-for="destination in system.destinations" :key="destination.id" class="destination-item">
              <button class="destination-open" type="button" @click="openDestination(system, destination)">
                <span>{{ destination.name }}</span>
              </button>
              <button class="destination-delete" type="button" :aria-label="$t('loginSystems.deleteDestination', { name: destination.name })" @click="removeDestination(system, destination)">×</button>
            </div>
          </div>
          <div v-else class="no-destinations">{{ $t('loginSystems.noDestinations') }}</div>
        </article>
      </div>
    </section>

    <section v-if="editorOpen" class="editor-section">
      <div v-if="!editorOnly" class="section-head">
        <h2>{{ editingId ? $t('loginSystems.editTitle') : $t('loginSystems.newTitle') }}</h2>
        <button class="btn btn-secondary btn-sm" type="button" @click="closeEditor">{{ $t('common.close') }}</button>
      </div>
      <div class="form-group">
        <label class="form-label">{{ $t('loginSystems.systemName') }}</label>
        <input ref="systemNameInput" v-model="systemForm.name" class="form-input" type="text" :placeholder="$t('loginSystems.systemNamePlaceholder')" aria-label="system name" />
      </div>
      <div class="form-group">
        <label class="form-label">{{ $t('loginSystems.loginUrl') }}</label>
        <input v-model="systemForm.loginUrl" class="form-input" type="url" placeholder="https://sso.example.edu/login" />
      </div>
      <div class="form-group">
        <label class="form-label">{{ $t('loginSystems.groupLabel') }}</label>
        <select v-model="systemForm.groupId" class="form-select">
          <option value="">{{ $t('common.ungrouped') }}</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
        </select>
      </div>
      <div class="system-icon-fields">
        <label class="form-label">{{ $t('loginSystems.iconShape') }}
          <select v-model="systemForm.iconShape" class="form-select" aria-label="icon shape">
            <option value="circle">{{ $t('loginSystems.shapeCircle') }}</option>
            <option value="square">{{ $t('loginSystems.shapeSquare') }}</option>
            <option value="triangle">{{ $t('loginSystems.shapeTriangle') }}</option>
            <option value="star">{{ $t('loginSystems.shapeStar') }}</option>
          </select>
        </label>
        <label class="form-label">{{ $t('loginSystems.iconColor') }}
          <input v-model="systemForm.iconColor" class="color-field" type="color" aria-label="icon color" />
        </label>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">{{ $t('loginSystems.account') }}</label>
          <input v-model="systemForm.account" class="form-input" type="text" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label">{{ $t('loginSystems.password') }}</label>
          <input v-model="systemForm.password" class="form-input" type="password" autocomplete="new-password" />
        </div>
      </div>
      <p v-if="editingId" class="field-note">{{ $t('loginSystems.editCredentialsHint') }}</p>
      <div class="editor-actions">
        <button class="btn btn-primary" type="button" @click="saveSystem" :disabled="saving">
          {{ saving ? $t('common.saving') : $t('loginSystems.saveSystem') }}
        </button>
      </div>
      <p v-if="editorMessage" class="message" :class="editorError ? 'error' : 'success'">{{ editorMessage }}</p>

      <div v-if="editingId" class="destination-editor">
        <h3>{{ $t('loginSystems.destinationsTitle') }}</h3>
        <div class="destination-fields">
          <input v-model="destinationForm.name" class="form-input" type="text" :placeholder="$t('loginSystems.destNamePlaceholder')" />
          <input v-model="destinationForm.url" class="form-input" type="url" :placeholder="$t('loginSystems.destUrlPlaceholder')" />
          <button class="btn btn-secondary" type="button" @click="saveDestination" :disabled="savingDestination">{{ $t('loginSystems.addDestination') }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps({
  groupId: { type: String, default: '' },
  groups: { type: Array, default: () => [] },
  editorOnly: { type: Boolean, default: false }
})
const emit = defineEmits(['drop-system', 'close'])

const systems = ref([])
const visibleSystems = computed(() => {
  const knownGroupIds = new Set(props.groups.map(group => group.id))
  return systems.value.filter(system => props.groupId
    ? system.groupId === props.groupId
    : !system.groupId || !knownGroupIds.has(system.groupId)
  )
})
const editorOpen = ref(false)
const systemNameInput = ref(null)
const editingId = ref(null)
const saving = ref(false)
const savingDestination = ref(false)
const editorMessage = ref('')
const editorError = ref(false)
const systemForm = reactive({ name: '', loginUrl: '', groupId: '', account: '', password: '', iconShape: 'circle', iconColor: '#587895' })
const destinationForm = reactive({ name: '', url: '' })
let removeStatusListener = null

onMounted(async () => {
  await loadSystems()
  window.addEventListener('automate-login-systems-updated', loadSystems)
  if (props.editorOnly) {
    startNewSystem()
    await nextTick()
    systemNameInput.value?.focus()
  }
  removeStatusListener = window.autoMate.onPlatformStatusUpdate(data => {
    const system = systems.value.find(item => item.id === data.platformId)
    if (system) system.status = data.status
  })
})

onUnmounted(() => {
  removeStatusListener?.()
  window.removeEventListener('automate-login-systems-updated', loadSystems)
})

async function loadSystems() {
  systems.value = await window.autoMate.getLoginSystems()
}

function startDrag(event, systemId) {
  event.dataTransfer?.setData('application/x-automate-group-item', JSON.stringify({ kind: 'system', id: systemId }))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function dropOnSystem(event, target) {
  try {
    const item = JSON.parse(event.dataTransfer?.getData('application/x-automate-group-item') || '{}')
    if (item?.id) emit('drop-system', { item, beforeId: target.id })
  } catch (_) {}
}

function startNewSystem() {
  editingId.value = null
  systemForm.name = ''
  systemForm.loginUrl = ''
  systemForm.groupId = props.groupId || ''
  systemForm.account = ''
  systemForm.password = ''
  systemForm.iconShape = 'circle'
  systemForm.iconColor = '#587895'
  editorMessage.value = ''
  editorOpen.value = true
  nextTick(() => systemNameInput.value?.focus())
}

async function editSystem(system) {
  const credentials = await window.autoMate.getLoginSystemCredentials(system.id)
  if (!credentials.success) {
    editorError.value = true
    editorMessage.value = credentials.error || t('loginSystems.cannotReadCredentials')
    editorOpen.value = true
    return
  }
  editingId.value = system.id
  systemForm.name = system.name
  systemForm.loginUrl = system.loginUrl
  systemForm.groupId = system.groupId || ''
  systemForm.account = credentials.account
  systemForm.password = credentials.password
  systemForm.iconShape = ['circle', 'square', 'triangle', 'star'].includes(system.iconShape) ? system.iconShape : 'circle'
  systemForm.iconColor = /^#[0-9a-f]{6}$/i.test(system.iconColor || '') ? system.iconColor : '#587895'
  editorMessage.value = ''
  editorOpen.value = true
  await nextTick()
  systemNameInput.value?.focus()
}

function closeEditor() {
  editorOpen.value = false
  if (props.editorOnly) emit('close')
}

async function saveSystem() {
  saving.value = true
  editorMessage.value = ''
  try {
    const result = await window.autoMate.saveLoginSystem({
      id: editingId.value,
      name: systemForm.name,
      loginUrl: systemForm.loginUrl,
      groupId: systemForm.groupId || null,
      account: systemForm.account,
      password: systemForm.password,
      iconShape: systemForm.iconShape,
      iconColor: systemForm.iconColor
    })
    editorError.value = !result.success
    editorMessage.value = result.success ? t('loginSystems.systemSaved') : result.error || t('loginSystems.saveFailed')
    if (result.success) {
      window.dispatchEvent(new Event('automate-login-systems-updated'))
      await loadSystems()
      const saved = systems.value.find(item => item.id === result.id) || systems.value.find(item => item.name === systemForm.name)
      editingId.value = saved?.id || editingId.value
      systemForm.account = ''
      systemForm.password = ''
      if (props.editorOnly) emit('close')
    }
  } catch (error) {
    editorError.value = true
    editorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

async function saveDestination() {
  if (!editingId.value) return
  savingDestination.value = true
  try {
    const result = await window.autoMate.addDestination(editingId.value, { ...destinationForm })
    if (!result.success) {
      editorError.value = true
      editorMessage.value = result.error || t('loginSystems.destSaveFailed')
      return
    }
    destinationForm.name = ''
    destinationForm.url = ''
    await loadSystems()
  } finally {
    savingDestination.value = false
  }
}

async function removeDestination(system, destination) {
  if (!confirm(t('loginSystems.confirmDeleteDest', { name: destination.name }))) return
  await window.autoMate.deleteDestination(system.id, destination.id)
  window.dispatchEvent(new Event('automate-login-systems-updated'))
  await loadSystems()
}

async function removeSystem(system) {
  if (!confirm(t('loginSystems.confirmDeleteSystem', { name: system.name }))) return
  const result = await window.autoMate.deleteLoginSystem(system.id)
  if (!result.success) {
    window.alert(result.error || t('loginSystems.deleteFailed'))
    return
  }

async function removeSystem(system) {
  if (!confirm(t('loginSystems.confirmDeleteSystem', { name: system.name }))) return
  const result = await window.autoMate.deleteLoginSystem(system.id)
  if (!result.success) {
    window.alert(result.error || t('loginSystems.deleteFailed'))
    return
  }
  window.dispatchEvent(new Event('automate-login-systems-updated'))
  if (editingId.value === system.id) closeEditor()
  await loadSystems()
}

async function login(system) {
  const result = await window.autoMate.loginSystem(system.id)
  if (!result.pending && !result.success) window.alert(result.message || result.error || t('loginSystems.cannotOpenLoginPage'))
}

async function openDestination(system, destination) {
  const result = await window.autoMate.openDestination(system.id, destination.id)
  if (!result.success) window.alert(result.error || t('loginSystems.cannotOpenDestination'))
}

</script>

<style scoped>
.systems-view {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.systems-section,
.editor-section {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-border);
}

.editor-section {
  padding: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.form-group { min-width: 0; margin-bottom: 16px; }
.form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.form-label { display: block; margin-bottom: 6px; color: var(--color-text); font-size: 13px; font-weight: 600; }
.form-input, .form-select {
  width: 100%;
  min-height: 40px;
  padding: 9px 11px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.form-input:focus, .form-select:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
.form-input::placeholder { color: var(--text-tertiary); }
.required { color: var(--status-failed); }

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.section-head h2 { font-size: 18px; }
.section-head p,
.field-note { margin-top: 5px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }

.system-list { border-top: 1px solid var(--color-border); }

.system-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px 20px;
  margin: 10px 0;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-left: 4px solid #6096ba;
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  cursor: grab;
  transition: box-shadow 0.15s ease, border-left-color 0.15s ease;
}

.system-row:hover {
  box-shadow: var(--shadow-md);
  border-left-color: #274c77;
}

.system-row:hover {
  box-shadow: var(--shadow-md);
  border-left-color: #274c77;
}

.system-main { min-width: 0; display: flex; align-items: center; gap: 12px; }
.system-symbol {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 10px;
  background: var(--color-primary-light);
}
.shape-mark { width: 18px; height: 18px; background: var(--system-color); }
.shape-circle { border-radius: 50%; }
.shape-square { border-radius: 3px; }
.shape-triangle { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.shape-star { clip-path: polygon(50% 0, 62% 35%, 100% 38%, 72% 61%, 81% 100%, 50% 78%, 19% 100%, 28% 61%, 0 38%, 38% 35%); }
.system-icon-fields { display: grid; grid-template-columns: minmax(0, 220px) 100px; align-items: end; gap: 14px; margin-bottom: 16px; }
.system-icon-fields .form-label { display: grid; gap: 6px; }
.system-icon-fields .color-field { width: 100%; height: 40px; }
.system-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.system-copy strong { font-size: 14px; }
.system-copy span { overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.system-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.destinations { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
.destination-item { display: flex; align-items: center; border: 1px solid var(--color-border); border-radius: 99px; overflow: hidden; background: var(--color-surface); }
.destination-open { display: flex; align-items: center; gap: 7px; padding: 6px 12px; background: transparent; color: var(--color-text); font-size: 12.5px; }
.destination-open:hover { background: var(--color-primary-light); }
.destination-delete { align-self: stretch; display: grid; place-items: center; padding: 0 10px; background: #fff; color: var(--text-tertiary); border-left: 1px solid var(--color-border); }
.destination-delete:hover { color: var(--status-failed); background: var(--status-failed-bg); }
.no-destinations,.empty-state { padding: 14px 0; color: var(--text-secondary); font-size: 13px; }

.editor-section { padding-top: 4px; }
.editor-section h2 { font-size: 18px; }
.destination-editor { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--color-border); }
.destination-editor h3 { margin-bottom: 12px; font-size: 14px; }
.destination-fields { display: grid; grid-template-columns: 1fr 1.6fr auto; gap: 8px; align-items: center; }
.color-field { width: 42px; height: 38px; padding: 3px; border: 1px solid var(--color-border); background: var(--color-surface); }
.editor-actions { margin-top: 12px; }
.message { margin-top: 10px; font-size: 13px; }
.message.error { color: var(--status-failed); }
.message.success { color: var(--status-success); }

@media (max-width: 720px) {
  .system-row { grid-template-columns: 1fr; }
  .system-actions { grid-row: 2; }
  .destination-fields { grid-template-columns: 1fr 1fr; }
  .destination-fields .btn { grid-column: 1 / -1; }
  .form-row { grid-template-columns: 1fr; gap: 0; }
  .editor-section { padding: 16px; }
}
</style>
