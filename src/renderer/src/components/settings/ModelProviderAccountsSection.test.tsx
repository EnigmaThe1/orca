// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  diagnose: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) => {
    let result = fallback
    for (const [key, value] of Object.entries(values ?? {})) {
      result = result.replace(`{{${key}}}`, String(value))
    }
    return result
  }
}))

vi.mock('./SearchableSetting', () => ({
  SearchableSetting: ({
    children,
    title
  }: {
    children: React.ReactNode
    title: string
  }): React.JSX.Element => (
    <div>
      <h4>{title}</h4>
      {children}
    </div>
  )
}))

import { ModelProviderAccountsSection } from './ModelProviderAccountsSection'

describe('ModelProviderAccountsSection', () => {
  beforeEach(() => {
    mocks.getStatus.mockResolvedValue({
      providerId: 'openrouter',
      configured: false,
      storedApiKeyConfigured: false,
      environmentApiKeyConfigured: false
    })
    mocks.saveApiKey.mockResolvedValue({
      providerId: 'openrouter',
      configured: true,
      storedApiKeyConfigured: true,
      environmentApiKeyConfigured: false
    })
    mocks.clearApiKey.mockResolvedValue({
      providerId: 'openrouter',
      configured: false,
      storedApiKeyConfigured: false,
      environmentApiKeyConfigured: false
    })
    mocks.diagnose.mockResolvedValue({
      providerId: 'openrouter',
      configured: true,
      storedApiKeyConfigured: true,
      environmentApiKeyConfigured: false,
      catalogReachable: true,
      modelCount: 12,
      toolsCapableModelCount: 8,
      structuredOutputModelCount: 5,
      error: null
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { modelProviders: mocks }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('saves the key through the host API and never renders the credential', async () => {
    render(<ModelProviderAccountsSection />)

    expect(await screen.findByText('Not configured')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('OpenRouter API key'), {
      target: { value: 'or-test-secret' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocks.saveApiKey).toHaveBeenCalledWith('openrouter', 'or-test-secret')
    })
    expect(screen.queryByDisplayValue('or-test-secret')).not.toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('shows catalogue diagnostics without leaking credentials', async () => {
    mocks.getStatus.mockResolvedValue({
      providerId: 'openrouter',
      configured: true,
      storedApiKeyConfigured: true,
      environmentApiKeyConfigured: false
    })
    render(<ModelProviderAccountsSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Run diagnostic' }))

    expect(
      await screen.findByText('12 models · 8 tool-capable · 5 structured-output')
    ).toBeInTheDocument()
    expect(screen.queryByText(/or-test/)).not.toBeInTheDocument()
  })
})
