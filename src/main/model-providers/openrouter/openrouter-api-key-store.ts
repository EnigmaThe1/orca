import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { hardenExistingSecureFile, writeSecureFile } from '../../../shared/secure-file'
import { getSecretStore } from '../../../shared/secret-store'

const OPENROUTER_API_KEY_FILE = 'openrouter-api-key.enc'
const OPENROUTER_API_KEY_PREFIX = 'orca-openrouter-api-key:v1:'
let cachedApiKey: string | null = null

function keyPath(): string {
  return join(homedir(), '.orca', OPENROUTER_API_KEY_FILE)
}

export function hasStoredOpenRouterApiKey(): boolean {
  const path = keyPath()
  if (!existsSync(path)) {
    return false
  }
  try {
    hardenExistingSecureFile(path)
  } catch (error) {
    console.warn('[openrouter] failed to harden API key file while checking status', error)
  }
  return true
}

export function saveOpenRouterApiKey(value: string): void {
  const apiKey = value.trim()
  if (!apiKey) {
    throw new Error('OpenRouter API key is required')
  }

  const secrets = getSecretStore()
  if (!secrets.isEncryptionAvailable()) {
    throw new Error(
      secrets.describeProtectionGap() ??
        'OpenRouter API key cannot be stored because secret encryption is unavailable'
    )
  }

  const encrypted = secrets.encryptString(apiKey)
  writeSecureFile(keyPath(), `${OPENROUTER_API_KEY_PREFIX}${encrypted.toString('base64')}`)
  cachedApiKey = apiKey
}

export function readStoredOpenRouterApiKey(): string | null {
  if (cachedApiKey !== null) {
    return cachedApiKey
  }

  const path = keyPath()
  if (!existsSync(path)) {
    return null
  }

  try {
    hardenExistingSecureFile(path)
  } catch (error) {
    console.warn('[openrouter] failed to harden API key file while reading', error)
  }

  const raw = readFileSync(path, 'utf8')
  if (!raw.startsWith(OPENROUTER_API_KEY_PREFIX)) {
    throw new Error('OpenRouter API key could not be decrypted')
  }

  try {
    const encrypted = Buffer.from(raw.slice(OPENROUTER_API_KEY_PREFIX.length), 'base64')
    cachedApiKey = getSecretStore().decryptString(encrypted)
    return cachedApiKey
  } catch (error) {
    console.error('[openrouter] failed to decrypt API key', error)
    throw new Error('OpenRouter API key could not be decrypted')
  }
}

export function resolveOpenRouterApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const environmentKey = env.OPENROUTER_API_KEY?.trim()
  return environmentKey || readStoredOpenRouterApiKey()
}

export function clearOpenRouterApiKey(): void {
  cachedApiKey = null
  rmSync(keyPath(), { force: true })
}
