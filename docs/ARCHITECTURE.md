# 个人知识与复习工作台：架构审核稿

## 1. 项目目标

构建一个本地优先的个人学习工作台，包含三个入口：

1. **个人主页**：今日学习与复习任务、个人记录、学习和复习进度日历、环形进度图。
2. **大脑外置**：保存 Markdown 知识，查看知识图谱；新增知识时由 API 辅助提取主题和候选关系，并可据此生成学习计划。
3. **复习工具**：为新旧知识创建复习项目，通过本地 FSRS 调度生成复习日期并记录复习结果。

应用采用单用户、本机运行作为首个版本的默认范围。数据保存在本地文件和 SQLite 中；LLM/API 用于知识理解和计划建议，复习排期在本地计算。

## 2. 目录骨架：按页面拆分

```text
brainCode/
├── README.md
├── docs/
│   └── ARCHITECTURE.md
├── frontend/
│   └── src/
│       ├── app/            # 路由、应用级布局与入口
│       ├── pages/
│       │   ├── home/       # 个人主页：任务、个人记录、进度图表
│       │   │   ├── api/    # 首页专属 API
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   └── styles/
│       │   ├── brain/      # 大脑外置：笔记、知识图谱、学习计划
│       │   │   ├── api/    # 笔记/图谱/计划 API
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   └── styles/
│       │   └── review/     # 复习工具：卡片、复习会话、排期
│       │       ├── api/    # 复习 API
│       │       ├── components/
│       │       ├── hooks/
│       │       └── styles/
│       └── shared/         # 页面间复用的组件、API 客户端、hooks 和样式
│           ├── api/
│           ├── components/
│           ├── hooks/
│           └── styles/
├── backend/
│   └── src/
│       ├── main/java/      # Spring Boot 应用和业务模块
│       ├── main/resources/ # 配置、数据库迁移等资源
│       └── test/java/      # 后续测试
└── data/
    ├── notes/              # Obsidian 兼容 Markdown 正文
    ├── lucene/             # 可重建的本地检索索引
    └── exports/            # 日历等导出文件
```

前端三个页面各自维护页面组件、状态/hooks、接口封装和样式；只有多个页面都会使用的能力才放入 `shared/`。跨页导航由 `app/` 统一管理。后端按业务领域组织服务，不让前端页面目录结构反向决定数据库或服务边界。当前已实现 MVP 源码和构建配置；笔记正文、SQLite 和 Lucene 索引运行时生成在 `data/`。

## 3. 技术边界建议

| 层 | 建议 | 说明 |
|---|---|---|
| 前端 | Vite 8 + React 19 + React Flow 12 | 已确认。React Flow 用于可交互知识图谱；三个页面独立维护，路由和共享 UI 集中管理。Vite 需要 Node.js 20.19+ 或 22.12+。 |
| 后端 | Java 17+、Maven、Spring Boot 3.5 | 使用 Spring Web 提供 JSON API，Spring JDBC 访问 SQLite。 |
| 数据库 | SQLite + SQLite JDBC | 存结构化元数据、图谱节点和边、复习状态、计划与用户配置。 |
| 笔记 | Markdown 文件 + commonmark-java | 笔记正文以文件保存，数据库存路径、标题、时间和索引状态等元数据。 |
| 知识检索 | Apache Lucene 9 本地全文索引 | 首版用 CJK 分词做关键词/全文检索；当数据量和使用场景需要时再评估语义向量检索与本地 embedding。索引从 Markdown 重建。 |
| 关系和计划建议 | Ollama + DeepSeek API | 已确认两种接入方式。后端统一提供模型适配接口，配置选择提供方；密钥只从本机配置读取。 |
| 复习调度 | FSRS Java 库候选：`io.github.open-spaced-repetition:fsrs:1.0.0` | 初步评估后优先采用现成库；封装本地调度适配层，复习算法不依赖 LLM/API，持久化每张卡片状态和复习日志。 |
| 日历导出 | ical4j | 复习/学习计划确认后导出 `.ics`。 |

**未纳入首版建议**：Thymeleaf/Quartz 博客服务端渲染。当前需求是交互式个人工作台，Vite SPA 已足够；笔记可先由应用内页面渲染 Markdown。

### FSRS Java 库初步评估

