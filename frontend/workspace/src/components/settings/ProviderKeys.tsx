import { For, Show, createMemo, createSignal } from "solid-js"
import { Button } from "@synsci/ui/button"
import { useDialog } from "@synsci/ui/context/dialog"
import { Select } from "@synsci/ui/select"
import type { Provider } from "@synsci/sdk/v2/client"
import { confirmDialog } from "@/atlas/dialogs"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { MODEL_PROVIDERS, MODEL_PROVIDER_LABELS, modelProvider } from "./model-providers"
import { ProviderLogo } from "./ProviderLogo"
import { Icon } from "@synsci/ui/icon"

/**
 * `note` says where a key that this panel cannot delete actually lives, so the
 * reader knows where to go and change it. Every non-removable source used to
 * render one blanket "external", which is wrong for a key the user
 * set themselves in a .env or a config file — nobody else manages it, and the
 * phrase suggests an administrator does.
 */
type ProviderSource = Provider["source"] | "managed"

const SOURCES: Record<ProviderSource, { label: string; removable: boolean; title: string; note?: string }> = {
  api: {
    label: "local file",
    removable: true,
    title: "API key stored in the owner-only OpenScience auth file, not the system keychain",
  },
  env: {
    label: "environment",
    removable: false,
    note: "set in your .env or shell",
    title: "API key supplied by an environment variable; remove it where it is defined",
  },
  config: {
    label: "config",
    removable: false,
    note: "set in openscience.json",
    title: "API key supplied by openscience.json; edit that file to remove it",
  },
  custom: {
    label: "custom",
    removable: false,
    note: "set in openscience.json",
    title: "Custom provider supplied by openscience.json; edit that file to remove it",
  },
  workspace: {
    label: "workspace",
    removable: false,
    note: "synced from your workspace on app.syntheticsciences.ai",
    title: "API key synced from your signed-in workspace; manage it on the dashboard",
  },
  managed: {
    label: "Ace",
    removable: false,
    note: "managed through your Ace account",
    title: "Ace model access; manage it in the Ace section above",
  },
}

