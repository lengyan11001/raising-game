"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const platformConfig = fs.readFileSync(path.join(root, "platform.config.js"), "utf8");
const createSource = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const platformUiSource = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const platformMainSource = fs.readFileSync(path.join(root, "platform.main.js"), "utf8");
const workflowReactSource = fs.readFileSync(path.join(root, "platform.workflow-react.js"), "utf8");
const siteImageNodeSource = fs.readFileSync(path.join(root, "workflow-react", "src", "components", "canvas", "siteNodes", "SiteImageGenerationNode.js"), "utf8");

function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  if (source.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    if (source[index] === "(") parenDepth += 1;
    else if (source[index] === ")" && --parenDepth === 0) {
      bodyStart = source.indexOf("{", index);
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `missing body for ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function imageRequestRuntime() {
  const names = [
    "firstPresent",
    "plainObject",
    "boolFromRequest",
    "requestParamsFromBody",
    "normalizeVideoRatio",
    "normalizeSeedream5Resolution",
    "normalizeSeedream5ImageRatio",
    "seedream5ImageSize",
    "normalizeWan27ImageRatio",
    "normalizeWan27ImageResolution",
    "wan27ImageSize",
    "wan27ImageRequestOptions",
    "exposedWan27ImageParams",
    "wan27ImageParamsForRecord",
  ];
  return new Function(
    "WAN27_IMAGE_PRO_MODEL",
    [
      ...names.map((name) => extractFunction(serverSource, name)),
      "return { wan27ImageRequestOptions, exposedWan27ImageParams, wan27ImageParamsForRecord, seedream5ImageSize };",
    ].join("\n"),
  )("wan2.7-image");
}

function zImageSubmissionRuntime(capturedBodies = []) {
  const source = [
    extractFunction(serverSource, "submitWan27ImageModify"),
    extractFunction(serverSource, "submitWan27ImageTextGenerate"),
    "return { submitWan27ImageModify, submitWan27ImageTextGenerate };",
  ].join("\n");
  return new Function(
    "WAN27_IMAGE_PRO_MODEL",
    "arrayFromBody",
    "plainObject",
    "firstPresent",
    "boolFromRequest",
    "normalizeWan27ImageResolution",
    "wan27ImageSize",
    "currentAuthContext",
    "readDb",
    "mulerouterAliyun",
    "aliyunDashscopeRequest",
    "resolveWan27ImageResult",
    "normalizeWan27ImageTask",
    source,
  )(
    "wan2.7-image",
    (value) => Array.isArray(value) ? value : value ? [value] : [],
    (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
    (...values) => values.find((value) => value !== undefined && value !== null && value !== ""),
    (value, fallback = false) => value === undefined || value === null || value === ""
      ? fallback
      : typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase()),
    (value) => String(value || "").trim().toUpperCase() === "1K" ? "1K" : String(value || "").trim().toUpperCase() === "4K" ? "4K" : "2K",
    (resolution, ratio) => ({
      "1K": { "1:1": "1024*1024", "3:4": "768*1024", "4:3": "1024*768", "9:16": "720*1280", "16:9": "1280*720" },
      "2K": { "1:1": "2048*2048", "3:4": "1536*2048", "4:3": "2048*1536", "9:16": "1440*2560", "16:9": "2560*1440" },
    })[resolution]?.[ratio],
    () => ({ user: { id: "user-1" } }),
    async () => ({ users: [] }),
    {
      decideImageEdit: async () => ({ use: false }),
      decideTextToImage: async () => ({ use: false }),
    },
    async (_path, options) => {
      capturedBodies.push(options.body);
      return { output: { task_id: "direct-task", task_status: "SUCCEEDED", url: "https://example.com/out.png" } };
    },
    async () => ({ taskId: "direct-task", status: "succeeded", imageUrls: ["https://example.com/out.png"] }),
    (raw = {}) => ({
      taskId: raw.output?.task_id || raw.task_id || "",
      status: raw.output?.task_status || raw.task_status || (raw.output?.url ? "completed" : "pending"),
      imageUrls: raw.output?.url ? [raw.output.url] : [],
      error: raw.output?.message || raw.message || "",
    }),
  );
}

function workflowImageBodyRuntime() {
  return new Function(
    "workflowImageModelById",
    "workflowNodeImageInputs",
    "workflowEffectivePrompt",
    "workflowReferencePayload",
    "workflowMediaBodyValue",
    [
      extractFunction(platformUiSource, "workflowImageGenerationBody"),
      "return workflowImageGenerationBody;",
    ].join("\n"),
  )(
    (modelId) => workflowImageBodyRuntime.models[modelId],
    () => [],
    (node) => String(node.data?.prompt || ""),
    () => [],
    () => ({ dataUrl: "", url: "" }),
  );
}
workflowImageBodyRuntime.models = {
  "qwen-image3": { id: "qwen-image3", ratio: "1:1", resolution: "2K", ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"], resolutions: ["1K", "2K"], defaultTier: "pro" },
  "seedream5-image": { id: "seedream5-image", ratio: "1:1", resolution: "2K", ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"], resolutions: ["1K", "2K"], defaultTier: "pro" },
  "z-image-spicy-pro": { id: "z-image-spicy-pro", ratio: "1:1", resolution: "2K", ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"], resolutions: ["1K", "2K"] },
  "qwen-image-edit-spicy": { id: "qwen-image-edit-spicy", ratio: "", resolution: "", ratios: [], resolutions: [], supportsSizeSelection: false },
};

function mulerouterTextToImageRuntime() {
  return new Function(
    "routeActive",
    "cannot",
    "textOrEmpty",
    "seedOrFallback",
    "specified",
    [
      extractFunction(fs.readFileSync(path.join(root, "mulerouter-aliyun.js"), "utf8"), "decideTextToImage"),
      "return decideTextToImage;",
    ].join("\n"),
  )(
    async () => true,
    (reason) => ({ use: false, reason }),
    (value) => String(value || "").trim(),
    () => ({ ok: true, value: null }),
    (value) => value !== undefined,
  );
}

test("all image models expose the correct size capability", () => {
  assert.match(platformConfig, /id: "qwen-image3"[^\n]*resolutions: \["1K", "2K"\][^\n]*ratios: \["1:1", "3:4", "4:3", "9:16", "16:9"\]/);
  assert.match(platformConfig, /id: "seedream5-image"[^\n]*resolutions: \["1K", "2K"\][^\n]*ratios: \["1:1", "3:4", "4:3", "9:16", "16:9"\]/);
  assert.match(platformConfig, /id: "z-image-spicy-pro"[^\n]*resolutions: \["1K", "2K"\][^\n]*ratios: \["1:1", "3:4", "4:3", "9:16", "16:9"\]/);
  assert.match(platformConfig, /id: "qwen-image-edit-spicy"[^\n]*resolution: ""[^\n]*ratio: ""[^\n]*resolutions: \[\][^\n]*ratios: \[\][^\n]*supportsSizeSelection: false/);
});


test("Qwen handler lets an explicit ratio override conflicting custom size input", () => {
  assert.match(serverSource, /const requestedRatio = firstPresent\(body\.ratio, body\.aspect_ratio, bodyParams\.ratio/);
  assert.match(serverSource, /qwenImage3SizeForSelection\(\{[\s\S]*?ratioSpecified: String\(requestedRatio \|\| ""\)\.trim\(\) !== ""/);
});

test("Qwen Image Edit omits size from upstream options and generation records", () => {
  const { wan27ImageRequestOptions, wan27ImageParamsForRecord } = imageRequestRuntime();
  const body = {
    ratio: "3:4",
    resolution: "2K",
    size: "1536*2048",
    parameters: { size: "1536*2048", seed: 17, watermark: false },
    params: { ratio: "3:4", resolution: "2K", size: "1536*2048" },
  };
  const options = wan27ImageRequestOptions(body, { includeSizeSelection: false });
  assert.equal(options.ratio, "");
  assert.equal(options.resolution, "");
  assert.equal(options.includeSizeSelection, false);
  assert.equal(Object.hasOwn(options.parameters, "size"), false);
  assert.equal(options.parameters.seed, 17);

  const recordParams = wan27ImageParamsForRecord(body, options, { provider: "wan27-image", action: "image_edit" });
  assert.equal(Object.hasOwn(recordParams, "ratio"), false);
  assert.equal(Object.hasOwn(recordParams, "resolution"), false);
  assert.equal(Object.hasOwn(recordParams, "size"), false);
  assert.equal(Object.hasOwn(recordParams.parameters || {}, "size"), false);
  assert.equal(recordParams.parameters.seed, 17);
  assert.equal(recordParams.provider, "wan27-image");
});

test("size-capable image models still calculate and send the selected size", () => {
  const { wan27ImageRequestOptions, wan27ImageParamsForRecord } = imageRequestRuntime();
  const options = wan27ImageRequestOptions({ ratio: "3:4", resolution: "2K" }, { includeSizeSelection: true });
  assert.equal(options.ratio, "3:4");
  assert.equal(options.resolution, "2K");
  assert.equal(options.parameters.size, "1536*2048");

  const recordParams = wan27ImageParamsForRecord({ ratio: "3:4", resolution: "2K" }, options);
  assert.equal(recordParams.ratio, "3:4");
  assert.equal(recordParams.resolution, "2K");
  assert.equal(recordParams.size, "1536*2048");
});

test("Wan2.7 image size mapping covers every exposed ratio and resolution", () => {
  const { wan27ImageRequestOptions, wan27ImageParamsForRecord } = imageRequestRuntime();
  const expected = {
    "1K": {
      "1:1": "1024*1024",
      "3:4": "768*1024",
      "4:3": "1024*768",
      "9:16": "720*1280",
      "16:9": "1280*720",
    },
    "2K": {
      "1:1": "2048*2048",
      "3:4": "1536*2048",
      "4:3": "2048*1536",
      "9:16": "1440*2560",
      "16:9": "2560*1440",
    },
  };
  for (const [resolution, ratios] of Object.entries(expected)) {
    for (const [ratio, size] of Object.entries(ratios)) {
      const options = wan27ImageRequestOptions({ ratio, resolution }, { includeSizeSelection: true });
      const record = wan27ImageParamsForRecord({ ratio, resolution }, options);
      assert.equal(options.parameters.size, size, `${resolution} ${ratio}`);
      assert.equal(record.ratio, ratio);
      assert.equal(record.resolution, resolution);
      assert.equal(record.size, size);
    }
  }
});

test("Z-Image main page and workflow paths both preserve every selected size", async () => {
  const capturedBodies = [];
  const runtime = zImageSubmissionRuntime(capturedBodies);
  const expected = {
    "1K": {
      "1:1": "1024*1024",
      "3:4": "768*1024",
      "4:3": "1024*768",
      "9:16": "720*1280",
      "16:9": "1280*720",
    },
    "2K": {
      "1:1": "2048*2048",
      "3:4": "1536*2048",
      "4:3": "2048*1536",
      "9:16": "1440*2560",
      "16:9": "2560*1440",
    },
  };
  for (const [resolution, ratios] of Object.entries(expected)) {
    for (const [ratio, size] of Object.entries(ratios)) {
      const mainPage = await runtime.submitWan27ImageModify({
        prompt: "z-image main page",
        ratio,
        resolution,
        parameters: { size },
        waitForResult: false,
      });
      assert.equal(mainPage.payload.parameters.size, size, `main ${resolution} ${ratio}`);

      await runtime.submitWan27ImageTextGenerate({
        prompt: "z-image workflow",
        ratio,
        resolution,
        parameters: { size },
      });
      assert.equal(capturedBodies.at(-1).parameters.size, size, `workflow ${resolution} ${ratio}`);
    }
  }
});

test("MuleRouter Z-Image text-to-image receives exact width and height for every exposed size", async () => {
  const decideTextToImage = mulerouterTextToImageRuntime();
  const expected = {
    "1K": {
      "1:1": [1024, 1024],
      "3:4": [768, 1024],
      "4:3": [1024, 768],
      "9:16": [720, 1280],
      "16:9": [1280, 720],
    },
    "2K": {
      "1:1": [2048, 2048],
      "3:4": [1536, 2048],
      "4:3": [2048, 1536],
      "9:16": [1440, 2560],
      "16:9": [2560, 1440],
    },
  };
  for (const [resolution, ratios] of Object.entries(expected)) {
    for (const [ratio, [width, height]] of Object.entries(ratios)) {
      const decision = await decideTextToImage({ prompt: "z-image", parameters: { size: `${width}*${height}` } });
      assert.equal(decision.use, true);
      assert.equal(decision.body.width, width, `${resolution} ${ratio} width`);
      assert.equal(decision.body.height, height, `${resolution} ${ratio} height`);
    }
  }
});

test("workflow image nodes send the selected ratio and resolution for every size-capable model", () => {
  const workflowImageGenerationBody = workflowImageBodyRuntime();
  for (const modelId of ["qwen-image3", "seedream5-image", "z-image-spicy-pro"]) {
    for (const resolution of ["1K", "2K"]) {
      for (const ratio of ["1:1", "3:4", "4:3", "9:16", "16:9"]) {
        const body = workflowImageGenerationBody({
          id: "image-node",
          data: { modelId, prompt: "workflow size test", resolution, ratio },
        });
        assert.equal(body.provider, modelId);
        assert.equal(body.resolution, resolution, `${modelId} ${resolution} ${ratio}`);
        assert.equal(body.ratio, ratio, `${modelId} ${resolution} ${ratio}`);
      }
    }
  }
  const editBody = workflowImageGenerationBody({
    id: "edit-node",
    data: { modelId: "qwen-image-edit-spicy", prompt: "follow source" },
  });
  assert.equal(Object.hasOwn(editBody, "ratio"), false);
  assert.equal(Object.hasOwn(editBody, "resolution"), false);
});

test("gateway Qwen Image Edit payload never includes invalid size fields", async () => {
  let captured = null;
  const gatewaySubmitWan27ImageEditTask = new Function(
    "WAN27_IMAGE_PRO_MODEL",
    "arrayFromBody",
    "plainObject",
    "gatewayRequest",
    "gatewayImageTaskFromPayload",
    [
      extractFunction(serverSource, "gatewaySubmitWan27ImageEditTask"),
      "return gatewaySubmitWan27ImageEditTask;",
    ].join("\n"),
  )(
    "wan2.7-image",
    (value) => Array.isArray(value) ? value : value ? [value] : [],
    (value) => value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {},
    async (_method, _path, body) => {
      captured = body;
      return { taskId: "task-1", status: "succeeded", imageUrls: ["https://example.com/out.png"] };
    },
    (payload) => ({ taskId: payload.taskId, status: payload.status, imageUrls: payload.imageUrls }),
  );
  await gatewaySubmitWan27ImageEditTask({
    imageUrls: ["https://example.com/source.png"],
    prompt: "edit",
    ratio: "3:4",
    resolution: "2K",
    parameters: { size: "1536*2048", seed: 9 },
    includeSizeSelection: false,
  });
  assert.equal(Object.hasOwn(captured, "ratio"), false);
  assert.equal(Object.hasOwn(captured, "resolution"), false);
  assert.equal(Object.hasOwn(captured.parameters, "size"), false);
  assert.equal(captured.parameters.seed, 9);
});

test("advanced UI hides size selection only for Qwen Image Edit and shows a clear follow-source note", () => {
  assert.match(createSource, /const isQwenEditImage = provider === "qwen-image-edit-spicy"/);
  assert.match(createSource, /els\.advancedResolution\.closest\("\.field"\)\?\.toggleAttribute\("hidden", animateCapability \|\| isQwenText \|\| isQwenEditImage\)/);
  assert.match(createSource, /els\.advancedSizeFollowNote\.hidden = !isQwenEditImage \|\| simpleAction/);
  assert.match(createSource, /provider === "qwen-image-edit-spicy" \? \{\} : \{\s*ratio: currentAdvancedRatio\(\),\s*resolution: currentAdvancedResolution\(\),/);
  assert.match(workflowReactSource, /var supportsSizeSelection = model\.supportsSizeSelection !== false && ratios\.length > 0 && resolutions\.length > 0/);
  assert.match(siteImageNodeSource, /const supportsSizeSelection = model\.supportsSizeSelection !== false/);
  assert.match(siteImageNodeSource, /尺寸<\/span><strong>跟随原图<\/strong>/);
});

test("server enforces Z-Image text-only and Qwen Image Edit reference-image requirements", () => {
  assert.match(serverSource, /pricingProvider === "z-image-spicy-pro" && hasReferenceImages/);
  assert.match(serverSource, /Z_IMAGE_REFERENCE_UNSUPPORTED/);
  assert.match(serverSource, /pricingProvider === "qwen-image-edit-spicy" && !hasReferenceImages/);
  assert.match(serverSource, /QWEN_IMAGE_EDIT_REFERENCE_REQUIRED/);
  assert.match(serverSource, /includeSizeSelection: pricingProvider !== "qwen-image-edit-spicy"/);
});

test("Seedream 5 is image generation, never an image-edit mode", () => {
  assert.match(createSource, /const ADVANCED_IMAGE_PROVIDERS = \["z-image-spicy-pro", "qwen-image-edit-spicy"\];/);
  assert.doesNotMatch(createSource, /ADVANCED_IMAGE_PROVIDERS = \[[^\]]*seedream5-image/);
  assert.match(createSource, /if \(\["seedream5-image", "qwen-image3"\]\.includes\(provider\)\)[\s\S]*?requestJson\("\/api\/advanced\/generate"/);
  assert.match(serverSource, /action: referenceInputs\.length \? "image_reference" : "text_to_image"/);

  const modeForProvider = new Function(
    "state",
    "normalizeAdvancedProvider",
    [
      extractFunction(platformUiSource, "advancedImageModeForProvider"),
      "return advancedImageModeForProvider;",
    ].join("\n"),
  )({ advancedCreateKind: "image" }, (value) => String(value || "").trim().toLowerCase());
  assert.equal(modeForProvider("seedream5-image"), "image-create");
  assert.equal(modeForProvider("qwen-image3"), "image-create");
  assert.equal(modeForProvider("z-image-spicy-pro"), "image-create");
  assert.equal(modeForProvider("qwen-image-edit-spicy"), "image-edit");
  assert.match(platformMainSource, /const nextImageMode = advancedImageModeForProvider\(provider\);\n  if \(nextImageMode && state\.advancedCreateMode !== nextImageMode\) \{\n    state\.advancedCreateMode = nextImageMode;\n    syncAdvancedCreateModeTabState\(\);/);
});

test("Seedream 5 exposes both aspect ratio and resolution controls", () => {
  assert.match(createSource, /const imageRatios = \["1:1", "3:4", "4:3", "9:16", "16:9"\]/);
  assert.match(createSource, /const options = isImageEdit \|\| isSeedreamImage \|\| isQwenImage \? imageRatios : videoRatios/);
  const ratioVisibility = createSource.match(/els\.advancedRatio\.closest\("\.field"\)\?\.toggleAttribute\("hidden", ([^;]+)\)/);
  assert.ok(ratioVisibility, "expected Seedream ratio visibility rule");
  assert.doesNotMatch(ratioVisibility[1], /isSeedreamImage/);
});

test("Seedream 5 sends the selected ratio as an exact upstream pixel size", () => {
  const { seedream5ImageSize } = imageRequestRuntime();
  const expected = {
    "1K": {
      "1:1": "1024x1024",
      "3:4": "864x1152",
      "4:3": "1152x864",
      "9:16": "800x1424",
      "16:9": "1424x800",
    },
    "2K": {
      "1:1": "2048x2048",
      "3:4": "1776x2368",
      "4:3": "2368x1776",
      "9:16": "1584x2816",
      "16:9": "2816x1584",
    },
  };
  for (const [resolution, ratios] of Object.entries(expected)) {
    for (const [ratio, size] of Object.entries(ratios)) {
      assert.equal(seedream5ImageSize(resolution, ratio), size, `${resolution} ${ratio}`);
    }
  }

  assert.match(serverSource, /const ratio = normalizeSeedream5ImageRatio\(firstPresent\([\s\S]*?body\.ratio,[\s\S]*?mergedProviderParameters\.ratio,[\s\S]*?caseParams\.ratio,/);
  assert.match(serverSource, /const size = seedream5ImageSize\(resolution, ratio\);/);
  assert.match(serverSource, /ratio,\n\s+resolution,\n\s+size,/);
  assert.match(serverSource, /size: seedream5ImageSize\(resolution, ratio\)/);
  assert.match(serverSource, /seedream5ImageRequestFingerprint\(\{[\s\S]*?ratio: String\(ratio \|\| ""\),[\s\S]*?size: String\(size \|\| ""\),/);
});
