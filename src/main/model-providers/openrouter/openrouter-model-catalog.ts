import type {
  ModelCapability,
  ModelCatalog,
  ModelDescriptor,
  ModelPrice
} from '../../../shared/model-provider-types'

export const OPENROUTER_PROVIDER_ID = 'openrouter' as const
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return Object.fromEntries(Object.entries(value))
}

function finiteNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function positiveInteger(value: unknown): number | null {
  const parsed = finiteNonNegativeNumber(value)
  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return [
    ...new Set(value.filter((item): item is string => typeof item === 'string' && item !== ''))
  ]
}

function pricePerMillion(value: unknown): number | null {
  const perToken = finiteNonNegativeNumber(value)
  return perToken === null ? null : perToken * 1_000_000
}

function readPrice(value: unknown): ModelPrice {
  const pricing = record(value)
  return {
    inputPerMillionUsd: pricePerMillion(pricing?.prompt),
    outputPerMillionUsd: pricePerMillion(pricing?.completion)
  }
}

function capabilitiesFromSupportedParameters(value: unknown): ModelCapability[] {
  const supported = new Set(stringArray(value))
  const capabilities: ModelCapability[] = []

  if (supported.has('tools') || supported.has('tool_choice')) {
    capabilities.push('tools')
  }
  if (supported.has('response_format') || supported.has('structured_outputs')) {
    capabilities.push('structured-output')
    capabilities.push('json-output')
  }
  if (
    supported.has('reasoning') ||
    supported.has('include_reasoning') ||
    supported.has('reasoning_effort')
  ) {
    capabilities.push('reasoning')
  }

  return capabilities
}

function readCapabilities(model: Record<string, unknown>): ModelCapability[] {
  const capabilities = capabilitiesFromSupportedParameters(model.supported_parameters)
  const architecture = record(model.architecture)
  const inputModalities = new Set(stringArray(architecture?.input_modalities))
  if (inputModalities.has('image')) {
    capabilities.push('vision')
  }
  return capabilities
}

export function parseOpenRouterModel(value: unknown): ModelDescriptor | null {
  const model = record(value)
  if (!model || typeof model.id !== 'string' || model.id.trim() === '') {
    return null
  }

  const architecture = record(model.architecture)
  const topProvider = record(model.top_provider)
  const id = model.id.trim()

  return {
    providerId: OPENROUTER_PROVIDER_ID,
    id,
    name: typeof model.name === 'string' && model.name.trim() !== '' ? model.name.trim() : id,
    description:
      typeof model.description === 'string' && model.description.trim() !== ''
        ? model.description.trim()
        : null,
    contextWindow: positiveInteger(model.context_length),
    maxOutputTokens: positiveInteger(topProvider?.max_completion_tokens),
    inputModalities: stringArray(architecture?.input_modalities),
    outputModalities: stringArray(architecture?.output_modalities),
    capabilities: readCapabilities(model),
    pricing: readPrice(model.pricing)
  }
}

export function parseOpenRouterModelsResponse(
  value: unknown,
  fetchedAt = new Date()
): ModelCatalog {
  const envelope = record(value)
  const data = Array.isArray(envelope?.data) ? envelope.data : []

  return {
    providerId: OPENROUTER_PROVIDER_ID,
    fetchedAt: fetchedAt.toISOString(),
    models: data
      .map(parseOpenRouterModel)
      .filter((model): model is ModelDescriptor => model !== null)
  }
}

export function refineOpenRouterCatalogForZdrEndpoints(
  catalog: ModelCatalog,
  value: unknown
): ModelCatalog {
  const envelope = record(value)
  const rows = Array.isArray(envelope?.data) ? envelope.data : []
  const endpointCapabilities = new Map<string, Set<ModelCapability>>()

  for (const row of rows) {
    const endpoint = record(row)
    if (!endpoint || typeof endpoint.model_id !== 'string' || endpoint.model_id.trim() === '') {
      continue
    }
    const modelId = endpoint.model_id.trim()
    const capabilities = endpointCapabilities.get(modelId) ?? new Set<ModelCapability>()
    for (const capability of capabilitiesFromSupportedParameters(endpoint.supported_parameters)) {
      capabilities.add(capability)
    }
    endpointCapabilities.set(modelId, capabilities)
  }

  return {
    ...catalog,
    models: catalog.models.flatMap((model) => {
      const endpoint = endpointCapabilities.get(model.id)
      if (!endpoint) {
        return []
      }
      const capabilities = [
        ...endpoint,
        ...(model.capabilities.includes('vision') ? (['vision'] as const) : [])
      ]
      return [
        {
          ...model,
          capabilities: [...new Set<ModelCapability>(capabilities)]
        }
      ]
    })
  }
}
