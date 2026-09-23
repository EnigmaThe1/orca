import type {
  ModelCompletion,
  ModelCompletionRequest,
  ModelMessage,
  ModelStreamEvent,
  ModelToolCall
} from '../../../shared/model-generation-types'

export const OPENROUTER_FALLBACK_MODEL_CEILING = 3

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return Object.fromEntries(Object.entries(value))
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function contentText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (!Array.isArray(value)) {
    return ''
  }
  return value
    .map((part) => {
      const item = record(part)
      return item?.type === 'text' && typeof item.text === 'string' ? item.text : ''
    })
    .join('')
}

function mapMessage(message: ModelMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId
    }
  }

  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: toolCall.argumentsJson
              }
            }))
          }
        : {})
    }
  }

  return {
    role: message.role,
    content: message.content
  }
}

export function buildOpenRouterCompletionBody(
  request: ModelCompletionRequest
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: request.messages.map(mapMessage)
  }

  if (request.fallbackModels?.length) {
    body.models = [request.model, ...request.fallbackModels].slice(
      0,
      OPENROUTER_FALLBACK_MODEL_CEILING
    )
  } else {
    body.model = request.model
  }

  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }))
  }

  if (request.structuredOutput) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: request.structuredOutput.name,
        strict: request.structuredOutput.strict ?? true,
        schema: request.structuredOutput.schema
      }
    }
  }

  if (request.maxOutputTokens !== undefined) {
    body.max_tokens = request.maxOutputTokens
  }

  if (request.reasoningEffort) {
    body.reasoning = {
      effort: request.reasoningEffort
    }
  }

  const provider: Record<string, unknown> = {}
  if (request.tools?.length || request.structuredOutput) {
    provider.require_parameters = true
  }
  if (request.dataPolicy) {
    if (request.dataPolicy.dataCollection) {
      provider.data_collection = request.dataPolicy.dataCollection
    }
    if (request.dataPolicy.zeroDataRetention !== undefined) {
      provider.zdr = request.dataPolicy.zeroDataRetention
    }
    if (request.dataPolicy.allowProviderFallbacks !== undefined) {
      provider.allow_fallbacks = request.dataPolicy.allowProviderFallbacks
    }
    if (request.dataPolicy.providerAllowlist?.length) {
      provider.only = [...request.dataPolicy.providerAllowlist]
    }
    if (request.dataPolicy.providerDenylist?.length) {
      provider.ignore = [...request.dataPolicy.providerDenylist]
    }
  }
  if (Object.keys(provider).length > 0) {
    body.provider = provider
  }

  return body
}

function parseToolCalls(value: unknown): ModelToolCall[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: ModelToolCall[] = []
  for (const item of value) {
    const call = record(item)
    const fn = record(call?.function)
    if (
      typeof call?.id !== 'string' ||
      call.id === '' ||
      typeof fn?.name !== 'string' ||
      fn.name === '' ||
      typeof fn?.arguments !== 'string'
    ) {
      continue
    }
    result.push({
      id: call.id,
      name: fn.name,
      argumentsJson: fn.arguments
    })
  }
  return result
}

function usageEvent(usage: Record<string, unknown> | null): ModelStreamEvent | null {
  if (!usage) {
    return null
  }
  return {
    type: 'usage',
    usage: {
      inputTokens: nonNegativeInteger(usage.prompt_tokens),
      outputTokens: nonNegativeInteger(usage.completion_tokens),
      totalTokens: nonNegativeInteger(usage.total_tokens)
    }
  }
}

export function parseOpenRouterStreamChunk(value: unknown): ModelStreamEvent[] {
  const root = record(value)
  if (!root) {
    return []
  }
  const events: ModelStreamEvent[] = []
  const choices = Array.isArray(root.choices) ? root.choices : []
  const choice = record(choices[0])
  const delta = record(choice?.delta)

  const text = contentText(delta?.content)
  if (text) {
    events.push({ type: 'text-delta', text })
  }

  if (Array.isArray(delta?.tool_calls)) {
    for (const item of delta.tool_calls) {
      const call = record(item)
      const fn = record(call?.function)
      const index = call?.index
      if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
        continue
      }
      const event: Extract<ModelStreamEvent, { type: 'tool-call-delta' }> = {
        type: 'tool-call-delta',
        index
      }
      if (typeof call?.id === 'string' && call.id) {
        event.id = call.id
      }
      if (typeof fn?.name === 'string' && fn.name) {
        event.name = fn.name
      }
      if (typeof fn?.arguments === 'string' && fn.arguments) {
        event.argumentsDelta = fn.arguments
      }
      events.push(event)
    }
  }

  const usage = usageEvent(record(root.usage))
  if (usage) {
    events.push(usage)
  }

  if (choice && choice.finish_reason !== undefined && choice.finish_reason !== null) {
    events.push({
      type: 'finish',
      model: typeof root.model === 'string' && root.model ? root.model : null,
      finishReason:
        typeof choice.finish_reason === 'string' && choice.finish_reason
          ? choice.finish_reason
          : null
    })
  }

  return events
}

export function parseOpenRouterCompletionResponse(
  value: unknown,
  requestedModel: string
): ModelCompletion {
  const root = record(value)
  const choices = Array.isArray(root?.choices) ? root.choices : []
  const choice = record(choices[0])
  const message = record(choice?.message)
  const usage = record(root?.usage)

  return {
    model: typeof root?.model === 'string' && root.model !== '' ? root.model : requestedModel,
    text: contentText(message?.content),
    toolCalls: parseToolCalls(message?.tool_calls),
    finishReason:
      typeof choice?.finish_reason === 'string' && choice.finish_reason !== ''
        ? choice.finish_reason
        : null,
    usage: {
      inputTokens: nonNegativeInteger(usage?.prompt_tokens),
      outputTokens: nonNegativeInteger(usage?.completion_tokens),
      totalTokens: nonNegativeInteger(usage?.total_tokens)
    }
  }
}
