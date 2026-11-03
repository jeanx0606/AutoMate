<template>
  <div class="wifi-view">
    <section class="wifi-status" aria-labelledby="wifi-status-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ $t('wifi.statusKicker') }}</p>
          <h2 id="wifi-status-title">{{ $t('wifi.currentConnection') }}</h2>
        </div>
        <div class="toolbar">
          <button class="btn btn-secondary" type="button" @click="refreshAll" :disabled="loading">
            {{ loading ? $t('common.detecting') : $t('wifi.recheck') }}
          </button>
          <button class="btn btn-secondary" type="button" @click="runSpeedTest" :disabled="speedTestLoading">
            {{ speedTestLoading ? $t('common.speedTesting') : $t('wifi.speedTest') }}
          </button>
        </div>
      </div>

      <div class="status-hero">
        <div class="hero-signal" aria-hidden="true">
          <span v-for="bar in 5" :key="bar" class="signal-bar" :class="{ on: bar <= signalBars }"></span>
        </div>
        <div class="hero-info">
          <div class="hero-ssid-row">
            <strong class="hero-ssid">{{ diagnostics?.ssid || $t('wifi.notConnected') }}</strong>
            <span v-if="diagnostics?.connected" class="hero-badge connected">{{ $t('wifi.connected') }}</span>
            <span v-else class="hero-badge idle">{{ diagnostics?.enabled === false ? $t('wifi.wifiOff') : $t('wifi.notConnected') }}</span>
          </div>
          <p class="hero-meta">
            <span v-if="diagnostics?.signalPercent != null">{{ $t('wifi.signal') }} {{ diagnostics.signalPercent }}%</span>
            <span v-if="diagnostics?.connected">{{ $t('wifi.adapterOn') }}</span>
          </p>
        </div>
      </div>

      <div class="status-stats">
        <div class="stat-item">
          <span class="stat-icon" aria-hidden="true">⬇</span>
          <span class="stat-label">{{ $t('wifi.downloadSpeed') }}</span>
          <strong>{{ downloadDisplay }}</strong>
        </div>
        <div class="stat-item">
          <span class="stat-icon" aria-hidden="true">📶</span>
          <span class="stat-label">{{ $t('wifi.signalStrength') }}</span>
          <strong>{{ diagnostics?.signalPercent == null ? '--' : `${diagnostics.signalPercent}%` }}</strong>
        </div>
        <div class="stat-item">
          <span class="stat-icon" aria-hidden="true">⏱</span>
          <span class="stat-label">{{ $t('wifi.latency') }}</span>
          <strong>{{ diagnostics?.latencyMs == null ? '--' : `${diagnostics.latencyMs} ms` }}</strong>
        </div>
        <div class="stat-item">
          <span class="stat-icon" aria-hidden="true">🌐</span>
          <span class="stat-label">{{ $t('wifi.internet') }}</span>
          <strong :class="diagnostics?.internetConnected ? 'online' : 'offline'">
            {{ diagnostics?.internetConnected ? $t('wifi.internetAccessible') : $t('wifi.internetInaccessible') }}
          </strong>
        </div>
      </div>
      <p class="section-description">{{ $t('wifi.speedTestDesc') }}</p>
      <p v-if="pageMessage" class="page-message" :class="pageMessageType">{{ pageMessage }}</p>
    </section>

    <section class="network-section" aria-labelledby="saved-title">
      <div class="section-heading">
        <div>
          <h2 id="saved-title">{{ $t('wifi.savedWifiTitle') }}</h2>
          <p class="section-description">{{ $t('wifi.savedWifiDesc') }}</p>
        </div>
      </div>
      <div v-if="automateNetworks.length" class="network-list">
        <div v-for="network in automateNetworks" :key="network.ssid" class="network-row">
          <div class="network-name">
            <strong>{{ network.ssid }}</strong>
            <span v-if="network.ssid === diagnostics?.ssid" class="current-label">{{ $t('wifi.currentLabel') }}</span>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="connectNetwork(network.ssid)" :disabled="actionBusy">
            {{ actionBusy && connectingSsid === network.ssid ? $t('common.processing') : $t('wifi.connectBtn') }}
          </button>
        </div>
      </div>
      <p v-else class="empty-message">{{ $t('wifi.noSavedWifi') }}</p>
    </section>

    <section class="network-section" aria-labelledby="nearby-title">
      <div class="section-heading">
        <div>
          <h2 id="nearby-title">{{ $t('wifi.nearbyTitle') }}</h2>
          <p class="section-description">{{ $t('wifi.nearbyDesc') }}</p>
        </div>
        <button class="btn btn-secondary" type="button" @click="scanNearby" :disabled="scanning">
          {{ scanning ? $t('common.scanning') : $t('wifi.scanNearby') }}
        </button>
      </div>
      <div v-if="nearbyNetworks.length" class="network-list">
        <div v-for="network in nearbyNetworks" :key="network.ssid" class="network-row">
          <div class="network-name">
            <strong>{{ network.ssid }}</strong>
            <span class="signal-label">{{ network.signalPercent == null ? $t('wifi.signalUnknown') : `${network.signalPercent}%` }}</span>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="connectNetwork(network.ssid)" :disabled="actionBusy">
            {{ actionBusy && connectingSsid === network.ssid ? $t('common.processing') : $t('wifi.connectBtn') }}
          </button>
        </div>
      </div>
      <p v-else class="empty-message">{{ scanMessage || $t('wifi.noNearbyScanned') }}</p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const diagnostics = ref(null)
