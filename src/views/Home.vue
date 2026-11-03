<template>
  <div class="home-view">
    <div class="platform-tabs" role="tablist" :aria-label="$t('app.navHome')">
      <button type="button" role="tab" :aria-selected="activeType === 'network'" :class="{ active: activeType === 'network' }" @click="activeType = 'network'">
        {{ $t('home.tabWifi') }}
      </button>
      <button type="button" role="tab" :aria-selected="activeType === 'web'" :class="{ active: activeType === 'web' }" @click="activeType = 'web'">
        {{ $t('home.tabWeb') }}
      </button>
      <router-link
        class="add-platform-button"
        :to="{ name: 'add', query: { type: activeType } }"
        :title="activeType === 'network' ? $t('home.addWifi') : $t('home.addWeb')"
        :aria-label="activeType === 'network' ? $t('home.addWifi') : $t('home.addWeb')"
      >+</router-link>
    </div>

    <div v-if="activeType === 'network' ? visiblePlatforms.length === 0 : platformSections.length === 0" class="empty-state">
      <div class="empty-icon">{{ activeType === 'network' ? '📶' : '🌐' }}</div>
      <h2 class="empty-title">{{ activeType === 'network' ? $t('home.emptyWifi') : $t('home.emptyWeb') }}</h2>
    </div>

    <template v-else>
      <div class="group-section" v-if="activeType === 'network' && visibleGroups.length > 0">
        <div class="group-area">
          <div class="group-head">
            <h4 class="group-title">{{ $t('home.groupLoginTitle') }}</h4>
            <span class="group-hint">{{ activeType === 'network' ? $t('home.groupHintWifi') : $t('home.groupHintWeb') }}</span>
          </div>
          <div class="group-chips">
            <div v-for="group in visibleGroups" :key="group.id" class="group-chip">
              <button class="group-chip-main" @click="handleGroupLogin(group)" :disabled="store.isLoggingIn">
                {{ group.name }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <section v-for="section in platformSections" :key="section.id" class="platform-section">
        <header v-if="activeType === 'web'" class="web-group-heading">
          <h2>{{ section.name }}</h2>
          <button
            v-if="section.groupId"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="handleGroupLogin({ id: section.groupId, name: section.name })"
            :disabled="store.isLoggingIn"
          >
            {{ $t('home.groupWebLogin') }}
          </button>
        </header>
        <div class="platform-grid">
        <div v-for="platform in section.platforms" :key="platform.id" class="platform-card">
          <div class="card-header">
            <div class="card-title-area">
                <h3 class="card-title">{{ platformTitle(platform) }}</h3>
            </div>
            <div class="card-actions">
              <span class="group-tag" v-if="activeType === 'network' && platform.groupId" :title="store.getGroupName(platform.groupId)">
                {{ store.getGroupName(platform.groupId) }}
              </span>
              <router-link :to="`/edit/${platform.id}`" class="icon-btn" :title="$t('home.editPlatform')">✏️</router-link>
              <button class="platform-delete" type="button" @click="handleDelete(platform)">{{ $t('home.deletePlatform') }}</button>
            </div>
          </div>

          <div class="card-footer">
            <button class="btn btn-primary btn-sm" @click="handleLogin(platform)" :disabled="platform.status === 'logging-in'">
              <span v-if="platform.status === 'logging-in'" class="spinner"></span>
              {{ platform.status === 'logging-in' ? $t('common.processing') : actionLabel(platform) }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="activeType === 'web' && section.loginSystems.length" class="home-systems">
        <article v-for="system in section.loginSystems" :key="system.id" class="home-system">
          <div class="home-system-heading">
            <span class="system-mark" :style="{ '--system-color': system.iconColor || '#587895' }">
              <span class="shape-mark" :class="`shape-${system.iconShape || 'circle'}`" aria-hidden="true"></span>
            </span>
            <div>
              <strong>{{ system.name }}</strong>
              <p>{{ system.loginUrl }}</p>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="loginSystem(system)">{{ $t('home.loginSystemBtn') }}</button>
          </div>
          <div v-if="system.destinations?.length" class="home-destinations">
            <button v-for="destination in system.destinations" :key="destination.id" type="button" @click="openDestination(system, destination)">
              {{ destination.name }}
            </button>
          </div>
        </article>
      </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStore } from '../store'

const { t } = useI18n()
const store = useStore()
const activeType = ref('network')
const loginSystems = ref([])
const visiblePlatforms = computed(() => store.platforms.filter(platform =>
  (platform.type === 'network' ? 'network' : 'web') === activeType.value
))
const visibleGroups = computed(() => store.groups.filter(group =>
  store.getGroupPlatforms(group.id).some(platform =>
    (platform.type === 'network' ? 'network' : 'web') === activeType.value
  )
))
const platformSections = computed(() => {
  if (activeType.value === 'web') {
    const groupIds = new Set(store.groups.map(group => group.id))
    const sections = store.groups.map(group => ({
      id: group.id,
      groupId: group.id,
      name: group.name,
      platforms: sortByOrder(store.getGroupPlatforms(group.id).filter(platform => platform.type !== 'network')),
      loginSystems: sortByOrder(loginSystems.value.filter(system => system.groupId === group.id))
    })).filter(section => section.platforms.length || section.loginSystems.length)
    const ungrouped = store.platforms.filter(platform =>
      platform.type !== 'network' && (!platform.groupId || !groupIds.has(platform.groupId))
    )
    const ungroupedSystems = loginSystems.value.filter(system => !system.groupId || !groupIds.has(system.groupId))
    if (ungrouped.length || ungroupedSystems.length) {
      sections.push({
        id: 'ungrouped',
        groupId: null,
        name: t('common.ungrouped'),
        platforms: sortByOrder(ungrouped),
        loginSystems: sortByOrder(ungroupedSystems)
      })
    }
    return sections
  }
  return [{ id: 'wifi', name: '', platforms: visiblePlatforms.value, loginSystems: [] }]
})

function platformTitle(platform) {
  return platform.type === 'network'
    ? platform.wifiName || platform.wifi || platform.name
    : platform.name
}

function actionLabel(platform) {
  if (platform.requiresAuth === false) return platform.type === 'network' ? t('home.actionConnect') : t('home.actionOpen')
  return platform.type === 'network' ? t('home.actionConnectAuth') : t('home.actionLogin')
}

onMounted(async () => {
  if (!store.loaded) {
    await store.loadPlatforms()
  }
  await store.loadGroups()
  await loadLoginSystems()
  window.addEventListener('automate-login-systems-updated', loadLoginSystems)
})

onUnmounted(() => window.removeEventListener('automate-login-systems-updated', loadLoginSystems))

async function loadLoginSystems() {
  loginSystems.value = await window.autoMate.getLoginSystems()
}

function sortByOrder(items) {
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.sortOrder ?? a.index) - (b.item.sortOrder ?? b.index))
    .map(entry => entry.item)
}

