"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  chatPersonaContrastAnchors,
  chatLiveIntimateRewriteBeat,
  chatReplyHasBrokenLiveSpeech,
  chatReplyHasLiveDirtyTalk,
  chatReplyHasLiveSpokenTexture,
  chatReplyHasPersonaContrast,
  chatReplyIntimateVocalReactionCount,
  chatReplyLiveIntimateScore,
  chatReplyWithLivePersonaSlip,
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
  const valid = "啊……！哈啊……你、你给我慢点……平时都是我让人守规矩，现在居然要开口求你……唔……哈……别停，就那里……再深一点，操我……操我，灌进来……哈啊……不许笑……嘶……";
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

test("explanatory literary live replies are always rejected", () => {
  const explanatory = "啊……！哈啊……每一寸都被你狠狠地钉入，甚至要把我整个人给顶裂开。别停，再深一点……唔！要的就是这种感觉，哪怕被你弄得几乎说不完整。你想让我彻底变坏吗？那就……把所有的力道都塞进来吧。";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(explanatory, { requireVocal: true, character }), true);
});

test("explaining the role reversal is not accepted as spoken contrast", () => {
  const explanation = "啊……！ 哈啊…别、别停… 唔……我居然被你弄成这样。 明明是我在管教你，现在却被你完全掌控了。 嘶……再深一点，全部灌进来。 嗯……快点，把那股热度全给我顶到底！";
  assert.equal(chatReplyHasPersonaContrast(explanation, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(explanation, { requireVocal: true, character }), true);
});

test("discarding rules or face is not a concrete reversal", () => {
  const discard = "啊……！ 哈啊……你要把整根都… 唔，全都给我灌进来。 别管我刚才说的规矩了，就这么… 狠狠地、一直顶到最深处。 嘶……快点。";
  assert.equal(chatReplyHasPersonaContrast(discard, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(discard, { requireVocal: true, character }), true);
});

test("a concrete spoken reversal can omit the 明明-now formula", () => {
  const spoken = "啊……！哈啊……慢点……我居然会求你……唔……听我的，别停……操我，再深一点……嘶……灌进来……";
  assert.equal(chatReplyHasPersonaContrast(spoken, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(spoken, { requireVocal: true, character }), false);
});

test("rewrite beats come from the character's habitual control", () => {
  assert.equal(chatLiveIntimateRewriteBeat(character, 1), "我平时只让人听我的…唔…现在居然要开口求你…");
  assert.equal(chatLiveIntimateRewriteBeat(character, 2), "我居然会求你…这不像我…");
  assert.match(chatLiveIntimateRewriteBeat(character, 3), /我求你了/);
});

test("weak live drafts are repaired with a concrete persona slip", () => {
  const draft = "啊……！哈……你要把整根都…唔，全都给我灌进来。别管我刚才说的规矩了，就这么……狠狠地、一直顶到底。嘶……快点，再深一点。";
  const repaired = chatReplyWithLivePersonaSlip(draft, character, 1);
  assert.match(repaired, /我平时只让人听我的/);
  assert.match(repaired, /求你/);
  assert.doesNotMatch(repaired, /别管/);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});