const platforms = ref([])
const nearbyNetworks = ref([])
const loading = ref(false)
const scanning = ref(false)
const speedTestLoading = ref(false)
const speedTestDownload = ref(null)
const actionBusy = ref(false)
const connectingSsid = ref('')
const pageMessage = ref('')
const pageMessageType = ref('')
const scanMessage = ref('')
const automateNetworks = computed(() => {
  const networks = new Map()
  for (const platform of platforms.value) {
    const ssid = (platform.wifiName || platform.wifi || '').trim()
    if (!ssid) continue
    networks.set(ssid, networks.get(ssid) || { ssid })
  }
  return [...networks.values()]
})

onMounted(refreshAll)

const signalBars = computed(() => {
  const percent = diagnostics.value?.signalPercent
  if (percent == null) return 0
  if (percent >= 85) return 5
  if (percent >= 65) return 4
  if (percent >= 45) return 3
  if (percent >= 25) return 2
  if (percent >= 5) return 1
  return 0
})

const downloadDisplay = computed(() => {
  if (speedTestDownload.value != null) return `${speedTestDownload.value} Mbps`
  if (diagnostics.value?.receiveRateMbps != null) return `${diagnostics.value.receiveRateMbps} Mbps`
  return '--'
})

async function refreshAll() {
  loading.value = true
  try {
    const [networkResult, configuredPlatforms] = await Promise.all([
      window.autoMate.getNetworkDiagnostics(),
      window.autoMate.getPlatforms()
    ])
    diagnostics.value = networkResult
    platforms.value = configuredPlatforms || []
  } catch (error) {
    pageMessage.value = error.message
    pageMessageType.value = 'error'
  } finally {
    loading.value = false
  }
}

async function scanNearby() {
  scanning.value = true
  scanMessage.value = ''
  try {
    const result = await window.autoMate.scanWifi()
    nearbyNetworks.value = result.networks || []
    scanMessage.value = result.success ? '' : result.message || t('wifi.scanFailed')
  } catch (error) {
    scanMessage.value = error.message
  } finally {
    scanning.value = false
  }
}

