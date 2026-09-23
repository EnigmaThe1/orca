import type { ModelProviderId } from '../../shared/model-provider-types'
import type {
  ModelProviderDiagnostic,
  ModelProviderSettingsStatus
} from '../../shared/model-provider-settings-types'

export type ModelProviderSettingsApi = {
  getStatus: (providerId: ModelProviderId) => Promise<ModelProviderSettingsStatus>
  saveApiKey: (providerId: ModelProviderId, apiKey: string) => Promise<ModelProviderSettingsStatus>
  clearApiKey: (providerId: ModelProviderId) => Promise<ModelProviderSettingsStatus>
  diagnose: (providerId: ModelProviderId) => Promise<ModelProviderDiagnostic>
}
