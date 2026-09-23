import { describe, expect, it, vi } from 'vitest'
import type { ModelCatalog } from '../../shared/model-provider-types'
import { ModelProviderRegistry } from './model-provider-registry'
import type { ModelProvider } from './model-provider'

const emptyCatalog: ModelCatalog = {
  providerId: 'openrouter',
  fetchedAt: '2026-09-21T00:00:00.000Z',
  models: []
}

function stubProvider(overrides: Partial<ModelProvider> = {}): ModelProvider {
  return {
    id: 'openrouter',
    isConfigured: () => true,
    listModels: async () => emptyCatalog,
    complete: async () => {
      throw new Error('complete is not used in registry tests')
    },
    ...overrides
  }
}

describe('model provider registry', () => {
  it('registers providers and lists catalogues without exposing credentials', async () => {
    const catalog: ModelCatalog = {
      providerId: 'openrouter',
      fetchedAt: '2026-09-21T00:00:00.000Z',
      models: [
        {
          providerId: 'openrouter',
          id: 'vendor/coder',
          name: 'Coder',
          description: null,
          contextWindow: null,
          maxOutputTokens: null,
          inputModalities: ['text'],
          outputModalities: ['text'],
          capabilities: ['tools'],
          pricing: { inputPerMillionUsd: null, outputPerMillionUsd: null }
        }
      ]
    }
    const listModels = vi.fn(async () => catalog)
    const registry = new ModelProviderRegistry()
    registry.register(stubProvider({ listModels }))

    expect(registry.listProviderIds()).toEqual(['openrouter'])
    expect(registry.has('openrouter')).toBe(true)
    await expect(registry.listModels('openrouter')).resolves.toMatchObject({
      providerId: 'openrouter',
      models: [{ id: 'vendor/coder', capabilities: ['tools'] }]
    })
    expect(JSON.stringify(await registry.listModels('openrouter'))).not.toMatch(
      /apiKey|Bearer|or-test/
    )
  })

  it('refuses duplicate registrations and missing providers', () => {
    const registry = new ModelProviderRegistry()
    registry.register(stubProvider())
    expect(() => registry.register(stubProvider())).toThrow('model_provider_duplicate:openrouter')
    expect(registry.get('openrouter').id).toBe('openrouter')
  })
})
