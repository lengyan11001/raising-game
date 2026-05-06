# After Dark Girlfriend Demo

手机端单屏养成游戏原型，定位是海外向、成熟风格的「领养女友」。当前版本走大胆夜间约会审美，但保持非露骨、非裸露的游戏美术边界。

## 当前版本

- 默认进入「夜色套房」。
- 默认女友：赛琳娜。
- 状态值：亲密、心情、活力。
- 周边图标：档案、心愿、邂逅、照片、聊天、换装。
- 约会场景：套房、酒廊、天台、影厅。
- 付费任务：AI 邂逅、按心愿生成、照片生成、约会视频生成。

## 文件

- `index.html`：游戏主舞台和弹窗结构。
- `styles.css`：手机版深色玻璃 UI、夜间场景、女友形象、图标和弹窗样式。
- `app.js`：状态、扣费、生成任务模拟、聊天、换装、约会场景逻辑。
- `DESIGN_V1.md`：玩法策划、付费点、apiz-sdk 接入建议和素材 prompt。
- `assets/`：公开素材处理后的本地资源，署名见 `assets/ATTRIBUTION.md`。

## apiz-sdk 接入点

当前没有在前端保存 API key，也没有真实消耗接口。正式接入建议：

- 服务端读取 `APIZ_API_KEY`。
- `startCompanionJob(type)` 替换为角色图像/分镜生成。
- `startDateVideoJob(scene)` 替换为场景视频生成任务。
- 前端只轮询服务端任务状态和展示返回资源 URL。

## 素材来源

当前 demo 已用 OpenGameArt 的公开素材替换占位图，并处理为本地资源：

- Visual Novel House Backgrounds：房间、餐厅、户外、夜间场景。
- Codel Visual Novel Sprite：成熟女友立绘，已裁切、缩放、调色为 4 个默认角色。

具体署名与 license 见 `assets/ATTRIBUTION.md`。
