# Mulerouter API 对接梳理（W3.0 版，2026-09-28 文档 + 线上实测）

> 本文档梳理 Mulerouter 平台对外 API（桌面《Mulerouter API 地址汇总 0928 (w3.0).html》），并标注 2026-10-21 线上实测结果。供技术对接使用，不对外发布。
>
> 文档版本：2026-09-28 · W3.0 版 · 共 15 个模型（6 个新增）

---

## 1. 基础信息

| 项目 | 值 |
|------|-----|
| API 基础域名 | `https://api.mulerouter.ai` |
| 文档站点 | `https://www.mulerouter.ai` |
| Dashboard / 用量 | `https://www.mulerouter.ai/app/usage` |
| 认证方式 | Bearer Token |
| 认证 Header | `Authorization: Bearer <API_KEY>` |
| Content-Type | `application/json` |

所有异步模型走同一流程：POST `/generation` 拿 `task_id` → 轮询 `GET /generation/{task_id}` 直到 `completed` → 下载 `output.url` → 按需 `DELETE /generation/{task_id}`。

**实测确认**：以上基础信息全部有效；API Key 鉴权通过；提交空参数返回 400 参数校验（说明端点真实存在）。

---

## 2. 视频生成（8 个模型）

### 2.1 W3.0 系列（4 个端点，请求契约完全一致，差异仅在分辨率档位/速度/定价）

| 模型 | slug | 分辨率档位 | 实测 |
|------|------|-----------|------|
| W3.0（标准慢速版） | `w3.0-video` | 480p / 720p / 1080p | ✅ 存在；首帧+尾帧提交被接受 |
| **W3.0-Pro（标准慢速版）🆕** | `w3.0-video-pro` | **1080p / 2k / 4k** | ✅ 存在；**2k/4k 实测提交成功并 completed 产出 mp4**（4k 任务实测完成，2k 任务处理中） |
| W3.0-Prime（Prime 版） | `w3.0-video-prime` | 480p / 720p / 1080p | ✅ 存在 |
| W3.0-VSR-Prime（Prime 版）🆕 | `w3.0-video-prime-pro` | **1080p / 2k / 4k** | ✅ 存在 |

**统一端点路径**：`https://api.mulerouter.ai/vendors/carrothub/v1/{slug}/generation`

**完整端点 URL（4 个 W3.0 端点）**
- W3.0：`https://api.mulerouter.ai/vendors/carrothub/v1/w3.0-video/generation`
- W3.0-Pro：`https://api.mulerouter.ai/vendors/carrothub/v1/w3.0-video-pro/generation`
- W3.0-Prime：`https://api.mulerouter.ai/vendors/carrothub/v1/w3.0-video-prime/generation`
- W3.0-VSR-Prime：`https://api.mulerouter.ai/vendors/carrothub/v1/w3.0-video-prime-pro/generation`


**通用参数（4 端点一致）**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| prompt | string | 条件 | — | 最长 20000 字符（超长上游截断，不拒绝）；与关键帧/参考输入至少提供其一 |
| first_frame | string | 否 | — | 首帧图，仅 1 张；URL / data URI / Base64；关键帧模式，不可与参考模式混用 |
| last_frame | string | 否 | — | 尾帧图，仅 1 张；同 first_frame |
| reference_images | string[] | 否 | — | 参考图，最多 10 张；prompt 中以 "Image 1"、"Image 2" 索引 |
| reference_videos | string[] | 否 | — | 参考视频，最多 5 个、总时长 ≤15s；仅 URL（.mp4/.mov） |
| reference_audios | string[] | 否 | — | 参考音频，最多 5 个、总时长 ≤15s；仅 URL（.wav/.mp3） |
| file | string | 否 | — | 文档素材 URL（docx/doc/xlsx/xls/pptx/ppt/pdf/txt/key/pages/numbers/md），≤100MB；PDF/DOC/PPT 限 50 页；与 link 互斥 |
| link | string | 否 | — | 公开网页 URL（需免认证可访问）；与 file 互斥 |
| resolution | string | 否 | 1080p | 标准版：480p/720p/1080p；Pro 版：1080p/2k/4k（大小写不敏感） |
| ratio | string | 否 | adaptive | adaptive / 16:9 / 4:3 / 1:1 / 3:4 / 9:16 |
| duration | integer | 否 | 5 | 输出时长 2–30 秒整数，或 -1（智能时长）；带参考视频输入时输入+输出合计 ≤30s |
| audio | boolean | 否 | true | 是否输出音轨；不影响计费 |
| seed | integer/null | 否 | — | 0–2147483647；null 自动生成 |
| prompt_extend | boolean | 否 | true | 是否由上游扩写 prompt；false 贴近字面 prompt |

