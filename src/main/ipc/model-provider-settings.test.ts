import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcState = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      ipcState.handlers.set(channel, handler)
    }
  }
}))

const hasStoredOpenRouterApiKeyMock = vi.hoisted(() => vi.fn(() => false))
const saveOpenRouterApiKeyMock = vi.hoisted(() => vi.fn())
const clearOpenRouterApiKeyMock = vi.hoisted(() => vi.fn())
const listModelsMock = vi.hoisted(() =>
  vi.fn(async () => ({
    providerId: 'openrouter' as const,
    fetchedAt: new Date(0).toISOString(),
    models: [
      {
        providerId: 'openrouter' as const,
        id: 'tools',
        name: 'tools',
        description: null,
        contextWindow: null,
        maxOutputTokens: null,
        inputModalities: ['text'],
        outputModalities: ['text'],
        capabilities: ['tools', 'structured-output'] as const,
        pricing: { inputPerMillionUsd: null, outputPerMillionUsd: null }
      },
      {
        providerId: 'openrouter' as const,
        id: 'plain',
        name: 'plain',
        description: null,
        contextWindow: null,
        maxOutputTokens: null,
        inputModalities: ['text'],
        outputModalities: ['text'],
        capabilities: [] as const,
        pricing: { inputPerMillionUsd: null, outputPerMillionUsd: null }
      }
    ]
  }))
)

vi.mock('../model-providers/openrouter/openrouter-api-key-store', () => ({
  hasStoredOpenRouterApiKey: hasStoredOpenRouterApiKeyMock,
  saveOpenRouterApiKey: saveOpenRouterApiKeyMock,
  clearOpenRouterApiKey: clearOpenRouterApiKeyMock
}))

vi.mock('../model-providers/default-model-provider-registry', () => ({
  createDefaultModelProvider: () => ({
    listModels: listModelsMock
  })
}))

import { registerModelProviderSettingsHandlers } from './model-provider-settings'

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = ipcState.handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return handler({}, ...args)
}

describe('model provider settings IPC', () => {
  beforeEach(() => {
    ipcState.handlers.clear()
    hasStoredOpenRouterApiKeyMock.mockReset()
    hasStoredOpenRouterApiKeyMock.mockReturnValue(false)
    saveOpenRouterApiKeyMock.mockReset()
    clearOpenRouterApiKeyMock.mockReset()
    listModelsMock.mockClear()
    vi.stubEnv('OPENROUTER_API_KEY', '')
  })

  it('registers status, mutation and diagnostic channels', () => {
    registerModelProviderSettingsHandlers()
    expect([...ipcState.handlers.keys()].sort()).toEqual([
      'modelProviders:clearApiKey',
      'modelProviders:diagnose',
      'modelProviders:getStatus',
      'modelProviders:saveApiKey'
    ])
  })

  it('reports OpenRouter status without reading or returning the key', async () => {
    hasStoredOpenRouterApiKeyMock.mockReturnValue(true)
    registerModelProviderSettingsHandlers()

    await expect(invoke('modelProviders:getStatus', 'openrouter')).resolves.toEqual({
      providerId: 'openrouter',
      configured: true,
      storedApiKeyConfigured: true,
      environmentApiKeyConfigured: false
    })
  })

  it('reports environment OpenRouter configuration separately from stored state', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'env-key')
    registerModelProviderSettingsHandlers()

    await expect(invoke('modelProviders:getStatus', 'openrouter')).resolves.toEqual({
      providerId: 'openrouter',
      configured: true,
      storedApiKeyConfigured: false,
      environmentApiKeyConfigured: true
    })
  })

  it('saves and clears OpenRouter through the encrypted key-store boundary', async () => {
    hasStoredOpenRouterApiKeyMock.mockReturnValue(true)
    registerModelProviderSettingsHandlers()

    await invoke('modelProviders:saveApiKey', 'openrouter', 'or-test-secret')
    expect(saveOpenRouterApiKeyMock).toHaveBeenCalledWith('or-test-secret')

    hasStoredOpenRouterApiKeyMock.mockReturnValue(false)
    await invoke('modelProviders:clearApiKey', 'openrouter')
    expect(clearOpenRouterApiKeyMock).toHaveBeenCalledTimes(1)
  })

  it('rejects unsupported providers without touching the key store', async () => {
    registerModelProviderSettingsHandlers()

    await expect(invoke('modelProviders:getStatus', 'unknown')).rejects.toThrow(
      'Unsupported model provider'
    )
    expect(saveOpenRouterApiKeyMock).not.toHaveBeenCalled()
  })

  it('diagnoses catalogue reachability and capability counts', async () => {
    registerModelProviderSettingsHandlers()

    await expect(invoke('modelProviders:diagnose', 'openrouter')).resolves.toMatchObject({
      providerId: 'openrouter',
      catalogReachable: true,
      modelCount: 2,
      toolsCapableModelCount: 1,
      structuredOutputModelCount: 1,
      error: null
    })
  })
})
