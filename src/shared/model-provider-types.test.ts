import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL_DATA_POLICY } from './model-generation-types'
import { modelSatisfiesCapabilities } from './model-provider-types'

describe('model provider contracts', () => {
  it('requires every allOf capability and at least one anyOf capability', () => {
    expect(
      modelSatisfiesCapabilities(
        { capabilities: ['tools', 'structured-output', 'vision'] },
        { allOf: ['tools'], anyOf: ['reasoning', 'vision'] }
      )
    ).toBe(true)
    expect(
      modelSatisfiesCapabilities(
        { capabilities: ['tools'] },
        { allOf: ['tools'], anyOf: ['reasoning', 'vision'] }
      )
    ).toBe(false)
  })

  it('keeps the reusable default data policy privacy-first', () => {
    expect(DEFAULT_MODEL_DATA_POLICY).toEqual({
      dataCollection: 'deny',
      zeroDataRetention: true,
      allowProviderFallbacks: true
    })
  })
})
