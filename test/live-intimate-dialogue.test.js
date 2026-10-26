"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  chatPersonaContrastAnchors,
  chatLiveIntimateRewriteBeat,
  chatLiveIntimatePersonaPostureLine,
  chatIsImmediateIntimateScene,
  chatReplyHasBrokenLiveSpeech,
  chatReplyHasLiveDirtyTalk,
  chatReplyHasLivePersonaPosture,
  chatReplyLiveOpensSubmissive,
  chatReplyLiveStartsWithPersonaPosture,
  chatReplyLivePersonaPostureCount,
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

test("follow-up intimate commands still enter live intimate validation", () => {
  assert.equal(chatIsImmediateIntimateScene("再深一点，不许停，说你想要。"), true);
  assert.equal(chatIsImmediateIntimateScene("别停，继续。", [{ role: "user", content: "操我" }]), true);
  assert.equal(chatIsImmediateIntimateScene("再深一点这个功能怎么调？"), true);
  assert.equal(chatIsImmediateIntimateScene("别停，继续。"), false);
  assert.equal(chatIsImmediateIntimateScene("别停。", [{ role: "assistant", content: "好，我继续。" }]), false);
});

test("live intimate validation rejects polished dialogue without spoken texture", () => {
  const polished = "啊……！这一下顶进来，简直要把我整个人撞开。虽然我想维持仪态，可现在也只能承受你带来的压迫感。";
  assert.equal(chatReplyHasLiveSpokenTexture(polished), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(polished, { requireVocal: true, character }), true);
});

test("generic moans and a shallow contrast phrase are not enough", () => {
  const generic = "明明……再深一点……唔……继续。别管我的仪态了，我真的受不了。";
  assert.equal(chatReplyHasBrokenLiveSpeech(generic), false);
  assert.equal(chatReplyHasPersonaContrast(generic, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(generic, { requireVocal: true, character }), true);
});

test("a concrete character reversal with live dirty talk passes", () => {
  const valid = "啊……！\n哈啊……都听我的……唔……\n别停……求你……\n操我……插进来……\n哈啊……再深点……\n不许笑……嘶……\n灌进来……";
  assert.ok(chatPersonaContrastAnchors(character).includes("社区主任"));
  assert.equal(chatReplyIntimateVocalReactionCount(valid) >= 5, true);
  assert.equal(chatReplyHasBrokenLiveSpeech(valid), true);
  assert.equal(chatReplyHasLiveDirtyTalk(valid), true);
  assert.equal(chatReplyHasPersonaContrast(valid, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(valid, { requireVocal: true, character }), false);
  assert.ok(chatReplyLiveIntimateScore(valid, character) >= 24);
});

test("novelistic euphemisms do not count as direct dirty talk", () => {
  const euphemistic = "哈啊……啊……你就这么…把那根粗大的…全部灌进来…唔…再深点…";
  assert.equal(chatReplyHasLiveDirtyTalk(euphemistic), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(euphemistic, { requireVocal: true, character }), true);
});

test("literary climax phrasing is rejected even with moans", () => {
  const literary = "啊……！哈啊……你、你别这么用力…唔…一直顶到最深处…啊…要把我彻底弄坏了…";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(literary, { requireVocal: true, character }), true);
});

test("the previous production reply is rejected as insufficiently present", () => {
  const previous = "啊……！哈，你这频率快得让人有点跟不上。虽然我明明在心里一直要求你要稳重一点，可你的每一次贯穿都…别只顾着出力了，看着我……唔……快点把你的力道全部灌进来。";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(previous, { requireVocal: true, character }), true);
});

