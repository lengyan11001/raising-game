"use strict";

const TOKEN_KEY = "raisingGameToken";
const LANG_KEY = "raisingGameLanguage";
const ADVANCED_SEEDANCE_CREDITS_PER_SECOND = 150;
const ADVANCED_WAN27_720P_CREDITS_PER_SECOND = 100;
const ADVANCED_WAN27_1080P_CREDITS_PER_SECOND = 150;
const ADVANCED_GENERATION_CREDITS_PER_SECOND = ADVANCED_SEEDANCE_CREDITS_PER_SECOND;

const state = {
  config: null,
  templates: [],
  categories: [],
  estimates: {},
  tab: "gallery",
  category: "all",
  advancedCases: [],
  activeAdvancedCaseId: "",
  activeTemplate: null,
  uploadDataUrl: "",
  advancedUploadDataUrl: "",
  wallet: null,
  token: localStorage.getItem(TOKEN_KEY) || "",
  lang: localStorage.getItem(LANG_KEY) || "en",
  user: null,
  loginMode: "login",
  showAccessToken: false,
  showAccountToken: false,
};

const els = {
  brandName: document.querySelector("#brandName"),
  languageSelect: document.querySelector("#languageSelect"),
  heroTitle: document.querySelector("#heroTitle"),
  heroEyebrow: document.querySelector("#heroEyebrow"),
  heroSubtitle: document.querySelector("#heroSubtitle"),
  heroBadge: document.querySelector("#heroBadge"),
  heroNotice: document.querySelector("#heroNotice"),
  categoryRow: document.querySelector("#categoryRow"),
  templateGrid: document.querySelector("#templateGrid"),
  templateDialog: document.querySelector("#templateDialog"),
  modalType: document.querySelector("#modalType"),
  modalTitle: document.querySelector("#modalTitle"),
  templateImage: document.querySelector("#templateImage"),
  uploadBox: document.querySelector("#uploadBox"),
  uploadPreview: document.querySelector("#uploadPreview"),
  templatePrompt: document.querySelector("#templatePrompt"),
  submitTemplateBtn: document.querySelector("#submitTemplateBtn"),
  jobNote: document.querySelector("#jobNote"),
  accessTabs: document.querySelector("#accessTabs"),
  accessGuideTitle: document.querySelector("#accessGuideTitle"),
  accessGuideDesc: document.querySelector("#accessGuideDesc"),
  accessCopy: document.querySelector("#accessCopy"),
  copyAccessBtn: document.querySelector("#copyAccessBtn"),
  accessTokenDisplay: document.querySelector("#accessTokenDisplay"),
  accessTokenHint: document.querySelector("#accessTokenHint"),
  toggleAccessTokenBtn: document.querySelector("#toggleAccessTokenBtn"),
  copyTokenBtn: document.querySelector("#copyTokenBtn"),
  historyList: document.querySelector("#historyList"),
  refreshHistoryBtn: document.querySelector("#refreshHistoryBtn"),
  topupDialog: document.querySelector("#topupDialog"),
  topupTriggerBtn: document.querySelector("#topupTriggerBtn"),
  topupTriggerCredits: document.querySelector("#topupTriggerCredits"),
  topupPanel: document.querySelector("#topupPanel"),
  topupAmount: document.querySelector("#topupAmount"),
  topupCredits: document.querySelector("#topupCredits"),
  topupRate: document.querySelector("#topupRate"),
  createTopupBtn: document.querySelector("#createTopupBtn"),
  topupOrder: document.querySelector("#topupOrder"),
  previewDialog: document.querySelector("#previewDialog"),
  previewTitle: document.querySelector("#previewTitle"),
  previewVideo: document.querySelector("#previewVideo"),
  advancedGate: document.querySelector("#advancedGate"),
  advancedWorkspace: document.querySelector("#advancedWorkspace"),
  advancedPrompt: document.querySelector("#advancedPrompt"),
  advancedImage: document.querySelector("#advancedImage"),
  advancedUploadBox: document.querySelector("#advancedUploadBox"),
  advancedUploadPreview: document.querySelector("#advancedUploadPreview"),
  advancedProvider: document.querySelector("#advancedProvider"),
  advancedRatio: document.querySelector("#advancedRatio"),
  advancedResolution: document.querySelector("#advancedResolution"),
  advancedDuration: document.querySelector("#advancedDuration"),
  advancedPreprocessReference: document.querySelector("#advancedPreprocessReference"),
  advancedWanSeed: document.querySelector("#advancedWanSeed"),
  advancedSubmitBtn: document.querySelector("#advancedSubmitBtn"),
  advancedNote: document.querySelector("#advancedNote"),
  advancedCaseGrid: document.querySelector("#advancedCaseGrid"),
  loginBtn: document.querySelector("#loginBtn"),
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

const I18N = {
  en: {
    "nav.gallery": "Gallery",
    "nav.advanced": "Advanced",
    "nav.access": "API Access",
    "nav.history": "History",
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
    "copy.historyTitle": "Generation History",
    "copy.historySubtitle": "Review your generated videos, prompts, parameters and billing in one compact list.",
    "copy.historyNotice": "Only your own generation records are shown.",
    "hero.access.eyebrow": "Integration",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "Advanced",
    "hero.advanced.badge": "Permission",
    "hero.history.eyebrow": "History",
    "hero.history.badge": "Records",
    "hero.gallery.badge": "Templates",
    "gallery.title": "AI Templates",
    "gallery.subtitle": "Choose a template, upload material, and generate a new result.",
    "gallery.noTemplates": "No templates available yet.",
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
    "topup.title": "USDT Top Up",
    "topup.compact": "Top Up",
    "topup.dialogTitle": "Top up credits",
    "topup.createOrder": "Create order",
    "topup.login": "Login to create a payment order.",
    "topup.rate": "{amount} {asset} via {network}. Credits use RMB cents.",
    "topup.payExactly": "Pay exactly",
    "topup.copyAddress": "Copy address",
    "topup.addressCopied": "Address copied. Transfer the exact amount shown.",
    "topup.invalid": "Enter a valid USDT amount.",
    "topup.creating": "Creating payment order...",
    "topup.created": "Order created. Transfer the exact amount including suffix.",
    "advanced.models": "Advanced Models",
    "advanced.title": "Advanced Generate",
    "advanced.subtitle": "Use Seedance or Wan2.7 parameters after approval.",
    "advanced.promptPlaceholder": "Describe the video you want...",
    "advanced.uploadReference": "Upload reference character",
    "advanced.seedanceHandling": "Seedance image handling",
    "advanced.prepareReference": "Prepare safe reference",
    "advanced.originalImage": "Use original image",
    "advanced.randomSeed": "Random seed",
    "advanced.cases": "Cases",
    "advanced.caseTitle": "Start From A Case",
    "advanced.approvalRequired": "APPROVAL REQUIRED",
    "advanced.inviteOnly": "Advanced generation is invite-only.",
    "advanced.loginFirst": "Login first, then submit an access request.",
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
    "advanced.referenceWan": "Reference selected. Wan2.7 will use the uploaded image as the first frame.",
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
    "advanced.imageTooLarge": "Image must be 8MB or smaller.",
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
    "hero.access.eyebrow": "Tích hợp",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "Nâng cao",
    "hero.advanced.badge": "Quyền",
    "hero.history.eyebrow": "Lịch sử",
    "hero.history.badge": "Bản ghi",
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
    "topup.title": "Nạp USDT",
    "topup.compact": "Nạp",
    "topup.dialogTitle": "Nạp credits",
    "topup.createOrder": "Tạo đơn",
    "topup.login": "Đăng nhập để tạo đơn thanh toán.",
    "topup.rate": "{amount} {asset} qua {network}. Credits tính theo cent RMB.",
    "topup.payExactly": "Thanh toán chính xác",
    "topup.copyAddress": "Sao chép địa chỉ",
    "topup.addressCopied": "Đã sao chép địa chỉ. Chuyển đúng số tiền hiển thị.",
    "topup.invalid": "Nhập số USDT hợp lệ.",
    "topup.creating": "Đang tạo đơn thanh toán...",
    "topup.created": "Đã tạo đơn. Chuyển đúng số tiền gồm phần đuôi.",
    "advanced.models": "Mô hình nâng cao",
    "advanced.title": "Tạo nâng cao",
    "advanced.subtitle": "Dùng tham số Seedance hoặc Wan2.7 sau khi được duyệt.",
    "advanced.promptPlaceholder": "Mô tả video bạn muốn...",
    "advanced.uploadReference": "Tải nhân vật tham chiếu",
    "advanced.seedanceHandling": "Xử lý ảnh Seedance",
    "advanced.prepareReference": "Chuẩn bị ảnh an toàn",
    "advanced.originalImage": "Dùng ảnh gốc",
    "advanced.randomSeed": "Seed ngẫu nhiên",
    "advanced.cases": "Case",
    "advanced.caseTitle": "Bắt đầu từ case",
    "advanced.approvalRequired": "CẦN PHÊ DUYỆT",
    "advanced.inviteOnly": "Tạo nâng cao chỉ dành cho tài khoản được mời.",
    "advanced.loginFirst": "Đăng nhập trước, rồi gửi yêu cầu quyền.",
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
    "advanced.referenceWan": "Đã chọn ảnh tham chiếu. Wan2.7 sẽ dùng ảnh tải lên làm khung đầu.",
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
    "hero.access.eyebrow": "連携",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "高度設定",
    "hero.advanced.badge": "権限",
    "hero.history.eyebrow": "履歴",
    "hero.history.badge": "記録",
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
    "topup.title": "USDT チャージ",
    "topup.compact": "チャージ",
    "topup.dialogTitle": "Credits をチャージ",
    "topup.createOrder": "注文作成",
    "topup.login": "ログインして支払い注文を作成してください。",
    "topup.rate": "{amount} {asset} / {network}。Credits は RMB セントで計算されます。",
    "topup.payExactly": "正確に支払う",
    "topup.copyAddress": "アドレスをコピー",
    "topup.addressCopied": "アドレスをコピーしました。表示金額を正確に送金してください。",
    "topup.invalid": "有効な USDT 金額を入力してください。",
    "topup.creating": "支払い注文を作成中...",
    "topup.created": "注文を作成しました。末尾を含む正確な金額を送金してください。",
    "advanced.models": "高度モデル",
    "advanced.title": "高度生成",
    "advanced.subtitle": "承認後に Seedance または Wan2.7 のパラメータを使用できます。",
    "advanced.promptPlaceholder": "生成したい動画を説明してください...",
    "advanced.uploadReference": "参照キャラクターをアップロード",
    "advanced.seedanceHandling": "Seedance 画像処理",
    "advanced.prepareReference": "安全な参照を準備",
    "advanced.originalImage": "元画像を使用",
    "advanced.randomSeed": "ランダムシード",
    "advanced.cases": "ケース",
    "advanced.caseTitle": "ケースから開始",
    "advanced.approvalRequired": "承認が必要",
    "advanced.inviteOnly": "高度生成は招待制です。",
    "advanced.loginFirst": "先にログインし、アクセス申請を送信してください。",
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
    "advanced.referenceWan": "参照を選択しました。Wan2.7 はアップロード画像を最初のフレームとして使用します。",
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
    "hero.access.eyebrow": "연동",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "고급",
    "hero.advanced.badge": "권한",
    "hero.history.eyebrow": "기록",
    "hero.history.badge": "레코드",
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
    "topup.title": "USDT 충전",
    "topup.compact": "충전",
    "topup.dialogTitle": "Credits 충전",
    "topup.createOrder": "주문 생성",
    "topup.login": "결제 주문을 만들려면 로그인하세요.",
    "topup.rate": "{amount} {asset}, {network}. Credits는 RMB 센트 기준입니다.",
    "topup.payExactly": "정확히 결제",
    "topup.copyAddress": "주소 복사",
    "topup.addressCopied": "주소를 복사했습니다. 표시된 정확한 금액을 전송하세요.",
    "topup.invalid": "올바른 USDT 금액을 입력하세요.",
    "topup.creating": "결제 주문 생성 중...",
    "topup.created": "주문이 생성되었습니다. 접미 금액까지 정확히 전송하세요.",
    "advanced.models": "고급 모델",
    "advanced.title": "고급 생성",
    "advanced.subtitle": "승인 후 Seedance 또는 Wan2.7 파라미터를 사용할 수 있습니다.",
    "advanced.promptPlaceholder": "원하는 비디오를 설명하세요...",
    "advanced.uploadReference": "참조 캐릭터 업로드",
    "advanced.seedanceHandling": "Seedance 이미지 처리",
    "advanced.prepareReference": "안전 참조 준비",
    "advanced.originalImage": "원본 이미지 사용",
    "advanced.randomSeed": "랜덤 시드",
    "advanced.cases": "케이스",
    "advanced.caseTitle": "케이스에서 시작",
    "advanced.approvalRequired": "승인 필요",
    "advanced.inviteOnly": "고급 생성은 초대제로 운영됩니다.",
    "advanced.loginFirst": "먼저 로그인한 뒤 접근 요청을 제출하세요.",
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
    "advanced.referenceWan": "참조가 선택되었습니다. Wan2.7은 업로드한 이미지를 첫 프레임으로 사용합니다.",
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
    "hero.access.eyebrow": "Integrasi",
    "hero.access.badge": "HTTP API",
    "hero.advanced.eyebrow": "Lanjutan",
    "hero.advanced.badge": "Izin",
    "hero.history.eyebrow": "Riwayat",
    "hero.history.badge": "Catatan",
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
    "topup.title": "Top Up USDT",
    "topup.compact": "Top Up",
    "topup.dialogTitle": "Top up credits",
    "topup.createOrder": "Buat order",
    "topup.login": "Login untuk membuat order pembayaran.",
    "topup.rate": "{amount} {asset} via {network}. Credits memakai sen RMB.",
    "topup.payExactly": "Bayar tepat",
    "topup.copyAddress": "Salin alamat",
    "topup.addressCopied": "Alamat disalin. Transfer jumlah yang ditampilkan.",
    "topup.invalid": "Masukkan jumlah USDT yang valid.",
    "topup.creating": "Membuat order pembayaran...",
    "topup.created": "Order dibuat. Transfer jumlah tepat termasuk akhiran.",
    "advanced.models": "Model Lanjutan",
    "advanced.title": "Pembuatan Lanjutan",
    "advanced.subtitle": "Gunakan parameter Seedance atau Wan2.7 setelah disetujui.",
    "advanced.promptPlaceholder": "Jelaskan video yang Anda inginkan...",
    "advanced.uploadReference": "Unggah karakter referensi",
    "advanced.seedanceHandling": "Penanganan gambar Seedance",
    "advanced.prepareReference": "Siapkan referensi aman",
    "advanced.originalImage": "Gunakan gambar asli",
    "advanced.randomSeed": "Seed acak",
    "advanced.cases": "Case",
    "advanced.caseTitle": "Mulai Dari Case",
    "advanced.approvalRequired": "PERLU PERSETUJUAN",
    "advanced.inviteOnly": "Pembuatan lanjutan hanya untuk undangan.",
    "advanced.loginFirst": "Login dulu, lalu ajukan akses.",
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
    "advanced.referenceWan": "Referensi dipilih. Wan2.7 akan memakai gambar unggahan sebagai frame pertama.",
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

const PUBLIC_COPY = {
  galleryTitle: "Create AI videos",
  gallerySubtitle: "Choose a template, upload an image or enter text, and create a new video.",
  galleryNotice: "Generated results are saved in your history.",
  accessTitle: "API Access",
  accessSubtitle: "Connect your product or workflow to the production generation API.",
  accessNotice: "Only the required parameters and response format are shown here.",
  advancedTitle: "Advanced Generate",
  advancedSubtitle: "Direct Seedance controls for approved accounts.",
  advancedNotice: "Approval is required before direct generation is enabled.",
  historyTitle: "Generation History",
  historySubtitle: "Review your generated videos, prompts, parameters and billing in one compact list.",
  historyNotice: "Only your own generation records are shown.",
  accessCopy:
    "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>",
};

let ACCESS_GUIDES = [
  {
    id: "http",
    title: "HTTP API",
    subtitle: "Available now",
    desc: "This is the live integration path. Submit a generation job, then query history or a task detail for progress and result video.",
    copy:
      "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>",
  },
];

const LIVE_HTTP_ACCESS_COPY = `POST https://123vips.com/api/platform/generate
Authorization: Bearer <user-token>
Content-Type: application/json

Gallery template:
{
  "templateId": "template-id",
  "dataUrl": "data:image/png;base64,...",
  "prompt": ""
}

Advanced Seedance:
POST https://123vips.com/api/advanced/generate
{
  "provider": "seedance",
  "prompt": "your prompt",
  "dataUrl": "data:image/png;base64,...",
  "resolution": "720p",
  "duration": 5,
  "preprocessReference": true
}

Advanced Wan2.7:
POST https://123vips.com/api/advanced/generate
{
  "provider": "wan27",
  "prompt": "your prompt",
  "dataUrl": "data:image/png;base64,...",
  "resolution": "1080p",
  "duration": 5
}`;

const TYPE_SCRIPT_ACCESS_COPY = `const token = "<user-token>";
const galleryBody = {
  templateId: "template-id",
  dataUrl: "data:image/png;base64,...",
  prompt: ""
};

const advancedBody = {
  provider: "wan27", // "seedance" or "wan27"
  prompt: "your prompt",
  dataUrl: "data:image/png;base64,...",
  resolution: "720p",
  duration: 5,
  preprocessReference: true
};

const res = await fetch("https://123vips.com/api/advanced/generate", {
  method: "POST",
  headers: {
    authorization: \`Bearer \${token}\`,
    "content-type": "application/json"
  },
  body: JSON.stringify(advancedBody)
});
console.log(await res.json());`;

const PYTHON_ACCESS_COPY = `import requests

token = "<user-token>"
gallery_payload = {
    "templateId": "template-id",
    "dataUrl": "data:image/png;base64,...",
    "prompt": "",
}

advanced_payload = {
    "provider": "seedance",  # or "wan27"
    "prompt": "your prompt",
    "dataUrl": "data:image/png;base64,...",
    "resolution": "720p",
    "duration": 5,
    "preprocessReference": True,
}

resp = requests.post(
    "https://123vips.com/api/advanced/generate",
    headers={"Authorization": f"Bearer {token}"},
    json=advanced_payload,
    timeout=120,
)
print(resp.json())`;

const CLI_ACCESS_COPY = `curl -X POST "https://123vips.com/api/platform/generate" \\
  -H "Authorization: Bearer <user-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"templateId":"template-id","dataUrl":"data:image/png;base64,...","prompt":""}'

curl -X POST "https://123vips.com/api/advanced/generate" \\
  -H "Authorization: Bearer <user-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"provider":"wan27","prompt":"your prompt","dataUrl":"data:image/png;base64,...","resolution":"1080p","duration":5}'`;

const AGENT_ACCESS_COPY = `Use this video API:
Gallery templates:
POST https://123vips.com/api/platform/generate
Authorization: Bearer <user-token>
Body:
{"templateId":"template-id","dataUrl":"data:image/png;base64,...","prompt":""}

Advanced direct generation:
POST https://123vips.com/api/advanced/generate
Body:
{"provider":"seedance","prompt":"your prompt","dataUrl":"data:image/png;base64,...","resolution":"720p","duration":5,"preprocessReference":true}
or:
{"provider":"wan27","prompt":"your prompt","dataUrl":"data:image/png;base64,...","resolution":"1080p","duration":5}

Check records:
GET https://123vips.com/api/generation-records`;

const MCP_ACCESS_COPY = `MCP wrapper target:
POST https://123vips.com/api/platform/generate
Authorization: Bearer <user-token>
Input:
{"templateId":"string","dataUrl":"string","prompt":"string"}

Advanced MCP wrapper target:
POST https://123vips.com/api/advanced/generate
Authorization: Bearer <user-token>
Input:
{"provider":"seedance|wan27","prompt":"string","dataUrl":"data:image/png;base64,...","resolution":"720p|1080p","duration":5,"preprocessReference":true,"seed":123456 optional}`;

PUBLIC_COPY.galleryTitle = "Create AI videos";
PUBLIC_COPY.gallerySubtitle = "Choose a template, upload an image or enter text, and create a new video.";
PUBLIC_COPY.galleryNotice = "Generated results are saved in your history.";
PUBLIC_COPY.accessTitle = "API Access";
PUBLIC_COPY.accessSubtitle = "Connect your product, scripts, agents, or MCP wrapper to the production generation API.";
PUBLIC_COPY.accessNotice = "All examples below call the current production API. Upstream JSON stays server-side.";
PUBLIC_COPY.accessCopy = LIVE_HTTP_ACCESS_COPY;
PUBLIC_COPY.advancedTitle = "Advanced Generate";
PUBLIC_COPY.advancedSubtitle = "Direct model controls for approved accounts.";
PUBLIC_COPY.advancedNotice = "Apply once. After approval, cases can fill the form automatically.";
PUBLIC_COPY.historyTitle = "Generation History";
PUBLIC_COPY.historySubtitle = "Review your generated videos, prompts, parameters and billing in one compact list.";
PUBLIC_COPY.historyNotice = "Only your own generation records are shown.";

ACCESS_GUIDES = [
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

let activeAccessGuide = ACCESS_GUIDES[0];
let historyLoading = false;
const SUPPORTED_LANGS = new Set(Object.keys(I18N));
if (!SUPPORTED_LANGS.has(state.lang)) state.lang = "en";

function refreshIcons() {
  window.lucide?.createIcons();
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

function localizedPublicCopy(configValue, key) {
  const fallback = t(`copy.${key}`, {}, PUBLIC_COPY[key] || "");
  if (state.lang !== "en") return fallback;
  return cleanPublicCopy(configValue, fallback);
}

function guideText(guide, field) {
  return t(`guide.${guide.id}.${field}`, {}, guide[field] || "");
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

function applyLanguage() {
  applyStaticTranslations();
  renderHero();
  renderCategories();
  renderTemplates();
  renderAccessGuides();
  renderAdvanced();
  renderTopupSummary();
  renderTokenDisplays();
  renderLoginMode();
  updateSubmitButtonCost();
  updateAdvancedButtonCost();
  if (state.tab === "history" && !historyLoading) loadHistory();
  refreshIcons();
}

function setLanguage(lang) {
  const next = SUPPORTED_LANGS.has(lang) ? lang : "en";
  state.lang = next;
  localStorage.setItem(LANG_KEY, next);
  applyLanguage();
}

function setUser(user, { refreshHistory = false } = {}) {
  state.user = user || null;
  if (state.user) {
    els.loginBtn.textContent = `${state.user.username} · ${Number(state.user.credits || 0)} ${t("common.credits")}`;
  } else {
    els.loginBtn.textContent = t("nav.login");
  }
  renderTokenDisplays();
  renderTopupSummary();
  renderAccessGuides();
  renderAdvanced();
  if (refreshHistory && state.tab === "history") loadHistory();
}

function maskToken(token = "") {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 3)}...${value.slice(-3)}`;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function currentTokenLabel(showFull = false) {
  if (!state.token || !state.user) return t("access.tokenLogin");
  return showFull ? state.token : maskToken(state.token);
}

function hydrateAccessCopy(copy = "", { revealToken = false } = {}) {
  const token = state.token && state.user ? state.token : "<user-token>";
  const tokenLabel = state.token && state.user ? (revealToken ? token : maskToken(token)) : "<user-token>";
  return String(copy || PUBLIC_COPY.accessCopy).replaceAll("<user-token>", tokenLabel);
}

function fullAccessCopy() {
  return hydrateAccessCopy(activeAccessGuide.copy, { revealToken: true });
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
    els.copyTokenBtn.disabled = !state.token || !state.user;
  }
  if (els.accountName) els.accountName.textContent = state.user?.username || t("account.title");
  if (els.accountCredits) els.accountCredits.textContent = String(Number(state.user?.credits || 0));
  if (els.accountRole) els.accountRole.textContent = state.user?.role || "user";
  if (els.accountToken) els.accountToken.textContent = currentTokenLabel(state.showAccountToken);
  if (els.toggleAccountTokenBtn) {
    els.toggleAccountTokenBtn.textContent = state.showAccountToken ? t("common.hide") : t("common.showFull");
    els.toggleAccountTokenBtn.disabled = !state.token || !state.user;
  }
  if (els.copyAccountTokenBtn) {
    els.copyAccountTokenBtn.disabled = !state.token || !state.user;
  }
}

function generationVideoUrl(record) {
  return record?.videoUrl || record?.localVideoUrl || record?.remoteVideoUrl || "";
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return t("status.completed");
  if (["failed", "error", "cancelled", "canceled"].includes(value)) return t("status.failed");
  if (["running", "processing", "in_progress"].includes(value)) return t("status.processing");
  return status || t("status.submitted");
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

function formatDurationSeconds(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return "";
  return t("cost.seconds", { value: Number.isInteger(next) ? next : next.toFixed(1).replace(/0+$/, "").replace(/\.$/, "") });
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

function updateSubmitButtonCost() {
  if (!els.submitTemplateBtn) return;
  const templateId = state.activeTemplate?.id || "";
  els.submitTemplateBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>${escapeHtml(templateGenerateLabel(templateId))}`;
  refreshIcons();
}

function advancedCaseDuration(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  const duration = Number(params.duration ?? item.duration ?? 5);
  if (!Number.isFinite(duration)) return 5;
  return Math.min(15, Math.max(5, duration));
}

function normalizeAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalized === "wan27" || normalized === "wan2.7" || normalized === "wan" ? "wan27" : "seedance";
}

function advancedCaseProvider(item = {}) {
  const params = item.params && typeof item.params === "object" ? item.params : {};
  return normalizeAdvancedProvider(item.provider || params.provider || params.modelProvider || params.model_provider || "seedance");
}

function normalizeAdvancedResolution(value = "", provider = "seedance") {
  const raw = String(value || "").trim().toLowerCase();
  if (normalizeAdvancedProvider(provider) === "wan27") return raw === "1080p" ? "1080p" : "720p";
  return raw || "720p";
}

function advancedDurationBounds(provider = "seedance") {
  return normalizeAdvancedProvider(provider) === "wan27"
    ? { min: 2, max: 15, fallback: 5 }
    : { min: 5, max: 15, fallback: 5 };
}

function advancedPricing(duration, provider = "seedance", resolution = "720p") {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const bounds = advancedDurationBounds(normalizedProvider);
  const rawSeconds = Number(duration || bounds.fallback);
  const seconds = Number.isFinite(rawSeconds) ? Math.min(bounds.max, Math.max(bounds.min, rawSeconds)) : bounds.fallback;
  const configPricing = state.config?.platform?.advancedPricing || {};
  if (normalizedProvider === "wan27") {
    const normalizedResolution = normalizeAdvancedResolution(resolution, normalizedProvider);
    const byResolution = configPricing.wan27CreditsPerSecondByResolution || {};
    const fallbackPerSecond = normalizedResolution === "1080p" ? ADVANCED_WAN27_1080P_CREDITS_PER_SECOND : ADVANCED_WAN27_720P_CREDITS_PER_SECOND;
    const perSecond = Number(byResolution[normalizedResolution] || fallbackPerSecond) || fallbackPerSecond;
    return {
      provider: "wan27",
      duration: seconds,
      resolution: normalizedResolution,
      credits: Math.max(0, Math.round(seconds * perSecond)),
    };
  }
  const seedancePerSecond = Number(configPricing.seedanceCreditsPerSecond || ADVANCED_SEEDANCE_CREDITS_PER_SECOND) || ADVANCED_SEEDANCE_CREDITS_PER_SECOND;
  return {
    provider: "seedance",
    duration: seconds,
    resolution: normalizeAdvancedResolution(resolution, normalizedProvider),
    credits: Math.max(0, Math.round(seconds * seedancePerSecond)),
  };
}

function advancedCostForDuration(duration, provider = "seedance", resolution = "720p") {
  return advancedPricing(duration, provider, resolution).credits;
}

function currentAdvancedProvider() {
  return normalizeAdvancedProvider(els.advancedProvider?.value || "seedance");
}

function currentAdvancedResolution() {
  return normalizeAdvancedResolution(els.advancedResolution?.value || "720p", currentAdvancedProvider());
}

function advancedCostLabel(duration, provider = "seedance", resolution = "720p") {
  const pricing = advancedPricing(duration, provider, resolution);
  const suffix = pricing.provider === "wan27" ? ` - ${pricing.resolution}` : "";
  return `${t("cost.creditsDuration", { credits: formatCredits(pricing.credits), duration: formatDurationSeconds(pricing.duration) })}${suffix}`;
}

function updateAdvancedButtonCost() {
  if (!els.advancedSubmitBtn) return;
  const rawDuration = Number(els.advancedDuration?.value || 5);
  const bounds = advancedDurationBounds(currentAdvancedProvider());
  const duration = Number.isFinite(rawDuration) ? Math.min(bounds.max, Math.max(bounds.min, rawDuration)) : bounds.fallback;
  els.advancedSubmitBtn.innerHTML = `<i data-lucide="sparkles"></i>${escapeHtml(t("template.generate", { cost: advancedCostLabel(duration, currentAdvancedProvider(), currentAdvancedResolution()) }))}`;
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
  state.tab = tab;
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  renderHero();
  if (tab === "history") loadHistory();
}

function renderHero() {
  if (state.tab === "access") {
    els.heroEyebrow.textContent = t("hero.access.eyebrow");
    els.heroTitle.textContent = t("copy.accessTitle");
    els.heroSubtitle.textContent = t("copy.accessSubtitle");
    els.heroBadge.textContent = t("hero.access.badge");
    els.heroNotice.textContent = t("copy.accessNotice");
    return;
  }
  if (state.tab === "advanced") {
    els.heroEyebrow.textContent = t("hero.advanced.eyebrow");
    els.heroTitle.textContent = t("copy.advancedTitle");
    els.heroSubtitle.textContent = t("copy.advancedSubtitle");
    els.heroBadge.textContent = t("hero.advanced.badge");
    els.heroNotice.textContent = t("copy.advancedNotice");
    return;
  }
  if (state.tab === "history") {
    els.heroEyebrow.textContent = t("hero.history.eyebrow");
    els.heroTitle.textContent = t("copy.historyTitle");
    els.heroSubtitle.textContent = t("copy.historySubtitle");
    els.heroBadge.textContent = t("hero.history.badge");
    els.heroNotice.textContent = t("copy.historyNotice");
    return;
  }
  const platform = state.config?.platform || {};
  els.heroEyebrow.textContent = t("hero.gallery.eyebrow");
  els.heroTitle.textContent = localizedPublicCopy(platform.heroTitle, "galleryTitle");
  els.heroSubtitle.textContent = localizedPublicCopy(platform.heroSubtitle, "gallerySubtitle");
  els.heroBadge.textContent = t("hero.gallery.badge");
  els.heroNotice.textContent = localizedPublicCopy(platform.notice, "galleryNotice");
}

function setCategory(category) {
  state.category = category;
  renderCategories();
  renderTemplates();
}

function renderCategories() {
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

function renderTemplates() {
  const list = state.templates.filter((template) => {
    if (isHiddenCategory({ id: template.category, name: template.category })) return false;
    if (state.category !== "all" && template.category !== state.category) return false;
    return true;
  });

  els.templateGrid.innerHTML = list.length ? list.map((template) => `
    <article class="template-card">
      <img class="template-cover" src="${escapeHtml(template.coverUrl || "/assets/admin/home/default-hero.jpg")}" alt="${escapeHtml(localizedTemplateTitle(template))}" loading="lazy" />
      ${template.previewUrl ? `<button class="preview-play" data-preview-id="${escapeHtml(template.id)}" type="button" aria-label="${escapeHtml(t("common.preview"))}"><i data-lucide="play"></i><span>${escapeHtml(t("common.preview"))}</span></button>` : ""}
      <div class="template-meta">
        <span>${escapeHtml(localizedTemplateBadge(template))}</span>
        <strong>${escapeHtml(localizedTemplateTitle(template))}</strong>
        <p>${escapeHtml(template.prompt || "").slice(0, 72)}${String(template.prompt || "").length > 72 ? "..." : ""}</p>
        <button class="use-template" data-template-id="${escapeHtml(template.id)}" type="button">${escapeHtml(templateGenerateLabel(template.id))}</button>
      </div>
    </article>
  `).join("") : `<div class="job-note">${escapeHtml(t("gallery.noTemplates"))}</div>`;

  els.templateGrid.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => openTemplate(button.dataset.templateId));
  });
  els.templateGrid.querySelectorAll("[data-preview-id]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openPreview(button.dataset.previewId);
    }, { capture: true });
  });
  refreshIcons();
}