**输入媒体硬约束**

| 输入 | 格式 | 大小 | 其他 |
|------|------|------|------|
| 图片（first_frame/last_frame/reference_images） | JPEG/JPG/PNG（无 alpha）/BMP/WEBP | ≤20MB | 边 240–8000px，宽高比 ≤8:1 |
| reference_videos | mp4/mov | ≤100MB | 边 240–4096px，宽高比 ≤8:1；单个 1–15s 且总计 ≤15s |
| reference_audios | wav/mp3 | ≤15MB | 单个 1–15s 且总计 ≤15s |

**模式互斥**：关键帧模式（first_frame/last_frame）与参考模式（reference_images/reference_videos/reference_audios/file/link）不可混用；file 与 link 不可同时发送（混用在异步任务阶段报错，网关不拦截）。

**实测补充**：
- `w3.0-video` 用 `{"prompt", "first_frame", "last_frame", "duration":3}` 提交被接受（返回 pending，假 URL 才在下载阶段 failed，参数形态正确）。
- `w3.0-video-pro` 用 `{"prompt","resolution":"4k","duration":2}` 实测 completed，产出 24MB mp4；`2k` 也接受。

---

### 2.2 Wan 2.7 spicy I2V（图生视频 · 音频驱动）

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/wan2.7-i2v-spicy/generation`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| prompt | string | 是 | — | 文本提示词 |
| image | string | 是 | — | 参考图片 URL 或 Base64 |
| negative_prompt | string | 否 | — | 反向提示词 |
| audio_url | string | 否 | — | 驱动音频 URL（WAV/MP3，2~30 秒） |
| resolution | string | 否 | 1080p | 可选 720p、1080p |
| duration | integer | 否 | 5 | 视频时长（秒），2~15 |
| prompt_extend | boolean | 否 | true | 智能提示词扩写 |
| seed | integer | 否 | 随机 | 0~2147483647 |

**实测确认**：✅ 端点存在（之前已接，实测可接收 last_frame/first_clip/video/audio_url/negative_prompt/1080p）。

---

### 2.3 Wan 2.2 spicy I2V

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/wan2.2-i2v-spicy/generation`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| image | string | 是 | — | 输入图片 URL 或 Base64 |
| prompt | string | 是 | — | 文本提示词 |
| duration | integer | 否 | 5 | 可选 5 或 8 |
| resolution | string | 否 | 480p | 可选 480p、720p |
| prompt_extend | boolean | 否 | true | 智能提示词扩写 |
| seed | integer | 否 | 随机 | 随机种子 |

**实测确认**：✅ 端点存在（空参数 400）。

---

### 2.4 Wan 2.2 I2V-LoRA spicy

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/w2.2-i2v-lora/generation`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image | string | 是 | 输入图片 URL 或 Base64 |
| prompt | string | 是 | 文本提示词 |
| （另有 duration/resolution/prompt_extend/seed，文档未详列） | | | |

定价：480p: $0.02/秒 · 720p: $0.04/秒 · LoRA 权重免费（最大 1GB）

**实测确认**：✅ 端点存在（空参数 400）。

---

### 2.5 Wan-Animate（数字人 · 视频动画）

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/wan-animate/generation`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| image | string | 是 | — | 人物图片 URL（HTTPS） |
| video | string | 是 | — | 驱动（模板）视频 URL（HTTPS） |
| mode | string | 是 | animate | 固定值 animate（文档）；实测 replace 也收 |
| resolution | string | 是 | — | 输出分辨率 480p / 720p |
| prompt | string | 否 | — | 补充提示词（可选） |
| seed | integer | 否 | 0 | 随机种子，0 表示随机 |

**实测确认**：✅ 端点存在；mode=animate/replace 均可，分辨率只收 480p/720p。

---

## 3. 图片生成 / 编辑（5 个模型）

