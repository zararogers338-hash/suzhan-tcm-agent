import { createMemo, For, Show } from "solid-js"
import { ToolRegistry } from "@synsci/ui/message-part"
import { BasicTool } from "@synsci/ui/basic-tool"
import { useLanguage } from "@/context/language"
import "./tcm-tool-renderer.css"

const labels: Record<string, [string, string]> = {
  tcm_search_evidence: ["检索文献证据", "Search evidence"],
  tcm_get_source_passage: ["核对原文", "Read source passage"],
  tcm_import_documents: ["导入文献", "Import documents"],
  tcm_build_evidence_package: ["整理证据报告", "Build evidence report"],
  tcm_get_operation: ["查看任务进展", "Check task progress"],
  tcm_get_evidence_package: ["读取证据报告", "Read evidence report"],
  tcm_propose_claim: ["提出机制候选", "Propose a mechanism"],
  tcm_verify_claim: ["核查引用与条件", "Check citations and context"],
  tcm_list_candidates: ["查看机制候选", "List hypotheses"],
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
const text = (value: unknown) => typeof value === "string" ? value : ""
function source(value: unknown) {
  const url = text(value)
  return /^https?:\/\//i.test(url) ? url : undefined
}

for (const [name, label] of Object.entries(labels)) {
  ToolRegistry.register({ name, render(props) {
    const language = useLanguage()
    const tr = (zh: string, en: string) => language.locale().startsWith("zh") ? zh : en
    const data = createMemo(() => {
      if (!props.output) return undefined
      try { return object(JSON.parse(props.output)) } catch { return undefined }
    })
    const passages = createMemo(() => {
      const value = data()
      if (!value) return []
      if (Array.isArray(value.results)) return value.results.map(object).filter((p): p is Record<string, unknown> => !!p)
      return typeof value.text === "string" && value.document ? [value] : []
    })
    return <BasicTool {...props} icon="book-open" defaultOpen={false} trigger={{ title: tr(...label), subtitle: text(props.input.query) || text(data()?.state) }}>
      <div class="tcm-inline-tool">
        <Show when={passages().length}>
          <p class="tcm-inline-tool__note">{tr("原文证据 · 科学结论仍需研究者审查", "Source evidence · scientific conclusions require researcher review")}</p>
          <For each={passages()}>{passage => {
            const doc = () => object(passage.document)
            return <article>
              <small>{text(passage.source_id) || text(doc()?.pmcid)} · {text(passage.section)}</small>
              <h4><Show when={source(doc()?.source_url)} fallback={text(doc()?.title)}>{url => <a href={url()} target="_blank" rel="noreferrer">{text(doc()?.title)} ↗</a>}</Show></h4>
              <p class="tcm-inline-tool__excerpt">{text(passage.text)}</p>
              <details><summary>{tr("展开完整文段与引用位置", "Full passage and citation location")}</summary><blockquote>{text(passage.text)}</blockquote><code>{text(passage.id)}</code><pre>{JSON.stringify(passage.locator, null, 2)}</pre></details>
            </article>
          }}</For>
        </Show>
        <Show when={!passages().length && data()}>
          <div class="tcm-inline-tool__receipt"><For each={["operation_id", "package_id", "id", "state", "review_state"]}>{key => <Show when={text(data()?.[key])}><span>{key}: <code>{text(data()?.[key])}</code></span></Show>}</For></div>
        </Show>
        <Show when={props.output}><details class="tcm-inline-tool__raw"><summary>{tr("查看完整工具记录", "View complete tool record")}</summary><pre>{props.output}</pre></details></Show>
      </div>
    </BasicTool>
  } })
}