function isHiddenCategory(category) {
  const value = `${category?.id || ""} ${category?.name || ""}`.toLowerCase();
  return value.includes("business") || value.includes("商业接入");
}

function playPreview({ title = "", previewUrl = "" } = {}) {
  if (!previewUrl || !els.previewDialog || !els.previewVideo) return;
  els.previewTitle.textContent = title || t("common.preview");
  els.previewVideo.pause();
  els.previewVideo.src = previewUrl;
  els.previewVideo.load();
  if (!els.previewDialog.open) els.previewDialog.showModal();
  window.setTimeout(() => els.previewVideo.play().catch(() => {}), 80);
}

function openPreview(templateId) {
  const template = state.templates.find((item) => item.id === templateId);
  playPreview({ title: template?.title, previewUrl: template?.previewUrl });
}

function openAdvancedPreview(index) {
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  const item = cases[Number(index || 0)];
  playPreview({ title: item?.title, previewUrl: item?.previewUrl });
}

function walletCreditsForAmount(amount) {
  const rate = Number(state.wallet?.cnyCentsPerUsdt || 720);
  return Math.max(0, Math.round(Number(amount || 0) * rate));
}

function renderTopupSummary() {
  if (!els.topupPanel) return;
  if (els.topupOrder && !els.topupOrder.hidden) return;
  const amount = Number(els.topupAmount?.value || 0);
  const credits = walletCreditsForAmount(amount);
  const asset = state.wallet?.asset || "USDT";
  const network = state.wallet?.network || "TRC20";
  if (els.topupCredits) els.topupCredits.textContent = t("cost.credits", { credits });
  if (els.topupTriggerCredits) {
    els.topupTriggerCredits.hidden = !state.user;
    els.topupTriggerCredits.textContent = state.user ? formatCredits(Number(state.user.credits || 0)) : "";
  }
  if (els.topupRate) {
    els.topupRate.textContent = state.user
      ? t("topup.rate", { amount: amount || 0, asset, network })
      : t("topup.login");
  }
}

