import type {
  ModelCompletion,
  ModelCompletionRequest,
  ModelStreamEvent
} from '../../../shared/model-generation-types'
import type { ModelCatalog } from '../../../shared/model-provider-types'
import {
  ModelProviderRequestError,
  type ModelProvider,
  type ModelProviderCatalogRequest
} from '../model-provider'
import {
  DEFAULT_OPENROUTER_BASE_URL,
  OPENROUTER_PROVIDER_ID,
  parseOpenRouterModelsResponse,
  refineOpenRouterCatalogForZdrEndpoints
} from './openrouter-model-catalog'
import {
  buildOpenRouterCompletionBody,
  parseOpenRouterCompletionResponse,
  parseOpenRouterStreamChunk
} from './openrouter-completion'

type FetchLike = typeof fetch

export type OpenRouterProviderOptions = {
  apiKey?: string | null
  baseUrl?: string
  fetchImpl?: FetchLike
  now?: () => Date
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function requireKey(apiKey: string | null): string {
  if (!apiKey) {
    throw new ModelProviderRequestError('openrouter_api_key_required', 'not-sent', false)
  }
  return apiKey
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return Object.fromEntries(Object.entries(value))
}

async function openRouterErrorDetail(response: Response): Promise<string | null> {
  let text = ''
  try {
    text = (await response.text()).slice(0, 2_000)
  } catch {
    return null
  }
  if (!text.trim()) {
    return null
  }

  try {
    const root = record(JSON.parse(text))
    const error = record(root?.error)
    const detail =
      (typeof error?.message === 'string' && error.message) ||
      (typeof root?.message === 'string' && root.message) ||
      (typeof error?.code === 'string' && error.code) ||
      (typeof root?.code === 'string' && root.code)
    if (detail) {
      return detail.slice(0, 1_000)
    }
  } catch {
    // Fall through to bounded plaintext.
  }

  return text.trim().slice(0, 1_000)
}

function completionHeaders(apiKey: string, accept: string): Record<string, string> {
  return {
    Accept: accept,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

async function postCompletion(
  fetchImpl: FetchLike,
  url: string,
  apiKey: string,
  request: ModelCompletionRequest,
  stream: boolean
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: completionHeaders(apiKey, stream ? 'text/event-stream' : 'application/json'),
      body: JSON.stringify({
        ...buildOpenRouterCompletionBody(request),
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {})
      }),
      signal: request.signal
    })
  } catch {
    if (request.signal?.aborted) {
      throw request.signal.reason ?? new Error('aborted')
    }
    throw new ModelProviderRequestError(
      'openrouter_completion_delivery_ambiguous',
      'ambiguous',
      true
    )
  }
}

export class OpenRouterProvider implements ModelProvider {
  readonly id = OPENROUTER_PROVIDER_ID
  private readonly apiKey: string | null
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly now: () => Date

  constructor(options: OpenRouterProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || null
    this.baseUrl = (options.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL).replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => new Date())
  }

  isConfigured(): boolean {
    return this.apiKey !== null
  }

  async listModels(request: ModelProviderCatalogRequest = {}): Promise<ModelCatalog> {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    }
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`
    }

    const requiresZeroRetention =
      request.dataPolicy?.zeroDataRetention === true ||
      request.dataPolicy?.dataCollection === 'deny'
    const modelsUrl = this.apiKey
      ? `${this.baseUrl}/models/user`
      : `${this.baseUrl}/models${requiresZeroRetention ? '?zdr=true' : ''}`
    const response = await this.fetchImpl(modelsUrl, {
      method: 'GET',
      headers,
      signal: request.signal
    })
    if (!response.ok) {
      throw new Error(`openrouter_models_http_${response.status}`)
    }

    const catalog = parseOpenRouterModelsResponse(await response.json(), this.now())
    if (!requiresZeroRetention || !this.apiKey) {
      return catalog
    }

    const endpointsResponse = await this.fetchImpl(`${this.baseUrl}/endpoints/zdr`, {
      method: 'GET',
      headers,
      signal: request.signal
    })
    if (!endpointsResponse.ok) {
      throw new Error(`openrouter_zdr_endpoints_http_${endpointsResponse.status}`)
    }

    return refineOpenRouterCatalogForZdrEndpoints(catalog, await endpointsResponse.json())
  }

  async complete(request: ModelCompletionRequest): Promise<ModelCompletion> {
    const apiKey = requireKey(this.apiKey)
    const response = await postCompletion(
      this.fetchImpl,
      `${this.baseUrl}/chat/completions`,
      apiKey,
      request,
      false
    )

    if (!response.ok) {
      const providerDetail = await openRouterErrorDetail(response)
      throw new ModelProviderRequestError(
        `openrouter_completion_http_${response.status}${providerDetail ? `:${providerDetail}` : ''}`,
        'received',
        retryableStatus(response.status),
        response.status,
        providerDetail
      )
    }

    return parseOpenRouterCompletionResponse(await response.json(), request.model)
  }

  async *stream(request: ModelCompletionRequest): AsyncIterable<ModelStreamEvent> {
    const apiKey = requireKey(this.apiKey)
    const response = await postCompletion(
      this.fetchImpl,
      `${this.baseUrl}/chat/completions`,
      apiKey,
      request,
      true
    )
    if (!response.ok) {
      const providerDetail = await openRouterErrorDetail(response)
      throw new ModelProviderRequestError(
        `openrouter_completion_http_${response.status}${providerDetail ? `:${providerDetail}` : ''}`,
        'received',
        retryableStatus(response.status),
        response.status,
        providerDetail
      )
    }
    if (!response.body) {
      throw new ModelProviderRequestError(
        'openrouter_stream_body_missing',
        'received',
        true,
        response.status
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        buffer = buffer.replace(/\r\n/g, '\n')
        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith('data:')) {
              continue
            }
            const data = line.slice('data:'.length).trim()
            if (!data || data === '[DONE]') {
              continue
            }
            let parsed: unknown
            try {
              parsed = JSON.parse(data)
            } catch {
              throw new ModelProviderRequestError(
                'openrouter_stream_frame_invalid',
                'received',
                false,
                response.status
              )
            }
            for (const event of parseOpenRouterStreamChunk(parsed)) {
              yield event
            }
          }
          boundary = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (request.signal?.aborted) {
        throw request.signal.reason ?? error
      }
      if (error instanceof ModelProviderRequestError) {
        throw error
      }
      throw new ModelProviderRequestError(
        'openrouter_stream_interrupted',
        'received',
        true,
        response.status
      )
    } finally {
      reader.releaseLock()
    }
  }
}
