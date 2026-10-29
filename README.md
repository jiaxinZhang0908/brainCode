# 个人知识与复习工作台

当前已进入 MVP 实现阶段，前后端主要页面与数据流已落地。整体方案见 [架构说明](docs/ARCHITECTURE.md)。

## 本地运行

需要 Java 17+、Maven，以及 Node.js 20.19+ 或 22.12+。

1. 在项目根目录启动后端：

   ```powershell
   mvn -f backend/pom.xml spring-boot:run
   ```

2. 新开终端安装并启动前端：

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

3. 浏览器打开 `http://localhost:5173`。SQLite、Markdown 笔记和 Lucene 索引保存在根目录 `data/` 下。

默认模型是本地 Ollama（`http://localhost:11434`，模型名可用 `OLLAMA_MODEL` 配置）。使用 DeepSeek 时，在启动后端的 PowerShell 中设置：

```powershell
$env:DEEPSEEK_API_KEY = "你的 API Key"
$env:BRAINCODE_AI_PROVIDER = "deepseek"
mvn -f backend/pom.xml spring-boot:run
```

也可以在“大脑外置”页面的模型选择器中切换提供方。DeepSeek 密钥只从后端环境变量读取。

## 当前目录

```text
backend/       Spring Boot 后端预留目录
frontend/      Vite + React 前端，按 home、brain、review 三个页面拆分
backend/       Spring Boot + JDBC API
data/          本地数据目录（Markdown、SQLite、Lucene 索引）
docs/          架构和开发文档
```