function renderTopupOrder(order) {
  if (!els.topupOrder || !order) return;
  els.topupOrder.hidden = false;
  els.topupOrder.innerHTML = `
    <div>
      <span>${escapeHtml(t("topup.payExactly"))}</span>
      <strong>${escapeHtml(order.payableAmountText || order.payableAmount || order.baseAmount)} ${escapeHtml(order.asset || "USDT")}</strong>
      <small>${escapeHtml(order.network || "")} · ${escapeHtml(t("cost.credits", { credits: order.creditAmount || 0 }))} · ${escapeHtml(order.status || "pending")}</small>
    </div>
    <code>${escapeHtml(order.address || "")}</code>
    <button class="ghost-button" type="button" data-copy-address><i data-lucide="copy"></i>${escapeHtml(t("topup.copyAddress"))}</button>
  `;
  els.topupOrder.querySelector("[data-copy-address]")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(order.address || "").then(() => {
      if (els.topupRate) els.topupRate.textContent = t("topup.addressCopied");
    });
  });
  if (els.topupCredits) els.topupCredits.textContent = t("cost.credits", { credits: order.creditAmount || 0 });
  refreshIcons();
}

async function createTopupOrder() {
  if (!state.user) return openLogin();
  const amount = Number(els.topupAmount?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    if (els.topupRate) els.topupRate.textContent = t("topup.invalid");
    return;
  }
  els.createTopupBtn.disabled = true;
  if (els.topupRate) els.topupRate.textContent = t("topup.creating");
  try {
    const payload = await requestJson("/api/pay/orders", {
      method: "POST",
      body: { amount },
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
  els.accessTabs.innerHTML = ACCESS_GUIDES.map((guide) => `
    <button class="access-tab ${activeAccessGuide.id === guide.id ? "is-active" : ""}" data-access-guide="${escapeHtml(guide.id)}" type="button">
      <strong>${escapeHtml(guideText(guide, "title"))}</strong>
      <span>${escapeHtml(guideText(guide, "subtitle"))}</span>
    </button>
  `).join("");
  els.accessGuideTitle.textContent = guideText(activeAccessGuide, "title");
  els.accessGuideDesc.textContent = guideText(activeAccessGuide, "desc");
  els.accessCopy.textContent = hydrateAccessCopy(activeAccessGuide.copy || PUBLIC_COPY.accessCopy, { revealToken: state.showAccessToken });
  renderTokenDisplays();
  els.accessTabs.querySelectorAll("[data-access-guide]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAccessGuide = ACCESS_GUIDES.find((guide) => guide.id === button.dataset.accessGuide) || ACCESS_GUIDES[0];
      renderAccessGuides();
      refreshIcons();
    });
  });
}

