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
const PLAYFLUX_TEMPLATES = [
  {
    id: "pf-video-seedance-ref",
    tab: "video",
    title: "Seedance 2.0 成人版",
    badge: "NEW",
    previewType: "video",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/seedance-2-ref-a.mp4`,
    posterUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/seedance-2-ref-a.jpg`,
    credits: 1600,
    prompt: "Combine the uploaded source with the selected motion reference. Preserve the uploaded person's identity, body type, lighting, scene direction, camera timing, and audio timing. No subtitles, no watermark.",
    seedanceMode: "reference_images",
    duration: 5,
    resolution: "720p",
    ratio: "9:16",
  },
  {
    id: "pf-video-nude",
    tab: "video",
    title: "AI 色情",
    previewType: "video",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/ai-nude.mp4`,
    posterUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/ai-nude.jpg`,
    credits: 1500,
    prompt: "Create an adult cinematic transformation video from the uploaded source. Preserve the same consenting adult subject, face, body, camera angle, and lighting. Natural motion, realistic skin, no subtitles, no watermark.",
    seedanceMode: "reference_images",
    duration: 5,
    resolution: "720p",
    ratio: "9:16",
  },
  {
    id: "pf-video-sexier-model",
    tab: "video",
    title: "性感模特",
    previewType: "video",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/sexier-model.mp4`,
    posterUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/sexier-model.jpg`,
    credits: 1500,
    prompt: "Create a sensual adult model video. Keep the uploaded adult subject's identity consistent, with smooth posing, confident expression, realistic lighting, and stable anatomy. No subtitles, no watermark.",
    seedanceMode: "reference_images",
    duration: 5,
    resolution: "720p",
    ratio: "9:16",
  },
  {
    id: "pf-video-group-oral",
    tab: "video",
    title: "多人群交口交",
    badge: "NEW",
    previewType: "video",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/group-oral.mp4`,
    posterUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/group-oral.jpg`,
    credits: 1500,
    prompt: "Create an adult group scene inspired by the selected motion preview. Preserve the uploaded adult subject identity and keep motion coherent, cinematic, and anatomically stable. No subtitles, no watermark.",
    seedanceMode: "reference_images",
    duration: 5,
    resolution: "720p",
    ratio: "9:16",
  },
  {
    id: "pf-video-pov-oral",
    tab: "video",
    title: "POV 口交",
    badge: "NEW",
    previewType: "video",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/pov-oral.mp4`,
    posterUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/pov-oral.jpg`,
    credits: 1500,
    prompt: "Create an adult POV scene matching the selected motion preview. Keep the uploaded adult character consistent, camera movement stable, hands and limbs anatomically correct, no subtitles, no watermark.",
    seedanceMode: "reference_images",
    duration: 5,
    resolution: "720p",
    ratio: "9:16",
  },
  {
    id: "pf-video-cinematic-oral",
    tab: "video",
    title: "电影级口交",
    badge: "NEW",
    previewType: "video",
    previewUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/cinematic-oral.mp4`,
    posterUrl: `${PLAYFLUX_TEMPLATE_ASSET_BASE}video/cinematic-oral.jpg`,
    credits: 1500,
    prompt: "Create a cinematic adult close-up scene inspired by the preview. Preserve the uploaded adult subject identity, realistic lighting, smooth motion, coherent hands, and stable face. No subtitles, no watermark.",
    seedanceMode: "reference_images",
    duration: 5,
    resolution: "720p",
    ratio: "9:16",
  },
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
  return ALL_TABS.has(normalized) ? normalized : DEFAULT_PLATFORM_TAB;
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
  galleryMode: DEFAULT_GALLERY_MODE,
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
