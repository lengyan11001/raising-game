# Vidu Live 接入文档

本文档面向需要接入 Vidu 实时数字人的商家。当前只支持 **Vidu 国际站**，不支持中国大陆站。所有商家 API 必须由服务端调用，API Token 不得下发到浏览器或客户端。

Base URL：

```text
https://live.123vipeak.com
```

---

## 1. 先选择模式

| 模式 | 能力归属 | 接入方式 | 适合场景 |
|---|---|---|---|
| `realtime` | Vidu 内置 ASR/LLM/TTS | 接入票 + iframe | 最快接入，使用 Vidu 一体化对话 |
| `component` | 平台提供 ASR/LLM/TTS/人设编排 | 接入票 + iframe | 使用平台角色、人格和音色能力 |
| `compute-relay` | 商家自建 ASR/LLM/TTS，平台只中转 Vidu 算力 | 商家 API + Relay WebSocket | 商家已有自己的语音和对话链路 |

`compute-relay` 不调用平台的 ASR、LLM、TTS、人设或主动消息逻辑。平台负责创建 Vidu 会话、返回 ARTC 观看信息、转发控制信令和音频，并按独立价格计费。

---

## 2. 鉴权

商家接口使用账号 API Token 或子 Token：

```http
Authorization: Bearer <merchant-api-token>
Content-Type: application/json
```

规则：

- 只能是 `api_token` 或 `subtoken`，普通登录会话和 iframe 浏览器 Token 无权调用商家 CRUD / 程序化会话 API。
- 每个商家的角色和会话相互隔离。
- Token 只放服务端；不要写进网页、移动端包或公开仓库。

---

## 3. 上传素材

角色形象图和 `looks`（换装/道具/背景）必须使用公网可访问的 HTTPS 图片。推荐先上传为平台素材，再传 `assetId`：

```http
POST /api/user-assets
Authorization: Bearer <merchant-api-token>
Content-Type: application/json

{
  "dataUrl": "data:image/png;base64,...",
  "fileName": "avatar.png",
  "name": "角色形象"
}
```

响应：

```json
{
  "ok": true,
  "asset": {
    "id": "asset_xxx",
    "name": "角色形象",
    "mime": "image/png"
  }
}
```

在角色接口中使用 `asset.id`，不要自行拼接 `asset://`。

---

## 4. 查询音色

```http
GET /api/embed/live/voices?provider=qwen_omni&q=Cindy&limit=50&offset=0
Authorization: Bearer <merchant-api-token>
```

响应：

```json
{
  "ok": true,
  "viduRegion": "overseas",
  "total": 1,
  "voices": [
    {
      "name": "Cindy",
      "voiceType": "Cindy",
      "provider": "qwen_omni",
      "desc": "温柔女声",
      "languages": "zh"
    }
  ]
}
```

创建角色时把返回的 `voiceType` 和 `provider` 填入 `voice`：

```json
{
  "voice": {
    "provider": "qwen_omni",
    "voiceType": "Cindy"
  }
}
```

地区限制由服务端处理：当前国际站会过滤掉国内专有音色。不要硬编码国内音色。

---

## 5. 角色 API

### 5.1 创建角色

```http
POST /api/embed/live/characters
Authorization: Bearer <merchant-api-token>
Content-Type: application/json

{
  "name": "林夏",
  "intro": "晚间电台主播，说话轻、会接话。",
  "persona": "你是林夏，语气温柔，回答短一些。",
  "avatarAssetId": "asset_xxx",
  "voice": {
    "provider": "qwen_omni",
    "voiceType": "Cindy"
  },
  "language": "zh",
  "defaultMode": "compute-relay",
  "looks": [
    {
      "kind": "garment",
      "name": "米色针织衫",
      "assetId": "asset_garment_xxx",
      "userText": "穿着米色针织衫"
    }
  ]
}
```

响应：

