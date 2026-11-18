const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { publicGenerationErrorMessage } = require("../lib-providers");

test("provider failures are translated into actionable Chinese messages", () => {
  assert.equal(
    publicGenerationErrorMessage("UPSTREAM_GENERATION_FAILED: We couldn't create your video. Your tokens have been credited back to your account."),
    "生成失败，本次如已扣积分会自动退回。请调整提示词或参考素材后重试，仍有问题请联系客服。",
  );
  assert.equal(
    publicGenerationErrorMessage("ContentViolated: audit block prompt"),
    "内容审核未通过，请调整提示词或参考素材后重试。",
  );
  assert.equal(
    publicGenerationErrorMessage("Request timed out after 30000ms"),
    "生成服务暂时连接失败，本次如已扣积分会自动退回，请稍后重试。",
  );
  assert.equal(
    publicGenerationErrorMessage("insufficient balance"),
    "生成额度不足，请充值或稍后再试。",
  );
  assert.equal(
    publicGenerationErrorMessage("not enough tokens for this request"),
    "生成失败，本次如已扣积分会自动退回。请调整提示词或参考素材后重试，仍有问题请联系客服。",
  );
  assert.equal(
    publicGenerationErrorMessage("The request failed because the output audio may be related to copyright restrictions."),
    "生成结果中的音频触发版权限制，通常是自动生成的背景音乐（BGM）导致。平台已加入禁止生成 BGM 的约束，请重新生成；如仍失败，请关闭“生成音频”后再试。",
  );
});

test("friendly Chinese errors remain readable and URLs are stripped", () => {
  assert.equal(publicGenerationErrorMessage("请上传参考图片后重试"), "请上传参考图片后重试");
  assert.equal(publicGenerationErrorMessage("请求失败 https://provider.example/error"), "请求失败");
  assert.equal(publicGenerationErrorMessage(""), "");
});

test("the workflow canvas translates legacy raw errors again on the client", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "platform.workflow-react.js"), "utf8");
  assert.match(source, /function userFacingGenerationError\(value\)/);
  assert.match(source, /function userFacingStatus\(value\)/);
  assert.match(source, /return userFacingGenerationError\(node\.data\.error\)/);
});
