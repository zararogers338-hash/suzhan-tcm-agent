# 素盏 Suzhan

素盏是一个面向中药药理研究的本地证据工作台。它把“提出问题、检索文献、回到原文、记录机制候选、保留研究者审查”串成一条可复核的工作流。

它适合做三件事：

- 在中英文术语之间检索 TCM 文献，并保留每个结果的来源、章节、定位和内容哈希；
- 把支持、反对、条件不匹配和未知分开，避免把相关性直接写成机制结论；
- 用一个本地 OpenAI-compatible 模型负责规划和总结，用本地 Qwen embedding 模型负责证据召回。

## 产品形态

素盏运行在本机，不需要 OpenScience 官网登录或在线账户。OpenScience 在这里承担本地运行底座：会话、工具、连接器、凭据、审批和文件接口继续可用；素盏负责 TCM 证据服务和研究工作台。

模型连接页只需要三个字段：API URL、API Key、Model ID。保存后会生成本地连接记录，下次可以直接切换。`/v1/models` 暂时不可用时，手填的模型名仍会保存，并在首次调用时验证。

## 证据边界

TCM 文献任务必须经过 `tcm_*` 工具。只读检索和原文读取可以自动执行；导入、证据包和 Claim 写入仍按具体操作审批。通用 WebFetch、WebSearch、Literature 和 CodeSearch 在 TCM 项目中关闭，防止模型绕过来源边界。

外部证据连接没有被删除。PubMed、PMC、Europe PMC、Crossref、Semantic Scholar、OpenAlex、EBI，以及 Credentials、Connectors、GitHub、Hugging Face、Firecrawl 等入口仍可由本地 OpenScience 管理。科学状态会保留为 `retrieval_only_not_verified` 或待研究者审查，不会因为“找到了引文”就自动升级。

## 本地启动

开发环境需要 Windows、Python 3.13、Node.js、Bun 1.3.14，以及已经准备好的 Qwen embedding 权重。

```powershell
cd outputs\tcm-agent
.\scripts\start-workbench.ps1
```

打开：<http://127.0.0.1:4173/tcm>

停止：

```powershell
.\scripts\stop-workbench.ps1
```

第一次准备本地环境：

```powershell
cd outputs\tcm-agent
.\scripts\bootstrap-local.ps1 -DownloadModel
```

模型密钥只在本地模型连接页填写，不要提交到 Git，不要放入提示词、日志或报告。

## 模型权重

默认向量模型：`Qwen/Qwen3-Embedding-0.6B`，输出维度 1024。

仓库只保存外部权重指针文件：

[`models/Qwen3-Embedding-0.6B/model.safetensors.pointer`](models/Qwen3-Embedding-0.6B/model.safetensors.pointer)

权重 revision、大小和 SHA-256 记录在 [`tcm-model-lock.json`](models/Qwen3-Embedding-0.6B/tcm-model-lock.json) 中。完整权重归档应通过 Release asset、受控对象存储或本地交付包分发。使用前请核对 [Qwen3-Embedding-0.6B 上游页面](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)的许可证和分发条款。

## Windows 交付

小型 runtime 安装器适合已经准备好本地工作台的机器。完整跨机器包还需要携带 Python 基础运行时、Node/PGlite、TCM 服务、数据库和模型，因此体积约数 GiB，作为独立 portable 归档提供。

启动器的目标页面固定为：

```text
http://127.0.0.1:4173/tcm
```

如果完整工作台服务没有启动，启动器会提示具体日志位置，不会悄悄跳到另一个不兼容的页面。

## 目录概览

| 路径 | 作用 |
| --- | --- |
| `frontend/workspace/src/pages/tcm-workbench.tsx` | 素盏研究工作台和模型连接页 |
| `frontend/workspace/src/components/settings/OpenAICompatibleConnection.tsx` | 原生模型设置页的三字段连接卡 |
| `outputs/tcm-agent/src/tcm/` | TCM API、检索、导入、证据包和审查服务 |
| `outputs/tcm-agent/adapters/openscience/` | OpenScience 本地工具桥接 |
| `outputs/tcm-agent/docs/permissions.md` | 权限、网络 allowlist 和 Windows 沙箱边界 |
| `SUZHAN.md` | 面向交付和部署的中文说明 |

## 验证

已验证的本地链路包括：

- TCM Python 测试和 OpenScience bridge/policy 测试；
- workspace TypeScript 类型检查和 Vite production build；
- 真实 TCM 检索、原文读取、三成分并行证据闭环；
- Windows portable 工作台的 API、runtime、gateway 和 embedding 模型加载。

## 许可证与来源

素盏的新增代码、文档和本地产品改造按本仓库许可证发布。仓库保留上游 OpenScience 的许可证、NOTICE 和来源信息；上游项目与本地改造的边界以各目录中的文件为准。Qwen 模型权重遵循其上游许可证与使用条款。