function userHasAdvancedAccess() {
  return state.user?.role === "admin" || state.user?.advancedAccess === true;
}

function renderAdvanced() {
  if (!els.advancedGate || !els.advancedWorkspace) return;
  if (!state.user) {
    els.advancedWorkspace.hidden = true;
    els.advancedGate.innerHTML = `
      <div class="permission-card">
        <span class="copy-kicker"><i data-lucide="lock-keyhole"></i>${escapeHtml(t("advanced.approvalRequired"))}</span>
        <h2>${escapeHtml(t("advanced.inviteOnly"))}</h2>
        <p>${escapeHtml(t("advanced.loginFirst"))}</p>
        <button class="generate-btn" id="advancedLoginBtn" type="button">${escapeHtml(t("nav.login"))}</button>
      </div>
    `;
    document.querySelector("#advancedLoginBtn")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  if (!userHasAdvancedAccess()) {
    const requested = Boolean(state.user.advancedAccessRequestedAt);
    const telegram = state.config?.platform?.advanced?.telegram || "";
    els.advancedWorkspace.hidden = true;
    els.advancedGate.innerHTML = `
      <div class="permission-card">
        <span class="copy-kicker"><i data-lucide="shield-check"></i>${escapeHtml(t("advanced.approvalRequired"))}</span>
        <h2>${escapeHtml(requested ? t("advanced.requestSubmittedTitle") : t("advanced.requestTitle"))}</h2>
        <p>${escapeHtml(requested ? t("advanced.requestSubmittedDesc") : t("advanced.requestDesc"))}</p>
        ${telegram ? `<a class="ghost-button" href="${escapeHtml(telegram)}" target="_blank" rel="noopener">${escapeHtml(t("advanced.contactSupport"))}</a>` : ""}
        <button class="generate-btn" id="requestAdvancedBtn" type="button" ${requested ? "disabled" : ""}>${escapeHtml(requested ? t("advanced.waitingApproval") : t("advanced.applyAccess"))}</button>
      </div>
    `;
    document.querySelector("#requestAdvancedBtn")?.addEventListener("click", requestAdvancedAccess);
    refreshIcons();
    return;
  }
  els.advancedGate.innerHTML = "";
  els.advancedWorkspace.hidden = false;
  renderAdvancedCases();
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
}

function updateAdvancedModelControls() {
  const provider = currentAdvancedProvider();
  const bounds = advancedDurationBounds(provider);
  if (els.advancedDuration) {
    els.advancedDuration.min = String(bounds.min);
    els.advancedDuration.max = String(bounds.max);
  }
  document.querySelectorAll(".advanced-wan-option").forEach((item) => {
    item.hidden = provider !== "wan27";
  });
  document.querySelectorAll(".advanced-seedance-option").forEach((item) => {
    item.hidden = provider !== "seedance";
  });
  if (els.advancedNote && state.advancedUploadDataUrl) {
    if (provider === "seedance") {
      const mode = els.advancedPreprocessReference?.value === "no" ? t("advanced.originalReference") : t("advanced.safeReference");
      els.advancedNote.textContent = t("advanced.referenceSeedance", { mode });
    } else {
      els.advancedNote.textContent = t("advanced.referenceWan");
    }
  }
  updateAdvancedButtonCost();
}

function renderAdvancedCases() {
  if (!els.advancedCaseGrid) return;
  const cases = state.advancedCases.filter((item) => item.enabled !== false);
  els.advancedCaseGrid.innerHTML = cases.length ? cases.map((item, index) => `
    <article class="advanced-case-card" data-case-index="${index}">
      <img src="${escapeHtml(item.coverUrl || item.previewUrl || "/assets/admin/home/default-hero.jpg")}" alt="${escapeHtml(item.title || t("advanced.defaultCase"))}" loading="lazy" />
      ${item.previewUrl ? `<button class="preview-play advanced-preview-play" data-advanced-preview-index="${index}" type="button" aria-label="${escapeHtml(t("common.preview"))}"><i data-lucide="play"></i></button>` : ""}
      <div>
        <span>${escapeHtml(item.category || t("advanced.cases"))} - ${escapeHtml(advancedCostLabel(advancedCaseDuration(item), advancedCaseProvider(item), item.params?.resolution))}</span>
        <strong>${escapeHtml(item.title || t("advanced.defaultCase"))}</strong>
        <p>${escapeHtml(item.description || item.prompt || "").slice(0, 96)}</p>
      </div>
    </article>
  `).join("") : `<div class="job-note">${escapeHtml(t("advanced.noCases"))}</div>`;
  els.advancedCaseGrid.querySelectorAll("[data-case-index]").forEach((card) => {
    card.addEventListener("click", () => fillAdvancedCase(cases[Number(card.dataset.caseIndex || 0)]));
  });
  els.advancedCaseGrid.querySelectorAll("[data-advanced-preview-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAdvancedPreview(button.dataset.advancedPreviewIndex);
    });
  });
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
  if (els.advancedPreprocessReference) els.advancedPreprocessReference.value = params.preprocessReference === false ? "no" : "yes";
  if (els.advancedWanSeed) els.advancedWanSeed.value = params.seed || "";
  updateAdvancedModelControls();
  updateAdvancedButtonCost();
  if (els.advancedNote) {
    els.advancedNote.textContent = t("advanced.loadedCase", {
      title: item.title || t("advanced.defaultCase"),
      cost: advancedCostLabel(advancedCaseDuration(item), provider, params.resolution),
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
  if (!userHasAdvancedAccess()) return renderAdvanced();
  const prompt = els.advancedPrompt?.value.trim() || "";
  if (!prompt) {
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.promptRequired");
    return;
  }
  const currentCase = state.advancedCases.find((item) => item.id === state.activeAdvancedCaseId);
  if (currentCase?.prompt && currentCase.prompt !== prompt) state.activeAdvancedCaseId = "";
  els.advancedSubmitBtn.disabled = true;
  const provider = currentAdvancedProvider();
  const bounds = advancedDurationBounds(provider);
  const duration = Math.min(bounds.max, Math.max(bounds.min, Number(els.advancedDuration?.value || bounds.fallback)));
  const resolution = currentAdvancedResolution();
  const preprocessReference = els.advancedPreprocessReference?.value !== "no";
  const referenceNote = state.advancedUploadDataUrl
    ? provider === "seedance"
      ? (preprocessReference ? t("advanced.notePrepare") : t("advanced.noteOriginal"))
      : t("advanced.noteWan")
    : "";
  if (els.advancedNote) {
    els.advancedNote.textContent = t("advanced.submitting", {
      note: referenceNote,
      cost: advancedCostLabel(duration, provider, resolution),
    });
  }
  try {
    const payload = await requestJson("/api/advanced/generate", {
      method: "POST",
      body: {
        caseId: state.activeAdvancedCaseId,
        provider,
        prompt,
        dataUrl: state.advancedUploadDataUrl,
        fileName: els.advancedImage?.files?.[0]?.name || "",
        ratio: els.advancedRatio?.value || "9:16",
        resolution: els.advancedResolution?.value || "720p",
        duration,
        preprocessReference,
        seed: els.advancedWanSeed?.value || "",
      },
    });
    if (payload.user) setUser(payload.user);
    const charged = payload.cost ?? advancedCostForDuration(duration, provider, resolution);
    if (els.advancedNote) {
      els.advancedNote.textContent = t("advanced.jobSubmitted", {
        taskId: payload.taskId || payload.task?.taskId || "",
        credits: formatCredits(charged),
      });
    }
    loadHistory();
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
  if (!state.user) {
    els.historyList.innerHTML = `
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
  if (!records.length) {
    els.historyList.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("history.emptyTitle"))}</strong><p>${escapeHtml(t("history.emptyDesc"))}</p></div>`;
    return;
  }
  els.historyList.innerHTML = records.map((record) => {
    const videoUrl = generationVideoUrl(record);
    const title = record.templateTitle || record.sceneEntryName || record.sceneName || t("history.job");
    const created = record.createdAt ? new Date(record.createdAt).toLocaleString() : "";
    const duration = record.duration ? `${record.duration}s` : "";
    const cost = billingLabel(record.billing || {});
    return `
      <article class="history-item">
        <div class="history-media">
          ${videoUrl ? `<video src="${escapeHtml(videoUrl)}" controls playsinline preload="metadata"></video>` : `<div class="history-placeholder"><i data-lucide="loader-circle"></i><span>${escapeHtml(statusLabel(record.status))}</span></div>`}
        </div>
        <div class="history-info">
          <header>
            <div>
              <strong>${escapeHtml(title)}</strong>
              <small>${escapeHtml(record.taskId || "")}</small>
            </div>
            <small>${escapeHtml(statusLabel(record.status))}</small>
          </header>
          <div class="history-meta">
            ${record.model ? `<span>${escapeHtml(record.model)}</span>` : ""}
            ${record.provider ? `<span>${escapeHtml(record.provider)}</span>` : ""}
            ${duration ? `<span>${escapeHtml(duration)}</span>` : ""}
            <span>${escapeHtml(cost)}</span>
            ${created ? `<span>${escapeHtml(created)}</span>` : ""}
          </div>
          <details class="history-details">
            <summary>${escapeHtml(t("history.viewParameters"))}</summary>
            <pre>${escapeHtml(JSON.stringify({ taskId: record.taskId || "", provider: record.provider || "", source: record.source || "", prompt: record.finalPrompt || record.prompt || "", params: record.params || null, ratio: record.ratio, resolution: record.resolution, duration: record.duration, billing: record.billing || null }, null, 2))}</pre>
          </details>
        </div>
      </article>
    `;
  }).join("");
  refreshIcons();
}

async function loadHistory() {
  if (!els.historyList) return;
  if (!state.user) {
    renderHistory([]);
    return;
  }
  if (historyLoading) return;
  historyLoading = true;
  els.historyList.innerHTML = `<div class="job-note">${escapeHtml(t("history.loading"))}</div>`;
  try {
    const payload = await requestJson("/api/generation-records?limit=50");
    if (payload.user) setUser(payload.user);
    renderHistory(payload.records || []);
  } catch (error) {
    els.historyList.innerHTML = `<div class="job-note">${escapeHtml(t("history.loadFailed", { message: error.message || String(error) }))}</div>`;
  } finally {
    historyLoading = false;
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
  localStorage.removeItem(TOKEN_KEY);
  els.accountDialog?.close();
  setUser(null);
  if (state.tab === "history") renderHistory([]);
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
    if (state.tab === "history") loadHistory();
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
  state.templates = platform.templates || [];
  state.categories = platform.categories || [];
  state.advancedCases = platform.advanced?.cases || [];
  els.brandName.textContent = platform.brand || "Vipeak AI";
  renderHero();
  renderCategories();
  renderTemplates();
  renderAccessGuides();
  renderAdvanced();
  renderTopupSummary();
  renderTokenDisplays();
  refreshIcons();
  loadPlatformEstimates();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});
els.templateImage?.addEventListener("change", async () => {
  const file = els.templateImage.files?.[0];
  if (!file) return;
  state.uploadDataUrl = await readFileAsDataUrl(file);
  els.uploadPreview.src = state.uploadDataUrl;
  els.uploadBox.classList.add("has-image");
});
els.advancedImage?.addEventListener("change", async () => {
  const file = els.advancedImage.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    state.advancedUploadDataUrl = "";
    els.advancedImage.value = "";
    els.advancedUploadBox?.classList.remove("has-image");
    if (els.advancedUploadPreview) els.advancedUploadPreview.removeAttribute("src");
    if (els.advancedNote) els.advancedNote.textContent = t("advanced.imageTooLarge");
    return;
  }
  state.advancedUploadDataUrl = await readFileAsDataUrl(file);
  if (els.advancedUploadPreview) els.advancedUploadPreview.src = state.advancedUploadDataUrl;
  els.advancedUploadBox?.classList.add("has-image");
  updateAdvancedModelControls();
});
els.submitTemplateBtn?.addEventListener("click", submitTemplate);
els.refreshHistoryBtn?.addEventListener("click", loadHistory);
els.topupAmount?.addEventListener("input", () => {
  if (els.topupOrder) {
    els.topupOrder.hidden = true;
    els.topupOrder.innerHTML = "";
  }
  renderTopupSummary();
});
els.createTopupBtn?.addEventListener("click", createTopupOrder);
els.topupTriggerBtn?.addEventListener("click", () => {
  renderTopupSummary();
  if (!els.topupDialog?.open) els.topupDialog?.showModal();
  refreshIcons();
});
els.previewDialog?.addEventListener("close", () => {
  if (!els.previewVideo) return;
  els.previewVideo.pause();
  els.previewVideo.removeAttribute("src");
  els.previewVideo.load();
});
els.advancedSubmitBtn?.addEventListener("click", submitAdvancedGenerate);
els.advancedDuration?.addEventListener("input", updateAdvancedButtonCost);
els.advancedProvider?.addEventListener("change", updateAdvancedModelControls);
els.advancedResolution?.addEventListener("change", updateAdvancedButtonCost);
els.advancedPreprocessReference?.addEventListener("change", updateAdvancedModelControls);
els.loginBtn?.addEventListener("click", () => {
  if (state.user) openAccount();
  else openLogin();
});
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
  if (!state.token || !state.user) return openLogin();
  await navigator.clipboard.writeText(state.token);
  els.copyTokenBtn.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("common.copiedToken"))}`;
  refreshIcons();
  setTimeout(() => {
    els.copyTokenBtn.innerHTML = `<i data-lucide="key-round"></i>${escapeHtml(t("common.copyToken"))}`;
    refreshIcons();
  }, 1600);
});
els.toggleAccountTokenBtn?.addEventListener("click", () => {
  state.showAccountToken = !state.showAccountToken;
  renderTokenDisplays();
});
els.copyAccountTokenBtn?.addEventListener("click", async () => {
  if (!state.token || !state.user) return openLogin();
  await navigator.clipboard.writeText(state.token);
  els.copyAccountTokenBtn.innerHTML = `<i data-lucide="check"></i>${escapeHtml(t("common.copied"))}`;
  refreshIcons();
  setTimeout(() => {
    els.copyAccountTokenBtn.innerHTML = `<i data-lucide="copy"></i>${escapeHtml(t("common.copyToken"))}`;
    refreshIcons();
  }, 1600);
});
els.logoutAccountBtn?.addEventListener("click", logout);

applyLanguage();

bootstrap().catch((error) => {
  document.body.insertAdjacentHTML("beforeend", `<div class="job-note" style="position:fixed;left:20px;bottom:20px;background:#11182b;padding:14px 16px;border-radius:14px;">${escapeHtml(error.message)}</div>`);
});
