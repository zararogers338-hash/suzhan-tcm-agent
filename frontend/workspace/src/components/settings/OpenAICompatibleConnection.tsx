import { For, Show, createEffect, createResource, createSignal, type Component } from "solid-js"
import { Button } from "@synsci/ui/button"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { settingsApi } from "./api"
import { steady } from "./_shared"

type ConfiguredConnection = {
  id: string
  name: string
  baseURL: string
  models: string[]
  runtime?: string
}

type Props = {
  onError?: (message: string | undefined) => void
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

function connectionId(url: string, model: string) {
  let host = "provider"
  try {
    host = new URL(url).hostname || host
  } catch {
    // URL validation below produces the user-facing message. Keep the id
    // deterministic even while the form is being edited.
  }
  const slug = `${host}-${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
  return `tcm-${slug || "provider"}`
}

function connectionName(url: string, model: string) {
  try {
    return `${new URL(url).hostname} · ${model}`
  } catch {
    return model
  }
}

/**
 * A small, provider-neutral connection editor for the native Models screen.
 * It intentionally coexists with ProviderKeys: the latter is for named
 * provider credentials, while this card handles any OpenAI-compatible URL.
 */
export const OpenAICompatibleConnection: Component<Props> = (props) => {
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()
  const language = useLanguage()
  const platform = usePlatform()
  const fetchFn = platform.fetch ?? fetch
  const call = <T,>(path: string, init?: RequestInit) =>
    settingsApi<T>(sdk.url, fetchFn, `/settings/local${path}`, init)

  const [configured, configuredActions] = steady(
    createResource(() => call<{ providers: ConfiguredConnection[] }>("").then((result) => result.providers)),
  )
  const [url, setUrl] = createSignal("https://api.deepseek.com/v1")
  const [key, setKey] = createSignal("")
  const [model, setModel] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [notice, setNotice] = createSignal<string>()
  const text = (zh: string, en: string) => language.locale() === "zh" ? zh : en

  const activeValue = () => sync.data.config.model ?? ""
  const isActive = (provider: ConfiguredConnection) =>
    provider.models.some((candidate) => `${provider.id}/${candidate}` === activeValue())

  // Fill the editor from the current connection when opening Settings. Do not
  // copy credentials: keys remain write-only and are retained server-side when
  // the field is left empty on a subsequent save.
  createEffect(() => {
    const providers = configured()
    if (!providers?.length || url() !== "https://api.deepseek.com/v1" || model()) return
    const current = providers.find(isActive)
    if (current) {
      setUrl(current.baseURL)
      setModel(current.models[0] ?? "")
    }
  })

  const useSaved = async (provider: ConfiguredConnection) => {
    const candidate = provider.models[0]
    if (!candidate || saving()) return
    setSaving(true)
    props.onError?.(undefined)
    setNotice(undefined)
    try {
      await settingsApi(sdk.url, fetchFn, "/global/config", {
        method: "PATCH",
        body: JSON.stringify({ model: `${provider.id}/${candidate}`, small_model: `${provider.id}/${candidate}` }),
      })
      await sync.refreshProviders()
      setUrl(provider.baseURL)
      setModel(candidate)
      setKey("")
      setNotice(text(`已切换到 ${provider.name}。`, `Switched to ${provider.name}.`))
    } catch (error) {
      props.onError?.(reason(error))
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (saving()) return
    const baseURL = url().trim()
    const modelID = model().trim()
    if (!baseURL || !modelID) {
      props.onError?.(text("请填写 API 地址和模型名称。", "Enter an API URL and model ID."))
      return
    }
    try {
      const parsed = new URL(baseURL)
      if (!/^https?:$/.test(parsed.protocol)) throw new Error(text("API 地址必须以 http:// 或 https:// 开头。", "API URL must start with http:// or https://."))
    } catch (error) {
      props.onError?.(error instanceof Error ? error.message : text("请输入有效的 API 地址。", "Enter a valid API URL."))
      return
    }
    setSaving(true)
    props.onError?.(undefined)
    setNotice(undefined)
    try {
      const probe = await call<{ baseURL: string; models: string[]; error?: string }>("/models", {
        method: "POST",
        body: JSON.stringify({ url: baseURL, key: key().trim() || undefined }),
      }).catch(() => ({ baseURL, models: [] as string[] }))
      if (probe.models.length > 0 && !probe.models.includes(modelID)) {
        setNotice(text(`服务端模型列表未包含 ${modelID}，仍按你填写的模型名保存；首次调用时会再次核对。`, `The endpoint did not list ${modelID}; it will still be saved and checked on first use.`))
      } else if (probe.models.length === 0) {
        setNotice(text("服务端暂时没有返回模型列表，仍按你填写的模型名保存；首次调用时会验证连接。", "The endpoint did not return a model list; it will still be saved and checked on first use."))
      }
      const id = connectionId(baseURL, modelID)
      await call<{ id: string; baseURL: string; models: string[] }>("", {
        method: "POST",
        body: JSON.stringify({
          url: baseURL,
          id,
          name: connectionName(baseURL, modelID),
          key: key().trim() || undefined,
          models: [modelID],
          contextLimit: 32768,
          merge: true,
          setDefault: true,
        }),
      })
      await settingsApi(sdk.url, fetchFn, "/global/config", {
        method: "PATCH",
        body: JSON.stringify({ model: `${id}/${modelID}`, small_model: `${id}/${modelID}` }),
      }).catch(() => undefined)
      setKey("")
      await sync.refreshProviders()
      await configuredActions.refetch()
    } catch (error) {
      props.onError?.(reason(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="models-openai-connection">
      <div class="settings-row models-compact-row models-openai-heading">
        <div class="models-provider-identity">
          <span class="settings-row-logo models-openai-logo" aria-hidden="true">
            ✦
          </span>
          <div class="models-provider-copy">
            <span class="text-14-medium text-text-strong">{text("OpenAI-compatible 连接", "OpenAI-compatible connection")}</span>
            <span class="text-12-regular text-text-weak">
              {text("保存 API 地址、密钥和模型名，以后直接切换。", "Save an API URL, key, and model ID once, then switch between saved connections.")}
            </span>
          </div>
        </div>
      </div>
      <form
        class="models-openai-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label class="models-key-field">
          <span class="text-12-medium text-text-weak">{text("API 地址", "API URL")}</span>
          <input
            class="settings-field models-openai-input"
            type="url"
            required
            spellcheck={false}
            value={url()}
            onInput={(event) => setUrl(event.currentTarget.value)}
            placeholder="https://your-provider.example/v1"
          />
        </label>
        <label class="models-key-field">
          <span class="text-12-medium text-text-weak">{text("API 密钥", "API key")}</span>
          <input
            class="settings-field models-openai-input"
            type="password"
            autocomplete="off"
            spellcheck={false}
            value={key()}
            onInput={(event) => setKey(event.currentTarget.value)}
            placeholder={text("仅在本地填写", "Enter locally")}
          />
        </label>
        <label class="models-key-field">
          <span class="text-12-medium text-text-weak">{text("模型名称", "Model ID")}</span>
          <input
            class="settings-field models-openai-input"
            required
            spellcheck={false}
            value={model()}
            onInput={(event) => setModel(event.currentTarget.value)}
            placeholder={text("填写服务商提供的模型 ID", "deepseek-chat")}
          />
        </label>
        <Button class="settings-panel-action models-primary-action models-openai-save" type="submit" size="small" variant="primary" disabled={saving()}>
          {saving() ? text("保存中…", "Saving…") : text("保存并切换", "Save and switch")}
        </Button>
      </form>
      <Show when={notice()}>
        {(value) => <p class="models-openai-notice text-12-regular" role="status">{value()}</p>}
      </Show>
      <Show when={configured()?.length} fallback={<p class="models-provider-empty">{text("还没有保存的 OpenAI-compatible 连接。", "No OpenAI-compatible connections saved.")}</p>}>
        <div class="models-openai-saved">
          <For each={configured()}>
            {(provider) => (
              <div class="settings-row models-compact-row models-openai-saved-row">
                <div class="models-provider-copy min-w-0">
                  <span class="truncate text-14-medium text-text-strong">{provider.name}</span>
                  <span class="models-provider-meta">{provider.baseURL} · {provider.models.join(" · ")}</span>
                </div>
                <Show when={isActive(provider)} fallback={<Button class="settings-panel-action models-secondary-action" size="small" variant="secondary" disabled={saving()} onClick={() => void useSaved(provider)}>Use</Button>}>
                  <span class="settings-row-status">{text("当前", "Current")}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
