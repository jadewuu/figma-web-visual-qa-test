# Figma 设计系统与 Web 视觉验收 Agent - 设计说明

## 目标

构建一个在 GitLab Merge Request（MR）流水线中自动运行的 Agent，用于将一个已配置的 Web 页面与其 Figma 设计稿进行验收。

该 Agent 扩展但不替代已有的 `ui-visual-qa` Level 2 Skill。Level 2 Skill 仍是视觉验收的核心：它对比 Figma 设计截图与 Web 实现截图，忽略文案和图片内容差异，输出按严重程度分级的问题及标注后的实现截图。

## 范围

第一版仅验收已配置的 Web 页面。iOS 与 Android 原生页面截图适配器不在第一版范围内；但报告和分流协议应保持可扩展，后续增加 App 截图来源时不修改 QA 核心。

Agent 直接在 GitLab MR Pipeline 中运行，不依赖单独常驻的 Webhook 服务。

## 输入与密钥

每个验收目标在 `qa-targets.yml` 中声明：

- 目标标识；
- Figma 文件 Key 与 Frame Node ID；
- 预览页面 URL，以及与 Figma Frame 匹配的视口尺寸；
- 页面就绪选择器，以及可选的登录/鉴权初始化命令；
- Token 来源：Figma Variables API 或仓库内的 `design-tokens.json`。

密钥保存为 GitLab 的 Masked CI/CD Variables，绝不写入报告：

- `FIGMA_ACCESS_TOKEN`：导出 Figma 图片；有相应权限时读取 Variables API；
- `GITLAB_TOKEN`：由项目机器人自动发布 MR Note；
- 已配置预览环境所需的鉴权凭据；
- `DASHSCOPE_API_KEY`：调用阿里云百炼的 `qwen3-vl-235b-a22b-thinking`，执行 Level 2 视觉分析。

## 自动化工作流

1. **自动触发**：当 `CI_PIPELINE_SOURCE` 为 `merge_request_event` 时，GitLab 启动 `ui_visual_qa` Job。
2. **获取设计输入**：Agent 导出已配置 Figma Frame 的 PNG。若 Token 具有 `file_variables:read` 权限，则读取 Figma Variables；否则读取仓库中已配置的 `design-tokens.json`。无论 Token 来源是什么，Figma Frame 图片始终是必需输入。
3. **代码 Token QA**：Agent 检查本次 MR Diff，报告新引入的硬编码值或设计 Token 违规。第一版只检查颜色、间距、圆角和字体，并限制扫描范围到已配置的源码扩展名和 Token 命名空间，避免变成无关的通用代码扫描。
4. **截取实现页面**：Playwright 以配置的视口打开预览 URL，等待页面就绪选择器出现，然后保存 Web 实现截图。
5. **调用 Level 2 视觉 QA**：Agent 将设计图和实现图交给阿里云百炼的 `qwen3-vl-235b-a22b-thinking`，并以 `ui-visual-qa` 规则分析。该模型为仅思考模型；Agent 丢弃推理内容，只校验最终答案中的结构化 JSON（P0/P1/P2、问题位置和标注框坐标），再生成标注截图。
6. **判断与自动落地**：Agent 合并 Token QA 与视觉 QA 的结果，生成 Markdown/HTML 报告；将报告、两张原图、标注图、原始结果和运行日志上传为 GitLab Job Artifact，并自动发布 MR Note。存在 P0 时，先完成发布再使 Job 失败；仅有 P1/P2 或无问题时，Job 成功。

## 严重程度与分流

- **P0**：阻断型视觉问题，或已配置为阻断型的设计 Token 违规。上传 Artifact、发布 MR Note，然后使 Pipeline 失败。
- **P1/P2**：上传 Artifact、发布 MR Note，但 Pipeline 保持成功。
- **needs-human-review**：因输入获取、页面渲染或模型返回格式无效，导致有效 QA 无法完成。上传诊断 Artifact、发布 MR Note，并使 Job 失败，避免 MR 在未验收状态下静默通过。

代码 Token QA 不覆盖 Level 2 Skill 的判断。它用于定位可能的设计系统根因；最终渲染结果仍以视觉 QA 为准。

## 异常处理

- Figma 图片导出、Figma Variables 读取、预览页面访问、截图与 Qwen 视觉分析均最多重试 3 次，并使用有上限的退避等待。
- 缺少 Figma 映射、缺少页面就绪选择器、视口非法、截图为空或模型 JSON 无效时，不生成视觉结论，直接进入 `needs-human-review`。
- Figma Variables API 因套餐、席位、文件权限或 Scope 限制而不可用时，使用已配置的 `design-tokens.json`。若两者都不可用，则记录 Token QA 不可用，不伪造 Token 检查结果。
- 报告仅记录失败步骤、重试次数、时间和安全诊断信息，不记录密钥、授权请求头或原始凭据。

## 交付物与考试证据

每次运行必须生成：

- `design.png`：Figma Frame 导出的设计图；
- `implementation.png`：Playwright 截取的 Web 实现图；
- `annotated.png`：已标注问题位置的实现图；
- `report.md` 与 `report.html`：验收报告；
- `findings.json`：结构化问题结果；
- `run-log.json`：分步骤运行日志。

Level 3 申报时需准备以下三类截图：

1. GitLab Pipeline 定义和一个 `qa-targets.yml` 验收目标配置；
2. 一次成功 Job 日志，显示设计输入获取、代码 Token QA、Web 截图、Level 2 视觉 QA 和结果发布均已完成；
3. 自动发布的 GitLab MR Note 与 Artifact 报告，其中包含标注截图。

## 验证方式

- 单元测试覆盖配置校验、Token 规范化、严重程度分流、重试边界和报告生成。
- 本地 Fixture 测试使用确定性的设计图与实现图，验证报告文件和标注输出是否生成。
- 在提供 GitLab 项目凭据、Figma 访问权限和预览页面后，执行一次集成运行，验证真实的 Figma 导出、预览截图、MR Note、Artifact 上传和 P0/P1/P2 行为。

## 非目标

- 第一版不支持 iOS 或 Android 原生页面截图。
- 不做通用代码质量或安全扫描。
- 不自动修改 Figma Variables 或前端源码。
- 不试图取代对输入不明确或输入不可用场景中的人工设计审核。
