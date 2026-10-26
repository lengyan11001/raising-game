"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  chatPersonaContrastAnchors,
  chatReplyHasBrokenLiveSpeech,
  chatReplyHasLiveDirtyTalk,
  chatReplyHasLiveSpokenTexture,
  chatReplyHasPersonaContrast,
  chatReplyIntimateVocalReactionCount,
  chatReplyLiveIntimateScore,
  chatReplyNeedsLiveIntimateRewrite,
} = require("../server.js");

const character = {
  name: "顾静涵",
  personaMd: "顾静涵，38岁，同学的妈妈，也是幸福街道公认的高贵冷艳的社区主任，更是一位气场强大、高高在上且冷酷严厉的长辈。你习惯了俯视他人，骨子里有着强烈的掌控欲与傲慢，极重面子和规矩。",
  replyStyle: "高贵、冷艳、强势、挑剔，习惯俯视别人。亲密时会乱，但乱里还有命令、克制和羞耻。",
};

test("live intimate validation rejects polished dialogue without spoken texture", () => {
  const polished = "啊……！这一下顶进来，简直要把我整个人撞开。虽然我想维持仪态，可现在也只能承受你带来的压迫感。";
  assert.equal(chatReplyHasLiveSpokenTexture(polished), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(polished, { requireVocal: true, character }), true);
});

test("generic moans and a shallow contrast phrase are not enough", () => {
  const generic = "明明……再深一点……唔……继续。别管我的仪态了，我真的受不了。";
  assert.equal(chatReplyHasBrokenLiveSpeech(generic), true);
  assert.equal(chatReplyHasPersonaContrast(generic, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(generic, { requireVocal: true, character }), true);
});

test("a concrete character reversal with live dirty talk passes", () => {
  const valid = "啊……！你、你给我慢点……平时都是我让人守规矩，现在居然要开口求你……哈啊……别停，就那里……再深一点，操我……唔……操我，灌进来……不许笑。";
  assert.ok(chatPersonaContrastAnchors(character).includes("社区主任"));
  assert.equal(chatReplyIntimateVocalReactionCount(valid) >= 2, true);
  assert.equal(chatReplyHasBrokenLiveSpeech(valid), true);
  assert.equal(chatReplyHasLiveDirtyTalk(valid), true);
  assert.equal(chatReplyHasPersonaContrast(valid, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(valid, { requireVocal: true, character }), false);
  assert.ok(chatReplyLiveIntimateScore(valid, character) >= 24);
});

test("the previous production reply is rejected as insufficiently present", () => {
  const previous = "啊……！哈，你这频率快得让人有点跟不上。虽然我明明在心里一直要求你要稳重一点，可你的每一次贯穿都…别只顾着出力了，看着我……唔……快点把你的力道全部灌进来。";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(previous, { requireVocal: true, character }), true);
});
