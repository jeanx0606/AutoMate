const assert = require('node:assert/strict')
const test = require('node:test')
const { parseWifiDetails, parseScannedWifi } = require('../electron/netUtils')

test('parses connected Wi-Fi details from English netsh output', () => {
  const output = [
    'There is 1 interface on the system:',
    '    Name                   : Wi-Fi',
    '    State                  : connected',
    '    SSID                   : Campus-WiFi',
    '    Signal                 : 84%'
  ].join('\n')

  assert.deepEqual(parseWifiDetails(output), {
    name: 'Wi-Fi',
    ssid: 'Campus-WiFi',
    connected: true,
    signalPercent: 84,
    receiveRateMbps: null,
    transmitRateMbps: null,
    radioType: null,
    channel: null,
    band: null
  })
})

test('parses connected Wi-Fi details from Chinese netsh output', () => {
  const output = [
    '有 1 个接口:',
    '    名称                   : WLAN',
    '    状态                   : 已连接',
    '    SSID                   : Campus-WiFi',
    '    信号                   : 72%'
  ].join('\n')

  assert.deepEqual(parseWifiDetails(output), {
    name: 'WLAN',
    ssid: 'Campus-WiFi',
    connected: true,
    signalPercent: 72,
    receiveRateMbps: null,
    transmitRateMbps: null,
    radioType: null,
    channel: null,
    band: null
  })
})

test('parses link rates from English and Chinese netsh output', () => {
  const en = [
    '    Name                   : Wi-Fi',
    '    State                  : connected',
    '    SSID                   : Campus-WiFi',
    '    Signal                 : 84%',
    '    Receive rate (Mbps)    : 585',
    '    Transmit rate (Mbps)   : 866'
  ].join('\n')

  assert.deepEqual(parseWifiDetails(en), {
    name: 'Wi-Fi',
    ssid: 'Campus-WiFi',
    connected: true,
    signalPercent: 84,
    receiveRateMbps: 585,
    transmitRateMbps: 866,
    radioType: null,
    channel: null,
    band: null
  })

  const zh = [
    '    名称           : WLAN',
    '    状态           : 已连接',
    '    SSID           : Campus-WiFi',
    '    信号           : 72%',
    '    接收速率(Mbps) : 585',
    '    传输速率(Mbps) : 866'
  ].join('\n')

  assert.deepEqual(parseWifiDetails(zh), {
    name: 'WLAN',
    ssid: 'Campus-WiFi',
    connected: true,
    signalPercent: 72,
    receiveRateMbps: 585,
    transmitRateMbps: 866,
    radioType: null,
    channel: null,
    band: null
  })
})

test('parses radio type, channel, and band from netsh output', () => {
  const en = [
    '    Name                   : Wi-Fi',
    '    State                  : connected',
    '    SSID                   : Campus-WiFi',
    '    Signal                 : 84%',
    '    Radio type             : 802.11ac',
    '    Channel                : 36',
    '    Band                   : 5 GHz'
  ].join('\n')

  const result = parseWifiDetails(en)
  assert.equal(result.radioType, '802.11ac')
  assert.equal(result.channel, 36)
  assert.equal(result.band, '5 GHz')

  const zh = [
    '    名称           : WLAN',
    '    状态           : 已连接',
    '    SSID           : Campus-WiFi',
    '    信号           : 72%',
    '    无线电类型     : 802.11n',
    '    信道           : 11',
    '    频带           : 2.4 GHz'
  ].join('\n')

  const resultZh = parseWifiDetails(zh)
  assert.equal(resultZh.radioType, '802.11n')
  assert.equal(resultZh.channel, 11)
  assert.equal(resultZh.band, '2.4 GHz')
})

test('returns empty details when no Wi-Fi interface is available', () => {
  assert.deepEqual(parseWifiDetails('There are no wireless interfaces on the system.'), {
    name: null,
    ssid: null,
    connected: false,
    signalPercent: null,
    receiveRateMbps: null,
    transmitRateMbps: null,
    radioType: null,
    channel: null,
    band: null
  })
})

test('uses the strongest signal across access points with the same SSID', () => {
  const output = [
    'SSID 1 : Campus-WiFi',
    '    BSSID 1 : 00:00:00:00:00:01',
    '         Signal : 42%',
    '    BSSID 2 : 00:00:00:00:00:02',
    '         Signal : 78%',
    'SSID 2 : Guest-WiFi',
    '    Signal : 65%'
  ].join('\n')

  assert.deepEqual(parseScannedWifi(output), [
    { ssid: 'Campus-WiFi', signalPercent: 78 },
    { ssid: 'Guest-WiFi', signalPercent: 65 }
  ])
})

