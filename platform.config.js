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
const PLAYFLUX_TEMPLATE_ASSET_BASE = "/assets/playflux/templates/";
const PLAYFLUX_TEMPLATE_TABS = [
  { id: "video", label: "视频", icon: "film" },
  { id: "image", label: "图片", icon: "image" },
  { id: "anime", label: "动漫", icon: "sparkles" },
];
const PLAYFLUX_NEGATIVE_PROMPT = "low quality, worst quality, blurry, watermark, signature, text, bad anatomy, bad hands, extra fingers, missing fingers, extra arms, extra legs, duplicated limbs, deformed body, distorted face";
const PLAYFLUX_ANIME_NEGATIVE_PROMPT = "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry";
const PLAYFLUX_VIDEO_TEMPLATE_DATA = [
  {
    id: "pf-video-001-seedance-2-0-ref-a",
    title: "Seedance 2.0 成人版",
    videoFile: "pf-video-001-demo-seedance-2-0-ref-a-resized.mp4",
    posterFile: "pf-video-001-demo-seedance-2-0-ref-a.jpg",
    badge: "NEW",
    sourceModelId: "seedance-2-0",
    prompt: "Combine @Image1 with @Video1. Keep the identity from @Image1 and match timing with @Video1.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-002-nude",
    title: "AI 色情",
    videoFile: "pf-video-002-demo-nude.mp4",
    posterFile: "pf-video-002-demo-nude.jpg",
    badge: "",
    sourceModelId: "nude",
    prompt: "A candid video showing a gorgeous woman with a large bust, she reaches over to the strap of her tank top and undresses it, her large ample breasts are now prominently exposed as she concensually removes her clothes, her breasts are perfectly shaped and her areoles are pink and incredibly detailed and visibile philoerection glands and erect nipples",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-003-sexier-nude",
    title: "性感模特",
    videoFile: "pf-video-003-demo-sexier-nude-asian-resized.mp4",
    posterFile: "pf-video-003-demo-sexier-nude-asian.jpg",
    badge: "",
    sourceModelId: "sexier-nude",
    prompt: "A woman appears in various scenes, each scene cuts to the next scene featuring the same woman. After she removes her clothes, she appears completely naked, and she poses nude with her breasts visible and her vagina can be seen between her legs. Different scenes feature the same woman in a variety of poses, where she stands, turns, walks, sits, kneels, leans forward, bends over, lies on her back, lies on her side, lies on her stomach, leans back and spreads her legs open, lays on her back with her legs open. The scenes feature the same woman from different focal lengths, such as wide shots, medium shots, and close-up shots of the same subject. The view changes between scenes to show the same subject from different angles such as medium-angle, low-angle and high angle view. She is alone. The environment is a classroom",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-004-blowbang",
    title: "多人群交口交",
    videoFile: "pf-video-004-demo-blowbang-video-asian-resized.mp4",
    posterFile: "pf-video-004-demo-blowbang-video-asian.jpg",
    badge: "NEW",
    sourceModelId: "blowbang",
    prompt: "A sweet bimbo agrees to suck dicks to please people, epic cinematic moment.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-005-pov-dick-sucking",
    title: "POV 口交",
    videoFile: "pf-video-005-demo-pov-dick-sucking-asian-resized.mp4",
    posterFile: "pf-video-005-demo-pov-dick-sucking-asian.jpg",
    badge: "NEW",
    sourceModelId: "pov-dick-sucking",
    prompt: "The video starts with a beautiful woman. The video immediately jumpcuts to the same woman kneeling on the floor in the same location being smacked slowly on her tongue by a standing man's very large penis as she keeps the tip of the penis on her tongue, she keeps her eyes open the whole time. She moves forward and licks the penis with her tongue, multiple times, keeping her eyes open and staring at the viewer. The scene is brightly lit. The man is nude, only his penis and his lower abdomen are visible at the bottom of the screen. The camera remains static throughout the entire clip in a high angle shot with the man standing in front of her.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-006-cinematic-oral",
    title: "电影级口交",
    videoFile: "pf-video-006-demo-cinematic-oral-asian-resized.mp4",
    posterFile: "pf-video-006-demo-cinematic-oral-asian.jpg",
    badge: "NEW",
    sourceModelId: "cinematic-oral",
    prompt: "The same woman appears in various scenes, each scene cuts to the next scene featuring the same woman. She approaches and goes down to the ground on her knees, and then grasps the man's penis with her hand. The man is out of frame, and only his penis and partial parts of his body can be seen. The woman becomes naked. The woman is shown from different angles, as she holds the man's penis with her hands, and then she moves her hands up and down the penis, and she licks the penis and puts the penis inside her mouth and moves it in and out repeatedly. The view changes between scenes to show the same subject from different angles, such as from the front, from the side and from above. Finally the man takes his penis in his own hand, moving his hand and aiming it at the woman's face, until viscous liquid comes out of the penis and she licks it up. Cum shoot out of the penis and lands on her face and body. She furrows her brow, then she gives a toothy grin. The cum is watery, some of the cum is translucent. The cum runs down her face and drips down. The environment is a bedroom.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-007-endless-cumming",
    title: "无尽射精",
    videoFile: "pf-video-007-endless-cumming-asian-resized.mp4",
    posterFile: "pf-video-007-endless-cumming-asian.jpg",
    badge: "NEW",
    sourceModelId: "endless-cumming",
    prompt: "same woman, continuous streams of cum, cum overflowing, drenched in cum, cum pouring down, soaked in cum, cum everywhere, submissive, lustful, looking at camera, seductive, full body view, large natural breasts, cum on tits, cum dripping down on breasts,",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-008-nude-dirty-talk",
    title: "AI 对话成人视频",
    videoFile: "pf-video-008-demo-nude-dirty-talk.mp4",
    posterFile: "pf-video-008-demo-nude-dirty-talk.jpg",
    badge: "",
    sourceModelId: "nude-hq-v2",
    prompt: "A candid video showing a gorgeous woman with a large bust, she reaches over to the strap of her tank top and undresses it, her large ample breasts are now prominently exposed as she concensually removes her clothes, her breasts are perfectly shaped and her areoles are pink and incredibly detailed and visibile philoerection glands and erect nipples. the girl is making moaning and suggestive sounds ",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-009-ai-talking-porn-v2",
    title: "AI 对话成人视频 V2",
    videoFile: "pf-video-009-demo-ai-talking-porn-v2-asian.mp4",
    posterFile: "pf-video-009-demo-ai-talking-porn-v2-asian.jpg",
    badge: "",
    sourceModelId: "ai-talking-porn-v2",
    prompt: "A candid video showing a gorgeous woman with a large bust, she reaches over to the strap of her tank top and undresses it, her large ample breasts are now prominently exposed as she concensually removes her clothes, her breasts are perfectly shaped and her areoles are pink and incredibly detailed and visibile philoerection glands and erect nipples. the girl is making moaning and suggestive sounds ",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-010-really-deep-deepthroat",
    title: "真深喉",
    videoFile: "pf-video-010-demo-really-deep-deepthroat-resized.mp4",
    posterFile: "pf-video-010-demo-really-deep-deepthroat.jpg",
    badge: "",
    sourceModelId: "really-deep-deepthroat",
    prompt: "side view deepthroat blowjob, halation, intersecting shadows, miniDV handheld camcorder footage, straight-from-camera, hard shadows, intersecting shadows, consistent identity, detailed anatomy, dynamic realistic specularity and cinematic color grading, the woman is seated in front of a giant detailed realistic penis and big scrotum. she looks at the big penis with a nervous glance, and then looks down at the ground, and then lifts the penis up with her hand and takes the entire penis into her mouth and throat, she moves closer to the mans body and takes the entire huge cock into her mouth and throat until her lips touch his body",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-103-handjob",
    title: "Handjob",
    videoFile: "pf-video-103-demo-handjob.mp4",
    posterFile: "",
    badge: "",
    sourceModelId: "handjob",
    prompt: "PENISLORA handj0b twoHanded twistJob\n\nthis video shows a woman giving a man a handjob.\n\nshe is stroking his penis with two hands\n\nshe twists her wrists as she strokes his penis",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-011-stroke-it",
    title: "手淫",
    videoFile: "pf-video-011-demo-stroke-it-asian-resized.mp4",
    posterFile: "pf-video-011-demo-stroke-it-asian.jpg",
    badge: "",
    sourceModelId: "stroke-it",
    prompt: "The scene start with a woman posing. Then scene change to a medium shot of her and a man sitting on a gray sofa in a living room with white walls. The man is wearing a black shirt and gray shorts pulled down with a hard penis. He is relaxed on the sofa with his legs open, one hand resting on her shoulder, caressing it. The woman is {describe your character here in details}. She's lying on his chest, holding his hard penis, she moves her hand up and down with her fist closed, stroking repeatedly. Her expression is one of concentration.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-012-bbc",
    title: "BBC",
    videoFile: "pf-video-012-demo-bbc-asian-resized.mp4",
    posterFile: "pf-video-012-demo-bbc-asian.jpg",
    badge: "",
    sourceModelId: "bbc",
    prompt: "a woman smiling and seducing the camera, smash cut to, Her hairstyle, facial features, and clothing were consistent. The background shifts to a bedroom, where she is having sex in bed. She turned to look at the camera, and her expression was comfortable. she is rides the massive black cock of a man, looking back at the viewer and screaming and yelling with pleasure. Her tight ass jiggles and wobbles as she rapidly slides up and down, driving the big black penis deep into her until it disappears.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-013-such-big-dick",
    title: "好大的鸡巴！",
    videoFile: "pf-video-013-demo-such-big-dick-resized.mp4",
    posterFile: "pf-video-013-demo-such-big-dick.jpg",
    badge: "",
    sourceModelId: "such-big-cock",
    prompt: "woman kneeling in her dimly lit apartment. After unzipping her date's trousers, her composed face breaks into a look of pure, wide-eyed shock and awe as she sees his huge, thick penis for the first time.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-014-missionary-v2",
    title: "传教士 V2",
    videoFile: "pf-video-014-demo-missionary-v2-asian-resized.mp4",
    posterFile: "pf-video-014-demo-missionary-v2-asian.jpg",
    badge: "",
    sourceModelId: "missionary-v2",
    prompt: "woman lies down on her back, lifting up her legs and her feet. camera to moving to top down view. man enters frame from bottom. he grab the woman's legs, inserts his penis into woman's vagina. he moves his body and thighs passionately, thrusting his penis deeply into the woman's vagina. woman moans in intense pleasure, looking at camera.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-015-bouncing-boobs",
    title: "弹跳乳房",
    videoFile: "pf-video-015-demo-bouncing-boobs-asian-resized.mp4",
    posterFile: "pf-video-015-demo-bouncing-boobs-asian.jpg",
    badge: "",
    sourceModelId: "bouncing-boobs",
    prompt: "The woman from image 1 is removing her clothes showing her naked breast and nipples, topless, showing her large breasts with visible nipples, and is wearing light blue jeans. She has a slight smile on her face and is looking directly at the camera. The lighting is soft and natural, highlighting her smooth skin and the texture of her hair. The video has a high-quality, professional feel. she moves her arms avobe her head is seen jumping causing her large naked heavy breasts to bounce, is agresively shaking her boobs up and down. She continues to shake hard her naked saggy breasts. Her breasts are heavy and pulls on her back everytime they bounce back.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-016-cumshot",
    title: "射精",
    videoFile: "pf-video-016-demo-cumshot.mp4",
    posterFile: "pf-video-016-demo-cumshot.jpg",
    badge: "",
    sourceModelId: "porn",
    prompt: "f4c3spl4sh. 4ndr3a, a woman with fair skin. The scene is captured from a front view, focusing on the woman's face and upper body. Her eyes are closed, and her mouth is open as she receives the semen. The male partner's hand is visible, holding his penis as he ejaculates. The semen is forcefully expelled, landing directly onto the woman's face and chest. The quantity of semen is substantial, covering her face and chest area. The trajectory of the semen is directed towards her face, with some of it splattering onto her chest. The woman remains still throughout the process, showing any reaction or movement. The lighting is bright, illuminating the scene clearly, and the setting appears to be indoors, possibly in a room with white walls and a door in the background.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-017-thick-cum-v2",
    title: "浓稠精液 V2",
    videoFile: "pf-video-017-demo-thick-cum-v2.mp4",
    posterFile: "pf-video-017-demo-thick-cum-v2.jpg",
    badge: "",
    sourceModelId: "thick-cum",
    prompt: "cum shoots from a penis. cum on face. cum on tongue. cum in mouth. static camera",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-018-cumshot-v2",
    title: "颜射 V2",
    videoFile: "pf-video-018-demo-cumshot-v2-asian.mp4",
    posterFile: "pf-video-018-demo-cumshot-v2-asian.jpg",
    badge: "",
    sourceModelId: "cumshot-v2",
    prompt: "camera quickly focus on the female's face. the male partner's hand is visible, holding his penis as he ejaculates penis shooting abundant amounts of cum into woman's face. the separate cum shots spurt with very fast rhythm from the penis. countless thick slimy cum shots erupt. every cum shot sticks slimily to her face. her whole face gets buried in sticky cum.|the video shows an erect penis shooting monstrous amounts of cum into woman's face with fast rhythm. multiple thick slimy cum shots. every cum shot sticks thickly to her face. her whole face gets buried in slimy cum. the cum is sticky.|The man shoots huge amounts of cum onto her fast in rapid succession. very fast rhythm cumshots. Cum runs down her face. Her face is completely covered in thick, gooey cum.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-019-face-fuck",
    title: "面部性爱",
    videoFile: "pf-video-019-demo-face-fuck-resized.mp4",
    posterFile: "pf-video-019-demo-face-fuck.jpg",
    badge: "",
    sourceModelId: "face-fuck",
    prompt: "a man appears on the left part of the view. then he is quickly grabs her head and drags her head and body around into a kneeling position in front of him with quick motions. the camera moves back a bit. then she gives him a deepthroat blowjob.he is grabbing her head and rapidly moving her head back and forth along the length of the entire penis. he rapidly thrusts his hips back and forth moving the penis inside her mouthis grabbing her head and pulls her head towards his penis, then he starts face fucking her, he thrusts his hips back and forth moving the penis inside her mouth, then she gives him a deepthroat blowjob, he is grabbing her head and he pulls her head towards his midsection moving the penis deeper into her mouth, she gags on the penis but still keeps the whole penis in her mouth, she is gagging",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-020-suck-2-dicks",
    title: "吸两根",
    videoFile: "pf-video-020-demo-suck-2-dicks.mp4",
    posterFile: "pf-video-020-demo-suck-2-dicks.jpg",
    badge: "",
    sourceModelId: "bukkake",
    prompt: "Static camera. 4K. HD. UHD. Cinematic. Static lighting. Woman in center of frame gives a d0ubl3bl0wj0b to penis on bottom center of frame with her left hand while simultaneously giving a d0ubl3bl0wj0b to the penis on the top left of the frame with her right hand f4c3spl4sh from all of the penis's in the fram directly on her face. thick long ropes of cum come out of the tips of the five penises in frame, directly f4c3spl4hing the woman in the center of the frames face",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-021-blowjob",
    title: "口交",
    videoFile: "pf-video-021-blowjob.mp4",
    posterFile: "pf-video-021-blowjob.jpg",
    badge: "",
    sourceModelId: "blowjob",
    prompt: "d0ubl3_bj, Close-up view of woman performing a blowjob on an erect penis.\n",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-022-missionary",
    title: "传教士体位",
    videoFile: "pf-video-022-demo-missionary-resized.mp4",
    posterFile: "pf-video-022-demo-missionary.jpg",
    badge: "",
    sourceModelId: "missionary",
    prompt: "Immediately cut to a new scene where the exact same person is now completely naked and lying on their back, and she moves her head forward slightly. The scene is a top-down view showing the same woman completely nude, with their legs in an open position, with her vagina visible. At the bottom of the frame a man can be partially seen, as the man takes his penis with his hand and inserts his penis into the woman's vagina, pushing his body towards her. He then moves back and forward, as he pushes his penis into the woman's vagina repeatedly. The angle is from the point of view of the man at the bottom of the frame.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-023-side-missionary-sex",
    title: "侧面传教士",
    videoFile: "pf-video-023-demo-side-missionary-sex-asian-resized.mp4",
    posterFile: "pf-video-023-demo-side-missionary-sex-asian.jpg",
    badge: "",
    sourceModelId: "side-missionary-sex",
    prompt: "Quickly switch to a new scene, the same woman is having missionary sex with a man, side view. The man is thrusting his penis inside her vagina",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-024-dirty-talk",
    title: "脏话",
    videoFile: "pf-video-024-demo-dirty-talk-resized.mp4",
    posterFile: "pf-video-024-demo-dirty-talk.jpg",
    badge: "",
    sourceModelId: "dirty-talk",
    prompt: "girl is talking in ASMR tone seductively \"last night has been great, we should do it again\", while stripping off her clothes showing her nude chest and nipples.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-025-breast-play",
    title: "玩弄胸部",
    videoFile: "pf-video-025-demo-breast-play-asian-resized.mp4",
    posterFile: "pf-video-025-demo-breast-play-asian.jpg",
    badge: "",
    sourceModelId: "breast-play",
    prompt: "the woman is playing with her breasts, squeezing and fondling them",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-026-suck-my-dick",
    title: "吸我",
    videoFile: "pf-video-026-demo-suck-my-dick-resized.mp4",
    posterFile: "pf-video-026-demo-suck-my-dick.jpg",
    badge: "",
    sourceModelId: "suck-my-dick",
    prompt: "A man appears and she sucks his penis. Static camera, fixed viewpoint, still shot.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-027-penis-play",
    title: "阴茎游戏",
    videoFile: "pf-video-027-demo-penis-play-resized.mp4",
    posterFile: "pf-video-027-demo-penis-play.jpg",
    badge: "",
    sourceModelId: "penis-play",
    prompt: "the scenes starts with the camera zooming out revealing a cinematic scene with a woman in the frame with a man with penis entering from the right side. A woman performs penis worshipping. She is holding an erect penis with both hands and bringing it towards her face. She is licking the shaft, smiling. She continues to kiss and suck the penis, then rubs it on her face. Camera is focused from a low, upward angle",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-028-mouthful",
    title: "满口",
    videoFile: "pf-video-028-demo-mouthful-resized.mp4",
    posterFile: "pf-video-028-demo-mouthful.jpg",
    badge: "",
    sourceModelId: "mouthful",
    prompt: "m0u7hfu11, the scene begins with the camera zooming in onto the woman's face with her mouth open wide while a man's hand holding a penis appear from the left side and starts ejaculating inside the woman's mouth. The focus is on the act of oral ejaculation, with the men hands holding the penis near her mouth. The woman appears to be in a state of arousal, with her eyes closed and lips parted. Seminal fluid being ejaculate from the penis is visible as it fills her mouth, dripping from her lips and pooling on her tongue. The camera angle is an extreme close-up, focusing on the open mouth and the action of swallowing. There are no other other participants or significant background details visible in the frame.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-029-ahegao",
    title: "阿黑颜",
    videoFile: "pf-video-029-demo-ahegao-resized.mp4",
    posterFile: "pf-video-029-demo-ahegao.jpg",
    badge: "",
    sourceModelId: "ahegao",
    prompt: "A woman is kneeling looking at the viewer. She makes an erotic ahegao face, sticking her tongue out, looking up and crossing her eyes. Drool and spit drip off of her tongue as she sticks it out. \n",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-030-kissing",
    title: "接吻",
    videoFile: "pf-video-030-demo-kissing-resized.mp4",
    posterFile: "pf-video-030-demo-kissing.jpg",
    badge: "",
    sourceModelId: "kissing",
    prompt: "In the first-person perspective, the girl's lips press close to the lens as if to kiss you—her lips fill the entire screen.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-031-shake-that-ass",
    title: "摇晃屁股",
    videoFile: "pf-video-031-demo-shake-that-ass-resized.mp4",
    posterFile: "pf-video-031-demo-shake-that-ass.jpg",
    badge: "",
    sourceModelId: "shake-that-ass",
    prompt: "she is wearing a tight and short skirt. she turns around and places her hands on her knees, squatting down a bit and spreading her legs, back arched, emphasizing her plump butt. she performs an ass shaking dance, her butt is facing the camera at a direct angle. the camera moves to capture her butt and thighs",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-032-lesbian-kiss",
    title: "女同接吻",
    videoFile: "pf-video-032-demo-lesbian-kiss-resized.mp4",
    posterFile: "pf-video-032-demo-lesbian-kiss.jpg",
    badge: "",
    sourceModelId: "lesbian-kissing",
    prompt: "(at 0 seconds: a girl smiles. she is flirting with a beautiful goth girl out of frame to the right) (at 1 seconds: She is wearing cheeky tight black shorts, black calf high boots, long black fingernails. She has tattoos on the backs of her legs (at 3 seconds: she leans over the counter in front of a girl, 20 years old, petite, emo, purple hair, tattoo, piercings. The camera zooms in and pans right for a profile view of the girl leaning over, down top, cleavage) (at 5 seconds: the girls french kiss) (at 6 seconds: the camera zooms out revealing their bodies, she smiles and flirts with the girl)",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-033-instant-sex",
    title: "即时性爱",
    videoFile: "pf-video-033-demo-instant-sex-resized.mp4",
    posterFile: "pf-video-033-demo-instant-sex.jpg",
    badge: "",
    sourceModelId: "instant-sex",
    prompt: "The camera zooms out while she is having sex",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-034-titfuck-v4",
    title: "乳交 V4",
    videoFile: "pf-video-034-demo-titfuck-v4-resized.mp4",
    posterFile: "pf-video-034-demo-titfuck-v4.jpg",
    badge: "",
    sourceModelId: "titfuck-v4",
    prompt: "The video begins with a close up of a woman. The video then jumpcuts to the same woman kneeling in the same location with her breasts positioned around the man's erect penis as she moves them up and down in a sliding motion. she makes various facial expressions she looks like she is talking and has her eyes wide open with a crazy expression.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-035-titfuck-v3",
    title: "乳交 V3",
    videoFile: "pf-video-035-demo-titfuck-v3-resized.mp4",
    posterFile: "pf-video-035-demo-titfuck-v3.jpg",
    badge: "",
    sourceModelId: "titfuck-v3",
    prompt: "A man appears and inserts his penis between her breasts",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-036-middlefinger",
    title: "中指",
    videoFile: "pf-video-036-demo-middlefinger-resized.mp4",
    posterFile: "pf-video-036-demo-middlefinger.jpg",
    badge: "",
    sourceModelId: "middlefinger",
    prompt: "girl giving the viewer a middle finger",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-037-facial-bukkake",
    title: "颜射乱交",
    videoFile: "pf-video-037-demo-facial-bukkake-asian-resized.mp4",
    posterFile: "pf-video-037-demo-facial-bukkake-asian.jpg",
    badge: "",
    sourceModelId: "facial-bukkake",
    prompt: "She looks straight at the camera the whole time. The camera quickly zooms in on her face. The camera movement is very smooth and quick. She stares at the men, her mouth wide open and her tongue sticking out. Strings of white semen splatter onto her face from the men's penises. Her face is covered in white semen. The semen pools on her face and head and body. The semen splatters onto her face, hair, and body, and slowly drips down like slime.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-038-covered-by-cum",
    title: "精液覆盖",
    videoFile: "pf-video-038-demo-covered-by-cum-resized.mp4",
    posterFile: "pf-video-038-demo-covered-by-cum.jpg",
    badge: "",
    sourceModelId: "covered-by-cum",
    prompt: "f4c3spl4sh, the scenes starts with the camera zooming out revealing a cinematic scene with a woman in the frame with a man entering from the right side, only his lower body is visible, side view of his hips, thighs and legs, with a gigantic erected penis with testicles. She starts recieving a cumshot on her face from the penis. The stream of semen is directed towards her mouth. The force of the ejaculation is strong, and the trajectory of the semen is aimed directly at her open mouth. The quantity of semen is substantial, covering a significant portion of her face and neck area. The woman's eyes are open, and her mouth is slightly open as she receives the semen. The camera is positioned close to the woman's face and chest, capturing the moment of male ejaculation directly onto her face and chest. The semen is seen forcefully erupting from the penis and landing on her skin, creating a visible pool of semen on her chest.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-039-cum-on-body",
    title: "射在身上",
    videoFile: "pf-video-039-demo-cum-on-body-resized.mp4",
    posterFile: "pf-video-039-demo-cum-on-body.jpg",
    badge: "",
    sourceModelId: "cum-on-body",
    prompt: "Prompt: b0dyshot s3lf pull0ut The video shows a man ejaculating on a woman's stomach and chest. The man pulls out. He pulls his penis out of her vagina. He ejaculates on her stomach and breasts. Her body and breasts covered in cum. The cum spreads thickly across her stomach. A huge, thick load of white cum shoots from the penis. the cum lands with a wet splat, spreading thickly across her stomach and breasts. The woman is happy. The man is stroking his penis.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-040-facial-on-the-phone",
    title: "打电话时颜射",
    videoFile: "pf-video-040-facial-on-the-phone-resized.mp4",
    posterFile: "pf-video-040-facial-on-the-phone.jpg",
    badge: "",
    sourceModelId: "facial-on-the-phone",
    prompt: "sh00tz, same woman, wall background, kneeling in the slums alley, natural liquid translucent white cum splashes and drips on her face, mouth full of cum, cum on tongue, erect penis ejaculate huge loads of cum on her face and hair one after the other. closing her mouth full of cum, wet thick cum spilling out of her mouth. submissive, lustful, relaxed pose, looking at camera, seductive, wide open mouth full of cum, talking on the smartphone, licking her lips, winks, brown eyes, full body view, full body shot, large natural breasts, cum on tits, cum dripping down on breasts, breasts covered in cum, big saggy breasts, top pulled up, no bra, perky tits,",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-041-summon-dicks-aisan-2",
    title: "召唤肉棒",
    videoFile: "pf-video-041-demo-summon-dicks-aisan-2-resized.mp4",
    posterFile: "pf-video-041-demo-summon-dicks-aisan-2.jpg",
    badge: "",
    sourceModelId: "summon-dicks",
    prompt: "She is looking at the camera. camera quickly move above her head. She looks up at the camera and smiles. Naked 5 boys surround her. She's smile surrounded by sea of erect 5 large penises.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-042-2-girls-fun",
    title: "两女同乐",
    videoFile: "pf-video-042-2-girls-fun-asian-resized.mp4",
    posterFile: "pf-video-042-2-girls-fun-asian.jpg",
    badge: "",
    sourceModelId: "2-girls-fun",
    prompt: "two girls, same girls with dark hair and wearing silver pasties in a living room. Two large erect penises ejaculate huge loads of cum on her face and hair. the two girls are passionately kissing.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-043-deepthroat-v3",
    title: "深喉 V3",
    videoFile: "pf-video-043-demo-deepthroat-v3-asian-resized.mp4",
    posterFile: "pf-video-043-demo-deepthroat-v3-asian.jpg",
    badge: "",
    sourceModelId: "deepthroat-v3",
    prompt: "she is doing a deepthroat",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-044-deepthroat-v2-1",
    title: "深喉 V2.1",
    videoFile: "pf-video-044-demo-deepthroat-v2-1-resized.mp4",
    posterFile: "pf-video-044-demo-deepthroat-v2-1.jpg",
    badge: "",
    sourceModelId: "deepthroat-v2-1",
    prompt: "a cinematic scene with a woman in the scene, a gigantic man enters from the right side, only his lower body is visible, side view of his hips, thighs and legs, with a erected penis with testicles appears and she starts engaging in a deepthroat blowjob with that penis. She swallows the entire penis, her nose smashes agains the man's hips. She moves her head back and fort swallowing the penis, realistic proportions, natural lighting, cinematic composition",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-045-deepthroat",
    title: "深喉",
    videoFile: "pf-video-045-demo-deepthroat-resized.mp4",
    posterFile: "pf-video-045-demo-deepthroat.jpg",
    badge: "",
    sourceModelId: "deepthroat",
    prompt: "A pov view of a woman seen giving a deepthroat blowjob to a tall man with a large, circumcised penis. the woman is engaging in a deepthroat. The tall man's penis is visible as it enters her mouth and throat. The woman's mouth and throat are clearly visible, showing the depth and movement of her throat as she swallows. The tall man's hand is seen gripping her head, indicating control over the depth and rhythm of his thrusts. She smash her face against the tall man's hips.She swallows the whole penis",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-046-double-blowjob",
    title: "双人口交",
    videoFile: "pf-video-046-demo-double-blowjob-resized.mp4",
    posterFile: "pf-video-046-demo-double-blowjob.jpg",
    badge: "",
    sourceModelId: "double-blowjob",
    prompt: "Two sexy women are giving a man a double blowjob. The man is out of frame. The view is POV.\n\nBoth women are licking and sucking the sides the penis. They move their head up and down relative to the camera. They lick the penis with their tongues and kiss the penis with their lips. they are engaged in enthusiastic penis worshipping, holding the erect penis and moving it close to her face. She licks the shaft, with close-up camera angles focusing on her face and the act.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-047-drain-my-balls",
    title: "榨干我",
    videoFile: "pf-video-047-demo-drain-my-balls-asian-resized.mp4",
    posterFile: "pf-video-047-demo-drain-my-balls-asian.jpg",
    badge: "",
    sourceModelId: "drain-my-balls",
    prompt: "The same girl is performing oral sex on a man. The man's erect penis is in the foreground, with his hand resting on her head. The woman is kneeling on a green carpeted floor, looking up at the camera with a focused expression. The lighting is bright and natural, highlighting her features. The background is blurred, but it appears to be a living room with a white couch and a wooden floor. The video is high quality and has a watermark in the bottom right corner. blowjob, deepthroat, POV. The woman puts the mans penis into her mouth and throat, he pushes her head down as she takes the entire penis down her throat. He then holds her head in place. She has a startled, gagging look on her face, her eyes well up with tears. deepthroat, blowjob, POVFFDT,",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-048-good-morning",
    title: "早安口交",
    videoFile: "pf-video-048-demo-good-morning-asian-resized.mp4",
    posterFile: "pf-video-048-demo-good-morning-asian.jpg",
    badge: "",
    sourceModelId: "good-morning-oral",
    prompt: "mrn_w00d, The scene starts with a woman, then the scene cuts to bedroom indoors, the same woman enters through the opened door, entering in the bedroom. She approaches the camera, opens her mouth in surprise and lift up the duvet, revealing a man's hard penis and thighs that was underneath. The scene cuts to the same woman in closeup, swallowing the man's hard penis. With both hands she holds the base of the man's hard penis and slowly lifts her head until the man's hard penis is completely out of her mouth. Lines of saliva connect her lips to the sticky hard penis.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-049-pov-classroom-oral",
    title: "POV教室口交",
    videoFile: "pf-video-049-demo-pov-classroom-oral-asian-resized.mp4",
    posterFile: "pf-video-049-demo-pov-classroom-oral-asian.jpg",
    badge: "",
    sourceModelId: "pov-classroom-oral",
    prompt: "A POV of a teacher man looking at a classroom of young adults in casual clothes in the distance sitting at their desks taking a test. POV of a teacher at the head of class, the teacher's desk with a coffee cup and briefcase on top of it is at the bottom of frame and the top of the desk extends all the way to the bottom of the frame and the classroom full of adult students is in the background, all the students are sitting diligently at their desk writing and studying. the students move their pens on the paper on their desks, they all look different and the camera holds on them for a few seconds. the camera quickly pans downward, and under the desk is the exact same girl from image 1 performing a povffdt deepthroat POV POVFFDT blowjob in the dark underneath the desk in on the viewer as she enters frame. the viewer has his penis out under his desk and the woman is performing oral sex on his huge penis as she enters frame. the woman is hidden from the students but she sensually performs a deepthroat blowjob, she is bobbing her head back and forth while sucking the viewers's huge erect penis with the foreskin pulled back, the penis is going deep into her mouth and throat. The woman makes the penis wet with transluscent saliva. she looks directly at viewer with submissive loving eyes as she continues to perform the blowjob.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-050-pov-wedding-oral",
    title: "POV婚礼口交",
    videoFile: "pf-video-050-demo-pov-wedding-oral-asian-resized.mp4",
    posterFile: "pf-video-050-demo-pov-wedding-oral-asian.jpg",
    badge: "",
    sourceModelId: "pov-wedding-oral",
    prompt: "Quickly Switch to a new scene. Wide shot, low angle, wide zoom, fisheye lens, static camera. Deepthroat. The Same woman is sucking a man's penis. She moves her head up and down on his cock all the way to his pelvis, lips wrapped around penis. She smashes her lips against his pelvis in rapid motions. (Her head moves up and down quickly in steady big motions as she sucks the penis:1.3), her big lips are touching his crotch, completely covering his penis. (She maintains constant eye contact with the viewer:1.6). The view is POV with the woman always facing the viewer. She keeps her hands on the ground. She is a beautiful and cute woman with gorgeous eyes. She wears a bride outfit. She has big breasts. The background is a wedding venue out in the open outside of Tokyo, Japan. The sky is blue, the grass is green. Big rows of geusts sitting on chairs can be seen looking at the viewer and clapping. Behind the girl on the right is the male groom, he wears a formal suit. the groom is giving thumbs up and smiling brightly.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-051-69-blowjob",
    title: "69口交",
    videoFile: "pf-video-051-demo-69-blowjob-resized.mp4",
    posterFile: "pf-video-051-demo-69-blowjob.jpg",
    badge: "",
    sourceModelId: "69-blowjob",
    prompt: "instantly blackout and cut to the next scene. A woman is positioned above a man in a 69 position. Her head is near the man's groin, and she is deepthroating his penis. The man's legs are spread apart, and his testicles are visible resting under the woman's nose. The lighting highlights skin texture on both individuals's thighs.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-052-dance-v4-new",
    title: "舞蹈 V4",
    videoFile: "pf-video-052-demo-dance-v4-new-resized.mp4",
    posterFile: "pf-video-052-demo-dance-v4-new.jpg",
    badge: "",
    sourceModelId: "dancing-v4",
    prompt: "She sways her hips side to side with her arms crossed.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-053-dance-v3-new",
    title: "舞蹈 V3",
    videoFile: "pf-video-053-demo-dance-v3-new-resized.mp4",
    posterFile: "pf-video-053-demo-dance-v3-new.jpg",
    badge: "",
    sourceModelId: "dancing-v3",
    prompt: "camera zooms out to capture her full body while she performs the g00dth1nk dance",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-054-dance-v2",
    title: "舞蹈 V2",
    videoFile: "pf-video-054-demo-dance-v2-resized.mp4",
    posterFile: "pf-video-054-demo-dance-v2.jpg",
    badge: "",
    sourceModelId: "dancing",
    prompt: "Naughty horny woman",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-055-caramelldansen",
    title: "Caramelldansen",
    videoFile: "pf-video-055-demo-caramelldansen-resized.mp4",
    posterFile: "pf-video-055-demo-caramelldansen.jpg",
    badge: "",
    sourceModelId: "caramelldansen",
    prompt: "Caramelldansen",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-056-doggy-style-v3",
    title: "POV Doggy",
    videoFile: "pf-video-056-demo-doggy-style-v3-resized.mp4",
    posterFile: "pf-video-056-demo-doggy-style-v3.jpg",
    badge: "",
    sourceModelId: "doggy-style-v3",
    prompt: "The video begins with shot of a woman. The video then jumpcuts to the same woman now having sex in doggystyle position in the same location. From an overhead perspective, she is on all fours with her back facing the camera. A man is positioned behind her, his hands gripping her hips as he penetrates her from behind. The woman's expression changes throughout the scene, showing moments of pleasure and engagement with her partner. Her legs are spread apart with the man in-between her legs.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-057-full-nelson-sex-v2",
    title: "全尼尔森体位 V2",
    videoFile: "pf-video-057-demo-full-nelson-sex-v2-resized.mp4",
    posterFile: "pf-video-057-demo-full-nelson-sex-v2.jpg",
    badge: "",
    sourceModelId: "full-nelson-sex-v2",
    prompt: "fn_sm4shcut the woman is standing there smiling. The scene immediately transitions and the same woman is being fucked in a full nelson position",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-058-full-nelson-sex",
    title: "全尼尔森体位",
    videoFile: "pf-video-058-demo-full-nelson-sex-resized.mp4",
    posterFile: "pf-video-058-demo-full-nelson-sex.jpg",
    badge: "",
    sourceModelId: "full-nelson-sex",
    prompt: "FU11N31S0N: A woman enjoys an anal penetration with her legs spread wide apart. The man thrusts his veiny penis deeply into her, creating a full nelson position. Her facial expressions indicate pleasure, making sounds of enjoyment. His movements are rhythmic and forceful, exerting significant effort. This intense and explicit scene.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-059-cowgirl-v4",
    title: "骑乘位 V4",
    videoFile: "pf-video-059-demo-cowgirl-v4-asian-resized.mp4",
    posterFile: "pf-video-059-demo-cowgirl-v4-asian.jpg",
    badge: "",
    sourceModelId: "cowgirl-v4",
    prompt: "| Immediately cut to a new scene where the exact same person is now completely nude and squatting with their legs in an open position, with her naked vagina visible. Her face looks the same as the first frame, she looks at the camera. At the bottom of the frame a man's groin with an erect penis can be partially seen, as the rest of the man is out of frame and not visible. The man takes his penis with his hand and inserts the penis into the woman's vagina, the woman squats down on top of the penis. She then moves up and down, as she pushes the penis into her vagina repeatedly. The man holds on to her legs with his hands. The scene is a low-angle view.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-060-cowgirl-v3",
    title: "骑乘位 V3",
    videoFile: "pf-video-060-demo-cowgirl-v3-resized.mp4",
    posterFile: "pf-video-060-demo-cowgirl-v3.jpg",
    badge: "",
    sourceModelId: "cowgirl-v3",
    prompt: "reverse_cowgirl_lie_front_vagina The screen goes dark and then lights up again to show the woman having sex with a man",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-061-cowgirl-v2",
    title: "女上位 V2",
    videoFile: "pf-video-061-demo-cowgirl-v2-resized.mp4",
    posterFile: "pf-video-061-demo-cowgirl-v2.jpg",
    badge: "",
    sourceModelId: "cowgirl-v2",
    prompt: "a woman is straddling a man and eagerly having sex with him. Very high quality, 4k, photorealistic, sex scene, detailed, bedroom, blonde woman and Latino man.  She bounces up and down on top of the man. The camera is aimed from the side. She is squatting with her knees raised.   Her hands are resting on the man's chest. Her straight hair is long and blonde. There is a clear view of her face  as she opens her mouth and moans with pleasure. Latino man penis is visible and you can see his legs in the background. You can see the woman bouncing up and down on the man's erect penis.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-062-cowgirl",
    title: "女上位",
    videoFile: "pf-video-062-demo-cowgirl-resized.mp4",
    posterFile: "pf-video-062-demo-cowgirl.jpg",
    badge: "",
    sourceModelId: "cowgirl",
    prompt: "the camera follows the exact same person as she moves forward and leans forward to squat with her legs in an open position over a man's groin with an erect penis. The woman squats down on top of the penis, and the penis goes into her vagina. She then leans back, as she sits with the penis in her vagina. The man holds on to her legs with his hands. The scene is a low-angle view.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-063-cowgirl-backview",
    title: "骑乘位（后视图）",
    videoFile: "pf-video-063-demo-cowgirl-backview-asian-resized.mp4",
    posterFile: "pf-video-063-demo-cowgirl-backview-asian.jpg",
    badge: "",
    sourceModelId: "cowgirl-back-view",
    prompt: "The scene starts with the woman posing. Then the scene cuts to a front view of a man and the woman in a bedroom. The man is completely naked, sitting on the sofa, holding the woman's back. His penis is black and hard and is inserted inside the woman's vagina. The woman is {describe your girl in details}, totally naked, kneeling in the man's lap, has her back to the camera while his penis is inserted inside her vagina. Her skin is pale, with short white hair. The woman moves faster her buttocks up and down, making the man's penis go in and out of her vagina faster. She looks back at camera, her expression is desperate.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-064-sex-from-behind",
    title: "后入",
    videoFile: "pf-video-064-demo-sex-from-behind-resized.mp4",
    posterFile: "pf-video-064-demo-sex-from-behind.jpg",
    badge: "",
    sourceModelId: "sex-from-behind",
    prompt: "instantly blackout and cut to the next scene. The same girl with swinging breasts, slides in and out, fast, long thrusts, a man, slick with sweat, dominates a woman as she arches into the ride. He penetrates her with his cock sliding in and out with effortless rhythm, her hips pressing into the womans ass. The woman, moans loudly as her partner spanks her ass hard once — her head thrown back, mouth open in gasp, thighs trembling. Camera remains stationary, medium shot, framing their bodies in full intimacy. The camera is still without zooming or moving.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-065-side-fuck",
    title: "侧入体位",
    videoFile: "pf-video-065-demo-side-fuck-asian-resized.mp4",
    posterFile: "pf-video-065-demo-side-fuck-asian.jpg",
    badge: "",
    sourceModelId: "side-fuck",
    prompt: "The scene starts with the woman posing. Then the scene cuts to a front view of a man and the same woman in a bedroom. They are lying on their sides in bed, facing the camera. The man is completely naked, holding the woman's breast. His penis is black and hard and is inserted inside the woman's vagina. The woman is (description your girl her in details) with her head and facial can be seen clearly and being identical, is naked and the man's penis is inserted inside her vagina. The man's penis is going in and out of her vagina. Her body trembles as he moves his hips.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-066-standing-sex",
    title: "站立式性交",
    videoFile: "pf-video-066-demo-standing-sex-resized.mp4",
    posterFile: "pf-video-066-demo-standing-sex.jpg",
    badge: "",
    sourceModelId: "standing-sex",
    prompt: "A woman posing. Then the scene cut to a back view from below. The background is a bedroom, a man and the same woman, both naked standing. The man is lifting the woman's leg, holding her bare buttocks, her body is naked now. His hard penis is penetrating the woman's pussy. The man is lifting the woman's leg, holding her buttocks. His hard penis is penetrating the woman's pussy.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-067-she-is-into-you",
    title: "她喜欢你",
    videoFile: "pf-video-067-she-is-into-you-asian-resized.mp4",
    posterFile: "pf-video-067-she-is-into-you-asian.jpg",
    badge: "",
    sourceModelId: "she-is-into-you",
    prompt: "The woman is posing. Then the scene cuts to a living room. At the bottom is a light-skinned man's lower body, his belly, thighs, hand, and his hard penis are visible. He is holding his hard penis with his hand, stroking it. In the center, the same woman is standing. She is facing away from the camera, wearing only a short dress that doesn't cover her buttocks, leaving her vagina and anus visible. The woman then uses both hands to separate her buttocks and sits on the hard penis, inserting it completely into her vagina. Her buttocks move up and down repeatedly with speed, causing the hard penis to go in and out of her vagina.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-068-reverse-squatting",
    title: "反向深蹲",
    videoFile: "pf-video-068-demo-reverse-squatting-resized.mp4",
    posterFile: "pf-video-068-demo-reverse-squatting.jpg",
    badge: "",
    sourceModelId: "reverse-squatting",
    prompt: "The scene starts with the asian woman posing. Then the scene cuts to a front view of a man and the same woman in a living room. In the center is a white sofa. The man is completely naked, sitting on the sofa. His penis is black and hard and is inserted inside the woman's vagina. The woman is totally naked now, squatting on top of the man, with his hard penis inserted inside her vagina. {Describe your girls in details here}. The man moves his hips rapidly, making his penis go up and down repeatedly, going in and out of her vagina.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-069-she-caught-me",
    title: "被她发现了",
    videoFile: "pf-video-069-demo-she-caught-me-asian-resized.mp4",
    posterFile: "pf-video-069-demo-she-caught-me-asian.jpg",
    badge: "",
    sourceModelId: "she-found-me",
    prompt: "Scene starts with a woman posing, she is the main focus of the scene. Then the scene change to a medium shot of her and a man now in a living room with white walls. Her face now has a smile as she looks at him. The man sitting on the sofa and her standing behind the sofa, leaning forward. The man is 18-years-old, slender and ugly, wearing a shirt with a superhero print, completely naked from the waist down, with his legs spread while she holds his hard penis. She holds his hard penis with her closed fist, moving up and down stroking repeatedly.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-070-fuck-machine",
    title: "性爱机器",
    videoFile: "pf-video-070-demo-fuck-machine-asian-resized.mp4",
    posterFile: "pf-video-070-demo-fuck-machine-asian.jpg",
    badge: "",
    sourceModelId: "fuck-machine",
    prompt: "Quickly switch to a new scene, the same woman is using a dildo sex machine, the large multicolor dildo is attached to a metal rod thrusting back and forth inside her vagina, She is lying back on a brown bed, naked . She is smiling and moaning from blissful pleasure. soft and even lighting in a terrace.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-071-fingering",
    title: "指交",
    videoFile: "pf-video-071-demo-fingering-resized.mp4",
    posterFile: "pf-video-071-demo-fingering.jpg",
    badge: "",
    sourceModelId: "fingering",
    prompt: "instantly blackout and cut to the next scene. The girl is laying naked on a bed, girl pushing fingers into pussy, two fingers, solo, targeting her vaginal entrance, fast rhythmic thrusts,",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-072-fingered",
    title: "粗暴指交",
    videoFile: "pf-video-072-demo-fingered-resized.mp4",
    posterFile: "pf-video-072-demo-fingered.jpg",
    badge: "",
    sourceModelId: "fingered",
    prompt: "instantly blackout and cut to the next scene. front view of a woman from below with her legs spread. A man is roughly fingering her vagina. She is pleasured and having an orgasm face. The man is out of frame.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-073-pussy-rubbing",
    title: "揉阴",
    videoFile: "pf-video-073-demo-pussy-rubbing-resized.mp4",
    posterFile: "pf-video-073-demo-pussy-rubbing.jpg",
    badge: "",
    sourceModelId: "pussy-rubbing",
    prompt: "instantly blackout and cut to the next scene. a nude woman is lying with her legs spread wide, she licks her fingers and rubs her pussy with her fingers",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-074-pussy-slapping",
    title: "拍打阴部",
    videoFile: "pf-video-074-demo-pussy-slapping-resized.mp4",
    posterFile: "pf-video-074-demo-pussy-slapping.jpg",
    badge: "",
    sourceModelId: "pussy-slapping",
    prompt: "instantly blackout and cut to the next scene. the girl is laying naked on a bed, showing her pussy. she slaps her pussy with her hand",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-075-pussy-lick",
    title: "舔阴",
    videoFile: "pf-video-075-demo-pussy-lick-asian-resized.mp4",
    posterFile: "pf-video-075-demo-pussy-lick-asian.jpg",
    badge: "",
    sourceModelId: "pussy-lick",
    prompt: "Scene starts with a woman posing, she is the main focus of the scene. The the scene cut to a top-down view of a living room with white walls, a striped sofa on the right side, and 2 other women. She is in the center, lying facing the camera in an armchair, looking directly at the camera, with her legs open and her vagina exposed, caressing the heads of the two women. In front of her, two other women are face to face, very close to her vagina. The camera then begins to descend and zoom in, showing a close-up of the two women licking and sucking her vagina, her pussy is wet and has lines of clear saliva, focusing on her vagina and anus.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-076-dildo-v1",
    title: "假阳具 V1",
    videoFile: "pf-video-076-demo-dildo-v1-resized.mp4",
    posterFile: "pf-video-076-demo-dildo-v1.jpg",
    badge: "",
    sourceModelId: "dildo-v1",
    prompt: "instantly blackout and cut to the next scene. the exact same woman is lying on an office table, she is wearing black stockings, high heels and undone white shirt through which her bare breasts are visible, she inserts a dildo in her pussy, she is well lit, she has ponytail hair and big natural breasts, shaved vagina, she looks in the camera, low angle front view, A bright office of a modern IT company, the dildo is of skin color",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-077-squirting-v2",
    title: "喷水 V2",
    videoFile: "pf-video-077-demo-squirting-v2-resized.mp4",
    posterFile: "pf-video-077-demo-squirting-v2.jpg",
    badge: "",
    sourceModelId: "squirting-v2",
    prompt: "instantly blackout and cut to the next scene. A woman with her legs are spread wide with her (vagina squirting clear fluid upwards hitting the camera lens), Her facial expression shows an open mouth, in state of arousal. She looks at the viewer. (highly detailed, anatomically correct)",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-078-squirting",
    title: "潮吹",
    videoFile: "pf-video-078-demo-squirting-resized.mp4",
    posterFile: "pf-video-078-demo-squirting.jpg",
    badge: "",
    sourceModelId: "squirting-lora",
    prompt: "she quickly turns around with her back facing the camera and bends forward and places her crotch over the camera and uses her hands to spread her glutes wide, revealing her anus and vulva, innie vagina, her anus is directly above her vulva, her anus is pink, puckered and round, returnthis4nussqu1rt Sticky white cum semen is squirting out of her anus continuously.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-079-nipple-sucking",
    title: "吸乳头",
    videoFile: "pf-video-079-nipple-sucking-asian-resized.mp4",
    posterFile: "pf-video-079-nipple-sucking-asian.jpg",
    badge: "",
    sourceModelId: "nipple-sucking",
    prompt: "A woman is engaging in an intimate act with her own breasts, focusing on the areola and nipple area. She lift her breast with her left hand. She is using her mouth to suck on her nipples. She bites on her nipple and stretches it. Her facial expression is one of pleasure and focus.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-080-ahegao-v2",
    title: "阿黑颜 V2",
    videoFile: "pf-video-080-demo-ahegao-v2-resized.mp4",
    posterFile: "pf-video-080-demo-ahegao-v2.jpg",
    badge: "",
    sourceModelId: "ahegao-v2",
    prompt: "She makes the ahegao face. She sticks her tongue out and crosses her eyes. The camera moving closer and focusing here her face, she is pulling out her tongue to the max and cum is dripping off her tongue and her eye are rolling up and her hands are doing double peace gestures",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-081-tits-sandwich",
    title: "乳房三明治",
    videoFile: "pf-video-081-tits-sandwich-resized.mp4",
    posterFile: "pf-video-081-tits-sandwich.jpg",
    badge: "",
    sourceModelId: "tits-sandwich",
    prompt: "Two beautiful women titfuck a man's big giant penis. They bounce their breasts up and down the mans large penis while holding them with their hands. Their breasts are bouncing. They make eye contact with the viewer. The two women are kissing and licking each others tongues, they are passionately kissing and their mouths are open. Their bodies are intertwined in a writhing mass. Saliva and spit dripping from their mouths. Peak jiggle moments, realistic skin deformation. The breasts are extremely soft and bouncy. He thrusts his penis in and out of their breasts. His penis thrusting is fast and hard. He is pounding their breasts with his penis with speed. Their large boobs bouncing. His rhythmic deep thrusts cause their full breasts to jiggle and sway moving with his hip thrusts. The motion are in sync. Their faces a portrait of sublime ecstasy as they reach the peak of their orgasm. Enhanced jiggle physics. Enhanced bouncing physics. Extreme jiggling. Bouncing breasts. Fast movements. They move quickly. Still shot",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-082-grab-boobs",
    title: "抓胸",
    videoFile: "pf-video-082-demo-grab-boobs-video-resized.mp4",
    posterFile: "pf-video-082-demo-grab-boobs-video.jpg",
    badge: "",
    sourceModelId: "grab-boobs-video",
    prompt: "instantly blackout and cut to the next scene. the same girl, hand grabs and sqeezes both of her naked breasts, as he fondles her breasts, her breasts bounces move, Her eyes are closes. She has a moaning. Pleasured expression on her face.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-083-boob-expansion",
    title: "丰胸",
    videoFile: "pf-video-083-demo-boob-expansion-asian-resized.mp4",
    posterFile: "pf-video-083-demo-boob-expansion-asian.jpg",
    badge: "",
    sourceModelId: "expand-boobs",
    prompt: "her breasts grow",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-084-slap",
    title: "掌掴",
    videoFile: "pf-video-084-demo-slap-asian-resized.mp4",
    posterFile: "pf-video-084-demo-slap-asian.jpg",
    badge: "",
    sourceModelId: "slap-spit",
    prompt: "SmoothMixRealism. A male hand reaches over from off-screen and slaps her face. she is slapped in the face",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-085-french-kiss",
    title: "法式接吻",
    videoFile: "pf-video-085-demo-french-kiss-resized.mp4",
    posterFile: "pf-video-085-demo-french-kiss.jpg",
    badge: "",
    sourceModelId: "french-kiss",
    prompt: "(AT 0-1s) the woman leans towards another woman and begins french kissing her. (AT 2-4s) the woman continues to french kiss the woman.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-086-jump-in-bed",
    title: "跳上床",
    videoFile: "pf-video-086-demo-jump-in-bed-asian-resized.mp4",
    posterFile: "pf-video-086-demo-jump-in-bed-asian.jpg",
    badge: "",
    sourceModelId: "jump-in-bed",
    prompt: "Scene starts with a woman posing. The scene change to a bedroom indoors with her standing naked in the doorway. A low-angle POV shot recorded from a bed, looking up at her nude standing in a doorway. She smiles and enthusiastically leaps forward towards the camera with her arms raised. The video features a fast forward motion that ends with her landing directly on top of the lens, resulting in an extreme close-up view of her vagina as she straddles the camera.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-087-walk-back-sexy",
    title: "性感走路",
    videoFile: "pf-video-087-demo-walk-back-sexy-resized.mp4",
    posterFile: "pf-video-087-demo-walk-back-sexy.jpg",
    badge: "",
    sourceModelId: "walk-back-sexy",
    prompt: "a girl is doing the turning pose, she is turning a half circle and then walks away, she smiles and walks flirty.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-088-splash",
    title: "水花飞溅",
    videoFile: "pf-video-088-demo-splash-resized.mp4",
    posterFile: "pf-video-088-demo-splash.jpg",
    badge: "",
    sourceModelId: "splash",
    prompt: "then a sudden big water splash from top makes her wet",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-089-remote-vib",
    title: "遥控振动器",
    videoFile: "pf-video-089-demo-remote-vib-asian-resized.mp4",
    posterFile: "pf-video-089-demo-remote-vib-asian.jpg",
    badge: "",
    sourceModelId: "remote-vibrators",
    prompt: "Male pov, A woman is standing, a man is holding a remote controller and pushes the button as the woman reacts to the sudden pleasure. The woman gasps and collapses on the floor, her body shakes violently. A blinking blue light is visible under her panties. The people standing next to her stare at her with their mouths agape.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-090-car-love",
    title: "车内做爱",
    videoFile: "pf-video-090-demo-car-love-resized.mp4",
    posterFile: "pf-video-090-demo-car-love.jpg",
    badge: "",
    sourceModelId: "car-love",
    prompt: "A woman posing in a photo. Then hardcut to a new scene: The same girl is now naked. side view. she has the cars GEAR shifter inserted into her pussy, she bounces up and down on the shifter the cars vibrations giving her an orgasm.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-091-spanking",
    title: "打屁股",
    videoFile: "pf-video-091-demo-spanking-asian-resized.mp4",
    posterFile: "pf-video-091-demo-spanking-asian.jpg",
    badge: "",
    sourceModelId: "spanking",
    prompt: "The video starts with the second woman posing. Then the scene cut to a side view scene with two women in a living room, focusing on the second woman's ass. In the middle of the room is a red sofa. The first woman is a mother, angry wearing an apron. She is sitting on the sofa. The second woman is now wearing only cute panties, lying face down on the first woman's thighs. Her butts are red. Then with her left hand the first woman slaps the second woman's butt.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-092-handjob-v3",
    title: "手活 V3",
    videoFile: "pf-video-092-demo-handjob-v3-asian-resized.mp4",
    posterFile: "pf-video-092-demo-handjob-v3-asian.jpg",
    badge: "",
    sourceModelId: "handjob-v3",
    prompt: "Scene start with a woman posing, she is the main focus of scenes. The scene cut to her and a man in a bathroom with gray tiled walls, a shower pours water on him. But now she is completely naked and standing next to him, her breasts are exposed with erect nipples, her body smeared with white soap, her vagina exposed. She is looking at his penis, she is holding his hard  penis. He is completely naked and standing, his body smeared with white soap, his penis is hard. He has his hands behind his back, looking at his penis. She holds his hard penis with a closed fist, moving her hand up and down rapidly, stroking his hard penis.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-093-handjob-v2",
    title: "手活 V2",
    videoFile: "pf-video-093-demo-handjob-v2-asian-resized.mp4",
    posterFile: "pf-video-093-demo-handjob-v2-asian.jpg",
    badge: "",
    sourceModelId: "handjob-v2",
    prompt: "Scene start with a woman. Then the scene cut to a living room with black walls, and a white sofa with her and a man. She is now on the left, sitting on the sofa holding the man's hard penis with her closed fist, her breasts and nipples exposed. The man is naked, lying on the sofa on his back with his head resting in her lap, he hold her breast and is licking her nipple with his tongue. While holding the man's hard penis with her closed fist, she moves her left hand up and down rapidly stroking the hard penis while the man licks her nipple.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-094-reverse-suspended-congress",
    title: "反向悬挂",
    videoFile: "pf-video-094-demo-reverse-suspended-congress-resized.mp4",
    posterFile: "pf-video-094-demo-reverse-suspended-congress.jpg",
    badge: "",
    sourceModelId: "reverse-suspended-congress",
    prompt: "The screen goes dark and then lights up again to show the woman having sex with a man. After the woman took off all her clothes, reverse_cowgirl_lie_front_vagina",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-095-masturbation-v2",
    title: "自慰 V2",
    videoFile: "pf-video-095-demo-masturbation-v2-resized.mp4",
    posterFile: "pf-video-095-demo-masturbation-v2.jpg",
    badge: "",
    sourceModelId: "masturbation-v2",
    prompt: "masturbating using fingers, She inserts two fingers into her pussy. She masturbates by sliding her fingers in and out of her pussy. She is orgasming. She is experiencing an orgasm. She closes her eyes and has a screaming orgasm. Her whole body shakes and spasms as she has a shaking orgasm.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-096-glory-hole",
    title: "荣耀之洞",
    videoFile: "pf-video-096-demo-glory-hole-resized.mp4",
    posterFile: "pf-video-096-demo-glory-hole.jpg",
    badge: "",
    sourceModelId: "gloryhole",
    prompt: "the same woman is seen performing oral sex on an erect fair-skinned penis through a glory hole. Her hands are not - visible",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-097-pov-facesitting",
    title: "POV 坐脸",
    videoFile: "pf-video-097-demo-pov-facesitting-asian-resized.mp4",
    posterFile: "pf-video-097-demo-pov-facesitting-asian.jpg",
    badge: "",
    sourceModelId: "pov-facesitting",
    prompt: "facesitng, the video start with a woman, the screen instantly goes dark and then lights up again to show the same woman sitting on the viewer in the same place, camera angle from below. She is bottom less, her vagina is fully visible, she is above the camera, vagina close-up. Her face is visible.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-098-pull-her",
    title: "把她拉近",
    videoFile: "pf-video-098-demo-pull-her-asian-resized.mp4",
    posterFile: "pf-video-098-demo-pull-her-asian.jpg",
    badge: "",
    sourceModelId: "pull-her-closer",
    prompt: "From a first-person perspective, a hand reaches out and grabs her collar, pulling her closer  to the camera. Rough, violent, assertive.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-099-desk-jerkoff",
    title: "桌下打手枪",
    videoFile: "pf-video-099-demo-desk-jerkoff-asian-resized.mp4",
    posterFile: "pf-video-099-demo-desk-jerkoff-asian.jpg",
    badge: "",
    sourceModelId: "desk-jerk-off",
    prompt: "A woman posing, she is the main focus of scenes. The scene cut to from below view inside a closed room with white walls. Now she is under a black table, the black table has a small hole with tape around it. On top of frame is a hard penis through the small hole in the black table. With her left hand she holds the hard penis with a closed fist, looking at the camera with a smile. She moves her hand up and down repeatedly, stroking the hard penis, then the hard penis starts dripping white viscous semen onto her cleavage, she opens her mouth in surprise.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-100-paid-escort",
    title: "付费陪侍 V1",
    videoFile: "pf-video-100-demo-paid-escort-asian-resized.mp4",
    posterFile: "pf-video-100-demo-paid-escort-asian.jpg",
    badge: "",
    sourceModelId: "paid-escort",
    prompt: "The scene begins with woman, she is the main focus of all scenes. A hand appears and gives her a $100 bill and she takes the money with her hand. She looks so happy and holding the cash. The scene lasts for 2 seconds. The scene cuts to the same woman in the same place, removing her shirt, leaving her lace lingerie exposed with the cleavage. Immediately cut to a new scene where the exact same person is now completely naked and lying on their back, and she moves her head forward slightly. The scene is a top-down view showing the same woman completely nude, with their legs in an open position, with her vagina visible. At the bottom of the frame a man can be partially seen, as the man takes his penis with his hand and inserts his penis into the woman's vagina, pushing his body towards her. He then moves back and forward, as he pushes his penis into the woman's vagina repeatedly. She has the $100 bills over her body. The angle is from the point of view of the man at the bottom of the frame.",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-101-push-her-down",
    title: "把她推倒",
    videoFile: "pf-video-101-demo-push-her-down-asian-resized.mp4",
    posterFile: "pf-video-101-demo-push-her-down-asian.jpg",
    badge: "",
    sourceModelId: "push-her-down",
    prompt: "From a first-person perspective, hands reaches out to pull her down and grab her breasts",
    referenceVideoDurationSeconds: 5
  },
  {
    id: "pf-video-102-dub",
    title: "ALPHA配音视频",
    videoFile: "pf-video-102-demo-dub-video-asian-resized.mp4",
    posterFile: "pf-video-102-demo-dub-video-asian.jpg",
    badge: "",
    sourceModelId: "prompt-to-audio",
    prompt: "Add realistic ambient sound effects matching the video scene",
    referenceVideoDurationSeconds: 5
  }
];