async function runSpeedTest() {
  speedTestLoading.value = true
  try {
    const result = await window.autoMate.testDownloadSpeed()
    if (result.downloadMbps != null) speedTestDownload.value = result.downloadMbps
    if (!result.success && result.message) {
      pageMessage.value = t('wifi.speedTestFailed', { message: result.message })
      pageMessageType.value = 'error'
    }
  } catch (error) {
    pageMessage.value = t('wifi.speedTestFailed', { message: error.message })
    pageMessageType.value = 'error'
  } finally {
    speedTestLoading.value = false
  }
}

async function connect(ssid) {
  actionBusy.value = true
  connectingSsid.value = ssid
  pageMessage.value = ''
  try {
    const result = await window.autoMate.connectWifi(ssid)
    pageMessage.value = result.message || (result.success ? t('wifi.connectedTo', { ssid }) : t('wifi.cannotConnectTo', { ssid }))
    pageMessageType.value = result.success ? 'success' : 'error'
    await refreshAll()
  } catch (error) {
    pageMessage.value = error.message
    pageMessageType.value = 'error'
  } finally {
    connectingSsid.value = ''
    actionBusy.value = false
  }
}

async function connectNetwork(ssid) {
  const platform = platforms.value.find(item =>
    item.type === 'network' && (item.wifiName || item.wifi || '').trim() === ssid
  )
  if (!platform) {
    await connect(ssid)
    return
  }

  actionBusy.value = true
  connectingSsid.value = ssid
  pageMessage.value = ''
  try {
    const result = await window.autoMate.startAutoLogin(platform.id)
    pageMessage.value = result.message || (result.success ? t('wifi.authCompleted', { ssid }) : t('wifi.cannotLogin', { ssid }))
    pageMessageType.value = result.success || result.pending ? 'success' : 'error'
    await refreshAll()
  } catch (error) {
    pageMessage.value = error.message
    pageMessageType.value = 'error'
  } finally {
    connectingSsid.value = ''
    actionBusy.value = false
  }
}
</script>

<style scoped>
.wifi-view {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.wifi-status,
.network-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.section-heading h2 {
  font-size: 17px;
  font-weight: 600;
}

.section-kicker {
  margin-bottom: 5px;
  color: var(--text-tertiary);
  font-size: 10px;
}

.section-description {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  margin-bottom: 14px;
  background: #e7ecef;
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.hero-signal {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 30px;
  flex: 0 0 auto;
}

.signal-bar {
  width: 6px;
  border-radius: 3px;
  background: #c6d3dd;
}

.signal-bar:nth-child(1) { height: 8px; }
.signal-bar:nth-child(2) { height: 13px; }
.signal-bar:nth-child(3) { height: 18px; }
.signal-bar:nth-child(4) { height: 23px; }
.signal-bar:nth-child(5) { height: 28px; }

.signal-bar.on {
  background: #274c77;
}

.hero-info {
  min-width: 0;
}

.hero-ssid-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hero-ssid {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.hero-badge {
  flex: 0 0 auto;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
}

.hero-badge.connected {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.hero-badge.idle {
  background: var(--status-info-bg);
  color: var(--status-info);
}

.hero-meta {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 12.5px;
}

.status-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.stat-item {
  padding: 12px 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.stat-icon {
  font-size: 15px;
  line-height: 1;
}

.stat-label {
  color: var(--text-tertiary);
  font-size: 12px;
}

.stat-item strong {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.online { color: var(--status-success); }
.offline { color: var(--status-failed); }

.signal-label {
  color: var(--text-tertiary);
  font-size: 12px;
}

.network-name strong {
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 600;
}

.network-list {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-surface);
}

.network-row {
  min-height: 54px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  transition: background 0.15s ease;
}

.network-row:last-child {
  border-bottom: none;
}

.network-row:hover {
  background: var(--color-primary-light);
}

.network-name {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.current-label {
  color: var(--status-success);
  font-size: 12px;
}

.saved-only {
  color: var(--text-tertiary);
  font-size: 12px;
}

.empty-message,
.page-message {
  padding: 12px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.page-message.success { color: var(--status-success); }
.page-message.error { color: var(--status-failed); }

@media (max-width: 640px) {
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
