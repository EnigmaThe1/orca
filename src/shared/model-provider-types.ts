export const MODEL_PROVIDER_IDS = ['openrouter'] as const

export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number]

export const MODEL_PROVIDER_DISPLAY_NAMES = {
  openrouter: 'OpenRouter'
} as const satisfies Record<ModelProviderId, string>

export function modelProviderDisplayName(providerId: ModelProviderId): string {
  return MODEL_PROVIDER_DISPLAY_NAMES[providerId]
}

export const MODEL_CAPABILITIES = [
  'tools',
  'structured-output',
  'json-output',
  'reasoning',
  'vision'
] as const

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number]

export type ModelPrice = {
  /** USD per one million input tokens. Null means the provider did not publish a usable price. */
  inputPerMillionUsd: number | null
  /** USD per one million output tokens. Null means the provider did not publish a usable price. */
  outputPerMillionUsd: number | null
}

export type ModelDescriptor = {
  providerId: ModelProviderId
  /** Provider-native model id. Keep this opaque; never infer capabilities from the name. */
  id: string
  name: string
  description: string | null
  contextWindow: number | null
  maxOutputTokens: number | null
  inputModalities: string[]
  outputModalities: string[]
  capabilities: ModelCapability[]
  pricing: ModelPrice
}

export type ModelCatalog = {
  providerId: ModelProviderId
  fetchedAt: string
  models: ModelDescriptor[]
}

export type ModelCapabilityRequirement = {
  allOf?: readonly ModelCapability[]
  anyOf?: readonly ModelCapability[]
}

export function modelSatisfiesCapabilities(
  model: Pick<ModelDescriptor, 'capabilities'>,
  requirement: ModelCapabilityRequirement
): boolean {
  const available = new Set(model.capabilities)
  const allOf = requirement.allOf ?? []
  const anyOf = requirement.anyOf ?? []

  return (
    allOf.every((capability) => available.has(capability)) &&
    (anyOf.length === 0 || anyOf.some((capability) => available.has(capability)))
  )
}