```json
{
  "ok": true,
  "character": {
    "id": "embedchar-0123456789abcdef01234567",
    "name": "林夏",
    "intro": "晚间电台主播，说话轻、会接话。",
    "persona": "你是林夏，语气温柔，回答短一些。",
    "avatarUrl": "https://cdn.example.com/avatar.png",
    "defaultMode": "compute-relay",
    "voice": {
      "provider": "qwen_omni",
      "voiceType": "Cindy"
    },
    "looks": []
  }
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 角色名称，最多 80 字 |
| `intro` / `persona` / `script` | 至少一个 | 角色介绍、人格或直接台词；最多 4000 字 |
| `avatarAssetId` 或 `imageUrl` | 是 | 角色形象图；推荐 `assetId` |
| `voice.provider` / `voice.voiceType` | 否 | 不传时使用当前可用默认音色 |
| `defaultMode` | 否 | `realtime` / `component` / `compute-relay` |
| `looks` | 否 | 最多 12 项；`kind` 只能是 `garment`、`object`、`background` |
| `language` | 否 | 语言代码，默认 `zh` |

`looks[].assetId` 与 `imageUrl` 二选一。推荐 `assetId`，服务端会校验归属并确保可公开访问。

### 5.2 列表

```http
GET /api/embed/live/characters?limit=50&offset=0
Authorization: Bearer <merchant-api-token>
```

只返回当前商家自己的角色。`limit` 最大 200。

### 5.3 获取单个角色

```http
GET /api/embed/live/characters/<characterId>
Authorization: Bearer <merchant-api-token>
```

### 5.4 更新角色

```http
PATCH /api/embed/live/characters/<characterId>
Authorization: Bearer <merchant-api-token>
Content-Type: application/json

{
  "name": "林夏（夜班）",
  "voice": {
    "provider": "qwen_omni",
    "voiceType": "Cindy"
  }
}
```

更新会保留原 `characterId`，可继续用于已保存的接入配置。`PUT` 与 `PATCH` 行为相同。

### 5.5 删除角色

```http
DELETE /api/embed/live/characters/<characterId>
Authorization: Bearer <merchant-api-token>
```

角色还有进行中的会话时返回 `409 VIDU_LIVE_CHARACTER_IN_USE`，需先结束会话。

---

## 6. 接入票 / iframe 嵌入

适用于 `realtime` 和 `component`：

```http
POST /api/embed/live/tickets
Authorization: Bearer <merchant-api-token>
Content-Type: application/json

{
  "externalUserId": "user-10001",
  "characterId": "embedchar-0123456789abcdef01234567",
  "mode": "component",
  "origin": "https://merchant.example.com",
  "user": {
    "name": "小夏",
    "avatarUrl": "https://merchant.example.com/user.png"
  }
}
```

响应：

```json
{
  "ok": true,
  "ticket": "elt1...",
  "expiresAt": "2026-11-10T12:00:00.000Z",
  "embedUrl": "https://live.123vipeak.com/embed?ticket=elt1...",
  "mode": "component",
  "character": {
    "id": "embedchar-0123456789abcdef01234567",
    "name": "林夏"
  }
}
```

前端把 `embedUrl` 放入 iframe：

```html
<iframe
  src="https://live.123vipeak.com/embed?ticket=elt1..."
  allow="camera; microphone; autoplay; fullscreen"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

接入票一次性使用，默认 10 分钟过期。`origin` 用于限制可嵌入页面；生产环境务必传入明确的 HTTPS 来源。

`compute-relay` 应使用程序化会话 API，而不是 iframe。

---

## 7. 程序化会话：compute-relay

```http
POST /api/embed/live/sessions
Authorization: Bearer <merchant-api-token>
Content-Type: application/json

{
  "externalUserId": "user-10001",
  "characterId": "embedchar-0123456789abcdef01234567",
  "mode": "compute-relay"
}
```

响应：

