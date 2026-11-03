<template>
  <div class="groups-view">
    <section v-if="viewMode === 'new-group'" class="group-create">
      <h2>{{ $t('groups.newGroup') }}</h2>
      <div class="form-group">
        <label class="form-label">{{ $t('common.groupNameRequired') }}</label>
        <input ref="groupNameInput" v-model="groupName" class="form-input" type="text" autocomplete="off" :aria-label="$t('common.groupNameLabel')" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">{{ $t('common.sharedAccountOptional') }}</label>
          <input v-model="sharedAccount" class="form-input" type="text" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label">{{ $t('common.sharedPasswordOptional') }}</label>
          <input v-model="sharedPassword" class="form-input" type="password" autocomplete="new-password" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" @click="viewMode = 'list'">{{ $t('common.cancel') }}</button>
        <button class="btn btn-primary" type="button" @click="saveGroup" :disabled="saving">
          {{ saving ? $t('common.saving') : $t('groups.newGroup') }}
        </button>
      </div>
      <p v-if="message" class="message" :class="messageType">{{ message }}</p>
    </section>

    <section v-else-if="viewMode === 'new-system'" class="system-editor-page">
      <header class="editor-page-heading">
        <h2>{{ $t('groups.newLoginSystem') }}</h2>
        <button class="btn btn-secondary btn-sm" type="button" @click="viewMode = 'list'">{{ $t('groups.backToWebManagement') }}</button>
      </header>
      <LoginSystems :key="`new-system-${newSystemGroupId || 'ungrouped'}`" :group-id="newSystemGroupId || ''" :groups="store.groups" editor-only @close="viewMode = 'list'" />
    </section>

    <section v-else-if="viewMode === 'edit-group'" class="group-editor-page">
      <header class="editor-page-heading">
        <h2>{{ $t('groups.editGroup') }}</h2>
        <button class="btn btn-secondary btn-sm" type="button" @click="cancelEdit">{{ $t('groups.backToWebManagement') }}</button>
      </header>
      <div class="form-group">
        <label class="form-label">{{ $t('common.groupNameRequired') }}</label>
        <input ref="groupNameInput" v-model="groupName" class="form-input" type="text" autocomplete="off" :aria-label="$t('common.groupNameLabel')" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">{{ $t('common.sharedAccountOptional') }}</label>
          <input v-model="sharedAccount" class="form-input" type="text" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label">{{ $t('common.sharedPasswordOptional') }}</label>
          <input v-model="sharedPassword" class="form-input" type="password" autocomplete="new-password" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="button" @click="saveGroup(editingId)" :disabled="saving">
          {{ saving ? $t('common.saving') : $t('groups.saveChanges') }}
        </button>
      </div>
      <p v-if="message" class="message" :class="messageType">{{ message }}</p>
    </section>

    <div v-else class="group-list">
    <header class="management-toolbar">
      <h2>{{ $t('groups.webManagement') }}</h2>
      <div class="management-actions">
        <button class="btn btn-secondary" type="button" @click="openNewGroup">{{ $t('groups.newGroup') }}</button>
        <button class="btn btn-primary" type="button" @click="openNewSystem">{{ $t('groups.newLoginSystem') }}</button>
      </div>
    </header>
    <section
      v-for="(group, groupIndex) in store.groups"
      :key="group.id"
      class="group-section"
      @dragover.prevent
      @drop.prevent="dropOnGroup($event, group.id)"
    >
      <header class="group-heading">
        <button class="group-toggle" type="button" :aria-expanded="isExpanded(group.id)" @click="toggleGroup(group.id)">
          <span class="expand-mark">{{ isExpanded(group.id) ? '▾' : '▸' }}</span>
          <span>
            <strong>{{ group.name }}</strong>
          </span>
        </button>
        <div class="group-actions">
          <button class="order-button" type="button" :title="$t('groups.moveUp')" :aria-label="$t('groups.moveUp')" :disabled="groupIndex === 0" @click="moveGroup(groupIndex, -1)">↑</button>
          <button class="order-button" type="button" :title="$t('groups.moveDown')" :aria-label="$t('groups.moveDown')" :disabled="groupIndex === store.groups.length - 1" @click="moveGroup(groupIndex, 1)">↓</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="startEdit(group)">{{ $t('groups.editGroupBtn') }}</button>
          <button class="btn btn-danger btn-sm" type="button" @click="deleteGroup(group)">{{ $t('groups.deleteGroupBtn') }}</button>
        </div>
      </header>

      <div v-if="isExpanded(group.id)" class="group-contents">
        <div v-for="(platform, index) in groupPlatforms(group.id)" :key="platform.id" class="group-item" draggable="true" @dragstart="startDrag($event, 'platform', platform.id)" @dragover.prevent @drop.stop.prevent="dropOnPlatform($event, group.id, platform.id)">
          <span class="drag-mark" aria-hidden="true">⠿</span>
          <span class="group-item-type">{{ $t('groups.webItem') }}</span>
          <strong>{{ platform.name }}</strong>
          <span class="group-item-detail">{{ platform.url }}</span>
          <button class="icon-btn" type="button" :title="$t('groups.editWeb')" @click="openPlatform(platform.id)">✎</button>
          <span class="item-position">{{ index + 1 }}</span>
        </div>
        <LoginSystems :group-id="group.id" :groups="store.groups" @drop-system="dropOnSystem($event, group.id)" />
        <p v-if="!groupPlatforms(group.id).length" class="empty-message">{{ $t('groups.emptyGroupHint') }}</p>
      </div>
    </section>

    <section class="group-section ungrouped-section" @dragover.prevent @drop.prevent="dropOnGroup($event, null)">
      <header class="group-heading">
        <button class="group-toggle" type="button" :aria-expanded="isExpanded('__ungrouped__')" @click="toggleGroup('__ungrouped__')">
          <span class="expand-mark">{{ isExpanded('__ungrouped__') ? '▾' : '▸' }}</span>
          <span><strong>{{ $t('common.ungrouped') }}</strong></span>
        </button>
      </header>
      <div v-if="isExpanded('__ungrouped__')" class="group-contents">
        <div v-for="(platform, index) in groupPlatforms(null)" :key="platform.id" class="group-item" draggable="true" @dragstart="startDrag($event, 'platform', platform.id)" @dragover.prevent @drop.stop.prevent="dropOnPlatform($event, null, platform.id)">
          <span class="drag-mark" aria-hidden="true">⠿</span>
          <span class="group-item-type">{{ $t('groups.webItem') }}</span>
          <strong>{{ platform.name }}</strong>
          <span class="group-item-detail">{{ platform.url }}</span>
          <button class="icon-btn" type="button" :title="$t('groups.editWeb')" @click="openPlatform(platform.id)">✎</button>
          <span class="item-position">{{ index + 1 }}</span>
        </div>
        <LoginSystems :groups="store.groups" @drop-system="dropOnSystem($event, null)" />
        <p v-if="!groupPlatforms(null).length" class="empty-message">{{ $t('groups.ungroupedEmptyHint') }}</p>
      </div>
    </section>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useStore } from '../store'
