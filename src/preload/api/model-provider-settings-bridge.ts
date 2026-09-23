import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const modelProvidersApi = {
  getStatus: (providerId) => ipcRenderer.invoke('modelProviders:getStatus', providerId),
  saveApiKey: (providerId, apiKey) =>
    ipcRenderer.invoke('modelProviders:saveApiKey', providerId, apiKey),
  clearApiKey: (providerId) => ipcRenderer.invoke('modelProviders:clearApiKey', providerId),
  diagnose: (providerId) => ipcRenderer.invoke('modelProviders:diagnose', providerId)
} satisfies PreloadApi['modelProviders']
