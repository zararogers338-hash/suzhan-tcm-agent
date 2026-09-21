import { For, Show, Switch, Match, createEffect, onMount, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate } from "@solidjs/router"
import { useDialog } from "@synsci/ui/context/dialog"
import { DialogSettings } from "@/components/dialog-settings"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useServer } from "@/context/server"
import { projectHref } from "@/utils/project-route"
import { TcmMoon } from "./tcm-moon"
import { bilingual, TcmUiError, useTcmI18n, type UiText } from "./tcm-i18n"
import { Markdown } from "@synsci/ui/markdown"
import { MarkedProvider } from "@synsci/ui/context/marked"
import "./tcm-workbench.css"
import "./tcm-connection.css"

type Tab = "overview" | "search" | "documents" | "candidates" | "reports" | "operations" | "connection"
type Doc = { id: string; source_id: string; title: string; year?: number; full_text: boolean; license?: string; source_url?: string; passage_count?: number }
type Passage = { id: string; document_id: string; section: string; text: string; locator: Record<string, unknown>; content_hash: string; source_id?: string; document?: { title: string; source_url: string; full_text: boolean }; channels?: string[] }
type Evidence = { passage_id: string; quote: string; stance: string; context_match: string }
type Claim = { id: string; version: number; review_state: string; payload: { statement: string; subject: string; predicate: string; object: string; context: Record<string, unknown>; evidence: Evidence[] }; verification?: { missing_context: string[]; semantic_entailment: string } }
type Candidate = { claim_id: string; statement: string; subject: string; object: string; review_state: string; missing_context: string[]; supporting_source_families: number; contradicting_evidence: unknown[] }
type Operation = { id: string; state: string; kind: string; query?: string; created_at: string; can_cancel?: boolean; result?: { package_id?: string } }
type Package = { id: string; query: string; status: string; candidate_count: number; document_count: number; created_at: string }
type Overview = { counts: { documents: number; passages: number; indexed_passages: number; claims: number; packages: number; claims_by_review_state: Record<string, number> }; documents: Doc[]; recent_operations: Operation[]; recent_packages: Package[] }
type Page<T> = { items: T[]; total: number; has_more: boolean }
type Provider = { id: string; name: string; baseURL: string; models: string[]; active?: boolean }
const tabs: { id: Tab; title: string; icon: string; en: string }[] = [
  { id: "overview", title: "研究概览", icon: "◈", en: "OVERVIEW" },
  { id: "search", title: "证据检索", icon: "⌕", en: "EVIDENCE SEARCH" },
  { id: "documents", title: "文献资料", icon: "▤", en: "LIBRARY" },
  { id: "candidates", title: "机制候选", icon: "◇", en: "HYPOTHESES" },
  { id: "reports", title: "研究报告", icon: "☷", en: "REPORTS" },
  { id: "operations", title: "任务记录", icon: "◷", en: "ACTIVITY" },
]