import LoginSystems from './LoginSystems.vue'

const { t } = useI18n()
const store = useStore()
const router = useRouter()
const viewMode = ref('list')
const newSystemGroupId = ref(null)
const expandedGroups = ref(new Set())
const editingId = ref(null)
const groupNameInput = ref(null)
const groupName = ref('')
const sharedAccount = ref('')
const sharedPassword = ref('')
const saving = ref(false)
const message = ref('')
const messageType = ref('')

onMounted(async () => {
  if (!store.loaded) await store.loadPlatforms()
  await store.loadGroups()
})

function openNewGroup() {
  clearForm()
  message.value = ''
  viewMode.value = 'new-group'
  nextTick(() => groupNameInput.value?.focus())
}

async function openNewSystem() {
  const expandedGroup = [...expandedGroups.value].find(groupId => groupId !== '__ungrouped__')
  const targetGroup = expandedGroup || '__ungrouped__'
  if (!isExpanded(targetGroup)) toggleGroup(targetGroup)
  newSystemGroupId.value = targetGroup === '__ungrouped__' ? null : targetGroup
  viewMode.value = 'new-system'
}

defineExpose({ openNewGroup, openNewSystem })

function clearForm() {
  groupName.value = ''
  sharedAccount.value = ''
  sharedPassword.value = ''
}