官方 `open-spaced-repetition/java-fsrs` 仓库提供 Maven Central 包 `io.github.open-spaced-repetition:fsrs:1.0.0`，采用 MIT 许可证并以 Java 17 编译。公开文档展示了 Again/Hard/Good/Easy 评分、学习/重学步骤、期望保留率、最大间隔、模糊间隔和 JSON 序列化，覆盖首版调度需求。库内部使用 UTC，且目前不支持参数优化。项目已通过 `FsrsReviewScheduler` 适配层接入；调度保存 UTC instant，并将下次日期转换为 Asia/Shanghai 展示。参数优化暂不需要，可后续有足够复习数据后再评估。[Java-FSRS 文档](https://github.com/open-spaced-repetition/java-fsrs)

## 4. 后端业务模块

- `dashboard`：个人主页的今日任务聚合、学习/复习统计、日历热力数据和环形图数据。
- `brain`：大脑外置的 Markdown 笔记、知识节点/边、Lucene 全文检索、关系建议及学习计划草案。
- `review`：新旧知识建卡、FSRS 状态更新、复习日志、下次复习时间。
- `calendar`：将确认的学习/复习任务导出为 `.ics`。
- `ai`：Ollama 与 DeepSeek 调用适配、提示词/结构校验和超时错误处理。
- `settings`：本机模型提供方、模型地址和模型名称等配置（不向前端返回密钥）。

## 5. 主要数据对象（概念层）

- **Note**：ID、标题、相对文件路径、标签、创建/更新时间、索引状态。
- **KnowledgeNode**：关联 Note 的知识节点、显示名称、摘要/主题信息。
- **KnowledgeEdge**：起点、终点、关系类型、来源（用户确认或模型建议）、置信信息。
- **StudyPlan / PlanDay / Task**：目标、期限、期望掌握程度、每日时长和任务状态。
- **ReviewCard / ReviewLog**：知识关联、FSRS 调度状态、每次评分和复习时间。
- **DailyRecord / UserConfig**：个人记录及本地偏好设置。

图谱边的模型建议应作为候选展示，用户确认后再写入正式关系，避免模型输出直接改坏图谱。

## 6. 关键交互和数据流

### 新增知识并关联图谱

用户输入标题和 Markdown 正文 → 后端保存笔记 → 更新 Lucene 索引 → 检索相似旧笔记/节点 → 调用配置的模型生成关系候选和理由 → 前端展示候选 → 用户确认/编辑 → 写入节点与边。

### 从新知识生成学习计划

用户选择“创建学习计划” → 输入计划天数和目标掌握程度 → 后端结合新笔记、已确认关联知识及现有复习任务，请 Ollama 或 DeepSeek 生成每日工作内容和时长草案 → 后端检查日期、时长和任务结构 → 用户审核并确认 → 保存计划和任务；若需复习卡片，交由 FSRS 计算排期。模型只生成草案，最终由用户确认。

### 复习

用户选择知识并回答是否学过 → 创建/找到 ReviewCard → 展示待复习内容 → 用户提交回忆评分 → 本地 FSRS 更新状态和下次日期 → 更新首页任务及进度。

## 7. HTTP API 草案

接口前缀暂定 `/api`，具体请求/响应字段在实现前另行定稿。

| 路径 | 用途 |
|---|---|
| `GET /api/dashboard` | 今日任务、统计、日历和进度摘要 |
| `GET/POST /api/notes`、`GET/PUT/DELETE /api/notes/{id}` | 笔记列表与维护 |
| `GET /api/knowledge/graph` | 获取全图或指定节点的邻接子图 |
| `POST /api/knowledge/suggestions` | 为新增笔记生成关联候选 |
| `POST /api/knowledge/edges` | 保存用户确认的关系 |
| `POST /api/plans/drafts`、`POST /api/plans/{id}/confirm` | 生成并确认学习计划草案 |
| `GET/POST /api/reviews` | 获取待复习项、创建复习卡片 |
| `POST /api/reviews/{id}/answer` | 提交评分并计算下一次复习日期 |
| `GET /api/calendar/export.ics` | 导出学习/复习任务 |

## 8. 已确认的选择

1. 前端使用 React + React Flow，三个页面独立拆分。
2. AI 提供方接入 Ollama 和 DeepSeek。
3. 首版使用 Lucene 全文检索；数据规模增大后再评估向量检索。
4. 学习计划由模型生成草案，后端校验，用户确认。
5. FSRS 首选官方 Java 库，并封装本地调度适配层。
6. 首版不做单独的备份/恢复和数据目录配置功能。

## 9. 实施顺序建议（审核通过后）

1. 生成 Spring Boot Maven 项目和 Vite React 项目，打通本地启动与 `/api` 联调。
2. 按页面逐项实现：首页、复习工具、大脑外置，并通过共享组件复用通用 UI。
3. 定义 SQLite 表和 Markdown 文件存储规则，实现笔记增删改查。
4. 接入 FSRS Java 库，验证本地时区与 UTC 日期边界，再接首页任务聚合。
5. 实现 Lucene 全文检索、图谱视图和关系候选确认流程。
6. 接入 Ollama/DeepSeek 并生成可审核的学习计划草案。
7. 补充进度图表和日历导出。

首页的颜色、字体、布局和个性化视觉风格暂不定稿，等你后续提供风格方向后再设计。