const PLAYFLUX_IMAGE_TEMPLATE_DATA = [
  {
    id: "pf-image-clothes-remover-v3",
    sourceModelId: "clothes-remover-v3",
    title: "Clothes Remover V3",
    badge: "",
    file: "clothes-remover-v3.jpg",
    prompt: "Completely remove the subjects clothes. She is now standing completely naked, her big breasts and vagina with pubic hair fully exposed. She has a small belly-button piercing. Maintain identical subject placement, camera angle, framing, and perspective. The rest of the image remains the same, only completely remove her clothes to expose her naked body.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-ai-boobs-enlarger-v3",
    sourceModelId: "ai-boobs-enlarger-v3",
    title: "Boobs Enlarger V3",
    badge: "",
    file: "ai-boobs-enlarger-v3.jpg",
    prompt: "make the same girl has large breasts, gigantic saggy breasts",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-faceswap",
    sourceModelId: "faceswap",
    title: "Faceswap",
    badge: "",
    file: "faceswap.webp",
    prompt: "perfect quality",
    sourceRequired: true,
    sourceCount: 2,
    tags: []
  },
  {
    id: "pf-image-omni-nsfw-image-v2",
    sourceModelId: "omni-nsfw-image-v2",
    title: "Omni NSFW Image V2",
    badge: "NEW",
    file: "omni-nsfw-image-v2.jpeg",
    prompt: "A close-up photograph of a woman performing fellatio on a man. 20 years old girl ponytail with extra long fringes that frames her face. she wears gothic corsete and black gothic dress. edgy style, She has a nose ring, and is looking up with her mouth open, tongue extended to lick the man's erect penis. She has light makeup with dark eyeliner. The man's penis is prominently in the foreground, with visible veins and a pinkish glans. The background includes a gray fabric couch and a white pillow. The lighting is warm and even, highlighting the woman's facial features and the man's genitalia. The woman's skin is light, and the man's skin is slightly tanned with a visible patch of dark pubic hair. The focus is sharp, capturing the intimate act in detail.",
    sourceRequired: false,
    sourceCount: 0,
    tags: [
      "Text2Img"
    ]
  },
  {
    id: "pf-image-change-clothes-image",
    sourceModelId: "change-clothes-image",
    title: "Change Clothes Image",
    badge: "NEW",
    file: "change-clothes-image.jpg",
    prompt: "put the clothes on the left onto the person on the right",
    sourceRequired: true,
    sourceCount: 2,
    tags: [
      "2 Images"
    ]
  },
  {
    id: "pf-image-naked-pussy",
    sourceModelId: "naked-pussy",
    title: "Naked Pussy",
    badge: "",
    file: "naked-pussy.jpg",
    prompt: "She is not wearing any clothes, the girl is clean shaved you can see the NO public hair of the girl clearly, the girl's vagina can be seen cleanly, the girl is looking at the viewer suggestively. the girls body gesture remain unchanged.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-dirty-peek",
    sourceModelId: "dirty-peek",
    title: "Dirty Peek",
    badge: "",
    file: "dirty-peek.webp",
    prompt: "Peek the girl from below showing naked pussy",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-gloryhole-image",
    sourceModelId: "gloryhole-image",
    title: "Gloryhole Image",
    badge: "",
    file: "gloryhole-image.jpg",
    prompt: "the same woman is seen performing oral sex on an erect fair-skinned penis through a glory hole. Her hands are not visible",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-blowjob-image",
    sourceModelId: "pov-blowjob-image",
    title: "Pov Blowjob Image",
    badge: "",
    file: "pov-blowjob-image.jpg",
    prompt: "a woman performing oral sex on a mans penis, viewed from the top.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-handjob-image",
    sourceModelId: "pov-handjob-image",
    title: "Pov Handjob Image",
    badge: "",
    file: "pov-handjob-image.jpg",
    prompt: "Change the image to a real photo of a real woman. She is slightly surprised and looking down giving a handjob to a man's penis. The penis is ejaculating.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cum-on-face",
    sourceModelId: "cum-on-face",
    title: "Cum On Face",
    badge: "",
    file: "cum-on-face.jpeg",
    prompt: "a woman receiving a cumshot on her face. The image captures the moment of penis ejaculation, with stream of semen being ejected out of the penis, splattering across her forehead and cheek. The woman eyes are open, and her mouth is slightly open as she receives the semen.The woman eyes are partially closed, and she has a slight smile. The lighting is natural, highlighting her facial features and the texture of the semen.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-covered-in-cum",
    sourceModelId: "covered-in-cum",
    title: "Covered In Cum",
    badge: "",
    file: "covered-in-cum.jpeg",
    prompt: "cover her face with huge load amount of thick cum, cum everywhere, cum in mouth",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bdsm-image",
    sourceModelId: "bdsm-image",
    title: "Bdsm Image",
    badge: "",
    file: "bdsm-image.jpg",
    prompt: "the woman is bound by ropes around her breasts",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-blowjob-image",
    sourceModelId: "blowjob-image",
    title: "Blowjob Image",
    badge: "",
    file: "blowjob-image.jpg",
    prompt: "A close-up photograph of the same woman performing oral sex on a man. The woman, with long brown hair and fair skin, is kneeling with her head tilted back. She has full lips and is sucking on the man's erect penis. The man's hand is resting on her head. His penis is circumcised and his testicles are visible. Same background. The scene is intimate and explicit. ",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-blowbang-image",
    sourceModelId: "blowbang-image",
    title: "Blowbang Image",
    badge: "",
    file: "blowbang-image.jpeg",
    prompt: "This is a high-resolution photograph taken from a top-down angle, capturing the same woman, kneeling on a tiled floor. She is surrounded by several nude men, all holding their erect penises. The woman's mouth is open, and she appears to be performing oral sex on one of the men. Same background ",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-missionary-v3-image",
    sourceModelId: "pov-missionary-v3-image",
    title: "Pov Missionary V3 Image",
    badge: "NEW",
    file: "pov-missionary-v3-image.jpeg",
    prompt: "missionary, vaginal sex, vaginal penetration, pov, girl in the image is lying on her back, spreading her legs. a man is penetrating her pussy. she has vaginal sex with the man in missionary position. she is looking at the camera. the man is out of frame.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-clothes-remover-new",
    sourceModelId: "clothes-remover-new",
    title: "Clothes Remover V2",
    badge: "",
    file: "clothes-remover-new.webp",
    prompt: "Completely remove the subjects clothes. She is now standing completely naked, her big breasts and vagina with pubic hair fully exposed. She has a small belly-button piercing. Maintain identical subject placement, camera angle, framing, and perspective. The rest of the image remains the same, only completely remove her clothes to expose her naked body.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-faceswap-classic",
    sourceModelId: "faceswap-classic",
    title: "Faceswap Classic",
    badge: "",
    file: "faceswap-classic.jpeg",
    prompt: "Head swap from Image 1 to Image 2, keep all facial details and hair from Image 1, blend naturally with Image 2's body.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-omni-nsfw-image",
    sourceModelId: "omni-nsfw-image",
    title: "Omni NSFW Image",
    badge: "",
    file: "omni-nsfw-image.jpeg",
    prompt: "A gorgeous, attractive Japanese sexy woman in her twenties with large breasts. She has plump, glossy lips and enormous eyes. Her face is small in proportion to her body, creating a balanced eight-head-tall figure. No extra legs, no three legs. Front shot, low-angle, from below, middium shot. By three fingers of her right hand, she opens her pink labia majora, glistening obscenely. She is opening her legs to show the inside of her very wet pussy, clearly.",
    sourceRequired: false,
    sourceCount: 0,
    tags: [
      "Text2Img"
    ]
  },
  {
    id: "pf-image-futanari-image",
    sourceModelId: "futanari-image",
    title: "Futanari Image",
    badge: "",
    file: "futanari-image.jpg",
    prompt: "Photorealistic image of a Futanari girl. The same girl has a huge penis hanging between her legs. Ultra-realistic skin texture, 8K photorealism. Selfie in the mirror. She is looking at her phone. In the bathroom, in front of the mirror, shower in the back, neck choker. She has perfect fingers, no extra fingers, 4 fingers on the hand keeping the phone, no extra hands, only 2 hands. Full body.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cowgirl-image",
    sourceModelId: "cowgirl-image",
    title: "Cowgirl Image",
    badge: "",
    file: "cowgirl-image.jpg",
    prompt: "a woman sitting on a man",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-ruined-face-image",
    sourceModelId: "ruined-face-image",
    title: "Ruined Face Image",
    badge: "",
    file: "ruined-face-image.jpg",
    prompt: "saliva smeared face, spit, spit in face, excessive spit, messy face, ruined makeup, excessive saliva, snot, drooling saliva",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-flat-chest",
    sourceModelId: "flat-chest",
    title: "Flat Chest",
    badge: "",
    file: "flat-chest.jpg",
    prompt: "same girl with flat chest, flat breasts, nipples, nude",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-muscle-man-image",
    sourceModelId: "muscle-man-image",
    title: "Muscle Man Image",
    badge: "NEW",
    file: "muscle-man-image.jpeg",
    prompt: "Make me a buff man",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-ahegao-image",
    sourceModelId: "ahegao-image",
    title: "Ahegao Image",
    badge: "",
    file: "ahegao-image.jpg",
    prompt: "She makes the ahegao face by sticking out her tongue and crossing her eyes.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-wet-clothes",
    sourceModelId: "wet-clothes",
    title: "Wet Clothes",
    badge: "",
    file: "wet-clothes.jpg",
    prompt: "Her clothes are wet and clingy.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-colorize-anime",
    sourceModelId: "colorize-anime",
    title: "Colorize Anime",
    badge: "NEW",
    file: "colorize-anime.jpg",
    prompt: "mangaColorKlein.",
    sourceRequired: true,
    sourceCount: 1,
    tags: [
      "Manga"
    ]
  },
  {
    id: "pf-image-uncensor-manga-v1",
    sourceModelId: "uncensor-manga-v1",
    title: "Uncensor Manga V1",
    badge: "NEW",
    file: "uncensor-manga-v1.webp",
    prompt: "uncensorMangaKlein.",
    sourceRequired: true,
    sourceCount: 1,
    tags: [
      "Manga"
    ]
  },
  {
    id: "pf-image-hold-her",
    sourceModelId: "hold-her",
    title: "Hold Her",
    badge: "NEW",
    file: "hold-her.jpg",
    prompt: "Full nelson position, the woman is lying on top of a naked man, he hooks his arms under the woman's knees, brings his hands together behind the woman's neck, penetrating the woman's anus with his erect penis. Her legs are held up, she is gripping her buttocks with both hands, looking at the camera.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-happy-nude",
    sourceModelId: "happy-nude",
    title: "Happy Nude",
    badge: "NEW",
    file: "happy-nude.jpg",
    prompt: "flashing their bare breasts, expose nude breasts of women, topless women, nude breasts exposed, realistic natural breasts and detailed areolas, nsfw, photorealistic, insanely detailed 32k digital photo, hands pulling up tshirts to expose breasts, excited expression",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-peace-and-nude",
    sourceModelId: "peace-and-nude",
    title: "Peace And Nude",
    badge: "NEW",
    file: "peace-and-nude.jpg",
    prompt: "photographed from a frontal perspective, looks at the camera with a happy smile, appearing cheerful. She lies on her back with her legs spread wide, thighs extended to the sides, calves protruding beyond the frame, revealing her buttocks and anus. She raises her both her hands to the camera in a peace sign. She is completely naked, her large breasts naturally parted to the sides, firm and elastic, with detailed and clear areolas and nipples",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-tentacles-image",
    sourceModelId: "tentacles-image",
    title: "Tentacles Image",
    badge: "NEW",
    file: "tentacles-image.jpg",
    prompt: "In this vivid, high-contrast scene, tentacles writhe and coil around a woman's helpless form, pinning her arms and legs tightly. Their slimy, pulsating tendrils encircle her slender frame, constricting slightly as they slide over her skin. One thick tendril worms its way into her gaping mouth, pushing past her lips and forcing her jaw open wider. The tentacle's bulbous tip probes the back of her throat, stretching her open even further as it slithers deeper inside, disappearing completely as it slides down her neck. Her eyes widen in panic and excitement as she struggles futilely against her bonds, body quivering with equal parts fear and intense arousal.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-grab-boobs",
    sourceModelId: "grab-boobs",
    title: "Grab Boobs",
    badge: "NEW",
    file: "grab-boobs.jpg",
    prompt: "The perspective is from man's POV, looking down at her chest as the hands if man is breast_grabbing her. Her expression shows discomfort and arousal, indicated by a blush on her cheeks and sweat on her skin.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bush-image",
    sourceModelId: "bush-image",
    title: "Bush Image",
    badge: "",
    file: "bush-image.jpeg",
    prompt: "the girl is keep the same pose, naked, with clean cut bush only in the pussy area",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-masturbate-image",
    sourceModelId: "masturbate-image",
    title: "Masturbate Image",
    badge: "",
    file: "masturbate-image.jpg",
    prompt: "the exact same woman is masturbating, fully nude, she is inserting a vibrator into her vagina, detailed realistic vulva and labia majora/minora, legs spread wide, visible vagina, wetness shine, natural orgasm face, high resolution, insanely detailed 32k photo",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-middle-finger-image",
    sourceModelId: "middle-finger-image",
    title: "Middle Finger Image",
    badge: "",
    file: "middle-finger-image.jpg",
    prompt: "She give the viewer the middle finger",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-used-her-image",
    sourceModelId: "used-her-image",
    title: "Used Her Image",
    badge: "",
    file: "used-her-image.jpg",
    prompt: "A selfie photo of the exact same woman, laying on the bed, dim lighting, top angle, upper body shot. She is nude and face and body covered in cum, Her face is covered with cum. Cum is dripping from her chin. A whole used condom is placed on top of her body, with the top, the crinkled body, and the cum-filled tip visible.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-x-ray-image",
    sourceModelId: "x-ray-image",
    title: "X Ray Image",
    badge: "",
    file: "x-ray-image.jpg",
    prompt: "Change the image to a real photo of a real woman, subtly moaning, while having sex with a man. A cross-section on her lower abdomen shows the man's penis deep inside her shaved vagina.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-holding-deepthroat-image",
    sourceModelId: "pov-holding-deepthroat-image",
    title: "Pov Holding Deepthroat Image",
    badge: "",
    file: "pov-holding-deepthroat-image.jpeg",
    prompt: "POV deepthroat blowjob scene.  In a point-of-view shot, the exact same woman from image 1 looks up while performing a deephroat blowjob on a man, taking his erect penis into her mouth as the man's hairy legs and lower stomach frame the foreground. He pushes her head down with one hand.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-anal-image",
    sourceModelId: "pov-anal-image",
    title: "Pov Anal Image",
    badge: "",
    file: "pov-anal-image.jpeg",
    prompt: "the same woman having anal sex",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-she-is-obedient-image",
    sourceModelId: "she-is-obedient-image",
    title: "She Is Obedient Image",
    badge: "",
    file: "she-is-obedient-image.jpg",
    prompt: "A close up photo of the exact same woman from high angle. She is kneeling on a carpeted floor, both hands resting on the thigh, with furnitures visible in the background. A manly hand comes in from the POV and holding her cheek, his thumb in her mouth. Clothes is lying on the floor messily.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-milky-condom-image",
    sourceModelId: "milky-condom-image",
    title: "Milky Condom Image",
    badge: "",
    file: "milky-condom-image.jpg",
    prompt: "An amateur selfie shot of the exact same woman with confident smile. She is wearing a black bikini that reveals her medium-sized breasts. Small silver hoop earrings are visible, holding a cum-filled used condom in each of her hands. She has a youthful appearance, cheerful and playful. The overall scene is casual and lively.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cucked-image",
    sourceModelId: "cucked-image",
    title: "Cucked V1 Image",
    badge: "",
    file: "cucked-image.jpg",
    prompt: "the exact same woman's lips while she gives a blowjob. her lips are stretched wide and the penis is deep in her mouth, with large testicles hanging down. the penis is large and dark skinned. low light background, a cucked and shocked Japanese husband is visible through partially open doorway in background, high contrast between illuminated bodies and deep shadow around scene.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cucked-v2-image",
    sourceModelId: "cucked-v2-image",
    title: "Cucked V2 Image",
    badge: "",
    file: "cucked-v2-image.jpeg",
    prompt: "A snapchat selfie photo of the exact same woman from image 1 with her back to the camera, wearing only a lacy thong while sitting on a bathroom counter and being embraced from behind by a dark-skinned person whose hand is on her butt; the caption reads, 'ur girl loves me 😂 😂'. A bunch of cum-filled used condoms hanging around the underwear. Her head is looking away a little bit so that viewer can see part of her face.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cucked-v3-image",
    sourceModelId: "cucked-v3-image",
    title: "Cucked V3 Image",
    badge: "",
    file: "cucked-v3-image.jpeg",
    prompt: "On the left of the photo in the foreground is a Japanese man sitting on a couch, out of focus.  The Japanese man is watching people have sex in front of him.  In the background, in focus, is a blindfolded Japanese woman who is the same woman from image 1, squatting on a man's erect penis, having sex with him in the reverse cowgirl position.  The woman's shirt is pulled up, exposing her breasts, and her skirt is pulled up, exposing the man's penis in her vagina.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cucked-v4-image",
    sourceModelId: "cucked-v4-image",
    title: "Cucked V4 Image",
    badge: "",
    file: "cucked-v4-image.jpeg",
    prompt: "A low-angle POV of a naked asian man sitting on a couch looking downwards revealing the exact same asian woman from image 1. she is naked, no clothes. she sits in front of the man on the man's lab, revealing her small naked ass, lookin over her shoulder with an slight smile and mouth open. her face is covered with cum. the man's erect penis is between her buttlocks inside her vagina.  the man grabs her petite small ass. in the background lies another naked asian man, cum on his penis and belly, totaly exhaustet. Cozy hotel room.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-ruined-face-v2-image",
    sourceModelId: "ruined-face-v2-image",
    title: "Ruined Face V2 Image",
    badge: "",
    file: "ruined-face-v2-image.jpeg",
    prompt: "Exact same girl from image 1. An amateur photo taken from above. The lighting is harsh, from a single focal point of the camera flash. It shows the exact same woman from image 1 with lying on her stomach on bed. The woman is kneeling, while she gazes upward. A man is gripping the woman's hair, roughly holding it. ru1ned, she has runny makeup. sl0ppy, girl has a totally ruined face smeared and covered with saliva. the girl has cum in mouth and is cum and saliva drooling. long cum strings and saliva strings, with spit bubbles,",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-plug-in-her-hole-image",
    sourceModelId: "plug-in-her-hole-image",
    title: "Plug In Her Hole Image",
    badge: "",
    file: "plug-in-her-hole-image.jpeg",
    prompt: "Photograph of a nude girl exact same as image 1, positioned on all fours on the bed with her legs spread apart, looking at the camera over her shoulder. The top of the object from image 2 (a bottle of bear) is inserted into her anus, with its bottom end out. The angle is from the back. Background features panoramic view of a night city.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pregnant-sex-image",
    sourceModelId: "pregnant-sex-image",
    title: "Pregnant Sex Image",
    badge: "",
    file: "pregnant-sex-image.jpeg",
    prompt: "the exact same nude woman from image 1, nude pregnant woman in her third trimester, sits on a beige couch and holds her belly with one hand while performing a blowjob on a standing nude man, grasping his erect penis and taking it into her mouth against a background of a teal wall and green plant.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-sexting-v1-image",
    sourceModelId: "sexting-v1-image",
    title: "Sexting V1 Image",
    badge: "",
    file: "sexting-v1-image.jpeg",
    prompt: "the exact same woman from image 1, nude, on her knees with her hands behind her head on a football field, she has large amounts of semen on her face and breasts, she very upset and shocked, the photo is a top down pov shot from in front of her, on the ground around her is torn clothing, her pom poms are behind her, skin detail, tanlines - The entire image is set inside a iphone screen with a text message above the picture that says  \"Fucked Cheerleading BITCH\"",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-washroom-sex-image",
    sourceModelId: "washroom-sex-image",
    title: "Washroom Sex Image",
    badge: "",
    file: "washroom-sex-image.jpeg",
    prompt: "In this photo, the exact same woman from image 1 is captured from behind as she bends forward over a bathroom sink, her white  tank top pulled up to reveal a beige lace bra and her bare back. She's bottomless and her lower back is splattered with cum.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-eat-ass-image",
    sourceModelId: "eat-ass-image",
    title: "Eat Ass Image",
    badge: "",
    file: "eat-ass-image.jpeg",
    prompt: "A close-up photo shows the exact same woman from image 1 leaning forward to press her lips against another woman's anus as she performs anilingus from behind in a bedroom with purple curtains.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-sofa-sex-v1-image",
    sourceModelId: "sofa-sex-v1-image",
    title: "Sofa Sex V1 Image",
    badge: "",
    file: "sofa-sex-v1-image.jpeg",
    prompt: "The exact same asian woman from image 1 being naked on her arm lies on her side on a grey couch with her eyes closed and mouth open in pleasure as she touches her own breast, while a naked asian man with curly brown hair and extensive tattoos on his arm and leg lies directly behind her, nuzzling her neck and touching her butt and other breast as the couple engages in sex in the spooning position within a living room setting featuring bookshelves in the background.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-sofa-sex-v2-image",
    sourceModelId: "sofa-sex-v2-image",
    title: "Sofa Sex V2 Image",
    badge: "",
    file: "sofa-sex-v2-image.jpeg",
    prompt: "A naked asian woman exact same woman from image 1 wearing white knee-high socks straddles a naked asian man sitting on the edge of a black velvet sofa, facing away from him to engage in sex in the reverse cowgirl position while he grips her waist and she arches her back with her head tilted and mouth open in pleasure.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-lesbian-kiss-image",
    sourceModelId: "lesbian-kiss-image",
    title: "Lesbian Kiss Image",
    badge: "NEW",
    file: "lesbian-kiss-image.jpg",
    prompt: "the exact same woman from image 1 and image 2 are embracing and kissing passionately while standing in a wet, tiled shower. The exact same woman from image 2 rests her back against the wall, their wet bodies and bare breasts pressed firmly together as they touch each other's crotches under the bright light.",
    sourceRequired: true,
    sourceCount: 2,
    tags: [
      "2 Girls"
    ]
  },
  {
    id: "pf-image-bed-sex-image",
    sourceModelId: "bed-sex-image",
    title: "Bed Sex Image",
    badge: "",
    file: "bed-sex-image.jpg",
    prompt: "a nude Korean man with short brown hair is seen having sex with the exact same woman on a bed covered with a white knit blanket. The couple is engaged in intercourse while the woman lies flat on her stomach in the prone position, with the man positioning himself on top of her back to penetrate her from behind while leaning his face down near her hair. The woman has her head turned to the side with her mouth open in an expression of pleasure as the man holds her upper body during the act.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-hold-his-dick-image",
    sourceModelId: "hold-his-dick-image",
    title: "Hold His Dick Image",
    badge: "",
    file: "hold-his-dick-image.jpg",
    prompt: "View frame: Front view of large collage cafeteria area. with the exact same woman, very pretty seductive face, intense direct eye contact with the boy, naughty teasing smirk, long hair falling naturally, natural makeup, piercing dark eyes. Both are natural and unaware of the camera looking aside. Next to her is her class mate Korean boyfriend. Only the boyfriend has dick out trough the zipper open pants. His pants open with zipper down, focus on the zipper and material physics as the dick gets out  and has a football jacket. His arm is around the girls shoulder. Girl  hand is wrapped around her boyfriends  dick grabbing the penis. Boy is leaning against a wall.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-car-nude-selfie-image",
    sourceModelId: "car-nude-selfie-image",
    title: "Car Nude Selfie Image",
    badge: "",
    file: "car-nude-selfie-image.jpg",
    prompt: "ultra realistic smartphone selfie photo of the exact same woman sitting in the front seat of a modern car, arm extended holding the phone, camera slightly above eye level, natural selfie angle relaxed posture, soft confident smile, looking directly at the camera with natural eye contact soft natural daylight entering through the car windows illuminating the entire scene evenly, realistic reflections on glass and interior surfaces beautiful natural face with minimal everyday makeup, natural eyebrows, subtle mascara, soft natural lips true human skin texture, visible pores, micro skin details, subtle skin imperfections, natural facial asymmetry soft voluminous hair with natural strands and highlights modern car interior with leather seats, window reflections and exterior buildings visible through the windows deep depth of field so the entire image is sharp including the background and car interior details smartphone photography, 26mm lens equivalent, f/8 aperture, ISO 100, global sharpness, natural color grading, HDR photo, ultra detailed, RAW photo quality natural outdoor smartphone photography, realistic daylight exposure, natural skin tones, deep depth of field everything in focus huge natural tits, detailed tits, huge natural ass, detailed pussy, realistic pussy, realistic tits, realistic face with details, realistic nipples",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-doggie-style-image",
    sourceModelId: "doggie-style-image",
    title: "Doggie Style Image",
    badge: "",
    file: "doggie-style-image.jpg",
    prompt: "Eye-level photo taken slightly from the side, the exact same woman is on her knees on a carpeted floor, mouth open wide with shocking expression, eyes rolling up. A Japanese man is kneeling behind her, they are having sex in a doggystyle position, the man's hips is pressing on her buttocks. The man is grabbing and pulling both of her elbows back.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cum-on-breasts-image",
    sourceModelId: "cum-on-breasts-image",
    title: "Cum On Breasts Image",
    badge: "",
    file: "cum-on-breasts-image.jpg",
    prompt: "A close-up photograph shows the same woman's torso and chin. Her large breasts are covered in cum. Cum is everywhere on her breasts. She lays on her back in a bed with red and black satin sheets. She wears black color bra. Her skin has goosebumps and her nipples are erect. She has pink lips and a slight smile. She is taking a selfie. She is smiling, satisfied",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-missionary-v2-image",
    sourceModelId: "pov-missionary-v2-image",
    title: "Pov Missionary V2 Image",
    badge: "",
    file: "pov-missionary-v2-image.jpg",
    prompt: "POV sex with the exact same woman. Her eyebrows are lifted orgasmically showing intense pleasure and connection. She is looking directly into the camera, orgasming, begging for cum. She is mewling in heat. She wants the viewer to impregnate her. She is on her back looking straight on into the camera. Shot: Intimate shot, perspective is above the subject looking down at her as from the perspective of her lover. Her widespread, bent knees are just barely visible at the bottom of the frame in a way that suggests her legs are wrapped around the viewer. ultra detailed",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-missionary-image",
    sourceModelId: "pov-missionary-image",
    title: "Pov Missionary Image",
    badge: "",
    file: "pov-missionary-image.jpg",
    prompt: "the same woman is lying on her back. She is in a missionary position with a man's erect penis penetrating her vagina. Her legs are spread wide, and she appears to be in a state of arousal. The camera angle is from above, capturing the intimate moment in detail. ",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-fisheye-image",
    sourceModelId: "fisheye-image",
    title: "Fisheye Image",
    badge: "",
    file: "fisheye-image.jpg",
    prompt: "A fisheye with round black border candid photo of the exact same woman in a locker room. She's looking to the side. She's bent over pulling down her underwear to expose her nude body",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-jucy-pussy-image",
    sourceModelId: "jucy-pussy-image",
    title: "Jucy Pussy Image",
    badge: "",
    file: "jucy-pussy-image.jpg",
    prompt: "A point-of-view selfie featuring an extreme close-up of a wet vagina while the beautiful woman's out-of-focus face and tattooed arms are visible in the background.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-gamer-girl-image",
    sourceModelId: "gamer-girl-image",
    title: "Gamer Girl Image",
    badge: "",
    file: "gamer-girl-image.jpeg",
    prompt: "Woman posing nude in her gaming chair, showing off her pussy, asshole and feet in her webcam. She is sitting on her knees in a gaming chair, with her ass and pussy facing the camera, with her knees bent showing her feet hanging off the chair. She has a symmetrical, oval face with high cheekbones and a strong jawline with a light skin tone and a slender, athletic build, with a thick ass. She has a gamer girl aesthetic, emo makeup. She is looking back, with an innocent smite. Set in her room, with a wall behind her with some bookshelves and simple e-girl decor. Medium distance shot, taken with a high-resolution webcam, her entire face and body in focus.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cowgirl-v2-image",
    sourceModelId: "cowgirl-v2-image",
    title: "Cowgirl V2 Image",
    badge: "",
    file: "cowgirl-v2-image.jpeg",
    prompt: "the exact same woman rides a man in cowgirl, thighs spread wide, cum dripping from her vagina onto his legs. She leans back, grabbing her breasts, the man's penis still inside her. The side angle captures her powerful scream mid-orgasm.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-nude-class-image",
    sourceModelId: "nude-class-image",
    title: "Nude Class Image",
    badge: "NEW",
    file: "nude-class-image.jpeg",
    prompt: "ultra realistic instagram-style photo of two full naked women sitting side by side at a classroom table, one woman from image 1 and another from image 2, both slightly leaning toward the camera in a relaxed candid pose one woman from image 1 sitting slightly angled toward the table with one hand resting naturally on her leg and her upper body leaning forward slightly, the second woman from image 2 sitting beside her with her torso turned slightly toward the camera and shoulders relaxed both looking toward the camera with natural confident expressions and subtle smiles, realistic facial expressions and natural facial asymmetry realistic classroom environment with tables, chairs, students sitting in the background and a screen visible at the front of the room soft indoor lighting from ceiling panels creating realistic highlights and shadows across the room and faces deep depth of field so the entire scene remains sharp including both people, the table, classroom interior and background students subtle instagram-style film grain, fine analog noise texture similar to smartphone sensor grain, natural social media photography aesthetic smartphone photography look, 26mm lens equivalent, f/8 aperture, ISO 400, global sharpness across the entire image, natural color grading, ultra detailed, RAW photo quality natural skin tones, deep depth of field everything in focus, background focus huge natural tits, detailed tits, huge natural ass, detailed pussy, realistic pussy, realistic tits, realistic face with details, realistic nipples",
    sourceRequired: true,
    sourceCount: 2,
    tags: [
      "2 Girls"
    ]
  },
  {
    id: "pf-image-threesome-image",
    sourceModelId: "threesome-image",
    title: "Threesome Image",
    badge: "NEW",
    file: "threesome-image.jpeg",
    prompt: "On the left side of the photo is a nude woman from image 1. She is sitting in a reverse cowgirl position atop a man, facing the camera with her legs spread wide as his erect black penis penetrates her pink vagina. On the right side of the photo is the exact same woman from image 2. She is kneeling behind the woman from image 1, leaning in to kiss her passionately on the lips while rubbing the woman from image 1's clitoris. Beneath the woman from image 1 is a man lying on his back on a bed with white sheets and a tufted headboard, gripping the woman from image 1's thighs with hands wearing gold rings and a watch as red fabric lies in the foreground.",
    sourceRequired: true,
    sourceCount: 2,
    tags: [
      "2 Girls"
    ]
  },
  {
    id: "pf-image-footjob-image",
    sourceModelId: "footjob-image",
    title: "Footjob Image",
    badge: "",
    file: "footjob-image.jpeg",
    prompt: "View from above of the exact same woman lies flat on a bench in a sunlit gym with her legs elevated. A vertical streak of translucent white liquid are visible from her stomach to her lower body. Additional translucent cum spots are are visible dripping from the penis onto the woman's socks, creating wet spots on her socks. On the bottom of the frame, a man's body is visible with an erect penis. The viewer is reaching out from the camera with their hands visible and holding the woman's feet with his hands, gripping them tightly. The woman is giving a footjob, moving her legs up and down slowly, stroking the penis. She's wearing a dark sporty crop-top and oversized sweatpants. She also wears low-cut white ankle socks. The gym lighting is natural with the sunlight illuminating the scene unevenly.  Candid photo, natural colors, soft indoor lighting. Visible skin texture with slight imperfections, subtle pores.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-sucking-nipples-image",
    sourceModelId: "sucking-nipples-image",
    title: "Sucking Nipples Image",
    badge: "",
    file: "sucking-nipples-image.jpeg",
    prompt: "A low resolution cinematic film screencap side view of a man (on the right, crouched back) is sitting on a kitchen chair hugging a topless woman (on the left, large breasts) who is straddling his lap. The woman is the exact same woman from the original image. She is leaning back her ellbows resting on the kitchen counter as her head is tilted up wearing an ecstatic moaning expression. the man is sucking the woman's breast nipple with puckered lips.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-doggy-style-image",
    sourceModelId: "pov-doggy-style-image",
    title: "Pov Doggy Style Image",
    badge: "",
    file: "pov-doggy-style-image.jpeg",
    prompt: "pov vaginal doggystyle, a man inserts his penis into the a woman's vagina, she is looking at the veiwer over her shoulder eyes fixated on viewer, the mans thighs are barely visible at the bottom edge of the frame",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-on-the-sofa-image",
    sourceModelId: "on-the-sofa-image",
    title: "On The Sofa Image",
    badge: "",
    file: "on-the-sofa-image.jpeg",
    prompt: "The photograph features the exact same woman women positioned on a white couch in a modern, brightly lit living room with large windows in the background. She kneeling on the couch with their ass prominently displayed towards the camera, facing away. Her ass are large and round, with visible skin texture. The background includes a white wall, a ceiling light, and a colorful abstract painting .",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-squirt-queen-image",
    sourceModelId: "squirt-queen-image",
    title: "Squirt Queen Image",
    badge: "",
    file: "squirt-queen-image.jpeg",
    prompt: "The woman in image 1 is processed into a female ejaculation, Maintain consistency in character, hairstyle, and clothing. Maintain consistency in background. She closed her eyes comfortably and opened her mouth, She is screaming. The camera was shot from a high angle looking down. The woman in image 1 is processed into(a large amount of clear liquid was squirting from her vagina upwards). Clear, transparent liquid splashed onto the lens. She raised her hands in a peace sign. She is lying and on back, exposing her genitals and she has pubic hair, wide spread legs. She wasn't wearing panties. Her breasts and nipples were exposed. She was wearing her usual black thigh-high stockings. Two hands are holding a DSLR camera and taking a picture of her in the bottom right corner of the photo.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bondage-v1-image",
    sourceModelId: "bondage-v1-image",
    title: "Bondage V1 Image",
    badge: "",
    file: "bondage-v1-image.jpeg",
    prompt: "The exact same woman is bound in rope — intricate crimson shibari patterns wrapping her torso in diamond harnesses, thin red cords crisscrossing her chest to frame her breasts, arms tied behind her back in a classic box-tie, thighs cinched together with decorative knots, ankles crossed and secured. She kneels gracefully on a black silk sheet in a dimly lit traditional Japanese-style room with tatami mats and paper lanterns. Soft warm lantern light from low angles casting golden rim glow along the red ropes and skin, deep velvet shadows accentuating every knot and curve, subtle specular highlights on the glossy rope texture. Cinematic intimate erotic photography style, low-angle medium shot emphasizing vulnerability and artistry of the ties, razor-sharp focus on her serene expression, red rope patterns against pale skin, intricate knot details, and gentle rope tension, rich crimson reds contrasted by deep blacks and warm amber light, ultra-detailed rope fibers, skin texture, and atmospheric depth.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bondage-v2-image",
    sourceModelId: "bondage-v2-image",
    title: "Bondage V2 Image",
    badge: "",
    file: "bondage-v2-image.jpeg",
    prompt: "The exact same woman is tied in a spreadeagle pose with her arms over her head, completely naked, wrists and ankles tied with yellow cuffs anchored to bed with red rope, lying on bed with white bedsheets, top down view, high quality face and hair, hdr lighting, no bad anatomy",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bondage-v3-image",
    sourceModelId: "bondage-v3-image",
    title: "Bondage V3 Image",
    badge: "",
    file: "bondage-v3-image.jpeg",
    prompt: "This photograph captures the exact same woman in a bondage scene set indoors. She is bound in a complex rope bondage setup, with red ropes intricately tied around her torso, arms, and legs, using a style known as Shibari. Rope is connecting her torso to her knees. Her legs are crossed at the ankles, with her feet clad in black high-heeled shoes. A red ball gag is inserted in her mouth, held by a black strap, and her arms are restrained behind her back. The setting appears to be a dimly lit room with a stone-tiled floor and a wooden chair partially visible in the background. The lighting is warm, casting a soft glow, enhancing the intimate and sensual atmosphere. The woman's facial expression is a mix of discomfort and defiance, with her lips pursed around the gag and her eyes wide open, looking directly at the camera. The overall scene exudes a provocative, erotic tone, blending elements of BDSM and intimate photography.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bondage-v4-image",
    sourceModelId: "bondage-v4-image",
    title: "Bondage V4 Image",
    badge: "NEW",
    file: "bondage-v4-image.jpeg",
    prompt: "The exact same woman from image 1 is lying on a white bed sheet bound in a hogtied pose, with her arms pulled behind her back and her legs bent upwards. She is bound with brown hemp rope, with the ropes tying her wrists, shoulders, chest, and thighs. She has a white ball gag in mouth fastened with red leather straps, looping over her hair. Her ankles are tied to her bound wrists on her upper back. The background is a simple white wall. The camera angle is a high-angle close-up, looking directly down at her face as she looks up at the lens.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bondage-v5-image",
    sourceModelId: "bondage-v5-image",
    title: "Bondage V5 Image",
    badge: "NEW",
    file: "bondage-v5-image.jpeg",
    prompt: "the exact same woman from image 1 is fully encased in clear tape bondage from neck to ankles, gagged with black latex wrapped around her mouth, lying in bed",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-speculum-image",
    sourceModelId: "speculum-image",
    title: "Speculum Image",
    badge: "",
    file: "speculum-image.jpeg",
    prompt: "The character in image 1 is processed into a transparent plastic speculum was inserted into her vagina and her cervix was visible She lay down and spread her legs, ass visible through thighs, Her anus was visible. no pants and no underwear. She raised her hands to the camera, making a peace sign. Maintain consistency in character, hairstyle, and clothing, and Maintain consistency in her facial expressions.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-excessive-cum-image",
    sourceModelId: "excessive-cum-image",
    title: "Excessive Cum Image",
    badge: "",
    file: "excessive-cum-image.jpeg",
    prompt: "excessive cum on ass, cum on pussy, cum string, cumdrip, cum on clothes, cum on thighs, cum dripped down her vulva in a stringy stream. Maintain consistency in her face, hairstyle, and skin tone, and preserve her original expression and pose. Do not alter the original photograph's tone, brightness, or contrast.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-oral-cum-strings-image",
    sourceModelId: "oral-cum-strings-image",
    title: "Oral Cum Strings Image",
    badge: "",
    file: "oral-cum-strings-image.jpeg",
    prompt: "a penis of a man is next to the woman in the image. her mouth is open and there are multiple long saliva and cum strings going from her mouth to the penis of the man. she has cum in mouth, only the penis, thighs and testicles of the man are visible. add the lower body of a man next to the woman. make it an upper body shot, perfect penis",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cheek-blowjob-image",
    sourceModelId: "cheek-blowjob-image",
    title: "Cheek Blowjob Image",
    badge: "",
    file: "cheek-blowjob-image.jpeg",
    prompt: "bulg3, oral sex, fellatio, make the girl in the image suck the dick of a man. the man penetrates her mouth with his penis from the side, so one of her cheeks is bulging.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-m-shaped-open-legs-image",
    sourceModelId: "m-shaped-open-legs-image",
    title: "M Shaped Open Legs Image",
    badge: "",
    file: "m-shaped-open-legs-image.jpeg",
    prompt: "spr3ad_influ3ncer_p0se, holding legs, spread legs, 1girl, solo, nipples, phone, pussy, anus, cellphone, tattoo, long hair, nude, selfie, holding, uncensored, legs up, holding phone, smartphone, barefoot, soles, feet, lying, on back, large breasts, realistic, black hair, ass, looking at viewer",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-arm-pull-doggy-image",
    sourceModelId: "arm-pull-doggy-image",
    title: "Arm Pull Doggy Image",
    badge: "",
    file: "arm-pull-doggy-image.jpeg",
    prompt: "girl in the image is bent over slightly, with her arms extended behind her, and is being held by a nude man from behind. the man is standing behind her. he is gripping her arm with his hand, pulling it back. she has sex with a man who is grabbing her arms while penetrating ass her from behind. the mans hand hand is visible, gripping the woman's arm. his genitals are not visible due to his positioning. the girl is moaning while she gets fucked from behind.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-arms-up-deepthroat-image",
    sourceModelId: "arms-up-deepthroat-image",
    title: "Arms Up Deepthroat Image",
    badge: "",
    file: "arms-up-deepthroat-image.jpeg",
    prompt: "man holds her arm above her head, he is grabbing both her arms. oral sex, oral penetration, deepthroat, blowjob, her arms are raised and resting against the wall, and she is performing oral sex on the man. she is restrained. the man, whose face is not visible, is standing in front of her and nude to expose his erect penis. his right hand is gripping the back of her head, guiding her movements. she is looking up at the man while performing oral sex. her arms are raised and bound to the brick wall above her head with the man's hands. he is completely naked from the waist down, exposing his large, erect penis which the woman is actively sucking.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-thigh-job-image",
    sourceModelId: "thigh-job-image",
    title: "Thigh Job Image",
    badge: "",
    file: "thigh-job-image.jpeg",
    prompt: "thigh sex, girl is standing and a man behind her. the penis of the man penetrates between her thighs. his penis is visible between the girls thighs. the woman is in the foreground, standing.  the man is standing behind her, partially obscured, he grabs her bare breasts. he is nude and has a visible erect penis. the man's penis is visible, and positioned in front of the woman's pubic area. she is wearing a thong. there is lots of cum on her thighs, from side, there is lots of cum on her thighs, keep her outfit.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-tittyfuck-image",
    sourceModelId: "tittyfuck-image",
    title: "Tittyfuck Image",
    badge: "",
    file: "tittyfuck-image.jpeg",
    prompt: "a nude woman kneels with her hands squeezing her large breasts, she is looking at the viewer, she rests her breasts on a man's crotch, a man's naked lower body is seen near the bottom of the frame, his penis is seen disappearing in her cleavage, his crotch and her breasts are joined. highly detailed, 8k crisp details, sharp focus",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-2-girls-condom-image",
    sourceModelId: "2-girls-condom-image",
    title: "Two Girls Condom Image",
    badge: "NEW",
    file: "2-girls-condom-image.jpeg",
    prompt: "High angle, close up photograph of the woman from image 1 and woman from image 2 next to each other. On the left, woman from image 1 is slightly smilling. On the right is woman from image 2. The woman from image 1 grabs the other woman's jaw with her right hand. A different hand reach in from the POV right side, holding the top of a pink used condom in the hand, holding it at the top of the image, dangling above the woman from image 2 mouth while she is tilting her head back, mouth open with tongue out. Focus on their faces and the cum-filled used condom touching above her tongue. The photograph has a candid, intimate feel, indoor settings, capturing a moment of playful eroticism. Both girls are having light makeup, glossy lipstick, long sparkly nails, pink cheeks",
    sourceRequired: true,
    sourceCount: 2,
    tags: [
      "2 Girls"
    ]
  },
  {
    id: "pf-image-pov-cafeteria-pussy-image",
    sourceModelId: "pov-cafeteria-pussy-image",
    title: "Pov Cafeteria Pussy Image",
    badge: "",
    file: "pov-cafeteria-pussy-image.jpeg",
    prompt: "A medium shot from behind of a barista in a local coffee shop. The exact same woman from image 1 is leaning against the stainless steel counter, operating a large espresso machine. She wears a white t-shirt and a brown canvas apron. Her dark denim jeans and apron are pulled down to her mid-calves, displaying her bare ass and pussy. Steam rises from the coffee machine. The background features wooden shelves filled with coffee beans and a chalkboard menu. Warm, cozy tungsten lighting.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-maid-pussy-image",
    sourceModelId: "pov-maid-pussy-image",
    title: "Pov Maid Pussy Image",
    badge: "",
    file: "pov-maid-pussy-image.jpeg",
    prompt: "A medium shot from behind of the exact same woman from image 1.. She wears a black and white French maid uniform, kneeling on a tiled floor with her back to the camera, looking over her left shoulder. The back of her frilly skirt is lifted and bunched up tightly over her hips, leaving her ass and asshole completely exposed. She holds a feather duster in one hand. She wears white thigh-high stockings with black lace trims. The background features red floral wallpaper, golden wall sconces, and a long carpeted corridor. Warm, dim ambient lighting. Luxurious atmosphere. In the background, there are large glass windows with a view of neighboring white houses with red-tiled roofs, and a cloudy sky with some greenery visible.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-yacht-pussy-image",
    sourceModelId: "pov-yacht-pussy-image",
    title: "Pov Yacht Pussy Image",
    badge: "",
    file: "pov-yacht-pussy-image.jpeg",
    prompt: "A close-up photograph from behind of the exact same woman from image 1. She is kneeling on the teak wooden deck of a luxury yacht. Her skirts are pulled down to her knees, exposing her bare ass, asshole and pussy. The background features the deep blue sea, white guardrails, and a distant coastline. Golden hour sunlight casting long, warm shadows across her skin and the wooden deck.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-office-lady-pussy-image",
    sourceModelId: "pov-office-lady-pussy-image",
    title: "Pov Office Lady Pussy Image",
    badge: "",
    file: "pov-office-lady-pussy-image.jpeg",
    prompt: "A medium shot from behind of a woman with the exact same woman from image 1. She is leaning forward, resting her elbows on a cluttered mahogany office desk. She wears a white button-up blouse. Her black formal trousers and sheer black shorts are pulled down to the backs of her knees, exposing her ass, pussy, and asshole. She wears black high heels. The desk has a computer monitor, scattered documents, and a spilled coffee cup. The background is a corporate office with large glass walls overlooking a gray, overcast city. Cold, bluish fluorescent lighting. Calm and professional mood.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-idol-pussy-image",
    sourceModelId: "pov-idol-pussy-image",
    title: "Pov Idol Pussy Image",
    badge: "",
    file: "pov-idol-pussy-image.jpeg",
    prompt: "A lively, crowd-energized concert photo of the exact same woman from image 1, on stage at a massive open-air music festival under colorful spotlights in Tokyo, Japan. Bending forward at the edge of the platform toward the roaring audience, her back to the camera as she plays her transverse flute with passion, her shimmering sequined mini-dress lifted up to her waist, exposing her bare ass amid the performance frenzy. Paired with thigh-high boots and a microphone stand nearby. The background pulses with thousands of fans.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-gym-pussy-image",
    sourceModelId: "pov-gym-pussy-image",
    title: "Pov Gym Pussy Image",
    badge: "",
    file: "pov-gym-pussy-image.jpeg",
    prompt: "A medium shot from behind of the exact same woman from image 1. She is positioned on all fours on a blue exercise mat. She wears a pink sports bra and black sweatpants. Her sweatpants and thong are pulled down to her knees, completely exposing her ass and pussy. She wears pink running shoes. The background is a spacious, modern gym with kettlebells, a squat rack, and large mirrors reflecting the empty room. Bright, stark overhead LED lighting. Intense mood. Sharp focus.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-train-job-image",
    sourceModelId: "train-job-image",
    title: "Train Job V1 Image",
    badge: "",
    file: "train-job-image.jpg",
    prompt: "View frame: Front view of two bus seats and but interior. A photo that captures the same woman sits on a train seat with her hand on the next person's penis, she sits next to a man. The man hides his face, has normal penis and catches her attention, his dick is attached to the his waist. She leans her entire torso towards the dick and opens her mouth to blow it, amateur quality, low resolution, candid style, l3n0v0. overexposed scene, old phone quality, blurred from camera shake, l3n0v0, PENISLORA",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-train-job-v2-image",
    sourceModelId: "train-job-v2-image",
    title: "Train Job V2 Image",
    badge: "",
    file: "train-job-v2-image.jpg",
    prompt: "The exact same Asian woman. standing man hods a woman while fucking her she has her legs spread and folded. She is facing the camera and has an superior gaze. Man hods her with a strong grip on her legs and presents her to the camera. Man's penis trough the unzipped zipper and open pants. Vaginal sex. The girl is fixing her messy hair with both hands very casually. She has sexy legs with high heels but in foreground. She has wing-tip makeup. Her body is petite hourglass style. Detailed cock inside cute pussy. They are on a busy subway train in Tokyo",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pegging-image",
    sourceModelId: "pegging-image",
    title: "Pegging Image",
    badge: "",
    file: "pegging-image.jpeg",
    prompt: "In a side-view photograph, a nude asian woman exactly the same from image 1 stands wearing a black leather harness and uses a black strap-on dildo to penetrate the anus of an asian man lying on a bed with his legs raised in the air, while she simultaneously holds his erect penis with her other hand during pegging.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-she-is-undressing-image",
    sourceModelId: "she-is-undressing-image",
    title: "She Is Undressing Image",
    badge: "",
    file: "she-is-undressing-image.jpeg",
    prompt: "A photo from behind captures the exact same woman from image 1 cascading down her bare back as she is undressing, using both hands to pull her white thong down over her exposed buttocks and thighs in a bright indoor room.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-creampie-image",
    sourceModelId: "pov-creampie-image",
    title: "Pov Creampie Image",
    badge: "",
    file: "pov-creampie-image.jpeg",
    prompt: "Make an extreme closeup of the woman's open vagina. Cum is dribbling out of her pussy (creampie).A penis is inside her vagina. Low-angle shot, her breasts and face visible. She is having an orgasm.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-she-is-showing-image",
    sourceModelId: "she-is-showing-image",
    title: "She Is Showing Image",
    badge: "",
    file: "she-is-showing-image.jpeg",
    prompt: "Beautiful landscape, golden hour, posing sexy, positive vibes, very intricate, very detailed, sharp, bright, colorful, looks at viewers, on a luxurious white bed with silk sheets in a spacious bedroom with large windows showing a cityscape at sunset. The exact same girl from image 1. Her face is small in proportion to her body, creating a balanced eight-head-tall figure. Additionally, she has very long legs and very long under-the-knee. This woman from image 1 is wearing, a single white lace garter on her right thigh. black intricate detail laced thigh-high tights with avant-garde geometric patterns and many very small traditional floral patterns all over, from the thigh to the toe, with a lace trim at the top, red high-heeled stiletto sandals with metallic accents. Seen from a low-angle perspective, from below looking up, from the floor level, dominant colors: red, black, white, beige. cinematic atmosphere with warm golden tones and soft bokeh highlights, camera angle slightly elevated, medium shot capturing full upper body to mid-thighs, composition centered on the woman with shallow depth of field blurring background elements, Full body portrait of a beautiful, stunning woman from image 1, low-angle from below, wide shot.1girl, solo, no extra person, no bad anatomy, no extra head, no extra legs, no three legs, no one leg. Beautiful landscape, Focus on her pussy, her legs are spread wide open, She is lying on her back, twisting her upper body, and spreading her legs wide open. She has a very wet pussy. Wet pussy. She is opening her legs to show her very wet vagina, clearly, on the verge of tears. Style: revealing her vagina, vulva, labia minora, and Clitoris as well as nipples, areola, and pubic hair. pink-white vagina like delicate flower petal, rosy vulva lips, soft blushing folds, dewy pink slit, plump rosy labia like delicate butterfly wings, pearl-like clit, tiny throbbing grm, sensitive pink pearl, erect little nub, translucent, rosy, perky nipples; dusky pink tips; hardened rosebuds, soft pink areola like faintly textured halo, dusky rose circle, delicate pebbles, neatly trimmed pubic hair, soft curly bush, silky landing strip, groomed triangle, a real wet nice pink pussy, lovely pink-white transparent nipples, pale pubic hair, a nice belly button, posing sexy, positive vibes, very intricate, very detailed, sharp, bright, colorful, looks at viewers.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-gangbang-image",
    sourceModelId: "gangbang-image",
    title: "Gangbang Image",
    badge: "",
    file: "gangbang-image.jpeg",
    prompt: "dentical face and haircut of the woman from image 1, completely naked, bare neck and shoulders, large natural breasts, thick thighs and ass, perfect anatomy, no distortions, lying flat on her back on bed, top-down view directly from above, looking up at camera, legs widely spread, hands bent in elbows and raised to the sides simple vertical measurement ruler-like marks lower abdominal tattoo She firmly holds two thick erect cocks with her hands — cocks seamlessly attached to male torsos off frame on each side, no full bodies or faces. Extremely thick erect cock fully inserted deep in her vagina, seamlessly attached to partial male lower body below her — strong hands gripping/pulling her thighs from the top, hips touching hers, no full body or face. Another thick erect cock hanging down from the top of the frame, positioned at the side of her head — seamlessly attached to partial male lower body visible at the edge, only the cock and minimal body visible, her face fully unobstructed and clearly visible to camera. glossy wet lube on cocks tiny amounts of cum on her face, huge loads cum covered body Coherent anatomy, all elements connected naturally, realistic lighting and shadows.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-frat-party-image",
    sourceModelId: "frat-party-image",
    title: "Frat Party Image",
    badge: "",
    file: "frat-party-image.jpeg",
    prompt: "The character in image 1 is processed into Shot from behind, Super hot girl sitting on a guy's lap and riding cowgirl, his penis in her vagina. They are sitting on a couch in the middle of a crowded frat party in Tokyo Japan. Amateur snap unaware of the camera. Fun youthful vibe. She is facing the viewer",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-wedding-sex-v1-image",
    sourceModelId: "wedding-sex-v1-image",
    title: "Wedding Sex V1 Image",
    badge: "",
    file: "wedding-sex-v1-image.jpeg",
    prompt: "low angle, bokeh, extreme close-up, professional photo, At a wedding party, a beautiful bride (the exact same woman from image 1, fully clothed white wedding dress, smiling, upskirt, folded legs, knees up) on top of groom (suit pants opened fly) in the center of attention. The wedding couple are sitting on a chair in the middle of the dance floor. cowgirl sex position. the bride with spread legs has a beautiful white wedding dress. Her pussy is exposed as she humps the groom's penis. the party guests who are all asian are very close and cheering.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-wedding-sex-v2-image",
    sourceModelId: "wedding-sex-v2-image",
    title: "Wedding Sex V2 Image",
    badge: "",
    file: "wedding-sex-v2-image.jpeg",
    prompt: "A bride (exact the same girl from image 1) kneeling on an altar in a church, wearing a white wedding dress with exposed cleavage, white thigh-high stockings, and white high heels. Her dress is pulled up to reveal her thighs. She is positioned on the left, looking up and to the right with an open mouth and tongue out. Next to her on the right stands the groom in a suit with his pants down, holding his erect penis. The bride is kissing the penis as the groom strokes it. Cum is shooting from the penis onto her face and dripping down onto her cleavage. In the background, there's a blurred crowd seated on church benches, watching the bride. The scene features erotic backlighting and bokeh effects, with dramatic shadows typical of a gothic church setting.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bend-back-image",
    sourceModelId: "bend-back-image",
    title: "Bend Back Image",
    badge: "",
    file: "bend-back-image.jpeg",
    prompt: "The character in image 1 is processed into Shot from behind, She turned to look at the camera, her profile was visible. she was kneeling on all fours with her legs spread wide, her thighs outstretched, revealing her buttocks. She was not wearing pants or underwear; her left and right hands were supporting her weight on the ground. Maintain consistency in character, hairstyle. Maintain consistency in space and setting. Maintain consistency in the character's upper body clothing. her vulva is shaped like an innie pussy. her anus is visible",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-facefuck-image",
    sourceModelId: "facefuck-image",
    title: "Facefuck Image",
    badge: "NEW",
    file: "facefuck-image.jpeg",
    prompt: "image shows the girl lying on her back and a naked man straddling on her face. the upper body of the man is out of frame and his testicles are covering the girls face. the face of the girl is covered by the man. the image is shot from below. the image shows an implied fellatio. the girl is grabbing the mans thighs. the girl, is lying on her back on a bed with white sheets. the man's lower body is the only part of him visible in the frame, with his legs and buttocks in the upper part of the image. keep the outfit of the girl, add cum only on her chest, add cinematic lighting",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-nude-selfie",
    sourceModelId: "nude-selfie",
    title: "Nude Selfie",
    badge: "",
    file: "nude-selfie.jpg",
    prompt: "nude female bedroom mirror selfie, the woman is using one hand to pull up the same clothes she was wearing in the original photo and the other hand is holding her apple iphone, the womans' original wearings are pulled down along with her yellow panties to reveal her shaved vulva, her belly button is not pierced, highly detailed 32k photorealistic, she is showing her nipples fully to the viewer",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-i-have-guns-image",
    sourceModelId: "i-have-guns-image",
    title: "I Have Guns Image",
    badge: "NEW",
    file: "i-have-guns-image.jpeg",
    prompt: "the exact same woman from image 1 aiming a glock pistol at the viewer",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-wooden-pillory-v1-image",
    sourceModelId: "wooden-pillory-v1-image",
    title: "Wooden Pillory V1 Image",
    badge: "NEW",
    file: "wooden-pillory-v1-image.jpeg",
    prompt: "candid photo of the exact same woman from image 1 locked in a wooden pillory, front side view of exact same woman from image 1 locked in a wooden pillory, breasts, in a dark dungeon, cum leaking from mouth, cum leaking from vagina, cum on face, ahegao face, sticking out tongue, rolling her eyes, a man is standing in front of her with his penis close to her face, penis close to the woman's face, woman's head and hands are poking through holes in the wooden pillory,",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-wooden-pillory-v2-image",
    sourceModelId: "wooden-pillory-v2-image",
    title: "Wooden Pillory V2 Image",
    badge: "NEW",
    file: "wooden-pillory-v2-image.jpeg",
    prompt: "The exact same woman from image 1 locked in a wooden pillory, side view of woman locked in a wooden pillory, a man is behind the woman having doggystyle position sex with the woman, in a dungeon, woman's head and hands are poking through holes in the wooden pillory,",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-deep-deepthroat-image",
    sourceModelId: "deep-deepthroat-image",
    title: "Deep Deepthroat Image",
    badge: "NEW",
    file: "deep-deepthroat-image.jpeg",
    prompt: "keep the outfit and body of the girl. she lying against a couch.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-against-wall-doggy-image",
    sourceModelId: "against-wall-doggy-image",
    title: "Against Wall Doggy Image",
    badge: "NEW",
    file: "against-wall-doggy-image.jpeg",
    prompt: "the exact same girl from image 1",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-written-on-body-image",
    sourceModelId: "written-on-body-image",
    title: "Written On Body Image",
    badge: "NEW",
    file: "written-on-body-image.jpeg",
    prompt: "The exact same female from image 1 bent over, text in marker on butt says \"肉便器\" in Japanese with an arrow drawn toward anus, anus with some hair around it",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cum-on-face-v2-image",
    sourceModelId: "cum-on-face-v2-image",
    title: "Cum On Face V2 Image",
    badge: "NEW",
    file: "cum-on-face-v2-image.jpeg",
    prompt: "Keep the setting and lighting. keep the character and her outfit of image1.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-nude-selfie-v2-image",
    sourceModelId: "nude-selfie-v2-image",
    title: "Nude Selfie V2 Image",
    badge: "NEW",
    file: "nude-selfie-v2-image.jpeg",
    prompt: "Use the exact same woman from image 1. The Leaked nudes style photograph features a nude woman sitting in a corner shower with dark, marble-patterned tiles on the walls.She looking directly at the camera with a slight smile. Her breasts are big, and she has a tattoo of an anchor below her right breast. She is seated with her legs spread apart, exposing her shaved pussy. Her left hand is resting on her inner thigh, and her right hand is placed between her legs, partially covering her genitals. The image is a candid, realistic photograph.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-reverse-pov-blowjob-image",
    sourceModelId: "reverse-pov-blowjob-image",
    title: "Reverse POV Blowjob Image",
    badge: "NEW",
    file: "reverse-pov-blowjob-image.jpeg",
    prompt: "she is lying on bed",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-reverse-pov-anal-image",
    sourceModelId: "reverse-pov-anal-image",
    title: "Reverse POV Anal Image",
    badge: "NEW",
    file: "reverse-pov-anal-image.jpeg",
    prompt: "the exact same girl from image 1",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-pov-footjob-image",
    sourceModelId: "pov-footjob-image",
    title: "Pov Footjob Image",
    badge: "NEW",
    file: "pov-footjob-image.jpeg",
    prompt: "she is smiling, she is groping her own breasts. girl is grabbing her own breasts.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-gokkun-image",
    sourceModelId: "gokkun-image",
    title: "Gokkun Image",
    badge: "NEW",
    file: "gokkun-image.jpeg",
    prompt: "she is drooling cum. Her mouth is wide open",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-cum-overflow-image",
    sourceModelId: "cum-overflow-image",
    title: "Cum Overflow Image",
    badge: "NEW",
    file: "cum-overflow-image.jpeg",
    prompt: "She is lying on the bed. she has cum in her mouth. mouth is filled with cum. cum in mouth. mouth overflowing with cum it runs don her left cheek onto the pillow.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-bukkake-image",
    sourceModelId: "bukkake-image",
    title: "Bukkake Image",
    badge: "NEW",
    file: "bukkake-image.jpeg",
    prompt: "semen, cum, facial, bukkake, she has excessive cum and semen in her face. she is drooling cum. she has huge amounts of cum in her mouth. there is lots of semen on her body and breasts. she has cum in her hair.  mouth is filled with cum. cum in mouth. mouth overflowing with cum. significant amount of a white, viscous substance is visible on her tongue and dripping from her mouth. She is holding all the dicks from the man surrounding her.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-presenting-pussy-image",
    sourceModelId: "presenting-pussy-image",
    title: "Presenting Pussy Image",
    badge: "NEW",
    file: "presenting-pussy-image.jpeg",
    prompt: "The exact same woman from image 1 is presenting ass and pussy to her boss in the foreground while she is sitting on the boss' desk sideways. her short black skirt is pulled up. bottomless. she is wearing a white blouse and elegant black laced black thighigh stockings. her hand is on her own ass, she is spreading her ass and gaping vagina hairy pussy. ass focus. Wearing a seductive smile her eyes and her attention are directed at the boss. the boss is viewed from behind paying attention to her open vagina. The boss man is holding black panties (wrapped around his fingers) against his nose sniffing it. her ass is left. her legs are right. remove moles. remove freckles. elegant conference room office setting. natural light from the side.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-full-nelson-dp-image",
    sourceModelId: "full-nelson-dp-image",
    title: "Full Nelson Dp Image",
    badge: "NEW",
    file: "full-nelson-dp-image.jpeg",
    prompt: "one woman and two males. viewpoint from side, folded, legs up, the girl in the image has her legs are spread wide apart and held up. the man standing is penetrating her vagina while the other man's penis is penetrating her anus. her thong is pulled aside and exposes her vagina and anus. the faces of the two males are not in frame. girl is lying on bed with on one man. the man under her is holding her in a full-nelson position. girl is moaning and looking at viewer,",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-doggystyle-anal-spitroast-image",
    sourceModelId: "doggystyle-anal-spitroast-image",
    title: "Doggystyle Anal Spitroast Image",
    badge: "NEW",
    file: "doggystyle-anal-spitroast-image.jpeg",
    prompt: "the photograph depicts an explicit, adult scene involving three individuals. The central focus is on the woman who is positioned on all fours on a ottoman. She is exposing her buttocks and genitals. She performs oral sex on a man with a large, erect penis. she is also being penetrated from behind by another  man, whose erect penis is visible entering her anus. the men's torsos and lower bodies are visible, while their faces are out of frame. keep her outfit and her hair style.",
    sourceRequired: true,
    sourceCount: 1,
    tags: []
  },
  {
    id: "pf-image-lesbian-kiss-v2-image",
    sourceModelId: "lesbian-kiss-v2-image",
    title: "Lesbian Kiss V2 Image",
    badge: "NEW",
    file: "lesbian-kiss-v2-image.jpeg",
    prompt: "This close-up shot captures two naked women getting hot in a bathroom. On the left, is the woman from image 1 with her hair pulled back in a ponytail leans in, showing off her defined shoulders and pecs. On the right, is the woman from image 2 tied back with a white scrunchie leans in close. Woman from image 1 and woman from image 2 are passionately kissing each other's with their tongues. Thick, white, foamy fluid is smeared around her lips and dripping down her chin. The woman from image 1 hand in foreground grips the brunette's neck. while woman from image 2 hand grab's the woman from image 1's breast. Only the woman from the image 1 is looking at the camera. The background features a white bathtub and beige tiles, with warm lighting highlighting the curves of their bodies and the sweat on their skin.",
    sourceRequired: true,
    sourceCount: 2,
    tags: [
      "2 Girls"
    ]
  }
];