function cancelEdit() {
  editingId.value = null
  viewMode.value = 'list'
  clearForm()
}

function isExpanded(groupId) {
  return expandedGroups.value.has(groupId)
}

function toggleGroup(groupId) {
  const expanded = new Set(expandedGroups.value)
  if (expanded.has(groupId)) expanded.delete(groupId)
  else expanded.add(groupId)
  expandedGroups.value = expanded
}

function groupPlatforms(groupId) {
  const groups = store.groups
  const belongs = platform => groupId
    ? platform.groupId === groupId
    : !platform.groupId || !groups.some(group => group.id === platform.groupId)
  return store.platforms.filter(platform => platform.type !== 'network' && belongs(platform))
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
}

function startDrag(event, kind, id) {
  event.dataTransfer?.setData('application/x-automate-group-item', JSON.stringify({ kind, id }))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function readDraggedItem(event) {
  try {
    return JSON.parse(event.dataTransfer?.getData('application/x-automate-group-item') || '{}')
  } catch (_) {
    return null
  }
}

async function moveGroupItem(item, groupId, beforeId = null) {
  if (!item || !['platform', 'system'].includes(item.kind) || !item.id) return
  const result = await window.autoMate.moveGroupItem({ kind: item.kind, id: item.id, groupId, beforeId })
  if (!result.success) {
    message.value = result.error || t('groups.cannotMoveItem')
    messageType.value = 'error'
    return
  }
  await store.loadPlatforms()
  window.dispatchEvent(new Event('automate-login-systems-updated'))
}

async function dropOnGroup(event, groupId) {
  const item = readDraggedItem(event)
  await moveGroupItem(item, groupId)
}

async function dropOnPlatform(event, groupId, targetId) {
  const item = readDraggedItem(event)
  if (!item) return
  if (item.kind === 'platform') {
    const dragged = store.getPlatformById(item.id)
    const draggedGroup = dragged?.groupId || null
    const targetGroup = groupId || null
    if (dragged && draggedGroup === targetGroup) {
      const reordered = groupPlatforms(targetGroup).filter(platform => platform.id !== item.id)
      const targetIndex = reordered.findIndex(platform => platform.id === targetId)
      reordered.splice(targetIndex < 0 ? reordered.length : targetIndex, 0, dragged)
      const result = await window.autoMate.reorderGroupContent({
        groupId: targetGroup,
        platformIds: reordered.map(platform => platform.id)
      })
      if (!result.success) {
        message.value = result.error || t('groups.cannotReorderWeb')
        messageType.value = 'error'
        return
      }
      await store.loadPlatforms()
      return
    }
  }
  await moveGroupItem(item, groupId, targetId)
}

async function dropOnSystem({ item, beforeId }, groupId) {
  await moveGroupItem(item, groupId, beforeId)
}

function openPlatform(platformId) {
  router.push(`/edit/${platformId}`)
}

async function startEdit(group) {
  const credentials = await window.autoMate.getGroupCredentials(group.id)
  if (!credentials.success) {
    message.value = credentials.error || t('groups.cannotReadGroupCredentials')
    messageType.value = 'error'
    return
  }
  editingId.value = group.id
  groupName.value = group.name
  sharedAccount.value = credentials.account
  sharedPassword.value = credentials.password
  message.value = ''
  viewMode.value = 'edit-group'
  nextTick(() => groupNameInput.value?.focus())
}

async function saveGroup(id = null) {
  message.value = ''
  if (!groupName.value.trim()) {
    message.value = t('common.pleaseFillGroupName')
    messageType.value = 'error'
    return
  }
  if (Boolean(sharedAccount.value.trim()) !== Boolean(sharedPassword.value)) {
    message.value = t('common.accountAndPasswordBothOrNeither')
    messageType.value = 'error'
    return
  }

  saving.value = true
  try {
    const result = await store.saveGroup({
      id,
      name: groupName.value.trim(),
      sharedAccount: sharedAccount.value,
      sharedPassword: sharedPassword.value
    })
    if (!result.success) throw new Error(result.error || t('groups.saveGroupFailed'))
    message.value = id ? t('groups.groupUpdated') : t('groups.groupCreated')
    messageType.value = 'success'
    editingId.value = null
    viewMode.value = 'list'
    clearForm()
  } catch (error) {
    message.value = error.message
    messageType.value = 'error'
  } finally {
    saving.value = false
  }
}

async function moveGroup(index, direction) {
  const reordered = [...store.groups]
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= reordered.length) return
  const moved = reordered[index]
  reordered[index] = reordered[targetIndex]
  reordered[targetIndex] = moved
  const result = await store.reorderGroups(reordered.map(group => group.id))
  if (!result.success) {
    message.value = result.error || t('groups.cannotReorderGroups')
    messageType.value = 'error'
  }
}

