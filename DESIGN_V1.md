# 《After Dark Girlfriend》V1 策划草案

## 定位

手机端虚拟伴侣养成游戏。用户进入后直接回到女友所在的默认场景，通过周边图标触发档案、设定、AI 邂逅、照片生成、聊天、换装和约会视频，不做长表单页面。

美术基调是海外成熟向：成年角色、夜间约会、红酒色灯光、成熟穿搭、暧昧但不露骨。当前 demo 不展示裸露或色情内容，后续生成也建议把“性感”控制在成人时尚、约会氛围和镜头语言上。

## 首版背景

世界观：玩家在一间私享夜色套房中领养一位成年虚拟伴侣。她会先入住默认套房，再通过聊天、换装、场景视频逐步提升亲密度。

默认女友：赛琳娜，28 岁，成熟自信，偏爱夜色套房、红酒灯光和专属陪伴。

默认场景：夜色套房。所有角色创建完成后都会回到这里，周边图标负责触发付费生成和互动。

## 单屏结构

- 顶部：After Dark、当前场景、爱心币余额。
- 中间：女友 360 形象。
- 上侧状态：亲密、心情、活力。
- 周边图标：档案、心愿、邂逅、照片、聊天、换装。
- 底部约会入口：套房、酒廊、天台、影厅。
- 底部状态条：当前动作、生成进度、任务反馈。

## 当前美术版本

V1.2 已从占位图升级为成熟版本地图片素材：

- 背景：使用 OpenGameArt 的 Visual Novel House Backgrounds，裁切为手机竖屏场景，并通过深色遮罩做夜间化处理。
- 角色：使用 OpenGameArt 的 Codel Visual Novel Sprite，处理为透明立绘，再调色为 4 个默认成熟女友。
- 换装：当前通过切换不同调色立绘模拟，后续可替换成 apiz/gpt-image-2 生成的同一角色多套服装。
- 署名：见 `assets/ATTRIBUTION.md`。

## 核心循环

1. 用户进入默认夜色套房。
2. 免费选择默认女友，或付费 AI 邂逅 / 照片生成女友。
3. 聊天、换装提升状态。
4. 选择约会场景，输入要求，付费生成短视频。
5. 约会视频完成后增加亲密和心情，消耗少量活力。

## 付费点

- 默认女友：免费。
- AI 邂逅：12 爱心币。
- 按心愿生成：12 爱心币。
- 上传照片生成：18 爱心币。
- 约会视频生成：25 爱心币。

## apiz-sdk 接入建议

不要把 key 写进前端。正式版本应由服务端读取环境变量：

```bash
APIZ_API_KEY=<server-side-key>
```

角色图像生成建议走同步或异步图像模型：

```ts
import { Apiz } from "apiz-sdk";

const client = new Apiz({ apiKey: process.env.APIZ_API_KEY });
const result = await client.generate({
  model: "gpt-image-2",
  prompt: "adult virtual girlfriend, mature confident woman, elegant sensual non-nude evening outfit, overseas dating sim style, 8 direction character sheet",
});
```

约会视频生成建议走异步任务：

```ts
const task = await client.tasks.create({
  model: "wan/v2.6/image-to-video",
  params: {
    prompt: "mature romantic non-explicit rooftop date, neon backlight, slow orbit camera, 6 seconds",
    image_url: "<generated-character-or-scene-image-url>",
  },
});

const result = await client.tasks.waitFor(task.task_id, {
  pollInterval: 5000,
});
```

## 素材 Prompt 草案

角色分镜：

```text
成年虚拟女友，成熟自信，成人时尚穿搭，性感但不裸露，夜间约会灯光，手机养成游戏角色，干净二次元视觉小说风格，8 向角色分镜，正面、侧面、背面完整，白底，无文字，无水印。
```

夜色套房：

```text
手机养成游戏背景，私享夜色套房，红酒色灯光、丝绒沙发、落地窗城市夜景、暖金和青色霓虹点缀，竖屏构图，中间留出角色站位，无文字，无水印。
```

约会酒廊：

```text
手机虚拟伴侣游戏约会场景，成熟酒廊，红酒杯、爵士灯影、暗色木质吧台、柔和聚光，竖屏构图，中间留角色空间，无文字，无水印。
```

视频镜头：

```text
成年虚拟伴侣在夜间约会场景中自然互动，成熟浪漫、暧昧但不露骨，镜头慢慢环绕，动作克制，6 秒短视频，适合手机养成游戏。
```