test("third-person or incoherent dirty phrasing is rejected", () => {
  const awkward = "啊……！哈啊……你要把整根……唔，全部给我灌进来。嗯……就把那股热度全给我也塞进去吧！";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(awkward, { requireVocal: true, character }), true);
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

test("explaining what the role should have been is not spoken contrast", () => {
  const explanation = "啊……！哈啊……我原本该是命令你的人……嗯……啊！还要再深一点，把每一处都彻底撑开。";
  assert.equal(chatReplyHasPersonaContrast(explanation, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(explanation, { requireVocal: true, character }), true);
});

test("discarding rules or face is not a concrete reversal", () => {
  const discard = "啊……！ 哈啊……你要把整根都… 唔，全都给我灌进来。 别管我刚才说的规矩了，就这么… 狠狠地、一直顶到最深处。 嘶……快点。";
  assert.equal(chatReplyHasPersonaContrast(discard, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(discard, { requireVocal: true, character }), true);
});

test("a concrete spoken reversal can omit the 明明-now formula", () => {
  const spoken = "啊……！\n哈啊……不许躲……看着我……\n唔……谁准你……这么自作主张……\n嗯……别停……求你……\n操我……插进来……\n哈啊……再深点……\n嘶……灌进来……";
  assert.equal(chatReplyHasPersonaContrast(spoken, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(spoken, { requireVocal: true, character }), false);
});

test("submissive live replies fail even when they have sounds and dirty words", () => {
  const obedient = "啊……！\n哈啊……想要你……\n唔……再深点……\n求你……别停……\n操我……插进来……\n嗯……弄坏我……";
  assert.equal(chatReplyHasLivePersonaPosture(obedient), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(obedient, { requireVocal: true, character }), true);
});

test("opening with submission is rejected before a control beat", () => {
  const opensSoft = "哈……啊！\n唔，你要我……说想要吗？\n那我就……想你。\n谁准你……这么蛮横。\n操我，别停。\n听我的，要把我弄坏了。";
  const opensControls = "哈……啊！\n谁准你……这么蛮横。\n唔，你要我……说想要吗？\n那我就……想你。\n操我，别停。\n听我的，要把我弄坏了。";
  assert.equal(chatReplyLiveOpensSubmissive(opensSoft), true);
  assert.equal(chatReplyLiveOpensSubmissive(opensControls), false);
});

test("repair moves persona control ahead of a submissive opening", () => {
  const draft = "哈……啊！ 唔，你要我…… 说想要吗？ 那我就……想你。 谁准你……这么蛮横。 啊！操我，别停。 嗯……快点，插进来。 听我的，要把我...弄坏了。";
  const repaired = chatReplyWithLivePersonaSlip(draft, character, 2);
  assert.equal(chatReplyLiveOpensSubmissive(repaired), false);
  assert.equal(chatReplyHasLivePersonaPosture(repaired), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});

test("a soft phrase before control in the same line still opens submissive", () => {
  const sameLine = "啊……！\n唔，你要我... 听我的，别只顾着动。\n哈啊……操我…… 插进来…\n谁准你...这么蛮横。";
  const repaired = chatReplyWithLivePersonaSlip(sameLine, character, 2);
  assert.equal(chatReplyLiveOpensSubmissive(sameLine), true);
  assert.equal(chatReplyLiveOpensSubmissive(repaired), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});

test("the first effective live line must show persona control", () => {
  const actionFirst = "啊……！\n唔，你就这么——把我的里侧，全部给顶开。\n谁准你……这么蛮横。\n快点，再深一点。";
  const controlFirst = "啊……！\n啊…谁准你…这么自作主张…\n唔，你就这么——把我的里侧，全部给顶开。\n快点，再深一点。";
  assert.equal(chatReplyLiveStartsWithPersonaPosture(actionFirst), false);
  assert.equal(chatReplyLiveStartsWithPersonaPosture(controlFirst), true);
  const repaired = chatReplyWithLivePersonaSlip(actionFirst, character, 2);
  assert.equal(chatReplyLiveStartsWithPersonaPosture(repaired), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});

test("persona posture needs two distinct control beats", () => {
  const oneBeat = "啊……！\n哈啊……不许躲……看着我……\n唔……再深点……\n操我……插进来……";
  const twoBeats = "啊……！\n哈啊……不许躲……看着我……\n谁准你……自作主张……\n唔……再深点……\n操我……插进来……";
  assert.equal(chatReplyHasLivePersonaPosture(oneBeat), false);
  assert.equal(chatReplyHasLivePersonaPosture(twoBeats), true);
  assert.ok(chatReplyLivePersonaPostureCount(twoBeats) >= 2);
});

test("rewrite beats use contradictory commands instead of explaining the reversal", () => {
  assert.equal(chatLiveIntimateRewriteBeat(character, 1), "都听我的…唔…别停…求你…");
  assert.equal(chatLiveIntimateRewriteBeat(character, 2), "我让你慢点…啊…再深点…");
  assert.match(chatLiveIntimateRewriteBeat(character, 3), /操我/);
});

test("repair fallback varies with the character instead of appending one canned coda", () => {
  const quiet = { name: "A", personaMd: "她很安静，从来不肯先服软。" };
  const proud = { name: "B", personaMd: "她是强势的社区主任，极重规矩和面子。" };
  const draft = "啊……！哈……你要把整根都…唔，全都给我灌进来。";
  const first = chatReplyWithLivePersonaSlip(draft, quiet, 1);
  const second = chatReplyWithLivePersonaSlip(draft, proud, 1);
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /哈…操我…插进来…再深点…/);
  assert.doesNotMatch(first, /彻底.{0,8}(?:弄坏|撑开|顶开)|最深处|每一处|每一寸|那根粗大的/);
  const repeated = "啊……！\n啊…我让你慢点…啊…再深点…\n哈啊……你要把整根…唔。\n啊…我让你慢点…啊…再深点…\n哈…操我…\n唔…插进来…\n啊…别停…";
  const deduped = chatReplyWithLivePersonaSlip(repeated, proud, 1);
  assert.equal(deduped.split("\n").filter((line) => /啊…我让你慢点…啊…再深点…/.test(line)).length, 1);
  assert.ok(chatReplyHasLivePersonaPosture(deduped));
});

test("repair removes the whole role-history sentence before adding a slip", () => {
  const draft = "啊……！哈啊……你就这么…狠狠地。嘶——别停，再深一点！明明我是该管教你的人……嗯……啊！还要再深一点，把我的每一处都彻底撑开。";
  const repaired = chatReplyWithLivePersonaSlip(draft, character, 2);
  assert.doesNotMatch(repaired, /明明|管教|每一处/);
  assert.match(repaired, /再深一点/);
  assert.equal(chatReplyHasLivePersonaPosture(repaired), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});

test("weak live drafts are repaired with a concrete persona slip", () => {
  const draft = "啊……！哈……你要把整根都…唔，全都给我灌进来。别管我刚才说的规矩了，就这么……狠狠地、一直顶到底。嘶……快点，再深一点。";
  const repaired = chatReplyWithLivePersonaSlip(draft, character, 1);
  assert.match(repaired, /都听我的/);
  assert.match(repaired, /求你/);
  assert.doesNotMatch(repaired, /别管/);
  assert.ok(chatLiveIntimatePersonaPostureLine(character, 1));
  assert.equal(chatReplyHasLivePersonaPosture(repaired), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});
