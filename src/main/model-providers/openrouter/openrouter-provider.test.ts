import { describe, expect, it, vi } from 'vitest'
import type { ModelStreamEvent } from '../../../shared/model-generation-types'
import { OpenRouterProvider } from './openrouter-provider'

const TEST_API_KEY = 'or-test-key'

describe('OpenRouterProvider', () => {
  it('fetches the provider model catalogue with bearer auth', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'vendor/coder',
                name: 'Coder',
                supported_parameters: ['tools']
              }
            ]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
    )

    const provider = new OpenRouterProvider({
      apiKey: TEST_API_KEY,
      baseUrl: 'https://router.example/v1/',
      fetchImpl,
      now: () => new Date('2026-09-21T02:00:00.000Z')
    })

    const catalog = await provider.listModels()

    expect(fetchImpl).toHaveBeenCalledWith('https://router.example/v1/models/user', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`
      },
      signal: undefined
    })
    expect(catalog).toMatchObject({
      providerId: 'openrouter',
      fetchedAt: '2026-09-21T02:00:00.000Z',
      models: [
        {
          id: 'vendor/coder',
          capabilities: ['tools']
        }
      ]
    })
    expect(JSON.stringify(catalog)).not.toContain(TEST_API_KEY)
  })

  it('intersects the account-aware catalogue with endpoint-level ZDR capabilities', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/models/user')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'vendor/reviewer',
                name: 'Reviewer',
                supported_parameters: ['tools', 'response_format', 'reasoning_effort']
              },
              {
                id: 'vendor/non-zdr',
                name: 'Non ZDR',
                supported_parameters: ['tools', 'response_format']
              }
            ]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
      if (url.endsWith('/endpoints/zdr')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                model_id: 'vendor/reviewer',
                provider_name: 'Provider A',
                supported_parameters: ['tools']
              },
              {
                model_id: 'vendor/reviewer',
                provider_name: 'Provider B',
                supported_parameters: ['response_format']
              }
            ]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
      throw new Error(`unexpected URL: ${url}`)
    })
    const provider = new OpenRouterProvider({
      apiKey: TEST_API_KEY,
      baseUrl: 'https://router.example/v1',
      fetchImpl
    })

    const catalog = await provider.listModels({
      dataPolicy: {
        dataCollection: 'deny',
        zeroDataRetention: true
      }
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://router.example/v1/models/user',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://router.example/v1/endpoints/zdr',
      expect.objectContaining({ method: 'GET' })
    )
    expect(catalog.models).toEqual([
      expect.objectContaining({
        id: 'vendor/reviewer',
        capabilities: ['tools', 'structured-output', 'json-output']
      })
    ])
  })

  it('uses the public ZDR model filter for keyless policy-aware discovery', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    )
    const provider = new OpenRouterProvider({ fetchImpl })

    await provider.listModels({
      dataPolicy: { zeroDataRetention: true }
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?zdr=true',
      expect.objectContaining({
        headers: { Accept: 'application/json' }
      })
    )
  })

  it('does not treat data-collection denial as a ZDR catalogue filter', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/models/user') || url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      throw new Error(`unexpected URL: ${url}`)
    })
    const keyed = new OpenRouterProvider({
      apiKey: TEST_API_KEY,
      baseUrl: 'https://router.example/v1',
      fetchImpl
    })

    await keyed.listModels({ dataPolicy: { dataCollection: 'deny' } })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://router.example/v1/models/user',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchImpl).not.toHaveBeenCalledWith(
      expect.stringContaining('/endpoints/zdr'),
      expect.anything()
    )

    const keyless = new OpenRouterProvider({ fetchImpl })
    await keyless.listModels({ dataPolicy: { dataCollection: 'deny' } })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('fails closed when ZDR endpoint discovery is unavailable', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/models/user')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'vendor/reviewer',
                supported_parameters: ['tools', 'response_format']
              }
            ]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
      if (url.endsWith('/endpoints/zdr')) {
        return new Response('unavailable', { status: 503 })
      }
      throw new Error(`unexpected URL: ${url}`)
    })
    const provider = new OpenRouterProvider({
      apiKey: TEST_API_KEY,
      baseUrl: 'https://router.example/v1',
      fetchImpl
    })

    await expect(
      provider.listModels({
        dataPolicy: {
          dataCollection: 'deny',
          zeroDataRetention: true
        }
      })
    ).rejects.toThrow('openrouter_zdr_endpoints_http_503')
  })

  it('does not require a key for catalogue discovery', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    )

    const provider = new OpenRouterProvider({ fetchImpl })
    await provider.listModels()

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({
        headers: { Accept: 'application/json' }
      })
    )
  })

  it('fails closed on HTTP errors', async () => {
    const provider = new OpenRouterProvider({
      fetchImpl: vi.fn(async () => new Response('rate limited', { status: 429 }))
    })

    await expect(provider.listModels()).rejects.toThrow('openrouter_models_http_429')
  })

  it('sends completions through the OpenRouter chat endpoint', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: 'vendor/coder',
            choices: [{ finish_reason: 'stop', message: { content: 'done' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )
    const provider = new OpenRouterProvider({
      apiKey: TEST_API_KEY,
      baseUrl: 'https://router.example/v1',
      fetchImpl
    })

    await expect(
      provider.complete({
        model: 'vendor/coder',
        messages: [{ role: 'user', content: 'Fix the bug.' }]
      })
    ).resolves.toMatchObject({
      model: 'vendor/coder',
      text: 'done'
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://router.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${TEST_API_KEY}`,
          'Content-Type': 'application/json'
        }
      })
    )
  })

  it('surfaces bounded OpenRouter HTTP error detail without changing delivery classification', async () => {
    const provider = new OpenRouterProvider({
      apiKey: TEST_API_KEY,
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                message: 'Insufficient credits for this request'
              }
            }),
            {
              status: 402,
              headers: { 'content-type': 'application/json' }
            }
          )
      )
    })

    await expect(
      provider.complete({
        model: 'vendor/coder',
        messages: [{ role: 'user', content: 'Fix it.' }]
      })
    ).rejects.toMatchObject({
      message: 'openrouter_completion_http_402:Insufficient credits for this request',
      deliveryState: 'received',
      retryable: false,
      statusCode: 402,
      providerDetail: 'Insufficient credits for this request'
    })
  })

  it('streams CRLF-framed OpenRouter events through the provider-neutral contract', async () => {
    const payloads = [
      JSON.stringify({
        model: 'vendor/coder',
        choices: [{ delta: { content: 'Hel' }, finish_reason: null }]
      }),
      JSON.stringify({
        model: 'vendor/coder',
        choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
      })
    ]
    const body = `${payloads.map((payload) => `data: ${payload}\r\n\r\n`).join('')}data: [DONE]\r\n\r\n`
    const fetchImpl = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        })
    )
    const provider = new OpenRouterProvider({
      apiKey: TEST_API_KEY,
      fetchImpl
    })

    const events: ModelStreamEvent[] = []
    for await (const event of provider.stream({
      model: 'vendor/coder',
      messages: [{ role: 'user', content: 'Say hello.' }]
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo' },
      {
        type: 'usage',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 }
      },
      { type: 'finish', model: 'vendor/coder', finishReason: 'stop' }
    ])
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        body: expect.stringContaining('"stream":true')
      })
    )
  })

  it('classifies a thrown completion transport after POST as ambiguous delivery', async () => {
    const provider = new OpenRouterProvider({
      apiKey: TEST_API_KEY,
      fetchImpl: vi.fn(async () => {
        throw new Error('socket reset')
      })
    })

    await expect(
      provider.complete({
        model: 'vendor/coder',
        messages: [{ role: 'user', content: 'Fix it.' }]
      })
    ).rejects.toMatchObject({
      message: 'openrouter_completion_delivery_ambiguous',
      deliveryState: 'ambiguous',
      retryable: true
    })
  })

  it('refuses completions when no API key is configured', async () => {
    const provider = new OpenRouterProvider({
      fetchImpl: vi.fn()
    })

    await expect(
      provider.complete({
        model: 'vendor/coder',
        messages: [{ role: 'user', content: 'Fix the bug.' }]
      })
    ).rejects.toThrow('openrouter_api_key_required')
  })
})