const PLAYFLUX_ANIME_TEMPLATE_DATA = [
  {
    id: "pf-anime-pov-cowgirl-looking-down",
    sourceModelId: "pov-cowgirl-looking-down",
    animePositionId: "e45892fd-347f-4c1e-b486-f475ef938929",
    title: "Cowgirl POV / 騎乗位",
    file: "pov-cowgirl-looking-down.jpeg",
    prompt: "masterpiece, best quality, 1girl, CG_LD, 1girl, 1boy, pov,  girl on top, straddling,, leaning forward,, leaning back,, directly above viewer,, pinning viewer down,",
    triggerWords: "CG_LD, 1girl, 1boy, pov,  girl on top, straddling,, leaning forward,, leaning back,, directly above viewer,, pinning viewer down,, closer, breast pressed against another's chest,, from behind, ass, looking back,, looking at viewer,, dutch angle,, from below,, from above,, reaching for viewer,, hands on own chest,, arms behind back,, arms up,, sex,, imminent sex,, after sex,, penis, pussy,, pussy juice,, (ejaculation), cum bubbling, cum, overflow,, nipples,, breasts apart,, breasts together,, breast grab,, butt grab,, leg grab,, face grab,, focus on breasts, head out of frame,"
  },
  {
    id: "pf-anime-expressiveh-hentai-style",
    sourceModelId: "expressiveh-hentai-style",
    animePositionId: "3173674c-b2b5-4a6c-ab04-278b932dad21",
    title: "ExpressiveH / エロアニメスタイル",
    file: "expressiveh-hentai-style.jpeg",
    prompt: "masterpiece, best quality, 1girl, Expressiveh, nude",
    triggerWords: "Expressiveh"
  },
  {
    id: "pf-anime-pov-blowjob-titjob-handjob",
    sourceModelId: "pov-blowjob-titjob-handjob",
    animePositionId: "cc77fc4a-a7cf-432b-b231-1e56d24dd7b5",
    title: "Blowjob + Titjob POV / フェラ+パイズリ",
    file: "pov-blowjob-titjob-handjob.jpeg",
    prompt: "masterpiece, best quality, 1girl, pov, 1girl, 1boy,, fellatio,, paizuri,, handjob,, one handed,",
    triggerWords: "pov, 1girl, 1boy,, fellatio,, paizuri,, handjob,, one handed,, two handed,, teasing the tip,, sucking penis,, licking penis,, default fellatio,, deepthroat,, from above,, from below,, dutch angle,, looking at viewer,, (cum in mouth, overflow, cum bubbling, cum on penis:1.2),, (cum on mouth, cum on breasts ejaculation, cumshot, cum bubbling, cum on penis:1.2),, underboob,, cleavage,, breasts apart,, breasts together,, open clothes,, fully clothed,, naked,, nipples,, penis,, head grab,, breast grab,, grabbing own breasts,"
  },
  {
    id: "pf-anime-ass-worship",
    sourceModelId: "ass-worship",
    animePositionId: "26fd5227-77e6-4723-9945-334329128f78",
    title: "Ass Worship / 尻崇拝",
    file: "ass-worship.jpeg",
    prompt: "masterpiece, best quality, 1girl, worship",
    triggerWords: "worship"
  },
  {
    id: "pf-anime-pov-missionary-raised-legs",
    sourceModelId: "pov-missionary-raised-legs",
    animePositionId: "55c067ce-1a04-4852-9ead-4e1d091aa15a",
    title: "Missionary Raised Legs / 正常位",
    file: "pov-missionary-raised-legs.jpeg",
    prompt: "masterpiece, best quality, 1girl, sex, missionary, pov",
    triggerWords: "sex, missionary, pov"
  },
  {
    id: "pf-anime-femdom-sandwich-threesome",
    sourceModelId: "femdom-sandwich-threesome",
    animePositionId: "a9944ad2-03c4-4589-9d0c-939828c98fa3",
    title: "Femdom Threesome / フェムドム3P",
    file: "femdom-sandwich-threesome.jpeg",
    prompt: "masterpiece, best quality, 1girl, fdom_sw",
    triggerWords: "fdom_sw"
  },
  {
    id: "pf-anime-pov-lying-on-top",
    sourceModelId: "pov-lying-on-top",
    animePositionId: "a9df582d-6de8-41d0-a8ae-73dd8d197061",
    title: "Lying on Top POV / 上から",
    file: "pov-lying-on-top.jpeg",
    prompt: "masterpiece, best quality, 1girl, Lying on top, 1girl, 1boy, pov, breasts, legs, thighs,, Lying next to viewer, 1girl, 1boy, pov, breasts, legs, thighs,, arms, hands,, from below,, from behind, butt,",
    triggerWords: "Lying on top, 1girl, 1boy, pov, breasts, legs, thighs,, Lying next to viewer, 1girl, 1boy, pov, breasts, legs, thighs,, arms, hands,, from below,, from behind, butt,, looking at viewer,, facing away,, sex, pussy, penis,, trembling, cumming, creampie,, fully clothed,, naked,, nipples,, Breasts apart,, Breast press,, breast grab,, Butt grab,"
  },
  {
    id: "pf-anime-pov-missionary-legs-together",
    sourceModelId: "pov-missionary-legs-together",
    animePositionId: "6231eb09-bf92-481b-8872-10ca292ee307",
    title: "Missionary Legs Together / 正常位 脚閉じ",
    file: "pov-missionary-legs-together.jpeg",
    prompt: "masterpiece, best quality, 1girl, sex, missionary, pov",
    triggerWords: "sex, missionary, pov"
  },
  {
    id: "pf-anime-pleasured-orgasm-pose-xl",
    sourceModelId: "pleasured-orgasm-pose-xl",
    animePositionId: "e4cd63e6-b66b-4360-87ea-f21174cebbcb",
    title: "Orgasm Pose / オーガズム",
    file: "pleasured-orgasm-pose-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, orgasm_face,, closed eyes,, half-closed eyes,, rolling eyes,, open mouth,",
    triggerWords: "orgasm_face,, closed eyes,, half-closed eyes,, rolling eyes,, open mouth,, tongue out,, blush,, drooling,, saliva,"
  },
  {
    id: "pf-anime-licking-penis-testicles-andi-poses",
    sourceModelId: "licking-penis-testicles-andi-poses",
    animePositionId: "0caa8a2e-0165-49af-8665-ff9eb0ce2b65",
    title: "Licking Penis / ペニス舐め",
    file: "licking-penis-testicles-andi-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, licking testicles, licking shaft, licking tip",
    triggerWords: "licking testicles, licking shaft, licking tip"
  },
  {
    id: "pf-anime-check-this-ass-pose",
    sourceModelId: "check-this-ass-pose",
    animePositionId: "3c3446fd-e9b3-4f5b-8c18-3e54a37b443a",
    title: "Check This Ass / お尻ポーズ",
    file: "check-this-ass-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, ass pose, from behind, bent over, looking back, ass, footwear, looking at viewer,, huge ass,",
    triggerWords: "ass pose, from behind, bent over, looking back, ass, footwear, looking at viewer,, huge ass,"
  },
  {
    id: "pf-anime-dogeza-pose",
    sourceModelId: "dogeza-pose",
    animePositionId: "a8248802-f0cd-4f4b-8209-4d292fcbbbe6",
    title: "Dogeza / 土下座",
    file: "dogeza-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, Dogeza",
    triggerWords: "Dogeza"
  },
  {
    id: "pf-anime-head-grab",
    sourceModelId: "head-grab",
    animePositionId: "f9c162ed-64a7-4778-8c7d-8120ff9212ed",
    title: "Head Grab / 頭掴み",
    file: "head-grab.jpeg",
    prompt: "masterpiece, best quality, 1girl, sex,1girl, 1boy, sex from behind, dark-skinned male, hetero, head grab, doggystyle, arm grab, face down, hair grab, looking down, tears, messy hair, top-down bottom-up, head out of frame, out of frame, 1girl, 1boy, head grab, arm grab, face down, hair grab, looking down, tears, messy hair, top-down bottom-up, head out of frame, out of frame,",
    triggerWords: "sex,1girl, 1boy, sex from behind, dark-skinned male, hetero, head grab, doggystyle, arm grab, face down, hair grab, looking down, tears, messy hair, top-down bottom-up, head out of frame, out of frame, 1girl, 1boy, head grab, arm grab, face down, hair grab, looking down, tears, messy hair, top-down bottom-up, head out of frame, out of frame,"
  },
  {
    id: "pf-anime-from-behind-breast-press-top-down-bottom-up",
    sourceModelId: "from-behind-breast-press-top-down-bottom-up",
    animePositionId: "49f03492-eddf-47cb-bbdf-595967e8ba86",
    title: "Behind Breast Press / 背面密着",
    file: "from-behind-breast-press-top-down-bottom-up.jpeg",
    prompt: "masterpiece, best quality, 1girl, (from behind:1.1),top-down bottom-up,breast press,ass,wide spread legs,large breasts,",
    triggerWords: "(from behind:1.1),top-down bottom-up,breast press,ass,wide spread legs,large breasts,"
  },
  {
    id: "pf-anime-clean-phimosis-pose",
    sourceModelId: "clean-phimosis-pose",
    animePositionId: "604529ca-ec45-4537-a40d-5e2182dc444f",
    title: "Phimosis Pose / 包茎ポーズ",
    file: "clean-phimosis-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, Clean phimosis",
    triggerWords: "Clean phimosis"
  },
  {
    id: "pf-anime-enhanced-boobies-sucking-double-penetration",
    sourceModelId: "enhanced-boobies-sucking-double-penetration",
    animePositionId: "49af1a28-4f9a-4716-977b-a84025001b53",
    title: "Boob Sucking + DP / 乳吸い+二穴",
    file: "enhanced-boobies-sucking-double-penetration.jpeg",
    prompt: "masterpiece, best quality, 1girl, dans, mmf threesome, mmm threesome, fff threesome, da_faceless males",
    triggerWords: "dans, mmf threesome, mmm threesome, fff threesome, da_faceless males, da_grabbing, double penetration"
  },
  {
    id: "pf-anime-pronebone-poses-xl",
    sourceModelId: "pronebone-poses-xl",
    animePositionId: "d6aa055e-8e4e-49a0-85c5-7636c5d38363",
    title: "Pronebone / 寝バック",
    file: "pronebone-poses-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, prone bone, prone bone position,, closeprone,, sex from behind, 1<gender> lying on <her/his> stomach, on stomach, sex,, 1<gender> fucking <gender>, <gender> on top,, front_view,",
    triggerWords: "prone bone, prone bone position,, closeprone,, sex from behind, 1<gender> lying on <her/his> stomach, on stomach, sex,, 1<gender> fucking <gender>, <gender> on top,, front_view,, side_view,, behind view, back_view,, choke, asphyxiation, arms around neck,"
  },
  {
    id: "pf-anime-restrained-by-magic-circles-nsfw",
    sourceModelId: "restrained-by-magic-circles-nsfw",
    animePositionId: "517f89ef-9282-4efb-b29d-addffc418752",
    title: "Restrained by Magic / 魔法拘束",
    file: "restrained-by-magic-circles-nsfw.jpeg",
    prompt: "masterpiece, best quality, 1girl, restrained_magic, magic circles, glowing magic-circles, spread arms, spread legs,",
    triggerWords: "restrained_magic, magic circles, glowing magic-circles, spread arms, spread legs,"
  },
  {
    id: "pf-anime-pov-amazon-position",
    sourceModelId: "pov-amazon-position",
    animePositionId: "d85f7ddf-1d0c-4136-8d15-e391e65c5466",
    title: "Amazon Position / アマゾン",
    file: "pov-amazon-position.jpeg",
    prompt: "masterpiece, best quality, 1girl, pap, pov amazon position, amazon position, legs, feet, 1girl, 1boy, pov,, from above, floor, , from below, ceiling, , from behind, butt,, (side profile:1.4),",
    triggerWords: "pap, pov amazon position, amazon position, legs, feet, 1girl, 1boy, pov,, from above, floor, , from below, ceiling, , from behind, butt,, (side profile:1.4),, looking at viewer,, facing away,, squatting,, reaching for viewer,, Imminent sex,, Sex,, trembling, cumming, creampie, overflow,, fully clothed,, open clothes,, naked,, nipples,, ankle grab,, Woman grabbing own butt,, Woman grabbing own breasts,"
  },
  {
    id: "pf-anime-pov-sumata-grinding",
    sourceModelId: "pov-sumata-grinding",
    animePositionId: "72794b71-9e73-4130-986d-de7f250f470a",
    title: "Sumata / 素股",
    file: "pov-sumata-grinding.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1woman, 1man, pov, straddling, girl on top, , sumata, grinding, bulge,, sumata, leaning forwards, cleavage, , sumata, leaning backwards, underboob, , sumata, from behind, butt, ",
    triggerWords: "1woman, 1man, pov, straddling, girl on top, , sumata, grinding, bulge,, sumata, leaning forwards, cleavage, , sumata, leaning backwards, underboob, , sumata, from behind, butt, , Front facing buttjob, underboob, , buttjob,, thighjob, , from below,, from above, , dutch angle, , precum, , cum, , ejaculation, , reaching for viewer, , feet, stepping, , thigh, legs, , pussy, , dick, , pushing butt together, grabbing own butt, , breast grab, , butt grab, , thigh grab, , torso grab,"
  },
  {
    id: "pf-anime-pov-on-couch-pose-lora-ai",
    sourceModelId: "pov-on-couch-pose-lora-ai",
    animePositionId: "56b54e34-5e15-451a-b836-8b45466392fc",
    title: "On Couch POV / ソファー",
    file: "pov-on-couch-pose-lora-ai.jpeg",
    prompt: "masterpiece, best quality, 1girl, pov,on couch",
    triggerWords: "pov,on couch"
  },
  {
    id: "pf-anime-against-glass-xl",
    sourceModelId: "against-glass-xl",
    animePositionId: "ab885306-a20e-43c8-a227-a50add50d0c2",
    title: "Against Glass / ガラス越し",
    file: "against-glass-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, against shower door,, breasts on glass,, breast press,, against_glass,, against surface,",
    triggerWords: "against shower door,, breasts on glass,, breast press,, against_glass,, against surface,, on glass,, soap bubbles,, against glass,, cheek press, nipples,, wet,, sweat,, glasslick,, licking glass,, tongue on glass,, soap,, sponge,"
  },
  {
    id: "pf-anime-feet-pussy-pose",
    sourceModelId: "feet-pussy-pose",
    animePositionId: "53dc6770-800d-4aa3-bbbf-5b94c0d2882b",
    title: "Feet Pussy Pose / 足マンコ",
    file: "feet-pussy-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, feet pussy, two feet pussy",
    triggerWords: "feet pussy, two feet pussy"
  },
  {
    id: "pf-anime-body-bridge",
    sourceModelId: "body-bridge",
    animePositionId: "bf5eb335-4303-4450-9f70-e0425b5899d4",
    title: "Body Bridge / ブリッジ",
    file: "body-bridge.jpeg",
    prompt: "masterpiece, best quality, 1girl, body bridge, arched back, arms support,",
    triggerWords: "body bridge, arched back, arms support,"
  },
  {
    id: "pf-anime-bent-over-blowjob",
    sourceModelId: "bent-over-blowjob",
    animePositionId: "8ac5e518-94c7-4f63-8293-f74b19d99be8",
    title: "Bent Over Blowjob / 前屈みフェラ",
    file: "bent-over-blowjob.jpeg",
    prompt: "masterpiece, best quality, 1girl,  bentoverblow, standing, blowjob, face down ass up, 1boy, 1girl, bentoverblow, standing, licking penis, face down ass up, 1boy, 1girl, cumshot, projectile cum, cum on face, huge cumshot, bentoverblow, standing, blowjob, face down ass up, 1boy, 1girl, pov, from side, bentoverblow, standing, blowjob, face down ass up, 1boy, 1girl",
    triggerWords: " bentoverblow, standing, blowjob, face down ass up, 1boy, 1girl, bentoverblow, standing, licking penis, face down ass up, 1boy, 1girl, cumshot, projectile cum, cum on face, huge cumshot, bentoverblow, standing, blowjob, face down ass up, 1boy, 1girl, pov, from side, bentoverblow, standing, blowjob, face down ass up, 1boy, 1girl"
  },
  {
    id: "pf-anime-kissy-face-pose-lora-ai",
    sourceModelId: "kissy-face-pose-lora-ai",
    animePositionId: "bf5f51b0-6256-4c1a-90b5-e883eebc412a",
    title: "Kissy Face / キス顔",
    file: "kissy-face-pose-lora-ai.jpeg",
    prompt: "masterpiece, best quality, 1girl, incoming kiss",
    triggerWords: "incoming kiss"
  },
  {
    id: "pf-anime-pov-non-pov-cowgirl-position-sex",
    sourceModelId: "pov-non-pov-cowgirl-position-sex",
    animePositionId: "42bd6d53-68e6-4df3-9166-bb7a8fbbe5f6",
    title: "Cowgirl Sex / 騎乗位セックス",
    file: "pov-non-pov-cowgirl-position-sex.jpeg",
    prompt: "masterpiece, best quality, 1girl, cowgirl position, sex, on top, straddling, spread legs,, Squatting Cowgirl Position, squatting, knees up squat,, cowgirl at car, inside car, upright straddle, steering wheel,, reclining cowgirl position, reclining, holding hands,, Cowgirl amazon,",
    triggerWords: "cowgirl position, sex, on top, straddling, spread legs,, Squatting Cowgirl Position, squatting, knees up squat,, cowgirl at car, inside car, upright straddle, steering wheel,, reclining cowgirl position, reclining, holding hands,, Cowgirl amazon,, leaning forward,, about to penetrate,, Creampie,, Pov Cowgirl,, side view, third person view,"
  },
  {
    id: "pf-anime-sitting-on-chair-from-behind-pose-lora-ai",
    sourceModelId: "sitting-on-chair-from-behind-pose-lora-ai",
    animePositionId: "410d51b2-2444-4b11-83f2-e53f853fe879",
    title: "Chair From Behind / 椅子バック",
    file: "sitting-on-chair-from-behind-pose-lora-ai.jpeg",
    prompt: "masterpiece, best quality, 1girl, sitting, from behind, on chair",
    triggerWords: "sitting, from behind, on chair"
  },
  {
    id: "pf-anime-sitting-on-lap-femdom-handjob-anal-fingering-th",
    sourceModelId: "sitting-on-lap-femdom-handjob-anal-fingering-th",
    animePositionId: "83632cb5-3aaf-4eba-8b1c-d0bf46b2730a",
    title: "Lap Femdom / 膝上フェムドム",
    file: "sitting-on-lap-femdom-handjob-anal-fingering-th.jpeg",
    prompt: "masterpiece, best quality, 1girl, Sitting on lap, facing another, 1girl, 1boy, hetero, , Handjob, , Anal fingering, , Thigh sex,, Head between breasts, breast smother, ",
    triggerWords: "Sitting on lap, facing another, 1girl, 1boy, hetero, , Handjob, , Anal fingering, , Thigh sex,, Head between breasts, breast smother, , Size difference, larger female,"
  },
  {
    id: "pf-anime-self-wedgie-pose-lora",
    sourceModelId: "self-wedgie-pose-lora",
    animePositionId: "040f6138-9119-4255-8a13-cd1a5b929fae",
    title: "Self Wedgie / セルフウェッジー",
    file: "self-wedgie-pose-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, self wedgie",
    triggerWords: "self wedgie"
  },
  {
    id: "pf-anime-pose-nipple-licking-handjob",
    sourceModelId: "pose-nipple-licking-handjob",
    animePositionId: "8290eb73-6212-4b84-b66d-f21f39d8601a",
    title: "Nipple Licking HJ / 乳首舐め手コキ",
    file: "pose-nipple-licking-handjob.jpeg",
    prompt: "masterpiece, best quality, 1girl, nai_nipple_licking_handjob, score_9, 1girl, 1boy, hetero, handjob, nipple stimulation, licking nipple, pov, erection, tongue out, licking, spoken heart",
    triggerWords: "nai_nipple_licking_handjob, score_9, 1girl, 1boy, hetero, handjob, nipple stimulation, licking nipple, pov, erection, tongue out, licking, spoken heart"
  },
  {
    id: "pf-anime-grabbing-own-ankles-hugging-own-legs",
    sourceModelId: "grabbing-own-ankles-hugging-own-legs",
    animePositionId: "4722114c-7daf-4b2b-83aa-ac4a5cb8d921",
    title: "Grabbing Ankles / 足首掴み",
    file: "grabbing-own-ankles-hugging-own-legs.jpeg",
    prompt: "masterpiece, best quality, 1girl, bentgrabILL, bent over, grabbing own ankles, hugging own legs",
    triggerWords: "bentgrabILL, bent over, grabbing own ankles, hugging own legs"
  },
  {
    id: "pf-anime-rimjob-for",
    sourceModelId: "rimjob-for",
    animePositionId: "9d84c342-e5e6-48a8-877e-1b2717534348",
    title: "Rimjob / リムジョブ",
    file: "rimjob-for.jpeg",
    prompt: "masterpiece, best quality, 1girl, rmjb, anilingus",
    triggerWords: "rmjb, anilingus"
  },
  {
    id: "pf-anime-pov-bondage-chair",
    sourceModelId: "pov-bondage-chair",
    animePositionId: "6b62eb5b-c2f8-4eb2-b5f3-ca12e5fa2d62",
    title: "Bondage Chair / 拘束椅子",
    file: "pov-bondage-chair.jpeg",
    prompt: "masterpiece, best quality, 1girl, Pov Bondage Chair, no sex, breast exposed, lower half exposed, fully exposed",
    triggerWords: "Pov Bondage Chair, no sex, breast exposed, lower half exposed, fully exposed, pressed against vagina, sex, deep sex, pressed against anus, anal sex"
  },
  {
    id: "pf-anime-grabbing-own-ass-legs-apart",
    sourceModelId: "grabbing-own-ass-legs-apart",
    animePositionId: "4dc9527d-4d47-40e6-b9de-61c61d883f35",
    title: "Grabbing Ass / お尻掴み",
    file: "grabbing-own-ass-legs-apart.jpeg",
    prompt: "masterpiece, best quality, 1girl, grab0wnass,  ass,ass focus,ass grab,grabbing own ass,facing away,standing,legs apart,leaning forward,from behind,feet out of frame,cowboy shot",
    triggerWords: "grab0wnass,  ass,ass focus,ass grab,grabbing own ass,facing away,standing,legs apart,leaning forward,from behind,feet out of frame,cowboy shot"
  },
  {
    id: "pf-anime-wheelbarrow-pose-xl",
    sourceModelId: "wheelbarrow-pose-xl",
    animePositionId: "ad84e1fb-8fd0-4d6f-83a9-af8709a14c16",
    title: "Wheelbarrow / 手押し車",
    file: "wheelbarrow-pose-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1girl, 1boy, sex from behind, wheelbarrow position,, arm support,  push-ups, handstand,, straight-on, breast press, top-down bottom-up, wheelbarrow_spanking, spanking,, squatting,",
    triggerWords: "1girl, 1boy, sex from behind, wheelbarrow position,, arm support,  push-ups, handstand,, straight-on, breast press, top-down bottom-up, wheelbarrow_spanking, spanking,, squatting,, standing sex,, torso grab,, thigh grab,, leg lock,, legs up,, wheelbarrow race, walking, walking sex, clothed sex, clothing aside, midriff peek,, from side, profile,, from above, ass,"
  },
  {
    id: "pf-anime-pen-gesture",
    sourceModelId: "pen-gesture",
    animePositionId: "ea846324-e8c0-41e2-b4a5-c57477a2b3fb",
    title: "Pen Gesture / ペンジェスチャー",
    file: "pen-gesture.jpeg",
    prompt: "masterpiece, best quality, 1girl, lefthandp3n, righthandp3n",
    triggerWords: "lefthandp3n, righthandp3n"
  },
  {
    id: "pf-anime-bending-over",
    sourceModelId: "bending-over",
    animePositionId: "b56a9ffd-6194-45be-9527-0498fbbd0089",
    title: "Bending Over / 前屈み",
    file: "bending-over.jpeg",
    prompt: "masterpiece, best quality, 1girl, bendover, bending over, pose,, curved back, hunched over, hyper bend over,, grabbing leg, from behind, legs crossed",
    triggerWords: "bendover, bending over, pose,, curved back, hunched over, hyper bend over,, grabbing leg, from behind, legs crossed"
  },
  {
    id: "pf-anime-sitting-split",
    sourceModelId: "sitting-split",
    animePositionId: "a514811a-1138-4017-8a0e-749c571e1ceb",
    title: "Sitting Split / 開脚座り",
    file: "sitting-split.jpeg",
    prompt: "masterpiece, best quality, 1girl, sitting split,spread leg,",
    triggerWords: "sitting split,spread leg,"
  },
  {
    id: "pf-anime-blacked-gangbang-andi-poses",
    sourceModelId: "blacked-gangbang-andi-poses",
    animePositionId: "0737fb37-5c11-491a-a69a-5d7647c514f8",
    title: "Gangbang / 輪姦",
    file: "blacked-gangbang-andi-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, BlackedGang, Gangbang, double penetration,, triple penetration, mmf threesome",
    triggerWords: "BlackedGang, Gangbang, double penetration,, triple penetration, mmf threesome"
  },
  {
    id: "pf-anime-charm-person-magic",
    sourceModelId: "charm-person-magic",
    animePositionId: "9091f8b6-1d0a-4537-b547-f5bbbfbe2d4d",
    title: "Charm Person / 魅了",
    file: "charm-person-magic.jpeg",
    prompt: "masterpiece, best quality, 1girl, charm_person_(magic), cham_aura, aura on hand , glowing eyes, ",
    triggerWords: "charm_person_(magic), cham_aura, aura on hand , glowing eyes, "
  },
  {
    id: "pf-anime-cat-stretch-pose",
    sourceModelId: "cat-stretch-pose",
    animePositionId: "cd44ce87-d86d-4e69-9f93-ec106dd62d19",
    title: "Cat Stretch / 猫伸びポーズ",
    file: "cat-stretch-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, sts_cat_stretch, top-down_bottom-up",
    triggerWords: "sts_cat_stretch, top-down_bottom-up"
  },
  {
    id: "pf-anime-pov-sitting-on-lap",
    sourceModelId: "pov-sitting-on-lap",
    animePositionId: "e8d0eb7a-a2fe-428b-9d8e-26e4020e6a7a",
    title: "Sitting on Lap / 膝上座り",
    file: "pov-sitting-on-lap.jpeg",
    prompt: "masterpiece, best quality, 1girl, pov sitting on lap, 1girl, 1boy, pov,, from below,, from above,, dutch angle,, from behind, butt,",
    triggerWords: "pov sitting on lap, 1girl, 1boy, pov,, from below,, from above,, dutch angle,, from behind, butt,, (side profile:1.4),, looking at viewer,, facing away,, squatting,, reaching for viewer,, imminent penetration, pussy, penis,, sex, pussy, penis,, trembling, cumming, creampie,, fully clothed,, open clothes,, naked,, nipples,, (woman grabbing own breast:1.3),, (woman grabbing own butt:1.3),, (butt grab:1.3),, (breast grab:1.3),"
  },
  {
    id: "pf-anime-bbl-ass-pose",
    sourceModelId: "bbl-ass-pose",
    animePositionId: "892b01be-085d-4b11-a353-677308f34e28",
    title: "BBL Ass Pose / BBLお尻",
    file: "bbl-ass-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, asspose, from behind, ass, hands on hips, high heels",
    triggerWords: "asspose, from behind, ass, hands on hips, high heels"
  },
  {
    id: "pf-anime-bent-over-from-behind-below",
    sourceModelId: "bent-over-from-behind-below",
    animePositionId: "eefcff3c-c9ba-4c83-ab4b-1ab1aa0241dd",
    title: "Bent Over Behind / 後ろから前屈み",
    file: "bent-over-from-behind-below.jpeg",
    prompt: "masterpiece, best quality, 1girl, bentback",
    triggerWords: "bentback"
  },
  {
    id: "pf-anime-hug-kissing-breast-press-pov",
    sourceModelId: "hug-kissing-breast-press-pov",
    animePositionId: "9bba5e5b-00f0-4801-be2c-d23359b002b5",
    title: "Hug & Kiss POV / 抱擁キス",
    file: "hug-kissing-breast-press-pov.jpeg",
    prompt: "masterpiece, best quality, 1girl, pov kiss default, 1girl, 1boy, pov, , pov kiss breast press, breast press, 1girl, 1boy, pov,  , kiss, , french kiss, tongue,, close up, ",
    triggerWords: "pov kiss default, 1girl, 1boy, pov, , pov kiss breast press, breast press, 1girl, 1boy, pov,  , kiss, , french kiss, tongue,, close up, , from below, , from above, , dutch angle, , looking at viewer, , reaching for viewer, arms up, , imminent sex,, sex,, cumming, creampie, ejaculation, trembling,, pussy,, nipples,, penis,, fully clothed,, open clothes,, naked,, breast grab,, torso grab, , thigh grab, , arm grab, "
  },
  {
    id: "pf-anime-standing-split-sex-position-lora",
    sourceModelId: "standing-split-sex-position-lora",
    animePositionId: "10b9f2d5-5c06-4174-a32a-e9816b3eb27f",
    title: "Standing Split Sex / 立ち開脚",
    file: "standing-split-sex-position-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, standing split sex, standing on one leg, vaginal sex, standing sex",
    triggerWords: "standing split sex, standing on one leg, vaginal sex, standing sex"
  },
  {
    id: "pf-anime-head-on-thigh-pov",
    sourceModelId: "head-on-thigh-pov",
    animePositionId: "0f5ccd80-3e22-4070-b7fe-5d4fd4bb2e33",
    title: "Head on Thigh POV / 太もも枕",
    file: "head-on-thigh-pov.jpeg",
    prompt: "masterpiece, best quality, 1girl, head_on_thigh_pov, testicle sucking",
    triggerWords: "head_on_thigh_pov, testicle sucking, licking testicles"
  },
  {
    id: "pf-anime-female-pov",
    sourceModelId: "female-pov",
    animePositionId: "dc3b1539-5207-45a2-9ed6-c2b707ba322d",
    title: "Female POV / 女性視点",
    file: "female-pov.jpeg",
    prompt: "masterpiece, best quality, 1girl, female pov, pov breasts, on back, lying, pov crotch, taker pov",
    triggerWords: "female pov, pov breasts, on back, lying, pov crotch, taker pov"
  },
  {
    id: "pf-anime-prone-bone-position-lora",
    sourceModelId: "prone-bone-position-lora",
    animePositionId: "dae724e4-a5f6-4dcc-a3aa-4351212729c4",
    title: "Prone Bone / 寝バック",
    file: "prone-bone-position-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, prone bone",
    triggerWords: "prone bone"
  },
  {
    id: "pf-anime-femdom-holding-down",
    sourceModelId: "femdom-holding-down",
    animePositionId: "6dd8957c-4c9c-4b95-a635-e89c36bafeb2",
    title: "Femdom Hold Down / フェムドム押さえ",
    file: "femdom-holding-down.jpeg",
    prompt: "masterpiece, best quality, 1girl, fdom_held, holding another's wrists,",
    triggerWords: "fdom_held, holding another's wrists,"
  },
  {
    id: "pf-anime-folded-pose-xl-l",
    sourceModelId: "folded-pose-xl-l",
    animePositionId: "2596822e-95e1-4d3d-a505-b69bc206c8e9",
    title: "Folded Pose / まんぐり返し",
    file: "folded-pose-xl-l.jpeg",
    prompt: "masterpiece, best quality, 1girl, folded, legs up, knee to chest, legs together, upside-down",
    triggerWords: "folded, legs up, knee to chest, legs together, upside-down"
  },
  {
    id: "pf-anime-sitting-on-lap",
    sourceModelId: "sitting-on-lap",
    animePositionId: "132eea1b-eb03-48f8-907b-e0ab54034940",
    title: "Sitting on Lap / 膝座り",
    file: "sitting-on-lap.jpeg",
    prompt: "masterpiece, best quality, 1girl, sitting on lap, pov",
    triggerWords: "sitting on lap, pov"
  },
  {
    id: "pf-anime-pressed-missionary-feet-on-chest-multi-views-pl",
    sourceModelId: "pressed-missionary-feet-on-chest-multi-views-pl",
    animePositionId: "b6eb5dbc-fd4f-400e-a152-5b1e5dff1275",
    title: "Pressed Missionary / 足胸押し付け",
    file: "pressed-missionary-feet-on-chest-multi-views-pl.jpeg",
    prompt: "masterpiece, best quality, 1girl, pressed missionary position, male pov, from side, upside down shot",
    triggerWords: "pressed missionary position, male pov, from side, upside down shot"
  },
  {
    id: "pf-anime-pov-reverse-cowgirl-position-lora",
    sourceModelId: "pov-reverse-cowgirl-position-lora",
    animePositionId: "3d0ccbc0-6c88-403a-a574-8b3fb17ee435",
    title: "Reverse Cowgirl / 背面騎乗位",
    file: "pov-reverse-cowgirl-position-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, reverse cowgirl position, pov",
    triggerWords: "reverse cowgirl position, pov"
  },
  {
    id: "pf-anime-pov-bondage-wall",
    sourceModelId: "pov-bondage-wall",
    animePositionId: "124afbd4-3f36-4841-aeb3-1889d6a0b1ea",
    title: "Bondage Wall / 壁拘束",
    file: "pov-bondage-wall.jpeg",
    prompt: "masterpiece, best quality, 1girl, pov bondage wall legs up, feet, , pov bondage wall legs down, standing, (feet dangling:1.2), restrained to wall, , 1girl, 1boy, pov,, 1girl, solo,, fully restrained, arms up, ",
    triggerWords: "pov bondage wall legs up, feet, , pov bondage wall legs down, standing, (feet dangling:1.2), restrained to wall, , 1girl, 1boy, pov,, 1girl, solo,, fully restrained, arms up, , (arms free:1.3), , (legs free:1.3), arms up, , from behind, butt,, from above,, from below, , dutch angle,, imminent sex,, sex,, imminent anal sex,, anal sex,, internal view, x-ray,, cumming, creampie, ejaculation, trembling,, pussy,, nipples,, penis,, anus,, fully clothed,, open clothes,, naked,, breast grab,, thigh grab,, butt grab,"
  },
  {
    id: "pf-anime-handgag",
    sourceModelId: "handgag",
    animePositionId: "ac04b1b5-e7be-40ae-bd54-bf69fbaa3791",
    title: "Handgag / 口塞ぎ",
    file: "handgag.jpeg",
    prompt: "masterpiece, best quality, 1girl, handgag, big hand, small hand, gloved, tight grip",
    triggerWords: "handgag, big hand, small hand, gloved, tight grip, soft grip, front view, 3/4 view, side view, READ_DESCRIPTION_FOR_MORE"
  },
  {
    id: "pf-anime-hand-on-own-hip-on-side-poses",
    sourceModelId: "hand-on-own-hip-on-side-poses",
    animePositionId: "52602341-7600-4e1a-a950-08ccee97fdd0",
    title: "Hand on Hip / 腰に手",
    file: "hand-on-own-hip-on-side-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, <lora:hand-on-own-hip-on-side-illustriousxl-lora-nochekaiser:1>, hand on own hip on side, looking at viewer, collarbone, lying, hand on hip, bed, bed sheet, arm support, on bed, on side, head rest, hand on own thigh",
    triggerWords: "<lora:hand-on-own-hip-on-side-illustriousxl-lora-nochekaiser:1>, hand on own hip on side, looking at viewer, collarbone, lying, hand on hip, bed, bed sheet, arm support, on bed, on side, head rest, hand on own thigh"
  },
  {
    id: "pf-anime-pulling-down-panties-and",
    sourceModelId: "pulling-down-panties-and",
    animePositionId: "df12c749-a9b4-4896-bb07-09520b6ff9f1",
    title: "Pulling Down Panties / パンツ脱ぎ",
    file: "pulling-down-panties-and.jpeg",
    prompt: "masterpiece, best quality, 1girl, panty pull, facing viewer, from behind, lying on back",
    triggerWords: "panty pull, facing viewer, from behind, lying on back"
  },
  {
    id: "pf-anime-heart-hands-on-breast-lora",
    sourceModelId: "heart-hands-on-breast-lora",
    animePositionId: "695ba516-6024-482d-b51f-9d78f04d6ca5",
    title: "Heart Hands Breast / ハート手胸",
    file: "heart-hands-on-breast-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, heart hands on breast",
    triggerWords: "heart hands on breast"
  },
  {
    id: "pf-anime-breast-suckle",
    sourceModelId: "breast-suckle",
    animePositionId: "62463cd9-daf4-4e30-bc8a-3e00bb307006",
    title: "Breast Suckle / 授乳",
    file: "breast-suckle.jpeg",
    prompt: "masterpiece, best quality, 1girl, dbl_suck, lying on back, upside down, sucking breasts ",
    triggerWords: "dbl_suck, lying on back, upside down, sucking breasts "
  },
  {
    id: "pf-anime-goblin-hug",
    sourceModelId: "goblin-hug",
    animePositionId: "26eacd4d-a9d4-48b6-9166-bfa763e51804",
    title: "Goblin Hug / ゴブリン抱擁",
    file: "goblin-hug.jpeg",
    prompt: "masterpiece, best quality, 1girl, gyakuekibenn",
    triggerWords: "gyakuekibenn"
  },
  {
    id: "pf-anime-lotus-position-lora",
    sourceModelId: "lotus-position-lora",
    animePositionId: "b1d0e3b7-3e97-4b1d-86be-dffa6dbc6430",
    title: "Lotus Position / 蓮華座",
    file: "lotus-position-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, lotus position",
    triggerWords: "lotus position"
  },
  {
    id: "pf-anime-hentai-pussy-inspection-2shot-xl",
    sourceModelId: "hentai-pussy-inspection-2shot-xl",
    animePositionId: "b443300c-93a7-467b-bcc4-6cd812dae606",
    title: "Pussy Inspection 2-Shot / マンコ検査",
    file: "hentai-pussy-inspection-2shot-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, hpi2, 1 girl, full body, cowboy shot, Clothed girl and nude girl, Covered nipples, covered pussy, spread legs, spread_pussy, close up pussy, detailed pussy, detailed anus, pussy juice trail, pussy juice puddle, on bed,",
    triggerWords: "hpi2, 1 girl, full body, cowboy shot, Clothed girl and nude girl, Covered nipples, covered pussy, spread legs, spread_pussy, close up pussy, detailed pussy, detailed anus, pussy juice trail, pussy juice puddle, on bed,"
  },
  {
    id: "pf-anime-pov-ffm-threesome",
    sourceModelId: "pov-ffm-threesome",
    animePositionId: "7a8de17c-7f40-47db-bc18-89b0059d6ffd",
    title: "FFM Threesome / FFM 3P",
    file: "pov-ffm-threesome.jpeg",
    prompt: "masterpiece, best quality, 1girl, Pov ffm threesome, pov, 2girls, 1boy, ffm threesome,, (pov_facesitting.1.4), pov, (2girls:1.5), 1boy, multiple girls, ffm threesome, (from below:1.3), , (pov_pussy_sandwich, take your pick:1.4), breast press, pov, 2girls, multiple girls,1boy, on back, from behind, looking back, hugging, , top girl,, bottom girl,",
    triggerWords: "Pov ffm threesome, pov, 2girls, 1boy, ffm threesome,, (pov_facesitting.1.4), pov, (2girls:1.5), 1boy, multiple girls, ffm threesome, (from below:1.3), , (pov_pussy_sandwich, take your pick:1.4), breast press, pov, 2girls, multiple girls,1boy, on back, from behind, looking back, hugging, , top girl,, bottom girl,, Imminent_facesitting,, (pussy close-up:1.4), sitting on face, pussy on glass, , from above,, from below,, from behind, butt,, dutch angle,, imminent sex,, sex,, imminent anal sex,, anal sex,, cumming, creampie, ejaculation, trembling, cum overflow,, nipples,, licking man's nipple,, sucking man's nipple,, touching man's nipple,, fully clothed,, open clothes,, completely naked,, cleavage,, underboob,, breast grab,, butt grab,"
  },
  {
    id: "pf-anime-wrists-and-arms-grabbed-and-pulled-back-from-behin",
    sourceModelId: "wrists-and-arms-grabbed-and-pulled-back-from-behin",
    animePositionId: "fb39d428-0e0a-4a09-b12d-8af30c2475fc",
    title: "Arms Pulled Back / 腕後ろ引き",
    file: "wrists-and-arms-grabbed-and-pulled-back-from-behin.jpeg",
    prompt: "masterpiece, best quality, 1girl, rmgrb, arm grab, sex from behind, arm held back, holding another's wrist",
    triggerWords: "rmgrb, arm grab, sex from behind, arm held back, holding another's wrist"
  },
  {
    id: "pf-anime-paw-pose",
    sourceModelId: "paw-pose",
    animePositionId: "fe3ff379-bfac-4ba3-9a55-ebc24459942e",
    title: "Paw Pose / 雌犬ポーズ",
    file: "paw-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, paw pose",
    triggerWords: "paw pose"
  },
  {
    id: "pf-anime-goblin-rider-frog-embrace-position",
    sourceModelId: "goblin-rider-frog-embrace-position",
    animePositionId: "edf67c08-b04f-4461-a58b-933c17f1ae50",
    title: "Frog Embrace / 蛙抱き",
    file: "goblin-rider-frog-embrace-position.jpeg",
    prompt: "masterpiece, best quality, 1girl, assride, top-down bottom-up, sex from behind, size difference, goblin",
    triggerWords: "assride, top-down bottom-up, sex from behind, size difference, goblin"
  },
  {
    id: "pf-anime-dressing-socks-adjusting-legwear-sock-pull",
    sourceModelId: "dressing-socks-adjusting-legwear-sock-pull",
    animePositionId: "95e48bd5-4db1-4b8f-ae83-33594add911c",
    title: "Adjusting Legwear / 靴下直し",
    file: "dressing-socks-adjusting-legwear-sock-pull.jpeg",
    prompt: "masterpiece, best quality, 1girl, dressing socks, adjusting legwear",
    triggerWords: "dressing socks, adjusting legwear"
  },
  {
    id: "pf-anime-side-sitting-split-poses",
    sourceModelId: "side-sitting-split-poses",
    animePositionId: "9b04dd45-1d7f-40b4-ad3d-ed11287837bb",
    title: "Side Sitting Split / 横開脚",
    file: "side-sitting-split-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, <lora:side-sitting-split-illustriousxl-lora-nochekaiser:1>, side sitting split, sitting split, split, flexible, stretching, on floor, spread legs, yoga pants, sports bra, from behind, ass, looking back, looking at viewer,, <lora:side-sitting-split-illustriousxl-lora-nochekaiser:1>, side sitting split, sitting split, split, flexible, stretching, on floor, spread legs, yoga pants, sports bra, looking at viewer, navel",
    triggerWords: "<lora:side-sitting-split-illustriousxl-lora-nochekaiser:1>, side sitting split, sitting split, split, flexible, stretching, on floor, spread legs, yoga pants, sports bra, from behind, ass, looking back, looking at viewer,, <lora:side-sitting-split-illustriousxl-lora-nochekaiser:1>, side sitting split, sitting split, split, flexible, stretching, on floor, spread legs, yoga pants, sports bra, looking at viewer, navel"
  },
  {
    id: "pf-anime-hentai-pussy-inspection-xl",
    sourceModelId: "hentai-pussy-inspection-xl",
    animePositionId: "51570c7d-4cf7-4626-843d-665efa395e0c",
    title: "Pussy Inspection / マンコ検査",
    file: "hentai-pussy-inspection-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, Multiple layers, multiple views, simple bacground, Character Name:2, English TEXT:2,Character profile, radar chart,  close-up layer, close-up pussy, Full body layer, breasts out, breasts cutout , crotch cutout, no panties, torn clothes, breasts, nipples, pussy, fat mons, clitoris, gaping, erect clitoris, large CLITORIS, Clitoral hood, spread_pussy, Urethral,detailed pussy, gaping pussy, detailed anus,",
    triggerWords: "Multiple layers, multiple views, simple bacground, Character Name:2, English TEXT:2,Character profile, radar chart,  close-up layer, close-up pussy, Full body layer, breasts out, breasts cutout , crotch cutout, no panties, torn clothes, breasts, nipples, pussy, fat mons, clitoris, gaping, erect clitoris, large CLITORIS, Clitoral hood, spread_pussy, Urethral,detailed pussy, gaping pussy, detailed anus,"
  },
  {
    id: "pf-anime-public-exposure-embarrassed-uterus-drawing",
    sourceModelId: "public-exposure-embarrassed-uterus-drawing",
    animePositionId: "300a2227-9d1a-4d3e-9ec0-64dcb490b401",
    title: "Public Exposure / 露出",
    file: "public-exposure-embarrassed-uterus-drawing.jpeg",
    prompt: "masterpiece, best quality, 1girl, sittingspread, white socks, spread legs,pussy, nude,1girl,solo, 1girl,solo, standingarms, standing, on desk,nude,nsfw,school desk,full body,, sittingknees, nude,nsfw,, shockedface,embarrassed,, sittingcovering, 1girl, solo, nude, pussy, uncensored, breasts, short hair, covering,face,",
    triggerWords: "sittingspread, white socks, spread legs,pussy, nude,1girl,solo, 1girl,solo, standingarms, standing, on desk,nude,nsfw,school desk,full body,, sittingknees, nude,nsfw,, shockedface,embarrassed,, sittingcovering, 1girl, solo, nude, pussy, uncensored, breasts, short hair, covering,face,, embarrassedspreadpussy,1girl, solo, nude, naked, embarrassed, blush, on desk, indoors, filming, camera, digital camera,v,"
  },
  {
    id: "pf-anime-covering-crotch-covering-ass",
    sourceModelId: "covering-crotch-covering-ass",
    animePositionId: "f867c451-a21d-4ca4-8296-e5257b93bd9d",
    title: "Covering Crotch / 股間隠し",
    file: "covering-crotch-covering-ass.jpeg",
    prompt: "masterpiece, best quality, 1girl, covering crotch",
    triggerWords: "covering crotch"
  },
  {
    id: "pf-anime-reverse-upright-straddle-lora",
    sourceModelId: "reverse-upright-straddle-lora",
    animePositionId: "d80e8d68-7851-462f-acb4-2b48c2fc1c45",
    title: "Reverse Straddle / 背面跨ぎ",
    file: "reverse-upright-straddle-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, reverse upright straddle, reverse cowgirl position, sitting on person, sitting on lap, legs together, legs up, spread legs, wide spread legs, wide shot, full body, barefoot",
    triggerWords: "reverse upright straddle, reverse cowgirl position, sitting on person, sitting on lap, legs together, legs up, spread legs, wide spread legs, wide shot, full body, barefoot"
  },
  {
    id: "pf-anime-grab-hair-and-dangling",
    sourceModelId: "grab-hair-and-dangling",
    animePositionId: "4063d52d-5fe3-4602-9bc0-0fd789f0ad7a",
    title: "Grab Hair / 髪掴み",
    file: "grab-hair-and-dangling.jpeg",
    prompt: "masterpiece, best quality, 1girl, danglingpenis, dangling, lifting, different height, floating air, grab hair, grab,head grab",
    triggerWords: "danglingpenis, dangling, lifting, different height, floating air, grab hair, grab,head grab"
  },
  {
    id: "pf-anime-selfie-poses",
    sourceModelId: "selfie-poses",
    animePositionId: "bfe5180c-3667-491b-a262-eefe1ae0d9b0",
    title: "Selfie Pose / 自撮り",
    file: "selfie-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, <lora:selfie-v3-illustriousxl-lora-nochekaiser:1>, selfie, solo, looking at viewer, smile, navel, collarbone, upper body, sweat, indoors, midriff, v, selfie, monster, door, nervous, nervous smile, nervous sweat, dark,",
    triggerWords: "<lora:selfie-v3-illustriousxl-lora-nochekaiser:1>, selfie, solo, looking at viewer, smile, navel, collarbone, upper body, sweat, indoors, midriff, v, selfie, monster, door, nervous, nervous smile, nervous sweat, dark,"
  },
  {
    id: "pf-anime-on-stomach-from-side-poses",
    sourceModelId: "on-stomach-from-side-poses",
    animePositionId: "b4e61751-ea4c-499f-be59-8327527c99b1",
    title: "On Stomach Side / うつ伏せ横",
    file: "on-stomach-from-side-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, <lora:on-stomach-from-side-illustriousxl-lora-nochekaiser:1>, on stomach from side, on stomach, from side, on bed, pillow, pillow hug, looking at viewer, blush, parted bangs, ass, thighs, <lora:on-stomach-from-side-illustriousxl-lora-nochekaiser:1>, on stomach from side, on stomach, from side, on bed, pillow, pillow hug, looking at viewer, blush, parted bangs, ass, completely nude, thighs",
    triggerWords: "<lora:on-stomach-from-side-illustriousxl-lora-nochekaiser:1>, on stomach from side, on stomach, from side, on bed, pillow, pillow hug, looking at viewer, blush, parted bangs, ass, thighs, <lora:on-stomach-from-side-illustriousxl-lora-nochekaiser:1>, on stomach from side, on stomach, from side, on bed, pillow, pillow hug, looking at viewer, blush, parted bangs, ass, completely nude, thighs"
  },
  {
    id: "pf-anime-close-up-from-below",
    sourceModelId: "close-up-from-below",
    animePositionId: "202a04c6-890b-4c5f-ae33-ac1e88fe2b9d",
    title: "Close-up Below / 真下アングル",
    file: "close-up-from-below.jpeg",
    prompt: "masterpiece, best quality, 1girl,  close-up from below, from below",
    triggerWords: " close-up from below, from below"
  },
  {
    id: "pf-anime-yandere-trance-poses",
    sourceModelId: "yandere-trance-poses",
    animePositionId: "b8d6fa24-534e-4b63-8726-a9bff5c11e3b",
    title: "Yandere Trance / ヤンデレ恍惚",
    file: "yandere-trance-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, <lora:yandere-trance-illustriousxl-lora-nochekaiser:1>, yandere trance, yandere, hands on own cheeks, hands on own face, crazy eyes, crazy smile, crazy, heart-shaped pupils, glowing eyes, symbol-shaped pupils, hand on own face, open mouth, glowing, blush, looking at viewer,",
    triggerWords: "<lora:yandere-trance-illustriousxl-lora-nochekaiser:1>, yandere trance, yandere, hands on own cheeks, hands on own face, crazy eyes, crazy smile, crazy, heart-shaped pupils, glowing eyes, symbol-shaped pupils, hand on own face, open mouth, glowing, blush, looking at viewer,"
  },
  {
    id: "pf-anime-ffmm-foursome-poses-symmetrical-doggy-missionary",
    sourceModelId: "ffmm-foursome-poses-symmetrical-doggy-missionary",
    animePositionId: "cb814cdc-bef2-4b5f-9833-227562ee8f23",
    title: "FFMM Foursome / 4P",
    file: "ffmm-foursome-poses-symmetrical-doggy-missionary.jpeg",
    prompt: "masterpiece, best quality, 1girl, FFMMDM-V1.1+kiss, kiss, kissing, bisexual female, , FFMMDM-V1.1, ffmm foursome, group sex, 2girls, 2boys, missionarry position, lying on back, symmetrical docking,",
    triggerWords: "FFMMDM-V1.1+kiss, kiss, kissing, bisexual female, , FFMMDM-V1.1, ffmm foursome, group sex, 2girls, 2boys, missionarry position, lying on back, symmetrical docking,"
  },
  {
    id: "pf-anime-fellatio-below-veiwer",
    sourceModelId: "fellatio-below-veiwer",
    animePositionId: "bf9dceb7-14a8-4dc7-888b-8e4e67b07b65",
    title: "Fellatio Below / ローアングルフェラ",
    file: "fellatio-below-veiwer.jpeg",
    prompt: "masterpiece, best quality, 1girl, fellatio below viewer, 1girl, 1boy, penis, oral, fellatio",
    triggerWords: "fellatio below viewer, 1girl, 1boy, penis, oral, fellatio"
  },
  {
    id: "pf-anime-the-pose-poses",
    sourceModelId: "the-pose-poses",
    animePositionId: "35b21863-c50b-4e0f-97e8-63bbdaf5ee99",
    title: "The Pose / ザ・ポーズ",
    file: "the-pose-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, <lora:the-pose-illustriousxl-lora-nochekaiser:1>, the pose, on stomach, feet up, lying, soles, feet, legs up, head rest, barefoot, cleavage, ass, looking at viewer, smile, blush,, <lora:the-pose-illustriousxl-lora-nochekaiser:1>, the pose, on stomach, feet up, lying, soles, feet, legs up, head rest, barefoot, ass, from behind, looking back, looking at viewer, smile, blush,, <lora:the-pose-illustriousxl-lora-nochekaiser:1>, the pose, on stomach, feet up, lying, soles, feet, legs up, head rest, barefoot, from side, looking at viewer, ass, smile, blush, sideboob",
    triggerWords: "<lora:the-pose-illustriousxl-lora-nochekaiser:1>, the pose, on stomach, feet up, lying, soles, feet, legs up, head rest, barefoot, cleavage, ass, looking at viewer, smile, blush,, <lora:the-pose-illustriousxl-lora-nochekaiser:1>, the pose, on stomach, feet up, lying, soles, feet, legs up, head rest, barefoot, ass, from behind, looking back, looking at viewer, smile, blush,, <lora:the-pose-illustriousxl-lora-nochekaiser:1>, the pose, on stomach, feet up, lying, soles, feet, legs up, head rest, barefoot, from side, looking at viewer, ass, smile, blush, sideboob"
  },
  {
    id: "pf-anime-face-fuck",
    sourceModelId: "face-fuck",
    animePositionId: "f0136a73-285b-4ec7-b022-3246cd831763",
    title: "Face Fuck / イラマチオ",
    file: "face-fuck.jpeg",
    prompt: "masterpiece, best quality, 1girl, B_Face fuck",
    triggerWords: "B_Face fuck"
  },
  {
    id: "pf-anime-spraying-cum-from-pussy",
    sourceModelId: "spraying-cum-from-pussy",
    animePositionId: "46589fd5-2ebe-4575-8b62-0b3c1a7f57d8",
    title: "Pussy Cum Spray / マンコ噴射",
    file: "spraying-cum-from-pussy.jpeg",
    prompt: "masterpiece, best quality, 1girl, Burstcum, Belly inflation, liquid retention, release, pussy expulsion,   Cum gushing, cum spraying from pussy, intense pressure release, fluid jet,   visible spray arc, fluid escaping,   Pussy wide open, residual dripping, dripping liquid",
    triggerWords: "Burstcum, Belly inflation, liquid retention, release, pussy expulsion,   Cum gushing, cum spraying from pussy, intense pressure release, fluid jet,   visible spray arc, fluid escaping,   Pussy wide open, residual dripping, dripping liquid"
  },
  {
    id: "pf-anime-standing-leg-hug-sex",
    sourceModelId: "standing-leg-hug-sex",
    animePositionId: "ef98b317-1ee4-4ecf-938f-94c89abfc582",
    title: "Standing Leg Hug / 立ち脚抱えSEX",
    file: "standing-leg-hug-sex.jpeg",
    prompt: "masterpiece, best quality, 1girl, leglocksex01, leg lock, standing, penis, hug",
    triggerWords: "leglocksex01, leg lock, standing, penis, hug"
  },
  {
    id: "pf-anime-views-of-the-deepthroated",
    sourceModelId: "views-of-the-deepthroated",
    animePositionId: "33e9a0a9-7a63-4a72-b143-a59820065040",
    title: "Deepthroat Views / ディープスロート",
    file: "views-of-the-deepthroated.jpeg",
    prompt: "masterpiece, best quality, 1girl, deepthroating viewed from above, deepthroating viewed from side, deepthroating viewed from below, full face blush, throat bulge",
    triggerWords: "deepthroating viewed from above, deepthroating viewed from side, deepthroating viewed from below, full face blush, throat bulge"
  },
  {
    id: "pf-anime-legs-lock-with-variants",
    sourceModelId: "legs-lock-with-variants",
    animePositionId: "3bbeef44-771e-4ba4-8d48-7c7867564eae",
    title: "Legs Lock / 脚ロック",
    file: "legs-lock-with-variants.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1girl, 1boy, hetero, sex,, mating press, leg lock, legs lock, boy on top,, upright straddle, leg lock, legs lock, girl on top,, lying,, sitting,",
    triggerWords: "1girl, 1boy, hetero, sex,, mating press, leg lock, legs lock, boy on top,, upright straddle, leg lock, legs lock, girl on top,, lying,, sitting,, standing,, kiss, kissing,"
  },
  {
    id: "pf-anime-over-the-edge-blowjob",
    sourceModelId: "over-the-edge-blowjob",
    animePositionId: "34c1e6a6-7e7c-4736-a22a-2cad3876b935",
    title: "Over Edge BJ / 端フェラ",
    file: "over-the-edge-blowjob.jpeg",
    prompt: "masterpiece, best quality, 1girl, on back, oral, fellatio, penis, 1girl, 1boy, lying, on bed,  upside-down",
    triggerWords: "on back, oral, fellatio, penis, 1girl, 1boy, lying, on bed,  upside-down"
  },
  {
    id: "pf-anime-2fspreadanus-pose-lora-anima-and-ai-xl-and-xl",
    sourceModelId: "2fspreadanus-pose-lora-anima-and-ai-xl-and-xl",
    animePositionId: "41a3c46d-6946-412a-b19e-9763ff259cf8",
    title: "Spread Anus / アナル開き",
    file: "2fspreadanus-pose-lora-anima-and-ai-xl-and-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, spread anus, 2f",
    triggerWords: "spread anus, 2f"
  },
  {
    id: "pf-anime-penis-on-cheek",
    sourceModelId: "penis-on-cheek",
    animePositionId: "223f18b4-35cf-4ccf-a779-3f2ffa71404a",
    title: "Penis on Cheek / 頬にペニス",
    file: "penis-on-cheek.jpeg",
    prompt: "masterpiece, best quality, 1girl, pen1s_0n_cheek",
    triggerWords: "pen1s_0n_cheek"
  },
  {
    id: "pf-anime-female-masturbation",
    sourceModelId: "female-masturbation",
    animePositionId: "eea45400-6679-4769-841a-8587ea6a1e36",
    title: "Female Masturbation / 女性オナニー",
    file: "female-masturbation.jpeg",
    prompt: "masterpiece, best quality, 1girl, female masturbation,, motion lines,, sensation indicator,, trembling,, masturbation through panties,",
    triggerWords: "female masturbation,, motion lines,, sensation indicator,, trembling,, masturbation through panties,, water masturbation, shower_head, holding_shower_head,, object insertion, dildo grab,, vaginal, vaginal object insertion, vaginal <object> insertion,, anal, anal object insertion, anal<object> insertion,"
  },
  {
    id: "pf-anime-casting-couch-pose",
    sourceModelId: "casting-couch-pose",
    animePositionId: "532f5e4a-46f1-4880-81bf-e6142cde7696",
    title: "Casting Couch / キャスティングカウチ",
    file: "casting-couch-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, casting couch",
    triggerWords: "casting couch"
  },
  {
    id: "pf-anime-arm-hug-holding-another-s-arm",
    sourceModelId: "arm-hug-holding-another-s-arm",
    animePositionId: "2aef6e96-c7c7-46c3-bddd-ff83fa2bd748",
    title: "Arm Hug / 腕組み",
    file: "arm-hug-holding-another-s-arm.jpeg",
    prompt: "masterpiece, best quality, 1girl, arm hug",
    triggerWords: "arm hug"
  },
  {
    id: "pf-anime-pose-from-above-head-top-view",
    sourceModelId: "pose-from-above-head-top-view",
    animePositionId: "770e7f43-8894-4a72-a0e7-ce9a0ce98183",
    title: "From Above / 頭上視点",
    file: "pose-from-above-head-top-view.jpeg",
    prompt: "masterpiece, best quality, 1girl, from above, perspective",
    triggerWords: "from above, perspective"
  },
  {
    id: "pf-anime-hum-iating-dance",
    sourceModelId: "hum-iating-dance",
    animePositionId: "32eeb081-aee6-4632-969f-5fd378da78dc",
    title: "Humiliating Dance / 裸踊り",
    file: "hum-iating-dance.jpeg",
    prompt: "masterpiece, best quality, 1girl, hadakaodori, spread legs, arm up, standing, dancing, , standing on one leg, open hands,, covering crotch,, holding fan,, holding plate,",
    triggerWords: "hadakaodori, spread legs, arm up, standing, dancing, , standing on one leg, open hands,, covering crotch,, holding fan,, holding plate,, public indecency, crowd,, bouncing breasts, motion lines,"
  },
  {
    id: "pf-anime-pose-bdsm-on-bed",
    sourceModelId: "pose-bdsm-on-bed",
    animePositionId: "ad827be9-4aa2-4707-92d0-02ef3f9de5f7",
    title: "BDSM on Bed / ベッド拘束",
    file: "pose-bdsm-on-bed.jpeg",
    prompt: "masterpiece, best quality, 1girl, mai_bdsm_spread_on_bed, lying, on_back, outstretched_limbs",
    triggerWords: "mai_bdsm_spread_on_bed, lying, on_back, outstretched_limbs"
  },
  {
    id: "pf-anime-mating-press-position-lora",
    sourceModelId: "mating-press-position-lora",
    animePositionId: "c4bfa977-f050-4b86-a266-bbe2addaebfe",
    title: "Mating Press / 種付けプレス",
    file: "mating-press-position-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, mating press, leg lock, legs around waist, arms around neck",
    triggerWords: "mating press, leg lock, legs around waist, arms around neck"
  },
  {
    id: "pf-anime-choke-head-lock-sex",
    sourceModelId: "choke-head-lock-sex",
    animePositionId: "60a5c15e-9661-4d0a-add6-44cd360d4e18",
    title: "Chokehold Sex / 首絞めSEX",
    file: "choke-head-lock-sex.jpeg",
    prompt: "masterpiece, best quality, 1girl, choke, headlock,sex,lying down, standing, kneeling, sitting, straddle",
    triggerWords: "choke, headlock,sex,lying down, standing, kneeling, sitting, straddle"
  },
  {
    id: "pf-anime-closeup-facial-poses-lus",
    sourceModelId: "closeup-facial-poses-lus",
    animePositionId: "28545194-4173-4d54-ab6d-a6a7e1b75c68",
    title: "Closeup Facial / 顔射クローズアップ",
    file: "closeup-facial-poses-lus.jpeg",
    prompt: "masterpiece, best quality, 1girl, Closeup Facial",
    triggerWords: "Closeup Facial"
  },
  {
    id: "pf-anime-selfie-poses-big-ass",
    sourceModelId: "selfie-poses-big-ass",
    animePositionId: "c4a3aa3b-fa78-4824-bf22-60faa410c255",
    title: "Selfie Big Ass / 自撮りデカ尻",
    file: "selfie-poses-big-ass.jpeg",
    prompt: "masterpiece, best quality, 1girl, sp-ass",
    triggerWords: "sp-ass"
  },
  {
    id: "pf-anime-jav-company-uncensored-redcraft",
    sourceModelId: "jav-company-uncensored-redcraft",
    animePositionId: "ebbb243e-0b6a-4367-ba4c-716384336e05",
    title: "JAV Uncensored / 無修正",
    file: "jav-company-uncensored-redcraft.jpeg",
    prompt: "masterpiece, best quality, 1girl, JAV_CIVILHOT",
    triggerWords: "JAV_CIVILHOT"
  },
  {
    id: "pf-anime-hand-on-hip-lying-on-elbow-xl",
    sourceModelId: "hand-on-hip-lying-on-elbow-xl",
    animePositionId: "7f75cc1f-f39f-4b68-86b7-07703aed039c",
    title: "Hand on Hip Lying / 肘つきポーズ",
    file: "hand-on-hip-lying-on-elbow-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, hand on hip, hand on own hip, hand on own thigh,  lying, lying on side, on side, head rest on elbow, arm support, ",
    triggerWords: "hand on hip, hand on own hip, hand on own thigh,  lying, lying on side, on side, head rest on elbow, arm support, "
  },
  {
    id: "pf-anime-overflow-vomit-cum",
    sourceModelId: "overflow-vomit-cum",
    animePositionId: "fb638b62-52c2-46cc-9763-6bb586b8193c",
    title: "Overflow Cum / 精液溢れ",
    file: "overflow-vomit-cum.jpeg",
    prompt: "masterpiece, best quality, 1girl, afterfella01, cum in nose, cum in mouth, vomit, cum, overflow, penis, crying, grab head",
    triggerWords: "afterfella01, cum in nose, cum in mouth, vomit, cum, overflow, penis, crying, grab head"
  },
  {
    id: "pf-anime-standing-split",
    sourceModelId: "standing-split",
    animePositionId: "bd24b9e7-a500-481c-9c5d-8977d8821cd6",
    title: "Standing Split / 片足立ち",
    file: "standing-split.jpeg",
    prompt: "masterpiece, best quality, 1girl, standing split",
    triggerWords: "standing split"
  },
  {
    id: "pf-anime-finger-sucking-nsfw-porn-pov",
    sourceModelId: "finger-sucking-nsfw-porn-pov",
    animePositionId: "8c5b4e65-ca91-4b4e-9611-5f87f5567d76",
    title: "Finger Sucking / 指しゃぶり",
    file: "finger-sucking-nsfw-porn-pov.jpeg",
    prompt: "masterpiece, best quality, 1girl, finger_sucking, pov, pov hand, male hand, dark-skinned male, pout, pouty lips, empty eyes, half-closed eyes, nude, blush, sweat, drool, saliva, drooling, finger in another's mouth, finger in mouth, upper body",
    triggerWords: "finger_sucking, pov, pov hand, male hand, dark-skinned male, pout, pouty lips, empty eyes, half-closed eyes, nude, blush, sweat, drool, saliva, drooling, finger in another's mouth, finger in mouth, upper body"
  },
  {
    id: "pf-anime-hold-person-magic",
    sourceModelId: "hold-person-magic",
    animePositionId: "72bb4ced-9c24-41a3-a312-b539a60afa0c",
    title: "Hold Person Magic / 魔法拘束",
    file: "hold-person-magic.jpeg",
    prompt: "masterpiece, best quality, 1girl, Hold_person, aura form body , square magic, chain, magic chain, ",
    triggerWords: "Hold_person, aura form body , square magic, chain, magic chain, "
  },
  {
    id: "pf-anime-absurd-bulge",
    sourceModelId: "absurd-bulge",
    animePositionId: "3cab05ad-efd3-4cae-ac7f-f66747ae32ec",
    title: "Absurd Bulge / 異常膨張",
    file: "absurd-bulge.jpeg",
    prompt: "masterpiece, best quality, 1girl, absurdbulge01,bulge,stomach deformation, cock shape bulge, extremely bulge, absurd bulge, pussy, penis,deep bulge, massive bulge, huge bulge",
    triggerWords: "absurdbulge01,bulge,stomach deformation, cock shape bulge, extremely bulge, absurd bulge, pussy, penis,deep bulge, massive bulge, huge bulge"
  },
  {
    id: "pf-anime-deepthroat-girl-lying",
    sourceModelId: "deepthroat-girl-lying",
    animePositionId: "7cc041a6-1bf2-454f-b15f-9ff91bbbe974",
    title: "Deepthroat Lying / 寝フェラ",
    file: "deepthroat-girl-lying.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1boy, lying on floor,penis,deepthroat,face_deepthroat,oral,fellatio,",
    triggerWords: "1boy, lying on floor,penis,deepthroat,face_deepthroat,oral,fellatio,"
  },
  {
    id: "pf-anime-six-nine-position",
    sourceModelId: "six-nine-position",
    animePositionId: "7b7fb5c6-3a17-4ce6-98ba-c4b78fb08e78",
    title: "69 Position / シックスナイン",
    file: "six-nine-position.jpeg",
    prompt: "masterpiece, best quality, 1girl, six-nine-position, 1boy and 1girl, 69, handjob, oral, fellatio, boy lying, on back,testicles, girl on top,cunnilingus,,",
    triggerWords: "six-nine-position, 1boy and 1girl, 69, handjob, oral, fellatio, boy lying, on back,testicles, girl on top,cunnilingus,,"
  },
  {
    id: "pf-anime-cowgirl-irrumatio",
    sourceModelId: "cowgirl-irrumatio",
    animePositionId: "68a75b23-ef6a-4a81-9446-0b645cf092c0",
    title: "Cowgirl Irrumatio / 騎乗位イラマ",
    file: "cowgirl-irrumatio.jpeg",
    prompt: "masterpiece, best quality, 1girl, cowgirl_deepthroat_ill,cowgirl_deepthroat_ill, group sex, nude, hetero, mmf threesome, 2boys, oral, sex, penis, fellatio, straddling, ass grab,(irrumatio:1.2),deepthroat,",
    triggerWords: "cowgirl_deepthroat_ill,cowgirl_deepthroat_ill, group sex, nude, hetero, mmf threesome, 2boys, oral, sex, penis, fellatio, straddling, ass grab,(irrumatio:1.2),deepthroat,"
  },
  {
    id: "pf-anime-harem-throne-king-of-the-harem",
    sourceModelId: "harem-throne-king-of-the-harem",
    animePositionId: "e722000f-ad9b-4aab-8b2c-3d9b8672b090",
    title: "Harem Throne / ハーレム王座",
    file: "harem-throne-king-of-the-harem.jpeg",
    prompt: "masterpiece, best quality, 1girl, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, fellatio, cooperative fellatio, blowjob,, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, hand job, holding penis, cumshot, projectile cum, cumshot,, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, cowgirl sex, sexy back, penetration, facing away, perfect ass, huge creampie, excessive cum,, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, cooperative paizuri, large breasts, paizuri, titjob,",
    triggerWords: "haremthrone, sitting on lap, sitting on throne, multiple girls, harem, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, fellatio, cooperative fellatio, blowjob,, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, hand job, holding penis, cumshot, projectile cum, cumshot,, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, cowgirl sex, sexy back, penetration, facing away, perfect ass, huge creampie, excessive cum,, haremthrone, sitting on lap, sitting on throne, multiple girls, harem, cooperative paizuri, large breasts, paizuri, titjob,"
  },
  {
    id: "pf-anime-ffm-nursing-handjob",
    sourceModelId: "ffm-nursing-handjob",
    animePositionId: "a341e339-1f60-44ed-a6a0-b0361bcc5731",
    title: "FFM Nursing HJ / FFM授乳手コキ",
    file: "ffm-nursing-handjob.jpeg",
    prompt: "masterpiece, best quality, 1girl, ffmNursingHandjob,2girls,1boy,breastfeeding,cooperative handjob,nursing handjob,, grabbing another's breast,, huge breasts,",
    triggerWords: "ffmNursingHandjob,2girls,1boy,breastfeeding,cooperative handjob,nursing handjob,, grabbing another's breast,, huge breasts,"
  },
  {
    id: "pf-anime-blacked-lying-blowjob",
    sourceModelId: "blacked-lying-blowjob",
    animePositionId: "fd5400fb-fa19-4fa8-860b-3f24a4c1876b",
    title: "Lying Blowjob / 寝フェラ",
    file: "blacked-lying-blowjob.jpeg",
    prompt: "masterpiece, best quality, 1girl, BLAYING, Lying Male, Back of Male Head",
    triggerWords: "BLAYING, Lying Male, Back of Male Head"
  },
  {
    id: "pf-anime-nipple-sucking-handjob",
    sourceModelId: "nipple-sucking-handjob",
    animePositionId: "74e8ed43-6bb5-4767-9acb-2a3c5f156ad5",
    title: "Nipple Suck HJ / 乳首舐め手コキ",
    file: "nipple-sucking-handjob.jpeg",
    prompt: "masterpiece, best quality, 1girl, mmm, sucking Handjob, sucking nipple, cooperative handjob, nursing handjob, sitting on ground,, 1boy: large penis, receiving handjob,, 2boys: sucking nipples, giving handjo",
    triggerWords: "mmm, sucking Handjob, sucking nipple, cooperative handjob, nursing handjob, sitting on ground,, 1boy: large penis, receiving handjob,, 2boys: sucking nipples, giving handjo"
  },
  {
    id: "pf-anime-nursing-blowjob",
    sourceModelId: "nursing-blowjob",
    animePositionId: "b14ad3cc-e20c-4ebe-970d-d41b6b6743f9",
    title: "Nursing Blowjob / 授乳フェラ",
    file: "nursing-blowjob.jpeg",
    prompt: "masterpiece, best quality, 1girl, nrsbl, nursing handjob, blowjob, 2boys, duo, male focus,",
    triggerWords: "nrsbl, nursing handjob, blowjob, 2boys, duo, male focus,"
  },
  {
    id: "pf-anime-underwear-masturbation-pantyjob-thong-handjob",
    sourceModelId: "underwear-masturbation-pantyjob-thong-handjob",
    animePositionId: "1d22520a-e0da-4430-9914-0fbab6d58683",
    title: "Pantyjob / パンティジョブ",
    file: "underwear-masturbation-pantyjob-thong-handjob.jpeg",
    prompt: "masterpiece, best quality, 1girl, thong, Hand over underwear, see-through thong, hand over transparent thong, masturbating, large erection bulge, handjob, masturbation, one hand holding bulge,",
    triggerWords: "thong, Hand over underwear, see-through thong, hand over transparent thong, masturbating, large erection bulge, handjob, masturbation, one hand holding bulge,"
  },
  {
    id: "pf-anime-oral-gangbang",
    sourceModelId: "oral-gangbang",
    animePositionId: "8c07f078-5526-469f-80d6-0ccc2d0e21b4",
    title: "Oral Gangbang / 口輪姦",
    file: "oral-gangbang.jpeg",
    prompt: "masterpiece, best quality, 1girl, above view, view from above, hand on her head, 2d, 1girl, solo, blonde hair, long hair, runny makeup, necklace, choker, earrings, pale-skinned female, nude female, bare breasts, nipples, interracial, multiple males, multiple dicks, dark-skinned males, dark-skinned dicks, big dicks, big testicles, gangbang, oral, fellatio, handjob, excessive cum, cum in her mouth, cum strings, nude males, naked males,",
    triggerWords: "above view, view from above, hand on her head, 2d, 1girl, solo, blonde hair, long hair, runny makeup, necklace, choker, earrings, pale-skinned female, nude female, bare breasts, nipples, interracial, multiple males, multiple dicks, dark-skinned males, dark-skinned dicks, big dicks, big testicles, gangbang, oral, fellatio, handjob, excessive cum, cum in her mouth, cum strings, nude males, naked males,"
  },
  {
    id: "pf-anime-titfuck-fellatio",
    sourceModelId: "titfuck-fellatio",
    animePositionId: "0d69fee0-d396-491b-b9dc-b5dc635cda50",
    title: "Titfuck Fellatio / パイズリフェラ",
    file: "titfuck-fellatio.jpeg",
    prompt: "masterpiece, best quality, 1girl, titfuck_fellatio,fellatio, paizuri, penis,breasts squeezed together,oral,1boy,, cum,facial,excessive cum,bukkake,",
    triggerWords: "titfuck_fellatio,fellatio, paizuri, penis,breasts squeezed together,oral,1boy,, cum,facial,excessive cum,bukkake,"
  },
  {
    id: "pf-anime-titfuck-and-hot-dogging",
    sourceModelId: "titfuck-and-hot-dogging",
    animePositionId: "6cbea5d0-6e43-404c-a735-4458d5834069",
    title: "Titfuck & Hot Dogging / パイズリ＆尻コキ",
    file: "titfuck-and-hot-dogging.jpeg",
    prompt: "masterpiece, best quality, 1girl, (hot dogging and paizuri:1.2), paizuri, hot dogging, collaborative, cooperative, buttjob, titfuck, breasts, butt",
    triggerWords: "(hot dogging and paizuri:1.2), paizuri, hot dogging, collaborative, cooperative, buttjob, titfuck, breasts, butt"
  },
  {
    id: "pf-anime-pov-throat-grab",
    sourceModelId: "pov-throat-grab",
    animePositionId: "b542215d-717a-4058-9d5b-fee04d8b0dfd",
    title: "POV Throat Grab / 首絞めPOV",
    file: "pov-throat-grab.jpeg",
    prompt: "masterpiece, best quality, 1girl, POV_throatgrab, pov choking, pov throat lift, approaching",
    triggerWords: "POV_throatgrab, pov choking, pov throat lift, approaching"
  },
  {
    id: "pf-anime-civitai-pov-pov-sex-from-behind-c",
    sourceModelId: "civitai-pov-pov-sex-from-behind-c",
    animePositionId: "78cdedfc-7309-495d-8bec-cd985ea4d9ea",
    title: "POV Sex From Behind / 背面騎乗位",
    file: "civitai-pov-pov-sex-from-behind-c.jpeg",
    prompt: "masterpiece, best quality, 1girl, bf-dp, sex, sex from behind, deep penetration, kupaa",
    triggerWords: "bf-dp, sex, sex from behind, deep penetration, kupaa, looking at viewer, looking back, grabbing another's ass, straddling, from behind, back, groping, backboob, girl on top, hands on ass, front and back, spread anus, spread anal, nsfw, beautiful anus"
  },
  {
    id: "pf-anime-cowgirl-position-sex-non-pov-third-person",
    sourceModelId: "cowgirl-position-sex-non-pov-third-person",
    animePositionId: "3aefc432-a336-409f-96c6-098e3b7123fa",
    title: "Cowgirl Third Person / 三人称騎乗位",
    file: "cowgirl-position-sex-non-pov-third-person.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1boy, sex, cowgirl position, girl on top, straddling",
    triggerWords: "1boy, sex, cowgirl position, girl on top, straddling"
  },
  {
    id: "pf-anime-lotus-position",
    sourceModelId: "lotus-position",
    animePositionId: "c900607f-c297-48d8-8364-baf154c95515",
    title: "Lotus Position / 蓮華座",
    file: "lotus-position.jpeg",
    prompt: "masterpiece, best quality, 1girl, LOPV1.0, lotus position, sitting on person, sitting on lap, straddling",
    triggerWords: "LOPV1.0, lotus position, sitting on person, sitting on lap, straddling, upright straddle"
  },
  {
    id: "pf-anime-third-person-cowgirl-xl",
    sourceModelId: "third-person-cowgirl-xl",
    animePositionId: "e4f6a219-3fdf-4d13-83f1-29d9270a1fd6",
    title: "Third Person Cowgirl / 三人称騎乗位",
    file: "third-person-cowgirl-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, cowgirl position, sex, girl on top, straddling,",
    triggerWords: "cowgirl position, sex, girl on top, straddling,"
  },
  {
    id: "pf-anime-lying-cowgirl-position",
    sourceModelId: "lying-cowgirl-position",
    animePositionId: "333aa6d9-238f-4444-8add-3342c8f5c09e",
    title: "Lying Cowgirl / 寝騎乗位",
    file: "lying-cowgirl-position.jpeg",
    prompt: "masterpiece, best quality, 1girl, from behind, cowgirl position, vaginal, deep penetration, straddling, penis, testicles, girl on top, lying, sex, ass focus, anus, pussy juice, barefoot, soles,, motion lines,, huge ass",
    triggerWords: "from behind, cowgirl position, vaginal, deep penetration, straddling, penis, testicles, girl on top, lying, sex, ass focus, anus, pussy juice, barefoot, soles,, motion lines,, huge ass"
  },
  {
    id: "pf-anime-upright-straddle-sex-front-view",
    sourceModelId: "upright-straddle-sex-front-view",
    animePositionId: "06c07919-d24d-4486-8885-afe5f439fa1f",
    title: "Upright Straddle / 正面対面座位",
    file: "upright-straddle-sex-front-view.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1boy, upright straddle, straddling, girl on top, sitting",
    triggerWords: "1boy, upright straddle, straddling, girl on top, sitting"
  },
  {
    id: "pf-anime-lamia-draconcopode-body-sex",
    sourceModelId: "lamia-draconcopode-body-sex",
    animePositionId: "b03e79ba-6a1f-461b-a04a-56d88953ddb7",
    title: "Lamia Body Sex / ラミア",
    file: "lamia-draconcopode-body-sex.jpeg",
    prompt: "masterpiece, best quality, 1girl, Lamia Sex, Coiled, Straddling, Femdom, Lying",
    triggerWords: "Lamia Sex, Coiled, Straddling, Femdom, Lying, cross-section, Male pov"
  },
  {
    id: "pf-anime-nutty-peony",
    sourceModelId: "nutty-peony",
    animePositionId: "52c3c8ef-48a7-4513-9ac0-6f1586a4d65e",
    title: "Nutty Peony / 乱れ牡丹",
    file: "nutty-peony.jpeg",
    prompt: "masterpiece, best quality, 1girl, NuttyPeony,hold her legs,lap_sitting,straddling,, deflortation,, thick thighs,",
    triggerWords: "NuttyPeony,hold her legs,lap_sitting,straddling,, deflortation,, thick thighs,"
  },
  {
    id: "pf-anime-double-cowgirl-position-pose-xl-lora",
    sourceModelId: "double-cowgirl-position-pose-xl-lora",
    animePositionId: "29f988e2-b97a-4104-bf40-0f88d314cda8",
    title: "Double Cowgirl / ダブル騎乗位",
    file: "double-cowgirl-position-pose-xl-lora.jpeg",
    prompt: "masterpiece, best quality, 1girl, masterpiece,best quality,good quality,newest, anime coloring,, 2girls,1boy, indoors,bed,bedroom,on bed, anime screencap, double cowgirl position, multiple girls,breasts,group sex,nude,ffm threesome,threesome,straddling,sex,girl on top,hetero,oral,yuri kiss,cowgirl position,cunnilingus,sitting on face,lying,on back,bisexual female,vaginal,sitting,sitting on person,ass,ass grab,arched back,arm support,from side,bed sheet,pubic hair,penis,faceless,french kiss,faceless male,reverse cowgirl position,kneeling,sex from behind,happy sex,head back,profile,looking at another,feet,thighs,signature,chromatic aberration,pussy,couple,uncensored,toes,collarbone,, ******Negative prompts******, lowres,worst quality,bad quality,bad anatomy,sketch,jpeg artifacts,signature,watermark,",
    triggerWords: "masterpiece,best quality,good quality,newest, anime coloring,, 2girls,1boy, indoors,bed,bedroom,on bed, anime screencap, double cowgirl position, multiple girls,breasts,group sex,nude,ffm threesome,threesome,straddling,sex,girl on top,hetero,oral,yuri kiss,cowgirl position,cunnilingus,sitting on face,lying,on back,bisexual female,vaginal,sitting,sitting on person,ass,ass grab,arched back,arm support,from side,bed sheet,pubic hair,penis,faceless,french kiss,faceless male,reverse cowgirl position,kneeling,sex from behind,happy sex,head back,profile,looking at another,feet,thighs,signature,chromatic aberration,pussy,couple,uncensored,toes,collarbone,, ******Negative prompts******, lowres,worst quality,bad quality,bad anatomy,sketch,jpeg artifacts,signature,watermark,"
  },
  {
    id: "pf-anime-holding-the-bird",
    sourceModelId: "holding-the-bird",
    animePositionId: "ccd99442-64be-4955-b4df-20ca766049b6",
    title: "Holding the Bird / 抱えどり",
    file: "holding-the-bird.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1girl,1boy,sex from behind,straddling,lap sitting,arched back,underarm hold,HoldingTheBird,spread arms,breasts,",
    triggerWords: "1girl,1boy,sex from behind,straddling,lap sitting,arched back,underarm hold,HoldingTheBird,spread arms,breasts,"
  },
  {
    id: "pf-anime-dog-pose",
    sourceModelId: "dog-pose",
    animePositionId: "93fa5f09-ba68-43d4-bf99-98aad8273f0b",
    title: "Dog Pose / 犬ポーズ",
    file: "dog-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, dogpose,, paw pose,, squatting,, all fours,, leg lift,",
    triggerWords: "dogpose,, paw pose,, squatting,, all fours,, leg lift,, leash,"
  },
  {
    id: "pf-anime-one-leg-up-all-fours-pose",
    sourceModelId: "one-leg-up-all-fours-pose",
    animePositionId: "c546c6d7-8a0e-41e4-83ef-c7dd4ef5b5e2",
    title: "One Leg Up All Fours / 片足四つん這い",
    file: "one-leg-up-all-fours-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, front-spreading pose, all fours, crawling, one leg up, spread legs, from side, behind-spreading pose, ass, all fours, crawling, one leg up, spread legs, from side, anal tail, butt plug, fake dog ears, fake dog tail",
    triggerWords: "front-spreading pose, all fours, crawling, one leg up, spread legs, from side, behind-spreading pose, ass, all fours, crawling, one leg up, spread legs, from side, anal tail, butt plug, fake dog ears, fake dog tail"
  },
  {
    id: "pf-anime-effort-effort-meme-pose-ai",
    sourceModelId: "effort-effort-meme-pose-ai",
    animePositionId: "e4a0ed8e-4011-4c14-aecd-ae6afb7915cb",
    title: "effort effort (meme エッホエッホ) / Pose / AI",
    file: "effort-effort-meme-pose-ai.jpeg",
    prompt: "masterpiece, best quality, 1girl, effort effort",
    triggerWords: "effort effort"
  },
  {
    id: "pf-anime-shoulder-mount-cunn-ingus",
    sourceModelId: "shoulder-mount-cunn-ingus",
    animePositionId: "3bbd3b0f-2bbd-48f5-ac3b-2b14be365f71",
    title: "Shoulder Cunnilingus / 肩車クンニ",
    file: "shoulder-mount-cunn-ingus.jpeg",
    prompt: "masterpiece, best quality, 1girl, shouldermountcunnilingus, feet over shoulders, leaning back, knees",
    triggerWords: "shouldermountcunnilingus, feet over shoulders, leaning back, knees"
  },
  {
    id: "pf-anime-ffm-threesome-all-on-four-fellatio-pov",
    sourceModelId: "ffm-threesome-all-on-four-fellatio-pov",
    animePositionId: "de238333-cb14-41bd-8473-cabf50227c9b",
    title: "FFM Threesome Fellatio / 3Pフェラ",
    file: "ffm-threesome-all-on-four-fellatio-pov.jpeg",
    prompt: "masterpiece, best quality, 1girl, ffm_fellatio_variant1, ffm_fellatio_variant2, 1boy, 2girls, (one girl: lick penis)",
    triggerWords: "ffm_fellatio_variant1, ffm_fellatio_variant2, 1boy, 2girls, (one girl: lick penis), (one girl: blowjob penis)"
  },
  {
    id: "pf-anime-looking-at-own-body-continued",
    sourceModelId: "looking-at-own-body-continued",
    animePositionId: "0bd4f71e-fbe4-4e41-b825-c1c381e9ec65",
    title: "Looking at own body Continued",
    file: "looking-at-own-body-continued.jpeg",
    prompt: "masterpiece, best quality, 1girl, Looking at own body, Looking at own breasts",
    triggerWords: "Looking at own body, Looking at own breasts"
  },
  {
    id: "pf-anime-mirror-ass-selfie",
    sourceModelId: "mirror-ass-selfie",
    animePositionId: "07f09081-be3a-4f7c-992f-590bb3dbc988",
    title: "Mirror Ass Selfie / 鏡尻セルフィー",
    file: "mirror-ass-selfie.jpeg",
    prompt: "masterpiece, best quality, 1girl, 2ss_s3lf1e",
    triggerWords: "2ss_s3lf1e"
  },
  {
    id: "pf-anime-fellatio-variations-pack",
    sourceModelId: "fellatio-variations-pack",
    animePositionId: "52eefb08-2082-4073-8364-9cae799de111",
    title: "Fellatio Variations Pack",
    file: "fellatio-variations-pack.jpeg",
    prompt: "masterpiece, best quality, 1girl, CSV1, choker snapping, choker, blowjob, fellatio, oral,",
    triggerWords: "CSV1, choker snapping, choker, blowjob, fellatio, oral,"
  },
  {
    id: "pf-anime-sideways-fellatio",
    sourceModelId: "sideways-fellatio",
    animePositionId: "20a7654c-6b10-4ae9-8969-97cd463d1d58",
    title: "Sideways Fellatio / 横向きフェラ",
    file: "sideways-fellatio.jpeg",
    prompt: "masterpiece, best quality, 1girl, sideways fellatio,",
    triggerWords: "sideways fellatio,"
  },
  {
    id: "pf-anime-leg-behind-head",
    sourceModelId: "leg-behind-head",
    animePositionId: "75c4e5e1-f000-413c-89c1-2b2ec8f545e8",
    title: "Leg Behind Head / 足を頭の後ろに",
    file: "leg-behind-head.jpeg",
    prompt: "masterpiece, best quality, 1girl, leg behind head,",
    triggerWords: "leg behind head,"
  },
  {
    id: "pf-anime-thighjob-pov",
    sourceModelId: "thighjob-pov",
    animePositionId: "469b93ba-ab3a-4590-97b1-29eb43fb6670",
    title: "Thighjob Pov",
    file: "thighjob-pov.jpeg",
    prompt: "masterpiece, best quality, 1girl, thjopo, 1girl, 1boy, pov, povlayonfront, on stomach, thighs, ass, lying down, penishead, thighs pressed together, penis between thighs, penis head visible, feet,, thjopo, 1girl, 1boy, pov, povlayonback, on back, upside-down, penishead, thighs pressed together, penis between thighs, penis head visible, pussy,, thjopo, 1girl, 1boy, pov, povsit, sitting on person, from above, (upside-down:1.1), penishead, thighs pressed together, penis between thighs, penis head visible, pussy,, thjopo, 1girl, 1boy, pov, povstand, large penis, thjopo, povlay, penisbase, thighs pressed together, penis between thighs, penis base visible, penis head hidden, below pussy, from above,, from above,",
    triggerWords: "thjopo, 1girl, 1boy, pov, povlayonfront, on stomach, thighs, ass, lying down, penishead, thighs pressed together, penis between thighs, penis head visible, feet,, thjopo, 1girl, 1boy, pov, povlayonback, on back, upside-down, penishead, thighs pressed together, penis between thighs, penis head visible, pussy,, thjopo, 1girl, 1boy, pov, povsit, sitting on person, from above, (upside-down:1.1), penishead, thighs pressed together, penis between thighs, penis head visible, pussy,, thjopo, 1girl, 1boy, pov, povstand, large penis, thjopo, povlay, penisbase, thighs pressed together, penis between thighs, penis base visible, penis head hidden, below pussy, from above,, from above,, from below,, dutch angle,, looking at viewer,, reaching for viewer,, (cum shooting put of penis, cum on thighs, cum bubbling:1.1),"
  },
  {
    id: "pf-anime-do-you-want-to-pet-my-cat-elephant-meme-concept",
    sourceModelId: "do-you-want-to-pet-my-cat-elephant-meme-concept",
    animePositionId: "380e9c0a-0fe7-4934-9fb7-b56a9651967f",
    title: "Body Paint Peek / ボディペイント",
    file: "do-you-want-to-pet-my-cat-elephant-meme-concept.jpeg",
    prompt: "masterpiece, best quality, 1girl, PMP, bodypaint, pussy peek, table,, PME, bodypaint, penis, table,",
    triggerWords: "PMP, bodypaint, pussy peek, table,, PME, bodypaint, penis, table,"
  },
  {
    id: "pf-anime-unbirth-tai-kaiki",
    sourceModelId: "unbirth-tai-kaiki",
    animePositionId: "a6ce40b6-6bdd-4c57-b0c2-989f18719701",
    title: "Unbirth_Tai kaiki",
    file: "unbirth-tai-kaiki.jpeg",
    prompt: "masterpiece, best quality, 1girl, unbirth tainaikaiki IL,",
    triggerWords: "unbirth tainaikaiki IL,"
  },
  {
    id: "pf-anime-botebara-linkaku",
    sourceModelId: "botebara-linkaku",
    animePositionId: "8ebdd6f8-0208-4729-a593-df1856ab837b",
    title: "Botebara-Linkaku-",
    file: "botebara-linkaku.jpeg",
    prompt: "masterpiece, best quality, 1girl, Botebara-Linkaku-IL,",
    triggerWords: "Botebara-Linkaku-IL,"
  },
  {
    id: "pf-anime-mirai-nikki-yandere-face-meme-concept",
    sourceModelId: "mirai-nikki-yandere-face-meme-concept",
    animePositionId: "02451def-92fb-4462-90c2-e2ecffa9c10c",
    title: "Yandere Face / ヤンデレ顔",
    file: "mirai-nikki-yandere-face-meme-concept.jpeg",
    prompt: "masterpiece, best quality, 1girl, MNYF, hands on own face, half-closed eyes, parted lips,, purple theme,",
    triggerWords: "MNYF, hands on own face, half-closed eyes, parted lips,, purple theme,"
  },
  {
    id: "pf-anime-frame-bondage",
    sourceModelId: "frame-bondage",
    animePositionId: "3f61e4a8-af0a-492a-9352-bddc8d75d532",
    title: "Frame Bondage 框架拘束",
    file: "frame-bondage.jpeg",
    prompt: "masterpiece, best quality, 1girl, frame bondage,restrained,solo,bound,bdsm,breasts,bondage,full body,looking at viewer,bound legs,arms behind back,bare shoulders,blush,collar,cuffs,bound arms,",
    triggerWords: "frame bondage,restrained,solo,bound,bdsm,breasts,bondage,full body,looking at viewer,bound legs,arms behind back,bare shoulders,blush,collar,cuffs,bound arms,"
  },
  {
    id: "pf-anime-world-is-mine-pose-1-meme-concept",
    sourceModelId: "world-is-mine-pose-1-meme-concept",
    animePositionId: "78139715-9a56-4ebf-8e33-f465717e45d9",
    title: "World Is Mine Pose / ワールドイズマイン",
    file: "world-is-mine-pose-1-meme-concept.jpeg",
    prompt: "masterpiece, best quality, 1girl, WIMLP, pink checkered blanket, lying on back, on floor, knees up, convenient leg, hands up,, red petals,, twintails, black hair bow, red feather hair ornament, black multiple bracelets, black neck ribbon, white short dress, white frills, black petticoat, black thighhighs, no shoes,",
    triggerWords: "WIMLP, pink checkered blanket, lying on back, on floor, knees up, convenient leg, hands up,, red petals,, twintails, black hair bow, red feather hair ornament, black multiple bracelets, black neck ribbon, white short dress, white frills, black petticoat, black thighhighs, no shoes,"
  },
  {
    id: "pf-anime-hiromi-higuruma-covering-own-mouth-poses",
    sourceModelId: "hiromi-higuruma-covering-own-mouth-poses",
    animePositionId: "2510254e-2c92-46b0-9aa5-903f48c3cd22",
    title: "Hiromi Higuruma (日車 寛見) Covering Own Mouth - Poses",
    file: "hiromi-higuruma-covering-own-mouth-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, <lora:hiromi-higuruma-covering-own-mouth-illustriousxl-lora-nochekaiser:1>, hiromi higuruma covering own mouth, covering own mouth, hands on own face, solo, sitting, chair, looking up, rolling eyes,",
    triggerWords: "<lora:hiromi-higuruma-covering-own-mouth-illustriousxl-lora-nochekaiser:1>, hiromi higuruma covering own mouth, covering own mouth, hands on own face, solo, sitting, chair, looking up, rolling eyes,"
  },
  {
    id: "pf-anime-smug-inori-meme-concept",
    sourceModelId: "smug-inori-meme-concept",
    animePositionId: "6eee7780-3fbd-4631-b699-b2f529b7ccbe",
    title: "Smug Pose / ドヤ顔ポーズ",
    file: "smug-inori-meme-concept.jpeg",
    prompt: "masterpiece, best quality, 1girl, SIMEME, hand up, pointing with thumb, pointing backward, arm rest, furrowed brow, open mouth, smile,, sparkle,",
    triggerWords: "SIMEME, hand up, pointing with thumb, pointing backward, arm rest, furrowed brow, open mouth, smile,, sparkle,"
  },
  {
    id: "pf-anime-female-pov-on-top",
    sourceModelId: "female-pov-on-top",
    animePositionId: "bb947cc8-ebf7-4552-8912-67559478ad78",
    title: "Female POV On Top",
    file: "female-pov-on-top.jpeg",
    prompt: "masterpiece, best quality, 1girl, fpov2, pov, female pov, male focus,",
    triggerWords: "fpov2, pov, female pov, male focus,"
  },
  {
    id: "pf-anime-world-is-mine-pose-2-meme-concept",
    sourceModelId: "world-is-mine-pose-2-meme-concept",
    animePositionId: "6d0f8619-dd31-4cfc-8440-1d892d7f5c2a",
    title: "World Is Mine Pose 2 / ワールドイズマイン2",
    file: "world-is-mine-pose-2-meme-concept.jpeg",
    prompt: "masterpiece, best quality, 1girl, WIMEP, pink heart background, closed eyes, :o, hand up,, mini crown, crown necklace, red flower ring, white dress, puffy short sleeves,",
    triggerWords: "WIMEP, pink heart background, closed eyes, :o, hand up,, mini crown, crown necklace, red flower ring, white dress, puffy short sleeves,"
  },
  {
    id: "pf-anime-ranka-lee-s-kira-pose-meme-concept",
    sourceModelId: "ranka-lee-s-kira-pose-meme-concept",
    animePositionId: "ac69e111-b2a6-42cd-9a39-8ef8da92addd",
    title: "Kira Pose / キラッポーズ",
    file: "ranka-lee-s-kira-pose-meme-concept.jpeg",
    prompt: "masterpiece, best quality, 1girl, RLKP, \\m/, holding microphone, ;d,",
    triggerWords: "RLKP, \\m/, holding microphone, ;d,"
  },
  {
    id: "pf-anime-seikotsu-deep-tissue-massage",
    sourceModelId: "seikotsu-deep-tissue-massage",
    animePositionId: "8b00466d-c3b2-418a-ab04-707bf000bd45",
    title: "seikotsu / deep tissue massage",
    file: "seikotsu-deep-tissue-massage.jpeg",
    prompt: "masterpiece, best quality, 1girl, seikotsu, hetero, 1girl, 1boy, closed mouth, surgical mask, massage table, infirmary, barefoot, socks, perky breasts, knee up, arched back, leaning back, grabbing from behind, arms behind head, clothed male nude female,, looking ahead,",
    triggerWords: "seikotsu, hetero, 1girl, 1boy, closed mouth, surgical mask, massage table, infirmary, barefoot, socks, perky breasts, knee up, arched back, leaning back, grabbing from behind, arms behind head, clothed male nude female,, looking ahead,"
  },
  {
    id: "pf-anime-nsfw-pov-pov-cowgirlposition-and-cross-s",
    sourceModelId: "nsfw-pov-pov-cowgirlposition-and-cross-s",
    animePositionId: "a06cd192-e575-4360-92d1-70ad3b527b2d",
    title: "NSFW POV騎乗位と二断面図 / POV Cowgirlposition and cross-s",
    file: "nsfw-pov-pov-cowgirlposition-and-cross-s.jpeg",
    prompt: "masterpiece, best quality, 1girl, nipple tweak holding hands, clothed female nude male,   clothed sex,  sex, hetero,  blush, torogao, smile, spread legs,  open mouth, cum in pussy, pussy juice, ejaculation  clothed sex, cross-section, pussy,  saliva, drooing,  cowgirl position,   nipples, clothing cutout, pov, solo focus, deep penetration ejaculation, nsfw, white bed,",
    triggerWords: "nipple tweak holding hands, clothed female nude male,   clothed sex,  sex, hetero,  blush, torogao, smile, spread legs,  open mouth, cum in pussy, pussy juice, ejaculation  clothed sex, cross-section, pussy,  saliva, drooing,  cowgirl position,   nipples, clothing cutout, pov, solo focus, deep penetration ejaculation, nsfw, white bed,"
  },
  {
    id: "pf-anime-reverse-yogic-sleep-pose",
    sourceModelId: "reverse-yogic-sleep-pose",
    animePositionId: "46ea85fa-3c9f-4442-863a-fe0408f2560a",
    title: "Reverse Yogic Pose / 逆ヨガポーズ",
    file: "reverse-yogic-sleep-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1girl, breasts, breast press, top-down bottom-up, ass, barefoot, feet, toes, soles, toenails, toenail polish, flexible, legs, leg grab, thighs,",
    triggerWords: "1girl, breasts, breast press, top-down bottom-up, ass, barefoot, feet, toes, soles, toenails, toenail polish, flexible, legs, leg grab, thighs,"
  },
  {
    id: "pf-anime-multiple-girls-with-from-above-and",
    sourceModelId: "multiple-girls-with-from-above-and",
    animePositionId: "f01fed73-10f1-47eb-87b0-1681ed9c1298",
    title: "見下ろし複数少女上半身 / Multiple girls, with from above and ",
    file: "multiple-girls-with-from-above-and.jpeg",
    prompt: "masterpiece, best quality, 1girl, on back, lying, looking at viewer, from above, outdoors, clenched_hands, grass, on grass, upper body,, 1girl, solo,, 2girls, 3girls, 4girls",
    triggerWords: "on back, lying, looking at viewer, from above, outdoors, clenched_hands, grass, on grass, upper body,, 1girl, solo,, 2girls, 3girls, 4girls, 5girls, 6girls"
  },
  {
    id: "pf-anime-gold-experience-requiem-pose",
    sourceModelId: "gold-experience-requiem-pose",
    animePositionId: "2834f27b-c8e7-4b7d-81a8-0e33181521a8",
    title: "Requiem Pose / レクイエムポーズ",
    file: "gold-experience-requiem-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, requiem pose",
    triggerWords: "requiem pose"
  },
  {
    id: "pf-anime-pose-rev-from-dvl-s-finger-frame",
    sourceModelId: "pose-rev-from-dvl-s-finger-frame",
    animePositionId: "45d88304-4559-40d9-98cc-dbc93b7fc8a2",
    title: "Pose) Rev. from DVL's Finger Frame",
    file: "pose-rev-from-dvl-s-finger-frame.jpeg",
    prompt: "masterpiece, best quality, 1girl, finger frame, leg up",
    triggerWords: "finger frame, leg up"
  },
  {
    id: "pf-anime-kamen-rider-agito-pre-rider-kick-stance",
    sourceModelId: "kamen-rider-agito-pre-rider-kick-stance",
    animePositionId: "638deb91-3f0a-4f72-853b-b35bd7f46201",
    title: "Rider Kick Stance / ライダーキック",
    file: "kamen-rider-agito-pre-rider-kick-stance.jpeg",
    prompt: "masterpiece, best quality, 1girl, ag1t0prekickpose, from above, outstretched arms, legs apart, symbol on floor",
    triggerWords: "ag1t0prekickpose, from above, outstretched arms, legs apart, symbol on floor"
  },
  {
    id: "pf-anime-male-ohogao",
    sourceModelId: "male-ohogao",
    animePositionId: "4ffd70c0-12a5-45a3-96de-bd703e309637",
    title: "Male Ahegao / 男アヘ顔",
    file: "male-ohogao.jpeg",
    prompt: "masterpiece, best quality, 1girl, ohogao,puckered lips, open mouth,furrowed brow, rolling eyes, nostrils,v-shaped eyebrows,",
    triggerWords: "ohogao,puckered lips, open mouth,furrowed brow, rolling eyes, nostrils,v-shaped eyebrows,"
  },
  {
    id: "pf-anime-sealing-hand-gesture",
    sourceModelId: "sealing-hand-gesture",
    animePositionId: "770732a8-5f52-440e-9084-d101dc3b15db",
    title: "Sealing Hand Gesture",
    file: "sealing-hand-gesture.jpeg",
    prompt: "masterpiece, best quality, 1girl, s3al1g,, sealing hand (gesture),",
    triggerWords: "s3al1g,, sealing hand (gesture),"
  },
  {
    id: "pf-anime-posing-dynamics",
    sourceModelId: "posing-dynamics",
    animePositionId: "82cec719-23f7-469f-b289-2f458158a623",
    title: "Dynamic Posing / ダイナミックポーズ",
    file: "posing-dynamics.jpeg",
    prompt: "masterpiece, best quality, 1girl, PosingDynamicsDaal",
    triggerWords: "PosingDynamicsDaal"
  },
  {
    id: "pf-anime-shock-torture-bondage",
    sourceModelId: "shock-torture-bondage",
    animePositionId: "44da47e3-345c-42eb-840f-2e90fe08fd6b",
    title: "Shock Torture Bondage 电击束缚",
    file: "shock-torture-bondage.jpeg",
    prompt: "masterpiece, best quality, 1girl, shock torture bondage,shock torture,bdsm,bound,breasts,bondage,nipples,electricity,chain,sex machine,restrained,nude,collar,blush,sex toy,arms behind back,",
    triggerWords: "shock torture bondage,shock torture,bdsm,bound,breasts,bondage,nipples,electricity,chain,sex machine,restrained,nude,collar,blush,sex toy,arms behind back,"
  },
  {
    id: "pf-anime-harmony-by-stx",
    sourceModelId: "harmony-by-stx",
    animePositionId: "7c88d5a9-b018-49cc-8af3-0b6f336cb84a",
    title: "HARMONY BY STX",
    file: "harmony-by-stx.jpeg",
    prompt: "masterpiece, best quality, 1girl, harmny_stx",
    triggerWords: "harmny_stx"
  },
  {
    id: "pf-anime-teasing-penis",
    sourceModelId: "teasing-penis",
    animePositionId: "23673b4d-c7e8-4020-b341-1645cf72ae59",
    title: "Teasing Penis / ペニスいじり",
    file: "teasing-penis.jpeg",
    prompt: "masterpiece, best quality, 1girl, Teasing Penis,Glans,Licking the penis,blowjob,, Teasing Penis,Glans,Licking the penis,blowjob, small penis,t hyper muscle,thick body,Thick pectoral muscles, thick waist, thick thighs, esticles,hairy pubes,navel hair, Erect penis, 2 guy,couple, Multiple characters, different characters, different characteristics,",
    triggerWords: "Teasing Penis,Glans,Licking the penis,blowjob,, Teasing Penis,Glans,Licking the penis,blowjob, small penis,t hyper muscle,thick body,Thick pectoral muscles, thick waist, thick thighs, esticles,hairy pubes,navel hair, Erect penis, 2 guy,couple, Multiple characters, different characters, different characteristics,"
  },
  {
    id: "pf-anime-limp",
    sourceModelId: "limp",
    animePositionId: "da554e62-9d17-4ea0-8337-d5cc73df65eb",
    title: "Limp / 脱力",
    file: "limp.jpeg",
    prompt: "masterpiece, best quality, 1girl, limp, on back, parted lips, half-closed eyes",
    triggerWords: "limp, on back, parted lips, half-closed eyes"
  },
  {
    id: "pf-anime-sitting-on-person-feet-on-face",
    sourceModelId: "sitting-on-person-feet-on-face",
    animePositionId: "3801ca1c-7ec1-43ea-9379-f115a01e864e",
    title: "Sitting on Person (Feet on Face)",
    file: "sitting-on-person-feet-on-face.jpeg",
    prompt: "masterpiece, best quality, 1girl, sitting on person, feet on another's face",
    triggerWords: "sitting on person, feet on another's face"
  },
  {
    id: "pf-anime-pov-all-fours-looking-through-legs",
    sourceModelId: "pov-all-fours-looking-through-legs",
    animePositionId: "159a8b58-fc78-4cac-825d-94acf8be0f83",
    title: "正面四つん這い足元視点 / POV all fours, looking through legs,",
    file: "pov-all-fours-looking-through-legs.jpeg",
    prompt: "masterpiece, best quality, 1girl, white panties,, stripe panties, blue panties,, all fours, ass, looking at viewer, looking through legs, from below, bent over, thighs,, shirts, no bra, underboob, nipples,, shirts, bra, underboob,",
    triggerWords: "white panties,, stripe panties, blue panties,, all fours, ass, looking at viewer, looking through legs, from below, bent over, thighs,, shirts, no bra, underboob, nipples,, shirts, bra, underboob,, shirts, no bra, underboob,, pov,, upshirt,, upskirt, navel"
  },
  {
    id: "pf-anime-meobomugen-s-fellatio",
    sourceModelId: "meobomugen-s-fellatio",
    animePositionId: "b9b7ed68-a2c6-4079-ad99-6c8284a085f2",
    title: "Fellatio / フェラチオ",
    file: "meobomugen-s-fellatio.jpeg",
    prompt: "masterpiece, best quality, 1girl, Fellatio, large penis, squatting , Pov, Half-closed eyes ",
    triggerWords: "Fellatio, large penis, squatting , Pov, Half-closed eyes "
  },
  {
    id: "pf-anime-pose-bdsm-circular-saw",
    sourceModelId: "pose-bdsm-circular-saw",
    animePositionId: "332badec-22cf-47ed-8ddd-0e95828c2b85",
    title: "BDSM Circular Saw / BDSM丸鋸",
    file: "pose-bdsm-circular-saw.jpeg",
    prompt: "masterpiece, best quality, 1girl, mai_silicone_circular_saw, crotch_torture",
    triggerWords: "mai_silicone_circular_saw, crotch_torture"
  },
  {
    id: "pf-anime-pleased",
    sourceModelId: "pleased",
    animePositionId: "105c6aea-d8dc-4273-8177-1bd1f11507be",
    title: "Pleased",
    file: "pleased.jpeg",
    prompt: "masterpiece, best quality, 1girl, pleased_gesture, own hands together, upper body,, looking at viewer,",
    triggerWords: "pleased_gesture, own hands together, upper body,, looking at viewer,"
  },
  {
    id: "pf-anime-transport-bondage",
    sourceModelId: "transport-bondage",
    animePositionId: "fdb4f6ce-d0fa-4ba7-8c50-0694b4ce50d4",
    title: "Transport Bondage 运输拘束",
    file: "transport-bondage.jpeg",
    prompt: "masterpiece, best quality, 1girl, (full body:1.3),standing,looking at viewer,transport bondage,bondage,bdsm,restrained,breasts,nipples,nude,barefoot,",
    triggerWords: "(full body:1.3),standing,looking at viewer,transport bondage,bondage,bdsm,restrained,breasts,nipples,nude,barefoot,"
  },
  {
    id: "pf-anime-huge-ass-grab",
    sourceModelId: "huge-ass-grab",
    animePositionId: "0005b127-0500-49c2-8329-bce53d4641d5",
    title: "Huge ass grab",
    file: "huge-ass-grab.jpeg",
    prompt: "masterpiece, best quality, 1girl, 2girls, huge ass, ass focus, ass grab, grabbing another's ass, large breasts, thick thighs, backboob, lipstick mark, fingernails, nail polish, looking at viewer, makeup, open mouth, upper teeth only, tongue out",
    triggerWords: "2girls, huge ass, ass focus, ass grab, grabbing another's ass, large breasts, thick thighs, backboob, lipstick mark, fingernails, nail polish, looking at viewer, makeup, open mouth, upper teeth only, tongue out"
  },
  {
    id: "pf-anime-self-titty-sucking",
    sourceModelId: "self-titty-sucking",
    animePositionId: "660f39c2-00db-4c3d-aee3-50d821e9a87b",
    title: "Self Titty Sucking / 自分乳吸い",
    file: "self-titty-sucking.jpeg",
    prompt: "masterpiece, best quality, 1girl, Titty sucking",
    triggerWords: "Titty sucking"
  },
  {
    id: "pf-anime-box-bondage",
    sourceModelId: "box-bondage",
    animePositionId: "bf25d17e-a56e-4034-b4f4-61acf25a1e72",
    title: "Box Bondage 箱式拘束",
    file: "box-bondage.jpeg",
    prompt: "masterpiece, best quality, 1girl, box bondage,straitjacket,bound ankles,bound arms,chastity belt,smart chastity belt,breasts,nipples,restrained,bound,bdsm,bondage,lactation,nude,frogtie,navel,bound legs,milking machine,sitting,gag,gagged,",
    triggerWords: "box bondage,straitjacket,bound ankles,bound arms,chastity belt,smart chastity belt,breasts,nipples,restrained,bound,bdsm,bondage,lactation,nude,frogtie,navel,bound legs,milking machine,sitting,gag,gagged,"
  },
  {
    id: "pf-anime-the-look",
    sourceModelId: "the-look",
    animePositionId: "8a6cca6e-3b15-4b35-b6c8-025ae4dbbabc",
    title: "The Look / 視線",
    file: "the-look.jpeg",
    prompt: "masterpiece, best quality, 1girl, LookDaal",
    triggerWords: "LookDaal"
  },
  {
    id: "pf-anime-after-mating-press",
    sourceModelId: "after-mating-press",
    animePositionId: "beb9feba-3ce5-4d72-b291-5408b6873783",
    title: "After Mating Press / 種付けプレス後",
    file: "after-mating-press.jpeg",
    prompt: "masterpiece, best quality, 1girl, after mating press, mp pussy, mp clitoris, excited face, looking at penis, heart emoji, bukkake, excessive cum, excessive cum dripping, cum dripping, dark skinned male, penis, dark skinned penis, penis out of frame",
    triggerWords: "after mating press, mp pussy, mp clitoris, excited face, looking at penis, heart emoji, bukkake, excessive cum, excessive cum dripping, cum dripping, dark skinned male, penis, dark skinned penis, penis out of frame"
  },
  {
    id: "pf-anime-shirt-tucking",
    sourceModelId: "shirt-tucking",
    animePositionId: "7cda6b1d-9c87-40ad-9c69-6133a8e40baa",
    title: "Shirt Tucking",
    file: "shirt-tucking.jpeg",
    prompt: "masterpiece, best quality, 1girl, dast-shirt tucking focus",
    triggerWords: "dast-shirt tucking focus"
  },
  {
    id: "pf-anime-footjob-stomp",
    sourceModelId: "footjob-stomp",
    animePositionId: "8b590fa4-44ea-45e0-a1fd-2092b06dfe8b",
    title: "Footjob (Stomp)",
    file: "footjob-stomp.jpeg",
    prompt: "masterpiece, best quality, 1girl, footjob, pov",
    triggerWords: "footjob, pov"
  },
  {
    id: "pf-anime-hugit",
    sourceModelId: "hugit",
    animePositionId: "19d0afe5-b127-4194-b4f1-3487cbac711c",
    title: "Hugging Pose / 抱きつきポーズ",
    file: "hugit.jpeg",
    prompt: "masterpiece, best quality, 1girl, hugobj, [subject], hugging, [object},, example:, hugobj, 1girl, hugging, ball",
    triggerWords: "hugobj, [subject], hugging, [object},, example:, hugobj, 1girl, hugging, ball"
  },
  {
    id: "pf-anime-touch-another-s-hair-with-incoming",
    sourceModelId: "touch-another-s-hair-with-incoming",
    animePositionId: "22c6cbd3-22a5-44d5-9eb1-c3e40d510b31",
    title: "髪さわりキス待ち顔構図 / touch another's hair. with incoming_",
    file: "touch-another-s-hair-with-incoming.jpeg",
    prompt: "masterpiece, best quality, 1girl, clu  1girl  profile, hand_in_another's_hair  from side,  imminent_kiss faceless boy, face-to-face,",
    triggerWords: "clu  1girl  profile, hand_in_another's_hair  from side,  imminent_kiss faceless boy, face-to-face,"
  },
  {
    id: "pf-anime-heavy-bondage",
    sourceModelId: "heavy-bondage",
    animePositionId: "69fd5a0a-7213-477a-a1b3-370c09beb4fb",
    title: "Heavy Bondage 重型拘束",
    file: "heavy-bondage.jpeg",
    prompt: "masterpiece, best quality, 1girl, heavy bondage,labs background,chain,bound,bdsm,bondage,restrained,spread legs,cuffs,shackles,chained,object insertion,collar,arms up,nude,nipples,breasts,barefoot,m legs,, heavy bondage,dungeon background,chain,bound,bdsm,bondage,restrained,spread legs,cuffs,shackles,chained,object insertion,collar,arms up,nude,nipples,breasts,barefoot,m legs,",
    triggerWords: "heavy bondage,labs background,chain,bound,bdsm,bondage,restrained,spread legs,cuffs,shackles,chained,object insertion,collar,arms up,nude,nipples,breasts,barefoot,m legs,, heavy bondage,dungeon background,chain,bound,bdsm,bondage,restrained,spread legs,cuffs,shackles,chained,object insertion,collar,arms up,nude,nipples,breasts,barefoot,m legs,"
  },
  {
    id: "pf-anime-after-birth-sex",
    sourceModelId: "after-birth-sex",
    animePositionId: "9380e3bf-e801-432a-937b-d5c63d2f3b93",
    title: "After Sex / 事後",
    file: "after-birth-sex.jpeg",
    prompt: "masterpiece, best quality, 1girl, ups01, penis, pussy, virginal, sex, penis penetrate pussy, penis insert into the pussy, umbilical cord, a umbilical cord squeezed out through the pussy,",
    triggerWords: "ups01, penis, pussy, virginal, sex, penis penetrate pussy, penis insert into the pussy, umbilical cord, a umbilical cord squeezed out through the pussy,"
  },
  {
    id: "pf-anime-armchair-from-behind",
    sourceModelId: "armchair-from-behind",
    animePositionId: "8be23423-45e3-4651-bba8-84b7a7b6e774",
    title: "Armchair from behind",
    file: "armchair-from-behind.jpeg",
    prompt: "masterpiece, best quality, 1girl, ArmchairFB, ArmchairFB, birds eye view, from behind",
    triggerWords: "ArmchairFB, ArmchairFB, birds eye view, from behind"
  },
  {
    id: "pf-anime-standing-double-paizuri-cooperative-paizuri",
    sourceModelId: "standing-double-paizuri-cooperative-paizuri",
    animePositionId: "572289fd-83f5-4d8f-aad9-2fb84c5cde02",
    title: "Double Paizuri / ダブルパイズリ",
    file: "standing-double-paizuri-cooperative-paizuri.jpeg",
    prompt: "masterpiece, best quality, 1girl, stddbpai, 2girls, 1boy, standing male, third person, cooperative paizuri, large male, grabbing breasts, testicles, stddbpai, 1girl, 1boy, standing male, third person, paizuri, large male, penis between breasts, testicles,",
    triggerWords: "stddbpai, 2girls, 1boy, standing male, third person, cooperative paizuri, large male, grabbing breasts, testicles, stddbpai, 1girl, 1boy, standing male, third person, paizuri, large male, penis between breasts, testicles,"
  },
  {
    id: "pf-anime-happiness-throw-holy-cracker-frankensteiner-should",
    sourceModelId: "happiness-throw-holy-cracker-frankensteiner-should",
    animePositionId: "9f721aa4-68a0-428d-9047-b97a819171c3",
    title: "Happiness Throw / Holy Cracker / Frankensteiner / Should",
    file: "happiness-throw-holy-cracker-frankensteiner-should.jpeg",
    prompt: "masterpiece, best quality, 1girl, shldrscs",
    triggerWords: "shldrscs"
  },
  {
    id: "pf-anime-penis-around-waist",
    sourceModelId: "penis-around-waist",
    animePositionId: "14dc7a34-09c5-415c-97d6-bf927a6b43d4",
    title: "Penis Around Waist / ペニス巻き付き",
    file: "penis-around-waist.jpeg",
    prompt: "masterpiece, best quality, 1girl, Penis Around Body, penisaw",
    triggerWords: "Penis Around Body, penisaw"
  },
  {
    id: "pf-anime-pose-balancing-walk",
    sourceModelId: "pose-balancing-walk",
    animePositionId: "9812f639-e58d-4555-b574-828edc835726",
    title: "Balancing Walk / バランス歩き",
    file: "pose-balancing-walk.jpeg",
    prompt: "masterpiece, best quality, 1girl, balancing, spread arms, full body, standing on one leg, leg up,",
    triggerWords: "balancing, spread arms, full body, standing on one leg, leg up,"
  },
  {
    id: "pf-anime-meteor-combination-dragon-ball",
    sourceModelId: "meteor-combination-dragon-ball",
    animePositionId: "e5aab44a-e15c-4305-ab42-59706d2c1f5c",
    title: "Meteor Combination - Dragon Ball",
    file: "meteor-combination-dragon-ball.jpeg",
    prompt: "masterpiece, best quality, 1girl, metecombi, all fours, crouch start, full body,",
    triggerWords: "metecombi, all fours, crouch start, full body,"
  },
  {
    id: "pf-anime-unbirth-body",
    sourceModelId: "unbirth-body",
    animePositionId: "34431ce4-3d7e-4476-82a5-6ca0abdb5647",
    title: "Unbirth / アンバース",
    file: "unbirth-body.jpeg",
    prompt: "masterpiece, best quality, 1girl, Unbirth_Body_IL",
    triggerWords: "Unbirth_Body_IL"
  },
  {
    id: "pf-anime-dogeza-fingers-forward",
    sourceModelId: "dogeza-fingers-forward",
    animePositionId: "eb01f5ee-90f0-4619-87e3-e4283bf22f4e",
    title: "Dogeza Forward / 土下座（指前）",
    file: "dogeza-fingers-forward.jpeg",
    prompt: "masterpiece, best quality, 1girl, dogeza, naked dogeza, folded clothes, unworn panties, full body, close-up",
    triggerWords: "dogeza, naked dogeza, folded clothes, unworn panties, full body, close-up"
  },
  {
    id: "pf-anime-cum-in-mouth-very-close-shot",
    sourceModelId: "cum-in-mouth-very-close-shot",
    animePositionId: "79587216-f473-49d1-983f-2dbb0288742d",
    title: "Cum In Mouth Close-up / 口内射精アップ",
    file: "cum-in-mouth-very-close-shot.jpeg",
    prompt: "masterpiece, best quality, 1girl, milcock, cock, lips, mouth open, nose, cumming, white background, girl lower face, overflowing,",
    triggerWords: "milcock, cock, lips, mouth open, nose, cumming, white background, girl lower face, overflowing,"
  },
  {
    id: "pf-anime-jean-gunnh-dr-kabedon-on-viewer-poses",
    sourceModelId: "jean-gunnh-dr-kabedon-on-viewer-poses",
    animePositionId: "6135153e-af40-4afb-99a0-250ff5d2536a",
    title: "Kabedon On Viewer / 壁ドン",
    file: "jean-gunnh-dr-kabedon-on-viewer-poses.jpeg",
    prompt: "masterpiece, best quality, 1girl, <lora:jeankabedononviewer-illustriousxl-lora-nochekaiser:1>, jeankabedononviewer, kabedon on viewer, solo, looking at viewer, upper body, outdoors, sky, blue sky, pov, reaching towards viewer, reaching, closed mouth, v-shaped brow",
    triggerWords: "<lora:jeankabedononviewer-illustriousxl-lora-nochekaiser:1>, jeankabedononviewer, kabedon on viewer, solo, looking at viewer, upper body, outdoors, sky, blue sky, pov, reaching towards viewer, reaching, closed mouth, v-shaped brow"
  },
  {
    id: "pf-anime-okonomiyaki",
    sourceModelId: "okonomiyaki",
    animePositionId: "9919f6e3-3979-46c4-ac2e-b83f62df6258",
    title: "okonomiyaki / お好み焼き",
    file: "okonomiyaki.jpeg",
    prompt: "masterpiece, best quality, 1girl, okonomiyaki, flipping food",
    triggerWords: "okonomiyaki, flipping food"
  },
  {
    id: "pf-anime-sword-stance-collection",
    sourceModelId: "sword-stance-collection",
    animePositionId: "83bffbb9-42d6-4970-a6dd-ba45dac88977",
    title: "Sword Stance / 剣構え",
    file: "sword-stance-collection.jpeg",
    prompt: "masterpiece, best quality, 1girl, sitting with sword stance, holding sword, sitting, sheathed,",
    triggerWords: "sitting with sword stance, holding sword, sitting, sheathed,"
  },
  {
    id: "pf-anime-lovin-snuggly-positions-lsp-for-redcraft",
    sourceModelId: "lovin-snuggly-positions-lsp-for-redcraft",
    animePositionId: "8a1354c4-543f-4a37-bbf6-7eed5dc7e8e7",
    title: "Snuggle Positions / イチャイチャポーズ",
    file: "lovin-snuggly-positions-lsp-for-redcraft.jpeg",
    prompt: "masterpiece, best quality, 1girl, barefoot",
    triggerWords: "barefoot"
  },
  {
    id: "pf-anime-straddling-handjob-xl",
    sourceModelId: "straddling-handjob-xl",
    animePositionId: "8ccf0378-51c4-43f9-ac93-aaa47f050d02",
    title: "Straddling Handjob / 跨り手コキ",
    file: "straddling-handjob-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1girl, 1boy, straddling, handjob, cowgirl, leaning back,   penis focus, from below, foreshortening,",
    triggerWords: "1girl, 1boy, straddling, handjob, cowgirl, leaning back,   penis focus, from below, foreshortening,"
  },
  {
    id: "pf-anime-deep-spitroast-from-side",
    sourceModelId: "deep-spitroast-from-side",
    animePositionId: "cd84f007-4099-4f21-a791-0cd91bb9d86f",
    title: "Spitroast Side View / 串刺し横",
    file: "deep-spitroast-from-side.jpeg",
    prompt: "masterpiece, best quality, 1girl, 1girl, 2boys, mmf threesome, oral, vaginal, standing sex, leg up, arms behind back, cum in pussy, cum in mouth, rolling eyes, tongue out, crying with eyes open, head grab, strangling, hand on another's neck, irrumatio,, spitroast,, asphyxiation,, cum overflow,",
    triggerWords: "1girl, 2boys, mmf threesome, oral, vaginal, standing sex, leg up, arms behind back, cum in pussy, cum in mouth, rolling eyes, tongue out, crying with eyes open, head grab, strangling, hand on another's neck, irrumatio,, spitroast,, asphyxiation,, cum overflow,, leg lift"
  },
  {
    id: "pf-anime-pose-bdsm-sex-machine",
    sourceModelId: "pose-bdsm-sex-machine",
    animePositionId: "8c6ad3af-b694-4e7a-9a21-d8ab75b8caa5",
    title: "BDSM Sex Machine / BDSM調教機",
    file: "pose-bdsm-sex-machine.jpeg",
    prompt: "masterpiece, best quality, 1girl, mai_pose_sex_machine,stationary_restraints,bondage,sex_machine,kneeling,all_fours",
    triggerWords: "mai_pose_sex_machine,stationary_restraints,bondage,sex_machine,kneeling,all_fours"
  },
  {
    id: "pf-anime-skirt-tug-xl",
    sourceModelId: "skirt-tug-xl",
    animePositionId: "06194c64-58fa-4e15-8df7-3a1f0e41a409",
    title: "Skirt Tug / スカートを抑える",
    file: "skirt-tug-xl.jpeg",
    prompt: "masterpiece, best quality, 1girl, skirt tug",
    triggerWords: "skirt tug"
  },
  {
    id: "pf-anime-wheelbarrow-position",
    sourceModelId: "wheelbarrow-position",
    animePositionId: "07956061-8876-4226-9321-0c19237bd189",
    title: "Wheelbarrow / 押し車",
    file: "wheelbarrow-position.jpeg",
    prompt: "masterpiece, best quality, 1girl, wheelbarrow position, arm support, push-ups, sex from behind, 1girl, 1boy,leg lock",
    triggerWords: "wheelbarrow position, arm support, push-ups, sex from behind, 1girl, 1boy,leg lock"
  },
  {
    id: "pf-anime-autofellatio-futanari-trap-rouwei-xl-diff",
    sourceModelId: "autofellatio-futanari-trap-rouwei-xl-diff",
    animePositionId: "a7e8190b-af9b-4b50-8054-51e784c8375e",
    title: "Autofellatio Futanari + Trap / ROUWEI / -XL / DIFF",
    file: "autofellatio-futanari-trap-rouwei-xl-diff.jpeg",
    prompt: "masterpiece, best quality, 1girl, autofellatio, penis, testicles",
    triggerWords: "autofellatio, penis, testicles"
  },
  {
    id: "pf-anime-suspended-congress-variations",
    sourceModelId: "suspended-congress-variations",
    animePositionId: "5a501aa6-fac4-44f4-84e0-b7606af3f905",
    title: "Suspended Congress / 駅弁バリエーション",
    file: "suspended-congress-variations.jpeg",
    prompt: "masterpiece, best quality, 1girl, SCLLV1.0, suspended congress, leg lock, ",
    triggerWords: "SCLLV1.0, suspended congress, leg lock, "
  },
  {
    id: "pf-anime-crouching-l",
    sourceModelId: "crouching-l",
    animePositionId: "29d353a2-afbd-4792-a134-a584cba4967c",
    title: "Crouching / 蹲る",
    file: "crouching-l.jpeg",
    prompt: "masterpiece, best quality, 1girl, crouching,rounding the back",
    triggerWords: "crouching,rounding the back"
  },
  {
    id: "pf-anime-amazon-position",
    sourceModelId: "amazon-position",
    animePositionId: "32defc48-4bfc-49d4-968f-cd06c7b180f4",
    title: "Amazon Position / ちんぐり返し",
    file: "amazon-position.jpeg",
    prompt: "masterpiece, best quality, 1girl,  chinguri, sex, 1boy, penis, vaginal, amazones, grabbing ankle",
    triggerWords: " chinguri, sex, 1boy, penis, vaginal, amazones, grabbing ankle"
  },
  {
    id: "pf-anime-prone-bone-variations-xl-ai",
    sourceModelId: "prone-bone-variations-xl-ai",
    animePositionId: "eac2c4f9-4667-4619-963c-46c6f172a33a",
    title: "Prone Bone Variations / 寝バックバリエーション",
    file: "prone-bone-variations-xl-ai.jpeg",
    prompt: "masterpiece, best quality, 1girl, HGPB1.0, grabbing another's hair, prone bone, hair grab,, sex from behind, lying, on stomach, ",
    triggerWords: "HGPB1.0, grabbing another's hair, prone bone, hair grab,, sex from behind, lying, on stomach, "
  },
  {
    id: "pf-anime-skirt-lift",
    sourceModelId: "skirt-lift",
    animePositionId: "153297f7-9d2f-431e-b518-2dff86ae5221",
    title: "Skirt Lift / スカートめくり",
    file: "skirt-lift.jpeg",
    prompt: "masterpiece, best quality, 1girl, skirt lift,dress lift",
    triggerWords: "skirt lift,dress lift"
  },
  {
    id: "pf-anime-iaidou-ready-to-draw",
    sourceModelId: "iaidou-ready-to-draw",
    animePositionId: "a731dac2-1594-42f2-9723-60ad800a7c76",
    title: "iaidou / ready to draw / 居合い / 抜刀術 / シン・陰流簡易領域",
    file: "iaidou-ready-to-draw.jpeg",
    prompt: "masterpiece, best quality, 1girl, iaidou,weapon, katana, holding sword, ready to draw, sheathed, unsheathing, scabbard,",
    triggerWords: "iaidou,weapon, katana, holding sword, ready to draw, sheathed, unsheathing, scabbard,"
  },
  {
    id: "pf-anime-pose-bdsm-lying",
    sourceModelId: "pose-bdsm-lying",
    animePositionId: "95487be6-7037-436f-846a-9f33ac8f505a",
    title: "BDSM Lying / BDSM仰向け",
    file: "pose-bdsm-lying.jpeg",
    prompt: "masterpiece, best quality, 1girl, mai_bdsm_lying,on_wooden_horse,lying,on back,bdsm",
    triggerWords: "mai_bdsm_lying,on_wooden_horse,lying,on back,bdsm"
  },
  {
    id: "pf-anime-stomp-head",
    sourceModelId: "stomp-head",
    animePositionId: "c58822fc-4c57-4e79-9dc3-65e53e896a09",
    title: "Stomp Head / 踏みつけ",
    file: "stomp-head.jpeg",
    prompt: "masterpiece, best quality, 1girl,  stomp head, 1girl, 1boy,foot on head",
    triggerWords: " stomp head, 1girl, 1boy,foot on head"
  },
  {
    id: "pf-anime-pose-bdsm-x-cross",
    sourceModelId: "pose-bdsm-x-cross",
    animePositionId: "a93cdb2d-9d9c-44cf-ae8e-2bb870739274",
    title: "BDSM X-Cross / BDSM X十字架",
    file: "pose-bdsm-x-cross.jpeg",
    prompt: "masterpiece, best quality, 1girl, mai_bdsm_standing_x, sex_machine, stationary_restraints, restrained, gagged, gag",
    triggerWords: "mai_bdsm_standing_x, sex_machine, stationary_restraints, restrained, gagged, gag"
  },
  {
    id: "pf-anime-tentacle-pit-lus",
    sourceModelId: "tentacle-pit-lus",
    animePositionId: "1ecf8822-8a18-48b9-aaf7-a430b0dc9cd6",
    title: "Tentacle Pit / Lus",
    file: "tentacle-pit-lus.jpeg",
    prompt: "masterpiece, best quality, 1girl, Tentacle imminent penetration",
    triggerWords: "Tentacle imminent penetration"
  },
  {
    id: "pf-anime-cum-l",
    sourceModelId: "cum-l",
    animePositionId: "5d3e7ce9-883d-41e4-9b85-eeed7097881b",
    title: "Cum / ぶっかけ",
    file: "cum-l.jpeg",
    prompt: "masterpiece, best quality, 1girl, cum_ill, cum, facial,bukkake, cum on body, cum on face, cum on hair, cum in eyes,excessive cum,",
    triggerWords: "cum_ill, cum, facial,bukkake, cum on body, cum on face, cum on hair, cum in eyes,excessive cum,"
  },
  {
    id: "pf-anime-slime-sex-tentacles-and-monsters",
    sourceModelId: "slime-sex-tentacles-and-monsters",
    animePositionId: "be9fa0c3-2974-48f5-b3be-a8a54d306bb5",
    title: "Slime Tentacles / スライム触手",
    file: "slime-sex-tentacles-and-monsters.jpeg",
    prompt: "masterpiece, best quality, 1girl, >slime_sex , slime (substance), tentacles, slime tentacles,tentacle sex, restrained,arms restrained by tentacles, legs restrained by tentacles, vaginal, double penetrations,, slime_sex , slime (substance), restrained,arms restrained by monsters, legs restrained by monsterm, multiple hands, monster sex, oral,vaginal, double penetrations,multiple monsters, group sex, gangbang, monsters, green monster,, (slime \\(substance\\) on body)",
    triggerWords: ">slime_sex , slime (substance), tentacles, slime tentacles,tentacle sex, restrained,arms restrained by tentacles, legs restrained by tentacles, vaginal, double penetrations,, slime_sex , slime (substance), restrained,arms restrained by monsters, legs restrained by monsterm, multiple hands, monster sex, oral,vaginal, double penetrations,multiple monsters, group sex, gangbang, monsters, green monster,, (slime \\(substance\\) on body)"
  },
  {
    id: "pf-anime-dog-like-obedience-pose",
    sourceModelId: "dog-like-obedience-pose",
    animePositionId: "83090044-826b-44e4-a944-8c93b4e0869e",
    title: "Obedience Pose / 服従ポーズ",
    file: "dog-like-obedience-pose.jpeg",
    prompt: "masterpiece, best quality, 1girl, obedience pose, paw pose, lying on ground, on back, spread legs, from above, anal tail, butt plug, fake dog tail, fake dog ears, tongue downwards",
    triggerWords: "obedience pose, paw pose, lying on ground, on back, spread legs, from above, anal tail, butt plug, fake dog tail, fake dog ears, tongue downwards"
  },
  {
    id: "pf-anime-suspended-congress-sandwich",
    sourceModelId: "suspended-congress-sandwich",
    animePositionId: "c8bbe5f3-56a7-4591-9694-9dd343fa2786",
    title: "Suspended Congress Sandwich / 駅弁サンドイッチ",
    file: "suspended-congress-sandwich.jpeg",
    prompt: "masterpiece, best quality, 1girl, from side, 1girl, huge breasts, suspended congress, mmf threesome, double penetration, looking at another, french kiss, tongue out, leg lock, arms around neck, hand on another's neck, standing sex, sex from behind, grabbing another's ass, vaginal, anal, deep penetration, clothed female nude male,, nipples,, boy sandwich, sandwiched, 2boys,, sweat,",
    triggerWords: "from side, 1girl, huge breasts, suspended congress, mmf threesome, double penetration, looking at another, french kiss, tongue out, leg lock, arms around neck, hand on another's neck, standing sex, sex from behind, grabbing another's ass, vaginal, anal, deep penetration, clothed female nude male,, nipples,, boy sandwich, sandwiched, 2boys,, sweat,, thigh grab,, breast press,"
  },
  {
    id: "pf-anime-standing-double-penetration-concept",
    sourceModelId: "standing-double-penetration-concept",
    animePositionId: "91b332fa-fa2f-4e36-8a36-9eeb577777b9",
    title: "Standing DP / 立ち二穴挿入",
    file: "standing-double-penetration-concept.jpeg",
    prompt: "masterpiece, best quality, 1girl, Standing DP, Standing Double Penetration, 1girl, 2boys, group sex, mmf threesome, sex, standing sex, double penetrations, vaginal sex, anal sex, size difference, grabbing her arms, grabbing her leg, one leg up, facing another, passionate sex, deep penetration, leg on another's hip, from the side, sex sandwich, breast squish,",
    triggerWords: "Standing DP, Standing Double Penetration, 1girl, 2boys, group sex, mmf threesome, sex, standing sex, double penetrations, vaginal sex, anal sex, size difference, grabbing her arms, grabbing her leg, one leg up, facing another, passionate sex, deep penetration, leg on another's hip, from the side, sex sandwich, breast squish,"
  },
  {
    id: "pf-anime-transparent-tentacles-anal",
    sourceModelId: "transparent-tentacles-anal",
    animePositionId: "13f8c4f0-02f1-4462-ab6c-65597d0b0a49",
    title: "Transparent Tentacles / 透明触手アナル",
    file: "transparent-tentacles-anal.jpeg",
    prompt: "masterpiece, best quality, 1girl, transparent_tentacle_anal, gaping anal penetration, transparent tentacles",
    triggerWords: "transparent_tentacle_anal, gaping anal penetration, transparent tentacles"
  },
  {
    id: "pf-anime-lap-dance-sitting-sex-barstool",
    sourceModelId: "lap-dance-sitting-sex-barstool",
    animePositionId: "1c38003f-38ce-4450-8ea5-a569ad8ed896",
    title: "Lap Dance / ラップダンス",
    file: "lap-dance-sitting-sex-barstool.jpeg",
    prompt: "masterpiece, best quality, 1girl, Lap dance, Sitting on barstool, sitting on lap, anal sex, anal penetration, sitting sex, size difference, impossible fit, shy pose, front view, reverse cowgirl, facing viewer, holding, cuddling, dancing,, Detailed background, barstool, nightclub, bar, drinks,",
    triggerWords: "Lap dance, Sitting on barstool, sitting on lap, anal sex, anal penetration, sitting sex, size difference, impossible fit, shy pose, front view, reverse cowgirl, facing viewer, holding, cuddling, dancing,, Detailed background, barstool, nightclub, bar, drinks,"
  },
  {
    id: "pf-anime-rough-sex",
    sourceModelId: "rough-sex",
    animePositionId: "92787313-7a18-495e-80b2-1f8dc9a7080c",
    title: "Rough Sex / 激しいセックス",
    file: "rough-sex.jpeg",
    prompt: "masterpiece, best quality, 1girl, HGV1, covering another's mouth, handgag, covering mouth, hand over another's mouth, hand over mouth",
    triggerWords: "HGV1, covering another's mouth, handgag, covering mouth, hand over another's mouth, hand over mouth"
  },
  {
    id: "pf-anime-sweaty-steamy",
    sourceModelId: "sweaty-steamy",
    animePositionId: "fd9aac56-ddfe-4fb5-8c9e-c3ff35e059d4",
    title: "Sweaty Steamy / 汗蒸れ",
    file: "sweaty-steamy.jpeg",
    prompt: "masterpiece, best quality, 1girl, shiny skin, sweat, sweaty skin, hot, humid, wet skin, sweatdrop, smell, visible breath",
    triggerWords: "shiny skin, sweat, sweaty skin, hot, humid, wet skin, sweatdrop, smell, visible breath"
  },
  {
    id: "pf-anime-multiple-boys",
    sourceModelId: "multiple-boys",
    animePositionId: "d0a10bee-951b-456a-9e4c-fb68cdc3ee0d",
    title: "Multiple Boys / 複数男性",
    file: "multiple-boys.jpeg",
    prompt: "masterpiece, best quality, 1girl, multiple boys, hetero, nude, group sex, gangbang",
    triggerWords: "multiple boys, hetero, nude, group sex, gangbang"
  },
  {
    id: "pf-anime-imminent-penetration",
    sourceModelId: "imminent-penetration",
    animePositionId: "1c16d32a-ddfa-42b9-a3b3-cefb30b9159c",
    title: "Imminent Penetration / 挿入寸前",
    file: "imminent-penetration.jpeg",
    prompt: "masterpiece, best quality, 1girl, imminent penetration, blush, 1boy, hetero, nude, lying, penis, spread legs, on back, completely nude, erection",
    triggerWords: "imminent penetration, blush, 1boy, hetero, nude, lying, penis, spread legs, on back, completely nude, erection"
  },
  {
    id: "pf-anime-spitroast",
    sourceModelId: "spitroast",
    animePositionId: "ee52d8b7-f509-46b2-8e4e-ad4d5c021d7f",
    title: "Spitroast / 串刺し",
    file: "spitroast.jpeg",
    prompt: "masterpiece, best quality, 1girl, spitroast, hetero, sex, from side, vaginal, oral, fellatio, group sex, threesome, double penetration, completely nude",
    triggerWords: "spitroast, hetero, sex, from side, vaginal, oral, fellatio, group sex, threesome, double penetration, completely nude"
  },
  {
    id: "pf-anime-tribal-carry",
    sourceModelId: "tribal-carry",
    animePositionId: "8d910c1f-0565-4f0c-be86-d4dffce0ad02",
    title: "Tribal Carry / 部族運び",
    file: "tribal-carry.jpeg",
    prompt: "masterpiece, best quality, 1girl, tribalcarry",
    triggerWords: "tribalcarry"
  },
  {
    id: "pf-anime-leg-lock",
    sourceModelId: "leg-lock",
    animePositionId: "e0b2b990-d504-4549-9c51-b7ed48962ccc",
    title: "Leg Lock / 脚ロック",
    file: "leg-lock.jpeg",
    prompt: "masterpiece, best quality, 1girl, leg lock",
    triggerWords: "leg lock"
  },
  {
    id: "pf-anime-spooning",
    sourceModelId: "spooning",
    animePositionId: "d70f4e2d-00a8-4605-bc48-120ba6c55274",
    title: "Spooning / スプーニング",
    file: "spooning.jpeg",
    prompt: "masterpiece, best quality, 1girl, spooning, blush, 1boy, hetero, nude, lying, sex, vaginal, completely nude, on side, hug from behind",
    triggerWords: "spooning, blush, 1boy, hetero, nude, lying, sex, vaginal, completely nude, on side, hug from behind"
  },
  {
    id: "pf-anime-after-fellatio",
    sourceModelId: "after-fellatio",
    animePositionId: "ab046656-3435-4094-9a10-ab50407a4141",
    title: "After Fellatio / フェラ後",
    file: "after-fellatio.jpeg",
    prompt: "masterpiece, best quality, 1girl, after fellatio, licking penis, blush, 1boy, hetero, nude, penis, solo focus, cum, oral, facial, cum in mouth, penis on face",
    triggerWords: "after fellatio, licking penis, blush, 1boy, hetero, nude, penis, solo focus, cum, oral, facial, cum in mouth, penis on face"
  },
  {
    id: "pf-anime-after-sex-pack",
    sourceModelId: "after-sex-pack",
    animePositionId: "e78ed4b9-e69a-41a2-a1ee-713090b07b38",
    title: "After Sex Pack / 事後パック",
    file: "after-sex-pack.jpeg",
    prompt: "masterpiece, best quality, 1girl, WSASV1, after sex",
    triggerWords: "WSASV1, after sex"
  },
  {
    id: "pf-anime-shibari",
    sourceModelId: "shibari",
    animePositionId: "528554d6-0b01-4e9f-ae58-aa4e354e3473",
    title: "Shibari / 緊縛",
    file: "shibari.jpeg",
    prompt: "masterpiece, best quality, 1girl, shibari",
    triggerWords: "shibari"
  },
  {
    id: "pf-anime-penetrable-sextoy",
    sourceModelId: "penetrable-sextoy",
    animePositionId: "cf1834e8-84b0-4648-be6c-3e03fc0515b5",
    title: "Penetrable Sextoy / 貫通オナホ",
    file: "penetrable-sextoy.jpeg",
    prompt: "masterpiece, best quality, 1girl, embedded_penetrable_sex_toy, human, sexdoll",
    triggerWords: "embedded_penetrable_sex_toy, human, sexdoll"
  },
  {
    id: "pf-anime-pole-dancing",
    sourceModelId: "pole-dancing",
    animePositionId: "ad7a318d-7b63-47cf-aa19-64af864e9d75",
    title: "Pole Dancing / ポールダンス",
    file: "pole-dancing.jpeg",
    prompt: "masterpiece, best quality, 1girl, pole dancing, poledancing, stripper pole, holding",
    triggerWords: "pole dancing, poledancing, stripper pole, holding"
  },
  {
    id: "pf-anime-size-difference",
    sourceModelId: "size-difference",
    animePositionId: "b3029ec0-7531-4340-8009-7535031955c2",
    title: "Size Difference / 体格差",
    file: "size-difference.jpeg",
    prompt: "masterpiece, best quality, 1girl, taller dominante, taller submissive",
    triggerWords: "taller dominante, taller submissive"
  },
  {
    id: "pf-anime-breast-smother",
    sourceModelId: "breast-smother",
    animePositionId: "833eb4c6-31bd-41e3-996e-c2174dd564ba",
    title: "Breast Smother / 胸押し付け",
    file: "breast-smother.jpeg",
    prompt: "masterpiece, best quality, 1girl, breast smother, blush, 1boy, hetero, girl on top, between breasts, face to breasts, head between breasts, completely nude, nipples",
    triggerWords: "breast smother, blush, 1boy, hetero, girl on top, between breasts, face to breasts, head between breasts, completely nude, nipples"
  },
  {
    id: "pf-anime-standing-3p",
    sourceModelId: "standing-3p",
    animePositionId: "ede80797-e94c-4f93-a76d-34820455ba66",
    title: "Standing 3P / 立ち3P",
    file: "standing-3p.jpeg",
    prompt: "masterpiece, best quality, 1girl, standing_doggy_v3, sex from behind, threesome, 2boys, bent over, irrumatio, fellatio, group sex, mmf threesome",
    triggerWords: "standing_doggy_v3, sex from behind, threesome, 2boys, bent over, irrumatio, fellatio, group sex, mmf threesome"
  },
  {
    id: "pf-anime-closeup-facial",
    sourceModelId: "closeup-facial",
    animePositionId: "0d6fdf6d-f309-4824-84f4-39ae5f007dd2",
    title: "Closeup Facial / 顔射クローズアップ",
    file: "closeup-facial.jpeg",
    prompt: "masterpiece, best quality, 1girl, Closeup Facial",
    triggerWords: "Closeup Facial"
  },
  {
    id: "pf-anime-missionary",
    sourceModelId: "missionary",
    animePositionId: "e9b19c0d-e7cd-4aa2-adae-20efb773e4c7",
    title: "Missionary / 正常位",
    file: "missionary.jpeg",
    prompt: "masterpiece, best quality, 1girl, missionary, blush, 1boy, hetero, nude, lying, sex, spread legs, on back, vaginal, pov, rough sex",
    triggerWords: "missionary, blush, 1boy, hetero, nude, lying, sex, spread legs, on back, vaginal, pov, rough sex"
  },
  {
    id: "pf-anime-lying-split",
    sourceModelId: "lying-split",
    animePositionId: "b59daf44-7063-4619-b9c0-fb87416177cc",
    title: "Lying Split / 寝開脚",
    file: "lying-split.jpeg",
    prompt: "masterpiece, best quality, 1girl, lying, split, spread legs, flexible",
    triggerWords: "lying, split, spread legs, flexible"
  },
  {
    id: "pf-anime-male-masturbation",
    sourceModelId: "male-masturbation",
    animePositionId: "2b9c1603-921f-4bc0-815a-891676954b53",
    title: "Male Masturbation / 男性オナニー",
    file: "male-masturbation.jpeg",
    prompt: "masterpiece, best quality, 1girl, male masturbation, 1boy, hetero, nude, penis, solo focus, cum, on back, ejaculation, masturbation, projectile cum",
    triggerWords: "male masturbation, 1boy, hetero, nude, penis, solo focus, cum, on back, ejaculation, masturbation, projectile cum"
  },
  {
    id: "pf-anime-suspended-congress",
    sourceModelId: "suspended-congress",
    animePositionId: "f4dcafde-ba42-4131-8a9c-78d077fc8dbb",
    title: "Suspended Congress / 駅弁",
    file: "suspended-congress.jpeg",
    prompt: "masterpiece, best quality, 1girl, suspended congress, 1girl, standing, spread legs, double penetration, vaginal sex",
    triggerWords: "suspended congress, 1girl, standing, spread legs, double penetration, vaginal sex"
  },
  {
    id: "pf-anime-tied-to-pole",
    sourceModelId: "tied-to-pole",
    animePositionId: "28793748-93e2-4e7d-bd7d-359c6fc802c5",
    title: "Tied To Pole / ポール拘束",
    file: "tied-to-pole.jpeg",
    prompt: "masterpiece, best quality, 1girl, TOAPV2, pole, bdsm, bound",
    triggerWords: "TOAPV2, pole, bdsm, bound"
  },
  {
    id: "pf-anime-oral-cum-strings",
    sourceModelId: "oral-cum-strings",
    animePositionId: "eafc3242-07d7-420f-b2de-0511ce583ac6",
    title: "Oral Cum Strings / 口内糸引き",
    file: "oral-cum-strings.jpeg",
    prompt: "masterpiece, best quality, 1girl, str1ngs, penis, cum strings penis to mouth, after_oral",
    triggerWords: "str1ngs, penis, cum strings penis to mouth, after_oral"
  },
  {
    id: "pf-anime-instant-loss",
    sourceModelId: "instant-loss",
    animePositionId: "5a409a86-ae94-4909-b9ee-38ce2af70d27",
    title: "Instant Loss / 即堕ち",
    file: "instant-loss.jpeg",
    prompt: "masterpiece, best quality, 1girl, instant loss, blush, 1boy, hetero, nude, sex, spread legs, on back, vaginal, completely nude, missionary",
    triggerWords: "instant loss, blush, 1boy, hetero, nude, sex, spread legs, on back, vaginal, completely nude, missionary"
  },
  {
    id: "pf-anime-pubic-hair-shaving",
    sourceModelId: "pubic-hair-shaving",
    animePositionId: "f8d239bd-9f7a-4136-b0f9-d291ed60a276",
    title: "Pubic Hair Shaving / 陰毛剃り",
    file: "pubic-hair-shaving.jpeg",
    prompt: "masterpiece, best quality, 1girl, holding razor, shaving pubic hair",
    triggerWords: "holding razor, shaving pubic hair"
  },
  {
    id: "pf-anime-spread-pussy-mangurigaeshi",
    sourceModelId: "spread-pussy-mangurigaeshi",
    animePositionId: "fbc3563a-c169-4d57-bdc9-167ad15c40b5",
    title: "Spread Pussy / まんぐり返し",
    file: "spread-pussy-mangurigaeshi.jpeg",
    prompt: "masterpiece, best quality, 1girl, mangurigaeshi, upside-down, spread legs",
    triggerWords: "mangurigaeshi, upside-down, spread legs"
  },
  {
    id: "pf-anime-open-door",
    sourceModelId: "open-door",
    animePositionId: "fe380d00-5cc5-4eaa-b3ee-8ea26de2f0b7",
    title: "Open Door / ドア越し",
    file: "open-door.jpeg",
    prompt: "masterpiece, best quality, 1girl, nude, nipples, split, standing_split, standing_on_one_leg, leg_up, open door",
    triggerWords: "nude, nipples, split, standing_split, standing_on_one_leg, leg_up, open door"
  },
  {
    id: "pf-anime-competitive-swimsuit",
    sourceModelId: "competitive-swimsuit",
    animePositionId: "309d4087-741c-4f7f-af8f-bee169aefcb1",
    title: "Competitive Swimsuit / 競泳水着",
    file: "competitive-swimsuit.jpeg",
    prompt: "masterpiece, best quality, 1girl, competitive swimsuit",
    triggerWords: "competitive swimsuit"
  },
  {
    id: "pf-anime-mutual-masturbation",
    sourceModelId: "mutual-masturbation",
    animePositionId: "7ee961f1-e230-49fc-b0b7-17c0fc4d9327",
    title: "Mutual Masturbation / 相互オナニー",
    file: "mutual-masturbation.jpeg",
    prompt: "masterpiece, best quality, 1girl, fingering, mutual masturbation",
    triggerWords: "fingering, mutual masturbation"
  },
  {
    id: "pf-anime-poster-slut",
    sourceModelId: "poster-slut",
    animePositionId: "46d45c01-abd1-43a6-a2db-8788ecdab88b",
    title: "Poster Slut / 敗北ポスター",
    file: "poster-slut.jpeg",
    prompt: "masterpiece, best quality, 1girl, tongue out, poster, head back, standing, table",
    triggerWords: "tongue out, poster, head back, standing, table, fat man, cover, soda, holding bottle, picture on wall, red picture, defeat, after vaginal, panties around one leg, mature female, cumdrip, after sex, cum on body, high heels, on back, spread legs, solo focus, pussy, cum in pussy, penis, lying, nipples, 1boy, large breasts, beer bottle, milk bottle"
  },
  {
    id: "pf-anime-large-penetration",
    sourceModelId: "large-penetration",
    animePositionId: "3dc7cedc-5523-4c17-a588-2a6d1a04a83c",
    title: "Large Penetration / 大挿入",
    file: "large-penetration.jpeg",
    prompt: "masterpiece, best quality, 1girl, Large penetration",
    triggerWords: "Large penetration"
  },
  {
    id: "pf-anime-pole-dancing-v2",
    sourceModelId: "pole-dancing-v2",
    animePositionId: "410eb184-0662-4d6f-8e09-6abe4636c052",
    title: "Pole Dancing V2 / ポールダンスV2",
    file: "pole-dancing-v2.jpeg",
    prompt: "masterpiece, best quality, 1girl, pole_dancingV2",
    triggerWords: "pole_dancingV2"
  },
  {
    id: "pf-anime-wide-leg-cunnilingus",
    sourceModelId: "wide-leg-cunnilingus",
    animePositionId: "5637e178-3e85-46cd-9b0e-00a38df26ded",
    title: "Wide Leg Cunnilingus / 開脚クンニ",
    file: "wide-leg-cunnilingus.jpeg",
    prompt: "masterpiece, best quality, 1girl, wide-leg_cunnilingus",
    triggerWords: "wide-leg_cunnilingus"
  },
  {
    id: "pf-anime-deep-overflow",
    sourceModelId: "deep-overflow",
    animePositionId: "06224582-e501-4d1e-a698-3e9ea5a03475",
    title: "Deep Overflow / 深溢れ",
    file: "deep-overflow.jpeg",
    prompt: "masterpiece, best quality, 1girl, mating press, missionary, faceless male, from side, leg up",
    triggerWords: "mating press, missionary, faceless male, from side, leg up, leg lift, leg hold, clothed female nude male, interspecies, goblin, ugly man, old man, lying, boy on top, multiple views, pussy juice, cum in pussy, panties around one leg, after sex, trembling, large breasts, spread legs, sex, vaginal, pussy, penis, nipples"
  },
  {
    id: "pf-anime-body-bridge-goofy",
    sourceModelId: "body-bridge-goofy",
    animePositionId: "dc9de645-9607-43ff-a093-0fe06b0bac68",
    title: "Body Bridge / ブリッジ体位",
    file: "body-bridge-goofy.jpeg",
    prompt: "body bridge, arched back, all fours, upside-down",
    triggerWords: "body bridge, arched back, all fours, upside-down"
  },
  {
    id: "pf-anime-buttocks-wall",
    sourceModelId: "buttocks-wall",
    animePositionId: "f91dc5ae-99d3-49b9-b3e5-fb14da39b58c",
    title: "Buttocks Wall / 壁尻",
    file: "buttocks-wall.jpeg",
    prompt: "Buttocks_WallV1",
    triggerWords: "Buttocks_WallV1"
  },
  {
    id: "pf-anime-unresponsive-sex",
    sourceModelId: "unresponsive-sex",
    animePositionId: "6ff82df6-ec0a-42a9-86a3-fc3f3f442117",
    title: "Unresponsive Sex / マグロセックス",
    file: "unresponsive-sex.jpeg",
    prompt: "Unresponsive_V1",
    triggerWords: "Unresponsive_V1"
  },
  {
    id: "pf-anime-condom-v2",
    sourceModelId: "condom-v2",
    animePositionId: "4f1010ea-1c93-4585-bc41-bd1ce0e07cdc",
    title: "Condom / コンドーム",
    file: "condom-v2.jpeg",
    prompt: "Condom_V2",
    triggerWords: "Condom_V2"
  },
  {
    id: "pf-anime-cheek-bulge",
    sourceModelId: "cheek-bulge",
    animePositionId: "22fa8328-e461-49fe-82c6-cd3909322a6b",
    title: "Cheek Bulge / 頬膨らみ",
    file: "cheek-bulge.jpeg",
    prompt: "cheek bulge, oral",
    triggerWords: "cheek bulge, oral"
  },
  {
    id: "pf-anime-sperm-debt-toilet",
    sourceModelId: "sperm-debt-toilet",
    animePositionId: "27faa185-2e68-401e-932a-5ead1c699c3e",
    title: "Toilet Prostitution / 便所売春",
    file: "sperm-debt-toilet.jpeg",
    prompt: "holding money, toilet, prostitution, cum in pussy",
    triggerWords: "holding money, toilet, prostitution, cum in pussy"
  },
  {
    id: "pf-anime-breast-sucking-concept",
    sourceModelId: "breast-sucking-concept",
    animePositionId: "d0c05fc9-072b-4e8e-af94-21015879c0aa",
    title: "Breast Sucking / 乳吸い",
    file: "breast-sucking-concept.jpeg",
    prompt: "breast sucking, looking at viewer, blush, 1boy, hetero, sweat",
    triggerWords: "breast sucking, looking at viewer, blush, 1boy, hetero, sweat"
  },
  {
    id: "pf-anime-arm-on-own-eyes",
    sourceModelId: "arm-on-own-eyes",
    animePositionId: "81e7affc-d0c0-40dd-9b24-68a7ebe07a28",
    title: "Arm On Eyes / 腕で目を覆う",
    file: "arm-on-own-eyes.jpeg",
    prompt: "covering own eyes, arm up",
    triggerWords: "covering own eyes, arm up"
  },
  {
    id: "pf-anime-penis-stomach-bulge",
    sourceModelId: "penis-stomach-bulge",
    animePositionId: "12a1dfc1-bab5-4dbc-a4d0-0259bb1dbf3f",
    title: "Penis Stomach Bulge / 円柱状腹ボコ",
    file: "penis-stomach-bulge.jpeg",
    prompt: "stomach bulge",
    triggerWords: "stomach bulge"
  },
  {
    id: "pf-anime-phone-ntr",
    sourceModelId: "phone-ntr",
    animePositionId: "fa92f84d-0ac4-4244-b777-5d0c624546f0",
    title: "Phone NTR / 電話NTR",
    file: "phone-ntr.jpeg",
    prompt: "Phone_NTRV1",
    triggerWords: "Phone_NTRV1"
  },
  {
    id: "pf-anime-impregnation-concept",
    sourceModelId: "impregnation-concept",
    animePositionId: "001278a5-5785-4dd0-9698-27898a1aade1",
    title: "Impregnation / 孕ませ",
    file: "impregnation-concept.jpeg",
    prompt: "impregnation, cross-section, internal cumshot, uterus, ovum, fertilization",
    triggerWords: "impregnation, cross-section, internal cumshot, uterus, ovum, fertilization"
  },
  {
    id: "pf-anime-airhead-expression",
    sourceModelId: "airhead-expression",
    animePositionId: "691968d7-9cb4-4b59-a9ed-a25f8d8045f8",
    title: "Airhead Expression / アホ顔",
    file: "airhead-expression.jpeg",
    prompt: "pearlyai, airhead, blushing, drooling",
    triggerWords: "pearlyai, airhead, blushing, drooling"
  }
];

