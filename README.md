# 脑内花园 · BrainCode

一个完全跑在本地的个人知识与复习工作台：把零散的想法写成知识节点，用图谱把它们连起来，再交给 FSRS 安排下一次复习。

前后端分离，数据全部保存在本机磁盘（默认项目所在磁盘的 `data/` 目录，即 D 盘），不依赖任何云服务。

## 功能

**今日主页**
- 雨滴玻璃场景 + 每日记录（文字 / 图片）
- 学习日历面板（`calendar.html`）

**大脑外置（知识图谱）**
- 新增 / 编辑 / 删除知识，自动生成图谱节点
- 拖拽节点、滚轮缩放、小地图总览，位置保存在浏览器本地
- 手动连线，或让 AI 分析新知识与已有知识的关联
- 知识助理对话：按问题检索最相关的知识条目作为上下文

**复习工具**
- 基于 FSRS 的本地排期，支持「忘记 / 困难 / 记得 / 轻松」四档评分
- 90 天复习日程图、单卡未来排期推演、挂起与恢复
- 一键导出 iCalendar（`.ics`）

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19、Vite 8、React Router 7、@xyflow/react（图谱） |
| 后端 | Spring Boot 3.5、Spring JDBC、SQLite |
| 搜索 | Apache Lucene 9（CJK 分词，本地全文检索） |
| 排期 | FSRS（`open-spaced-repetition`） |
| 模型 | DeepSeek（云端，默认）或 Ollama（本地，可选） |

## 快速开始

环境要求：JDK 17+、Maven 3.9+、Node.js 20.19+ 或 22.12+。

```powershell
# 1. 启动后端（默认 http://localhost:8080）
mvn -f backend/pom.xml spring-boot:run

# 2. 新开一个终端启动前端（http://localhost:5173）
cd frontend
npm install
npm run dev
```

打开 `http://localhost:5173` 即可。首次启动会自动创建数据库、Markdown 目录和 Lucene 索引。

后端默认只监听 `127.0.0.1`，同一局域网的其他设备无法访问，个人数据不会暴露到网络上。

### 使用 DeepSeek（默认）

```powershell
$env:DEEPSEEK_API_KEY = "你的 API Key"
mvn -f backend/pom.xml spring-boot:run
```

API Key 只在后端读取，不会下发到浏览器。

### 使用 Ollama（可选，完全离线）

```powershell
ollama pull qwen2.5:7b
$env:BRAINCODE_AI_PROVIDER = "ollama"
$env:OLLAMA_MODEL = "qwen2.5:7b"
mvn -f backend/pom.xml spring-boot:run
```

## 数据存储

所有数据都在本地，默认落在**项目所在磁盘**的 `data/` 下。项目在 D 盘时即 `D:\brainCode\data`：

```text
data/
├─ braincode.db     SQLite：笔记元数据、知识节点/连线、复习卡与日志、计划、记录
├─ notes/           每条知识一个 Markdown 文件
└─ lucene/          全文索引
```

想换位置（例如统一放到 `D:\braincode-data`），启动前设置环境变量即可：

```powershell
$env:BRAINCODE_DATA_DIR = "D:\braincode-data"
mvn -f backend/pom.xml spring-boot:run
```

> 备份只需复制整个数据目录。`data/` 已在 `.gitignore` 中排除，不会被提交。

## 配置项

均通过环境变量覆盖，默认值见 [application.properties](backend/src/main/resources/application.properties)。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `BRAINCODE_DATA_DIR` | `./data` | 数据根目录（数据库、笔记、索引） |
| `BRAINCODE_AI_PROVIDER` | `deepseek` | 默认模型提供方：`deepseek` / `ollama` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama 地址 |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Ollama 模型名 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek 地址 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek 模型名 |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek Key，为空时不可用 |
| `BRAINCODE_WEB_SEARCH` | `true` | 关联分析时是否检索网页做事实核对 |

## 省 token 的设计

模型调用按需触发，并设有明确预算，避免每次对话都塞入整个知识库：

- **对话按需检索**：先用本地 Lucene 找出与提问最相关的笔记，最多取 8 条、总计约 4000 字符；历史消息只带最近 6 轮。
- **关联分析先降噪**：本地相似度打分把候选压缩到 12 条，再交给模型确认，而不是把全部笔记都发过去。
- **结果复用**：按「笔记内容 + 候选数量」生成指纹存入节点，内容没变时直接复用上次分析，不再调用模型。
- **跳过空转**：知识库只有一条笔记、或没有候选时，不发起模型请求。
- **网页检索可选**：摘要仅保留 3 条、每条 200 字，可用 `BRAINCODE_WEB_SEARCH=false` 关闭。
- **本地优先**：默认使用 DeepSeek；切换到 Ollama 后完全离线，不产生云端费用。

## 目录结构

```text
backend/
  src/main/java/local/braincode/
    ai/          模型调用（Ollama / DeepSeek）
    brain/       知识笔记、图谱、本地全文索引
    review/      FSRS 复习排期
    plans/       学习计划
    dashboard/   主页数据、每日记录、相册
    calendar/    iCalendar 导出
    config/      CORS 与统一错误处理
  src/main/resources/
    application.properties
    schema.sql
frontend/
  src/
    app/         应用外壳与路由
    pages/       home / brain / review
      brain/lib/ 图谱布局、会话存储
    shared/      API 客户端、通用组件、Markdown 渲染
docs/            架构说明
```

图谱布局与会话状态各自独立在 `pages/brain/lib/`，页面组件只负责交互与渲染；节点位置只记录用户真实拖动过的坐标，自动布局不会回写缓存。

## API 速览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/notes?q=` | 笔记列表 / 全文检索 |
| `POST` | `/api/notes` | 新建笔记（同时创建图谱节点） |
| `GET` | `/api/knowledge/graph` | 知识图谱节点与连线 |
| `POST` | `/api/knowledge/suggestions` | AI 关联分析 |
| `POST` | `/api/knowledge/chat` | 知识助理对话 |
| `GET` | `/api/reviews/schedule?days=` | 复习日程 |
| `POST` | `/api/reviews/{id}/answer` | 提交复习评分 |
| `GET` | `/api/calendar/export.ics` | 导出日历 |

## 常见问题

**前端报跨域错误**：后端默认只允许 `http://localhost:5173`。改用其他端口时，请同步修改 [WebConfig.java](backend/src/main/java/local/braincode/config/WebConfig.java)。

**AI 功能不可用**：默认走 DeepSeek，需设置 `DEEPSEEK_API_KEY` 并重启后端；改用 Ollama 时需先启动服务并拉取模型。知识保存本身不受影响，只是关联分析会提示暂不可用。

**想清空图谱重新开始**：停止后端，删除 `data/` 目录再启动。注意这会连同笔记一起删除。

更完整的设计说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## License

MIT
# brainCode