### 3.1 Z-Image spicy T2I（文生图）

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/z-image-spicy/generation`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| prompt | string | 是 | — | 文本提示词 |
| width | integer | 否 | 1024 | 256~1536 |
| height | integer | 否 | 1536 | 256~1536 |
| prompt_extend | boolean | 否 | true | 智能提示词扩写 |
| seed | integer | 否 | 随机 | 随机种子 |

**实测确认**：✅ 端点存在；`{"prompt","width":512,"height":512}` 实测 completed，产出 512×512 PNG。

---

### 3.2 Z-Image spicy-pro T2I（文生图）🆕

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/z-image-spicy-pro/generation`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| prompt | string | 是 | — | 文本提示词 |
| width | integer | 否 | 1024 | 256~2560 |
| height | integer | 否 | 1024 | 256~2560 |
| seed | integer/null | 否 | 0 | 0–2147483647；0 或 null 表示随机 |
| prompt_extend | boolean/null | 否 | false | 默认关闭 |

**实测确认**：✅ 端点存在；`{"prompt","width":2560,"height":1440}` 实测 completed，产出 **2560×1440** PNG（支持大图）。

---

### 3.3 Qwen Image Edit spicy（图片编辑）

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/qwen-image-edit-spicy/generation`

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| image | string | 是 | — | 待编辑图片 URL 或 Base64 |
| prompt | string | 是 | — | 编辑指令提示词 |
| seed | integer | 否 | 随机 | 随机种子 |

**实测确认**：✅ 端点存在。**补充：线上实测 `n=2`、`reference_images`（最多 2 张参考图）、`watermark` 参数均被接受**（提交成功，仅因测试用假 URL 在下载阶段 failed；说明这些字段不触发参数拒绝）。注意：官方文档只列 image/prompt/seed，`n`/`reference_images`/`watermark` 为线上实测可传字段（当前服务端已在用）。

---

### 3.4 Face Swap（人脸替换）

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/face-swap/generation`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image | string | 是 | 目标图片（被换脸的图片）URL 或 Base64 |
| face_image | string | 是 | 源人脸图片（要换上去的脸）URL 或 Base64 |
| seed | integer | 否 | 随机种子 |

**实测确认**：✅ 端点存在（空参数 400）。

---

### 3.5 Head Swap（头部替换）

路径：`https://api.mulerouter.ai/vendors/carrothub/v1/head-swap/generation`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image | string | 是 | 目标图（被换头的照片）URL 或 Base64 |
| head_image | string | 是 | 参考头部图 URL 或 Base64 |
| seed | integer/null | 否 | 0–2147483647；null 或 0 为随机 |

**实测确认**：✅ 端点存在（空参数 400）。

---

## 4. 工具（1 个模型）

### 4.1 FlashVSR（视频超分辨率）

路径：`https://api.mulerouter.ai/vendors/mulerouter/v1/flashvsr/generation`

> ⚠️ **注意 vendor 是 `mulerouter`，不是 `carrothub`**。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| video | string | 是 | 输入视频 URL（HTTPS） |
| resolution | string | 是 | 目标分辨率：720p / 1080p / 2k / 4k |

**⚠️ 实测与文档差异**：官方文档写参数名 `target_resolution`，但**线上实测校验字段名是 `resolution`**（空参数报错 `'resolution' expected to be provided`）。对接时请用 `resolution`。

**实测确认**：✅ 端点存在（空参数 400）。

---

## 5. 文字模型（1 个）

### 5.1 Papaya 1.0（OpenAI 兼容对话）🆕

- 生成：`POST https://api.mulerouter.ai/vendors/openai/v1/chat/completions`
- 等效别名：`https://api.mulerouter.ai/v1/chat/completions`（OpenAI SDK 把 base_url 改为 `https://api.mulerouter.ai/v1` 即可）
- `model` 固定为 `carrothub-papaya-1.0`
- **同步/流式对话接口，不走异步任务流程**（无 task_id，无需轮询）
- 上下文支持 256k tokens

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| model | string | 是 | carrothub-papaya-1.0 | 固定值 |
| messages | array | 是 | — | ≥1 条；每项 role（system/user/assistant）+ content |
| stream | boolean | 否 | false | true 时返回 SSE 流式分块 |
| max_tokens | integer | 否 | 模型默认 | ≥1 |
| temperature / top_p / stop / frequency_penalty / presence_penalty / user | — | 否 | — | OpenAI 兼容字段 |
| stream_options | object | 否 | include_usage: true | 平台始终自动返回最终 usage（[DONE] 前发出一次） |