async function deleteGroup(group) {
  if (!confirm(t('groups.confirmDeleteGroup', { name: group.name }))) return
  const result = await store.deleteGroup(group.id)
  if (!result.success) {
    message.value = result.error || t('groups.deleteGroupFailed')
    messageType.value = 'error'
    return
  }
}

async function deleteGroup(group) {
  if (!confirm(t('groups.confirmDeleteGroup', { name: group.name }))) return
  const result = await store.deleteGroup(group.id)
  if (!result.success) {
    message.value = result.error || t('groups.deleteGroupFailed')
    messageType.value = 'error'
    return
  }
  window.dispatchEvent(new Event('automate-login-systems-updated'))
  if (editingId.value === group.id) cancelEdit()
}
</script>

<style scoped>
.groups-view {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.management-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
}

.management-toolbar h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 18px;
}

.management-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.group-section {
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.group-create,
.group-editor-page {
  padding: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.group-create h2,
.group-editor-page h2,
.system-editor-page h2 { margin: 0 0 18px; font-size: 18px; color: var(--color-text); }

.editor-page-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.editor-page-heading h2 { margin: 0; }

.form-group { position: relative; min-width: 0; margin-bottom: 16px; }
.form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.form-label { display: block; margin-bottom: 6px; color: var(--color-text); font-size: 13px; font-weight: 600; }
.form-input {
  width: 100%;
  min-height: 40px;
  padding: 9px 11px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.form-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
.form-input::placeholder { color: var(--text-tertiary); }
.required { color: var(--status-failed); }

.group-create h2,
.group-heading h2 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text);
}

.group-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.group-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.group-toggle > span:last-child { display: flex; flex-direction: column; gap: 3px; }
.group-toggle strong { font-size: 15px; font-weight: 600; }
.expand-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent-sky);
  color: var(--accent-sky-ink);
  font-size: 22px;
  line-height: 1;
}

.group-toggle:hover .expand-mark { background: #a9cfe4; }

.group-heading p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.group-actions,
.form-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.order-button {
  width: 30px;
  height: 30px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.order-button:hover:not(:disabled) {
  background: var(--color-primary-light);
  color: #274c77;
}

.order-button:disabled { opacity: 0.35; cursor: not-allowed; }

.group-editor {
  padding: 14px 0;
  border-top: 1px solid var(--color-border);
}

.group-contents { padding: 8px 0 4px; border-top: 1px solid var(--color-border); }
.group-item { min-height: 42px; display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--color-border); border-radius: 6px; cursor: grab; }
.group-item:nth-child(odd) { background: #f4f8fb; }
.group-item:hover { background: #e6eef3; }
.group-item:active { cursor: grabbing; }
.drag-mark { color: var(--text-tertiary); font-size: 18px; }
.group-item-type,.item-position { color: var(--text-tertiary); font-size: 11px; }
.group-item strong { flex: 0 0 auto; font-size: 13px; }
.group-item-detail { min-width: 0; flex: 1; overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }

.message { margin-top: 8px; font-size: 13px; }
.message.error { color: var(--status-failed); }
.message.success { color: var(--status-success); }

@media (max-width: 640px) {
  .management-toolbar { align-items: flex-start; flex-direction: column; }
  .group-heading { align-items: flex-start; flex-direction: column; }
  .group-create, .group-editor-page { padding: 16px; }
  .form-row { grid-template-columns: 1fr; gap: 0; }
  .group-contents { padding-left: 0; }
  .group-item { flex-wrap: wrap; }
  .group-item-detail { flex-basis: calc(100% - 36px); margin-left: 28px; }
}
</style>
