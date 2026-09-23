import { afterEach, describe, expect, it, vi } from 'vitest'

const resolveOpenRouterApiKeyMock = vi.hoisted(() => vi.fn(() => 'configured-key'))

vi.mock('./openrouter/openrouter-api-key-store', () => ({
  resolveOpenRouterApiKey: resolveOpenRouterApiKeyMock
}))

import {
  createDefaultModelProvider,
  createDefaultModelProviderRegistry
} from './default-model-provider-registry'

describe('default model provider registry', () => {
  afterEach(() => {
    resolveOpenRouterApiKeyMock.mockClear()
  })

  it('registers OpenRouter without exposing the credential through the registry', () => {
    const registry = createDefaultModelProviderRegistry({
      env: { OPENROUTER_API_KEY: 'env-key' }
    })

    expect(resolveOpenRouterApiKeyMock).toHaveBeenCalledWith({
      OPENROUTER_API_KEY: 'env-key'
    })
    expect(registry.listProviderIds()).toEqual(['openrouter'])
    expect(registry.get('openrouter').id).toBe('openrouter')
    expect(registry.get('openrouter').isConfigured?.()).toBe(true)
    expect(JSON.stringify(registry.listProviderIds())).not.toContain('env-key')
  })

  it('constructs OpenRouter without requiring unrelated provider configuration', () => {
    expect(
      createDefaultModelProvider('openrouter', {
        env: { OPENROUTER_API_KEY: 'env-key' }
      }).id
    ).toBe('openrouter')
  })

  it('keeps the registry usable when stored-key resolution throws', () => {
    resolveOpenRouterApiKeyMock.mockImplementationOnce(() => {
      throw new Error('decrypt failed')
    })
    const registry = createDefaultModelProviderRegistry({ env: {} })

    expect(registry.get('openrouter').id).toBe('openrouter')
    expect(registry.get('openrouter').isConfigured?.()).toBe(false)
  })
})