```json
{
  "ok": true,
  "session": {
    "id": "chatlive-relay-...",
    "mode": "compute-relay",
    "status": "waiting",
    "liveId": "...",
    "externalUserId": "user-10001",
    "characterId": "embedchar-0123456789abcdef01234567",
    "rtc": {
      "provider": "artc",
      "appId": "...",
      "channelId": "...",
      "userId": "...",
      "token": "..."
    },
    "relay": {
      "url": "wss://live.123vipeak.com/api/embed/live/sessions/.../relay?token=...",
      "protocol": "vidu-live-relay.v1",
      "pcm": {
        "format": "pcm_s16le",
        "sampleRate": 24000,
        "channels": 1,
        "frameBytes": 960
      }
    },
    "saleCreditsPerMinute": 120,
    "maxMinutes": 10,
    "billableStartedAt": "2026-11-10T10:00:00.000Z",
    "createdAt": "2026-11-10T10:00:00.000Z"
  },
  "character": {
    "id": "embedchar-0123456789abcdef01234567",
    "name": "林夏"
  }
}
```

说明：

- `externalUserId` 必填，只能包含字母、数字和 `_.:@-`，最长 120 字符。
- 同一商家同一 `externalUserId` 只保留一个进行中的 compute-relay 会话；重连会替换旧连接。
- `rtc` 包含 ARTC 观看信息，商家负责拉流播放数字人画面。
- `relay.url` 只用于该会话，Token 有过期时间，不要公开。
- 程序化会话只支持 `compute-relay`；传 `realtime` 或 `component` 返回 `422 VIDU_LIVE_MODE`。

### 查询会话

```http
GET /api/embed/live/sessions/<sessionId>
Authorization: Bearer <merchant-api-token>
```

响应包含公开会话字段和 `relayActive`，用于判断 Relay WebSocket 是否在线。

### 结束会话

```http
POST /api/embed/live/sessions/<sessionId>/end
Authorization: Bearer <merchant-api-token>
Content-Type: application/json

{
  "reason": "merchant_end"
}
```

服务端会关闭 Relay、通知上游挂断并结算。

---

## 8. Relay WebSocket

连接会话响应中的 `relay.url`：

```js
const ws = new WebSocket(session.relay.url);
```

### 8.1 PCM 音频约定

- 格式：`pcm_s16le`
- 采样率：`24000 Hz`
- 声道：单声道
- 每帧：`960 bytes`，即 20ms
- 只发送二进制 PCM 帧。
- 必须先发 `speech.start`，收到 `speech.accepted` 后才能发 PCM。
- 一帧最大 256 KiB；最后一帧必须为偶数长度。

### 8.2 客户端指令

所有文本消息都是 JSON，必须带 `type`。

#### `speech.start`

让角色开始说一段话。平台会把文本转发给 Vidu 并生成对应语音动作。

```json
{
  "type": "speech.start",
  "requestId": "say-001",
  "text": "你来啦，今天过得怎么样？",
  "audio": {
    "format": "pcm_s16le",
    "sampleRate": 24000,
    "channels": 1
  },
  "action": {
    "name": "wave",
    "emotion": "happy",
    "intensity": 1
  }
}
```

`text` 必填，最多 4000 字；`action` 可选。响应事件：`speech.accepted`。

如果商家自己的 TTS 已经生成 PCM，则先发 `speech.start`（`text` 可填同段文本，用于口型/动作），再发送 PCM；`speech.end` 表示发送结束。

#### `user.text`

把用户文本送入 Vidu 的文本输入通道：

```json
{
  "type": "user.text",
  "requestId": "user-001",
  "text": "今天有点累。"
}
```

#### `speech.end`

结束当前音频输入：

```json
{
  "type": "speech.end",
  "requestId": "speech-001"
}
```

事件：`speech.ended`。

#### `speech.cancel`

打断当前发言/输入：

```json
{
  "type": "speech.cancel",
  "requestId": "speech-002"
}
```

事件：`speech.cancelled`。

#### `look.switch`

切换服装、道具或背景：

