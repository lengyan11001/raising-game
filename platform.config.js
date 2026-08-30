"use strict";

const TOKEN_KEY = "raisingGameToken";
const LANG_KEY = "raisingGameLanguage";
const TAB_KEY = "raisingGamePlatformTab";
const REFERRAL_CODE_KEY = "raisingGameReferralCode";
const REGISTRATION_ATTRIBUTION_KEY = "raisingGameRegistrationAttribution";
const AGE_GATE_ACCEPTED_KEY = "raisingGameAgeGateAccepted";
const ALL_TABS = new Set(["gallery", "characters", "chat", "advanced", "workflow", "assets", "access", "history", "topups", "spending", "referral", "pricing"]);
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
const ADVANCED_SEEDREAM5_LITE_USD_PER_IMAGE = 0.035;
const ADVANCED_SEEDREAM5_PRO_1K_USD_PER_IMAGE = 0.045;
const ADVANCED_SEEDREAM5_PRO_2K_USD_PER_IMAGE = 0.09;
const ADVANCED_SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST = 0.003;
const ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT = 3;
const ADVANCED_QWEN_IMAGE3_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
const ADVANCED_QWEN_IMAGE3_PRO_1K_USD_PER_IMAGE = 0.03438;
const ADVANCED_QWEN_IMAGE3_PRO_2K_USD_PER_IMAGE = 0.068761;
const ADVANCED_QWEN_IMAGE3_STANDARD_USD_PER_IMAGE = 0.024754;
const ADVANCED_QWEN_IMAGE3_USD_PER_REFERENCE_IMAGE = 0.00275;
const DEFAULT_ADVANCED_PROVIDER = "wan27";
const ADVANCED_SEEDANCE_REFERENCE_LIMIT = 9;
const ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT = 3;
const ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT = 3;
const ADVANCED_SEEDANCE25_IMAGE_REFERENCE_LIMIT = 30;
const ADVANCED_SEEDANCE25_VIDEO_REFERENCE_LIMIT = 10;
const ADVANCED_SEEDANCE25_AUDIO_REFERENCE_LIMIT = 10;
const ADVANCED_SEEDANCE25_TOTAL_REFERENCE_LIMIT = 50;
const ADVANCED_SEEDANCE25_480P_CREDITS_PER_SECOND = 8.995502;
const ADVANCED_SEEDANCE25_720P_CREDITS_PER_SECOND = 14.992504;
const ADVANCED_SEEDANCE_NSFW_480P_CREDITS_PER_SECOND = 15.420038;
const ADVANCED_SEEDANCE_NSFW_720P_CREDITS_PER_SECOND = 34.668;
const ADVANCED_SEEDANCE_NSFW_VIDEO_480P_CREDITS_PER_SECOND = 9.2232;
const ADVANCED_SEEDANCE_NSFW_VIDEO_720P_CREDITS_PER_SECOND = 20.736;
const ADVANCED_WAN30_IMAGE_REFERENCE_LIMIT = 10;
const ADVANCED_WAN30_VIDEO_REFERENCE_LIMIT = 5;
const ADVANCED_WAN30_AUDIO_REFERENCE_LIMIT = 5;
const ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES = 20 * 1024 * 1024;
const ADVANCED_WAN30_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const ADVANCED_WAN30_AUDIO_MAX_BYTES = 15 * 1024 * 1024;
const ADVANCED_WAN30_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;
const ADVANCED_SEEDANCE_MAX_PIXELS = 2086876;
const ADVANCED_WAN_CLIP_MAX_BYTES = 30 * 1024 * 1024;
const ADVANCED_WAN_CLIP_MAX_SECONDS = 5.05;
const DEFAULT_ASSET_IMAGE_MODIFY_CREDITS = 16.862;
const OURDREAM_PRESET_URL = "/api/ourdream/presets";
const ADVANCED_PRESET_SLOT_ORDER = ["character", "pose", "action", "outfit", "scene"];
const ADVANCED_PRESET_SLOT_META = {
  character: { labelKey: "advancedPreset.character", icon: "user-round", required: true },
  pose: { labelKey: "advancedPreset.pose", icon: "person-standing", required: false },
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
const WORKFLOW_PHYSICS_MODULES = [
  { id: "better-motion", label: "Better Motion", prompt: "more natural body movement and weight shift" },
  { id: "better-pussy", label: "Better Anatomy", prompt: "more coherent adult anatomy" },
  { id: "dark-skin", label: "Dark Skin", prompt: "preserve darker skin tones accurately" },
  { id: "small-boobs", label: "Small Boobs", prompt: "keep a smaller chest shape consistent" },
  { id: "better-dick", label: "Better Detail", prompt: "more coherent explicit detail when relevant" },
  { id: "bouncing-boobs", label: "Bouncing Boobs", prompt: "stronger natural bounce and secondary motion" },
];
const WORKFLOW_NODE_LAYOUT_VERSION = 7;
const WORKFLOW_NODE_WIDTH = 520;
const WORKFLOW_NODE_GAP = 56;
const WORKFLOW_DEFAULT_NODES = [];
const WORKFLOW_DEFAULT_EDGES = [];
const WORKFLOW_IMAGE_MODEL_LIBRARY = Object.freeze([
  Object.freeze({ id: "qwen-image3", label: "Qwen Image 3.0", resolution: "2K", ratio: "1:1", resolutions: ["1K", "2K"], ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"], tiers: ["pro", "standard"], defaultTier: "pro", outputCounts: [1, 2, 3, 4, 5, 6], promptExtend: true, watermark: false, referenceLimit: 3 }),
  Object.freeze({ id: "seedream5-image", label: "Seedream 5.0 Image", resolution: "2K", ratio: "1:1", resolutions: ["1K", "2K"], ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"], tiers: ["pro"], defaultTier: "pro", referenceLimit: 9 }),
  Object.freeze({ id: "wan27-image-edit", label: "Wan 2.7 Image", resolution: "2K", ratio: "1:1", resolutions: ["1K", "2K", "4K"], ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"], referenceLimit: 1 }),
]);
const WORKFLOW_VIDEO_MODEL_LIBRARY = Object.freeze([
  Object.freeze({ id: "seedance", label: "Seedance 2.0", resolution: "720p", ratio: "16:9", duration: 5, resolutions: ["480p", "720p", "1080p", "4k"], ratios: ["16:9", "21:9", "9:16", "4:3", "3:4", "1:1"], durations: [4, 5, 8, 10, 15, 20, 30], modes: [{ value: "reference_video", label: "Multimodal References" }, { value: "first_last_frame", label: "First + Last Frame" }], mode: "reference_video" }),
  Object.freeze({ id: "seedance25", label: "Seedance 2.5", resolution: "480p", ratio: "16:9", duration: 5, resolutions: ["480p", "720p"], ratios: ["16:9", "21:9", "9:16", "4:3", "3:4", "1:1"], durations: [4, 5, 8, 10, 15, 20, 29, 30], modes: [{ value: "omini", label: "Multimodal References" }, { value: "first_last_frame", label: "First + Last Frame" }], mode: "omini" }),
  Object.freeze({ id: "seedance-nsfw", label: "Seedance2.5 (NSFW)", resolution: "480p", ratio: "adaptive", duration: 5, resolutions: ["480p", "720p"], ratios: ["adaptive", "16:9", "21:9", "9:16", "4:3", "3:4", "1:1"], durations: [4, 5, 8, 10, 15, 20, 29, 30], modes: [{ value: "omini", label: "多模态参考" }, { value: "edit", label: "视频编辑" }, { value: "extend", label: "视频延长" }, { value: "first_last_frame", label: "首尾帧" }] }),
  Object.freeze({ id: "wan30", label: "Wan 3.0 Video", resolution: "1080p", ratio: "adaptive", duration: 5, resolutions: ["480p", "720p", "1080p"], ratios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], durations: [-1, 2, 5, 8, 10, 15, 20, 30], modes: [{ value: "multimodal", label: "Multimodal References" }, { value: "first_last_frame", label: "First + Last Frame" }], mode: "multimodal" }),
  Object.freeze({ id: "wan30-prime", label: "Wan 3.0 Video Prime", resolution: "1080p", ratio: "adaptive", duration: 5, resolutions: ["480p", "720p", "1080p"], ratios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], durations: [-1, 2, 5, 8, 10, 15, 20, 30], modes: [{ value: "multimodal", label: "Multimodal References" }, { value: "first_last_frame", label: "First + Last Frame" }], mode: "multimodal" }),
  Object.freeze({ id: "wan27", label: "Wan 2.7", resolution: "720p", ratio: "16:9", duration: 5, resolutions: ["720p", "1080p"], ratios: ["9:16", "16:9", "1:1"], durations: [2, 5, 8, 10, 15], modes: [{ value: "auto", label: "Auto from inputs" }, { value: "wan27-t2v", label: "Text to Video" }, { value: "wan27-i2v", label: "Image to Video" }, { value: "wan27-r2v", label: "Reference to Video" }, { value: "wan27-video-edit", label: "Video Edit" }], mode: "auto" }),
  Object.freeze({ id: "wan-animate", label: "Wan Animate", resolution: "720p", ratio: "16:9", duration: 5, resolutions: ["720p", "1080p"], ratios: ["9:16", "16:9", "1:1"], durations: [2, 5, 8, 10, 15, 20, 30], modes: [{ value: "auto", label: "Auto from inputs" }, { value: "wan-animate-move", label: "Image Animation" }, { value: "wan-animate-mix", label: "Character Replacement" }], mode: "auto" }),
  Object.freeze({ id: "happyhorse", label: "HappyHorse", resolution: "720p", ratio: "16:9", duration: 5, resolutions: ["720p", "1080p"], ratios: ["9:16", "16:9", "1:1"], durations: [3, 5, 8, 10, 15], modes: [{ value: "auto", label: "Auto from inputs" }, { value: "happyhorse-t2v", label: "Text to Video" }, { value: "happyhorse-i2v", label: "Image to Video" }, { value: "happyhorse-r2v", label: "Reference to Video" }, { value: "happyhorse-video-edit", label: "Video Edit" }], mode: "auto" }),
]);
const MIN_TOPUP_AMOUNT = 1;
const DEFAULT_TOPUP_AMOUNT = 100;
const DEFAULT_TOPUP_PACKAGES = [
  { id: "usd-20", amount: 20, credits: 2000, currency: "USD" },
  { id: "usd-30", amount: 30, credits: 3100, currency: "USD" },
  { id: "usd-50", amount: 50, credits: 5500, currency: "USD" },
  { id: "usd-100", amount: 100, credits: 12000, currency: "USD" },
  { id: "usd-200", amount: 200, credits: 25000, currency: "USD" },
  { id: "usd-500", amount: 500, credits: 65000, currency: "USD" },
];
const DEFAULT_TOOL_TOPUP_PACKAGES = [
  { id: "tool-usd-10", amount: 10, credits: 1000, currency: "USD" },
  { id: "tool-usd-20", amount: 20, credits: 2000, currency: "USD" },
  { id: "tool-usd-50", amount: 50, credits: 5000, currency: "USD" },
];
const TOPUP_RECORDS_AUTO_REFRESH_MS = 15000;
const TRON_USDT_CONTRACT = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const DEFAULT_PLATFORM_TAB = "gallery";
const DEFAULT_GALLERY_MODE = "characters";
const PLAYFLUX_GALLERY_MODE_BY_HASH = {
  templates: "playflux-video",
  "video-templates": "playflux-video",
  "image-templates": "playflux-image",
  "anime-templates": "playflux-anime",
  "explore-templates": "playflux-video",
  playflux: "playflux-video",
  video: "playflux-video",
  image: "playflux-image",
  anime: "playflux-anime",
};
const PLAYFLUX_GALLERY_HASHES = new Set(Object.keys(PLAYFLUX_GALLERY_MODE_BY_HASH));
const GALLERY_MODE_TABS = [
  { id: "characters", labelKey: "nav.gallery" },
  { id: "playflux-video", labelKey: "playflux.videoTab", fallback: "Video" },
  { id: "playflux-image", labelKey: "playflux.imageTab", fallback: "Image" },
  { id: "playflux-anime", labelKey: "playflux.animeTab", fallback: "Anime" },
];
const PLAYFLUX_TEMPLATE_TABS = [
  { id: "video", label: "视频", icon: "film" },
  { id: "image", label: "图片", icon: "image" },
  { id: "anime", label: "动漫", icon: "sparkles" },
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
];
const ADVANCED_CUSTOM_KIND = { id: "custom", labelKey: "advanced.modeCustom", icon: "sliders-horizontal" };
const ADVANCED_CUSTOM_MODE = { id: "custom", labelKey: "advanced.modeCustom", icon: "sliders-horizontal", custom: true, placeholderKey: "advanced.promptPlaceholder" };
const ADVANCED_CREATE_MODES = {
  image: [
    { id: "image-create", labelKey: "advanced.modeImageCreate", icon: "image-plus", provider: "wan27-image-edit", assetTarget: "sourceImages", activeSlots: ["character", "pose", "outfit", "scene"], placeholderKey: "advanced.promptImageCreate" },
    { id: "image-edit", labelKey: "advanced.modeImageEdit", icon: "wand-sparkles", provider: "wan27-image-edit", assetTarget: "sourceImages", placeholderKey: "advanced.promptImageEdit" },
  ],
  video: [
    { id: "video-text", labelKey: "advanced.modeVideoText", icon: "type", provider: "wan30", videoCapability: "wan30-video", seedanceMode: "reference_video", assetTarget: "referenceImages", activeSlots: ["character", "action", "outfit", "scene"], placeholderKey: "advanced.promptVideoText" },
    { id: "video-image", labelKey: "advanced.modeVideoImage", icon: "image-up", provider: "wan27", videoCapability: "wan27-video-edit", assetTarget: "referenceImages", activeSlots: ["character", "action"], placeholderKey: "advanced.promptVideoImage" },
    { id: "video-extend", labelKey: "advanced.modeVideoExtend", icon: "stretch-horizontal", provider: "seedance", seedanceMode: "reference_video", assetTarget: "referenceImages", placeholderKey: "advanced.promptVideoExtend" },
    { id: "video-replace", labelKey: "advanced.modeVideoReplace", icon: "replace", provider: "seedance", seedanceMode: "reference_video", assetTarget: "referenceImages", placeholderKey: "advanced.promptVideoReplace" },
    { id: "video-edit", labelKey: "advanced.modeVideoEdit", icon: "film", provider: "seedance", seedanceMode: "reference_video", assetTarget: "video", placeholderKey: "advanced.promptVideoEdit" },
  ],
  custom: [ADVANCED_CUSTOM_MODE],
};

function normalizeSeedanceMediaMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["omini", "omni"].includes(normalized)) return "omini";
  if (["edit", "video_edit"].includes(normalized)) return "edit";
  if (["extend", "video_extend", "extension"].includes(normalized)) return "extend";
  if (["text", "t2v", "text_video", "text_to_video", "reference", "references", "reference_images", "multi_reference", "multimodal", "multi_modal", "reference_video", "video_reference", "video"].includes(normalized)) return "reference_video";
  if (["image", "i2v", "first", "first_image", "first_frame", "image_to_video"].includes(normalized)) return "first_last_frame";
  if (["first_last", "first_last_frame", "first_and_last", "start_end", "last_frame"].includes(normalized)) return "first_last_frame";
  return "reference_video";
}

function seedanceModeNeedsFirstFrame(mode = "") {
  return normalizeSeedanceMediaMode(mode) === "first_last_frame";
}

function seedanceModeNeedsLastFrame(mode = "") {
  return normalizeSeedanceMediaMode(mode) === "first_last_frame";
}

function seedanceModeNeedsReferenceImages(mode = "") {
  return ["reference_video", "omini"].includes(normalizeSeedanceMediaMode(mode));
}

function seedanceModeNeedsReferenceVideo(mode = "") {
  return ["reference_video", "omini", "edit", "extend"].includes(normalizeSeedanceMediaMode(mode));
}

function advancedCreateModeUsesAutoPrompt(mode = state.advancedCreateMode) {
  return ["video-image", "video-extend", "video-replace"].includes(mode);
}

function advancedCreateModeIsSimpleEdit(mode = state.advancedCreateMode) {
  return ["image-edit", "video-edit"].includes(mode);
}

function advancedCreateModeUsesSingleUpload(mode = state.advancedCreateMode) {
  return ["image-edit", "video-edit", "video-extend", "video-replace"].includes(mode);
}

function advancedCreateModeActivePresetSlots(mode = state.advancedCreateMode) {
  if (advancedCreateModeIsSimpleEdit(mode)) return [];
  const configured = Object.values(ADVANCED_CREATE_MODES).flat().find((item) => item.id === mode);
  if (Array.isArray(configured?.activeSlots)) return configured.activeSlots;
  if (["video-extend", "video-replace"].includes(mode)) return ["character", "action"];
  return ["character", "action", "outfit", "scene"];
}

function advancedCreateModeUsesPresetBuilder(mode = state.advancedCreateMode) {
  return state.advancedCreateKind !== "custom" && advancedCreateModeActivePresetSlots(mode).length > 0;
}

function advancedCreateModeRequiresActionPreset(mode = state.advancedCreateMode) {
  return advancedCreateModeActivePresetSlots(mode).includes("action");
}

function advancedCreateModeNeedsReplacePair(mode = state.advancedCreateMode) {
  return mode === "video-replace";
}

function advancedCreateModeNeedsVideoUpload() {
  return state.advancedCreateKind === "video" && state.advancedCreateMode === "video-edit";
}

function advancedCreateModeUsesCharacterPresetReference(mode = state.advancedCreateMode) {
  return state.advancedCreateKind === "video" && ["video-text", "video-image", "video-extend", "video-replace"].includes(mode);
}

function advancedCreateModeAcceptsVideoUpload(mode = state.advancedCreateMode) {
  return state.advancedCreateKind === "video" && mode === "video-edit";
}

function advancedCreateModeAcceptsImageUpload(mode = state.advancedCreateMode) {
  return !(state.advancedCreateKind === "video" && mode === "video-edit");
}

function advancedCreateModeAllowsManualReferenceUpload(mode = state.advancedCreateMode) {
  return !(state.advancedCreateKind === "video" && ["video-image", "video-extend", "video-replace"].includes(mode));
}

function currentAdvancedSeedanceUploadMode() {
  return normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || advancedCreateModePreferredSeedanceMode(advancedCreateModeConfig()) || "reference_video");
}

function advancedCreateUploadIsVideo(mode = state.advancedCreateMode) {
  const provider = currentAdvancedProvider();
  if (provider === "seedream5-image") return false;
  if (provider === "seedance" || provider === "wan30") return false;
  return advancedCreateModeAcceptsVideoUpload(mode) && !advancedCreateModeAcceptsImageUpload(mode);
}

function advancedCreateModePreferredSeedanceMode(config = advancedCreateModeConfig()) {
  const configured = normalizeSeedanceMediaMode(config.seedanceMode || "reference_video");
  if (advancedCreateModeUsesCharacterPresetReference(config.id)) return "reference_video";
  if (advancedCreateModeUsesAutoPrompt(config.id)) {
    return "reference_video";
  }
  return configured;
}

function advancedCreateModeDefaultPrompt(mode = state.advancedCreateMode) {
  if (mode === "video-image") {
    return "将视频中的人物替换成图片中的人物。保持图片中人物的身份、脸部、发型、体型、肤色和服装特征，严格参考原视频的动作顺序、姿态变化、节奏、运镜、构图、场景、光线、剪辑、音频和时长。除人物身份替换外，不改变原视频内容，不添加文字、字幕、标志、水印或其他人物。";
  }
  if (mode === "video-extend") {
    return "Generate a cinematic video using Image 1 as the main adult character and Image 2 as the action reference. Preserve Image 1 identity, face, hairstyle, body type, and overall character consistency. Follow the selected action reference for pose and motion. No subtitles, no watermark, stable hands, stable anatomy.";
  }
  if (mode === "video-replace") return "Replace the subject of the selected action reference with Image 1 as the main adult character. Preserve Image 1 identity, face, hairstyle, body type, and overall character consistency. Follow the selected action reference for pose and motion. No subtitles, no watermark, stable hands, stable anatomy.";
  return "";
}

function advancedCreateUploadAcceptValue(mode = state.advancedCreateMode) {
  if (currentAdvancedProvider() === "seedream5-image") return "image/*";
  if (["seedance", "wan27", "wan30"].includes(currentAdvancedProvider())) {
    return `${currentAdvancedProvider() === "wan30" ? "image/*,video/mp4,video/webm,video/quicktime,video/*,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,audio/webm,audio/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.md" : "image/*,video/mp4,video/webm,video/quicktime,video/*,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,audio/webm,audio/*"}`;
  }
  if (advancedCreateUploadIsVideo(mode)) return "video/mp4,video/webm,video/quicktime,video/*";
  return "image/*";
}

function uploadedFileMime(file = {}) {
  const declared = String(file.type || "").trim().toLowerCase();
  if (declared) return declared;
  const extension = String(file.name || "").trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  const known = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    bmp: "image/bmp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
  };
  return known[extension] || "";
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
  if (normalized === "custom") return "advanced";
  return ALL_TABS.has(normalized) ? normalized : DEFAULT_PLATFORM_TAB;
}

function isAdvancedCustomRoute(value = "") {
  return String(platformHashParts(value).tab || "").toLowerCase() === "custom";
}

function galleryModeFromPlatformRoute(value = "") {
  const normalized = String(platformHashParts(value).tab || "").toLowerCase();
  return PLAYFLUX_GALLERY_MODE_BY_HASH[normalized] || "";
}

function bootstrapTenantFeatures() {
  const value = window.__TENANT_FEATURES__;
  return value && typeof value === "object" ? value : {};
}

function bootstrapTenantFeature(name, fallback = true) {
  const features = bootstrapTenantFeatures();
  if (features[name] === undefined) return fallback;
  return Boolean(features[name]);
}

function bootstrapTenantStringFeature(name, fallback = "") {
  const value = bootstrapTenantFeatures()[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bootstrapTenantListFeature(name) {
  const value = bootstrapTenantFeatures()[name];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function initialTenantDefaultTab() {
  const candidate = bootstrapTenantStringFeature("defaultTab", DEFAULT_PLATFORM_TAB);
  return ALL_TABS.has(candidate) ? candidate : DEFAULT_PLATFORM_TAB;
}

function initialTenantDefaultGalleryMode() {
  const configured = bootstrapTenantStringFeature("defaultGalleryMode", DEFAULT_GALLERY_MODE);
  const allowed = bootstrapTenantListFeature("allowedGalleryModes");
  const candidates = [configured, ...allowed, DEFAULT_GALLERY_MODE, "playflux-video", "playflux-image"];
  for (const candidate of candidates) {
    if (!galleryModeExists(candidate)) continue;
    if (allowed.length && !allowed.includes(candidate)) continue;
    return candidate;
  }
  return DEFAULT_GALLERY_MODE;
}

function initialPlatformTab() {
  if (window.location.hash) return normalizePlatformTab(window.location.hash);
  const searchParams = new URLSearchParams(window.location.search || "");
  const searchTab = searchParams.get("tab") || searchParams.get("view") || "";
  if (searchTab) return normalizePlatformTab(searchTab);
  if (bootstrapTenantFeature("toolOnly", false)) return initialTenantDefaultTab();
  return normalizePlatformTab(localStorage.getItem(TAB_KEY) || "");
}

function initialGalleryMode() {
  const routeMode = galleryModeFromPlatformRoute(window.location.hash || "");
  if (routeMode) return routeMode;
  if (bootstrapTenantFeature("toolOnly", false)) return initialTenantDefaultGalleryMode();
  return DEFAULT_GALLERY_MODE;
}

const state = {
  config: null,
  templates: [],
  playfluxTemplates: [],
  categories: [],
  estimates: {},
  tab: initialPlatformTab(),
  galleryMode: initialGalleryMode(),
  playfluxTemplateTab: "video",
  characterSource: "custom",
  characterPanelTab: "create",
  characterFilters: { sort: "recommended", tag: "", gender: "", style: "", age: "", q: "" },
  characterFiltersExpanded: false,
  characterFilterSearchTimer: null,
  characterCreator: { ...CHARACTER_CREATOR_DEFAULT },
  category: "all",
  homeCharacters: [],
  homeCharactersPage: 1,
  homeCharactersLimit: CHARACTER_PAGE_SIZE,
  homeCharactersTotal: 0,
  homeCharactersTotalPages: 1,
  homeCharactersLoadingMore: false,
  homeCharactersLoadMessage: "",
  activeGalleryCharacterId: "",
  routeCharacterId: currentCharacterRouteParams().characterId,
  routeCharacterSource: currentCharacterRouteParams().source,
  characterViewTrackKeys: new Set(),
  visibleCharacterCount: CHARACTER_PAGE_SIZE,
  characterLoadObserver: null,
  characterLoadScrollHandler: null,
  characterLoadScrollTimer: 0,
  characterLoadAutoArmed: true,
  myCharacters: [],
  myCharactersLoaded: false,
  myCharacterRefreshTimers: {},
  galleryUnlocks: [],
  galleryUnlocksLoaded: false,
  galleryUnlockMessage: "",
  galleryUnlockLoadingKey: "",
  chatConversations: [],
  chatActiveConversationId: "",
  chatMessages: [],
  chatLoading: false,
  chatSending: false,
  chatSearch: "",
  chatSetting: "style",
  chatMode: "chat",
  chatTrackerVisible: true,
  chatImagePolls: new Map(),
  advancedCases: [],
  activeAdvancedCaseId: "",
  activeAdvancedCaseTab: "hot",
  advancedCasePages: { hot: 1, extend: 1, replace: 1 },
  advancedCreateKind: isAdvancedCustomRoute(window.location.hash) ? "custom" : "video",
  advancedCreateMode: isAdvancedCustomRoute(window.location.hash) ? ADVANCED_CUSTOM_MODE.id : "video-image",
  advancedMobileTab: "create",
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
  advancedLocalUploadSlot: "",
  advancedSourceImageAssetId: "",
  advancedFirstFrameAssetId: "",
  advancedReferenceImages: [],
  advancedDocumentReference: null,
  advancedSeedanceVideoReferences: [],
  advancedSeedanceAudioReferences: [],
  advancedSeedanceGenerateAudio: true,
  advancedPendingReferences: [],
  advancedReferenceOrderCounter: 0,
  advancedSeedanceFirstFrameDataUrl: "",
  advancedSeedanceFirstFrameAssetId: "",
  advancedSeedanceLastFrameDataUrl: "",
  advancedSeedanceLastFrameAssetId: "",
  advancedWanLastFrameDataUrl: "",
  advancedWanLastFrameAssetId: "",
  advancedWanClipDataUrl: "",
  advancedWanClipFileName: "",
  advancedWanClipAssetId: "",
  advancedWanClipOrder: 0,
  advancedAudioPreviewUrl: "",
  advancedAudioFileName: "",
  advancedAudioOrder: 0,
  wallet: null,
  selectedWalletOptionId: "",
  topupMethod: "stripe",
  topupStep: "packages",
  topupPayStep: "transfer",
  selectedTopupPackageId: "",
  selectedBillingPlanId: "",
  selectedProductId: "",
  billing: null,
  activeTopupOrder: null,
  stripeConfig: null,
  token: localStorage.getItem(TOKEN_KEY) || "",
  telegramMiniApp: false,
  telegramView: "",
  telegramStartParam: "",
  lang: localStorage.getItem(LANG_KEY) || "en",
  user: null,
  showAccessToken: false,
  showAccountToken: false,
  topupRecords: { page: 1, limit: 12, total: 0, totalPages: 1, records: [] },
  spendingRecords: { page: 1, limit: 12, total: 0, totalPages: 1, records: [], types: [] },
  referral: null,
  referralLoading: false,
  referralLoadedUserId: "",
  referralLoadedAt: 0,
  historyRecords: [],
  historyRecordsPage: 1,
  historyRecordsLimit: 8,
  historyRecordsTotal: 0,
  historyRecordsTotalPages: 1,
  assetSearchTimer: 0,
  advancedAssetSearchTimer: 0,
  advancedSideTab: isAdvancedCustomRoute(window.location.hash) ? "assets" : "result",
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
  workflowCanvases: [],
  workflowCanvasesLoaded: false,
  workflowCanvasesLoading: false,
  workflowActiveCanvasId: "",
  workflowCanvasMessage: "",
  workflowCanvasSaveTimer: 0,
  workflowCanvasSaving: false,
  workflowCanvasSaveQueued: false,
  workflowCanvasSavePromise: null,
  workflowViewportSaveTimer: 0,
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

function isWorkflowTester() {
  return String(state.user?.username || "").trim().toLowerCase() === "test01";
}

function canUseAnimeTemplates() {
  return isWorkflowTester();
}

function tenantFeatures() {
  return state.config?.tenantFeatures && typeof state.config.tenantFeatures === "object"
    ? state.config.tenantFeatures
    : bootstrapTenantFeatures();
}

function tenantFeature(name, fallback = true) {
  const features = tenantFeatures();
  if (features[name] === undefined) return fallback;
  return Boolean(features[name]);
}

function membershipProgramEnabled() {
  return tenantFeature("membershipProgram", false);
}

function creatorMembershipActive() {
  return Boolean(state.user?.membershipActive || state.user?.membership?.active || state.billing?.membership?.active);
}

function apiDocsAccessActive() {
  return Boolean(state.user?.apiDocsAccess || state.user?.apiDocs?.active || state.billing?.apiDocs?.active);
}

function canUseWorkflow() {
  return tenantFeature("workflow", true);
}

function tenantStringFeature(name, fallback = "") {
  const value = tenantFeatures()[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function tenantListFeature(name) {
  const value = tenantFeatures()[name];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function tenantDisabledTabs() {
  return tenantListFeature("disabledTabs");
}

function tenantAllowedTabs() {
  return tenantListFeature("allowedTabs").filter((tab) => ALL_TABS.has(tab));
}

function tenantDefaultTabCandidate() {
  const candidate = tenantStringFeature("defaultTab", DEFAULT_PLATFORM_TAB);
  return ALL_TABS.has(candidate) ? candidate : DEFAULT_PLATFORM_TAB;
}

function tenantDefaultTab() {
  const disabled = tenantDisabledTabs();
  const allowed = tenantAllowedTabs();
  const candidates = [tenantDefaultTabCandidate(), DEFAULT_PLATFORM_TAB, "advanced", "characters", "history", "pricing"];
  for (const candidate of candidates) {
    if (!ALL_TABS.has(candidate)) continue;
    if (allowed.length && !allowed.includes(candidate)) continue;
    if (disabled.includes(candidate)) continue;
    if (candidate === "assets" && !tenantFeature("assetLibrary", true)) continue;
    if (candidate === "access" && !tenantFeature("apiAccess", true)) continue;
    if (candidate === "workflow" && !canUseWorkflow()) continue;
    return candidate;
  }
  return DEFAULT_PLATFORM_TAB;
}

function galleryModeExists(mode = "") {
  const raw = String(mode || "").trim();
  return GALLERY_MODE_TABS.some((tab) => tab.id === raw);
}

function tenantAllowedGalleryModes() {
  return tenantListFeature("allowedGalleryModes").filter(galleryModeExists);
}

function isGalleryModeAllowed(mode = "") {
  const raw = String(mode || "").trim();
  if (!galleryModeExists(raw)) return false;
  const allowed = tenantAllowedGalleryModes();
  if (allowed.length && !allowed.includes(raw)) return false;
  if (raw === "playflux-anime" && !canUseAnimeTemplates()) return false;
  return true;
}

function tenantDefaultGalleryMode() {
  const allowed = tenantAllowedGalleryModes();
  const configured = tenantStringFeature("defaultGalleryMode", DEFAULT_GALLERY_MODE);
  const candidates = [configured, ...allowed, DEFAULT_GALLERY_MODE, "playflux-video", "playflux-image"];
  for (const candidate of candidates) {
    if (isGalleryModeAllowed(candidate)) return candidate;
  }
  return DEFAULT_GALLERY_MODE;
}

function hasExplicitPlatformRoute() {
  const searchParams = new URLSearchParams(window.location.search || "");
  return Boolean(window.location.hash || searchParams.get("tab") || searchParams.get("view"));
}

function normalizeTenantRouteAfterConfig() {
  if (!state.config) return;
  const explicit = hasExplicitPlatformRoute();
  if (!explicit) {
    state.tab = tenantDefaultTab();
    if (state.tab === DEFAULT_PLATFORM_TAB) state.galleryMode = tenantDefaultGalleryMode();
  }
  if (!isTabAllowed(state.tab)) state.tab = tenantDefaultTab();
  if (state.tab === DEFAULT_PLATFORM_TAB && !isGalleryModeAllowed(state.galleryMode)) {
    state.galleryMode = tenantDefaultGalleryMode();
  }
}

function isTenantTool(toolId = "") {
  return tenantFeature("toolOnly", false) && tenantStringFeature("toolId", "") === String(toolId || "").trim();
}

function isTabAllowed(tab) {
  const raw = platformHashParts(tab).tab || String(tab || "").trim();
  const normalized = raw === "custom" ? "advanced" : ALL_TABS.has(raw) ? raw : DEFAULT_PLATFORM_TAB;
  const allowed = tenantAllowedTabs();
  if (allowed.length && !allowed.includes(normalized)) return false;
  if (tenantDisabledTabs().includes(normalized)) return false;
  if (normalized === "access" && !tenantFeature("apiAccess", true)) return false;
  if (normalized === "workflow") return canUseWorkflow();
  if (normalized === "assets") return tenantFeature("assetLibrary", true);
  return true;
}

const els = {
  brandName: document.querySelector("#brandName"),
  wan30LaunchBanner: document.querySelector("#wan30LaunchBanner"),
  wan30LaunchBtn: document.querySelector("#wan30LaunchBtn"),
  wan30LaunchClose: document.querySelector("#wan30LaunchClose"),
  languageSelect: document.querySelector("#languageSelect"),
  ageGate: document.querySelector("#ageGate"),
  ageGateConfirmBtn: document.querySelector("#ageGateConfirmBtn"),
  ageGateDeclineBtn: document.querySelector("#ageGateDeclineBtn"),
  ageForbidden: document.querySelector("#ageForbidden"),
  categoryRow: document.querySelector("#categoryRow"),
  galleryModeTabs: document.querySelector("#galleryModeTabs"),
  templateGrid: document.querySelector("#templateGrid"),
  characterPageTabs: document.querySelector("#characterPageTabs"),
  characterCreatorCard: document.querySelector("#characterCreatorCard"),
  characterListPanel: document.querySelector("#characterListPanel"),
  characterGrid: document.querySelector("#characterGrid"),
  characterSourceTabs: document.querySelector("#characterSourceTabs"),
  characterCreatorRoot: document.querySelector("#characterCreatorRoot"),
  characterCreatePrompt: document.querySelector("#characterCreatePrompt"),
  characterCreateBtn: document.querySelector("#characterCreateBtn"),
  characterCreateStatus: document.querySelector("#characterCreateStatus"),
  chatShell: document.querySelector("#chatShell"),
  chatBrowseBtn: document.querySelector("#chatBrowseBtn"),
  chatEmptyBrowseBtn: document.querySelector("#chatEmptyBrowseBtn"),
  chatSearch: document.querySelector("#chatSearch"),
  chatConversationList: document.querySelector("#chatConversationList"),
  chatMainHead: document.querySelector("#chatMainHead"),
  chatEmpty: document.querySelector("#chatEmpty"),
  chatThread: document.querySelector("#chatThread"),
  chatSuggestion: document.querySelector("#chatSuggestion"),
  chatSuggestionBtn: document.querySelector("#chatSuggestionBtn"),
  chatComposer: document.querySelector("#chatComposer"),
  chatInput: document.querySelector("#chatInput"),
  chatModeBtn: document.querySelector("#chatModeBtn"),
  chatModeMenu: document.querySelector("#chatModeMenu"),
  chatVoiceBtn: document.querySelector("#chatVoiceBtn"),
  chatContinueBtn: document.querySelector("#chatContinueBtn"),
  chatSendBtn: document.querySelector("#chatSendBtn"),
  chatCharacterCard: document.querySelector("#chatCharacterCard"),
  chatTracker: document.querySelector("#chatTracker"),
  chatSettingsBody: document.querySelector("#chatSettingsBody"),
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
  apiDocsPurchaseCard: document.querySelector("#apiDocsPurchaseCard"),
  apiDocsUnlockedContent: document.querySelector("#apiDocsUnlockedContent"),
  buyApiDocsBtn: document.querySelector("#buyApiDocsBtn"),
  apiDocsPurchaseStatus: document.querySelector("#apiDocsPurchaseStatus"),
  accessTokenDisplay: document.querySelector("#accessTokenDisplay"),
  accessTokenHint: document.querySelector("#accessTokenHint"),
  toggleAccessTokenBtn: document.querySelector("#toggleAccessTokenBtn"),
  copyTokenBtn: document.querySelector("#copyTokenBtn"),
  historyList: document.querySelector("#historyList"),
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
  membershipCard: document.querySelector("#membershipCard"),
  membershipState: document.querySelector("#membershipState"),
  buyMembershipBtn: document.querySelector("#buyMembershipBtn"),
  membershipCodeForm: document.querySelector("#membershipCodeForm"),
  membershipCodeInput: document.querySelector("#membershipCodeInput"),
  redeemMembershipCodeBtn: document.querySelector("#redeemMembershipCodeBtn"),
  membershipNote: document.querySelector("#membershipNote"),
  referralMembershipProgressText: document.querySelector("#referralMembershipProgressText"),
  referralMembershipProgressFill: document.querySelector("#referralMembershipProgressFill"),
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
  toolDownloadBtn: document.querySelector("#toolDownloadBtn"),
  mobileToolDownloadBtn: document.querySelector("#mobileToolDownloadBtn"),
  toolDownloadDialog: document.querySelector("#toolDownloadDialog"),
  topupMethodTabs: document.querySelector("#topupMethodTabs"),
  topupStripePanel: document.querySelector("#topupStripePanel"),
  topupUsdtPanel: document.querySelector("#topupUsdtPanel"),
  topupPanel: document.querySelector("#topupPanel"),
  topupBackBtn: document.querySelector("#topupBackBtn"),
  topupMembershipLink: document.querySelector("#topupMembershipLink"),
  topupPackageStage: document.querySelector("#topupPackageStage"),
  topupPackageGrid: document.querySelector("#topupPackageGrid"),
  toolSubscriptionPanel: document.querySelector("#toolSubscriptionPanel"),
  toolSubscriptionName: document.querySelector("#toolSubscriptionName"),
  toolSubscriptionPrice: document.querySelector("#toolSubscriptionPrice"),
  toolSubscriptionCredits: document.querySelector("#toolSubscriptionCredits"),
  toolSubscriptionBtn: document.querySelector("#toolSubscriptionBtn"),
  toolSubscriptionStatus: document.querySelector("#toolSubscriptionStatus"),
  toolTopupLabel: document.querySelector("#toolTopupLabel"),
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
  stripeBox: document.querySelector("#stripeBox"),
  stripeButtons: document.querySelector("#stripeButtons"),
  stripeStatus: document.querySelector("#stripeStatus"),
  previewDialog: document.querySelector("#previewDialog"),
  previewTitle: document.querySelector("#previewTitle"),
  previewImage: document.querySelector("#previewImage"),
  previewVideo: document.querySelector("#previewVideo"),
  previewActions: document.querySelector("#previewActions"),
  previewDownloadBtn: document.querySelector("#previewDownloadBtn"),
  supportFab: document.querySelector("#supportFab"),
  supportNavBtn: document.querySelector("#supportNavBtn"),
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
  advancedGate: document.querySelector("#advancedGate"),
  advancedWorkspace: document.querySelector("#advancedWorkspace"),
  advancedCreateKindTabs: document.querySelector("#advancedCreateKindTabs"),
  advancedCreateModeTabs: document.querySelector("#advancedCreateModeTabs"),
  advancedMobileTabs: document.querySelector("#advancedMobileTabs"),
  advancedPresetBuilder: document.querySelector("#advancedPresetBuilder"),
  advancedPresetDialog: document.querySelector("#advancedPresetDialog"),
  advancedPresetDialogKicker: document.querySelector("#advancedPresetDialogKicker"),
  advancedPresetDialogTitle: document.querySelector("#advancedPresetDialogTitle"),
  advancedPresetCategories: document.querySelector("#advancedPresetCategories"),
  advancedPresetSearch: document.querySelector("#advancedPresetSearch"),
  advancedPresetGrid: document.querySelector("#advancedPresetGrid"),
  advancedPrompt: document.querySelector("#advancedPrompt"),
  advancedPromptMentions: document.querySelector("#advancedPromptMentions"),
  advancedImage: document.querySelector("#advancedImage"),
  advancedUploadBox: document.querySelector("#advancedUploadBox"),
  advancedUploadPreview: document.querySelector("#advancedUploadPreview"),
  advancedProvider: document.querySelector("#advancedProvider"),
  advancedVideoCapability: document.querySelector("#advancedVideoCapability"),
  advancedSeedanceTier: document.querySelector("#advancedSeedanceTier"),
  advancedSeedreamTier: document.querySelector("#advancedSeedreamTier"),
  advancedQwenTier: document.querySelector("#advancedQwenTier"),
  advancedQwenOutputCount: document.querySelector("#advancedQwenOutputCount"),
  advancedQwenPromptExtend: document.querySelector("#advancedQwenPromptExtend"),
  advancedQwenWatermark: document.querySelector("#advancedQwenWatermark"),
  advancedWanPromptExtend: document.querySelector("#advancedWanPromptExtend"),
  advancedQwen37Thinking: document.querySelector("#advancedQwen37Thinking"),
  advancedQwen37MaxTokens: document.querySelector("#advancedQwen37MaxTokens"),
  advancedQwen37Temperature: document.querySelector("#advancedQwen37Temperature"),
  advancedRatio: document.querySelector("#advancedRatio"),
  advancedResolution: document.querySelector("#advancedResolution"),
  advancedDuration: document.querySelector("#advancedDuration"),
  advancedVideoSettings: document.querySelector("#advancedVideoSettings"),
  advancedVideoResolutionChoices: document.querySelector("#advancedVideoResolutionChoices"),
  advancedVideoDurationChoices: document.querySelector("#advancedVideoDurationChoices"),
  advancedPreprocessReference: document.querySelector("#advancedPreprocessReference"),
  advancedSeedanceMediaPanel: document.querySelector("#advancedSeedanceMediaPanel"),
  advancedFrameEngineLabel: document.querySelector("#advancedFrameEngineLabel"),
  advancedSeedanceMediaMode: document.querySelector("#advancedSeedanceMediaMode"),
  advancedSeedanceFirstFrame: document.querySelector("#advancedSeedanceFirstFrame"),
  advancedSeedanceFirstFramePreview: document.querySelector("#advancedSeedanceFirstFramePreview"),
  advancedSeedanceLastFrame: document.querySelector("#advancedSeedanceLastFrame"),
  advancedSeedanceLastFramePreview: document.querySelector("#advancedSeedanceLastFramePreview"),
  advancedSeedanceVideoUrls: document.querySelector("#advancedSeedanceVideoUrls"),
  advancedSeedanceAudioUrls: document.querySelector("#advancedSeedanceAudioUrls"),
  advancedSeedanceGenerateAudio: document.querySelector("#advancedSeedanceGenerateAudio"),
  advancedWanSeed: document.querySelector("#advancedWanSeed"),
  advancedWanMediaPanel: document.querySelector("#advancedWanMediaPanel"),
  advancedWanMediaMode: document.querySelector("#advancedWanMediaMode"),
  advancedWanFirstFrame: document.querySelector("#advancedWanFirstFrame"),
  advancedLegacyWanModel: document.querySelector("#advancedLegacyWanModel"),
  advancedWanAnimateMode: document.querySelector("#advancedWanAnimateMode"),
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
  mobileDrawerToggle: document.querySelector("#mobileDrawerToggle"),
  mobileDrawerBackdrop: document.querySelector("#mobileDrawerBackdrop"),
  mobileDrawerUser: document.querySelector("#mobileDrawerUser"),
  mobileDrawerUserName: document.querySelector("#mobileDrawerUserName"),
  mobileDrawerCredits: document.querySelector("#mobileDrawerCredits"),
  mobileDrawerTopupBtn: document.querySelector("#mobileDrawerTopupBtn"),
  mobileDrawerLoginBtn: document.querySelector("#mobileDrawerLoginBtn"),
  mobileDrawerLogoutBtn: document.querySelector("#mobileDrawerLogoutBtn"),
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
  loginForm: document.querySelector("#loginForm"),
  loginTitle: document.querySelector("#loginTitle"),
  telegramLoginBtn: document.querySelector("#telegramLoginBtn"),
  googleLoginBtn: document.querySelector("#googleLoginBtn"),
  googleLoginStatus: document.querySelector("#googleLoginStatus"),
  telegramLoginStatus: document.querySelector("#telegramLoginStatus"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginEmail: document.querySelector("#loginEmail"),
  loginEmailCode: document.querySelector("#loginEmailCode"),
  requestEmailLoginCodeBtn: document.querySelector("#requestEmailLoginCodeBtn"),
  verifyEmailLoginBtn: document.querySelector("#verifyEmailLoginBtn"),
  forgotPasswordBtn: document.querySelector("#forgotPasswordBtn"),
  accountEmail: document.querySelector("#accountEmail"),
  accountEmailCode: document.querySelector("#accountEmailCode"),
  accountCurrentPassword: document.querySelector("#accountCurrentPassword"),
  requestAccountEmailCodeBtn: document.querySelector("#requestAccountEmailCodeBtn"),
  verifyAccountEmailBtn: document.querySelector("#verifyAccountEmailBtn"),
  accountSecurityMessage: document.querySelector("#accountSecurityMessage"),
  loginSubmit: document.querySelector("#loginSubmit"),
  loginMessage: document.querySelector("#loginMessage"),
};
