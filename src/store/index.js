import { defineStore } from 'pinia'

export const useStore = defineStore('main', {
  state: () => ({
    platforms: [],
    groups: [],
    settings: {
      autoStart: false,
      defaultLoginType: 'web',
      checkInterval: 30,
      lastCheck: null
    },
    globalStatus: 'idle',
    isLoggingIn: false,
    loaded: false
  }),

  getters: {
    platformCount: (state) => state.platforms.length,
    loggedInCount: (state) => state.platforms.filter(p => p.status === 'success').length,
    failedCount: (state) => state.platforms.filter(p => p.status === 'failed').length,
    getPlatformById: (state) => (id) => state.platforms.find(p => p.id === id),
    getGroupById: (state) => (id) => state.groups.find(g => g.id === id),
    getGroupName: (state) => (id) => {
      const group = state.groups.find(g => g.id === id)
      return group ? group.name : ''
    },
    getGroupPlatforms: (state) => (groupId) =>
      state.platforms.filter(p => p.groupId === groupId)
  },

  actions: {
    async loadPlatforms() {
      try {
        const platforms = await window.autoMate.getPlatforms()
        this.platforms = platforms || []
        this.loaded = true
      } catch (err) {
        console.error('加载平台列表失败:', err)
        this.platforms = []
      }
    },

    async loadSettings() {
      try {
        const settings = await window.autoMate.getSettings()
        this.settings = { ...this.settings, ...settings }
      } catch (err) {
        console.error('加载设置失败:', err)
      }
    },

    async savePlatform(platform) {
      const result = await window.autoMate.savePlatform(platform)
      if (result.success) {
        await this.loadPlatforms()
      }
      return result
    },

    async deletePlatform(platformId) {
      const result = await window.autoMate.deletePlatform(platformId)
      if (result.success) {
        this.platforms = this.platforms.filter(p => p.id !== platformId)
      }
      return result
    },

    async loadGroups() {
      try {
        const groups = await window.autoMate.getGroups()
        this.groups = groups || []
      } catch (err) {
        console.error('加载分组失败:', err)
        this.groups = []
      }
    },

    async saveGroup(group) {
      const result = await window.autoMate.saveGroup(group)
      if (result.success) {
        await this.loadGroups()
      }
      return result
    },

    async reorderGroups(orderedIds) {
      const result = await window.autoMate.reorderGroups(orderedIds)
      if (result.success) await this.loadGroups()
      return result
    },

    async deleteGroup(groupId) {
      const result = await window.autoMate.deleteGroup(groupId)
      if (result.success) {
        this.groups = this.groups.filter(g => g.id !== groupId)
        this.platforms = this.platforms.map(p => (
          p.groupId === groupId ? { ...p, groupId: null } : p
        ))
      }
      return result
    },

    async loginGroup(groupId, platformType = null) {
      this.isLoggingIn = true
      this.globalStatus = 'logging-in'
      try {
        const result = await window.autoMate.startGroupLogin(groupId, platformType)
        await this.loadPlatforms()
        if (result && Array.isArray(result.results)) {
          const successCount = result.results.filter(r => r.success).length
          if (successCount === result.results.length) this.globalStatus = 'success'
          else if (successCount > 0) this.globalStatus = 'partial'
          else this.globalStatus = 'failed'
        }
        return result
      } catch (err) {
        this.globalStatus = 'failed'
        return { success: false, error: err.message }
      } finally {
        this.isLoggingIn = false
      }
    },

    async logoutPlatform(platformId) {
      const result = await window.autoMate.logoutPlatform(platformId)
      if (result.success) {
        this.updatePlatformStatus(platformId, 'idle', Date.now(), '')
      }
      return result
    },

    async loginPlatform(platformId) {
      this.updatePlatformStatus(platformId, 'logging-in')
      this.isLoggingIn = true
      try {
        const result = await window.autoMate.startAutoLogin(platformId)
        if (result.pending) {
          this.updatePlatformStatus(platformId, 'pending', Date.now(), result.message || '')
        } else if (!result.manualFallback) {
          this.updatePlatformStatus(platformId, result.success ? 'success' : 'failed', Date.now(), result.message || result.error || '')
        } else {
          this.updatePlatformStatus(platformId, 'failed', Date.now(), result.message || result.error || '')
        }
        return result
      } catch (err) {
        this.updatePlatformStatus(platformId, 'failed', Date.now())
        return { success: false, error: err.message }
      } finally {
        this.isLoggingIn = false
      }
    },

    async loginAll() {
      this.isLoggingIn = true
      this.globalStatus = 'logging-in'
      try {
        const result = await window.autoMate.startAutoLogin(null)
        await this.loadPlatforms()
        if (Array.isArray(result)) {
          const successCount = result.filter(r => r.success).length
          const pendingCount = result.filter(r => r.pending).length
          if (pendingCount > 0) this.globalStatus = 'pending'
          else if (successCount === result.length) this.globalStatus = 'success'
          else if (successCount > 0) this.globalStatus = 'partial'
          else this.globalStatus = 'failed'
        }
        return result
      } catch (err) {
        this.globalStatus = 'failed'
        return { success: false, error: err.message }
      } finally {
        this.isLoggingIn = false
      }
    },

    updatePlatformStatus(platformId, status, timestamp = null, message = null) {
      const platform = this.platforms.find(p => p.id === platformId)
      if (platform) {
        platform.status = status
        if (message !== null) platform.statusMessage = message
        if (timestamp) {
          if (status === 'success' || status === 'failed') {
            platform.lastAttempt = timestamp
          }
          platform.lastCheck = timestamp
        }
      }

      const statuses = this.platforms.map(item => item.status || 'idle')
      if (statuses.includes('logging-in')) this.globalStatus = 'logging-in'
      else if (statuses.includes('pending')) this.globalStatus = 'pending'
      else if (statuses.length && statuses.every(item => item === 'success')) this.globalStatus = 'success'
      else if (statuses.includes('success')) this.globalStatus = 'partial'
      else if (statuses.includes('unconfirmed')) this.globalStatus = 'unconfirmed'
      else if (statuses.includes('failed')) this.globalStatus = 'failed'
      else this.globalStatus = 'idle'
    },

    async updateSettings(newSettings) {
      const result = await window.autoMate.setSettings(newSettings)
      if (result.success) {
        this.settings = { ...this.settings, ...newSettings }
      }
      return result
    },

    async setAutoStart(enable) {
      const result = await window.autoMate.setAutoStart(enable)
      if (result.success) {
        this.settings.autoStart = enable
      }
      return result
    },

    async exportData() {
      return await window.autoMate.exportData()
    },

    async importData(data) {
      const result = await window.autoMate.importData(data)
      if (result.success) {
        await this.loadPlatforms()
        await this.loadSettings()
        await this.loadGroups()
      }
      return result
    },

    setupListeners() {
      if (!window.autoMate?.onPlatformStatusUpdate) return
      window.autoMate.onPlatformStatusUpdate((data) => {
        this.updatePlatformStatus(data.platformId, data.status, data.lastAttempt || data.lastCheck, data.message ?? null)
      })
      window.autoMate.onLoginComplete((data) => {
        this.globalStatus = data.overallStatus || 'idle'
        this.loadPlatforms()
      })
      window.autoMate.onLoginProgress((data) => {
        if (data.status === 'logging-in') {
          this.globalStatus = 'logging-in'
        }
      })
    }
  }
})