export default function TcmWorkbench() {
  const { language, isChinese, t, message, status, contextLabel, time } = useTcmI18n()
  const navigate = useNavigate()
  const dialog = useDialog()
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()
  const server = useServer()
  const [state, set] = createStore({
    tab: "overview" as Tab, overview: undefined as Overview | undefined, loading: true, busy: false, error: "" as UiText, notice: "" as UiText,
    query: "", mode: "hybrid", hits: [] as Passage[], searched: false, searchCount: 0,
    docs: [] as Doc[], packages: [] as Package[], operations: [] as Operation[], candidates: [] as Candidate[],
    document: undefined as Doc | undefined, paragraphs: [] as Passage[], passageOffset: 0, moreParagraphs: false,
    selectedPassage: undefined as Passage | undefined, claim: undefined as Claim | undefined, report: "", reportId: "",
    modal: "", importIds: "", importType: "europepmc", reviewer: "", reason: "", decision: "accepted", csrf: "",
    providers: [] as Provider[], baseUrl: "https://api.deepseek.com/v1", model: "deepseek-flash", apiKey: "", modelConfigured: false,
    newProjectName: "代谢性肝病 · 铁死亡机制研究", currentOperation: "",
  })
  let alive = true
  createEffect(() => {
    if (!state.modal) return
    const previous = document.activeElement as HTMLElement | null
    queueMicrotask(() => document.querySelector<HTMLElement>(".tcm-modal input, .tcm-modal button")?.focus())
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !state.busy) { set("modal", ""); return }
      if (event.key !== "Tab") return
      const elements = [...document.querySelectorAll<HTMLElement>(".tcm-modal button:not(:disabled), .tcm-modal input, .tcm-modal textarea, .tcm-modal select, .tcm-modal a[href], .tcm-modal summary")]
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener("keydown", keyboard)
    onCleanup(() => { document.removeEventListener("keydown", keyboard); previous?.focus() })
  })
  const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, { ...init, headers: { "Accept": "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { detail?: string; error?: string }
      throw new TcmUiError(`请求未完成（${response.status}）。`, `Request failed (${response.status}).`, typeof body.detail === "string" ? body.detail : body.error)
    }
    return response.json() as Promise<T>
  }
  const native = <T,>(path: string, init?: RequestInit) => api<T>(new URL(path, sdk.url).href, init)
  const tcm = <T,>(path: string, init?: RequestInit) => api<T>(`/tcm-api${path}`, init)
  const action = async (fn: () => Promise<void>) => {
    set({ busy: true, error: "", notice: "" })
    try { await fn() } catch (error) { set("error", error instanceof TcmUiError ? error.text : bilingual("操作未完成。", "This action could not be completed.", error instanceof Error ? error.message : String(error))) }
    finally { if (alive) set("busy", false) }
  }
  const refresh = async () => {
    const value = await tcm<Overview>("/v1/workbench/overview?recent_limit=20")
    if (alive) set({ overview: value, docs: value.documents, operations: value.recent_operations, packages: value.recent_packages, loading: false })
  }
  const loadProviders = async () => {
    const [result, config] = await Promise.all([
      native<{ providers: Provider[] }>("/settings/local"),
      native<{ model?: string }>("/global/config").catch(() => ({ model: undefined })),
    ])
    const activeModel = config.model ?? ""
    const providers = result.providers.map(provider => ({
      ...provider,
      active: provider.models.some(model => `${provider.id}/${model}` === activeModel),
    }))
    if (alive) set({ providers, modelConfigured: providers.some(p => p.models.length > 0) })
  }
  const select = async (tab: Tab) => {
    set({ tab, error: "", notice: "", document: undefined, report: "", claim: undefined })
    await action(async () => {
      if (tab === "candidates") set("candidates", (await tcm<{ candidates: Candidate[] }>("/v1/candidates")).candidates)
      if (tab === "reports") set("packages", (await tcm<Page<Package>>("/v1/workbench/packages?limit=100")).items)
      if (tab === "operations") set("operations", (await tcm<Page<Operation>>("/v1/workbench/operations?limit=100")).items)
      if (tab === "connection") await loadProviders()
      if (tab === "overview" || tab === "documents") await refresh()
    })
  }
  onMount(() => {
    void action(async () => { await refresh(); await loadProviders(); const session = await api<{ csrf_token: string }>("/tcm-ui/bootstrap"); set("csrf", session.csrf_token) })
    const interval = setInterval(() => {
      if (state.tab === "operations" || state.currentOperation) void refresh().catch(() => undefined)
    }, 5000)
    onCleanup(() => { alive = false; clearInterval(interval) })
  })
  const search = () => action(async () => {
    if (!state.query.trim()) throw new TcmUiError("请先写下你的研究问题。", "Enter your research question first.")
    const result = await tcm<{ results: Passage[]; total_candidates: number }>("/v1/search", { method: "POST", body: JSON.stringify({ query: state.query, mode: state.mode, limit: 20 }) })
    set({ hits: result.results, searchCount: result.total_candidates, searched: true })
  })
  const openDocument = (doc: Doc, offset = 0) => action(async () => {
    const result = await tcm<Page<Passage>>(`/v1/workbench/documents/${doc.id}/passages?limit=20&offset=${offset}`)
    set({ document: doc, paragraphs: offset ? [...state.paragraphs, ...result.items] : result.items, passageOffset: offset, moreParagraphs: result.has_more })
  })
  const openPassage = (hit: Passage) => action(async () => { set("selectedPassage", await tcm<Passage>(`/v1/passages/${hit.id}`)); set("modal", "passage") })
  const openClaim = (id: string) => action(async () => { set("claim", await tcm<Claim>(`/v1/claims/${id}`)); set({ modal: "claim", reason: "" }) })
  const openReport = (item: Package) => action(async () => {
    const response = await fetch(`/tcm-api/v1/packages/${item.id}/report`)
    if (!response.ok) throw new TcmUiError("暂时无法打开这份报告。", "This report could not be opened.")
    set({ report: await response.text(), reportId: item.id })
  })
  const buildReport = () => action(async () => {
    if (!state.query.trim()) throw new TcmUiError("请先输入研究问题。", "Enter a research question first.")
    const result = await tcm<{ operation_id: string }>("/v1/packages", { method: "POST", body: JSON.stringify({ query: state.query, mode: state.mode, limit: 12, idempotency_key: crypto.randomUUID() }) })
    set({ currentOperation: result.operation_id, notice: bilingual("报告正在后台整理，可以在任务记录中查看。", "The report is being prepared. Follow its progress in Activity."), tab: "operations" }); await refresh()
  })
  const importDocuments = () => action(async () => {
    const ids = state.importIds.split(/[\s,，;；]+/).filter(Boolean)
    if (!ids.length) throw new TcmUiError("请输入至少一个 PMID 或 PMCID。", "Enter at least one PMID or PMCID.")
    const result = await tcm<{ operation_id: string }>("/v1/imports", { method: "POST", body: JSON.stringify({ pmcids: state.importType === "europepmc" ? ids : [], pmids: state.importType === "pubmed" ? ids : [], source: state.importType === "europepmc" ? "europepmc" : "ncbi", idempotency_key: crypto.randomUUID() }) })
    set({ modal: "", tab: "operations", currentOperation: result.operation_id, notice: bilingual("导入任务已提交；完成后可建立检索索引。", "Import queued. Build the search index when it finishes.") }); await refresh()
  })
  const buildIndex = () => action(async () => {
    const result = await tcm<{ operation_id: string }>("/v1/indexes", { method: "POST", body: JSON.stringify({ idempotency_key: crypto.randomUUID() }) })
    set({ currentOperation: result.operation_id, tab: "operations", notice: bilingual("索引任务已提交。", "Indexing has been queued.") }); await refresh()
  })
  const review = () => action(async () => {
    if (!state.claim || !state.reviewer.trim() || state.reason.trim().length < 5) throw new TcmUiError("请填写审查者姓名和至少5个字的审查理由。", "Enter the reviewer name and a reason of at least 5 characters.")
    await api(`/tcm-ui/reviews/${state.claim.id}`, { method: "POST", headers: { "X-TCM-CSRF": state.csrf }, body: JSON.stringify({ confirmed: true, expected_version: state.claim.version, decision: state.decision, reviewer: state.reviewer, reason: state.reason }) })
    set({ modal: "", notice: bilingual("审查决定已保存，旧版报告保持不变。", "Review saved. Existing report snapshots remain unchanged.") }); set("candidates", (await tcm<{ candidates: Candidate[] }>("/v1/candidates")).candidates); await refresh()
  })
  const connectionId = (url: string, model: string) => {
    let host = "provider"
    try { host = new URL(url).host }
    catch { /* validation is handled by the URL input and the server */ }
    const slug = `${host}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72)
    return `tcm-${slug || "provider"}`
  }
  const connectionName = (url: string, model: string) => {
    try { return `${new URL(url).hostname} · ${model}` }
    catch { return model }
  }
  const connect = () => action(async () => {
    const url = state.baseUrl.trim()
    const model = state.model.trim()
    if (!url || !model) throw new TcmUiError("请填写 API 地址与模型名称。", "Enter the API URL and model ID.")
    let probeNotice: UiText = ""
    const available = await native<{ models: string[] }>("/settings/local/models", { method: "POST", body: JSON.stringify({ url, key: state.apiKey || undefined }) }).catch(() => ({ models: [] as string[] }))
    if (available.models.length > 0 && !available.models.includes(model)) {
      probeNotice = bilingual(`服务端模型列表未包含 ${model}，仍按你填写的模型名保存；首次调用时会再次核对。`, `The endpoint did not list ${model}; it will still be saved as entered and checked on first use.`)
    } else if (available.models.length === 0) {
      probeNotice = bilingual("服务端暂时没有返回模型列表，仍按你填写的模型名保存；首次调用时会验证连接。", "The endpoint did not return a model list; the connection is saved as entered and will be verified on first use.")
    }
    const id = connectionId(url, model)
    await native<{ id: string }>("/settings/local", { method: "POST", body: JSON.stringify({ url, name: connectionName(url, model), id, key: state.apiKey || undefined, models: [model], contextLimit: 32768, merge: true, setDefault: true }) })
    await native("/global/config", { method: "PATCH", body: JSON.stringify({ model: `${id}/${model}`, small_model: `${id}/${model}` }) })
    set({ apiKey: "", notice: probeNotice || bilingual("模型连接已保存并切换为当前连接。以后可以直接在下方切换。", "Model connection saved and selected. You can switch between saved connections below.") }); await loadProviders(); await sync.refreshProviders()
  })
  const useProvider = (provider: Provider) => action(async () => {
    const model = provider.models[0]
    if (!model) throw new TcmUiError("这个连接没有可用模型。", "This connection has no available model.")
    await native("/global/config", { method: "PATCH", body: JSON.stringify({ model: `${provider.id}/${model}`, small_model: `${provider.id}/${model}` }) })
    set({ baseUrl: provider.baseURL, model, apiKey: "", notice: bilingual(`已切换到 ${provider.name}。`, `Switched to ${provider.name}.`) }); await loadProviders(); await sync.refreshProviders()
  })
  const enterResearch = () => {
    const project = sync.data.project.find(p => !p.time.archived)
    if (project) navigate(projectHref(project))
    else set("modal", "project")
  }
  const createProject = () => action(async () => {
    const project = await native<{ id: string; worktree: string }>("/global/project", { method: "POST", body: JSON.stringify({ name: state.newProjectName, sources: [] }) })
    set("modal", ""); navigate(projectHref(project))
  })
  const downloadReport = () => {
    const url = URL.createObjectURL(new Blob([state.report], { type: "text/markdown;charset=utf-8" }))
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${state.reportId}.md`; anchor.click(); URL.revokeObjectURL(url)
  }
  const publishReport = () => action(async () => {
    const project = sync.data.project.find(p => !p.time.archived)
    if (!project) throw new TcmUiError("请先创建一个研究项目，再保存产物。", "Create a research project before saving an artifact.")
    const selector = `?directory=${encodeURIComponent(project.worktree)}&projectID=${encodeURIComponent(project.id)}`
    const session = await native<{ id: string }>(`/session${selector}`, { method: "POST", body: JSON.stringify({ title: t("证据报告归档", "Evidence report archive"), workspace: "project" }) })
    const path = `reports/${state.reportId}.md`
    await native(`/file/content${selector}`, { method: "PUT", body: JSON.stringify({ path, content: state.report, sessionID: session.id }) })
    const artifact = await native<{ id: string; currentVersionID: string }>(`/file/artifact${selector}`, { method: "POST", body: JSON.stringify({ path, sessionID: session.id, summary: t("素盏证据报告 · 待研究者审查", "Suzhan evidence report · Needs researcher review") }) })
    set("notice", bilingual(`已保存为 OpenScience 研究产物：${artifact.id}`, `Saved as an OpenScience research artifact: ${artifact.id}`))
  })
  const currentTitle = () => { const item = tabs.find(tab => tab.id === state.tab); return state.tab === "connection" ? t("模型连接", "Model connection") : item ? t(item.title, item.en) : t("研究概览", "Overview") }
  return (
    <div class="tcm-app">
      <aside class="tcm-sidebar">
        <a class="tcm-brand" href="/" aria-label={t("素盏首页", "Suzhan home")} title={t("由 OpenScience 驱动", "Powered by OpenScience")}><span class="tcm-star">✦</span><span>素盏<small>{t("中药药理研究工作台", "Herbal pharmacology workbench")}</small></span></a>
        <div class="tcm-nav-label">{t("研究空间", "RESEARCH SPACE")}</div>
        <nav aria-label={t("研究导航", "Research navigation")}><For each={tabs}>{item => <button classList={{ active: state.tab === item.id }} onClick={() => void select(item.id)}><span>{item.icon}</span>{t(item.title, item.en)}<Show when={item.id === "candidates" && state.overview?.counts.claims_by_review_state.needs_review}><i>{state.overview?.counts.claims_by_review_state.needs_review}</i></Show></button>}</For></nav>
        <div class="tcm-sidebar-line" />
        <button class="tcm-nav-action" onClick={enterResearch}><span>✧</span>{t("研究对话", "Research chat")}<b>↗</b></button>
        <button class="tcm-nav-action" onClick={() => navigate("/projects")}><span>▧</span>{t("项目与文件", "Projects and files")}<b>↗</b></button>
        <button class="tcm-nav-action" onClick={() => dialog.show(() => <DialogSettings initial="scientific-tools" />)}><span>⌘</span>{t("科研工具", "Research tools")}</button>
        <div class="tcm-sidebar-bottom"><button onClick={() => void select("connection")}><span classList={{ "tcm-status-dot": true, ready: state.modelConfigured }} />{state.modelConfigured ? t("主模型已配置", "Model configured") : t("连接你的研究模型", "Connect a model")}<b>›</b></button><button onClick={() => dialog.show(() => <DialogSettings />)}>{t("偏好设置", "Preferences")}<span>⚙</span></button><small>{t("由 OPENSCIENCE 驱动", "POWERED BY OPENSCIENCE")}</small></div>
      </aside>
      <div class="tcm-main">
        <header class="tcm-topbar"><span>{t("研究空间", "Research space")}<i>/</i> <strong>{currentTitle()}</strong></span><div><span classList={{ "tcm-runtime-dot": true, ready: server.healthy() === true }} />{server.healthy() === true ? t("OpenScience 已连接", "OpenScience connected") : t("正在连接工作台", "Connecting to workspace")}<div class="tcm-language-switch" role="group" aria-label={t("界面语言", "Interface language")}><button type="button" classList={{ active: isChinese() }} aria-pressed={isChinese()} onClick={() => language.setLocale("zh")}>中文</button><button type="button" classList={{ active: !isChinese() }} aria-pressed={!isChinese()} onClick={() => language.setLocale("en")}>English</button></div><span class="tcm-avatar">{t("研", "R")}</span></div></header>
        <div class="tcm-content">
          <Show when={state.error}><div class="tcm-alert" role="alert"><strong>{t("这一步还没有完成", "This step is not complete")}</strong><span>{message(state.error)}</span><button onClick={() => set("error", "")} aria-label={t("关闭错误", "Dismiss error")}>×</button></div></Show>
          <Show when={state.notice}><div class="tcm-notice" role="status">{message(state.notice)}<button onClick={() => set("notice", "")} aria-label={t("关闭提示", "Dismiss notice")}>×</button></div></Show>
          <Switch>
            <Match when={state.tab === "overview"}>
              <section class="tcm-hero"><div class="tcm-hero-copy"><div class="tcm-eyebrow">01 <span/>{t("每一个发现，都从提问开始", "Every discovery begins with a question")}</div><h1>{t("循本草之源，", "Explore herbal roots.")}<br/><em>{t("寻科学之证。", "Follow the evidence.")}</em></h1><p>{t("让文献、机制与实验彼此连接。", "Connect literature, mechanisms and experiments.")}<br/>{t("在可追溯的证据中，找到下一步值得验证的方向。", "Find the next question worth testing in traceable evidence.")}</p><div class="tcm-hero-actions"><button class="tcm-primary" onClick={enterResearch}>{t("开始研究", "Start research")}<span>↗</span></button><button class="tcm-text-button" onClick={() => void select("search")}>{t("探索文献证据", "Explore the evidence")}<span>→</span></button></div><div class="tcm-hero-foot">{t("按你的节奏，探索你的研究", "YOUR RESEARCH, AT YOUR PACE")} <span>✦</span></div></div><TcmMoon /></section>
              <section class="tcm-stat-grid" aria-label={t("研究数据统计", "Research statistics")}><div><small>{t("文献资料", "Papers")}</small><strong>{state.overview?.counts.documents ?? "—"}<span>{t("篇", "papers")}</span></strong><p>{t("原始来源，随时可查", "Original sources, always available")}</p></div><div><small>{t("证据文段", "Evidence passages")}</small><strong>{state.overview?.counts.passages ?? "—"}<span>{t("段", "passages")}</span></strong><p>{t("保留原文位置与来源", "Source locations preserved")}</p></div><div><small>{t("待审查候选", "Awaiting review")}</small><strong>{state.overview?.counts.claims_by_review_state.needs_review ?? "—"}<span>{t("项", "items")}</span></strong><p>{t("由研究者作出最终判断", "Researchers make the final judgment")}</p></div><div><small>{t("研究报告", "Reports")}</small><strong>{state.overview?.counts.packages ?? "—"}<span>{t("份", "reports")}</span></strong><p>{t("每一次探索，都有记录", "Every exploration has a record")}</p></div></section>
              <div class="tcm-section-heading"><div><span class="tcm-eyebrow">{t("继续探索", "CONTINUE EXPLORING")}</span><h2>{t("继续你的研究", "Continue your research")}</h2></div><button class="tcm-text-button" onClick={() => void select("reports")}>{t("所有报告 →", "All reports \u2192")}</button></div>
              <div class="tcm-recent"><For each={state.overview?.recent_packages.slice(0, 3)} fallback={<p class="tcm-empty">{t("还没有研究报告。从一个问题开始吧。", "No reports yet. Start with a question.")}</p>}>{item => <button onClick={() => { void select("reports").then(() => openReport(item)) }}><span class="tcm-row-number">↗</span><span><strong>{item.query}</strong><small>{time(item.created_at)} · {item.document_count} {t("篇文献", "papers")}</small></span><span class="tcm-badge">{t("待审查", "Needs review")}</span></button>}</For></div>
            </Match>
            <Match when={state.tab === "search"}>
              <div class="tcm-page-heading"><span class="tcm-eyebrow">{t("证据，置于情境之中", "EVIDENCE, IN CONTEXT")}</span><h1>{t("从一个问题，走近证据。", "A question brings evidence closer.")}</h1><p>{t("同时关注支持、反对与不确定的发现。每一个结果，都回到原文。", "Explore supporting, opposing and uncertain findings. Trace each result to its source.")}</p></div>
              <form class="tcm-search-box" onSubmit={e => { e.preventDefault(); void search() }}><textarea aria-label={t("研究问题", "Research question")} placeholder={t("例如：姜黄素通过哪些机制影响肝细胞癌中的铁死亡？", "For example: How does curcumin affect ferroptosis in hepatocellular carcinoma?")} value={state.query} onInput={e => set("query", e.currentTarget.value)} /><div><select aria-label={t("检索方式", "Search method")} value={state.mode} onChange={e => set("mode", e.currentTarget.value)}><option value="hybrid">{t("综合检索", "Hybrid search")}</option><option value="fts">{t("关键词检索", "Keyword search")}</option><option value="dense">{t("语义检索", "Semantic search")}</option></select><button class="tcm-primary" disabled={state.busy || !state.query.trim()}>{state.busy ? t("正在检索…", "Searching…") : t("查找证据", "Find evidence")} <span>↗</span></button></div></form>
              <Show when={!state.searched}><div class="tcm-query-examples"><span>{t("试着问", "Try a question")}</span><button onClick={() => set("query", t("姜黄素 ACSL4 肝细胞癌 铁死亡", "curcumin ACSL4 hepatocellular carcinoma ferroptosis"))}>{t("姜黄素与铁死亡", "Curcumin and ferroptosis")}</button><button onClick={() => set("query", t("Gpx4 过表达未改善肝损伤", "Gpx4 overexpression did not improve liver injury"))}>{t("查找阴性研究结果", "Find null results")}</button></div></Show>
              <Show when={state.searched}><div class="tcm-section-heading"><h2>{t("检索结果", "Search results")}<small>{state.hits.length} {t("条", "results")}</small></h2><button class="tcm-secondary" disabled={state.busy} onClick={() => void buildReport()}>{t("整理为证据报告 ↗", "Create evidence report \u2197")}</button></div><p class="tcm-muted">{t("以下为相关文献片段；相关性不代表机制已经证实。", "These passages are relevant to the query. Relevance does not establish a mechanism.")}</p><div class="tcm-evidence-list"><For each={state.hits} fallback={<p class="tcm-empty">{t("当前语料没有检出匹配结果。可以调整问题，或导入更多文献。", "No matches in the current library. Refine the question or import more papers.")}</p>}>{(hit, index) => <article class="tcm-evidence-card"><div class="tcm-evidence-meta"><span>{String(index() + 1).padStart(2, "0")}</span><span>{hit.source_id}</span><span>{hit.section.toLowerCase().includes("abstract") || hit.section.includes("摘要") ? t("摘要", "Abstract") : t("原文段落", "Source passage")}</span></div><h3>{hit.document?.title}</h3><p class="tcm-excerpt">{hit.text}</p><footer><small>{hit.section}</small><button class="tcm-text-button" onClick={() => void openPassage(hit)}>{t("核对原文 ↗", "Check source \u2197")}</button></footer></article>}</For></div></Show>
            </Match>
            <Match when={state.tab === "documents"}>
              <div class="tcm-page-heading"><span class="tcm-eyebrow">{t("你的研究文献库", "YOUR RESEARCH LIBRARY")}</span><h1>{t("每一份发现，都有出处。", "Every finding has a source.")}</h1><p>{t("保存原始文献、章节与来源，构建自己的研究资料库。", "Build your library with original papers, sections and source records.")}</p></div><div class="tcm-toolbar"><span>{state.overview?.counts.documents ?? 0} {t("篇文献", "papers")} · {state.overview?.counts.indexed_passages ?? 0} {t("个文段已索引", "indexed passages")}</span><div><button class="tcm-secondary" disabled={state.busy} onClick={() => void buildIndex()}>{t("更新检索索引", "Update search index")}</button><button class="tcm-primary" onClick={() => set("modal", "import")}>{t("导入文献 +", "Import papers +")}</button></div></div>
              <Show when={state.document} fallback={<div class="tcm-library"><For each={state.docs} fallback={<p class="tcm-empty">{t("文献库还是空的。导入第一篇文献，开始积累证据。", "Your library is empty. Import a paper to begin collecting evidence.")}</p>}>{doc => <button class="tcm-document-row" onClick={() => void openDocument(doc)}><span class="tcm-document-icon">▤</span><span><small>{doc.source_id} · {doc.year || t("年份未知", "Year unknown")}</small><strong>{doc.title}</strong><span>{doc.passage_count} {t("个文段", "passages")} · {doc.full_text ? t("全文", "Full text") : t("仅摘要", "Abstract only")}</span></span><span class="tcm-badge">{doc.license?.toLowerCase().includes("by") ? t("开放许可", "Open license") : t("来源已记录", "Source recorded")}</span><b>↗</b></button>}</For></div>}>
                <button class="tcm-text-button" onClick={() => set("document", undefined)}>{t("← 返回文献库", "\u2190 Back to library")}</button><h2 class="tcm-document-title">{state.document?.title}</h2><For each={state.paragraphs}>{p => <article class="tcm-paragraph"><small>{p.section}</small><p>{p.text}</p><button class="tcm-text-button" onClick={() => void openPassage(p)}>{t("查看引用位置 ↗", "View citation location \u2197")}</button></article>}</For><Show when={state.moreParagraphs}><button class="tcm-secondary" onClick={() => state.document && void openDocument(state.document, state.passageOffset + 20)}>{t("更多原文段落", "Load more passages")}</button></Show>
              </Show>
            </Match>
            <Match when={state.tab === "candidates"}>
              <div class="tcm-page-heading"><span class="tcm-eyebrow">{t("假说，接受审查", "HYPOTHESES, OPEN TO REVIEW")}</span><h1>{t("让假说，经得起追问。", "Put each hypothesis to the test.")}</h1><p>{t("保留支持与反对的声音，也保留尚未回答的问题。", "Keep supporting and opposing findings, along with unanswered questions.")}</p></div><div class="tcm-candidate-list"><For each={state.candidates} fallback={<p class="tcm-empty">{t("还没有机制提议。在研究对话中提出问题，结合原文建立第一个候选。", "No mechanism proposals yet. Use Research chat and original sources to propose one.")}</p>}>{(c, index) => <article class="tcm-candidate"><div class="tcm-evidence-meta"><span>{String(index() + 1).padStart(2, "0")}</span><span class={`tcm-badge ${c.review_state}`}>{status(c.review_state)}</span></div><h2>{c.subject} <span>→</span> {c.object}</h2><p>{c.statement}</p><div class="tcm-candidate-foot"><span>{c.supporting_source_families} {t("个条件匹配的支持来源", "matched supporting sources")} · {c.contradicting_evidence.length} {t("条提议反对证据", "proposed opposing results")}</span><button class="tcm-secondary" onClick={() => void openClaim(c.claim_id)}>{t("查看与审查 ↗", "Inspect and review \u2197")}</button></div><Show when={c.missing_context.length}><small class="tcm-muted">{t("待补充：", "Missing: ")}{c.missing_context.map(contextLabel).join(" · ")}</small></Show></article>}</For></div>
            </Match>
            <Match when={state.tab === "reports"}>
              <div class="tcm-page-heading"><span class="tcm-eyebrow">{t("记录每一次探索", "A RECORD OF EVERY EXPLORATION")}</span><h1>{t("把思考，留在证据里。", "Keep a record of the evidence.")}</h1><p>{t("报告保留生成时的来源与判断。后续审查不会改写旧版本。", "Reports preserve sources and judgments at creation. Later reviews do not alter those snapshots.")}</p></div><Show when={state.report} fallback={<div class="tcm-library"><For each={state.packages} fallback={<p class="tcm-empty">{t("在证据检索中选择“整理为证据报告”，即可保存一次研究探索。", "Choose \u201cCreate evidence report\u201d in Evidence search to save an exploration.")}</p>}>{item => <button class="tcm-document-row" onClick={() => void openReport(item)}><span class="tcm-document-icon">☷</span><span><small>{time(item.created_at)}</small><strong>{item.query}</strong><span>{item.document_count} {t("个来源", "sources")} · {item.candidate_count} {t("个提议", "proposals")}</span></span><span class="tcm-badge">{status(item.status)}</span><b>↗</b></button>}</For></div>}><div class="tcm-toolbar"><button class="tcm-text-button" onClick={() => set("report", "")}>{t("← 所有报告", "\u2190 All reports")}</button><div><button class="tcm-secondary" onClick={downloadReport}>{t("下载 Markdown", "Download Markdown")}</button><button class="tcm-primary" disabled={state.busy} onClick={() => void publishReport()}>{t("保存到研究产物 ↗", "Save research artifact \u2197")}</button></div></div><div class="tcm-report"><MarkedProvider><Markdown text={state.report} /></MarkedProvider></div></Show>
            </Match>
            <Match when={state.tab === "operations"}>
              <div class="tcm-page-heading"><span class="tcm-eyebrow">{t("每一步，都可追溯", "EVERY STEP, TRACEABLE")}</span><h1>{t("研究进展，一目了然。", "Follow your research progress.")}</h1><p>{t("离开当前页面，后台任务仍会继续。所有结果都可以追溯。", "Background tasks continue after you leave this page. Their results remain traceable.")}</p></div><div class="tcm-task-list"><For each={state.operations} fallback={<p class="tcm-empty">{t("这里会记录导入、索引与报告任务。", "Import, indexing and report tasks will appear here.")}</p>}>{op => <article><span class={`tcm-task-indicator ${op.state}`} /><div><strong>{status(op.kind)}</strong><p>{op.query || op.id}</p><small>{time(op.created_at)}</small></div><span class={`tcm-badge ${op.state}`}>{status(op.state)}</span><Show when={op.can_cancel}><button class="tcm-text-button" disabled={state.busy} onClick={() => void action(async () => { await tcm(`/v1/operations/${op.id}/cancel`, { method: "POST" }); await refresh() })}>{t("取消", "Cancel")}</button></Show></article>}</For></div>
            </Match>
            <Match when={state.tab === "connection"}>
              <div class="tcm-page-heading"><span class="tcm-eyebrow">{t("你的模型，你的工作空间", "YOUR MODEL, YOUR WORKSPACE")}</span><h1>{t("连接你的研究伙伴。", "Connect your research model.")}</h1><p>{t("填入三个信息即可保存一个 OpenAI-compatible 连接；以后可以直接切换已保存的连接。", "Save an OpenAI-compatible connection with three fields, then switch between saved connections whenever you need.")}</p></div><div class="tcm-connection-grid"><form class="tcm-form-card" onSubmit={e => { e.preventDefault(); void connect() }}><h2>{t("主推理模型", "Primary reasoning model")}</h2><label>{t("API 地址", "API URL")}<input required type="url" placeholder="https://your-provider.example/v1" value={state.baseUrl} onInput={e => set("baseUrl", e.currentTarget.value)} /></label><label>{t("API 密钥", "API key")}<input type="password" autocomplete="off" placeholder={t("仅在本地填写", "Enter locally")} value={state.apiKey} onInput={e => set("apiKey", e.currentTarget.value)} /></label><label>{t("模型名称", "Model ID")}<input required placeholder={t("填写服务商提供的模型 ID", "Enter the model ID from your provider")} value={state.model} onInput={e => set("model", e.currentTarget.value)} /></label><p class="tcm-muted">{t("密钥交由 OpenScience 的本地凭据机制保存，不会写入研究对话或报告。", "OpenScience stores the key in its local credential system, outside research chats and reports.")}</p><button class="tcm-primary" disabled={state.busy}>{state.busy ? t("正在保存…", "Saving…") : t("保存并切换", "Save and switch")} <span>→</span></button></form><div class="tcm-connection-note"><span>✦</span><h2>{t("工具与模型，各司其职。", "Models and tools have distinct roles.")}</h2><p>{t("主模型负责理解问题、安排步骤。文献检索使用 Qwen3-Embedding-0.6B，机制结论始终保留来源与审查状态。", "The primary model interprets questions and plans the work. Literature search uses Qwen3-Embedding-0.6B. Mechanism claims retain sources and review status.")}</p><Show when={state.providers.length > 0} fallback={<p class="tcm-muted">{t("还没有保存的模型连接。保存上面的三个字段后，它会出现在这里。", "No saved model connections yet. Save the three fields above and it will appear here.")}</p>}><div class="tcm-provider-list"><For each={state.providers}>{provider => <div class="tcm-provider" classList={{ active: provider.active }}><div><strong>{provider.name}</strong><p>{provider.baseURL}</p><p>{provider.models.join(" · ")}</p><small>{provider.active ? t("当前使用中", "Currently selected") : t("已保存，可切换", "Saved and ready to switch")}</small></div><Show when={!provider.active}><button class="tcm-secondary tcm-provider-switch" disabled={state.busy} onClick={() => void useProvider(provider)}>{t("切换到此连接", "Use this connection")}</button></Show></div>}</For></div></Show><button class="tcm-text-button" onClick={() => dialog.show(() => <DialogSettings initial="local-models" />)}>{t("打开 OpenScience 完整模型设置 ↗", "Open all OpenScience model settings \u2197")}</button></div></div>
            </Match>
          </Switch>
          <footer class="tcm-page-footer"><span>{t("素盏 · 扎根证据的研究", "SUZHAN · RESEARCH WITH EVIDENCE")}</span><span>✦</span><span>{t("每一个结论，保留追问的余地。", "Every conclusion remains open to scrutiny.")}</span></footer>
        </div>
      </div>
      <Show when={state.modal}><div class="tcm-overlay" onClick={e => { if (e.target === e.currentTarget) set("modal", "") }}><section class="tcm-modal" role="dialog" aria-modal="true" aria-label={{ passage: t("原文与引用", "Source and citation"), claim: t("机制候选审查", "Review a mechanism proposal"), import: t("导入文献", "Import papers"), project: t("新建研究项目", "New research project") }[state.modal] || t("研究操作", "Research action")}><button class="tcm-close" aria-label={t("关闭", "Close")} onClick={() => set("modal", "")}>×</button>
        <Show when={state.error}><div class="tcm-alert" role="alert">{message(state.error)}</div></Show>
        <Switch>
          <Match when={state.modal === "passage"}><span class="tcm-eyebrow">{t("回到原始来源", "BACK TO THE SOURCE")}</span><h2>{t("原文与引用", "Source and citation")}</h2><h3>{state.selectedPassage?.document?.title}</h3><small>{state.selectedPassage?.section}</small><blockquote>{state.selectedPassage?.text}</blockquote><Show when={state.selectedPassage?.document?.source_url}><a class="tcm-secondary" target="_blank" rel="noreferrer" href={state.selectedPassage?.document?.source_url}>{t("打开原始文献 ↗", "Open original paper \u2197")}</a></Show><details><summary>{t("引用定位与内容校验", "Citation location and content hash")}</summary><pre>{JSON.stringify({ passage_id: state.selectedPassage?.id, locator: state.selectedPassage?.locator, sha256: state.selectedPassage?.content_hash }, null, 2)}</pre></details></Match>
          <Match when={state.modal === "claim"}><span class="tcm-eyebrow">{t("研究者审查", "RESEARCHER REVIEW")}</span><h2>{t("逐条核查，保留判断。", "Check the evidence. Record your judgment.")}</h2><p>{state.claim?.payload.statement}</p><div class="tcm-context-grid"><For each={Object.entries(state.claim?.payload.context || {})}>{([key, value]) => <div><small>{contextLabel(key)}</small><span>{String(value)}</span></div>}</For></div><For each={state.claim?.payload.evidence}>{e => <div class="tcm-claim-evidence"><span class="tcm-badge">{status(e.stance)} · {status(e.context_match)}</span><blockquote>{e.quote}</blockquote><button class="tcm-text-button" onClick={() => void action(async () => { const p = await tcm<Passage>(`/v1/passages/${e.passage_id}`); set({ selectedPassage: p, modal: "passage" }) })}>{t("核对引用出处 ↗", "Check citation source \u2197")}</button></div>}</For><p class="tcm-muted">{t("引文存在性检查不等于机制验证。请根据原文与适用条件作出审查。", "A quote match does not validate a mechanism. Review the original source and its applicable context.")}</p><form class="tcm-review-form" onSubmit={e => { e.preventDefault(); void review() }}><div><label>{t("审查者", "Reviewer")}<input required value={state.reviewer} onInput={e => set("reviewer", e.currentTarget.value)} /></label><label>{t("审查决定", "Review decision")}<select value={state.decision} onChange={e => set("decision", e.currentTarget.value)}><option value="accepted">{t("接受此提议", "Accept proposal")}</option><option value="rejected">{t("退回此提议", "Reject proposal")}</option><option value="needs_review">{t("继续保留待审", "Keep pending review")}</option></select></label></div><label>{t("审查理由", "Review reason")}<textarea required minLength={5} value={state.reason} onInput={e => set("reason", e.currentTarget.value)} placeholder={t("说明依据、条件差异或需要补充的证据", "Describe the evidence, context differences or missing information")} /></label><button class="tcm-primary" disabled={state.busy}>{t("确认并保存审查决定 →", "Confirm and save review \u2192")}</button></form></Match>
          <Match when={state.modal === "import"}><span class="tcm-eyebrow">{t("扩展你的文献库", "GROW YOUR LIBRARY")}</span><h2>{t("加入新的文献。", "Add papers to your library.")}</h2><form class="tcm-form" onSubmit={e => { e.preventDefault(); void importDocuments() }}><label>{t("文献来源", "Source")}<select value={state.importType} onChange={e => set("importType", e.currentTarget.value)}><option value="europepmc">{t("PMC 开放全文 · Europe PMC", "PMC open full text \u00b7 Europe PMC")}</option><option value="pubmed">{t("PubMed 摘要", "PubMed abstracts")}</option></select></label><label>{t("文献标识", "Paper identifiers")}<textarea required placeholder={t("例如 PMC11420324，多篇用换行分隔", "For example, PMC11420324. Put each ID on a new line")} value={state.importIds} onInput={e => set("importIds", e.currentTarget.value)} /></label><p class="tcm-muted">{t("系统保留来源及许可，重复导入的同一版本会自动去重。", "Sources and licenses are preserved. Reimporting the same version does not create a duplicate.")}</p><button class="tcm-primary" disabled={state.busy}>{t("开始导入 →", "Start import \u2192")}</button></form></Match>
          <Match when={state.modal === "project"}><span class="tcm-eyebrow">{t("开启新的研究", "A NEW RESEARCH JOURNEY")}</span><h2>{t("开始一项研究。", "Start a research project.")}</h2><form class="tcm-form" onSubmit={e => { e.preventDefault(); void createProject() }}><label>{t("研究项目名称", "Project name")}<input required value={state.newProjectName} onInput={e => set("newProjectName", e.currentTarget.value)} /></label><p>{t("项目、会话、工具与文件由 OpenScience 工作台统一管理。", "OpenScience manages projects, sessions, tools and files in one workspace.")}</p><button class="tcm-primary" disabled={state.busy}>{t("创建并进入研究 →", "Create and open project \u2192")}</button></form></Match>
        </Switch>
      </section></div></Show>
    </div>
  )
}
