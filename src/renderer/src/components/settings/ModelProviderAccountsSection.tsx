import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Lock, LockOpen, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type {
  ModelProviderDiagnostic,
  ModelProviderSettingsStatus
} from '../../../../shared/model-provider-settings-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'

function statusLabel(status: ModelProviderSettingsStatus | null): string {
  if (!status?.configured) {
    return translate(
      'auto.components.settings.ModelProviderAccountsSection.notConfigured',
      'Not configured'
    )
  }
  if (status.environmentApiKeyConfigured) {
    return translate(
      'auto.components.settings.ModelProviderAccountsSection.environment',
      'Environment'
    )
  }
  return translate('auto.components.settings.ModelProviderAccountsSection.saved', 'Saved')
}

export function ModelProviderAccountsSection(): React.JSX.Element {
  const [status, setStatus] = useState<ModelProviderSettingsStatus | null>(null)
  const [diagnostic, setDiagnostic] = useState<ModelProviderDiagnostic | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await window.api.modelProviders.getStatus('openrouter'))
    } catch (error) {
      console.error('Failed to load model provider status:', error)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const save = async (): Promise<void> => {
    const apiKey = draft.trim()
    if (!apiKey) {
      toast.error(
        translate(
          'auto.components.settings.ModelProviderAccountsSection.keyRequired',
          'OpenRouter API key is required.'
        )
      )
      return
    }
    setBusy(true)
    try {
      setStatus(await window.api.modelProviders.saveApiKey('openrouter', apiKey))
      setDraft('')
      setDiagnostic(null)
      toast.success(
        translate(
          'auto.components.settings.ModelProviderAccountsSection.keySaved',
          'OpenRouter API key saved.'
        )
      )
    } catch (error) {
      toast.error(
        translate(
          'auto.components.settings.ModelProviderAccountsSection.keySaveFailed',
          'OpenRouter API key update failed.'
        ),
        { description: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      setStatus(await window.api.modelProviders.clearApiKey('openrouter'))
      setDraft('')
      setDiagnostic(null)
    } catch (error) {
      toast.error(
        translate(
          'auto.components.settings.ModelProviderAccountsSection.keyClearFailed',
          'Could not forget the OpenRouter API key.'
        ),
        { description: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setBusy(false)
    }
  }

  const diagnose = async (): Promise<void> => {
    setDiagnosing(true)
    try {
      const result = await window.api.modelProviders.diagnose('openrouter')
      setDiagnostic(result)
      setStatus(result)
      if (!result.catalogReachable) {
        toast.error(
          translate(
            'auto.components.settings.ModelProviderAccountsSection.diagnosticFailed',
            'OpenRouter diagnostic failed.'
          ),
          { description: result.error ?? undefined }
        )
      }
    } catch (error) {
      toast.error(
        translate(
          'auto.components.settings.ModelProviderAccountsSection.diagnosticFailed',
          'OpenRouter diagnostic failed.'
        ),
        { description: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setDiagnosing(false)
    }
  }

  return (
    <section id="accounts-openrouter" className="space-y-4 scroll-mt-6">
      <div>
        <h3 className="text-sm font-medium">
          {translate('auto.components.settings.ModelProviderAccountsSection.heading', 'OpenRouter')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.ModelProviderAccountsSection.description',
            'Configure OpenRouter model discovery and inference. The API key stays in Orca’s encrypted host secret store.'
          )}
        </p>
      </div>

      <SearchableSetting
        title={translate(
          'auto.components.settings.ModelProviderAccountsSection.heading',
          'OpenRouter'
        )}
        description={translate(
          'auto.components.settings.ModelProviderAccountsSection.openRouterDescription',
          'Discover models and run completions through OpenRouter without exposing the API key to renderer state.'
        )}
        keywords={['openrouter', 'model provider', 'api key', 'inference']}
        className="space-y-3"
      >
        <div className="flex items-center gap-2">
          <Badge variant={status?.configured ? 'secondary' : 'outline'}>
            {status?.configured ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
            {statusLabel(status)}
          </Badge>
          {diagnostic?.catalogReachable ? (
            <Badge variant="outline">
              <CheckCircle2 className="size-3" />
              {translate(
                'auto.components.settings.ModelProviderAccountsSection.catalogReachable',
                'Catalogue reachable'
              )}
            </Badge>
          ) : null}
        </div>

        <div className="flex gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="openrouter-api-key">
              {translate(
                'auto.components.settings.ModelProviderAccountsSection.apiKey',
                'OpenRouter API key'
              )}
            </Label>
            <Input
              id="openrouter-api-key"
              type="password"
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={translate(
                'auto.components.settings.ModelProviderAccountsSection.apiKeyPlaceholder',
                'Paste your OpenRouter API key'
              )}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" disabled={busy || !draft.trim()} onClick={() => void save()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {status?.storedApiKeyConfigured
                ? translate(
                    'auto.components.settings.ModelProviderAccountsSection.replace',
                    'Replace'
                  )
                : translate('auto.components.settings.ModelProviderAccountsSection.save', 'Save')}
            </Button>
            {status?.storedApiKeyConfigured ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void clear()}>
                {translate(
                  'auto.components.settings.ModelProviderAccountsSection.forget',
                  'Forget key'
                )}
              </Button>
            ) : null}
          </div>
        </div>

        {status?.environmentApiKeyConfigured ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ModelProviderAccountsSection.environmentHint',
              'OPENROUTER_API_KEY is active for this Orca process and takes priority over the stored key.'
            )}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ModelProviderAccountsSection.storageHint',
              'The saved key is encrypted by Orca’s host secret store and is never written to repository state.'
            )}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={diagnosing} onClick={() => void diagnose()}>
            {diagnosing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {translate(
              'auto.components.settings.ModelProviderAccountsSection.diagnose',
              'Run diagnostic'
            )}
          </Button>
          {diagnostic?.catalogReachable ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.ModelProviderAccountsSection.diagnosticSummary',
                '{{value0}} models · {{value1}} tool-capable · {{value2}} structured-output',
                {
                  value0: diagnostic.modelCount,
                  value1: diagnostic.toolsCapableModelCount,
                  value2: diagnostic.structuredOutputModelCount
                }
              )}
            </p>
          ) : null}
        </div>
      </SearchableSetting>
    </section>
  )
}
