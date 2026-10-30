"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const live = fs.readFileSync(path.join(root, "live.js"), "utf8");
const css = fs.readFileSync(path.join(root, "live.css"), "utf8");
const html = fs.readFileSync(path.join(root, "live.html"), "utf8");

test("live bottom navigation exposes the prototype create tab", () => {
  assert.match(live, /data-nav="create"[\s\S]*?label\("create"\)/);
  assert.match(live, /state\.page === "create"[\s\S]*?createCards\(\)/);
  assert.match(live, /function createCards\(\)/);
  assert.match(live, /data-create-form/);
  assert.match(live, /api\("\/api\/chat-live\/community\/characters"/);
  assert.match(live, /data-action="create-edit"/);
  assert.match(live, /data-action="create-share"/);
  assert.match(live, /function loadCreateCharacters/);
  assert.match(live, /api\("\/api\/chat-live\/creator\/characters"/);
});

test("live handles replaced sessions with the server message and login dialog", () => {
  assert.match(live, /function handleSessionReplaced\(payload = \{\}\)/);
  assert.match(live, /const message = String\(payload\?\.message \|\| "这个账号已在另一台设备登录，请重新登录。"\);/);
  assert.match(live, /if \(p\.code === "SESSION_REPLACED"\) handleSessionReplaced\(p\);/);
  assert.match(live, /window\.addEventListener\("raising-session-replaced", \(event\) => handleSessionReplaced\(event\.detail \|\| \{\}\)\);/);
  const openCallBlock = live.match(/function openCall\([\s\S]*?\n  \}/)[0];
  assert.match(openCallBlock, /error\?\.code === "SESSION_REPLACED"/);
  assert.match(openCallBlock, /handleSessionReplaced\(error\.payload \|\| \{ code: "SESSION_REPLACED"/);
});

test("live relationship and companion level pages use the persisted API", () => {
  assert.match(live, /data-action="relationship"/);
  assert.match(live, /api\(`\/api\/companion\/relationship\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(live, /\["level", "crown", "陪伴等级"/);
  assert.match(live, /api\("\/api\/companion\/level"\)/);
  assert.match(live, /id="companionGuideTitle"/);
});


test("live relationship entries match the prototype placement and interaction", () => {
  assert.match(live, /class="relationship-entry"/);
  assert.match(live, /class="chat-relationship-strip"/);
  assert.match(live, /pendingRelationship/);
  assert.match(live, /function openCall\([\s\S]*?if \(!token\(\)\) return askLogin\(\{ characterId: c\.id, roomId \}\)/);
  assert.match(live, /role-detail-page[\s\S]*?relationship-entry[\s\S]*?role-intro-card/);
  assert.doesNotMatch(live, /class="role-relationship"/);
});

test("live companion guide persists seen and complete state while keeping local suppression", () => {
  assert.match(live, /api\(`\/api\/onboarding\?guide=\$\{GUIDE_KEY\}`\)/);
  assert.match(live, /api\(`\/api\/onboarding\/\$\{GUIDE_KEY\}\/\$\{action\}`/);
  assert.match(live, /localStorage\.getItem\(GUIDE_LOCAL_KEY\)/);
  assert.match(live, /vipeakVideoCompanionGuideSeen/);
});

test("the welcome guide CTA enters the first recommended character", () => {
  assert.match(live, /if \(a === "guide-start"\) \{[\s\S]*?const firstCharacter = state\.chars\[0\][\s\S]*?state\.role = firstCharacter; state\.page = "role-detail";[\s\S]*?render\(\);/);
});

test("live text chat keeps composing while a reply is pending", () => {
  assert.match(live, /textChatBurstState/);
  assert.match(live, /queueTextChatMessage\(conversationId, content\)/);
  assert.match(live, /flushTextChatBurst\(conversationId\)/);
  assert.match(live, /refreshTextChatMessages\(conversationId\)/);
  assert.match(live, /\[data-text-thread\]/);
  assert.match(live, /burst\.blocked/);
  assert.doesNotMatch(live, /const sendBtn = textForm\.querySelector\("button\[type=submit\]"\); sendBtn\.disabled = true/);
});

test("creator voice choices use understandable component styles and exact previews", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(live, /voice\.title \|\| \[voice\.style, voice\.gender\]/);
  assert.doesNotMatch(live, /data-create-\$\{key\}[^>]*>▷ \$\{esc\(name\)\}/);
  assert.match(live, /create-voice-card/);
  assert.match(live, /data-voice-preview/);
  assert.match(live, /正在理解图片/);
  assert.match(live, /"生成中…"/);
  assert.match(live, /"■ 停止"/);
  assert.match(live, /voicePreviewRequestId/);
  assert.match(live, /state\.voicePreview\?\.requestId !== requestId/);
  assert.match(live, /function visibleComponentVoiceOptions\(voices = \[\]\)/);
  assert.match(live, /!\/童\|粤语\|闽南\|陕北\|英语\|印尼\|日语\|韩语\|泰语\|越南\|方言\/u\.test\(desc\)/);
  assert.match(live, /const visibleComponentVoices = visibleComponentVoiceOptions\(state\.creatorVoices\.component\)/);
  assert.doesNotMatch(live, /api\("\/api\/chat-live\/creator\/voices\?scope=realtime"\)/);
  assert.doesNotMatch(live, /<label>实时版<select/);
  assert.match(live, /voiceType: componentVoiceType,\s*voiceProvider: "dashscope_cosyvoice",\s*componentVoiceType/s);
  assert.match(live, /\/api\/chat-live\/creator\/voices\/preview/);
  assert.match(server, /url\.pathname === "\/api\/chat-live\/creator\/voices\/preview"/);
  assert.match(server, /async function handleCreatorChatLiveVoicePreview[\s\S]*?requireUser\(req, res\)/);
  assert.match(server, /code: "VOICE_SCOPE_UNSUPPORTED"/);
  assert.match(server, /VOICE_NOT_AVAILABLE/);
  assert.match(server, /VOICE_PREVIEW_UNAVAILABLE/);
  assert.doesNotMatch(server, /realtimeChatLiveVoicePreviewWav/);
  assert.doesNotMatch(server, /voice_setting_voice_id: voiceType/);
  assert.match(server, /longyingxun_v3: \{ style: "清新"/);
  assert.match(server, /longanli_v3: \{ style: "清脆"/);
  assert.match(server, /componentVoicePreviewWav\("你好呀，今天想和我聊点什么？", voiceType\)/);
  assert.match(server, /voiceType: requestedComponentVoice,[\s\S]*?voiceProvider: "dashscope_cosyvoice",[\s\S]*?componentVoiceType: requestedComponentVoice/s);
  assert.match(css, /\.create-options\.voice \.create-voice-card/);
  assert.match(css, /\.create-voice-preview\.playing/);
});

test("component voice catalog is strict and realtime voices are not exposed", () => {
  const {
    filterChatLiveComponentVoiceCatalog,
    CHAT_LIVE_COMPONENT_VOICE_ALLOWLIST,
  } = require(path.join(root, "server.js"));
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "assets", "chat-live", "voices-component.json"), "utf8"));
  const voices = filterChatLiveComponentVoiceCatalog(catalog);
  const ids = new Set(voices.map((voice) => voice.voiceType));

  assert.ok(voices.length > 0);
  for (const voice of voices) {
    assert.equal(voice.provider, "dashscope_cosyvoice");
    assert.equal(CHAT_LIVE_COMPONENT_VOICE_ALLOWLIST.has(voice.voiceType), true);
    assert.match(voice.title, / · /);
    assert.equal(voice.preview, true);
  }
  for (const excluded of ["longhuhu_v3", "longyue_v3", "longanyue_v3", "longshange_v3", "loongandy_v3", "longlaobo_v3", "longjiqi_v3"]) {
    assert.equal(ids.has(excluded), false, excluded);
  }
  assert.equal(ids.has("longanyang"), true);
  assert.equal(ids.has("longanhuan"), true);
  assert.equal(ids.has("longyingxiao_v3"), true);

  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /if \(catalogScope !== "component"\) return \{ region, scope: catalogScope, voices: \[\] \};/);
  assert.match(server, /User-created characters use the component voice path/);
});

test("home recommendation deck keeps native horizontal scrolling", () => {
  assert.doesNotMatch(live, /function bindHomeDeck\(\)/);
  assert.match(live, /deck\?\.addEventListener\("scroll"/);
  assert.match(live, /Math\.round\(deck\.scrollLeft \/ \(card\.offsetWidth \+ 12\)\)/);
  assert.match(live, /home\(\); bindHomeFilter\(\)/);
  assert.doesNotMatch(css, /\.person-deck\{touch-action:pan-y/);
  assert.doesNotMatch(css, /\.person-card\{scroll-snap-stop:always\}/);
});

test("create editor control selections preserve the current scroll position", () => {
  assert.match(live, /function createEditor\(options = \{\}\)/);
  assert.match(live, /const scrollTop = preserveScroll \? Number\(app\.querySelector\("\.create-edit-page"\)\?\.scrollTop \|\| 0\) : 0/);
  assert.match(live, /if \(preserveScroll\) app\.querySelector\("\.create-edit-page"\)\?\.scrollTo\(0, scrollTop\)/);
  assert.match(live, /function rerenderCreateEditor\(\) \{\s*createEditor\(\{ preserveScroll: true \}\)/);
  assert.match(live, /d\.tags = d\.tags\.includes\(createTag\)[\s\S]*?rerenderCreateEditor\(\)/);
  assert.match(live, /createDraft\(\)\.componentVoiceType = createComponentVoice;[\s\S]*?rerenderCreateEditor\(\)/);
  assert.match(live, /createDraft\(\)\.visibility = createVisibility;[\s\S]*?rerenderCreateEditor\(\)/);
});

test("live recommendation cards keep one fixed frame", () => {
  assert.match(css, /\.person-card\{height:392px;display:flex;flex-direction:column\}/);
  assert.match(css, /\.person-image\{display:block;width:100%;height:330px;flex:0 0 330px\}/);
  assert.match(css, /\.person-intro\{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2/);
});

test("live Google login uses the registered redirect URI while keeping account login available", () => {
  assert.match(live, /const GOOGLE_LOGIN_VISIBLE = true;/);
  assert.match(live, /const redirect = location\.origin;/);
  assert.doesNotMatch(live, /const redirect = location\.origin \+ "\/"/);
  assert.match(live, /button\.hidden = !enabled;/);
  assert.match(live, /const hash = String\(location\.hash/);
  assert.match(html, /data-google-login hidden/);
  assert.match(html, /<input name="username"/);
  assert.match(html, /<input name="password"/);
});

test("live gift and spending ledger rows keep a stable three-column layout", () => {
  assert.match(css, /\.ledger-card\{display:grid/);
  assert.match(css, /\.ledger-card>div\{display:grid;[^}]*grid-template-columns:42px minmax\(0,1fr\) auto/);
  assert.match(css, /\.ledger-copy b,\.ledger-copy small\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
  assert.match(css, /\.ledger-card>div>em\{[^}]*text-align:right/);
  assert.match(live, /function ledgerRows\(items, empty\)[\s\S]*?<section class="ledger-card">/);
});

test("live prototype styles and cache keys ship together", () => {
  assert.match(css, /\.companion-guide-card/);
  assert.match(
    live,
    /https:\/\/media\.123vips\.com\/assets\/chat-live\/welcome-newcomer-v3\.jpg\?v=2026103023/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "server.js"), "utf8"),
    /pathname !== "\/assets\/chat-live\/welcome-newcomer-v3\.jpg"/,
  );
  assert.match(live, /class="companion-guide-logo"/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.companion-guide-card\{[^}]*max-width:320px[^}]*height:500px/);
  assert.match(css, /\.companion-guide\{[^}]*align-items:center[^}]*background:rgba\(4,4,8,\.72\)/);
  assert.match(css, /\.companion-guide-copy\{[^}]*justify-content:space-between/);
  assert.match(css, /\.companion-guide-features\{[^}]*margin-top:0/);
  assert.match(css, /\.companion-guide-features span\{[^}]*min-height:82px/);
  assert.match(css, /\.companion-guide-start\{[^}]*height:45px[^}]*margin-top:0/);
  assert.match(css, /\.create-card-grid/);
  assert.match(css, /\.create-visibility-tip/);
  assert.match(css, /\.companion-stage-row/);
  assert.match(html, /live\.css\?v=2026103039/);
  assert.match(html, /live\.js\?v=2026103039/);
  assert.match(html, /chat-live\.js\?v=chat-inline-20261030-4/);
});

test("create-character auto profile understands the uploaded image through the server", () => {
  assert.match(live, /data-action="create-auto-persona"[^>]*>.*?自动生成/);
  assert.match(live, /if \(a === "create-auto-persona"\)[\s\S]*?if \(!d\.avatarUrl\)[\s\S]*?api\("\/api\/chat-live\/community\/characters\/auto-profile"/);
  assert.match(live, /body: JSON\.stringify\(\{ imageUrl, name: d\.name, gender: d\.gender, tags: d\.tags \}\)/);
  assert.match(live, /current\.personaMd = String\(profile\.personaMd/);
  assert.match(live, /current\.intro = String\(profile\.intro/);
  assert.match(live, /current\.greeting = String\(profile\.greeting/);
  assert.match(live, /正在理解图片/);
  assert.match(live, /createAutoProfileRequestId/);
  assert.match(live, /if \(state\.createAutoProfileRequestId !== requestId \|\| state\.page !== "create-edit"\) return;/);
  assert.match(live, /if \(current\.avatarUrl !== imageUrl\) return;/);
  assert.match(live, /if \(!profile\.personaMd \|\| !profile\.intro \|\| !profile\.greeting\) throw new Error/);
  assert.match(live, /cancelCreateAutoProfile\(\);[\s\S]*?uploadCreatorAsset\(file, "avatar"\)/);
  assert.doesNotMatch(live, /d\.personaMd = `\$\{d\.name \|\| "Ta"\}/);
  assert.match(css, /\.create-auto-persona:disabled/);

  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(serverSource, /async function handleCommunityAutoProfileChatLiveCharacter\(req, res\)[\s\S]*?await requireUser\(req, res\)/);
  assert.match(serverSource, /const chatLive = chatLiveConfigValue\(await readAppConfig\(\)\)/);
  assert.match(serverSource, /const usePapayaChat = chatLive\.languageModel === "papaya"/);
  assert.match(serverSource, /const chatModel = usePapayaChat \? PAPAYA_MODEL : BYTEPLUS_LANGUAGE_MODEL/);
  assert.match(serverSource, /if \(!isManagedChatLiveAssetUrl\(imageUrl\)\)/);
  assert.match(serverSource, /type: "image_url", image_url: \{ url: imageUrl \}/);
  assert.match(serverSource, /payload = await \(usePapayaChat[\s\S]*?papayaLanguageRequest\(requestBody[\s\S]*?: byteplusLanguageRequest\(requestBody/);
  assert.match(serverSource, /POST" && url\.pathname === "\/api\/chat-live\/community\/characters\/auto-profile"/);
  assert.match(serverSource, /parseChatLiveCharacterAutoProfile\(qwen37FlashResponseText\(payload\)\)/);
  assert.doesNotMatch(serverSource, /ALIYUN_QWEN_VISION/);
});

test("auto profile prompt is adult-safe and response parsing enforces field limits", () => {
  const { chatLiveCharacterAutoProfilePrompt, parseChatLiveCharacterAutoProfile } = require(path.join(root, "server.js"));
  const prompt = chatLiveCharacterAutoProfilePrompt({ name: "小满", gender: "female", tags: ["温柔", "慢热"] });
  assert.match(prompt, /明确年满 23 岁/);
  assert.match(prompt, /不要识别或猜测真实人物的身份/);
  assert.match(prompt, /personaMd/);
  assert.match(prompt, /intro/);
  assert.match(prompt, /greeting/);
  const parsed = parseChatLiveCharacterAutoProfile("```json\n" + JSON.stringify({
    personaMd: "设".repeat(300),
    intro: "简".repeat(80),
    greeting: "开\n场".repeat(40),
  }) + "\n```");
  assert.equal(Array.from(parsed.personaMd).length, 240);
  assert.equal(Array.from(parsed.intro).length, 60);
  assert.equal(Array.from(parsed.greeting).length, 60);
  assert.doesNotMatch(parsed.greeting, /\n/);
  assert.throws(() => parseChatLiveCharacterAutoProfile('{"personaMd":"只有一项"}'), /不完整/);
});

test("role detail labels, private-album header, and create empty state match the supplied design", () => {
  assert.match(live, /topics: "人物标签"/);
  assert.doesNotMatch(live, /她擅长的话题/);
  assert.match(live, /<div class="filter-sheet-head"><h3>TA 的相册<\/h3>/);
  assert.match(css, /\.album-sheet \.filter-sheet-head h3\{[^}]*white-space:nowrap[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
  assert.match(css, /\.role-cover\{height:clamp\(500px,145vw,620px\)/);
  assert.match(css, /\.role-cover>\.fit-media[^}]*height:100%/);
  assert.match(css, /\.fit-media-photo\{[^}]*object-fit:contain/);
  assert.match(css, /\.album-cell>\.fit-media/);
  assert.match(css, /\.album-sheet-grid button\{[^}]*aspect-ratio:9\/16/);
  assert.match(live, /const fitMedia = \(url, alt = ""\)/);
  assert.match(live, /album-cell[^>]*>\$\{fitMedia\(url/);
  assert.match(live, /class="album-item"[^>]*>\$\{fitMedia\(url/);
  assert.match(live, /这不是聊天记录<br><em>这是关系<\/em>/);
  assert.match(live, /AI 给了 Ta 说话的能力<br><em>是你让 Ta 有了情感<\/em>/);
  assert.match(live, /角色是你写的，世界是你定的。<br>现实得不到的，在这里可以统统满足。/);
  assert.match(live, /伴侣、爱慕对象、虚拟人物 创作你想聊的一切对象。/);
  assert.match(live, /data-action="create-new">创建角色 →<\/button>/);
  assert.match(live, /会员权益[\s\S]*?解锁隐私互动[\s\S]*?文字私信不限条[\s\S]*?语音 \/ 视频 8 折[\s\S]*?开设房间[\s\S]*?专属身份标识/);
  assert.match(live, /人物标签[\s\S]*?最多选 3 个/);
});

test("live system messages, check-in, gift data, feedback, and billing rules are wired", () => {
  assert.match(live, /data-action="system-messages"/);
  assert.match(live, /const top = \(\) => `<header class="live-top">[\s\S]*?data-action="checkin"[\s\S]*?data-action="settings"[\s\S]*?data-settings-menu[\s\S]*?data-action="language-sheet"[\s\S]*?<\/header>`/);
  assert.match(live, /function closeSettingsMenu\(\)[\s\S]*?aria-expanded", "false"/);
  assert.doesNotMatch(live, /function showSettings\(/);
  assert.doesNotMatch(live, /state\.page === "settings"/);
  assert.match(css, /\.settings-dropdown\{position:absolute/);
  assert.match(css, /\.settings-dropdown\[hidden\]\{display:none\}/);
  assert.match(live, /每日领积分/);
  assert.match(live, /今日已领/);
  assert.match(live, /共 \$\{tasks\.length\} 项任务/);
  assert.match(live, /data-action="checkin-task"/);
  assert.match(live, /data-action="checkin-task-go"/);
  assert.match(live, /data-checkin-task-key="\$\{esc\(task\.key\)\}"/);
  assert.match(live, /\/api\/live\/checkin\/tasks\/\$\{encodeURIComponent\(key\)\}/);
  assert.match(live, /checkinClaimKey/);
  assert.doesNotMatch(live, /state\.checkinLoading \? "领取中…"/);
  assert.match(live, /const claiming = state\.checkinClaimKey === String\(task\.key \|\| ""\)/);
  assert.match(live, /const waitingForCheckin = state\.checkinLoading && !state\.checkin/);
  assert.match(live, /let checkinLoadPromise = null/);
  assert.match(live, /let checkinRevision = 0/);
  assert.match(live, /if \(checkinRevision === loadRevision\) state\.checkin = result\.checkin \|\| null/);
  assert.doesNotMatch(live, /7 天签到/);
  assert.doesNotMatch(live, /data-checkin-day/);
  assert.match(css, /\.checkin-summary\{/);
  assert.match(css, /\.checkin-task-list\{/);
  assert.match(css, /\.checkin-task-row\{/);
  assert.match(css, /\.checkin-footnote\{display:flex/);
  assert.match(css, /\.rooms-head-actions\{[^}]*margin-left:auto/);
  assert.doesNotMatch(css, /\.rooms-filter\{margin-left:auto/);
  assert.match(live, /class="conversation system-message-row"/);
  assert.match(live, /api\("\/api\/live\/notifications"\)/);
  assert.match(live, /api\("\/api\/live\/notifications\/read-all"/);
  assert.match(live, /data-action="checkin"/);
  assert.match(live, /api\("\/api\/live\/checkin"/);
  assert.match(live, /\["creator-income", "gift", "创作者收益", u \? "「创作」页公开角色的独立收益" : "登录后查看收益"\]/);
  assert.doesNotMatch(live, /\["creator-income", "gift", "礼物数据"/);
  assert.match(live, /state\.page === "creator-income"\) showCreatorIncome\(\)/);
  assert.match(live, /api\("\/api\/live\/creator-income\?limit=50"\)/);
  assert.doesNotMatch(live, /\["feedback", "chat", "问题反馈"/);
  assert.doesNotMatch(live, /\["rooms", "users", "我的陪伴房间"/);
  assert.match(live, /<nav class="profile-legal-links"[\s\S]*?data-action="feedback"[^>]*>问题反馈<\/a><\/nav>/);
  assert.match(live, /\["creator", "pen", "创作者中心", u \? "管理内部角色与素材，不参与分成" : "登录后管理角色与素材"\]/);
  assert.match(live, /<section class="profile-menu" data-profile-menu>\$\{menu\}<\/section>/);
  const profileMenu = live.match(/const menu = \[([\s\S]*?)\]\.map/)?.[1] || "";
  const menuOrder = ["创作者收益", "创作者中心", "钱包与消费记录", "陪伴等级", "邀请好友", "编辑资料与兴趣标签", "隐私与安全"];
  const menuPositions = menuOrder.map((item) => profileMenu.indexOf(item));
  assert.ok(menuPositions.every((position) => position >= 0));
  assert.deepEqual(menuPositions, [...menuPositions].sort((a, b) => a - b));
  assert.match(css, /\.profile-login-card/);
  assert.match(live, /state\.user = session\.user \|\| null;[\s\S]*?localStorage\.removeItem\(TOKEN_KEY\)/);
  assert.doesNotMatch(live, /lastTouchActionAt = Date\.now\(\);\s*run\(event\)/);
  assert.match(live, /data-menu-action/);
  assert.match(live, /function bindProfileMenuActions\(\)/);
  assert.match(live, /href="#profile\/\$\{action\}"/);
  assert.match(live, /addEventListener\("touchstart"/);
  assert.match(live, /addEventListener\("touchend"/);
  assert.match(live, /function profileRouteFromHash\(\)/);
  assert.match(live, /a === "feedback"\)/);
  assert.match(live, /api\("\/api\/support-messages"/);
  assert.match(live, /聊天付费规则/);
  assert.match(live, /文字私信[\s\S]*?0\.5 积分\/条/);
  assert.match(live, /语音通话 \/ 语音消息[\s\S]*?<small>会员 8 折<\/small><\/div><em class="blue benefit-value">2 积分\/秒<\/em>/);
  assert.match(live, /视频通话[\s\S]*?<small>会员 8 折 · 实际扣费分成 30%<\/small><\/div><em class="gold benefit-value">5 积分\/秒<\/em>/);
  assert.match(live, /陪伴房间[\s\S]*?<small>会员可开房 · 进房即开始计时<\/small><\/div><em class="green benefit-value">5 积分\/秒<\/em>/);
  assert.doesNotMatch(live, /2 → 1\.6|5 → 4/);
  assert.match(live, /礼物打赏[\s\S]*?data-action="rooms">去房间/);
  assert.match(css, /\.rule-rows>div>em,\.rule-rows>div>button\{[^}]*margin-left:auto[^}]*text-align:right[^}]*font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(live, /textMessageCredits\s*\|\|\s*0\.5/);
  assert.doesNotMatch(live, /V币|爱心币/);
  assert.match(css, /\.system-message-row/);
  assert.match(css, /\.checkin-summary\{/);
  assert.match(css, /\.checkin-task-list\{/);
  assert.match(css, /\.creator-income-hero/);
  assert.match(css, /\.feedback-form/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  const db = fs.readFileSync(path.join(root, "db.js"), "utf8");
  assert.match(db, /app_chat_messages_user_role_created_idx/);
  assert.match(db, /app_chat_live_sessions_user_updated_idx/);
  assert.match(db, /app_chat_live_characters_creator_created_idx/);
  assert.match(db, /app_chat_live_room_members_user_seen_idx/);
  assert.match(db, /AS text_completed[\s\S]*?AS video_completed[\s\S]*?AS live_completed[\s\S]*?AS create_completed/);
  const admin = fs.readFileSync(path.join(root, "admin.js"), "utf8");
  assert.doesNotMatch(db, /V币|爱心币/);
  assert.doesNotMatch(admin, /V币|爱心币/);
  assert.match(db, /ON CONFLICT \(id\) DO UPDATE[\s\S]*?payload->>'welcome' = 'true'/);
});

test("the main domain serves an independent one-screen landing page", () => {
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const landingHtml = fs.readFileSync(path.join(root, "site-landing.html"), "utf8");
  const landingCss = fs.readFileSync(path.join(root, "site-landing.css"), "utf8");
  const landingJs = fs.readFileSync(path.join(root, "site-landing.js"), "utf8");
  assert.match(serverSource, /defaultPageForHostname\(requestHostname\(req\)\)/);
  assert.match(serverSource, /"\/site-landing\.html", "\/site-landing\.css", "\/site-landing\.js"/);
  assert.match(serverSource, /"\/platform\.html"/);
  assert.match(landingHtml, /class="site-header"/);
  assert.match(landingHtml, /href="\/live\.html"/);
  assert.match(landingCss, /\.header-cta \{ display: none; \}/);
  assert.match(landingCss, /\.menu-button \{ display: block; \}/);
  assert.match(landingCss, /\.hero h1 \{ font-size: clamp\(35px, 9\.8vw, 41px\); \}/);
  assert.match(landingJs, /data-menu-toggle/);
  assert.match(landingJs, /data-mobile-menu/);
});
