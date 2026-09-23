export type ModelToolCall = {
  id: string
  name: string
  argumentsJson: string
}

export type ModelMessage =
  | {
      role: 'system' | 'user'
      content: string
    }
  | {
      role: 'assistant'
      content: string
      toolCalls?: ModelToolCall[]
    }
  | {
      role: 'tool'
      content: string
      toolCallId: string
    }

export type ModelToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export type ModelStructuredOutput = {
  name: string
  schema: Record<string, unknown>
  strict?: boolean
}

export type ModelReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type ModelDataPolicy = {
  /** Provider endpoints that retain/train on submitted data are excluded when denied. */
  dataCollection?: 'allow' | 'deny'
  /** Require provider endpoints that retain neither prompt nor completion after processing. */
  zeroDataRetention?: boolean
  /** Whether a provider router may try endpoints outside its preferred order. */
  allowProviderFallbacks?: boolean
  /** Optional provider endpoint allowlist, using provider-native routing identifiers. */
  providerAllowlist?: string[]
  /** Optional provider endpoint denylist, using provider-native routing identifiers. */
  providerDenylist?: string[]
}

/** Reusable privacy-first default. Callers may override allowlists or fallback routing. */
export const DEFAULT_MODEL_DATA_POLICY: ModelDataPolicy = {
  dataCollection: 'deny',
  zeroDataRetention: true,
  allowProviderFallbacks: true
}

export type ModelCompletionRequest = {
  model: string
  /**
   * Ordered model fallbacks admitted only after the caller chooses the primary model.
   * Providers may route them internally. Callers must not retry after an ambiguous
   * delivery because that can duplicate a model action.
   */
  fallbackModels?: string[]
  messages: ModelMessage[]
  tools?: ModelToolDefinition[]
  structuredOutput?: ModelStructuredOutput
  maxOutputTokens?: number
  reasoningEffort?: ModelReasoningEffort
  dataPolicy?: ModelDataPolicy
  signal?: AbortSignal
}

export type ModelTokenUsage = {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

export type ModelCompletion = {
  model: string
  text: string
  toolCalls: ModelToolCall[]
  finishReason: string | null
  usage: ModelTokenUsage
}

export type ModelStreamEvent =
  | { type: 'text-delta'; text: string }
  | {
      type: 'tool-call-delta'
      index: number
      id?: string
      name?: string
      argumentsDelta?: string
    }
  | { type: 'usage'; usage: ModelTokenUsage }
  | { type: 'finish'; model: string | null; finishReason: string | null }
