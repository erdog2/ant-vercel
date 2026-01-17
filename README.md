# Antigravity Proxy

OpenAI / Claude / Gemini API 兼容的代理服务，可直接部署到 Vercel。

## ✨ 特性

- 🔄 **多协议支持**：兼容 OpenAI、Claude、Gemini 三种 API 协议
- 🔁 **账号轮换**：自动在多个 Google 账号间轮换，提升可用性
- 🔑 **Token 自动刷新**：Access Token 过期前自动刷新
- ⚡ **流式响应**：完整支持 SSE 流式输出
- 🌐 **Edge Runtime**：全球边缘部署，低延迟响应
- 🎨 **简洁 UI**：内置状态页面和 API 文档

## 🚀 快速部署

### 1. Fork 仓库

点击 GitHub 右上角的 Fork 按钮。

### 2. 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. 导入你 Fork 的仓库
2. 设置环境变量（见下文）
3. 点击 Deploy

### 3. 配置环境变量

在 Vercel 项目设置中添加以下环境变量：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `PROXY_API_KEY` | ✅ | 客户端使用的 API Key |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth Client Secret |
| `ACCOUNTS_JSON` | ✅ | 账号列表 JSON（见下文格式） |
| `MODEL_MAPPING_JSON` | ❌ | 自定义模型映射 |

#### ACCOUNTS_JSON 格式

```json
[
  {
    "id": "uuid-1234",
    "email": "user@example.com",
    "subscription_tier": "PRO",
    "token": {
      "access_token": "ya29.xxx",
      "refresh_token": "1//xxx",
      "expires_in": 3600,
      "expiry_timestamp": 1704067200
    }
  }
]
```

> 💡 **提示**：可以从 Antigravity Manager 桌面应用导出账号信息。

## 📖 API 使用

### 基础 URL

部署成功后，你的 API 基础地址为：
```
https://your-project.vercel.app/api
```

### OpenAI 兼容 API

```bash
curl -X POST https://your-project.vercel.app/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Claude 兼容 API

```bash
curl -X POST https://your-project.vercel.app/api/v1/messages \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Gemini 原生 API

```bash
curl -X POST https://your-project.vercel.app/api/v1beta/models/gemini-1.5-pro:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "Hello!"}]}]
  }'
```

## 🔧 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量模板
cp .env.example .env.local

# 编辑 .env.local 填入配置

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 查看状态页面。

## 📝 支持的模型

### OpenAI 格式（自动映射到 Gemini）

| 请求模型 | 实际使用 |
|----------|----------|
| gpt-4 | gemini-1.5-pro |
| gpt-4-turbo | gemini-1.5-pro |
| gpt-4o | gemini-1.5-pro |
| gpt-4o-mini | gemini-1.5-flash |
| gpt-3.5-turbo | gemini-1.5-flash |

### Claude 格式（自动映射到 Gemini）

| 请求模型 | 实际使用 |
|----------|----------|
| claude-3-opus-* | gemini-1.5-pro |
| claude-3-sonnet-* | gemini-1.5-pro |
| claude-3-haiku-* | gemini-1.5-flash |

### Gemini 原生

直接使用 Gemini 模型名称：
- gemini-1.5-pro
- gemini-1.5-flash
- gemini-2.0-flash-exp
- gemini-2.0-flash-thinking-exp

## ⚠️ 注意事项

1. **API Key 安全**：不要在客户端代码中暴露 API Key
2. **账号安全**：ACCOUNTS_JSON 包含敏感信息，请妥善保管
3. **使用限制**：请遵守 Google AI Studio 的使用政策
4. **冷启动**：Vercel Serverless 函数可能有冷启动延迟

## 📄 License

MIT License

---

Made with ❤️ by Antigravity Team
