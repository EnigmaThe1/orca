import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as OpenRouterKeyStore from './openrouter-api-key-store'

const existsSyncMock = vi.fn()
const readFileSyncMock = vi.fn()
const rmSyncMock = vi.fn()
const hardenExistingSecureFileMock = vi.fn()
const writeSecureFileMock = vi.fn<(path: string, content: string | Buffer) => void>()
const encryptStringMock = vi.fn((value: string) => Buffer.from(`sealed:${value}`))
const decryptStringMock = vi.fn((value: Buffer) => value.toString('utf8').replace(/^sealed:/, ''))
const encryptionAvailableMock = vi.fn(() => true)
const protectionGapMock = vi.fn<() => string | null>(() => null)

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  rmSync: rmSyncMock
}))

vi.mock('node:os', () => ({
  homedir: () => '/home/test'
}))

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/')
}))

vi.mock('../../../shared/secure-file', () => ({
  hardenExistingSecureFile: hardenExistingSecureFileMock,
  writeSecureFile: writeSecureFileMock
}))

vi.mock('../../../shared/secret-store', () => ({
  getSecretStore: () => ({
    isEncryptionAvailable: encryptionAvailableMock,
    encryptString: encryptStringMock,
    decryptString: decryptStringMock,
    describeProtectionGap: protectionGapMock
  })
}))

async function loadStore(): Promise<typeof OpenRouterKeyStore> {
  return await import('./openrouter-api-key-store')
}

describe('openrouter-api-key-store', () => {
  beforeEach(() => {
    existsSyncMock.mockReset()
    readFileSyncMock.mockReset()
    rmSyncMock.mockReset()
    hardenExistingSecureFileMock.mockReset()
    writeSecureFileMock.mockReset()
    encryptStringMock.mockReset()
    decryptStringMock.mockReset()
    encryptionAvailableMock.mockReset()
    protectionGapMock.mockReset()
    encryptStringMock.mockImplementation((value: string) => Buffer.from(`sealed:${value}`))
    decryptStringMock.mockImplementation((value: Buffer) =>
      value.toString('utf8').replace(/^sealed:/, '')
    )
    encryptionAvailableMock.mockReturnValue(true)
    protectionGapMock.mockReturnValue(null)
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('stores only encrypted key material', async () => {
    const store = await loadStore()
    store.saveOpenRouterApiKey(' or-test-secret ')

    expect(writeSecureFileMock).toHaveBeenCalledWith(
      '/home/test/.orca/openrouter-api-key.enc',
      expect.stringMatching(/^orca-openrouter-api-key:v1:/)
    )
    const firstWrite = writeSecureFileMock.mock.calls[0]
    expect(firstWrite).toBeDefined()
    const stored = String(firstWrite?.[1])
    expect(stored).not.toContain('or-test-secret')
  })

  it('refuses persisted credentials when encryption is unavailable', async () => {
    encryptionAvailableMock.mockReturnValue(false)
    protectionGapMock.mockReturnValue('keychain unavailable')
    const store = await loadStore()

    expect(() => store.saveOpenRouterApiKey('or-test-secret')).toThrow('keychain unavailable')
    expect(writeSecureFileMock).not.toHaveBeenCalled()
  })

  it('prefers an environment key without touching persisted storage', async () => {
    const store = await loadStore()

    expect(store.resolveOpenRouterApiKey({ OPENROUTER_API_KEY: ' env-key ' })).toBe('env-key')
    expect(readFileSyncMock).not.toHaveBeenCalled()
  })

  it('reads and decrypts the persisted key when no environment key exists', async () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(
      `orca-openrouter-api-key:v1:${Buffer.from('sealed:disk-key').toString('base64')}`
    )
    const store = await loadStore()

    expect(store.resolveOpenRouterApiKey({})).toBe('disk-key')
    expect(hardenExistingSecureFileMock).toHaveBeenCalledWith(
      '/home/test/.orca/openrouter-api-key.enc'
    )
  })
})