function playfluxVideoTemplatePrompt(title = "") {
  return `Use the uploaded adult character image as Image 1. Generate a cinematic vertical 5 second video matching this template: ${title}. Keep the same identity, face, hairstyle, body type, and outfit unless the template prompt explicitly changes them. No subtitles, no watermark, stable hands, stable anatomy.`;
}

function playfluxTemplateAssetUrl(kind = "", file = "") {
  return `${PLAYFLUX_TEMPLATE_ASSET_BASE}${kind}/${file}`;
}

const PLAYFLUX_VIDEO_TEMPLATES = PLAYFLUX_VIDEO_TEMPLATE_DATA.map((item, index) => {
  const previewUrl = playfluxTemplateAssetUrl("video", item.videoFile);
  return {
    id: item.id,
    tab: "video",
    title: item.title,
    badge: item.badge || "",
    previewType: "video",
    previewUrl,
    posterUrl: item.posterFile ? playfluxTemplateAssetUrl("video", item.posterFile) : "",
    credits: index === 0 ? 1600 : 1500,
    prompt: item.prompt || playfluxVideoTemplatePrompt(item.title),
    sourceModelId: item.sourceModelId || "",
    seedanceMode: "reference_video",
    usePreviewAsReference: true,
    referenceVideoUrl: previewUrl,
    referenceVideoDurationSeconds: Number(item.referenceVideoDurationSeconds || 5),
    duration: 5,
    resolution: "720p",
    ratio: "9:16",
  };
});

