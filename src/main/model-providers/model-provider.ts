import type {
  ModelCompletion,
  ModelCompletionRequest,
  ModelDataPolicy,
  ModelStreamEvent
} from '../../shared/model-generation-types'
import type { ModelCatalog, ModelProviderId } from '../../shared/model-provider-types'

export type ModelProviderCatalogRequest = {
  /** Apply the same endpoint/privacy eligibility policy that inference will use. */
  dataPolicy?: ModelDataPolicy
  signal?: AbortSignal
}

export type ModelProviderDeliveryState = 'not-sent' | 'ambiguous' | 'received'

export class ModelProviderRequestError extends Error {
  constructor(
    message: string,
    readonly deliveryState: ModelProviderDeliveryState,
    readonly retryable: boolean,
    readonly statusCode: number | null = null,
    readonly providerDetail: string | null = null
  ) {
    super(message)
    this.name = 'ModelProviderRequestError'
  }
}

export type ModelProvider = {
  readonly id: ModelProviderId
  /** True only when this provider can accept inference requests on this host. */
  isConfigured?(): boolean
  listModels(request?: ModelProviderCatalogRequest): Promise<ModelCatalog>
  complete(request: ModelCompletionRequest): Promise<ModelCompletion>
  stream?(request: ModelCompletionRequest): AsyncIterable<ModelStreamEvent>
}