```json
{
  "type": "look.switch",
  "requestId": "look-001",
  "look": {
    "kind": "garment",
    "imageUrl": "https://cdn.example.com/coat.png",
    "imageId": "coat-001",
    "userText": "换上一件米色针织衫"
  }
}
```

`kind` 只能是 `garment`、`object`、`background`；图片必须是公网 HTTPS。同一时间只允许一个 look 操作，冲突返回 `LOOK_BUSY`。

#### `look.remove`

移除当前 look：

```json
{
  "type": "look.remove",
  "requestId": "look-002",
  "look": {
    "kind": "background"
  }
}
```

事件：`look.result`。

#### `session.hangup`

主动结束会话：

```json
{
  "type": "session.hangup",
  "reason": "merchant_end"
}
```

事件：`session.ended`。服务端也会关闭上游连接。

### 8.3 服务端事件

| 事件 | 说明 |
|---|---|
| `session.ready` | Relay 已连上 Vidu，包含音频约定；收到后才能发送依赖上游的指令 |
| `speech.accepted` | 已接受 `speech.start` |
| `speech.ended` | 音频输入已结束 |
| `speech.cancelled` | 音频输入已取消 |
| `speech.text` | 文字消息；`role` 为 `user` 或 `assistant` |
| `look.result` | 换装/背景操作结果 |
| `session.ended` | 会话结束，含 `reason` |
| `upstream.closed` | 上游异常关闭 |
| `error` | Relay 指令或音频错误，含 `code`、`message` |

示例：

```json
{
  "type": "session.ready",
  "liveId": "...",
  "sessionId": "chatlive-relay-...",
  "audio": {
    "format": "pcm_s16le",
    "sampleRate": 24000,
    "channels": 1,
    "frameBytes": 960
  }
}
```

```json
{
  "type": "speech.text",
  "role": "assistant",
  "text": "我在，慢慢说。",
  "messageId": "..."
}
```

---

## 9. 计费

`compute-relay` 使用独立价格：

- `computeRelayCostCreditsPerMinute`：后台成本，仅参考。
- `computeRelaySaleCreditsPerMinute`：商家实际扣费价格。

行为：

1. 创建会话前先校验售价；未配置或为 0 时失败关闭，返回 `503 VIDU_LIVE_PRICING_MISSING`，不会创建上游会话。
2. 创建前先预占首段费用；余额不足返回 `402 VIDU_LIVE_INSUFFICIENT_CREDITS`。
3. 上游创建失败会回滚预占。
4. 会话结束后按 Vidu 返回的 `billed_seconds` 结算。
5. 余额不足时服务端关闭 Relay 并结束会话。
6. 所有扣费记录都带 `externalUserId`，便于商家对账。

不要用 `realtime` 或 `component` 的价格估算 compute-relay。

---

## 10. 错误码

| Code | HTTP | 说明 |
|---|---:|---|
| `VIDU_LIVE_MERCHANT_TOKEN_REQUIRED` | 403 | 必须使用商家 API Token 或子 Token |
| `VIDU_LIVE_USER` | 422 | `externalUserId` 缺失或格式错误 |
| `VIDU_LIVE_CHARACTER` | 422 | 角色字段不完整或格式错误 |
| `VIDU_LIVE_CHARACTER_NOT_FOUND` | 404 | 角色不存在或不属于当前商家 |
| `VIDU_LIVE_CHARACTER_IN_USE` | 409 | 角色还有进行中的会话 |
| `VIDU_LIVE_ASSET_NOT_FOUND` | 404 | 素材不存在或不属于当前商家 |
| `VIDU_LIVE_LOOKS_LIMIT` | 422 | looks 超过 12 项 |
| `VIDU_LIVE_LOOK_KIND` | 422 | looks kind 不支持 |
| `VIDU_LIVE_MODE` | 422 | 程序化会话只能使用 compute-relay |
| `VIDU_LIVE_PRICING_MISSING` | 503 | compute-relay 售价未配置，失败关闭 |
| `VIDU_LIVE_INSUFFICIENT_CREDITS` | 402 | 余额不足以预留首段 |
| `VIDU_LIVE_INTERNATIONAL_ONLY` | 503 | 当前配置为国内站，拒绝 compute-relay |
| `VIDU_NOT_CONFIGURED` | 503 | Vidu 国际站凭据未配置 |
| `VIDU_LIVE_RTC_NOT_CONFIGURED` | 503 | ARTC 未配置 |
| `VIDU_LIVE_NO_LIVE_ID` | 502 | 上游未返回会话 ID，已回滚预占 |
| `VIDU_LIVE_SESSION_NOT_FOUND` | 404 | 会话不存在或不属于当前商家 |