const PLAYFLUX_IMAGE_TEMPLATES = PLAYFLUX_IMAGE_TEMPLATE_DATA.map((item) => {
  const sourceCount = Math.max(0, Number(item.sourceCount || 0));
  const sourceRequired = Boolean(item.sourceRequired || sourceCount > 0);
  return {
    id: item.id,
    tab: "image",
    title: item.title,
    badge: item.badge || "",
    previewType: "image",
    previewUrl: playfluxTemplateAssetUrl("image", item.file),
    credits: 200,
    createMode: sourceRequired ? "image-edit" : "image-create",
    sourceRequired,
    sourceCount,
    sourceModelId: item.sourceModelId || "",
    tags: item.tags || [],
    prompt: item.prompt || "",
    negativePrompt: PLAYFLUX_NEGATIVE_PROMPT,
    resolution: "1K",
    ratio: "9:16",
  };
});

const PLAYFLUX_ANIME_TEMPLATES = PLAYFLUX_ANIME_TEMPLATE_DATA.map((item) => ({
  id: item.id,
  tab: "anime",
  title: item.title,
  badge: "",
  previewType: "image",
  previewUrl: playfluxTemplateAssetUrl("anime", item.file),
  credits: 140,
  createMode: "anime-text-image",
  sourceRequired: false,
  sourceCount: 0,
  sourceModelId: item.sourceModelId || "",
  animePositionId: item.animePositionId || "",
  animeBaseStyleId: "nova-anime-xl",
  animeBaseStyleLabel: "Nova Anime XL",
  triggerWords: item.triggerWords || "",
  prompt: item.prompt || item.triggerWords || "",
  negativePrompt: PLAYFLUX_ANIME_NEGATIVE_PROMPT,
  resolution: "1K",
  ratio: "9:16",
}));

const PLAYFLUX_TEMPLATES = [
  ...PLAYFLUX_VIDEO_TEMPLATES,
  ...PLAYFLUX_IMAGE_TEMPLATES,
  ...PLAYFLUX_ANIME_TEMPLATES,
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
  const normalized = String(platformHashParts(value).tab || "").toLowerCase();
  return PLAYFLUX_GALLERY_MODE_BY_HASH[normalized] || "";
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

function canUseAnimeTemplates() {
  return isWorkflowTester();
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
  mobileDrawerToggle: document.querySelector("#mobileDrawerToggle"),
  mobileDrawerBackdrop: document.querySelector("#mobileDrawerBackdrop"),
  mobileDrawerUserName: document.querySelector("#mobileDrawerUserName"),
  mobileDrawerCredits: document.querySelector("#mobileDrawerCredits"),
  mobileDrawerTopupBtn: document.querySelector("#mobileDrawerTopupBtn"),
  mobileDrawerLoginBtn: document.querySelector("#mobileDrawerLoginBtn"),
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
