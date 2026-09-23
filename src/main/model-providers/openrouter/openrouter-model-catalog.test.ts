import { describe, expect, it } from 'vitest'
import { modelSatisfiesCapabilities } from '../../../shared/model-provider-types'
import {
  OPENROUTER_PROVIDER_ID,
  parseOpenRouterModelsResponse,
  refineOpenRouterCatalogForZdrEndpoints
} from './openrouter-model-catalog'

describe('openrouter model catalogue', () => {
  it('normalises capabilities, prices and token limits without using model-name heuristics', () => {
    const catalog = parseOpenRouterModelsResponse(
      {
        data: [
          {
            id: 'vendor/coder',
            name: 'Coder',
            description: 'Coding model',
            context_length: 262144,
            pricing: {
              prompt: '0.0000015',
              completion: '0.000006'
            },
            architecture: {
              input_modalities: ['text', 'image'],
              output_modalities: ['text']
            },
            top_provider: {
              max_completion_tokens: 32768
            },
            supported_parameters: [
              'tools',
              'tool_choice',
              'response_format',
              'structured_outputs',
              'reasoning'
            ]
          }
        ]
      },
      new Date('2026-09-21T00:00:00.000Z')
    )

    expect(catalog.providerId).toBe(OPENROUTER_PROVIDER_ID)
    expect(catalog.fetchedAt).toBe('2026-09-21T00:00:00.000Z')
    expect(catalog.models).toEqual([
      {
        providerId: 'openrouter',
        id: 'vendor/coder',
        name: 'Coder',
        description: 'Coding model',
        contextWindow: 262144,
        maxOutputTokens: 32768,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        capabilities: ['tools', 'structured-output', 'json-output', 'reasoning', 'vision'],
        pricing: {
          inputPerMillionUsd: 1.5,
          outputPerMillionUsd: 6
        }
      }
    ])
    const [coder] = catalog.models
    expect(coder).toBeDefined()
    expect(
      modelSatisfiesCapabilities(coder ?? { capabilities: [] }, {
        allOf: ['tools', 'structured-output'],
        anyOf: ['reasoning', 'vision']
      })
    ).toBe(true)
  })

  it('treats response_format-only models as structured-output capable', () => {
    const catalog = parseOpenRouterModelsResponse({
      data: [
        {
          id: 'vendor/reviewer',
          architecture: {
            input_modalities: ['text'],
            output_modalities: ['text']
          },
          supported_parameters: ['tools', 'response_format']
        }
      ]
    })

    expect(catalog.models[0]).toMatchObject({
      id: 'vendor/reviewer',
      capabilities: ['tools', 'structured-output', 'json-output']
    })
  })

  it('drops invalid records and preserves unknown pricing as null', () => {
    const catalog = parseOpenRouterModelsResponse({
      data: [
        null,
        { id: '' },
        {
          id: 'vendor/basic',
          pricing: { prompt: 'not-a-number' },
          supported_parameters: []
        }
      ]
    })

    expect(catalog.models).toHaveLength(1)
    expect(catalog.models[0]).toMatchObject({
      id: 'vendor/basic',
      contextWindow: null,
      maxOutputTokens: null,
      capabilities: [],
      pricing: {
        inputPerMillionUsd: null,
        outputPerMillionUsd: null
      }
    })
  })

  it('intersects catalogue capabilities with ZDR endpoint support', () => {
    const catalog = parseOpenRouterModelsResponse({
      data: [
        {
          id: 'vendor/reviewer',
          architecture: { input_modalities: ['text', 'image'] },
          supported_parameters: ['tools', 'response_format', 'reasoning']
        },
        {
          id: 'vendor/non-zdr',
          supported_parameters: ['tools']
        }
      ]
    })

    expect(
      refineOpenRouterCatalogForZdrEndpoints(catalog, {
        data: [
          {
            model_id: 'vendor/reviewer',
            supported_parameters: ['tools']
          },
          {
            model_id: 'vendor/reviewer',
            supported_parameters: ['response_format']
          }
        ]
      }).models
    ).toEqual([
      expect.objectContaining({
        id: 'vendor/reviewer',
        capabilities: ['tools', 'structured-output', 'json-output', 'vision']
      })
    ])
  })
})