export function ProviderKeys(props: { onError?: (error: string | undefined) => void }) {
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()
  const language = useLanguage()
  const providers = useProviders()
  const dialog = useDialog()
  const [provider, setProvider] = createSignal<string>(MODEL_PROVIDERS[0].id)
  const [key, setKey] = createSignal("")
  const [adding, setAdding] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const text = (zh: string, en: string) => language.locale() === "zh" ? zh : en
  const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))
  const connected = createMemo(() =>
    providers
      .connected()
      .filter((item) => item.source !== "managed" && MODEL_PROVIDERS.some((provider) => provider.id === item.id)),
  )
  const source = (item: { id: string; source?: ProviderSource }) => SOURCES[item.source ?? "api"]
  const refreshAfterSave = (done: string) => {
    void sync
      .refreshProviders()
      .catch((error) =>
        props.onError?.(
          `${done}, but the model list could not be reloaded (${reason(error)}). It will catch up on the next refresh.`,
        ),
      )
  }
  const save = async () => {
    const value = key().trim()
    if (!value || saving()) return
    // An Ace key is a Wallet credential, not a provider key: say where it goes
    // instead of letting the server's refusal explain it.
    if (/^(?:osk_|thk_|thk-)/.test(value)) {
      props.onError?.(
        text("这是 Ace API 密钥。请在“模型访问 → 使用 API 密钥”中添加，它会选择计费的钱包。", "That is an Ace API key. Add it under Model access → Use an API key; it selects the Wallet it is billed to."),
      )
      return
    }
    setSaving(true)
    props.onError?.(undefined)
    try {
      await sdk.client.auth.set({ providerID: provider(), auth: { type: "api", key: value } })
      setKey("")
      setAdding(false)
      // The credential is on disk now. Re-enable the form before rebuilding
      // the large provider catalog; auth.set already invalidates the server's
      // provider map, so disposing every workspace here only added latency.
      setSaving(false)
      refreshAfterSave(text("密钥已保存", "Key saved"))
    } catch (error) {
      props.onError?.(reason(error))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (providerID: string) => {
    if (saving()) return
    const label = MODEL_PROVIDER_LABELS[providerID] ?? providerID
    const confirmed = await confirmDialog(dialog, {
          title: text(`移除 ${label} 密钥？`, `Remove ${label} key?`),
          message: text("这会移除此设备上保存的 API 密钥，不会影响其他来源的服务商访问。", "This removes the saved API key from this machine. Provider access through other sources is not changed."),
      confirmLabel: text("移除密钥", "Remove key"),
      danger: true,
    })
    if (!confirmed) return
    setSaving(true)
    props.onError?.(undefined)
    try {
      await sdk.client.auth.remove({ providerID })
      setSaving(false)
      refreshAfterSave(text("密钥已移除", "Key removed"))
    } catch (error) {
      props.onError?.(reason(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="models-provider-keys">
      <div class="settings-row models-compact-row models-provider-key-heading">
        <div class="models-provider-identity">
          <span class="settings-row-logo" aria-hidden="true">
            <Icon name="providers" size="small" />
          </span>
          <div class="models-provider-copy">
          <span class="text-14-medium text-text-strong">{text("服务商 API 密钥", "Provider API keys")}</span>
          <span class="text-12-regular text-text-weak">{text("保存在仅限所有者访问的本地凭据文件中。", "Stored in the owner-only local auth file.")}</span>
          </div>
        </div>
        <span class="models-row-action">
          <Button
            class="settings-panel-action models-secondary-action"
            type="button"
            size="small"
            variant="secondary"
            aria-expanded={adding()}
            aria-controls="models-add-provider-key"
            disabled={saving()}
            onClick={() => {
              if (adding()) setKey("")
              setAdding((open) => !open)
            }}
          >
            {adding() ? text("取消", "Cancel") : text("添加密钥", "Add key")}
          </Button>
        </span>
      </div>

      <Show when={adding()}>
        <form
          id="models-add-provider-key"
          class="settings-provider-key-form models-provider-key-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label class="models-key-field">
            <span class="text-12-medium text-text-weak">{text("服务商", "Provider")}</span>
            <div class="models-provider-select">
              <Select
                aria-label={text("模型服务商", "Model provider")}
                class="models-provider-options"
                options={[...MODEL_PROVIDERS]}
                current={modelProvider(provider())}
                value={(item) => item.id}
                label={(item) => item.label}
                disabled={saving()}
                onSelect={(item) => item && setProvider(item.id)}
                variant="secondary"
                size="small"
                triggerVariant="settings"
                triggerStyle={{
                  width: "100%",
                  "justify-content": "space-between",
                }}
              />
            </div>
          </label>
          <label class="models-key-field">
            <span class="text-12-medium text-text-weak">{text("API 密钥", "API key")}</span>
            <input
              type="password"
              autocomplete="off"
              spellcheck={false}
              disabled={saving()}
              value={key()}
              onInput={(event) => setKey(event.currentTarget.value)}
              placeholder={modelProvider(provider()).placeholder}
              class="settings-field settings-provider-key models-key-input"
            />
          </label>
          <Button
            class="settings-panel-action models-primary-action models-save-key"
            type="submit"
            size="small"
            variant="primary"
            disabled={saving() || !key().trim()}
          >
            {saving() ? text("保存中…", "Saving…") : text("保存密钥", "Save key")}
          </Button>
        </form>
      </Show>

      <Show when={connected().length > 0}>
        <div class="models-connected-providers">
          <For each={connected()}>
            {(item) => (
              <div class="settings-row models-compact-row models-provider-row">
                <div class="models-provider-identity min-w-0 flex-1 basis-[220px]">
                  <span class="settings-row-logo" aria-hidden="true">
                    <ProviderLogo id={item.id} label={MODEL_PROVIDER_LABELS[item.id] ?? item.id} size="small" />
                  </span>
                  <div class="models-provider-copy">
                    <span class="truncate text-14-medium text-text-strong">
                      {MODEL_PROVIDER_LABELS[item.id] ?? item.id}
                    </span>
                    <div class="models-provider-meta">
                      <span class="models-provider-source" title={source(item).title}>
                      {text(source(item).label === "local file" ? "本地文件" : source(item).label, source(item).label)}
                      </span>
                    </div>
                  </div>
                </div>
                <span class="settings-row-status">{text("可用", "Available")}</span>
                <Show
                  when={source(item).removable}
                  fallback={
                    <span class="models-provider-note text-12-regular text-text-weak" title={source(item).title}>
                      {source(item).note === "set in openscience.json"
                        ? text("由 openscience.json 设置", "set in openscience.json")
                        : source(item).note === "set in your .env or shell"
                          ? text("由 .env 或终端设置", "set in your .env or shell")
                          : text("由外部配置", source(item).note ?? "configured externally")}
                    </span>
                  }
                >
                  <span class="models-row-action">
                    <Button
                      class="settings-panel-action settings-panel-action--quiet models-secondary-action"
                      size="small"
                      variant="secondary"
                      disabled={saving()}
                      onClick={() => void remove(item.id)}
                    >
                      {text("移除", "Remove")}
                    </Button>
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={connected().length === 0 && !adding()}>
        <p class="models-provider-empty" role="status">
          {text("尚未连接服务商 API 密钥。", "No provider API keys connected.")}
        </p>
      </Show>
    </div>
  )
}
