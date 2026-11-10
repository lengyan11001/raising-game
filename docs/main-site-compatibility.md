# Main-site device and browser compatibility

## Scope

This matrix covers the `platform.html` main site on `123vips.com` and
`123vip.fans`. Native Android apps and the Live site (`123vipeak.com`) are
separate release surfaces and are not changed by this work.

## Supported baseline

| Tier | Devices and browsers | Acceptance |
| --- | --- | --- |
| P0 | iOS 16.4+ Safari; Android 10+ Chrome, Samsung Internet, WeChat WebView; Desktop Chrome, Edge, Safari, Firefox (latest two releases) | All core flows complete without blocking layout or interaction defects. |
| P1 | iOS 15.6-16.3; Android 8-9; low-end 720p Android devices; older WeChat WebView | Core flows complete; minor visual differences are acceptable. |
| Unsupported | iOS below 15.6, Android below 8, IE, legacy Edge | No dedicated compatibility work. |

## Representative device pool

- iPhone SE (small phone, 320-375px)
- iPhone 15 (mainstream iOS)
- Pixel (mainstream Android Chrome)
- Galaxy S-series (Samsung Internet and Chrome)
- iPad portrait and landscape
- Foldable phone in folded and unfolded widths
- Desktop Chrome at 1366x768 and 1920x1080
- Desktop Safari on macOS
- Desktop Firefox
- Windows display scaling at 125% and 150%
- WeChat embedded browser
- iOS software keyboard open and orientation changes
- Devices with notch and bottom safe area

## P0 acceptance flows

1. 登录与退出。
2. 打开移动端抽屉并遍历主要导航。
3. 图片生成并上传参考图。
4. 视频生成并设置比例、分辨率、时长、首尾帧。
5. 粘贴与上传参考素材。
6. 打开结果/历史，预览、下载、重新编辑。
7. 打开充值并到达支付跳转。
8. 打开工作流，查看画布、选择节点、编辑参数并保存。
9. 打开客服和通知弹窗。
10. 横竖屏切换并开关软键盘。

## Required checks for every flow

- No unexpected horizontal page scroll.
- Primary actions remain reachable and at least 44px high on touch layouts.
- Dialogs stay inside the visual viewport.
- Focused inputs are not hidden behind the software keyboard.
- Media playback uses inline playback where required.
- No blocking JavaScript error appears in the console.
- Back navigation does not trap the user in an editor or dialog.

## Local test commands

```bash
node --check platform.main.js
node --require ./test/source-compat.js --test test/main-site-compatibility.test.js
node --require ./test/source-compat.js --test test/advanced-custom-ui.test.js
```

## Current automated evidence

- Dual-site browser matrix passed for `123vips.com` and `123vip.fans` at 320x568,
  390x844, 768x1024 (fans) and 1366x768. All cases have no horizontal page
  scroll and no blocking JavaScript exception.
- The real React workflow canvas opened on both sites at 320x568 and 390x844.
  Image-node parameters changed to 3:4 / 1K, manual save issued a PUT request to
  `/api/workflow/canvases/compat-canvas`, and the 保存请求 body contained the
  changed parameters.
- At 320px, Back, Save and New are all at least 44px high, do not wrap, and the
  editor canvas stays fully inside the live visual viewport.
- 浏览器自动化 uses local replay fixtures built from the two production
  main-site HTML responses. It does not write production business data.

## Remaining manual acceptance

真机验收 cannot be replaced by automation; checks for the iOS/Android software
keyboard, iPhone Safari, Android Chrome, Samsung Internet, WeChat WebView,
macOS Safari, Desktop Firefox, or orientation changes. These remain the final
acceptance gate before claiming complete browser certification.
