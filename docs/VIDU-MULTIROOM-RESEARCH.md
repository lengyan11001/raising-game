# Vidu 稳定性与多人房间调研

> 调研日期：2026-09-30

## 结论

可以实现多人进入同一个房间并观看同一路数字人直播，但需要把“Vidu 控制连接”和“观众房间”拆开：一个房间只启动一条 Vidu live，Vidu 作为唯一推流端，所有观众通过同一 ARTC channel 以只拉流身份加入。多人文字聊天、礼物、换装请求和权限由我们的业务 WebSocket + PostgreSQL 实现，不能把完整聊天室直接依赖在 Vidu/RTC DataChannel 上。

## 推荐架构

```text
用户 A/B/C -> 房间 WebSocket -> 房间服务 -> PostgreSQL
                                      |
                              唯一 Vidu 控制连接
                                      |
                           Vidu publisher -> ARTC channel
                                      |
                         A/B/C audience 只订阅数字人流
```

### 房间生命周期

1. 第一个用户创建房间并生成固定 `roomId`、`channelId`。
2. 服务端只创建一次 `/live/s_avatar/component`，保存 `liveId`、publisher userId、traceId。
3. 后续用户只申请自己的 ARTC viewer token，加入同一个 `channelId`，不再创建 Vidu live。
4. 房间无人后保留短暂宽限期，再关闭 Vidu live。
5. 房间服务广播当前 publisher、首帧、断线、替换和结束状态。

## 稳定性重点

- Vidu 一个 live 只能保持一个有效控制 WebSocket；控制连接必须在服务端维护，不能让每个浏览器直接连 Vidu。
- Vidu 初始化阶段 `NOT_READY` 不是立即失败，应在原连接上按官方流程重试 `conn_init`。
- 需要记录 `connected_at`、`last_ping_at`、`last_pong_at`、`conn_init_ack_at`、`first_frame_at`、`close_code`、`close_reason`、`reconnect_count`。
- 共享模式下，一路 Vidu 断线会影响整个房间，必须有首帧超时、冻结帧检测、断线重连、备用 live/快速替换和黑屏兜底状态。
- S2 适合换装等复杂动作，但稳定性仍需按 beta 能力验证；基础对话可以单独评估更稳定的模型。
- ARTC 观众只拉流，聊天与媒体解耦；RTC DataChannel 只作为可选的状态通知，不作为持久化聊天主链路。

## 共享聊天与操作

新增房间级消息和操作队列。每次只允许一个数字人回复或一个换装/角色切换操作，其他请求排队。消息写入 PostgreSQL 后广播给所有成员，数字人回复只提交一次并同步给全房间。Undress/换装属于房间操作：新 live 首帧稳定后切换 publisher，观众不退出页面，旧 live 再释放。

## 计费建议

Vidu 成本是房间级 live，观众观看费用仍按用户独立预付/续费。某个用户余额不足只断开该用户，不关闭整个房间；房间无人后才关闭 Vidu。礼物由赠送者单独扣费。正式计费前需要让 Vidu 商务确认共享观众的具体计量项。

## 数据库建议

业务数据必须使用 PostgreSQL，建议新增：

- `app_chat_live_rooms`
- `app_chat_live_room_members`
- `app_chat_live_room_messages`
- `app_chat_live_room_operations`
- `app_chat_live_room_events`

字段至少包括房间/角色、ARTC channel、Vidu live、publisher、traceId、成员加入/离开、消息状态、操作请求/上游响应、首帧和结束原因。

## PoC 验证顺序

1. 固定一个角色，服务端创建一条 Vidu live。
2. 2～10 个浏览器使用不同 viewer userId 加入同一 ARTC channel。
3. 验证所有人看到同一视频和声音；关闭一个浏览器不影响其他人。
4. 服务端提交一句话，确认只生成一次并同步播放。
5. 连续运行 30～60 分钟，记录心跳、首帧、卡顿、断线和重连。
6. 测试新 publisher 替换旧 publisher，验证无须离开房间即可切换。
7. PoC 稳定后再接正式房间聊天、礼物、Undress 和计费。
