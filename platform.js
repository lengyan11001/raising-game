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
  topupRecords: { page: 1, limit: 12, total: 0, totalPages: 1, records: [] },
  spendingRecords: { page: 1, limit: 12, total: 0, totalPages: 1, records: [], types: [] },
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
  legalDialog: document.querySelector("#legalDialog"),
  legalTitle: document.querySelector("#legalTitle"),
  legalBody: document.querySelector("#legalBody"),
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
    "hero.history.eyebrow": "History",
    "hero.history.badge": "Records",
    "hero.topups.eyebrow": "Billing",
    "hero.topups.badge": "Top-ups",
    "hero.spending.eyebrow": "Billing",
    "hero.spending.badge": "Credits",
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
    "topups.subtitle": "Search and export your USDT top-up orders.",
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
    "topups.subtitle": "Tìm kiếm và xuất các đơn nạp USDT.",
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
    "topups.subtitle": "USDT チャージ注文を検索、エクスポートできます。",
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
    "topups.subtitle": "USDT 충전 주문을 검색하고 내보낼 수 있습니다.",
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
    "topups.subtitle": "Cari dan ekspor order top-up USDT Anda.",
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
  if (els.legalDialog?.open) renderLegalDialog(els.legalDialog.dataset.doc || "privacy");
  updateSubmitButtonCost();
  updateAdvancedButtonCost();
  if (state.tab === "history" && !historyLoading) loadHistory();
  if (state.tab === "topups") loadTopupRecords();
  if (state.tab === "spending") loadSpendingRecords();
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
  if (state.tab === "topups") loadTopupRecords(1);
  if (state.tab === "spending") loadSpendingRecords(1);
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
  if (tab === "topups") loadTopupRecords();
  if (tab === "spending") loadSpendingRecords();
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
  if (state.tab === "topups") {
    els.heroEyebrow.textContent = t("hero.topups.eyebrow");
    els.heroTitle.textContent = t("copy.topupsTitle");
    els.heroSubtitle.textContent = t("copy.topupsSubtitle");
    els.heroBadge.textContent = t("hero.topups.badge");
    els.heroNotice.textContent = t("copy.topupsNotice");
    return;
  }
  if (state.tab === "spending") {
    els.heroEyebrow.textContent = t("hero.spending.eyebrow");
    els.heroTitle.textContent = t("copy.spendingTitle");
    els.heroSubtitle.textContent = t("copy.spendingSubtitle");
    els.heroBadge.textContent = t("hero.spending.badge");
    els.heroNotice.textContent = t("copy.spendingNotice");
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
    <article class="template-card" data-card-template-id="${escapeHtml(template.id)}">
      <img class="template-cover" src="${escapeHtml(template.coverUrl || "/assets/admin/home/default-hero.jpg")}" alt="${escapeHtml(localizedTemplateTitle(template))}" loading="lazy" />
      ${template.previewUrl ? `<video class="template-hover-video" data-template-preview-src="${escapeHtml(template.previewUrl)}" muted loop playsinline preload="none"></video>` : ""}
      <div class="template-meta">
        <button class="use-template" data-template-id="${escapeHtml(template.id)}" type="button">${escapeHtml(templateGenerateLabel(template.id))}</button>
      </div>
    </article>
  `).join("") : `<div class="job-note">${escapeHtml(t("gallery.noTemplates"))}</div>`;

  els.templateGrid.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => openTemplate(button.dataset.templateId));
  });
  els.templateGrid.querySelectorAll(".template-card").forEach((card) => {
    const video = card.querySelector(".template-hover-video");
    if (!video) return;
    const start = () => {
      if (!video.dataset.templatePreviewSrc) return;
      if (!video.src) video.src = video.dataset.templatePreviewSrc;
      card.classList.add("is-previewing");
      video.play().catch(() => {});
    };
    const stop = () => {
      video.pause();
      video.currentTime = 0;
      card.classList.remove("is-previewing");
    };
    card.addEventListener("mouseenter", start);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("focusin", start);
    card.addEventListener("focusout", stop);
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
            <td data-label="${escapeHtml(t("ledger.payable"))}"><strong>${escapeHtml(order.payableAmountText || order.payableAmount || "")}</strong><small>${escapeHtml(order.network || "")}</small></td>
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
            <td data-label="${escapeHtml(t("ledger.title"))}"><strong>${escapeHtml(entry.title || entry.type || "")}</strong><small>${[entry.provider, entry.resolution, entry.duration ? `${entry.duration}s` : ""].filter(Boolean).join(" / ")}</small></td>
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
  localStorage.removeItem(TOKEN_KEY);
  els.accountDialog?.close();
  setUser(null);
  if (state.tab === "history") renderHistory([]);
  if (state.tab === "topups") renderTopupRecords();
  if (state.tab === "spending") renderSpendingRecords();
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
    if (state.tab === "topups") loadTopupRecords(1);
    if (state.tab === "spending") loadSpendingRecords(1);
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
