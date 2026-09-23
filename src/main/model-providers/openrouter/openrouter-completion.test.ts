import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL_DATA_POLICY } from '../../../shared/model-generation-types'
import {
  buildOpenRouterCompletionBody,
  parseOpenRouterCompletionResponse
} from './openrouter-completion'

describe('OpenRouter completion translation', () => {
  it('builds a tool-capable request with ordered fallbacks and structured output', () => {
    expect(
      buildOpenRouterCompletionBody({
        model: 'primary/model',
        fallbackModels: ['fallback/one', 'fallback/two'],
        messages: [
          { role: 'system', content: 'You are a coding agent.' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                name: 'read_file',
                argumentsJson: '{"path":"src/a.ts"}'
              }
            ]
          },
          {
            role: 'tool',
            toolCallId: 'call-1',
            content: '{"content":"export const x = 1"}'
          }
        ],
        tools: [
          {
            name: 'read_file',
            description: 'Read a repository file',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path']
            }
          }
        ],
        structuredOutput: {
          name: 'result',
          schema: {
            type: 'object',
            properties: { status: { type: 'string' } },
            required: ['status']
          }
        },
        maxOutputTokens: 4096,
        reasoningEffort: 'high'
      })
    ).toEqual({
      models: ['primary/model', 'fallback/one', 'fallback/two'],
      messages: [
        { role: 'system', content: 'You are a coding agent.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: '{"path":"src/a.ts"}'
              }
            }
          ]
        },
        {
          role: 'tool',
          content: '{"content":"export const x = 1"}',
          tool_call_id: 'call-1'
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read a repository file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path']
            }
          }
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'result',
          strict: true,
          schema: {
            type: 'object',
            properties: { status: { type: 'string' } },
            required: ['status']
          }
        }
      },
      max_tokens: 4096,
      reasoning: { effort: 'high' },
      provider: {
        require_parameters: true
      }
    })
  })

  it('requires an endpoint that supports structured-output parameters', () => {
    expect(
      buildOpenRouterCompletionBody({
        model: 'vendor/reviewer',
        messages: [{ role: 'user', content: 'Verify.' }],
        structuredOutput: {
          name: 'verification',
          schema: {
            type: 'object',
            properties: { passed: { type: 'boolean' } },
            required: ['passed']
          }
        }
      })
    ).toMatchObject({
      provider: {
        require_parameters: true
      }
    })
  })

  it('caps ordered model fallback requests to three total OpenRouter models', () => {
    expect(
      buildOpenRouterCompletionBody({
        model: 'primary/model',
        fallbackModels: ['fallback/one', 'fallback/two', 'fallback/three', 'fallback/four'],
        messages: [{ role: 'user', content: 'Fix it.' }]
      })
    ).toMatchObject({
      models: ['primary/model', 'fallback/one', 'fallback/two']
    })
  })

  it('maps the reusable data-retention policy into OpenRouter provider routing controls', () => {
    expect(
      buildOpenRouterCompletionBody({
        model: 'vendor/coder',
        messages: [{ role: 'user', content: 'Inspect the repository.' }],
        dataPolicy: DEFAULT_MODEL_DATA_POLICY
      })
    ).toMatchObject({
      provider: {
        data_collection: 'deny',
        zdr: true,
        allow_fallbacks: true
      }
    })
    expect(
      buildOpenRouterCompletionBody({
        model: 'vendor/coder',
        messages: [{ role: 'user', content: 'Inspect the repository.' }],
        dataPolicy: {
          dataCollection: 'deny',
          zeroDataRetention: true,
          allowProviderFallbacks: false,
          providerAllowlist: ['provider-a'],
          providerDenylist: ['provider-b']
        }
      })
    ).toMatchObject({
      provider: {
        data_collection: 'deny',
        zdr: true,
        allow_fallbacks: false,
        only: ['provider-a'],
        ignore: ['provider-b']
      }
    })
  })

  it('parses text, tool calls, actual routed model and usage', () => {
    expect(
      parseOpenRouterCompletionResponse(
        {
          model: 'routed/model',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: 'I need to inspect the file.',
                tool_calls: [
                  {
                    id: 'call-2',
                    type: 'function',
                    function: {
                      name: 'read_file',
                      arguments: '{"path":"src/b.ts"}'
                    }
                  }
                ]
              }
            }
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30,
            total_tokens: 150
          }
        },
        'primary/model'
      )
    ).toEqual({
      model: 'routed/model',
      text: 'I need to inspect the file.',
      toolCalls: [
        {
          id: 'call-2',
          name: 'read_file',
          argumentsJson: '{"path":"src/b.ts"}'
        }
      ],
      finishReason: 'tool_calls',
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150
      }
    })
  })
})
