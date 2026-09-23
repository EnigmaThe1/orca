import type { ModelCatalog, ModelProviderId } from '../../shared/model-provider-types'
import type { ModelProvider, ModelProviderCatalogRequest } from './model-provider'

export class ModelProviderRegistry {
  private readonly providers = new Map<ModelProviderId, ModelProvider>()

  register(provider: ModelProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`model_provider_duplicate:${provider.id}`)
    }
    this.providers.set(provider.id, provider)
  }

  has(providerId: ModelProviderId): boolean {
    return this.providers.has(providerId)
  }

  get(providerId: ModelProviderId): ModelProvider {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new Error(`model_provider_unavailable:${providerId}`)
    }
    return provider
  }

  listProviderIds(): ModelProviderId[] {
    return [...this.providers.keys()]
  }

  listModels(
    providerId: ModelProviderId,
    request?: ModelProviderCatalogRequest
  ): Promise<ModelCatalog> {
    return this.get(providerId).listModels(request)
  }
}