async function handleLogin(platform) {
  const result = await store.loginPlatform(platform.id)
  if (result.pending) {
    console.info(`${platform.name} ${t('home.actionLogin')}`)
  } else if (result.success) {
    console.log(`${platform.name} ${t('common.success')}`)
  } else {
    console.warn(`${platform.name} ${t('common.failed')}:`, result.message || result.error)
  }
}

async function handleGroupLogin(group) {
  const typeLabel = activeType.value === 'network' ? t('home.tabWifi') : t('home.tabWeb')
  if (!confirm(t('home.confirmGroupLogin', { name: group.name, type: typeLabel }))) return
  await store.loginGroup(group.id, activeType.value)
}

async function loginSystem(system) {
  const result = await window.autoMate.loginSystem(system.id)
  if (!result.success && !result.pending) window.alert(result.error || result.message || t('home.cannotOpenLoginSystem'))
}

async function openDestination(system, destination) {
  const result = await window.autoMate.openDestination(system.id, destination.id)
  if (!result.success) window.alert(result.error || t('home.cannotOpenDestination'))
}

async function handleDelete(platform) {
  if (!confirm(t('home.confirmDelete', { name: platform.name }))) return
  const result = await store.deletePlatform(platform.id)
  if (!result.success) {
    alert(t('home.deleteFailed', { error: result.error || t('home.unknownError') }))
  }
}

</script>

<style scoped>
.home-view {
  max-width: 960px;
  margin: 0 auto;
}

.platform-delete {
  padding: 5px 9px;
  border: 1px solid #a94747;
  border-radius: 4px;
  background: #fff;
  color: #873434;
  font-size: 12px;
  font-weight: 600;
}

.platform-delete:hover {
  background: #a94747;
  color: #fff;
}

.add-platform-button {
  width: 36px;
  height: 36px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-primary);
  background: var(--color-surface);
  font-size: 24px;
  line-height: 1;
  text-decoration: none;
}

.add-platform-button:hover {
  background: var(--color-primary-light);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.6;
}

.empty-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 10px;
}

.empty-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 28px;
  max-width: 400px;
}

.empty-btn {
  padding: 10px 24px;
  font-size: 15px;
}

