import { ipcMain } from 'electron'
import { DEFAULT_MODEL_DATA_POLICY } from '../../shared/model-generation-types'
import type { ModelProviderId } from '../../shared/model-provider-types'
import type {
  ModelProviderDiagnostic,
  ModelProviderSettingsStatus
} from '../../shared/model-provider-settings-types'
import { createDefaultModelProvider } from '../model-providers/default-model-provider-registry'
import {
  clearOpenRouterApiKey,
  hasStoredOpenRouterApiKey,
  saveOpenRouterApiKey
} from '../model-providers/openrouter/openrouter-api-key-store'

function isModelProviderId(value: unknown): value is ModelProviderId {
  return value === 'openrouter'
}

function requireProviderId(value: unknown): ModelProviderId {
  if (!isModelProviderId(value)) {
    throw new Error('Unsupported model provider')
  }
  return value
}

function openRouterStatus(): ModelProviderSettingsStatus {
  const environmentApiKeyConfigured = Boolean(process.env.OPENROUTER_API_KEY?.trim())
  const storedApiKeyConfigured = hasStoredOpenRouterApiKey()
  return {
    providerId: 'openrouter',
    configured: environmentApiKeyConfigured || storedApiKeyConfigured,
    storedApiKeyConfigured,
    environmentApiKeyConfigured
  }
}

function statusFor(providerId: ModelProviderId): ModelProviderSettingsStatus {
  switch (providerId) {
    case 'openrouter':
      return openRouterStatus()
  }
}

async function diagnoseProvider(providerId: ModelProviderId): Promise<ModelProviderDiagnostic> {
  const status = statusFor(providerId)
  try {
    const provider = createDefaultModelProvider(providerId)
    const catalog = await provider.listModels({ dataPolicy: DEFAULT_MODEL_DATA_POLICY })
    return {
      ...status,
      catalogReachable: true,
      modelCount: catalog.models.length,
      toolsCapableModelCount: catalog.models.filter((model) => model.capabilities.includes('tools'))
        .length,
      structuredOutputModelCount: catalog.models.filter((model) =>
        model.capabilities.includes('structured-output')
      ).length,
      error: null
    }
  } catch (error) {
    return {
      ...status,
      catalogReachable: false,
      modelCount: 0,
      toolsCapableModelCount: 0,
      structuredOutputModelCount: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function registerModelProviderSettingsHandlers(): void {
  ipcMain.handle('modelProviders:getStatus', (_event, providerId: unknown) =>
    statusFor(requireProviderId(providerId))
  )
  ipcMain.handle('modelProviders:saveApiKey', (_event, providerId: unknown, apiKey: unknown) => {
    const id = requireProviderId(providerId)
    if (typeof apiKey !== 'string') {
      throw new Error('Model provider API key must be a string')
    }
    switch (id) {
      case 'openrouter':
        saveOpenRouterApiKey(apiKey)
        return statusFor(id)
    }
  })
  ipcMain.handle('modelProviders:clearApiKey', (_event, providerId: unknown) => {
    const id = requireProviderId(providerId)
    switch (id) {
      case 'openrouter':
        clearOpenRouterApiKey()
        return statusFor(id)
    }
  })
  ipcMain.handle('modelProviders:diagnose', (_event, providerId: unknown) =>
    diagnoseProvider(requireProviderId(providerId))
  )
}
