const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('autoMate', {
  savePlatform: (platform) => ipcRenderer.invoke('save-platform', platform),
  getPlatforms: () => ipcRenderer.invoke('get-platforms'),
  deletePlatform: (platformId) => ipcRenderer.invoke('delete-platform', platformId),
  startAutoLogin: (platformId) => ipcRenderer.invoke('start-auto-login', platformId),
  connectWifi: (ssid) => ipcRenderer.invoke('connect-wifi', ssid),
  setAutoStart: (enable) => ipcRenderer.invoke('set-auto-start', enable),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: (data) => ipcRenderer.invoke('import-data', data),
  testLogin: (platform) => ipcRenderer.invoke('test-login', platform),
  getGroups: () => ipcRenderer.invoke('get-groups'),
  getGroupCredentials: (groupId) => ipcRenderer.invoke('get-group-credentials', groupId),
  getLoginSystems: () => ipcRenderer.invoke('get-login-systems'),
  getLoginSystemCredentials: (systemId) => ipcRenderer.invoke('get-login-system-credentials', systemId),
  saveLoginSystem: (system) => ipcRenderer.invoke('save-login-system', system),
  deleteLoginSystem: (systemId) => ipcRenderer.invoke('delete-login-system', systemId),
  addDestination: (systemId, destination) => ipcRenderer.invoke('add-destination', { systemId, destination }),
  deleteDestination: (systemId, destinationId) => ipcRenderer.invoke('delete-destination', { systemId, destinationId }),
  loginSystem: (systemId) => ipcRenderer.invoke('login-system', systemId),
  openDestination: (systemId, destinationId) => ipcRenderer.invoke('open-destination', { systemId, destinationId }),
  saveGroup: (group) => ipcRenderer.invoke('save-group', group),
  moveGroupItem: (payload) => ipcRenderer.invoke('move-group-item', payload),
  reorderGroups: (orderedIds) => ipcRenderer.invoke('reorder-groups', orderedIds),
  reorderGroupContent: (payload) => ipcRenderer.invoke('reorder-group-content', payload),
  deleteGroup: (groupId) => ipcRenderer.invoke('delete-group', groupId),
  startGroupLogin: (groupId, platformType) => ipcRenderer.invoke('start-group-login', groupId, platformType),
  logoutPlatform: (platformId) => ipcRenderer.invoke('logout-platform', platformId),
  getWifiStatus: () => ipcRenderer.invoke('get-wifi-status'),
  enableWifi: () => ipcRenderer.invoke('enable-wifi'),
  scanWifi: () => ipcRenderer.invoke('scan-wifi'),
  checkInternet: () => ipcRenderer.invoke('check-internet'),
  getNetworkDiagnostics: () => ipcRenderer.invoke('get-network-diagnostics'),
  testDownloadSpeed: () => ipcRenderer.invoke('test-download-speed'),
  networkLogin: (platform) => ipcRenderer.invoke('network-login', platform),
  getBrowserExtensionSetup: () => ipcRenderer.invoke('get-browser-extension-setup'),
  openBrowserExtensionFolder: () => ipcRenderer.invoke('open-browser-extension-folder'),
  openBrowserExtensionManager: (browser) => ipcRenderer.invoke('open-browser-extension-manager', browser),
  dismissBrowserExtensionPrompt: () => ipcRenderer.invoke('dismiss-browser-extension-prompt'),
  unpairBrowserExtension: () => ipcRenderer.invoke('unpair-browser-extension'),

  onLoginProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('login-progress', handler)
    return () => ipcRenderer.removeListener('login-progress', handler)
  },
  onLoginComplete: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('login-complete', handler)
    return () => ipcRenderer.removeListener('login-complete', handler)
  },
  onPlatformStatusUpdate: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('platform-status-update', handler)
    return () => ipcRenderer.removeListener('platform-status-update', handler)
  },
})