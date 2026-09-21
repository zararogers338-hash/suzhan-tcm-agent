import { useLanguage } from "@/context/language"

export type UiText = string | { zh: string; en: string; detail?: string }

/** Store both translations so a visible notice follows a later locale change. */
export const bilingual = (zh: string, en: string, detail?: string): UiText => ({ zh, en, detail })

export class TcmUiError extends Error {
  readonly text: UiText
  constructor(zh: string, en: string, detail?: string) {
    super(en)
    this.name = "TcmUiError"
    this.text = bilingual(zh, en, detail)
  }
}

const states: Record<string, readonly [string, string]> = {
  needs_review: ["待审查", "Needs review"], accepted: ["已接受", "Accepted"],
  rejected: ["已退回", "Rejected"], queued: ["排队中", "Queued"],
  reviewed_partial: ["部分审查", "Partially reviewed"],
  running: ["运行中", "Running"], succeeded: ["已完成", "Completed"],
  failed: ["失败", "Failed"], cancelled: ["已取消", "Cancelled"],
  supports: ["提议支持", "Proposed support"], contradicts: ["提议反对", "Proposed opposition"],
  uncertain: ["不确定", "Uncertain"], neutral: ["中性", "Neutral"],
  matched: ["条件匹配", "Context matched"], mismatched: ["条件不同", "Different context"],
  unknown: ["条件待核查", "Context unverified"],
  not_assessed: ["未评估", "Not assessed"], reported_observation: ["报告中的观察", "Reported observation"],
  association: ["关联", "Association"], prediction: ["预测", "Prediction"], hypothesis: ["假说", "Hypothesis"],
  import: ["文献导入", "Literature import"], index: ["构建索引", "Build index"],
  package: ["证据报告", "Evidence report"],
}

const contexts: Record<string, readonly [string, string]> = {
  species: ["物种", "Species"], organism: ["生物体", "Organism"],
  cell_type: ["细胞类型", "Cell type"], cell_line: ["细胞系", "Cell line"],
  tissue: ["组织", "Tissue"], disease: ["疾病", "Disease"],
  disease_stage: ["疾病阶段", "Disease stage"], disease_origin: ["疾病背景", "Disease background"],
  endpoint: ["实验终点", "Endpoint"], primary_endpoint: ["主要终点", "Primary endpoint"],
  secondary_endpoint: ["次要终点", "Secondary endpoint"],
  compound: ["化合物", "Compound"], target: ["靶点", "Target"], pathway: ["通路", "Pathway"],
  dose: ["剂量", "Dose"], route: ["给药途径", "Administration route"],
  time: ["时间", "Time"], duration: ["持续时间", "Duration"], assay: ["检测方法", "Assay"],
  model: ["实验模型", "Experimental model"], animal_model: ["动物模型", "Animal model"],
  study_intent: ["研究目的", "Study purpose"], study_type: ["研究类型", "Study type"],
  n: ["样本量", "Sample size"], sample_size: ["样本量", "Sample size"],
  sex: ["性别", "Sex"], age: ["年龄", "Age"],
  prevention_of_MASLD_to_HCC: ["是否检验 MASLD 向 HCC 进展的预防", "MASLD-to-HCC prevention tested"],
  HCC_endpoint: ["HCC 终点", "HCC endpoint"], interpretation: ["解释与限制", "Interpretation and limits"],
  evidence_level: ["证据层级", "Evidence level"], publication_type: ["文献类型", "Publication type"],
  diagnosis_criteria: ["诊断标准", "Diagnostic criteria"],
}

export function useTcmI18n() {
  const language = useLanguage()
  const isChinese = () => language.locale().startsWith("zh")
  const t = (zh: string, en: string) => isChinese() ? zh : en
  const message = (value: UiText) => {
    if (typeof value === "string") return value
    const text = t(value.zh, value.en)
    return value.detail && isChinese() ? `${text} ${value.detail}` : text
  }
  const status = (value: string) => {
    const pair = states[value]
    return pair ? t(...pair) : value
  }
  const contextLabel = (key: string) => {
    const pair = contexts[key]
    return pair ? t(...pair) : key
  }
  const time = (value: string) => new Date(value).toLocaleString(isChinese() ? "zh-CN" : "en-US", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  })
  return { language, isChinese, t, message, status, contextLabel, time }
}
