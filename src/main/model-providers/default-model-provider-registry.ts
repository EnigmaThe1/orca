import type { ModelProviderId } from '../../shared/model-provider-types'
import type { ModelProvider } from './model-provider'
import { ModelProviderRegistry } from './model-provider-registry'
import { resolveOpenRouterApiKey } from './openrouter/openrouter-api-key-store'
import { OpenRouterProvider } from './openrouter/openrouter-provider'

export type DefaultModelProviderRegistryOptions = {
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
}

export function createDefaultModelProvider(
  providerId: ModelProviderId,
  options: DefaultModelProviderRegistryOptions = {}
): ModelProvider {
  const env = options.env ?? process.env
  switch (providerId) {
    case 'openrouter':
      return new OpenRouterProvider({
        apiKey: resolveOpenRouterApiKey(env),
        fetchImpl: options.fetchImpl
      })
  }
}

function unavailableProvider(
  providerId: ModelProviderId,
  options: DefaultModelProviderRegistryOptions
): ModelProvider {
  switch (providerId) {
    case 'openrouter':
      return new OpenRouterProvider({
        fetchImpl: options.fetchImpl
      })
  }
}

export function createDefaultModelProviderRegistry(
  options: DefaultModelProviderRegistryOptions = {}
): ModelProviderRegistry {
  const registry = new ModelProviderRegistry()
  for (const providerId of ['openrouter'] as const) {
    try {
      registry.register(createDefaultModelProvider(providerId, options))
    } catch {
      // One malformed provider configuration must not disable the registry.
      registry.register(unavailableProvider(providerId, options))
    }
  }
  return registry
}
