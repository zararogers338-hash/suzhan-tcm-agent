# 素盏（Suzhan）

素盏是一个本地中药药理研究工作台：它把 OpenScience 作为本地运行底座，把文献证据检索、原文定位、机制候选和研究报告放在同一条可追溯链路里。

## 当前交付

- 中英文全局界面切换，设置页的模型、连接器、凭据和二级菜单跟随语言切换。
- 模型连接页使用三个字段：API URL、API Key、Model ID；保存后可以在已保存连接之间切换。
- OpenAI-compatible 服务的 `/v1/models` 探测是尽力而为。服务暂时不返回模型列表时，仍保存用户填写的 Model ID，并在首次调用时验证。
- `tcm_read` 只读证据调用自动允许；导入、打包和 Claim 操作仍按具体操作审批。
- 通用 WebFetch/WebSearch/Literature/CodeSearch 在 TCM 项目中关闭；PubMed、PMC、Europe PMC、Crossref、Semantic Scholar、OpenAlex 和 EBI 等外部证据源通过 allowlist 保留。
- 不要求 OpenScience 官网登录或 OpenScience 账户；Credentials、Connectors 和外部研究服务入口仍保留。

## 本地开发

完整开发工作台由领域 API、OpenScience runtime 和 gateway 组成。Windows 下：

```powershell
cd outputs\tcm-agent
.\scripts\start-workbench.ps1
```

打开 <http://127.0.0.1:4173/tcm>。停止服务：

```powershell
.\scripts\stop-workbench.ps1
```

模型连接在素盏的“模型连接”页填写。密钥只保存到本机配置，不要提交到 Git 或写进研究报告。

## 权重

默认向量模型是 `Qwen/Qwen3-Embedding-0.6B`，输出维度 1024。完整源码与权重交付包包含：

- `models/Qwen3-Embedding-0.6B/`
- `tcm-model-lock.json`
- `MODEL-MANIFEST.json`（逐文件大小与 SHA-256）

权重归档不应进入普通 Git commit。建议作为 GitHub Release asset、受控对象存储或 Git LFS 对象分发；普通 GitHub 仓库只保留模型锁定信息、下载脚本和校验清单。

## Windows 交付

当前有两种 Windows 产物：

1. 轻量启动器/runtime 安装包，适合已有本地工作台环境。
2. 完整 portable 包，包含 Python、Node、PGlite、TCM 服务、OpenScience runtime、数据库和 Qwen 权重。解压后双击 `Suzhan.exe`，它会启动本目录内服务并打开 `/tcm`。

完整 portable 包体积较大，原因是它必须携带 Python 基础运行时和 1GB 以上模型权重。它不依赖开发机的绝对路径。

## 安全边界

Windows 没有可用的强 OS sandbox 后端时，运行策略会明确标记 host execution；这不被描述成强文件系统隔离。外部 API 密钥只应在本地模型设置中填写。科学结论保持 `retrieval_only_not_verified` 或待研究者审查状态，不由引文存在性自动升级。