定价：输入 $0.15/百万 tokens，输出 $0.45/百万 tokens（无缓存优惠；失败/上游拒绝不计费）。

流式说明：收到 `[DONE]` 才算完成；错误事件即失败；连接早断则结果未确认（保留 x-request-id 查调用记录）。**中断的流不要自动重试**——新 POST 即新计费世代。

**实测确认**：✅ `POST .../chat/completions` + `{"model":"carrothub-papaya-1.0","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}` 返回正常 completion（content="OK"）。`GET /vendors/openai/v1/models` 也列出 `carrothub-papaya-1.0` 及其它 LLM（deepseek/gpt/grok/kimi/qwen 系列）。

---

## 6. 通用调用流程

```
1. POST /generation                     → 获取 task_id
2. GET  /generation/{task_id}           → 轮询直到 status = completed
3. 从 output.url（videos[0] / images[0]）下载结果文件
4. DELETE /generation/{task_id}         → 按需删除生成文件
```

**完整路径格式**：`https://api.mulerouter.ai/vendors/{vendor}/v1/{model}/{endpoint}`
- carrothub 模型：`vendor = carrothub`
- FlashVSR：`vendor = mulerouter`

**任务状态**：`pending`（已创建等待执行）/ `processing`（处理中）/ `completed`（成功）/ `failed`（失败）

**实测补充（与文档的差异 / 坑）**：
1. 查询/删除必须在路径中带 `generation` 段：`/vendors/{vendor}/v1/{slug}/generation/{task_id}`。**不带 `generation` 会 404**（例如 `/vendors/carrothub/v1/w3.0-video-pro/{task_id}` 是 404）。
2. DELETE 只允许删除 **completed** 任务；`failed`/`processing` 任务删除返回 400（error_code 2003，"Only completed tasks can be deleted"）。
3. 提交空/非法参数返回 400 参数校验（error_code 2001），不产生任务、不计费。

**cURL 示例（W3.0）**

```bash
# 1. 创建任务
curl -X POST 'https://api.mulerouter.ai/vendors/carrothub/v1/w3.0-video/generation' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "prompt": "镜头缓缓推进，城市灯光闪烁",
    "first_frame": "https://example.com/input.jpg",
    "duration": 5
  }'

# 2. 查询任务状态
curl -X GET 'https://api.mulerouter.ai/vendors/carrothub/v1/w3.0-video/generation/{task_id}' \
  -H 'Authorization: Bearer YOUR_API_KEY'

# 3. 删除生成文件
curl -X DELETE 'https://api.mulerouter.ai/vendors/carrothub/v1/w3.0-video/generation/{task_id}' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

---

## 7. 快速索引表

| # | 模型 | 类别 | Vendor | Endpoints |
|---|------|------|--------|-----------|
| 1 | w3.0-video 🆕 | 视频 | carrothub | /generation, /generation/{id} |
| 2 | w3.0-video-pro 🆕 | 视频 | carrothub | /generation, /generation/{id} |
| 3 | w3.0-video-prime 🆕 | 视频 | carrothub | /generation, /generation/{id} |
| 4 | w3.0-video-prime-pro 🆕 | 视频 | carrothub | /generation, /generation/{id} |
| 5 | wan2.7-i2v-spicy | 视频 | carrothub | /generation, /generation/{id} |
| 6 | wan2.2-i2v-spicy | 视频 | carrothub | /generation, /generation/{id} |
| 7 | w2.2-i2v-lora | 视频+LoRA | carrothub | /generation, /generation/{id} |
| 8 | wan-animate | 数字人 | carrothub | /generation, /generation/{id} |
| 9 | z-image-spicy | 文生图 | carrothub | /generation, /generation/{id} |
| 10 | z-image-spicy-pro 🆕 | 文生图 | carrothub | /generation, /generation/{id} |
| 11 | qwen-image-edit-spicy | 图片编辑 | carrothub | /generation, /generation/{id} |
| 12 | face-swap | 换脸 | carrothub | /generation, /generation/{id} |
| 13 | head-swap | 换头 | carrothub | /generation, /generation/{id} |
| 14 | flashvsr | 超分 | mulerouter | /generation, /generation/{id} |
| 15 | carrothub-papaya-1.0 🆕 | 文字生成 | carrothub | /chat/completions |

完整路径格式：`https://api.mulerouter.ai/vendors/{vendor}/v1/{model}/{endpoint}`

