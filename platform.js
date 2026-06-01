"use strict";

const TOKEN_KEY = "raisingGameToken";
const LANG_KEY = "raisingGameLanguage";
const TAB_KEY = "raisingGamePlatformTab";
const ALL_TABS = new Set(["gallery", "characters", "advanced", "assets", "access", "history", "topups", "spending"]);
const DEFAULT_TEMPLATE_COVER = "/assets/admin/home/default-hero.jpg";
const ADVANCED_SEEDANCE_FPS = 24;
const ADVANCED_SEEDANCE_720P_CNY_PER_MILLION_TOKENS = 46;
const ADVANCED_SEEDANCE_1080P_CNY_PER_MILLION_TOKENS = 51;
const ADVANCED_SEEDANCE_480P_CREDITS_PER_SECOND = 75;
const ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND = 150;
const ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND = 300;
const ADVANCED_SEEDANCE_VIDEO_INPUT_480P_CREDITS_PER_SECOND = 50;
const ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND = 100;
const ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND = 200;
const ADVANCED_SEEDANCE_FAST_DISCOUNT = 0.8;
const ADVANCED_WAN27_720P_CREDITS_PER_SECOND = 100;
const ADVANCED_WAN27_1080P_CREDITS_PER_SECOND = 250;
const ADVANCED_GENERATION_MARKUP = 1.5;
const DEFAULT_ADVANCED_PROVIDER = "wan27";
const ADVANCED_SEEDANCE_REFERENCE_LIMIT = 9;
const ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES = 8 * 1024 * 1024;
const ADVANCED_WAN_CLIP_MAX_BYTES = 30 * 1024 * 1024;
const ADVANCED_WAN_CLIP_MAX_SECONDS = 5.05;
const DEFAULT_ASSET_IMAGE_MODIFY_CREDITS = 84.3098;
const MIN_TOPUP_AMOUNT = 1;
const DEFAULT_TOPUP_AMOUNT = 100;
const TOPUP_RECORDS_AUTO_REFRESH_MS = 15000;
const DEFAULT_PLATFORM_TAB = "gallery";
const DEFAULT_GALLERY_MODE = "hot";
const ADVANCED_CASE_TABS = [
  { id: "hot", labelKey: "advanced.caseTab.hot" },
  { id: "extend", labelKey: "advanced.caseTab.extend" },
  { id: "replace", labelKey: "advanced.caseTab.replace" },
];
const ADVANCED_CASE_PAGE_SIZE = { hot: 9, extend: 3, replace: 3 };

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

function normalizePlatformTab(value = "") {
  const normalized = String(value || "").trim().replace(/^#\/?/, "");
  return ALL_TABS.has(normalized) ? normalized : DEFAULT_PLATFORM_TAB;
}

function initialPlatformTab() {
  if (window.location.hash) return normalizePlatformTab(window.location.hash);
  return normalizePlatformTab(localStorage.getItem(TAB_KEY) || "");
}

const state = {
  config: null,
  templates: [],
  categories: [],
  estimates: {},
  tab: initialPlatformTab(),
  galleryMode: DEFAULT_GALLERY_MODE,
  characterSource: "system",
  category: "all",
  homeCharacters: [],
  activeGalleryCharacterId: "",
  galleryUnlocks: [],
  galleryUnlocksLoaded: false,
  galleryUnlockMessage: "",
  galleryUnlockLoadingKey: "",
  advancedCases: [],
  activeAdvancedCaseId: "",
  activeAdvancedCaseTab: "hot",
  advancedCasePages: { hot: 1, extend: 1, replace: 1 },
  advancedEstimate: null,
  advancedEstimateKey: "",
  advancedEstimateTimer: 0,
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
  paypalConfig: null,
  token: localStorage.getItem(TOKEN_KEY) || "",
  lang: localStorage.getItem(LANG_KEY) || "en",
  user: null,
  loginMode: "login",
  showAccessToken: false,
  showAccountToken: false,
  topupRecords: { page: 1, limit: 12, total: 0, totalPages: 1, records: [] },
  spendingRecords: { page: 1, limit: 12, total: 0, totalPages: 1, records: [], types: [] },
  historyRecords: [],
  historyRecordsPage: 1,
  historyRecordsLimit: 8,
  historyRecordsTotal: 0,
  historyRecordsTotalPages: 1,
  assetSearchTimer: 0,
  advancedAssetSearchTimer: 0,
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
};

function tenantFeature(name, fallback = true) {
  const features = state.config?.tenantFeatures;
  if (!features || features[name] === undefined) return fallback;
  return Boolean(features[name]);
}

function isTabAllowed(tab) {
  return tab !== "assets" || tenantFeature("assetLibrary", true);
}

const els = {
  brandName: document.querySelector("#brandName"),
  languageSelect: document.querySelector("#languageSelect"),
  categoryRow: document.querySelector("#categoryRow"),
  galleryModeTabs: document.querySelector("#galleryModeTabs"),
  templateGrid: document.querySelector("#templateGrid"),
  characterGrid: document.querySelector("#characterGrid"),
  characterSourceTabs: document.querySelector("#characterSourceTabs"),
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
  topupTriggerBtn: document.querySelector("#topupTriggerBtn"),
  topupTriggerCredits: document.querySelector("#topupTriggerCredits"),
  topupPanel: document.querySelector("#topupPanel"),
  topupAmount: document.querySelector("#topupAmount"),
  topupCredits: document.querySelector("#topupCredits"),
  topupRate: document.querySelector("#topupRate"),
  topupWalletOptions: document.querySelector("#topupWalletOptions"),
  createTopupBtn: document.querySelector("#createTopupBtn"),
  topupQrDialog: document.querySelector("#topupQrDialog"),
  topupQrAmount: document.querySelector("#topupQrAmount"),
  topupQrCopyBtn: document.querySelector("#topupQrCopyBtn"),
  topupWalletQr: document.querySelector("#topupWalletQr"),
  topupWalletNetwork: document.querySelector("#topupWalletNetwork"),
  topupWalletAddress: document.querySelector("#topupWalletAddress"),
  paypalBox: document.querySelector("#paypalBox"),
  paypalButtons: document.querySelector("#paypalButtons"),
  paypalStatus: document.querySelector("#paypalStatus"),
  previewDialog: document.querySelector("#previewDialog"),
  previewTitle: document.querySelector("#previewTitle"),
  previewVideo: document.querySelector("#previewVideo"),
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
  advancedPrompt: document.querySelector("#advancedPrompt"),
  advancedImage: document.querySelector("#advancedImage"),
  advancedUploadBox: document.querySelector("#advancedUploadBox"),
  advancedUploadPreview: document.querySelector("#advancedUploadPreview"),
  advancedProvider: document.querySelector("#advancedProvider"),
  advancedSeedanceTier: document.querySelector("#advancedSeedanceTier"),
  advancedRatio: document.querySelector("#advancedRatio"),
  advancedResolution: document.querySelector("#advancedResolution"),
  advancedDuration: document.querySelector("#advancedDuration"),
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

const I18N = {
  en: {
    "nav.gallery": "Explore",
    "nav.characters": "Characters",
    "nav.advanced": "Create",
    "nav.assets": "Assets",
    "nav.access": "API Access",
    "nav.history": "History",
    "nav.topups": "Top-ups",
    "nav.spending": "Spending",
    "nav.game": "Game",
    "nav.login": "Login / Sign up",
    "common.close": "Close",
    "common.optional": "Optional",
    "common.generate": "Generate",
    "common.hide": "Hide",
    "common.showFull": "Show full",
    "common.copyToken": "Copy token",
    "common.copied": "Copied",
    "common.copiedToken": "Copied token",
    "common.preview": "Preview",
    "common.all": "All",
    "common.credits": "credits",
    "common.fullscreen": "Fullscreen",
    "common.delete": "Delete",
    "common.deleting": "Deleting...",
    "footer.note": "Responsible AI video generation for creative workflows.",
    "legal.kicker": "Legal",
    "legal.privacy": "Privacy Policy",
    "legal.registration": "User Registration Agreement",
    "legal.disclaimer": "Disclaimer",
    "legal.updated": "Last updated: {date}",
    "field.prompt": "Prompt",
    "field.model": "Model",
    "field.ratio": "Ratio",
    "field.resolution": "Resolution",
    "field.duration": "Duration",
    "hero.gallery.eyebrow": "Gallery",
    "copy.galleryTitle": "Create AI videos",
    "copy.gallerySubtitle": "Choose a template, upload an image or enter text, and create a new video.",
    "copy.galleryNotice": "Generated results are saved in your history.",
    "copy.accessTitle": "API Access",
    "copy.accessSubtitle": "Connect your product, scripts, agents, or MCP wrapper to the production generation API.",
    "copy.accessNotice": "All examples below call the current production API. Upstream JSON stays server-side.",
    "copy.advancedTitle": "Advanced Generate",
    "copy.advancedSubtitle": "Direct model controls for approved accounts.",
    "copy.advancedNotice": "Apply once. After approval, cases can fill the form automatically.",
    "copy.assetsTitle": "Asset Library",
    "copy.assetsSubtitle": "Manage images and videos for character references.",
    "copy.assetsNotice": "References are reused after first preparation.",
    "copy.historyTitle": "Generation History",
    "copy.historySubtitle": "Review your generated videos, prompts, parameters and billing in one compact list.",
    "copy.historyNotice": "Only your own generation records are shown.",
    "copy.topupsTitle": "Top-up Records",
    "copy.topupsSubtitle": "Review USDT top-up orders with search, pagination and export.",
    "copy.topupsNotice": "Top-up orders are listed separately from spending records.",
    "copy.spendingTitle": "Spending Records",
    "copy.spendingSubtitle": "Review credit consumption across generation and unlock actions.",
    "copy.spendingNotice": "Only actual credit deductions are shown here.",
    "hero.access.eyebrow": "Integration",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "Advanced",
    "hero.advanced.badge": "Permission",
    "hero.assets.eyebrow": "Library",
    "hero.assets.badge": "Images + Videos",
    "hero.history.eyebrow": "History",
    "hero.history.badge": "Records",
    "hero.topups.eyebrow": "Billing",
    "hero.topups.badge": "Top-ups",
    "hero.spending.eyebrow": "Billing",
    "hero.spending.badge": "Credits",
    "hero.gallery.badge": "Templates",
    "gallery.title": "Video Cases",
    "gallery.subtitle": "Start from a proven advanced case or choose a maintained character.",
    "gallery.noTemplates": "No cases available yet.",
    "gallery.mode.cases": "Cases",
    "gallery.mode.characters": "Characters",
    "gallery.character.empty": "No characters in the admin library yet.",
    "gallery.character.use": "Use character",
    "gallery.character.viewCases": "View videos",
    "gallery.character.back": "Characters",
    "gallery.character.roleVideos": "Character videos",
    "gallery.character.sceneVideos": "Scene videos",
    "gallery.character.noVideos": "No videos configured for this character yet.",
    "gallery.character.unlock": "Unlock {cost} credits",
    "gallery.character.unlocked": "Unlocked",
    "gallery.character.locked": "Locked",
    "gallery.character.play": "Play",
    "gallery.character.useThis": "Use this character",
    "gallery.character.unlockLogin": "Login to unlock scene videos.",
    "gallery.character.unlocking": "Unlocking...",
    "gallery.character.unlockFailed": "Unlock failed: {message}",
    "gallery.character.unlockReady": "Scene unlocked.",
    "characters.eyebrow": "Characters",
    "characters.title": "Characters",
    "characters.subtitle": "Use a maintained character or generate your own role image.",
    "characters.systemTab": "System Characters",
    "characters.customTab": "Custom Characters",
    "characters.customEmpty": "No custom characters yet. Create one from the panel on the right.",
    "characters.createEyebrow": "Create Image",
    "characters.createTitle": "Create character",
    "characters.createPlaceholder": "Describe the character's age, face, body, hairstyle, outfit and style...",
    "characters.createButton": "Create character",
    "characters.createLogin": "Login to create characters.",
    "characters.creating": "Creating character...",
    "characters.created": "Character image saved to history. Use Add asset in history to add it to assets.",
    "characters.createFailed": "Create failed: {message}",
    "characters.takeOff": "Take off",
    "characters.modify": "Modify",
    "characters.modifyTitle": "Modify character",
    "characters.modifyPlaceholder": "Describe what to change while preserving this character...",
    "characters.takeOffPrompt": "脱掉所有衣服，保持裸体，不要出现肉色衣服",
    "characters.takeOffConfirm": "Confirm to generate a modified image. The result will be saved to history.",
    "characters.takeOffRunning": "Generating image... Keep this dialog open to see the result.",
    "characters.takeOffDone": "Image generated.",
    "characters.takeOffSaved": "Saved to history. Use Add asset in history to add it to assets.",
    "characters.takeOffDoneButton": "Done",
    "characters.useReady": "{name} selected.",
    "characters.modifyDone": "Modified image saved to history.",
    "characters.delete": "Delete",
    "characters.deleteFailed": "Delete failed: {message}",
    "category.featured": "Featured",
    "category.i2v": "Image to Video",
    "category.t2v": "Text to Video",
    "template.imageToVideo": "Image to Video",
    "template.textToVideo": "Text to Video",
    "template.generate": "Generate - {cost}",
    "templateTitle.angel-rise": "Clockwork Angel",
    "templateTitle.hero-rescue": "Superhero Rescue",
    "templateTitle.product-fire": "Fire Product Showcase",
    "cost.checking": "Checking cost...",
    "cost.unavailable": "Cost unavailable",
    "cost.seconds": "{value}s",
    "cost.credits": "{credits} credits",
    "cost.creditsDuration": "{credits} credits - {duration}",
    "billing.pending": "Prepaid {pre}, final {final}, pending",
    "billing.final": "Prepaid {pre}, final {final}",
    "billing.prepaid": "Prepaid {pre}",
    "billing.noCharge": "No charge",
    "topup.title": "Top Up",
    "topup.amount": "Amount",
    "topup.compact": "Top Up",
    "topup.dialogTitle": "Top up credits",
    "topup.createOrder": "Create USDT order",
    "topup.usdtTitle": "USDT backup",
    "topup.walletNetwork": "USDT network",
    "topup.walletNetworkHint": "Choose the network you will transfer from.",
    "topup.login": "Login to create a payment order.",
    "topup.rate": "{amount} {asset} via {network}. Credits use RMB cents.",
    "topup.payExactly": "Pay exactly",
  "topup.copyAddress": "Copy address",
  "topup.showQr": "Show QR",
  "topup.addressCopied": "Address copied. Transfer the exact amount shown.",
  "topup.invalid": "Enter a valid USDT amount.",
  "topup.creating": "Creating payment order...",
  "topup.created": "Order created. Transfer the exact amount including suffix.",
  "topup.paypalTitle": "PayPal Checkout",
  "topup.paypalLoading": "Loading PayPal...",
  "topup.paypalUnavailable": "PayPal is not configured yet.",
  "topup.paypalReady": "Pay securely with PayPal.",
  "topup.paypalCreating": "Opening PayPal checkout...",
  "topup.paypalApproved": "Payment approved. Confirming credits...",
  "topup.paypalPaid": "Payment completed. Credits added.",
  "topup.paypalCancelled": "PayPal payment cancelled.",
  "topup.paypalOrder": "PayPal order",
  "topup.provider": "Provider",
    "advanced.models": "Create Character Video",
    "advanced.title": "Create from image or story",
    "advanced.subtitle": "Upload or select assets, choose a model, and create a new video.",
    "advanced.promptPlaceholder": "Describe the video you want...",
    "advanced.uploadReference": "Upload reference image(s)",
    "advanced.wanMode": "Wan2.7 input",
    "advanced.wanModeFirst": "Single image",
    "advanced.wanModeFirstLast": "First + last image",
    "advanced.wanModeFirstAudio": "Image + audio",
    "advanced.wanModeFirstLastAudio": "First + last image + audio",
    "advanced.wanModeClip": "Video continuation",
    "advanced.wanModeClipLast": "Video continuation + last image",
    "advanced.firstFrame": "First frame",
    "advanced.lastFrame": "Last frame image",
    "advanced.audioUrl": "Driving audio URL",
    "advanced.clipUrl": "Source video URL",
    "advanced.clipUpload": "Source video file",
    "advanced.clipRequired": "Source video file or URL is required.",
    "advanced.clipTooLarge": "Source video must be 30MB or smaller.",
    "advanced.clipTooLong": "Source video must be 5 seconds or shorter.",
    "advanced.seedanceHandling": "Seedance image handling",
    "advanced.seedanceMode": "Seedance input",
    "advanced.seedanceModeText": "Text only",
    "advanced.seedanceModeFirst": "First frame image",
    "advanced.seedanceModeFirstLast": "First + last image",
    "advanced.seedanceModeReference": "Reference images",
    "advanced.seedanceModeVideo": "Reference video/audio",
    "advanced.seedanceVideoUrls": "Reference video URLs",
    "advanced.seedanceAudioUrls": "Reference audio URLs",
    "advanced.seedanceFirstRequired": "First frame image is required for this Seedance mode.",
    "advanced.seedanceLastRequired": "Last frame image is required for this Seedance mode.",
    "advanced.seedanceVideoRequired": "Reference video is required for this Seedance mode.",
    "advanced.prepareReference": "Prepare safe reference",
    "advanced.originalImage": "Use original image",
    "advanced.seedanceReferenceHint": "Seedance will use all selected images as references.",
    "advanced.seedanceReferenceCount": "{count} reference image(s) selected.",
    "advanced.wanFirstFrameHint": "Wan2.7 first frame selected.",
    "advanced.referenceImageTooLarge": "Each reference image must be 8MB or smaller.",
    "advanced.referenceImageTooMany": "Seedance supports up to {count} reference images.",
    "advanced.randomSeed": "Random seed",
    "advanced.cases": "Video Cases",
    "advanced.caseTitle": "Choose a video case",
    "advanced.assets": "Assets",
    "advanced.assetTitle": "Add from assets",
    "advanced.assetSubtitle": "Choose a target below, or click a media box on the left, then add an asset here.",
    "advanced.assetTargets": "Targets",
    "advanced.assetTargetPrimary": "First frame",
    "advanced.assetTargetSourceImage": "Source image",
    "advanced.assetTargetSourceImages": "Source images",
    "advanced.assetTargetReferenceImages": "Reference images",
    "advanced.assetTargetLastFrame": "Last frame",
    "advanced.assetTargetVideo": "Reference video / source clip",
    "advanced.assetTargetAudio": "Reference audio",
    "advanced.assetAdd": "Add",
    "advanced.assetAdded": "Added to {target}.",
    "advanced.assetWrongType": "{target} needs {type}.",
    "advanced.assetSelectTarget": "Select a target on the left or below first.",
    "advanced.approvalRequired": "LOGIN REQUIRED",
    "advanced.inviteOnly": "Login to continue",
    "advanced.loginFirst": "Advanced generation is available to every signed-in user.",
    "advanced.requestTitle": "Apply for advanced generation",
    "advanced.requestSubmittedTitle": "Request submitted",
    "advanced.requestDesc": "Direct model controls require manual approval.",
    "advanced.requestSubmittedDesc": "Your request is waiting for review.",
    "advanced.contactSupport": "Contact support",
    "advanced.applyAccess": "Apply access",
    "advanced.waitingApproval": "Waiting for approval",
    "advanced.requestSubmitted": "Request submitted.",
    "advanced.promptRequired": "Prompt is required.",
    "advanced.referenceSeedance": "Reference selected. Seedance will use {mode}.",
    "advanced.referenceWan": "First frame selected. Wan2.7 will use it as the opening frame.",
    "advanced.safeReference": "safe reference",
    "advanced.originalReference": "original image",
    "advanced.submitting": "Submitting advanced generation{note} - {cost}...",
    "advanced.notePrepare": " - preparing safe reference first",
    "advanced.noteOriginal": " - using original image",
    "advanced.noteWan": " - using uploaded image as first frame",
    "advanced.jobSubmitted": "Job submitted: {taskId} - {credits} credits",
    "advanced.loadedCase": "Loaded case: {title} - {cost}",
    "advanced.defaultCase": "Advanced case",
    "advanced.noCases": "No cases configured yet.",
    "advanced.usePrompt": "Use prompt",
    "advanced.casePromptHint": "One image is enough to create the same style video.",
    "advanced.casePromptLoaded": "Case loaded. Upload one image and generate the same style video.",
    "advanced.casePromptFallback": "Create a matching video based on the uploaded image.",
    "advanced.caseInputVideo": "Input video",
    "advanced.caseInputImage": "Input image",
    "advanced.caseImage": "Image",
    "advanced.caseResultVideo": "Result video",
    "advanced.caseTab.hot": "Hot",
    "advanced.caseTab.extend": "Extend",
    "advanced.caseTab.replace": "Replace",
    "advanced.imageTooLarge": "Image must be 8MB or smaller.",
    "assets.eyebrow": "Library",
    "assets.title": "Asset Library",
    "assets.subtitle": "Search, upload and reuse your images and videos.",
    "assets.type": "Type",
    "assets.image": "Images",
    "assets.video": "Videos",
    "assets.audio": "Audio",
    "assets.upload": "Upload",
    "assets.searchPlaceholder": "Name / ID",
    "assets.loginRequired": "Login required",
    "assets.loginDesc": "Sign in to view and upload assets.",
    "assets.emptyTitle": "No assets yet.",
    "assets.emptyDesc": "Upload images or videos to reuse in advanced generation.",
    "assets.loading": "Loading assets...",
    "assets.uploading": "Uploading assets...",
    "assets.uploaded": "Uploaded {count} asset(s).",
    "assets.uploadFailed": "Upload failed: {message}",
    "assets.loadFailed": "Load failed: {message}",
    "assets.delete": "Delete",
    "assets.use": "Use",
    "assets.modify": "Modify",
    "assets.modifyTitle": "Modify image",
    "assets.modifyPromptPlaceholder": "Describe what to change while keeping the subject consistent...",
    "assets.modifyHint": "The edited result is saved to history first.",
    "assets.modified": "Modified image saved to history.",
    "assets.generating": "Generating...",
    "assets.extend": "Extend",
    "assets.replace": "Replace",
    "assets.seedanceReady": "Seedance ready",
    "assets.seedancePending": "Seedance asset will be created on first use",
    "assets.used": "Loaded into Advanced.",
    "assets.replaced": "Replace prompt loaded.",
    "assets.extended": "Extend prompt loaded.",
    "access.integration": "Integration",
    "access.title": "API Access",
    "access.subtitle": "Connect your product or workflow to the current production generation API.",
    "access.currentToken": "Current API token",
    "access.tokenLogin": "Login to auto-fill your token",
    "access.tokenHintUser": "Copied snippets use the full token. The page masks it by default.",
    "access.tokenHintGuest": "Login first, then snippets below will use your token automatically.",
    "access.copyKicker": "COPY AND CONNECT",
    "access.modelDocs": "Model docs",
    "access.modelsJson": "Models JSON",
    "access.copySnippet": "Copy snippet",
    "access.subtokensTitle": "Sub tokens",
    "access.subtokensDesc": "Create limited child tokens for scripts or downstream accounts. They share your parent balance and stop when the parent balance is insufficient.",
    "access.subtokensLogin": "Login to manage sub tokens.",
    "access.subtokenName": "Name",
    "access.subtokenNamePlaceholder": "Client or project name",
    "access.subtokenQuotaType": "Limit type",
    "access.subtokenAmount": "Credits",
    "access.subtokenCount": "Requests",
    "access.subtokenQuota": "Quota",
    "access.subtokenQuotaPlaceholder": "1000",
    "access.subtokenExpires": "Expires",
    "access.subtokenNoExpiry": "No expiry",
    "access.createSubtoken": "Create sub token",
    "access.subtokenCreated": "Sub token created. Copy it now; existing tokens are masked later.",
    "access.subtokenCreateFailed": "Create failed: {message}",
    "access.subtokenLoadFailed": "Load failed: {message}",
    "access.subtokenEmpty": "No sub tokens yet.",
    "access.subtokenRemaining": "Remaining",
    "access.subtokenUsed": "Used",
    "access.subtokenStatus": "Status",
    "access.subtokenLastUsed": "Last used",
    "access.subtokenNever": "Never",
    "access.subtokenRevoke": "Revoke",
    "access.subtokenRevoked": "Revoked",
    "access.subtokenExpired": "Expired",
    "access.subtokenActive": "Active",
    "access.subtokenCopied": "Sub token copied",
    "access.subtokenCopyNew": "Copy new token",
    "access.subtokenCopiedShort": "Copied",
    "access.subtokenMasked": "Masked",
    "access.subtokenEdit": "Edit",
    "access.subtokenSave": "Save",
    "access.subtokenCancel": "Cancel",
    "access.subtokenRemainingEdit": "Set remaining",
    "access.subtokenRemainingAmountEdit": "Remaining credits",
    "access.subtokenRemainingCountEdit": "Remaining requests",
    "access.subtokenUpdateFailed": "Update failed: {message}",
    "access.subtokenRevokeFailed": "Revoke failed: {message}",
    "guide.http.title": "HTTP API",
    "guide.http.subtitle": "Direct endpoint",
    "guide.http.desc": "Production endpoint. Submit generation jobs and query records/results.",
    "guide.typescript.title": "TypeScript",
    "guide.typescript.subtitle": "Server code",
    "guide.typescript.desc": "A working fetch wrapper around the same production HTTP API.",
    "guide.python.title": "Python",
    "guide.python.subtitle": "Server code",
    "guide.python.desc": "A working requests wrapper around the same production HTTP API.",
    "guide.cli.title": "CLI",
    "guide.cli.subtitle": "curl",
    "guide.cli.desc": "Direct curl commands for submitting and checking generation jobs.",
    "guide.agent.title": "Agent Kit",
    "guide.agent.subtitle": "Prompt rules",
    "guide.agent.desc": "Copy these rules into an agent so it calls the production API instead of inventing upstream parameters.",
    "guide.mcp.title": "MCP",
    "guide.mcp.subtitle": "HTTP wrapper",
    "guide.mcp.desc": "MCP is available through a wrapper around the current HTTP API; there is no separate hosted MCP endpoint yet.",
    "history.eyebrow": "History",
    "history.title": "Generation Records",
    "history.subtitle": "Compact list of your generated videos, prompts and parameters.",
    "history.refresh": "Refresh",
    "history.loginRequired": "Login required",
    "history.loginDesc": "Sign in to view your generation records.",
    "history.login": "Login",
    "history.emptyTitle": "No generation records yet.",
    "history.emptyDesc": "Your submitted gallery and advanced jobs will appear here.",
    "history.job": "Generation job",
    "history.viewParameters": "View parameters",
    "history.loading": "Loading generation records...",
    "history.loadFailed": "Load failed: {message}",
    "history.regenerate": "Regenerate",
    "history.regenerating": "Regenerating...",
    "history.regenerateSubmitted": "Submitted",
    "history.addAsset": "Add asset",
    "history.addingAsset": "Adding...",
    "history.assetAdded": "Added",
    "history.delete": "Delete",
    "history.deleting": "Deleting...",
    "history.deleteFailed": "Delete failed: {message}",
    "history.detailTitle": "Generation detail",
    "history.inputImages": "Input images",
    "history.parameters": "Parameters",
    "history.result": "Result",
    "history.noInputImages": "No input images recorded.",
    "ledger.search": "Search",
    "ledger.status": "Status",
    "ledger.type": "Type",
    "ledger.from": "From",
    "ledger.to": "To",
    "ledger.query": "Query",
    "ledger.export": "Export",
    "ledger.prev": "Prev",
    "ledger.next": "Next",
    "ledger.page": "Page {page} / {totalPages} · {total} records",
    "ledger.loginRequired": "Login required",
    "ledger.loginDesc": "Sign in to view billing records.",
    "ledger.empty": "No records found.",
    "ledger.loading": "Loading records...",
    "ledger.loadFailed": "Load failed: {message}",
    "ledger.allStatuses": "All statuses",
    "ledger.status.pending": "Pending",
    "ledger.status.paid": "Paid",
    "ledger.status.cancelled": "Cancelled",
    "ledger.allTypes": "All types",
    "ledger.orderId": "Order ID",
    "ledger.createdAt": "Created",
    "ledger.paidAt": "Paid",
    "ledger.amount": "Amount",
    "ledger.payable": "Payable",
    "ledger.credits": "Credits",
    "ledger.balanceAfter": "Balance after",
    "ledger.title": "Title",
    "ledger.taskId": "Task ID",
    "topups.eyebrow": "Billing",
    "topups.title": "Top-up Records",
    "topups.subtitle": "Search and export your top-up orders.",
    "topups.searchPlaceholder": "Order ID / status",
    "spending.eyebrow": "Billing",
    "spending.title": "Spending Records",
    "spending.subtitle": "Search and export your credit consumption records.",
    "spending.searchPlaceholder": "Task / type / title",
    "status.completed": "Completed",
    "status.failed": "Failed",
    "status.processing": "Processing",
    "status.submitted": "Submitted",
    "modal.imageToVideo": "Image to Video",
    "modal.textToVideo": "Text to Video",
    "modal.createVideo": "Create video",
    "modal.uploadReference": "Upload reference image",
    "modal.promptNote": "The prompt is submitted exactly as entered. Leave it empty to use the saved prompt.",
    "modal.loginBeforeGenerate": "Please log in before generating.",
    "modal.submitting": "Submitting generation job...",
    "modal.submitted": "Job submitted: {taskId}. Check progress in history.",
    "modal.readImageFailed": "Failed to read image",
    "auth.login": "Login",
    "auth.createAccount": "Create account",
    "auth.createAndLogin": "Create and login",
    "auth.alreadyAccount": "Already have an account",
    "auth.username": "Username",
    "auth.password": "Password, at least 6 characters",
    "auth.invalid": "Enter a username and a password with at least 6 characters.",
    "account.title": "Account",
    "account.credits": "Credits",
    "account.role": "Role",
    "account.apiToken": "API token",
    "account.loginToViewToken": "Login to view token",
    "account.logout": "Log out",
  },
  vi: {
    "nav.gallery": "Thư viện",
    "nav.advanced": "Nâng cao",
    "nav.access": "Truy cập API",
    "nav.history": "Lịch sử",
    "nav.topups": "Nạp tiền",
    "nav.spending": "Chi tiêu",
    "nav.game": "Trò chơi",
    "nav.login": "Đăng nhập / Đăng ký",
    "common.close": "Đóng",
    "common.optional": "Tùy chọn",
    "common.generate": "Tạo",
    "common.hide": "Ẩn",
    "common.showFull": "Hiện đầy đủ",
    "common.copyToken": "Sao chép token",
    "common.copied": "Đã sao chép",
    "common.copiedToken": "Đã sao chép token",
    "common.preview": "Xem trước",
    "common.all": "Tất cả",
    "common.credits": "credits",
    "common.fullscreen": "Toàn màn hình",
    "footer.note": "Tạo video AI có trách nhiệm cho quy trình sáng tạo.",
    "legal.kicker": "Pháp lý",
    "legal.privacy": "Chính sách quyền riêng tư",
    "legal.registration": "Thỏa thuận đăng ký người dùng",
    "legal.disclaimer": "Tuyên bố miễn trừ trách nhiệm",
    "legal.updated": "Cập nhật lần cuối: {date}",
    "field.prompt": "Prompt",
    "field.model": "Mô hình",
    "field.ratio": "Tỷ lệ",
    "field.resolution": "Độ phân giải",
    "field.duration": "Thời lượng",
    "hero.gallery.eyebrow": "Thư viện",
    "copy.galleryTitle": "Tạo video AI",
    "copy.gallerySubtitle": "Chọn mẫu, tải ảnh lên hoặc nhập văn bản để tạo video mới.",
    "copy.galleryNotice": "Kết quả tạo sẽ được lưu trong lịch sử của bạn.",
    "copy.accessTitle": "Truy cập API",
    "copy.accessSubtitle": "Kết nối sản phẩm, script, agent hoặc MCP wrapper với API tạo video production.",
    "copy.accessNotice": "Tất cả ví dụ bên dưới gọi API production hiện tại. JSON upstream chỉ nằm ở máy chủ.",
    "copy.advancedTitle": "Tạo nâng cao",
    "copy.advancedSubtitle": "Điều khiển mô hình trực tiếp cho tài khoản đã duyệt.",
    "copy.advancedNotice": "Chỉ cần đăng ký một lần. Sau khi duyệt, case có thể tự điền biểu mẫu.",
    "copy.historyTitle": "Lịch sử tạo",
    "copy.historySubtitle": "Xem video, prompt, tham số và chi phí trong một danh sách gọn.",
    "copy.historyNotice": "Chỉ hiển thị bản ghi tạo của riêng bạn.",
    "copy.topupsTitle": "Lịch sử nạp tiền",
    "copy.topupsSubtitle": "Xem đơn nạp USDT với tìm kiếm, phân trang và xuất file.",
    "copy.topupsNotice": "Đơn nạp được tách riêng khỏi lịch sử chi tiêu.",
    "copy.spendingTitle": "Lịch sử chi tiêu",
    "copy.spendingSubtitle": "Xem các lần tiêu credits cho tạo video và mở khóa.",
    "copy.spendingNotice": "Chỉ hiển thị các khoản trừ credits thực tế.",
    "hero.access.eyebrow": "Tích hợp",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "Nâng cao",
    "hero.advanced.badge": "Quyền",
    "hero.history.eyebrow": "Lịch sử",
    "hero.history.badge": "Bản ghi",
    "hero.topups.eyebrow": "Thanh toán",
    "hero.topups.badge": "Nạp tiền",
    "hero.spending.eyebrow": "Thanh toán",
    "hero.spending.badge": "Credits",
    "hero.gallery.badge": "Mẫu",
    "gallery.title": "Mẫu AI",
    "gallery.subtitle": "Chọn mẫu, tải tư liệu lên và tạo kết quả mới.",
    "gallery.noTemplates": "Chưa có mẫu nào.",
    "category.featured": "Nổi bật",
    "category.i2v": "Ảnh thành video",
    "category.t2v": "Văn bản thành video",
    "template.imageToVideo": "Ảnh thành video",
    "template.textToVideo": "Văn bản thành video",
    "template.generate": "Tạo - {cost}",
    "templateTitle.angel-rise": "Thiên thần cơ khí",
    "templateTitle.hero-rescue": "Giải cứu siêu anh hùng",
    "templateTitle.product-fire": "Trình diễn sản phẩm lửa",
    "cost.checking": "Đang kiểm tra chi phí...",
    "cost.unavailable": "Không lấy được chi phí",
    "cost.seconds": "{value}s",
    "cost.credits": "{credits} credits",
    "cost.creditsDuration": "{credits} credits - {duration}",
    "billing.pending": "Đã tạm trừ {pre}, cuối cùng {final}, đang chờ",
    "billing.final": "Đã tạm trừ {pre}, cuối cùng {final}",
    "billing.prepaid": "Đã tạm trừ {pre}",
    "billing.noCharge": "Không tính phí",
    "topup.title": "Nạp tiền",
    "topup.amount": "Số tiền",
    "topup.compact": "Nạp",
    "topup.dialogTitle": "Nạp credits",
    "topup.createOrder": "Tạo đơn USDT",
    "topup.usdtTitle": "USDT dự phòng",
    "topup.walletNetwork": "Mạng USDT",
    "topup.walletNetworkHint": "Chọn mạng bạn sẽ chuyển tiền.",
    "topup.login": "Đăng nhập để tạo đơn thanh toán.",
    "topup.rate": "{amount} {asset} qua {network}. Credits tính theo cent RMB.",
    "topup.payExactly": "Thanh toán chính xác",
  "topup.copyAddress": "Sao chép địa chỉ",
  "topup.showQr": "Hiện QR",
  "topup.addressCopied": "Đã sao chép địa chỉ. Chuyển đúng số tiền hiển thị.",
  "topup.invalid": "Nhập số USDT hợp lệ.",
  "topup.creating": "Đang tạo đơn thanh toán...",
  "topup.created": "Đã tạo đơn. Chuyển đúng số tiền gồm phần đuôi.",
  "topup.paypalTitle": "Thanh toán PayPal",
  "topup.paypalLoading": "Đang tải PayPal...",
  "topup.paypalUnavailable": "PayPal chưa được cấu hình.",
  "topup.paypalReady": "Thanh toán an toàn qua PayPal.",
  "topup.paypalCreating": "Đang mở PayPal checkout...",
  "topup.paypalApproved": "Đã duyệt thanh toán. Đang cộng credits...",
  "topup.paypalPaid": "Thanh toán hoàn tất. Credits đã được cộng.",
  "topup.paypalCancelled": "Đã hủy thanh toán PayPal.",
  "topup.paypalOrder": "Đơn PayPal",
  "topup.provider": "Nhà cung cấp",
    "advanced.models": "Mô hình nâng cao",
    "advanced.title": "Tạo nâng cao",
    "advanced.subtitle": "Dùng tham số Seedance hoặc Wan2.7 sau khi được duyệt.",
    "advanced.promptPlaceholder": "Mô tả video bạn muốn...",
    "advanced.uploadReference": "Tải ảnh tham chiếu",
    "advanced.firstFrame": "Khung đầu",
    "advanced.seedanceHandling": "Xử lý ảnh Seedance",
    "advanced.seedanceMode": "Seedance input",
    "advanced.seedanceModeText": "Text only",
    "advanced.seedanceModeFirst": "First frame image",
    "advanced.seedanceModeFirstLast": "First + last image",
    "advanced.seedanceModeReference": "Reference images",
    "advanced.seedanceModeVideo": "Reference video/audio",
    "advanced.seedanceVideoUrls": "Reference video URLs",
    "advanced.seedanceAudioUrls": "Reference audio URLs",
    "advanced.seedanceFirstRequired": "First frame image is required for this Seedance mode.",
    "advanced.seedanceLastRequired": "Last frame image is required for this Seedance mode.",
    "advanced.seedanceVideoRequired": "Reference video is required for this Seedance mode.",
    "advanced.prepareReference": "Chuẩn bị ảnh an toàn",
    "advanced.originalImage": "Dùng ảnh gốc",
    "advanced.seedanceReferenceHint": "Seedance sẽ dùng tất cả ảnh đã chọn làm tham chiếu.",
    "advanced.seedanceReferenceCount": "Đã chọn {count} ảnh tham chiếu.",
    "advanced.wanFirstFrameHint": "Đã chọn khung đầu Wan2.7.",
    "advanced.referenceImageTooLarge": "Mỗi ảnh tham chiếu phải từ 8MB trở xuống.",
    "advanced.referenceImageTooMany": "Seedance hỗ trợ tối đa {count} ảnh tham chiếu.",
    "advanced.randomSeed": "Seed ngẫu nhiên",
    "advanced.cases": "Case",
    "advanced.caseTitle": "Bắt đầu từ case",
    "advanced.approvalRequired": "CẦN ĐĂNG NHẬP",
    "advanced.inviteOnly": "Đăng nhập để tiếp tục",
    "advanced.loginFirst": "Tạo nâng cao khả dụng cho mọi người dùng đã đăng nhập.",
    "advanced.requestTitle": "Đăng ký tạo nâng cao",
    "advanced.requestSubmittedTitle": "Đã gửi yêu cầu",
    "advanced.requestDesc": "Điều khiển mô hình trực tiếp cần phê duyệt thủ công.",
    "advanced.requestSubmittedDesc": "Yêu cầu của bạn đang chờ xét duyệt.",
    "advanced.contactSupport": "Liên hệ hỗ trợ",
    "advanced.applyAccess": "Xin quyền",
    "advanced.waitingApproval": "Đang chờ duyệt",
    "advanced.requestSubmitted": "Đã gửi yêu cầu.",
    "advanced.promptRequired": "Cần nhập prompt.",
    "advanced.referenceSeedance": "Đã chọn ảnh tham chiếu. Seedance sẽ dùng {mode}.",
    "advanced.referenceWan": "Đã chọn khung đầu. Wan2.7 sẽ dùng ảnh này làm khung mở đầu.",
    "advanced.safeReference": "ảnh tham chiếu an toàn",
    "advanced.originalReference": "ảnh gốc",
    "advanced.submitting": "Đang gửi tạo nâng cao{note} - {cost}...",
    "advanced.notePrepare": " - chuẩn bị ảnh an toàn trước",
    "advanced.noteOriginal": " - dùng ảnh gốc",
    "advanced.noteWan": " - dùng ảnh tải lên làm khung đầu",
    "advanced.jobSubmitted": "Đã gửi job: {taskId} - {credits} credits",
    "advanced.loadedCase": "Đã tải case: {title} - {cost}",
    "advanced.defaultCase": "Case nâng cao",
    "advanced.noCases": "Chưa cấu hình case nào.",
    "advanced.imageTooLarge": "Ảnh phải từ 8MB trở xuống.",
    "access.integration": "Tích hợp",
    "access.title": "Truy cập API",
    "access.subtitle": "Kết nối sản phẩm hoặc workflow với API tạo video production hiện tại.",
    "access.currentToken": "API token hiện tại",
    "access.tokenLogin": "Đăng nhập để tự điền token",
    "access.tokenHintUser": "Snippet sao chép dùng token đầy đủ. Trang mặc định che token.",
    "access.tokenHintGuest": "Đăng nhập trước, các snippet bên dưới sẽ tự dùng token của bạn.",
    "access.copyKicker": "SAO CHÉP VÀ KẾT NỐI",
    "access.modelDocs": "Tài liệu model",
    "access.modelsJson": "Models JSON",
    "access.copySnippet": "Sao chép snippet",
    "guide.http.title": "HTTP API",
    "guide.http.subtitle": "Endpoint trực tiếp",
    "guide.http.desc": "Endpoint production. Gửi job tạo và truy vấn bản ghi/kết quả.",
    "guide.typescript.title": "TypeScript",
    "guide.typescript.subtitle": "Mã server",
    "guide.typescript.desc": "Wrapper fetch hoạt động với cùng HTTP API production.",
    "guide.python.title": "Python",
    "guide.python.subtitle": "Mã server",
    "guide.python.desc": "Wrapper requests hoạt động với cùng HTTP API production.",
    "guide.cli.title": "CLI",
    "guide.cli.subtitle": "curl",
    "guide.cli.desc": "Lệnh curl trực tiếp để gửi và kiểm tra job tạo.",
    "guide.agent.title": "Agent Kit",
    "guide.agent.subtitle": "Quy tắc prompt",
    "guide.agent.desc": "Sao chép quy tắc này vào agent để gọi API production thay vì tự đoán tham số upstream.",
    "guide.mcp.title": "MCP",
    "guide.mcp.subtitle": "HTTP wrapper",
    "guide.mcp.desc": "MCP dùng wrapper quanh HTTP API hiện tại; chưa có endpoint MCP hosted riêng.",
    "history.eyebrow": "Lịch sử",
    "history.title": "Bản ghi tạo",
    "history.subtitle": "Danh sách gọn các video, prompt và tham số đã tạo.",
    "history.refresh": "Làm mới",
    "history.loginRequired": "Cần đăng nhập",
    "history.loginDesc": "Đăng nhập để xem bản ghi tạo của bạn.",
    "history.login": "Đăng nhập",
    "history.emptyTitle": "Chưa có bản ghi tạo.",
    "history.emptyDesc": "Các job gallery và nâng cao đã gửi sẽ hiện ở đây.",
    "history.job": "Job tạo",
    "history.viewParameters": "Xem tham số",
    "history.loading": "Đang tải bản ghi tạo...",
    "history.loadFailed": "Tải thất bại: {message}",
    "history.regenerate": "Regenerate",
    "history.regenerating": "Regenerating...",
    "history.regenerateSubmitted": "Submitted",
    "history.detailTitle": "Chi tiết tạo",
    "history.inputImages": "Ảnh đầu vào",
    "history.parameters": "Tham số",
    "history.result": "Kết quả",
    "history.noInputImages": "Chưa lưu ảnh đầu vào.",
    "ledger.search": "Tìm kiếm",
    "ledger.status": "Trạng thái",
    "ledger.type": "Loại",
    "ledger.from": "Từ",
    "ledger.to": "Đến",
    "ledger.query": "Tìm",
    "ledger.export": "Xuất",
    "ledger.prev": "Trước",
    "ledger.next": "Sau",
    "ledger.page": "Trang {page} / {totalPages} · {total} bản ghi",
    "ledger.loginRequired": "Cần đăng nhập",
    "ledger.loginDesc": "Đăng nhập để xem lịch sử thanh toán.",
    "ledger.empty": "Không có bản ghi.",
    "ledger.loading": "Đang tải bản ghi...",
    "ledger.loadFailed": "Tải thất bại: {message}",
    "ledger.allStatuses": "Tất cả trạng thái",
    "ledger.status.pending": "Đang chờ",
    "ledger.status.paid": "Đã thanh toán",
    "ledger.status.cancelled": "Đã hủy",
    "ledger.allTypes": "Tất cả loại",
    "ledger.orderId": "Mã đơn",
    "ledger.createdAt": "Tạo lúc",
    "ledger.paidAt": "Thanh toán",
    "ledger.amount": "Số tiền",
    "ledger.payable": "Cần trả",
    "ledger.credits": "Credits",
    "ledger.balanceAfter": "Số dư sau",
    "ledger.title": "Tiêu đề",
    "ledger.taskId": "Task ID",
    "topups.eyebrow": "Thanh toán",
    "topups.title": "Lịch sử nạp tiền",
    "topups.subtitle": "Tìm kiếm và xuất các đơn nạp tiền.",
    "topups.searchPlaceholder": "Mã đơn / trạng thái",
    "spending.eyebrow": "Thanh toán",
    "spending.title": "Lịch sử chi tiêu",
    "spending.subtitle": "Tìm kiếm và xuất lịch sử tiêu credits.",
    "spending.searchPlaceholder": "Task / loại / tiêu đề",
    "status.completed": "Hoàn thành",
    "status.failed": "Thất bại",
    "status.processing": "Đang xử lý",
    "status.submitted": "Đã gửi",
    "modal.imageToVideo": "Ảnh thành video",
    "modal.textToVideo": "Văn bản thành video",
    "modal.createVideo": "Tạo video",
    "modal.uploadReference": "Tải ảnh tham chiếu",
    "modal.promptNote": "Prompt sẽ được gửi đúng như đã nhập. Để trống để dùng prompt đã lưu.",
    "modal.loginBeforeGenerate": "Vui lòng đăng nhập trước khi tạo.",
    "modal.submitting": "Đang gửi job tạo...",
    "modal.submitted": "Đã gửi job: {taskId}. Xem tiến độ trong lịch sử.",
    "modal.readImageFailed": "Không đọc được ảnh",
    "auth.login": "Đăng nhập",
    "auth.createAccount": "Tạo tài khoản",
    "auth.createAndLogin": "Tạo và đăng nhập",
    "auth.alreadyAccount": "Đã có tài khoản",
    "auth.username": "Tên người dùng",
    "auth.password": "Mật khẩu, ít nhất 6 ký tự",
    "auth.invalid": "Nhập tên người dùng và mật khẩu tối thiểu 6 ký tự.",
    "account.title": "Tài khoản",
    "account.credits": "Credits",
    "account.role": "Vai trò",
    "account.apiToken": "API token",
    "account.loginToViewToken": "Đăng nhập để xem token",
    "account.logout": "Đăng xuất",
  },
  ja: {
    "nav.gallery": "ギャラリー",
    "nav.advanced": "高度設定",
    "nav.access": "API アクセス",
    "nav.history": "履歴",
    "nav.topups": "チャージ履歴",
    "nav.spending": "消費履歴",
    "nav.game": "ゲーム",
    "nav.login": "ログイン / 登録",
    "common.close": "閉じる",
    "common.optional": "任意",
    "common.generate": "生成",
    "common.hide": "非表示",
    "common.showFull": "全文表示",
    "common.copyToken": "トークンをコピー",
    "common.copied": "コピー済み",
    "common.copiedToken": "トークンをコピーしました",
    "common.preview": "プレビュー",
    "common.all": "すべて",
    "common.credits": "credits",
    "common.fullscreen": "全画面",
    "footer.note": "クリエイティブワークフロー向けの責任ある AI 動画生成。",
    "legal.kicker": "法務",
    "legal.privacy": "プライバシーポリシー",
    "legal.registration": "ユーザー登録規約",
    "legal.disclaimer": "免責事項",
    "legal.updated": "最終更新日: {date}",
    "field.prompt": "プロンプト",
    "field.model": "モデル",
    "field.ratio": "比率",
    "field.resolution": "解像度",
    "field.duration": "秒数",
    "hero.gallery.eyebrow": "ギャラリー",
    "copy.galleryTitle": "AI 動画を生成",
    "copy.gallerySubtitle": "テンプレートを選び、画像またはテキストから新しい動画を生成します。",
    "copy.galleryNotice": "生成結果は履歴に保存されます。",
    "copy.accessTitle": "API アクセス",
    "copy.accessSubtitle": "製品、スクリプト、エージェント、MCP ラッパーを production 生成 API に接続します。",
    "copy.accessNotice": "以下の例は現在の production API を呼び出します。Upstream JSON はサーバー側に保持されます。",
    "copy.advancedTitle": "高度生成",
    "copy.advancedSubtitle": "承認済みアカウント向けの直接モデル制御です。",
    "copy.advancedNotice": "一度申請すれば、承認後にケースからフォームを自動入力できます。",
    "copy.historyTitle": "生成履歴",
    "copy.historySubtitle": "生成動画、プロンプト、パラメータ、課金をコンパクトに確認できます。",
    "copy.historyNotice": "自分の生成記録のみ表示されます。",
    "copy.topupsTitle": "チャージ履歴",
    "copy.topupsSubtitle": "USDT チャージ注文を検索、ページ表示、エクスポートできます。",
    "copy.topupsNotice": "チャージ注文は消費履歴とは別に表示されます。",
    "copy.spendingTitle": "消費履歴",
    "copy.spendingSubtitle": "生成やアンロックで消費した credits を確認できます。",
    "copy.spendingNotice": "実際に差し引かれた credits のみ表示されます。",
    "hero.access.eyebrow": "連携",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "高度設定",
    "hero.advanced.badge": "権限",
    "hero.history.eyebrow": "履歴",
    "hero.history.badge": "記録",
    "hero.topups.eyebrow": "課金",
    "hero.topups.badge": "チャージ",
    "hero.spending.eyebrow": "課金",
    "hero.spending.badge": "Credits",
    "hero.gallery.badge": "テンプレート",
    "gallery.title": "AI テンプレート",
    "gallery.subtitle": "テンプレートを選び、素材をアップロードして新しい結果を生成します。",
    "gallery.noTemplates": "テンプレートはまだありません。",
    "category.featured": "おすすめ",
    "category.i2v": "画像から動画",
    "category.t2v": "テキストから動画",
    "template.imageToVideo": "画像から動画",
    "template.textToVideo": "テキストから動画",
    "template.generate": "生成 - {cost}",
    "templateTitle.angel-rise": "機械仕掛けの天使",
    "templateTitle.hero-rescue": "スーパーヒーロー救出",
    "templateTitle.product-fire": "炎のプロダクト紹介",
    "cost.checking": "コスト確認中...",
    "cost.unavailable": "コストを取得できません",
    "cost.seconds": "{value}s",
    "cost.credits": "{credits} credits",
    "cost.creditsDuration": "{credits} credits - {duration}",
    "billing.pending": "事前差引 {pre}、最終 {final}、保留中",
    "billing.final": "事前差引 {pre}、最終 {final}",
    "billing.prepaid": "事前差引 {pre}",
    "billing.noCharge": "課金なし",
    "topup.title": "チャージ",
    "topup.amount": "金額",
    "topup.compact": "チャージ",
    "topup.dialogTitle": "Credits をチャージ",
    "topup.createOrder": "USDT 注文作成",
    "topup.usdtTitle": "USDT 予備",
    "topup.walletNetwork": "USDT ネットワーク",
    "topup.walletNetworkHint": "送金に使うネットワークを選択してください。",
    "topup.login": "ログインして支払い注文を作成してください。",
    "topup.rate": "{amount} {asset} / {network}。Credits は RMB セントで計算されます。",
    "topup.payExactly": "正確に支払う",
  "topup.copyAddress": "アドレスをコピー",
  "topup.showQr": "QR を表示",
  "topup.addressCopied": "アドレスをコピーしました。表示金額を正確に送金してください。",
  "topup.invalid": "有効な USDT 金額を入力してください。",
  "topup.creating": "支払い注文を作成中...",
  "topup.created": "注文を作成しました。末尾を含む正確な金額を送金してください。",
  "topup.paypalTitle": "PayPal 決済",
  "topup.paypalLoading": "PayPal を読み込み中...",
  "topup.paypalUnavailable": "PayPal はまだ設定されていません。",
  "topup.paypalReady": "PayPal で安全に支払えます。",
  "topup.paypalCreating": "PayPal 決済を開いています...",
  "topup.paypalApproved": "支払いが承認されました。Credits を確認中...",
  "topup.paypalPaid": "支払い完了。Credits を追加しました。",
  "topup.paypalCancelled": "PayPal 支払いはキャンセルされました。",
  "topup.paypalOrder": "PayPal 注文",
  "topup.provider": "プロバイダー",
    "advanced.models": "高度モデル",
    "advanced.title": "高度生成",
    "advanced.subtitle": "承認後に Seedance または Wan2.7 のパラメータを使用できます。",
    "advanced.promptPlaceholder": "生成したい動画を説明してください...",
    "advanced.uploadReference": "参照画像をアップロード",
    "advanced.firstFrame": "最初のフレーム",
    "advanced.seedanceHandling": "Seedance 画像処理",
    "advanced.seedanceMode": "Seedance input",
    "advanced.seedanceModeText": "Text only",
    "advanced.seedanceModeFirst": "First frame image",
    "advanced.seedanceModeFirstLast": "First + last image",
    "advanced.seedanceModeReference": "Reference images",
    "advanced.seedanceModeVideo": "Reference video/audio",
    "advanced.seedanceVideoUrls": "Reference video URLs",
    "advanced.seedanceAudioUrls": "Reference audio URLs",
    "advanced.seedanceFirstRequired": "First frame image is required for this Seedance mode.",
    "advanced.seedanceLastRequired": "Last frame image is required for this Seedance mode.",
    "advanced.seedanceVideoRequired": "Reference video is required for this Seedance mode.",
    "advanced.prepareReference": "安全な参照を準備",
    "advanced.originalImage": "元画像を使用",
    "advanced.seedanceReferenceHint": "Seedance は選択したすべての画像を参照に使用します。",
    "advanced.seedanceReferenceCount": "参照画像を {count} 枚選択しました。",
    "advanced.wanFirstFrameHint": "Wan2.7 の最初のフレームを選択しました。",
    "advanced.referenceImageTooLarge": "各参照画像は 8MB 以下にしてください。",
    "advanced.referenceImageTooMany": "Seedance は最大 {count} 枚の参照画像に対応しています。",
    "advanced.randomSeed": "ランダムシード",
    "advanced.cases": "ケース",
    "advanced.caseTitle": "ケースから開始",
    "advanced.approvalRequired": "ログインが必要",
    "advanced.inviteOnly": "ログインして続行",
    "advanced.loginFirst": "高度生成はログイン済みのすべてのユーザーが利用できます。",
    "advanced.requestTitle": "高度生成を申請",
    "advanced.requestSubmittedTitle": "申請済み",
    "advanced.requestDesc": "直接モデル制御には手動承認が必要です。",
    "advanced.requestSubmittedDesc": "申請は審査待ちです。",
    "advanced.contactSupport": "サポートへ連絡",
    "advanced.applyAccess": "アクセス申請",
    "advanced.waitingApproval": "承認待ち",
    "advanced.requestSubmitted": "申請を送信しました。",
    "advanced.promptRequired": "プロンプトが必要です。",
    "advanced.referenceSeedance": "参照を選択しました。Seedance は {mode} を使用します。",
    "advanced.referenceWan": "最初のフレームを選択しました。Wan2.7 はこの画像を開始フレームとして使用します。",
    "advanced.safeReference": "安全な参照",
    "advanced.originalReference": "元画像",
    "advanced.submitting": "高度生成を送信中{note} - {cost}...",
    "advanced.notePrepare": " - 先に安全な参照を準備",
    "advanced.noteOriginal": " - 元画像を使用",
    "advanced.noteWan": " - アップロード画像を最初のフレームとして使用",
    "advanced.jobSubmitted": "ジョブ送信済み: {taskId} - {credits} credits",
    "advanced.loadedCase": "ケース読み込み: {title} - {cost}",
    "advanced.defaultCase": "高度ケース",
    "advanced.noCases": "ケースはまだ設定されていません。",
    "advanced.imageTooLarge": "画像は 8MB 以下にしてください。",
    "access.integration": "連携",
    "access.title": "API アクセス",
    "access.subtitle": "製品やワークフローを現在の production 生成 API に接続します。",
    "access.currentToken": "現在の API トークン",
    "access.tokenLogin": "ログインするとトークンが自動入力されます",
    "access.tokenHintUser": "コピーされるスニペットは完全なトークンを使用します。ページ上では既定でマスクされます。",
    "access.tokenHintGuest": "ログイン後、下のスニペットにトークンが自動反映されます。",
    "access.copyKicker": "コピーして接続",
    "access.modelDocs": "モデル資料",
    "access.modelsJson": "Models JSON",
    "access.copySnippet": "スニペットをコピー",
    "guide.http.title": "HTTP API",
    "guide.http.subtitle": "直接エンドポイント",
    "guide.http.desc": "Production エンドポイントです。生成ジョブを送信し、記録や結果を照会します。",
    "guide.typescript.title": "TypeScript",
    "guide.typescript.subtitle": "サーバーコード",
    "guide.typescript.desc": "同じ production HTTP API を使う fetch ラッパーです。",
    "guide.python.title": "Python",
    "guide.python.subtitle": "サーバーコード",
    "guide.python.desc": "同じ production HTTP API を使う requests ラッパーです。",
    "guide.cli.title": "CLI",
    "guide.cli.subtitle": "curl",
    "guide.cli.desc": "生成ジョブの送信と確認に使う直接 curl コマンドです。",
    "guide.agent.title": "Agent Kit",
    "guide.agent.subtitle": "プロンプト規則",
    "guide.agent.desc": "この規則を agent にコピーすると、upstream パラメータを推測せず production API を呼び出します。",
    "guide.mcp.title": "MCP",
    "guide.mcp.subtitle": "HTTP ラッパー",
    "guide.mcp.desc": "MCP は現在の HTTP API のラッパー経由で利用できます。別の hosted MCP エンドポイントはまだありません。",
    "history.eyebrow": "履歴",
    "history.title": "生成記録",
    "history.subtitle": "生成動画、プロンプト、パラメータのコンパクトな一覧です。",
    "history.refresh": "更新",
    "history.loginRequired": "ログインが必要です",
    "history.loginDesc": "生成記録を見るにはログインしてください。",
    "history.login": "ログイン",
    "history.emptyTitle": "生成記録はまだありません。",
    "history.emptyDesc": "送信したギャラリーと高度生成ジョブがここに表示されます。",
    "history.job": "生成ジョブ",
    "history.viewParameters": "パラメータを表示",
    "history.loading": "生成記録を読み込み中...",
    "history.loadFailed": "読み込み失敗: {message}",
    "history.regenerate": "Regenerate",
    "history.regenerating": "Regenerating...",
    "history.regenerateSubmitted": "Submitted",
    "history.detailTitle": "生成詳細",
    "history.inputImages": "入力画像",
    "history.parameters": "パラメータ",
    "history.result": "結果",
    "history.noInputImages": "入力画像の記録はありません。",
    "ledger.search": "検索",
    "ledger.status": "ステータス",
    "ledger.type": "タイプ",
    "ledger.from": "開始",
    "ledger.to": "終了",
    "ledger.query": "検索",
    "ledger.export": "エクスポート",
    "ledger.prev": "前へ",
    "ledger.next": "次へ",
    "ledger.page": "ページ {page} / {totalPages} · {total} 件",
    "ledger.loginRequired": "ログインが必要です",
    "ledger.loginDesc": "課金履歴を見るにはログインしてください。",
    "ledger.empty": "記録がありません。",
    "ledger.loading": "記録を読み込み中...",
    "ledger.loadFailed": "読み込み失敗: {message}",
    "ledger.allStatuses": "すべてのステータス",
    "ledger.status.pending": "保留中",
    "ledger.status.paid": "支払い済み",
    "ledger.status.cancelled": "キャンセル済み",
    "ledger.allTypes": "すべてのタイプ",
    "ledger.orderId": "注文 ID",
    "ledger.createdAt": "作成日時",
    "ledger.paidAt": "支払日時",
    "ledger.amount": "金額",
    "ledger.payable": "支払額",
    "ledger.credits": "Credits",
    "ledger.balanceAfter": "差引後残高",
    "ledger.title": "タイトル",
    "ledger.taskId": "Task ID",
    "topups.eyebrow": "課金",
    "topups.title": "チャージ履歴",
    "topups.subtitle": "チャージ注文を検索、エクスポートできます。",
    "topups.searchPlaceholder": "注文 ID / ステータス",
    "spending.eyebrow": "課金",
    "spending.title": "消費履歴",
    "spending.subtitle": "credits 消費履歴を検索、エクスポートできます。",
    "spending.searchPlaceholder": "Task / タイプ / タイトル",
    "status.completed": "完了",
    "status.failed": "失敗",
    "status.processing": "処理中",
    "status.submitted": "送信済み",
    "modal.imageToVideo": "画像から動画",
    "modal.textToVideo": "テキストから動画",
    "modal.createVideo": "動画を作成",
    "modal.uploadReference": "参照画像をアップロード",
    "modal.promptNote": "プロンプトは入力どおり送信されます。保存済みプロンプトを使う場合は空欄にします。",
    "modal.loginBeforeGenerate": "生成前にログインしてください。",
    "modal.submitting": "生成ジョブを送信中...",
    "modal.submitted": "ジョブ送信済み: {taskId}。履歴で進捗を確認してください。",
    "modal.readImageFailed": "画像を読み込めませんでした",
    "auth.login": "ログイン",
    "auth.createAccount": "アカウント作成",
    "auth.createAndLogin": "作成してログイン",
    "auth.alreadyAccount": "既にアカウントがあります",
    "auth.username": "ユーザー名",
    "auth.password": "パスワード、6文字以上",
    "auth.invalid": "ユーザー名と6文字以上のパスワードを入力してください。",
    "account.title": "アカウント",
    "account.credits": "Credits",
    "account.role": "ロール",
    "account.apiToken": "API トークン",
    "account.loginToViewToken": "ログインしてトークンを表示",
    "account.logout": "ログアウト",
  },
  ko: {
    "nav.gallery": "갤러리",
    "nav.advanced": "고급",
    "nav.access": "API 접근",
    "nav.history": "기록",
    "nav.topups": "충전 내역",
    "nav.spending": "소비 내역",
    "nav.game": "게임",
    "nav.login": "로그인 / 가입",
    "common.close": "닫기",
    "common.optional": "선택 사항",
    "common.generate": "생성",
    "common.hide": "숨기기",
    "common.showFull": "전체 보기",
    "common.copyToken": "토큰 복사",
    "common.copied": "복사됨",
    "common.copiedToken": "토큰 복사됨",
    "common.preview": "미리보기",
    "common.all": "전체",
    "common.credits": "credits",
    "common.fullscreen": "전체 화면",
    "footer.note": "크리에이티브 워크플로를 위한 책임 있는 AI 영상 생성.",
    "legal.kicker": "법률",
    "legal.privacy": "개인정보 처리방침",
    "legal.registration": "사용자 등록 약관",
    "legal.disclaimer": "면책 고지",
    "legal.updated": "최종 업데이트: {date}",
    "field.prompt": "프롬프트",
    "field.model": "모델",
    "field.ratio": "비율",
    "field.resolution": "해상도",
    "field.duration": "길이",
    "hero.gallery.eyebrow": "갤러리",
    "copy.galleryTitle": "AI 비디오 생성",
    "copy.gallerySubtitle": "템플릿을 선택하고 이미지 또는 텍스트로 새 비디오를 만드세요.",
    "copy.galleryNotice": "생성 결과는 기록에 저장됩니다.",
    "copy.accessTitle": "API 접근",
    "copy.accessSubtitle": "제품, 스크립트, 에이전트 또는 MCP 래퍼를 production 생성 API에 연결하세요.",
    "copy.accessNotice": "아래 예시는 현재 production API를 호출합니다. Upstream JSON은 서버에만 유지됩니다.",
    "copy.advancedTitle": "고급 생성",
    "copy.advancedSubtitle": "승인된 계정을 위한 직접 모델 제어입니다.",
    "copy.advancedNotice": "한 번 신청하세요. 승인 후 케이스가 양식을 자동으로 채울 수 있습니다.",
    "copy.historyTitle": "생성 기록",
    "copy.historySubtitle": "생성 비디오, 프롬프트, 파라미터와 과금을 간단히 확인하세요.",
    "copy.historyNotice": "본인의 생성 기록만 표시됩니다.",
    "copy.topupsTitle": "충전 내역",
    "copy.topupsSubtitle": "USDT 충전 주문을 검색, 페이지 확인, 내보내기할 수 있습니다.",
    "copy.topupsNotice": "충전 주문은 소비 내역과 분리되어 표시됩니다.",
    "copy.spendingTitle": "소비 내역",
    "copy.spendingSubtitle": "생성 및 잠금 해제에 사용된 credits 소비를 확인하세요.",
    "copy.spendingNotice": "실제로 차감된 credits만 표시됩니다.",
    "hero.access.eyebrow": "연동",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "고급",
    "hero.advanced.badge": "권한",
    "hero.history.eyebrow": "기록",
    "hero.history.badge": "레코드",
    "hero.topups.eyebrow": "결제",
    "hero.topups.badge": "충전",
    "hero.spending.eyebrow": "결제",
    "hero.spending.badge": "Credits",
    "hero.gallery.badge": "템플릿",
    "gallery.title": "AI 템플릿",
    "gallery.subtitle": "템플릿을 선택하고 자료를 업로드한 뒤 새 결과를 생성하세요.",
    "gallery.noTemplates": "아직 사용할 수 있는 템플릿이 없습니다.",
    "category.featured": "추천",
    "category.i2v": "이미지에서 비디오",
    "category.t2v": "텍스트에서 비디오",
    "template.imageToVideo": "이미지에서 비디오",
    "template.textToVideo": "텍스트에서 비디오",
    "template.generate": "생성 - {cost}",
    "templateTitle.angel-rise": "태엽 천사",
    "templateTitle.hero-rescue": "슈퍼히어로 구조",
    "templateTitle.product-fire": "화염 제품 쇼케이스",
    "cost.checking": "비용 확인 중...",
    "cost.unavailable": "비용을 사용할 수 없음",
    "cost.seconds": "{value}s",
    "cost.credits": "{credits} credits",
    "cost.creditsDuration": "{credits} credits - {duration}",
    "billing.pending": "선차감 {pre}, 최종 {final}, 대기 중",
    "billing.final": "선차감 {pre}, 최종 {final}",
    "billing.prepaid": "선차감 {pre}",
    "billing.noCharge": "요금 없음",
    "topup.title": "충전",
    "topup.amount": "금액",
    "topup.compact": "충전",
    "topup.dialogTitle": "Credits 충전",
    "topup.createOrder": "USDT 주문 생성",
    "topup.usdtTitle": "USDT 예비",
    "topup.walletNetwork": "USDT 네트워크",
    "topup.walletNetworkHint": "송금할 네트워크를 선택하세요.",
    "topup.login": "결제 주문을 만들려면 로그인하세요.",
    "topup.rate": "{amount} {asset}, {network}. Credits는 RMB 센트 기준입니다.",
    "topup.payExactly": "정확히 결제",
  "topup.copyAddress": "주소 복사",
  "topup.showQr": "QR 보기",
  "topup.addressCopied": "주소를 복사했습니다. 표시된 정확한 금액을 전송하세요.",
  "topup.invalid": "올바른 USDT 금액을 입력하세요.",
  "topup.creating": "결제 주문 생성 중...",
  "topup.created": "주문이 생성되었습니다. 접미 금액까지 정확히 전송하세요.",
  "topup.paypalTitle": "PayPal 결제",
  "topup.paypalLoading": "PayPal 로딩 중...",
  "topup.paypalUnavailable": "PayPal이 아직 설정되지 않았습니다.",
  "topup.paypalReady": "PayPal로 안전하게 결제하세요.",
  "topup.paypalCreating": "PayPal 체크아웃을 여는 중...",
  "topup.paypalApproved": "결제가 승인되었습니다. Credits 확인 중...",
  "topup.paypalPaid": "결제가 완료되었습니다. Credits가 추가되었습니다.",
  "topup.paypalCancelled": "PayPal 결제가 취소되었습니다.",
  "topup.paypalOrder": "PayPal 주문",
  "topup.provider": "제공자",
    "advanced.models": "고급 모델",
    "advanced.title": "고급 생성",
    "advanced.subtitle": "승인 후 Seedance 또는 Wan2.7 파라미터를 사용할 수 있습니다.",
    "advanced.promptPlaceholder": "원하는 비디오를 설명하세요...",
    "advanced.uploadReference": "참조 이미지 업로드",
    "advanced.firstFrame": "첫 프레임",
    "advanced.seedanceHandling": "Seedance 이미지 처리",
    "advanced.seedanceMode": "Seedance input",
    "advanced.seedanceModeText": "Text only",
    "advanced.seedanceModeFirst": "First frame image",
    "advanced.seedanceModeFirstLast": "First + last image",
    "advanced.seedanceModeReference": "Reference images",
    "advanced.seedanceModeVideo": "Reference video/audio",
    "advanced.seedanceVideoUrls": "Reference video URLs",
    "advanced.seedanceAudioUrls": "Reference audio URLs",
    "advanced.seedanceFirstRequired": "First frame image is required for this Seedance mode.",
    "advanced.seedanceLastRequired": "Last frame image is required for this Seedance mode.",
    "advanced.seedanceVideoRequired": "Reference video is required for this Seedance mode.",
    "advanced.prepareReference": "안전 참조 준비",
    "advanced.originalImage": "원본 이미지 사용",
    "advanced.seedanceReferenceHint": "Seedance는 선택한 모든 이미지를 참조로 사용합니다.",
    "advanced.seedanceReferenceCount": "참조 이미지 {count}장을 선택했습니다.",
    "advanced.wanFirstFrameHint": "Wan2.7 첫 프레임이 선택되었습니다.",
    "advanced.referenceImageTooLarge": "각 참조 이미지는 8MB 이하여야 합니다.",
    "advanced.referenceImageTooMany": "Seedance는 최대 {count}장의 참조 이미지를 지원합니다.",
    "advanced.randomSeed": "랜덤 시드",
    "advanced.cases": "케이스",
    "advanced.caseTitle": "케이스에서 시작",
    "advanced.approvalRequired": "로그인 필요",
    "advanced.inviteOnly": "로그인 후 계속",
    "advanced.loginFirst": "고급 생성은 로그인한 모든 사용자가 이용할 수 있습니다.",
    "advanced.requestTitle": "고급 생성 신청",
    "advanced.requestSubmittedTitle": "요청 제출됨",
    "advanced.requestDesc": "직접 모델 제어에는 수동 승인이 필요합니다.",
    "advanced.requestSubmittedDesc": "요청이 검토 대기 중입니다.",
    "advanced.contactSupport": "지원 문의",
    "advanced.applyAccess": "접근 신청",
    "advanced.waitingApproval": "승인 대기",
    "advanced.requestSubmitted": "요청이 제출되었습니다.",
    "advanced.promptRequired": "프롬프트가 필요합니다.",
    "advanced.referenceSeedance": "참조가 선택되었습니다. Seedance는 {mode}를 사용합니다.",
    "advanced.referenceWan": "첫 프레임이 선택되었습니다. Wan2.7은 이 이미지를 시작 프레임으로 사용합니다.",
    "advanced.safeReference": "안전 참조",
    "advanced.originalReference": "원본 이미지",
    "advanced.submitting": "고급 생성 제출 중{note} - {cost}...",
    "advanced.notePrepare": " - 먼저 안전 참조 준비",
    "advanced.noteOriginal": " - 원본 이미지 사용",
    "advanced.noteWan": " - 업로드 이미지를 첫 프레임으로 사용",
    "advanced.jobSubmitted": "작업 제출됨: {taskId} - {credits} credits",
    "advanced.loadedCase": "케이스 불러옴: {title} - {cost}",
    "advanced.defaultCase": "고급 케이스",
    "advanced.noCases": "아직 설정된 케이스가 없습니다.",
    "advanced.imageTooLarge": "이미지는 8MB 이하여야 합니다.",
    "access.integration": "연동",
    "access.title": "API 접근",
    "access.subtitle": "제품 또는 워크플로를 현재 production 생성 API에 연결하세요.",
    "access.currentToken": "현재 API 토큰",
    "access.tokenLogin": "로그인하면 토큰이 자동 입력됩니다",
    "access.tokenHintUser": "복사한 스니펫은 전체 토큰을 사용합니다. 페이지에서는 기본적으로 마스킹됩니다.",
    "access.tokenHintGuest": "먼저 로그인하면 아래 스니펫이 자동으로 토큰을 사용합니다.",
    "access.copyKicker": "복사하고 연결",
    "access.modelDocs": "모델 문서",
    "access.modelsJson": "Models JSON",
    "access.copySnippet": "스니펫 복사",
    "guide.http.title": "HTTP API",
    "guide.http.subtitle": "직접 엔드포인트",
    "guide.http.desc": "Production 엔드포인트입니다. 생성 작업을 제출하고 기록/결과를 조회합니다.",
    "guide.typescript.title": "TypeScript",
    "guide.typescript.subtitle": "서버 코드",
    "guide.typescript.desc": "동일한 production HTTP API를 사용하는 fetch 래퍼입니다.",
    "guide.python.title": "Python",
    "guide.python.subtitle": "서버 코드",
    "guide.python.desc": "동일한 production HTTP API를 사용하는 requests 래퍼입니다.",
    "guide.cli.title": "CLI",
    "guide.cli.subtitle": "curl",
    "guide.cli.desc": "생성 작업 제출과 확인을 위한 직접 curl 명령입니다.",
    "guide.agent.title": "Agent Kit",
    "guide.agent.subtitle": "프롬프트 규칙",
    "guide.agent.desc": "이 규칙을 agent에 복사하면 upstream 파라미터를 추측하지 않고 production API를 호출합니다.",
    "guide.mcp.title": "MCP",
    "guide.mcp.subtitle": "HTTP 래퍼",
    "guide.mcp.desc": "MCP는 현재 HTTP API 래퍼로 사용할 수 있으며 별도 hosted MCP 엔드포인트는 아직 없습니다.",
    "history.eyebrow": "기록",
    "history.title": "생성 레코드",
    "history.subtitle": "생성한 비디오, 프롬프트, 파라미터의 간결한 목록입니다.",
    "history.refresh": "새로고침",
    "history.loginRequired": "로그인 필요",
    "history.loginDesc": "생성 기록을 보려면 로그인하세요.",
    "history.login": "로그인",
    "history.emptyTitle": "아직 생성 기록이 없습니다.",
    "history.emptyDesc": "제출한 갤러리 및 고급 작업이 여기에 표시됩니다.",
    "history.job": "생성 작업",
    "history.viewParameters": "파라미터 보기",
    "history.loading": "생성 기록 로딩 중...",
    "history.loadFailed": "로드 실패: {message}",
    "history.regenerate": "Regenerate",
    "history.regenerating": "Regenerating...",
    "history.regenerateSubmitted": "Submitted",
    "history.detailTitle": "생성 상세",
    "history.inputImages": "입력 이미지",
    "history.parameters": "파라미터",
    "history.result": "결과",
    "history.noInputImages": "기록된 입력 이미지가 없습니다.",
    "ledger.search": "검색",
    "ledger.status": "상태",
    "ledger.type": "유형",
    "ledger.from": "시작",
    "ledger.to": "종료",
    "ledger.query": "조회",
    "ledger.export": "내보내기",
    "ledger.prev": "이전",
    "ledger.next": "다음",
    "ledger.page": "페이지 {page} / {totalPages} · {total}건",
    "ledger.loginRequired": "로그인 필요",
    "ledger.loginDesc": "결제 내역을 보려면 로그인하세요.",
    "ledger.empty": "기록이 없습니다.",
    "ledger.loading": "기록 로딩 중...",
    "ledger.loadFailed": "로드 실패: {message}",
    "ledger.allStatuses": "전체 상태",
    "ledger.status.pending": "대기 중",
    "ledger.status.paid": "결제됨",
    "ledger.status.cancelled": "취소됨",
    "ledger.allTypes": "전체 유형",
    "ledger.orderId": "주문 ID",
    "ledger.createdAt": "생성일",
    "ledger.paidAt": "결제일",
    "ledger.amount": "금액",
    "ledger.payable": "결제 금액",
    "ledger.credits": "Credits",
    "ledger.balanceAfter": "차감 후 잔액",
    "ledger.title": "제목",
    "ledger.taskId": "Task ID",
    "topups.eyebrow": "결제",
    "topups.title": "충전 내역",
    "topups.subtitle": "충전 주문을 검색하고 내보낼 수 있습니다.",
    "topups.searchPlaceholder": "주문 ID / 상태",
    "spending.eyebrow": "결제",
    "spending.title": "소비 내역",
    "spending.subtitle": "credits 소비 내역을 검색하고 내보낼 수 있습니다.",
    "spending.searchPlaceholder": "Task / 유형 / 제목",
    "status.completed": "완료",
    "status.failed": "실패",
    "status.processing": "처리 중",
    "status.submitted": "제출됨",
    "modal.imageToVideo": "이미지에서 비디오",
    "modal.textToVideo": "텍스트에서 비디오",
    "modal.createVideo": "비디오 생성",
    "modal.uploadReference": "참조 이미지 업로드",
    "modal.promptNote": "프롬프트는 입력한 그대로 제출됩니다. 저장된 프롬프트를 사용하려면 비워두세요.",
    "modal.loginBeforeGenerate": "생성 전에 로그인하세요.",
    "modal.submitting": "생성 작업 제출 중...",
    "modal.submitted": "작업 제출됨: {taskId}. 기록에서 진행 상황을 확인하세요.",
    "modal.readImageFailed": "이미지를 읽지 못했습니다",
    "auth.login": "로그인",
    "auth.createAccount": "계정 만들기",
    "auth.createAndLogin": "만들고 로그인",
    "auth.alreadyAccount": "이미 계정이 있습니다",
    "auth.username": "사용자 이름",
    "auth.password": "비밀번호, 최소 6자",
    "auth.invalid": "사용자 이름과 최소 6자의 비밀번호를 입력하세요.",
    "account.title": "계정",
    "account.credits": "Credits",
    "account.role": "역할",
    "account.apiToken": "API 토큰",
    "account.loginToViewToken": "로그인하여 토큰 보기",
    "account.logout": "로그아웃",
  },
  id: {
    "nav.gallery": "Galeri",
    "nav.advanced": "Lanjutan",
    "nav.access": "Akses API",
    "nav.history": "Riwayat",
    "nav.topups": "Top-up",
    "nav.spending": "Pemakaian",
    "nav.game": "Game",
    "nav.login": "Login / Daftar",
    "common.close": "Tutup",
    "common.optional": "Opsional",
    "common.generate": "Buat",
    "common.hide": "Sembunyikan",
    "common.showFull": "Tampilkan penuh",
    "common.copyToken": "Salin token",
    "common.copied": "Disalin",
    "common.copiedToken": "Token disalin",
    "common.preview": "Pratinjau",
    "common.all": "Semua",
    "common.credits": "credits",
    "common.fullscreen": "Layar penuh",
    "footer.note": "Pembuatan video AI yang bertanggung jawab untuk alur kerja kreatif.",
    "legal.kicker": "Legal",
    "legal.privacy": "Kebijakan Privasi",
    "legal.registration": "Perjanjian Pendaftaran Pengguna",
    "legal.disclaimer": "Sanggahan",
    "legal.updated": "Terakhir diperbarui: {date}",
    "field.prompt": "Prompt",
    "field.model": "Model",
    "field.ratio": "Rasio",
    "field.resolution": "Resolusi",
    "field.duration": "Durasi",
    "hero.gallery.eyebrow": "Galeri",
    "copy.galleryTitle": "Buat video AI",
    "copy.gallerySubtitle": "Pilih template, unggah gambar atau masukkan teks, lalu buat video baru.",
    "copy.galleryNotice": "Hasil pembuatan disimpan di riwayat Anda.",
    "copy.accessTitle": "Akses API",
    "copy.accessSubtitle": "Hubungkan produk, skrip, agent, atau MCP wrapper ke API pembuatan production.",
    "copy.accessNotice": "Semua contoh di bawah memanggil API production saat ini. JSON upstream tetap di sisi server.",
    "copy.advancedTitle": "Pembuatan Lanjutan",
    "copy.advancedSubtitle": "Kontrol model langsung untuk akun yang disetujui.",
    "copy.advancedNotice": "Ajukan sekali. Setelah disetujui, case dapat mengisi formulir otomatis.",
    "copy.historyTitle": "Riwayat Pembuatan",
    "copy.historySubtitle": "Tinjau video, prompt, parameter, dan biaya dalam daftar ringkas.",
    "copy.historyNotice": "Hanya catatan pembuatan milik Anda yang ditampilkan.",
    "copy.topupsTitle": "Riwayat Top-up",
    "copy.topupsSubtitle": "Tinjau order top-up USDT dengan pencarian, halaman, dan ekspor.",
    "copy.topupsNotice": "Order top-up dipisahkan dari riwayat pemakaian.",
    "copy.spendingTitle": "Riwayat Pemakaian",
    "copy.spendingSubtitle": "Tinjau pemakaian credits untuk pembuatan dan unlock.",
    "copy.spendingNotice": "Hanya pemotongan credits aktual yang ditampilkan.",
    "hero.access.eyebrow": "Integrasi",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "Lanjutan",
    "hero.advanced.badge": "Izin",
    "hero.history.eyebrow": "Riwayat",
    "hero.history.badge": "Catatan",
    "hero.topups.eyebrow": "Billing",
    "hero.topups.badge": "Top-up",
    "hero.spending.eyebrow": "Billing",
    "hero.spending.badge": "Credits",
    "hero.gallery.badge": "Template",
    "gallery.title": "Template AI",
    "gallery.subtitle": "Pilih template, unggah materi, dan buat hasil baru.",
    "gallery.noTemplates": "Belum ada template.",
    "category.featured": "Unggulan",
    "category.i2v": "Gambar ke Video",
    "category.t2v": "Teks ke Video",
    "template.imageToVideo": "Gambar ke Video",
    "template.textToVideo": "Teks ke Video",
    "template.generate": "Buat - {cost}",
    "templateTitle.angel-rise": "Malaikat mekanis",
    "templateTitle.hero-rescue": "Penyelamatan superhero",
    "templateTitle.product-fire": "Showcase produk api",
    "cost.checking": "Memeriksa biaya...",
    "cost.unavailable": "Biaya tidak tersedia",
    "cost.seconds": "{value}s",
    "cost.credits": "{credits} credits",
    "cost.creditsDuration": "{credits} credits - {duration}",
    "billing.pending": "Prabayar {pre}, final {final}, menunggu",
    "billing.final": "Prabayar {pre}, final {final}",
    "billing.prepaid": "Prabayar {pre}",
    "billing.noCharge": "Tidak ada biaya",
    "topup.title": "Top Up",
    "topup.amount": "Jumlah",
    "topup.compact": "Top Up",
    "topup.dialogTitle": "Top up credits",
    "topup.createOrder": "Buat order USDT",
    "topup.usdtTitle": "Cadangan USDT",
    "topup.walletNetwork": "Jaringan USDT",
    "topup.walletNetworkHint": "Pilih jaringan yang akan Anda pakai untuk transfer.",
    "topup.login": "Login untuk membuat order pembayaran.",
    "topup.rate": "{amount} {asset} via {network}. Credits memakai sen RMB.",
    "topup.payExactly": "Bayar tepat",
  "topup.copyAddress": "Salin alamat",
  "topup.showQr": "Tampilkan QR",
  "topup.addressCopied": "Alamat disalin. Transfer jumlah yang ditampilkan.",
  "topup.invalid": "Masukkan jumlah USDT yang valid.",
  "topup.creating": "Membuat order pembayaran...",
  "topup.created": "Order dibuat. Transfer jumlah tepat termasuk akhiran.",
  "topup.paypalTitle": "Checkout PayPal",
  "topup.paypalLoading": "Memuat PayPal...",
  "topup.paypalUnavailable": "PayPal belum dikonfigurasi.",
  "topup.paypalReady": "Bayar aman dengan PayPal.",
  "topup.paypalCreating": "Membuka checkout PayPal...",
  "topup.paypalApproved": "Pembayaran disetujui. Memastikan credits...",
  "topup.paypalPaid": "Pembayaran selesai. Credits ditambahkan.",
  "topup.paypalCancelled": "Pembayaran PayPal dibatalkan.",
  "topup.paypalOrder": "Order PayPal",
  "topup.provider": "Provider",
    "advanced.models": "Model Lanjutan",
    "advanced.title": "Pembuatan Lanjutan",
    "advanced.subtitle": "Gunakan parameter Seedance atau Wan2.7 setelah disetujui.",
    "advanced.promptPlaceholder": "Jelaskan video yang Anda inginkan...",
    "advanced.uploadReference": "Unggah gambar referensi",
    "advanced.firstFrame": "Frame pertama",
    "advanced.seedanceHandling": "Penanganan gambar Seedance",
    "advanced.seedanceMode": "Seedance input",
    "advanced.seedanceModeText": "Text only",
    "advanced.seedanceModeFirst": "First frame image",
    "advanced.seedanceModeFirstLast": "First + last image",
    "advanced.seedanceModeReference": "Reference images",
    "advanced.seedanceModeVideo": "Reference video/audio",
    "advanced.seedanceVideoUrls": "Reference video URLs",
    "advanced.seedanceAudioUrls": "Reference audio URLs",
    "advanced.seedanceFirstRequired": "First frame image is required for this Seedance mode.",
    "advanced.seedanceLastRequired": "Last frame image is required for this Seedance mode.",
    "advanced.seedanceVideoRequired": "Reference video is required for this Seedance mode.",
    "advanced.prepareReference": "Siapkan referensi aman",
    "advanced.originalImage": "Gunakan gambar asli",
    "advanced.seedanceReferenceHint": "Seedance akan memakai semua gambar yang dipilih sebagai referensi.",
    "advanced.seedanceReferenceCount": "{count} gambar referensi dipilih.",
    "advanced.wanFirstFrameHint": "Frame pertama Wan2.7 dipilih.",
    "advanced.referenceImageTooLarge": "Setiap gambar referensi harus 8MB atau lebih kecil.",
    "advanced.referenceImageTooMany": "Seedance mendukung hingga {count} gambar referensi.",
    "advanced.randomSeed": "Seed acak",
    "advanced.cases": "Case",
    "advanced.caseTitle": "Mulai Dari Case",
    "advanced.approvalRequired": "LOGIN DIPERLUKAN",
    "advanced.inviteOnly": "Login untuk melanjutkan",
    "advanced.loginFirst": "Pembuatan lanjutan tersedia untuk semua pengguna yang sudah login.",
    "advanced.requestTitle": "Ajukan pembuatan lanjutan",
    "advanced.requestSubmittedTitle": "Permintaan dikirim",
    "advanced.requestDesc": "Kontrol model langsung perlu persetujuan manual.",
    "advanced.requestSubmittedDesc": "Permintaan Anda menunggu review.",
    "advanced.contactSupport": "Hubungi dukungan",
    "advanced.applyAccess": "Ajukan akses",
    "advanced.waitingApproval": "Menunggu persetujuan",
    "advanced.requestSubmitted": "Permintaan dikirim.",
    "advanced.promptRequired": "Prompt wajib diisi.",
    "advanced.referenceSeedance": "Referensi dipilih. Seedance akan memakai {mode}.",
    "advanced.referenceWan": "Frame pertama dipilih. Wan2.7 akan memakai gambar ini sebagai frame pembuka.",
    "advanced.safeReference": "referensi aman",
    "advanced.originalReference": "gambar asli",
    "advanced.submitting": "Mengirim pembuatan lanjutan{note} - {cost}...",
    "advanced.notePrepare": " - menyiapkan referensi aman dulu",
    "advanced.noteOriginal": " - memakai gambar asli",
    "advanced.noteWan": " - memakai gambar unggahan sebagai frame pertama",
    "advanced.jobSubmitted": "Job dikirim: {taskId} - {credits} credits",
    "advanced.loadedCase": "Case dimuat: {title} - {cost}",
    "advanced.defaultCase": "Case lanjutan",
    "advanced.noCases": "Belum ada case yang dikonfigurasi.",
    "advanced.imageTooLarge": "Gambar harus 8MB atau lebih kecil.",
    "access.integration": "Integrasi",
    "access.title": "Akses API",
    "access.subtitle": "Hubungkan produk atau workflow ke API pembuatan production saat ini.",
    "access.currentToken": "Token API saat ini",
    "access.tokenLogin": "Login untuk mengisi token otomatis",
    "access.tokenHintUser": "Snippet yang disalin memakai token penuh. Halaman menyamarkannya secara default.",
    "access.tokenHintGuest": "Login dulu, lalu snippet di bawah akan memakai token Anda otomatis.",
    "access.copyKicker": "SALIN DAN HUBUNGKAN",
    "access.modelDocs": "Dokumen model",
    "access.modelsJson": "Models JSON",
    "access.copySnippet": "Salin snippet",
    "guide.http.title": "HTTP API",
    "guide.http.subtitle": "Endpoint langsung",
    "guide.http.desc": "Endpoint production. Kirim job pembuatan dan kueri catatan/hasil.",
    "guide.typescript.title": "TypeScript",
    "guide.typescript.subtitle": "Kode server",
    "guide.typescript.desc": "Wrapper fetch yang berjalan pada HTTP API production yang sama.",
    "guide.python.title": "Python",
    "guide.python.subtitle": "Kode server",
    "guide.python.desc": "Wrapper requests yang berjalan pada HTTP API production yang sama.",
    "guide.cli.title": "CLI",
    "guide.cli.subtitle": "curl",
    "guide.cli.desc": "Perintah curl langsung untuk mengirim dan memeriksa job pembuatan.",
    "guide.agent.title": "Agent Kit",
    "guide.agent.subtitle": "Aturan prompt",
    "guide.agent.desc": "Salin aturan ini ke agent agar memanggil API production, bukan menebak parameter upstream.",
    "guide.mcp.title": "MCP",
    "guide.mcp.subtitle": "HTTP wrapper",
    "guide.mcp.desc": "MCP tersedia melalui wrapper HTTP API saat ini; belum ada endpoint MCP hosted terpisah.",
    "history.eyebrow": "Riwayat",
    "history.title": "Catatan Pembuatan",
    "history.subtitle": "Daftar ringkas video, prompt, dan parameter yang Anda buat.",
    "history.refresh": "Refresh",
    "history.loginRequired": "Login diperlukan",
    "history.loginDesc": "Masuk untuk melihat catatan pembuatan Anda.",
    "history.login": "Login",
    "history.emptyTitle": "Belum ada catatan pembuatan.",
    "history.emptyDesc": "Job galeri dan lanjutan yang dikirim akan muncul di sini.",
    "history.job": "Job pembuatan",
    "history.viewParameters": "Lihat parameter",
    "history.loading": "Memuat catatan pembuatan...",
    "history.loadFailed": "Gagal memuat: {message}",
    "history.regenerate": "Regenerate",
    "history.regenerating": "Regenerating...",
    "history.regenerateSubmitted": "Submitted",
    "history.detailTitle": "Detail pembuatan",
    "history.inputImages": "Gambar input",
    "history.parameters": "Parameter",
    "history.result": "Hasil",
    "history.noInputImages": "Tidak ada gambar input yang tercatat.",
    "ledger.search": "Cari",
    "ledger.status": "Status",
    "ledger.type": "Tipe",
    "ledger.from": "Dari",
    "ledger.to": "Sampai",
    "ledger.query": "Cari",
    "ledger.export": "Ekspor",
    "ledger.prev": "Sebelumnya",
    "ledger.next": "Berikutnya",
    "ledger.page": "Halaman {page} / {totalPages} · {total} catatan",
    "ledger.loginRequired": "Login diperlukan",
    "ledger.loginDesc": "Login untuk melihat catatan billing.",
    "ledger.empty": "Tidak ada catatan.",
    "ledger.loading": "Memuat catatan...",
    "ledger.loadFailed": "Gagal memuat: {message}",
    "ledger.allStatuses": "Semua status",
    "ledger.status.pending": "Pending",
    "ledger.status.paid": "Dibayar",
    "ledger.status.cancelled": "Dibatalkan",
    "ledger.allTypes": "Semua tipe",
    "ledger.orderId": "ID order",
    "ledger.createdAt": "Dibuat",
    "ledger.paidAt": "Dibayar",
    "ledger.amount": "Jumlah",
    "ledger.payable": "Harus dibayar",
    "ledger.credits": "Credits",
    "ledger.balanceAfter": "Saldo setelahnya",
    "ledger.title": "Judul",
    "ledger.taskId": "Task ID",
    "topups.eyebrow": "Billing",
    "topups.title": "Riwayat Top-up",
    "topups.subtitle": "Cari dan ekspor order top-up Anda.",
    "topups.searchPlaceholder": "ID order / status",
    "spending.eyebrow": "Billing",
    "spending.title": "Riwayat Pemakaian",
    "spending.subtitle": "Cari dan ekspor riwayat pemakaian credits.",
    "spending.searchPlaceholder": "Task / tipe / judul",
    "status.completed": "Selesai",
    "status.failed": "Gagal",
    "status.processing": "Diproses",
    "status.submitted": "Dikirim",
    "modal.imageToVideo": "Gambar ke Video",
    "modal.textToVideo": "Teks ke Video",
    "modal.createVideo": "Buat video",
    "modal.uploadReference": "Unggah gambar referensi",
    "modal.promptNote": "Prompt dikirim persis seperti yang dimasukkan. Kosongkan untuk memakai prompt tersimpan.",
    "modal.loginBeforeGenerate": "Silakan login sebelum membuat.",
    "modal.submitting": "Mengirim job pembuatan...",
    "modal.submitted": "Job dikirim: {taskId}. Cek progres di riwayat.",
    "modal.readImageFailed": "Gagal membaca gambar",
    "auth.login": "Login",
    "auth.createAccount": "Buat akun",
    "auth.createAndLogin": "Buat dan login",
    "auth.alreadyAccount": "Sudah punya akun",
    "auth.username": "Nama pengguna",
    "auth.password": "Password, minimal 6 karakter",
    "auth.invalid": "Masukkan nama pengguna dan password minimal 6 karakter.",
    "account.title": "Akun",
    "account.credits": "Credits",
    "account.role": "Peran",
    "account.apiToken": "Token API",
    "account.loginToViewToken": "Login untuk melihat token",
    "account.logout": "Logout",
  },
};

const VIDEO_EXPIRY_NOTICE = "Video links may expire after 24 hours. Download and save successful results in time.";
const EXPIRY_I18N_COPY = {
  en: {
    "common.download": "Download",
    "copy.videoExpiryShort": "Video links may expire after 24 hours; download and save them in time.",
    "copy.galleryNotice": "Generated results are saved in history. Video links may expire after 24 hours, so download and save them in time.",
    "copy.accessNotice": "All examples call the production API. Download or persist returned video URLs within 24 hours.",
    "copy.historyNotice": "Only your own records are shown. Video links may expire after 24 hours; download/save successful results in time.",
    "history.expiryNotice": VIDEO_EXPIRY_NOTICE,
    "modal.submitted": "Job submitted: {taskId}. Check progress in history, then download the video within 24 hours.",
  },
  vi: {
    "common.download": "Tải xuống",
    "copy.videoExpiryShort": "Liên kết video có thể hết hạn sau 24 giờ; hãy tải xuống và lưu kịp thời.",
    "copy.galleryNotice": "Kết quả được lưu trong lịch sử. Liên kết video có thể hết hạn sau 24 giờ, hãy tải xuống và lưu kịp thời.",
    "copy.accessNotice": "Các ví dụ gọi API production. Hãy tải xuống hoặc lưu URL video trả về trong vòng 24 giờ.",
    "copy.historyNotice": "Chỉ hiển thị bản ghi của bạn. Liên kết video có thể hết hạn sau 24 giờ; hãy tải xuống/lưu kết quả thành công kịp thời.",
    "history.expiryNotice": "Liên kết video có thể hết hạn sau 24 giờ. Hãy tải xuống và lưu kết quả thành công kịp thời.",
    "modal.submitted": "Đã gửi job: {taskId}. Kiểm tra tiến độ trong lịch sử, sau đó tải video trong vòng 24 giờ.",
  },
  ja: {
    "common.download": "ダウンロード",
    "copy.videoExpiryShort": "動画リンクは24時間後に期限切れになる場合があります。早めにダウンロードして保存してください。",
    "copy.galleryNotice": "生成結果は履歴に保存されます。動画リンクは24時間後に期限切れになる場合があるため、早めにダウンロードして保存してください。",
    "copy.accessNotice": "すべての例は本番APIを呼び出します。返された動画URLは24時間以内にダウンロードまたは保存してください。",
    "copy.historyNotice": "自分の記録のみ表示されます。動画リンクは24時間後に期限切れになる場合があります。成功した結果は早めに保存してください。",
    "history.expiryNotice": "動画リンクは24時間後に期限切れになる場合があります。成功した結果は早めにダウンロードして保存してください。",
    "modal.submitted": "ジョブを送信しました: {taskId}。履歴で進捗を確認し、24時間以内に動画をダウンロードしてください。",
  },
  ko: {
    "common.download": "다운로드",
    "copy.videoExpiryShort": "동영상 링크는 24시간 후 만료될 수 있습니다. 제때 다운로드해 저장해 주세요.",
    "copy.galleryNotice": "생성 결과는 기록에 저장됩니다. 동영상 링크는 24시간 후 만료될 수 있으니 제때 다운로드해 저장해 주세요.",
    "copy.accessNotice": "모든 예시는 production API를 호출합니다. 반환된 동영상 URL은 24시간 이내에 다운로드하거나 저장해 주세요.",
    "copy.historyNotice": "본인의 기록만 표시됩니다. 동영상 링크는 24시간 후 만료될 수 있으니 성공한 결과를 제때 저장해 주세요.",
    "history.expiryNotice": "동영상 링크는 24시간 후 만료될 수 있습니다. 성공한 결과를 제때 다운로드해 저장해 주세요.",
    "modal.submitted": "작업이 제출되었습니다: {taskId}. 기록에서 진행 상황을 확인한 뒤 24시간 이내에 동영상을 다운로드해 주세요.",
  },
  id: {
    "common.download": "Unduh",
    "copy.videoExpiryShort": "Tautan video dapat kedaluwarsa setelah 24 jam; unduh dan simpan tepat waktu.",
    "copy.galleryNotice": "Hasil pembuatan disimpan di riwayat. Tautan video dapat kedaluwarsa setelah 24 jam, jadi unduh dan simpan tepat waktu.",
    "copy.accessNotice": "Semua contoh memanggil API production. Unduh atau simpan URL video yang dikembalikan dalam 24 jam.",
    "copy.historyNotice": "Hanya catatan Anda yang ditampilkan. Tautan video dapat kedaluwarsa setelah 24 jam; unduh/simpan hasil yang berhasil tepat waktu.",
    "history.expiryNotice": "Tautan video dapat kedaluwarsa setelah 24 jam. Unduh dan simpan hasil yang berhasil tepat waktu.",
    "modal.submitted": "Job dikirim: {taskId}. Cek progres di riwayat, lalu unduh video dalam 24 jam.",
  },
};
Object.entries(EXPIRY_I18N_COPY).forEach(([lang, copy]) => {
  if (I18N[lang]) Object.assign(I18N[lang], copy);
});

const ASSET_WORKFLOW_COPY = {
  en: {
    "assets.extractFrame": "Extract frame",
    "assets.extendTitle": "Extend image",
    "assets.replaceTitle": "Replace from video",
    "assets.frameTitle": "Extract current frame",
    "assets.pickImage": "Choose image",
    "assets.uploadImage": "Upload image",
    "assets.replaceImage": "Replacement image",
    "assets.imageSource": "Image source",
    "assets.sourceAssets": "Asset library",
    "assets.sourceUpload": "Upload new",
    "assets.pickAssetImage": "Asset library image",
    "assets.uploadReplaceImage": "Upload new image",
    "assets.uploadOverridesAsset": "Only the active source is sent.",
    "assets.frameHint": "Drag the video progress, then save the current frame into Assets.",
    "assets.selectImageRequired": "Please choose or upload an image.",
    "assets.generating": "Submitting generation...",
    "assets.generated": "Generation submitted: {taskId}",
    "assets.frameSaved": "Frame saved to Assets.",
    "assets.selectFrame": "Save frame",
    "assets.noImageAssets": "No image assets yet.",
    "assets.modify": "Modify",
    "assets.modifyTitle": "Modify image",
    "assets.modifyPromptPlaceholder": "Describe what to change while keeping the subject consistent...",
    "assets.modifyHint": "The edited result is saved to history first.",
    "assets.modified": "Modified image saved to history.",
    "file.choose": "Choose file",
    "file.chooseImage": "Choose image",
    "file.chooseVideo": "Choose video",
    "file.none": "No file selected",
    "file.multipleSelected": "{count} files selected",
  },
  vi: {
    "assets.modify": "Sua anh",
    "assets.modifyTitle": "Sua anh",
    "assets.modifyPromptPlaceholder": "Mo ta phan can chinh va giu nhan vat nhat quan...",
    "assets.modifyHint": "The edited result is saved to history first.",
    "assets.modified": "Modified image saved to history.",
    "file.choose": "Chon tep",
    "file.chooseImage": "Chon anh",
    "file.chooseVideo": "Chon video",
    "file.none": "Chua chon tep",
    "file.multipleSelected": "Da chon {count} tep",
    "history.addAsset": "Add asset",
    "history.addingAsset": "Adding...",
    "history.assetAdded": "Added",
  },
  ja: {
    "assets.modify": "Modify",
    "assets.modifyTitle": "Modify image",
    "assets.modifyPromptPlaceholder": "Describe what to change while keeping the subject consistent...",
    "assets.modifyHint": "The edited result is saved to history first.",
    "assets.modified": "Modified image saved to history.",
    "file.choose": "File",
    "file.chooseImage": "Image",
    "file.chooseVideo": "Video",
    "file.none": "No file selected",
    "file.multipleSelected": "{count} files selected",
    "history.addAsset": "Add asset",
    "history.addingAsset": "Adding...",
    "history.assetAdded": "Added",
  },
  ko: {
    "assets.modify": "Modify",
    "assets.modifyTitle": "Modify image",
    "assets.modifyPromptPlaceholder": "Describe what to change while keeping the subject consistent...",
    "assets.modifyHint": "The edited result is saved to history first.",
    "assets.modified": "Modified image saved to history.",
    "file.choose": "File",
    "file.chooseImage": "Image",
    "file.chooseVideo": "Video",
    "file.none": "No file selected",
    "file.multipleSelected": "{count} files selected",
    "history.addAsset": "Add asset",
    "history.addingAsset": "Adding...",
    "history.assetAdded": "Added",
  },
  id: {
    "assets.modify": "Ubah gambar",
    "assets.modifyTitle": "Ubah gambar",
    "assets.modifyPromptPlaceholder": "Jelaskan perubahan sambil menjaga subjek tetap konsisten...",
    "assets.modifyHint": "The edited result is saved to history first.",
    "assets.modified": "Modified image saved to history.",
    "file.choose": "Pilih file",
    "file.chooseImage": "Pilih gambar",
    "file.chooseVideo": "Pilih video",
    "file.none": "Belum ada file",
    "file.multipleSelected": "{count} file dipilih",
    "history.addAsset": "Add asset",
    "history.addingAsset": "Adding...",
    "history.assetAdded": "Added",
  },
};
Object.entries(ASSET_WORKFLOW_COPY).forEach(([lang, copy]) => {
  if (I18N[lang]) Object.assign(I18N[lang], copy);
});
["vi", "ja", "ko", "id", "zh"].forEach((lang) => {
  if (!I18N[lang]) return;
  Object.assign(I18N[lang], {
    "assets.audio": "Audio",
    "advanced.seedanceModeVideo": "Reference video/audio",
    "advanced.seedanceVideoUrls": "Reference video URLs",
    "advanced.seedanceAudioUrls": "Reference audio URLs",
  });
});

if (I18N.zh) {
  Object.assign(I18N.zh, {
    "assets.modify": "改图",
    "assets.modifyTitle": "改图",
    "assets.modifyPromptPlaceholder": "输入要修改的内容，尽量说明保留主体一致...",
    "assets.modifyHint": "生成结果先进入历史记录。",
    "assets.modified": "改图已生成并存入历史。需要进素材库时，在 History 里点 Add asset。",
  });
}

const PUBLIC_COPY = {
  galleryTitle: "Create AI videos",
  gallerySubtitle: "Choose a template, upload an image or enter text, and create a new video.",
  galleryNotice: "Generated results are saved in history. Video links may expire after 24 hours, so download and save them in time.",
  accessTitle: "API Access",
  accessSubtitle: "Connect your product or workflow to the production generation API.",
  accessNotice: "Only the required parameters and response format are shown here.",
  advancedTitle: "Advanced Generate",
  advancedSubtitle: "Direct advanced model controls for approved accounts.",
  advancedNotice: "Approval is required before direct generation is enabled.",
  historyTitle: "Generation History",
  historySubtitle: "Review your generated videos, prompts, parameters and billing in one compact list.",
  historyNotice: "Only your own records are shown. Video links may expire after 24 hours; download/save successful results in time.",
  accessCopy:
    "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>",
};

let ACCESS_GUIDES = [];
let ACCESS_INTEGRATION_GUIDES = [];
let ACCESS_PARAM_GUIDES = [];

const rawApiOrigin = String(window.location?.origin || "").replace(/\/+$/, "");
const API_ORIGIN = rawApiOrigin && rawApiOrigin !== "null" ? rawApiOrigin : "";
const LEGACY_API_ORIGIN_RE = new RegExp(["https?:\\/\\/(?:www\\.|api\\.)?", "123", "vips\\.com"].join(""), "gi");

function apiUrl(path = "/") {
  const normalizedPath = String(path || "/").startsWith("/") ? String(path || "/") : `/${path}`;
  return `${API_ORIGIN}${normalizedPath}`;
}

function tenantScopedAccessText(text = "") {
  return String(text || "")
    .replace(LEGACY_API_ORIGIN_RE, API_ORIGIN)
    .replace(/\b(POST|GET|PUT|PATCH|DELETE)\s+(\/api\/[^\s]+)/gi, (_match, method, path) => {
      return `${String(method).toUpperCase()} ${apiUrl(path)}`;
    })
    .replace(/(^|[\s(["'`])((?:\/api\/)[^\s"'`),.]+)/g, (_match, prefix, path) => {
      return `${prefix}${apiUrl(path)}`;
    });
}

const VOLCENGINE_SEEDANCE_ACCESS_COPY = `POST ${apiUrl("/api/v3/contents/generations/tasks")}
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    {"type": "text", "text": "Use Image 1 as the character reference. Generate a cinematic 5 second shot, no subtitles, no watermark."},
    {"type": "image_url", "image_url": {"url": "https://example.com/image1.png"}, "role": "reference_image"}
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 5,
  "generate_audio": true,
  "watermark": false
}

GET ${apiUrl("/api/v3/contents/generations/tasks/<taskId>")}
Authorization: Bearer <user-token>

The response is the upstream Volcengine/Ark task response when available. vip123 handles auth, balance pre-deduction, history, and refund internally. Public image URLs or base64 image data URLs in image_url content are prepared into Ark assets before submit; asset:// URLs pass through directly.`;

const LIVE_HTTP_ACCESS_COPY = `${VOLCENGINE_SEEDANCE_ACCESS_COPY}

Legacy gallery template:
POST ${apiUrl("/api/platform/generate")}
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "dataUrl": "data:image/png;base64,...",
  "prompt": ""
}

Asset upload for reusable files:
POST ${apiUrl("/api/user-assets")}
{
  "url": "https://example.com/image1.png",
  "fileName": "image1.png",
  "name": "image1"
}`;

const SEEDANCE_CHARACTER_UPLOAD_COPY = `Seedance role workflow, Volcengine-compatible:

1) Optional: prepare a character image as a Seedance asset.
POST ${apiUrl("/api/seedance/characters/upload")}
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "url": "https://example.com/character-image1.png",
  "fileName": "image1.png",
  "name": "image1"
}

The response returns reference.assetUri, for example asset://....

2) Submit with the Volcengine-compatible task endpoint:
POST ${apiUrl("/api/v3/contents/generations/tasks")}
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    {"type": "text", "text": "Use Image 1 as the main character. Keep the same identity and create a cinematic 5 second shot."},
    {"type": "image_url", "image_url": {"url": "asset://reference.assetUri-from-step-1"}, "role": "reference_image"}
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 5,
  "generate_audio": true,
  "watermark": false
}

You may also send a public image URL or base64 data URL directly in content[].image_url.url:
{
  "type": "image_url",
  "image_url": {"url": "data:image/png;base64,..."},
  "role": "first_frame"
}
Prompt rule: uploaded character images are referenced as Image 1, Image 2, etc. Do not put raw asset ids in the prompt text.`;

const TYPE_SCRIPT_ACCESS_COPY = `const token = "<user-token>";
const body = {
  model: "dreamina-seedance-2-0-260128",
  content: [
    { type: "text", text: "Use Image 1 as the character reference. Generate a cinematic 5 second shot." },
    { type: "image_url", image_url: { url: "https://example.com/image1.png" }, role: "reference_image" }
  ],
  ratio: "9:16",
  resolution: "720p",
  duration: 5,
  generate_audio: true,
  watermark: false
};

const created = await fetch("${apiUrl("/api/v3/contents/generations/tasks")}", {
  method: "POST",
  headers: {
    authorization: \`Bearer \${token}\`,
    "content-type": "application/json"
  },
  body: JSON.stringify(body)
}).then((res) => res.json());

const taskId = created.id || created.task_id || created.data?.id || created.data?.task_id;
const task = await fetch("${apiUrl("/api/v3/contents/generations/tasks")}/" + encodeURIComponent(taskId), {
  headers: { authorization: \`Bearer \${token}\` }
}).then((res) => res.json());
console.log(task);

// Important: returned video URLs may expire after 24 hours.
// Download and save successful videos promptly.`;

const PYTHON_ACCESS_COPY = `import requests

token = "<user-token>"
payload = {
    "model": "dreamina-seedance-2-0-260128",
    "content": [
        {"type": "text", "text": "Use Image 1 as the character reference. Generate a cinematic 5 second shot."},
        {"type": "image_url", "image_url": {"url": "https://example.com/image1.png"}, "role": "reference_image"},
    ],
    "ratio": "9:16",
    "resolution": "720p",
    "duration": 5,
    "generate_audio": True,
    "watermark": False,
}

created = requests.post(
    "${apiUrl("/api/v3/contents/generations/tasks")}",
    headers={"Authorization": f"Bearer {token}"},
    json=payload,
    timeout=120,
).json()
task_id = created.get("id") or created.get("task_id") or created.get("data", {}).get("id") or created.get("data", {}).get("task_id")
task = requests.get(
    f"${apiUrl("/api/v3/contents/generations/tasks")}/{task_id}",
    headers={"Authorization": f"Bearer {token}"},
    timeout=120,
).json()
print(task)

# Important: returned video URLs may expire after 24 hours.
# Download and save successful videos promptly.`;

const CLI_ACCESS_COPY = `curl -X POST "${apiUrl("/api/v3/contents/generations/tasks")}" \\
  -H "Authorization: Bearer <user-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"dreamina-seedance-2-0-260128","content":[{"type":"text","text":"Use Image 1 as the character reference. Generate a cinematic 5 second shot."},{"type":"image_url","image_url":{"url":"https://example.com/image1.png"},"role":"reference_image"}],"ratio":"9:16","resolution":"720p","duration":5,"generate_audio":true,"watermark":false}'

curl -X GET "${apiUrl("/api/v3/contents/generations/tasks/<taskId>")}" \\
  -H "Authorization: Bearer <user-token>"

# Important: returned video URLs may expire after 24 hours. Download and save successful videos promptly.
# vip123 records the task internally, but this endpoint returns the Volcengine/Ark task response when available.`;

const AGENT_ACCESS_COPY = `Use this video API:
Important: returned video URLs may expire after 24 hours. Download and save successful videos promptly.
Task queries with API tokens or sub tokens return only upstream provider URLs in record.videoUrl and record.downloadUrl. Local/CDN backup URLs are internal and are not returned downstream.

Gallery templates:
POST ${apiUrl("/api/platform/generate")}
Authorization: Bearer <user-token>
Body:
{"templateId":"template-id","dataUrl":"data:image/png;base64,...","prompt":""}

Seedance direct generation, Volcengine-compatible:
POST ${apiUrl("/api/v3/contents/generations/tasks")}
Body:
{"model":"dreamina-seedance-2-0-260128","content":[{"type":"text","text":"Use Image 1 as the character, Video 1 as motion reference, and Audio 1 as music reference."},{"type":"image_url","image_url":{"url":"https://example.com/image1.png"},"role":"reference_image"},{"type":"video_url","video_url":{"url":"https://example.com/video1.mp4","durationSeconds":6},"role":"reference_video"},{"type":"audio_url","audio_url":{"url":"https://example.com/audio1.mp3"},"role":"reference_audio"}],"ratio":"9:16","resolution":"720p","duration":5,"generate_audio":true}

Check records:
GET ${apiUrl("/api/v3/contents/generations/tasks/<taskId>")}`;

const MCP_ACCESS_COPY = `MCP wrapper target:
POST ${apiUrl("/api/platform/generate")}
Authorization: Bearer <user-token>
Input:
{"templateId":"string","dataUrl":"string","prompt":"string"}

Seedance MCP wrapper target:
POST ${apiUrl("/api/v3/contents/generations/tasks")}
Authorization: Bearer <user-token>
Input:
{"model":"dreamina-seedance-2-0-260128","content":[{"type":"text","text":"string"},{"type":"image_url","image_url":{"url":"https://example.com/image1.png"},"role":"reference_image"}],"ratio":"9:16","resolution":"480p|720p|1080p","duration":5,"generate_audio":true,"watermark":false,"seed":123456}

Seedance character upload target:
POST ${apiUrl("/api/seedance/characters/upload")}
Authorization: Bearer <user-token>
Input:
{"url":"https://example.com/character-image1.png","fileName":"image1.png","name":"image1"}

Task query:
GET ${apiUrl("/api/v3/contents/generations/tasks/<taskId>")}`;

const SEEDANCE_PARAM_ACCESS_COPY = `${SEEDANCE_CHARACTER_UPLOAD_COPY}

Direct Seedance generation endpoint, Volcengine-compatible:
POST ${apiUrl("/api/v3/contents/generations/tasks")}
Authorization: Bearer <user-token>
Content-Type: application/json

Prompt reference rule: describe uploaded materials as Image 1, Video 1, Audio 1. Do not put raw asset ids in the prompt text.

Text to video:
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [{"type": "text", "text": "Describe the video. Dialogue can be quoted in the prompt."}],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 5,
  "generate_audio": true
}

First-frame image to video:
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    {"type": "text", "text": "Animate Image 1 into a cinematic shot."},
    {"type": "image_url", "image_url": {"url": "https://example.com/first-frame.png"}, "role": "first_frame"}
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 5
}

First + last frame:
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    {"type": "text", "text": "Move smoothly from the first frame to the last frame."},
    {"type": "image_url", "image_url": {"url": "https://example.com/first-frame.png"}, "role": "first_frame"},
    {"type": "image_url", "image_url": {"url": "https://example.com/last-frame.png"}, "role": "last_frame"}
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 5
}

Reference images:
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    {"type": "text", "text": "Use Image 1 as the character reference and generate a cinematic shot."},
    {"type": "image_url", "image_url": {"url": "https://example.com/image1.png"}, "role": "reference_image"}
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 5,
  "generate_audio": true,
  "web_search": false,
  "watermark": false,
  "seed": 123456
}

Edit or extend with video/audio references:
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    {"type": "text", "text": "Use Video 1 as the action reference, Image 1 as the character reference, and Audio 1 as the music reference."},
    {"type": "image_url", "image_url": {"url": "https://example.com/image1.png"}, "role": "reference_image"},
    {"type": "video_url", "video_url": {"url": "https://example.com/video2.mp4", "durationSeconds": 6}, "role": "reference_video"},
    {"type": "audio_url", "audio_url": {"url": "https://example.com/music.mp3"}, "role": "reference_audio"}
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 8,
  "generate_audio": true
}`;

const WAN27_VIDEO_PARAM_ACCESS_COPY = `POST ${apiUrl("/api/advanced/generate")}
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan27",
  "prompt": "Describe the video motion and camera.",
  "dataUrl": "data:image/png;base64,...",
  "params": {
    "model": "wan2.7-i2v-2026-04-25",
    "ratio": "9:16",
    "resolution": "1080p",
    "duration": 5,
    "mediaMode": "first_frame",
    "parameters": {
      "prompt_extend": false,
      "seed": 123456,
      "watermark": false
    }
  }
}`;

const WAN27_IMAGE_PARAM_ACCESS_COPY = `Text-to-image:
POST ${apiUrl("/api/characters/generate")}
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "prompt": "Create one realistic adult character portrait...",
  "ratio": "9:16",
  "resolution": "2K",
  "params": {
    "model": "wan2.7-image-pro",
    "parameters": {"n": 1, "watermark": false}
  }
}

Image edit / multi-image edit:
POST ${apiUrl("/api/wan27/image-edit")}
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "prompt": "Blend Image 1 and Image 2 into one realistic cinematic portrait.",
  "imageAssetIds": ["asset-image-1", "asset-image-2"],
  "ratio": "9:16",
  "resolution": "2K",
  "params": {
    "model": "wan2.7-image-pro",
    "parameters": {"n": 1, "watermark": false}
  }
}

Wan2.7 image edit accepts 0-9 source images. The order of imageAssetIds maps to Image 1, Image 2, ... in the prompt. Use an empty imageAssetIds array for text-to-image through the edit endpoint. The older single-asset endpoint /api/user-assets/<assetId>/modify remains supported for one image.`;

const PARAM_DOC_MARKDOWN_URL = apiUrl("/docs/models.md");

const ACCESS_DOCS = {
  platform: {
    title: "Template Generation",
    summary: "Use this endpoint for gallery templates. Send the template id, prompt, and the image data when the template is image-to-video.",
    request: [
      ["Authorization", "Bearer <user-token>"],
      ["Content-Type", "application/json"],
      ["templateId", "Template id from /api/models or the docs page."],
      ["prompt", "Optional override prompt. If omitted, the saved template prompt is used."],
      ["dataUrl", "Required for image-to-video templates. Base64 image data URL."],
      ["userAssetId", "Optional existing uploaded asset id instead of dataUrl."],
      ["params", "Optional advanced override object for power users."],
    ],
    response: [
      ["ok", "true when the request is accepted."],
      ["taskId", "Local generation task id."],
      ["task.status", "Usually submitting when the request is queued."],
      ["record", "Public generation record, including billing and prompt."],
      ["user", "Updated user snapshot, including current credits."],
    ],
    example: `POST /api/platform/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "templateId": "template-id",
  "prompt": "...",
  "dataUrl": "data:image/png;base64,..."
}`,
  },
  assets: {
    title: "Asset Upload",
    summary: "Upload a reusable image, video, or audio file to the current user's asset library. Seedance-specific character preparation is documented inside Seedance Params.",
    request: [
      ["Authorization", "Bearer <user-token>"],
      ["Content-Type", "application/json"],
      ["url", "Optional public image/video/audio URL. Use this when the caller already has a reachable file URL."],
      ["imageUrl", "Alias of url."],
      ["videoUrl", "Alias of url for video upload."],
      ["audioUrl", "Alias of url for audio upload."],
      ["dataUrl", "Optional base64 data URL. Use this when uploading bytes directly."],
      ["durationSeconds", "Optional duration for uploaded video/audio assets. Used for Seedance video-input pre-deduction."],
      ["fileName", "Optional original file name, for example image1.png."],
      ["name", "Optional display name in the user's asset library."],
    ],
    response: [
      ["ok", "true when the upload succeeds."],
      ["asset.id", "Use this id as userAssetId, referenceVideoAssetIds[], referenceAudioAssetIds[], or other asset fields."],
      ["asset.kind", "image, video, or audio."],
      ["asset.previewUrl", "Local preview URL."],
    ],
    example: `POST /api/user-assets
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "url": "https://example.com/image1.png",
  "fileName": "image1.png",
  "name": "image1"
}`,
  },
  advanced: {
    title: "Seedance Generation",
    summary: "New integrations should use the Volcengine-compatible Seedance task endpoint. vip123 keeps authentication, balance pre-deduction, task history, and refund handling internally.",
    request: [
      ["Authorization", "Bearer <user-token>"],
      ["Content-Type", "application/json"],
      ["POST /api/v3/contents/generations/tasks", "Create a Seedance task with a Volcengine-style body."],
      ["GET /api/v3/contents/generations/tasks/<taskId>", "Query a Seedance task with a Volcengine-style path."],
      ["model", "Seedance model id, for example dreamina-seedance-2-0-260128."],
      ["content", "Array of text/image_url/video_url/audio_url items. Use role values like first_frame, last_frame, reference_image, reference_video, reference_audio."],
      ["content[].image_url.url", "Public URL, base64 data URL, or asset:// URI. Public/base64 images are prepared into Ark assets before submit."],
      ["content[].video_url.url", "Public video URL or asset:// URI. Include durationSeconds when known so pre-deduction can include input-video cost."],
      ["content[].audio_url.url", "Public audio URL or asset:// URI."],
      ["ratio", "9:16, 16:9, or 1:1."],
      ["resolution", "480p, 720p, or 1080p. Fast model does not support 1080p."],
      ["duration", "Integer seconds from 4 to 15. Invalid values are rejected before billing."],
      ["generate_audio", "Forwarded to upstream."],
      ["web_search / webSearch", "Forwarded to upstream when supplied."],
      ["watermark", "Forwarded to upstream when supplied."],
      ["seed", "Forwarded to upstream when supplied; upstream decides whether it takes effect."],
    ],
    response: [
      ["id / task_id", "Upstream Seedance task id when upstream returns one."],
      ["status", "Upstream task status."],
      ["content / output", "Upstream output payload, including video URL when ready."],
      ["usage", "Upstream token usage when the provider returns it."],
      ["error", "Upstream-style error object when the task fails."],
    ],
    example: LIVE_HTTP_ACCESS_COPY,
  },
  seedanceParams: {
    title: "Seedance Video Parameters",
    summary: "Use /api/v3/contents/generations/tasks. The body follows the Volcengine/Ark Seedance task shape; vip123 prepares public/base64 images into Ark assets and handles billing.",
    request: [
      { name: "/api/seedance/characters/upload", type: "endpoint", required: "No", description: "Optional helper endpoint. Send url/imageUrl, dataUrl, or assetId; response.reference.assetUri can be used as content[].image_url.url.", default: "-" },
      { name: "model", type: "string", required: "No", description: "Seedance model id. Use dreamina-seedance-2-0-fast-260128 for fast/default, or dreamina-seedance-2-0-260128 for standard/higher quality.", default: "dreamina-seedance-2-0-260128" },
      { name: "content", type: "array", required: "Yes", description: "Volcengine-style multimodal content array. Include one text item and optional image_url/video_url/audio_url items.", default: "-" },
      { name: "content[].type", type: "string", required: "Yes", description: "text, image_url, video_url, or audio_url.", default: "-" },
      { name: "content[].text", type: "string", required: "For text", description: "Video prompt. Put dialogue in quotes if the video should try to generate synced speech.", default: "-" },
      { name: "content[].image_url.url", type: "string", required: "For image", description: "Public URL, base64 data URL, or asset:// URI. Public/base64 images are prepared into Ark assets before submit.", default: "-" },
      { name: "content[].video_url.url", type: "string", required: "For video", description: "Public video URL or asset:// URI.", default: "-" },
      { name: "content[].video_url.durationSeconds", type: "number", required: "No", description: "Input video duration used for pre-deduction. If omitted, the server probes the URL when possible, then falls back conservatively.", default: "-" },
      { name: "content[].audio_url.url", type: "string", required: "For audio", description: "Public audio URL or asset:// URI.", default: "-" },
      { name: "content[].role", type: "string", required: "No", description: "first_frame, last_frame, reference_image, reference_video, or reference_audio.", default: "-" },
      { name: "ratio", type: "string", required: "No", description: "Video aspect ratio. Supports common values like 9:16, 16:9, 1:1. adaptive can be forwarded in params if upstream enables it.", default: "9:16" },
      { name: "resolution", type: "string", required: "No", description: "Video resolution. Supported values are 480p, 720p, and 1080p. Fast model 1080p is rejected before billing.", default: "720p" },
      { name: "duration", type: "integer", required: "No", description: "Video duration in seconds. Seedance jobs are limited to integer 4-15 seconds here.", default: "5" },
      { name: "generate_audio", type: "boolean", required: "No", description: "Generate synced audio such as voice, effects, or background music.", default: "true" },
      { name: "prompt asset labels", type: "string", required: "No", description: "Use Image 1, Video 1, Audio 1 in prompt text when referring to uploaded materials.", default: "-" },
      { name: "web_search / webSearch", type: "boolean", required: "No", description: "Pass-through web search enhancement flag. The API forwards it; upstream decides whether it takes effect.", default: "false" },
      { name: "watermark", type: "boolean", required: "No", description: "Pass-through watermark flag. The API forwards it; upstream decides whether it takes effect.", default: "false" },
      { name: "seed", type: "integer", required: "No", description: "Pass-through random seed. The API forwards it; upstream decides whether it takes effect.", default: "-" },
      { name: "draft / service_tier / fps / camera_fixed", type: "mixed", required: "No", description: "Provider-specific pass-through fields. vip123 forwards or normalizes them; upstream decides whether each one takes effect.", default: "-" },
    ],
    response: [
      { name: "id / task_id", type: "string", required: "Yes", description: "Upstream Seedance task id when upstream returns one.", default: "-" },
      { name: "status", type: "string", required: "Yes", description: "Upstream task status.", default: "-" },
      { name: "content / output", type: "object", required: "No", description: "Upstream result payload with video URL when ready.", default: "-" },
      { name: "usage", type: "object", required: "No", description: "Upstream token usage when the provider returns it.", default: "-" },
    ],
    example: SEEDANCE_PARAM_ACCESS_COPY,
  },
  wan27VideoParams: {
    title: "Wan2.7 Video Parameters",
    summary: "Use /api/advanced/generate with provider=wan27. Media slots are handled by our API; extra DashScope input/parameters are forwarded.",
    request: [
      { name: "model", type: "string", required: "No", description: "Wan2.7 video model id.", default: "wan2.7-i2v-2026-04-25" },
      { name: "prompt", type: "string", required: "Yes", description: "Video prompt.", default: "-" },
      { name: "dataUrl", type: "string", required: "Usually", description: "Base64 first-frame image. You can also use userAssetId or firstFrameAssetId.", default: "-" },
      { name: "mediaMode", type: "string", required: "No", description: "first_frame, first_last_frame, first_frame_audio, first_last_frame_audio, first_clip, or first_clip_last_frame.", default: "first_frame" },
      { name: "firstFrameUrl", type: "string", required: "No", description: "Public URL for the first frame if not using dataUrl/userAssetId.", default: "-" },
      { name: "lastFrameUrl", type: "string", required: "No", description: "Public URL for the last frame when mediaMode uses a last frame.", default: "-" },
      { name: "firstClipUrl", type: "string", required: "No", description: "Public video URL when mediaMode starts from a clip.", default: "-" },
      { name: "drivingAudioUrl", type: "string", required: "No", description: "Public audio URL when mediaMode uses driving audio.", default: "-" },
      { name: "resolution", type: "string", required: "No", description: "720p or 1080p. We forward as 720P/1080P to DashScope.", default: "720p" },
      { name: "duration", type: "integer", required: "No", description: "Video duration in seconds. Wan2.7 jobs are limited to 2-15 seconds here.", default: "5" },
      { name: "seed", type: "integer", required: "No", description: "Optional reproducibility seed, 0 to 2147483647.", default: "-" },
      { name: "parameters.prompt_extend", type: "boolean", required: "No", description: "Enable upstream prompt extension.", default: "false" },
      { name: "parameters.watermark", type: "boolean", required: "No", description: "Whether to request an upstream watermark.", default: "false" },
      { name: "input", type: "object", required: "No", description: "Extra DashScope input fields. prompt/media are set by our API.", default: "{}" },
      { name: "parameters", type: "object", required: "No", description: "Extra DashScope parameters are merged before submit.", default: "{}" },
      { name: "params", type: "object", required: "No", description: "Pass-through wrapper for model/input/parameters and known fields.", default: "{}" },
    ],
    response: [
      { name: "ok", type: "boolean", required: "Yes", description: "true when the request is accepted.", default: "-" },
      { name: "taskId", type: "string", required: "Yes", description: "Local generation task id.", default: "-" },
      { name: "record.mediaAssets", type: "array", required: "No", description: "Resolved media slots sent to Wan2.7.", default: "-" },
      { name: "record.upstreamPayload", type: "object", required: "No", description: "Submitted DashScope payload after the background job starts.", default: "-" },
    ],
    example: WAN27_VIDEO_PARAM_ACCESS_COPY,
  },
  wan27ImageParams: {
    title: "Wan2.7 Image Parameters",
    summary: "Use /api/characters/generate for text-to-image, /api/wan27/image-edit for 0-9 image text/edit/fusion requests, /api/user-assets/<assetId>/modify for the older single-asset edit path, or /api/characters/<characterId>/modify for system character editing.",
    request: [
      { name: "model", type: "string", required: "No", description: "Image generation/editing model id.", default: "wan2.7-image-pro" },
      { name: "prompt", type: "string", required: "Yes", description: "Prompt sent to upstream exactly as provided by the caller, except take-off uses the fixed take-off prompt.", default: "-" },
      { name: "imageAssetIds", type: "array", required: "No", description: "Wan2.7 image edit source images from /api/user-assets. Supports 0-9 images. Array order maps to Image 1, Image 2, etc.", default: "[]" },
      { name: "imageAssetId / assetId / userAssetId", type: "string", required: "No", description: "Single-image alias accepted by /api/wan27/image-edit and the legacy /api/user-assets/<assetId>/modify path.", default: "-" },
      { name: "ratio", type: "string", required: "No", description: "Output ratio: 1:1, 3:4, 4:3, 9:16, 16:9.", default: "9:16" },
      { name: "resolution", type: "string", required: "No", description: "1K or 2K. Used to derive the default size.", default: "2K" },
      { name: "size", type: "string", required: "No", description: "Direct upstream image size, for example 1440*2560. Overrides ratio/resolution size mapping.", default: "by ratio/resolution" },
      { name: "parameters.n", type: "integer", required: "No", description: "Number of images requested from upstream.", default: "1" },
      { name: "parameters.watermark", type: "boolean", required: "No", description: "Whether to request an upstream watermark.", default: "false" },
      { name: "input", type: "object", required: "No", description: "Extra DashScope input fields. messages are built by our API from image/prompt.", default: "{}" },
      { name: "parameters", type: "object", required: "No", description: "Extra DashScope generation parameters are merged before submit.", default: "{}" },
      { name: "params", type: "object", required: "No", description: "Pass-through wrapper for model/size/input/parameters and known fields.", default: "{}" },
    ],
    response: [
      { name: "ok", type: "boolean", required: "Yes", description: "true when generation/editing succeeds.", default: "-" },
      { name: "taskId", type: "string", required: "Yes", description: "Local image generation task id.", default: "-" },
      { name: "imageUrl / record.imageResultUrl", type: "string", required: "Yes", description: "Generated image URL saved in history. It is not added to assets until the user calls Add asset from history.", default: "-" },
      { name: "record.upstreamPayload", type: "object", required: "No", description: "Submitted DashScope payload saved in history/admin records.", default: "-" },
    ],
    example: WAN27_IMAGE_PARAM_ACCESS_COPY,
  },
  records: {
    title: "Records",
    summary: "Query generation history for the current user, then fetch a single task for a fresher status or final video URL. API-token and sub-token callers receive upstream provider URLs only; local/CDN backup URLs are not returned downstream.",
    request: [
      ["Authorization", "Bearer <user-token>"],
      ["GET /api/generation-records?limit=60", "List current user records. Optional refresh=1 to refresh pending tasks."],
      ["GET /api/generation-records/<taskId>", "Fetch one record by task id."],
    ],
    response: [
      ["ok", "true when the request succeeds."],
      ["records", "Array of generation records."],
      ["total", "Total record count for the user."],
      ["user", "Updated user snapshot."],
      ["record", "Single record when calling the detail endpoint."],
      ["record.videoUrl / record.downloadUrl", "Upstream provider URL only for API-token and sub-token callers. This may be a BytePlus/Volcengine temporary URL for Seedance or an Aliyun URL for APIZ/Wan2.7."],
      ["local/CDN backup URLs", "Kept internally for site playback and backup; not returned to downstream API-token callers."],
    ],
    example: `GET /api/generation-records?limit=60
Authorization: Bearer <user-token>

GET /api/generation-records/<taskId>
Authorization: Bearer <user-token>`,
  },
  samples: {
    title: "Ready-made Clients",
    summary: "These are copy-ready snippets for TypeScript, Python, curl, agent instructions, and MCP wrappers.",
    request: [
      ["TypeScript", "fetch wrapper with Authorization header and JSON body."],
      ["Python", "requests wrapper with JSON body and timeout."],
      ["CLI", "curl command examples."],
      ["Agent", "Prompt rules for an agent."],
      ["MCP", "HTTP wrapper input format."],
    ],
    response: [
      ["Video URL", "API-token task queries return upstream provider URLs only; returned URLs may expire after 24 hours."],
      ["History", "Use /api/generation-records or /api/generation-records/<taskId> to check progress."],
    ],
    example: LIVE_HTTP_ACCESS_COPY,
  },
};

PUBLIC_COPY.galleryTitle = "Create AI videos";
PUBLIC_COPY.gallerySubtitle = "Choose a template, upload an image or enter text, and create a new video.";
PUBLIC_COPY.galleryNotice = "Generated results are saved in history. Video links may expire after 24 hours, so download and save them in time.";
PUBLIC_COPY.accessTitle = "API Access";
PUBLIC_COPY.accessSubtitle = "Connect your product, scripts, agents, or MCP wrapper to the production generation API.";
PUBLIC_COPY.accessNotice = "All examples call the production API. Download or persist returned video URLs within 24 hours.";
PUBLIC_COPY.accessCopy = LIVE_HTTP_ACCESS_COPY;
PUBLIC_COPY.advancedTitle = "Advanced Generate";
PUBLIC_COPY.advancedSubtitle = "Direct model controls for approved accounts.";
PUBLIC_COPY.advancedNotice = "Apply once. After approval, cases can fill the form automatically.";
PUBLIC_COPY.historyTitle = "Generation History";
PUBLIC_COPY.historySubtitle = "Review your generated videos, prompts, parameters and billing in one compact list.";
PUBLIC_COPY.historyNotice = "Only your own records are shown. Video links may expire after 24 hours; download/save successful results in time.";

ACCESS_INTEGRATION_GUIDES = [
  {
    id: "http",
    title: "HTTP API",
    subtitle: "Direct endpoint",
    desc: "Production endpoint. Submit generation jobs and query records/results.",
    copy: LIVE_HTTP_ACCESS_COPY,
  },
  {
    id: "typescript",
    title: "TypeScript",
    subtitle: "Server code",
    desc: "A working fetch wrapper around the same production HTTP API.",
    copy: TYPE_SCRIPT_ACCESS_COPY,
  },
  {
    id: "python",
    title: "Python",
    subtitle: "Server code",
    desc: "A working requests wrapper around the same production HTTP API.",
    copy: PYTHON_ACCESS_COPY,
  },
  {
    id: "cli",
    title: "CLI",
    subtitle: "curl",
    desc: "Direct curl commands for submitting and checking generation jobs.",
    copy: CLI_ACCESS_COPY,
  },
  {
    id: "assets",
    docs: "assets",
    title: "Assets",
    subtitle: "Upload",
    desc: "Upload reusable images, videos, or audio and reuse returned asset ids.",
    copy: `POST ${apiUrl("/api/user-assets")}
Authorization: Bearer <user-token>
Content-Type: application/json

{"url":"https://example.com/image1.png","fileName":"image1.png","name":"image1"}
{"videoUrl":"https://example.com/video1.mp4","fileName":"video1.mp4","name":"video1"}
{"audioUrl":"https://example.com/audio1.mp3","fileName":"audio1.mp3","name":"audio1"}`,
  },
  {
    id: "agent",
    title: "Agent Kit",
    subtitle: "Prompt rules",
    desc: "Copy these rules into an agent so it calls the production API instead of inventing upstream parameters.",
    copy: AGENT_ACCESS_COPY,
  },
  {
    id: "mcp",
    title: "MCP",
    subtitle: "HTTP wrapper",
    desc: "MCP is available through a wrapper around the current HTTP API; there is no separate hosted MCP endpoint yet.",
    copy: MCP_ACCESS_COPY,
  },
];

ACCESS_PARAM_GUIDES = [
  {
    id: "seedance-params",
    docs: "seedanceParams",
    title: "Seedance Params",
    subtitle: "Video",
    desc: "Parameter table for Seedance video generation through the Volcengine-compatible task endpoint.",
    copy: SEEDANCE_PARAM_ACCESS_COPY,
  },
  {
    id: "wan27-video-params",
    docs: "wan27VideoParams",
    title: "Wan2.7 Video",
    subtitle: "Params",
    desc: "Parameter table for Wan2.7 video generation through /api/advanced/generate.",
    copy: WAN27_VIDEO_PARAM_ACCESS_COPY,
  },
  {
    id: "wan27-image-params",
    docs: "wan27ImageParams",
    title: "Wan2.7 Image",
    subtitle: "Params",
    desc: "Parameter table for Wan2.7 image generation and image editing.",
    copy: WAN27_IMAGE_PARAM_ACCESS_COPY,
  },
];

ACCESS_GUIDES = [...ACCESS_INTEGRATION_GUIDES, ...ACCESS_PARAM_GUIDES];

const LEGAL_UPDATED_AT = "2026-05-15";
const LEGAL_DOCS = {
  en: {
    privacy: {
      title: "Privacy Policy",
      sections: [
        ["Information we collect", "We collect account information, login credentials, contact or support messages, uploaded prompts and reference files, generation records, wallet order records, device and request logs, and information needed to keep the service secure."],
        ["How we use information", "We use this information to provide AI video generation, authenticate users, process credits and top-ups, prevent abuse, troubleshoot jobs, improve reliability, respond to support requests, and comply with applicable legal obligations."],
        ["AI content and uploads", "Prompts, uploaded images, generated videos, parameters, and task metadata may be processed by our infrastructure and model providers only as needed to operate the service, review failures, enforce safety rules, or preserve billing records."],
        ["Sharing", "We do not sell personal information. We may share limited data with hosting, payment, analytics, security, and model service providers, or disclose information when required by law, safety, fraud prevention, or enforcement of our agreements."],
        ["Retention and security", "We keep account, billing, generation, and log data for as long as needed for service operation, dispute handling, security, legal compliance, and backup recovery. We use reasonable administrative, technical, and organizational safeguards, but no online system is risk-free."],
        ["Your choices", "You may contact us to request access, correction, deletion, export, or restriction of personal information where applicable. Some records may be retained when required for legal, fraud-prevention, security, or accounting reasons."],
        ["Children", "The service is intended for adults or users with legal authority to accept these terms. Do not use the service if you are below the age required by your jurisdiction."],
        ["Changes", "We may update this policy when the product, laws, or operational needs change. The updated version takes effect when posted unless a later date is stated."],
      ],
    },
    registration: {
      title: "User Registration Agreement",
      sections: [
        ["Account eligibility", "By registering or using Vipeak AI, you confirm that you can legally enter this agreement and that the information you provide is truthful, current, and complete."],
        ["Account security", "You are responsible for safeguarding your password, API token, generated credentials, and activity under your account. Notify us promptly if you suspect unauthorized access."],
        ["Acceptable use", "You must not use the service to create illegal, non-consensual, deceptive, infringing, hateful, exploitative, abusive, or unsafe content, or to bypass safety controls, rate limits, access controls, or payment rules."],
        ["Uploads and rights", "You represent that you have the necessary rights, permissions, and consent for images, prompts, text, names, likenesses, trademarks, and other materials that you upload or request the service to process."],
        ["Credits and billing", "Credits are used for generation and related actions. Prices, model availability, duration, resolution, and credit consumption may change. Completed purchases and consumed credits are generally non-refundable unless required by law or expressly approved by us."],
        ["Generated content", "Generated outputs depend on model behavior and user inputs. You are responsible for reviewing outputs before publication or commercial use and for ensuring your use complies with law, platform rules, and third-party rights."],
        ["Service changes", "We may modify, suspend, throttle, or discontinue features, models, accounts, or access when needed for security, compliance, abuse prevention, maintenance, or business reasons."],
        ["Termination", "We may restrict or terminate accounts that violate this agreement, create risk, misuse the service, interfere with operations, or fail to pay amounts owed."],
      ],
    },
    disclaimer: {
      title: "Disclaimer",
      sections: [
        ["No professional advice", "The service provides creative AI tools and does not provide legal, financial, medical, safety, or other professional advice."],
        ["AI output limits", "AI-generated content may be inaccurate, unexpected, offensive, biased, incomplete, or unsuitable for a particular purpose. You must independently review and verify outputs before relying on them."],
        ["User responsibility", "You are responsible for prompts, uploads, generated content, publication, distribution, and downstream use. Do not represent generated content as real footage or real statements when that would mislead others."],
        ["Third-party services", "The service may depend on model providers, hosting providers, networks, wallets, and other third parties. Availability, latency, moderation results, and output quality may vary and are not guaranteed."],
        ["No warranties", "To the maximum extent permitted by law, the service is provided as is and as available, without warranties of uninterrupted operation, error-free output, merchantability, fitness for a particular purpose, or non-infringement."],
        ["Limitation of liability", "To the maximum extent permitted by law, Vipeak AI and its operators are not liable for indirect, incidental, special, consequential, punitive, or lost-profit damages arising from use or inability to use the service."],
      ],
    },
  },
  vi: {
    privacy: {
      title: "Chính sách quyền riêng tư",
      sections: [
        ["Thông tin chúng tôi thu thập", "Chúng tôi thu thập thông tin tài khoản, thông tin đăng nhập, tin nhắn hỗ trợ, prompt và tệp tham chiếu đã tải lên, lịch sử tạo, đơn nạp ví, nhật ký thiết bị và yêu cầu, cùng dữ liệu cần thiết để giữ dịch vụ an toàn."],
        ["Cách chúng tôi sử dụng thông tin", "Thông tin được dùng để cung cấp tạo video AI, xác thực người dùng, xử lý credits và nạp tiền, ngăn lạm dụng, xử lý lỗi tác vụ, cải thiện độ ổn định, hỗ trợ khách hàng và tuân thủ nghĩa vụ pháp lý."],
        ["Nội dung AI và tệp tải lên", "Prompt, hình ảnh tải lên, video tạo ra, tham số và metadata tác vụ có thể được xử lý bởi hạ tầng của chúng tôi và nhà cung cấp mô hình khi cần để vận hành dịch vụ, kiểm tra lỗi, thực thi quy tắc an toàn hoặc lưu hồ sơ thanh toán."],
        ["Chia sẻ", "Chúng tôi không bán thông tin cá nhân. Chúng tôi có thể chia sẻ dữ liệu giới hạn với nhà cung cấp lưu trữ, thanh toán, phân tích, bảo mật và mô hình, hoặc tiết lộ khi pháp luật, an toàn, chống gian lận hoặc việc thực thi thỏa thuận yêu cầu."],
        ["Lưu giữ và bảo mật", "Dữ liệu tài khoản, thanh toán, tạo nội dung và nhật ký được lưu trong thời gian cần thiết cho vận hành, xử lý tranh chấp, bảo mật, tuân thủ pháp luật và khôi phục sao lưu. Chúng tôi dùng biện pháp bảo vệ hợp lý, nhưng không hệ thống trực tuyến nào tuyệt đối an toàn."],
        ["Lựa chọn của bạn", "Bạn có thể liên hệ để yêu cầu truy cập, chỉnh sửa, xóa, xuất hoặc hạn chế xử lý thông tin cá nhân khi pháp luật áp dụng cho phép. Một số hồ sơ có thể được giữ lại vì lý do pháp lý, chống gian lận, bảo mật hoặc kế toán."],
        ["Trẻ em", "Dịch vụ dành cho người trưởng thành hoặc người có đủ thẩm quyền pháp lý để chấp nhận các điều khoản này. Không sử dụng dịch vụ nếu bạn chưa đủ tuổi theo quy định tại nơi bạn sinh sống."],
        ["Thay đổi", "Chúng tôi có thể cập nhật chính sách này khi sản phẩm, luật pháp hoặc nhu cầu vận hành thay đổi. Phiên bản mới có hiệu lực khi được đăng, trừ khi nêu ngày hiệu lực khác."],
      ],
    },
    registration: {
      title: "Thỏa thuận đăng ký người dùng",
      sections: [
        ["Điều kiện tài khoản", "Khi đăng ký hoặc sử dụng Vipeak AI, bạn xác nhận rằng bạn có quyền pháp lý để tham gia thỏa thuận này và thông tin cung cấp là đúng, hiện hành và đầy đủ."],
        ["Bảo mật tài khoản", "Bạn chịu trách nhiệm bảo vệ mật khẩu, API token, thông tin xác thực và mọi hoạt động trong tài khoản. Hãy thông báo ngay nếu nghi ngờ có truy cập trái phép."],
        ["Sử dụng được phép", "Bạn không được dùng dịch vụ để tạo nội dung bất hợp pháp, không có sự đồng ý, lừa đảo, xâm phạm quyền, thù ghét, bóc lột, lạm dụng hoặc không an toàn, hoặc để vượt qua kiểm soát an toàn, giới hạn tốc độ, kiểm soát truy cập hay quy tắc thanh toán."],
        ["Tệp tải lên và quyền", "Bạn cam kết có đầy đủ quyền, giấy phép và sự đồng ý cần thiết đối với hình ảnh, prompt, văn bản, tên, chân dung, nhãn hiệu và tài liệu khác mà bạn tải lên hoặc yêu cầu dịch vụ xử lý."],
        ["Credits và thanh toán", "Credits được dùng cho tạo nội dung và hành động liên quan. Giá, mô hình, thời lượng, độ phân giải và mức tiêu thụ credits có thể thay đổi. Giao dịch đã hoàn tất và credits đã dùng thường không hoàn tiền, trừ khi pháp luật yêu cầu hoặc chúng tôi chấp thuận rõ ràng."],
        ["Nội dung tạo ra", "Kết quả phụ thuộc vào hành vi mô hình và dữ liệu đầu vào. Bạn chịu trách nhiệm kiểm tra kết quả trước khi công bố hoặc dùng thương mại, và đảm bảo việc sử dụng tuân thủ pháp luật, quy tắc nền tảng và quyền của bên thứ ba."],
        ["Thay đổi dịch vụ", "Chúng tôi có thể sửa đổi, tạm dừng, giới hạn hoặc ngừng tính năng, mô hình, tài khoản hoặc quyền truy cập khi cần cho bảo mật, tuân thủ, chống lạm dụng, bảo trì hoặc lý do kinh doanh."],
        ["Chấm dứt", "Chúng tôi có thể hạn chế hoặc chấm dứt tài khoản vi phạm thỏa thuận này, tạo rủi ro, lạm dụng dịch vụ, gây ảnh hưởng vận hành hoặc không thanh toán số tiền đến hạn."],
      ],
    },
    disclaimer: {
      title: "Tuyên bố miễn trừ trách nhiệm",
      sections: [
        ["Không phải tư vấn chuyên môn", "Dịch vụ cung cấp công cụ AI sáng tạo và không phải tư vấn pháp lý, tài chính, y tế, an toàn hoặc tư vấn chuyên môn khác."],
        ["Giới hạn của kết quả AI", "Nội dung do AI tạo có thể không chính xác, bất ngờ, gây khó chịu, thiên lệch, không đầy đủ hoặc không phù hợp với mục đích cụ thể. Bạn phải tự kiểm tra và xác minh trước khi dựa vào kết quả."],
        ["Trách nhiệm của người dùng", "Bạn chịu trách nhiệm về prompt, tệp tải lên, nội dung tạo ra, công bố, phân phối và sử dụng sau đó. Không trình bày nội dung tạo ra như cảnh quay hoặc phát ngôn có thật nếu điều đó gây hiểu lầm."],
        ["Dịch vụ bên thứ ba", "Dịch vụ có thể phụ thuộc vào nhà cung cấp mô hình, lưu trữ, mạng, ví và bên thứ ba khác. Tính khả dụng, độ trễ, kết quả kiểm duyệt và chất lượng đầu ra có thể thay đổi và không được bảo đảm."],
        ["Không bảo đảm", "Trong phạm vi tối đa pháp luật cho phép, dịch vụ được cung cấp theo hiện trạng và khi sẵn có, không bảo đảm vận hành liên tục, không lỗi, khả năng thương mại, phù hợp mục đích cụ thể hoặc không xâm phạm."],
        ["Giới hạn trách nhiệm", "Trong phạm vi tối đa pháp luật cho phép, Vipeak AI và đơn vị vận hành không chịu trách nhiệm cho thiệt hại gián tiếp, ngẫu nhiên, đặc biệt, hệ quả, trừng phạt hoặc mất lợi nhuận phát sinh từ việc sử dụng hoặc không thể sử dụng dịch vụ."],
      ],
    },
  },
  ja: {
    privacy: {
      title: "プライバシーポリシー",
      sections: [
        ["収集する情報", "当社は、アカウント情報、ログイン情報、サポート連絡、アップロードされたプロンプトと参照ファイル、生成履歴、ウォレット注文履歴、デバイスおよびリクエストログ、サービスの安全維持に必要な情報を収集します。"],
        ["利用目的", "これらの情報は、AI 動画生成の提供、ユーザー認証、credits とチャージ処理、不正利用防止、ジョブの障害対応、信頼性改善、サポート対応、適用法令上の義務履行のために利用します。"],
        ["AI コンテンツとアップロード", "プロンプト、アップロード画像、生成動画、パラメータ、タスクメタデータは、サービス運営、障害調査、安全ルールの適用、請求記録の保存に必要な範囲で、当社インフラおよびモデル提供者により処理される場合があります。"],
        ["共有", "当社は個人情報を販売しません。ホスティング、決済、分析、セキュリティ、モデルサービス提供者に限定的なデータを共有する場合、または法令、安全、不正防止、契約の執行に必要な場合に情報を開示することがあります。"],
        ["保存と保護", "アカウント、請求、生成、ログデータは、サービス運営、紛争対応、セキュリティ、法令遵守、バックアップ復旧に必要な期間保存します。合理的な管理的、技術的、組織的保護措置を講じますが、オンラインシステムに完全な安全はありません。"],
        ["利用者の選択", "適用法令で認められる場合、個人情報へのアクセス、訂正、削除、エクスポート、処理制限を求めることができます。法令、不正防止、セキュリティ、会計上必要な記録は保持される場合があります。"],
        ["未成年者", "本サービスは成人、または本規約に同意する法的権限を有する利用者向けです。居住地の法令で必要な年齢に満たない場合は利用しないでください。"],
        ["変更", "製品、法令、運用上の必要性が変わった場合、本ポリシーを更新することがあります。別途記載がない限り、掲載時点で効力を生じます。"],
      ],
    },
    registration: {
      title: "ユーザー登録規約",
      sections: [
        ["アカウント資格", "Vipeak AI に登録または利用することで、利用者は本契約を締結する法的能力を有し、提供する情報が真実、最新かつ完全であることを確認します。"],
        ["アカウントの安全", "パスワード、API トークン、認証情報、およびアカウント上の活動を保護する責任は利用者にあります。不正アクセスの疑いがある場合は速やかに通知してください。"],
        ["許容される利用", "違法、非同意、欺瞞的、権利侵害、憎悪的、搾取的、虐待的、または安全でないコンテンツの作成、ならびに安全制御、レート制限、アクセス制御、支払いルールの回避に本サービスを使用してはなりません。"],
        ["アップロードと権利", "利用者は、アップロードまたは処理を依頼する画像、プロンプト、テキスト、氏名、肖像、商標その他の素材について、必要な権利、許可、同意を有することを表明します。"],
        ["credits と請求", "credits は生成および関連操作に使用されます。価格、モデル提供状況、時間、解像度、credits 消費量は変更される場合があります。完了した購入および消費済み credits は、法令で義務付けられる場合または当社が明示的に承認した場合を除き、原則返金されません。"],
        ["生成コンテンツ", "生成結果はモデルの挙動と入力内容に依存します。公開または商用利用前に結果を確認し、法令、プラットフォーム規則、第三者の権利を遵守する責任は利用者にあります。"],
        ["サービス変更", "当社は、セキュリティ、コンプライアンス、不正利用防止、保守、事業上の理由により、機能、モデル、アカウント、アクセスを変更、一時停止、制限、終了することがあります。"],
        ["終了", "本規約違反、リスクの発生、サービスの不正利用、運営妨害、支払不履行があるアカウントについて、当社は制限または終了することがあります。"],
      ],
    },
    disclaimer: {
      title: "免責事項",
      sections: [
        ["専門的助言ではありません", "本サービスは創作用 AI ツールを提供するものであり、法律、金融、医療、安全その他の専門的助言を提供するものではありません。"],
        ["AI 出力の限界", "AI 生成コンテンツは、不正確、予期しない、不快、偏り、不完全、または特定目的に不適切な場合があります。依拠する前に利用者自身で確認、検証してください。"],
        ["利用者の責任", "プロンプト、アップロード、生成コンテンツ、公開、配布、その後の利用については利用者が責任を負います。他者を誤認させる形で、生成コンテンツを実在の映像や発言として表示してはなりません。"],
        ["第三者サービス", "本サービスはモデル提供者、ホスティング、ネットワーク、ウォレットその他第三者に依存する場合があります。可用性、遅延、モデレーション結果、出力品質は変動し、保証されません。"],
        ["保証なし", "法令で許される最大限の範囲で、本サービスは現状有姿かつ提供可能な範囲で提供され、連続稼働、無エラー、商品性、特定目的適合性、非侵害について保証しません。"],
        ["責任制限", "法令で許される最大限の範囲で、Vipeak AI および運営者は、本サービスの利用または利用不能から生じる間接、偶発、特別、結果的、懲罰的損害または逸失利益について責任を負いません。"],
      ],
    },
  },
  ko: {
    privacy: {
      title: "개인정보 처리방침",
      sections: [
        ["수집하는 정보", "당사는 계정 정보, 로그인 자격 증명, 문의 및 지원 메시지, 업로드된 프롬프트와 참조 파일, 생성 기록, 지갑 주문 기록, 기기 및 요청 로그, 서비스 보안을 유지하는 데 필요한 정보를 수집합니다."],
        ["이용 목적", "이 정보는 AI 영상 생성 제공, 사용자 인증, credits 및 충전 처리, 남용 방지, 작업 오류 해결, 안정성 개선, 지원 요청 응답, 관련 법적 의무 준수를 위해 사용됩니다."],
        ["AI 콘텐츠와 업로드", "프롬프트, 업로드 이미지, 생성 영상, 파라미터, 작업 메타데이터는 서비스 운영, 오류 검토, 안전 규칙 집행, 결제 기록 보존에 필요한 범위에서 당사 인프라와 모델 제공자가 처리할 수 있습니다."],
        ["공유", "당사는 개인정보를 판매하지 않습니다. 호스팅, 결제, 분석, 보안, 모델 서비스 제공자와 제한된 데이터를 공유하거나, 법률, 안전, 사기 방지 또는 약관 집행에 필요한 경우 정보를 공개할 수 있습니다."],
        ["보관 및 보안", "계정, 결제, 생성, 로그 데이터는 서비스 운영, 분쟁 처리, 보안, 법적 준수, 백업 복구에 필요한 기간 동안 보관됩니다. 합리적인 관리적, 기술적, 조직적 보호조치를 사용하지만 온라인 시스템에 완전한 무위험은 없습니다."],
        ["이용자의 선택", "관련 법률이 허용하는 경우 개인정보의 열람, 정정, 삭제, 내보내기 또는 처리 제한을 요청할 수 있습니다. 법률, 사기 방지, 보안 또는 회계상 필요한 일부 기록은 보관될 수 있습니다."],
        ["아동", "본 서비스는 성인 또는 본 약관을 수락할 법적 권한이 있는 이용자를 대상으로 합니다. 관할 지역에서 요구하는 연령 미만인 경우 서비스를 이용하지 마십시오."],
        ["변경", "제품, 법률 또는 운영상 필요가 변경되면 본 방침을 업데이트할 수 있습니다. 별도 날짜가 명시되지 않는 한 게시 시점부터 효력이 발생합니다."],
      ],
    },
    registration: {
      title: "사용자 등록 약관",
      sections: [
        ["계정 자격", "Vipeak AI에 등록하거나 사용함으로써 귀하는 본 계약을 체결할 법적 능력이 있으며 제공하는 정보가 진실하고 최신이며 완전함을 확인합니다."],
        ["계정 보안", "비밀번호, API 토큰, 인증 정보 및 계정 활동을 보호할 책임은 귀하에게 있습니다. 무단 접근이 의심되면 즉시 알려주십시오."],
        ["허용되는 사용", "불법, 비동의, 기만, 권리 침해, 혐오, 착취, 학대 또는 안전하지 않은 콘텐츠를 만들거나 안전 제어, 속도 제한, 접근 제어, 결제 규칙을 우회하기 위해 서비스를 사용해서는 안 됩니다."],
        ["업로드와 권리", "귀하는 업로드하거나 서비스가 처리하도록 요청하는 이미지, 프롬프트, 텍스트, 이름, 초상, 상표 및 기타 자료에 필요한 권리, 허가 및 동의를 보유하고 있음을 진술합니다."],
        ["credits 및 결제", "credits는 생성 및 관련 작업에 사용됩니다. 가격, 모델 제공 여부, 길이, 해상도 및 credits 소비량은 변경될 수 있습니다. 완료된 구매와 사용된 credits는 법률상 요구되거나 당사가 명시적으로 승인한 경우를 제외하고 일반적으로 환불되지 않습니다."],
        ["생성 콘텐츠", "생성 결과는 모델 동작과 사용자 입력에 따라 달라집니다. 공개 또는 상업적 사용 전에 결과를 검토하고 법률, 플랫폼 규칙 및 제3자 권리를 준수할 책임은 귀하에게 있습니다."],
        ["서비스 변경", "당사는 보안, 준수, 남용 방지, 유지보수 또는 사업상 필요에 따라 기능, 모델, 계정 또는 접근을 수정, 일시 중지, 제한 또는 중단할 수 있습니다."],
        ["종료", "본 약관을 위반하거나 위험을 초래하거나 서비스를 오용하거나 운영을 방해하거나 미납 금액이 있는 계정은 제한 또는 종료될 수 있습니다."],
      ],
    },
    disclaimer: {
      title: "면책 고지",
      sections: [
        ["전문 조언 아님", "본 서비스는 창작용 AI 도구를 제공하며 법률, 금융, 의료, 안전 또는 기타 전문 조언을 제공하지 않습니다."],
        ["AI 출력의 한계", "AI 생성 콘텐츠는 부정확하거나 예상 밖이거나 불쾌하거나 편향되거나 불완전하거나 특정 목적에 적합하지 않을 수 있습니다. 결과에 의존하기 전에 독립적으로 검토하고 확인해야 합니다."],
        ["사용자 책임", "프롬프트, 업로드, 생성 콘텐츠, 게시, 배포 및 이후 사용에 대한 책임은 귀하에게 있습니다. 타인을 오도할 수 있는 경우 생성 콘텐츠를 실제 영상이나 실제 발언으로 표시하지 마십시오."],
        ["제3자 서비스", "서비스는 모델 제공자, 호스팅, 네트워크, 지갑 및 기타 제3자에 의존할 수 있습니다. 가용성, 지연, 검수 결과 및 출력 품질은 달라질 수 있으며 보장되지 않습니다."],
        ["보증 없음", "법률이 허용하는 최대 범위에서 서비스는 있는 그대로 및 이용 가능한 상태로 제공되며 중단 없는 운영, 오류 없는 출력, 상품성, 특정 목적 적합성 또는 비침해를 보증하지 않습니다."],
        ["책임 제한", "법률이 허용하는 최대 범위에서 Vipeak AI와 운영자는 서비스 이용 또는 이용 불가로 발생하는 간접, 부수, 특별, 결과, 징벌적 손해 또는 이익 손실에 대해 책임지지 않습니다."],
      ],
    },
  },
  id: {
    privacy: {
      title: "Kebijakan Privasi",
      sections: [
        ["Informasi yang kami kumpulkan", "Kami mengumpulkan informasi akun, kredensial login, pesan dukungan, prompt dan file referensi yang diunggah, riwayat pembuatan, catatan pesanan dompet, log perangkat dan permintaan, serta informasi yang diperlukan untuk menjaga keamanan layanan."],
        ["Cara kami menggunakan informasi", "Informasi digunakan untuk menyediakan pembuatan video AI, mengautentikasi pengguna, memproses credits dan top-up, mencegah penyalahgunaan, menangani kegagalan job, meningkatkan keandalan, menjawab dukungan, dan mematuhi kewajiban hukum yang berlaku."],
        ["Konten AI dan unggahan", "Prompt, gambar yang diunggah, video yang dibuat, parameter, dan metadata tugas dapat diproses oleh infrastruktur kami dan penyedia model sejauh diperlukan untuk mengoperasikan layanan, meninjau kegagalan, menerapkan aturan keselamatan, atau menyimpan catatan billing."],
        ["Berbagi", "Kami tidak menjual informasi pribadi. Kami dapat membagikan data terbatas kepada penyedia hosting, pembayaran, analitik, keamanan, dan layanan model, atau mengungkapkan informasi bila diwajibkan hukum, keselamatan, pencegahan penipuan, atau penegakan perjanjian."],
        ["Retensi dan keamanan", "Data akun, billing, pembuatan, dan log disimpan selama diperlukan untuk operasi layanan, penanganan sengketa, keamanan, kepatuhan hukum, dan pemulihan cadangan. Kami memakai perlindungan administratif, teknis, dan organisasi yang wajar, tetapi tidak ada sistem online yang sepenuhnya bebas risiko."],
        ["Pilihan Anda", "Anda dapat menghubungi kami untuk meminta akses, koreksi, penghapusan, ekspor, atau pembatasan informasi pribadi jika diizinkan hukum yang berlaku. Beberapa catatan dapat tetap disimpan untuk alasan hukum, pencegahan penipuan, keamanan, atau akuntansi."],
        ["Anak-anak", "Layanan ini ditujukan untuk orang dewasa atau pengguna yang memiliki kewenangan hukum untuk menerima ketentuan ini. Jangan gunakan layanan jika Anda berada di bawah usia yang disyaratkan di yurisdiksi Anda."],
        ["Perubahan", "Kami dapat memperbarui kebijakan ini ketika produk, hukum, atau kebutuhan operasional berubah. Versi yang diperbarui berlaku saat diposting kecuali dinyatakan tanggal lain."],
      ],
    },
    registration: {
      title: "Perjanjian Pendaftaran Pengguna",
      sections: [
        ["Kelayakan akun", "Dengan mendaftar atau menggunakan Vipeak AI, Anda menyatakan bahwa Anda dapat secara hukum membuat perjanjian ini dan informasi yang Anda berikan benar, terkini, dan lengkap."],
        ["Keamanan akun", "Anda bertanggung jawab menjaga kata sandi, token API, kredensial, dan aktivitas di akun Anda. Beri tahu kami segera jika Anda mencurigai akses tanpa izin."],
        ["Penggunaan yang diperbolehkan", "Anda tidak boleh menggunakan layanan untuk membuat konten ilegal, tanpa persetujuan, menipu, melanggar hak, kebencian, eksploitatif, abusif, atau tidak aman, atau untuk melewati kontrol keselamatan, batas laju, kontrol akses, atau aturan pembayaran."],
        ["Unggahan dan hak", "Anda menyatakan memiliki hak, izin, dan persetujuan yang diperlukan atas gambar, prompt, teks, nama, kemiripan, merek dagang, dan materi lain yang Anda unggah atau minta untuk diproses layanan."],
        ["Credits dan billing", "Credits digunakan untuk pembuatan dan tindakan terkait. Harga, ketersediaan model, durasi, resolusi, dan konsumsi credits dapat berubah. Pembelian yang selesai dan credits yang telah digunakan umumnya tidak dapat dikembalikan kecuali diwajibkan hukum atau disetujui secara tegas oleh kami."],
        ["Konten yang dibuat", "Output bergantung pada perilaku model dan input pengguna. Anda bertanggung jawab meninjau output sebelum publikasi atau penggunaan komersial dan memastikan penggunaan Anda mematuhi hukum, aturan platform, dan hak pihak ketiga."],
        ["Perubahan layanan", "Kami dapat mengubah, menangguhkan, membatasi, atau menghentikan fitur, model, akun, atau akses bila diperlukan untuk keamanan, kepatuhan, pencegahan penyalahgunaan, pemeliharaan, atau alasan bisnis."],
        ["Pengakhiran", "Kami dapat membatasi atau mengakhiri akun yang melanggar perjanjian ini, menimbulkan risiko, menyalahgunakan layanan, mengganggu operasi, atau gagal membayar jumlah yang terutang."],
      ],
    },
    disclaimer: {
      title: "Sanggahan",
      sections: [
        ["Bukan nasihat profesional", "Layanan ini menyediakan alat AI kreatif dan tidak memberikan nasihat hukum, keuangan, medis, keselamatan, atau nasihat profesional lainnya."],
        ["Batasan output AI", "Konten buatan AI dapat tidak akurat, tidak terduga, menyinggung, bias, tidak lengkap, atau tidak sesuai untuk tujuan tertentu. Anda harus meninjau dan memverifikasi output secara independen sebelum mengandalkannya."],
        ["Tanggung jawab pengguna", "Anda bertanggung jawab atas prompt, unggahan, konten yang dibuat, publikasi, distribusi, dan penggunaan lanjutan. Jangan menyatakan konten yang dibuat sebagai rekaman nyata atau pernyataan nyata jika hal itu dapat menyesatkan orang lain."],
        ["Layanan pihak ketiga", "Layanan dapat bergantung pada penyedia model, hosting, jaringan, dompet, dan pihak ketiga lainnya. Ketersediaan, latensi, hasil moderasi, dan kualitas output dapat berbeda dan tidak dijamin."],
        ["Tanpa jaminan", "Sejauh diizinkan hukum, layanan disediakan sebagaimana adanya dan sebagaimana tersedia, tanpa jaminan operasi tanpa gangguan, output bebas kesalahan, kelayakan jual, kesesuaian untuk tujuan tertentu, atau tidak melanggar hak."],
        ["Batasan tanggung jawab", "Sejauh diizinkan hukum, Vipeak AI dan operatornya tidak bertanggung jawab atas kerugian tidak langsung, insidental, khusus, konsekuensial, hukuman, atau kehilangan keuntungan yang timbul dari penggunaan atau ketidakmampuan menggunakan layanan."],
      ],
    },
  },
};

let activeAccessMode = "integration";
let activeAccessGuide = ACCESS_INTEGRATION_GUIDES[0];
let activeHoverPreviewStop = null;
let historyLoading = false;
let historyRefreshTimer = null;
let historyRefreshInFlight = false;
let historyRecordsSignature = "";
const HISTORY_PENDING_REFRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const HISTORY_DETAIL_REFRESH_COOLDOWN_MS = 30 * 1000;
const HISTORY_DETAIL_REFRESH_LIMIT = 3;
const historyDetailRefreshAt = new Map();
const historyDetailRefreshInFlight = new Set();
const SUPPORTED_LANGS = new Set(Object.keys(I18N));
if (!SUPPORTED_LANGS.has(state.lang)) state.lang = "en";

function refreshIcons() {
  window.lucide?.createIcons();
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.("button, a, input, textarea, select, label"));
}

function cleanPublicCopy(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /ap[i]z|upstream|admin|上游|后台|api\s*接入/i.test(text)) return fallback;
  return text;
}

function t(key, vars = {}, fallback = "") {
  const value = I18N[state.lang]?.[key] ?? I18N.en[key] ?? fallback ?? key;
  return String(value).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

function fileInputLabel(input) {
  const files = Array.from(input?.files || []);
  if (!files.length) return t("file.none");
  if (files.length === 1) return files[0].name || t("file.choose");
  return t("file.multipleSelected", { count: files.length });
}

function updateFilePickerLabel(input) {
  if (!input?.id) return;
  const label = document.querySelector(`[data-file-name-for="${input.id}"]`);
  if (label) label.textContent = fileInputLabel(input);
}

function updateAllFilePickerLabels(root = document) {
  root.querySelectorAll("input[type='file']").forEach(updateFilePickerLabel);
}

function localizedPublicCopy(configValue, key) {
  const fallback = t(`copy.${key}`, {}, PUBLIC_COPY[key] || "");
  if (state.lang !== "en") return fallback;
  return cleanPublicCopy(configValue, fallback);
}

function withExpiryNotice(text = "") {
  const notice = t("copy.videoExpiryShort", {}, VIDEO_EXPIRY_NOTICE);
  const value = String(text || "").trim();
  if (!value) return notice;
  if (/24/.test(value)) return value;
  return `${value} ${notice}`;
}

function renderSimplePager(holder, data, onPage) {
  if (!holder) return;
  holder.innerHTML = `
    <button class="ghost-button" type="button" data-page="prev" ${data.page <= 1 ? "disabled" : ""}>${escapeHtml(t("ledger.prev"))}</button>
    <span>${escapeHtml(t("ledger.page", { page: data.page, totalPages: data.totalPages, total: data.total }))}</span>
    <button class="ghost-button" type="button" data-page="next" ${data.page >= data.totalPages ? "disabled" : ""}>${escapeHtml(t("ledger.next"))}</button>
  `;
  holder.querySelector('[data-page="prev"]')?.addEventListener("click", () => {
    if (data.page > 1) onPage(data.page - 1);
  });
  holder.querySelector('[data-page="next"]')?.addEventListener("click", () => {
    if (data.page < data.totalPages) onPage(data.page + 1);
  });
}

function showInlineDialog({ title = "", body = "", confirmText = "", dialogClass = "", keepOpenOnConfirm = false, onOpen, onConfirm } = {}) {
  if (!els.inlineDialog || !els.inlineDialogForm || !els.inlineDialogBody) return Promise.resolve("close");
  els.inlineDialog.classList.remove("is-media-action", "is-frame-action");
  String(dialogClass || "")
    .split(/\s+/)
    .filter(Boolean)
    .forEach((className) => els.inlineDialog.classList.add(className));
  els.inlineDialogTitle.textContent = title || "";
  els.inlineDialogBody.innerHTML = body || "";
  if (els.inlineDialogConfirm) {
    els.inlineDialogConfirm.type = "submit";
    els.inlineDialogConfirm.onclick = null;
    els.inlineDialogConfirm.disabled = false;
    els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(confirmText || t("common.generate"))}`;
  }
  refreshIcons();
  return new Promise((resolve) => {
    const cleanup = () => {
      els.inlineDialogForm.removeEventListener("submit", submitHandler);
      els.inlineDialogClose?.removeEventListener("click", closeHandler);
      els.inlineDialogCancel?.removeEventListener("click", closeHandler);
      els.inlineDialog.removeEventListener("close", dialogCloseHandler);
      els.inlineDialog.classList.remove("is-media-action", "is-frame-action");
    };
    const closeHandler = () => els.inlineDialog.close("close");
    const dialogCloseHandler = () => {
      cleanup();
      resolve(els.inlineDialog.returnValue || "close");
    };
    const submitHandler = async (event) => {
      event.preventDefault();
      try {
        if (els.inlineDialogConfirm) els.inlineDialogConfirm.disabled = true;
        if (typeof onConfirm === "function") await onConfirm(els.inlineDialogBody);
        if (keepOpenOnConfirm) {
          if (els.inlineDialogConfirm) els.inlineDialogConfirm.disabled = true;
          return;
        }
        cleanup();
        els.inlineDialog.close("confirm");
        resolve("confirm");
      } catch (error) {
        const status = els.inlineDialogBody.querySelector(".job-note:last-child");
        if (status) status.textContent = error.message || String(error);
        if (els.inlineDialogConfirm) els.inlineDialogConfirm.disabled = false;
      }
    };
    els.inlineDialogForm.addEventListener("submit", submitHandler);
    els.inlineDialogClose?.addEventListener("click", closeHandler);
    els.inlineDialogCancel?.addEventListener("click", closeHandler);
    els.inlineDialog.addEventListener("close", dialogCloseHandler);
    els.inlineDialog.showModal();
    if (typeof onOpen === "function") onOpen(els.inlineDialogBody);
  });
}

function guideText(guide, field) {
  return t(`guide.${guide.id}.${field}`, {}, guide[field] || "");
}

function accessDoc(guide = activeAccessGuide) {
  return ACCESS_DOCS[guide.docs || guide.id] || ACCESS_DOCS.platform;
}

function accessGuidesForMode(mode = activeAccessMode) {
  return mode === "params" ? ACCESS_PARAM_GUIDES : ACCESS_INTEGRATION_GUIDES;
}

function ensureActiveAccessGuide() {
  const guides = accessGuidesForMode();
  if (!guides.includes(activeAccessGuide)) activeAccessGuide = guides[0] || ACCESS_GUIDES[0];
  return guides;
}

function accessFieldTable(rows = []) {
  if (!rows.length) return "";
  const hasParamRows = rows.some((row) => row && typeof row === "object" && !Array.isArray(row));
  if (hasParamRows) {
    return `
      <div class="access-doc-table access-param-table">
        <div class="access-param-row access-param-head">
          <strong>Parameter</strong>
          <strong>Type</strong>
          <strong>Required</strong>
          <strong>Description</strong>
          <strong>Default</strong>
        </div>
        ${rows.map((row) => {
          const item = Array.isArray(row)
            ? { name: row[0], type: "", required: "", description: row[1], default: "" }
            : row;
          return `
            <div class="access-param-row">
              <strong>${escapeHtml(tenantScopedAccessText(item.name || ""))}</strong>
              <span><code>${escapeHtml(item.type || "-")}</code></span>
              <span>${escapeHtml(item.required || "No")}</span>
              <span>${escapeHtml(item.description || "")}</span>
              <span>${escapeHtml(item.default || "-")}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }
  return `
    <div class="access-doc-table">
      ${rows.map(([name, desc]) => `
        <div class="access-doc-row">
          <strong>${escapeHtml(tenantScopedAccessText(name))}</strong>
          <span>${escapeHtml(desc)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function accessQuickList(items = []) {
  if (!items.length) return "";
  return `<ul class="access-doc-quick">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function markdownTable(rows = []) {
  if (!rows.length) return "";
  const paramRows = rows.map((row) => (Array.isArray(row)
    ? { name: row[0], type: "-", required: "No", description: row[1], default: "-" }
    : row));
  const lines = [
    "| Parameter | Type | Required | Description | Default |",
    "| --- | --- | --- | --- | --- |",
    ...paramRows.map((row) => `| ${markdownCell(row.name)} | ${markdownCell(row.type || "-")} | ${markdownCell(row.required || "No")} | ${markdownCell(row.description || "")} | ${markdownCell(row.default || "-")} |`),
  ];
  return lines.join("\n");
}

function markdownCell(value = "") {
  return String(tenantScopedAccessText(value || ""))
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function accessDocMarkdown(doc = accessDoc(activeAccessGuide)) {
  return [
    `# ${doc.title}`,
    "",
    doc.summary || "",
    "",
    "## Request",
    "",
    markdownTable(doc.request),
    "",
    "## Response",
    "",
    markdownTable(doc.response),
    "",
    "## Example",
    "",
    "```http",
    tenantScopedAccessText(doc.example || "").trim(),
    "```",
    "",
  ].join("\n");
}

function downloadTextFile(filename = "api-doc.md", text = "") {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyAccessMarkdown(button = null, doc = accessDoc(activeAccessGuide)) {
  const markdown = accessDocMarkdown(doc);
  await navigator.clipboard.writeText(markdown);
  if (!button) return;
  const original = button.innerHTML;
  button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("common.copied"))}`;
  refreshIcons();
  setTimeout(() => {
    button.innerHTML = original;
    refreshIcons();
  }, 1200);
}

function downloadAccessMarkdown(doc = accessDoc(activeAccessGuide)) {
  const slug = String(activeAccessGuide?.id || "api-doc").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  downloadTextFile(`${slug}.md`, accessDocMarkdown(doc));
}

function legalDoc(type) {
  return LEGAL_DOCS[state.lang]?.[type] || LEGAL_DOCS.en[type] || LEGAL_DOCS.en.privacy;
}

function renderLegalDialog(type = "privacy") {
  const doc = legalDoc(type);
  if (!doc || !els.legalTitle || !els.legalBody) return;
  els.legalTitle.textContent = doc.title;
  els.legalBody.innerHTML = `
    <p class="legal-updated">${escapeHtml(t("legal.updated", { date: LEGAL_UPDATED_AT }))}</p>
    ${doc.sections.map(([heading, body]) => `
      <section>
        <h3>${escapeHtml(heading)}</h3>
        <p>${escapeHtml(body)}</p>
      </section>
    `).join("")}
  `;
}

function openLegalDialog(type = "privacy") {
  if (els.legalDialog) els.legalDialog.dataset.doc = type;
  renderLegalDialog(type);
  els.legalDialog?.showModal();
  refreshIcons();
}

function normalizeCopyKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[：:]/g, "");
}

function localizedCategoryName(category = {}) {
  const id = normalizeCopyKey(category.id);
  const name = normalizeCopyKey(category.name);
  if (id === "featured" || name === "精选模板" || name === "featured") return t("category.featured");
  if (id === "i2v" || name === "图生视频" || name === "imagetovideo") return t("category.i2v");
  if (id === "t2v" || name === "文生视频" || name === "texttovideo") return t("category.t2v");
  return category.name || category.id || "";
}

function localizedTemplateBadge(template = {}) {
  const badge = String(template.badge || "").trim();
  const normalized = normalizeCopyKey(badge);
  if (!badge) return template.type === "image-to-video" ? t("template.imageToVideo") : t("template.textToVideo");
  if (normalized === "图生视频" || normalized === "imagetovideo") return t("template.imageToVideo");
  if (normalized === "文生视频" || normalized === "texttovideo") return t("template.textToVideo");
  if (normalized === "精选模板" || normalized === "featured") return t("category.featured");
  return badge;
}

function titleFromTemplateId(id = "") {
  return String(id || "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function localizedTemplateTitle(template = {}) {
  const key = `templateTitle.${template.id || ""}`;
  const translated = I18N[state.lang]?.[key] || I18N.en[key];
  if (translated) return translated;
  const rawTitle = String(template.title || "").trim();
  if (state.lang === "en" && /[\u4e00-\u9fff]/.test(rawTitle)) return titleFromTemplateId(template.id) || "Template";
  return rawTitle || titleFromTemplateId(template.id) || "Template";
}

function setLocalizedContent(element, text) {
  if (!element) return;
  const icon = element.querySelector(":scope > svg, :scope > i");
  if (icon) {
    element.innerHTML = `${icon.outerHTML} ${escapeHtml(text)}`;
    return;
  }
  element.textContent = text;
}

function applyStaticTranslations() {
  document.documentElement.lang = state.lang;
  if (els.languageSelect) els.languageSelect.value = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    setLocalizedContent(element, t(element.dataset.i18n, {}, element.textContent));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder, {}, element.getAttribute("placeholder") || ""));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria, {}, element.getAttribute("aria-label") || ""));
  });
}

function applyTenantFeatures() {
  const assetEnabled = tenantFeature("assetLibrary", true);
  const accountMenuEnabled = true;
  document.querySelectorAll(".tenant-menu-only").forEach((element) => {
    element.hidden = !accountMenuEnabled;
  });
  document.querySelectorAll(".tenant-compact-only").forEach((element) => {
    element.hidden = tenantFeature("accountMenu", true);
  });
  document.querySelectorAll(".tenant-old-tab").forEach((element) => {
    element.hidden = !assetEnabled;
  });
  document.querySelectorAll("[data-tab='assets']").forEach((element) => {
    element.hidden = !assetEnabled;
  });
}

function applyLanguage() {
  applyStaticTranslations();
  applyTenantFeatures();
  renderCategories();
  renderTemplates();
  bindCharacterCreator();
  renderAccessGuides();
  renderAdvanced();
  renderAssets();
  renderGalleryCharacters(els.characterGrid);
  renderAccountMenu();
  renderTopupSummary();
  renderTokenDisplays();
  renderApiSubtokens();
  renderLoginMode();
  if (els.legalDialog?.open) renderLegalDialog(els.legalDialog.dataset.doc || "privacy");
  updateSubmitButtonCost();
  updateAdvancedButtonCost();
  if (state.tab === "history" && !historyLoading) loadHistory();
  if (state.tab === "topups") loadTopupRecords();
  if (state.tab === "spending") loadSpendingRecords();
  if (state.tab === "assets") loadUserAssets();
  if (state.tab === "advanced") loadAdvancedAssets();
  if (state.tab === "access") loadApiSubtokens();
  refreshIcons();
}

function setLanguage(lang) {
  const next = SUPPORTED_LANGS.has(lang) ? lang : "en";
  state.lang = next;
  localStorage.setItem(LANG_KEY, next);
  applyLanguage();
}

function setUser(user, { refreshHistory = false } = {}) {
  const previousMultiplier = Number(state.user?.pricingMultiplier || 1);
  const previousUserId = state.user?.id || "";
  state.user = user || null;
  const nextMultiplier = Number(state.user?.pricingMultiplier || 1);
  if ((state.user?.id || "") !== previousUserId) {
    state.galleryUnlocks = [];
    state.galleryUnlocksLoaded = false;
    state.galleryUnlockMessage = "";
    state.advancedAssets = [];
    state.advancedAssetsLoaded = false;
    state.advancedAssetPage = 1;
    state.advancedAssetTotal = 0;
    state.advancedAssetTotalPages = 1;
  }
  const accountLabel = state.user
    ? state.user.username
    : t("nav.login");
  if (els.accountMenuLabel) els.accountMenuLabel.textContent = accountLabel;
  renderTokenDisplays();
  renderTopupSummary();
  renderAccessGuides();
  renderApiSubtokens();
  renderAdvanced();
  renderAssets();
  renderAccountMenu();
  if (state.tab === "topups") loadTopupRecords(1);
  if (state.tab === "spending") loadSpendingRecords(1);
  if (state.tab === "assets") loadUserAssets();
  if (state.tab === "advanced") loadAdvancedAssets();
  if (state.tab === "access") loadApiSubtokens({ force: true });
  if (state.tab === "characters") {
    loadUserAssets(state.userAssetsPage || 1).catch(() => {});
    if (state.activeGalleryCharacterId) loadGalleryUnlocks();
  }
  if (refreshHistory && state.tab === "history") loadHistory();
  if (previousMultiplier !== nextMultiplier) {
    state.advancedEstimate = null;
    state.advancedEstimateKey = "";
    loadPlatformEstimates();
    updateAdvancedButtonCost();
  }
  syncTopupAutoRefresh();
}

function maskToken(token = "") {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 3)}...${value.slice(-3)}`;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function currentTokenLabel(showFull = false) {
  const token = state.user?.apiToken || "";
  if (!state.token || !state.user || !token) return t("access.tokenLogin");
  return showFull ? token : maskToken(token);
}

function hydrateAccessCopy(copy = "", { revealToken = false } = {}) {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const tokenLabel = token !== "<user-token>" ? (revealToken ? token : maskToken(token)) : "<user-token>";
  return tenantScopedAccessText(copy || PUBLIC_COPY.accessCopy).replaceAll("<user-token>", tokenLabel);
}

function fullAccessCopy() {
  return hydrateAccessCopy(activeAccessGuide.copy, { revealToken: true });
}

function allParameterDocsMarkdown({ revealToken = false } = {}) {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const markdown = ACCESS_PARAM_GUIDES
    .map((guide) => accessDocMarkdown(accessDoc(guide)))
    .join("\n\n---\n\n");
  return revealToken ? markdown.replaceAll("<user-token>", token) : markdown;
}

function tokenAccessPackageMarkdown() {
  const token = state.token && state.user?.apiToken ? state.user.apiToken : "<user-token>";
  const baseUrl = API_ORIGIN || window.location.origin || "";
  const docsUrl = PARAM_DOC_MARKDOWN_URL || apiUrl("/docs/models.md");
  return [
    "# Vipeak AI API Access Package",
    "",
    `Base URL: ${baseUrl}`,
    `API Token: ${token}`,
    `Full parameter docs: ${docsUrl}`,
    "",
    "## Quick Start",
    "",
    "```http",
    hydrateAccessCopy(LIVE_HTTP_ACCESS_COPY, { revealToken: true }).trim(),
    "```",
    "",
    "## Detailed Parameters",
    "",
    allParameterDocsMarkdown({ revealToken: true }).trim(),
    "",
  ].join("\n");
}

function apiSubtokenStatusLabel(token = {}) {
  const status = String(token.status || "").toLowerCase();
  if (status === "revoked") return t("access.subtokenRevoked");
  if (status === "expired") return t("access.subtokenExpired");
  return t("access.subtokenActive");
}

function apiSubtokenQuotaLabel(token = {}) {
  const quotaType = String(token.quotaType || "") === "count" ? "count" : "amount";
  const unit = quotaType === "count" ? t("access.subtokenCount") : t("common.credits");
  return `${formatCredits(token.remaining)} / ${formatCredits(token.quotaLimit)} ${unit}`;
}

function apiSubtokenUsedLabel(token = {}) {
  if (String(token.quotaType || "") === "count") {
    return `${formatCredits(token.usedCount || 0)} ${t("access.subtokenCount")}`;
  }
  return `${formatCredits(token.usedAmount || 0)} ${t("common.credits")}`;
}

function apiSubtokenRemainingStep(token = {}) {
  return String(token.quotaType || "") === "count" ? "1" : "0.000001";
}

function apiSubtokenRemainingEditLabel(token = {}) {
  return String(token.quotaType || "") === "count"
    ? t("access.subtokenRemainingCountEdit")
    : t("access.subtokenRemainingAmountEdit");
}

function apiSubtokenExpiresInputValue(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function renderApiSubtokens() {
  if (!els.accessSubtokens) return;
  if (!state.user) {
    els.accessSubtokens.innerHTML = `
      <article class="access-doc-card access-subtoken-card">
        <div class="access-doc-head">
          <div>
            <span class="copy-kicker"><i data-lucide="key-round"></i>${escapeHtml(t("access.subtokensTitle"))}</span>
            <p>${escapeHtml(t("access.subtokensLogin"))}</p>
          </div>
        </div>
      </article>
    `;
    refreshIcons();
    return;
  }

  const created = state.createdApiSubtoken;
  const rows = (state.apiSubtokens || []).map((token) => `
    <article class="subtoken-row ${token.active ? "" : "is-disabled"}">
      <div class="subtoken-main">
        <strong>${escapeHtml(token.name || token.id)}</strong>
        <code>${escapeHtml(token.tokenPreview || maskToken(token.token || ""))}</code>
      </div>
      <div class="subtoken-metrics">
        <span><small>${escapeHtml(t("access.subtokenRemaining"))}</small><b>${escapeHtml(apiSubtokenQuotaLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenUsed"))}</small><b>${escapeHtml(apiSubtokenUsedLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenStatus"))}</small><b>${escapeHtml(apiSubtokenStatusLabel(token))}</b></span>
        <span><small>${escapeHtml(t("access.subtokenLastUsed"))}</small><b>${escapeHtml(token.lastUsedAt ? formatDateTime(token.lastUsedAt) : t("access.subtokenNever"))}</b></span>
      </div>
      <form class="subtoken-edit" id="subtoken-edit-${escapeHtml(token.id)}" data-edit-subtoken="${escapeHtml(token.id)}">
        <label class="field"><span>${escapeHtml(apiSubtokenRemainingEditLabel(token))}</span><input name="remaining" type="number" min="0" step="${escapeHtml(apiSubtokenRemainingStep(token))}" value="${escapeHtml(formatCredits(token.remaining || 0))}" ${token.revokedAt ? "disabled" : ""} /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenExpires"))}</span><input name="expiresAt" type="datetime-local" value="${escapeHtml(apiSubtokenExpiresInputValue(token.expiresAt))}" ${token.revokedAt ? "disabled" : ""} /></label>
      </form>
      <div class="subtoken-actions">
        <button class="ghost-button" type="button" disabled><i data-lucide="lock-keyhole"></i>${escapeHtml(t("access.subtokenMasked"))}</button>
        <button class="ghost-button" type="submit" form="subtoken-edit-${escapeHtml(token.id)}" data-save-subtoken="${escapeHtml(token.id)}" ${token.revokedAt ? "disabled" : ""}><i data-lucide="save"></i>${escapeHtml(t("access.subtokenSave"))}</button>
        <button class="ghost-button danger-link" type="button" data-revoke-subtoken="${escapeHtml(token.id)}" ${token.active ? "" : "disabled"}><i data-lucide="ban"></i>${escapeHtml(t("access.subtokenRevoke"))}</button>
      </div>
    </article>
  `).join("");

  els.accessSubtokens.innerHTML = `
    <article class="access-doc-card access-subtoken-card">
      <div class="access-doc-head subtoken-head">
        <div>
          <span class="copy-kicker"><i data-lucide="key-round"></i>${escapeHtml(t("access.subtokensTitle"))}</span>
          <p>${escapeHtml(t("access.subtokensDesc"))}</p>
        </div>
        <button class="ghost-button" type="button" id="refreshSubtokensBtn" ${state.apiSubtokensLoading ? "disabled" : ""}><i data-lucide="refresh-cw"></i>${escapeHtml(t("history.refresh"))}</button>
      </div>
      <form class="subtoken-create" id="subtokenCreateForm">
        <label class="field"><span>${escapeHtml(t("access.subtokenName"))}</span><input id="subtokenName" type="text" maxlength="80" placeholder="${escapeHtml(t("access.subtokenNamePlaceholder"))}" required /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenQuotaType"))}</span><select id="subtokenQuotaType"><option value="amount">${escapeHtml(t("access.subtokenAmount"))}</option><option value="count">${escapeHtml(t("access.subtokenCount"))}</option></select></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenQuota"))}</span><input id="subtokenQuotaLimit" type="number" min="0.000001" step="0.000001" placeholder="${escapeHtml(t("access.subtokenQuotaPlaceholder"))}" required /></label>
        <label class="field"><span>${escapeHtml(t("access.subtokenExpires"))}</span><input id="subtokenExpiresAt" type="datetime-local" /></label>
        <button class="copy-btn" type="submit" ${state.apiSubtokensLoading ? "disabled" : ""}><i data-lucide="plus"></i>${escapeHtml(t("access.createSubtoken"))}</button>
      </form>
      ${created?.token ? `
        <div class="subtoken-created">
          <div>
            <strong>${escapeHtml(t("access.subtokenCreated"))}</strong>
            <code>${escapeHtml(created.token)}</code>
          </div>
          <button class="copy-btn" type="button" data-copy-created-subtoken="${escapeHtml(created.token)}"><i data-lucide="copy"></i>${escapeHtml(t("access.subtokenCopyNew"))}</button>
        </div>
      ` : ""}
      ${state.apiSubtokenMessage ? `<p class="job-note subtoken-message">${escapeHtml(state.apiSubtokenMessage)}</p>` : ""}
      <div class="subtoken-list">
        ${state.apiSubtokensLoading ? `<div class="job-note">${escapeHtml(t("assets.loading"))}</div>` : (rows || `<div class="job-note">${escapeHtml(t("access.subtokenEmpty"))}</div>`)}
      </div>
    </article>
  `;

  els.accessSubtokens.querySelector("#refreshSubtokensBtn")?.addEventListener("click", () => loadApiSubtokens({ force: true }));
  els.accessSubtokens.querySelector("#subtokenCreateForm")?.addEventListener("submit", submitApiSubtokenCreate);
  els.accessSubtokens.querySelectorAll("[data-copy-created-subtoken]").forEach((button) => {
    button.addEventListener("click", async () => {
      const token = button.dataset.copyCreatedSubtoken || "";
      if (!token) return;
      await navigator.clipboard.writeText(token);
      button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("access.subtokenCopiedShort"))}`;
      refreshIcons();
      window.setTimeout(() => renderApiSubtokens(), 1400);
    });
  });
  els.accessSubtokens.querySelectorAll("[data-revoke-subtoken]").forEach((button) => {
    button.addEventListener("click", () => revokeApiSubtoken(button.dataset.revokeSubtoken || "", button));
  });
  els.accessSubtokens.querySelectorAll("[data-edit-subtoken]").forEach((form) => {
    form.addEventListener("submit", submitApiSubtokenUpdate);
  });
  refreshIcons();
}

async function loadApiSubtokens({ force = false } = {}) {
  if (!state.user || !els.accessSubtokens) {
    state.apiSubtokens = [];
    state.apiSubtokensLoaded = false;
    renderApiSubtokens();
    return;
  }
  if (state.apiSubtokensLoading || (state.apiSubtokensLoaded && !force)) {
    renderApiSubtokens();
    return;
  }
  state.apiSubtokensLoading = true;
  state.apiSubtokenMessage = "";
  renderApiSubtokens();
  try {
    const payload = await requestJson("/api/access/subtokens");
    state.apiSubtokens = payload.subtokens || [];
    state.apiSubtokensLoaded = true;
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenLoadFailed", { message: error.message || String(error) });
  } finally {
    state.apiSubtokensLoading = false;
    renderApiSubtokens();
  }
}

async function submitApiSubtokenCreate(event) {
  event.preventDefault();
  if (!state.user) return openLogin();
  const root = els.accessSubtokens;
  const name = root?.querySelector("#subtokenName")?.value.trim() || "";
  const quotaType = root?.querySelector("#subtokenQuotaType")?.value || "amount";
  const quotaLimit = Number(root?.querySelector("#subtokenQuotaLimit")?.value || 0);
  const expiresInput = root?.querySelector("#subtokenExpiresAt")?.value || "";
  const expiresAt = expiresInput ? new Date(expiresInput).toISOString() : "";
  if (!name || !Number.isFinite(quotaLimit) || quotaLimit <= 0) return;
  state.apiSubtokensLoading = true;
  state.apiSubtokenMessage = "";
  renderApiSubtokens();
  try {
    const payload = await requestJson("/api/access/subtokens", {
      method: "POST",
      body: { name, quotaType, quotaLimit, expiresAt },
    });
    state.createdApiSubtoken = payload.subtoken || null;
    state.apiSubtokens = payload.subtoken
      ? [payload.subtoken, ...(state.apiSubtokens || []).filter((token) => token.id !== payload.subtoken.id)]
      : state.apiSubtokens;
    state.apiSubtokensLoaded = true;
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenCreateFailed", { message: error.message || String(error) });
  } finally {
    state.apiSubtokensLoading = false;
    renderApiSubtokens();
  }
}

async function revokeApiSubtoken(tokenId, button = null) {
  if (!tokenId) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("access.subtokenRevoke"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/access/subtokens/${encodeURIComponent(tokenId)}`, { method: "DELETE" });
    state.apiSubtokens = (state.apiSubtokens || []).map((token) => token.id === tokenId ? (payload.subtoken || token) : token);
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenRevokeFailed", { message: error.message || String(error) });
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    renderApiSubtokens();
  }
}

async function submitApiSubtokenUpdate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const tokenId = form?.dataset?.editSubtoken || "";
  if (!tokenId) return;
  const remainingInput = form.querySelector("[name='remaining']");
  const expiresInput = form.querySelector("[name='expiresAt']");
  const remaining = Number(remainingInput?.value || 0);
  if (!Number.isFinite(remaining) || remaining < 0) return;
  const expiresAt = expiresInput?.value ? new Date(expiresInput.value).toISOString() : "";
  const button = Array.from(els.accessSubtokens?.querySelectorAll("[data-save-subtoken]") || [])
    .find((item) => item.dataset.saveSubtoken === tokenId);
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("access.subtokenSave"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/access/subtokens/${encodeURIComponent(tokenId)}`, {
      method: "PATCH",
      body: { remaining, expiresAt },
    });
    state.apiSubtokens = (state.apiSubtokens || []).map((token) => token.id === tokenId ? (payload.subtoken || token) : token);
    state.apiSubtokenMessage = "";
  } catch (error) {
    state.apiSubtokenMessage = t("access.subtokenUpdateFailed", { message: error.message || String(error) });
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    renderApiSubtokens();
  }
}

function renderTokenDisplays() {
  if (els.accessTokenDisplay) {
    els.accessTokenDisplay.textContent = currentTokenLabel(state.showAccessToken);
  }
  if (els.accessTokenHint) {
    els.accessTokenHint.textContent = state.user
      ? t("access.tokenHintUser")
      : t("access.tokenHintGuest");
  }
  if (els.toggleAccessTokenBtn) {
    els.toggleAccessTokenBtn.textContent = state.showAccessToken ? t("common.hide") : t("common.showFull");
    els.toggleAccessTokenBtn.disabled = !state.token || !state.user;
  }
  if (els.copyTokenBtn) {
    els.copyTokenBtn.disabled = !state.token || !state.user?.apiToken;
    els.copyTokenBtn.innerHTML = `<i data-lucide="key-round"></i>Copy token + docs`;
  }
  if (els.accountName) els.accountName.textContent = state.user?.username || t("account.title");
  if (els.accountCredits) els.accountCredits.textContent = String(Number(state.user?.credits || 0));
  if (els.menuBalanceValue) els.menuBalanceValue.textContent = String(Number(state.user?.credits || 0));
  if (els.accountRole) els.accountRole.textContent = state.user?.role || "user";
  if (els.accountToken) els.accountToken.textContent = currentTokenLabel(state.showAccountToken);
  if (els.toggleAccountTokenBtn) {
    els.toggleAccountTokenBtn.textContent = state.showAccountToken ? t("common.hide") : t("common.showFull");
    els.toggleAccountTokenBtn.disabled = !state.token || !state.user?.apiToken;
  }
  if (els.copyAccountTokenBtn) {
    els.copyAccountTokenBtn.disabled = !state.token || !state.user?.apiToken;
  }
}

function renderAccountMenu() {
  const loggedIn = Boolean(state.user);
  if (els.menuBalance) els.menuBalance.hidden = !loggedIn;
  if (els.topupTriggerBtn) els.topupTriggerBtn.hidden = !loggedIn;
  document.querySelectorAll(".account-menu [data-tab]").forEach((button) => {
    button.hidden = !loggedIn;
  });
  if (els.menuLoginBtn) els.menuLoginBtn.hidden = loggedIn;
  if (els.menuCopyTokenBtn) els.menuCopyTokenBtn.disabled = !state.token || !state.user?.apiToken;
  if (els.menuCopyTokenBtn) els.menuCopyTokenBtn.hidden = !loggedIn;
  if (els.menuLogoutBtn) {
    els.menuLogoutBtn.hidden = !loggedIn;
    els.menuLogoutBtn.disabled = !loggedIn;
  }
}

function closeAccountMenu() {
  if (els.accountMenu) els.accountMenu.hidden = true;
  document.querySelectorAll(".account-menu [data-tab]").forEach((button) => {
    button.classList.remove("is-active");
  });
}

function toggleAccountMenu() {
  if (!els.accountMenu) return;
  els.accountMenu.hidden = !els.accountMenu.hidden;
  renderAccountMenu();
  refreshIcons();
}

function generationVideoUrl(record) {
  return record?.cdnVideoUrl || record?.localVideoUrl || record?.videoUrl || record?.remoteVideoUrl || "";
}

function generationImageResultUrl(record) {
  return record?.cdnImageUrl || record?.imageResultUrl || record?.localImageUrl || record?.remoteImageUrl || "";
}

function generationPosterUrl(record) {
  return record?.cdnPosterUrl || record?.posterUrl || record?.localPosterUrl || generationImageResultUrl(record) || recordImageAssets(record)[0]?.imageUrl || "";
}

function stripModelParams(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value || null;
  const next = { ...value };
  ["model", "provider", "modelProvider", "model_provider"].forEach((key) => delete next[key]);
  return next;
}

function mediaAssetPreviewUrl(asset = {}) {
  return asset.imageUrl || asset.videoUrl || asset.localUrl || asset.url || asset.sourceImageUrl || "";
}

function mediaAssetLabel(asset = {}, index = 0) {
  const type = String(asset.type || asset.key || "").replace(/_/g, " ");
  if (asset.type === "first_frame" || asset.key === "firstFrame") return "First frame";
  if (asset.type === "last_frame" || asset.key === "lastFrame") return "Last frame";
  if (asset.type === "reference_video") return "Video 1";
  if (asset.type === "first_clip") return "First clip";
  if (asset.type === "reference_image") return `Reference ${index + 1}`;
  return type || `Image ${index + 1}`;
}

function recordImageAssets(record = {}) {
  const images = [];
  const seen = new Set();
  const pushImage = (asset = {}, fallbackLabel = "") => {
    const url = mediaAssetPreviewUrl(asset);
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ ...asset, label: asset.label || fallbackLabel || mediaAssetLabel(asset, images.length) });
  };
  (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => !["driving_audio", "first_clip"].includes(asset.type))
    .forEach((asset) => pushImage(asset));
  pushImage({ imageUrl: record.imageUrl, type: "reference_image" }, "Reference");
  pushImage({ imageUrl: record.sourceImageUrl, type: "source_image" }, "Source image");
  return images;
}

function recordVideoAssets(record = {}) {
  return (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => ["reference_video", "first_clip"].includes(asset.type))
    .map((asset, index) => ({
      ...asset,
      label: asset.label || (asset.type === "first_clip" ? "First clip" : `Video ${index + 1}`),
      videoUrl: asset.videoUrl || asset.url || asset.localUrl || "",
    }))
    .filter((asset) => asset.videoUrl);
}

function generationRecordSignature(record = {}) {
  const billing = record.billing || {};
  return [
    record.taskId,
    record.updatedAt,
    record.status,
    generationVideoUrl(record),
    record.error,
    record.ratio,
    record.resolution,
    record.duration,
    generationImageResultUrl(record),
    JSON.stringify(record.mediaAssets || []),
    billing.status,
    billing.final,
    billing.settled,
  ].map((value) => String(value ?? "")).join("|");
}

function generationRecordsSignature(records = []) {
  return [...records]
    .sort((left, right) => String(left.taskId || "").localeCompare(String(right.taskId || "")))
    .map(generationRecordSignature)
    .join("\n");
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return t("status.completed");
  if (["failed", "error", "cancelled", "canceled"].includes(value)) return t("status.failed");
  if (["running", "processing", "in_progress", "preparing", "submitting", "queued"].includes(value)) return t("status.processing");
  return status || t("status.submitted");
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return "succeeded";
  if (["failed", "error", "cancelled", "canceled"].includes(value)) return "failed";
  if (["preparing", "submitting", "running", "processing", "in_progress", "queued"].includes(value)) return "running";
  return "submitted";
}

function billingLabel(billing = {}) {
  const pre = Number(billing.preDeducted || 0);
  const final = billing.final === null || billing.final === undefined ? null : Number(billing.final || 0);
  if (billing.status === "settle_pending_insufficient") return t("billing.pending", { pre, final });
  if (billing.settled && final !== null) return t("billing.final", { pre, final });
  return pre > 0 ? t("billing.prepaid", { pre }) : t("billing.noCharge");
}

function formatCredits(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "";
  return Number.isInteger(next) ? String(next) : next.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function creditsAmount(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.round(next * 10000) / 10000);
}

function userPricingMultiplier() {
  const next = Number(state.user?.pricingMultiplier || 1);
  if (!Number.isFinite(next) || next <= 0) return 1;
  return Math.max(0.01, Math.min(100, next));
}

function formatDurationSeconds(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return "";
  return t("cost.seconds", { value: Number.isInteger(next) ? next : next.toFixed(1).replace(/0+$/, "").replace(/\.$/, "") });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function templateCostLabel(templateId) {
  const estimate = state.estimates?.[templateId];
  if (!estimate) return t("cost.checking");
  if (estimate.available === false || estimate.credits === null || estimate.credits === undefined) return t("cost.unavailable");
  const duration = formatDurationSeconds(estimate.durationSeconds);
  const credits = formatCredits(estimate.credits);
  return duration ? `${t("cost.credits", { credits })} · ${duration}` : t("cost.credits", { credits });
}

function templateGenerateLabel(templateId) {
  return t("template.generate", { cost: templateCostLabel(templateId) });
}

function templateActionLabel(template = {}) {
  if (template.action === "advanced" || template.targetTab === "advanced") {
    return template.buttonLabel || "Advanced";
  }
  return templateGenerateLabel(template.id);
}

function updateSubmitButtonCost() {
  if (!els.submitTemplateBtn) return;
  const templateId = state.activeTemplate?.id || "";
  els.submitTemplateBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(templateGenerateLabel(templateId))}`;
  refreshIcons();
}

function advancedCaseDuration(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const bounds = advancedDurationBounds(advancedCaseProvider(item));
  const duration = Number(params.duration ?? item.duration ?? 5);
  if (!Number.isFinite(duration)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, duration));
}

function normalizeAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return DEFAULT_ADVANCED_PROVIDER;
  if (["wan27imageedit", "wan2.7imageedit", "wanimageedit", "imageedit", "wan27image"].includes(normalized)) return "wan27-image-edit";
  return normalized === "wan27" || normalized === "wan2.7" || normalized === "wan" ? "wan27" : "seedance";
}

function advancedCaseProvider(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  return normalizeAdvancedProvider(item.provider || params.provider || params.modelProvider || params.model_provider);
}

function normalizeAdvancedResolution(value = "", provider = "seedance") {
  const raw = String(value || "").trim().toLowerCase();
  if (normalizeAdvancedProvider(provider) === "wan27-image-edit") return raw === "1k" ? "1K" : "2K";
  if (normalizeAdvancedProvider(provider) === "wan27") return raw === "1080p" ? "1080p" : "720p";
  if (raw === "480p") return "480p";
  return raw === "1080p" ? "1080p" : "720p";
}

function advancedDurationBounds(provider = "seedance") {
  const normalized = normalizeAdvancedProvider(provider);
  if (normalized === "wan27-image-edit") return { min: 1, max: 1, fallback: 1 };
  return normalized === "wan27"
    ? { min: 2, max: 15, fallback: 5 }
    : { min: 4, max: 15, fallback: 5 };
}

function normalizeVideoRatio(value = "") {
  const normalized = String(value || "").trim().replace(/[：xX]/g, ":");
  if (/^\d+\s*:\s*\d+$/.test(normalized)) {
    const [width, height] = normalized.split(":").map((part) => Math.max(1, Number(part.trim()) || 1));
    return `${width}:${height}`;
  }
  return "16:9";
}

function ratioStyle(value = "") {
  const [width, height] = normalizeVideoRatio(value).split(":").map((part) => Math.max(1, Number(part) || 1));
  return `--video-ratio:${width} / ${height};--video-ratio-value:${width / height};`;
}

function videoPixelDimensions(resolution = "720p", ratio = "16:9") {
  const shortSide = normalizeAdvancedResolution(resolution) === "1080p" ? 1080 : 720;
  const [ratioW, ratioH] = normalizeVideoRatio(ratio).split(":").map((part) => Math.max(1, Number(part) || 1));
  if (ratioW >= ratioH) {
    return {
      width: Math.max(1, Math.round((shortSide * ratioW) / ratioH)),
      height: shortSide,
    };
  }
  const width = shortSide;
  const height = Math.max(1, Math.round((shortSide * ratioH) / ratioW));
  return { width, height };
}

function positiveDurationSeconds(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return Math.max(0, Number(fallback || 0) || 0);
  return Math.round(next * 10000) / 10000;
}

function selectedSeedanceVideoAsset() {
  const id = state.advancedSeedanceVideoAssetId || "";
  if (!id) return null;
  return (state.userAssets || []).find((asset) => asset.id === id)
    || (state.advancedAssets || []).find((asset) => asset.id === id)
    || (state.assetVideoChoices || []).find((asset) => asset.id === id)
    || null;
}

function currentSeedanceVideoInputSeconds(duration = 5, provider = currentAdvancedProvider()) {
  if (normalizeAdvancedProvider(provider) !== "seedance") return 0;
  const videoUrlCount = splitUrlList(els.advancedSeedanceVideoUrls?.value || "").length;
  const hasVideoUrl = videoUrlCount > 0;
  const selectedAsset = selectedSeedanceVideoAsset();
  if (!selectedAsset && !hasVideoUrl && !seedanceModeNeedsReferenceVideo(els.advancedSeedanceMediaMode?.value || "")) return 0;
  const assetSeconds = positiveDurationSeconds(selectedAsset?.durationSeconds || selectedAsset?.duration);
  const assetCount = selectedAsset ? 1 : 0;
  const fallbackSeconds = positiveDurationSeconds(duration, 5);
  return assetSeconds + (assetCount && !assetSeconds ? fallbackSeconds : 0) + (hasVideoUrl ? fallbackSeconds * videoUrlCount : 0) || fallbackSeconds;
}

function advancedPricing(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "wan27-image-edit") {
    const credits = assetImageModifyCostCredits();
    return {
      provider: "wan27-image-edit",
      duration: 1,
      resolution: normalizeAdvancedResolution(resolution, normalizedProvider),
      ratio: normalizeVideoRatio(ratio),
      baseCredits: credits,
      originalCredits: credits,
      credits,
      markup: 1,
      userPricingMultiplier: userPricingMultiplier(),
    };
  }
  const bounds = advancedDurationBounds(normalizedProvider);
  const rawSeconds = Number(duration || bounds.fallback);
  const minSeconds = normalizedProvider === "seedance" && options.allowFourSecondSeedance === true ? 4 : bounds.min;
  const seconds = Number.isFinite(rawSeconds) ? Math.min(bounds.max, Math.max(minSeconds, rawSeconds)) : bounds.fallback;
  const configPricing = state.config?.platform?.advancedPricing || {};
  const multiplier = userPricingMultiplier();
  if (normalizedProvider === "wan27") {
    const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
    const byResolution = configPricing.wan27CreditsPerSecondByResolution || {};
    const fallbackPerSecond = normalizedResolution === "1080p" ? ADVANCED_WAN27_1080P_CREDITS_PER_SECOND : ADVANCED_WAN27_720P_CREDITS_PER_SECOND;
    const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
    const originalCredits = creditsAmount(seconds * perSecond);
    return {
      provider: "wan27",
      duration: seconds,
      resolution: normalizedResolution,
      creditsPerSecond: perSecond,
      baseCredits: originalCredits,
      originalCredits,
      credits: creditsAmount(originalCredits * multiplier),
      markup: 1,
      userPricingMultiplier: multiplier,
    };
  }
  const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
  const normalizedRatio = normalizeVideoRatio(ratio);
  const byResolution = configPricing.seedanceCreditsPerSecondByResolution || {};
  const fallbackPerSecond = normalizedResolution === "1080p"
    ? ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND
    : normalizedResolution === "480p"
    ? ADVANCED_SEEDANCE_480P_CREDITS_PER_SECOND
    : ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND;
  const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
  const videoInputSeconds = positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0);
  const videoInputByResolution = configPricing.seedanceVideoInputCreditsPerSecondByResolution || {};
  const fallbackVideoInputPerSecond = normalizedResolution === "1080p"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND
    : normalizedResolution === "480p"
    ? ADVANCED_SEEDANCE_VIDEO_INPUT_480P_CREDITS_PER_SECOND
    : ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND;
  const videoInputCreditsPerSecond = Number(videoInputByResolution[normalizedResolution] || fallbackVideoInputPerSecond) || fallbackVideoInputPerSecond;
  const seedanceTier = String(options.seedanceTier || "").trim().toLowerCase() === "fast" ? "fast" : "standard";
  const seedanceDiscount = seedanceTier === "fast" ? ADVANCED_SEEDANCE_FAST_DISCOUNT : 1;
  const outputCredits = creditsAmount(seconds * perSecond * seedanceDiscount);
  const videoInputCredits = creditsAmount(videoInputSeconds * videoInputCreditsPerSecond * seedanceDiscount);
  const originalCredits = creditsAmount(outputCredits + videoInputCredits);
  return {
    provider: "seedance",
    seedanceTier,
    seedanceDiscount,
    duration: seconds,
    resolution: normalizedResolution,
    ratio: normalizedRatio,
    creditsPerSecond: perSecond,
    outputCredits,
    videoInputSeconds,
    videoInputCreditsPerSecond,
    videoInputCredits,
    baseCredits: originalCredits,
    originalCredits,
    credits: creditsAmount(originalCredits * multiplier),
    markup: 1,
    userPricingMultiplier: multiplier,
  };
}

function advancedCostForDuration(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  if (state.advancedEstimate && state.advancedEstimateKey === key) {
    return state.advancedEstimate.credits;
  }
  return advancedPricing(duration, provider, resolution, ratio, options).credits;
}

function currentAdvancedProvider() {
  return normalizeAdvancedProvider(els.advancedProvider?.value);
}

function currentSeedanceTier() {
  return (String(els.advancedSeedanceTier?.value || "").trim().toLowerCase() === "fast") ? "fast" : "standard";
}

function currentAdvancedResolution() {
  return normalizeAdvancedResolution(els.advancedResolution?.value || "720p", currentAdvancedProvider());
}

function currentAdvancedRatio() {
  return normalizeVideoRatio(els.advancedRatio?.value || "16:9");
}

function normalizeWanMediaMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const allowed = new Set(["first_frame", "first_last_frame", "first_frame_audio", "first_last_frame_audio", "first_clip", "first_clip_last_frame"]);
  return allowed.has(normalized) ? normalized : "first_frame";
}

function wanModeNeedsFirstFrame(mode) {
  return ["first_frame", "first_last_frame", "first_frame_audio", "first_last_frame_audio"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsLastFrame(mode) {
  return ["first_last_frame", "first_last_frame_audio", "first_clip_last_frame"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsAudio(mode) {
  return ["first_frame_audio", "first_last_frame_audio"].includes(normalizeWanMediaMode(mode));
}

function wanModeNeedsClip(mode) {
  return ["first_clip", "first_clip_last_frame"].includes(normalizeWanMediaMode(mode));
}

function advancedCostLabel(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  if (normalizeAdvancedProvider(provider) === "wan27-image-edit") {
    return `${assetImageModifyCostLabel()} - ${normalizeAdvancedResolution(resolution, provider)}`;
  }
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  const pricing = state.advancedEstimate && state.advancedEstimateKey === key
    ? state.advancedEstimate
    : advancedPricing(duration, provider, resolution, ratio, options);
  const suffix = ` - ${pricing.resolution || normalizeAdvancedResolution(resolution, provider)}`;
  const inputSuffix = Number(pricing.videoInputSeconds || 0) > 0
    ? ` + input ${formatDurationSeconds(pricing.videoInputSeconds)}`
    : "";
  return `${t("cost.creditsDuration", { credits: formatCredits(pricing.credits), duration: formatDurationSeconds(pricing.duration) })}${inputSuffix}${suffix}`;
}

function assetImageModifyCostCredits() {
  return Number(state.config?.assetImageModify?.costCredits ?? DEFAULT_ASSET_IMAGE_MODIFY_CREDITS);
}

function assetImageModifyCostLabel() {
  return t("cost.credits", { credits: formatCredits(assetImageModifyCostCredits()) });
}

function advancedEstimateKey(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "wan27-image-edit") {
    return [
      normalizedProvider,
      normalizeAdvancedResolution(resolution, normalizedProvider),
      normalizeVideoRatio(ratio),
      Number(state.user?.pricingMultiplier || 1),
    ].join("|");
  }
  const bounds = advancedDurationBounds(normalizedProvider);
  const rawDuration = Number(duration || bounds.fallback);
  const minSeconds = normalizedProvider === "seedance" && options.allowFourSecondSeedance === true ? 4 : bounds.min;
  const seconds = Number.isFinite(rawDuration) ? Math.min(bounds.max, Math.max(minSeconds, rawDuration)) : bounds.fallback;
  const inputVideoSeconds = normalizedProvider === "seedance" ? positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0) : 0;
  return [
    normalizedProvider,
    normalizedProvider === "seedance" ? (String(options.seedanceTier || "").trim().toLowerCase() === "fast" ? "fast" : "standard") : "",
    normalizeAdvancedResolution(resolution, normalizedProvider),
    normalizeVideoRatio(ratio),
    seconds,
    inputVideoSeconds,
    Number(state.user?.pricingMultiplier || 1),
  ].join("|");
}

function requestAdvancedEstimate(duration, provider = "seedance", resolution = "720p", ratio = "16:9", options = {}) {
  if (normalizeAdvancedProvider(provider) === "wan27-image-edit") return;
  const key = advancedEstimateKey(duration, provider, resolution, ratio, options);
  if (!state.user || state.advancedEstimateKey === key) return;
  window.clearTimeout(state.advancedEstimateTimer);
  state.advancedEstimateTimer = window.setTimeout(async () => {
    try {
      const payload = await requestJson("/api/advanced/estimate", {
        method: "POST",
        body: {
          provider,
          duration,
          resolution,
          ratio,
          inputVideoSeconds: positiveDurationSeconds(options.inputVideoSeconds ?? options.videoInputSeconds, 0),
          allowFourSecondSeedance: options.allowFourSecondSeedance === true,
          seedanceTier: options.seedanceTier,
        },
      });
      state.advancedEstimate = payload.pricing || null;
      state.advancedEstimateKey = key;
      updateAdvancedButtonCost();
      renderAdvancedAssetTargets();
    } catch (error) {
      console.warn("advanced estimate failed", error);
    }
  }, 180);
}

function updateAdvancedButtonCost() {
  if (!els.advancedSubmitBtn) return;
  const rawDuration = Number(els.advancedDuration?.value || 5);
  const bounds = advancedDurationBounds(currentAdvancedProvider());
  const duration = Number.isFinite(rawDuration) ? Math.min(bounds.max, Math.max(bounds.min, rawDuration)) : bounds.fallback;
  const provider = currentAdvancedProvider();
  const seedanceTier = currentSeedanceTier();
  if (provider === "wan27-image-edit") {
    els.advancedSubmitBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(t("template.generate", { cost: advancedCostLabel(1, provider, currentAdvancedResolution(), currentAdvancedRatio()) }))}`;
    refreshIcons();
    return;
  }
  const options = { inputVideoSeconds: currentSeedanceVideoInputSeconds(duration, provider), seedanceTier };
  requestAdvancedEstimate(duration, provider, currentAdvancedResolution(), currentAdvancedRatio(), options);
  els.advancedSubmitBtn.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost: advancedCostLabel(duration, provider, currentAdvancedResolution(), currentAdvancedRatio(), options) }))}`;
  refreshIcons();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function requestJson(url, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.detail || `Request failed: ${response.status}`);
  return payload;
}

function setTab(tab) {
  let nextTab = normalizePlatformTab(tab);
  if (!isTabAllowed(nextTab)) nextTab = DEFAULT_PLATFORM_TAB;
  state.tab = nextTab;
  localStorage.setItem(TAB_KEY, nextTab);
  const nextHash = nextTab === DEFAULT_PLATFORM_TAB ? "" : `#${nextTab}`;
  if (window.location.hash !== nextHash) {
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
  }
  if (nextTab !== "history") {
    stopHistoryRefresh();
    historyRecordsSignature = "";
  }
  if (nextTab !== "assets") {
    window.clearTimeout(state.assetSearchTimer);
    state.assetSearchTimer = 0;
  }
  if (nextTab !== "advanced") {
    window.clearTimeout(state.advancedAssetSearchTimer);
    state.advancedAssetSearchTimer = 0;
  }
  syncTopupAutoRefresh();
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== nextTab;
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === nextTab);
  });
  if (nextTab === "history") loadHistory();
  if (nextTab === "topups") loadTopupRecords();
  if (nextTab === "spending") loadSpendingRecords();
  if (nextTab === "assets") {
    if (state.user) loadUserAssets();
    else renderAssets([]);
  }
  if (nextTab === "characters") {
    renderGalleryCharacters(els.characterGrid);
    bindCharacterCreator();
    loadGalleryUnlocks();
    if (state.user) loadUserAssets(state.userAssetsPage || 1).catch(() => {});
  }
  if (nextTab === "access") loadApiSubtokens();
  if (nextTab === "advanced") loadAdvancedAssets();
  closeAccountMenu();
}

function setCategory(category) {
  state.category = category;
  renderCategories();
  renderTemplates();
}

function setGalleryMode(mode = DEFAULT_GALLERY_MODE) {
  state.galleryMode = normalizeAdvancedCaseTab(mode || DEFAULT_GALLERY_MODE);
  renderTemplates();
}

function renderCategories() {
  if (!els.categoryRow) return;
  const visibleCategories = state.categories.filter((category) => !isHiddenCategory(category));
  const chips = [{ id: "all", name: t("common.all") }, ...visibleCategories];
  els.categoryRow.innerHTML = chips.map((category) => `
    <button class="category-chip ${state.category === category.id ? "is-active" : ""}" data-category="${escapeHtml(category.id)}" type="button">
      ${escapeHtml(localizedCategoryName(category))}
    </button>
  `).join("");
  els.categoryRow.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => setCategory(button.dataset.category));
  });
}

function bindHoverPreviewCard({ card, video, cover, fallbackCover = DEFAULT_TEMPLATE_COVER, tapToPreview = false } = {}) {
  if (!card || !video) return;
  let active = false;
  let loadTimer = null;
  let retryTimer = null;
  let playbackToken = 0;
  const isCoarsePointer = () => Boolean(window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches);
  const showVideo = () => {
    if (!active || video.readyState < 2) return;
    card.classList.remove("is-loading-preview");
    card.classList.add("is-previewing");
  };
  const requestPlay = (token) => {
    if (!active || token !== playbackToken) return;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    if (!video.src && video.dataset.src) {
      video.src = video.dataset.src;
      video.load();
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.then(showVideo).catch(() => {
        if (!active || token !== playbackToken) return;
        clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => requestPlay(token), 350);
      });
    } else {
      showVideo();
    }
  };
  const stop = () => {
    active = false;
    playbackToken += 1;
    if (activeHoverPreviewStop === stop) activeHoverPreviewStop = null;
    clearTimeout(loadTimer);
    clearTimeout(retryTimer);
    video.pause();
    try {
      video.currentTime = 0;
    } catch (error) {}
    card.classList.remove("is-loading-preview", "is-previewing");
  };
  const start = ({ immediate = false } = {}) => {
    if (activeHoverPreviewStop && activeHoverPreviewStop !== stop) {
      activeHoverPreviewStop();
    }
    active = true;
    playbackToken += 1;
    const token = playbackToken;
    activeHoverPreviewStop = stop;
    card.classList.add("is-loading-preview");
    clearTimeout(loadTimer);
    clearTimeout(retryTimer);
    if (immediate) {
      requestPlay(token);
    } else {
      loadTimer = window.setTimeout(() => requestPlay(token), 180);
    }
  };
  video.addEventListener("loadeddata", showVideo);
  video.addEventListener("canplay", showVideo);
  video.addEventListener("playing", showVideo);
  video.addEventListener("timeupdate", showVideo);
  video.addEventListener("pause", () => {
    if (!active) return;
    const token = playbackToken;
    clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => requestPlay(token), 300);
  });
  video.addEventListener("stalled", () => {
    if (!active) return;
    card.classList.add("is-loading-preview");
    requestPlay(playbackToken);
  });
  video.addEventListener("waiting", () => {
    if (!active) return;
    card.classList.add("is-loading-preview");
  });
  video.addEventListener("error", () => {
    clearTimeout(loadTimer);
    clearTimeout(retryTimer);
    card.classList.remove("cover-failed", "is-loading-preview", "is-previewing");
    if (cover && fallbackCover && cover.getAttribute("src") !== fallbackCover) {
      cover.src = fallbackCover;
    }
  });
  card.addEventListener("pointerenter", () => {
    if (tapToPreview && isCoarsePointer()) return;
    start();
  });
  card.addEventListener("pointerleave", stop);
  card.addEventListener("focusin", start);
  card.addEventListener("focusout", stop);
  if (tapToPreview) {
    card.addEventListener("click", (event) => {
      if (!isCoarsePointer() || isInteractiveTarget(event.target)) return;
      event.preventDefault();
      start({ immediate: true });
    });
  }
}

function renderTemplates() {
  activeHoverPreviewStop?.();
  activeHoverPreviewStop = null;
  renderGalleryModeTabs();
  renderGalleryCases();
}

function renderGalleryCases() {
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  const activeTab = normalizeAdvancedCaseTab(state.galleryMode);
  const pageSize = ADVANCED_CASE_PAGE_SIZE[activeTab] || 9;
  const entries = cases
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab) === activeTab)
    .slice(0, pageSize);
  els.templateGrid.className = `template-grid gallery-advanced-grid ${activeTab === "hot" ? "" : "is-case-list"}`;
  els.templateGrid.innerHTML = entries.length
    ? entries.map((entry) => (activeTab === "hot" ? renderAdvancedCaseCard(entry) : renderAdvancedCaseRow(entry))).join("")
    : `<div class="job-note">${escapeHtml(t("gallery.noTemplates"))}</div>`;
  bindGalleryCaseActions();
  refreshIcons();
}

function renderGalleryCharacters(root = els.templateGrid) {
  if (!root) return;
  renderCharacterSourceTabs();
  const source = state.characterSource === "custom" ? "custom" : "system";
  const characters = source === "custom" ? customCharacterItems() : state.homeCharacters.filter((item) => item && !item.deletedAt);
  const activeCharacter = state.activeGalleryCharacterId
    ? characters.find((item) => String(item.id || "") === String(state.activeGalleryCharacterId || ""))
    : null;
  if (activeCharacter) {
    renderGalleryCharacterDetail(activeCharacter, root);
    return;
  }
  state.activeGalleryCharacterId = "";
  root.className = "template-grid character-grid character-grid-main";
  root.innerHTML = characters.length
    ? characters.map(renderGalleryCharacterCard).join("")
    : `<div class="job-note">${escapeHtml(source === "custom" ? t("characters.customEmpty") : t("gallery.character.empty"))}</div>`;
  bindGalleryImageFallbacks(root);
  root.querySelectorAll("[data-character-use]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      useHomeCharacter(button.dataset.characterUse);
    });
  });
  root.querySelectorAll("[data-character-cases]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openGalleryCharacter(button.dataset.characterCases);
    });
  });
  root.querySelectorAll("[data-character-takeoff]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openSystemCharacterTakeOffDialog(button.dataset.characterTakeoff);
    });
  });
  root.querySelectorAll("[data-character-modify]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openSystemCharacterModifyDialog(button.dataset.characterModify);
    });
  });
  root.querySelectorAll("[data-character-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCustomCharacter(button.dataset.characterDelete || "", button);
    });
  });
  root.querySelectorAll("[data-character-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (isInteractiveTarget(event.target)) return;
      openGalleryCharacter(card.dataset.characterId);
    });
  });
  refreshIcons();
}

function customCharacterItems() {
  return (state.userAssets || [])
    .filter((asset) => asset?.kind === "image" && (asset.isCharacterAsset || String(asset.name || "").toLowerCase().includes("character")))
    .map((asset) => ({
      id: `custom:${asset.id}`,
      assetId: asset.id,
      name: asset.name || "Custom character",
      title: asset.characterPrompt || "",
      posterUrl: asset.previewUrl || asset.localUrl || asset.publicUrl || "",
      localImageUrl: asset.localUrl || asset.previewUrl || asset.publicUrl || "",
      publicImageUrl: asset.publicUrl || "",
      sourceImageUrl: asset.previewUrl || asset.localUrl || asset.publicUrl || "",
      status: "Ready",
      referenceState: "ready",
      custom: true,
      createdAt: asset.createdAt || "",
    }));
}

function renderCharacterSourceTabs() {
  if (!els.characterSourceTabs) return;
  const tabs = [
    { id: "system", label: t("characters.systemTab"), count: state.homeCharacters.filter((item) => item && !item.deletedAt).length },
    { id: "custom", label: t("characters.customTab"), count: customCharacterItems().length },
  ];
  els.characterSourceTabs.innerHTML = tabs.map((tab) => `
    <button class="gallery-mode-tab ${state.characterSource === tab.id ? "is-active" : ""}" data-character-source="${escapeHtml(tab.id)}" type="button">
      ${escapeHtml(tab.label)}<span>${escapeHtml(String(tab.count))}</span>
    </button>
  `).join("");
  els.characterSourceTabs.querySelectorAll("[data-character-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.characterSource = button.dataset.characterSource === "custom" ? "custom" : "system";
      state.activeGalleryCharacterId = "";
      renderGalleryCharacters(els.characterGrid);
      if (state.characterSource === "custom" && state.user) loadUserAssets(state.userAssetsPage || 1).catch(() => {});
    });
  });
}

function renderGalleryCharacterCard(item = {}) {
  const videoUrl = characterMainVideoUrl(item);
  const poster = characterPosterUrl(item);
  const fallbackPoster = DEFAULT_TEMPLATE_COVER;
  const roleCount = characterRoleVideos(item).length;
  const sceneCount = characterSceneVideos(item).length + characterUnlockVideos(item).length;
  const status = item.referenceState === "ready" ? "Ready" : item.status || item.referenceState || "Draft";
  const videoCount = roleCount + sceneCount;
  const custom = item.custom === true;
  return `
    <article class="character-card" data-character-id="${escapeHtml(item.id || "")}">
      <div class="character-card-media">
        ${renderSmartCoverMedia({ className: "character-cover-media", posterUrl: poster, videoUrl, alt: item.name || "", fallbackUrl: fallbackPoster })}
        ${videoUrl ? `<span class="character-card-video-mark"><i data-lucide="play"></i></span>` : ""}
      </div>
      <div class="character-card-meta">
        <span>${escapeHtml(custom ? t("characters.customTab") : `${status} / ${videoCount} ${videoCount === 1 ? "video" : "videos"}`)}</span>
        <strong>${escapeHtml(item.name || "Character")}</strong>
        <p>${escapeHtml(item.title || "")}</p>
        <div class="character-card-actions">
          <button class="ghost-button" data-character-use="${escapeHtml(item.id || "")}" type="button"><i data-lucide="image-plus"></i>${escapeHtml(t("gallery.character.use"))}</button>
          <button class="ghost-button" data-character-takeoff="${escapeHtml(item.id || "")}" type="button"><i data-lucide="shirt"></i>${escapeHtml(t("characters.takeOff"))}</button>
          <button class="copy-btn" data-character-modify="${escapeHtml(item.id || "")}" type="button"><i data-lucide="wand-sparkles"></i>${escapeHtml(t("characters.modify"))}</button>
          ${custom ? `<button class="ghost-button danger" data-character-delete="${escapeHtml(item.id || "")}" type="button"><i data-lucide="trash-2"></i>${escapeHtml(t("characters.delete"))}</button>` : ""}
          ${custom ? "" : `<button class="primary-button compact" data-character-cases="${escapeHtml(item.id || "")}" type="button"><i data-lucide="clapperboard"></i>${escapeHtml(t("gallery.character.viewCases"))}</button>`}
        </div>
      </div>
    </article>
  `;
}

async function deleteCustomCharacter(characterId = "", button = null) {
  const assetId = String(characterId || "").startsWith("custom:") ? String(characterId).slice("custom:".length) : "";
  if (!assetId) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("common.deleting"))}`;
    refreshIcons();
  }
  try {
    await requestJson(`/api/user-assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
    state.userAssets = (state.userAssets || []).filter((asset) => asset.id !== assetId);
    state.userAssetsTotal = Math.max(0, Number(state.userAssetsTotal || 0) - 1);
    renderGalleryCharacters(els.characterGrid);
    if (state.tab === "assets") await loadUserAssets(state.userAssetsPage || 1);
  } catch (error) {
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.deleteFailed", { message: error.message || String(error) });
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

function bindCharacterCreator() {
  if (!els.characterCreateBtn) return;
  if (els.characterCreateCost) els.characterCreateCost.textContent = assetImageModifyCostLabel();
}

async function createCharacterFromPrompt() {
  if (!state.user) return openLogin();
  const prompt = els.characterCreatePrompt?.value.trim() || "";
  if (!prompt) {
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("advanced.promptRequired");
    return;
  }
  const button = els.characterCreateBtn;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("characters.creating"))}`;
    refreshIcons();
  }
  if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.creating");
  try {
    const payload = await requestJson("/api/characters/generate", {
      method: "POST",
      body: { prompt },
    });
    if (payload.user) setUser(payload.user);
    if (payload.record) {
      state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
    }
    if (els.characterCreatePrompt) els.characterCreatePrompt.value = "";
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.created");
    await loadHistory({ silent: true }).catch(() => {});
  } catch (error) {
    if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.createFailed", { message: error.message || String(error) });
    window.setTimeout(() => loadHistory({ silent: true }), 300);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function modifySystemCharacter(characterId = "", { mode = "modify", prompt = "" } = {}) {
  if (!state.user) return openLogin();
  if (String(characterId || "").startsWith("custom:")) {
    const assetId = String(characterId || "").slice("custom:".length);
    const promptText = mode === "take_off" ? (prompt || t("characters.takeOffPrompt")) : prompt;
    if (!promptText) throw new Error(t("advanced.promptRequired"));
    const payload = await requestJson(`/api/user-assets/${encodeURIComponent(assetId)}/modify`, {
      method: "POST",
      body: { prompt: promptText },
    });
    if (payload.user) setUser(payload.user);
    if (payload.record) {
      state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
    }
    await loadHistory({ silent: true }).catch(() => {});
    return payload;
  }
  const body = mode === "take_off"
    ? { mode: "take_off", prompt: prompt || t("characters.takeOffPrompt") }
    : { mode: "modify", prompt };
  const payload = await requestJson(`/api/characters/${encodeURIComponent(characterId)}/modify`, {
    method: "POST",
    body,
  });
  if (payload.user) setUser(payload.user);
  if (payload.record) {
    state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
  }
  await loadHistory({ silent: true }).catch(() => {});
  return payload;
}

function characterResultImageUrl(payload = {}) {
  return payload.asset?.previewUrl || payload.asset?.localUrl || payload.asset?.publicUrl || payload.record?.imageResultUrl || generationImageResultUrl(payload.record || {}) || "";
}

async function openSystemCharacterTakeOffDialog(characterId = "") {
  const character = state.homeCharacters.find((entry) => String(entry.id || "") === String(characterId || ""));
  if (!character) return;
  if (!state.user) return openLogin();
  const poster = characterReferenceImageUrl(character) || DEFAULT_TEMPLATE_COVER;
  await showInlineDialog({
    title: t("characters.takeOff"),
    body: `
      <div class="asset-generate-form character-action-form">
        <div class="asset-modify-preview character-action-preview">
          <img src="${escapeHtml(poster)}" alt="${escapeHtml(character.name || "")}" data-cover-fallback="${escapeHtml(DEFAULT_TEMPLATE_COVER)}" />
        </div>
        <p class="job-note">${escapeHtml(assetImageModifyCostLabel())}</p>
        <p class="job-note" id="characterTakeoffStatus">${escapeHtml(t("characters.takeOffConfirm"))}</p>
        <div class="character-action-result" id="characterTakeoffResult" hidden></div>
      </div>
    `,
    confirmText: t("characters.takeOff"),
    dialogClass: "is-media-action",
    keepOpenOnConfirm: true,
    onOpen: () => {
      bindGalleryImageFallbacks(els.inlineDialogBody);
      if (els.inlineDialogConfirm) {
        els.inlineDialogConfirm.innerHTML = `<i data-lucide="shirt"></i>${escapeHtml(t("template.generate", { cost: assetImageModifyCostLabel() }))}`;
        refreshIcons();
      }
    },
    onConfirm: async (root) => {
      const status = root.querySelector("#characterTakeoffStatus");
      const result = root.querySelector("#characterTakeoffResult");
      if (status) status.textContent = t("characters.takeOffRunning");
      if (result) {
        result.hidden = true;
        result.innerHTML = "";
      }
      try {
        const payload = await modifySystemCharacter(characterId, { mode: "take_off" });
        const imageUrl = characterResultImageUrl(payload);
        if (status) status.textContent = t("characters.takeOffDone");
        if (result) {
          result.hidden = false;
          result.innerHTML = imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="" /><p class="job-note">${escapeHtml(t("characters.takeOffSaved"))}</p>`
            : `<p class="job-note">${escapeHtml(t("characters.modifyDone"))}</p>`;
        }
        if (els.inlineDialogConfirm) {
          els.inlineDialogConfirm.type = "button";
          els.inlineDialogConfirm.disabled = false;
          els.inlineDialogConfirm.onclick = () => els.inlineDialog?.close("confirm");
          els.inlineDialogConfirm.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("characters.takeOffDoneButton"))}`;
        }
        if (els.characterCreateStatus) els.characterCreateStatus.textContent = t("characters.modifyDone");
        refreshIcons();
      } catch (error) {
        if (status) status.textContent = t("characters.createFailed", { message: error.message || String(error) });
        if (els.inlineDialogConfirm) {
          els.inlineDialogConfirm.disabled = false;
          els.inlineDialogConfirm.innerHTML = `<i data-lucide="shirt"></i>${escapeHtml(t("characters.takeOff"))}`;
          refreshIcons();
        }
        throw error;
      }
    },
  });
}

async function openSystemCharacterModifyDialog(characterId = "") {
  const character = state.homeCharacters.find((entry) => String(entry.id || "") === String(characterId || ""));
  if (!character) return;
  if (!state.user) return openLogin();
  await showInlineDialog({
    title: t("characters.modifyTitle"),
    body: `
      <div class="asset-generate-form">
        <label class="field"><span>${escapeHtml(t("field.prompt"))}</span><textarea id="characterModifyPrompt" rows="5" placeholder="${escapeHtml(t("characters.modifyPlaceholder"))}"></textarea></label>
        <p class="job-note">${escapeHtml(assetImageModifyCostLabel())}</p>
        <p class="job-note" id="characterModifyStatus"></p>
      </div>
    `,
    confirmText: t("characters.modify"),
    dialogClass: "is-media-action",
    onConfirm: async (root) => {
      const prompt = root.querySelector("#characterModifyPrompt")?.value.trim() || "";
      if (!prompt) throw new Error(t("advanced.promptRequired"));
      const status = root.querySelector("#characterModifyStatus");
      if (status) status.textContent = t("assets.generating");
      const payload = await modifySystemCharacter(characterId, { mode: "modify", prompt });
      const imageUrl = characterResultImageUrl(payload);
      if (status) status.textContent = t("assets.modified");
      if (imageUrl) {
        const result = document.createElement("div");
        result.className = "character-action-result";
        result.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="" />`;
        root.querySelector(".asset-generate-form")?.append(result);
      }
    },
  });
}

function openGalleryCharacter(characterId = "") {
  const item = state.homeCharacters.find((entry) => String(entry.id || "") === String(characterId || ""));
  if (!item) return;
  state.activeGalleryCharacterId = item.id || "";
  if (state.tab === "characters") renderGalleryCharacters(els.characterGrid);
  else renderTemplates();
  loadGalleryUnlocks();
}

async function loadGalleryUnlocks() {
  if (!state.user) {
    state.galleryUnlocks = [];
    state.galleryUnlocksLoaded = false;
    state.galleryUnlockMessage = "";
    if (state.activeGalleryCharacterId && (state.tab === "gallery" || state.tab === "characters")) {
      if (state.tab === "characters") renderGalleryCharacters(els.characterGrid);
      else renderTemplates();
    }
    return;
  }
  try {
    const payload = await requestJson("/api/unlocks");
    state.galleryUnlocks = payload.unlocks || [];
    state.galleryUnlocksLoaded = true;
    state.galleryUnlockMessage = "";
    if (state.activeGalleryCharacterId && (state.tab === "gallery" || state.tab === "characters")) {
      if (state.tab === "characters") renderGalleryCharacters(els.characterGrid);
      else renderTemplates();
    }
  } catch (error) {
    state.galleryUnlockMessage = error.message || "";
    state.galleryUnlocksLoaded = false;
    if (state.activeGalleryCharacterId && (state.tab === "gallery" || state.tab === "characters")) {
      if (state.tab === "characters") renderGalleryCharacters(els.characterGrid);
      else renderTemplates();
    }
  }
}

function galleryUnlockKey(itemId = "", sceneId = "", sceneEntryId = "default") {
  return [itemId, sceneId, sceneEntryId || "default"].map((part) => String(part || "").trim()).join("::");
}

function galleryUnlockedSet() {
  return new Set((state.galleryUnlocks || []).map((record) => galleryUnlockKey(record.itemId, record.sceneId, record.sceneEntryId || "default")));
}

function isGalleryVideoUnlocked(character = {}, video = {}) {
  return galleryUnlockedSet().has(galleryUnlockKey(character.id || "", video.sceneId || "", video.sceneEntryId || "default"));
}

async function unlockGallerySceneVideo(characterId = "", sceneId = "", sceneEntryId = "default") {
  if (!state.user) return openLogin();
  const key = galleryUnlockKey(characterId, sceneId, sceneEntryId);
  state.galleryUnlockLoadingKey = key;
  state.galleryUnlockMessage = t("gallery.character.unlocking");
  renderTemplates();
  try {
    const payload = await requestJson("/api/unlock-video", {
      method: "POST",
      body: { itemId: characterId, sceneId, sceneEntryId },
    });
    state.user = payload.user || state.user;
    state.galleryUnlocks = payload.unlocks || state.galleryUnlocks || [];
    state.galleryUnlockMessage = t("gallery.character.unlockReady");
    const item = state.homeCharacters.find((entry) => String(entry.id || "") === String(characterId || ""));
    if (item && payload.video?.videoUrl) {
      playCharacterVideo(payload.video, item.name || t("gallery.character.sceneVideos"));
    }
  } catch (error) {
    state.galleryUnlockMessage = t("gallery.character.unlockFailed", { message: error.message || "Unknown error" });
  } finally {
    state.galleryUnlockLoadingKey = "";
    renderTemplates();
    renderAccountMenu();
    renderTopupSummary();
  }
}

function uniqueTruthy(values = []) {
  const seen = new Set();
  return values.map((value) => String(value || "").trim()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function isGenericCharacterPoster(url = "") {
  const value = String(url || "").toLowerCase();
  return !value || value.includes("/assets/admin/home/default-hero.") || value.includes("/assets/placeholders/") || value === DEFAULT_TEMPLATE_COVER.toLowerCase();
}

function isVideoMediaUrl(url = "") {
  return /\.(?:mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(String(url || "").trim());
}

function adminHomeCoverFromVideoUrl(videoUrl = "") {
  const raw = String(videoUrl || "").split("?")[0].trim();
  const match = raw.match(/\/assets\/generated\/videos\/([^/?#]+)\.(?:mp4|webm|mov|m4v)$/i);
  if (!match) return "";
  return `/assets/admin/home/cover-${match[1]}.jpg`;
}

function videoPosterCandidates(videoUrl = "") {
  return uniqueTruthy([
    adminHomeCoverFromVideoUrl(videoUrl),
    generatedPosterFromVideoUrl(videoUrl),
  ]);
}

function characterPosterUrl(item = {}) {
  const mainVideo = characterMainVideoUrl(item);
  const imageCandidates = [
    item.sourceImageUrl,
    item.localImageUrl,
    item.posterUrl,
    item.syntheticReferenceLocalUrl,
    item.publicImageUrl,
    item.imageUrl,
    item.coverUrl,
    item.thumbnailUrl,
  ];
  const imagePoster = uniqueTruthy(imageCandidates).find((value) => !isVideoMediaUrl(value) && !isGenericCharacterPoster(value));
  if (imagePoster) return imagePoster;
  const fallbackImage = uniqueTruthy(imageCandidates).find((value) => !isVideoMediaUrl(value));
  if (fallbackImage) return fallbackImage;
  const candidates = [
    ...videoPosterCandidates(mainVideo),
    item.homeSceneVideos && Object.values(item.homeSceneVideos).find(Boolean)?.posterUrl,
    item.sceneVideos && Object.values(item.sceneVideos).find(Boolean)?.posterUrl,
    item.unlockVideos && Object.values(item.unlockVideos).find(Boolean)?.posterUrl,
  ];
  return uniqueTruthy(candidates).find((value) => !isGenericCharacterPoster(value)) || (mainVideo ? "" : DEFAULT_TEMPLATE_COVER);
}

function characterReferenceImageUrl(item = {}) {
  const candidates = [
    item.sourceImageUrl,
    item.localImageUrl,
    item.posterUrl,
    item.syntheticReferenceLocalUrl,
    item.publicImageUrl,
    item.imageUrl,
    item.coverUrl,
    item.thumbnailUrl,
  ];
  return uniqueTruthy(candidates).find((value) => !isVideoMediaUrl(value)) || characterPosterUrl(item) || DEFAULT_TEMPLATE_COVER;
}

function characterMainVideoUrl(item = {}) {
  const candidates = [
    item.videoUrl,
    item.localVideoUrl,
    item.remoteVideoUrl,
    item.homeSceneVideos && Object.values(item.homeSceneVideos).find((entry) => entry?.videoUrl)?.videoUrl,
    item.sceneVideos && Object.values(item.sceneVideos).find((entry) => entry?.videoUrl)?.videoUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function sceneIdFromVideoKey(videoKey = "") {
  return String(videoKey || "").split("__")[0] || "";
}

function uniqueCharacterVideos(entries = [], { dedupeByUrl = true } = {}) {
  const seen = new Set();
  return entries.map((entry) => entry || {}).filter((entry, index) => {
    if (!entry || (!entry.videoUrl && !entry.taskId && !entry.posterUrl)) return false;
    const key = dedupeByUrl
      ? [entry.videoUrl, entry.sceneId, entry.sceneEntryId, entry.taskId, entry.title, index].join("|")
      : [entry.sceneId || index, entry.sceneEntryId || "default", entry.taskId || entry.videoUrl || index, entry.title || ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function characterRoleVideos(item = {}) {
  const poster = characterPosterUrl(item);
  const mainVideo = characterMainVideoUrl(item);
  const roleVideos = [];
  if (mainVideo || item.taskId || poster) {
    roleVideos.push({
      sceneId: "role",
      sceneEntryId: "default",
      title: item.title || item.name || "Character video",
      sceneName: t("gallery.character.roleVideos"),
      videoUrl: mainVideo,
      posterUrl: poster,
      status: item.status || "",
      provider: item.provider || "seedance",
      resolution: item.resolution || "",
      duration: item.duration || 0,
    });
  }
  return uniqueCharacterVideos(roleVideos);
}

function characterSceneVideos(item = {}) {
  const entries = [
    ...Object.entries(item.homeSceneVideos || {}).map(([key, entry]) => ({
      ...(entry || {}),
      kind: "scene",
      sceneId: entry?.sceneId || sceneIdFromVideoKey(key),
      title: entry?.title || entry?.sceneEntryName || entry?.sceneName || key,
    })),
    ...Object.entries(item.sceneVideos || {}).map(([key, entry]) => ({
      ...(entry || {}),
      kind: "scene",
      sceneId: entry?.sceneId || sceneIdFromVideoKey(key),
      title: entry?.title || entry?.sceneEntryName || entry?.sceneName || key,
    })),
  ];
  return uniqueCharacterVideos(entries, { dedupeByUrl: false });
}

function characterUnlockVideos(item = {}) {
  return uniqueCharacterVideos(Object.entries(item.unlockVideos || {}).map(([key, entry]) => ({
    ...(entry || {}),
    kind: "scene",
    sceneId: entry?.sceneId || sceneIdFromVideoKey(key),
    title: entry?.title || entry?.sceneEntryName || entry?.sceneName || key,
    locked: true,
  })), { dedupeByUrl: false });
}

function characterVideoTitle(video = {}, fallback = "") {
  return video.title || video.sceneEntryName || video.sceneName || fallback || t("gallery.character.sceneVideos");
}

function characterVideoPoster(video = {}, character = {}) {
  const videoUrl = video.videoUrl || video.localVideoUrl || video.remoteVideoUrl || "";
  const candidates = [
    video.outputPosterUrl,
    video.resultPosterUrl,
    video.localPosterUrl,
    video.coverUrl,
    video.thumbnailUrl,
    ...videoPosterCandidates(videoUrl),
  ];
  const poster = uniqueTruthy(candidates).find((value) => !isGenericCharacterPoster(value));
  if (poster) return poster;
  if (videoUrl) return "";
  return uniqueTruthy([video.posterUrl, characterPosterUrl(character), DEFAULT_TEMPLATE_COVER]).find(Boolean) || DEFAULT_TEMPLATE_COVER;
}

function renderSmartCoverMedia({ className = "", posterUrl = "", videoUrl = "", fallbackUrl = DEFAULT_TEMPLATE_COVER, alt = "" } = {}) {
  const poster = String(posterUrl || "").trim();
  const video = String(videoUrl || "").trim();
  const fallback = String(fallbackUrl || DEFAULT_TEMPLATE_COVER).trim();
  if (poster) {
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(poster)}" alt="${escapeHtml(alt)}" loading="lazy" data-cover-fallback="${escapeHtml(video || fallback)}" data-cover-final-fallback="${escapeHtml(fallback)}" />`;
  }
  if (video) {
    return `<video class="${escapeHtml(className)}" src="${escapeHtml(video)}" aria-label="${escapeHtml(alt)}" muted playsinline preload="metadata" data-video-cover-fallback="${escapeHtml(fallback)}"></video>`;
  }
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(fallback)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
}

function renderGalleryCharacterDetail(item = {}, root = els.templateGrid) {
  const roleVideos = characterRoleVideos(item);
  const sceneVideos = characterSceneVideos(item);
  const unlockVideos = characterUnlockVideos(item);
  const poster = characterPosterUrl(item);
  if (!root) return;
  root.className = "template-grid character-detail";
  root.innerHTML = `
    <section class="character-detail-hero">
      <button class="ghost-button character-back" data-character-back type="button"><i data-lucide="chevron-left"></i>${escapeHtml(t("gallery.character.back"))}</button>
      <div class="character-detail-profile">
        ${renderSmartCoverMedia({ className: "character-detail-cover-media", posterUrl: poster, videoUrl: characterMainVideoUrl(item), alt: item.name || "", fallbackUrl: DEFAULT_TEMPLATE_COVER })}
        <div>
          <span>${escapeHtml(item.referenceState === "ready" ? "Ready" : item.status || item.referenceState || "Draft")}</span>
          <h3>${escapeHtml(item.name || "Character")}</h3>
          <p>${escapeHtml(item.title || "")}</p>
          <button class="primary-button compact" data-character-use="${escapeHtml(item.id || "")}" type="button"><i data-lucide="image-plus"></i>${escapeHtml(t("gallery.character.useThis"))}</button>
          ${item.custom ? `<button class="ghost-button danger compact" data-character-delete="${escapeHtml(item.id || "")}" type="button"><i data-lucide="trash-2"></i>${escapeHtml(t("characters.delete"))}</button>` : ""}
        </div>
      </div>
      ${state.galleryUnlockMessage ? `<div class="job-note">${escapeHtml(state.galleryUnlockMessage)}</div>` : ""}
    </section>
    ${renderCharacterVideoSection(t("gallery.character.roleVideos"), roleVideos, item)}
    ${renderCharacterVideoSection(t("gallery.character.sceneVideos"), [...sceneVideos, ...unlockVideos], item)}
  `;
  root.querySelector("[data-character-back]")?.addEventListener("click", () => {
    state.activeGalleryCharacterId = "";
    if (state.tab === "characters") renderGalleryCharacters(root);
    else renderTemplates();
  });
  root.querySelector("[data-character-use]")?.addEventListener("click", () => useHomeCharacter(item.id || ""));
  root.querySelector("[data-character-delete]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteCustomCharacter(item.id || "", event.currentTarget);
  });
  root.querySelectorAll("[data-character-play]").forEach((button) => {
    button.addEventListener("click", () => {
      const video = findGalleryCharacterVideo(item, button.dataset.characterPlay, button.dataset.characterSceneEntry);
      if (video) playCharacterVideo(video, characterVideoTitle(video, item.name));
    });
  });
  root.querySelectorAll("[data-character-unlock]").forEach((button) => {
    button.addEventListener("click", () => unlockGallerySceneVideo(item.id || "", button.dataset.characterUnlock, button.dataset.characterSceneEntry || "default"));
  });
  bindGalleryImageFallbacks(root);
  refreshIcons();
}

function renderCharacterVideoSection(title = "", videos = [], character = {}, { locked = false } = {}) {
  const visibleVideos = videos;
  return `
    <section class="character-video-section">
      <div class="character-video-section-head">
        <h4>${escapeHtml(title)}</h4>
        <span>${escapeHtml(String(visibleVideos.length))}</span>
      </div>
      <div class="character-video-list">
        ${visibleVideos.length ? visibleVideos.map((video, index) => renderCharacterVideoCard(video, character, { locked: Boolean(video.locked), index })).join("") : `<div class="job-note">${escapeHtml(t("gallery.character.noVideos"))}</div>`}
      </div>
    </section>
  `;
}

function renderCharacterVideoCard(video = {}, character = {}, { locked = false, index = 0 } = {}) {
  const sceneId = video.sceneId || `role-${index}`;
  const sceneEntryId = video.sceneEntryId || "default";
  const poster = characterVideoPoster(video, character);
  const hasVideo = Boolean(video.videoUrl);
  const unlocked = !locked || isGalleryVideoUnlocked(character, video);
  const loading = state.galleryUnlockLoadingKey === galleryUnlockKey(character.id || "", sceneId, sceneEntryId);
  const canPlay = !locked && hasVideo;
  const title = characterVideoTitle(video, locked ? t("gallery.character.sceneVideos") : t("gallery.character.roleVideos"));
  const meta = [video.sceneName, video.resolution, video.duration ? `${video.duration}s` : ""].filter(Boolean).join(" / ");
  const price = formatCredits(video.price || 0);
  const action = canPlay
    ? `<button class="ghost-button" data-character-play="${escapeHtml(sceneId)}" data-character-scene-entry="${escapeHtml(sceneEntryId)}" type="button"><i data-lucide="play"></i>${escapeHtml(t("gallery.character.play"))}</button>`
    : locked
      ? `<button class="primary-button compact" data-character-unlock="${escapeHtml(sceneId)}" data-character-scene-entry="${escapeHtml(sceneEntryId)}" type="button"${loading ? " disabled" : ""}><i data-lucide="${unlocked ? "play" : "lock-keyhole"}"></i>${escapeHtml(loading ? t("gallery.character.unlocking") : unlocked ? t("gallery.character.play") : t("gallery.character.unlock", { cost: price }))}</button>`
      : "";
  const mediaAction = locked
    ? `data-character-unlock="${escapeHtml(sceneId)}" data-character-scene-entry="${escapeHtml(sceneEntryId)}"`
    : canPlay
      ? `data-character-play="${escapeHtml(sceneId)}" data-character-scene-entry="${escapeHtml(sceneEntryId)}"`
      : "";
  return `
    <article class="character-video-card ${locked && !unlocked ? "is-locked" : ""}">
      <button class="character-video-media" ${mediaAction || "disabled"} type="button">
        ${renderSmartCoverMedia({ className: "character-video-cover-media", posterUrl: poster, videoUrl: video.videoUrl || video.localVideoUrl || video.remoteVideoUrl || "", alt: title, fallbackUrl: characterPosterUrl(character) || DEFAULT_TEMPLATE_COVER })}
        <span class="character-video-play"><i data-lucide="${locked && !unlocked ? "lock" : "play"}"></i></span>
      </button>
      <div class="character-video-info">
        <span>${escapeHtml(locked ? (unlocked ? t("gallery.character.unlocked") : t("gallery.character.locked")) : video.kind === "scene" ? t("gallery.character.sceneVideos") : t("gallery.character.roleVideos"))}</span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(meta || video.status || "")}</p>
        ${action}
      </div>
    </article>
  `;
}

function findGalleryCharacterVideo(character = {}, sceneId = "", sceneEntryId = "default") {
  const candidates = [
    ...characterRoleVideos(character),
    ...characterSceneVideos(character),
  ];
  return candidates.find((video) => String(video.sceneId || "") === String(sceneId || "") && String(video.sceneEntryId || "default") === String(sceneEntryId || "default")) || null;
}

function playCharacterVideo(video = {}, title = "") {
  const url = video.videoUrl || "";
  if (!url) return;
  playPreview({ title, previewUrl: url, ratio: video.ratio || "9:16" });
}

function bindGalleryCoverVideo(video) {
  if (!video || video.dataset.coverBound) return;
  video.dataset.coverBound = "1";
  const fallback = video.dataset.videoCoverFallback || DEFAULT_TEMPLATE_COVER;
  const captureFrame = () => {
    if (video.dataset.coverReady || !video.videoWidth || !video.videoHeight) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      video.poster = canvas.toDataURL("image/jpeg", 0.84);
      video.dataset.coverReady = "1";
    } catch (error) {}
  };
  video.addEventListener("loadedmetadata", () => {
    try {
      video.currentTime = Math.min(0.2, Math.max(0, Number(video.duration || 0) / 10 || 0.2));
    } catch (error) {}
  }, { once: true });
  video.addEventListener("loadeddata", captureFrame, { once: true });
  video.addEventListener("seeked", captureFrame, { once: true });
  video.addEventListener("error", () => {
    const img = document.createElement("img");
    img.className = video.className;
    img.src = fallback || DEFAULT_TEMPLATE_COVER;
    img.alt = video.getAttribute("aria-label") || "";
    img.loading = "lazy";
    video.replaceWith(img);
  }, { once: true });
  video.load();
}

function replaceImageWithCoverVideo(img, videoUrl = "", fallback = DEFAULT_TEMPLATE_COVER) {
  if (!img || !videoUrl) return false;
  const video = document.createElement("video");
  video.className = img.className;
  video.src = videoUrl;
  video.setAttribute("aria-label", img.alt || "");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.dataset.videoCoverFallback = fallback || DEFAULT_TEMPLATE_COVER;
  img.replaceWith(video);
  bindGalleryCoverVideo(video);
  return true;
}

function bindGalleryImageFallbacks(root = els.templateGrid) {
  root?.querySelectorAll?.("img[data-cover-fallback]")?.forEach((img) => {
    const fallback = img.dataset.coverFallback || DEFAULT_TEMPLATE_COVER;
    const finalFallback = img.dataset.coverFinalFallback || DEFAULT_TEMPLATE_COVER;
    const applyFallback = () => {
      const current = img.getAttribute("src") || "";
      if (fallback && current !== fallback) {
        if (isVideoMediaUrl(fallback)) {
          replaceImageWithCoverVideo(img, fallback, finalFallback);
          return;
        }
        img.src = fallback;
      } else if (finalFallback && current !== finalFallback) {
        img.src = finalFallback;
      }
    };
    img.addEventListener("error", applyFallback);
    if (img.complete && img.naturalWidth === 0) applyFallback();
  });
  root?.querySelectorAll?.("video[data-video-cover-fallback]")?.forEach(bindGalleryCoverVideo);
}

function bindGalleryCaseActions() {
  els.templateGrid.querySelectorAll("[data-case-index]").forEach((card) => {
    card.addEventListener("click", () => {
      const item = advancedCaseById(card.dataset.caseId) || state.advancedCases.filter((entry) => entry.enabled !== false)[Number(card.dataset.caseIndex || 0)];
      fillAdvancedCase(item);
      setTab("advanced");
    });
    const isCaseRow = card.classList.contains("advanced-case-row");
    bindHoverPreviewCard({
      card,
      video: isCaseRow ? null : card.querySelector(".advanced-case-hover-video"),
      cover: isCaseRow ? null : card.querySelector(".advanced-case-cover"),
    });
  });
  els.templateGrid.querySelectorAll("[data-advanced-fill-prompt-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      fillAdvancedCasePrompt(advancedCaseById(button.dataset.advancedFillPromptId));
      setTab("advanced");
    });
  });
  els.templateGrid.querySelectorAll("[data-advanced-row-preview-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedRowPreview(button.dataset.advancedRowPreviewId, button.dataset.advancedRowPreviewKind || "output");
    });
  });
  els.templateGrid.querySelectorAll("[data-advanced-preview-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedPreview(button.dataset.advancedPreviewIndex);
    });
  });
}

async function useHomeCharacter(characterId = "") {
  const item = state.homeCharacters.find((entry) => String(entry.id || "") === String(characterId || ""));
  if (!item) return;
  const imageUrl = characterReferenceImageUrl(item);
  let dataUrl = "";
  try {
    dataUrl = await imageUrlToDataUrl(imageUrl);
  } catch (error) {
    dataUrl = "";
  }
  if (els.advancedProvider) els.advancedProvider.value = "seedance";
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_images";
  state.activeAdvancedCaseId = "";
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  state.advancedReferenceImages = dataUrl ? [{
    dataUrl,
    previewUrl: imageUrl,
    fileName: item.name || "Character",
  }] : [];
  state.advancedUploadDataUrl = dataUrl;
  if (els.advancedPrompt && !els.advancedPrompt.value.trim()) {
    els.advancedPrompt.value = `Use Image 1 as the main character reference. Create a cinematic video featuring ${item.name || "the character"}.`;
  }
  setTab("advanced");
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedNote) {
    els.advancedNote.textContent = dataUrl
      ? `${item.name || "Character"} selected. Choose a case or generate directly.`
      : `Failed to load ${item.name || "character"} image.`;
  }
}

async function imageUrlToDataUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  const response = await fetch(raw);
  if (!response.ok) throw new Error(`Failed to load character image: ${response.status}`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read character image."));
    reader.readAsDataURL(blob);
  });
}

function renderLegacyTemplates() {
  const list = state.templates.filter((template) => {
    if (isHiddenCategory({ id: template.category, name: template.category })) return false;
    if (state.category !== "all" && template.category !== state.category) return false;
    return true;
  });

  els.templateGrid.innerHTML = list.length ? list.map((template) => `
    <article class="template-card" data-card-template-id="${escapeHtml(template.id)}">
      <img class="template-cover" src="${escapeHtml(template.coverUrl || DEFAULT_TEMPLATE_COVER)}" alt="${escapeHtml(localizedTemplateTitle(template))}" loading="lazy" />
      ${template.previewUrl || template.hoverPreviewUrl ? `<video class="template-hover-video" data-src="${escapeHtml(template.hoverPreviewUrl || template.previewUrl)}" poster="${escapeHtml(template.coverUrl || DEFAULT_TEMPLATE_COVER)}" muted loop playsinline preload="none" disablepictureinpicture></video>` : ""}
      <div class="template-meta">
        <button class="use-template" data-template-id="${escapeHtml(template.id)}" type="button">${escapeHtml(templateActionLabel(template))}</button>
      </div>
    </article>
  `).join("") : `<div class="job-note">${escapeHtml(t("gallery.noTemplates"))}</div>`;

  els.templateGrid.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => openTemplate(button.dataset.templateId));
  });
  els.templateGrid.querySelectorAll(".template-card").forEach((card) => {
    const video = card.querySelector(".template-hover-video");
    const cover = card.querySelector(".template-cover");
    const useFallbackCover = () => {
      if (!cover || cover.dataset.fallbackApplied === "1") return;
      cover.dataset.fallbackApplied = "1";
      if (video) {
        card.classList.add("cover-failed");
        video.load();
        return;
      }
      if (cover.getAttribute("src") !== DEFAULT_TEMPLATE_COVER) {
        cover.src = DEFAULT_TEMPLATE_COVER;
      }
    };
    cover?.addEventListener("error", useFallbackCover);
    if (cover?.complete && cover.naturalWidth === 0) useFallbackCover();
    bindHoverPreviewCard({
      card,
      video,
      cover,
      fallbackCover: DEFAULT_TEMPLATE_COVER,
      tapToPreview: true,
    });
  });
  refreshIcons();
}

function isHiddenCategory(category) {
  const value = `${category?.id || ""} ${category?.name || ""}`.toLowerCase();
  return value.includes("business") || value.includes("商业接入");
}

function previewRatioFromItem(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const requestJson = item.requestJson && typeof item.requestJson === "object" ? item.requestJson : {};
  return item.ratio || params.ratio || params.aspect_ratio || requestJson.ratio || requestJson.aspect_ratio || "16:9";
}

function playPreview({ title = "", previewUrl = "", ratio = "16:9" } = {}) {
  if (!previewUrl || !els.previewDialog || !els.previewVideo) return;
  els.previewTitle.textContent = title || t("common.preview");
  els.previewVideo.pause();
  els.previewVideo.setAttribute("style", ratioStyle(ratio));
  els.previewVideo.src = previewUrl;
  els.previewVideo.load();
  if (!els.previewDialog.open) els.previewDialog.showModal();
  window.setTimeout(() => els.previewVideo.play().catch(() => {}), 80);
}

function historyDetailPayload(record = {}) {
  return {
    taskId: record.taskId || "",
    status: statusLabel(record.status),
    source: record.source || "",
    prompt: record.finalPrompt || record.prompt || "",
    params: stripModelParams(record.params || null),
    ratio: record.ratio || record.params?.ratio || record.params?.aspect_ratio || "",
    resolution: record.resolution || record.params?.resolution || "",
    duration: record.duration || "",
    mediaMode: record.mediaMode || record.params?.mediaMode || "",
    billing: record.billing || null,
    error: record.error || "",
    poster: generationPosterUrl(record) || "",
    result: generationVideoUrl(record) || "",
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || "",
  };
}

function openHistoryDetail(index) {
  const record = state.historyRecords?.[Number(index || 0)];
  if (!record || !els.historyDetailDialog || !els.historyDetailBody) return;
  const title = record.templateTitle || record.sceneEntryName || record.sceneName || t("history.detailTitle");
  const videoUrl = generationVideoUrl(record);
  const recordRatio = record.ratio || record.params?.ratio || record.params?.aspect_ratio || "16:9";
  const images = recordImageAssets(record);
  const videos = recordVideoAssets(record);
  els.historyDetailTitle.textContent = title || t("history.detailTitle");
  els.historyDetailBody.innerHTML = `
    <section class="history-detail-section">
      <header>
        <strong>${escapeHtml(t("history.inputImages"))}</strong>
        <span>${escapeHtml(record.taskId || "")}</span>
      </header>
      ${images.length || videos.length ? `
        <div class="history-detail-images">
          ${videos.map((asset) => `
            <figure>
              <video src="${escapeHtml(asset.videoUrl)}" muted playsinline preload="metadata" controls></video>
              <figcaption>${escapeHtml(asset.label || "")}</figcaption>
            </figure>
          `).join("")}
          ${images.map((asset) => `
            <figure>
              <img src="${escapeHtml(mediaAssetPreviewUrl(asset))}" alt="" loading="lazy" />
              <figcaption>${escapeHtml(asset.label || "")}</figcaption>
            </figure>
          `).join("")}
        </div>
      ` : `<p class="history-detail-empty">${escapeHtml(t("history.noInputImages"))}</p>`}
    </section>
    <section class="history-detail-section">
      <header><strong>${escapeHtml(t("history.parameters"))}</strong></header>
      <pre>${escapeHtml(JSON.stringify(historyDetailPayload(record), null, 2))}</pre>
    </section>
    <section class="history-detail-section">
      <header><strong>${escapeHtml(t("history.result"))}</strong></header>
      ${videoUrl ? `
        <video src="${escapeHtml(videoUrl)}" ${generationPosterUrl(record) ? `poster="${escapeHtml(generationPosterUrl(record))}"` : ""} controls playsinline preload="metadata" style="${escapeHtml(ratioStyle(recordRatio))}"></video>
      ` : `<pre>${escapeHtml(record.error || statusLabel(record.status))}</pre>`}
    </section>
  `;
  if (!els.historyDetailDialog.open) els.historyDetailDialog.showModal();
  refreshIcons();
}

function openPreview(templateId) {
  const template = state.templates.find((item) => item.id === templateId);
  playPreview({ title: template?.title, previewUrl: template?.previewUrl, ratio: previewRatioFromItem(template) });
}

function openAdvancedPreview(index) {
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  const item = cases[Number(index || 0)];
  playPreview({ title: item?.title, previewUrl: advancedCaseOutputVideo(item), ratio: previewRatioFromItem(item) });
}

function advancedCaseById(id = "") {
  const target = String(id || "").trim();
  return state.advancedCases.find((item) => String(item.id || "") === target) || null;
}

function advancedCaseInputImage(item = {}) {
  const candidates = [
    item.inputImageUrl,
    item.sourceImageUrl,
    item.referenceImageUrl,
    item.referenceUrl,
    item.imageUrl,
    item.params?.inputImageUrl,
    item.params?.sourceImageUrl,
    item.params?.referenceImageUrl,
    item.mediaAssets?.find?.((asset) => asset && !["reference_video", "first_clip", "driving_audio"].includes(asset.type))?.imageUrl,
    item.mediaAssets?.find?.((asset) => asset && !["reference_video", "first_clip", "driving_audio"].includes(asset.type))?.localUrl,
    item.sourceCoverUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || item.coverUrl || DEFAULT_TEMPLATE_COVER;
}

function advancedCaseInputVideo(item = {}) {
  const candidates = [
    item.inputVideoUrl,
    item.params?.inputVideoUrl,
    item.params?.sourceVideoUrl,
    item.params?.firstClipUrl,
    item.params?.first_clip_url,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.videoUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.url,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.localUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function advancedCaseInputVideoPoster(item = {}) {
  const inputVideoUrl = advancedCaseInputVideo(item);
  const candidates = [
    item.inputVideoPosterUrl,
    item.sourceVideoPosterUrl,
    item.params?.inputVideoPosterUrl,
    item.params?.sourceVideoPosterUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.posterUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.imageUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.thumbnailUrl,
    item.mediaAssets?.find?.((asset) => asset && ["reference_video", "first_clip"].includes(asset.type))?.localPosterUrl,
    generatedPosterFromVideoUrl(inputVideoUrl),
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || item.sourceCoverUrl || item.localCoverUrl || item.coverUrl || item.inputImageUrl || item.sourceImageUrl || DEFAULT_TEMPLATE_COVER;
}

function renderGalleryModeTabs() {
  if (!els.galleryModeTabs) return;
  const activeMode = state.galleryMode;
  const modes = [
    ...ADVANCED_CASE_TABS.map((tab) => ({
      id: tab.id,
      label: advancedCaseTabLabel(tab.id),
      count: state.advancedCases.filter((item) => item.enabled !== false && normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab) === tab.id).length,
    })),
  ];
  els.galleryModeTabs.innerHTML = modes.map((mode) => `
    <button class="gallery-mode-tab ${activeMode === mode.id ? "is-active" : ""}" data-gallery-mode="${escapeHtml(mode.id)}" type="button">
      ${escapeHtml(mode.label)}<span>${escapeHtml(String(mode.count))}</span>
    </button>
  `).join("");
  els.galleryModeTabs.querySelectorAll("[data-gallery-mode]").forEach((button) => {
    button.addEventListener("click", () => setGalleryMode(button.dataset.galleryMode));
  });
}

function advancedCaseOutputVideo(item = {}) {
  const candidates = [
    item.previewUrl,
    item.localVideoUrl,
    item.cdnVideoUrl,
    item.hoverPreviewUrl,
    item.sourceVideoUrl,
    item.mediaSourceVideoUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function generatedPosterFromVideoUrl(videoUrl = "") {
  const raw = String(videoUrl || "").trim();
  const match = raw.match(/^(.*\/assets\/generated\/)videos\/([^/?#]+)\.(?:mp4|webm|mov|m4v)([?#].*)?$/i);
  if (!match) return "";
  return `${match[1]}posters/${match[2]}.jpg`;
}

function advancedCaseOutputPoster(item = {}) {
  const candidates = [
    item.outputPosterUrl,
    item.resultPosterUrl,
    item.posterUrl,
    generatedPosterFromVideoUrl(item.sourceVideoUrl),
    generatedPosterFromVideoUrl(item.mediaSourceVideoUrl),
    generatedPosterFromVideoUrl(item.localVideoUrl),
    generatedPosterFromVideoUrl(item.previewUrl),
    item.localCoverUrl,
    item.coverUrl,
    item.cdnCoverUrl,
    item.sourceCoverUrl,
    item.mediaSourceCoverUrl,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || DEFAULT_TEMPLATE_COVER;
}

function openAdvancedRowPreview(caseId, kind = "output") {
  const item = advancedCaseById(caseId);
  if (!item) return;
  const previewUrl = kind === "input" ? advancedCaseInputVideo(item) : advancedCaseOutputVideo(item);
  playPreview({ title: item.title || t("advanced.defaultCase"), previewUrl, ratio: previewRatioFromItem(item) });
}

function advancedCaseStageTile({ className = "", imageUrl = "", videoUrl = "", label = "", isVideo = false, caseId = "", previewKind = "" } = {}) {
  const playable = Boolean(isVideo && previewKind && videoUrl);
  const poster = imageUrl || DEFAULT_TEMPLATE_COVER;
  const media = `<img src="${escapeHtml(poster)}" alt="" loading="lazy" />`;
  return `
    <div class="advanced-case-row-media ${className} ${isVideo ? "is-video" : "is-image"}">
      ${media}
      <span class="advanced-case-stage-label">${escapeHtml(label)}</span>
      ${isVideo ? `<span class="advanced-case-video-mark"><i data-lucide="play"></i></span>` : ""}
      ${playable ? `<button class="advanced-case-stage-hit" data-advanced-row-preview-id="${escapeHtml(caseId)}" data-advanced-row-preview-kind="${escapeHtml(previewKind)}" type="button" aria-label="${escapeHtml(t("common.preview"))}"></button>` : ""}
    </div>
  `;
}

function advancedCasePromptText(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  return String(item.prompt || params.prompt || t("advanced.casePromptFallback")).trim();
}

function fillAdvancedCasePrompt(item = {}) {
  if (!item) return;
  const prompt = advancedCasePromptText(item);
  const provider = advancedCaseProvider(item);
  if (els.advancedProvider) {
    els.advancedProvider.value = provider;
    updateAdvancedModelControls();
  }
  if (els.advancedPrompt) {
    els.advancedPrompt.value = prompt;
    els.advancedPrompt.focus?.();
  }
  state.activeAdvancedCaseId = "";
  updateAdvancedButtonCost();
  if (els.advancedNote) els.advancedNote.textContent = t("advanced.casePromptLoaded");
}

function renderAdvancedCaseCard({ item, index }) {
  const title = item.title || t("advanced.defaultCase");
  const provider = advancedCaseProvider(item);
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const duration = advancedCaseDuration(item);
  const resolution = normalizeAdvancedResolution(params.resolution || item.resolution || "720p", provider);
  const cover = advancedCaseOutputPoster(item) || item.coverUrl || DEFAULT_TEMPLATE_COVER;
  const preview = advancedCaseOutputVideo(item) || item.previewUrl || item.hoverPreviewUrl || "";
  return `
    <article class="advanced-case-card" data-case-index="${index}" data-case-id="${escapeHtml(item.id || "")}">
      <img class="advanced-case-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy" />
      ${preview ? `<video class="advanced-case-hover-video" data-src="${escapeHtml(preview)}" poster="${escapeHtml(cover)}" muted loop playsinline preload="none" disablepictureinpicture></video>` : ""}
      ${preview ? `<button class="preview-play advanced-preview-play" data-advanced-preview-index="${index}" type="button" aria-label="${escapeHtml(t("common.preview"))}"><i data-lucide="play"></i></button>` : ""}
      <div class="advanced-case-card-meta">
        <span>${escapeHtml(resolution)} / ${escapeHtml(t("cost.seconds", { value: duration }))}</span>
        <strong>${escapeHtml(title)}</strong>
      </div>
    </article>
  `;
}

function renderAdvancedCaseRow({ item, index }) {
  const caseId = String(item.id || "");
  const title = item.title || t("advanced.defaultCase");
  const inputImage = advancedCaseInputImage(item);
  const inputVideo = advancedCaseInputVideo(item);
  const inputVideoPoster = advancedCaseInputVideoPoster(item);
  const outputVideo = advancedCaseOutputVideo(item);
  const outputPoster = advancedCaseOutputPoster(item);
  const tab = normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab);
  const showReplaceVideoSlot = tab === "replace" && (inputVideo || inputVideoPoster);
  return `
    <article class="advanced-case-row" data-case-index="${index}" data-case-id="${escapeHtml(caseId)}">
      <div class="advanced-case-row-input ${tab === "replace" ? "is-replace" : ""}">
        ${showReplaceVideoSlot ? `
          ${advancedCaseStageTile({ className: "advanced-case-row-source-video", imageUrl: inputVideoPoster, videoUrl: inputVideo, label: t("advanced.caseInputVideo"), isVideo: true, caseId, previewKind: inputVideo ? "input" : "" })}
        ` : ""}
        ${advancedCaseStageTile({ className: "advanced-case-row-image", imageUrl: inputImage, label: tab === "replace" ? t("advanced.caseImage") : t("advanced.caseInputImage"), isVideo: false, caseId })}
      </div>
      <div class="advanced-case-row-arrow"><i data-lucide="arrow-right"></i></div>
      ${advancedCaseStageTile({ className: "advanced-case-row-video", imageUrl: outputPoster, videoUrl: outputVideo, label: t("advanced.caseResultVideo"), isVideo: true, caseId, previewKind: outputVideo ? "output" : "" })}
      <div class="advanced-case-row-action">
        <strong>${escapeHtml(title)}</strong>
        <button class="ghost-button advanced-case-use-prompt" data-advanced-fill-prompt-id="${escapeHtml(caseId)}" type="button"><i data-lucide="text-cursor-input"></i>${escapeHtml(t("advanced.usePrompt"))}</button>
        <p class="advanced-case-row-hint">${escapeHtml(t("advanced.casePromptHint"))}</p>
      </div>
    </article>
  `;
}

function renderAdvancedCasePager(tab, page, totalPages) {
  if (totalPages <= 1) return "";
  return `
    <div class="advanced-case-pager">
      <button class="ghost-button" type="button" data-case-page="${page - 1}" ${page <= 1 ? "disabled" : ""}><i data-lucide="chevron-left"></i></button>
      <span>${page} / ${totalPages}</span>
      <button class="ghost-button" type="button" data-case-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}><i data-lucide="chevron-right"></i></button>
    </div>
  `;
}

function normalizeAdvancedCaseTab(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("extend")) return "extend";
  if (raw.includes("replace")) return "replace";
  if (raw === "hot" || raw.includes("热门") || raw.includes("popular")) return "hot";
  return "hot";
}

function advancedCaseTabLabel(tab = "hot") {
  const item = ADVANCED_CASE_TABS.find((entry) => entry.id === tab) || ADVANCED_CASE_TABS[0];
  return t(item.labelKey, {}, item.id);
}

let paypalConfigPromise = null;
let paypalSdkPromise = null;
let paypalButtonsRendered = false;

function walletCreditsForAmount(amount) {
  const rate = Number(state.wallet?.cnyCentsPerUsdt || 720);
  return Math.max(0, Math.round(Number(amount || 0) * rate));
}

function walletOptionList() {
  const options = Array.isArray(state.wallet?.options) ? state.wallet.options.filter((option) => option?.address) : [];
  if (options.length) return options;
  if (state.wallet?.address) {
    return [{
      id: state.wallet.network || "wallet",
      label: state.wallet.network || "USDT",
      network: state.wallet.network || "TRC20",
      asset: state.wallet.asset || "USDT",
      address: state.wallet.address,
      qrUrl: state.wallet.qrUrl || "",
      explorerUrl: state.wallet.explorerUrl || "",
    }];
  }
  return [];
}

function selectedWalletOption() {
  const options = walletOptionList();
  const selectedId = String(state.selectedWalletOptionId || "").trim();
  return options.find((option) => option.id === selectedId) || options[0] || null;
}

function ensureSelectedWalletOption() {
  const options = walletOptionList();
  if (!options.length) {
    state.selectedWalletOptionId = "";
    return null;
  }
  if (!options.some((option) => option.id === state.selectedWalletOptionId)) {
    state.selectedWalletOptionId = options[0].id || "";
  }
  return selectedWalletOption();
}

function renderWalletOptions() {
  if (!els.topupWalletOptions) return;
  const options = walletOptionList();
  const selected = ensureSelectedWalletOption();
  if (options.length <= 1) {
    els.topupWalletOptions.innerHTML = "";
    return;
  }
  els.topupWalletOptions.innerHTML = `
    <div class="topup-wallet-options-head">
      <span>${escapeHtml(t("topup.walletNetwork"))}</span>
      <small>${escapeHtml(t("topup.walletNetworkHint"))}</small>
    </div>
    <div class="topup-wallet-option-grid">
      ${options.map((option) => `
        <button class="topup-wallet-option ${option.id === selected?.id ? "is-active" : ""}" type="button" data-wallet-option="${escapeHtml(option.id)}">
          <strong>${escapeHtml(option.label || option.network || option.asset || "USDT")}</strong>
          <small>${escapeHtml(option.network || "")}</small>
        </button>
      `).join("")}
    </div>
  `;
  els.topupWalletOptions.querySelectorAll("[data-wallet-option]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedWalletOptionId = button.dataset.walletOption || "";
      renderTopupSummary();
    });
  });
}

function renderTopupQrDialog(order = null) {
  if (!order || !els.topupQrDialog) return;
  const wallet = state.wallet || {};
  const selected = selectedWalletOption();
  const address = order?.address || selected?.address || wallet.address || "";
  const qrUrl = order?.qrUrl || selected?.qrUrl || wallet.qrUrl || "";
  const explorerUrl = order?.explorerUrl || selected?.explorerUrl || wallet.explorerUrl || "";
  const asset = order?.asset || selected?.asset || wallet.asset || "USDT";
  const network = order?.network || selected?.network || wallet.network || "TRC20";
  if (els.topupQrAmount) {
    els.topupQrAmount.textContent = `${order.payableAmountText || order.payableAmount || order.baseAmount || ""} ${asset}`.trim();
  }
  if (els.topupWalletQr) {
    els.topupWalletQr.hidden = !qrUrl;
    if (qrUrl) els.topupWalletQr.src = qrUrl;
  }
  if (els.topupWalletNetwork) els.topupWalletNetwork.textContent = `${asset} · ${network}`;
  if (els.topupWalletAddress) els.topupWalletAddress.textContent = address;
  if (els.topupQrCopyBtn) {
    els.topupQrCopyBtn.onclick = () => copyTopupAddress(address);
  }
  const explorerLink = document.querySelector("#topupWalletExplorer");
  if (explorerLink) {
    explorerLink.hidden = !explorerUrl;
    explorerLink.href = explorerUrl || "#";
  }
  if (els.topupDialog?.open) els.topupDialog.close();
  if (!els.topupQrDialog.open) els.topupQrDialog.showModal();
  syncTopupAutoRefresh();
  refreshIcons();
}

function copyTopupAddress(address = "") {
  if (!address) return;
  navigator.clipboard?.writeText(address).then(() => {
    if (els.topupRate) els.topupRate.textContent = t("topup.addressCopied");
  });
}

function renderTopupSummary() {
  if (!els.topupPanel) return;
  const rawAmount = Number(els.topupAmount?.value || 0);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : DEFAULT_TOPUP_AMOUNT;
  const credits = walletCreditsForAmount(amount);
  const asset = state.wallet?.asset || "USDT";
  const selected = ensureSelectedWalletOption();
  const network = selected?.network || state.wallet?.network || "TRC20";
  if (els.topupCredits) els.topupCredits.textContent = t("cost.credits", { credits });
  currentTopupCreditsEls().forEach((element) => {
    element.hidden = !state.user;
    element.textContent = state.user ? formatCredits(Number(state.user.credits || 0)) : "";
  });
  if (els.topupRate) {
    els.topupRate.textContent = state.user
      ? t("topup.rate", { amount: amount || 0, asset, network })
      : t("topup.login");
  }
  renderWalletOptions();
}

function renderTopupOrder(order) {
  if (!order) return;
  const isPayPal = order.paymentProvider === "paypal" || order.network === "PayPal";
  if (els.topupCredits) els.topupCredits.textContent = t("cost.credits", { credits: order.creditAmount || 0 });
  if (isPayPal) {
    if (els.topupRate) {
      els.topupRate.textContent = `${t("topup.paypalOrder")}: ${order.paypalOrderId || order.id || ""}`;
    }
    refreshIcons();
    return;
  }
  renderTopupQrDialog(order);
  refreshIcons();
}

async function loadPayPalConfig() {
  if (!paypalConfigPromise) {
    paypalConfigPromise = requestJson("/api/pay/paypal/config")
      .then((payload) => payload.paypal || {})
      .catch((error) => {
        paypalConfigPromise = null;
        throw error;
      });
  }
  return paypalConfigPromise;
}

function loadPayPalSdk(config) {
  if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
  if (paypalSdkPromise) return paypalSdkPromise;
  paypalSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      "client-id": config.clientId,
      currency: config.currency || "USD",
      intent: "capture",
      components: "buttons",
    });
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error("Failed to load PayPal."));
    document.head.appendChild(script);
  });
  return paypalSdkPromise;
}

async function renderPayPalCheckout() {
  if (!els.paypalBox || !els.paypalButtons) return;
  if (paypalButtonsRendered) return;
  try {
    const config = await loadPayPalConfig();
    if (!config.enabled || !config.clientId) {
      els.paypalBox.hidden = true;
      els.paypalButtons.hidden = true;
      if (els.paypalStatus) els.paypalStatus.textContent = t("topup.paypalUnavailable");
      return;
    }
    els.paypalBox.hidden = false;
    if (els.paypalStatus) els.paypalStatus.textContent = t("topup.paypalLoading");
    const paypal = await loadPayPalSdk(config);
    if (!paypal?.Buttons) throw new Error("PayPal is unavailable.");
    els.paypalButtons.innerHTML = "";
    els.paypalButtons.hidden = false;
    const buttons = paypal.Buttons({
      style: {
        layout: "horizontal",
        height: 40,
        tagline: false,
      },
      onInit: () => {
        if (els.paypalStatus) els.paypalStatus.textContent = t("topup.paypalReady");
      },
      createOrder: async () => {
        if (!state.user) {
          openLogin();
          throw new Error(t("topup.login"));
        }
        const amount = Number(els.topupAmount?.value || 0);
        if (!Number.isFinite(amount) || amount < MIN_TOPUP_AMOUNT) {
          if (els.paypalStatus) els.paypalStatus.textContent = t("topup.invalid");
          throw new Error(t("topup.invalid"));
        }
        if (els.paypalStatus) els.paypalStatus.textContent = t("topup.paypalCreating");
        const payload = await requestJson("/api/pay/paypal/orders", {
          method: "POST",
          body: { amount },
        });
        renderTopupOrder(payload.order);
        return payload.paypalOrderId;
      },
      onApprove: async (data) => {
        if (els.paypalStatus) els.paypalStatus.textContent = t("topup.paypalApproved");
        const paypalOrderId = data.orderID || data.orderId;
        const payload = await requestJson(`/api/pay/paypal/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
          method: "POST",
        });
        if (payload.user) setUser(payload.user);
        renderTopupOrder(payload.order);
        renderTopupSummary();
        if (state.tab === "topups") loadTopupRecords(1);
        if (els.paypalStatus) els.paypalStatus.textContent = t("topup.paypalPaid");
      },
      onCancel: () => {
        if (els.paypalStatus) els.paypalStatus.textContent = t("topup.paypalCancelled");
      },
      onError: (error) => {
        if (els.paypalStatus) els.paypalStatus.textContent = error?.message || String(error || "PayPal error");
      },
    });
    await buttons.render(els.paypalButtons);
    paypalButtonsRendered = true;
  } catch (error) {
    els.paypalBox.hidden = true;
    els.paypalButtons.hidden = true;
    if (els.paypalStatus) els.paypalStatus.textContent = error.message || String(error);
  }
}

async function createTopupOrder() {
  if (!state.user) return openLogin();
  const amount = Number(els.topupAmount?.value || 0);
  if (!Number.isFinite(amount) || amount < MIN_TOPUP_AMOUNT) {
    if (els.topupRate) els.topupRate.textContent = t("topup.invalid");
    return;
  }
  els.createTopupBtn.disabled = true;
  if (els.topupRate) els.topupRate.textContent = t("topup.creating");
  try {
    const payload = await requestJson("/api/pay/orders", {
      method: "POST",
      body: { amount, walletOptionId: selectedWalletOption()?.id || "" },
    });
    renderTopupOrder(payload.order);
    if (els.topupRate) els.topupRate.textContent = t("topup.created");
  } catch (error) {
    if (els.topupRate) els.topupRate.textContent = error.message;
  } finally {
    els.createTopupBtn.disabled = false;
  }
}

function renderAccessGuides() {
  const guides = ensureActiveAccessGuide();
  if (els.accessModeTabs) {
    els.accessModeTabs.querySelectorAll("[data-access-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.accessMode === activeAccessMode);
    });
  }
  els.accessTabs.innerHTML = guides.map((guide) => `
    <button class="access-tab ${activeAccessGuide.id === guide.id ? "is-active" : ""}" data-access-guide="${escapeHtml(guide.id)}" type="button">
      <strong>${escapeHtml(guideText(guide, "title"))}</strong>
      <span>${escapeHtml(guideText(guide, "subtitle"))}</span>
    </button>
  `).join("");
  els.accessGuideTitle.textContent = guideText(activeAccessGuide, "title");
  els.accessGuideDesc.textContent = guideText(activeAccessGuide, "desc");
  els.accessCopy.textContent = hydrateAccessCopy(activeAccessGuide.copy || PUBLIC_COPY.accessCopy, { revealToken: state.showAccessToken });
  const doc = accessDoc(activeAccessGuide);
  if (els.accessDocs) {
    els.accessDocs.innerHTML = `
      <article class="access-doc-card">
        <div class="access-doc-head">
          <div>
            <span class="copy-kicker"><i data-lucide="book-open-text"></i>${escapeHtml(doc.title)}</span>
            <p>${escapeHtml(doc.summary)}</p>
          </div>
          ${activeAccessMode === "params" ? `
            <div class="access-doc-actions">
              <button class="ghost-button" type="button" data-access-copy-markdown><i data-lucide="copy"></i>Copy Markdown</button>
              <button class="ghost-button" type="button" data-access-download-markdown><i data-lucide="download"></i>Download .md</button>
              <a class="ghost-button" href="${escapeHtml(PARAM_DOC_MARKDOWN_URL)}" target="_blank" rel="noreferrer"><i data-lucide="file-text"></i>Full docs</a>
            </div>
          ` : ""}
        </div>
        <div class="access-doc-grid">
          <section>
            <h4>Request</h4>
            ${accessFieldTable(doc.request)}
          </section>
          <section>
            <h4>Response</h4>
            ${accessFieldTable(doc.response)}
          </section>
        </div>
        ${accessQuickList([
          doc === ACCESS_DOCS.platform ? "One token, one template id, and one image for image-to-video templates." : "",
          doc === ACCESS_DOCS.assets ? "Upload once, then pass asset.id into the matching image/video/audio field." : "",
          doc === ACCESS_DOCS.advanced ? "Seedance now uses the Volcengine-compatible content[] task body. Public/base64 images are prepared into Ark assets automatically." : "",
          doc === ACCESS_DOCS.seedanceParams ? "Start directly with /api/v3/contents/generations/tasks. Optionally call /api/seedance/characters/upload first and put returned reference.assetUri into content[].image_url.url." : "",
          doc === ACCESS_DOCS.wan27VideoParams ? "Fields inside params.parameters merge into DashScope parameters; fields inside params.input merge into DashScope input." : "",
          doc === ACCESS_DOCS.wan27ImageParams ? "Image results are saved to history first; call Add asset from history to place a result in assets. Admin records include the upstream payload." : "",
          doc === ACCESS_DOCS.records ? "Use refresh=1 on list views when you want pending tasks to refresh." : "",
        ].filter(Boolean))}
        <details class="access-doc-example" open>
          <summary>Example</summary>
          <pre>${escapeHtml(tenantScopedAccessText(doc.example))}</pre>
        </details>
      </article>
    `;
  }
  renderTokenDisplays();
  els.accessModeTabs?.querySelectorAll("[data-access-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAccessMode = button.dataset.accessMode === "params" ? "params" : "integration";
      activeAccessGuide = accessGuidesForMode(activeAccessMode)[0] || ACCESS_GUIDES[0];
      renderAccessGuides();
      refreshIcons();
    });
  });
  els.accessTabs.querySelectorAll("[data-access-guide]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAccessGuide = guides.find((guide) => guide.id === button.dataset.accessGuide) || guides[0];
      renderAccessGuides();
      refreshIcons();
    });
  });
  els.accessDocs?.querySelector("[data-access-copy-markdown]")?.addEventListener("click", (event) => copyAccessMarkdown(event.currentTarget, doc));
  els.accessDocs?.querySelector("[data-access-download-markdown]")?.addEventListener("click", () => downloadAccessMarkdown(doc));
}

function userHasAdvancedAccess() {
  return Boolean(state.user);
}

function renderAdvanced() {
  if (!els.advancedGate || !els.advancedWorkspace) return;
  if (!state.user) {
    els.advancedWorkspace.hidden = false;
    els.advancedGate.innerHTML = `
      <div class="permission-card permission-card-inline">
        <span class="copy-kicker"><i data-lucide="lock-keyhole"></i>${escapeHtml(t("advanced.approvalRequired"))}</span>
        <h2>${escapeHtml(t("advanced.inviteOnly"))}</h2>
        <p>${escapeHtml(t("advanced.loginFirst"))}</p>
        <button class="generate-btn" id="advancedLoginBtn" type="button">${escapeHtml(t("nav.login"))}</button>
      </div>
    `;
    document.querySelector("#advancedLoginBtn")?.addEventListener("click", openLogin);
    renderAdvancedAssets([]);
    updateAdvancedModelControls();
    updateAdvancedButtonCost();
    refreshIcons();
    return;
  }
  els.advancedGate.innerHTML = "";
  els.advancedWorkspace.hidden = false;
  renderAdvancedAssets();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function advancedAssetTargetItems() {
  const provider = currentAdvancedProvider();
  const wanMode = normalizeWanMediaMode(els.advancedWanMediaMode?.value || "first_frame");
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
  const targets = [];
  if (provider === "wan27-image-edit") {
    targets.push({ id: "sourceImages", label: t("advanced.assetTargetSourceImages"), type: "image" });
  } else if (provider === "wan27") {
    if (wanModeNeedsFirstFrame(wanMode)) targets.push({ id: "primary", label: t("advanced.assetTargetPrimary"), type: "image" });
    if (wanModeNeedsClip(wanMode)) targets.push({ id: "video", label: t("advanced.assetTargetVideo"), type: "video" });
    if (wanModeNeedsLastFrame(wanMode)) targets.push({ id: "lastFrame", label: t("advanced.assetTargetLastFrame"), type: "image" });
    if (wanModeNeedsAudio(wanMode)) targets.push({ id: "audio", label: t("advanced.assetTargetAudio"), type: "audio" });
  } else {
    if (seedanceModeNeedsReferenceImages(seedanceMode)) {
      targets.push({ id: "referenceImages", label: t("advanced.assetTargetReferenceImages"), type: "image" });
    } else if (seedanceMode !== "text_to_video" && !seedanceModeNeedsReferenceVideo(seedanceMode)) {
      targets.push({ id: "primary", label: t("advanced.assetTargetPrimary"), type: "image" });
    }
    if (seedanceModeNeedsLastFrame(seedanceMode)) targets.push({ id: "lastFrame", label: t("advanced.assetTargetLastFrame"), type: "image" });
    if (seedanceModeNeedsReferenceVideo(seedanceMode)) {
      targets.push({ id: "video", label: t("advanced.assetTargetVideo"), type: "video" });
      targets.push({ id: "audio", label: t("advanced.assetTargetAudio"), type: "audio" });
    }
  }
  return targets.length ? targets : [{ id: "primary", label: t("advanced.assetTargetPrimary"), type: "image" }];
}

function activeAdvancedAssetTarget() {
  const targets = advancedAssetTargetItems();
  return targets.find((target) => target.id === state.advancedAssetTarget) || targets[0];
}

function advancedSourceImageAssetId() {
  return state.advancedSourceImageAssetId || state.advancedFirstFrameAssetId || "";
}

function selectedAdvancedImageAsset() {
  const id = advancedSourceImageAssetId();
  if (!id) return null;
  return (state.advancedAssets || []).find((asset) => asset.id === id)
    || (state.userAssets || []).find((asset) => asset.id === id)
    || null;
}

async function ensureAdvancedImageEditAssets() {
  const references = selectedAdvancedReferenceImages("wan27-image-edit").slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  if (!references.length) return [];
  const resolved = [];
  const nextRefs = [];
  for (const reference of references) {
    let asset = reference.assetId
      ? ((state.advancedAssets || []).find((item) => item.id === reference.assetId)
        || (state.userAssets || []).find((item) => item.id === reference.assetId)
        || null)
      : null;
    if (!asset?.id && reference.dataUrl?.startsWith("data:")) {
      const payload = await requestJson("/api/user-assets", {
        method: "POST",
        body: {
          dataUrl: reference.dataUrl,
          name: reference.name || reference.fileName || "Image edit source",
          fileName: reference.fileName || reference.name || "image.png",
        },
      });
      asset = payload.asset || null;
      if (asset?.id) {
        state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
        state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
      }
    }
    if (asset?.id && isImageAsset(asset)) {
      resolved.push(asset);
      nextRefs.push({
        assetId: asset.id,
        dataUrl: assetPreviewUrl(asset),
        fileName: asset.name || reference.fileName || "",
        name: asset.name || reference.name || "",
        fromLibrary: true,
      });
    }
  }
  state.advancedReferenceImages = nextRefs.slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  state.advancedSourceImageAssetId = state.advancedReferenceImages[0]?.assetId || "";
  state.advancedFirstFrameAssetId = "";
  state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
  renderAdvancedAssets();
  renderAdvancedReferencePreviews();
  return resolved;
}

function setAdvancedAssetTarget(target = "primary") {
  const targets = advancedAssetTargetItems();
  const next = targets.find((item) => item.id === target)?.id || targets[0]?.id || "primary";
  state.advancedAssetTarget = next;
  renderAdvancedAssetTargets();
}

function renderAdvancedAssetTargets() {
  if (!els.advancedAssetTargets) return;
  const targets = advancedAssetTargetItems();
  if (!targets.some((item) => item.id === state.advancedAssetTarget)) state.advancedAssetTarget = targets[0]?.id || "primary";
  els.advancedAssetTargets.innerHTML = `
    <span>${escapeHtml(t("advanced.assetTargets"))}</span>
    ${targets.map((target) => `
      <button class="advanced-asset-target ${state.advancedAssetTarget === target.id ? "is-active" : ""}" type="button" data-advanced-asset-target="${escapeHtml(target.id)}">
        ${escapeHtml(target.label)}
      </button>
    `).join("")}
  `;
  els.advancedAssetTargets.querySelectorAll("[data-advanced-asset-target]").forEach((button) => {
    button.addEventListener("click", () => setAdvancedAssetTarget(button.dataset.advancedAssetTarget || "primary"));
  });
}

function renderAdvancedAssets(assets) {
  if (!els.advancedAssetGrid) return;
  renderAdvancedAssetTargets();
  const list = Array.isArray(assets)
    ? assets
    : (state.advancedAssetsLoaded ? state.advancedAssets : state.userAssets) || [];
  if (!state.user) {
    if (els.advancedAssetPager) els.advancedAssetPager.innerHTML = "";
    els.advancedAssetGrid.innerHTML = `
      <div class="advanced-asset-empty">
        <strong>${escapeHtml(t("assets.loginRequired"))}</strong>
        <button class="generate-btn" type="button" data-login-advanced-assets>${escapeHtml(t("history.login"))}</button>
      </div>
    `;
    els.advancedAssetGrid.querySelector("[data-login-advanced-assets]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  if (!list.length) {
    const emptyText = state.advancedAssetsLoaded ? t("assets.emptyTitle") : t("assets.loading");
    els.advancedAssetGrid.innerHTML = `<div class="advanced-asset-empty"><strong>${escapeHtml(emptyText)}</strong></div>`;
    if (state.advancedAssetTotal > 0) {
      renderSimplePager(els.advancedAssetPager, {
        page: state.advancedAssetPage,
        totalPages: state.advancedAssetTotalPages,
        total: state.advancedAssetTotal,
      }, loadAdvancedAssets);
    } else if (els.advancedAssetPager) {
      els.advancedAssetPager.innerHTML = "";
    }
    refreshIcons();
    return;
  }
  els.advancedAssetGrid.innerHTML = list.map((asset) => {
    const url = assetPreviewUrl(asset);
    const video = isVideoAsset(asset);
    const audio = isAudioAsset(asset);
    const typeLabel = video ? t("assets.video") : audio ? t("assets.audio") : t("assets.image");
    return `
      <article class="advanced-asset-card">
        <div class="advanced-asset-preview ${audio ? "is-audio" : ""}">
          ${video
            ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video><span class="advanced-case-video-mark"><i data-lucide="play"></i></span>`
            : audio
              ? `<div class="audio-asset-preview"><i data-lucide="audio-lines"></i></div>`
              : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.name || "")}" loading="lazy" />`}
        </div>
        <div class="advanced-asset-meta">
          <strong>${escapeHtml(asset.name || asset.id)}</strong>
          <span>${escapeHtml(typeLabel)}</span>
        </div>
        <div class="advanced-asset-actions">
          <button class="copy-btn" type="button" data-advanced-asset-add="${escapeHtml(asset.id)}">${escapeHtml(t("advanced.assetAdd"))}</button>
          ${!video && !audio ? `<button class="ghost-button" type="button" data-advanced-asset-modify="${escapeHtml(asset.id)}">${escapeHtml(t("assets.modify"))}</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
  els.advancedAssetGrid.querySelectorAll("[data-advanced-asset-add]").forEach((button) => {
    button.addEventListener("click", () => addAssetToAdvancedTarget(button.dataset.advancedAssetAdd || ""));
  });
  els.advancedAssetGrid.querySelectorAll("[data-advanced-asset-modify]").forEach((button) => {
    button.addEventListener("click", () => useAssetInAdvanced(list.find((asset) => asset.id === button.dataset.advancedAssetModify), "modify"));
  });
  renderSimplePager(els.advancedAssetPager, {
    page: state.advancedAssetPage,
    totalPages: state.advancedAssetTotalPages,
    total: state.advancedAssetTotal,
  }, loadAdvancedAssets);
  refreshIcons();
}

async function loadAdvancedAssets(page = state.advancedAssetPage || 1) {
  if (!els.advancedAssetGrid) return;
  if (!state.user) {
    renderAdvancedAssets([]);
    return;
  }
  if (state.userAssets?.length && !els.advancedAssetSearch?.value && !els.advancedAssetTypeFilter?.value) {
    state.advancedAssets = state.userAssets;
    state.advancedAssetsLoaded = true;
    state.advancedAssetTotal = state.userAssetsTotal || state.userAssets.length;
    state.advancedAssetTotalPages = state.userAssetsTotalPages || 1;
    renderAdvancedAssets(state.userAssets);
  }
  const params = new URLSearchParams();
  if (els.advancedAssetSearch?.value) params.set("q", els.advancedAssetSearch.value);
  if (els.advancedAssetTypeFilter?.value) params.set("type", els.advancedAssetTypeFilter.value);
  params.set("page", String(page));
  params.set("limit", String(state.advancedAssetLimit || 8));
  if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.loading");
  try {
    const payload = await requestJson(`/api/user-assets?${params.toString()}`);
    state.advancedAssets = payload.assets || [];
    state.userAssets = payload.assets || [];
    state.userAssetsPage = payload.page || page;
    state.userAssetsLimit = payload.limit || state.userAssetsLimit || 8;
    state.userAssetsTotal = payload.total || 0;
    state.userAssetsTotalPages = payload.totalPages || 1;
    state.advancedAssetsLoaded = true;
    state.advancedAssetPage = payload.page || page;
    state.advancedAssetLimit = payload.limit || state.advancedAssetLimit || 8;
    state.advancedAssetTotal = payload.total || 0;
    state.advancedAssetTotalPages = payload.totalPages || 1;
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = "";
    renderAdvancedAssets();
  } catch (error) {
    state.advancedAssetsLoaded = true;
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.loadFailed", { message: error.message || String(error) });
    els.advancedAssetGrid.innerHTML = `<div class="advanced-asset-empty"><strong>${escapeHtml(t("assets.loadFailed", { message: error.message || String(error) }))}</strong></div>`;
  }
}

async function uploadAdvancedAssets(files = []) {
  if (!state.user) return openLogin();
  const selected = Array.from(files || []);
  if (!selected.length) return;
  if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.uploading");
  let uploaded = 0;
  try {
    for (const file of selected) {
      const dataUrl = await readFileAsDataUrl(file);
      const durationSeconds = file.type.startsWith("video/") || file.type.startsWith("audio/")
        ? await readVideoDuration(file).catch(() => 0)
        : 0;
      await requestJson("/api/user-assets", {
        method: "POST",
        body: { dataUrl, name: file.name || "Upload", fileName: file.name || "", durationSeconds },
      });
      uploaded += 1;
    }
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.uploaded", { count: uploaded });
    await loadAdvancedAssets(1);
    if (state.tab === "assets") await loadUserAssets(1);
  } catch (error) {
    if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("assets.uploadFailed", { message: error.message || String(error) });
  } finally {
    if (els.advancedAssetUploadInput) els.advancedAssetUploadInput.value = "";
    updateFilePickerLabel(els.advancedAssetUploadInput);
  }
}

function assetTargetTypeLabel(type = "image") {
  if (type === "video") return t("assets.video");
  if (type === "audio") return t("assets.audio");
  return t("assets.image");
}

function assetMatchesTarget(asset = {}, target = activeAdvancedAssetTarget()) {
  if (target.type === "video") return isVideoAsset(asset);
  if (target.type === "audio") return isAudioAsset(asset);
  return isImageAsset(asset);
}

function addAssetToAdvancedTarget(assetId = "") {
  if (!state.user) return openLogin();
  const asset = (state.advancedAssets || []).find((item) => item.id === assetId)
    || (state.userAssets || []).find((item) => item.id === assetId);
  if (!asset) return;
  const target = activeAdvancedAssetTarget();
  if (!assetMatchesTarget(asset, target)) {
    if (els.advancedAssetNote) {
      els.advancedAssetNote.textContent = t("advanced.assetWrongType", {
        target: target.label,
        type: assetTargetTypeLabel(target.type),
      });
    }
    return;
  }
  const provider = currentAdvancedProvider();
  const url = assetPreviewUrl(asset);
  state.activeAdvancedCaseId = "";
  if (target.id === "primary" || target.id === "sourceImage" || target.id === "sourceImages" || target.id === "referenceImages") {
    if (!isImageAsset(asset)) return;
    if (target.id === "sourceImage" || target.id === "sourceImages") state.advancedSourceImageAssetId = asset.id;
    else state.advancedFirstFrameAssetId = asset.id;
    state.advancedUploadDataUrl = url;
    if (provider === "seedance") {
      const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
      if ((target.id === "referenceImages" || seedanceMode === "text_to_video") && els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_images";
      const ref = { assetId: asset.id, dataUrl: url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true };
      if (target.id === "referenceImages") {
        state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
      } else if (seedanceModeNeedsFirstFrame(seedanceMode)) {
        state.advancedReferenceImages = [ref];
      } else {
        state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
      }
      state.advancedSeedanceVideoAssetId = "";
      state.advancedSeedanceVideoPreviewUrl = "";
      state.advancedAudioAssetId = "";
    } else if (provider === "wan27-image-edit") {
      const ref = { assetId: asset.id, dataUrl: url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true };
      state.advancedReferenceImages = dedupeAdvancedReferenceImages([...(state.advancedReferenceImages || []), ref]).slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
      state.advancedSourceImageAssetId = state.advancedReferenceImages[0]?.assetId || "";
      state.advancedFirstFrameAssetId = "";
      state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || url;
    } else {
      state.advancedReferenceImages = [{ assetId: asset.id, dataUrl: url, fileName: asset.name || "", name: asset.name || "", fromLibrary: true }];
    }
    if (els.advancedImage) els.advancedImage.value = "";
  } else if (target.id === "lastFrame") {
    if (!isImageAsset(asset)) return;
    if (provider === "seedance") {
      state.advancedSeedanceLastFrameAssetId = asset.id;
      state.advancedSeedanceLastFrameDataUrl = url;
      if (els.advancedSeedanceLastFrame) els.advancedSeedanceLastFrame.value = "";
    } else {
      state.advancedWanLastFrameAssetId = asset.id;
      state.advancedWanLastFrameDataUrl = url;
      if (els.advancedWanLastFrame) els.advancedWanLastFrame.value = "";
      if (els.advancedWanLastFramePreview) {
        els.advancedWanLastFramePreview.src = url;
        els.advancedWanLastFramePreview.classList.add("is-visible");
        els.advancedWanLastFrame?.closest(".wan-frame-upload")?.classList.add("has-image");
      }
    }
  } else if (target.id === "video") {
    if (!isVideoAsset(asset)) return;
    if (provider === "seedance") {
      if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
      state.advancedSeedanceVideoAssetId = asset.id;
      state.advancedSeedanceVideoPreviewUrl = url;
      state.advancedReferenceImages = [];
      state.advancedUploadDataUrl = "";
      state.advancedFirstFrameAssetId = "";
      state.advancedSourceImageAssetId = "";
    } else {
      if (els.advancedWanMediaMode && !wanModeNeedsClip(els.advancedWanMediaMode.value)) els.advancedWanMediaMode.value = "first_clip";
      state.advancedWanClipAssetId = asset.id;
      state.advancedWanClipDataUrl = "";
      state.advancedWanClipFileName = asset.name || "";
      if (els.advancedWanClipFile) els.advancedWanClipFile.value = "";
      if (els.advancedWanClipUrl) els.advancedWanClipUrl.value = "";
      if (els.advancedWanClipPreview) {
        els.advancedWanClipPreview.src = url;
        els.advancedWanClipPreview.classList.add("is-visible");
        els.advancedWanClipFile?.closest(".wan-frame-upload")?.classList.add("has-image");
      }
    }
  } else if (target.id === "audio") {
    if (!isAudioAsset(asset)) return;
    state.advancedAudioAssetId = asset.id;
    if (provider === "seedance") {
      if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
    } else if (els.advancedWanAudioUrl) {
      els.advancedWanAudioUrl.value = "";
    }
  }
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedAssetNote) els.advancedAssetNote.textContent = t("advanced.assetAdded", { target: target.label });
}

function updateAdvancedModelControls() {
  const provider = currentAdvancedProvider();
  const wanMode = normalizeWanMediaMode(els.advancedWanMediaMode?.value || "first_frame");
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
  const bounds = advancedDurationBounds(provider);
  const isImageEdit = provider === "wan27-image-edit";
  if (els.advancedDuration) {
    els.advancedDuration.min = String(bounds.min);
    els.advancedDuration.max = String(bounds.max);
    els.advancedDuration.value = isImageEdit ? "1" : String(Math.min(bounds.max, Math.max(bounds.min, Number(els.advancedDuration.value || bounds.fallback))));
  }
  if (els.advancedResolution) {
    const imageEditOptions = ["1K", "2K"];
    const videoOptions = provider === "seedance" ? ["480p", "720p", "1080p"] : ["720p", "1080p"];
    const options = isImageEdit ? imageEditOptions : videoOptions;
    const current = normalizeAdvancedResolution(els.advancedResolution.value, provider);
    els.advancedResolution.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
    if (!options.includes(current)) els.advancedResolution.value = options[0];
  }
  if (els.advancedSeedanceTier) {
    const active = provider === "seedance";
    els.advancedSeedanceTier.closest(".field")?.toggleAttribute("hidden", !active);
    if (!active) els.advancedSeedanceTier.value = "standard";
    if (active && currentAdvancedResolution() === "1080p" && currentSeedanceTier() === "fast") {
      els.advancedSeedanceTier.value = "standard";
    }
  }
  if (els.advancedRatio) {
    const imageRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
    const videoRatios = ["9:16", "16:9", "1:1"];
    const options = isImageEdit ? imageRatios : videoRatios;
    const current = normalizeVideoRatio(els.advancedRatio.value || "9:16");
    els.advancedRatio.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
    if (!options.includes(current)) els.advancedRatio.value = isImageEdit ? "9:16" : "9:16";
  }
  document.querySelectorAll(".advanced-wan-option").forEach((item) => {
    item.hidden = provider !== "wan27";
  });
  document.querySelectorAll(".advanced-seedance-option").forEach((item) => {
    item.hidden = provider !== "seedance";
  });
  document.querySelectorAll(".advanced-duration-field").forEach((item) => {
    item.hidden = isImageEdit;
  });
  document.querySelectorAll(".wan-first-frame").forEach((item) => {
    item.hidden = provider !== "wan27" || !wanModeNeedsFirstFrame(wanMode);
  });
  document.querySelectorAll(".wan-last-frame").forEach((item) => {
    item.hidden = provider !== "wan27" || !wanModeNeedsLastFrame(wanMode);
  });
  document.querySelectorAll(".wan-audio").forEach((item) => {
    item.hidden = provider !== "wan27" || !wanModeNeedsAudio(wanMode);
  });
  document.querySelectorAll(".wan-clip").forEach((item) => {
    item.hidden = provider !== "wan27" || !wanModeNeedsClip(wanMode);
  });
  document.querySelectorAll(".seedance-last-frame").forEach((item) => {
    item.hidden = provider !== "seedance" || !seedanceModeNeedsLastFrame(seedanceMode);
  });
  document.querySelectorAll(".seedance-video-field").forEach((item) => {
    item.hidden = provider !== "seedance" || !seedanceModeNeedsReferenceVideo(seedanceMode);
  });
  renderAdvancedAssetTargets();
  if (els.advancedUploadBox) {
    els.advancedUploadBox.hidden = (provider === "wan27" && !wanModeNeedsFirstFrame(wanMode)) ||
      (provider === "seedance" && seedanceMode === "text_to_video");
    els.advancedUploadBox.classList.toggle("is-wan", provider === "wan27");
    els.advancedUploadBox.classList.toggle("is-seedance", provider === "seedance");
    els.advancedUploadBox.classList.toggle("is-image-edit", isImageEdit);
    const label = els.advancedUploadBox.querySelector("span");
    if (label) {
      const seedanceLabel = seedanceModeNeedsFirstFrame(seedanceMode) ? t("advanced.firstFrame") : t("advanced.uploadReference");
      const imageEditLabel = t("advanced.assetTargetSourceImages");
      label.innerHTML = `<i data-lucide="image-up"></i>${escapeHtml(isImageEdit ? imageEditLabel : provider === "wan27" ? t("advanced.firstFrame") : seedanceLabel)}`;
    }
  }
  renderAdvancedReferencePreviews();
  updateAdvancedReferenceSummary();
  if (els.advancedPreprocessReference) els.advancedPreprocessReference.value = "no";
  if (els.advancedNote && (state.advancedUploadDataUrl || state.advancedSeedanceVideoAssetId)) {
    if (provider === "seedance") {
      const count = selectedAdvancedReferenceImages().length;
      els.advancedNote.textContent = `${t("advanced.referenceSeedance", { mode: t("advanced.originalReference") })} ${t("advanced.seedanceReferenceCount", { count })}`;
    } else if (isImageEdit) {
      const count = selectedAdvancedReferenceImages("wan27-image-edit").length;
      els.advancedNote.textContent = count ? `Wan2.7 Image Edit ready. ${count} image(s) selected.` : "Wan2.7 Image Edit ready.";
    } else {
      els.advancedNote.textContent = t("advanced.referenceWan");
    }
  }
  updateAdvancedButtonCost();
}

function renderAdvancedCases() {
  if (!els.advancedCaseGrid) return;
  activeHoverPreviewStop?.();
  activeHoverPreviewStop = null;
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  state.activeAdvancedCaseTab = normalizeAdvancedCaseTab(state.activeAdvancedCaseTab);
  const activeTab = state.activeAdvancedCaseTab;
  const visibleCases = cases
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab) === activeTab);
  const pageSize = ADVANCED_CASE_PAGE_SIZE[activeTab] || 9;
  const totalPages = Math.max(1, Math.ceil(visibleCases.length / pageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Number(state.advancedCasePages?.[activeTab] || 1)));
  state.advancedCasePages = { ...state.advancedCasePages, [activeTab]: currentPage };
  const pageCases = visibleCases.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const tabs = `
    <div class="advanced-case-tabs" role="tablist" aria-label="${escapeHtml(t("advanced.cases"))}">
      ${ADVANCED_CASE_TABS.map((tab) => {
        const count = cases.filter((item) => normalizeAdvancedCaseTab(item.category || item.caseCategory || item.tab) === tab.id).length;
        return `<button class="advanced-case-tab ${tab.id === activeTab ? "is-active" : ""}" data-case-tab="${escapeHtml(tab.id)}" type="button" role="tab" aria-selected="${tab.id === activeTab ? "true" : "false"}">${escapeHtml(advancedCaseTabLabel(tab.id))}<span>${count}</span></button>`;
      }).join("")}
    </div>
  `;
  const caseMarkup = pageCases.length
    ? pageCases.map((entry) => (activeTab === "hot" ? renderAdvancedCaseCard(entry) : renderAdvancedCaseRow(entry))).join("")
    : `<div class="job-note advanced-case-empty">${escapeHtml(t("advanced.noCases"))}</div>`;
  els.advancedCaseGrid.classList.toggle("is-case-list", activeTab !== "hot");
  els.advancedCaseGrid.innerHTML = `${tabs}${caseMarkup}${renderAdvancedCasePager(activeTab, currentPage, totalPages)}`;
  els.advancedCaseGrid.querySelectorAll("[data-case-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeAdvancedCaseTab = normalizeAdvancedCaseTab(button.dataset.caseTab);
      state.advancedCasePages = { ...state.advancedCasePages, [state.activeAdvancedCaseTab]: state.advancedCasePages?.[state.activeAdvancedCaseTab] || 1 };
      renderAdvancedCases();
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-case-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.advancedCasePages = {
        ...state.advancedCasePages,
        [activeTab]: Math.min(totalPages, Math.max(1, Number(button.dataset.casePage || 1))),
      };
      renderAdvancedCases();
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-case-index]").forEach((card) => {
    if (!card.classList.contains("advanced-case-row")) {
      card.addEventListener("click", () => fillAdvancedCase(cases[Number(card.dataset.caseIndex || 0)]));
    }
    const isCaseRow = card.classList.contains("advanced-case-row");
    bindHoverPreviewCard({
      card,
      video: isCaseRow ? null : card.querySelector(".advanced-case-hover-video"),
      cover: isCaseRow ? null : card.querySelector(".advanced-case-cover"),
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-advanced-fill-prompt-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      fillAdvancedCasePrompt(advancedCaseById(button.dataset.advancedFillPromptId));
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-advanced-row-preview-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedRowPreview(button.dataset.advancedRowPreviewId, button.dataset.advancedRowPreviewKind || "output");
    });
  });
  els.advancedCaseGrid.querySelectorAll("[data-advanced-preview-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedPreview(button.dataset.advancedPreviewIndex);
    });
  });
  refreshIcons();
}

function fillAdvancedCase(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const provider = advancedCaseProvider(item);
  state.activeAdvancedCaseId = item.id || "";
  if (els.advancedProvider) els.advancedProvider.value = provider;
  if (els.advancedPrompt) els.advancedPrompt.value = item.prompt || params.prompt || "";
  if (els.advancedRatio) els.advancedRatio.value = params.ratio || params.aspect_ratio || item.ratio || "9:16";
  if (els.advancedResolution) els.advancedResolution.value = params.resolution || item.resolution || "720p";
  if (els.advancedDuration) els.advancedDuration.value = params.duration || item.duration || 5;
  if (els.advancedPreprocessReference) els.advancedPreprocessReference.value = "no";
  if (els.advancedWanSeed) els.advancedWanSeed.value = params.seed || "";
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedSeedanceLastFrameAssetId = "";
  state.advancedWanLastFrameAssetId = "";
  state.advancedWanClipAssetId = "";
  state.advancedAudioAssetId = "";
  if (els.advancedWanMediaMode) els.advancedWanMediaMode.value = normalizeWanMediaMode(params.mediaMode || item.mediaMode || "first_frame");
  if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = normalizeSeedanceMediaMode(params.seedanceMode || params.mediaMode || item.mediaMode || (provider === "seedance" ? "reference_images" : "text_to_video"));
  if (els.advancedWanAudioUrl) els.advancedWanAudioUrl.value = params.drivingAudioUrl || params.driving_audio_url || "";
  if (els.advancedWanClipUrl) els.advancedWanClipUrl.value = params.firstClipUrl || params.first_clip_url || "";
  if (els.advancedSeedanceVideoUrls) els.advancedSeedanceVideoUrls.value = [
    ...splitUrlList(params.referenceVideoUrls || params.referenceVideos || ""),
    ...arrayFrom(params.reference_videos).map((item) => (typeof item === "string" ? item : item?.url || item?.videoUrl || item?.video_url || item?.assetUri || "")).filter(Boolean),
  ].join(", ");
  if (els.advancedSeedanceAudioUrls) els.advancedSeedanceAudioUrls.value = [
    ...splitUrlList(params.referenceAudioUrls || params.referenceAudios || ""),
    ...arrayFrom(params.reference_audios).map((item) => (typeof item === "string" ? item : item?.url || item?.audioUrl || item?.audio_url || item?.assetUri || "")).filter(Boolean),
  ].join(", ");
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedNote) {
    els.advancedNote.textContent = t("advanced.loadedCase", {
      title: item.title || t("advanced.defaultCase"),
      cost: advancedCostLabel(advancedCaseDuration(item), provider, params.resolution, params.ratio || params.aspect_ratio),
    });
  }
}

async function requestAdvancedAccess() {
  if (!state.user) return openLogin();
  try {
    const payload = await requestJson("/api/advanced/request-access", { method: "POST" });
    if (payload.user) setUser(payload.user);
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.requestSubmitted");
  } catch (error) {
    if (els.advancedNote) els.advancedNote.textContent = error.message;
  }
}

async function submitAdvancedGenerate() {
  if (!state.user) return openLogin();
  const prompt = els.advancedPrompt?.value.trim() || "";
  if (!prompt) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.promptRequired");
    return;
  }
  const currentCase = state.advancedCases.find((item) => item.id === state.activeAdvancedCaseId);
  if (currentCase?.prompt && currentCase.prompt !== prompt) state.activeAdvancedCaseId = "";
  els.advancedSubmitBtn.disabled = true;
  const provider = currentAdvancedProvider();
  const seedanceTier = currentSeedanceTier();
  if (provider === "wan27-image-edit") {
    try {
      const assets = await ensureAdvancedImageEditAssets();
      if (els.advancedNote) {
        els.advancedNote.textContent = t("advanced.submitting", {
          note: "Wan2.7 Image Edit",
          cost: advancedCostLabel(1, provider, currentAdvancedResolution(), currentAdvancedRatio()),
        });
      }
      const payload = await requestJson("/api/wan27/image-edit", {
        method: "POST",
        body: {
          prompt,
          imageAssetIds: assets.map((asset) => asset.id),
          ratio: currentAdvancedRatio(),
          resolution: currentAdvancedResolution(),
        },
      });
      if (payload.user) setUser(payload.user);
      if (payload.record) {
        state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
      }
      if (els.advancedNote) {
        els.advancedNote.textContent = t("advanced.jobSubmitted", {
          taskId: payload.taskId || payload.record?.taskId || "",
          credits: formatCredits(payload.cost ?? assetImageModifyCostCredits()),
        });
      }
      setTab("history");
      await loadHistory({ silent: true }).catch(() => {});
    } catch (error) {
      if (els.advancedNote) els.advancedNote.textContent = error.message;
    } finally {
      els.advancedSubmitBtn.disabled = false;
      updateAdvancedButtonCost();
    }
    return;
  }
  const bounds = advancedDurationBounds(provider);
  const duration = Math.min(bounds.max, Math.max(bounds.min, Number(els.advancedDuration?.value || bounds.fallback)));
  const resolution = currentAdvancedResolution();
  const preprocessReference = false;
  const mediaMode = normalizeWanMediaMode(els.advancedWanMediaMode?.value || "first_frame");
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
  const referenceImages = selectedAdvancedReferenceImages();
  const seedanceVideoUrls = splitUrlList(els.advancedSeedanceVideoUrls?.value || "");
  const seedanceAudioUrls = splitUrlList(els.advancedSeedanceAudioUrls?.value || "");
  const inputVideoSeconds = provider === "seedance" ? currentSeedanceVideoInputSeconds(duration, provider) : 0;
  if (provider === "seedance" && seedanceModeNeedsFirstFrame(seedanceMode) && !referenceImages.length) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceFirstRequired");
    return;
  }
  if (provider === "seedance" && seedanceModeNeedsLastFrame(seedanceMode) && !state.advancedSeedanceLastFrameDataUrl && !state.advancedSeedanceLastFrameAssetId) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceLastRequired");
    return;
  }
  if (provider === "seedance" && seedanceModeNeedsReferenceImages(seedanceMode) && !referenceImages.length) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceReferenceHint");
    return;
  }
  if (provider === "seedance" && seedanceModeNeedsReferenceVideo(seedanceMode) && !state.advancedSeedanceVideoAssetId && !seedanceVideoUrls.length) {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.seedanceVideoRequired");
    return;
  }
  if (provider === "seedance" && seedanceTier === "fast" && resolution === "1080p") {
    els.advancedSubmitBtn.disabled = false;
    if (els.advancedNote) els.advancedNote.textContent = "Seedance Fast does not support 1080p.";
    return;
  }
  if (provider === "wan27") {
    if (wanModeNeedsFirstFrame(mediaMode) && !state.advancedUploadDataUrl && !state.advancedFirstFrameAssetId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "First frame image is required.";
      return;
    }
    if (wanModeNeedsLastFrame(mediaMode) && !state.advancedWanLastFrameDataUrl && !state.advancedWanLastFrameAssetId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Last frame image is required.";
      return;
    }
    if (wanModeNeedsAudio(mediaMode) && !String(els.advancedWanAudioUrl?.value || "").trim() && !state.advancedAudioAssetId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = "Driving audio URL is required.";
      return;
    }
    if (wanModeNeedsClip(mediaMode) && !state.advancedWanClipDataUrl && !String(els.advancedWanClipUrl?.value || "").trim() && !state.advancedWanClipAssetId) {
      els.advancedSubmitBtn.disabled = false;
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipRequired");
      return;
    }
  }
  const referenceNote = state.advancedUploadDataUrl
    ? provider === "seedance"
      ? (preprocessReference ? t("advanced.notePrepare") : t("advanced.noteOriginal"))
      : t("advanced.noteWan")
    : "";
  if (els.advancedNote) {
    els.advancedNote.textContent = t("advanced.submitting", {
      note: provider === "seedance" ? `${referenceNote} - ${t("advanced.seedanceReferenceCount", { count: referenceImages.length })}` : referenceNote,
      cost: advancedCostLabel(duration, provider, resolution, currentAdvancedRatio(), { inputVideoSeconds, seedanceTier }),
    });
  }
  try {
    const payload = await requestJson("/api/advanced/generate", {
      method: "POST",
      body: {
        caseId: state.activeAdvancedCaseId,
        provider,
        seedanceTier: provider === "seedance" ? seedanceTier : undefined,
        prompt,
        dataUrl: provider === "wan27" && !state.advancedFirstFrameAssetId ? state.advancedUploadDataUrl : undefined,
        seedanceMode: provider === "seedance" ? seedanceMode : undefined,
        imageAssetId: provider === "seedance" && seedanceModeNeedsFirstFrame(seedanceMode) ? (state.advancedFirstFrameAssetId || "") : undefined,
        firstFrameAssetId: provider === "wan27" || (provider === "seedance" && seedanceModeNeedsFirstFrame(seedanceMode)) ? (state.advancedFirstFrameAssetId || "") : undefined,
        firstFrameDataUrl: (provider === "wan27" || (provider === "seedance" && seedanceModeNeedsFirstFrame(seedanceMode))) && !state.advancedFirstFrameAssetId ? state.advancedUploadDataUrl : undefined,
        endImageAssetId: provider === "seedance" && seedanceModeNeedsLastFrame(seedanceMode) ? (state.advancedSeedanceLastFrameAssetId || "") : undefined,
        lastFrameAssetId: provider === "wan27" ? (state.advancedWanLastFrameAssetId || "") : provider === "seedance" && seedanceModeNeedsLastFrame(seedanceMode) ? (state.advancedSeedanceLastFrameAssetId || "") : "",
        endImageDataUrl: provider === "seedance" && seedanceModeNeedsLastFrame(seedanceMode) && !state.advancedSeedanceLastFrameAssetId ? state.advancedSeedanceLastFrameDataUrl : undefined,
        referenceImages: provider === "seedance" && !seedanceModeNeedsFirstFrame(seedanceMode) ? referenceImages.map(seedanceImageRefPayload) : undefined,
        referenceVideoAssetId: provider === "seedance" ? (state.advancedSeedanceVideoAssetId || "") : undefined,
        referenceAudioAssetId: provider === "seedance" ? (state.advancedAudioAssetId || "") : undefined,
        referenceVideoUrls: provider === "seedance" ? seedanceVideoUrls : undefined,
        inputVideoSeconds: provider === "seedance" ? inputVideoSeconds : undefined,
        referenceVideoDurationSeconds: provider === "seedance" ? inputVideoSeconds : undefined,
        referenceAudioUrls: provider === "seedance" ? seedanceAudioUrls : undefined,
        lastFrameDataUrl: !state.advancedWanLastFrameAssetId ? state.advancedWanLastFrameDataUrl : "",
        drivingAudioUrl: els.advancedWanAudioUrl?.value.trim() || "",
        drivingAudioAssetId: provider === "wan27" ? (state.advancedAudioAssetId || "") : undefined,
        firstClipDataUrl: selectedWanClipData(mediaMode),
        firstClipFileName: selectedWanClipFileName(mediaMode),
        firstClipAssetId: provider === "wan27" ? (state.advancedWanClipAssetId || "") : undefined,
        firstClipUrl: selectedWanClipUrl(mediaMode),
        mediaMode,
        fileName: referenceImages[0]?.fileName || els.advancedImage?.files?.[0]?.name || "",
        lastFrameFileName: els.advancedWanLastFrame?.files?.[0]?.name || "",
        ratio: els.advancedRatio?.value || "9:16",
        resolution: els.advancedResolution?.value || "720p",
        duration,
        preprocessReference,
        seed: els.advancedWanSeed?.value || "",
      },
    });
    if (payload.user) setUser(payload.user);
    const charged = payload.cost ?? advancedCostForDuration(duration, provider, resolution, currentAdvancedRatio(), { inputVideoSeconds, seedanceTier });
    if (els.advancedNote) {
      els.advancedNote.textContent = t("advanced.jobSubmitted", {
        taskId: payload.taskId || payload.task?.taskId || "",
        credits: formatCredits(charged),
      });
    }
    setTab("history");
    scheduleHistoryRefresh({ delayMs: 8000, force: true });
  } catch (error) {
    if (els.advancedNote) els.advancedNote.textContent = error.message;
  } finally {
    els.advancedSubmitBtn.disabled = false;
    updateAdvancedButtonCost();
  }
}

function openTemplate(templateId) {
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) return;
  if (template.action === "advanced" || template.targetTab === "advanced") {
    setTab("advanced");
    if (template.advancedCaseId) {
      const matched = state.advancedCases.find((item) => item.id === template.advancedCaseId);
      if (matched) fillAdvancedCase(matched);
    }
    return;
  }
  state.activeTemplate = template;
  state.uploadDataUrl = "";
  els.modalType.textContent = template.type === "image-to-video" ? t("modal.imageToVideo") : t("modal.textToVideo");
  els.modalTitle.textContent = template.title;
  els.templatePrompt.value = template.prompt || "";
  els.jobNote.textContent = t("modal.promptNote");
  els.uploadBox.hidden = template.type !== "image-to-video";
  els.uploadBox.classList.remove("has-image");
  els.uploadPreview.removeAttribute("src");
  els.templateImage.value = "";
  updateSubmitButtonCost();
  els.templateDialog.showModal();
  refreshIcons();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t("modal.readImageFailed")));
    reader.readAsDataURL(file);
  });
}

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(t("modal.readImageFailed")));
    };
    video.src = url;
  });
}

function isVideoAsset(asset = {}) {
  return asset.kind === "video" || String(asset.mime || "").toLowerCase().startsWith("video/");
}

function isImageAsset(asset = {}) {
  return asset.kind === "image" || String(asset.mime || "").toLowerCase().startsWith("image/");
}

function isAudioAsset(asset = {}) {
  return asset.kind === "audio" || String(asset.mime || "").toLowerCase().startsWith("audio/");
}

function assetPreviewUrl(asset = {}) {
  return asset.previewUrl || asset.localUrl || asset.publicUrl || "";
}

function advancedSeedanceImageRefsFromState() {
  return selectedAdvancedReferenceImages("seedance").filter((item) => item && (item.dataUrl || item.assetId));
}

function seedanceImageRefPayload(item = {}) {
  if (item.assetId) return { assetId: item.assetId, dataUrl: "", url: "", fileName: item.fileName || "", name: item.name || "" };
  if (item.url || item.imageUrl) return { url: item.url || item.imageUrl, dataUrl: "", fileName: item.fileName || "", name: item.name || "" };
  return { dataUrl: item.dataUrl || "", url: "", fileName: item.fileName || "", name: item.name || "" };
}

function splitUrlList(value = "") {
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayFrom(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function imageAssetOptions(selectedId = "") {
  const images = (state.assetImageChoices?.length ? state.assetImageChoices : state.userAssets || []).filter(isImageAsset);
  return images.length
    ? images.map((asset) => `<option value="${escapeHtml(asset.id)}" ${asset.id === selectedId ? "selected" : ""}>${escapeHtml(asset.name || asset.id)}</option>`).join("")
    : `<option value="">${escapeHtml(t("assets.noImageAssets"))}</option>`;
}

async function ensureAssetImageChoices() {
  if (!state.user) return [];
  const payload = await requestJson("/api/user-assets?type=image&page=1&limit=50");
  state.assetImageChoices = payload.assets || [];
  return state.assetImageChoices;
}

async function ensureAssetAudioChoices() {
  if (!state.user) return [];
  const payload = await requestJson("/api/user-assets?type=audio&page=1&limit=50");
  state.assetAudioChoices = payload.assets || [];
  return state.assetAudioChoices;
}

function assetGenerateDialogBody({ mode = "extend", imageAssetId = "" } = {}) {
  const isReplace = mode === "replace";
  const prompt = isReplace ? "Replace the lady in [Video 1] with the lady in [Image 1]" : "Extend [Image 1]";
  return `
    <div class="asset-generate-form">
      ${isReplace ? `
        <div class="asset-replace-source">
          <span>${escapeHtml(t("assets.imageSource"))}</span>
          <div class="asset-source-toggle" role="radiogroup" aria-label="${escapeHtml(t("assets.imageSource"))}">
            <label><input type="radio" name="assetReplaceImageSource" value="asset" checked />${escapeHtml(t("assets.sourceAssets"))}</label>
            <label><input type="radio" name="assetReplaceImageSource" value="upload" />${escapeHtml(t("assets.sourceUpload"))}</label>
          </div>
        </div>
        <label class="field asset-replace-asset-field" data-replace-source-field="asset"><span>${escapeHtml(t("assets.pickAssetImage"))}</span><select id="assetGenerateImageAsset">${imageAssetOptions(imageAssetId)}</select></label>
        <label class="field file-picker-field asset-replace-upload-field" data-replace-source-field="upload" hidden>
          <span>${escapeHtml(t("assets.uploadReplaceImage"))}</span>
          <span class="file-picker-control">
            <input id="assetGenerateImageUpload" type="file" accept="image/*" />
            <span class="file-picker-button"><i data-lucide="image-up"></i>${escapeHtml(t("file.chooseImage"))}</span>
            <span class="file-picker-name" data-file-name-for="assetGenerateImageUpload">${escapeHtml(t("file.none"))}</span>
          </span>
        </label>
        <p class="job-note asset-source-note">${escapeHtml(t("assets.uploadOverridesAsset"))}</p>
      ` : ""}
      <label class="field"><span>${escapeHtml(t("field.prompt"))}</span><textarea id="assetGeneratePrompt" rows="4">${escapeHtml(prompt)}</textarea></label>
      <div class="asset-generate-grid">
        <label class="field"><span>${escapeHtml(t("field.duration"))}</span><input id="assetGenerateDuration" type="number" min="4" max="15" value="5" /></label>
        <label class="field"><span>${escapeHtml(t("field.resolution"))}</span><select id="assetGenerateResolution"><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
      </div>
      <p class="job-note" id="assetGenerateCost"></p>
      <p class="job-note" id="assetGenerateStatus"></p>
    </div>
  `;
}

function assetVideoExtendDialogBody() {
  return `
    <div class="asset-generate-form">
      <label class="field"><span>${escapeHtml(t("field.prompt"))}</span><textarea id="assetGeneratePrompt" rows="4">${escapeHtml("Extend [Video 1] smoothly with the same subject, scene, motion, lighting and cinematic style.")}</textarea></label>
      <div class="asset-generate-grid">
        <label class="field"><span>${escapeHtml(t("field.duration"))}</span><input id="assetGenerateDuration" type="number" min="4" max="15" value="5" /></label>
        <label class="field"><span>${escapeHtml(t("field.resolution"))}</span><select id="assetGenerateResolution"><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
      </div>
      <p class="job-note" id="assetGenerateCost"></p>
      <p class="job-note" id="assetGenerateStatus"></p>
    </div>
  `;
}

function bindAssetGenerateCost(root, options = {}) {
  const durationInput = root.querySelector("#assetGenerateDuration");
  const resolutionInput = root.querySelector("#assetGenerateResolution");
  const cost = root.querySelector("#assetGenerateCost");
  const syncReplaceSource = () => {
    const source = root.querySelector("input[name='assetReplaceImageSource']:checked")?.value || "asset";
    root.querySelectorAll("[data-replace-source-field]").forEach((field) => {
      field.hidden = field.dataset.replaceSourceField !== source;
    });
  };
  root.querySelectorAll("input[name='assetReplaceImageSource']").forEach((input) => {
    input.addEventListener("change", syncReplaceSource);
  });
  syncReplaceSource();
  root.querySelectorAll("input[type='file']").forEach((input) => {
    updateFilePickerLabel(input);
    input.addEventListener("change", () => updateFilePickerLabel(input));
  });
  const update = () => {
    const duration = Number(durationInput?.value || 5);
    const resolution = resolutionInput?.value || "720p";
    const inputVideoSeconds = typeof options.inputVideoSeconds === "function"
      ? positiveDurationSeconds(options.inputVideoSeconds(duration, resolution), 0)
      : positiveDurationSeconds(options.inputVideoSeconds, 0);
    const label = advancedCostLabel(duration, "seedance", resolution, "16:9", { inputVideoSeconds });
    if (cost) cost.textContent = label;
    if (els.inlineDialogConfirm) {
      els.inlineDialogConfirm.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost: label }))}`;
      refreshIcons();
    }
  };
  durationInput?.addEventListener("input", update);
  resolutionInput?.addEventListener("change", update);
  update();
}

async function readOptionalImageUpload(root) {
  const file = root.querySelector("#assetGenerateImageUpload")?.files?.[0];
  if (!file) return null;
  if (file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES) throw new Error(t("advanced.referenceImageTooLarge"));
  return { dataUrl: await readFileAsDataUrl(file), fileName: file.name || "", name: file.name || "" };
}

async function selectedReplaceImageReference(root) {
  const source = root.querySelector("input[name='assetReplaceImageSource']:checked")?.value || "asset";
  if (source === "upload") {
    const uploadRef = await readOptionalImageUpload(root);
    if (!uploadRef) throw new Error(t("assets.selectImageRequired"));
    return uploadRef;
  }
  const selectedImageAssetId = root.querySelector("#assetGenerateImageAsset")?.value || "";
  if (!selectedImageAssetId) throw new Error(t("assets.selectImageRequired"));
  return { assetId: selectedImageAssetId };
}

function assetModifyDialogBody(asset = {}) {
  const options = state.config?.assetImageModify || {};
  const ratios = Array.isArray(options.ratios) && options.ratios.length ? options.ratios : ["1:1", "3:4", "4:3", "9:16", "16:9"];
  const defaultRatio = options.defaultRatio || "9:16";
  const resolutions = Array.isArray(options.resolutions) && options.resolutions.length ? options.resolutions : ["1K", "2K"];
  const defaultResolution = options.defaultResolution || "2K";
  return `
    <div class="asset-generate-form asset-modify-form">
      <div class="asset-modify-preview">
        <img src="${escapeHtml(assetPreviewUrl(asset))}" alt="${escapeHtml(asset.name || "")}" />
      </div>
      <label class="field"><span>${escapeHtml(t("field.prompt"))}</span><textarea id="assetModifyPrompt" rows="4" placeholder="${escapeHtml(t("assets.modifyPromptPlaceholder"))}"></textarea></label>
      <label class="field"><span>${escapeHtml(t("field.ratio"))}</span><select id="assetModifyRatio">${ratios.map((ratio) => `<option value="${escapeHtml(ratio)}" ${ratio === defaultRatio ? "selected" : ""}>${escapeHtml(ratio)}</option>`).join("")}</select></label>
      <label class="field"><span>${escapeHtml(t("field.resolution"))}</span><select id="assetModifyResolution">${resolutions.map((resolution) => `<option value="${escapeHtml(resolution)}" ${resolution === defaultResolution ? "selected" : ""}>${escapeHtml(resolution)}</option>`).join("")}</select></label>
      <p class="job-note">${escapeHtml(t("assets.modifyHint"))}</p>
      <p class="job-note" id="assetModifyCost"></p>
      <p class="job-note" id="assetModifyStatus"></p>
    </div>
  `;
}

function bindAssetModifyCost(root) {
  const cost = root.querySelector("#assetModifyCost");
  const update = () => {
    const label = assetImageModifyCostLabel();
    if (cost) cost.textContent = label;
    if (els.inlineDialogConfirm) {
      els.inlineDialogConfirm.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(t("template.generate", { cost: label }))}`;
      refreshIcons();
    }
  };
  root.querySelector("#assetModifyRatio")?.addEventListener("change", update);
  root.querySelector("#assetModifyResolution")?.addEventListener("change", update);
  update();
}

async function openAssetModifyDialog(asset = {}) {
  if (!asset?.id || !isImageAsset(asset)) return;
  if (!state.user) return openLogin();
  let shouldRefreshHistory = false;
  const result = await showInlineDialog({
    title: t("assets.modifyTitle"),
    body: assetModifyDialogBody(asset),
    confirmText: t("common.generate"),
    dialogClass: "is-media-action",
    onOpen: bindAssetModifyCost,
    onConfirm: async (root) => {
      const prompt = root.querySelector("#assetModifyPrompt")?.value.trim() || "";
      if (!prompt) throw new Error(t("advanced.promptRequired"));
      const status = root.querySelector("#assetModifyStatus");
      if (status) status.textContent = t("assets.generating");
      let payload;
      try {
        payload = await requestJson(`/api/user-assets/${encodeURIComponent(asset.id)}/modify`, {
          method: "POST",
          body: {
            prompt,
            ratio: root.querySelector("#assetModifyRatio")?.value || "9:16",
            resolution: root.querySelector("#assetModifyResolution")?.value || "2K",
          },
        });
      } catch (error) {
        shouldRefreshHistory = true;
        window.setTimeout(() => loadHistory({ silent: true }), 300);
        throw error;
      }
      shouldRefreshHistory = true;
      if (payload.user) setUser(payload.user);
      if (payload.record) {
        state.historyRecords = [payload.record, ...(state.historyRecords || []).filter((record) => record.taskId !== payload.record.taskId)];
      }
      if (status) status.textContent = t("assets.modified");
    },
  });
  if (result === "confirm") {
    await loadHistory({ silent: true });
  } else if (shouldRefreshHistory) {
    await loadHistory({ silent: true });
  }
}

async function openAssetExtendDialog(asset = {}) {
  if (!asset?.id) return;
  if (!state.user) return openLogin();
  if (isVideoAsset(asset)) return openAssetVideoExtendDialog(asset);
  const result = await showInlineDialog({
    title: t("assets.extendTitle"),
    body: assetGenerateDialogBody({ mode: "extend" }),
    confirmText: t("common.generate"),
    onOpen: bindAssetGenerateCost,
    onConfirm: async (root) => {
      const duration = Number(root.querySelector("#assetGenerateDuration")?.value || 5);
      const resolution = root.querySelector("#assetGenerateResolution")?.value || "720p";
      const prompt = root.querySelector("#assetGeneratePrompt")?.value.trim() || "Extend [Image 1]";
      root.querySelector("#assetGenerateStatus").textContent = t("assets.generating");
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          provider: "seedance",
          prompt,
          referenceImages: [{ assetId: asset.id, name: asset.name || "" }],
          ratio: "16:9",
          resolution,
          duration,
        },
      });
      if (payload.user) setUser(payload.user);
      root.querySelector("#assetGenerateStatus").textContent = t("assets.generated", { taskId: payload.taskId || payload.task?.taskId || "" });
    },
  });
  if (result === "confirm") {
    setTab("history");
    scheduleHistoryRefresh({ delayMs: 8000, force: true });
  }
}

async function openAssetVideoExtendDialog(videoAsset = {}) {
  if (!videoAsset?.id) return;
  if (!state.user) return openLogin();
  const inputSecondsForAsset = (duration) => positiveDurationSeconds(videoAsset.durationSeconds || videoAsset.duration, duration || 5);
  const result = await showInlineDialog({
    title: t("assets.extendTitle"),
    body: assetVideoExtendDialogBody(),
    confirmText: t("common.generate"),
    onOpen: (root) => bindAssetGenerateCost(root, { inputVideoSeconds: inputSecondsForAsset }),
    onConfirm: async (root) => {
      const duration = Number(root.querySelector("#assetGenerateDuration")?.value || 5);
      const resolution = root.querySelector("#assetGenerateResolution")?.value || "720p";
      const inputVideoSeconds = inputSecondsForAsset(duration);
      const prompt = root.querySelector("#assetGeneratePrompt")?.value.trim() || "Extend [Video 1] smoothly.";
      root.querySelector("#assetGenerateStatus").textContent = t("assets.generating");
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          provider: "seedance",
          prompt,
          referenceVideoAssetId: videoAsset.id,
          inputVideoSeconds,
          referenceVideoDurationSeconds: inputVideoSeconds,
          ratio: "16:9",
          resolution,
          duration,
        },
      });
      if (payload.user) setUser(payload.user);
      root.querySelector("#assetGenerateStatus").textContent = t("assets.generated", { taskId: payload.taskId || payload.task?.taskId || "" });
    },
  });
  if (result === "confirm") {
    setTab("history");
    scheduleHistoryRefresh({ delayMs: 8000, force: true });
  }
}

async function openAssetReplaceDialog(videoAsset = {}) {
  if (!videoAsset?.id) return;
  if (!state.user) return openLogin();
  const inputSecondsForAsset = (duration) => positiveDurationSeconds(videoAsset.durationSeconds || videoAsset.duration, duration || 5);
  const choices = await ensureAssetImageChoices().catch(() => (state.userAssets || []).filter(isImageAsset));
  const firstImage = choices.find(isImageAsset);
  const result = await showInlineDialog({
    title: t("assets.replaceTitle"),
    body: assetGenerateDialogBody({ mode: "replace", imageAssetId: firstImage?.id || "" }),
    confirmText: t("common.generate"),
    dialogClass: "is-media-action",
    onOpen: (root) => bindAssetGenerateCost(root, { inputVideoSeconds: inputSecondsForAsset }),
    onConfirm: async (root) => {
      const duration = Number(root.querySelector("#assetGenerateDuration")?.value || 5);
      const resolution = root.querySelector("#assetGenerateResolution")?.value || "720p";
      const inputVideoSeconds = inputSecondsForAsset(duration);
      const prompt = root.querySelector("#assetGeneratePrompt")?.value.trim() || "Replace the lady in [Video 1] with the lady in [Image 1]";
      const imageReference = await selectedReplaceImageReference(root);
      root.querySelector("#assetGenerateStatus").textContent = t("assets.generating");
      const payload = await requestJson("/api/advanced/generate", {
        method: "POST",
        body: {
          provider: "seedance",
          prompt,
          referenceVideoAssetId: videoAsset.id,
          referenceImages: [imageReference],
          inputVideoSeconds,
          referenceVideoDurationSeconds: inputVideoSeconds,
          ratio: "16:9",
          resolution,
          duration,
        },
      });
      if (payload.user) setUser(payload.user);
      root.querySelector("#assetGenerateStatus").textContent = t("assets.generated", { taskId: payload.taskId || payload.task?.taskId || "" });
    },
  });
  if (result === "confirm") {
    setTab("history");
    scheduleHistoryRefresh({ delayMs: 8000, force: true });
  }
}

function captureFrameFromVideo(video) {
  if (!video || !video.videoWidth || !video.videoHeight) throw new Error("Video frame is not ready.");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function openAssetFrameDialog(asset = {}) {
  const url = assetPreviewUrl(asset);
  if (!url) return;
  await showInlineDialog({
    title: t("assets.frameTitle"),
    dialogClass: "is-media-action is-frame-action",
    body: `
      <div class="asset-frame-form">
        <video id="assetFrameVideo" src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>
        <p class="job-note">${escapeHtml(t("assets.frameHint"))}</p>
        <p class="job-note" id="assetFrameStatus"></p>
      </div>
    `,
    confirmText: t("assets.selectFrame"),
    onOpen: (root) => {
      const video = root.querySelector("#assetFrameVideo");
      const syncRatio = () => {
        if (!video?.videoWidth || !video.videoHeight) return;
        const ratio = video.videoWidth / video.videoHeight;
        video.style.setProperty("--asset-frame-ratio", `${video.videoWidth} / ${video.videoHeight}`);
        video.style.setProperty("--asset-frame-ratio-value", String(ratio));
      };
      video?.addEventListener("loadedmetadata", syncRatio);
      if (video?.readyState >= 1) syncRatio();
    },
    onConfirm: async (root) => {
      const video = root.querySelector("#assetFrameVideo");
      const dataUrl = captureFrameFromVideo(video);
      root.querySelector("#assetFrameStatus").textContent = t("assets.uploading");
      await requestJson("/api/user-assets", {
        method: "POST",
        body: { dataUrl, name: `${asset.name || "video"} frame`, fileName: `${asset.id || "frame"}.jpg` },
      });
      root.querySelector("#assetFrameStatus").textContent = t("assets.frameSaved");
      await loadUserAssets(state.userAssetsPage || 1);
    },
  });
}

function useAssetInAdvanced(asset = {}, action = "use") {
  if (!asset) return;
  if (!state.user) return openLogin();
  if (els.advancedProvider) els.advancedProvider.value = action === "modify" ? "wan27-image-edit" : "seedance";
  state.activeAdvancedCaseId = "";
  if (isImageAsset(asset)) {
    if (action === "modify") {
      state.advancedSourceImageAssetId = asset.id;
      state.advancedFirstFrameAssetId = "";
    } else {
      state.advancedFirstFrameAssetId = asset.id;
      state.advancedSourceImageAssetId = "";
    }
    if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = action === "extend" ? "first_frame" : "reference_images";
    const ref = {
      assetId: asset.id,
      dataUrl: assetPreviewUrl(asset),
      fileName: asset.name || "",
      name: asset.name || "",
      fromLibrary: true,
    };
    const existing = action === "replace" || action === "modify" ? advancedSeedanceImageRefsFromState().filter((item) => item.assetId !== asset.id) : [];
    state.advancedReferenceImages = dedupeAdvancedReferenceImages([...existing, ref]).slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
    state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
    state.advancedSeedanceVideoAssetId = "";
    state.advancedSeedanceVideoPreviewUrl = "";
    if (action === "extend" && els.advancedPrompt) els.advancedPrompt.value = "Extend [Image 1]";
    if (action === "replace" && els.advancedPrompt) els.advancedPrompt.value = "Replace the lady in [Video 1] with the lady in [Image 1]";
    if (action === "modify" && els.advancedPrompt) els.advancedPrompt.value = "";
  }
  if (isVideoAsset(asset)) {
    if (els.advancedSeedanceMediaMode) els.advancedSeedanceMediaMode.value = "reference_video";
    state.advancedSeedanceVideoAssetId = asset.id;
    state.advancedSeedanceVideoPreviewUrl = assetPreviewUrl(asset);
    state.advancedReferenceImages = [];
    state.advancedUploadDataUrl = "";
    if (els.advancedPrompt) els.advancedPrompt.value = "Replace the lady in [Video 1] with the lady in [Image 1]";
  }
  setTab("advanced");
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedNote) {
    els.advancedNote.textContent = action === "extend"
      ? t("assets.extended")
      : action === "replace"
        ? t("assets.replaced")
        : action === "modify"
          ? t("assets.modify")
          : t("assets.used");
  }
}

function selectedWanClipData(mediaMode = "first_frame") {
  return wanModeNeedsClip(mediaMode) && !state.advancedWanClipAssetId ? state.advancedWanClipDataUrl : "";
}

function selectedWanClipFileName(mediaMode = "first_frame") {
  return wanModeNeedsClip(mediaMode) && !state.advancedWanClipAssetId ? state.advancedWanClipFileName : "";
}

function selectedWanClipUrl(mediaMode = "first_frame") {
  return wanModeNeedsClip(mediaMode) && !state.advancedWanClipAssetId ? (els.advancedWanClipUrl?.value.trim() || "") : "";
}

function selectedAdvancedReferenceImages(provider = currentAdvancedProvider()) {
  const images = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
  const normalizedProvider = normalizeAdvancedProvider(provider);
  if (normalizedProvider === "wan27-image-edit") return images.slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
  if (normalizedProvider !== "seedance") return images.slice(0, 1);
  const mode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
  if (seedanceModeNeedsFirstFrame(mode)) return images.slice(0, 1);
  return images;
}

function dedupeAdvancedReferenceImages(images = []) {
  const seen = new Set();
  return images.filter((item) => {
    const key = item?.assetId ? `asset:${item.assetId}` : `${item?.fileName || ""}::${item?.dataUrl || ""}`;
    if ((!item?.dataUrl && !item?.assetId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removeAdvancedReferenceImage(index = -1) {
  const images = Array.isArray(state.advancedReferenceImages) ? [...state.advancedReferenceImages] : [];
  if (index < 0 || index >= images.length) return;
  images.splice(index, 1);
  const provider = currentAdvancedProvider();
  state.advancedReferenceImages = images;
  state.advancedUploadDataUrl = images[0]?.dataUrl || "";
  if (provider === "wan27-image-edit") {
    state.advancedFirstFrameAssetId = "";
    state.advancedSourceImageAssetId = images[0]?.assetId || "";
  } else {
    state.advancedFirstFrameAssetId = images[0]?.assetId || "";
    state.advancedSourceImageAssetId = "";
  }
  if (!images.length && els.advancedImage) els.advancedImage.value = "";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function removeAdvancedSeedanceVideoReference() {
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  if (els.advancedSeedanceVideoUrls) els.advancedSeedanceVideoUrls.value = "";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function removeAdvancedMediaSlot(slot = "") {
  if (slot === "seedanceLastFrame") {
    state.advancedSeedanceLastFrameAssetId = "";
    state.advancedSeedanceLastFrameDataUrl = "";
    if (els.advancedSeedanceLastFrame) els.advancedSeedanceLastFrame.value = "";
    els.advancedSeedanceLastFramePreview?.removeAttribute("src");
    els.advancedSeedanceLastFramePreview?.classList.remove("is-visible");
    els.advancedSeedanceLastFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
  } else if (slot === "wanLastFrame") {
    state.advancedWanLastFrameAssetId = "";
    state.advancedWanLastFrameDataUrl = "";
    if (els.advancedWanLastFrame) els.advancedWanLastFrame.value = "";
    els.advancedWanLastFramePreview?.removeAttribute("src");
    els.advancedWanLastFramePreview?.classList.remove("is-visible");
    els.advancedWanLastFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
  } else if (slot === "wanClip") {
    state.advancedWanClipAssetId = "";
    state.advancedWanClipDataUrl = "";
    state.advancedWanClipFileName = "";
    if (els.advancedWanClipFile) els.advancedWanClipFile.value = "";
    if (els.advancedWanClipUrl) els.advancedWanClipUrl.value = "";
    els.advancedWanClipPreview?.removeAttribute("src");
    els.advancedWanClipPreview?.classList.remove("is-visible");
    els.advancedWanClipFile?.closest(".wan-frame-upload")?.classList.remove("has-image");
  }
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function renderAdvancedReferencePreviews() {
  if (!els.advancedUploadPreview) return;
  const provider = currentAdvancedProvider();
  const images = selectedAdvancedReferenceImages();
  els.advancedUploadPreview.innerHTML = images.map((item, index) => `
    <figure>
      <button class="advanced-preview-remove" type="button" data-remove-advanced-ref="${index}" aria-label="${escapeHtml(t("common.remove", {}, "Remove"))}">&times;</button>
      <img src="${escapeHtml(item.dataUrl || item.previewUrl || "")}" alt="" />
      <figcaption>${escapeHtml(provider === "wan27" ? t("advanced.firstFrame") : provider === "wan27-image-edit" ? `Image ${index + 1}` : tenantFeature("assetLibrary", true) ? `Image ${index + 1}` : `${index + 1}`)}</figcaption>
    </figure>
  `).join("");
  els.advancedUploadPreview.querySelectorAll("[data-remove-advanced-ref]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAdvancedReferenceImage(Number(button.dataset.removeAdvancedRef));
    });
  });
  els.advancedUploadBox?.classList.toggle("has-image", images.length > 0);
  if (els.advancedWanFirstFramePreview) {
    const firstFrame = images[0]?.dataUrl || state.advancedUploadDataUrl || "";
    if ((provider === "wan27" || provider === "wan27-image-edit") && firstFrame) {
      els.advancedWanFirstFramePreview.src = firstFrame;
      els.advancedWanFirstFramePreview.classList.add("is-visible");
    } else {
      els.advancedWanFirstFramePreview.removeAttribute("src");
      els.advancedWanFirstFramePreview.classList.remove("is-visible");
    }
  }
  const videoPreview = state.advancedSeedanceVideoPreviewUrl || "";
  if (provider === "seedance" && videoPreview) {
    els.advancedUploadPreview.insertAdjacentHTML("afterbegin", `
      <figure>
        <button class="advanced-preview-remove" type="button" data-remove-seedance-video aria-label="${escapeHtml(t("common.remove", {}, "Remove"))}">&times;</button>
        <video src="${escapeHtml(videoPreview)}" muted playsinline preload="metadata"></video>
        <figcaption>Video 1</figcaption>
      </figure>
    `);
    els.advancedUploadPreview.querySelector("[data-remove-seedance-video]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAdvancedSeedanceVideoReference();
    });
    els.advancedUploadBox?.classList.add("has-image");
  }
  if (els.advancedSeedanceLastFramePreview) {
    if (provider === "seedance" && state.advancedSeedanceLastFrameDataUrl) {
      els.advancedSeedanceLastFramePreview.src = state.advancedSeedanceLastFrameDataUrl;
      els.advancedSeedanceLastFramePreview.classList.add("is-visible");
    } else {
      els.advancedSeedanceLastFramePreview.removeAttribute("src");
      els.advancedSeedanceLastFramePreview.classList.remove("is-visible");
    }
  }
}

function updateAdvancedReferenceSummary() {
  if (!els.advancedReferenceSummary) return;
  const provider = currentAdvancedProvider();
  const count = selectedAdvancedReferenceImages().length;
  if (provider === "wan27-image-edit") {
    els.advancedReferenceSummary.textContent = count ? `${count} source image(s) selected. Wan2.7 accepts 0-9 images in order.` : "Wan2.7 accepts 0-9 source images. Leave empty for text-to-image.";
    return;
  }
  if (provider === "seedance") {
    const mode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
    if (mode === "text_to_video") {
      els.advancedReferenceSummary.textContent = "";
      return;
    }
    if (mode === "first_frame") {
      els.advancedReferenceSummary.textContent = count ? t("advanced.seedanceModeFirst") : t("advanced.seedanceFirstRequired");
      return;
    }
    if (mode === "first_last_frame") {
      els.advancedReferenceSummary.textContent = count
        ? `${t("advanced.seedanceModeFirstLast")}${state.advancedSeedanceLastFrameDataUrl ? "" : ` - ${t("advanced.seedanceLastRequired")}`}`
        : t("advanced.seedanceFirstRequired");
      return;
    }
    const hasVideo = Boolean(state.advancedSeedanceVideoAssetId) || splitUrlList(els.advancedSeedanceVideoUrls?.value || "").length > 0;
    const hasAudio = Boolean(state.advancedAudioAssetId) || splitUrlList(els.advancedSeedanceAudioUrls?.value || "").length > 0;
    els.advancedReferenceSummary.textContent = count
      ? `${t("advanced.seedanceReferenceCount", { count })}${hasVideo ? " Video selected." : ""}${hasAudio ? " Audio selected." : ""}`
      : hasVideo ? `Video selected.${hasAudio ? " Audio selected." : ""}` : hasAudio ? "Audio selected." : t("advanced.seedanceReferenceHint");
    return;
  }
  els.advancedReferenceSummary.textContent = count ? t("advanced.wanFirstFrameHint") : "";
}

function renderAssets(assets = state.userAssets || []) {
  if (!els.assetGrid) return;
  if (!state.user) {
    if (els.assetPager) els.assetPager.innerHTML = "";
    els.assetGrid.innerHTML = `
      <div class="history-empty-card">
        <strong>${escapeHtml(t("assets.loginRequired"))}</strong>
        <p>${escapeHtml(t("assets.loginDesc"))}</p>
        <button class="generate-btn" type="button" data-login-assets>${escapeHtml(t("history.login"))}</button>
      </div>
    `;
    els.assetGrid.querySelector("[data-login-assets]")?.addEventListener("click", openLogin);
    return;
  }
  if (!assets.length) {
    els.assetGrid.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("assets.emptyTitle"))}</strong><p>${escapeHtml(t("assets.emptyDesc"))}</p></div>`;
    renderSimplePager(els.assetPager, {
      page: state.userAssetsPage,
      totalPages: state.userAssetsTotalPages,
      total: state.userAssetsTotal,
    }, loadUserAssets);
    return;
  }
  els.assetGrid.innerHTML = assets.map((asset) => {
    const url = assetPreviewUrl(asset);
    const video = isVideoAsset(asset);
    const audio = isAudioAsset(asset);
    const typeLabel = video ? t("assets.video") : audio ? t("assets.audio") : t("assets.image");
    return `
      <article class="asset-card">
        <div class="asset-preview ${audio ? "is-audio" : ""}">
          ${video
            ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata" controls></video>`
            : audio
              ? `<div class="audio-asset-preview"><i data-lucide="audio-lines"></i><audio src="${escapeHtml(url)}" controls preload="metadata"></audio></div>`
              : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.name || "")}" loading="lazy" />`}
        </div>
        <div class="asset-info">
          <strong>${escapeHtml(asset.name || asset.id)}</strong>
          <span>${escapeHtml(typeLabel)}</span>
        </div>
        <div class="asset-actions">
          ${!video && !audio ? `<button class="ghost-button" type="button" data-asset-use="${escapeHtml(asset.id)}">${escapeHtml(t("assets.use"))}</button>` : ""}
          ${!video && !audio ? `<button class="copy-btn" type="button" data-asset-modify="${escapeHtml(asset.id)}">${escapeHtml(t("assets.modify"))}</button>` : ""}
          ${!video && !audio ? `<button class="ghost-button" type="button" data-asset-extend="${escapeHtml(asset.id)}">${escapeHtml(t("assets.extend"))}</button>` : ""}
          ${video ? `<button class="copy-btn" type="button" data-asset-replace="${escapeHtml(asset.id)}">${escapeHtml(t("assets.replace"))}</button>` : ""}
          ${video ? `<button class="ghost-button" type="button" data-asset-frame="${escapeHtml(asset.id)}">${escapeHtml(t("assets.extractFrame"))}</button>` : ""}
          <button class="ghost-button danger" type="button" data-asset-delete="${escapeHtml(asset.id)}">${escapeHtml(t("assets.delete"))}</button>
        </div>
      </article>
    `;
  }).join("");
  els.assetGrid.querySelectorAll("[data-asset-use]").forEach((button) => {
    button.addEventListener("click", () => useAssetInAdvanced(state.userAssets.find((asset) => asset.id === button.dataset.assetUse), "use"));
  });
  els.assetGrid.querySelectorAll("[data-asset-modify]").forEach((button) => {
    button.addEventListener("click", () => openAssetModifyDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetModify)));
  });
  els.assetGrid.querySelectorAll("[data-asset-extend]").forEach((button) => {
    button.addEventListener("click", () => openAssetExtendDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetExtend)));
  });
  els.assetGrid.querySelectorAll("[data-asset-replace]").forEach((button) => {
    button.addEventListener("click", () => openAssetReplaceDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetReplace)));
  });
  els.assetGrid.querySelectorAll("[data-asset-frame]").forEach((button) => {
    button.addEventListener("click", () => openAssetFrameDialog(state.userAssets.find((asset) => asset.id === button.dataset.assetFrame)));
  });
  els.assetGrid.querySelectorAll("[data-asset-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteUserAsset(button.dataset.assetDelete || ""));
  });
  renderSimplePager(els.assetPager, {
    page: state.userAssetsPage,
    totalPages: state.userAssetsTotalPages,
    total: state.userAssetsTotal,
  }, loadUserAssets);
  refreshIcons();
}

async function loadUserAssets(page = state.userAssetsPage || 1) {
  if (!els.assetGrid) return;
  if (!state.user) {
    renderAssets([]);
    return;
  }
  const params = new URLSearchParams();
  if (els.assetSearch?.value) params.set("q", els.assetSearch.value);
  if (els.assetTypeFilter?.value) params.set("type", els.assetTypeFilter.value);
  params.set("page", String(page));
  params.set("limit", String(state.userAssetsLimit || 8));
  if (els.assetNote) els.assetNote.textContent = t("assets.loading");
  try {
    const payload = await requestJson(`/api/user-assets?${params.toString()}`);
    state.userAssets = payload.assets || [];
    state.userAssetsPage = payload.page || page;
    state.userAssetsLimit = payload.limit || state.userAssetsLimit || 8;
    state.userAssetsTotal = payload.total || 0;
    state.userAssetsTotalPages = payload.totalPages || 1;
    if (els.assetNote) els.assetNote.textContent = "";
    renderAssets();
    if (state.tab === "characters" && state.characterSource === "custom") renderGalleryCharacters(els.characterGrid);
  } catch (error) {
    if (els.assetNote) els.assetNote.textContent = t("assets.loadFailed", { message: error.message || String(error) });
  }
}

async function uploadUserAssets(files = []) {
  if (!state.user) return openLogin();
  const selected = Array.from(files || []);
  if (!selected.length) return;
  if (els.assetNote) els.assetNote.textContent = t("assets.uploading");
  let uploaded = 0;
  try {
    for (const file of selected) {
      const dataUrl = await readFileAsDataUrl(file);
      const durationSeconds = file.type.startsWith("video/") || file.type.startsWith("audio/")
        ? await readVideoDuration(file).catch(() => 0)
        : 0;
      await requestJson("/api/user-assets", {
        method: "POST",
        body: { dataUrl, name: file.name || "Upload", fileName: file.name || "", durationSeconds },
      });
      uploaded += 1;
    }
    if (els.assetNote) els.assetNote.textContent = t("assets.uploaded", { count: uploaded });
    await loadUserAssets(1);
  } catch (error) {
    if (els.assetNote) els.assetNote.textContent = t("assets.uploadFailed", { message: error.message || String(error) });
  } finally {
    if (els.assetUploadInput) els.assetUploadInput.value = "";
    updateFilePickerLabel(els.assetUploadInput);
  }
}

async function deleteUserAsset(assetId = "") {
  if (!assetId) return;
  try {
    await requestJson(`/api/user-assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
    await loadUserAssets(state.userAssetsPage || 1);
  } catch (error) {
    if (els.assetNote) els.assetNote.textContent = error.message || String(error);
  }
}

async function submitTemplate() {
  if (!state.activeTemplate) return;
  if (!state.user) {
    openLogin();
    els.jobNote.textContent = t("modal.loginBeforeGenerate");
    return;
  }
  els.submitTemplateBtn.disabled = true;
  els.jobNote.textContent = t("modal.submitting");
  try {
    const payload = await requestJson("/api/platform/generate", {
      method: "POST",
      body: {
        templateId: state.activeTemplate.id,
        prompt: els.templatePrompt.value,
        dataUrl: state.uploadDataUrl,
      },
    });
    if (payload.user) setUser(payload.user);
    els.jobNote.innerHTML = escapeHtml(t("modal.submitted", { taskId: "__TASK_ID__" })).replace("__TASK_ID__", `<code>${escapeHtml(payload.taskId)}</code>`);
    loadHistory();
  } catch (error) {
    els.jobNote.textContent = error.message;
  } finally {
    els.submitTemplateBtn.disabled = false;
    updateSubmitButtonCost();
  }
}

function renderHistory(records = []) {
  if (!els.historyList) return;
  const sortedRecords = [...records].sort((left, right) => new Date(right.createdAt || right.updatedAt || 0) - new Date(left.createdAt || left.updatedAt || 0));
  const expiryNotice = `
    <div class="history-expiry-note">
      <i data-lucide="download"></i>
      <span>${escapeHtml(t("history.expiryNotice"))}</span>
    </div>
  `;
  if (!state.user) {
    if (els.historyPager) els.historyPager.innerHTML = "";
    els.historyList.innerHTML = `
      ${expiryNotice}
      <div class="history-empty-card">
        <strong>${escapeHtml(t("history.loginRequired"))}</strong>
        <p>${escapeHtml(t("history.loginDesc"))}</p>
        <button class="generate-btn" type="button" data-login-history>${escapeHtml(t("history.login"))}</button>
      </div>
    `;
    els.historyList.querySelector("[data-login-history]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  if (!sortedRecords.length) {
    els.historyList.innerHTML = `${expiryNotice}<div class="history-empty-card"><strong>${escapeHtml(t("history.emptyTitle"))}</strong><p>${escapeHtml(t("history.emptyDesc"))}</p></div>`;
    renderSimplePager(els.historyPager, {
      page: state.historyRecordsPage,
      totalPages: state.historyRecordsTotalPages,
      total: state.historyRecordsTotal,
    }, (page) => loadHistory({ page }));
    refreshIcons();
    return;
  }
  state.historyRecords = sortedRecords;
  els.historyList.innerHTML = `${expiryNotice}${sortedRecords.map((record, index) => {
    const videoUrl = generationVideoUrl(record);
    const imageResultUrl = generationImageResultUrl(record);
    const taskId = record.taskId || "";
    const mediaKey = `history-video-${Math.random().toString(36).slice(2)}`;
    const recordRatio = record.ratio || record.params?.ratio || record.params?.aspect_ratio;
    const mediaStyle = ratioStyle(recordRatio);
    const posterUrl = generationPosterUrl(record);
    return `
      <article class="history-item is-${escapeHtml(statusClass(record.status))}">
        <div class="history-media" style="${escapeHtml(mediaStyle)}">
          ${videoUrl ? `
            <button class="history-poster" type="button" data-history-load-video="${escapeHtml(mediaKey)}" aria-label="${escapeHtml(t("common.preview"))}">
              ${posterUrl ? `<img src="${escapeHtml(posterUrl)}" alt="" loading="lazy" decoding="async" />` : `<span>${escapeHtml(statusLabel(record.status))}</span>`}
              <i data-lucide="play"></i>
            </button>
            <video data-src="${escapeHtml(videoUrl)}" ${posterUrl ? `poster="${escapeHtml(posterUrl)}"` : ""} muted loop playsinline preload="none" data-history-video="${escapeHtml(mediaKey)}" hidden></video>
          ` : imageResultUrl ? `<img class="history-result-image" src="${escapeHtml(imageResultUrl)}" alt="" loading="lazy" decoding="async" />` : `<div class="history-placeholder"><i data-lucide="loader-circle"></i><span>${escapeHtml(statusLabel(record.status))}</span></div>`}
        </div>
        <div class="history-card-actions">
          <div class="history-record-actions${taskId || videoUrl ? "" : " history-record-actions-empty"}">
            ${taskId ? `
              <button class="history-download history-regenerate" type="button" data-history-regenerate="${escapeHtml(taskId)}">
                <i data-lucide="refresh-cw"></i>${escapeHtml(t("history.regenerate"))}
              </button>
            ` : ""}
            ${taskId && (videoUrl || imageResultUrl) ? `
              <button class="history-download history-add-asset" type="button" data-history-add-asset="${escapeHtml(taskId)}">
                <i data-lucide="folder-plus"></i>${escapeHtml(t("history.addAsset"))}
              </button>
            ` : ""}
            ${taskId && videoUrl ? `
              <button class="history-download history-extend" type="button" data-history-extend="${escapeHtml(taskId)}">
                <i data-lucide="stretch-horizontal"></i>${escapeHtml(t("assets.extend"))}
              </button>
              <button class="history-download history-replace" type="button" data-history-replace="${escapeHtml(taskId)}">
                <i data-lucide="replace"></i>${escapeHtml(t("assets.replace"))}
              </button>
              <button class="history-download history-frame" type="button" data-history-frame="${escapeHtml(taskId)}">
                <i data-lucide="scan-line"></i>${escapeHtml(t("assets.extractFrame"))}
              </button>
            ` : ""}
          </div>
          <button class="history-download history-params" type="button" data-history-detail="${index}">
            <i data-lucide="sliders-horizontal"></i>${escapeHtml(t("history.viewParameters"))}
          </button>
          ${taskId ? `
            <button class="history-download history-delete" type="button" data-history-delete="${escapeHtml(taskId)}">
              <i data-lucide="trash-2"></i>${escapeHtml(t("history.delete"))}
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }).join("")}`;
  els.historyList.querySelectorAll("[data-history-load-video]").forEach((button) => {
    const showVideo = () => {
      const key = button.dataset.historyLoadVideo || "";
      const escapedKey = window.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
      const video = els.historyList.querySelector(`[data-history-video="${escapedKey}"]`);
      if (!video) return;
      if (!video.src) video.src = video.dataset.src || "";
      video.muted = true;
      video.loop = true;
      video.controls = false;
      video.hidden = false;
      button.hidden = true;
      video.play?.().catch(() => {});
    };
    button.addEventListener("mouseenter", showVideo, { once: true });
    button.addEventListener("focus", showVideo, { once: true });
    button.addEventListener("click", showVideo);
  });
  els.historyList.querySelectorAll("[data-history-regenerate]").forEach((button) => {
    button.addEventListener("click", () => regenerateHistoryRecord(button.dataset.historyRegenerate || "", button));
  });
  els.historyList.querySelectorAll("[data-history-add-asset]").forEach((button) => {
    button.addEventListener("click", () => addHistoryRecordToAssets(button.dataset.historyAddAsset || "", button));
  });
  els.historyList.querySelectorAll("[data-history-replace]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyReplace || "", "replace", button));
  });
  els.historyList.querySelectorAll("[data-history-extend]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyExtend || "", "extend", button));
  });
  els.historyList.querySelectorAll("[data-history-frame]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordAssetAction(button.dataset.historyFrame || "", "frame", button));
  });
  els.historyList.querySelectorAll("[data-history-detail]").forEach((button) => {
    button.addEventListener("click", () => openHistoryDetail(button.dataset.historyDetail || 0));
  });
  els.historyList.querySelectorAll("[data-history-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteHistoryRecord(button.dataset.historyDelete || "", button));
  });
  renderSimplePager(els.historyPager, {
    page: state.historyRecordsPage,
    totalPages: state.historyRecordsTotalPages,
    total: state.historyRecordsTotal,
  }, (page) => loadHistory({ page }));
  refreshIcons();
}

async function regenerateHistoryRecord(taskId, button) {
  if (!taskId || !button) return;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.regenerating"))}`;
  refreshIcons();
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/regenerate`, { method: "POST" });
    if (payload.user) setUser(payload.user);
    button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("history.regenerateSubmitted"))}`;
    refreshIcons();
    window.setTimeout(() => loadHistory({ silent: true }), 300);
  } catch (error) {
    button.innerHTML = `<i data-lucide="alert-circle"></i>${escapeHtml(error.message || String(error))}`;
    refreshIcons();
    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }, 2500);
    return;
  }
  window.setTimeout(() => {
    button.disabled = false;
    button.innerHTML = originalHtml;
    refreshIcons();
  }, 1800);
}

async function addHistoryRecordToAssets(taskId, button) {
  if (!taskId || !button) return;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.addingAsset"))}`;
  refreshIcons();
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/add-asset`, { method: "POST" });
    if (payload.asset) {
      state.userAssets = [payload.asset, ...(state.userAssets || []).filter((asset) => asset.id !== payload.asset.id)];
    }
    button.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("history.assetAdded"))}`;
    refreshIcons();
    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }, 1800);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = originalHtml;
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = error.message || String(error);
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
    refreshIcons();
  }
}

async function historyRecordToVideoAsset(taskId, button) {
  if (!taskId) return null;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.addingAsset"))}`;
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}/add-asset`, { method: "POST" });
    if (payload.asset) {
      state.userAssets = [payload.asset, ...(state.userAssets || []).filter((asset) => asset.id !== payload.asset.id)];
      state.userAssetsTotal += 1;
    }
    return payload.asset || null;
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
  }
}

async function openHistoryRecordAssetAction(taskId, action = "replace", button = null) {
  const videoAsset = await historyRecordToVideoAsset(taskId, button).catch((error) => {
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = error.message || String(error);
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
    refreshIcons();
    return null;
  });
  if (!videoAsset) return;
  if (action === "frame") return openAssetFrameDialog(videoAsset);
  if (action === "extend") return openAssetVideoExtendDialog(videoAsset);
  if (action === "replace") return openAssetReplaceDialog(videoAsset);
}

async function deleteHistoryRecord(taskId = "", button = null) {
  if (!taskId) return;
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>${escapeHtml(t("history.deleting"))}`;
    refreshIcons();
  }
  try {
    await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`, { method: "DELETE" });
    state.historyRecords = (state.historyRecords || []).filter((record) => String(record.taskId || "") !== String(taskId));
    state.historyRecordsTotal = Math.max(0, Number(state.historyRecordsTotal || 0) - 1);
    historyRecordsSignature = "";
    await loadHistory({ silent: true, page: state.historyRecordsPage || 1 });
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
      refreshIcons();
    }
    if (els.historyList) {
      const note = document.createElement("div");
      note.className = "job-note history-action-note";
      note.textContent = t("history.deleteFailed", { message: error.message || String(error) });
      els.historyList.prepend(note);
      window.setTimeout(() => note.remove(), 5000);
    }
  }
}

function isPendingGenerationRecord(record = {}) {
  if (generationVideoUrl(record)) return false;
  if (generationImageResultUrl(record)) return false;
  return !["succeeded", "success", "done", "completed", "failed", "error", "cancelled", "canceled", "reference_failed", "rejected", "refunded", "deleted", "hidden"]
    .includes(String(record.status || "").toLowerCase().trim());
}

function generationRecordTime(record = {}) {
  const value = Date.parse(record.updatedAt || record.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function isRecentPendingGenerationRecord(record = {}) {
  if (!isPendingGenerationRecord(record) || !record.taskId) return false;
  const time = generationRecordTime(record);
  return !time || Date.now() - time <= HISTORY_PENDING_REFRESH_MAX_AGE_MS;
}

function canRefreshHistoryRecordDetail(record = {}) {
  if (!isRecentPendingGenerationRecord(record)) return false;
  const taskId = String(record.taskId || "");
  if (!taskId || historyDetailRefreshInFlight.has(taskId)) return false;
  const lastRefreshAt = historyDetailRefreshAt.get(taskId) || 0;
  return Date.now() - lastRefreshAt >= HISTORY_DETAIL_REFRESH_COOLDOWN_MS;
}

async function refreshPendingHistoryRecords(records = []) {
  if (state.tab !== "history" || !state.user) return;
  const candidates = records
    .filter(canRefreshHistoryRecordDetail)
    .sort((left, right) => generationRecordTime(right) - generationRecordTime(left))
    .slice(0, HISTORY_DETAIL_REFRESH_LIMIT);
  if (!candidates.length) return;

  const startedAt = Date.now();
  candidates.forEach((record) => {
    const taskId = String(record.taskId || "");
    historyDetailRefreshAt.set(taskId, startedAt);
    historyDetailRefreshInFlight.add(taskId);
  });

  const settled = await Promise.allSettled(candidates.map((record) => (
    requestJson(`/api/generation-records/${encodeURIComponent(record.taskId)}`)
  )));

  candidates.forEach((record) => historyDetailRefreshInFlight.delete(String(record.taskId || "")));
  if (state.tab !== "history" || !state.user) return;
  if (settled.some((result) => result.status === "fulfilled")) {
    window.setTimeout(() => loadHistory({ silent: true }), 500);
  }
}

async function requestVideoFullscreen(video) {
  if (!video) return;
  try {
    if (video.requestFullscreen) await video.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else if (video.webkitRequestFullscreen) await video.webkitRequestFullscreen();
    await video.play().catch(() => {});
  } catch {
    video.controls = true;
  }
}

function stopHistoryRefresh() {
  if (historyRefreshTimer) window.clearTimeout(historyRefreshTimer);
  historyRefreshTimer = null;
}

function scheduleHistoryRefresh({ delayMs = 15000, force = false } = {}) {
  if (historyRefreshTimer && !force) return;
  stopHistoryRefresh();
  if (state.tab !== "history" || !state.user) return;
  historyRefreshTimer = window.setTimeout(() => {
    historyRefreshTimer = null;
    if (state.tab === "history") loadHistory({ silent: true, refresh: true });
  }, delayMs);
}

async function loadHistory({ silent = false, refresh = false, page = state.historyRecordsPage || 1 } = {}) {
  if (!els.historyList) return;
  if (!state.user) {
    stopHistoryRefresh();
    historyRecordsSignature = "";
    renderHistory([]);
    return;
  }
  if (historyLoading || historyRefreshInFlight) {
    scheduleHistoryRefresh({ delayMs: 5000, force: true });
    return;
  }
  historyLoading = true;
  historyRefreshInFlight = true;
  const previousScrollTop = els.historyList.scrollTop || 0;
  const requestedPage = Math.max(1, Number(page || 1) || 1);
  if (!silent) els.historyList.innerHTML = `<div class="job-note">${escapeHtml(t("history.loading"))}</div>`;
  try {
    const historyUrl = `/api/generation-records?page=${encodeURIComponent(requestedPage)}&limit=${encodeURIComponent(state.historyRecordsLimit || 8)}${refresh ? "&refresh=1" : ""}`;
    const payload = await requestJson(historyUrl);
    if (payload.user) setUser(payload.user);
    const records = payload.records || [];
    state.historyRecordsPage = payload.page || requestedPage;
    state.historyRecordsLimit = payload.limit || state.historyRecordsLimit || 8;
    state.historyRecordsTotal = payload.total || records.length;
    state.historyRecordsTotalPages = payload.totalPages || 1;
    const nextSignature = generationRecordsSignature(records);
    if (!silent || nextSignature !== historyRecordsSignature) {
      renderHistory(records);
      historyRecordsSignature = nextSignature;
      els.historyList.scrollTop = previousScrollTop;
    }
    refreshPendingHistoryRecords(records);
    if (records.some(isRecentPendingGenerationRecord)) scheduleHistoryRefresh();
    else stopHistoryRefresh();
  } catch (error) {
    if (!silent) els.historyList.innerHTML = `<div class="job-note">${escapeHtml(t("history.loadFailed", { message: error.message || String(error) }))}</div>`;
    scheduleHistoryRefresh({ delayMs: 30000, force: true });
  } finally {
    historyLoading = false;
    historyRefreshInFlight = false;
  }
}

function ledgerLoginCard() {
  return `
    <div class="history-empty-card">
      <strong>${escapeHtml(t("ledger.loginRequired"))}</strong>
      <p>${escapeHtml(t("ledger.loginDesc"))}</p>
      <button class="generate-btn" type="button" data-login-ledger>${escapeHtml(t("history.login"))}</button>
    </div>
  `;
}

function ledgerParams(kind, page = 1, exportCsv = false) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(kind === "topups" ? state.topupRecords.limit : state.spendingRecords.limit),
  });
  const controls = kind === "topups"
    ? {
        q: els.topupSearch?.value,
        status: els.topupStatus?.value,
        from: els.topupFrom?.value,
        to: els.topupTo?.value,
      }
    : {
        q: els.spendingSearch?.value,
        type: els.spendingType?.value,
        from: els.spendingFrom?.value,
        to: els.spendingTo?.value,
      };
  Object.entries(controls).forEach(([key, value]) => {
    const text = String(value || "").trim();
    if (text) params.set(key, text);
  });
  if (exportCsv) params.set("export", "csv");
  return params;
}

function renderLedgerPager(kind) {
  const data = kind === "topups" ? state.topupRecords : state.spendingRecords;
  const holder = kind === "topups" ? els.topupPager : els.spendingPager;
  if (!holder) return;
  holder.innerHTML = `
    <button class="ghost-button" type="button" data-page="prev" ${data.page <= 1 ? "disabled" : ""}>${escapeHtml(t("ledger.prev"))}</button>
    <span>${escapeHtml(t("ledger.page", { page: data.page, totalPages: data.totalPages, total: data.total }))}</span>
    <button class="ghost-button" type="button" data-page="next" ${data.page >= data.totalPages ? "disabled" : ""}>${escapeHtml(t("ledger.next"))}</button>
  `;
  holder.querySelector('[data-page="prev"]')?.addEventListener("click", () => {
    if (data.page > 1) (kind === "topups" ? loadTopupRecords : loadSpendingRecords)(data.page - 1);
  });
  holder.querySelector('[data-page="next"]')?.addEventListener("click", () => {
    if (data.page < data.totalPages) (kind === "topups" ? loadTopupRecords : loadSpendingRecords)(data.page + 1);
  });
}

function renderTopupRecords() {
  if (!els.topupTable) return;
  if (!state.user) {
    els.topupTable.innerHTML = ledgerLoginCard();
    els.topupPager.innerHTML = "";
    els.topupTable.querySelector("[data-login-ledger]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  const records = state.topupRecords.records || [];
  if (!records.length) {
    els.topupTable.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("ledger.empty"))}</strong></div>`;
    renderLedgerPager("topups");
    return;
  }
  els.topupTable.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("ledger.orderId"))}</th>
          <th>${escapeHtml(t("ledger.status"))}</th>
          <th>${escapeHtml(t("ledger.amount"))}</th>
          <th>${escapeHtml(t("ledger.payable"))}</th>
          <th>${escapeHtml(t("ledger.credits"))}</th>
          <th>${escapeHtml(t("ledger.createdAt"))}</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((order) => `
          <tr>
            <td data-label="${escapeHtml(t("ledger.orderId"))}"><code>${escapeHtml(order.id)}</code></td>
            <td data-label="${escapeHtml(t("ledger.status"))}"><span class="ledger-badge">${escapeHtml(order.status || "")}</span></td>
            <td data-label="${escapeHtml(t("ledger.amount"))}">${escapeHtml(formatCredits(order.amount))} ${escapeHtml(order.asset || "USDT")}</td>
            <td data-label="${escapeHtml(t("ledger.payable"))}"><strong>${escapeHtml(order.payableAmountText || order.payableAmount || "")}</strong><small>${escapeHtml([order.network, order.paymentProvider === "paypal" ? order.paypalOrderId : ""].filter(Boolean).join(" · "))}</small></td>
            <td data-label="${escapeHtml(t("ledger.credits"))}">${escapeHtml(formatCredits(order.creditAmount))}</td>
            <td data-label="${escapeHtml(t("ledger.createdAt"))}">${escapeHtml(formatDateTime(order.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  renderLedgerPager("topups");
}

function renderSpendingTypeOptions(types = []) {
  if (!els.spendingType) return;
  const current = els.spendingType.value;
  els.spendingType.innerHTML = `<option value="">${escapeHtml(t("ledger.allTypes"))}</option>${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}`;
  if (types.includes(current)) els.spendingType.value = current;
}

function renderSpendingRecords() {
  if (!els.spendingTable) return;
  if (!state.user) {
    els.spendingTable.innerHTML = ledgerLoginCard();
    els.spendingPager.innerHTML = "";
    els.spendingTable.querySelector("[data-login-ledger]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  const records = state.spendingRecords.records || [];
  renderSpendingTypeOptions(state.spendingRecords.types || []);
  if (!records.length) {
    els.spendingTable.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("ledger.empty"))}</strong></div>`;
    renderLedgerPager("spending");
    return;
  }
  els.spendingTable.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("ledger.createdAt"))}</th>
          <th>${escapeHtml(t("ledger.type"))}</th>
          <th>${escapeHtml(t("ledger.title"))}</th>
          <th>${escapeHtml(t("ledger.credits"))}</th>
          <th>${escapeHtml(t("ledger.balanceAfter"))}</th>
          <th>${escapeHtml(t("ledger.taskId"))}</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((entry) => `
          <tr>
            <td data-label="${escapeHtml(t("ledger.createdAt"))}">${escapeHtml(formatDateTime(entry.createdAt))}</td>
            <td data-label="${escapeHtml(t("ledger.type"))}"><span class="ledger-badge">${escapeHtml(entry.type || "")}</span></td>
            <td data-label="${escapeHtml(t("ledger.title"))}"><strong>${escapeHtml(entry.title || entry.type || "")}</strong><small>${[entry.resolution, entry.duration ? `${entry.duration}s` : ""].filter(Boolean).join(" / ")}</small></td>
            <td data-label="${escapeHtml(t("ledger.credits"))}" class="ledger-negative">-${escapeHtml(formatCredits(entry.amount))}</td>
            <td data-label="${escapeHtml(t("ledger.balanceAfter"))}">${escapeHtml(formatCredits(entry.balanceAfter))}</td>
            <td data-label="${escapeHtml(t("ledger.taskId"))}"><code>${escapeHtml(entry.taskId || entry.id || "")}</code></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  renderLedgerPager("spending");
}

async function loadTopupRecords(page = state.topupRecords.page || 1) {
  if (!els.topupTable) return;
  if (!state.user) {
    renderTopupRecords();
    return;
  }
  els.topupTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loading"))}</div>`;
  try {
    const payload = await requestJson(`/api/billing/topups?${ledgerParams("topups", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.topupRecords = {
      ...state.topupRecords,
      records: payload.records || [],
      page: payload.page || page,
      limit: payload.limit || state.topupRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    renderTopupRecords();
  } catch (error) {
    els.topupTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loadFailed", { message: error.message || String(error) }))}</div>`;
  }
  refreshIcons();
}

function shouldAutoRefreshTopups() {
  return Boolean(
    state.user &&
    !document.hidden &&
    (state.tab === "topups" || els.topupQrDialog?.open)
  );
}

async function refreshTopupsQuietly() {
  if (!shouldAutoRefreshTopups() || state.topupRefreshInFlight) return;
  state.topupRefreshInFlight = true;
  try {
    const page = state.tab === "topups" ? (state.topupRecords.page || 1) : 1;
    const payload = await requestJson(`/api/billing/topups?${ledgerParams("topups", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.topupRecords = {
      ...state.topupRecords,
      records: payload.records || [],
      page: payload.page || page,
      limit: payload.limit || state.topupRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    if (state.tab === "topups") renderTopupRecords();
    refreshIcons();
  } catch {
    // Keep the current table visible; the next interval can recover.
  } finally {
    state.topupRefreshInFlight = false;
  }
}

function syncTopupAutoRefresh() {
  const active = shouldAutoRefreshTopups();
  if (active && !state.topupRefreshTimer) {
    state.topupRefreshTimer = window.setInterval(refreshTopupsQuietly, TOPUP_RECORDS_AUTO_REFRESH_MS);
  } else if (!active && state.topupRefreshTimer) {
    window.clearInterval(state.topupRefreshTimer);
    state.topupRefreshTimer = 0;
  }
}

async function loadSpendingRecords(page = state.spendingRecords.page || 1) {
  if (!els.spendingTable) return;
  if (!state.user) {
    renderSpendingRecords();
    return;
  }
  els.spendingTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loading"))}</div>`;
  try {
    const payload = await requestJson(`/api/billing/spending?${ledgerParams("spending", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.spendingRecords = {
      ...state.spendingRecords,
      records: payload.records || [],
      types: payload.types || state.spendingRecords.types || [],
      page: payload.page || page,
      limit: payload.limit || state.spendingRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    renderSpendingRecords();
  } catch (error) {
    els.spendingTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loadFailed", { message: error.message || String(error) }))}</div>`;
  }
  refreshIcons();
}

async function exportLedger(kind) {
  if (!state.user) return openLogin();
  const endpoint = kind === "topups" ? "/api/billing/topups" : "/api/billing/spending";
  const params = ledgerParams(kind, 1, true);
  const button = kind === "topups" ? els.exportTopupsBtn : els.exportSpendingBtn;
  const table = kind === "topups" ? els.topupTable : els.spendingTable;
  const filename = kind === "topups" ? "topup-records.csv" : "spending-records.csv";
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: state.token ? { authorization: `Bearer ${state.token}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || `Export failed: ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    if (table) {
      table.insertAdjacentHTML("afterbegin", `<div class="job-note">${escapeHtml(error.message || String(error))}</div>`);
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function openLogin() {
  if (state.user) return openAccount();
  renderLoginMode();
  els.loginDialog.showModal();
}

function openAccount() {
  renderTokenDisplays();
  els.accountDialog?.showModal();
  refreshIcons();
}

function logout() {
  state.token = "";
  state.user = null;
  state.showAccessToken = false;
  state.showAccountToken = false;
  state.apiSubtokens = [];
  state.apiSubtokensLoaded = false;
  state.apiSubtokenMessage = "";
  state.createdApiSubtoken = null;
  localStorage.removeItem(TOKEN_KEY);
  els.accountDialog?.close();
  closeAccountMenu();
  setUser(null);
  if (state.tab === "history") renderHistory([]);
  if (state.tab === "topups") renderTopupRecords();
  if (state.tab === "spending") renderSpendingRecords();
  if (state.tab === "assets") renderAssets([]);
  if (state.tab === "access") renderApiSubtokens();
  syncTopupAutoRefresh();
}

function renderLoginMode() {
  const isRegister = state.loginMode === "register";
  els.loginTitle.textContent = isRegister ? t("auth.createAccount") : t("auth.login");
  els.loginSubmit.textContent = isRegister ? t("auth.createAndLogin") : t("auth.login");
  els.toggleLoginMode.textContent = isRegister ? t("auth.alreadyAccount") : t("auth.createAccount");
  els.loginMessage.textContent = "";
}

async function submitLogin() {
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;
  if (!username || password.length < 6) {
    els.loginMessage.textContent = t("auth.invalid");
    return;
  }
  const endpoint = state.loginMode === "register" ? "/api/auth/register" : "/api/auth/login";
  try {
    const payload = await requestJson(endpoint, {
      method: "POST",
      body: { username, password },
    });
    state.token = payload.token;
    setUser(payload.user);
    localStorage.setItem(TOKEN_KEY, payload.token);
    els.loginDialog.close();
    if (state.tab === "access") renderAccessGuides();
    if (state.tab === "access") loadApiSubtokens({ force: true });
    if (state.tab === "history") loadHistory();
    if (state.tab === "topups") loadTopupRecords(1);
    if (state.tab === "spending") loadSpendingRecords(1);
    if (state.tab === "assets") loadUserAssets();
  } catch (error) {
    els.loginMessage.textContent = error.message;
  }
}

async function loadMe() {
  if (!state.token) return;
  try {
    const payload = await requestJson("/api/auth/me");
    setUser(payload.user);
  } catch {
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }
}

async function loadPlatformEstimates() {
  if (!state.templates.length) return;
  try {
    const payload = await requestJson("/api/platform/estimates");
    state.estimates = {};
    (payload.estimates || []).forEach((estimate) => {
      if (estimate?.templateId) state.estimates[estimate.templateId] = estimate;
    });
  } catch (error) {
    state.estimates = Object.fromEntries(state.templates.map((template) => [
      template.id,
      { templateId: template.id, available: false, credits: null, message: error.message },
    ]));
  }
  renderTemplates();
  updateSubmitButtonCost();
}

async function bootstrap() {
  await loadMe();
  const payload = await requestJson("/api/config/public");
  const platform = payload.config?.platform || {};
  state.config = payload.config;
  state.wallet = payload.config?.wallet || null;
  ensureSelectedWalletOption();
  state.templates = platform.templates || [];
  state.categories = platform.categories || [];
  state.advancedCases = platform.advanced?.cases || [];
  state.homeCharacters = payload.config?.homeVideo?.items || [];
  els.brandName.textContent = platform.brand || "Vipeak AI";
  applyTenantFeatures();
  if (!isTabAllowed(state.tab)) state.tab = DEFAULT_PLATFORM_TAB;
  renderCategories();
  renderTemplates();
  renderAccessGuides();
  renderAdvanced();
  renderAssets();
  renderAccountMenu();
  renderTopupSummary();
  renderTokenDisplays();
  setTab(state.tab);
  refreshIcons();
  loadPlatformEstimates();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});
window.addEventListener("hashchange", () => setTab(window.location.hash));
els.templateImage?.addEventListener("change", async () => {
  const file = els.templateImage.files?.[0];
  if (!file) return;
  state.uploadDataUrl = await readFileAsDataUrl(file);
  els.uploadPreview.src = state.uploadDataUrl;
  els.uploadBox.classList.add("has-image");
});
els.advancedImage?.addEventListener("change", async () => {
  const provider = currentAdvancedProvider();
  const files = Array.from(els.advancedImage.files || []);
  if (!files.length) return;
  if (files.some((file) => file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES)) {
    els.advancedImage.value = "";
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
    updateAdvancedModelControls();
    return;
  }
  if (provider === "seedance" || provider === "wan27-image-edit") {
    const existing = Array.isArray(state.advancedReferenceImages) ? state.advancedReferenceImages : [];
    const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "text_to_video");
    const limit = provider === "wan27-image-edit" ? ADVANCED_SEEDANCE_REFERENCE_LIMIT : seedanceModeNeedsFirstFrame(seedanceMode) ? 1 : ADVANCED_SEEDANCE_REFERENCE_LIMIT;
    const roomLeft = Math.max(0, limit - existing.length);
    if (!roomLeft) {
      els.advancedImage.value = "";
      if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: limit });
      updateAdvancedModelControls();
      return;
    }
    const selectedFiles = files.slice(0, roomLeft);
    const addedImages = await Promise.all(selectedFiles.map(async (file) => ({
      dataUrl: await readFileAsDataUrl(file),
      fileName: file.name || "",
    })));
    state.advancedSourceImageAssetId = "";
    state.advancedFirstFrameAssetId = "";
    state.advancedReferenceImages = dedupeAdvancedReferenceImages([...existing, ...addedImages]).slice(0, limit);
    if (provider === "wan27-image-edit") state.advancedSourceImageAssetId = state.advancedReferenceImages[0]?.assetId || "";
    state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
    state.advancedSeedanceVideoAssetId = "";
    state.advancedSeedanceVideoPreviewUrl = "";
    state.advancedWanClipAssetId = "";
    els.advancedImage.value = "";
    if (files.length > selectedFiles.length && els.advancedNote) {
      els.advancedNote.textContent = t("advanced.referenceImageTooMany", { count: limit });
    }
    updateAdvancedModelControls();
    return;
  }
  const selectedFile = files[0];
  state.advancedSourceImageAssetId = "";
  state.advancedFirstFrameAssetId = "";
  state.advancedReferenceImages = [{
    dataUrl: await readFileAsDataUrl(selectedFile),
    fileName: selectedFile.name || "",
  }];
  state.advancedUploadDataUrl = state.advancedReferenceImages[0]?.dataUrl || "";
  state.advancedSeedanceVideoAssetId = "";
  state.advancedSeedanceVideoPreviewUrl = "";
  state.advancedWanClipAssetId = "";
  els.advancedImage.value = "";
  updateAdvancedModelControls();
});
els.advancedSeedanceLastFrame?.addEventListener("change", async () => {
  const file = els.advancedSeedanceLastFrame.files?.[0];
  if (!file) return;
  if (file.size > ADVANCED_SEEDANCE_REFERENCE_MAX_BYTES) {
    els.advancedSeedanceLastFrame.value = "";
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.referenceImageTooLarge");
    updateAdvancedModelControls();
    return;
  }
  state.advancedSeedanceLastFrameDataUrl = await readFileAsDataUrl(file);
  state.advancedSeedanceLastFrameAssetId = "";
  els.advancedSeedanceLastFrame.value = "";
  updateAdvancedModelControls();
});
els.advancedSeedanceVideoUrls?.addEventListener("input", () => {
  updateAdvancedReferenceSummary();
  updateAdvancedButtonCost();
});
els.advancedSeedanceAudioUrls?.addEventListener("input", updateAdvancedReferenceSummary);
els.advancedWanLastFrame?.addEventListener("change", async () => {
  const file = els.advancedWanLastFrame.files?.[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    state.advancedWanLastFrameDataUrl = "";
    state.advancedWanLastFrameAssetId = "";
    els.advancedWanLastFrame.value = "";
    els.advancedWanLastFramePreview?.removeAttribute("src");
    els.advancedWanLastFramePreview?.classList.remove("is-visible");
    els.advancedWanLastFrame?.closest(".wan-frame-upload")?.classList.remove("has-image");
    if (els.advancedNote) els.advancedNote.textContent = "Last frame image must be 20MB or smaller.";
    return;
  }
  state.advancedWanLastFrameDataUrl = await readFileAsDataUrl(file);
  state.advancedWanLastFrameAssetId = "";
  if (els.advancedWanLastFramePreview) {
    els.advancedWanLastFramePreview.src = state.advancedWanLastFrameDataUrl;
    els.advancedWanLastFramePreview.classList.add("is-visible");
    els.advancedWanLastFrame.closest(".wan-frame-upload")?.classList.add("has-image");
  }
  updateAdvancedModelControls();
});
els.advancedWanClipFile?.addEventListener("change", async () => {
  const file = els.advancedWanClipFile.files?.[0];
  if (!file) return;
  if (file.size > ADVANCED_WAN_CLIP_MAX_BYTES) {
    state.advancedWanClipDataUrl = "";
    state.advancedWanClipFileName = "";
    state.advancedWanClipAssetId = "";
    els.advancedWanClipFile.value = "";
    els.advancedWanClipPreview?.removeAttribute("src");
    els.advancedWanClipPreview?.classList.remove("is-visible");
    els.advancedWanClipFile?.closest(".wan-frame-upload")?.classList.remove("has-image");
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipTooLarge");
    return;
  }
  const clipDuration = await readVideoDuration(file).catch(() => 0);
  if (!clipDuration || clipDuration > ADVANCED_WAN_CLIP_MAX_SECONDS) {
    state.advancedWanClipDataUrl = "";
    state.advancedWanClipFileName = "";
    state.advancedWanClipAssetId = "";
    els.advancedWanClipFile.value = "";
    els.advancedWanClipPreview?.removeAttribute("src");
    els.advancedWanClipPreview?.classList.remove("is-visible");
    els.advancedWanClipFile?.closest(".wan-frame-upload")?.classList.remove("has-image");
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.clipTooLong");
    return;
  }
  state.advancedWanClipDataUrl = await readFileAsDataUrl(file);
  state.advancedWanClipFileName = file.name || "";
  state.advancedWanClipAssetId = "";
  if (els.advancedWanClipPreview) {
    els.advancedWanClipPreview.src = state.advancedWanClipDataUrl;
    els.advancedWanClipPreview.classList.add("is-visible");
    els.advancedWanClipFile.closest(".wan-frame-upload")?.classList.add("has-image");
  }
  updateAdvancedModelControls();
});
els.submitTemplateBtn?.addEventListener("click", submitTemplate);
els.refreshHistoryBtn?.addEventListener("click", () => loadHistory({ refresh: true }));
els.refreshAssetsBtn?.addEventListener("click", () => loadUserAssets(state.userAssetsPage || 1));
els.refreshAdvancedAssetsBtn?.addEventListener("click", () => loadAdvancedAssets(state.advancedAssetPage || 1));
els.characterCreateBtn?.addEventListener("click", createCharacterFromPrompt);
els.assetSearch?.addEventListener("input", () => {
  window.clearTimeout(state.assetSearchTimer);
  state.assetSearchTimer = window.setTimeout(() => loadUserAssets(1), 250);
});
els.assetTypeFilter?.addEventListener("change", () => loadUserAssets(1));
els.assetUploadInput?.addEventListener("change", () => {
  updateFilePickerLabel(els.assetUploadInput);
  uploadUserAssets(els.assetUploadInput.files);
});
els.advancedAssetSearch?.addEventListener("input", () => {
  window.clearTimeout(state.advancedAssetSearchTimer);
  state.advancedAssetSearchTimer = window.setTimeout(() => loadAdvancedAssets(1), 250);
});
els.advancedAssetTypeFilter?.addEventListener("change", () => loadAdvancedAssets(1));
els.advancedAssetUploadInput?.addEventListener("change", () => {
  updateFilePickerLabel(els.advancedAssetUploadInput);
  uploadAdvancedAssets(els.advancedAssetUploadInput.files);
});
els.topupFilters?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadTopupRecords(1);
});
els.spendingFilters?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadSpendingRecords(1);
});
els.exportTopupsBtn?.addEventListener("click", () => exportLedger("topups"));
els.exportSpendingBtn?.addEventListener("click", () => exportLedger("spending"));
document.querySelectorAll("[data-legal-doc]").forEach((button) => {
  button.addEventListener("click", () => openLegalDialog(button.dataset.legalDoc || "privacy"));
});
els.topupAmount?.addEventListener("input", () => {
  renderTopupSummary();
});
els.createTopupBtn?.addEventListener("click", createTopupOrder);
els.topupTriggerBtn?.addEventListener("click", () => {
  closeAccountMenu();
  renderTopupSummary();
  if (!els.topupDialog?.open) els.topupDialog?.showModal();
  renderPayPalCheckout();
  syncTopupAutoRefresh();
  refreshIcons();
});
els.topupQrDialog?.addEventListener("close", syncTopupAutoRefresh);
els.previewDialog?.addEventListener("close", () => {
  if (!els.previewVideo) return;
  els.previewVideo.pause();
  els.previewVideo.removeAttribute("src");
  els.previewVideo.removeAttribute("style");
  els.previewVideo.load();
});
els.advancedSubmitBtn?.addEventListener("click", submitAdvancedGenerate);
els.advancedDuration?.addEventListener("input", updateAdvancedButtonCost);
els.advancedProvider?.addEventListener("change", () => {
  state.advancedAssetTarget = "primary";
  updateAdvancedModelControls();
});
els.advancedSeedanceTier?.addEventListener("change", () => {
  updateAdvancedModelControls();
});
els.advancedWanMediaMode?.addEventListener("change", () => {
  state.advancedAssetTarget = "primary";
  updateAdvancedModelControls();
});
els.advancedSeedanceMediaMode?.addEventListener("change", () => {
  state.advancedAssetTarget = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "") === "reference_images" ? "referenceImages" : "primary";
  updateAdvancedModelControls();
});
els.advancedRatio?.addEventListener("change", updateAdvancedButtonCost);
els.advancedResolution?.addEventListener("change", updateAdvancedButtonCost);
els.advancedPreprocessReference?.addEventListener("change", updateAdvancedModelControls);
els.advancedUploadBox?.addEventListener("click", () => {
  const provider = currentAdvancedProvider();
  const seedanceMode = normalizeSeedanceMediaMode(els.advancedSeedanceMediaMode?.value || "");
  setAdvancedAssetTarget(provider === "wan27-image-edit" ? "sourceImages" : provider === "seedance" && seedanceMode === "reference_images" ? "referenceImages" : "primary");
});
document.querySelectorAll("[data-remove-advanced-slot]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeAdvancedMediaSlot(button.dataset.removeAdvancedSlot || "");
  });
});
els.advancedSeedanceLastFrame?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("lastFrame"));
els.advancedWanLastFrame?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("lastFrame"));
els.advancedWanClipFile?.closest(".wan-frame-upload")?.addEventListener("click", () => setAdvancedAssetTarget("video"));
els.advancedWanAudioUrl?.addEventListener("focus", () => setAdvancedAssetTarget("audio"));
els.advancedSeedanceVideoUrls?.addEventListener("focus", () => setAdvancedAssetTarget("video"));
els.advancedSeedanceAudioUrls?.addEventListener("focus", () => setAdvancedAssetTarget("audio"));
els.accountMenuBtn?.addEventListener("click", () => {
  toggleAccountMenu();
});
document.addEventListener("click", (event) => {
  if (!els.accountMenu || els.accountMenu.hidden) return;
  if (els.accountMenu.contains(event.target) || els.accountMenuBtn?.contains(event.target)) return;
  closeAccountMenu();
});
document.addEventListener("visibilitychange", syncTopupAutoRefresh);
els.toggleLoginMode?.addEventListener("click", () => {
  state.loginMode = state.loginMode === "login" ? "register" : "login";
  renderLoginMode();
});
els.loginSubmit?.addEventListener("click", submitLogin);
els.languageSelect?.addEventListener("change", () => setLanguage(els.languageSelect.value));
els.copyAccessBtn?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(fullAccessCopy());
  els.copyAccessBtn.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("common.copied"))}`;
  refreshIcons();
  setTimeout(() => {
    els.copyAccessBtn.innerHTML = `<i data-lucide="clipboard"></i>${escapeHtml(t("access.copySnippet"))}`;
    refreshIcons();
  }, 1600);
});
els.toggleAccessTokenBtn?.addEventListener("click", () => {
  state.showAccessToken = !state.showAccessToken;
  renderAccessGuides();
});
els.copyTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user?.apiToken) return openLogin();
  await navigator.clipboard.writeText(tokenAccessPackageMarkdown());
  els.copyTokenBtn.innerHTML = `<i data-lucide="check"></i>Copied token + docs`;
  refreshIcons();
  setTimeout(() => {
    renderTokenDisplays();
    refreshIcons();
  }, 1600);
});
els.menuCopyTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user?.apiToken) return openLogin();
  await navigator.clipboard.writeText(state.user.apiToken);
  closeAccountMenu();
});
els.menuLoginBtn?.addEventListener("click", () => {
  closeAccountMenu();
  openLogin();
});
els.toggleAccountTokenBtn?.addEventListener("click", () => {
  state.showAccountToken = !state.showAccountToken;
  renderTokenDisplays();
});
els.copyAccountTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user?.apiToken) return openLogin();
  await navigator.clipboard.writeText(state.user.apiToken);
  els.copyAccountTokenBtn.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("common.copied"))}`;
  refreshIcons();
  setTimeout(() => {
    els.copyAccountTokenBtn.innerHTML = `<i data-lucide="copy"></i>${escapeHtml(t("common.copyToken"))}`;
    refreshIcons();
  }, 1600);
});
els.logoutAccountBtn?.addEventListener("click", logout);
els.menuLogoutBtn?.addEventListener("click", logout);

applyLanguage();

bootstrap().catch((error) => {
  document.body.insertAdjacentHTML("beforeend", `<div class="job-note" style="position:fixed;left:20px;bottom:20px;background:#11182b;padding:14px 16px;border-radius:14px;">${escapeHtml(error.message)}</div>`);
});