Relay 错误会以 WebSocket `error` 事件返回，例如：

- `INVALID_JSON`
- `INVALID_COMMAND`
- `INVALID_AUDIO`
- `INVALID_PCM`
- `PCM_TOO_LARGE`
- `SPEECH_NOT_STARTED`
- `NOT_READY`
- `TEXT_REQUIRED`
- `INVALID_LOOK`
- `LOOK_BUSY`
- `UNKNOWN_COMMAND`

---

## 11. 安全要求

- API Token 只在服务端使用。
- Relay URL 是短期凭证，不要写入日志、前端全局状态或公开页面。
- `externalUserId` 应是商家自己的稳定用户 ID，不要使用手机号、邮箱等敏感明文。
- 生产环境把 iframe `origin` 限制到商家域名。
- 音视频和 ARTC Token 不要跨会话复用。
- 发现 Relay 异常时先调用结束接口，避免继续计费。

---

## 12. 完整 Node.js 示例

以下示例假设 Node.js 18+，仅演示服务端流程。播放 ARTC 需要商家自己的 ARTC Web SDK；浏览器端拿到 `session.rtc` 后拉流。

```js
const API = "https://live.123vipeak.com";
const TOKEN = process.env.VIDU_MERCHANT_API_TOKEN;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${payload.code || ""} ${payload.message || ""}`);
  return payload;
}

async function main() {
  const { character } = await api("/api/embed/live/characters", {
    method: "POST",
    body: JSON.stringify({
      name: "林夏",
      intro: "晚间电台主播，说话轻、会接话。",
      persona: "你是林夏，语气温柔，回答短一些。",
      avatarAssetId: process.env.AVATAR_ASSET_ID,
      voice: { provider: "qwen_omni", voiceType: "Cindy" },
      defaultMode: "compute-relay",
    }),
  });

  const { session } = await api("/api/embed/live/sessions", {
    method: "POST",
    body: JSON.stringify({
      externalUserId: "user-10001",
      characterId: character.id,
      mode: "compute-relay",
    }),
  });

  console.log("ARTC viewer:", session.rtc);

  const ws = new WebSocket(session.relay.url);
  let ready = false;

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "session.ready") {
      ready = true;
      ws.send(JSON.stringify({
        type: "speech.start",
        requestId: "say-001",
        text: "你来啦，今天过得怎么样？",
        audio: { format: "pcm_s16le", sampleRate: 24000, channels: 1 },
      }));
    }
    if (message.type === "error") console.error("relay error", message);
    if (message.type === "session.ended") console.log("ended", message.reason);
  });

  ws.addEventListener("open", () => {
    console.log("relay connected");
  });

  // 商家自建 TTS 时：在 speech.accepted 后按 960-byte PCM 帧发送。
  // ws.send(Buffer.from(pcmChunk));

  process.on("SIGINT", async () => {
    try {
      ws.send(JSON.stringify({ type: "session.hangup", reason: "merchant_end" }));
      await api(`/api/embed/live/sessions/${encodeURIComponent(session.id)}/end`, {
        method: "POST",
        body: JSON.stringify({ reason: "merchant_end" }),
      });
    } finally {
      process.exit(0);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```