---

## 8. W3.0 系列速查

| 版本类别 | 模型 | Model Slug |
|----------|------|------------|
| Stand 标准慢速版 | W3.0 | w3.0-video |
| Stand 标准慢速版 | W3.0-Pro | w3.0-video-pro |
| Prime | W3.0-Prime | w3.0-video-prime |
| Prime | W3.0-VSR-Prime | w3.0-video-prime-pro |

---

## 9. 错误码速查（FAQ）

| 错误码 | 类别 | 含义 | 频率 |
|--------|------|------|------|
| 429 | 限流 | 并发/QPS 超限，提交任务时即返回 | 高 |
| 451 | 内容安全 | AI 围栏输入侧拦截（儿童/政治/商业人物/宗教/国旗国徽等） | 高 |
| 3005 | 执行失败 | 混合错误：输入不合规/输出被绿网拦截/上游 5xx | 高 |
| 3002 | 请求失败 | 请求阶段内容安全拦截 | 中 |
| 4002 | 基础设施 | 代理下载超时（Timeout during proxy download） | 中 |
| 400 / InvalidParameter / VALIDATION_ERROR | 参数校验 | 输入不合法（动图、分辨率、格式等） | 中 |
| 2001 | 兼容性 | multipart/form-data 上传格式兼容问题（修复中） | 低 |
| Invalid API-key | 鉴权 | API Key 无效 | 低 |

官方错误码页面：https://www.mulerouter.ai/docs/get-started/error-codes

**要点**：
- 429 并发限制：W3.0 / Berry 1.0 标准版并发为 10；W3.0 Prime / Berry 1.0 Turbo 快速版并发为 2。
- 输入侧拦截（451 / 3002）不产生生成，**不计费**。
- 报错信息被截断是已知问题（URL 过长触发），凭 task_id 请平台查原始错误。
- 高峰期任务时长波动大，轮询易超时，**推荐 Webhook 回调**获取结果。

---

## 10. 支付与自动充值

- 注册登录：https://www.mulerouter.ai/（目前仅 Google 账号登录）。
- 充值：https://www.mulerouter.ai/app/balance → 输入金额 → Top up → 选支付网关（推荐 Stripe）→ 绑定信用卡并选货币（**强烈建议 USD**，其他货币可能有外汇转换费）。
- 自动充值：最低余额阈值 / 单次充值金额 / 每日限额 / 每月限额，配置后开启总开关。
- **注意**：自动充值不支持 Apple Pay 与 Stripe Link；需直接绑定并保存标准信用卡（Visa / Mastercard / Amex）。

---

## 11. 与旧能力覆盖关系（供内部判断）

基于文档 + 实测，Mulerouter 可覆盖的阿里停服能力：

| 能力 | Mulerouter 对应 | 状态 |
|------|----------------|------|
| W3.0 视频（480p/720p/1080p） | w3.0-video | ✅ 已接 |
| W3.0 Prime | w3.0-video-prime | ✅ 已接 |
| **2k/4k 视频** | **w3.0-video-pro / w3.0-video-prime-pro** | ✅ **实测可用（4k completed）** |
| Wan2.7 图生视频 | wan2.7-i2v-spicy | ✅ 已接 |
| Wan Animate 数字人 | wan-animate | ✅ 已接 |
| Qwen 图片编辑（含多参考图） | qwen-image-edit-spicy | ✅ 已接（n=2、≤2 参考图实测接受） |
| **文生图（Qwen Image 3.0 / Wan2.7 Image T2I）** | **z-image-spicy / z-image-spicy-pro** | ✅ **实测可用（512×512、2560×1440 completed）** |
| 换脸 / 换头 | face-swap / head-swap | ✅ 存在（未在业务接入） |
| 视频超分 | flashvsr | ✅ 存在（注意参数名 `resolution`） |
| 文字模型 | carrothub-papaya-1.0 | ✅ 实测可用 |
| HappyHorse 全部 | — | ❌ Mulerouter 无对应端点 |
| Wan2.7 文生视频/参考生视频/视频编辑 | — | ❌ Mulerouter 无对应端点 |

> 说明：以上"未接入"指当前服务代码尚未路由到 Mulerouter，需按用户要求继续接入；本文档只梳理对接信息。
