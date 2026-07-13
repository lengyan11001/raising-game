"use strict";

const TOKEN_KEY = "raisingGameToken";
const LANG_KEY = "raisingGameLanguage";
const TAB_KEY = "raisingGamePlatformTab";
const REFERRAL_CODE_KEY = "raisingGameReferralCode";
const AGE_GATE_ACCEPTED_KEY = "raisingGameAgeGateAccepted";
const ALL_TABS = new Set(["gallery", "characters", "advanced", "workflow", "assets", "access", "history", "topups", "spending", "referral", "pricing"]);
const DEFAULT_TEMPLATE_COVER = "/assets/admin/home/default-hero.jpg";
const ADVANCED_SEEDANCE_FPS = 24;
const ADVANCED_SEEDANCE_480P_CREDITS_PER_SECOND = 15;
const ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND = 30;
const ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND = 60;
const ADVANCED_SEEDANCE_4K_CREDITS_PER_SECOND = 120;
const ADVANCED_SEEDANCE_VIDEO_INPUT_480P_CREDITS_PER_SECOND = 10;
const ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND = 20;
const ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND = 40;
const ADVANCED_SEEDANCE_VIDEO_INPUT_4K_CREDITS_PER_SECOND = 80;
const ADVANCED_SEEDANCE_FAST_480P_CREDITS_PER_SECOND = 12;
const ADVANCED_SEEDANCE_FAST_720P_CREDITS_PER_SECOND = 24;
const ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_480P_CREDITS_PER_SECOND = 8;
const ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_720P_CREDITS_PER_SECOND = 16;
const ADVANCED_SEEDANCE_FAST_DISCOUNT = 0.8;
const ADVANCED_WAN27_720P_CREDITS_PER_SECOND = 20;
const ADVANCED_WAN27_1080P_CREDITS_PER_SECOND = 50;
const ADVANCED_GENERATION_MARKUP = 1.5;
const DEFAULT_ADVANCED_PROVIDER = "wan27";
const ADVANCED_SEEDANCE_REFERENCE_LIMIT = 9;
const ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES = 20 * 1024 * 1024;
const ADVANCED_SEEDANCE_MAX_PIXELS = 2086876;
const ADVANCED_WAN_CLIP_MAX_BYTES = 30 * 1024 * 1024;
const ADVANCED_WAN_CLIP_MAX_SECONDS = 5.05;
const DEFAULT_ASSET_IMAGE_MODIFY_CREDITS = 16.862;
const OURDREAM_PRESET_URL = "/assets/ourdream/presets/presets.json";
const ADVANCED_PRESET_SLOT_ORDER = ["character", "action", "outfit", "scene"];
const ADVANCED_PRESET_SLOT_META = {
  character: { labelKey: "advancedPreset.character", icon: "user-round", required: true },
  action: { labelKey: "advancedPreset.action", icon: "clapperboard", required: true },
  outfit: { labelKey: "advancedPreset.outfit", icon: "shirt", required: false },
  scene: { labelKey: "advancedPreset.scene", icon: "image", required: false },
};
const WORKFLOW_STORAGE_KEY = "raisingGameWorkflowState";
const WORKFLOW_NUDE_PROMPT = "Adult cinematic undress video. Keep the same consenting adult subject and identity. The subject naturally removes clothing during the shot. Smooth camera motion, realistic lighting, no subtitles, no watermark.";
const WORKFLOW_MODEL_PROMPTS = {
  nude: WORKFLOW_NUDE_PROMPT,
  "nude-video": `${WORKFLOW_NUDE_PROMPT} Continue the previous clip naturally and preserve the same identity, body, lighting, and camera direction.`,
};
const WORKFLOW_MODEL_ALIASES = {
  "nude-v3-kling": "nude",
};
const WORKFLOW_MODEL_LABELS = [
  "Nude", "Nude Video", "Sexier Nude Video", "Blowbang", "POV Dick Sucking", "Cumshot", "AI Talking Porn", "AI Talking Porn V2",
  "Thick Cum V2", "Suck 2 Dicks", "Cumshot V2", "Endless Cumming", "Face Fuck", "Really Deep Deepthroat", "Cinematic Oral", "Blowjob",
  "Such Big Dick!", "Handjob", "BBC", "Missionary V2", "Missionary", "Bouncing Boobs", "Dirty Talk", "Breast Play", "Suck My Dick",
  "Penis Play", "Mouthful", "Ahegao", "Kissing", "Shake That Ass", "Lesbian Kissing", "Instant Sex", "Titfuck V3", "Middle Finger",
  "Facial Bukkake", "Covered by Cum", "Cum on Body", "Facial on the Phone", "Summon Dicks", "2 Girls Fun", "Deepthroat V3",
  "Deepthroat V2.1", "Deepthroat", "Double Blowjob", "Good Morning Oral", "69 Blowjob", "Dance V4", "Dance V3", "Dance V2",
  "Full Nelson Sex", "Cowgirl V4", "Cowgirl V2", "Cowgirl", "Cowgirl (Back View)", "Sex from Behind", "Side Fuck", "Standing Sex",
  "She Is Into You", "Reverse Squatting", "She Caught Me", "Fingering", "Rough Fingered", "Pussy Rubbing", "Pussy Slapping",
  "Pussy Lick", "Dildo V1", "Squirting V2", "Squirting", "Nipple Sucking", "Ahegao V2", "Tits Sandwich", "Grab Boobs",
  "Expand Boobs", "Slap", "French Kiss", "Jump in Bed", "Sexily Walk Back", "Water Splash", "Remote Vibrators", "Car Love",
  "Spanking", "Handjob V3", "Handjob V2", "Stroke It", "Reverse Congress", "Masturbation V2", "Glory Hole", "Imagine",
  "Imagine Realistic", "Imagine Instagram", "Imagine KPop Girl", "Side View Missionary", "POV FaceSitting", "Pull Her Closer",
  "Desk Jerk Off", "Paid Escort V1", "Push Her Down", "Dub Video",
];
const WORKFLOW_MODEL_LIBRARY = WORKFLOW_MODEL_LABELS.map((label) => {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id,
    label,
    prompt: WORKFLOW_MODEL_PROMPTS[id] || `Adult cinematic shot. Keep the same consenting adult subject and identity. Scene action: ${label}. Smooth camera motion, realistic lighting, no subtitles, no watermark.`,
  };
});
const WORKFLOW_QUICK_TEMPLATES = [
  { id: "nude", label: "Undress Intro", modelId: "nude" },
  { id: "deepthroat", label: "Deep Throat", modelId: "deepthroat-v2-1" },
  { id: "cumshot", label: "Cumshot", modelId: "cumshot-v2" },
  { id: "ahegao", label: "Ahegao Finish", modelId: "ahegao-v2" },
];
const WORKFLOW_PHYSICS_MODULES = [
  { id: "better-motion", label: "Better Motion", prompt: "more natural body movement and weight shift" },
  { id: "better-pussy", label: "Better Anatomy", prompt: "more coherent adult anatomy" },
  { id: "dark-skin", label: "Dark Skin", prompt: "preserve darker skin tones accurately" },
  { id: "small-boobs", label: "Small Boobs", prompt: "keep a smaller chest shape consistent" },
  { id: "better-dick", label: "Better Detail", prompt: "more coherent explicit detail when relevant" },
  { id: "bouncing-boobs", label: "Bouncing Boobs", prompt: "stronger natural bounce and secondary motion" },
];
const WORKFLOW_NODE_LAYOUT_VERSION = 3;
const WORKFLOW_NODE_WIDTH = 414;
const WORKFLOW_NODE_GAP = 56;
const WORKFLOW_DEFAULT_NODES = [
  { id: "upload-1", type: "upload", title: "Image Upload", x: 30, y: 150, data: { startImage: "", endImage: "", faceImage: "" } },
  { id: "video-1", type: "video", title: "Nude", x: 500, y: 150, data: { modelId: "nude", duration: 5, resolution: "720p", ratio: "9:16", prompt: "", activeTab: "preview", stripFirst: true, faceSwapMode: true, addSound: true } },
  { id: "video-2", type: "video", title: "Nude Video", x: 970, y: 150, data: { modelId: "nude-video", duration: 5, resolution: "720p", ratio: "9:16", prompt: "", activeTab: "preview", stripFirst: true, faceSwapMode: true, addSound: true } },
  { id: "output-1", type: "output", title: "Final Output", x: 1440, y: 150, data: {} },
];
const WORKFLOW_DEFAULT_EDGES = [
  ["upload-1", "video-1"],
  ["video-1", "video-2"],
  ["video-2", "output-1"],
];
const MIN_TOPUP_AMOUNT = 1;
const DEFAULT_TOPUP_AMOUNT = 100;
const DEFAULT_TOPUP_PACKAGES = [
  { id: "usd-20", amount: 20, credits: 2000, currency: "USD" },
  { id: "usd-30", amount: 30, credits: 3100, currency: "USD" },
  { id: "usd-50", amount: 50, credits: 5500, currency: "USD" },
  { id: "usd-100", amount: 100, credits: 12000, currency: "USD" },
  { id: "usd-200", amount: 200, credits: 25000, currency: "USD" },
  { id: "usd-500", amount: 500, credits: 65000, currency: "USD" },
  { id: "usd-1000", amount: 1000, credits: 140000, currency: "USD" },
];
const TOPUP_RECORDS_AUTO_REFRESH_MS = 15000;
const TRON_USDT_CONTRACT = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const DEFAULT_PLATFORM_TAB = "gallery";
const DEFAULT_GALLERY_MODE = "characters";
const PLAYFLUX_GALLERY_HASHES = new Set(["templates", "video-templates", "explore-templates", "playflux"]);
const GALLERY_MODE_TABS = [
  { id: "characters", labelKey: "nav.gallery" },
  { id: "playflux", labelKey: "playflux.galleryTab", fallback: "Video templates" },
];
const PLAYFLUX_TEMPLATE_ASSET_BASE = "/assets/playflux/templates/";
const PLAYFLUX_TEMPLATE_TABS = [
  { id: "video", label: "视频", icon: "film" },
  { id: "image", label: "图片", icon: "image" },
  { id: "anime", label: "动漫", icon: "sparkles" },
];
const PLAYFLUX_NEGATIVE_PROMPT = "low quality, worst quality, blurry, watermark, signature, text, bad anatomy, bad hands, extra fingers, missing fingers, extra arms, extra legs, duplicated limbs, deformed body, distorted face";
const PLAYFLUX_ANIME_NEGATIVE_PROMPT = "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry";
const PLAYFLUX_VIDEO_TEMPLATE_DATA = [
  { id: "pf-video-001-seedance-2-0-ref-a", title: "Seedance 2.0 成人版", videoFile: "pf-video-001-demo-seedance-2-0-ref-a-resized.mp4", posterFile: "pf-video-001-demo-seedance-2-0-ref-a.jpg", badge: "NEW" },
  { id: "pf-video-002-nude", title: "AI 色情", videoFile: "pf-video-002-demo-nude.mp4", posterFile: "pf-video-002-demo-nude.jpg", badge: "" },
  { id: "pf-video-003-sexier-nude", title: "性感模特", videoFile: "pf-video-003-demo-sexier-nude-asian-resized.mp4", posterFile: "pf-video-003-demo-sexier-nude-asian.jpg", badge: "" },
  { id: "pf-video-004-blowbang", title: "多人群交口交", videoFile: "pf-video-004-demo-blowbang-video-asian-resized.mp4", posterFile: "pf-video-004-demo-blowbang-video-asian.jpg", badge: "NEW" },
  { id: "pf-video-005-pov-dick-sucking", title: "POV 口交", videoFile: "pf-video-005-demo-pov-dick-sucking-asian-resized.mp4", posterFile: "pf-video-005-demo-pov-dick-sucking-asian.jpg", badge: "NEW" },
  { id: "pf-video-006-cinematic-oral", title: "电影级口交", videoFile: "pf-video-006-demo-cinematic-oral-asian-resized.mp4", posterFile: "pf-video-006-demo-cinematic-oral-asian.jpg", badge: "NEW" },
  { id: "pf-video-007-endless-cumming", title: "无尽射精", videoFile: "pf-video-007-endless-cumming-asian-resized.mp4", posterFile: "pf-video-007-endless-cumming-asian.jpg", badge: "NEW" },
  { id: "pf-video-008-nude-dirty-talk", title: "AI 对话成人视频", videoFile: "pf-video-008-demo-nude-dirty-talk.mp4", posterFile: "pf-video-008-demo-nude-dirty-talk.jpg", badge: "" },
  { id: "pf-video-009-ai-talking-porn-v2", title: "AI 对话成人视频 V2", videoFile: "pf-video-009-demo-ai-talking-porn-v2-asian.mp4", posterFile: "pf-video-009-demo-ai-talking-porn-v2-asian.jpg", badge: "" },
  { id: "pf-video-010-really-deep-deepthroat", title: "真深喉", videoFile: "pf-video-010-demo-really-deep-deepthroat-resized.mp4", posterFile: "pf-video-010-demo-really-deep-deepthroat.jpg", badge: "" },
  { id: "pf-video-011-stroke-it", title: "手淫", videoFile: "pf-video-011-demo-stroke-it-asian-resized.mp4", posterFile: "pf-video-011-demo-stroke-it-asian.jpg", badge: "" },
  { id: "pf-video-012-bbc", title: "BBC", videoFile: "pf-video-012-demo-bbc-asian-resized.mp4", posterFile: "pf-video-012-demo-bbc-asian.jpg", badge: "" },
  { id: "pf-video-013-such-big-dick", title: "好大的鸡巴！", videoFile: "pf-video-013-demo-such-big-dick-resized.mp4", posterFile: "pf-video-013-demo-such-big-dick.jpg", badge: "" },
  { id: "pf-video-014-missionary-v2", title: "传教士 V2", videoFile: "pf-video-014-demo-missionary-v2-asian-resized.mp4", posterFile: "pf-video-014-demo-missionary-v2-asian.jpg", badge: "" },
  { id: "pf-video-015-bouncing-boobs", title: "弹跳乳房", videoFile: "pf-video-015-demo-bouncing-boobs-asian-resized.mp4", posterFile: "pf-video-015-demo-bouncing-boobs-asian.jpg", badge: "" },
  { id: "pf-video-016-cumshot", title: "射精", videoFile: "pf-video-016-demo-cumshot.mp4", posterFile: "pf-video-016-demo-cumshot.jpg", badge: "" },
  { id: "pf-video-017-thick-cum-v2", title: "浓稠精液 V2", videoFile: "pf-video-017-demo-thick-cum-v2.mp4", posterFile: "pf-video-017-demo-thick-cum-v2.jpg", badge: "" },
  { id: "pf-video-018-cumshot-v2", title: "颜射 V2", videoFile: "pf-video-018-demo-cumshot-v2-asian.mp4", posterFile: "pf-video-018-demo-cumshot-v2-asian.jpg", badge: "" },
  { id: "pf-video-019-face-fuck", title: "面部性爱", videoFile: "pf-video-019-demo-face-fuck-resized.mp4", posterFile: "pf-video-019-demo-face-fuck.jpg", badge: "" },
  { id: "pf-video-020-suck-2-dicks", title: "吸两根", videoFile: "pf-video-020-demo-suck-2-dicks.mp4", posterFile: "pf-video-020-demo-suck-2-dicks.jpg", badge: "" },
  { id: "pf-video-021-blowjob", title: "口交", videoFile: "pf-video-021-blowjob.mp4", posterFile: "pf-video-021-blowjob.jpg", badge: "" },
  { id: "pf-video-022-missionary", title: "传教士体位", videoFile: "pf-video-022-demo-missionary-resized.mp4", posterFile: "pf-video-022-demo-missionary.jpg", badge: "" },
  { id: "pf-video-023-side-missionary-sex", title: "侧面传教士", videoFile: "pf-video-023-demo-side-missionary-sex-asian-resized.mp4", posterFile: "pf-video-023-demo-side-missionary-sex-asian.jpg", badge: "" },
  { id: "pf-video-024-dirty-talk", title: "脏话", videoFile: "pf-video-024-demo-dirty-talk-resized.mp4", posterFile: "pf-video-024-demo-dirty-talk.jpg", badge: "" },
  { id: "pf-video-025-breast-play", title: "玩弄胸部", videoFile: "pf-video-025-demo-breast-play-asian-resized.mp4", posterFile: "pf-video-025-demo-breast-play-asian.jpg", badge: "" },
  { id: "pf-video-026-suck-my-dick", title: "吸我", videoFile: "pf-video-026-demo-suck-my-dick-resized.mp4", posterFile: "pf-video-026-demo-suck-my-dick.jpg", badge: "" },
  { id: "pf-video-027-penis-play", title: "阴茎游戏", videoFile: "pf-video-027-demo-penis-play-resized.mp4", posterFile: "pf-video-027-demo-penis-play.jpg", badge: "" },
  { id: "pf-video-028-mouthful", title: "满口", videoFile: "pf-video-028-demo-mouthful-resized.mp4", posterFile: "pf-video-028-demo-mouthful.jpg", badge: "" },
  { id: "pf-video-029-ahegao", title: "阿黑颜", videoFile: "pf-video-029-demo-ahegao-resized.mp4", posterFile: "pf-video-029-demo-ahegao.jpg", badge: "" },
  { id: "pf-video-030-kissing", title: "接吻", videoFile: "pf-video-030-demo-kissing-resized.mp4", posterFile: "pf-video-030-demo-kissing.jpg", badge: "" },
  { id: "pf-video-031-shake-that-ass", title: "摇晃屁股", videoFile: "pf-video-031-demo-shake-that-ass-resized.mp4", posterFile: "pf-video-031-demo-shake-that-ass.jpg", badge: "" },
  { id: "pf-video-032-lesbian-kiss", title: "女同接吻", videoFile: "pf-video-032-demo-lesbian-kiss-resized.mp4", posterFile: "pf-video-032-demo-lesbian-kiss.jpg", badge: "" },
  { id: "pf-video-033-instant-sex", title: "即时性爱", videoFile: "pf-video-033-demo-instant-sex-resized.mp4", posterFile: "pf-video-033-demo-instant-sex.jpg", badge: "" },
  { id: "pf-video-034-titfuck-v4", title: "乳交 V4", videoFile: "pf-video-034-demo-titfuck-v4-resized.mp4", posterFile: "pf-video-034-demo-titfuck-v4.jpg", badge: "" },
  { id: "pf-video-035-titfuck-v3", title: "乳交 V3", videoFile: "pf-video-035-demo-titfuck-v3-resized.mp4", posterFile: "pf-video-035-demo-titfuck-v3.jpg", badge: "" },
  { id: "pf-video-036-middlefinger", title: "中指", videoFile: "pf-video-036-demo-middlefinger-resized.mp4", posterFile: "pf-video-036-demo-middlefinger.jpg", badge: "" },
  { id: "pf-video-037-facial-bukkake", title: "颜射乱交", videoFile: "pf-video-037-demo-facial-bukkake-asian-resized.mp4", posterFile: "pf-video-037-demo-facial-bukkake-asian.jpg", badge: "" },
  { id: "pf-video-038-covered-by-cum", title: "精液覆盖", videoFile: "pf-video-038-demo-covered-by-cum-resized.mp4", posterFile: "pf-video-038-demo-covered-by-cum.jpg", badge: "" },
  { id: "pf-video-039-cum-on-body", title: "射在身上", videoFile: "pf-video-039-demo-cum-on-body-resized.mp4", posterFile: "pf-video-039-demo-cum-on-body.jpg", badge: "" },
  { id: "pf-video-040-facial-on-the-phone", title: "打电话时颜射", videoFile: "pf-video-040-facial-on-the-phone-resized.mp4", posterFile: "pf-video-040-facial-on-the-phone.jpg", badge: "" },
  { id: "pf-video-041-summon-dicks-aisan-2", title: "召唤肉棒", videoFile: "pf-video-041-demo-summon-dicks-aisan-2-resized.mp4", posterFile: "pf-video-041-demo-summon-dicks-aisan-2.jpg", badge: "" },
  { id: "pf-video-042-2-girls-fun", title: "两女同乐", videoFile: "pf-video-042-2-girls-fun-asian-resized.mp4", posterFile: "pf-video-042-2-girls-fun-asian.jpg", badge: "" },
  { id: "pf-video-043-deepthroat-v3", title: "深喉 V3", videoFile: "pf-video-043-demo-deepthroat-v3-asian-resized.mp4", posterFile: "pf-video-043-demo-deepthroat-v3-asian.jpg", badge: "" },
  { id: "pf-video-044-deepthroat-v2-1", title: "深喉 V2.1", videoFile: "pf-video-044-demo-deepthroat-v2-1-resized.mp4", posterFile: "pf-video-044-demo-deepthroat-v2-1.jpg", badge: "" },
  { id: "pf-video-045-deepthroat", title: "深喉", videoFile: "pf-video-045-demo-deepthroat-resized.mp4", posterFile: "pf-video-045-demo-deepthroat.jpg", badge: "" },
  { id: "pf-video-046-double-blowjob", title: "双人口交", videoFile: "pf-video-046-demo-double-blowjob-resized.mp4", posterFile: "pf-video-046-demo-double-blowjob.jpg", badge: "" },
  { id: "pf-video-047-drain-my-balls", title: "榨干我", videoFile: "pf-video-047-demo-drain-my-balls-asian-resized.mp4", posterFile: "pf-video-047-demo-drain-my-balls-asian.jpg", badge: "" },
  { id: "pf-video-048-good-morning", title: "早安口交", videoFile: "pf-video-048-demo-good-morning-asian-resized.mp4", posterFile: "pf-video-048-demo-good-morning-asian.jpg", badge: "" },
  { id: "pf-video-049-pov-classroom-oral", title: "POV教室口交", videoFile: "pf-video-049-demo-pov-classroom-oral-asian-resized.mp4", posterFile: "pf-video-049-demo-pov-classroom-oral-asian.jpg", badge: "" },
  { id: "pf-video-050-pov-wedding-oral", title: "POV婚礼口交", videoFile: "pf-video-050-demo-pov-wedding-oral-asian-resized.mp4", posterFile: "pf-video-050-demo-pov-wedding-oral-asian.jpg", badge: "" },
  { id: "pf-video-051-69-blowjob", title: "69口交", videoFile: "pf-video-051-demo-69-blowjob-resized.mp4", posterFile: "pf-video-051-demo-69-blowjob.jpg", badge: "" },
  { id: "pf-video-052-dance-v4-new", title: "舞蹈 V4", videoFile: "pf-video-052-demo-dance-v4-new-resized.mp4", posterFile: "pf-video-052-demo-dance-v4-new.jpg", badge: "" },
  { id: "pf-video-053-dance-v3-new", title: "舞蹈 V3", videoFile: "pf-video-053-demo-dance-v3-new-resized.mp4", posterFile: "pf-video-053-demo-dance-v3-new.jpg", badge: "" },
  { id: "pf-video-054-dance-v2", title: "舞蹈 V2", videoFile: "pf-video-054-demo-dance-v2-resized.mp4", posterFile: "pf-video-054-demo-dance-v2.jpg", badge: "" },
  { id: "pf-video-055-caramelldansen", title: "Caramelldansen", videoFile: "pf-video-055-demo-caramelldansen-resized.mp4", posterFile: "pf-video-055-demo-caramelldansen.jpg", badge: "" },
  { id: "pf-video-056-doggy-style-v3", title: "POV Doggy", videoFile: "pf-video-056-demo-doggy-style-v3-resized.mp4", posterFile: "pf-video-056-demo-doggy-style-v3.jpg", badge: "" },
  { id: "pf-video-057-full-nelson-sex-v2", title: "全尼尔森体位 V2", videoFile: "pf-video-057-demo-full-nelson-sex-v2-resized.mp4", posterFile: "pf-video-057-demo-full-nelson-sex-v2.jpg", badge: "" },
  { id: "pf-video-058-full-nelson-sex", title: "全尼尔森体位", videoFile: "pf-video-058-demo-full-nelson-sex-resized.mp4", posterFile: "pf-video-058-demo-full-nelson-sex.jpg", badge: "" },
  { id: "pf-video-059-cowgirl-v4", title: "骑乘位 V4", videoFile: "pf-video-059-demo-cowgirl-v4-asian-resized.mp4", posterFile: "pf-video-059-demo-cowgirl-v4-asian.jpg", badge: "" },
  { id: "pf-video-060-cowgirl-v3", title: "骑乘位 V3", videoFile: "pf-video-060-demo-cowgirl-v3-resized.mp4", posterFile: "pf-video-060-demo-cowgirl-v3.jpg", badge: "" },
  { id: "pf-video-061-cowgirl-v2", title: "女上位 V2", videoFile: "pf-video-061-demo-cowgirl-v2-resized.mp4", posterFile: "pf-video-061-demo-cowgirl-v2.jpg", badge: "" },
  { id: "pf-video-062-cowgirl", title: "女上位", videoFile: "pf-video-062-demo-cowgirl-resized.mp4", posterFile: "pf-video-062-demo-cowgirl.jpg", badge: "" },
  { id: "pf-video-063-cowgirl-backview", title: "骑乘位（后视图）", videoFile: "pf-video-063-demo-cowgirl-backview-asian-resized.mp4", posterFile: "pf-video-063-demo-cowgirl-backview-asian.jpg", badge: "" },
  { id: "pf-video-064-sex-from-behind", title: "后入", videoFile: "pf-video-064-demo-sex-from-behind-resized.mp4", posterFile: "pf-video-064-demo-sex-from-behind.jpg", badge: "" },
  { id: "pf-video-065-side-fuck", title: "侧入体位", videoFile: "pf-video-065-demo-side-fuck-asian-resized.mp4", posterFile: "pf-video-065-demo-side-fuck-asian.jpg", badge: "" },
  { id: "pf-video-066-standing-sex", title: "站立式性交", videoFile: "pf-video-066-demo-standing-sex-resized.mp4", posterFile: "pf-video-066-demo-standing-sex.jpg", badge: "" },
  { id: "pf-video-067-she-is-into-you", title: "她喜欢你", videoFile: "pf-video-067-she-is-into-you-asian-resized.mp4", posterFile: "pf-video-067-she-is-into-you-asian.jpg", badge: "" },
  { id: "pf-video-068-reverse-squatting", title: "反向深蹲", videoFile: "pf-video-068-demo-reverse-squatting-resized.mp4", posterFile: "pf-video-068-demo-reverse-squatting.jpg", badge: "" },
  { id: "pf-video-069-she-caught-me", title: "被她发现了", videoFile: "pf-video-069-demo-she-caught-me-asian-resized.mp4", posterFile: "pf-video-069-demo-she-caught-me-asian.jpg", badge: "" },
  { id: "pf-video-070-fuck-machine", title: "性爱机器", videoFile: "pf-video-070-demo-fuck-machine-asian-resized.mp4", posterFile: "pf-video-070-demo-fuck-machine-asian.jpg", badge: "" },
  { id: "pf-video-071-fingering", title: "指交", videoFile: "pf-video-071-demo-fingering-resized.mp4", posterFile: "pf-video-071-demo-fingering.jpg", badge: "" },
  { id: "pf-video-072-fingered", title: "粗暴指交", videoFile: "pf-video-072-demo-fingered-resized.mp4", posterFile: "pf-video-072-demo-fingered.jpg", badge: "" },
  { id: "pf-video-073-pussy-rubbing", title: "揉阴", videoFile: "pf-video-073-demo-pussy-rubbing-resized.mp4", posterFile: "pf-video-073-demo-pussy-rubbing.jpg", badge: "" },
  { id: "pf-video-074-pussy-slapping", title: "拍打阴部", videoFile: "pf-video-074-demo-pussy-slapping-resized.mp4", posterFile: "pf-video-074-demo-pussy-slapping.jpg", badge: "" },
  { id: "pf-video-075-pussy-lick", title: "舔阴", videoFile: "pf-video-075-demo-pussy-lick-asian-resized.mp4", posterFile: "pf-video-075-demo-pussy-lick-asian.jpg", badge: "" },
  { id: "pf-video-076-dildo-v1", title: "假阳具 V1", videoFile: "pf-video-076-demo-dildo-v1-resized.mp4", posterFile: "pf-video-076-demo-dildo-v1.jpg", badge: "" },
  { id: "pf-video-077-squirting-v2", title: "喷水 V2", videoFile: "pf-video-077-demo-squirting-v2-resized.mp4", posterFile: "pf-video-077-demo-squirting-v2.jpg", badge: "" },
  { id: "pf-video-078-squirting", title: "潮吹", videoFile: "pf-video-078-demo-squirting-resized.mp4", posterFile: "pf-video-078-demo-squirting.jpg", badge: "" },
  { id: "pf-video-079-nipple-sucking", title: "吸乳头", videoFile: "pf-video-079-nipple-sucking-asian-resized.mp4", posterFile: "pf-video-079-nipple-sucking-asian.jpg", badge: "" },
  { id: "pf-video-080-ahegao-v2", title: "阿黑颜 V2", videoFile: "pf-video-080-demo-ahegao-v2-resized.mp4", posterFile: "pf-video-080-demo-ahegao-v2.jpg", badge: "" },
  { id: "pf-video-081-tits-sandwich", title: "乳房三明治", videoFile: "pf-video-081-tits-sandwich-resized.mp4", posterFile: "pf-video-081-tits-sandwich.jpg", badge: "" },
  { id: "pf-video-082-grab-boobs", title: "抓胸", videoFile: "pf-video-082-demo-grab-boobs-video-resized.mp4", posterFile: "pf-video-082-demo-grab-boobs-video.jpg", badge: "" },
  { id: "pf-video-083-boob-expansion", title: "丰胸", videoFile: "pf-video-083-demo-boob-expansion-asian-resized.mp4", posterFile: "pf-video-083-demo-boob-expansion-asian.jpg", badge: "" },
  { id: "pf-video-084-slap", title: "掌掴", videoFile: "pf-video-084-demo-slap-asian-resized.mp4", posterFile: "pf-video-084-demo-slap-asian.jpg", badge: "" },
  { id: "pf-video-085-french-kiss", title: "法式接吻", videoFile: "pf-video-085-demo-french-kiss-resized.mp4", posterFile: "pf-video-085-demo-french-kiss.jpg", badge: "" },
  { id: "pf-video-086-jump-in-bed", title: "跳上床", videoFile: "pf-video-086-demo-jump-in-bed-asian-resized.mp4", posterFile: "pf-video-086-demo-jump-in-bed-asian.jpg", badge: "" },
  { id: "pf-video-087-walk-back-sexy", title: "性感走路", videoFile: "pf-video-087-demo-walk-back-sexy-resized.mp4", posterFile: "pf-video-087-demo-walk-back-sexy.jpg", badge: "" },
  { id: "pf-video-088-splash", title: "水花飞溅", videoFile: "pf-video-088-demo-splash-resized.mp4", posterFile: "pf-video-088-demo-splash.jpg", badge: "" },
  { id: "pf-video-089-remote-vib", title: "遥控振动器", videoFile: "pf-video-089-demo-remote-vib-asian-resized.mp4", posterFile: "pf-video-089-demo-remote-vib-asian.jpg", badge: "" },
  { id: "pf-video-090-car-love", title: "车内做爱", videoFile: "pf-video-090-demo-car-love-resized.mp4", posterFile: "pf-video-090-demo-car-love.jpg", badge: "" },
  { id: "pf-video-091-spanking", title: "打屁股", videoFile: "pf-video-091-demo-spanking-asian-resized.mp4", posterFile: "pf-video-091-demo-spanking-asian.jpg", badge: "" },
  { id: "pf-video-092-handjob-v3", title: "手活 V3", videoFile: "pf-video-092-demo-handjob-v3-asian-resized.mp4", posterFile: "pf-video-092-demo-handjob-v3-asian.jpg", badge: "" },
  { id: "pf-video-093-handjob-v2", title: "手活 V2", videoFile: "pf-video-093-demo-handjob-v2-asian-resized.mp4", posterFile: "pf-video-093-demo-handjob-v2-asian.jpg", badge: "" },
  { id: "pf-video-094-reverse-suspended-congress", title: "反向悬挂", videoFile: "pf-video-094-demo-reverse-suspended-congress-resized.mp4", posterFile: "pf-video-094-demo-reverse-suspended-congress.jpg", badge: "" },
  { id: "pf-video-095-masturbation-v2", title: "自慰 V2", videoFile: "pf-video-095-demo-masturbation-v2-resized.mp4", posterFile: "pf-video-095-demo-masturbation-v2.jpg", badge: "" },
  { id: "pf-video-096-glory-hole", title: "荣耀之洞", videoFile: "pf-video-096-demo-glory-hole-resized.mp4", posterFile: "pf-video-096-demo-glory-hole.jpg", badge: "" },
  { id: "pf-video-097-pov-facesitting", title: "POV 坐脸", videoFile: "pf-video-097-demo-pov-facesitting-asian-resized.mp4", posterFile: "pf-video-097-demo-pov-facesitting-asian.jpg", badge: "" },
  { id: "pf-video-098-pull-her", title: "把她拉近", videoFile: "pf-video-098-demo-pull-her-asian-resized.mp4", posterFile: "pf-video-098-demo-pull-her-asian.jpg", badge: "" },
  { id: "pf-video-099-desk-jerkoff", title: "桌下打手枪", videoFile: "pf-video-099-demo-desk-jerkoff-asian-resized.mp4", posterFile: "pf-video-099-demo-desk-jerkoff-asian.jpg", badge: "" },
  { id: "pf-video-100-paid-escort", title: "付费陪侍 V1", videoFile: "pf-video-100-demo-paid-escort-asian-resized.mp4", posterFile: "pf-video-100-demo-paid-escort-asian.jpg", badge: "" },
  { id: "pf-video-101-push-her-down", title: "把她推倒", videoFile: "pf-video-101-demo-push-her-down-asian-resized.mp4", posterFile: "pf-video-101-demo-push-her-down-asian.jpg", badge: "" },
  { id: "pf-video-102-dub", title: "ALPHA配音视频", videoFile: "pf-video-102-demo-dub-video-asian-resized.mp4", posterFile: "pf-video-102-demo-dub-video-asian.jpg", badge: "" }
];
function playfluxVideoTemplatePrompt(title = "") {
  const action = String(title || "selected motion").trim() || "selected motion";
  return `Use the uploaded consenting adult source as the main subject. Recreate the ${action} video style from the selected preview: preserve identity, face, body type, outfit intent, camera angle, motion rhythm, lighting, and scene continuity. Keep anatomy stable, hands and limbs coherent, one consistent main subject unless the template clearly requires multiple adults. No subtitles, no watermark.`;
}
const PLAYFLUX_VIDEO_TEMPLATES = PLAYFLUX_VIDEO_TEMPLATE_DATA.map((item, index) => ({
  id: item.id,
  tab: "video",
  title: item.title,
  badge: item.badge || "",
  previewType: "video",
  previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/${item.videoFile}`,
  posterUrl: item.posterFile ? `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/${item.posterFile}` : "",
  credits: index === 0 ? 1600 : 1500,
  prompt: playfluxVideoTemplatePrompt(item.title),
  seedanceMode: "reference_images",
  duration: 5,
  resolution: "720p",
  ratio: "9:16",
}));
const PLAYFLUX_TEMPLATES = [
  ...PLAYFLUX_VIDEO_TEMPLATES,
  {
    id: "pf-image-t2i-flux",
    tab: "image",
    title: "T2I Flux No Restrictions",
    badge: "NEW",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/t2i-flux-no-restrictions.jpeg`,
    credits: 200,
    createMode: "image-create",
    prompt: "Create a high quality adult glamour image with cinematic lighting, sharp details, realistic skin, confident pose, and polished composition.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-ai-nude-v3",
    tab: "image",
    title: "AI 色情 V3",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/ai-nude-v3.jpg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Completely transform the uploaded adult source image into a nude adult result while preserving identical subject placement, camera angle, framing, and perspective. Keep the background and lighting consistent; only change the clothing state.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-boob-enlarger",
    tab: "image",
    title: "丰胸 V3",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/boob-enlarger-v3.jpg`,
    credits: 180,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Modify the uploaded adult source image with a larger bust while preserving the same face, pose, camera angle, lighting, skin texture, background, and clothing style.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-face-swap",
    tab: "image",
    title: "完美换脸",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/perfect-face-swap.webp`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Perform a clean adult face swap while preserving the target image pose, lighting, skin tone, perspective, hair direction, and facial proportions.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-change-clothes",
    tab: "image",
    title: "换装",
    badge: "NEW",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/change-clothes.jpg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Change the outfit in the uploaded adult source image. Preserve the same identity, pose, camera angle, body shape, background, and lighting.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-naked-pussy",
    tab: "image",
    title: "裸体小穴",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/naked-pussy.jpg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create an explicit adult nude edit from the uploaded source while preserving identity, camera angle, framing, lighting, and background consistency.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-peek-mode",
    tab: "image",
    title: "窥视模式",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/peek-mode.webp`,
    credits: 180,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create a voyeur-style adult image edit with the same subject, framing, and lighting. Keep the result realistic, coherent, and close to the uploaded source.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-glory-hole",
    tab: "image",
    title: "荣耀之洞",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/glory-hole.jpg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create an adult glory hole themed edit using the uploaded source as identity and composition reference. Preserve realistic lighting and stable anatomy.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-pov-oral",
    tab: "image",
    title: "POV 口交",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/pov-oral.jpg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create an adult POV oral themed image edit. Preserve the uploaded adult subject identity, camera perspective, lighting, and coherent hands and face.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-pov-handjob",
    tab: "image",
    title: "POV 手交",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/pov-handjob.jpg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create an adult POV hand scene from the uploaded source. Preserve identity, camera perspective, lighting, and anatomically correct hands and fingers.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-cum-on-face",
    tab: "image",
    title: "颜射",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/cum-on-face.jpeg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create an adult facial finish themed image edit while preserving the uploaded source identity, pose, camera angle, and lighting.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-covered",
    tab: "image",
    title: "精液覆盖",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/covered-in-cum.jpeg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create an adult messy finish image edit while preserving the original identity, pose, framing, background, and lighting.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-bdsm",
    tab: "image",
    title: "BDSM",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/bdsm.jpg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create a consensual adult BDSM themed image edit. Preserve the uploaded source identity, composition, camera angle, and lighting.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-blowjob",
    tab: "image",
    title: "口交",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/blowjob.jpg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create an adult oral themed image edit. Preserve the uploaded source identity, expression, camera angle, lighting, and stable anatomy.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-image-group-oral",
    tab: "image",
    title: "群体口交",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}image/group-oral.jpeg`,
    credits: 200,
    createMode: "image-edit",
    sourceRequired: true,
    prompt: "Create an adult group oral themed image edit inspired by the preview while preserving the uploaded source identity and stable anatomy.",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-expressiveh",
    tab: "anime",
    title: "ExpressiveH / エロアニメスタイル",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/expressiveh-hentai-style.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, expressive adult anime character, erotic anime style, detailed eyes, soft lighting, clean line art, polished composition",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-cowgirl-pov",
    tab: "anime",
    title: "Cowgirl POV / 騎乗位",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/pov-cowgirl-looking-down.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, 1girl, 1boy, pov, girl on top, straddling, leaning forward, leaning back, directly above viewer, pinning viewer down",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-blowjob-titjob",
    tab: "anime",
    title: "Blowjob + Titjob POV / フェラ+パイズリ",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/pov-blowjob-titjob-handjob.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime POV, intimate close-up composition, leaning forward, expressive face, detailed hands, cinematic framing",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-ass-worship",
    tab: "anime",
    title: "Ass Worship / 尻崇拝",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/ass-worship.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime pose, emphasis on hips and body curve, detailed skin, confident expression, clean background",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-missionary-raised",
    tab: "anime",
    title: "Missionary Raised Legs / 正常位",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/pov-missionary-raised-legs.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime POV composition, raised legs pose, cinematic angle, detailed body, soft lighting",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-femdom-threesome",
    tab: "anime",
    title: "Femdom Threesome / フェムドム3P",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/femdom-sandwich-threesome.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, CG_LD, adult anime group composition, dominant feminine pose, coherent bodies, detailed faces, cinematic lighting",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-lying-on-top",
    tab: "anime",
    title: "Lying on Top POV / 上から",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/pov-lying-on-top.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime POV, girl lying on top, close intimate framing, detailed face, soft room lighting",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-missionary-legs-together",
    tab: "anime",
    title: "Missionary Legs Together / 正常位 脚閉じ",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/pov-missionary-legs-together.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime POV, legs together pose, cinematic framing, detailed anatomy, clean line art",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-orgasm-pose",
    tab: "anime",
    title: "Orgasm Pose / オーガズム",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/pleasured-orgasm-pose-xl.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime pleasure expression, dynamic pose, detailed face, polished lighting, high detail",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-licking",
    tab: "anime",
    title: "Licking Penis / ペニス舐め",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/licking-penis-testicles-andi-poses.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime close-up, tongue pose, expressive eyes, detailed mouth, cinematic framing",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-check-ass",
    tab: "anime",
    title: "Check This Ass / お尻ポーズ",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/check-this-ass-pose.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime back view pose, looking back, body curve emphasis, detailed outfit and lighting",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-dogeza",
    tab: "anime",
    title: "Dogeza / 土下座",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/dogeza-pose.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime kneeling dogeza pose, dramatic perspective, detailed hands and face",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-head-grab",
    tab: "anime",
    title: "Head Grab / 頭掴み",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/head-grab.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime head-grab composition, close-up perspective, expressive face, detailed hands",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-breast-press",
    tab: "anime",
    title: "Behind Breast Press / 背面密着",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/from-behind-breast-press-top-down-bottom-up.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime from-behind composition, close body contact, detailed skin, cinematic light",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
  {
    id: "pf-anime-phimosis",
    tab: "anime",
    title: "Phimosis Pose / 包茎ポーズ",
    previewType: "image",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}anime/clean-phimosis-pose.jpeg`,
    credits: 140,
    createMode: "image-create",
    prompt: "masterpiece, best quality, 1girl, CG_LD, adult anime pose, close-up composition, clean line art, detailed expression, high quality",
    negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  },
];
const CHARACTER_PAGE_SIZE = 20;
const CHARACTER_FILTER_TAGS = [
  "Group Chats",
  "Dominant",
  "Feminine",
  "Femboy",
  "Tomboy",
  "Curvy",
  "Muscular",
  "Goth",
  "Slow Burn",
  "Exhibitionist",
  "Tattooed",
  "Athletic",
  "Femdom",
  "Petite",
  "Vampire",
  "Cosplay",
  "Redhead",
  "Elf",
  "Thick",
  "Asian",
  "Latina",
  "Blonde",
  "Brunette",
  "Busty",
  "MILF",
  "Mature",
  "Submissive",
  "Romantic",
  "Influencer",
  "Goddess",
];
const CHARACTER_AGE_FILTERS = [
  { id: "18-24", label: "18-24" },
  { id: "25-34", label: "25-34" },
  { id: "35+", label: "35+" },
];
const CHARACTER_SORT_OPTIONS = [
  { id: "recommended", label: "For You" },
  { id: "popular", label: "Most liked" },
  { id: "videos", label: "Most videos" },
  { id: "newest", label: "Newest" },
];
const CHARACTER_CREATOR_ASSET_BASE = "/assets/ourdream/creator/";
const CHARACTER_CREATOR_STEPS = [
  { id: "style", icon: "user-round" },
  { id: "general", icon: "badge" },
  { id: "face", icon: "smile" },
  { id: "body", icon: "person-standing" },
  { id: "details", icon: "file-text" },
  { id: "prompt", icon: "image" },
];
const CHARACTER_CREATOR_DEFAULT = {
  step: "style",
  gender: "female",
  style: "realistic",
  ethnicity: "white",
  skinTone: "bronze",
  hairStyle: "long_straight",
  eyeColor: "blue",
  hairColor: "blonde",
  bodyType: "curvy",
  breastSize: "medium",
  buttSize: "athletic",
  name: "",
  age: 23,
  voice: "hottie",
  personality: "charming",
  occupation: "adult_film_actor",
  relationship: "fling",
  hobby: "none",
  fetish: "none",
  customPhysicalDetails: "",
  customFaceDetails: "",
  prompt: "",
};
const CHARACTER_CREATOR_OPTIONS = {
  gender: [
    { id: "female", label: "Female", zh: "女", prompt: "female" },
    { id: "male", label: "Male", zh: "男", prompt: "male" },
    { id: "trans", label: "Trans", zh: "跨性别", prompt: "transgender" },
  ],
  style: [
    { id: "realistic", label: "Realistic", zh: "写实", prompt: "photorealistic", image: "style-realistic.webp" },
    { id: "anime", label: "Anime", zh: "二次元", prompt: "anime-inspired", image: "style-anime.webp" },
  ],
  ethnicity: [
    { id: "asian", label: "Asian", zh: "亚洲人", prompt: "Asian", image: "ethnicity-asian.webp" },
    { id: "african", label: "Black", zh: "黑人", prompt: "Black", image: "ethnicity-african.webp" },
    { id: "white", label: "White", zh: "白人", prompt: "White", image: "ethnicity-white.webp" },
    { id: "latina", label: "Latina", zh: "拉丁裔", prompt: "Latina", image: "ethnicity-latina.webp" },
    { id: "arab", label: "Arab", zh: "阿拉伯人", prompt: "Arab", image: "ethnicity-arab.webp" },
    { id: "indian", label: "Indian", zh: "印度人", prompt: "Indian", image: "ethnicity-indian.webp" },
    { id: "japanese", label: "Japanese", zh: "日本人", prompt: "Japanese", image: "ethnicity-japanese.webp" },
    { id: "elf", label: "Elf", zh: "精灵", prompt: "elf fantasy", image: "ethnicity-elf.webp" },
    { id: "alien", label: "Alien", zh: "外星人", prompt: "alien fantasy", image: "ethnicity-alien.webp" },
    { id: "demon", label: "Demon", zh: "恶魔", prompt: "demon fantasy", image: "ethnicity-demon.webp" },
    { id: "angel", label: "Angel", zh: "天使", prompt: "angel fantasy", image: "ethnicity-angel.webp" },
    { id: "custom", label: "Custom", zh: "自定义", prompt: "", image: "custom.webp" },
  ],
  skinTone: [
    { id: "fair", label: "Fair", zh: "白皙", prompt: "fair skin", color: "#ffe4d2" },
    { id: "light", label: "Light", zh: "浅色", prompt: "light skin", color: "#ffd7b6" },
    { id: "olive", label: "Olive", zh: "橄榄色", prompt: "olive skin", color: "#e6ad74" },
    { id: "bronze", label: "Bronze", zh: "古铜色", prompt: "bronze skin", color: "#d88952" },
    { id: "dark", label: "Dark", zh: "深色", prompt: "dark skin", color: "#ba6938" },
    { id: "deep", label: "Deep", zh: "更深色", prompt: "deep dark skin", color: "#7f3b25" },
  ],
  hairStyle: [
    { id: "braided", label: "Braided", zh: "编发", prompt: "braided hair", image: "hair-braided.webp" },
    { id: "long_straight", label: "Long Straight", zh: "长发", prompt: "long straight hair", image: "hair-long-straight.webp" },
    { id: "bangs", label: "Bangs", zh: "刘海", prompt: "bangs hairstyle", image: "hair-bangs.webp" },
    { id: "ponytail", label: "Ponytail", zh: "马尾", prompt: "ponytail", image: "hair-ponytail.webp" },
    { id: "short", label: "Short", zh: "短发", prompt: "short hair", image: "hair-short.webp" },
    { id: "bun", label: "Bun", zh: "发髻", prompt: "hair bun", image: "hair-bun.webp" },
    { id: "twin_buns", label: "Twin Buns", zh: "双丸子头", prompt: "twin buns", image: "hair-twin-buns.webp" },
    { id: "wavy", label: "Wavy", zh: "波浪卷", prompt: "wavy hair", image: "hair-wavy.webp" },
    { id: "pixie", label: "Pixie", zh: "精灵短发", prompt: "pixie cut", image: "hair-pixie.webp" },
    { id: "custom", label: "Custom", zh: "自定义", prompt: "", image: "custom.webp" },
  ],
  eyeColor: [
    { id: "black", label: "Black", zh: "黑色", prompt: "black eyes", color: "#202020" },
    { id: "brown", label: "Brown", zh: "棕色", prompt: "brown eyes", color: "#b76635" },
    { id: "red", label: "Red", zh: "红色", prompt: "red eyes", color: "#ff6868" },
    { id: "gold", label: "Gold", zh: "金色", prompt: "gold eyes", color: "#f4d77f" },
    { id: "green", label: "Green", zh: "绿色", prompt: "green eyes", color: "#a6d9a8" },
    { id: "blue", label: "Blue", zh: "蓝色", prompt: "blue eyes", color: "#7fc4f1" },
    { id: "purple", label: "Purple", zh: "紫色", prompt: "purple eyes", color: "#b292ea" },
    { id: "pink", label: "Pink", zh: "粉色", prompt: "pink eyes", color: "#f4a3ce" },
    { id: "white", label: "White", zh: "白色", prompt: "white eyes", color: "#f8f8f8" },
    { id: "silver", label: "Silver", zh: "银色", prompt: "silver eyes", color: "#cbd2dc" },
  ],
  hairColor: [
    { id: "black", label: "Black", zh: "黑色", prompt: "black hair", color: "#202020" },
    { id: "brown", label: "Brown", zh: "棕色", prompt: "brown hair", color: "#b76635" },
    { id: "red", label: "Red", zh: "红色", prompt: "red hair", color: "#ff6868" },
    { id: "blonde", label: "Blonde", zh: "金色", prompt: "blonde hair", color: "#f4d77f" },
    { id: "green", label: "Green", zh: "绿色", prompt: "green hair", color: "#a6d9a8" },
    { id: "blue", label: "Blue", zh: "蓝色", prompt: "blue hair", color: "#7fc4f1" },
    { id: "purple", label: "Purple", zh: "紫色", prompt: "purple hair", color: "#b292ea" },
    { id: "pink", label: "Pink", zh: "粉色", prompt: "pink hair", color: "#f4a3ce" },
    { id: "white", label: "White", zh: "白色", prompt: "white hair", color: "#f8f8f8" },
    { id: "silver", label: "Silver", zh: "银色", prompt: "silver hair", color: "#cbd2dc" },
  ],
  bodyType: [
    { id: "slim", label: "Slim", zh: "纤瘦型", prompt: "slim body", image: "body-slim.webp" },
    { id: "athletic", label: "Athletic", zh: "运动型", prompt: "athletic body", image: "body-athletic.webp" },
    { id: "voluptuous", label: "Voluptuous", zh: "丰满型", prompt: "voluptuous body", image: "body-voluptuous.webp" },
    { id: "curvy", label: "Curvy", zh: "曲线型", prompt: "curvy body", image: "body-curvy.webp" },
    { id: "muscular", label: "Muscular", zh: "肌肉型", prompt: "muscular body", image: "body-muscular.webp" },
  ],
  breastSize: [
    { id: "flat", label: "Flat", zh: "平胸", prompt: "flat chest", image: "breast-flat.webp" },
    { id: "small", label: "Small", zh: "小", prompt: "small chest", image: "breast-small.webp" },
    { id: "medium", label: "Medium", zh: "中", prompt: "medium chest", image: "breast-medium.webp" },
    { id: "large", label: "Large", zh: "大", prompt: "large chest", image: "breast-large.webp" },
    { id: "extra_large", label: "Extra Large", zh: "超大", prompt: "extra large chest", image: "breast-extra-large.webp" },
  ],
  buttSize: [
    { id: "small", label: "Small", zh: "小", prompt: "small hips", image: "butt-small.webp" },
    { id: "slim", label: "Slim", zh: "瘦", prompt: "slim hips", image: "butt-slim.webp" },
    { id: "athletic", label: "Athletic", zh: "运动型", prompt: "athletic hips", image: "butt-athletic.webp" },
    { id: "medium", label: "Medium", zh: "中", prompt: "medium hips", image: "butt-medium.webp" },
    { id: "large", label: "Large", zh: "大", prompt: "large hips", image: "butt-large.webp" },
  ],
  voice: [
    { id: "hottie", label: "Hottie", zh: "Hottie", prompt: "Hottie voice" },
    { id: "asmr", label: "ASMR", zh: "ASMR", prompt: "ASMR voice" },
    { id: "aurora", label: "Aurora", zh: "Aurora", prompt: "Aurora voice" },
    { id: "honey", label: "Honey", zh: "Honey", prompt: "Honey voice" },
    { id: "playful", label: "Playful", zh: "Playful", prompt: "playful voice" },
    { id: "seductive", label: "Seductive", zh: "Seductive", prompt: "seductive voice" },
  ],
  personality: [
    { id: "flirty", label: "Flirty", zh: "调情", prompt: "flirty personality" },
    { id: "seductive", label: "Seductive", zh: "诱人", prompt: "seductive personality" },
    { id: "shy", label: "Shy", zh: "害羞", prompt: "shy personality" },
    { id: "sweet", label: "Sweet", zh: "甜美", prompt: "sweet personality" },
    { id: "playful", label: "Playful", zh: "爱玩", prompt: "playful personality" },
    { id: "passionate", label: "Passionate", zh: "热情", prompt: "passionate personality" },
    { id: "adventurous", label: "Adventurous", zh: "爱冒险", prompt: "adventurous personality" },
    { id: "confident", label: "Confident", zh: "自信", prompt: "confident personality" },
    { id: "charming", label: "Charming", zh: "有魅力", prompt: "charming personality" },
    { id: "witty", label: "Witty", zh: "机智", prompt: "witty personality" },
    { id: "dominant", label: "Dominant", zh: "主导", prompt: "dominant personality" },
    { id: "submissive", label: "Submissive", zh: "顺从", prompt: "submissive personality" },
    { id: "mischievous", label: "Mischievous", zh: "调皮", prompt: "mischievous personality" },
    { id: "caring", label: "Caring", zh: "关爱", prompt: "caring personality" },
    { id: "tsundere", label: "Tsundere", zh: "傲娇", prompt: "tsundere personality" },
    { id: "mysterious", label: "Mysterious", zh: "神秘", prompt: "mysterious personality" },
    { id: "intellectual", label: "Intellectual", zh: "知性", prompt: "intellectual personality" },
  ],
  occupation: [
    { id: "none", label: "None", zh: "无", prompt: "" },
    { id: "adult_film_actor", label: "Adult Film Actor", zh: "成人电影演员", prompt: "adult film actor" },
    { id: "companion", label: "Companion", zh: "陪伴者", prompt: "companion" },
    { id: "stripper", label: "Stripper", zh: "脱衣舞者", prompt: "stripper" },
    { id: "teacher", label: "Teacher", zh: "老师", prompt: "teacher" },
    { id: "lingerie_model", label: "Lingerie Model", zh: "内衣模特", prompt: "lingerie model" },
    { id: "influencer", label: "Influencer", zh: "社交媒体达人", prompt: "social media influencer" },
    { id: "doctor", label: "Doctor", zh: "医生", prompt: "doctor" },
    { id: "gamer", label: "Professional Gamer", zh: "职业玩家", prompt: "professional gamer" },
    { id: "dominatrix", label: "Dominatrix", zh: "女王", prompt: "dominatrix" },
    { id: "artist", label: "Artist", zh: "艺术家", prompt: "artist" },
    { id: "nurse", label: "Nurse", zh: "护士", prompt: "nurse" },
    { id: "streamer", label: "Streamer", zh: "网络主播", prompt: "streamer" },
    { id: "warrior", label: "Warrior", zh: "战士", prompt: "warrior" },
    { id: "lawyer", label: "Lawyer", zh: "律师", prompt: "lawyer" },
    { id: "entrepreneur", label: "Entrepreneur", zh: "创业者", prompt: "entrepreneur" },
    { id: "athlete", label: "Athlete", zh: "运动员", prompt: "athlete" },
  ],
  relationship: [
    { id: "none", label: "None", zh: "无", prompt: "" },
    { id: "stranger", label: "Stranger", zh: "陌生人", prompt: "a stranger" },
    { id: "friend", label: "Friend", zh: "朋友", prompt: "a friend" },
    { id: "fling", label: "Fling", zh: "短暂恋情", prompt: "a short romantic fling" },
    { id: "girlfriend", label: "Girlfriend", zh: "女朋友", prompt: "girlfriend" },
    { id: "wife", label: "Wife", zh: "妻子", prompt: "wife" },
    { id: "crush", label: "Crush", zh: "暗恋对象", prompt: "crush" },
  ],
  hobby: [
    { id: "none", label: "None", zh: "无", prompt: "" },
    { id: "fitness", label: "Fitness", zh: "健身", prompt: "fitness" },
    { id: "dancing", label: "Dancing", zh: "跳舞", prompt: "dancing" },
    { id: "gaming", label: "Gaming", zh: "游戏", prompt: "gaming" },
    { id: "fashion", label: "Fashion", zh: "时尚", prompt: "fashion" },
    { id: "travel", label: "Travel", zh: "旅行", prompt: "travel" },
    { id: "music", label: "Music", zh: "音乐", prompt: "music" },
    { id: "art", label: "Art", zh: "艺术", prompt: "art" },
  ],
  fetish: [
    { id: "none", label: "None", zh: "无", prompt: "" },
    { id: "roleplay", label: "Roleplay", zh: "角色扮演", prompt: "roleplay theme" },
    { id: "cosplay", label: "Cosplay", zh: "Cosplay", prompt: "cosplay theme" },
    { id: "romance", label: "Romance", zh: "浪漫", prompt: "romantic theme" },
    { id: "dominance", label: "Dominance", zh: "支配", prompt: "dominance theme" },
    { id: "submission", label: "Submission", zh: "顺从", prompt: "submission theme" },
  ],
};
const ADVANCED_CASE_TABS = [
  { id: "characters", labelKey: "nav.gallery" },
  { id: "hot", labelKey: "advanced.caseTab.hot" },
  { id: "extend", labelKey: "advanced.caseTab.extend" },
  { id: "replace", labelKey: "advanced.caseTab.replace" },
];
const ADVANCED_CASE_PAGE_SIZE = { hot: 9, extend: 3, replace: 3 };
const ADVANCED_CREATE_KINDS = [
  { id: "image", labelKey: "advanced.createKindImage", icon: "image" },
  { id: "video", labelKey: "advanced.createKindVideo", icon: "clapperboard" },
  { id: "custom", labelKey: "advanced.modeCustom", icon: "sliders-horizontal" },
];
const ADVANCED_CUSTOM_MODE = { id: "custom", labelKey: "advanced.modeCustom", icon: "sliders-horizontal", custom: true, placeholderKey: "advanced.promptPlaceholder" };
const ADVANCED_CREATE_MODES = {
  image: [
    { id: "image-create", labelKey: "advanced.modeImageCreate", icon: "image-plus", provider: "wan27-image-edit", assetTarget: "sourceImages", placeholderKey: "advanced.promptImageCreate" },
    { id: "image-edit", labelKey: "advanced.modeImageEdit", icon: "wand-sparkles", provider: "wan27-image-edit", assetTarget: "sourceImages", placeholderKey: "advanced.promptImageEdit" },
  ],
  video: [
    { id: "video-text", labelKey: "advanced.modeVideoText", icon: "type", provider: "seedance", seedanceMode: "text_to_video", assetTarget: "primary", placeholderKey: "advanced.promptVideoText" },
    { id: "video-image", labelKey: "advanced.modeVideoImage", icon: "image-up", provider: "seedance", seedanceMode: "first_frame", assetTarget: "primary", placeholderKey: "advanced.promptVideoImage" },
    { id: "video-extend", labelKey: "advanced.modeVideoExtend", icon: "stretch-horizontal", provider: "seedance", seedanceMode: "first_frame", assetTarget: "video", placeholderKey: "advanced.promptVideoExtend" },
    { id: "video-replace", labelKey: "advanced.modeVideoReplace", icon: "replace", provider: "seedance", seedanceMode: "reference_video", assetTarget: "primary", placeholderKey: "advanced.promptVideoReplace" },
    { id: "video-edit", labelKey: "advanced.modeVideoEdit", icon: "film", provider: "seedance", seedanceMode: "reference_video", assetTarget: "video", placeholderKey: "advanced.promptVideoEdit" },
  ],
  custom: [ADVANCED_CUSTOM_MODE],
};

function normalizeSeedanceMediaMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["text", "t2v", "text_video", "text_to_video"].includes(normalized)) return "text_to_video";
  if (["image", "i2v", "first", "first_image", "first_frame", "image_to_video"].includes(normalized)) return "first_frame";
  if (["first_last", "first_last_frame", "first_and_last", "start_end", "last_frame"].includes(normalized)) return "first_last_frame";
  if (["reference", "references", "reference_images", "multi_reference"].includes(normalized)) return "reference_images";
  if (["reference_video", "video_reference", "video"].includes(normalized)) return "reference_video";
  return "text_to_video";
}

function seedanceModeNeedsFirstFrame(mode = "") {
  return ["first_frame", "first_last_frame"].includes(normalizeSeedanceMediaMode(mode));
}

function seedanceModeNeedsLastFrame(mode = "") {
  return normalizeSeedanceMediaMode(mode) === "first_last_frame";
}

function seedanceModeNeedsReferenceImages(mode = "") {
  return normalizeSeedanceMediaMode(mode) === "reference_images";
}

function seedanceModeNeedsReferenceVideo(mode = "") {
  return normalizeSeedanceMediaMode(mode) === "reference_video";
}

function advancedCreateModeUsesAutoPrompt(mode = state.advancedCreateMode) {
  return ["video-extend", "video-replace"].includes(mode);
}

function advancedCreateModeNeedsReplacePair(mode = state.advancedCreateMode) {
  return mode === "video-replace";
}

function advancedCreateModeNeedsVideoUpload() {
  return state.advancedCreateKind === "video" && ["video-edit", "video-extend"].includes(state.advancedCreateMode);
}

function advancedCreateModeUsesCharacterPresetReference(mode = state.advancedCreateMode) {
  return state.advancedCreateKind === "video" && ["video-text", "video-image"].includes(mode);
}

function advancedCreateModeAcceptsVideoUpload(mode = state.advancedCreateMode) {
  return state.advancedCreateKind === "video" && ["video-edit", "video-extend"].includes(mode);
}

function advancedCreateModeAcceptsImageUpload(mode = state.advancedCreateMode) {
  return !(state.advancedCreateKind === "video" && ["video-edit", "video-extend"].includes(mode));
}

function currentAdvancedSeedanceUploadMode() {
  return normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || advancedCreateModePreferredSeedanceMode(advancedCreateModeConfig()) || "text_to_video");
}

function advancedCreateUploadIsVideo(mode = state.advancedCreateMode) {
  const provider = currentAdvancedProvider();
  const seedanceMode = currentAdvancedSeedanceUploadMode();
  if (provider === "seedance" && seedanceModeNeedsReferenceVideo(seedanceMode) && !advancedCreateModeNeedsReplacePair(mode)) return true;
  return advancedCreateModeAcceptsVideoUpload(mode) && !advancedCreateModeAcceptsImageUpload(mode);
}

function advancedCreateModePreferredSeedanceMode(config = advancedCreateModeConfig()) {
  const configured = normalizeSeedanceMediaMode(config.seedanceMode || "text_to_video");
  if (advancedCreateModeUsesCharacterPresetReference(config.id)) return "reference_images";
  if (advancedCreateModeUsesAutoPrompt(config.id)) {
    if (advancedCreateModeNeedsReplacePair(config.id)) return "reference_video";
    return "first_frame";
  }
  return configured;
}

function advancedCreateModeDefaultPrompt(mode = state.advancedCreateMode) {
  if (mode === "video-extend") {
    return "Extend [Image 1] smoothly with the same subject, scene, motion, lighting and cinematic style.";
  }
  if (mode === "video-replace") return "Replace the main person in [Video 1] with the person in [Image 1], preserving the original motion, camera, scene, and lighting.";
  return "";
}

function advancedCreateUploadAcceptValue(mode = state.advancedCreateMode) {
  if (advancedCreateModeAcceptsVideoUpload(mode) && advancedCreateModeAcceptsImageUpload(mode)) {
    return "image/*,video/mp4,video/webm,video/quicktime,video/*";
  }
  if (advancedCreateUploadIsVideo(mode)) return "video/mp4,video/webm,video/quicktime,video/*";
  return "image/*";
}

const CHARACTER_ROUTE_PARAM_NAMES = ["characterId", "character", "itemId", "id"];

function platformHashParts(value = "") {
  const raw = String(value || "").trim().replace(/^#\/?/, "");
  const [tab = "", query = ""] = raw.split("?");
  return { tab, params: new URLSearchParams(query || "") };
}

function characterRouteParamFrom(params = new URLSearchParams()) {
  for (const name of CHARACTER_ROUTE_PARAM_NAMES) {
    const value = String(params.get(name) || "").trim();
    if (value) return value;
  }
  return "";
}

function currentCharacterRouteParams({ includeSearch = true } = {}) {
  const hash = platformHashParts(window.location.hash || "");
  const search = includeSearch ? new URLSearchParams(window.location.search || "") : new URLSearchParams();
  const characterId = characterRouteParamFrom(hash.params) || characterRouteParamFrom(search);
  const source = String(hash.params.get("source") || search.get("source") || "").trim().toLowerCase();
  return { characterId, source };
}

function sanitizedSearchWithoutCharacterParams() {
  const params = new URLSearchParams(window.location.search || "");
  CHARACTER_ROUTE_PARAM_NAMES.forEach((name) => params.delete(name));
  params.delete("source");
  const next = params.toString();
  return next ? `?${next}` : "";
}

function characterDetailHash(tab = DEFAULT_PLATFORM_TAB, characterId = "", source = "") {
  const id = String(characterId || "").trim();
  if (!id) return tab === DEFAULT_PLATFORM_TAB ? "" : `#${tab}`;
  const params = new URLSearchParams({ characterId: id });
  if (source) params.set("source", source);
  return `#${tab || DEFAULT_PLATFORM_TAB}?${params.toString()}`;
}

function replacePlatformUrlForCharacter(characterId = "", source = "", tab = state.tab) {
  const hash = characterDetailHash(tab, characterId, source);
  const nextUrl = `${window.location.pathname}${sanitizedSearchWithoutCharacterParams()}${hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function normalizePlatformTab(value = "") {
  const normalized = platformHashParts(value).tab;
  if (PLAYFLUX_GALLERY_HASHES.has(String(normalized || "").toLowerCase())) return DEFAULT_PLATFORM_TAB;
  return ALL_TABS.has(normalized) ? normalized : DEFAULT_PLATFORM_TAB;
}

function galleryModeFromPlatformRoute(value = "") {
  const normalized = platformHashParts(value).tab;
  return PLAYFLUX_GALLERY_HASHES.has(String(normalized || "").toLowerCase()) ? "playflux" : "";
}

function initialPlatformTab() {
  if (window.location.hash) return normalizePlatformTab(window.location.hash);
  const searchParams = new URLSearchParams(window.location.search || "");
  const searchTab = searchParams.get("tab") || searchParams.get("view") || "";
  if (searchTab) return normalizePlatformTab(searchTab);
  return normalizePlatformTab(localStorage.getItem(TAB_KEY) || "");
}

const state = {
  config: null,
  templates: [],
  categories: [],
  estimates: {},
  tab: initialPlatformTab(),
  galleryMode: galleryModeFromPlatformRoute(window.location.hash || "") || DEFAULT_GALLERY_MODE,
  playfluxTemplateTab: "video",
  characterSource: "custom",
  characterFilters: { sort: "recommended", tag: "", gender: "", style: "", age: "", q: "" },
  characterCreator: { ...CHARACTER_CREATOR_DEFAULT },
  category: "all",
  homeCharacters: [],
  homeCharactersPage: 1,
  homeCharactersLimit: CHARACTER_PAGE_SIZE,
  homeCharactersTotal: 0,
  homeCharactersTotalPages: 1,
  homeCharactersLoadingMore: false,
  activeGalleryCharacterId: "",
  routeCharacterId: currentCharacterRouteParams().characterId,
  routeCharacterSource: currentCharacterRouteParams().source,
  characterViewTrackKeys: new Set(),
  visibleCharacterCount: CHARACTER_PAGE_SIZE,
  characterLoadObserver: null,
  myCharacters: [],
  myCharactersLoaded: false,
  myCharacterRefreshTimers: {},
  galleryUnlocks: [],
  galleryUnlocksLoaded: false,
  galleryUnlockMessage: "",
  galleryUnlockLoadingKey: "",
  advancedCases: [],
  activeAdvancedCaseId: "",
  activeAdvancedCaseTab: "hot",
  advancedCasePages: { hot: 1, extend: 1, replace: 1 },
  advancedCreateKind: "video",
  advancedCreateMode: "video-image",
  advancedEstimate: null,
  advancedEstimateKey: "",
  advancedEstimateTimer: 0,
  advancedPresetData: { sets: [], categories: {} },
  advancedPresetsLoaded: false,
  advancedPresetsLoading: false,
  advancedPresetDialogSlot: "",
  advancedPresetCharacterSource: "system",
  advancedPresetCategory: "All",
  advancedPresetSearch: "",
  advancedSelectedPresets: {},
  activeTemplate: null,
  userAssets: [],
  advancedAssets: [],
  assetImageChoices: [],
  userAssetsPage: 1,
  userAssetsLimit: 8,
  userAssetsTotal: 0,
  userAssetsTotalPages: 1,
  assetSearch: "",
  assetType: "",
  accessDocMode: "http",
  uploadDataUrl: "",
  advancedUploadDataUrl: "",
  advancedSourceImageAssetId: "",
  advancedFirstFrameAssetId: "",
  advancedReferenceImages: [],
  advancedSeedanceLastFrameDataUrl: "",
  advancedSeedanceLastFrameAssetId: "",
  advancedWanLastFrameDataUrl: "",
  advancedWanLastFrameAssetId: "",
  advancedWanClipDataUrl: "",
  advancedWanClipFileName: "",
  advancedWanClipAssetId: "",
  wallet: null,
  selectedWalletOptionId: "",
  topupMethod: "paypal",
  topupStep: "packages",
  topupPayStep: "transfer",
  selectedTopupPackageId: "",
  activeTopupOrder: null,
  paypalConfig: null,
  token: localStorage.getItem(TOKEN_KEY) || "",
  lang: localStorage.getItem(LANG_KEY) || "en",
  user: null,
  loginMode: "login",
  showAccessToken: false,
  showAccountToken: false,
  topupRecords: { page: 1, limit: 12, total: 0, totalPages: 1, records: [] },
  spendingRecords: { page: 1, limit: 12, total: 0, totalPages: 1, records: [], types: [] },
  referral: null,
  historyRecords: [],
  historyRecordsPage: 1,
  historyRecordsLimit: 8,
  historyRecordsTotal: 0,
  historyRecordsTotalPages: 1,
  assetSearchTimer: 0,
  advancedAssetSearchTimer: 0,
  advancedSideTab: "assets",
  advancedResultRecords: [],
  advancedResultTaskId: "",
  advancedResultTimer: 0,
  advancedResultLoading: false,
  workflow: null,
  workflowRunning: false,
  workflowCancelRequested: false,
  workflowMessage: "",
  workflowSelectedNodeId: "video-1",
  workflowActiveNodeId: "",
  workflowShowPhysics: false,
  workflowModelSearch: "",
  workflowPickerNodeId: "",
  workflowPickerSearch: "",
  workflowPresets: [],
  workflowPresetsLoaded: false,
  workflowPresetsLoading: false,
  workflowLogs: [],
  workflowPollTimers: {},
  advancedAssetTarget: "primary",
  advancedAssetPage: 1,
  advancedAssetLimit: 12,
  advancedAssetTotal: 0,
  advancedAssetTotalPages: 1,
  advancedAssetsLoaded: false,
  advancedAudioAssetId: "",
  topupRefreshTimer: 0,
  topupRefreshInFlight: false,
  apiSubtokens: [],
  apiSubtokensLoading: false,
  apiSubtokensLoaded: false,
  apiSubtokenMessage: "",
  createdApiSubtoken: null,
  ageGateDecision: null,
};

function tenantFeature(name, fallback = true) {
  const features = state.config?.tenantFeatures;
  if (!features || features[name] === undefined) return fallback;
  return Boolean(features[name]);
}

function isWorkflowTester() {
  return String(state.user?.username || "").trim().toLowerCase() === "test01";
}

function isTabAllowed(tab) {
  if (tab === "workflow") return isWorkflowTester();
  return tab !== "assets" || tenantFeature("assetLibrary", true);
}

const els = {
  brandName: document.querySelector("#brandName"),
  languageSelect: document.querySelector("#languageSelect"),
  ageGate: document.querySelector("#ageGate"),
  ageGateConfirmBtn: document.querySelector("#ageGateConfirmBtn"),
  ageGateDeclineBtn: document.querySelector("#ageGateDeclineBtn"),
  ageForbidden: document.querySelector("#ageForbidden"),
  categoryRow: document.querySelector("#categoryRow"),
  galleryModeTabs: document.querySelector("#galleryModeTabs"),
  templateGrid: document.querySelector("#templateGrid"),
  characterGrid: document.querySelector("#characterGrid"),
  characterSourceTabs: document.querySelector("#characterSourceTabs"),
  characterCreatorRoot: document.querySelector("#characterCreatorRoot"),
  characterCreatePrompt: document.querySelector("#characterCreatePrompt"),
  characterCreateBtn: document.querySelector("#characterCreateBtn"),
  characterCreateCost: document.querySelector("#characterCreateCost"),
  characterCreateStatus: document.querySelector("#characterCreateStatus"),
  templateDialog: document.querySelector("#templateDialog"),
  modalType: document.querySelector("#modalType"),
  modalTitle: document.querySelector("#modalTitle"),
  templateImage: document.querySelector("#templateImage"),
  uploadBox: document.querySelector("#uploadBox"),
  uploadPreview: document.querySelector("#uploadPreview"),
  templatePrompt: document.querySelector("#templatePrompt"),
  submitTemplateBtn: document.querySelector("#submitTemplateBtn"),
  jobNote: document.querySelector("#jobNote"),
  accessModeTabs: document.querySelector("#accessModeTabs"),
  accessTabs: document.querySelector("#accessTabs"),
  accessDocs: document.querySelector("#accessDocs"),
  accessGuideTitle: document.querySelector("#accessGuideTitle"),
  accessGuideDesc: document.querySelector("#accessGuideDesc"),
  accessCopy: document.querySelector("#accessCopy"),
  copyAccessBtn: document.querySelector("#copyAccessBtn"),
  accessSubtokens: document.querySelector("#accessSubtokens"),
  accessTokenDisplay: document.querySelector("#accessTokenDisplay"),
  accessTokenHint: document.querySelector("#accessTokenHint"),
  toggleAccessTokenBtn: document.querySelector("#toggleAccessTokenBtn"),
  copyTokenBtn: document.querySelector("#copyTokenBtn"),
  historyList: document.querySelector("#historyList"),
  refreshHistoryBtn: document.querySelector("#refreshHistoryBtn"),
  topupFilters: document.querySelector("#topupFilters"),
  topupSearch: document.querySelector("#topupSearch"),
  topupStatus: document.querySelector("#topupStatus"),
  topupFrom: document.querySelector("#topupFrom"),
  topupTo: document.querySelector("#topupTo"),
  topupTable: document.querySelector("#topupTable"),
  topupPager: document.querySelector("#topupPager"),
  exportTopupsBtn: document.querySelector("#exportTopupsBtn"),
  referralCard: document.querySelector("#referralCard"),
  referralLink: document.querySelector("#referralLink"),
  referralProgressFill: document.querySelector("#referralProgressFill"),
  referralInvitedCount: document.querySelector("#referralInvitedCount"),
  referralRewardStatus: document.querySelector("#referralRewardStatus"),
  referralNote: document.querySelector("#referralNote"),
  copyReferralBtn: document.querySelector("#copyReferralBtn"),
  pricingRules: document.querySelector("#pricingRules"),
  spendingFilters: document.querySelector("#spendingFilters"),
  spendingSearch: document.querySelector("#spendingSearch"),
  spendingType: document.querySelector("#spendingType"),
  spendingFrom: document.querySelector("#spendingFrom"),
  spendingTo: document.querySelector("#spendingTo"),
  spendingTable: document.querySelector("#spendingTable"),
  spendingPager: document.querySelector("#spendingPager"),
  exportSpendingBtn: document.querySelector("#exportSpendingBtn"),
  assetSearch: document.querySelector("#assetSearch"),
  assetTypeFilter: document.querySelector("#assetTypeFilter"),
  assetUploadInput: document.querySelector("#assetUploadInput"),
  refreshAssetsBtn: document.querySelector("#refreshAssetsBtn"),
  assetNote: document.querySelector("#assetNote"),
  assetGrid: document.querySelector("#assetGrid"),
  assetPager: document.querySelector("#assetPager"),
  historyPager: document.querySelector("#historyPager"),
  topupDialog: document.querySelector("#topupDialog"),
  topupHeadBtn: document.querySelector("#topupHeadBtn"),
  topupMethodTabs: document.querySelector("#topupMethodTabs"),
  topupPaypalPanel: document.querySelector("#topupPaypalPanel"),
  topupUsdtPanel: document.querySelector("#topupUsdtPanel"),
  topupTriggerBtn: document.querySelector("#topupTriggerBtn"),
  topupTriggerCredits: document.querySelector("#topupTriggerCredits"),
  topupPanel: document.querySelector("#topupPanel"),
  topupBackBtn: document.querySelector("#topupBackBtn"),
  topupPackageStage: document.querySelector("#topupPackageStage"),
  topupPackageGrid: document.querySelector("#topupPackageGrid"),
  topupPaymentStage: document.querySelector("#topupPaymentStage"),
  topupSelectedPackage: document.querySelector("#topupSelectedPackage"),
  topupCredits: document.querySelector("#topupCredits"),
  topupRate: document.querySelector("#topupRate"),
  topupWalletOptions: document.querySelector("#topupWalletOptions"),
  createTopupBtn: document.querySelector("#createTopupBtn"),
  topupQrDialog: document.querySelector("#topupQrDialog"),
  topupQrAmount: document.querySelector("#topupQrAmount"),
  topupQrAmountValue: document.querySelector("#topupQrAmountValue"),
  topupQrSubtitle: document.querySelector("#topupQrSubtitle"),
  topupQrBackBtn: document.querySelector("#topupQrBackBtn"),
  topupQrCopyBtn: document.querySelector("#topupQrCopyBtn"),
  topupQrCopyAmountBtn: document.querySelector("#topupQrCopyAmountBtn"),
  topupWalletQr: document.querySelector("#topupWalletQr"),
  topupWalletNetwork: document.querySelector("#topupWalletNetwork"),
  topupWalletAddress: document.querySelector("#topupWalletAddress"),
  topupStepTransfer: document.querySelector("#topupStepTransfer"),
  topupStepConfirm: document.querySelector("#topupStepConfirm"),
  topupTransferStep: document.querySelector("#topupTransferStep"),
  topupConfirmStep: document.querySelector("#topupConfirmStep"),
  topupTronLinkBtn: document.querySelector("#topupTronLinkBtn"),
  topupTransferDoneBtn: document.querySelector("#topupTransferDoneBtn"),
  topupTxHashInput: document.querySelector("#topupTxHashInput"),
  topupSubmitHashBtn: document.querySelector("#topupSubmitHashBtn"),
  topupConfirmStatus: document.querySelector("#topupConfirmStatus"),
  paypalBox: document.querySelector("#paypalBox"),
  paypalButtons: document.querySelector("#paypalButtons"),
  paypalStatus: document.querySelector("#paypalStatus"),
  previewDialog: document.querySelector("#previewDialog"),
  previewTitle: document.querySelector("#previewTitle"),
  previewImage: document.querySelector("#previewImage"),
  previewVideo: document.querySelector("#previewVideo"),
  supportFab: document.querySelector("#supportFab"),
  supportDialog: document.querySelector("#supportDialog"),
  supportEmail: document.querySelector("#supportEmail"),
  supportSubject: document.querySelector("#supportSubject"),
  supportMessage: document.querySelector("#supportMessage"),
  supportStatus: document.querySelector("#supportStatus"),
  supportSubmitBtn: document.querySelector("#supportSubmitBtn"),
  historyDetailDialog: document.querySelector("#historyDetailDialog"),
  historyDetailTitle: document.querySelector("#historyDetailTitle"),
  historyDetailBody: document.querySelector("#historyDetailBody"),
  inlineDialog: document.querySelector("#inlineDialog"),
  inlineDialogForm: document.querySelector("#inlineDialogForm"),
  inlineDialogTitle: document.querySelector("#inlineDialogTitle"),
  inlineDialogBody: document.querySelector("#inlineDialogBody"),
  inlineDialogConfirm: document.querySelector("#inlineDialogConfirm"),
  inlineDialogClose: document.querySelector("#inlineDialogClose"),
  inlineDialogCancel: document.querySelector("#inlineDialogCancel"),
  advancedGate: document.querySelector("#advancedGate"),
  advancedWorkspace: document.querySelector("#advancedWorkspace"),
  advancedCreateKindTabs: document.querySelector("#advancedCreateKindTabs"),
  advancedCreateModeTabs: document.querySelector("#advancedCreateModeTabs"),
  advancedPresetBuilder: document.querySelector("#advancedPresetBuilder"),
  advancedPresetDialog: document.querySelector("#advancedPresetDialog"),
  advancedPresetDialogKicker: document.querySelector("#advancedPresetDialogKicker"),
  advancedPresetDialogTitle: document.querySelector("#advancedPresetDialogTitle"),
  advancedPresetCategories: document.querySelector("#advancedPresetCategories"),
  advancedPresetSearch: document.querySelector("#advancedPresetSearch"),
  advancedPresetGrid: document.querySelector("#advancedPresetGrid"),
  advancedPrompt: document.querySelector("#advancedPrompt"),
  advancedImage: document.querySelector("#advancedImage"),
  advancedUploadBox: document.querySelector("#advancedUploadBox"),
  advancedUploadPreview: document.querySelector("#advancedUploadPreview"),
  advancedProvider: document.querySelector("#advancedProvider"),
  advancedSeedanceTier: document.querySelector("#advancedSeedanceTier"),
  advancedRatio: document.querySelector("#advancedRatio"),
  advancedResolution: document.querySelector("#advancedResolution"),
  advancedDuration: document.querySelector("#advancedDuration"),
  advancedVideoSettings: document.querySelector("#advancedVideoSettings"),
  advancedVideoResolutionChoices: document.querySelector("#advancedVideoResolutionChoices"),
  advancedVideoDurationChoices: document.querySelector("#advancedVideoDurationChoices"),
  advancedPreprocessReference: document.querySelector("#advancedPreprocessReference"),
  advancedSeedanceMediaMode: document.querySelector("#advancedSeedanceMediaMode"),
  advancedSeedanceLastFrame: document.querySelector("#advancedSeedanceLastFrame"),
  advancedSeedanceLastFramePreview: document.querySelector("#advancedSeedanceLastFramePreview"),
  advancedSeedanceVideoUrls: document.querySelector("#advancedSeedanceVideoUrls"),
  advancedSeedanceAudioUrls: document.querySelector("#advancedSeedanceAudioUrls"),
  advancedWanSeed: document.querySelector("#advancedWanSeed"),
  advancedWanMediaMode: document.querySelector("#advancedWanMediaMode"),
  advancedWanLastFrame: document.querySelector("#advancedWanLastFrame"),
  advancedWanLastFramePreview: document.querySelector("#advancedWanLastFramePreview"),
  advancedWanFirstFramePreview: document.querySelector("#advancedWanFirstFramePreview"),
  advancedWanAudioUrl: document.querySelector("#advancedWanAudioUrl"),
  advancedWanClipFile: document.querySelector("#advancedWanClipFile"),
  advancedWanClipPreview: document.querySelector("#advancedWanClipPreview"),
  advancedWanClipUrl: document.querySelector("#advancedWanClipUrl"),
  advancedReferenceSummary: document.querySelector("#advancedReferenceSummary"),
  advancedSubmitBtn: document.querySelector("#advancedSubmitBtn"),
  advancedNote: document.querySelector("#advancedNote"),
  advancedCaseGrid: document.querySelector("#advancedCaseGrid"),
  advancedAssetSearch: document.querySelector("#advancedAssetSearch"),
  advancedAssetTypeFilter: document.querySelector("#advancedAssetTypeFilter"),
  advancedAssetUploadInput: document.querySelector("#advancedAssetUploadInput"),
  refreshAdvancedAssetsBtn: document.querySelector("#refreshAdvancedAssetsBtn"),
  advancedSideTabs: document.querySelector("#advancedSideTabs"),
  advancedAssetsView: document.querySelector("#advancedAssetsView"),
  advancedResultView: document.querySelector("#advancedResultView"),
  advancedResultList: document.querySelector("#advancedResultList"),
  refreshAdvancedResultBtn: document.querySelector("#refreshAdvancedResultBtn"),
  workflowRoot: document.querySelector("#workflowRoot"),
  advancedAssetTargets: document.querySelector("#advancedAssetTargets"),
  advancedAssetNote: document.querySelector("#advancedAssetNote"),
  advancedAssetGrid: document.querySelector("#advancedAssetGrid"),
  advancedAssetPager: document.querySelector("#advancedAssetPager"),
  legalDialog: document.querySelector("#legalDialog"),
  legalTitle: document.querySelector("#legalTitle"),
  legalBody: document.querySelector("#legalBody"),
  accountMenuWrap: document.querySelector("#accountMenuWrap"),
  accountMenuBtn: document.querySelector("#accountMenuBtn"),
  accountMenuLabel: document.querySelector("#accountMenuLabel"),
  accountMenu: document.querySelector("#accountMenu"),
  menuBalance: document.querySelector("#menuBalance"),
  menuBalanceValue: document.querySelector("#menuBalanceValue"),
  menuLoginBtn: document.querySelector("#menuLoginBtn"),
  menuCopyTokenBtn: document.querySelector("#menuCopyTokenBtn"),
  menuLogoutBtn: document.querySelector("#menuLogoutBtn"),
  accountDialog: document.querySelector("#accountDialog"),
  accountName: document.querySelector("#accountName"),
  accountCredits: document.querySelector("#accountCredits"),
  accountRole: document.querySelector("#accountRole"),
  accountToken: document.querySelector("#accountToken"),
  toggleAccountTokenBtn: document.querySelector("#toggleAccountTokenBtn"),
  copyAccountTokenBtn: document.querySelector("#copyAccountTokenBtn"),
  logoutAccountBtn: document.querySelector("#logoutAccountBtn"),
  loginDialog: document.querySelector("#loginDialog"),
  loginTitle: document.querySelector("#loginTitle"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  toggleLoginMode: document.querySelector("#toggleLoginMode"),
  loginSubmit: document.querySelector("#loginSubmit"),
  loginMessage: document.querySelector("#loginMessage"),
};

function currentTopupCreditsEls() {
  return [els.topupTriggerCredits].filter(Boolean);
}
