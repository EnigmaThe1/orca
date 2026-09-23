import type { ModelProviderId } from './model-provider-types'

export type ModelProviderSettingsStatus = {
  providerId: ModelProviderId
  configured: boolean
  storedApiKeyConfigured: boolean
  environmentApiKeyConfigured: boolean
}

export type ModelProviderDiagnostic = ModelProviderSettingsStatus & {
  catalogReachable: boolean
  modelCount: number
  toolsCapableModelCount: number
  structuredOutputModelCount: number
  error: string | null
}
