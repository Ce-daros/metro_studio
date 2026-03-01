# lib/ai

AI 能力调用封装。

## 文件说明

- **aiConfig.js** — AI 配置管理（Base URL 和 API Key），配置存储在 localStorage，提供获取、保存、清除和验证函数
- **openrouterClient.js** — 统一 Chat Completions 请求（`postLLMChat`），优先从 localStorage 读取配置，支持超时/取消/鉴权/错误处理
- **stationNaming.js** — 站点英文名称翻译。调用兼容 OpenAI 格式的 API（默认模型 `gemini-2.5-flash`）。支持单站点和批量接口。
- **stationEnTranslator.js** — 分批重译全图英文站名，输出进度回调（done/total/percent）。使用 `response_format(json_schema)` 降低批量翻译格式漂移；进度统计按真实 chunk 站点数累加，失败分支也不会超算到 100% 以上。

## 配置说明

AI 配置通过应用内设置界面配置（菜单栏 → 设置 → AI 配置），配置信息保存在浏览器 localStorage 中，键名为 `railmap_ai_config`。

配置结构：
```javascript
{
  baseUrl: 'https://api.bltcy.ai',
  apiKey: 'sk-...'
}
```

配置读取顺序：
1. localStorage 中的用户配置
2. 环境变量 `VITE_BLTCY_API_BASE` / `BLTCY_API_BASE`（用于本地开发）
3. 环境变量 `VITE_BLTCY_API_KEY` / `BLTCY_API_KEY` / `VITE_LLM_API_KEY` / `LLM_API_KEY`（用于本地开发）
4. 默认值 `https://api.bltcy.ai`
