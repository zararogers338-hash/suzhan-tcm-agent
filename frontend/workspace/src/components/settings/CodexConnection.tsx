import { Show, createMemo, createSignal, type Component } from "solid-js"
import { Button } from "@synsci/ui/button"
import { useDialog } from "@synsci/ui/context/dialog"
import { confirmDialog } from "@/atlas/dialogs"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useProviders } from "@/hooks/use-providers"
import { credentialChange } from "./credential-change"
import { ProviderLogo } from "./ProviderLogo"

export const CodexConnection: Component<{
  onError?: (message: string | undefined) => void
  onConnected?: () => void
}> = (props) => {
  const sdk = useGlobalSDK()
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const platform = usePlatform()
  const providers = useProviders()
  const dialog = useDialog()
  const [busy, setBusy] = createSignal(false)
  const text = (zh: string, en: string) => language.locale() === "zh" ? zh : en
  const connected = createMemo(() => providers.connected().some((provider) => provider.id === "openai-codex"))

  const connect = async () => {
    if (busy()) return
    setBusy(true)
    props.onError?.(undefined)
    // The sign-in only shows up once the catalog is re-read; waiting on the
    // event stream to say so is how a completed sign-in looked like a failed
    // one. The re-read can fail on its own though, and that is not the sign-in
    // failing — credentialChange keeps the two outcomes apart.
    const outcome = await credentialChange({
      write: async () => {
        const result = await sdk.client.provider.oauth.authorize({ providerID: "openai-codex", method: 0 })
        if (result.data?.url) platform.openLink(result.data.url)
        await sdk.client.provider.oauth.callback({ providerID: "openai-codex", method: 0 })
      },
      refresh: () => globalSync.refreshProviders(),
      done: text("已使用 ChatGPT 登录", "Signed in with ChatGPT"),
    })
    setBusy(false)
    props.onError?.(outcome.notice)
    if (outcome.ok) props.onConnected?.()
  }

  const disconnect = async () => {
    const confirmed = await confirmDialog(dialog, {
      title: text("断开 ChatGPT / Codex？", "Disconnect ChatGPT / Codex?"),
      message: text("这会移除此设备上的登录信息。你可以随时重新登录。", "This removes the saved sign-in from this machine. You can sign in again at any time."),
      confirmLabel: text("断开连接", "Disconnect"),
      danger: true,
    })
    if (!confirmed) return
    setBusy(true)
    props.onError?.(undefined)
    const outcome = await credentialChange({
      write: async () => {
        await sdk.client.auth.remove({ providerID: "openai-codex" })
        await sdk.client.global.dispose()
      },
      refresh: () => globalSync.refreshProviders(),
      done: text("已断开连接", "Disconnected"),
    })
    setBusy(false)
    props.onError?.(outcome.notice)
  }

  return (
    <div class="models-connection-card">
      <div class="settings-row models-compact-row models-connection-row">
        <div class="models-connection-identity">
          <span class="settings-row-logo" aria-hidden="true">
            <ProviderLogo id="openai-codex" label="OpenAI" size="small" />
          </span>
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-14-medium text-text-strong">ChatGPT / Codex</span>
            <span class="text-12-regular text-text-weak">{text("使用 ChatGPT 方案包含的模型。", "Use models included with your ChatGPT plan.")}</span>
          </div>
        </div>
        <Show
          when={!connected()}
          fallback={
            <div class="models-connection-actions">
              <span class="settings-row-status">{text("已连接", "Connected")}</span>
              <Button
                class="settings-panel-action settings-panel-action--quiet models-secondary-action"
                size="small"
                variant="secondary"
                disabled={busy()}
                onClick={() => void disconnect()}
              >
                {text("断开", "Disconnect")}
              </Button>
            </div>
          }
        >
          <span class="models-row-action">
            <Button
              class="settings-panel-action models-primary-action"
              type="button"
              size="small"
              variant="primary"
              disabled={busy()}
              onClick={() => void connect()}
            >
              {busy() ? text("等待 ChatGPT…", "Waiting for ChatGPT…") : text("登录", "Sign in")}
            </Button>
          </span>
        </Show>
      </div>
    </div>
  )
}