.platform-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--color-border);
}

.platform-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
}

.platform-tabs button.active {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.platform-tabs button[role="tab"]:nth-of-type(1).active { border-bottom-color: var(--accent-sky-ink); background: var(--accent-sky); color: var(--accent-sky-ink); }
.platform-tabs button[role="tab"]:nth-of-type(2).active { border-bottom-color: var(--accent-mint-ink); background: var(--accent-mint); color: var(--accent-mint-ink); }
.platform-tabs button[role="tab"]:nth-of-type(3).active { border-bottom-color: var(--accent-lavender-ink); background: var(--accent-lavender); color: var(--accent-lavender-ink); }

.platform-tabs button span {
  color: var(--text-tertiary);
  font-size: 12px;
}

.platform-tabs .add-platform-button {
  margin-left: auto;
  margin-bottom: 6px;
}

.groups-tab-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font-size: 12px;
}

.groups-tab-primary { margin-left: auto; }

.group-section {
  margin-bottom: 20px;
}

.group-area {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.group-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.group-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.group-chip {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--color-surface);
}

.group-chip-main {
  border: none;
  background: none;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s ease;
}

.group-chip-main:hover {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.group-chip-main:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.group-count {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 760px) {
  .platform-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .platform-grid { grid-template-columns: minmax(0, 1fr); }
}

.platform-section + .platform-section {
  margin-top: 24px;
}

.web-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.web-group-heading h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.home-systems {
  margin-top: 12px;
  border-top: 1px solid var(--color-border);
}

.home-system {
  margin: 10px 0;
  padding: 14px;
  border: 1px solid #c9d9ce;
  border-left: 4px solid #6b967b;
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.home-system-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-system-heading > div { min-width: 0; flex: 1; }
.home-system-heading strong { font-size: 13px; }
.home-system-heading p { margin-top: 3px; overflow-wrap: anywhere; color: var(--text-secondary); font-size: 11px; }
.system-mark { width: 36px; height: 36px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 6px; background: #e3eee6; }
.shape-mark { display: block; width: 18px; height: 18px; background: var(--system-color); }
.shape-circle { border-radius: 50%; }
.shape-square { border-radius: 3px; }
.shape-triangle { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.shape-star { clip-path: polygon(50% 0, 62% 35%, 100% 38%, 72% 61%, 81% 100%, 50% 78%, 19% 100%, 28% 61%, 0 38%, 38% 35%); }
.home-destinations { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0 38px; }
.home-destinations button { padding: 5px 8px; border: 1px solid #c9d9ce; border-radius: 4px; background: #f3f8f4; color: var(--color-text); cursor: pointer; font-size: 12px; }

.platform-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.15s ease;
}

.platform-card:hover {
  box-shadow: var(--shadow-md);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.card-title-area {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.type-tag.network {
  background: var(--accent-sky);
  color: var(--accent-sky-ink);
}

.type-tag.web {
  background: var(--accent-mint);
  color: var(--accent-mint-ink);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.group-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--color-surface-muted);
  color: var(--text-secondary);
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-btn {
  background: none;
  border: none;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s ease;
  text-decoration: none;
}

.icon-btn:hover {
  opacity: 1;
  background: var(--color-surface-hover);
}

.card-body {
  padding: 4px 16px 14px;
  flex: 1;
}

.card-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}

.info-label {
  color: var(--text-tertiary);
  width: 60px;
  flex-shrink: 0;
}

.info-value {
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-value.status-message {
  color: var(--status-failed);
  white-space: normal;
  overflow-wrap: anywhere;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.meta-item {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--color-surface-muted);
  color: var(--text-secondary);
}

.meta-item.on {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.meta-item.off {
  background: var(--accent-butter);
  color: var(--accent-butter-ink);
}

.meta-item.inherited {
  background: var(--accent-lavender);
  color: var(--accent-lavender-ink);
}

.meta-item.skipped {
  background: var(--accent-rose);
  color: var(--accent-rose-ink);
}

.status-text.success { color: var(--status-success); font-weight: 500; }
.status-text.failed { color: var(--status-failed); font-weight: 500; }
.status-text.logging-in { color: var(--status-logging); font-weight: 500; }
.status-text.pending { color: var(--status-logging); font-weight: 500; }
.status-text.unconfirmed { color: var(--status-logging); font-weight: 500; }
.status-text.idle { color: var(--status-idle); }

.card-footer {
  padding: 0 16px 14px;
  display: flex;
  gap: 8px;
}

.card-footer .btn {
  flex: 1;
}

.home-footer {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}
</style>